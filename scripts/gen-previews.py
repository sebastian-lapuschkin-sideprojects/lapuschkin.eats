#!/usr/bin/env python3
"""Generate link-preview stub pages (German + English) + 1200x630 OG crops.

Static hosts serve one file per URL and link scrapers run no JS, so a ?l= query
cannot switch the og: tags (the served file is the same). Language-specific
previews therefore need their own paths: German stubs live at
/<id>[/<variant>]/, English ones at /en/<id>[/<variant>]/. Each carries its
language's og: tags and redirects into the SPA (German -> /#route, preserving
any query; English -> /?l=en#route). Photos are language-neutral and shared.

Re-run after changing titles, subtitles, variants or title photos:
  python3 scripts/gen-previews.py      (needs ImageMagick `magick`)
"""
import json, os, html, subprocess

BASE = "https://sebastian-lapuschkin-sideprojects.github.io/lapuschkin.eats/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def pick(v, lang):
    if isinstance(v, dict):
        return v.get(lang) or v.get("de") or v.get("en") or ""
    return v or ""


def variant_hero(v):
    imgs = v.get("images") or ([v["image"]] if v.get("image") else [])
    return imgs[0] if imgs else None


def crop(hero, out_rel):
    if hero and os.path.exists(hero):
        subprocess.run(["magick", hero, "-resize", "1200x630^", "-gravity", "center",
                        "-extent", "1200x630", "-quality", "85", "-strip", out_rel], check=True)
        return out_rel
    return "images/og-default.png"


def write_stub(path, hash_route, title, subtitle, og_rel, lang):
    url = BASE + (path + "/" if path else "")
    canon = BASE + ("?l=en" if lang == "en" else "") + ("#" + hash_route if hash_route else "")
    og_img = BASE + og_rel
    rqs = '"?l=en"' if lang == "en" else "location.search"
    hash_js = json.dumps("#" + hash_route if hash_route else "")
    ogtype = "article" if hash_route else "website"
    H = html.escape
    stub = """<!doctype html>
<html lang="{lang}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — lapuschkin.eats</title>
<meta name="description" content="{sub}">
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="lapuschkin.eats">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{sub}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{sub}">
<meta name="twitter:image" content="{img}">
<link rel="canonical" href="{canon}">
<script>location.replace({base_js} + {rqs} + {hash_js});</script>
<style>body{{font-family:system-ui,sans-serif;background:#121410;color:#e8eae2;margin:0;display:grid;place-items:center;min-height:100vh}}a{{color:#73c793}}</style>
</head><body>
<p><a href="{canon}">lapuschkin.eats</a></p>
</body></html>
""".format(lang=lang, title=H(title), sub=H(subtitle), url=H(url), img=H(og_img),
           canon=H(canon), base_js=json.dumps(BASE), rqs=rqs, hash_js=hash_js, ogtype=ogtype)
    d = os.path.join(*path.split("/")) if path else "."
    if path:
        os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(stub)


idx = json.load(open("recipes/index.json"))
n = 0
# English homepage stub (the German homepage is index.html itself)
write_stub("en", "", "lapuschkin.eats", "Vegan recipes, to the point.", "images/og-default-en.png", "en")
n += 1
for fn in idx:
    d = json.load(open("recipes/" + fn))
    rid = d["id"]
    variants = d["variants"]
    dv = next((x for x in variants if x.get("id") == d.get("defaultVariant")), variants[0])
    # crops once per variant (photos are language-neutral)
    dv_crop = crop(variant_hero(dv), "images/og-%s.jpg" % rid)
    vcrops = {v["id"]: crop(variant_hero(v), "images/og-%s-%s.jpg" % (rid, v["id"])) for v in variants}
    for lang in ("de", "en"):
        pre = "en/" if lang == "en" else ""
        title = pick(d.get("title", rid), lang)
        subtitle = pick(d.get("subtitle", ""), lang)
        write_stub(pre + rid, rid, title, subtitle, dv_crop, lang)
        n += 1
        for v in variants:
            vlabel = pick(v.get("label", ""), lang)
            vtitle = title + (" · " + vlabel if vlabel else "")
            write_stub(pre + rid + "/" + v["id"], rid + "/" + v["id"], vtitle, subtitle, vcrops[v["id"]], lang)
            n += 1
    print("  %s (de+en, %d variant(s))" % (rid, len(variants)))
print("done:", n, "stubs")
