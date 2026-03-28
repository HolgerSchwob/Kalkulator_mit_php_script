-- ============================================================
-- Migration 023: Sauberes Farbsystem
-- ============================================================
-- Vorher: farbpaare (Einzelfarben) + template_zuordnung (implizite Paare per ID-Array)
--         cover_color_palettes (altes System, Einzelfarben per FK am Template)
-- Nachher: cover_farbpaare (echtes Paar als Einheit)
--           cover_template_paletten (Junction: template_id ↔ farbpaar_id)
-- Keine echten Daten vorhanden – alte Tabellen werden direkt gedroppt.
-- ============================================================

-- ── Alte Tabellen entfernen ───────────────────────────────────────────────────
DROP TABLE IF EXISTS public.template_zuordnung CASCADE;
DROP TABLE IF EXISTS public.cover_color_palettes CASCADE;
DROP TABLE IF EXISTS public.farbpaare CASCADE;

-- Alte FK-Spalten aus cover_templates entfernen (waren auf cover_color_palettes)
ALTER TABLE public.cover_templates
  DROP COLUMN IF EXISTS color_1_palette_id,
  DROP COLUMN IF EXISTS color_2_palette_id;

-- ── cover_farbpaare: ein Farbpaar als echte atomare Einheit ──────────────────
CREATE TABLE IF NOT EXISTS public.cover_farbpaare (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL DEFAULT '',        -- z. B. "Navy / Gold"
  color1_name   text        NOT NULL DEFAULT '',        -- z. B. "Navy"
  color1_rgb    text        NOT NULL DEFAULT '',        -- z. B. "#1a2f5a"
  color1_cmyk   text        NOT NULL DEFAULT '',        -- z. B. "100,75,0,45"
  color1_spot   text        NOT NULL DEFAULT '',        -- z. B. "HKS 41 K"
  color2_name   text        NOT NULL DEFAULT '',        -- z. B. "Gold"
  color2_rgb    text        NOT NULL DEFAULT '',        -- z. B. "#e8a000"
  color2_cmyk   text        NOT NULL DEFAULT '',        -- z. B. "0,30,100,9"
  color2_spot   text        NOT NULL DEFAULT '',        -- z. B. "HKS 92 K"
  sort_order    integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_farbpaare_sort ON public.cover_farbpaare (sort_order);

COMMENT ON TABLE public.cover_farbpaare IS
  'Globaler Farb-Pool: jedes Farbpaar (Farbe 1 + Farbe 2) als atomare Einheit mit RGB, CMYK, Spot. '
  'Zuweisung zu Templates über cover_template_paletten.';

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.cover_farbpaare_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cover_farbpaare_updated_at ON public.cover_farbpaare;
CREATE TRIGGER cover_farbpaare_updated_at
  BEFORE UPDATE ON public.cover_farbpaare
  FOR EACH ROW EXECUTE FUNCTION public.cover_farbpaare_touch_updated_at();

-- RLS
ALTER TABLE public.cover_farbpaare ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_farbpaare_anon_select"
  ON public.cover_farbpaare FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "cover_farbpaare_service_all"
  ON public.cover_farbpaare FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── cover_template_paletten: Junction Template ↔ Farbpaar ────────────────────
CREATE TABLE IF NOT EXISTS public.cover_template_paletten (
  template_id   uuid    NOT NULL REFERENCES public.cover_templates (id) ON DELETE CASCADE,
  farbpaar_id   uuid    NOT NULL REFERENCES public.cover_farbpaare  (id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (template_id, farbpaar_id)
);

CREATE INDEX IF NOT EXISTS idx_cover_template_paletten_template
  ON public.cover_template_paletten (template_id, sort_order);

COMMENT ON TABLE public.cover_template_paletten IS
  'Welche Farbpaare sind für ein Template im Shop wählbar? '
  'Jede Zeile = ein verfügbares Farbpaar für dieses Template.';

-- RLS
ALTER TABLE public.cover_template_paletten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_template_paletten_anon_select"
  ON public.cover_template_paletten FOR SELECT TO anon
  USING (true);

CREATE POLICY "cover_template_paletten_service_all"
  ON public.cover_template_paletten FOR ALL TO service_role
  USING (true) WITH CHECK (true);
