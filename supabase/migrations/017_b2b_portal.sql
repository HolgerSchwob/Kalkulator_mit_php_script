-- B2B-Portal: Konten, Gruppen, Studenten-Codes; Aufträge um B2B-Anteile erweitert.

CREATE TABLE IF NOT EXISTS public.b2b_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  account_type text CHECK (account_type IN ('corporate', 'institutional')),
  contact_name text,
  contact_email text UNIQUE NOT NULL,
  contact_phone text,
  billing_address jsonb,
  tax_id text,
  billing_model text NOT NULL DEFAULT 'full' CHECK (billing_model IN ('full', 'capped', 'fixed', 'student_pays')),
  cap_amount integer,
  fixed_amount integer,
  agb_accepted_at timestamptz,
  agb_version text,
  active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_b2b_accounts_contact_email ON public.b2b_accounts (lower(trim(contact_email)));

CREATE TABLE IF NOT EXISTS public.b2b_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.b2b_accounts (id) ON DELETE CASCADE,
  group_name text NOT NULL,
  description text,
  submission_date date,
  billing_model text,
  cap_amount integer,
  fixed_amount integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_groups_account_id ON public.b2b_groups (account_id);

CREATE TABLE IF NOT EXISTS public.b2b_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.b2b_accounts (id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.b2b_groups (id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  email text,
  matrikel_nr text,
  code text NOT NULL,
  code_type text NOT NULL DEFAULT 'personal' CHECK (code_type IN ('personal', 'group')),
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  order_id uuid,
  employer_amount integer,
  student_amount integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_students_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_b2b_students_account_id ON public.b2b_students (account_id);
CREATE INDEX IF NOT EXISTS idx_b2b_students_code_lower ON public.b2b_students (lower(trim(code)));

ALTER TABLE public.b2b_students
  ADD CONSTRAINT b2b_students_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders (id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS b2b_student_id uuid REFERENCES public.b2b_students (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS b2b_account_id uuid REFERENCES public.b2b_accounts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employer_amount integer,
  ADD COLUMN IF NOT EXISTS student_amount integer;

CREATE INDEX IF NOT EXISTS idx_orders_b2b_student_id ON public.orders (b2b_student_id);

COMMENT ON COLUMN public.orders.employer_amount IS 'Arbeitgeberanteil in Cent';
COMMENT ON COLUMN public.orders.student_amount IS 'Studentenanteil in Cent';

ALTER TABLE public.b2b_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "b2b_accounts_select_own"
  ON public.b2b_accounts FOR SELECT
  TO authenticated
  USING (lower(trim(contact_email)) = lower(trim(auth.jwt() ->> 'email')));

CREATE POLICY "b2b_groups_select_own"
  ON public.b2b_groups FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM public.b2b_accounts
      WHERE lower(trim(contact_email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "b2b_students_select_own"
  ON public.b2b_students FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM public.b2b_accounts
      WHERE lower(trim(contact_email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  );
