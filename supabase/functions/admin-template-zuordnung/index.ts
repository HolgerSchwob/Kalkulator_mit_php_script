// Edge Function: admin-template-zuordnung – Template-Zuordnung (Dashboard, Admin)
// Header: x-admin-secret = ADMIN_SECRET
// GET: Alle oder ?template_filename=xxx. PUT: Upsert (template_filename, gruppe, color_ids).

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'PUT') {
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
      const templateFilename = url.searchParams.get('template_filename')?.trim()
      if (templateFilename) {
        const { data, error } = await supabase
          .from('template_zuordnung')
          .select('*')
          .eq('template_filename', templateFilename)
          .maybeSingle()
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify(data ?? null), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await supabase
        .from('template_zuordnung')
        .select('*')
        .order('template_filename', { ascending: true })
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

    // PUT: Upsert
    const body = await req.json().catch(() => ({})) as {
      template_filename?: string
      gruppe?: string
      color_ids?: string[]
    }
    const template_filename = (body.template_filename ?? '').trim()
    if (!template_filename) {
      return new Response(JSON.stringify({ error: 'template_filename erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const gruppe = (body.gruppe ?? '').trim()
    const color_ids = Array.isArray(body.color_ids) ? body.color_ids : []

    const { data, error } = await supabase
      .from('template_zuordnung')
      .upsert(
        {
          template_filename,
          gruppe,
          color_ids,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'template_filename' }
      )
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
