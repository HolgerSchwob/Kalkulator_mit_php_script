-- Cover-Templates: Storage-Bucket für SVG-Dateien + Tabelle für Metadaten (Gruppe, Anzeigename, Sortierung).
-- Templates werden über das Dashboard hochgeladen und gepflegt; der Editor lädt Liste + SVGs aus Supabase.

-- ========== Storage-Bucket ==========
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cover-templates',
  'cover-templates',
  true,
  2097152,
  ARRAY['image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/svg+xml']::text[];

-- Storage-Policies: Service Role (Edge Function) darf schreiben/lesen/löschen
DROP POLICY IF EXISTS "cover_templates_service_role_all" ON storage.objects;
CREATE POLICY "cover_templates_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'cover-templates')
  WITH CHECK (bucket_id = 'cover-templates');

-- ========== Tabelle: cover_templates ==========
CREATE TABLE IF NOT EXISTS public.cover_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  gruppe text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_templates_gruppe ON public.cover_templates(gruppe);
CREATE INDEX IF NOT EXISTS idx_cover_templates_sort ON public.cover_templates(sort_order);

COMMENT ON TABLE public.cover_templates IS 'Buchdeckentemplates: Metadaten zu in Storage (cover-templates) abgelegten SVGs. gruppe z.B. hardcover_modern, paperback. Editor filtert nach Gruppe.';

ALTER TABLE public.cover_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_templates_anon_select"
  ON public.cover_templates FOR SELECT
  TO anon
  USING (true);
