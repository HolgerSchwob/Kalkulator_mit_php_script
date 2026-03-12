-- Farbpaare: eine Zeile = eine Farbe (Bezeichnung, RGB, CMYK, Spot für RIP)
-- Template-Zuordnung: pro Template-Dateiname die erlaubten Farb-IDs (JSON-Array)
-- Im Dashboard ausführbar: SQL Editor → New query → einfügen → Run

-- ========== Tabelle: Farbpaare ==========
CREATE TABLE IF NOT EXISTS public.farbpaare (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farbbezeichnung text NOT NULL,
  rgb text NOT NULL,
  cmyk text NOT NULL,
  spotbezeichnung text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farbpaare_sort ON public.farbpaare(sort_order);

COMMENT ON TABLE public.farbpaare IS 'Farbpalette: Bezeichnung (z.B. dunkelblau), RGB, CMYK, Spotbezeichnung für RIP. Editor und Dashboard referenzieren über id.';

ALTER TABLE public.farbpaare ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farbpaare_anon_select"
  ON public.farbpaare FOR SELECT
  TO anon
  USING (true);


-- ========== Tabelle: Template-Zuordnung ==========
CREATE TABLE IF NOT EXISTS public.template_zuordnung (
  template_filename text PRIMARY KEY,
  gruppe text NOT NULL DEFAULT '',
  color_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.template_zuordnung IS 'Pro Template (Dateiname) die erlaubten Farb-IDs aus farbpaare. color_ids = JSON-Array von UUIDs. Gruppe für spätere Filterung.';

ALTER TABLE public.template_zuordnung ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_zuordnung_anon_select"
  ON public.template_zuordnung FOR SELECT
  TO anon
  USING (true);
