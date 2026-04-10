// Edge Function: update-cover-schema – CRUD cover_schema_elements (Admin, x-admin-secret)
// POST JSON: { operation: 'create' | 'update' | 'deactivate' | 'delete', element: { ... } }

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'cover-templates'
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

async function elementIdUsedInTemplateSvgs(
  supabase: SupabaseClient,
  elementId: string
): Promise<boolean> {
  const { data: rows } = await supabase.from('cover_templates').select('storage_path')
  const list = rows ?? []
  const n1 = `data-label="${elementId}"`
  const n2 = `data-label='${elementId}'`
  for (const row of list as { storage_path: string }[]) {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(row.storage_path)
    if (error || !blob) continue
    const text = await blob.text()
    if (text.includes(n1) || text.includes(n2)) return true
  }
  return false
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

  type ElementPayload = {
    id?: string
    element_id?: string
    label?: string
    placeholder?: string
    element_type?: string
    required?: boolean
    layer?: string | null
    sort_order?: number
    active?: boolean
    editor_slot?: string
  }

  const body = (await req.json().catch(() => ({}))) as {
    operation?: string
    element?: ElementPayload
  }
  const operation = (body.operation ?? '').trim().toLowerCase()
  const el = body.element ?? {}

  const validTypes = new Set(['text', 'image', 'zone'])
  const validLayers = new Set(['front', 'spine', 'back', 'any'])
  const validEditorSlots = new Set(['none', 'book_block_first_page'])

  try {
    if (operation === 'create') {
      const element_id = (el.element_id ?? '').trim()
      const label = (el.label ?? '').trim()
      const element_type = (el.element_type ?? '').trim()
      if (!element_id || !label || !element_type) {
        return new Response(
          JSON.stringify({ error: 'element_id, label und element_type sind erforderlich.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!validTypes.has(element_type)) {
        return new Response(JSON.stringify({ error: 'element_type ungültig.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const layer = el.layer != null && el.layer !== '' ? String(el.layer).trim() : null
      if (layer && !validLayers.has(layer)) {
        return new Response(JSON.stringify({ error: 'layer ungültig.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const slotRaw = (el.editor_slot ?? 'none').toString().trim()
      if (!validEditorSlots.has(slotRaw)) {
        return new Response(JSON.stringify({ error: 'editor_slot ungültig (none | book_block_first_page).' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const editor_slot = slotRaw
      const { data, error } = await supabase
        .from('cover_schema_elements')
        .insert({
          element_id,
          label,
          placeholder: (el.placeholder ?? '').trim(),
          element_type,
          required: Boolean(el.required),
          layer: layer || null,
          sort_order: typeof el.sort_order === 'number' ? el.sort_order : 0,
          active: el.active !== undefined ? Boolean(el.active) : true,
          editor_slot,
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
      const id = (el.id ?? '').trim()
      const element_id_lookup = (el.element_id ?? '').trim()
      if (!id && !element_id_lookup) {
        return new Response(JSON.stringify({ error: 'element.id oder element.element_id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const updates: Record<string, unknown> = {}
      if (el.label !== undefined) updates.label = String(el.label).trim()
      if (el.placeholder !== undefined) updates.placeholder = String(el.placeholder).trim()
      if (el.element_type !== undefined) {
        const t = String(el.element_type).trim()
        if (!validTypes.has(t)) {
          return new Response(JSON.stringify({ error: 'element_type ungültig.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updates.element_type = t
      }
      if (el.required !== undefined) updates.required = Boolean(el.required)
      if (el.layer !== undefined) {
        const layer = el.layer != null && el.layer !== '' ? String(el.layer).trim() : null
        if (layer && !validLayers.has(layer)) {
          return new Response(JSON.stringify({ error: 'layer ungültig.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updates.layer = layer
      }
      if (typeof el.sort_order === 'number') updates.sort_order = el.sort_order
      if (el.active !== undefined) updates.active = Boolean(el.active)
      if (el.element_id !== undefined && id) {
        updates.element_id = String(el.element_id).trim()
      }
      if (el.editor_slot !== undefined) {
        const slotRaw = String(el.editor_slot).trim()
        if (!validEditorSlots.has(slotRaw)) {
          return new Response(JSON.stringify({ error: 'editor_slot ungültig (none | book_block_first_page).' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updates.editor_slot = slotRaw
      }

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: 'Keine Felder zum Aktualisieren.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let q = supabase.from('cover_schema_elements').update(updates)
      if (id) q = q.eq('id', id)
      else q = q.eq('element_id', element_id_lookup)

      const { data, error } = await q.select().single()
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
      const id = (el.id ?? '').trim()
      const element_id_lookup = (el.element_id ?? '').trim()
      if (!id && !element_id_lookup) {
        return new Response(JSON.stringify({ error: 'element.id oder element.element_id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      let q = supabase.from('cover_schema_elements').update({ active: false })
      if (id) q = q.eq('id', id)
      else q = q.eq('element_id', element_id_lookup)
      const { data, error } = await q.select().single()
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
      const id = (el.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'element.id (uuid) erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: row, error: fetchErr } = await supabase
        .from('cover_schema_elements')
        .select('id, element_id, active')
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
          JSON.stringify({ error: 'Nur gelöscht werden, wenn der Eintrag deaktiviert ist (active=false).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const used = await elementIdUsedInTemplateSvgs(supabase, row.element_id as string)
      if (used) {
        return new Response(
          JSON.stringify({ error: 'element_id wird noch in einem Template-SVG verwendet.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { error: delErr } = await supabase.from('cover_schema_elements').delete().eq('id', id)
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
