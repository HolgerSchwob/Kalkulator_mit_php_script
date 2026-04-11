---
name: svg-cd-label-technik
description: Technische Regeln für CD/DVD-Label-SVGs (gruppe cd_label). Klassische CD-ROM-Druckfläche, brutto Dokument mit Beschnitt, kreisförmige Trim-Maske, tpl-*-Konventionen kompatibel zum HardcoverEditor.
---

# SVG CD-Label: Technisches Fundament

Dieses Modul ergänzt [`SKILL_01_TECHNICAL.md`](SKILL_01_TECHNICAL.md) **nur für CD/DVD-Labels**. Buchdecken-Maße (500×330 mm, Spine, Falz) gelten hier **nicht**.

**Reihenfolge:** [`SSOT_SVG_COVER_TEMPLATES.md`](../SSOT_SVG_COVER_TEMPLATES.md) (Abschnitt CD-Label) → **dieses SKILL** → bei Ableitung aus einem Cover [`SKILL_CD_LABEL_FROM_COVER_SOURCE.md`](SKILL_CD_LABEL_FROM_COVER_SOURCE.md).

---

## 1. Physikalische Referenz (klassische CD-ROM)

- **Außenmaß Disc:** üblich **120 mm** Durchmesser (Datenträger).
- **Beschriftungs-/Druckzone:** optisch und im Handel meist als **Kreis** um die Mitte behandelt; **Beschnitt** (Bleed) soll **umlaufend** außerhalb der finalen 120-mm-Kante liegen — nicht auf der Schnittkante enden.

---

## 2. Dokumentgröße (Brutto) und Koordinaten

Alle Werte in **mm** (1 SVG-Einheit = 1 mm), konsistent mit dem Buchdecken-Workflow.

**Empfehlung (Beschnitt ca. 10 mm radial außerhalb des 60-mm-Radius):**

- **Finaler sichtbarer Kreis (Trim):** Radius **60 mm** → Durchmesser **120 mm** (entspricht der Disc).
- **Brutto-Arbeitsfläche:** Quadrat **140 × 140 mm** → je **10 mm** Zugabe gegenüber dem 120-mm-Kreis (umlaufend „etwa 1 cm“ größer als der Trim-Kreis als Referenz für Beschnitt).
- **Zentrum des Kreises:** **(70, 70)** in einem `viewBox="0 0 140 140"`.

Abgeleitete Koordinaten:

```text
viewBox="0 0 140 140"
Zentrum: cx=70, cy=70
Trim-Kreis (Endformat Disc): <circle cx="70" cy="70" r="60"/>
```

**Alternative (kompakter Editor-Viewport):** Solange **Verhältnis und IDs** stimmen, kann eine reduzierte viewBox genutzt werden — für **Neuanlagen** ist **140 × 140 mm** die kanonische Empfehlung; die Shop-Gruppe `cd_label` kann in Supabase (`cover_template_groups`) eigene `dimensions` setzen (siehe `get-cover-template-group`).

---

## 3. Kreisförmige „Maske“ (Trim / Optik CD)

Ziel: In der **Vorschau** soll die Fläche wie eine **CD** wirken, nicht wie ein Quadrat.

**Pflicht-Pattern:**

1. **`clipPath`** (harter Schnitt entlang Trim-Kreis) **oder** **`mask`** (weicher Übergang am Rand — optional).
2. Alle **sichtbaren** grafischen Inhalte (Hintergrund, Typo, Logos) in eine Gruppe **`g`** mit  
   `clip-path="url(#cd-trim)"`  
   legen (oder `mask` analog).

**Text und Logos:** Nicht in der **Mitte** (Hub / Loch-Zone) platzieren. Üblicher **druckbarer Ring** ca. innerer Radius **~21–23 mm** bis **~58 mm** (Außenrand 120-mm-Disc). Die Mitte bleibt frei oder zeigt nur die Hub-Fläche — siehe z. B. [CD-Label-Maße (Übersicht)](https://ronyasoft.com/products/cd-dvd-label-maker/articles/cd_%26_dvd_label_dimensions) und Herstellerangaben (inner/outer diameter).

Minimalbeispiel (Struktur):

```xml
<defs>
  <clipPath id="cd-trim" clipPathUnits="userSpaceOnUse">
    <circle cx="70" cy="70" r="60"/>
  </clipPath>
  <!-- BBox-Rechtecke für tpl-* bleiben in defs, siehe SSOT -->
</defs>

<g id="cd-label-content" clip-path="url(#cd-trim)">
  <!-- Hintergrund, Farbflächen, Text tpl-* -->
</g>
```

**Hinweis:** Der **Beschnitt** liegt im Bereich zwischen **r=60** und den Rändern der **140×140**-Fläche (bzw. bis zum Quadratrand). Kritische Motive (Text sicher lesbar) sollten innerhalb eines **Sicherheitsrings** liegen (z. B. **r ≤ 54–55 mm** für Text, je nach Setzerei — projektabhängig).

---

## 4. Ebenen / Gruppen (CD hat keinen Rücken)

- **Keine** `tpl-group-spine` / `tpl-group-u1` / `tpl-group-u4` erforderlich — der Webshop-Editor filtert Felder über diese Gruppen; für CD-Labels: **eine** inhaltliche Gruppe (z. B. `id="tpl-group-cd-face"`) oder alles unter einer Wurzel mit sinnvoller Struktur.
- Praktisch: Alle **`text`/`rect`/`image` mit `id^="tpl-"`** in **einer** Gruppe `tpl-group-cd-face` (oder ähnlich), damit Akkordeons im Editor nachziehbar sind — Abgleich mit [`kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md`](../../kalkulator/docs/EDITOR_SVG_KONVENTIONEN.md) und ggf. `cover_schema_elements` für `gruppe = cd_label`.

---

## 5. IDs, Farben, BBox (gleiche Philosophie wie Cover)

- Präfix **`tpl-`** für personalisierbare Felder.
- **`colorselector="color1"`** / **`colorselector="color2"`** wie in der SSOT.
- **`data-label`** für Formularnamen.
- **BBox:** unsichtbare Rechtecke `[id]_bbox` in `<defs>`, analog SSOT — der Editor skaliert Text im Rahmen.

---

## 6. Namenskonvention (Dateien)

- **Paar zu einem Buchdecken-Template:** gleicher **Basisname** wie die Buchdecken-SVG-Datei, mit Suffix **`_CDLABEL.svg`**.  
  Beispiel: `Template_Wave2_production.svg` → `Template_Wave2_production_CDLABEL.svg` (beide separat in Supabase; CD mit `gruppe = cd_label`).
- **Globales Fallback** (keine Zeilen-Zuweisung): **`DEFAULT_CDLABEL.svg`** in `gruppe cd_label` (Referenzdatei im Repo: [`Templates/ai_generated/DEFAULT_CDLABEL.svg`](../../Templates/ai_generated/DEFAULT_CDLABEL.svg), gemeinsam mit anderen KI-Templates).
- Vollständige Regeln: [`docs/CD_LABEL_NAMING_AND_ASSIGNMENT.md`](../CD_LABEL_NAMING_AND_ASSIGNMENT.md).

## 7. Supabase & Dashboard

- **`gruppe`:** `cd_label` (exakt).
- **`DEFAULT_CDLABEL.svg`** in `cd_label` = Fallback im Shop, wenn kein `cd_label_template_id` am Buchdecken gesetzt ist (ältere Bestände: `default.svg`).
- Buchdecken-Zeilen: optional **`cd_label_template_id`** im SCG-Editor (Tab **Templates**, Spalte **CD-Label-Zuweisung**) pro Buchdecken-Template setzen.

---

## 8. Produktion / Export

- **Mittelmarke** und Spine-Logik aus dem Buchdecken-Upload (Edge Function `admin-cover-templates`) sind für **reine CD-Gruppe** oft irrelevant; bei gemischtem Upload dennoch prüfen, ob Postprozesse CD-SVGs unverändert lassen sollen.
- Für Druck: Schriften ggf. einbetten (wie bei Cover), separates Toolkette unverändert.
