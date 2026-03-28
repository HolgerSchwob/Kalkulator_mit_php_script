# SVG-Personalisierungssystem – Pflichtenheft
**bamadi.de / Schwob Digitaldruck**  
Stand: März 2026 | Cursor-Implementierungsdokument

---

## 0. Kontext & Ziel

Dieses Dokument beschreibt das vollständige SVG-Personalisierungssystem für Hardcover-Templates. Es ersetzt und konsolidiert alle bisherigen Einzeltools (SVG-Productioner, Preview-Overlay-Editor, SVG-Template-Preflight, Inkscape-to-Editor).

**Der vollständige Workflow:**

```
1. INKSCAPE (reines Design)
   └─ Ergebnis: Inkscape-SVG mit Layern Front / Spine / Back

2. PERSONALISIERUNGSEDITOR (neues Tool, dieses Pflichtenheft)
   ├─ Lädt Inkscape-SVG
   ├─ Zieht Schema-Definitionen aus Supabase
   ├─ Labels, Farbrollen, Zonen werden den Elementen zugewiesen
   ├─ Speichert: INKSCAPE-SVG (angereichert, weiterhin editierbar)
   └─ Speichert: PRODUKTION-SVG (schlank, Google Fonts @import, kein Inkscape-Namespace)

3. HARDCOVER-EDITOR (bestehend, Kundenseite)
   └─ Liest Produktion-SVG + Schema aus Supabase → baut Formularfelder
```

**Grundprinzip SSOT:**  
Alle Schema-Definitionen (Element-IDs, Feldbezeichnungen, Mustertexte, Farbpaletten) leben in Supabase. Sowohl der Personalisierungseditor (intern) als auch der HardcoverEditor (Kundenseite) greifen auf dieselben Tabellen zu.

---

## 1. Namenskonventionen (unveränderlich)

### 1.1 Element-IDs im SVG

Format: `{layer}-{typ}-{name}`

| Layer-Prefix | Bedeutung |
|---|---|
| `front-` | Vorderseite |
| `spine-` | Rücken |
| `back-` | Rückseite |

| Typ | Verwendung |
|---|---|
| `text-` | Textelement |
| `img-` | Bild/Logo-Zone |
| `zone-` | Positionierungszone (unsichtbar, nur Bounding Box) |
| `bg-` | Hintergrundfläche (kein Formularfeld) |
| `deco-` | Dekoration (kein Formularfeld) |

**Beispiele:**
```
front-text-title
front-text-author
front-text-degree
front-text-university
front-img-logo
spine-text-title
spine-text-author
back-text-abstract
front-bg-main
front-deco-line
```

### 1.2 Layer-Namen in Inkscape

Exakt diese drei Namen verwenden – Groß-/Kleinschreibung egal, wird normalisiert:

```
Front   (oder: Vorderseite, Deckel)
Spine   (oder: Rücken, Ruecken)
Back    (oder: Rückseite, Rueckseite)
```

Der Postprocessor erkennt diese automatisch und schreibt `data-layer="front"` / `"spine"` / `"back"` auf das jeweilige `<g>`-Element.

### 1.3 data-Attribute im SVG

| Attribut | Wert | Beschreibung |
|---|---|---|
| `data-label` | `front-text-title` | Verknüpfung mit Schema-Element-ID |
| `data-layer` | `front` / `spine` / `back` | Automatisch aus Inkscape-Layer |
| `data-color-role` | `color-1` / `color-2` | Farbrolle für Kundenpersonalisierung |
| `data-placeholder` | `„Meine Bachelorarbeit..."` | Mustertext (aus Schema, wird eingefügt) |

---

## 2. Supabase-Schema (neue Tabellen)

### 2.1 `cover_schema_elements` – Das Vokabular aller personalisierbaren Felder

```sql
CREATE TABLE cover_schema_elements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id      text UNIQUE NOT NULL,   -- z.B. "front-text-title"
  label           text NOT NULL,          -- z.B. "Titel der Arbeit"
  placeholder     text NOT NULL DEFAULT '', -- Mustertext für Tests & Fallback
  element_type    text NOT NULL CHECK (element_type IN ('text','image','zone')),
  required        boolean NOT NULL DEFAULT false,
  layer           text CHECK (layer IN ('front','spine','back','any')),
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Index für häufige Abfragen
CREATE INDEX ON cover_schema_elements (element_type, active);

-- Trigger: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql;

CREATE TRIGGER cover_schema_elements_updated_at
  BEFORE UPDATE ON cover_schema_elements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Initial-Daten:**
```sql
INSERT INTO cover_schema_elements (element_id, label, placeholder, element_type, required, layer, sort_order) VALUES
  ('front-text-title',      'Titel der Arbeit',        'Auswirkungen der Digitalisierung auf...', 'text', true,  'front', 10),
  ('front-text-subtitle',   'Untertitel',              'Eine empirische Untersuchung',              'text', false, 'front', 20),
  ('front-text-author',     'Autor / Verfasser',       'Max Mustermann',                           'text', true,  'front', 30),
  ('front-text-degree',     'Studiengang / Abschluss', 'Bachelorarbeit Wirtschaftsinformatik',     'text', false, 'front', 40),
  ('front-text-university', 'Hochschule',              'Hochschule Fulda',                         'text', false, 'front', 50),
  ('front-text-year',       'Jahr',                    '2024',                                     'text', false, 'front', 60),
  ('front-img-logo',        'Logo (Hochschule)',       '',                                          'image',false, 'front', 70),
  ('spine-text-title',      'Rücken: Titel',           'Auswirkungen der Digitalisierung',         'text', false, 'spine', 80),
  ('spine-text-author',     'Rücken: Autor',           'Mustermann',                               'text', false, 'spine', 90),
  ('spine-text-year',       'Rücken: Jahr',            '2024',                                     'text', false, 'spine', 100),
  ('back-text-abstract',    'Kurzfassung (Rückseite)', 'Kurze Beschreibung der Arbeit...',         'text', false, 'back',  110);
```

---

### 2.2 `cover_color_palettes` – Farbpaletten

```sql
CREATE TABLE cover_color_palettes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,      -- z.B. "Schwob Dunkelblau"
  hex         text NOT NULL,      -- z.B. "#1A3A5C"
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

**Hinweis:** Falls bereits eine Farbtabelle im System existiert (z.B. `shop_config`-Farbdaten), diese Migration entsprechend anpassen oder die bestehende Tabelle erweitern. Sonst diese neue Tabelle verwenden.

---

### 2.3 Erweiterung `cover_templates` – Farbrollen pro Template

```sql
-- Farbzuweisungen pro Template (color-1, color-2)
ALTER TABLE cover_templates
  ADD COLUMN IF NOT EXISTS color_1_palette_id uuid REFERENCES cover_color_palettes(id),
  ADD COLUMN IF NOT EXISTS color_2_palette_id uuid REFERENCES cover_color_palettes(id);
```

---

### 2.4 Lösch-Sicherheit: Verwendungs-Check

Vor dem Löschen eines `cover_schema_elements`-Eintrags muss geprüft werden, ob das `element_id` in irgendeiner Produktion-SVG in Storage verwendet wird. Das geschieht über eine Edge Function (siehe Abschnitt 4).

**Einfachste pragmatische Lösung:** `active = false` statt physischem Löschen. Physisches Löschen nur wenn `active = false` bereits seit > 30 Tagen und kein Template das element_id referenziert.

---

## 3. Personalisierungseditor – Spezifikation

Der Editor ist ein **Dashboard-internes Tool** (iframe in `TOOL_URLS` oder eigene Route `dashboard.html#tool-svg-editor`). Vanilla JS, kein Framework, konsistent mit bestehender Codebasis.

### 3.1 Architektur

```
dashboard-svg-editor.html   ← Einstieg (eigenständige HTML-Seite)
dashboard-svg-editor.js     ← Hauptlogik
dashboard-svg-editor.css    ← Styling (bamadi Darkmode, konsistent mit Dashboard)
```

Lädt Schema und Farbpaletten beim Start via bestehende Edge Function `get-shop-config` oder neue `get-cover-schema` (siehe Abschnitt 4).

### 3.2 Tabs / Bereiche

```
┌─────────────────────────────────────────────────────────┐
│  bamadi SVG-Editor  [SVG laden]              [↓ Editor] [↓ Produktion] │
├──────────────┬──────────────────────────────────────────┤
│              │  [Elemente] [Farben] [Schema] [Preflight] [Export]       │
│  SVG         │                                          │
│  Preview     │  Inhalte des gewählten Tabs              │
│  (klickbar)  │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### 3.3 Tab: Elemente

- Listet alle interessanten SVG-Elemente (Text, Formen mit Füllung, Bilder)
- Gruppen/Layer werden als **nicht-editierbare Trennzeilen** dargestellt (Front / Spine / Back)
- Filter: Alle | Text | Formen | Ohne Label
- Klick auf Element → Hervorhebung im SVG-Preview (goldener Outline)
- Klick im SVG-Preview → springt in Elementliste
- Pro Element editierbar:
  - **ID** (Freitext, soll Konvention folgen – Validierung zeigt Warnung wenn nicht)
  - **data-label** (Dropdown: aus `cover_schema_elements` geladen, nicht hardcodiert)
  - Die gewählte Kombination zeigt sofort den zugehörigen `placeholder`-Text aus dem Schema

### 3.4 Tab: Farben

- Alle eindeutigen Füllfarben als Swatches mit Häufigkeit
- Swatch anklicken → markiert Elemente dieser Farbe in der Elementliste
- Dropdown pro Farbe: `— fest —` / `color-1 (Hauptfarbe)` / `color-2 (Akzentfarbe)`
- Schreibt `data-color-role` auf alle betroffenen Elemente beim Export
- Zusätzlich: Farbvorschau gegen die Template-Farbpalette (aus `color_1_palette_id`)

### 3.5 Tab: Schema (NEU – Schlüsselfeature)

**Dieser Tab ist der Schema-Manager = Ersatz für XML-Editor-Pflege.**

Zwei Unter-Tabs:

#### 3.5.1 Sub-Tab: Felder

Tabelle aller `cover_schema_elements`, editierbar:

| Spalte | Editierbar | Beschreibung |
|---|---|---|
| element_id | Ja (bei Neuanlage) | `front-text-title` etc. |
| label | Ja | Feldbezeichnung für Kunden |
| placeholder | Ja | Mustertext / Fallback |
| element_type | Ja | text / image / zone |
| required | Ja | Pflichtfeld ja/nein |
| layer | Ja | front / spine / back / any |
| sort_order | Ja | Reihenfolge im Formular |
| active | Ja | An/aus |

Aktionen:
- **＋ Neu** → Inline-Zeile oder Modal
- **Bearbeiten** → Inline-Edit
- **Deaktivieren** → setzt `active = false` (kein echtes Löschen)
- **Löschen** → nur wenn `active = false` und kein Template referenziert (Check via Edge Function)

#### 3.5.2 Sub-Tab: Farbpaletten

Einfache Liste aller `cover_color_palettes`:

- Farbswatch | Name | Hex-Wert | Aktionen (Bearbeiten, Deaktivieren)
- ＋ Neue Farbe anlegen (Colorpicker + Name)

### 3.6 Tab: Preflight

Prüfungen (automatisch beim Laden und auf Anfrage):

| Prüfung | Typ |
|---|---|
| Pflichtfelder (`required=true`) aus Schema vergeben? | Fehler |
| Layer Front/Spine/Back erkannt? | Warnung wenn fehlt |
| Doppelte data-label-Vergabe? | Warnung |
| IDs folgen Namenskonvention? | Info |
| Farbrollen vergeben (mind. color-1)? | Info |
| Schema-Elemente die im SVG NICHT vorkommen | Info |

### 3.7 Tab: Export / Template

- **Google Fonts URL** (Textfeld, vorausgefüllt)
- **↓ Editor-SVG** exportieren (mit Inkscape-Metadaten, angereichert)
- **↓ Produktion-SVG** exportieren (schlank, Google Fonts @import)
- **Template in Supabase speichern** (optional, für direkte Upload-Integration):
  - Uploadet Produktion-SVG in Storage-Bucket `cover-templates`
  - Erstellt/Updated Eintrag in `cover_templates` Tabelle
  - Verknüpft Farbpaletten (`color_1_palette_id`, `color_2_palette_id`)

---

## 4. Edge Functions (neu)

### 4.1 `get-cover-schema`

```typescript
// GET – Gibt alle aktiven Schema-Elemente + Farbpaletten zurück
// Kein Admin-Secret erforderlich (wird auch von Kundenseite genutzt)
// Response:
{
  elements: CoverSchemaElement[],
  palettes: CoverColorPalette[]
}
```

Wird von:
- Personalisierungseditor (intern, beim Start)
- HardcoverEditor (Kundenseite, beim Laden eines Templates)

### 4.2 `update-cover-schema`

```typescript
// POST mit x-admin-secret Header
// Operationen: create | update | deactivate
// Body: { operation, element: CoverSchemaElement }
// Führt Lösch-Sicherheitscheck durch (prüft cover_templates Storage auf Verwendung)
```

### 4.3 `update-cover-palettes`

```typescript
// POST mit x-admin-secret Header  
// Operationen: create | update | deactivate
// Body: { operation, palette: CoverColorPalette }
```

---

## 5. SVG-Verarbeitungslogik (Postprocessor)

### 5.1 Layer-Erkennung (automatisch, keine Benutzeraktion nötig)

```javascript
// Beim Laden der SVG:
function detectLayer(el) {
  const inkLabel = el.getAttributeNS(INK_NS, "label") || "";
  const isLayer = el.getAttributeNS(INK_NS, "groupmode") === "layer";
  if (!isLayer) return null;
  const normalized = inkLabel.toLowerCase().replace(/ü/g,"ue").replace(/ä/g,"ae");
  if (["front","vorderseite","deckel"].some(s => normalized.includes(s))) return "front";
  if (["spine","ruecken","rücken"].some(s => normalized.includes(s))) return "spine";
  if (["back","rueckseite","rückseite"].some(s => normalized.includes(s))) return "back";
  return null;
}
```

Layer-`<g>` werden in der Elementliste als **nicht-klickbare Trennzeilen** dargestellt (z.B. `── FRONT ──`). Der Benutzer muss sich nicht um Gruppen kümmern.

### 5.2 Editor-SVG Output

Was bleibt erhalten:
- Alle Inkscape-Namespaces und Attribute
- `<metadata>`, `<sodipodi:namedview>` 
- Alle originalen Stile und Transformationen

Was wird hinzugefügt/geändert:
- `data-label` auf Elemente mit Zuweisung
- `data-layer` auf Layer-`<g>` Elemente (aus Inkscape-Label)
- `data-color-role` auf Elemente mit Farbrollenzuweisung
- `id` wird angepasst wenn manuell geändert

### 5.3 Produktion-SVG Output

Was wird entfernt:
- `inkscape:*` Attribute
- `sodipodi:*` Attribute  
- `xmlns:inkscape`, `xmlns:sodipodi`, `xmlns:dc`, `xmlns:cc`, `xmlns:rdf`
- `<metadata>` Element komplett
- `<sodipodi:namedview>` Element komplett
- `data-uid` (internes Verarbeitungs-Attribut)

Was wird hinzugefügt:
- `<style>@import url('GOOGLE_FONTS_URL');</style>` als erstes Kind von `<svg>`

Was bleibt:
- `data-label`, `data-layer`, `data-color-role`, `data-placeholder` ← der HardcoverEditor braucht diese
- `viewBox`, alle IDs, alle Formen, Farben, Transformationen

---

## 6. Integration in bestehendes Dashboard

### 6.1 TOOL_URLS in `dashboard-state.js`

```javascript
export const TOOL_URLS = {
  // ... bestehende Tools ...
  svgEditor: "./dashboard-svg-editor.html",  // NEU
};
```

### 6.2 Navigation

Im Dashboard unter **Einstellungen → Templates → SVG-Editor** verlinken (iframe oder neuer Tab, je nach Präferenz).

### 6.3 Authentifizierung

Der SVG-Editor liest `adminSecret` aus `dashboard.config.json` (wie alle anderen Dashboard-Tools) und nutzt ihn für Schema-Update-Calls.

---

## 7. HardcoverEditor – Anpassungen (bestehend)

### Grundprinzip: SVG bleibt Source of Truth für Felder

Der bestehende SVG-Scan-Mechanismus bleibt **vollständig unverändert**:
- `editor.mjs` scannt das Template-SVG nach `data-label`-Attributen
- Daraus werden die Formularfelder gebaut
- localStorage-Synchronisation zwischen Templates bleibt wie sie ist

Das Schema in Supabase ist **nur ein Lookup** für bessere Anzeige — kein Ersatz für die SVG-getriebene Feldlogik.

### 7.1 Schema als optionaler Lookup

```javascript
// Einmalig beim Start laden (einmal pro Session, gecacht)
let schemaLookup = {};
try {
  const schema = await fetch('/api/get-cover-schema').then(r => r.json());
  schemaLookup = Object.fromEntries(schema.elements.map(e => [e.element_id, e]));
} catch (e) { /* Schema nicht verfügbar → kein Problem, Fallback greift */ }

// Beim Bauen eines Formularfelds aus data-label:
const elementId = svgEl.getAttribute('data-label');  // z.B. "front-text-title"
const schemaDef = schemaLookup[elementId];

// Anzeige:
const displayLabel    = schemaDef?.label       ?? elementId;      // Fallback: ID selbst
const displayPlaceholder = schemaDef?.placeholder ?? '';          // Fallback: leer
```

**Verhalten:**
- Schema vorhanden → schöner Label-Text + Mustertext
- Schema nicht vorhanden / unbekannte ID → `element_id` als Label, leerer Placeholder
- Kein Refactoring, kein Breaking Change, localStorage-Logik unberührt

### 7.2 Mustertext als SVG-Vorschau

`data-placeholder` wird vom Personalisierungseditor beim Export in die Produktion-SVG geschrieben (identisch mit `schemaDef.placeholder`). Der HardcoverEditor kann diesen direkt aus dem SVG lesen — ohne Schema-Lookup — als Live-Vorschau wenn der Kunde noch nichts eingegeben hat.

```javascript
// Fallback-Kette für Vorschautext:
// 1. Kundeneingabe (localStorage)
// 2. data-placeholder aus SVG-Attribut
// 3. Leer
const previewText = customerInput 
  || svgEl.getAttribute('data-placeholder') 
  || '';
```

### 7.3 Farbpersonalisierung (spätere Ausbaustufe)

`data-color-role="color-1"` Elemente können mit Kundenfarbe überschrieben werden. Infrastruktur ist durch den Postprocessor vorbereitet — Implementierung im HardcoverEditor erst wenn Farbwahl im Shop gewünscht.

---

## 8. Cursor-Implementierungsplan

### Phase 1 – Supabase-Grundlage (ohne Frontend)

**Aufgaben für Cursor:**

1. Migration `cover_schema_elements` anlegen (SQL aus Abschnitt 2.1)
2. Initial-Daten einfügen (INSERT-Statement aus Abschnitt 2.1)
3. Migration `cover_color_palettes` anlegen (Abschnitt 2.2)
4. `cover_templates` Tabelle um Farbpaletten-Felder erweitern (Abschnitt 2.3)
5. Edge Function `get-cover-schema` anlegen (Abschnitt 4.1)
6. Edge Function `update-cover-schema` anlegen (Abschnitt 4.2)
7. Edge Function `update-cover-palettes` anlegen (Abschnitt 4.3)

**Cursor-Prompt Phase 1:**
```
Implementiere die Supabase-Migrationen und Edge Functions aus SVG-PERSONALISIERUNG-PFLICHTENHEFT.md, 
Abschnitte 2.1 bis 2.3 und 4.1 bis 4.3.

Beachte:
- Projektroot: `Kalkulator 130226/`
- Edge Functions liegen in `supabase/functions/`
- Admin-Secret-Prüfung wie in bestehenden Edge Functions (`x-admin-secret` Header)
- TypeScript + Deno, wie alle anderen Edge Functions im Projekt
- Keine Änderungen an bestehenden Tabellen außer der ALTER TABLE in 2.3
```

---

### Phase 2 – SVG-Editor Grundgerüst

**Aufgaben für Cursor:**

1. `dashboard-svg-editor.html` anlegen (Grundstruktur, lädt Edge Function `get-cover-schema`)
2. SVG-Parsing-Logik: Layer-Erkennung, Element-Extraktion (Abschnitte 5.1, 1.1)
3. SVG-Preview mit Click-Handler
4. Tab: Elemente – Liste + Inline-Edit (data-label aus Schema-Dropdown)
5. Tab: Farben – Swatches + Rollenzuweisung
6. Export: Editor-SVG + Produktion-SVG (Abschnitte 5.2, 5.3)

**Cursor-Prompt Phase 2:**
```
Baue `dashboard-svg-editor.html` und `dashboard-svg-editor.js` als neues Dashboard-Tool gemäß 
SVG-PERSONALISIERUNG-PFLICHTENHEFT.md Abschnitte 3.1 bis 3.4 und 5.1 bis 5.3.

Technologie: Vanilla JS (kein Framework, kein Build-Tool), ES-Module konsistent mit dashboard-main.js.
Auth: adminSecret aus dashboard.config.json lesen, wie in dashboard-api.js.
Schema laden: via Edge Function `get-cover-schema` (keine hardcodierten Labels).
Styling: Konsistent mit bestehendem Dashboard-Design (dark theme, Navy/Gold).
SVG-Preview: Die SVG-Datei wird per FileReader eingelesen und als innerHTML in ein Container-div gesetzt.
Layer-Erkennung: Automatisch nach Inkscape-Konvention (Abschnitt 5.1), keine Benutzeraktion nötig.
```

---

### Phase 3 – Schema-Manager im Dashboard

**Aufgaben für Cursor:**

1. Tab: Schema → Sub-Tab Felder (CRUD für `cover_schema_elements`)
2. Tab: Schema → Sub-Tab Farbpaletten (CRUD für `cover_color_palettes`)
3. Lösch-Sicherheitscheck via Edge Function
4. Preflight-Tab (Abschnitt 3.6)

**Cursor-Prompt Phase 3:**
```
Erweitere `dashboard-svg-editor.js` um den Schema-Tab (Abschnitt 3.5) und Preflight-Tab (Abschnitt 3.6) 
aus SVG-PERSONALISIERUNG-PFLICHTENHEFT.md.

Schema-Tab: Inline-editierbare Tabelle für cover_schema_elements und cover_color_palettes.
CRUD via Edge Functions `update-cover-schema` und `update-cover-palettes`.
Deaktivieren statt Löschen (soft delete, active=false).
Physisches Löschen nur wenn Sicherheitscheck der Edge Function grünes Licht gibt.
```

---

### Phase 4 – HardcoverEditor: Schema-Lookup ergänzen

**Aufgaben für Cursor:**

1. `editor.mjs`: Einmaligen Schema-Lookup via `get-cover-schema` ergänzen
2. Label-Text und Placeholder aus Schema ziehen — SVG-Scanning und localStorage **nicht anfassen**

**Cursor-Prompt Phase 4:**
```
Ergänze in `editor.mjs` einen optionalen Schema-Lookup gemäß Abschnitt 7.1 aus 
SVG-PERSONALISIERUNG-PFLICHTENHEFT.md.

Wichtig:
- Der bestehende SVG-Scan nach data-label-Attributen bleibt vollständig unverändert
- Die localStorage-Synchronisation bleibt vollständig unverändert  
- Das Schema aus get-cover-schema wird nur für Label-Text und Placeholder-Text verwendet
- Fallback wenn Schema nicht verfügbar: element_id als Label, leerer Placeholder
- Kein Breaking Change, keine strukturellen Änderungen an editor.mjs
```

---

## 9. Offene Punkte & Entscheidungen

| # | Thema | Empfehlung | Entscheider |
|---|---|---|---|
| 1 | Template direkt aus Editor in Supabase hochladen? | Ja, als Phase-3-Feature (Tab Export) | Holger |
| 2 | Farbpersonalisierung durch Kunden (color-1/2 wählbar)? | Spätere Ausbaustufe, Infrastruktur ist vorbereitet | Holger |
| 3 | Löschstrategie: soft-delete reicht dauerhaft? | Soft-delete (active=false) reicht für bamadi-Scale | Holger |
| 4 | Welche bestehenden Tools werden ABGELÖST? | SVG-Productioner, Inkscape-to-Editor, Preflight → alle in neuem Editor | Holger |
| 5 | Schriften: Welcher Google Font Standard? | Playfair Display als Default, pro Template überschreibbar | Gemeinsam |

---

## 10. Datei-Übersicht nach vollständiger Implementierung

```
Kalkulator 130226/
├── dashboard-svg-editor.html          ← NEU
├── dashboard-svg-editor.js            ← NEU
├── dashboard-svg-editor.css           ← NEU (oder in bestehendes CSS)
├── dashboard-state.js                 ← TOOL_URLS erweitern
├── supabase/
│   ├── migrations/
│   │   ├── ..._cover_schema_elements.sql   ← NEU
│   │   ├── ..._cover_color_palettes.sql    ← NEU
│   │   └── ..._cover_templates_colors.sql  ← NEU (ALTER TABLE)
│   └── functions/
│       ├── get-cover-schema/              ← NEU
│       ├── update-cover-schema/           ← NEU
│       └── update-cover-palettes/         ← NEU
└── [bestehende Dateien unverändert]
```

---

*bamadi.de / Schwob Digitaldruck | SVG-Personalisierungssystem | März 2026*  
*Dieses Dokument ist die SSOT für die Implementierung. Bei Widersprüchen mit bestehenden Dokumenten hat dieses Priorität.*
