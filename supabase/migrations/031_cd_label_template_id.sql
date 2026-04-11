-- CD-Label: optionales Layout pro Buchdecken-Template (Zeile in cover_templates mit gruppe = cd_label).
-- Mehrere Buchdecken-Zeilen können dieselbe cd_label_template_id tragen.

ALTER TABLE public.cover_templates
  ADD COLUMN IF NOT EXISTS cd_label_template_id uuid REFERENCES public.cover_templates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cover_templates_cd_label_template_id
  ON public.cover_templates (cd_label_template_id)
  WHERE cd_label_template_id IS NOT NULL;

COMMENT ON COLUMN public.cover_templates.cd_label_template_id IS
  'Optional: UUID eines CD-Label-Templates (gleiche Tabelle, typisch gruppe cd_label). NULL = im Shop Fallback default.svg.';
