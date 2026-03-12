// Supabase Edge Function: Upload Preview-Asset – für Dashboard: Bilder in Storage legen, URL zurückgeben
// POST, multipart/form-data: file (erforderlich), path (optional, z. B. "softcover_foil" → wird zu softcover_foil/Dateiname)
// Header: x-admin-secret erforderlich.
// Response: { url: "https://.../storage/v1/object/public/preview-assets/..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'preview-assets'
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

function sanitizePathSegment(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').replace(/^_+|_+$/g, '') || 'assets'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'Keine Datei im Feld "file" gesendet.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prefixRaw = (formData.get('path') ?? formData.get('prefix') ?? '').toString().trim()
    const prefix = prefixRaw ? sanitizePathSegment(prefixRaw) + '/' : ''
    const fileName = file.name && file.name.length > 0
      ? sanitizePathSegment(file.name.replace(/\.[^.]+$/, '')) + (file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.png')
      : 'image_' + Date.now() + '.png'
    const storagePath = prefix + fileName

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'image/png',
        upsert: true,
      })

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Upload fehlgeschlagen: ' + error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${data.path}`
    return new Response(JSON.stringify({ url: publicUrl, path: data.path }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Fehler: ' + (e instanceof Error ? e.message : String(e)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
