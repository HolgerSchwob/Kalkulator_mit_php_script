// Edge Function: admin-cover-templates – Dashboard: Templates verwalten (Admin)
// GET: Alle Einträge (optional ?gruppe=). POST: Upload SVG + Metadaten. PATCH: Metadaten/Datei. DELETE: Löschen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'cover-templates'
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'template'
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
      const url = new URL(req.url)
      const gruppe = url.searchParams.get('gruppe')?.trim() || null
      let query = supabase
        .from('cover_templates')
        .select('*')
        .order('sort_order', { ascending: true })
      if (gruppe) query = query.eq('gruppe', gruppe)
      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const withUrl = (data ?? []).map((r: { storage_path: string; [k: string]: unknown }) => ({
        ...r,
        url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${r.storage_path}`,
      }))
      return new Response(JSON.stringify({ data: withUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file || !(file instanceof File)) {
        return new Response(JSON.stringify({ error: 'Keine Datei im Feld "file".' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const display_name = (formData.get('display_name') ?? formData.get('displayName') ?? '').toString().trim() || file.name
      const gruppe = (formData.get('gruppe') ?? '').toString().trim()
      const sort_order = parseInt((formData.get('sort_order') ?? '0').toString(), 10) || 0
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'template'
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.svg'
      const filename = sanitizeFilename(baseName) + (ext.toLowerCase() === '.svg' ? '.svg' : ext)
      const storage_path = gruppe ? `${gruppe}/${filename}` : filename

      const fileBytes = await file.arrayBuffer()
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storage_path, fileBytes, { contentType: 'image/svg+xml', upsert: true })

      if (uploadErr) {
        return new Response(JSON.stringify({ error: 'Storage: ' + uploadErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: row, error: insertErr } = await supabase
        .from('cover_templates')
        .insert({
          filename,
          display_name,
          gruppe,
          sort_order,
          storage_path,
        })
        .select()
        .single()

      if (insertErr) {
        await supabase.storage.from(BUCKET).remove([storage_path])
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(row), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({})) as {
        id?: string
        filename?: string
        display_name?: string
        gruppe?: string
        sort_order?: number
        file?: string
      }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: existing, error: fetchErr } = await supabase
        .from('cover_templates')
        .select('storage_path, filename, gruppe')
        .eq('id', id)
        .single()

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.display_name !== undefined) updates.display_name = String(body.display_name).trim()
      if (body.gruppe !== undefined) updates.gruppe = String(body.gruppe).trim()
      if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order

      const { data: updated, error: updateErr } = await supabase
        .from('cover_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => ({})) as { id?: string }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: row, error: fetchErr } = await supabase
        .from('cover_templates')
        .select('storage_path')
        .eq('id', id)
        .single()

      if (fetchErr || !row) {
        return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabase.storage.from(BUCKET).remove([row.storage_path])
      const { error: delErr } = await supabase.from('cover_templates').delete().eq('id', id)
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

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
