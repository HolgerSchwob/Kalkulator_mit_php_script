-- 1) Template-Gruppe paperback_foil (Editor + get-cover-template-group), falls noch nicht vorhanden
INSERT INTO public.cover_template_groups (
  id, display_name, spine_offset_mm, visible_cover_height_mm, u1_width_mm,
  default_spine_width_mm, falz_zone_width_mm, dimensions, sort_order
) VALUES (
  'paperback_foil',
  'Paperback (Deckfolie / Folienvariante)',
  0,
  297,
  204,
  35,
  6,
  '{"svg_total_width": 500, "svg_total_height": 330, "svg_center_x": 250}'::jsonb,
  4
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

-- 2) Dateiname nur noch pro Gruppe eindeutig (nicht global), damit z. B. dieselbe SVG-Datei
--    in paperback_foil und paperback_modern erlaubt ist.
ALTER TABLE public.cover_templates DROP CONSTRAINT IF EXISTS cover_templates_filename_key;

-- Falls ein alter Index existiert
DROP INDEX IF EXISTS public.cover_templates_filename_key;

CREATE UNIQUE INDEX IF NOT EXISTS cover_templates_gruppe_filename_key
  ON public.cover_templates (gruppe, filename);

COMMENT ON INDEX public.cover_templates_gruppe_filename_key IS
  'Eindeutigkeit von Dateinamen je Template-Gruppe (gruppe), nicht projektweit.';
