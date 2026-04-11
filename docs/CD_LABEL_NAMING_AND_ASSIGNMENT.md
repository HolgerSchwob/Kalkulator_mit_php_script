# CD-Label: Namenskonvention, Speicherort, Default, Zuweisung

## Namenskonvention

CD-Label-SVGs folgen dem **Buchdecken-Dateinamen** und enden mit:

**`_CDLABEL.svg`**

Beispiele:

| Buchdecken (Gruppe z. B. `hardcover_modern`) | CD-Label (Gruppe **`cd_label`**) |
|-----------------------------------------------|-----------------------------------|
| `Template_Wave2_production.svg` | `Template_Wave2_production_CDLABEL.svg` |
| `MeinCover.svg` | `MeinCover_CDLABEL.svg` |

So bleiben Paare in **Storage** und im **Dashboard** erkennbar. Die Eindeutigkeit in der Datenbank ist weiterhin **`(gruppe, filename)`** (Migration 029).

## Wo werden die Dateien abgelegt?

| Ebene | Ort |
|-------|-----|
| **Repository (Arbeitskopie)** | **`Templates/ai_generated/`** (Root) — gleicher Ablageort wie KI-generierte Buchdecken-Templates; dort u. a. `DEFAULT_CDLABEL.svg` und projektspezifische `*_CDLABEL.svg`. Siehe [`README_CD_LABEL.md`](../Templates/ai_generated/README_CD_LABEL.md). |
| **Produktiv (kanonisch)** | **Supabase** Bucket `cover-templates`, Pfad **`cd_label/<Dateiname>.svg`** — gleiches Muster wie bei Buchdecken (`<gruppe>/<filename>`). |
| **Dashboard** | Upload im **SCG-Editor** (`dashboard-svg-editor.html`), Gruppe **`cd_label`** — danach sind Metadaten in **`cover_templates`** und die Datei im Storage. |

**Antwort auf „nur lokal vs. DB“:** Für den **Shop** zählt nur, was in **Supabase** liegt. Lokale Dateien im Repo sind **Vorlagen zum Hochladen** und für Git/Review; ohne Upload sieht der Kunde sie nicht.

## Fallback: `DEFAULT_CDLABEL.svg`

- **Dateiname:** exakt **`DEFAULT_CDLABEL.svg`** (Großschreibung `DEFAULT`), Gruppe **`cd_label`**.
- **Rolle:** Wenn für ein Buchdecken-Template **`cd_label_template_id`** leer ist, verwendet der Kalkulator dieses Template (siehe [`kalkulator/cdLabelEditor.mjs`](../kalkulator/cdLabelEditor.mjs) — Reihenfolge: zuerst `DEFAULT_CDLABEL.svg`, optional noch **`default.svg`** für ältere Bestände).
- **Anlage:** Datei aus [`Templates/ai_generated/DEFAULT_CDLABEL.svg`](../Templates/ai_generated/DEFAULT_CDLABEL.svg) im Dashboard hochladen.

## Zuweisung: einzeln und Default

| Szenario | Vorgehen |
|----------|----------|
| **Buchdecken-Template** | Im SCG-Editor, Tab **Templates**, Spalte **„CD-Label-Zuweisung“** pro Zeile auf das passende CD-Template setzen; **„Änderungen speichern“**. |
| **Keine Zuordnung / Standard** | Spalte auf **Standard (Fallback)** bzw. leer lassen: Shop nutzt **`DEFAULT_CDLABEL.svg`**, sofern in `cd_label` vorhanden (`cd_label_template_id` = `NULL`). |

## Siehe auch

- [`docs/CD_DVD_FEATURE.md`](CD_DVD_FEATURE.md) — Funktionsüberblick  
- [`docs/ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md`](ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md) — Maße, Maske, `tpl-group-cd-face`  
- [`docs/SSOT_SVG_COVER_TEMPLATES.md`](SSOT_SVG_COVER_TEMPLATES.md) — Abschnitt CD-Label  
