// Supabase Edge Function: EmailTemplates – E-Mail-Templates verwalten (Dashboard)
// Header: x-admin-secret = ADMIN_SECRET
// GET: Liste aller Templates (id, template_key, name, subject_template, body_html, body_plain, active, updated_at)
// PATCH: Ein Template aktualisieren. Body: { template_key: string, subject_template?: string, body_html?: string, body_plain?: string, active?: boolean }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
        .from('email_templates')
        .select('id, template_key, name, subject_template, body_html, body_plain, active, updated_at')
        .order('template_key', { ascending: true })

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ templates: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH
    const body = await req.json().catch(() => ({})) as {
      template_key?: string
      subject_template?: string
      body_html?: string
      body_plain?: string
      active?: boolean
    }
    const templateKey = typeof body.template_key === 'string' ? body.template_key.trim() : ''
    if (!templateKey) {
      return new Response(JSON.stringify({ error: 'template_key erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.subject_template === 'string') updates.subject_template = body.subject_template
    if (typeof body.body_html === 'string') updates.body_html = body.body_html
    if (typeof body.body_plain === 'string') updates.body_plain = body.body_plain
    if (typeof body.active === 'boolean') updates.active = body.active

    const { data, error } = await supabase
      .from('email_templates')
      .update(updates)
      .eq('template_key', templateKey)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ template: data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
