# SVG-Templates für den Buchdecken-Editor (HardcoverEditor)

**Normative Vollreferenz:** [`docs/SSOT_SVG_COVER_TEMPLATES.md`](../../docs/SSOT_SVG_COVER_TEMPLATES.md) — dort: `tpl-*`-IDs, `tpl-group-u1` / `tpl-group-spine` / `tpl-group-u4`, Abgleich Supabase-Schema und Webshop.

Der **HardcoverEditor** baut Formularfelder und die Vorschau **dynamisch** aus dem geladenen SVG. Die folgende Kurzfassung ergänzt die SSOT.

## Gruppen (Layout)

| ID | Bedeutung |
|----|-----------|
| `#tpl-group-u1` | Vorderdeckel (U1) – Texte unter „Beschriftung Vorderseite“. |
| `#tpl-group-u4` | Rückdeckel (U4) – Texte unter „Beschriftung Rückseite“. |
| `#tpl-group-spine` | Buchrücken – Texte unter „Beschriftung Buchrücken“. Der **erste** `<rect>` in dieser Gruppe erhält im Editor die **aktuelle Rückenbreite** als `width` (mm). |
| `#tpl-spine-face` | Optional: `<rect>` (oft **außerhalb** der Gruppen, absolute Koordinaten) für einen **Karton-/Spine-Streifen**, wenn es **keine** `#tpl-group-spine` gibt. Der Editor setzt **`x` = Mitte − Rückenbreite/2** und **`width` = Rückenbreite** (`svgCenterX`), damit der Streifen bei variabler Dicke **mittig** bleibt (nicht nur `width` ändern). |

Text-Elemente mit `id^="tpl-"` **ohne** Zuordnung zu diesen Gruppen erscheinen **nicht** in den Accordions.

## Textfelder, Logos, Farben, Dateien

Siehe SSOT (Abschnitte 3–7). Kurz: `tpl-`-Präfix, `data-label`, `colorselector`, `{id}_bbox`, `templates.json` / Supabase wie bisher.

## Editor-Slots (Supabase → Webshop)

- In **`cover_schema_elements`** kann **`editor_slot`** gesetzt werden (SSOT Abschnitt 3, Unterpunkt Editor-Slots).
- **`book_block_first_page`:** nur mit **`element_type = image`** und einem **`<image id="…">`** im SVG (nicht `rect`). Beim Öffnen des Editors wird die Bild-URL aus der Buchblock-PDF-Vorschau gesetzt, falls vorhanden; sonst optional Fallback aus der Bindungs-`editorConfig`, sonst bleibt der im SVG eingetragene `href`.
- **Fest-ID `tpl-pdf-page1`:** Ein **`<image id="tpl-pdf-page1">`** (z. B. Paperback Deckfolie) wird vom Webshop ebenfalls mit der ersten PDF-Seite befüllt, **ohne** dass eine Schema-Zeile zwingend nötig ist (`KNOWN_BOOK_BLOCK_FIRST_PAGE_IMAGE_IDS` in [`editorSlots.mjs`](../editorSlots.mjs)).
- Implementierung: [`editorSlots.mjs`](../editorSlots.mjs), Aufruf aus `HardcoverEditor` nach dem Laden des Templates.

## Deckfolie-Vorschau (`#tpl-foil-overlay`)

- Optional: `<rect id="tpl-foil-overlay">` über dem sichtbaren Deckblatt (z. B. weiß, `data-color-role` für Farbe 2).
- Wenn die Bindung eine **Folienwahl** hat (`foil_type` / `_resolveFoilChoices` im Webshop), setzt [`HardcoverEditor.mjs`](../HardcoverEditor.mjs) **`fill-opacity`**: **glänzend** ≈ **0**, **matt** ≈ **0,2** (Konstanten `FOIL_OVERLAY_OPACITY_*`). Erkennung **matt** u. a. über Option-ID `foil_matte` oder Teilstrings `matt`/`matte` in der ID.
- Ohne Folien-UI im Editor bleibt das SVG unverändert.

## Tools im Repo

- `tools/svg-inkscape-to-editor/` – Postprocessing Inkscape → Editor-SVG  
- `tools/inkscape-personalization-helper/` – Hilfe für Zuweisungen in Inkscape  

Bei neuen Konventionen **zuerst** [`docs/SSOT_SVG_COVER_TEMPLATES.md`](../../docs/SSOT_SVG_COVER_TEMPLATES.md) anpassen, dann dieses Dokument nur bei Bedarf kürzen oder verlinken.
