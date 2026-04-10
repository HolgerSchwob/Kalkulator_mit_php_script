---
name: svg-buchdecken-design-aesthetics
description: UNIVERSAL DESIGN MODULE. Global optical principles, typographic bands, archetype index (L-01…L-05) linking to styles/*.md; no per-style layout in this file — see SKILL_STYLE_*.
---

# SVG-Buchdecken: Universelle Optik & Datenstruktur (DESIGN)

Dieses Modul definiert die universellen Gestaltungsgesetze für ein hochprofessionelles akademisches Editorial-Design sowie das zwingende Daten-Mapping für den Editor.

**Reihenfolge beim Arbeiten:** `SSOT` → **`SKILL_01_TECHNICAL`** → **`SKILL_02_DESIGN`** (dieses Dokument) → **`styles/SKILL_STYLE_…`** (wenn ein Stil genannt wird).

## 1. DATA DICTIONARY: ELEMENT-IDs & BBOX (SSOT)
Alle personalisierbaren Elemente MÜSSEN zwingend diese IDs und Attribute verwenden. 
* Jedes Text-Element braucht `data-label="[Feldname]"`.
* Jedes dieser Text-Elemente MUSS eine unsichtbare Bounding Box im `<defs>`-Bereich haben (Format: `[ID]_bbox`).

| ID | Typ | Beschreibung & Regeln |
|---|---|---|
| tpl-subtitle | Text | Art der Arbeit (z.B. BACHELORARBEIT). Steht hierarchisch meist GANZ OBEN. |
| tpl-title | Text | Haupttitel (U1). Steht meist unter dem Subtitle, dominiert das Cover optisch. |
| tpl-name | Text | Autorenname (U1). |
| tpl-topic | Text (Multi) | Thema/Fach (U1). ZWINGEND Attribute: data-multiline="true" data-max-lines="4" |
| tpl-university | Text | Hochschule (U1). Funktionaler Admin-Block. |
| tpl-faculty | Text | Fakultät (U1). Funktionaler Admin-Block. |
| tpl-mat-nr | Text | Matrikelnummer (U1). Funktionaler Admin-Block. |
| tpl-year | Text | Jahr (U1). Funktionaler Admin-Block. |
| tpl-title-spine | Text | Titel auf dem Rücken. transform="rotate(-90...)" |
| tpl-name-spine | Text | Name auf dem Rücken. transform="rotate(-90...)" |
| tpl-year-spine | Text | Jahr auf dem Rücken. transform="rotate(-90...)" |
| tpl-logo-main | Rect | Kanonischer Platzhalter für Hochschullogo (`rect`, `id^="tpl-logo"`). fill:#ccc, stroke-dasharray. Zusätzliche Logos: weitere eindeutige IDs mit Präfix `tpl-logo-` (z. B. Legacy `tpl-logo-Logo1` / `tpl-logo-Logo2` in älteren Templates). |
| tpl-img-hero | Rect | Platzhalter für Projektbild/Coverbild. |

## 2. Layout-Archetypen — Index (Details = Style-Skills)

Stil-spezifische Layout- und Optik-Regeln stehen **nicht** in diesem Dokument, sondern in **`docs/ai_skills/styles/SKILL_STYLE_*.md`**. Neues Style-Skill: `SKILL_STYLE_SCAFFOLD.md` kopieren und hier in der Tabelle verlinken.

| ID | Kurzbeschreibung | Style-Skill |
|----|------------------|-------------|
| **L-01** | Doctoral Classic — symmetrisch, Serif-Titel, viel Weißraum | [styles/SKILL_STYLE_L01_DOCTORAL_CLASSIC.md](styles/SKILL_STYLE_L01_DOCTORAL_CLASSIC.md) |
| **L-02** | Modern Scholar — linksbündig ≥290, Negativraum rechts | [styles/SKILL_STYLE_L02_MODERN_SCHOLAR.md](styles/SKILL_STYLE_L02_MODERN_SCHOLAR.md) |
| **L-03** | Structural Engineer — Bänder, Raster, MINT | [styles/SKILL_STYLE_L03_STRUCTURAL_ENGINEER.md](styles/SKILL_STYLE_L03_STRUCTURAL_ENGINEER.md) |
| **L-04** | Visual Project — Bild hero, Text in Fläche | [styles/SKILL_STYLE_L04_VISUAL_PROJECT.md](styles/SKILL_STYLE_L04_VISUAL_PROJECT.md) |
| **L-05** | Swiss Typographer — Raster, eine Achse, reduziert | [styles/SKILL_STYLE_L05_SWISS_EDITORIAL.md](styles/SKILL_STYLE_L05_SWISS_EDITORIAL.md) |

Fehlt eine Style-Datei noch: Stil aus dieser Tabelle plus die globalen Regeln in den Abschnitten 3–6 umsetzen; danach Style-Skill nach [styles/SKILL_STYLE_SCAFFOLD.md](styles/SKILL_STYLE_SCAFFOLD.md) anlegen und die Tabelle ergänzen.

## 3. OPTISCHE GRUNDLAGEN & PROPORTIONEN
Das Layout darf niemals wie ein blind zentriertes Word-Dokument wirken. Wende folgende universelle Gestaltungsgesetze an:

* Die Lese-Hierarchie (Top-Down): Die "Art der Arbeit" (`tpl-subtitle`) fungiert in der Regel als sogenannte Dachzeile. Sie steht räumlich GANZ OBEN (z.B. y=60), gefolgt vom Haupttitel (`tpl-title`), der optisch durch Größe dominiert.
* Der Goldene Schnitt als Kompass: Nutze den Goldenen Schnitt (1 : 1.618) für die vertikale Aufteilung als Orientierung, NICHT als zwingendes Gesetz. Entscheide im Zweifel nach Augenmaß für ein ausgewogenes Gesamtbild (z.B. optischer Ankerpunkt im oberen Drittel).
* Optische Mitte vs. Geometrische Mitte: Die optische Mitte liegt immer leicht über der mathematischen Mitte. Zentrierte Elemente müssen leicht nach oben gerückt werden, sonst wirken sie "heruntergefallen".
* Gestaltgesetz der Nähe: Zusammengehörige Informationen (wie der Admin-Block: Uni, Fakultät, Mat-Nr, Jahr) MÜSSEN eng gruppiert werden. Zwischen unterschiedlichen Blöcken muss massiver Weißraum (negativer Raum) herrschen.

## 4. ABSTÄNDE & BALANCE (MARGINS)
Technische Safezones (15mm) sind nur das Minimum für den Druck. Ein High-End-Design verlangt nach großzügigeren optischen Rändern:
* Der Falz-Respekt: Der Bereich um den Falz (x=267.5 bis x=275.5) ist optisch unruhig. Linksbündiger Text auf U1 sollte für ein ausgewogenes Layout erst bei x=295 oder x=300 beginnen, um "Atmen" zu können.
* Margins: Halte bei linksbündigen Layouts den vertikalen Startpunkt (z.B. x=295) für alle Elemente strikt ein. Unsichtbare Hilfslinien stärken das Layout.

## 5. TYPOGRAFIE-GESETZE
* Reduktion: Maximal 2 Google Fonts pro Dokument. Wenn gemischt, dann zwingend Serif + Sans-Serif.
* Hierarchie-Kontrast (2:1 Regel): Obwohl die "Art der Arbeit" ganz oben steht, muss der Haupttitel (font-size 12-18mm) zwingend massiv größer und schwerer (Bold/Black) sein. Die Admin-Daten sind dezent (font-size 3.8-4.5mm, Regular/Light). Kontrast entsteht durch Größe und Gewicht.
* Zeilenabstand (Leading): Bei mehrzeiligen Texten (<tspan>) beträgt der y-Abstand exakt das 1.2 bis 1.3-fache der font-size.

## 6. FARB-MAPPING
* Es werden keine harten Hex-Werte generiert, sondern Supabase-Verknüpfungen genutzt.
* Zuweisung über Attribut: colorselector="color1" (für dominierende Primärfarben/Flächen) und colorselector="color2" (für Akzente/Linien).