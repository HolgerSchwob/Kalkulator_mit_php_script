-- cover_color_palettes: gleiche semantischen Felder wie farbpaare (CMYK, Spot für RIP)
-- Pflichtenheft / SVG-Editor: Anzeige konsistent mit Shop-Konfiguration

ALTER TABLE public.cover_color_palettes
  ADD COLUMN IF NOT EXISTS cmyk text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS spotbezeichnung text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.cover_color_palettes.cmyk IS 'CMYK wie in farbpaare, z. B. 100,50,0,0';
COMMENT ON COLUMN public.cover_color_palettes.spotbezeichnung IS 'Spotname für RIP (wie farbpaare.spotbezeichnung)';
