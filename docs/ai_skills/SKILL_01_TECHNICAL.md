name: svg-buchdecken-technik-core
description: CORE MODULE. Strict technical rules for web2print SVG templates. Enforces dimensions, layer structures, element IDs, kaschiersicherheit, Bounding Boxes (BBox) for auto-scaling typography, and Supabase color-selector mapping.

SVG-Buchdecken: Technisches Fundament & Web2Print (CORE)

Dieses Modul definiert die technischen Leitplanken für den bamadi.de HardcoverEditor.

1. DOKUMENTSPEZIFIKATIONEN & MASZE

1.1 Hardcover-Buchdecke (Vollumschlag: U4 + Spine + U1)

Dokument: 500 × 330 mm

viewBox: exakt 0 0 500 330 (1 unit = 1 mm)

Spine (Rücken): 30 mm breit, zentriert bei x=250. (Kanten: x=235 und x=265).

U4 (Rückseite): x=0 ... 235

U1 (Vorderseite): x=265 ... 500

1.2 Sicherheitszonen & Falz-Gelenk (KRITISCH)

Außenrand: 15 mm zu allen Kanten.

Spine-Innen: 1,5 mm Abstand zu den Spine-Kanten (Text auf Spine).

GELENK (FALZ) auf U1: Der Bereich x=265 bis x=275 auf U1 knickt beim Öffnen ein! Linksbündiger Text auf U1 muss MINDESTENS bei x=290 beginnen.

1.3 Sichtbereich-Rahmen (PFLICHT)

Jedes Template MUSS folgende Gruppe (als Produktionsvorschau) enthalten:

<g id="guide-sichtbereich" style="opacity:0.4">
  <rect x="15" y="15" width="212" height="300" style="fill:none;stroke:#FF00FF;stroke-width:0.3" />
  <rect x="235" y="15" width="30" height="300" style="fill:none;stroke:#FF00FF;stroke-width:0.3" />
  <rect x="273" y="15" width="212" height="300" style="fill:none;stroke:#FF00FF;stroke-width:0.3" />
</g>


2. WEB2PRINT-LOGIK: IDS, BBOX & SKALIERUNG

2.1 Element-IDs (tpl-)

Alle ausfüllbaren Felder MÜSSEN mit tpl- beginnen (z.B. tpl-title).

Pflicht-Attribute auf Text-Nodes: data-label="[Feldname]" und colorselector="color1" (oder color2).

Mehrzeilige Texte (Topic): data-multiline="true" data-max-lines="4".

2.2 Bounding Boxes (BBox) für Auto-Skalierung (KRITISCH)

Ort: Alle BBox-Rechtecke MÜSSEN im <defs>-Block des SVGs abgelegt werden. Sie sind unsichtbar.

ID-Konvention: Die ID der Box muss exakt [Element-ID]_bbox lauten (z.B. tpl-title_bbox).

Positionierung: Die BBox (x, y, width, height) definiert den maximalen Raum, den der Text einnehmen darf.

Tspan-Abstand: Die y-Differenz zweier <tspan> Zeilen ist exakt das 1,2- bis 1,3-fache der font-size.

3. SUPABASE FARB-MAPPING (colorselector)

Die SVGs enthalten keine finalen "Hardcoded"-Farben. Das Attribut colorselector="[ID]" steuert die Farbzuweisung.

color1 (Primär): Große Hintergrundflächen, dicke Balken.

color2 (Akzent): Dünne Linien, Divider, Highlights.

Kein Selector (Festwert): Texte auf sehr dunklen Flächen (color1) benötigen KEINEN Selector, sondern bekommen fest fill:#FFFFFF oder Off-White, da Supabase dies via text_on_color1_rgb regelt.

4. PRODUKTIONSSICHERHEIT (KASCHIERUNG & SPINE)

4.1 Kaschier-Sicherheit (Keine harten Kanten am Gelenk)

Harte Farbwechsel dürfen NIEMALS exakt auf den Spine-Kanten (x=235 oder x=265) liegen!

Optischer Übergriff: Dunkle Spine-Farbe reicht bis weit auf U1 (z.B. x=295). Text auf U1 beginnt erst danach (z.B. x=315).

Durchlaufendes Band: Horizontale Farbstreifen laufen komplett durch (x=0, width=500).

4.2 Spine-Verankerung (text-anchor="start")

Leserichtung: Aufsteigend (transform="rotate(-90, 250, [Y-Startpunkt])").

Verankerung: Zwingend text-anchor="start". Text wächst nach OBEN. Dadurch wird ein konstanter Schutzraum nach UNTEN garantiert.