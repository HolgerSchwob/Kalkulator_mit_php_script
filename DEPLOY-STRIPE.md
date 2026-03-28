# Stripe-Integration – Supabase Deployments

Diese Schritte sind nötig, damit die Stripe-Integration (Online-Zahlung + Webhook) läuft.

## 1. Migration ausführen

Die Tabelle `orders` braucht die neuen Zahlungsfelder.

**Option A – Supabase Dashboard**  
1. Supabase-Dashboard → **SQL Editor** → New query  
2. Inhalt von `supabase/migrations/012_orders_payment_fields.sql` einfügen  
3. **Run** ausführen  

**Option B – Supabase CLI (wenn Projekt verlinkt)**  
```bash
supabase db push
```

## 2. Edge Functions deployen

Supabase CLI installieren (falls noch nicht):  
https://supabase.com/docs/guides/cli  

Projekt verlinken (einmalig, im Projektordner):  
```bash
supabase login
supabase link --project-ref IHR_PROJECT_REF
```

Functions deployen:  
```bash
supabase functions deploy create-order-and-checkout
supabase functions deploy stripe-webhook
```

**Webhook und 401 „Missing authorization header“**  
Supabase prüft Edge Functions standardmäßig mit JWT. Stripe sendet beim Webhook **keinen** `Authorization`-Header – dann antwortet das Gateway mit **401**, bevor Ihre Function läuft. Im Repo ist `supabase/config.toml` so gesetzt, dass nur die Webhook-Function **ohne** JWT-Zwang erreichbar ist:

```toml
[functions.stripe-webhook]
verify_jwt = false
```

Die Absicherung erfolgt weiterhin über die **Stripe-Signatur** (`STRIPE_WEBHOOK_SIGNING_SECRET`). Nach Änderungen an `config.toml` die Function erneut deployen.

## 3. Secrets setzen

Im Supabase-Dashboard: **Edge Functions** → **Secrets** (oder per CLI):

| Secret | Beschreibung |
|--------|--------------|
| `STRIPE_SECRET_KEY` | Stripe Secret Key (sk_test_… oder sk_live_…) |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | Webhook-Signatur-Secret (whsec_…) von Stripe |

**Webhook in Stripe anlegen**  
1. Stripe Dashboard → **Developers** → **Webhooks** → Add endpoint  
2. URL: `https://IHR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`  
3. Event: `checkout.session.completed`  
4. Signing secret kopieren und als `STRIPE_WEBHOOK_SIGNING_SECRET` in Supabase eintragen  

Ohne diese Secrets bleibt Stripe deaktivierbar über das Dashboard (Allgemein → „Stripe aktivieren“).

## 4. Weiterleitung nach Zahlung (`PUBLIC_SITE_URL`)

Nach erfolgreicher Zahlung leitet Stripe auf **`/auftrag.html`** auf **Ihrer** Domain weiter (nicht auf `*.supabase.co`).

- **Empfohlen (Live):** Edge Function Secret **`PUBLIC_SITE_URL`** = z. B. `https://ihre-domain.de` (ohne Schrägstrich am Ende).
- **Lokal:** Wenn das Secret fehlt, nutzt die Function den **`Origin`**-Header des Browsers (z. B. `http://localhost:5500`). Ohne gültige Basis-URL schlägt die Checkout-Erstellung mit einer klaren Fehlermeldung fehl.
- **Nicht verwenden:** Früher wurde fälschlich die Projekt-ID als Host genutzt → **DNS-Fehler (NXDOMAIN)** nach Stripe. Mit aktuellem Code passiert das nicht mehr.

---

**Kurz:** Migration im SQL Editor ausführen → CLI: `supabase functions deploy create-order-and-checkout` und `stripe-webhook` → Secrets im Dashboard setzen → Webhook in Stripe auf die `stripe-webhook`-URL zeigen.
