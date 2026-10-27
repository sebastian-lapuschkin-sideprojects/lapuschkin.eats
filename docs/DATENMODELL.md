# lapuschkin.eats — Datenmodell & Anleitung

Wie die Sammlung aufgebaut ist und **wie man ein Rezept von Hand notiert** — ohne KI, nur mit Texteditor.

## Grundidee

Die **Daten sind die Quelle der Wahrheit**, die Website ist nur eine Ansicht davon. Jedes Rezept ist eine lesbare JSON-Datei in `recipes/`. Man kann sie im Terminal lesen (`cat`, `jq`) und von Hand schreiben.

| Datei | Zweck |
|---|---|
| `recipes/*.json` | die Rezepte — hier wird gearbeitet |
| `recipes/index.json` | Liste der Rezeptdateien (bestimmt die Reihenfolge) |
| `images/*` | Fotos / Platzhalter |
| `index.html` | Seitengerüst + CSS |
| `app.js` | Engine, rendert die Daten (ASCII-only) |

Kein Build nötig. Lokal ansehen: im Ordner `python3 -m http.server`, dann `http://localhost:8000`.

## Ein Rezept von Hand anlegen (Kurzfassung)

1. Datei `recipes/<id>.json` anlegen. `<id>` = kleingeschrieben mit Bindestrichen (z. B. `kaese-lauch-suppe`); ist zugleich der Link-Anker `#<id>`.
2. Nach dem Muster unten ausfüllen.
3. Dateinamen in `recipes/index.json` ergänzen.
4. Prüfen: `python3 -m json.tool recipes/<id>.json` (meldet Tippfehler im JSON).
5. Ansehen (lokaler Server oben) und ggf. online stellen.

## Datenmodell (alle Felder)

Ein Rezept ist eine **Gruppe** mit einer oder mehreren **Varianten**.

> **Anzeigetext ist zweisprachig.** Jedes Textfeld (`title`, `subtitle`, `tags`, `label`, `note`, `servingsUnit`, `time`, Zutaten-`name`/`note`, Schritt-`section`/`text`, Baum-`op`) ist entweder ein **String** oder ein Objekt **`{ "de": "…", "en": "…" }`** — siehe [Mehrsprachig](#mehrsprachig-deen). `id`, `amount`, `unit`, Bild und Baum-Struktur sind sprachneutral.

### Gruppe
| Feld | |
|---|---|
| `id` | Pflicht. kebab-case, = Dateiname & Link-Anker. |
| `title` | Pflicht. Anzeigename. |
| `subtitle` | optional. Ein Satz. |
| `tags` | Liste kurzer Schlagworte, z. B. `["Suppe","herzhaft"]`. Keine Zeitangaben wie „schnell". |
| `source` | optional. `{"name":"…","url":"…"}` — Quelle, wenn übernommen. Weglassen bei eigenen Rezepten. |
| `created` | optional. `"JJJJ-MM-TT"` — Anlagedatum. Erscheint in der Quellenzeile als „angelegt …". |
| `updated` | optional. `"JJJJ-MM-TT"` — Datum der letzten Änderung. Erscheint als „aktualisiert …", aber nur wenn es von `created` abweicht. Bei jeder inhaltlichen Änderung hochsetzen. |
| `defaultVariant` | `id` der Standard-Variante (wird zuerst gezeigt). |
| `variants` | Liste von Varianten (mindestens eine). |

### Variante
| Feld | |
|---|---|
| `id` | Pflicht. kebab, eindeutig in der Gruppe. |
| `label` | Anzeigename auf dem Varianten-Button („Sojamilch"). |
| `image` | ein Foto: `"images/datei.jpg"`. |
| `images` | mehrere Fotos: `["images/a.jpg", "images/b.jpg"]` → **Karussell** (Wechsel alle 4 s); das **erste** Bild ist Titel- und Druckbild. Statt `image`. |
| `imagePlaceholder` | `true`, wenn das Bild nur ein Platzhalter von der Quelle ist (zeigt den Hinweis). Bei eigenen Fotos weglassen. |
| `placeholder` | `"pancakes"` \| `"bowl"` (gezeichneter Platzhalter, wenn gar kein Foto). |
| `baseServings` | optional. Zahl (Basis-Portionen). Weglassen, wenn unbekannt oder sinnlos. |
| `servingsUnit` | optional. `"Portionen"`, `"Pfannkuchen"`, … |
| `time` | optional. `{"total":"…","active":"…"}` — beides optional. Nur eintragen, was man weiß. |
| `multipliers` | optional. z. B. `[0.5,1,2,3,4]`. Standard: `[0.5,1,2,3,4]`. |
| `note` | optional. Text oder Liste von Texten — Notizen / was funktioniert hat. |
| `ingredients` | Liste von Zutaten (s. u.). |
| `steps` | Liste von Schritten (s. u.). |
| `tree` | der Ablaufbaum für die Tabelle (s. u.). |

### Zutat
| Feld | |
|---|---|
| `id` | Pflicht. kurz, eindeutig in der Variante (wird von Schritten & Baum referenziert). |
| `amount` | Zahl … **oder** `null` = „nach Geschmack". |
| `max` | optional. Zahl → macht einen Bereich („200–250 g"). |
| `unit` | `"g"`,`"ml"`,`"l"`,`"EL"`,`"TL"`,`"Stange"`,`"Prise"`,`""` … (`""` für reine Stückzahl). |
| `name` | Anzeigename („Räuchertofu"). |
| `food` | optional. Schlüssel in `nutrition.json` für die Nährwertberechnung (s. u.). Für Zutaten mit Menge setzen; bei `amount: null` (nach Geschmack) unnötig. |
| `note` | optional. Klammer-Zusatz („geschält", „2–3 Stück"). |
| `optional` | optional. `true` → Badge „optional". |

### Schritt
| Feld | |
|---|---|
| `section` | optional. Zwischenüberschrift („Anbraten"). Gilt bis zur nächsten. |
| `text` | Pflicht. Der Schritt, knapp. |
| `uses` | Liste von Zutaten-`id`s, die in diesem Schritt verwendet werden → erscheinen als Chips mit Menge (kein Zurückblättern). |
| `optionalText` | optional. Ein optionaler Zusatz zum Schritt (String oder `{de,en}`) → als bernsteinfarbene „Optional:"-Zeile unter dem Schritt. |

> **Regel: nichts erfinden.** Unbekannte Mengen, Zeiten oder Portionen einfach **weglassen**, nicht schätzen. Das Feld fehlt dann — die Engine kommt damit klar.

### Mengen & Multiplikator
- `amount` gilt pro `baseServings` und wird mit dem gewählten Faktor multipliziert.
- `g`/`ml`/`l`/`kg` werden als Dezimalzahl gezeigt (Komma), alles andere (EL/TL/Stück/Prise …) als Bruch (½ ¼ ⅓ …).
- `max` → Bereich. `amount: null` → nur der Name (ohne Zahl).

## Nährwerte (`nutrition.json`)

Die Nährwerte unter den Zutaten werden **berechnet, nie im Rezept gespeichert** — so stimmen sie bei jeder Mengen- oder Zutatenänderung automatisch.

- `nutrition.json` (Projektwurzel) hat eine geteilte `foods`-Map: `Schlüssel → { per100g {kcal,protein,carbs,fat,fiber}, g_per_unit {Einheit→Gramm pro 1 Einheit; g=1, ml=Dichte, EL/TL/Stück/Prise = übliche Gewichte}, source }`. Werte gelten je 100 g der Zutat **wie verwendet** (Gemüse roh, Linsen trocken, Flüssiges je 100 ml).
- Jede Zutat mit Menge verweist per `"food": "<schlüssel>"` auf einen Eintrag. Fehlt `food`/Eintrag, markiert die Engine die Summe als unvollständig; fehlt ein Einzelwert, wird die Zahl als Untergrenze (`*`) gezeigt. `amount: null` (nach Geschmack) wird übersprungen.
- Angezeigt wird die **Summe fürs ganze Gericht**, skaliert mit dem Multiplikator, plus der **Energie-Anteil** je Makro (Eiweiß und KH ×4, Fett ×9 kcal/g).
- Reihenfolge und Beschriftung der Zeilen stehen in `nutrition.json` unter `macros` (aktuell: Energie, Fett, Kohlenhydrate, Ballaststoffe, Eiweiß).
- **Quellen: europäisch bevorzugen** — Ciqual (ANSES, FR), CoFID (UK), BLS (DE), Open Food Facts für EU-Labels; USDA meiden. **Nichts erfinden — fehlende Werte leer lassen.**

## Mehrsprachig (DE/EN)

Die Seite hat oben rechts einen **Sprach-Umschalter** (DE/EN); die Wahl wird pro Browser gemerkt, Standard ist Deutsch.

**So übersetzt man ein Feld** — jeder Anzeigetext ist wahlweise
- ein einfacher String → gilt für **beide** Sprachen (praktisch für Namen wie „Tamari", oder solange noch nicht übersetzt), oder
- ein Objekt `{ "de": "…", "en": "…" }`.

```json
"name": { "de": "Räuchertofu", "en": "Smoked tofu" }
"title": "Pancakes"              // gleich in beiden Sprachen
```
`note` darf sprachweise auch eine Liste sein:
```json
"note": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] }
```

**Einfachster Weg:** erst alles auf Deutsch als einfache Strings schreiben — funktioniert sofort (zeigt dann DE in beiden Sprachen) — und später Feld für Feld auf `{de,en}` umstellen.

**Einheiten** schreibt man nur einmal (deutsch); gängige werden automatisch lokalisiert:

| DE | EN | | DE | EN |
|---|---|---|---|---|
| EL | tbsp | | Zehe / Zehen | clove / cloves |
| TL | tsp | | Stück | pc |
| Prise | pinch | | Block | block |
| Stange / Stangen | stalk / stalks | | Bund | bunch |

`g`, `ml`, `l`, `kg` bleiben gleich; unbekannte Einheiten werden unverändert gezeigt. Das Dezimaltrennzeichen wechselt automatisch (DE Komma, EN Punkt).

## Tags

Tags sind kurze Schlagworte über dem Rezept. Einen **neuen Tag hinzufügen** heißt einfach: in die `tags`-Liste der Gruppe eintragen — es gibt keine zentrale Tag-Liste, sie werden direkt angezeigt. Zweisprachig wie jedes Textfeld:

```json
"tags": [ { "de": "süß", "en": "sweet" }, "Basis" ]
```
Ein einfacher String wie `"Basis"` erscheint in beiden Sprachen gleich. Keine Zeit-Tags wie „schnell/langsam".

Auf der Übersichtsseite lässt sich die Sammlung über eine Chip-Leiste nach Tags filtern (mehrere Tags = UND-Verknüpfung, „Alle" setzt zurück).

## Die Ingenieurs-Tabelle (`tree`)

Die Tabelle unter jedem Rezept wird aus `tree` erzeugt (Form nach Michael Chu, „Cooking for Engineers", 2004).

**So baust du sie (Klammer-Methode):**
1. Schreibe die Zutaten untereinander.
2. Klammere die, die zusammen verarbeitet werden, und schreibe die **Handlung** daneben („anbraten", „köcheln 45 Min").
3. Klammere die Zwischenergebnisse weiter mit den nächsten Zutaten — bis rechts das fertige Gericht steht.

**In JSON:**
- Blatt (Zutat): `{ "ing": "<zutat-id>" }`
- Knoten (Handlung): `{ "op": "<Handlung>", "children": [ … ] }`

**Regeln:**
- Jede Zutat kommt **genau einmal** als Blatt vor.
- Die Blatt-Reihenfolge (von oben nach unten) **= Reihenfolge der Zutatenliste**. Zutaten also so ordnen, dass zusammengehörige nebeneinanderstehen.
- Ein linearer Abschluss (köcheln → abschmecken → servieren) ist einfach verschachtelt: jede Handlung hat genau ein Kind.
- Spalten, Zeilenhöhen und Klammern berechnet die Engine selbst — du gibst nur den Baum.

**Beispiel (Pfannkuchen):**
```json
"tree": {
  "op": "ohne Fett backen",
  "children": [
    { "op": "glatt rühren", "children": [
      { "op": "trocken mischen", "children": [ { "ing": "mehl" }, { "ing": "natron" } ] },
      { "op": "feucht verrühren", "children": [ { "ing": "milch" }, { "ing": "sirup" } ] }
    ] }
  ]
}
```
Liest sich: Mehl + Natron trocken mischen; Milch + Sirup feucht verrühren; beides glatt rühren; ohne Fett backen.

## Komplettes Minimalbeispiel

```json
{
  "id": "beispiel",
  "title": "Beispielgericht",
  "tags": ["Beispiel"],
  "defaultVariant": "basis",
  "variants": [
    {
      "id": "basis",
      "label": "Grundrezept",
      "placeholder": "bowl",
      "ingredients": [
        { "id": "a", "amount": 200, "unit": "g", "name": "Zutat A" },
        { "id": "b", "amount": 1, "unit": "EL", "name": "Zutat B" },
        { "id": "c", "amount": null, "name": "Salz" }
      ],
      "steps": [
        { "text": "A und B verrühren.", "uses": ["a", "b"] },
        { "text": "Mit Salz abschmecken.", "uses": ["c"] }
      ],
      "tree": {
        "op": "abschmecken",
        "children": [
          { "op": "verrühren", "children": [ { "ing": "a" }, { "ing": "b" } ] },
          { "ing": "c" }
        ]
      }
    }
  ]
}
```
Kein `baseServings`, keine `time` — alles optional. `amount: null` bei Salz = nach Geschmack.

## Varianten & Favorit
- Mehrere `variants` = Abwandlungen (andere Milch, Ofen statt Pfanne, Resteküche).
- `defaultVariant` = geteilter Standard (für alle, auf jedem Gerät).
- Der Stern (☆/★) im Browser setzt einen **persönlichen** Favoriten — nur lokal im Browser (`localStorage`), ändert die Daten nicht. Der echte Standard bleibt `defaultVariant`.

## Bilder & Karussell

- Ein Foto: `"image": "images/datei.jpg"`. Mehrere: `"images": [ … ]` → **Karussell** auf der Rezeptseite (Wechsel alle 4 s), das **erste** Bild ist der Titel.
- Beim **Drucken / PDF / Bild-Export** wird nur das **Titelbild** gezeigt (das Karussell klappt zusammen).
- Platzhalter von der Quelle: `"imagePlaceholder": true` (zeigt den Hinweis „Platzhalterbild …"). Eigene Fotos: weglassen.
- Fotos nach `images/` legen und auf ~1400 px verkleinern, z. B. `sips -Z 1400 images/foto.jpg`.

## Optionales kennzeichnen

- **Zutat** optional: `"optional": true` → erscheint in Zutatenliste **und** Tabelle bernsteinfarben, mit Badge „optional".
- **Schritt-Zusatz** optional: `"optionalText": { "de": "…", "en": "…" }` am Schritt → bernsteinfarbene „Optional:"-Zeile darunter (z. B. die Kartoffeln in der Käse-Lauch-Suppe).

## Validieren & Veröffentlichen
- JSON prüfen: `python3 -m json.tool recipes/<id>.json` oder `jq . recipes/<id>.json`.
- Lokal ansehen: `python3 -m http.server`, dann `http://localhost:8000`.
- Online: alle Dateien auf einen Webserver legen (GitHub Pages / eigener Server). Muss über **http(s)** laufen, nicht `file://`.

## Code-Überblick (`app.js`)

Reine Ansichtslogik, keine Daten. Wichtige Funktionen:

| Funktion | Aufgabe |
|---|---|
| `load()` | lädt `recipes/index.json` und alle Rezepte per `fetch` |
| `route()` | Pfad-Routing: `/<id>` → Rezept, `/<id>/<variante>` → Variante direkt, `/about` → Infoseite, sonst Übersicht; `?l=de\|en` schaltet die Sprache. |
| `indexHTML()` | die Übersicht (Karten) + Tag-Filter |
| `recipeHTML()` / `ingAndSteps()` | eine Rezeptseite (Kopf, Varianten, Mengen, Zutaten, Schritte) |
| `nutritionHTML()` | Nährwert-Block (ganzes Gericht, skaliert) |
| `tableHTML()` | baut die Ingenieurs-Tabelle aus `tree` (Blätter → Spalten → Zellen mit rowspan/colspan) |
| `num()` / `frac()` / `dec()` / `amtOnly()` | Mengenformatierung (Bruch vs. Dezimal, Skalierung) |
| `favId()` / `setFav()` | persönlicher Favorit via `localStorage` |

**Wichtig:** `app.js` enthält nur ASCII — Sonderzeichen stehen als `\uXXXX`. Nach Änderungen an `app.js` ggf. neu escapen:
```sh
python3 - <<'PY'
p="app.js"; s=open(p,encoding="utf-8").read()
open(p,"w").write("".join(c if ord(c)<128 else "\\u%04x"%ord(c) for c in s))
PY
```
Die Rezept-JSONs dürfen Umlaute enthalten — die lädt der Browser immer als UTF-8.
