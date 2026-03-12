# Inkscape: Personalisierung zuweisen (Buchdecken-Template)

Erweiterung für Inkscape, die die Zuweisung der Personalisierungs-Funktionen auf Objekte vereinfacht. Statt IDs und Attribute per Hand zu tippen, wählt man die gewünschte Konvention aus einer Liste – die Werte entsprechen den Konventionen des Buchdecken-Editors im Kalkulator-Projekt.

## Voraussetzungen

- **Inkscape 1.x** (mit Python-Erweiterungsunterstützung)
- **Python 3** (wird meist mit Inkscape mitgeliefert)
- **inkex** (Python-Bibliothek für Inkscape-Erweiterungen; bei manchen Inkscape-Installationen bereits enthalten)

## Installation

1. **Benutzer-Erweiterungsordner** in Inkscape ermitteln:  
   **Bearbeiten → Einstellungen → System** → „Benutzererweiterungen“. Den angezeigten Pfad notieren.

2. **Dateien kopieren:**  
   Die Dateien  
   - `personalization_helper.inx`  
   - `personalization_helper.py`  
   - `personalization_show.inx`  
   in den Erweiterungsordner kopieren.

3. **Inkscape neu starten** (falls es geöffnet war).

4. **(Optional) Symlink für Entwicklung:**  
   Statt zu kopieren kann ein Symlink vom Erweiterungsordner auf diesen Unterordner gesetzt werden, damit Änderungen sofort genutzt werden können.

## Nutzung

### Sofort sehen, was zugewiesen ist

1. Objekt in Inkscape **anklicken** (auswählen).
2. **Erweiterungen → Buchdecken-Templates → Zuweisung anzeigen**.
3. **Anwenden** klicken → es erscheint ein **kompakter Report**: id, Tag, colorselector, Gruppe (und ggf. Hinweis „Nicht in tpl-group-u1/u4/spine“). Nichts wird geändert.

Damit erkennen Sie auf einen Blick, welche Personalisierung das Objekt hat.

### Zuweisung setzen oder ändern

1. Objekt auswählen.
2. **Erweiterungen → Buchdecken-Templates → Personalisierung zuweisen (Buchdecken-Template)**.
3. Im Dialog: **„Nur Prüfung“** ist standardmäßig an – ein Klick auf **Anwenden** zeigt zuerst den aktuellen Zustand und die geplante Zuweisung. Zum **tatsächlichen Setzen** die Checkbox **„Nur Prüfung“ abwählen**, im Dropdown **Zuweisung** die gewünschte Funktion wählen, dann **Anwenden**.

**Ohne Auswahl:** Es muss mindestens ein Objekt ausgewählt sein. Ohne Auswahl erscheint nach Klick auf Anwenden die Meldung „Bitte zuerst ein Objekt auswählen.“ (Ein Ausgrauen des Anwenden-Buttons ist in der Inkscape-API bei unserer Erweiterung nicht möglich.)

**Plausibilitätsprüfung:** Die Erweiterung prüft vor dem Anwenden, ob die Auswahl zur Zuweisung passt: Gruppen-Zuweisungen (tpl-group-u1/usw.) nur für Gruppen (`<g>`), Text-Zuweisungen nur für Text-Elemente (`<text>`), Logo-Zuweisungen üblicherweise für Rechtecke (`<rect>`). Liegt ein Text/Logo nicht in einer tpl-group-u1/u4/spine, erscheint ein Hinweis. Bei ungültiger Kombination wird die Änderung abgebrochen und eine Meldung angezeigt.

### Dialog: Vordergrund, Vorschau, Fehlermeldungen

- **Dialog wird „weggedrückt“:** Wenn Sie in Inkscape klicken, geht der Extension-Dialog in den Hintergrund – das ist das normale Verhalten von Inkscape, die Erweiterung kann das Fenster nicht „immer im Vordergrund“ halten. **Tipp:** Erst Zuweisung wählen und Anwenden klicken, danach in der Zeichenfläche arbeiten; oder mit **Alt+Tab** / Taskleiste zurück zum Dialog wechseln.
- **Vorschau:** Bei vielen Effekt-Erweiterungen gibt Inkscape eine **Live-Vorschau**-Option aus (zeigt die Wirkung des Effekts auf der Zeichenfläche, ohne zu speichern). Bei dieser Erweiterung ist **Vorschau deaktiviert**, weil wir nur IDs/Attribute setzen – dafür nutzen Sie **„Nur Prüfung“**, um den Zustand zu prüfen, ohne etwas zu ändern.
- **Fehlermeldungen** der Erweiterung:
  - **„Bitte zuerst ein Objekt auswählen.“** – Es ist kein Objekt markiert. Mindestens ein Objekt auswählen, dann erneut Anwenden.
  - **„Keine Zuweisung gewählt.“** – Im Dropdown wurde keine Option ausgewählt (sollte bei normaler Nutzung nicht vorkommen).
  - **„Zuweisung abgebrochen:“** plus Liste – Die Plausibilitätsprüfung ist fehlgeschlagen (z. B. Gruppen-Zuweisung auf einem Text gewählt, oder Text-Zuweisung auf einer Gruppe). Die angezeigten Zeilen erklären, was nicht passt; Auswahl oder Zuweisung anpassen.
  - **„Aktuelle Zuweisung (N Objekt/e)“** mit id, Tag, colorselector, Gruppe – Das ist der **Zuweisung-anzeigen**-Report (kein Fehler).
  - **„Prüfung (N Objekt/e) – keine Änderung“** mit id, Tag, geplanter Zuweisung, Plausibilität – Das ist der **Nur-Prüfung**-Report (kein Fehler); die Erweiterung hat nichts geändert.

Das ausgewählte Objekt erhält dann die passende **ID** und ggf. **Attribute**:

- **Gruppen:** z. B. `tpl-group-u1`, `tpl-group-u4`, `tpl-group-spine`
- **Text:** z. B. `tpl-title`, `tpl-subtitle`, `tpl-name`, `tpl-topic`; mehrzeilig: `tpl-topic` + `data-multiline="true"` + `data-max-lines="4"`
- **Text Zeilen 1–3:** `tpl-subtitle-line1`, `tpl-subtitle-line2`, `tpl-subtitle-line3`
- **Logo:** `tpl-logo-Logo1`, `tpl-logo-Logo2`
- **Farbe:** nur Attribut `colorselector="color1"` bzw. `colorselector="color2"` (ID unverändert)

## Verfügbare Zuweisungen (Konventionen)

Die Liste im Dialog entspricht dem Nomenklatur-Spickzettel im **SVG Template Preflight** (im gleichen Projekt unter `tools/svg-template-preflight/`). Bei neuen Konventionen im Editor können hier weitere Optionen ergänzt werden.

## Hinweise zu Meldungen (Windows)

- **GLib-WARNING „passing a child setup function to g_spawn… is pointless on Windows“:** Bekanntes Verhalten von Inkscape/GTK unter Windows, unkritisch – kann ignoriert werden.
- **„Das aufgerufene Element hat zusätzliche Daten an Inkscape gesendet…“:** Kann unter Windows erscheinen, wenn neben der SVG-Ausgabe noch Meldungen ausgegeben werden. Wenn die Zuweisung korrekt angewendet wurde (ID/Attribut am Objekt sichtbar), die Meldung ignorieren. Bei Fehlern (z. B. kein Objekt ausgewählt) erscheint stattdessen die Fehlermeldung der Erweiterung.

## Fehlerbehebung

- **„Bitte zuerst ein Objekt auswählen“:** Mindestens ein Objekt muss vor dem Aufruf der Erweiterung ausgewählt sein.
- **Erweiterung erscheint nicht im Menü:** Pfad der Benutzererweiterungen prüfen; Inkscape neu starten; Schreibrechte im Erweiterungsordner prüfen.
- **Python-/inkex-Fehler:** Bei selbst installiertem Inkscape ggf. das Modul `inkex` für Python installieren (z. B. `pip install inkex`), sofern es nicht bereits im Inkscape-Python enthalten ist.
