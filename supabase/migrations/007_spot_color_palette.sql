-- Spotfarben-Palette (Lookup): Name → sRGB + CMYK für SVG-Preflight und PDF-Post-Processing
-- Öffentlich lesbar (anon), Schreiben nur über Edge Function mit Admin-Secret

CREATE TABLE IF NOT EXISTS public.spot_color_palette (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  srgb text NOT NULL,
  cmyk text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spot_color_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_spot_color_palette_sort ON public.spot_color_palette(sort_order);

COMMENT ON TABLE public.spot_color_palette IS 'Lookup: Spotfarbname → sRGB und CMYK; im SVG-Preflight-Tool global editierbar, für data-spot/data-cmyk in SVGs und PDF-Post-Processing.';

ALTER TABLE public.spot_color_palette ENABLE ROW LEVEL SECURITY;

-- Lesen für alle (Tool im Dashboard-iframe kann mit anon Key laden)
CREATE POLICY "spot_color_palette_anon_select"
  ON public.spot_color_palette FOR SELECT
  TO anon
  USING (true);

-- Schreiben nur über Service Role (Edge Function spot-color-palette)
-- Keine Policy für anon/authenticated INSERT/UPDATE/DELETE.
