-- Zahlungsfelder für Stripe (optional) – Bestehende orders-Tabelle erweitern
-- Im Supabase-Dashboard: SQL Editor → New query → einfügen und ausführen.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_provider ON public.orders(payment_provider);

COMMENT ON COLUMN public.orders.payment_provider IS 'z.B. stripe, offline';
COMMENT ON COLUMN public.orders.payment_status IS 'unpaid, pending, paid, failed';
COMMENT ON COLUMN public.orders.paid_at IS 'Zeitstempel der erfolgreichen Zahlung';
