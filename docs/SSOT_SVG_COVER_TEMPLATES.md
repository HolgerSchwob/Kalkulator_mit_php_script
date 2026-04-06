# SSOT: SVG-Buchdecken-Templates (Cover)

**Single Source of Truth** für alle Konventionen, die der **Webshop** (`kalkulator/HardcoverEditor.mjs`), das **Dashboard** (`dashboard-svg-editor.js`), **Supabase** (`cover_schema_elements`) und **KI-generierte SVGs** gemeinsam erfüllen müssen.

| Bereich | Datei / Ort |
|--------|----------------|
| Layout, Maße, Falz, Kaschierung, BBox, Farblogik (Detail) | `docs/ai_skills/SKILL_01_TECHNICAL.md` |
| Design, Typografie, Layout-Archetypen | `docs/ai_skills/SKILL_02_DESIGN.md` |
| Editor-Verhalten (technisch, kurz) | `kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md` |

---

## 1. Prinzip

- **`element_id` in Supabase** = **`id`-Attribut** der zugehörigen SVG-Elemente (Text `text`, Logo `rect`).
- Präfix für alle personalisierbaren Felder: **`tpl-`** — so filtert der Webshop-Editor zuverlässig (`text[id^="tpl-"]`, `rect[id^="tpl-logo"]`).
- **Legacy-IDs** (`front-text-title`, …) sind durch Migration `024_ssot_schema_element_ids_tpl.sql` ersetzt; in neuen Templates nicht mehr verwenden.

---

## 2. Layout-Gruppen (Pflicht für Webshop-UI)

Jedes **Text**-Element mit `id^="tpl-"` muss in **genau einer** dieser Gruppen liegen (über `closest()`), sonst erscheint es **nicht** im Kundenformular:

| Gruppen-ID | Bedeutung | Webshop-Akkordeon |
|------------|-----------|-------------------|
| `#tpl-group-u1` | Vorderdeckel (U1) | Beschriftung Vorderseite |
| `#tpl-group-spine` | Buchrücken | Beschriftung Buchrücken |
| `#tpl-group-u4` | Rückdeckel (U4) | Beschriftung Rückseite |

**Inkscape:** Ebenen können `data-layer="front" | spine | back"` nutzen; für den Shop zählt die **Einbettung in die `tpl-group-*`-Gruppen**.

---

## 3. Schema-IDs (`cover_schema_elements.element_id`)

Kanonische Namen (müssen mit SVG-`id` übereinstimmen):

| element_id | Typ | Layer (Schema) |
|------------|-----|----------------|
| `tpl-title` | text | front |
| `tpl-subtitle` | text | front |
| `tpl-name` | text | front |
| `tpl-degree` | text | front |
| `tpl-university` | text | front |
| `tpl-year` | text | front |
| `tpl-topic` | text | front (optional, z. B. mehrzeilig) |
| `tpl-logo-main` | image | front |
| `tpl-title-spine` | text | spine |
| `tpl-name-spine` | text | spine |
| `tpl-year-spine` | text | spine |
| `tpl-abstract` | text | back |

Zusätzliche projektspezifische Felder: weiterhin **`tpl-` + Kleinbuchstaben/Ziffern/Bindestrich**, z. B. `tpl-mat-nr`, `tpl-img-hero` (Bildplatzhalter).

---

## 4. Textattribute

- **`data-label`**: Anzeigename im Formular (Pflicht empfohlen).
- **`data-multiline="true"`** / **`data-max-lines="N"`**: mehrzeilige Felder.
- **BBox** für automatische Skalierung: unsichtbares `<rect id="{textId}_bbox" …>` — üblich in `<defs>`; der Editor findet die ID dokumentweit.

---

## 5. Farben

- SVG: **`colorselector="color1"`** oder **`colorselector="color2"`** (kein Bindestrich).
- Dashboard/DB: Anzeige „color-1 / color-2“ bezieht sich auf dieselben Rollen.

---

## 6. Logos / Bilder

- Platzhalter: **`rect`** mit **`id^="tpl-logo"`** (z. B. `tpl-logo-main`).

---

## 7. Dokumentmaß

- Vollumschlag: **500 × 330 mm**, **`viewBox="0 0 500 330"`** (1 Einheit = 1 mm). Details: SKILL_01.

---

## 8. Dashboard vs. Webshop

- **Preflight** im Dashboard prüft u. a. Pflichtfelder aus dem Schema; gültige IDs folgen Abschnitt 3.
- **Legacy**: IDs der Form `front-text-*` / `spine-text-*` werden in der ID-Prüfung noch toleriert (Warnstufe), sind aber **nicht** SSOT.

---

*Letzte strukturelle Aktualisierung: SSOT-Einführung (Repo).*
