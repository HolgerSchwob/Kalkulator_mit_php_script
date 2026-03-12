# Supabase-Einstieg – Kalkulator-Projekt

## 1. Projekt-Erstellung (falls noch nicht geschehen)

- **Organization:** z. B. „Holger” (FREE reicht für den Einstieg).
- **Project name:** z. B. `kalkulator-auftraege`.
- **Database password:** Starkes Passwort erzeugen und sicher aufbewahren (z. B. in einem Passwortmanager).
- **Region:** **Europe** (nahe zu Ihren Nutzern).

### Wichtige Einstellungen

| Einstellung | Empfehlung | Grund |
|-------------|------------|--------|
| **Enable Data API** | ✅ An | Wird für den Supabase JS-Client (REST/Realtime) benötigt. |
| **Enable automatic RLS (Row Level Security)** | ✅ **An** | Aktivieren. RLS wird für alle neuen Tabellen im `public`-Schema automatisch aktiviert – wichtig für Kunden- vs. Admin-Zugriff. |

**Postgres Type:** „Postgres” (DEFAULT) beibehalten.

---

## 2. Nach der Erstellung – was Sie brauchen

1. **Project URL** und **anon (public) key**  
   Im Dashboard: **Project Settings** (Zahnrad) → **API** →  
   - **Project URL** (z. B. `https://xxxxx.supabase.co`)  
   - **anon public** Key (für das Frontend; dieser Key ist „öffentlich”, Zugriff wird über RLS gesteuert).

2. **Im Projekt:**  
   URL und Key stehen in **`supabase.config.json`**. Der Client wird in **`supabaseClient.mjs`** geladen (per `getSupabaseClient()`). Das **PostgreSQL-Passwort** wird im Frontend nicht benötigt (nur für direkte DB-Zugriffe/Migrationen).

3. **Optional für Admin-Funktionen:**  
   **service_role** Key nur serverseitig oder in sicheren Backend-Funktionen verwenden – **niemals** im Frontend einbinden.

---

## 3. RLS nachträglich aktivieren (falls bei Erstellung ausgelassen)

Falls Sie **Enable automatic RLS** nicht aktiviert haben:

- Unter **Database** → **Policies** können Sie für jede Tabelle RLS manuell aktivieren.
- Oder in der SQL-Konsole z. B.:  
  `ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;`  
  (nachdem die Tabelle `orders` existiert).

---

## 4. Datenbank und Storage einrichten (Auftragserstellung)

Die Auftragserstellung schreibt in die Tabelle **`orders`** und lädt Dateien in den Storage-Bucket **`order-files`** hoch.

### 4.1 SQL-Migrationen ausführen

1. Im Supabase-Dashboard: **SQL Editor** → **New query**.
2. Inhalt von **`supabase/migrations/001_orders_schema.sql`** einfügen und **Run** ausführen (erstellt Tabelle `orders` und RLS).
3. Anschließend **`supabase/migrations/002_storage_order_files.sql`** einfügen und ausführen (legt den Bucket an und erlaubt Anon-Upload/Download).
4. **`supabase/migrations/003_email_templates.sql`** und **`supabase/migrations/005_shop_config.sql`** ausführen (E-Mail-Templates und Shop-Konfiguration für den Kalkulator). Die Shop-Config wird im **Dashboard unter Einstellungen → Shop-Konfiguration** verwaltet (Papier, Bindungen, Extras, Preise).

Falls der **Bucket** per SQL nicht angelegt werden kann (Berechtigung), im Dashboard **Storage** → **New bucket** erstellen:
- Name: **`order-files`**
- Public: **aus**
- Optional: File size limit (z. B. 50 MB), Allowed MIME types: `application/pdf`, `image/svg+xml`
- Danach unter **Policies** für `order-files` zwei Policies anlegen: **INSERT** für `anon`, **SELECT** für `anon` (oder später einschränken).

### 4.2 Test

Nach dem Ausführen der Migrationen eine Bestellung im Kalkulator durchspielen (Kontaktdaten, Lieferung, AGB). Nach dem Absenden erscheint die Auftragsnummer; in Supabase unter **Table Editor** → **orders** und **Storage** → **order-files** sollten der neue Eintrag und die Dateien sichtbar sein.

---

## 5. Kurzfassung

- **Data API:** an.  
- **Automatic RLS:** an (empfohlen).  
- **Region:** Europe.  
- **Nach dem Erstellen:** Project URL + anon key aus **Project Settings → API** für den Frontend-Einstieg verwenden.

Die **localStorage-Persistenz** für den Kalkulator-State ist bereits umgesetzt. Der **Supabase-Client** ist vorbereitet (`supabaseClient.mjs`, `supabase.config.json`) und wird beim Schritt „Bestellung abschließen” sowie für das Backend/Dashboard genutzt.

**Hinweis:** Falls beim ersten Aufruf „Invalid API key” o. Ä. erscheint, im Dashboard unter **Project Settings → API** den Eintrag **anon public** (langer JWT-Key) verwenden und in `supabase.config.json` als `anonKey` eintragen.

---

## 6. Edge Functions und Admin-Secret (Dashboard)

Für das **Production-Dashboard** (`dashboard.html`) wird das Secret **ADMIN_SECRET** benötigt. Am zuverlässigsten setzen Sie es im Supabase-Dashboard:

- **Edge Functions** → **Secrets** → Key `ADMIN_SECRET`, Value (Ihr geheimer String) eintragen → Speichern.

Denselben Wert tragen Sie in **`dashboard.config.json`** als `adminSecret` ein. Details zu den einzelnen Functions stehen in **`supabase/functions/README.md`**.
