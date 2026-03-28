-- Zeitpunkt Versand/Abholung (für automatische Bewertungsanfrage nach X Tagen)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_completed_at timestamptz;

COMMENT ON COLUMN public.orders.fulfillment_completed_at IS 'Wird gesetzt, sobald der Status „Versendet“ oder „Abgeholt“ ist (erster Zeitpunkt). Für Bewertungs-E-Mails.';

CREATE OR REPLACE FUNCTION public.orders_set_fulfillment_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('Versendet', 'Abgeholt') THEN
    IF NEW.fulfillment_completed_at IS NULL THEN
      NEW.fulfillment_completed_at := now();
    END IF;
  ELSE
    NEW.fulfillment_completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_fulfillment_completed ON public.orders;
CREATE TRIGGER trg_orders_fulfillment_completed
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.orders_set_fulfillment_completed_at();

-- Template für Bewertungsanfrage (kein Auftragsstatus; Versand über type=review_request)
INSERT INTO public.email_templates (template_key, name, subject_template, body_html, body_plain, active)
VALUES (
  'Bewertungsanfrage',
  'Bewertungsanfrage',
  'Wie zufrieden sind Sie mit Ihrem Auftrag {{order_number}}?',
  '',
  'Hallo {{customer_name}},

Ihr Auftrag {{order_number}} ist bei Ihnen angekommen – wir hoffen, Sie sind zufrieden!

Wenn Sie einen Moment Zeit haben, freuen wir uns über eine kurze Bewertung:
{{review_url}}

Vielen Dank und herzliche Grüße
Ihr Team SCHWOB DIGITALDRUCK',
  false
)
ON CONFLICT (template_key) DO NOTHING;
