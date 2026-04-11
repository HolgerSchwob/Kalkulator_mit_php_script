# CD-Label-Templates (`Templates/ai_generated/`)

**CD-Label-SVGs** liegen im **gleichen Ordner** wie die KI-/AI-generierten Buchdecken-Templates: **`Templates/ai_generated/`** (Root, mit großem `T`).

## Wo liegt was?

| Ort | Bedeutung |
|-----|-----------|
| **`Templates/ai_generated/*.svg`** (inkl. `*_CDLABEL.svg`, `DEFAULT_CDLABEL.svg`) | Versionskontrolle: Referenzdateien zum **Hochladen** nach Supabase (SCG-Editor, Gruppe **`cd_label`** für CD-Label). |
| **Supabase** Storage `cover-templates`, Pfad `cd_label/…` | **Kanonisch für Shop & Dashboard** nach Upload. |

## Namenskonvention

- Pro Design: **gleicher Basisname wie das Buchdecken-Template**, mit Suffix **`_CDLABEL.svg`**.  
  Beispiel: Buchdecken `Template_Wave2_production.svg` → CD-Label `Template_Wave2_production_CDLABEL.svg` (Gruppe **`cd_label`**).
- **Globales Fallback:** **`DEFAULT_CDLABEL.svg`** in `gruppe cd_label`.

Details: `docs/ai_skills/SKILL_03_CD_LABEL_TECHNICAL.md`, `docs/CD_LABEL_NAMING_AND_ASSIGNMENT.md`.

## DEFAULT_CDLABEL.svg

1. Datei aus diesem Ordner im **Dashboard SVG-Editor** unter Gruppe **`cd_label`** hochladen.
2. Danach ist der Shop-Fallback verfügbar (`resolveEffectiveCdTemplateId`).

## Zuweisung zu Buchdecken-Templates

**Dashboard → SCG-Editor → Tab Templates:** In der Tabelle pro Buchdecken-Zeile **„CD-Label-Zuweisung“** wählen, dann **„Änderungen speichern“**.
