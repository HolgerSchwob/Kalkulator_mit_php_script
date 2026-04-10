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

---

## Vercel (GitHub → Live-URL)

Deployment-Host für die **statische Website**. Backend bleibt **Supabase** (Edge Functions, DB); dort auch **Stripe**-Checkout-Logik.

### Einmalig: Projekt bei Vercel

1. [vercel.com](https://vercel.com) → **Add New…** → **Project** → GitHub-Repo auswählen.
2. **Framework Preset:** Other (oder „Other“ mit statischem Output).
3. **Root Directory:** Repo-Root (Ordner mit `index.html`), falls nicht anders gewählt.
4. **Build Command:** `npm run build` (schreibt `supabase.config.json` / optional `dashboard.config.json` aus Umgebungsvariablen).
5. **Output Directory:** `.` (aktueller Ordner nach dem Build).
6. **Install Command:** `npm install` (Standard).

### Umgebungsvariablen bei Vercel (Settings → Environment Variables)

| Variable | Pflicht | Inhalt |
|----------|---------|--------|
| `SUPABASE_URL` | ja | Projekt-URL, z. B. `https://xxxx.supabase.co` (ohne Slash am Ende) |
| `SUPABASE_ANON_KEY` | ja | **anon public**-Key aus Supabase → Project Settings → API |
| `ADMIN_SECRET` | optional | Gleicher Wert wie Supabase Edge Function Secret `ADMIN_SECRET` – **nur setzen**, wenn `dashboard.html` auf der Vercel-URL nutzbar sein soll |
| `DASHBOARD_PASSWORD` | optional | Leer lassen oder wie lokal |
| `AGENT_URL` | optional | Meist leer auf Production; nur wenn FileAgent öffentlich erreichbar |
| `AGENT_API_KEY` | optional | Wie lokal, sonst leer |

Ohne `ADMIN_SECRET` wird **keine** `dashboard.config.json` erzeugt – Landingpage und Kalkulator funktionieren trotzdem (nur Dashboard nicht).

Lokale Dateien `supabase.config.json` / `dashboard.config.json` werden **nicht** ins Repo committed (`.gitignore`); der Build auf Vercel erzeugt sie zur Deploy-Zeit.

### Nach dem ersten erfolgreichen Deploy

1. **Supabase → Edge Functions → Secrets:** `PUBLIC_SITE_URL` auf die **öffentliche Vercel-Domain** setzen (z. B. `https://dein-projekt.vercel.app` oder Custom Domain). Wird u. a. für Stripe **success/cancel**-URLs in `create-order-and-checkout` genutzt; ohne sinnvolle URL kann der Checkout fehlschlagen.
2. **Supabase → Authentication:** Falls Login/Redirects genutzt werden, unter URL-Konfiguration die Vercel-URL(s) eintragen.
3. **Stripe:** Webhooks zeigen auf Supabase-Functions, nicht auf Vercel – unverändert. Nur die **Return-URLs** des Checkout hängen an `PUBLIC_SITE_URL` / Browser-Kontext.

### Täglicher Ablauf mit Vercel

Wie oben: **Pull** → ändern → **Commit** → **Push**. Vercel startet nach Push auf den Standard-Branch (meist `main`) automatisch ein neues Deployment. Zum Testen reicht oft die Vercel-Preview-URL.
