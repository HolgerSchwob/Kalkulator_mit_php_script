# Live Server: richtiger Ordner

**Wenn in der Browser-Konsole gar nichts erscheint** (keine Meldung mit `[bamadi]`), wird fast immer die **falsche** Startseite geladen – weil der **übergeordnete** Ordner „Kalkulator in Bearbeitung“ geöffnet ist.

## So machen Sie es richtig

1. **In Cursor:** **Datei → Ordner öffnen** (nicht nur eine Datei).
2. **Ordner auswählen:** Gehen Sie zu  
   `Desktop\Kalkulator in Bearbeitung\Kalkulator 130226`  
   und wählen Sie **genau den Ordner „Kalkulator 130226“** aus (nicht „Kalkulator in Bearbeitung“).
3. **Bestätigen** mit „Ordner auswählen“.
4. In der Seitenleiste sollte jetzt **nur** der Inhalt von „Kalkulator 130226“ sichtbar sein (z. B. `index.html`, `app.js`, `kalkulator/`, …).
5. **Rechtsklick auf `index.html`** → **„Open with Live Server“**.

**Prüfen:** Im Browser muss der **Seitentitel** „bamadi.de – Abschlussarbeit drucken & binden“ sein. In der Konsole (F12) erscheint dann:  
`[bamadi] bamadi-Startseite geladen – wenn Sie das sehen, ist der richtige Ordner aktiv (Kalkulator 130226)`.

- Im übergeordneten Ordner „Kalkulator in Bearbeitung“ liegt eine **andere** `index.html` (Stepper-Kalkulator, anderer Titel).
- Nur die `index.html` **hier** im Ordner `Kalkulator 130226` ist die bamadi-Startseite mit Kalkulator-Links und Modals.
