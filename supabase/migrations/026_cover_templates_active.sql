-- Shop-Sichtbarkeit: nur active=true erscheint in get-cover-templates (Kalkulator).

ALTER TABLE public.cover_templates
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cover_templates.active IS
  'true = im Shop wählbar (get-cover-templates); false = ausgeblendet, nur Admin-Liste.';

CREATE INDEX IF NOT EXISTS idx_cover_templates_gruppe_active_sort
  ON public.cover_templates (gruppe, active, sort_order);
