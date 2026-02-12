-- Supabase Storage: Bucket für Auftragsdateien (PDF, SVGs)
-- Im Dashboard: SQL Editor → New query → ausführen (nach 001_orders_schema.sql).

-- Bucket anlegen (falls noch nicht im Dashboard erstellt)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-files',
  'order-files',
  false,
  52428800,
  ARRAY['application/pdf', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Anon darf in diesen Bucket hochladen (für Frontend-Bestellung)
CREATE POLICY "order-files_anon_insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'order-files');

-- Anon darf Dateien lesen (für später: Dashboard mit anon oder eigener Auth)
CREATE POLICY "order-files_anon_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'order-files');
