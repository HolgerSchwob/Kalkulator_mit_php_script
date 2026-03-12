-- Kennzeichnung, dass Druckdaten lokal (z. B. NAS) gesichert wurden (FileAgent Sync)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS local_synced_at timestamptz;

COMMENT ON COLUMN public.orders.local_synced_at IS 'Zeitpunkt, zu dem die Auftragsdateien (PDF, SVGs) vom FileAgent auf das lokale System (NAS) synchronisiert wurden.';
