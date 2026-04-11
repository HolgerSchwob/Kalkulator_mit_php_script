# SSOT: SVG-Buchdecken-Templates (Cover)

**Single Source of Truth** für alle Konventionen, die der **Webshop** (`kalkulator/HardcoverEditor.mjs`), das **Dashboard** (`dashboard-svg-editor.js`), **Supabase** (`cover_schema_elements`) und **KI-generierte SVGs** gemeinsam erfüllen müssen.

**Pflege in der Praxis:** Upload und Metadaten der Cover-Templates, globale Farbpaare, Template↔Farbschema-Zuordnung und Schema-Felder werden **zentral im SCG-Editor** gepflegt (`dashboard-svg-editor.html`, von der Shopkonfiguration unter **Buchdecken** verlinkt). Die übrigen Dashboard-Tools (z. B. Productioner, Preflight, Inkscape-Postprozessor) sind **Hilfsmittel** zur Vorbereitung und Prüfung, keine zweite Verwaltungsoberfläche für dieselben Supabase-Daten.

| Bereich | Datei / Ort |
|--------|----------------|
| Layout, Maße, Falz, Kaschierung, BBox, Farblogik (Detail) | `docs/ai_skills/SKILL_01_TECHNICAL.md` |
| **CD/DVD-Label** (kreisförmig, `gruppe cd_label`, Beschnitt) | `docs/ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md` |
| **CD aus Cover ableiten** (optisch passend zum Buchdecken-SVG) | `docs/ai_skills/SKILL_CD_LABEL_FROM_COVER_SOURCE.md` |
| **Namenskonvention** (`*_CDLABEL.svg`, `DEFAULT_CDLABEL.svg`, Zuweisung) | `docs/CD_LABEL_NAMING_AND_ASSIGNMENT.md` |
| Implementierung Shop/DB (Extras, Migration, Deploy) | `docs/CD_DVD_FEATURE.md` |
| Design global (Typo-Bänder, Paletten-Übersicht, Art Direction) | `docs/ai_skills/SKILL_02_DESIGN.md` |
| **Optik pro Stil** (L-01 … L-05, nur Layout/Look — keine Technik-Duplikate) | `docs/ai_skills/styles/` (README + `SKILL_STYLE_*.md`) |
| Editor-Verhalten (technisch, kurz) | `kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md` |

---

## 1. Prinzip

- **Template-Referenz in Supabase:** Kanonisch ist **`cover_templates.id`** (UUID). Verknüpfungen (z. B. Farbpaare über `cover_template_paletten`) nutzen diese ID. Der **Dateiname** ist **nicht** projektweit eindeutig (Eindeutigkeit nur je **`gruppe`**); das Dashboard löst Zuordnungen deshalb über **UUID** und **`gruppe`**, nicht allein über den Dateinamen.
- **`element_id` in Supabase** = **`id`-Attribut** der zugehörigen SVG-Elemente (Text `text`, Logo `rect`, Bild-Vorschau `image` bei `editor_slot`).
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

**Variable Rückenbreite (Webshop):** `HardcoverEditor._updateSpineAndLayout` verschiebt `#tpl-group-u4` / `#tpl-group-u1` und setzt die **Breite** des ersten `<rect>` in `#tpl-group-spine` auf die aktuelle Rückenbreite (mm). Ohne `#tpl-group-spine` (z. B. manche Paperbacks) kann ein **`<rect id="tpl-spine-face">`** dieselbe Breite erhalten (Kartonstreifen an der Spine-Kante).

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

**Buchblock, erste PDF-Seite (Raster-Vorschau im Cover):** feste ID **`tpl-pdf-page1`** für ein **`<image>`** (z. B. Paperback Deckfolie). Der Webshop befüllt **`href`** / **`xlink:href`** automatisch, sobald eine Buchblock-Vorschau existiert — **ohne** dass zwingend eine Schema-Zeile nötig ist (Konstante `KNOWN_BOOK_BLOCK_FIRST_PAGE_IMAGE_IDS` in [`kalkulator/editorSlots.mjs`](kalkulator/editorSlots.mjs)). Zusätzlich kann dieselbe ID (oder eine andere `<image id>`) über **`editor_slot = book_block_first_page`** im Schema gepflegt werden; beides ist kompatibel.

### Editor-Slots (`cover_schema_elements.editor_slot`)

- **Spalte:** `none` (Standard) oder `book_block_first_page` (Migration `030_cover_schema_editor_slot.sql`).
- **Semantik:** Steuert **zusätzliche** Webshop-Logik in [`kalkulator/editorSlots.mjs`](kalkulator/editorSlots.mjs) / [`kalkulator/HardcoverEditor.mjs`](kalkulator/HardcoverEditor.mjs), unabhängig vom reinen `element_type`.
- **`book_block_first_page`:** Gilt nur für Schema-Zeilen mit **`element_type = image`**. Im SVG muss ein **`<image id="{element_id}">`** existieren (gleiche ID wie in der DB). Beim Laden setzt der Editor **`href`** / **`xlink:href`** in dieser Reihenfolge:
  1. Vorschau erste PDF-Seite (`inquiryState.bookBlock.firstPagePreviewUrl`, Data-URL),
  2. optional: `editorConfig.bookBlockPreviewFallbackUrl` in der Shop-Bindung,
  3. sonst bleibt der im Template hinterlegte **`href`** (Musterbild).
- **Konvention `tpl-pdf-page1`:** Wie oben beschrieben — auch **ohne** DB-Zeile, sofern das SVG die ID enthält.
- **Logos** bleiben **`rect`** mit `id^="tpl-logo"`; **Raster-Vorschau Buchblock** nutzt **`image`** + `editor_slot`, nicht `rect`.

**Pflege:** Neues Slot-Token = DB-`CHECK` + Edge `update-cover-schema` + Dropdown im SCG-Editor + **diesen Abschnitt** + [`kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md`](kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md).

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

- Platzhalter: **`rect`** mit **`id^="tpl-logo"`**. **Kanonisch für neue und KI-generierte Templates:** `tpl-logo-main` (entspricht typisch `cover_schema_elements`). Weitere Logos: eigene eindeutige IDs mit Präfix `tpl-logo-` (z. B. ältere Templates mit `tpl-logo-Logo1` / `tpl-logo-Logo2`).

---

## 7. Dokumentmaß

- Vollumschlag: **500 × 330 mm**, **`viewBox="0 0 500 330"`** (1 Einheit = 1 mm). **Produktion Hardcover DIN A4** (Pappe, Falz, 35-mm-Musterrücken, sichtbare 465 × 302, Druck zentriert, SVG-Aufteilung 232,5 / 267,5): alles in **`docs/ai_skills/SKILL_01_TECHNICAL.md`** Abschnitte **1.1–1.3**.

### Hilfslinien (optional, z. B. Inkscape)

- Rahmen mit **`id="guide-sichtbereich"`** oder **`id` beginnt mit `guide-` / `guide_`**: nur für die Bearbeitung; im **Webshop** werden sie beim Laden entfernt, in der **Produktions-SVG** (Dashboard SCG-Editor) beim Export ebenfalls. Die **Quell-SVG**-Datei darf sie weiter enthalten.
- **`data-editor="guide"`** markiert dieselbe Rolle explizit.

---

## 8. Dashboard vs. Webshop

- **Preflight** im Dashboard prüft u. a. Pflichtfelder aus dem Schema; gültige IDs folgen Abschnitt 3.
- **Legacy**: IDs der Form `front-text-*` / `spine-text-*` werden in der ID-Prüfung noch toleriert (Warnstufe), sind aber **nicht** SSOT.

---

## 9. Ablauf: KI → `Templates/ai_generated` → Dashboard → Supabase → Webshop

Zielbild: Du lässt ein SVG nach Vorgaben erzeugen, speicherst es lokal unter **`Templates/ai_generated/`**, prüfst es im **Dashboard** (SVG-Personalisierung / Preflight), lädst es nach **Supabase** hoch — danach soll es im **Kalkulator/Webshop** für passende Bindungen nutzbar sein. **CD-Label-SVGs** (`*_CDLABEL.svg`, `DEFAULT_CDLABEL.svg`) liegen **ebenfalls** unter **`Templates/ai_generated/`** (Upload mit Gruppe **`cd_label`**); siehe [`Templates/ai_generated/README_CD_LABEL.md`](../Templates/ai_generated/README_CD_LABEL.md).

**Hinweis zur Anweisung:** In der Praxis reicht oft eine **reine Stilbeschreibung** (Archetyp L-01…L-05 oder eigenes Style-Skill). Der Agent bzw. die KI im Projekt soll **dennoch immer** `SSOT_SVG_COVER_TEMPLATES.md`, `SKILL_01_TECHNICAL.md` und `SKILL_02_DESIGN.md` vollständig einbeziehen — nicht nur das Style-Skill.

### Kurz-Checkliste: Neues Template in 5 Schritten

1. **Generieren:** Stil nennen (siehe SKILL_02 Abschnitt 2 — Layout-Archetypen) oder neues `SKILL_STYLE_*` nutzen; Ausgabe nach **`Templates/ai_generated/`** (SVG, optional gleichnamige `.md` mit Farbvorschlägen).
2. **Technisch prüfen:** IDs, `tpl-group-*`, BBox, `colorselector` gegen diese SSOT und SKILL_01.
3. **Dashboard:** Datei öffnen, Schema/Felder abgleichen, **Preflight** ohne harte Fehler.
4. **Upload:** Template mit passender **`gruppe`** zur Shop-Bindung hochladen.
5. **Farbzuordnung & Test:** Mindestens ein **Farbpaar** zuordnen; im Webshop mit der richtigen Bindung testen.

| Schritt | Was du tun musst / was passiert |
|--------|----------------------------------|
| 1. Generierung | KI hält **SKILL_01**, **SKILL_02** und diese **SSOT** ein: `tpl-*`-IDs, `tpl-group-u1` / `-spine` / `-u4` (oder dokumentiertes Ersatzlayout z. B. `layer-back-spine-bg`), `colorselector`, BBox in `defs`; optionale Hilfslinien siehe Abschnitt „Hilfslinien“. |
| 2. Datei | SVG liegt unter **`Templates/ai_generated/name.svg`**. Optional (von der KI, siehe `.cursorrules`): gleicher Basisname **`name.md`** im selben Ordner — **Farbpaar-Vorschläge** (Rolle von color1/color2, 1–3 Paare mit Namen/Hex, Bezug zu SKILL_02). Du legst die Paare in **Supabase** an; die `.md` ist nur Hilfe, kein Ersatz für die Datenbank. |
| 3. Dashboard | Datei öffnen, **Felder** mit Schema abgleichen, **Check** (Preflight) ohne harte Fehler; bei Bedarf **Farben** zuweisen. |
| 4. Upload | Template hochladen mit **`gruppe`** = der Gruppe der Bindung (z. B. `hardcover_modern` — muss zu `editorConfig.templateGroup` im Shop passen, siehe `editorHandler.mjs`). |
| 5. Farbpaare | Unter **Template-Zuordnung** mindestens ein **Farbpaar** pro Template wählen — sonst lädt der Editor zwar das SVG, die **Farbwahl** kann leer sein (`HardcoverEditor._loadPaletteFromSupabase`). |
| 6. Webshop | Kunde wählt Bindung → Editor lädt Template-Liste per `get-cover-templates?gruppe=…` und das SVG per öffentlicher URL. |

**Hinweise (keine „alten“ Konflikte, aber manuelle Pflichten):**

- **Begleit-`name.md`:** Dient der Übergabe von Farbvorschlägen an dich; Anlage der **`cover_farbpaare`** und **Template-Zuordnung** bleiben manuell im Dashboard/Supabase.  
- **`cover_schema_elements`** nutzt nach Migration **024** durchgängig **`tpl-*`**; SVG-`id`s müssen dazu passen.  
- **Druck:** Webfonts im SVG (`@import`) sind für die Vorschau üblich; für belastbaren Druck ggf. **SVG Productioner** (Fonts einbetten) — separates Tool.  
- **Migration 020** seedet historisch noch `front-text-*`; auf einer frischen DB mit 020+024 sind die Zeilen **`tpl-*`**. Neue Repos: `supabase db reset` wendet die Kette in der richtigen Reihenfolge an.

---

## 10. CD-Label (`gruppe = cd_label`)

CD/DVD-Beschriftung nutzt **dieselbe** `tpl-*`- und Farb-Logik wie Buchdecken, aber **andere Geometrie**: kein Rücken, **kreisförmiger Trim** (typisch 120 mm Durchmesser), **Brutto-Dokument** größer für Beschnitt (empfohlen **140 × 140 mm**, siehe SKILL_03).

- **Supabase:** `cover_templates.gruppe = 'cd_label'`; optional **`cd_label_template_id`** auf **Buchdecken**-Zeilen verweist auf ein CD-Template; fehlt die Zuordnung, greift **`DEFAULT_CDLABEL.svg`** in `cd_label` (falls vorhanden; ältere Deployments: `default.svg`). **Dateinamen:** Buchdecken-Paar `*_CDLABEL.svg`, siehe [`CD_LABEL_NAMING_AND_ASSIGNMENT.md`](CD_LABEL_NAMING_AND_ASSIGNMENT.md).
- **Webshop:** Editor lädt nur Templates mit `gruppe = cd_label`; **Farbpalette** kommt vom **Buchdecken-Template der gewählten Quell-Variante** (`paletteSourceTemplateId`), nicht von einer separaten CD-Paletten-Zeile.
- **Technik / KI:** Maße, `clipPath`, Masken: **`docs/ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md`**. Ableitung aus einem Cover-SVG: **`docs/ai_skills/SKILL_CD_LABEL_FROM_COVER_SOURCE.md`**.

Layout-Gruppen aus Abschnitt 2 (U1/Spine/U4) sind für CD-Labels **nicht** vorgeschrieben; sinnvoll ist eine **eine** Gruppe für die sichtbare CD-Fläche (z. B. `tpl-group-cd-face`), konsistent mit [`kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md`](../kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md).

---

*Letzte strukturelle Aktualisierung: SSOT-Einführung (Repo); Abschnitt 10 CD-Label.*
