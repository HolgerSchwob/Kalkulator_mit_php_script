// Edge Function: get-cover-templates – für Editor (anon)
// GET, optional ?gruppe=xxx. Liefert Liste mit file, name, url (öffentliche Storage-URL).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'cover-templates'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, anonKey)

  try {
    const url = new URL(req.url)
    const gruppe = url.searchParams.get('gruppe')?.trim() || null

    let query = supabase
      .from('cover_templates')
      .select('filename, display_name, storage_path')
      .order('sort_order', { ascending: true })

    if (gruppe) {
      query = query.eq('gruppe', gruppe)
    }

    const { data: rows, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const templates = (rows ?? []).map((r: { filename: string; display_name: string; storage_path: string }) => {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${r.storage_path}`
      return {
        file: r.filename,
        name: r.display_name || r.filename,
        url: publicUrl,
      }
    })

    return new Response(JSON.stringify({ templates }), {
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
