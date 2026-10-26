#!/usr/bin/env python3
"""Generate per-recipe link-preview stub pages + 1200x630 OG crops.

WhatsApp/Telegram/etc. read static og: meta tags from the served HTML and do
NOT run JS or see the URL #fragment. So a hash-routed SPA can only ever show
ONE site-wide preview. To get a per-recipe preview, each recipe needs a real
path with its own static HTML. This writes <id>/index.html (og: tags + a
redirect into the SPA at /#<id>) and images/og-<id>.jpg (a 1200x630 cover-crop
of the recipe's title photo).

Re-run after changing a recipe's title, subtitle, default variant or title
photo:  python3 scripts/gen-previews.py   (needs ImageMagick `magick`)
"""
import json, os, html, subprocess, sys

BASE = "https://sebastian-lapuschkin-sideprojects.github.io/lapuschkin.eats/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def t(v):
    if isinstance(v, dict):
        return v.get("de") or v.get("en") or ""
    return v or ""


idx = json.load(open("recipes/index.json"))
for fn in idx:
    d = json.load(open("recipes/" + fn))
    rid = d["id"]
    title = t(d.get("title", rid))
    subtitle = t(d.get("subtitle", ""))
    dv = d.get("defaultVariant")
    variants = d["variants"]
    v = next((x for x in variants if x.get("id") == dv), variants[0])
    imgs = v.get("images") or ([v["image"]] if v.get("image") else [])
    hero = imgs[0] if imgs else "images/og-default.png"

    # 1200x630 cover-crop of the title photo for a clean landscape card
    og_rel = "images/og-%s.jpg" % rid
    if os.path.exists(hero):
        subprocess.run(["magick", hero, "-resize", "1200x630^", "-gravity",
                        "center", "-extent", "1200x630", "-quality", "85",
                        "-strip", og_rel], check=True)
    else:
        og_rel = "images/og-default.png"

    url = BASE + rid + "/"
    og_img = BASE + og_rel
    canonical = BASE + "#" + rid
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
           canon=H(canonical), canon_js=json.dumps(canonical))

    os.makedirs(rid, exist_ok=True)
    with open(os.path.join(rid, "index.html"), "w", encoding="utf-8") as f:
        f.write(stub)
    print("wrote %s/index.html  (og: %s)" % (rid, og_rel))

print("done:", len(idx), "recipes")
