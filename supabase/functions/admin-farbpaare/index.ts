// Edge Function: admin-farbpaare – CRUD für Tabelle farbpaare (Dashboard, Admin)
// Header: x-admin-secret = ADMIN_SECRET
// GET: Liefert alle Einträge (sort_order). POST: Anlegen. PATCH: Aktualisieren. DELETE: Löschen (entfernt ID aus allen template_zuordnung.color_ids).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
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
        .from('farbpaare')
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

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        farbbezeichnung?: string
        rgb?: string
        cmyk?: string
        spotbezeichnung?: string
        sort_order?: number
      }
      const farbbezeichnung = (body.farbbezeichnung ?? '').trim() || null
      const rgb = (body.rgb ?? '').trim() || null
      const cmyk = (body.cmyk ?? '').trim() ?? ''
      const spotbezeichnung = (body.spotbezeichnung ?? '').trim() ?? ''
      const sort_order = typeof body.sort_order === 'number' ? body.sort_order : 0
      if (!farbbezeichnung || !rgb) {
        return new Response(JSON.stringify({ error: 'farbbezeichnung und rgb sind erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await supabase
        .from('farbpaare')
        .insert({
          farbbezeichnung,
          rgb,
          cmyk,
          spotbezeichnung,
          sort_order,
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

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({})) as {
        id?: string
        farbbezeichnung?: string
        rgb?: string
        cmyk?: string
        spotbezeichnung?: string
        sort_order?: number
      }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.farbbezeichnung !== undefined) updates.farbbezeichnung = (body.farbbezeichnung ?? '').trim()
      if (body.rgb !== undefined) updates.rgb = (body.rgb ?? '').trim()
      if (body.cmyk !== undefined) updates.cmyk = (body.cmyk ?? '').trim()
      if (body.spotbezeichnung !== undefined) updates.spotbezeichnung = (body.spotbezeichnung ?? '').trim()
      if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order

      const { data, error } = await supabase
        .from('farbpaare')
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

    // DELETE: Zuerst aus allen template_zuordnung.color_ids entfernen, dann Zeile löschen.
    const body = await req.json().catch(() => ({})) as { id?: string }
    const id = (body.id ?? '').trim()
    if (!id) {
      return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: rows } = await supabase.from('template_zuordnung').select('template_filename, color_ids')
    const toUpdate = (rows ?? []).filter((r: { color_ids?: string[] }) => Array.isArray(r.color_ids) && r.color_ids.includes(id))
    for (const row of toUpdate) {
      const colorIds = (row.color_ids as string[]).filter((cid: string) => cid !== id)
      await supabase
        .from('template_zuordnung')
        .update({ color_ids: colorIds, updated_at: new Date().toISOString() })
        .eq('template_filename', row.template_filename)
    }
    const { error: delError } = await supabase.from('farbpaare').delete().eq('id', id)
    if (delError) {
      return new Response(JSON.stringify({ error: delError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
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
