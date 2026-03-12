-- Template-Gruppen: Editor-Dimensionen und Rücken/ Falz pro Gruppe.
-- Wird vom Cover-Editor geladen; Pflege über Dashboard → Shop-Konfiguration → Templatezuordnung.

CREATE TABLE IF NOT EXISTS public.cover_template_groups (
  id text PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  spine_offset_mm numeric NOT NULL DEFAULT 0,
  visible_cover_height_mm numeric NOT NULL DEFAULT 297,
  u1_width_mm numeric NOT NULL DEFAULT 210,
  default_spine_width_mm numeric,
  falz_zone_width_mm numeric NOT NULL DEFAULT 8,
  dimensions jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cover_template_groups IS 'Editor-Config pro Template-Gruppe: sichtbarer Bereich, Spine-Offset, Falz-Hilfslinien-Abstand. Pflege in Shop-Konfiguration → Templatezuordnung.';

CREATE INDEX IF NOT EXISTS idx_cover_template_groups_sort ON public.cover_template_groups(sort_order);

ALTER TABLE public.cover_template_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_template_groups_anon_select"
  ON public.cover_template_groups FOR SELECT
  TO anon
  USING (true);

-- Service Role für Admin (Edge Functions)
CREATE POLICY "cover_template_groups_service_all"
  ON public.cover_template_groups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed: vier Gruppen (Hardcover Modern/Klassik, Paperback Modern/Classic)
INSERT INTO public.cover_template_groups (
  id, display_name, spine_offset_mm, visible_cover_height_mm, u1_width_mm,
  default_spine_width_mm, falz_zone_width_mm, dimensions, sort_order
) VALUES
  (
    'hardcover_modern',
    'Hardcover Modern',
    0,
    302,
    215,
    35,
    8,
    '{"svg_total_width": 500, "svg_total_height": 330, "svg_center_x": 250}'::jsonb,
    0
  ),
  (
    'hardcover_efalin',
    'Hardcover Klassik (Efalin)',
    0,
    302,
    215,
    35,
    8,
    '{"svg_total_width": 500, "svg_total_height": 330, "svg_center_x": 250}'::jsonb,
    1
  ),
  (
    'paperback_modern',
    'Paperback Modern',
    1,
    297,
    210,
    20,
    6,
    '{"svg_total_width": 450, "svg_total_height": 310, "svg_center_x": 225}'::jsonb,
    2
  ),
  (
    'paperback_classic',
    'Paperback Classic',
    1,
    297,
    210,
    20,
    6,
    '{"svg_total_width": 450, "svg_total_height": 310, "svg_center_x": 225}'::jsonb,
    3
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  spine_offset_mm = EXCLUDED.spine_offset_mm,
  visible_cover_height_mm = EXCLUDED.visible_cover_height_mm,
  u1_width_mm = EXCLUDED.u1_width_mm,
  default_spine_width_mm = EXCLUDED.default_spine_width_mm,
  falz_zone_width_mm = EXCLUDED.falz_zone_width_mm,
  dimensions = EXCLUDED.dimensions,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
