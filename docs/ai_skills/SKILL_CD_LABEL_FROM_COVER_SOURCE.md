---
name: svg-cd-label-from-cover-source
description: Leitet aus einem bestehenden Buchdecken-SVG (Quelle) ein optisch passendes CD-Label-SVG ab. Nutzt Farben/Typografie-Logik der Vorlage, kreisförmige Darstellung, SKILL_03 für Maße und Maske.
---

# CD-Label aus Buchdecken-Quell-SVG ableiten

**Zweck:** Aus einem **fertigen Buchdecken-Template** (oder einer exportierten Variante daraus) ein **zweites SVG** erzeugen, das als Template in **`gruppe = cd_label`** in Supabase landet und im Webshop mit **dieselben Farbpaare** wie das zugehörige Buchdecken-Template funktioniert.

**Pflicht vorab:** [`SKILL_03_CD_LABEL_TECHNICAL.md`](SKILL_03_CD_LABEL_TECHNICAL.md) (Maße 140 mm brutto, Trim-Kreis r=60, `clipPath`).

**SSOT:** [`SSOT_SVG_COVER_TEMPLATES.md`](../SSOT_SVG_COVER_TEMPLATES.md).

---

## 1. Eingabe (Quell-SVG)

Typisch: Vollumschlag **500 × 330 mm**, mit `tpl-*`-IDs, `colorselector`, `layer-front` / U1-Bereich.

**Was du übernimmst (konzeptionell):**

- **Farblogik:** dieselben `colorselector`-Rollen und ggf. Flächenfarben wie auf **U1** (Vorderdeckel), vereinfacht auf den CD-Radius.
- **Typografie:** Schriftfamilien, -gewichte und Hierarchie **echoen** (Titel > Name > Jahr), aber **weniger Text** — der CD-Ring ist klein; keine Spine-Elemente.
- **Logo:** wenn `tpl-logo-main` auf dem Cover existiert, auf dem CD **ein** Logo-Platz (`rect` mit `id^="tpl-logo"`) vorsehen, Position z. B. oben im Kreis oder zentriert, nicht kleiner als ca. **8 mm** Lesbarkeit nach Beschnitt prüfen.

**Was du nicht 1:1 kopierst:**

- Rücken, Falz, U4, volle Breite 500 mm.
- Mehrzeilige Blöcke nur, wenn `data-max-lines` und BBox den Platz im Kreis erlauben.

---

## 2. Arbeitsablauf (Schritte)

1. **Quelle analysieren:** U1-Gruppe (`#tpl-group-u1` oder `layer-front`) — welche `tpl-*`-Felder sind primär? Farben `color1`/`color2` notieren.
2. **Neues Dokument:** `viewBox="0 0 140 140"` (siehe SKILL_03).
3. **Trim-Maske anlegen:** `<clipPath id="cd-trim"><circle cx="70" cy="70" r="60"/></clipPath>`.
4. **Hintergrund:** Kreis oder Fläche **innerhalb** der Maske; Farben über `colorselector` oder Flächen wie im Cover-U1.
5. **Texte:** Nur die für CD sinnvollen IDs wiederverwenden (z. B. `tpl-title`, `tpl-name`, `tpl-year`) — **neu positionieren** auf Kreisbahn oder zentriert; `data-label` setzen; BBox in `<defs>`.
6. **Clip anwenden:** Sichtbare Inhalte unter `<g clip-path="url(#cd-trim)">`.
7. **Optional:** Äußere **Hilfslinien** (`guide-*`, `data-editor="guide"`) für die **140×140**-Fläche und den Kreis r=60 — im Webshop werden `guide-*` entfernt (wie bei Cover).
8. **Validierung:** UTF-8, keine Legacy-IDs `front-text-*`; Preflight im Dashboard.
9. **Upload:** Supabase, **`gruppe = cd_label`**, Dateiname **`{gleicher_Basisname_wie_Cover}_CDLABEL.svg`**; siehe [`CD_LABEL_NAMING_AND_ASSIGNMENT.md`](../CD_LABEL_NAMING_AND_ASSIGNMENT.md). Dem **Buchdecken-Template** zuordnen (**CD-Label-Zuweisung**) oder Fallback **`DEFAULT_CDLABEL.svg`** in `cd_label` hochladen.

---

## 3. Optische Kohärenz (Checkliste)

| Kriterium | Frage |
|-----------|--------|
| Farben | Entspricht die CD den color1/color2-Rollen des Covers? |
| Typo | Gleiche Font-Familie wie U1-Titel/Name, wo möglich? |
| Dichte | Kein Text im äußeren 5–10 mm-Rand (Beschnitt)? |
| Maske | Wirkt die Vorschau **kreisrund** (Clip aktiv)? |
| Editor | Alle editierbaren Felder haben `tpl-` + BBox? |

---

## 4. Abgrenzung zu Style-Skills (L-01 … L-05)

Die **Archetypen** beschreiben **Buchdecken-Layouts**. Für CD-Labels:

- Entweder **kurz** in der Cover-Style-Datei einen Unterabschnitt „CD-Abkömmling“ ergänzen **oder**
- hier bei der Ableitung **nur** U1-Ästhetik spiegeln, ohne neue Archetyp-Nummer zu erzwingen.

---

## 5. Ausgabe

- **Eine** SVG-Datei, bereit für `Templates/ai_generated/` oder direkten Upload nach **`cd_label`**.
- Optional begleitende **`.md`** mit Farb-Hex-Hinweisen (wie bei Cover-KI), keine Ersetzung für Supabase-Farbpaare.
