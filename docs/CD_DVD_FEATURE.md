# CD/DVD-Funktion: Implementierungsüberblick

Dieses Dokument beschreibt die umgesetzte Funktion **CD/DVD als Extra**, **CD-Label-Templates** (Supabase `gruppe = cd_label`), **Kopplung an Buchdecken-Templates**, den **Webshop-Editor** (gleicher Stack wie Buchdecken, eigener State) und die **Admin-Oberfläche**. Stand: Umsetzung im Projekt „Kalkulator“ / bamadi.

---

## 1. Ziele (Kurz)

- Kunden bestellen **CD/DVD** im Bereich **Extras** (kein zusätzlicher Bindungstyp).
- Optionen: Medium (CD/DVD), Beschriftung (bedruckt/unbedruckt), Brennen (ohne/mit — ZIP nach Bestellung ist *noch nicht* automatisiert), Verpackung (u. a. Jewelcase, Papiertasche, Klebetasche).
- **Bedruckt:** Editor **„CD beschriften“** mit Templates aus **`cd_label`**; Farben wie beim gewählten **Buchdecken-Template** der Quell-Variante (`paletteSourceTemplateId`).
- **Admin:** Pro Buchdecken-Template optionale Zuordnung zu einem CD-Label-SVG; Fallback **`DEFAULT_CDLABEL.svg`** in `cd_label` (Namenskonvention: [`CD_LABEL_NAMING_AND_ASSIGNMENT.md`](CD_LABEL_NAMING_AND_ASSIGNMENT.md)).

---

## 2. Datenbank

| Artefakt | Beschreibung |
|----------|----------------|
| Migration `031_cd_label_template_id.sql` | Spalte `cover_templates.cd_label_template_id` (UUID, FK auf `cover_templates.id`, `ON DELETE SET NULL`). |

**Anwendung:** Zeilen mit **Buchdecken-Gruppen** (`hardcover_*`, `paperback_*`, …) können optional auf eine **andere** Zeile verweisen, deren `gruppe = cd_label` ist. Mehrere Buchdecken-Zeilen dürfen dieselbe CD-UUID teilen.

---

## 3. Edge Functions

| Function | Änderung |
|----------|----------|
| `get-cover-templates` | Select-Feld `cd_label_template_id`; Auslieferung im JSON pro Template (`cd_label_template_id`). |
| `admin-cover-templates` | PATCH (JSON): Feld `cd_label_template_id` setzen oder `null` (Fallback). |

Deploy: nach Codeänderungen `supabase functions deploy get-cover-templates` und `supabase functions deploy admin-cover-templates`.

---

## 4. Kalkulator (Frontend)

| Datei | Rolle |
|-------|--------|
| [`config.json`](../config.json) | Extra `cd_packaging_service` (Anzeigename „CD/DVD“) mit Option-Gruppen `media_type`, `label_print`, `burn`, `cd_packaging`. |
| [`kalkulator/cdLabelEditor.mjs`](../kalkulator/cdLabelEditor.mjs) | `launchCdLabelEditor`: lädt CD-Templates (`get-cover-templates?gruppe=cd_label`), löst Buchdecken-Template-ID für Palette/Zuordnung, setzt `paletteSourceTemplateId`, öffnet `HardcoverEditor` über `EditorFactory`. |
| [`kalkulator/HardcoverEditor.mjs`](../kalkulator/HardcoverEditor.mjs) | `editorTitle`, `paletteSourceTemplateId`; `_loadPaletteFromSupabase` kann Palette vom **Buchdecken-**Template laden; `parameters.templateId` beim Speichern. |
| [`kalkulator/editorHandler.mjs`](../kalkulator/editorHandler.mjs) | Export: `fetchCoverTemplateGroupConfig`, `deriveTemplateGroupFromBindingId`. |
| [`kalkulator/extrasHandler.mjs`](../kalkulator/extrasHandler.mjs) | Bei `label_print === printed`: Quell-Variante (mehrere Bücher), Button „CD beschriften“; fehlende neue Optionen werden mit Defaults befüllt. |
| [`kalkulator/script.js`](../kalkulator/script.js) | `inquiryState.cdLabel.sourceVariantId`, Persistenz; `launchCdLabelEditor` eingebunden. |
| [`kalkulator/inquiryHandler.mjs`](../kalkulator/inquiryHandler.mjs) | Bestell-Upload: `personalisierung_cd_label.svg` aus `personalizations.cd_label`. |

**State:** `inquiryState.personalizations.cd_label` enthält `editorData` (wie bei Varianten), plus Metadaten `sourceVariantId`, `paletteSourceTemplateId`.

---

## 5. Dashboard (SCG-Editor)

| Datei | Rolle |
|-------|--------|
| [`dashboard-svg-editor.js`](../dashboard-svg-editor.js) | Template-Gruppe **`cd_label`**; Spalte **„CD-Label-Zuweisung“** in der Template-Übersicht (nur bei Nicht-`cd_label`-Zeilen): Dropdown verknüpft Buchdecken-Zeile mit CD-Template oder „Standard (Fallback)“. |

Upload von CD-SVGs: Gruppe **`cd_label`** beim Hochladen wählen.

---

## 6. Noch offen (optional / später)

- **ZIP-Upload** für „Mit Daten (Brennen)“ nach Bestellung (Storage, Metadaten, Dashboard).
- **Vorschlags-Helper** (welches CD-Template / welche Quell-Variante).
- `cover_template_groups` in Supabase für **`cd_label`** mit exakten **Dimensionen** (aktuell Fallback im Code bzw. `get-cover-template-group`).

---

## 7. KI / SVG-Konventionen (CD-Label)

Siehe:

- [`docs/CD_LABEL_NAMING_AND_ASSIGNMENT.md`](CD_LABEL_NAMING_AND_ASSIGNMENT.md) — `*_CDLABEL.svg`, `DEFAULT_CDLABEL.svg`, Speicherort, Zuweisung zu Buchdecken-Templates.
- [`docs/ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md`](ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md) — Maße, Beschnitt, kreisförmige Maske, `tpl-*`.
- [`docs/ai_skills/SKILL_CD_LABEL_FROM_COVER_SOURCE.md`](ai_skills/SKILL_CD_LABEL_FROM_COVER_SOURCE.md) — Ableitung eines passenden CD-Templates aus einem Buchdecken-SVG.

SSOT-Ergänzung: [`docs/SSOT_SVG_COVER_TEMPLATES.md`](SSOT_SVG_COVER_TEMPLATES.md) (Abschnitt CD-Label).

---

## 8. Deployment-Checkliste

1. Migration anwenden (`supabase db push` oder SQL Editor).
2. Edge Functions deployen (siehe Abschnitt 3).
3. Mindestens ein SVG in **`cd_label`** hochladen; **`DEFAULT_CDLABEL.svg`** aus [`Templates/ai_generated/`](../Templates/ai_generated/) für den Fallback verwenden (siehe [`README_CD_LABEL.md`](../Templates/ai_generated/README_CD_LABEL.md)).
4. Buchdecken-Templates bei Bedarf **CD-Label-Zuweisung** im SCG-Editor setzen.
