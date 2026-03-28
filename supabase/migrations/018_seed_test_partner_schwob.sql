-- Testkunde: Schwob (fiktive Daten). Login Partner-Portal: Magic Link an schwob@schwob-digitaldruck.de
-- Kalkulator-Testcode: SCHW-TEST1 (persönlicher Code, Vollübernahme)

INSERT INTO public.b2b_accounts (
  id,
  company_name,
  account_type,
  contact_name,
  contact_email,
  contact_phone,
  billing_address,
  tax_id,
  billing_model,
  cap_amount,
  fixed_amount,
  active,
  agb_accepted_at,
  agb_version,
  created_by,
  notes
) VALUES (
  'a1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'Schwob DigitalDruck GmbH',
  'corporate',
  'Maximilian Schwob',
  'schwob@schwob-digitaldruck.de',
  '+49 661 9988776',
  jsonb_build_object(
    'street', 'Musterstraße 12',
    'city', 'Fulda',
    'zip', '36037',
    'country', 'DE'
  ),
  'DE301234567',
  'full',
  NULL,
  NULL,
  true,
  now(),
  '2026-03',
  'seed',
  'Seed-Testkunde; Adresse und Steuernummer erfunden.'
)
ON CONFLICT (contact_email) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  contact_phone = EXCLUDED.contact_phone,
  billing_address = EXCLUDED.billing_address,
  tax_id = EXCLUDED.tax_id,
  billing_model = EXCLUDED.billing_model,
  active = EXCLUDED.active,
  agb_accepted_at = EXCLUDED.agb_accepted_at,
  agb_version = EXCLUDED.agb_version,
  notes = EXCLUDED.notes;

INSERT INTO public.b2b_groups (
  id,
  account_id,
  group_name,
  description,
  submission_date,
  status
) VALUES (
  'b1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'a1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'Testgruppe Abschlussarbeiten 2026',
  'Seed-Gruppe für Entwicklung',
  '2026-07-15',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.b2b_students (
  id,
  account_id,
  group_id,
  first_name,
  last_name,
  email,
  matrikel_nr,
  code,
  code_type,
  redeemed
) VALUES (
  'c1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'a1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'b1b2c3d4-e5f6-4789-a012-345678901234'::uuid,
  'Test',
  'Student',
  'student.test@example.de',
  'MAT-2026-001',
  'SCHW-TEST1',
  'personal',
  false
)
ON CONFLICT (code) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  group_id = EXCLUDED.group_id,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email;
