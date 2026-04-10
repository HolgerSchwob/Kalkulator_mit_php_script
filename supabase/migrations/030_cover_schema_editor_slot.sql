-- Semantische Rolle eines Schema-Feldes im Webshop-Editor (z. B. Buchblock-Vorschau in <image>).
-- SSOT-Beschreibung: docs/SSOT_SVG_COVER_TEMPLATES.md (Abschnitt Editor-Slots).

ALTER TABLE public.cover_schema_elements
  ADD COLUMN IF NOT EXISTS editor_slot text NOT NULL DEFAULT 'none';

ALTER TABLE public.cover_schema_elements
  DROP CONSTRAINT IF EXISTS cover_schema_elements_editor_slot_check;

ALTER TABLE public.cover_schema_elements
  ADD CONSTRAINT cover_schema_elements_editor_slot_check
  CHECK (editor_slot IN ('none', 'book_block_first_page'));

COMMENT ON COLUMN public.cover_schema_elements.editor_slot IS
  'Webshop-Editor: Sonderlogik pro element_id. none=normal; book_block_first_page=Raster aus Buchblock-PDF Seite 1 in <image id=element_id>.';
