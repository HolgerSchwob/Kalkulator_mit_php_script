-- E-Mail-Templates pro Auftragsstatus (template_key = Status-Bezeichnung)
-- Dashboard: Bearbeitung über Einstellungen (Zahnrad); send-order-email lädt Template per template_key.

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  subject_template text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_plain text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON public.email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON public.email_templates(active) WHERE active = true;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Nur Service Role (Edge Functions) darf lesen/schreiben; anon/authenticated haben keinen Zugriff.
-- Keine Policy für anon/authenticated = kein Zugriff. service_role umgeht RLS.

COMMENT ON TABLE public.email_templates IS 'E-Mail-Vorlagen pro Status; template_key = Status-String (z.B. Eingegangen, In Prüfung).';

-- Ein Eintrag pro Status (identisch mit Dashboard-Statusliste)
INSERT INTO public.email_templates (template_key, name, subject_template, body_html, body_plain, active)
VALUES
  ('Eingegangen', 'Eingegangen', 'Auftrag {{order_number}} – eingegangen',
   '', 'Hallo {{customer_name}},\n\nvielen Dank für Ihre Bestellung. Wir haben Ihren Auftrag {{order_number}} erhalten.\n\nSie können den Status Ihres Auftrags jederzeit mit Ihrer E-Mail-Adresse und der Auftragsnummer einsehen.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', true),
  ('In Prüfung', 'In Prüfung', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Wartet auf Zahlung', 'Wartet auf Zahlung', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Bezahlt', 'Bezahlt', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Bereit für Druck', 'Bereit für Druck', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Bereit für Bindung', 'Bereit für Bindung', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Versand-/Abholbereit', 'Versand-/Abholbereit', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Versendet', 'Versendet', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Abgeholt', 'Abgeholt', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Storniert', 'Storniert', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false),
  ('Archiviert', 'Archiviert', 'Auftrag {{order_number}} – {{status}}', '', 'Hallo {{customer_name}},\n\nder Status Ihres Auftrags {{order_number}} wurde aktualisiert: {{status}}.\n\nMit freundlichen Grüßen\nIhr Team SCHWOB DIGITALDRUCK', false)
ON CONFLICT (template_key) DO NOTHING;
