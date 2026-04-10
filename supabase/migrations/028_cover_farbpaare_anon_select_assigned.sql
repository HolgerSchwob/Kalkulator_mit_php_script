-- Shop-Editor: Farbpaare müssen lesbar sein, wenn sie einem Template zugewiesen sind.
-- Bisher nur active=true – zugewiesene aber inaktive Paare oder Embed/RLS-Kombinationen konnten leere Paletten ergeben.

DROP POLICY IF EXISTS "cover_farbpaare_anon_select" ON public.cover_farbpaare;

CREATE POLICY "cover_farbpaare_anon_select"
  ON public.cover_farbpaare FOR SELECT
  TO anon
  USING (
    active = true
    OR EXISTS (
      SELECT 1
      FROM public.cover_template_paletten ctp
      WHERE ctp.farbpaar_id = cover_farbpaare.id
    )
  );
