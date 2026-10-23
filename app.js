/* lapuschkin.eats \u2014 rendering engine.
   Data lives in recipes/*.json (fetched). A recipe is a GROUP of VARIANTS; one is the
   favourite (defaultVariant) and opens first. Quantities scale by a multiplier.
   Bilingual: any human-readable field is either a plain string (same in both languages)
   or an object {de, en}. The t() helper resolves it for the current language.
   This file is ASCII-only (non-ASCII as \uXXXX) so any static host renders it correctly. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var GROUPS = [];
  var byId = {};
  var state = {}; // gid -> {vi, factor}
  var carTimer = null;
  var NUTRITION = null;

  // ---- language ------------------------------------------------------------
  var LANG = "de";
  try { var sl = localStorage.getItem("eats-lang"); if (sl === "de" || sl === "en") LANG = sl; } catch (e) {}
  function setLang(l) { LANG = l; try { localStorage.setItem("eats-lang", l); } catch (e) {} }
  // data field: plain string, or {de, en}
  function t(val) {
    if (val == null) return "";
    if (typeof val === "object" && !Array.isArray(val)) return val[LANG] != null ? val[LANG] : (val.de != null ? val.de : (val.en != null ? val.en : ""));
    return val;
  }
  // chrome strings
  var UI = {
    nav_recipes: { de: "Rezepte", en: "Recipes" },
    nav_table: { de: "Die Tabelle", en: "The Table" },
    back: { de: "\u2190 alle Rezepte", en: "\u2190 all recipes" },
    source: { de: "Quelle:", en: "Source:" },
    adapted: { de: "nach", en: "adapted from" },
    own: { de: "eigenes Rezept", en: "own recipe" },
    placeholder_img: { de: "Platzhalterbild von der Originalseite", en: "placeholder image from the original site" },
    fav_set: { de: "Als Favorit setzen", en: "Set as favourite" },
    fav_is: { de: "Favorit", en: "Favourite" },
    prev_v: { de: "vorige Variante", en: "previous variant" },
    next_v: { de: "n\u00e4chste Variante", en: "next variant" },
    dauer: { de: "Dauer", en: "Time" },
    aktiv: { de: "aktiv", en: "active" },
    basis: { de: "Basis", en: "Base" },
    menge: { de: "Menge", en: "Amount" },
    vnotes: { de: "Notizen zur Variante", en: "Variant notes" },
    ingredients: { de: "Zutaten", en: "Ingredients" },
    method: { de: "Zubereitung", en: "Method" },
    optional: { de: "optional", en: "optional" },
    opt_label: { de: "Optional:", en: "Optional:" },
    variants: { de: "Varianten", en: "variants" },
    figcap: {
      de: "Ablauf als Tabelle \u2014 links Zutaten, dann Schritt f\u00fcr Schritt nach rechts zusammengef\u00fchrt bis zum fertigen Gericht.",
      en: "The method as a table \u2014 ingredients on the left, then merged step by step to the right until the finished dish."
    },
    howto_s: { de: "Wie lese ich diese Tabelle?", en: "How do I read this table?" },
    howto_b: {
      de: "Jede Zelle rechts fasst die benachbarten Zutaten/Zwischenschritte zusammen und sagt, was damit passiert. So wandert alles von links nach rechts, bis rechts das fertige Gericht steht. Erfunden von Michael Chu (\u201eCooking for Engineers\u201c, 2004) \u2014 ",
      en: "Each cell on the right groups the adjacent ingredients/intermediate steps and says what happens to them. Everything moves left to right until the finished dish sits on the right. Invented by Michael Chu (\u201cCooking for Engineers\u201d, 2004) \u2014 "
    },
    howto_more: { de: "mehr dazu", en: "more" },
    lede_h1: { de: "Vegane Rezepte, auf den Punkt.", en: "Vegan recipes, to the point." },
    lede_p: {
      de: "Knapp notiert \u2014 in jedem Schritt stehen die Mengen dabei. Die Menge l\u00e4sst sich per Multiplikator skalieren, und jedes Rezept gibt es als Varianten mit eigenen Notizen. Alles vegan \u2014 oder konsequent veganisiert.",
      en: "Written tight \u2014 every step lists its amounts. Scale the quantity with a multiplier, and every recipe comes as variants with their own notes. All vegan \u2014 or consistently veganized."
    },
    loading: { de: "l\u00e4dt\u2026", en: "loading\u2026" },
    nutri_title: { de: "N\u00e4hrwerte \u2014 ganzes Gericht", en: "Nutrition \u2014 whole dish" },
    nutri_optional: { de: "Optional dazu:", en: "Optional add-ons:" },
    nutri_incomplete: { de: "Unvollst\u00e4ndig \u2014 ohne hinterlegte Werte:", en: "Incomplete \u2014 no data for:" },
    nutri_foot: { de: "Berechnet aus den Zutaten (je 100 g), skaliert mit der Menge; gerundet. Quellen in nutrition.json.", en: "Computed from the ingredients (per 100 g), scaled by the amount; rounded. Sources in nutrition.json." },
    nutri_partial: { de: "* Einzelwert fehlt in der Quelle \u2014 Gesamt ist Untergrenze.", en: "* a per-item value is missing from the source \u2014 total is a lower bound." }
  };
  function ui(k) { var o = UI[k]; return o ? (o[LANG] || o.de) : k; }

  // ---- units: localize the display string (number logic uses the raw unit) ----
  var UNIT_EN = { EL: "tbsp", TL: "tsp", "Prise": "pinch", "Stange": "stalk", "Stangen": "stalks",
    "Zehe": "clove", "Zehen": "cloves", "St\u00fcck": "pc", "Block": "block", "Msp": "pinch",
    "Bund": "bunch", "Dose": "can", "Packung": "pack" };
  function unitStr(u) { if (!u) return ""; return LANG === "en" ? (UNIT_EN[u] || u) : u; }

  // ---- helpers -------------------------------------------------------------
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function favId(g) {
    try {
      var f = localStorage.getItem("eats-fav-" + g.id);
      if (f && g.variants.some(function (v) { return v.id === f; })) return f;
    } catch (e) {}
    return g.defaultVariant;
  }
  function setFav(g, id) { try { localStorage.setItem("eats-fav-" + g.id, id); } catch (e) {} }
  function defIdx(g) {
    var fid = favId(g);
    var i = g.variants.findIndex(function (v) { return v.id === fid; });
    return i < 0 ? 0 : i;
  }
  function st(g) {
    if (!state[g.id]) state[g.id] = { vi: defIdx(g), factor: 1 };
    return state[g.id];
  }

  // ---- number formatting ---------------------------------------------------
  var GLYPH = { 0: "", 0.125: "\u215b", 0.25: "\u00bc", 0.333: "\u2153",
    0.5: "\u00bd", 0.625: "\u215d", 0.667: "\u2154", 0.75: "\u00be", 0.875: "\u215e" };
  var FSTEPS = Object.keys(GLYPH).map(Number).concat(1);
  var DEC = ["g", "ml", "l", "kg", "kcal", "cm"];
  function frac(x) {
    var w = Math.floor(x), f = x - w, best = 0, bd = 9;
    FSTEPS.forEach(function (s) { var d = Math.abs(f - s); if (d < bd) { bd = d; best = s; } });
    if (best === 1) { w++; best = 0; }
    var g = GLYPH[best] || "";
    if (w === 0 && g === "") return "0";
    return (w === 0 ? "" : String(w)) + g;
  }
  function dec(x, u) {
    var v = (u === "g" || u === "ml" || u === "kcal") ? Math.round(x) : Math.round(x * 100) / 100;
    var s = String(v);
    return LANG === "en" ? s : s.replace(".", ",");
  }
  function num(x, u) { return DEC.indexOf(u) >= 0 ? dec(x, u) : frac(x); }
  function amtOnly(ing, f) {
    if (ing.amount == null) return "";
    var u = ing.unit || "";
    var s = num(ing.amount * f, u);
    if (ing.max != null) s += "\u2013" + num(ing.max * f, u);
    var du = unitStr(u);
    return du ? s + " " + du : s;
  }

  // ---- placeholder art -----------------------------------------------------
  function phSVG(v) {
    var a = "var(--accent)";
    if (v.placeholder === "pancakes")
      return '<svg width="84" height="84" viewBox="0 0 88 88" fill="none" stroke="' + a + '" stroke-width="2.5"><ellipse cx="44" cy="28" rx="26" ry="9"/><path d="M18 28v9c0 5 12 9 26 9s26-4 26-9v-9"/><path d="M18 40v9c0 5 12 9 26 9s26-4 26-9v-9"/><path d="M45 15c0-4 4-4 4-7" stroke-linecap="round"/></svg>';
    return '<svg width="84" height="84" viewBox="0 0 88 88" fill="none" stroke="' + a + '" stroke-width="2.5"><path d="M14 40h60a30 23 0 0 1-60 0z"/><path d="M8 40h72" stroke-linecap="round"/><path d="M40 22c0-4 8-4 8 0" stroke-linecap="round"/></svg>';
  }
  function imgList(v) { return (v.images && v.images.length) ? v.images : (v.image ? [v.image] : []); }
  function thumb(v) {
    var l = imgList(v);
    if (l.length) return '<div class="thumb"><img src="' + esc(l[0]) + '" alt="" loading="lazy"></div>';
    return '<div class="thumb ph">' + phSVG(v) + "</div>";
  }
  function recipeHero(v) {
    var l = imgList(v);
    if (l.length === 0) return '<div class="r-hero ph">' + phSVG(v) + "</div>";
    if (l.length === 1) return '<div class="r-hero"><img src="' + esc(l[0]) + '" alt="" loading="lazy"></div>';
    return '<div class="r-hero carousel">' + l.map(function (s, i) {
      return '<img class="cslide' + (i === 0 ? " on" : "") + '" src="' + esc(s) + '" alt="" loading="lazy">';
    }).join("") + "</div>";
  }

  // ---- Cooking-for-Engineers table ----------------------------------------
  function tableHTML(v, f) {
    var im = {}; v.ingredients.forEach(function (i) { im[i.id] = i; });
    var rows = [];
    function ann(n, p) {
      n._p = p;
      if (n.ing) { n.top = rows.length; n.size = 1; n.col = 0; rows.push(n.ing); return; }
      n.children.forEach(function (c) { ann(c, n); });
      n.top = Math.min.apply(null, n.children.map(function (c) { return c.top; }));
      n.size = n.children.reduce(function (a, c) { return a + c.size; }, 0);
      n.col = Math.max.apply(null, n.children.map(function (c) { return c.col; })) + 1;
    }
    ann(v.tree, null);
    var cells = [];
    function walk(n) {
      if (n.ing) {
        var pc = n._p ? n._p.col : 0;
        if (pc - 1 >= 1) cells.push({ r: n.top, c: 1, cs: pc - 1, rs: 1, op: null });
        return;
      }
      cells.push({ r: n.top, c: n.col, cs: 1, rs: n.size, op: n.op });
      var ppc = n._p ? n._p.col : null;
      if (ppc != null) { var gap = ppc - n.col - 1; if (gap > 0) cells.push({ r: n.top, c: n.col + 1, cs: gap, rs: n.size, op: null }); }
      n.children.forEach(walk);
    }
    walk(v.tree);
    var h = '<table class="cfe">';
    for (var r = 0; r < rows.length; r++) {
      var ing = im[rows[r]];
      h += '<tr><td class="ci' + (ing.optional ? " opt" : "") + '"><b class="amt">' + esc(amtOnly(ing, f)) + "</b> " + esc(t(ing.name)) + "</td>";
      cells.filter(function (x) { return x.r === r; })
        .sort(function (a, b) { return a.c - b.c; })
        .forEach(function (x) {
          var kind = x.op == null ? "cc" : "co";
          h += '<td class="' + kind + '" rowspan="' + x.rs + '" colspan="' + x.cs + '">' + esc(x.op == null ? "" : t(x.op)) + "</td>";
        });
      h += "</tr>";
    }
    return h + "</table>";
  }

  // ---- notes ---------------------------------------------------------------
  function noteHTML(note) {
    if (!note) return "";
    var n = note;
    if (typeof n === "object" && !Array.isArray(n) && ("de" in n || "en" in n)) n = n[LANG] != null ? n[LANG] : (n.de != null ? n.de : n.en);
    if (!n) return "";
    var inner = Array.isArray(n)
      ? "<ul>" + n.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
      : '<p style="margin:0">' + esc(n) + "</p>";
    return '<div class="note"><div class="nh">' + esc(ui("vnotes")) + "</div>" + inner + "</div>";
  }

  // ---- nutrition (computed from nutrition.json, whole dish) -----------------
  function fmtN(x, kcal) {
    if (x == null) return "\u2013";
    var v = kcal ? Math.round(x) : Math.round(x * 10) / 10;
    var s = Number.isInteger(v) ? String(v) : String(v);
    return LANG === "en" ? s : s.replace(".", ",");
  }
  function nutri(v, f) {
    if (!NUTRITION || !NUTRITION.foods) return null;
    var foods = NUTRITION.foods, macros = NUTRITION.macros || [];
    var base = {}, bmax = {}, range = false, opts = [], missing = [], any = false, partial = {};
    macros.forEach(function (m) { base[m.key] = 0; bmax[m.key] = 0; });
    v.ingredients.forEach(function (ing) {
      if (ing.amount == null) return;
      var fd = ing.food && foods[ing.food];
      var gpu = fd && fd.g_per_unit && fd.g_per_unit[ing.unit || "g"];
      if (!fd || gpu == null) { missing.push(ing); return; }
      any = true;
      function contrib(amt) {
        var g = amt * gpu * f, o = {};
        macros.forEach(function (m) { var p = fd.per100g ? fd.per100g[m.key] : null; o[m.key] = (p == null ? null : g / 100 * p); });
        return o;
      }
      var cmin = contrib(ing.amount), cmax = contrib(ing.max != null ? ing.max : ing.amount);
      if (ing.optional) { opts.push({ ing: ing, min: cmin, max: cmax }); }
      else {
        macros.forEach(function (m) {
          if (cmin[m.key] != null) { base[m.key] += cmin[m.key]; bmax[m.key] += cmax[m.key]; if (cmax[m.key] !== cmin[m.key]) range = true; }
          else { partial[m.key] = true; }
        });
      }
    });
    return { macros: macros, base: base, bmax: bmax, range: range, opts: opts, missing: missing, any: any, partial: partial };
  }
  function nutritionHTML(v, f) {
    var n = nutri(v, f);
    if (!n || (!n.any && !n.missing.length)) return "";
    var h = '<div class="nutri"><div class="nutri-h">' + esc(ui("nutri_title")) + "</div><dl>";
    n.macros.forEach(function (m) {
      var kc = m.key === "kcal", val = fmtN(n.base[m.key], kc);
      if (n.range && n.bmax[m.key] !== n.base[m.key]) val += "\u2013" + fmtN(n.bmax[m.key], kc);
      if (n.partial[m.key]) val += "*";
      h += "<div><dt>" + esc(t(m.label)) + "</dt><dd>" + val + " " + esc(m.unit) + "</dd></div>";
    });
    h += "</dl>";
    if (n.opts.length) {
      h += '<div class="nutri-opt">' + esc(ui("nutri_optional")) + "<ul>" + n.opts.map(function (o) {
        var k = fmtN(o.min.kcal, true);
        if (o.max.kcal !== o.min.kcal) k += "\u2013" + fmtN(o.max.kcal, true);
        return "<li>" + esc(t(o.ing.name)) + " +" + k + " kcal</li>";
      }).join("") + "</ul></div>";
    }
    if (n.missing.length) {
      h += '<div class="nutri-missing">' + esc(ui("nutri_incomplete")) + " " + n.missing.map(function (i) { return esc(t(i.name)); }).join(", ") + "</div>";
    }
    var pnote = "";
    for (var pk in n.partial) { pnote = '<div class="nutri-note">' + esc(ui("nutri_partial")) + "</div>"; break; }
    h += pnote + '<div class="nutri-note">' + esc(ui("nutri_foot")) + "</div></div>";
    return h;
  }

  // ---- recipe view ---------------------------------------------------------
  function recipeHTML(g) {
    var s = st(g), v = g.variants[s.vi], f = s.factor;
    var im = {}; v.ingredients.forEach(function (i) { im[i.id] = i; });
    var h = "";

    h += '<p class="back"><a href="#index">' + esc(ui("back")) + "</a></p>";
    h += '<div class="r-head"><div class="eyebrow">' + g.tags.map(function (x) { return esc(t(x)); }).join(" / ") + "</div>";
    h += "<h1>" + esc(t(g.title)) + "</h1>";
    if (g.subtitle) h += '<p class="sub">' + esc(t(g.subtitle)) + "</p></div>";
    else h += "</div>";

    h += recipeHero(v);
    var src = g.source
      ? ui("adapted") + ' <a href="' + esc(g.source.url) + '" target="_blank" rel="noopener">' + esc(g.source.name) + "</a>"
      : ui("own");
    h += '<p class="srcline">' + esc(ui("source")) + " " + src + (v.imagePlaceholder ? " \u00b7 " + esc(ui("placeholder_img")) : "") + "</p>";

    if (g.variants.length > 1) {
      var fav = favId(g);
      h += '<div class="variants"><button class="varrow" data-step="-1" aria-label="' + esc(ui("prev_v")) + '">\u2039</button>';
      g.variants.forEach(function (vv, i) {
        var isFav = vv.id === fav;
        h += '<span class="vpill ' + (i === s.vi ? "on" : "") + '">' +
          '<button class="vfav' + (isFav ? " fav" : "") + '" data-fav="' + i + '" aria-label="' + esc(ui("fav_set")) + '" title="' + esc(isFav ? ui("fav_is") : ui("fav_set")) + '">' + (isFav ? "\u2605" : "\u2606") + "</button>" +
          '<button class="vsel" data-vi="' + i + '">' + esc(t(vv.label) || vv.id) + "</button></span>";
      });
      h += '<button class="varrow" data-step="1" aria-label="' + esc(ui("next_v")) + '">\u203a</button></div>';
    }

    var spec = [];
    if (v.time && v.time.total) spec.push(esc(ui("dauer")) + " <b>" + esc(t(v.time.total)) + "</b>");
    if (v.time && v.time.active) spec.push(esc(ui("aktiv")) + " <b>" + esc(t(v.time.active)) + "</b>");
    if (v.baseServings != null) spec.push(esc(ui("basis")) + " <b>" + v.baseServings + " " + esc(t(v.servingsUnit)) + "</b>");
    if (spec.length) h += '<div class="specrow"><span>' + spec.join("</span><span>") + "</span></div>";

    var mults = v.multipliers || [0.5, 1, 2, 3, 4];
    h += '<div class="mult"><span class="lbl">' + esc(ui("menge")) + "</span>";
    mults.forEach(function (m) {
      h += '<button class="mbtn ' + (m === f ? "on" : "") + '" data-f="' + m + '">\u00d7' + num(m, "") + "</button>";
    });
    if (v.baseServings != null) h += '<span class="out">= ' + Math.round(v.baseServings * f) + " " + esc(t(v.servingsUnit)) + "</span>";
    h += "</div>";

    h += noteHTML(v.note);
    h += ingAndSteps(v, f, im);

    h += '<figure class="cfe-fig"><figcaption>' + esc(ui("figcap")) + "</figcaption>";
    h += '<div class="tablewrap">' + tableHTML(v, f) + "</div>";
    h += '<details class="howto"><summary>' + esc(ui("howto_s")) + "</summary><p>" + esc(ui("howto_b")) + '<a href="#about">' + esc(ui("howto_more")) + "</a>.</p></details></figure>";

    return h;
  }

  function ingAndSteps(v, f, im) {
    var h = '<div class="cols"><section class="panel"><h2>' + esc(ui("ingredients")) + '</h2><ul class="ing">';
    v.ingredients.forEach(function (ing) {
      var note = ing.note ? " <em>(" + esc(t(ing.note)) + ")</em>" : "";
      var badge = ing.optional ? '<span class="badge">' + esc(ui("optional")) + "</span>" : "";
      h += '<li' + (ing.optional ? ' class="opt"' : "") + '><span class="amt">' + esc(amtOnly(ing, f)) + "</span><span>" + esc(t(ing.name)) + note + badge + "</span></li>";
    });
    h += "</ul>" + nutritionHTML(v, f) + "</section><section class=\"panel\"><h2>" + esc(ui("method")) + "</h2><div class=\"steps\">";
    var lastS = null;
    v.steps.forEach(function (step) {
      var sec = step.section ? t(step.section) : null;
      if (sec && sec !== lastS) h += '<div class="sectionhd">' + esc(sec) + "</div>";
      if (sec) lastS = sec;
      h += '<div class="step"><span class="no"></span><div><p>' + esc(t(step.text)) + "</p>";
      if (step.optionalText) h += '<div class="step-opt"><span class="ol">' + esc(ui("opt_label")) + '</span> ' + esc(t(step.optionalText)) + "</div>";
      if (step.uses && step.uses.length) {
        h += '<div class="chips">';
        step.uses.forEach(function (id) {
          var ing = im[id]; if (!ing) return;
          var a = amtOnly(ing, f);
          h += '<span class="chip' + (ing.optional ? " opt" : "") + '">' + (a ? '<span class="amt">' + esc(a) + "</span> " : "") + esc(t(ing.name)) + "</span>";
        });
        h += "</div>";
      }
      h += "</div></div>";
    });
    h += "</div></section></div>";
    return h;
  }

  // ---- index + about -------------------------------------------------------
  function indexHTML() {
    var h = '<div class="lede"><h1>' + esc(ui("lede_h1")) + "</h1><p>" + esc(ui("lede_p")) + "</p></div>";
    h += '<div class="grid">';
    GROUPS.forEach(function (g) {
      var v = g.variants[defIdx(g)];
      var parts = [];
      if (v.time && v.time.total) parts.push(esc(t(v.time.total)));
      if (v.baseServings != null) parts.push(v.baseServings + " " + esc(t(v.servingsUnit)));
      if (g.variants.length > 1) parts.push('<span class="vcount">' + g.variants.length + " " + esc(ui("variants")) + "</span>");
      h += '<a class="card" href="#' + g.id + '">' + thumb(v) +
        '<div class="body"><div class="tags">' + g.tags.map(function (x) { return '<span class="tag">' + esc(t(x)) + "</span>"; }).join("") + "</div>" +
        "<h3>" + esc(t(g.title)) + "</h3>" +
        '<p class="meta">' + parts.join(" \u00b7 ") + "</p></div></a>";
    });
    return h + "</div>";
  }

  function aboutHTML() {
    if (LANG === "en") {
      return '<div class="prose"><p class="back"><a href="#index">\u2190 all recipes</a></p>' +
        "<h1>The Engineer's Table</h1>" +
        "<p>Every recipe here has a table at the bottom. It comes from <strong>Michael Chu</strong>, a software engineer who launched the site <em>Cooking for Engineers</em> in 2004. A handwritten note method \u2014 ingredients listed, grouped with curly braces \u2014 became this table form.</p>" +
        "<h2>How to read it</h2><ol>" +
        "<li>The <strong>left column</strong> is every ingredient with amounts \u2014 also your shopping list.</li>" +
        "<li>Each cell on the right carries an <strong>action</strong> (stir, fry, simmer \u2026) and <strong>brackets</strong> the rows that belong together.</li>" +
        "<li>A bracket merges its ingredients into <strong>one intermediate</strong> that flows on to the right as a single strand.</li>" +
        "<li>Further right the strands merge with later ingredients, column by column, until the <strong>finished dish</strong> sits on the right.</li>" +
        "<li>Read <strong>left \u2192 right, top \u2192 bottom</strong>. Times and temperatures sit exactly where they are needed \u2014 no scrolling back.</li></ol>" +
        '<p class="muted">Source: <a href="https://www.cookingforengineers.com/" target="_blank" rel="noopener">cookingforengineers.com</a> (Michael Chu, since June 2004).</p></div>';
    }
    return '<div class="prose"><p class="back"><a href="#index">\u2190 alle Rezepte</a></p>' +
      "<h1>Die Ingenieurs-Tabelle</h1>" +
      "<p>Jedes Rezept hier hat unten eine Tabelle. Sie stammt von <strong>Michael Chu</strong>, einem Software-Ingenieur, der 2004 die Seite <em>Cooking for Engineers</em> startete. Aus einer handschriftlichen Notiz-Methode \u2014 Zutaten untereinander, mit geschweiften Klammern gruppiert \u2014 wurde diese Tabellenform.</p>" +
      "<h2>So liest man sie</h2><ol>" +
      "<li>Die <strong>linke Spalte</strong> sind alle Zutaten mit Mengen \u2014 zugleich die Einkaufsliste.</li>" +
      "<li>Jede Zelle rechts tr\u00e4gt eine <strong>Handlung</strong> (r\u00fchren, anbraten, k\u00f6cheln \u2026) und <strong>klammert</strong> die Zeilen, die zusammengeh\u00f6ren.</li>" +
      "<li>Eine Klammer fasst ihre Zutaten zu <strong>einem Zwischenprodukt</strong> zusammen, das als ein Strang weiter nach rechts l\u00e4uft.</li>" +
      "<li>Weiter rechts verschmelzen die Str\u00e4nge mit sp\u00e4teren Zutaten, Spalte f\u00fcr Spalte, bis rechts das <strong>fertige Gericht</strong> steht.</li>" +
      "<li>Gelesen wird <strong>links \u2192 rechts, oben \u2192 unten</strong>. Zeiten und Temperaturen stehen genau da, wo sie gebraucht werden \u2014 kein Zur\u00fcckbl\u00e4ttern.</li></ol>" +
      '<p class="muted">Quelle: <a href="https://www.cookingforengineers.com/" target="_blank" rel="noopener">cookingforengineers.com</a> (Michael Chu, seit Juni 2004).</p></div>';
  }

  function errorHTML() {
    if (LANG === "en") {
      return '<div class="prose"><h1>Recipes not loaded</h1>' +
        '<p>The recipes live as JSON in <code>recipes/</code> \u2014 that is the source of truth, this page is just a view of it.</p>' +
        '<p class="muted">Opening the file locally by double-click blocks loading local files. Start a tiny server in the folder:</p>' +
        "<p><code>python3 -m http.server</code></p>" +
        '<p class="muted">\u2026 and open <code>http://localhost:8000</code>. Online (GitHub Pages / own server) everything loads directly.</p></div>';
    }
    return '<div class="prose"><h1>Rezepte nicht geladen</h1>' +
      '<p>Die Rezepte liegen als JSON in <code>recipes/</code> \u2014 das ist die eigentliche Quelle, diese Seite ist nur eine Ansicht davon.</p>' +
      '<p class="muted">Beim lokalen \u00d6ffnen per Doppelklick blockiert der Browser das Laden lokaler Dateien. Starte im Ordner einen Mini-Server:</p>' +
      "<p><code>python3 -m http.server</code></p>" +
      '<p class="muted">\u2026 und \u00f6ffne <code>http://localhost:8000</code>. Online (GitHub Pages / eigener Server) l\u00e4dt alles direkt.</p></div>';
  }

  // ---- routing + chrome ----------------------------------------------------
  function markNav(h) {
    var key = h === "about" ? "about" : "index";
    document.querySelectorAll("header nav a").forEach(function (a) {
      a.classList.toggle("on", a.dataset.nav === key);
    });
  }
  function applyChrome() {
    document.querySelectorAll("header nav a").forEach(function (a) {
      if (a.dataset.nav === "index") a.textContent = ui("nav_recipes");
      if (a.dataset.nav === "about") a.textContent = ui("nav_table");
    });
    var lb = document.getElementById("lang");
    if (lb) lb.textContent = LANG === "de" ? "EN" : "DE";
    document.documentElement.lang = LANG;
  }
  function bind(g) {
    app.querySelectorAll(".mbtn").forEach(function (b) {
      b.onclick = function () { st(g).factor = parseFloat(b.dataset.f); rerender(g); };
    });
    app.querySelectorAll(".vsel").forEach(function (b) {
      b.onclick = function () { st(g).vi = parseInt(b.dataset.vi, 10); rerender(g); };
    });
    app.querySelectorAll(".vfav").forEach(function (b) {
      b.onclick = function () { var i = parseInt(b.dataset.fav, 10); setFav(g, g.variants[i].id); st(g).vi = i; rerender(g); };
    });
  }
  function startCarousel() {
    if (carTimer) { clearInterval(carTimer); carTimer = null; }
    try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) {}
    var slides = app.querySelectorAll(".r-hero .cslide");
    if (slides.length < 2) return;
    var idx = 0;
    carTimer = setInterval(function () {
      slides[idx].classList.remove("on");
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add("on");
    }, 4000);
  }
  function rerender(g) { var y = window.scrollY; app.innerHTML = recipeHTML(g); bind(g); startCarousel(); window.scrollTo(0, y); }

  function currentHash() { return decodeURIComponent(location.hash.replace(/^#/, "")); }
  function render(h) {
    var g = byId[h];
    if (g) { app.innerHTML = recipeHTML(g); bind(g); }
    else if (h === "about") { app.innerHTML = aboutHTML(); }
    else { app.innerHTML = indexHTML(); }
    markNav(h); applyChrome(); startCarousel();
  }
  function route() { render(currentHash()); window.scrollTo(0, 0); }

  function initTheme() { try { var th = localStorage.getItem("eats-theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {} }

  function load() {
    app.innerHTML = '<p class="back">' + esc(ui("loading")) + "</p>";
    var pNut = fetch("nutrition.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var pRec = fetch("recipes/index.json")
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) {
        return Promise.all(list.map(function (f) {
          return fetch("recipes/" + f).then(function (r) { if (!r.ok) throw 0; return r.json(); });
        }));
      });
    Promise.all([pRec, pNut])
      .then(function (res) {
        GROUPS = res[0]; NUTRITION = res[1];
        GROUPS.forEach(function (g) { byId[g.id] = g; });
        route();
      })
      .catch(function () { app.innerHTML = errorHTML(); applyChrome(); });
  }

  document.getElementById("theme").onclick = function () {
    var el = document.documentElement;
    var cur = el.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
    try { localStorage.setItem("eats-theme", next); } catch (e) {}
  };
  var langBtn = document.getElementById("lang");
  if (langBtn) langBtn.onclick = function () {
    var y = window.scrollY;
    setLang(LANG === "de" ? "en" : "de");
    render(currentHash());
    window.scrollTo(0, y);
  };

  window.addEventListener("hashchange", route);
  initTheme();
  applyChrome();
  load();
})();
