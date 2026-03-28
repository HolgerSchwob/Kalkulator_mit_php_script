// Edge Function: update-cover-palettes – CRUD cover_color_palettes (Admin, x-admin-secret)
// POST JSON: { operation: 'create' | 'update' | 'deactivate' | 'delete', palette: { ... } }

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

async function paletteReferencedByTemplates(supabase: SupabaseClient, paletteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('cover_templates')
    .select('id')
    .or(`color_1_palette_id.eq.${paletteId},color_2_palette_id.eq.${paletteId}`)
    .limit(1)
  if (error) return true
  return Array.isArray(data) && data.length > 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
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

  type PalettePayload = {
    id?: string
    name?: string
    hex?: string
    cmyk?: string
    spotbezeichnung?: string
    sort_order?: number
    active?: boolean
  }

  const body = (await req.json().catch(() => ({}))) as {
    operation?: string
    palette?: PalettePayload
  }
  const operation = (body.operation ?? '').trim().toLowerCase()
  const p = body.palette ?? {}

  try {
    if (operation === 'create') {
      const name = (p.name ?? '').trim()
      const hex = (p.hex ?? '').trim()
      if (!name || !hex) {
        return new Response(JSON.stringify({ error: 'name und hex sind erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await supabase
        .from('cover_color_palettes')
        .insert({
          name,
          hex,
          sort_order: typeof p.sort_order === 'number' ? p.sort_order : 0,
          active: p.active !== undefined ? Boolean(p.active) : true,
        })
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
    }

    if (operation === 'update') {
      const id = (p.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'palette.id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const updates: Record<string, unknown> = {}
      if (p.name !== undefined) updates.name = String(p.name).trim()
      if (p.hex !== undefined) updates.hex = String(p.hex).trim()
      if (p.cmyk !== undefined) updates.cmyk = String(p.cmyk).trim()
      if (p.spotbezeichnung !== undefined) updates.spotbezeichnung = String(p.spotbezeichnung).trim()
      if (typeof p.sort_order === 'number') updates.sort_order = p.sort_order
      if (p.active !== undefined) updates.active = Boolean(p.active)

      const { data, error } = await supabase
        .from('cover_color_palettes')
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
    }

    if (operation === 'deactivate') {
      const id = (p.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'palette.id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await supabase
        .from('cover_color_palettes')
        .update({ active: false })
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
    }

    if (operation === 'delete') {
      const id = (p.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'palette.id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: row, error: fetchErr } = await supabase
        .from('cover_color_palettes')
        .select('id, active')
        .eq('id', id)
        .maybeSingle()

      if (fetchErr || !row) {
        return new Response(JSON.stringify({ error: 'Eintrag nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (row.active) {
        return new Response(
          JSON.stringify({ error: 'Nur löschen, wenn die Farbe deaktiviert ist (active=false).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const ref = await paletteReferencedByTemplates(supabase, id)
      if (ref) {
        return new Response(
          JSON.stringify({ error: 'Farbe ist noch einem Cover-Template zugeordnet.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { error: delErr } = await supabase.from('cover_color_palettes').delete().eq('id', id)
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unbekannte operation.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
