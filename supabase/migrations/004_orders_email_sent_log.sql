-- Log versendeter E-Mails pro Auftrag (Auftrag eingegangen + Status-Mails)
-- Jeder Eintrag: { "type": "received"|"status", "status": "Eingegangen"|"In Prüfung"|..., "sent_at": "ISO8601" }

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_sent_log jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.orders.email_sent_log IS 'Array von { type, status, sent_at } für jede an den Kunden versendete E-Mail (Auftrag eingegangen / Status-Update).';
