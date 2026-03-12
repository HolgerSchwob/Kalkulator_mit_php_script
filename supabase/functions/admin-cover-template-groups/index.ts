// Edge Function: admin-cover-template-groups – Dashboard: Gruppen-Config lesen/schreiben
// GET: Alle Gruppen. PATCH: Eine Gruppe aktualisieren (id + Felder).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
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

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
        .from('cover_template_groups')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH: Gruppe aktualisieren
    const body = await req.json().catch(() => ({})) as {
      id?: string
      visible_cover_height_mm?: number
      u1_width_mm?: number
      default_spine_width_mm?: number | null
      falz_zone_width_mm?: number
      dimensions?: Record<string, unknown>
    }
    const id = (body.id ?? '').trim()
    if (!id) {
      return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.visible_cover_height_mm === 'number') updates.visible_cover_height_mm = body.visible_cover_height_mm
    if (typeof body.u1_width_mm === 'number') updates.u1_width_mm = body.u1_width_mm
    if (body.default_spine_width_mm !== undefined) updates.default_spine_width_mm = body.default_spine_width_mm
    if (typeof body.falz_zone_width_mm === 'number') updates.falz_zone_width_mm = body.falz_zone_width_mm
    if (body.dimensions != null && typeof body.dimensions === 'object') updates.dimensions = body.dimensions

    const { data, error } = await supabase
      .from('cover_template_groups')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
