#!/usr/bin/env python3
"""Generate link-preview stub pages + 1200x630 OG crops, per recipe AND per variant.

WhatsApp/Telegram/etc. read static og: meta tags from the served HTML and do NOT
run JS or see the URL #fragment. So a hash-routed SPA can only ever show ONE
site-wide preview. For a per-recipe/-variant preview, each needs a real path with
its own static HTML. This writes:
  <id>/index.html              -> default variant's photo as OG
  <id>/<variant>/index.html    -> that variant's photo as OG
each redirecting into the SPA (/#<route>), plus images/og-<id>[-<variant>].jpg
(a 1200x630 cover-crop of the relevant title photo).

Re-run after changing a recipe's title, subtitle, variants or title photos:
  python3 scripts/gen-previews.py      (needs ImageMagick `magick`)
"""
import json, os, html, subprocess

BASE = "https://sebastian-lapuschkin-sideprojects.github.io/lapuschkin.eats/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def t(v):
    if isinstance(v, dict):
        return v.get("de") or v.get("en") or ""
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


def write_stub(route, title, subtitle, og_rel):
    url = BASE + route + "/"
    canon = BASE + "#" + route
    og_img = BASE + og_rel
    H = html.escape
    stub = """<!doctype html>
<html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — lapuschkin.eats</title>
<meta name="description" content="{sub}">
<meta property="og:type" content="article">
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
<meta http-equiv="refresh" content="0; url={canon}">
<script>location.replace({canon_js});</script>
<style>body{{font-family:system-ui,sans-serif;background:#121410;color:#e8eae2;margin:0;display:grid;place-items:center;min-height:100vh}}a{{color:#73c793}}</style>
</head><body>
<p>Weiter zu <a href="{canon}">{title}</a> …</p>
</body></html>
""".format(title=H(title), sub=H(subtitle), url=H(url), img=H(og_img),
           canon=H(canon), canon_js=json.dumps(canon))
    d = os.path.join(*route.split("/"))
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(stub)


idx = json.load(open("recipes/index.json"))
n = 0
for fn in idx:
    d = json.load(open("recipes/" + fn))
    rid = d["id"]
    title = t(d.get("title", rid))
    subtitle = t(d.get("subtitle", ""))
    variants = d["variants"]
    dv = next((x for x in variants if x.get("id") == d.get("defaultVariant")), variants[0])
    # recipe-level stub: default variant's photo
    write_stub(rid, title, subtitle, crop(variant_hero(dv), "images/og-%s.jpg" % rid))
    n += 1
    # per-variant stubs: each variant's own photo
    for v in variants:
        vlabel = t(v.get("label", ""))
        vtitle = title + (" · " + vlabel if vlabel else "")
        write_stub(rid + "/" + v["id"], vtitle, subtitle,
                   crop(variant_hero(v), "images/og-%s-%s.jpg" % (rid, v["id"])))
        n += 1
    print("  %s + %d variant(s)" % (rid, len(variants)))
print("done:", n, "stubs")
