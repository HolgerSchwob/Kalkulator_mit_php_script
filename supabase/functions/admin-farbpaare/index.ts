// Edge Function: admin-farbpaare – CRUD für cover_farbpaare (Dashboard, Admin)
// Header: x-admin-secret = ADMIN_SECRET
// GET:    Alle Farbpaare (sort_order).
// POST:   Neues Paar anlegen.
// PATCH:  Paar aktualisieren.
// DELETE: Paar löschen (cascade entfernt Einträge in cover_template_paletten automatisch).

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const allowed = ['GET', 'POST', 'PATCH', 'DELETE']
  if (!allowed.includes(req.method)) return json({ error: 'Method not allowed' }, 405)
  if (!checkAdmin(req)) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── GET ────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('cover_farbpaare')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      return json({ data: data ?? [] })
    }

    // ── POST ───────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>
      const name = String(body.name ?? '').trim()
      const color1_rgb = String(body.color1_rgb ?? '').trim()
      const color2_rgb = String(body.color2_rgb ?? '').trim()
      if (!name || !color1_rgb || !color2_rgb) {
        return json({ error: 'name, color1_rgb und color2_rgb sind erforderlich.' }, 400)
      }
      const { data, error } = await supabase
        .from('cover_farbpaare')
        .insert({
          name,
          color1_name:  String(body.color1_name  ?? '').trim(),
          color1_rgb,
          color1_cmyk:  String(body.color1_cmyk  ?? '').trim(),
          color1_spot:  String(body.color1_spot  ?? '').trim(),
          color2_name:  String(body.color2_name  ?? '').trim(),
          color2_rgb,
          color2_cmyk:  String(body.color2_cmyk  ?? '').trim(),
          color2_spot:  String(body.color2_spot  ?? '').trim(),
          sort_order:   typeof body.sort_order === 'number' ? body.sort_order : 0,
          active:       body.active !== false,
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    // ── PATCH ──────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>
      const id = String(body.id ?? '').trim()
      if (!id) return json({ error: 'id erforderlich.' }, 400)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      const fields = [
        'name',
        'color1_name', 'color1_rgb', 'color1_cmyk', 'color1_spot',
        'color2_name', 'color2_rgb', 'color2_cmyk', 'color2_spot',
      ]
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = String(body[f] ?? '').trim()
      }
      if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
      if (typeof body.active === 'boolean') updates.active = body.active

      const { data, error } = await supabase
        .from('cover_farbpaare')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    // cover_template_paletten hat ON DELETE CASCADE → wird automatisch bereinigt
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = String(body.id ?? '').trim()
    if (!id) return json({ error: 'id erforderlich.' }, 400)

    const { error } = await supabase.from('cover_farbpaare').delete().eq('id', id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })

  } catch {
    return json({ error: 'Interner Fehler.' }, 500)
  }
})
