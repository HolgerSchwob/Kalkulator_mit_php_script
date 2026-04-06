-- Schema-Ergänzung: tpl-topic (Thema / Fach) — in SSOT dokumentiert, fehlte in Seed 020/024
INSERT INTO public.cover_schema_elements (element_id, label, placeholder, element_type, required, layer, sort_order) VALUES
  ('tpl-topic', 'Thema / Fach', 'Stichworte oder Kurzbeschreibung...', 'text', false, 'front', 65)
ON CONFLICT (element_id) DO UPDATE SET
  label       = EXCLUDED.label,
  placeholder = EXCLUDED.placeholder,
  element_type = EXCLUDED.element_type,
  required    = EXCLUDED.required,
  layer       = EXCLUDED.layer,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = now();
