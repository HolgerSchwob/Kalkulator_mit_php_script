-- Im Supabase SQL Editor ausführen: Templates vs. zugewiesene Farbpaare
-- palette_count = 0 → im SCG-Editor Tab „Auswahl“ Farbpaare anhaken und speichern

SELECT
  ct.id,
  ct.filename,
  ct.display_name,
  ct.active,
  ct.gruppe,
  COUNT(ctp.farbpaar_id) AS palette_count
FROM public.cover_templates ct
LEFT JOIN public.cover_template_paletten ctp ON ctp.template_id = ct.id
GROUP BY ct.id, ct.filename, ct.display_name, ct.active, ct.gruppe
ORDER BY ct.gruppe NULLS LAST, ct.sort_order;

-- Inaktive Farbpaare (werden per Edge Function trotzdem geliefert, wenn zugewiesen)
-- SELECT id, name, active FROM public.cover_farbpaare ORDER BY sort_order;
