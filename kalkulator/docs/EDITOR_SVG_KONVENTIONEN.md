# SVG-Templates für den Buchdecken-Editor (HardcoverEditor)

**Normative Vollreferenz:** [`docs/SSOT_SVG_COVER_TEMPLATES.md`](../../docs/SSOT_SVG_COVER_TEMPLATES.md) — dort: `tpl-*`-IDs, `tpl-group-u1` / `tpl-group-spine` / `tpl-group-u4`, Abgleich Supabase-Schema und Webshop.

Der **HardcoverEditor** baut Formularfelder und die Vorschau **dynamisch** aus dem geladenen SVG. Die folgende Kurzfassung ergänzt die SSOT.

## Gruppen (Layout)

| ID | Bedeutung |
|----|-----------|
| `#tpl-group-u1` | Vorderdeckel (U1) – Texte unter „Beschriftung Vorderseite“. |
| `#tpl-group-u4` | Rückdeckel (U4) – Texte unter „Beschriftung Rückseite“. |
| `#tpl-group-spine` | Buchrücken – Texte unter „Beschriftung Buchrücken“. |

Text-Elemente mit `id^="tpl-"` **ohne** Zuordnung zu diesen Gruppen erscheinen **nicht** in den Accordions.

## Textfelder, Logos, Farben, Dateien

Siehe SSOT (Abschnitte 3–7). Kurz: `tpl-`-Präfix, `data-label`, `colorselector`, `{id}_bbox`, `templates.json` / Supabase wie bisher.

## Tools im Repo

- `tools/svg-inkscape-to-editor/` – Postprocessing Inkscape → Editor-SVG  
- `tools/inkscape-personalization-helper/` – Hilfe für Zuweisungen in Inkscape  

Bei neuen Konventionen **zuerst** [`docs/SSOT_SVG_COVER_TEMPLATES.md`](../../docs/SSOT_SVG_COVER_TEMPLATES.md) anpassen, dann dieses Dokument nur bei Bedarf kürzen oder verlinken.
