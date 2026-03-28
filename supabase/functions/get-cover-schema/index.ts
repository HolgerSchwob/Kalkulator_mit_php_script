// Edge Function: get-cover-schema – Schema-Elemente + Farbpaare
// GET (öffentlich):              nur aktive Einträge.
// GET mit x-admin-secret:        alle Einträge inkl. deaktiviert (Schema-Manager im Dashboard).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function isAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const admin = isAdmin(req)

  try {
    // Schema-Felder
    let qEl = supabase
      .from('cover_schema_elements')
      .select('id, element_id, label, placeholder, element_type, required, layer, sort_order, active, created_at, updated_at')
    if (!admin) qEl = qEl.eq('active', true)
    const { data: elements, error: elErr } = await qEl.order('sort_order', { ascending: true })
    if (elErr) {
      return new Response(JSON.stringify({ error: elErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Farbpaare (globaler Pool)
    let qFp = supabase
      .from('cover_farbpaare')
      .select('id, name, color1_name, color1_rgb, color1_cmyk, color1_spot, color2_name, color2_rgb, color2_cmyk, color2_spot, sort_order, active, created_at, updated_at')
    if (!admin) qFp = qFp.eq('active', true)
    const { data: farbpaare, error: fpErr } = await qFp.order('sort_order', { ascending: true })
    if (fpErr) {
      return new Response(JSON.stringify({ error: fpErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        elements:  elements  ?? [],
        farbpaare: farbpaare ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(JSON.stringify({ error: 'Interner Fehler.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
