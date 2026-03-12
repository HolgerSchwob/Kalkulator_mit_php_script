// Supabase Edge Function: SpotColorPalette – Admin: Spotfarben-Palette laden/speichern (SVG-Preflight)
// GET: Liefert alle Einträge (mit x-admin-secret für Konsistenz; Lesen geht auch direkt per anon über Tabelle).
// POST: Body = { entries: [ { id?, name, srgb, cmyk, sort_order } ] } – vollständiger Ersatz der Palette (Admin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!checkAdmin(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('spot_color_palette')
        .select('id, name, srgb, cmyk, sort_order, updated_at')
        .order('sort_order', { ascending: true })

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ entries: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST: Ersetze Palette durch übergebene Einträge
    const body = await req.json().catch(() => ({})) as { entries?: Array<{ id?: string; name?: string; srgb?: string; cmyk?: string; sort_order?: number }> }
    const entries = Array.isArray(body.entries) ? body.entries : []

    const idsToKeep: string[] = []
    for (const row of entries) {
      const name = (row.name ?? '').trim()
      const srgb = (row.srgb ?? '').trim()
      const cmyk = (row.cmyk ?? '').trim()
      const sort_order = typeof row.sort_order === 'number' ? row.sort_order : 0
      if (!name) continue

      if (row.id) {
        const { error: upErr } = await supabase
          .from('spot_color_palette')
          .update({ name, srgb, cmyk, sort_order, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (upErr) {
          return new Response(JSON.stringify({ error: upErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        idsToKeep.push(row.id)
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('spot_color_palette')
          .insert({ name, srgb, cmyk, sort_order })
          .select('id')
          .single()
        if (insErr) {
          return new Response(JSON.stringify({ error: insErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (inserted?.id) idsToKeep.push(inserted.id)
      }
    }

    // Entferne Einträge, die nicht mehr in der Liste sind
    const { data: existing } = await supabase.from('spot_color_palette').select('id')
    const toDelete = (existing ?? []).filter((r: { id: string }) => !idsToKeep.includes(r.id)).map((r: { id: string }) => r.id)
    if (toDelete.length > 0) {
      await supabase.from('spot_color_palette').delete().in('id', toDelete)
    }

    const { data: list, error: listErr } = await supabase
      .from('spot_color_palette')
      .select('id, name, srgb, cmyk, sort_order, updated_at')
      .order('sort_order', { ascending: true })

    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ entries: list ?? [] }), {
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
