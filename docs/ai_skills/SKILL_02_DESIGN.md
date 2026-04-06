name: svg-buchdecken-design-system
description: CREATIVE MODULE. Layout styles, color harmony, typography, and composition for academic book covers. Use together with SKILL_01_TECHNICAL.

SVG-Buchdecken: Design-System & Ästhetik (CREATIVE)

Dieses Modul steuert die visuelle Anmutung der generierten SVGs. Gestaltungsregeln stehen unter den technischen Vorgaben aus `SKILL_01_TECHNICAL.md` und `docs/SSOT_SVG_COVER_TEMPLATES.md`.

## 1. Typografie & Hierarchie

Die Maßeinheit im SVG ist mm (`viewBox="0 0 500 330"`). Maximal zwei Schriftfamilien pro Cover.

| Element | font-size (mm) | Gewicht | Rolle |
|---------|----------------|---------|--------|
| Haupttitel | 12 – 18 | Bold/Black (700–900) | Dominanz |
| Autorenname | 7.5 – 9 | SemiBold (600) | zweite Ebene |
| Art der Arbeit | 4.5 – 6 | Bold (700), ggf. Spationierung | oft Versalien |
| Thema / Fach | 4.5 – 5.5 | Light/Regular (300–400) | beschreibend, mehrzeilig |
| Admin / Spine | 3.8 – 5 | Regular / SemiBold | funktional |

**Font-Paarungen (Google Fonts):**

- **Elegance (Dissertationen):** Playfair Display + Lato  
- **Modern Authority (BA/MA):** Montserrat + Inter  
- **Humanist (Geisteswiss.):** Lora + Open Sans  
- **Technical (MINT/IT):** Roboto Mono + Roboto  
- **Swiss / Editorial:** Inter + Inter (oder Roboto) — reduziert, sachlich  

## 2. Layout-Archetypen

**L-01 Doctoral Classic** — Dissertationen: symmetrisch, vertikal zentriert, zarte Divider, viel Weißraum, Serif-Titel.

**L-02 Modern Scholar** — Bachelor/Master: asymmetrisch, linksbündig ab sicherem x (≥ 290), Negativraum rechts, geometrische Sans-Serif.

**L-03 Structural Engineer** — MINT: horizontale Vollbreiten-Bänder, kaschiersicher, klare Raster.

**L-04 Visual Project** — mit Kundenbild: U1 geteilt, Bild oben (`tpl-img-hero`), Text unten in color1-Fläche, kein Text über dem Foto; Spine/U4 farblich angebunden.

**L-05 Swiss Typographer** — Editorial: strenges Raster, eine harte vertikale Achse, maximal reduziert, keine Dekoration ohne Funktion.

## 3. Farb-Harmonien (2-Ton-Paletten)

Nur `color1` + `color2` über `colorselector`; keine zusätzlichen Spot-Farben im generierten SVG.

| ID | color1 | color2 |
|----|--------|--------|
| C-01 Oxford Navy & Gold | #14283D | #D4AF37 |
| C-02 Crimson Heritage | #5C1616 | #E5C185 |
| C-03 Slate & Coral | #2C3539 | #E06D53 |
| C-04 Deep Pine & Sand | #1E352B | #D9C5B2 |
| C-05 Cobalt & Ice | #0047AB | #E0F7FA |
| C-06 Pure Monolith | #1A1A1A | #A9A9A9 |
| C-07 Swiss Heritage | #000000 oder #FFFFFF | #E3000F |

**Prinzip:** Kontrast der beiden Farben plus Weiß/Off-White; keine Verläufe, keine Schlagschatten, keine „bunten“ Mehrfachfarben.

## 4. Art Direction

- Weißraum wirkt hochwertig; Admin-Zeilen (Uni, Jahr) kompakt und klar vom Titel getrennt.  
- Serif + Sans mischen statt zwei Serif oder zwei Sans.  
- Harte Vektorkanten; wissenschaftlich-sachliche Ästhetik.
