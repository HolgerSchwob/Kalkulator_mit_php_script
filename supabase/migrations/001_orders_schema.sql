-- Supabase: Auftragstabelle und RLS für Kalkulator-Bestellungen
-- Im Dashboard: SQL Editor → New query → einfügen und ausführen.

-- Tabelle: Aufträge (Single Source of Truth nach Bestellung)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY,
  order_number text UNIQUE NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'Eingegangen',
  assignee text,
  total_price numeric(10,2),
  is_express boolean DEFAULT false,
  payload jsonb NOT NULL,
  shipping_data jsonb,
  main_pdf_storage_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index für Kundenabfrage (E-Mail + Auftragsnummer) und Status-Filter
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- RLS aktivieren
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Policy: Anonyme Besucher (Frontend) dürfen nur neue Aufträge anlegen, keine lesen/ändern
CREATE POLICY "orders_anon_insert"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Später für Kunden-Login (Auftragsstatus): SELECT wo customer_email + order_number passen
-- wird ergänzt, sobald Auth oder custom Check implementiert ist.

-- Policy: Service Role (Backend/Admin) hat vollen Zugriff – Standard in Supabase
-- Keine weitere Policy nötig; service_role umgeht RLS.

COMMENT ON TABLE public.orders IS 'Aufträge aus dem Kalkulator; Single Source of Truth nach Bestellung.';
