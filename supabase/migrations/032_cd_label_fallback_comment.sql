-- Kommentar: Fallback-Dateiname DEFAULT_CDLABEL.svg (siehe docs/CD_LABEL_NAMING_AND_ASSIGNMENT.md)

COMMENT ON COLUMN public.cover_templates.cd_label_template_id IS
  'Optional: UUID eines CD-Label-Templates (cover_templates, typisch gruppe cd_label). NULL = im Shop Fallback: zuerst DEFAULT_CDLABEL.svg, sonst legacy default.svg in cd_label.';
