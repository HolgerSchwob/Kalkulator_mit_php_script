-- Externer Download-Link für Druckdatei (bei Dateien > 45 MB, statt Upload in Storage)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS main_pdf_external_url text;

COMMENT ON COLUMN public.orders.main_pdf_external_url IS 'Download-Link zur Druckdatei, wenn Kunde wegen Dateigröße extern hochgeladen hat (z. B. WeTransfer/SwissTransfer).';
