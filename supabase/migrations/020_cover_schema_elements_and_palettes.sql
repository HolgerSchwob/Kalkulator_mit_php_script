-- Cover-Schema (Personalisierung): Vokabular für data-label + Farbpaletten für Template-Farbrollen
-- Siehe SVG-PERSONALISIERUNG-PFLICHTENHEFT.md

-- ========== cover_schema_elements ==========
CREATE TABLE IF NOT EXISTS public.cover_schema_elements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id      text UNIQUE NOT NULL,
  label           text NOT NULL,
  placeholder     text NOT NULL DEFAULT '',
  element_type    text NOT NULL CHECK (element_type IN ('text', 'image', 'zone')),
  required        boolean NOT NULL DEFAULT false,
  layer           text CHECK (layer IN ('front', 'spine', 'back', 'any')),
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_schema_elements_type_active
  ON public.cover_schema_elements (element_type, active);

COMMENT ON TABLE public.cover_schema_elements IS 'Vokabular personalisierbarer SVG-Felder (data-label); Labels/Placeholder für Editor & Kundenseite.';

CREATE OR REPLACE FUNCTION public.cover_schema_elements_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cover_schema_elements_updated_at ON public.cover_schema_elements;
CREATE TRIGGER cover_schema_elements_updated_at
  BEFORE UPDATE ON public.cover_schema_elements
  FOR EACH ROW
  EXECUTE FUNCTION public.cover_schema_elements_touch_updated_at();

ALTER TABLE public.cover_schema_elements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cover_schema_elements_anon_select_active" ON public.cover_schema_elements;
CREATE POLICY "cover_schema_elements_anon_select_active"
  ON public.cover_schema_elements FOR SELECT
  TO anon
  USING (active = true);

-- ========== cover_color_palettes ==========
CREATE TABLE IF NOT EXISTS public.cover_color_palettes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  hex         text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_color_palettes_sort ON public.cover_color_palettes (sort_order);

COMMENT ON TABLE public.cover_color_palettes IS 'Farben für Kundenpersonalisierung (color-1/color-2); Zuordnung pro Template über cover_templates.';

CREATE OR REPLACE FUNCTION public.cover_color_palettes_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cover_color_palettes_updated_at ON public.cover_color_palettes;
CREATE TRIGGER cover_color_palettes_updated_at
  BEFORE UPDATE ON public.cover_color_palettes
  FOR EACH ROW
  EXECUTE FUNCTION public.cover_color_palettes_touch_updated_at();

ALTER TABLE public.cover_color_palettes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cover_color_palettes_anon_select_active" ON public.cover_color_palettes;
CREATE POLICY "cover_color_palettes_anon_select_active"
  ON public.cover_color_palettes FOR SELECT
  TO anon
  USING (active = true);

-- ========== cover_templates: Farbrollen ==========
ALTER TABLE public.cover_templates
  ADD COLUMN IF NOT EXISTS color_1_palette_id uuid REFERENCES public.cover_color_palettes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color_2_palette_id uuid REFERENCES public.cover_color_palettes (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cover_templates.color_1_palette_id IS 'Hauptfarbe (color-1) für SVG data-color-role';
COMMENT ON COLUMN public.cover_templates.color_2_palette_id IS 'Akzentfarbe (color-2) für SVG data-color-role';

-- ========== Seed: Schema-Elemente (idempotent) ==========
INSERT INTO public.cover_schema_elements (element_id, label, placeholder, element_type, required, layer, sort_order) VALUES
  ('front-text-title',      'Titel der Arbeit',        'Auswirkungen der Digitalisierung auf...', 'text', true,  'front', 10),
  ('front-text-subtitle',   'Untertitel',              'Eine empirische Untersuchung',              'text', false, 'front', 20),
  ('front-text-author',     'Autor / Verfasser',       'Max Mustermann',                           'text', true,  'front', 30),
  ('front-text-degree',     'Studiengang / Abschluss', 'Bachelorarbeit Wirtschaftsinformatik',     'text', false, 'front', 40),
  ('front-text-university', 'Hochschule',              'Hochschule Fulda',                         'text', false, 'front', 50),
  ('front-text-year',       'Jahr',                    '2024',                                     'text', false, 'front', 60),
  ('front-img-logo',        'Logo (Hochschule)',       '',                                          'image', false, 'front', 70),
  ('spine-text-title',      'Rücken: Titel',           'Auswirkungen der Digitalisierung',         'text', false, 'spine', 80),
  ('spine-text-author',     'Rücken: Autor',           'Mustermann',                               'text', false, 'spine', 90),
  ('spine-text-year',       'Rücken: Jahr',            '2024',                                     'text', false, 'spine', 100),
  ('back-text-abstract',    'Kurzfassung (Rückseite)', 'Kurze Beschreibung der Arbeit...',         'text', false, 'back',  110)
ON CONFLICT (element_id) DO UPDATE SET
  label       = EXCLUDED.label,
  placeholder = EXCLUDED.placeholder,
  element_type = EXCLUDED.element_type,
  required    = EXCLUDED.required,
  layer       = EXCLUDED.layer,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = now();
