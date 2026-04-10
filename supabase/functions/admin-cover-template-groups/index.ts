// Edge Function: admin-cover-template-groups – Dashboard: Gruppen-Config lesen/schreiben
// GET: Alle Gruppen. PATCH: Eine Gruppe aktualisieren. POST: Neue Gruppe anlegen. DELETE: Gruppe löschen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

const GROUP_ID_RE = /^[a-z0-9_]+$/

/** Akzeptiert Zahlen aus JSON auch als String (Proxies, ältere Clients); sonst schlägt PATCH still fehl. */
function coerceFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    if (t === '') return undefined
    const n = Number(t)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

const DEFAULTS_NEW_GROUP = {
  spine_offset_mm: 0,
  visible_cover_height_mm: 302,
  u1_width_mm: 215,
  default_spine_width_mm: 35 as number | null,
  falz_zone_width_mm: 8,
  dimensions: { svg_total_width: 500, svg_total_height: 330, svg_center_x: 250 },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST' && req.method !== 'DELETE') {
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

    if (req.method === 'DELETE') {
      const body = (await req.json().catch(() => ({}))) as { id?: string }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { count, error: countErr } = await supabase
        .from('cover_templates')
        .select('id', { count: 'exact', head: true })
        .eq('gruppe', id)

      if (countErr) {
        return new Response(JSON.stringify({ error: countErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const n = typeof count === 'number' ? count : 0
      if (n > 0) {
        return new Response(
          JSON.stringify({
            error: `Es gibt noch ${n} Template(s) mit gruppe „${id}“. Bitte zuerst verschieben oder löschen.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { error: delErr } = await supabase.from('cover_template_groups').delete().eq('id', id)

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        id?: string
        display_name?: string
        spine_offset_mm?: number
        visible_cover_height_mm?: number
        u1_width_mm?: number
        default_spine_width_mm?: number | null
        falz_zone_width_mm?: number
        dimensions?: Record<string, unknown>
        sort_order?: number
      }
      const id = (body.id ?? '').trim().toLowerCase()
      if (!id || !GROUP_ID_RE.test(id)) {
        return new Response(
          JSON.stringify({
            error: 'id erforderlich (nur Kleinbuchstaben, Ziffern, Unterstrich).',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: existing } = await supabase.from('cover_template_groups').select('id').eq('id', id).maybeSingle()
      if (existing) {
        return new Response(JSON.stringify({ error: 'Diese Gruppen-ID existiert bereits.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: maxRow } = await supabase
        .from('cover_template_groups')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sortParsed = coerceFiniteNumber(body.sort_order)
      const nextSort =
        sortParsed !== undefined && Number.isInteger(sortParsed)
          ? sortParsed
          : (typeof maxRow?.sort_order === 'number' ? maxRow.sort_order + 1 : 0)

      const display_name = (body.display_name ?? '').toString().trim() || id
      const dimensions =
        body.dimensions != null && typeof body.dimensions === 'object'
          ? body.dimensions
          : DEFAULTS_NEW_GROUP.dimensions

      const insert = {
        id,
        display_name,
        spine_offset_mm: coerceFiniteNumber(body.spine_offset_mm) ?? DEFAULTS_NEW_GROUP.spine_offset_mm,
        visible_cover_height_mm:
          coerceFiniteNumber(body.visible_cover_height_mm) ?? DEFAULTS_NEW_GROUP.visible_cover_height_mm,
        u1_width_mm: coerceFiniteNumber(body.u1_width_mm) ?? DEFAULTS_NEW_GROUP.u1_width_mm,
        default_spine_width_mm:
          body.default_spine_width_mm === undefined
            ? DEFAULTS_NEW_GROUP.default_spine_width_mm
            : body.default_spine_width_mm === null
              ? null
              : (coerceFiniteNumber(body.default_spine_width_mm) ?? DEFAULTS_NEW_GROUP.default_spine_width_mm),
        falz_zone_width_mm:
          coerceFiniteNumber(body.falz_zone_width_mm) ?? DEFAULTS_NEW_GROUP.falz_zone_width_mm,
        dimensions,
        sort_order: nextSort,
      }

      const { data: row, error: insertErr } = await supabase
        .from('cover_template_groups')
        .insert(insert)
        .select()
        .single()

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH: Gruppe aktualisieren
    const body = await req.json().catch(() => ({})) as {
      id?: string
      display_name?: string
      spine_offset_mm?: number
      visible_cover_height_mm?: number
      u1_width_mm?: number
      default_spine_width_mm?: number | null
      falz_zone_width_mm?: number
      dimensions?: Record<string, unknown>
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
    if (typeof body.display_name === 'string') updates.display_name = body.display_name.trim()
    const spineOff = coerceFiniteNumber(body.spine_offset_mm)
    if (spineOff !== undefined) updates.spine_offset_mm = spineOff
    const visH = coerceFiniteNumber(body.visible_cover_height_mm)
    if (visH !== undefined) updates.visible_cover_height_mm = visH
    const u1 = coerceFiniteNumber(body.u1_width_mm)
    if (u1 !== undefined) updates.u1_width_mm = u1
    if (body.default_spine_width_mm !== undefined) {
      if (body.default_spine_width_mm === null) updates.default_spine_width_mm = null
      else {
        const d = coerceFiniteNumber(body.default_spine_width_mm)
        if (d !== undefined) updates.default_spine_width_mm = d
      }
    }
    const falz = coerceFiniteNumber(body.falz_zone_width_mm)
    if (falz !== undefined) updates.falz_zone_width_mm = falz
    const sortU = coerceFiniteNumber(body.sort_order)
    if (sortU !== undefined && Number.isInteger(sortU)) updates.sort_order = sortU
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
