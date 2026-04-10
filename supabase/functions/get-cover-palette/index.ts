// Edge Function: get-cover-palette – Shop: Farbpaare für ein Cover-Template (ohne Client-RLS-Embed-Probleme).
// GET ?template_id=<uuid> – nur zugewiesene Paare, Reihenfolge wie cover_template_paletten.sort_order.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    const url = new URL(req.url)
    const templateId = url.searchParams.get('template_id')?.trim() || ''
    if (!templateId || !UUID_RE.test(templateId)) {
      return new Response(JSON.stringify({ error: 'Parameter template_id (UUID) erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: ct, error: ctErr } = await supabase
      .from('cover_templates')
      .select('id, filename, active')
      .eq('id', templateId)
      .maybeSingle()

    if (ctErr) {
      return new Response(JSON.stringify({ error: ctErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!ct) {
      return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!ct.active) {
      return new Response(JSON.stringify({ pairs: [], template_id: templateId, filename: ct.filename, inactive: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: links, error: lErr } = await supabase
      .from('cover_template_paletten')
      .select('farbpaar_id, sort_order')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })

    if (lErr) {
      return new Response(JSON.stringify({ error: lErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ids = (links ?? []).map((l: { farbpaar_id: string }) => l.farbpaar_id).filter(Boolean)
    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ pairs: [], template_id: templateId, filename: ct.filename }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: rows, error: fErr } = await supabase
      .from('cover_farbpaare')
      .select('id, name, color1_name, color1_rgb, color2_name, color2_rgb')
      .in('id', ids)

    if (fErr) {
      return new Response(JSON.stringify({ error: fErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const byId = new Map((rows ?? []).map((r: { id: string }) => [r.id, r]))
    const pairs = ids
      .map((id: string) => byId.get(id))
      .filter(Boolean)
      .map((fp: Record<string, string>) => ({
        id: fp.id,
        name: fp.name || 'Farbpaar',
        color1: fp.color1_rgb || '#888888',
        name1: fp.color1_name || 'Farbe 1',
        color2: fp.color2_rgb || '#cccccc',
        name2: fp.color2_name || 'Farbe 2',
      }))

    return new Response(JSON.stringify({ pairs, template_id: templateId, filename: ct.filename }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
