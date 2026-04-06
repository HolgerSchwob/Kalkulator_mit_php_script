-- SSOT: cover_schema_elements.element_id aligned with HardcoverEditor (tpl-*)
-- Maps legacy seed IDs from migration 020 to canonical tpl-* IDs.
-- Safe to re-run: updates only rows that still use the old element_id.

UPDATE public.cover_schema_elements SET element_id = 'tpl-title'       WHERE element_id = 'front-text-title';
UPDATE public.cover_schema_elements SET element_id = 'tpl-subtitle'    WHERE element_id = 'front-text-subtitle';
UPDATE public.cover_schema_elements SET element_id = 'tpl-name'       WHERE element_id = 'front-text-author';
UPDATE public.cover_schema_elements SET element_id = 'tpl-degree'     WHERE element_id = 'front-text-degree';
UPDATE public.cover_schema_elements SET element_id = 'tpl-university' WHERE element_id = 'front-text-university';
UPDATE public.cover_schema_elements SET element_id = 'tpl-year'       WHERE element_id = 'front-text-year';
UPDATE public.cover_schema_elements SET element_id = 'tpl-logo-main'  WHERE element_id = 'front-img-logo';
UPDATE public.cover_schema_elements SET element_id = 'tpl-title-spine' WHERE element_id = 'spine-text-title';
UPDATE public.cover_schema_elements SET element_id = 'tpl-name-spine'  WHERE element_id = 'spine-text-author';
UPDATE public.cover_schema_elements SET element_id = 'tpl-year-spine'  WHERE element_id = 'spine-text-year';
UPDATE public.cover_schema_elements SET element_id = 'tpl-abstract'    WHERE element_id = 'back-text-abstract';
