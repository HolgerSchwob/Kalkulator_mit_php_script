# Farbvorschläge: `Template_Horizontal_Ribbon.svg`

**Layout:** Vollbreite horizontale Bänder (`x=0`, `width=500`) — Akzentstreifen, Hauptband und Haarlinie laufen ohne Bruch über U4, Rücken und U1 (SKILL_01: durchlaufendes Band). **Typo:** **Playfair Display** (Titel) + **Lato** (alles Weitere) — klar getrennt von Swiss (Inter) und Modern Scholar (Montserrat/Inter).

**Vorderseite:** Metadaten und Titel **zentriert** auf U1 (`x ≈ 384`). **Rückdeckel:** nur Papierfarbe, keine Textfelder (wie Swiss-Minimal).

## Rollen im SVG

| Rolle | Verwendung |
|--------|------------|
| **color1** | Hauptband (`deco-band-main`); Titel/Name auf U1 (Platzhalter Slate). |
| **color2** | Schmaler Streifen oben (`deco-band-accent`), Haarlinie (`deco-band-hairline`), Untertitel, Name auf dem Buchrücken. |

## Vorschlag — C-01 Oxford Navy & Gold (SKILL_02)

| | Bezeichnung | Hex |
|--|-------------|-----|
| Farbe 1 | Oxford Navy | `#14283D` |
| Farbe 2 | Gold | `#D4AF37` |

**Kodierung:** UTF-8; Umlaute im SVG als XML-Entities wo nötig.

**Schritte:** Farbpaare in Supabase → Dashboard/Preflight → Upload Gruppe **`hardcover_modern`** → Template-Zuordnung.
