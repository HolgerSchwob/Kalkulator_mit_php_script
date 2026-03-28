# SVG-Templates für den Buchdecken-Editor (HardcoverEditor)

Der **HardcoverEditor** baut Formularfelder und die Vorschau **dynamisch** aus dem geladenen SVG. Diese Konventionen müssen in Inkscape (bzw. nach Export über das Postprocessing-Tool) eingehalten werden, sonst fehlen Felder oder Farben.

## Gruppen (Layout)

| ID | Bedeutung |
|----|-----------|
| `#tpl-group-u1` | Vorderdeckel (U1) – zugehörige Texte erscheinen unter „Beschriftung Vorderseite“. |
| `#tpl-group-u4` | Rückdeckel (U4) |
| `#tpl-group-spine` | Buchrücken – Texte unter „Beschriftung Buchrücken“. |

Text-Elemente **ohne** Zuordnung zu diesen Gruppen erscheinen **nicht** in den Accordions (werden aktuell auch nicht verarbeitet – nur `text[id^="tpl-"]` in den Gruppen).

## Textfelder

- **ID-Präfix:** `tpl-`, z. B. `tpl-title`, `tpl-name`, `tpl-title-spine`.
- **Sichtbares Label im Formular:** Attribut `data-label="…"`. Ohne Attribut wird aus der ID ein lesbarer Name generiert (`tpl-title` → „Title“).
- **Mehrzeilig:** `data-multiline="true"` → Textarea.
- **Zeilenlimit:** `data-max-lines="N"` (nur sinnvoll mit Multiline).
- **Automatische Skalierung / Warnung „zu lang“:** Rechteck-Hilfskante mit ID **`{textId}_bbox`** (z. B. `tpl-title_bbox`) – gleiche Basis-ID wie das `text`-Element.

## Logos / Bilder

- Platzhalter: **`rect`** mit ID **`tpl-logo…`**, z. B. `tpl-logo-Logo1`.
- Optional: `data-label` für die Beschriftung im Formular.
- Unterstützte Uploads: SVG, PNG, JPEG (siehe `accept` im Editor).

## Farben (Supabase + SVG)

- Farbpaare kommen aus **Supabase** (`farbpaare` + `template_zuordnung`), nicht aus eingebetteten SVG-Paletten.
- Im SVG: Attribute **`colorselector="color1"`** bzw. **`colorselector="color2"`** auf den Elementen, die sich mit dem gewählten Farbpaar einfärben sollen.
- Explizit **weiße** Fills bleiben beim Einfärben der Kinder ausgenommen (siehe Editor-Logik `_isExplicitWhite`).

## Dateien & Manifest

- **Lokal:** `templates.json` im Template-Ordner listet `file` + `name` pro Vorlage.
- **Supabase:** Edge Function `get-cover-templates` liefert die Liste; SVG-URLs kommen aus der DB.

## Export / Wiederherstellung

Beim Bestätigen liefert der Editor u. a.:

- `svgString` – fertiges SVG (Hilfslinien/Warnungen vor Serialisierung entfernt)
- `parameters.textInputs`, `parameters.logoInputs`, `parameters.selectedColorPairIndex`, `parameters.templateIndex`, `parameters.spineWidth`

Diese Struktur wird als `initialData` wieder eingespeist – IDs der Text-/Logo-Elemente müssen zwischen Vorlagen **konsistent** bleiben, wenn Nutzer:innen zwischen Templates wechseln und alte Eingaben übernommen werden sollen.

## Tools im Repo

- `tools/svg-inkscape-to-editor/` – Postprocessing Inkscape → Editor-SVG  
- `tools/inkscape-personalization-helper/` – Hilfe für Zuweisungen in Inkscape  

Bei neuen Konventionen **dieses Dokument** und ggf. die Tool-READMEs mitpflegen.
