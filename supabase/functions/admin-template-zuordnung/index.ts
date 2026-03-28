// Edge Function: admin-template-zuordnung – Palette pro Template (Dashboard, Admin)
// Verwaltet cover_template_paletten (template_id ↔ farbpaar_id).
// Header: x-admin-secret = ADMIN_SECRET
//
// GET  ?template_id=uuid   → { farbpaar_ids: string[], assignments: [{farbpaar_id, sort_order}] }
// PUT  { template_id, farbpaar_ids: string[] }
//      → ersetzt alle Einträge für dieses Template (delete + insert)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
  if (req.method !== 'GET' && req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)
  if (!checkAdmin(req)) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── GET ────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const templateId = url.searchParams.get('template_id')?.trim()
      if (!templateId) return json({ error: 'template_id erforderlich.' }, 400)

      const { data, error } = await supabase
        .from('cover_template_paletten')
        .select('farbpaar_id, sort_order')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })

      if (error) return json({ error: error.message }, 500)

      const assignments = data ?? []
      return json({
        farbpaar_ids: assignments.map((r: { farbpaar_id: string }) => r.farbpaar_id),
        assignments,
      })
    }

    // ── PUT ────────────────────────────────────────────────────────────────────
    // Ersetzt die gesamte Palette für ein Template.
    const body = await req.json().catch(() => ({})) as {
      template_id?: string
      farbpaar_ids?: string[]
    }
    const template_id = (body.template_id ?? '').trim()
    if (!template_id) return json({ error: 'template_id erforderlich.' }, 400)

    const farbpaar_ids = Array.isArray(body.farbpaar_ids) ? body.farbpaar_ids : []

    // Alles für dieses Template löschen
    const { error: delErr } = await supabase
      .from('cover_template_paletten')
      .delete()
      .eq('template_id', template_id)
    if (delErr) return json({ error: delErr.message }, 500)

    // Neu einfügen mit sort_order nach Reihenfolge im Array
    if (farbpaar_ids.length > 0) {
      const rows = farbpaar_ids.map((farbpaar_id: string, i: number) => ({
        template_id,
        farbpaar_id,
        sort_order: i,
      }))
      const { error: insErr } = await supabase.from('cover_template_paletten').insert(rows)
      if (insErr) return json({ error: insErr.message }, 500)
    }

    return json({ ok: true, count: farbpaar_ids.length })

  } catch {
    return json({ error: 'Interner Fehler.' }, 500)
  }
})
