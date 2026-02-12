# Supabase Edge Functions für Kalkulator

## Übersicht

- **get-order:** Für die Kunden-Landingpage (`auftrag.html`). POST mit `order_number` + `email`. Liefert den Auftrag nur bei passender E-Mail. Keine Authentifizierung nötig (öffentlich).
- **list-orders:** Für das Production-Dashboard. **GET** mit Query-Parametern: `?admin_secret=...` (erforderlich) und optional `?status=...`. Alternativ Header `x-admin-secret` oder (bei POST) Secret im Body.
- **order-detail:** Für das Dashboard. POST mit `order_id` (oder `order_number`). Liefert Auftrag inkl. signierter Download-URLs für PDF und SVGs. Header `x-admin-secret` erforderlich.
- **update-order:** Für das Dashboard. POST mit `order_id` sowie optional `status`, `assignee`, `notes`. Header `x-admin-secret` erforderlich.
- **send-order-email:** Versand automatisierter E-Mails per Gmail API (z. B. „Auftrag eingegangen“, Status-Update). POST mit `order_id` und `type: 'received' | 'status'`. Verwendet Einträge aus der Tabelle `email_templates` (template_key = Status); nur aktive Templates. Header `x-admin-secret` erforderlich. Zusätzliche Secrets: siehe Abschnitt „Gmail API (send-order-email)“.
- **email-templates:** Verwaltung der E-Mail-Templates fürs Dashboard. GET liefert alle Templates; PATCH mit `template_key`, optional `subject_template`, `body_html`, `body_plain`, `active`. Header `x-admin-secret` erforderlich.

## E-Mail-Templates (Tabelle email_templates)

Migration `003_email_templates.sql` legt die Tabelle an und befüllt sie mit einem Eintrag pro Auftragsstatus (template_key = Status-String, z. B. „Eingegangen“, „In Prüfung“). Im Dashboard unter Einstellungen (Zahnrad) können Betreff, Plain-Text, HTML und „Aktiv“ pro Template bearbeitet werden. Platzhalter: `{{order_number}}`, `{{customer_name}}`, `{{status}}`.

## Secrets (ADMIN_SECRET)

**Empfohlen:** Secrets im **Supabase-Dashboard** setzen – dann funktionieren sie zuverlässig für alle Functions.

1. Im Supabase-Dashboard: **Edge Functions** → **Secrets** (oder Projekt-URL: `https://supabase.com/dashboard/project/<PROJECT_REF>/functions/secrets`).
2. Key: `ADMIN_SECRET`, Value: Ihr geheimer String (z. B. ein langes, zufälliges Passwort). Speichern.
3. Kein Redeploy nötig – Secrets sind sofort verfügbar.

**Optional per CLI:**  
`npx supabase secrets set "ADMIN_SECRET=ihr_geheimer_string"`  
(Falls Sie mehrere Projekte nutzen: `--project-ref IHR_PROJECT_REF`. Auf Windows kann die CLI bei langen Werten problematisch sein; dann das Dashboard verwenden.)

Prüfen, ob Secrets gesetzt sind: `npx supabase secrets list`

## Deployment (Supabase CLI)

1. [Supabase CLI](https://supabase.com/docs/guides/cli) installieren und anmelden.
2. Im Projektordner (oder im Ordner mit `supabase/`):  
   `supabase link --project-ref IHR_PROJECT_REF`
3. Functions deployen:  
   `supabase functions deploy get-order`  
   `supabase functions deploy list-orders`  
   `supabase functions deploy order-detail`  
   `supabase functions deploy update-order`  
   `supabase functions deploy send-order-email`  
   `supabase functions deploy email-templates`

## Gmail API (send-order-email)

Die Function versendet E-Mails als **bamadi@schwob-digitaldruck.de** über die Gmail API. Dafür ist ein **Google Service Account** mit **Domain-Wide Delegation** nötig.

### 1. Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com/) → Projekt auswählen oder neu anlegen.
2. **APIs & Dienste** → **Bibliothek** → nach „Gmail API“ suchen → **Aktivieren**.
3. **APIs & Dienste** → **Anmeldedaten** → **Anmeldedaten erstellen** → **Dienstkonto**.
4. Name z. B. „Supabase Gmail Sender“, Erstellen. Optional Rolle zuweisen (nicht zwingend für Gmail).
5. Dienstkonto anklicken → **Schlüssel** → **Schlüssel hinzufügen** → **Neuer Schlüssel** → **JSON** → Herunterladen.
6. **Client-ID** des Dienstkontos notieren: In der JSON-Datei steht `client_id` (Zahl) oder unter „Anmeldedaten“ → Dienstkonto → „Kunden-ID“ (z. B. `123456789012-abc...@...iam.gserviceaccount.com` – die lange Zahl davor ist die Client-ID).

### 2. Google Workspace Admin – Domain-Wide Delegation

1. [Admin-Konsole](https://admin.google.com/) (Workspace-Admin-Rechte nötig).
2. **Sicherheit** → **Zugriffs- und Datensteuerung** → **API-Steuerung** (oder „App-Zugriff“).
3. **Domainweite Delegierung verwalten** → **Neue Anmeldedaten hinzufügen**.
4. **Client-ID** des Service Accounts eintragen (nur die Zahl, z. B. `123456789012`).
5. **OAuth-Bereiche:**  
   `https://www.googleapis.com/auth/gmail.send`  
   Hinzufügen und speichern.

### 3. Supabase Secrets

Im Supabase-Dashboard unter **Edge Functions** → **Secrets** eintragen:

| Key | Wert |
|-----|------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Kompletter Inhalt** der heruntergeladenen JSON-Datei (einzeilig oder mit Zeilenumbrüchen). |
| `GMAIL_IMPERSONATE_EMAIL` | E-Mail des Nutzers, in dessen Namen gesendet wird (z. B. **info@schwob-digitaldruck.de**). Der Alias bamadi@ muss diesem Postfach zugeordnet sein. |

`ADMIN_SECRET` muss wie bei den anderen Functions gesetzt sein (wird für den Aufruf der Function per `x-admin-secret` benötigt).

### Aufruf

- **URL:** `POST {SUPABASE_URL}/functions/v1/send-order-email`
- **Header:** `Content-Type: application/json`, `x-admin-secret: <ADMIN_SECRET>`
- **Body (Auftrag eingegangen):**  
  `{ "order_id": "<uuid>", "type": "received" }`
- **Body (Status-Update):**  
  `{ "order_id": "<uuid>", "type": "status", "status": "In Produktion" }`  
  Ohne `status` wird der aktuelle Auftragsstatus verwendet.

Das Dashboard kann diese Function z. B. nach Speichern oder bei Statusänderung aufrufen (optional, noch nicht eingebaut).

## Konfiguration im Projekt

- **Kunden-Landingpage:** Verwendet `supabase.config.json` (url, anonKey). Die GetOrder-URL ist `{url}/functions/v1/get-order`.
- **Dashboard:** In `dashboard.config.json` müssen eingetragen sein: `supabaseUrl`, `anonKey` (wie in supabase.config.json) und **`adminSecret`** – exakt derselbe Wert wie das Secret `ADMIN_SECRET` in Supabase (am besten im Dashboard gesetzt). Ohne `adminSecret` zeigt das Dashboard eine Hinweisbox und lädt keine Aufträge.
- **Optional – Login:** Wenn **`dashboardPassword`** in `dashboard.config.json` gesetzt ist, erscheint beim Aufruf der Dashboard-Seite eine Anmeldemaske; nur mit korrektem Passwort wird die Auftragsliste angezeigt. Für den Einsatz auf dem Webserver empfohlen (z. B. in Kombination mit geschütztem Zugriff auf die Config).
- **E-Mail:** Klick auf die Kunden-E-Mail öffnet die Standard-Mail-Anwendung (z. B. Gmail) mit vorausgefülltem Empfänger und Betreff „Auftrag [Auftragsnummer]“. Automatisierte Mails (Auftrag eingegangen, Status-Update) werden über die Edge Function **send-order-email** per Gmail API versendet (Absender: **bamadi@schwob-digitaldruck.de**). Dafür müssen die Google-Service-Account-Secrets in Supabase gesetzt sein (siehe Abschnitt „Gmail API“).
