# Farbvorschläge: `Template_Modern_Scholar.svg`

Archetyp **L-02 Modern Scholar** (SKILL_02), Palette-Referenz **C-03 Slate & Coral**. Schriften: **Montserrat** (Titel, Rücken-Titel), **Inter** (Metadaten, Rücken).

**Abgrenzung zu Swiss (L-05):** Kein vertikaler Balken auf U1; stattdessen schmales **Top-Band** und kurze **Kapitellinie** nur über die Textspalte. Vorderseitentexte beginnen bei **x = 312** (vollständig auf der hellen U1-Fläche ab x = 295, nicht im Übergriff). **Kein Rückseitentext** (kein Abstract) — wie bei `Template_Swiss_Editorial.svg`.

## Rollen im SVG

| Rolle | Verwendung |
|--------|------------|
| **color1** | Fläche U4+Spine+Übergriff (`bg-u4-spine-ms`); Titel und Name auf U1. |
| **color2** | Top-Band (`deco-ms-topband`), Kapitellinie (`deco-ms-capline`), Untertitel-Stil, Name auf dem Buchrücken. |

Nach Anlage in Supabase ersetzen die gewählten RGB-Werte die Platzhalter über `colorselector`.

## Vorschlag 1 — C-03 (empfohlen)

| | Bezeichnung | Hex |
|--|-------------|-----|
| Farbe 1 | Slate | `#2C3539` |
| Farbe 2 | Coral | `#E06D53` |

## Vorschlag 2 — C-05 (kühler)

| | Bezeichnung | Hex |
|--|-------------|-----|
| Farbe 1 | Cobalt | `#0047AB` |
| Farbe 2 | Ice-Akzent | `#00ACC1` |

(Hellblau wirkt hier als Akzent auf hellem U1; ggf. Kontrast im Dashboard prüfen.)

## Vorschlag 3 — C-06 Monolith

| | Bezeichnung | Hex |
|--|-------------|-----|
| Farbe 1 | Monolith | `#1A1A1A` |
| Farbe 2 | Silber-Akzent | `#A9A9A9` |

---

**Layout:** Inhalt auf U1 ab **x = 312** (sicher auf der hellen Fläche; Stil-Skill: ≥ 290 bezogen auf die Falzsicherheit), **Negativraum** zum rechten Buchschnitt hin.

**Kodierung:** SVG **UTF-8** (`encoding="UTF-8"`), Umlaute als Unicode (siehe SKILL_01).

**Deine Schritte:** Farbpaar(e) in Supabase anlegen → SVG im Dashboard prüfen → Upload mit Gruppe **`hardcover_modern`** → **Template-Zuordnung** (mindestens ein Farbpaar).
