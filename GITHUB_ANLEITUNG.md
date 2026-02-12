# GitHub – Projekt auf PC und Laptop nutzen

Dieses Projekt ist mit GitHub verbunden. So hältst du den Code auf beiden Rechnern konsistent.

---

## Einmalig: Auf dem aktuellen PC (hier)

1. **Änderungen committen und pushen**
   - In Cursor: linkes Seitenleisten-Icon **Source Control** (oder `Strg+Shift+G`)
   - Alle gewünschten Änderungen auswählen (Stage)
   - Nachricht eintragen, z. B. „Projekt für GitHub vorbereitet“
   - **Commit** klicken, danach **Sync / Push** (oder im Menü: Git → Push)

   Oder in der Konsole im Projektordner:
   ```bash
   git add .
   git commit -m "Projekt für GitHub vorbereitet"
   git push origin main
   ```
   (Falls dein Branch `master` heißt: `git push origin master`)

---

## Einmalig: Auf dem Laptop

1. **Git installieren** (falls noch nicht): https://git-scm.com/download/win  
2. **Cursor installieren** und mit deinem Konto anmelden  
3. **Projekt von GitHub klonen**
   - Repo-URL: `https://github.com/HolgerSchwob/Kalkulator_mit_php_script.git`
   - In Cursor: **File → Clone Repository** → URL einfügen → Ordner wählen  
   - Oder in der Konsole:
     ```bash
     cd C:\Users\DEIN-NAME\Desktop
     git clone https://github.com/HolgerSchwob/Kalkulator_mit_php_script.git "Kalkulator in Bearbeitung"
     cd "Kalkulator in Bearbeitung"
     ```
4. **Konfiguration anlegen** (Secrets werden nicht mitgepusht)
   - `dashboard.config.json.example` kopieren zu `dashboard.config.json`  
   - `supabase.config.json.example` kopieren zu `supabase.config.json`  
   - In beiden Dateien die Platzhalter durch deine echten Werte ersetzen (Supabase-Dashboard, gleiche Werte wie auf dem PC)

---

## Tägliche Nutzung (beide Rechner)

- **Vor dem Arbeiten:** Immer zuerst **Pull** („Sync“ oder Git → Pull), damit du den neuesten Stand hast.  
- **Nach dem Arbeiten:** **Commit** (kurze Beschreibung) + **Push**, damit der andere Rechner die Änderungen beim nächsten Pull bekommt.

In Cursor: Source Control → Commit → Sync/Push. Oder Konsole: `git pull`, arbeiten, `git add .`, `git commit -m "..."`, `git push`.

---

## Wichtig

- **dashboard.config.json** und **supabase.config.json** stehen in `.gitignore` und werden nicht hochgeladen. Auf dem Laptop musst du sie einmal aus den `.example`-Dateien anlegen und mit deinen echten Werten füllen.
- Google Service Account JSON-Dateien (z. B. für E-Mail-Versand) werden ebenfalls nicht committet. Auf dem Laptop die gleiche JSON-Datei lokal ablegen und in Supabase (Edge Function Secrets) erneut eintragen, falls nötig.
