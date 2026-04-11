---
name: svg-buchdecken-technik-core
description: CORE MODULE. Strict technical rules for web2print SVG templates (Hardcover A4). Enforces dimensions, layer structures, element IDs, kaschiersicherheit, Bounding Boxes (BBox), and Supabase color-selectors.
---

# SVG-Buchdecken: Technisches Fundament (CORE)

Dieses Modul definiert die kompromisslosen technischen Regeln für Hardcover-Templates (DIN A4).

## 1. DOKUMENTMASZE & KOORDINATEN (Hardcover A4)
Alle Werte in mm (1 SVG-Einheit = 1 mm).
* Arbeitsfläche: width="500mm" height="330mm" | viewBox="0 0 500 330"
* Zentrum: x = 250
* Spine (Rücken): 35 mm breit (x = 232.5 bis 267.5)
* Falz (Gelenk): 8 mm breit (Links: 224.5 bis 232.5 | Rechts: 267.5 bis 275.5)
* Pappenhöhe: 302 mm (Y-Einschlag/Bleed: 14 mm oben/unten)
* Pappenbreite U1/U4: 215 mm (X-Einschlag/Bleed: 9.5 mm links/rechts)
* U1-Sicherheitszone: Text auf U1 muss zwingend nach dem Falz beginnen (MINDESTENS ab x=290).

## 2. PAPPEN-GUIDES (PFLICHT)
Jedes Template MUSS folgende unsichtbare Gruppe zur KI- und Editor-Orientierung enthalten (ersetzt die alten Magenta-Linien):

<g id="guide-pappen" style="fill:none;stroke:none;">
  <rect id="guide-pappe-u4" x="9.5" y="14" width="215" height="302" />
  <rect id="guide-falz-left" x="224.5" y="14" width="8" height="302" />
  <rect id="guide-pappe-spine" x="232.5" y="14" width="35" height="302" />
  <rect id="guide-falz-right" x="267.5" y="14" width="8" height="302" />
  <rect id="guide-pappe-u1" x="275.5" y="14" width="215" height="302" />
</g>

## 3. STRUKTUR & WEB2PRINT LOGIK
* Codierung: Zwingend UTF-8. Umlaute direkt schreiben (ä, ö, ü).
* Layers: 3 Gruppen erforderlich -> id="layer-back", id="layer-spine", id="layer-front".
* Element-IDs: Ausfüllbare Felder zwingend mit "tpl-" beginnen (z.B. tpl-title). U4 (Back) bleibt TEXTFREI!
* Farben: "colorselector='color1'" (Primär) oder "colorselector='color2'" (Akzent) auf Elementen nutzen.
* Zeilenabstand: y-Differenz bei <tspan> ist max. 1.2 bis 1.3-fache der font-size.

## 4. AUTO-SKALIERUNG (BBOX)
* Alle BBox-Rechtecke MÜSSEN in den <defs>-Block. (Unsichtbar: fill:none;stroke:none).
* ID-Format: [Element-ID]_bbox (z.B. tpl-title_bbox).
* Die BBox definiert den maximalen Rahmen für den Text. Er darf niemals in den Falz (x < 275.5) oder den Einschlag ragen.
Die Box sollte so gross gewähltsein, dass ausreichend reserve vorhanden ist. erst wenn diese aufgebraucht wurde greift dann die skalierung.

## 5. PRODUKTIONSSICHERHEIT (KASCHIERUNG & SPINE)
* Kaschier-Sicherheit: Harte Farbwechsel dürfen NIEMALS exakt auf den Spine-Kanten (232.5 oder 267.5) liegen. Entweder durchlaufende Farbbänder nutzen oder den Hintergrund optisch über den Falz hinaus in die U1 ziehen (z.B. bis x=295).
* **Spine-Text (`#tpl-group-spine`, alle `<text id="tpl-*-spine">`):**
  * **Pflicht:** `dominant-baseline="central"` auf jedem Rücken-`<text>`-Element. Ohne dieses Attribut bezieht sich `y` auf die **alphabetische Baseline** — nach `rotate(-90, …)` liegt diese dann auf der Rückenmittellinie (x≈250), die optische Mitte der Zeile **nicht**. Mit `central` liegt der Referenzpunkt `(x, y)` an der **optischen Mitte** der Zeile (vor der Drehung), passend zu Mittelmarken und Layout.
  * **Quer zur Spine (waagerecht vor Drehung):** `text-anchor="middle"` empfohlen, damit die Zeile um x=250 zentriert ist; `start`/`end` nur bei bewusstem asymmetrischen Layout.
  * **Drehung:** `transform="rotate(-90, 250, y)"` mit demselben `(250, y)` wie `x`/`y` des Textes (Drehzentrum = Ankerpunkt).
  * Leserichtung „von unten nach oben“ wie bisher über Positionen der drei Felder (Titel / Name / Jahr), nicht über `text-anchor="start"` erzwingen.

---

## CD/DVD-Label (nicht Buchdecken)

Gilt **nicht** für dieses CORE-Modul (500×330 mm). **Separates Skill:** [`SKILL_03_CD_LABEL_TECHNICAL.md`](SKILL_03_CD_LABEL_TECHNICAL.md) (Maße brutto, Kreis, `clipPath`), bei optischer Ableitung aus einem Cover: [`SKILL_CD_LABEL_FROM_COVER_SOURCE.md`](SKILL_CD_LABEL_FROM_COVER_SOURCE.md). SSOT: [`../SSOT_SVG_COVER_TEMPLATES.md`](../SSOT_SVG_COVER_TEMPLATES.md) Abschnitt 10.