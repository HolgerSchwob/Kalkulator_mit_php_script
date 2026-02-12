// Supabase Edge Function: ListOrders – für Production-Dashboard (Admin)
// POST mit Body { admin_secret: string, status?: string } oder Header x-admin-secret + GET mit ?status=

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function getSecretFromRequest(req: Request, body?: { admin_secret?: string }): string {
  const fromHeader = req.headers.get('x-admin-secret')?.trim() ?? ''
  const fromBody = body?.admin_secret?.trim() ?? ''
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('admin_secret')?.trim() ?? ''
  return fromBody || fromHeader || fromQuery
}

function checkAdmin(secret: string): boolean {
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret.length > 0 && secret === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { admin_secret?: string; status?: string } = {}
  if (req.method === 'POST') {
    try {
      body = await req.json().catch(() => ({}))
    } catch (_) {
      body = {}
    }
  }

  const secret = getSecretFromRequest(req, body)
  if (!checkAdmin(secret)) {
    const expected = Deno.env.get('ADMIN_SECRET') ?? ''
    console.log('Auth failed: sent length=' + secret.length + ', expected length=' + expected.length)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const statusFilter = body.status ?? (req.method === 'GET' ? new URL(req.url).searchParams.get('status')?.trim() : null) ?? null

  try {

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let query = supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_email, status, assignee, total_price, is_express, created_at')
      .order('created_at', { ascending: false })

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ orders: data || [] }), {
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
