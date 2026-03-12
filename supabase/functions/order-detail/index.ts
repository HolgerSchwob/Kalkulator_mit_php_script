// Supabase Edge Function: OrderDetail – für Production-Dashboard (Admin)
// Header: x-admin-secret = ADMIN_SECRET
// POST Body: { order_id: uuid } oder { order_number: string }
// Liefert Auftrag inkl. signierter URLs für Druckdaten (PDF) und Buchdecken (SVGs).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

const BUCKET = 'order-files'

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
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

  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order_id || null
    const orderNumber = body.order_number || null

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let query = supabase.from('orders').select('*')
    if (orderId) {
      query = query.eq('id', orderId)
    } else if (orderNumber) {
      query = query.eq('order_number', orderNumber)
    } else {
      return new Response(
        JSON.stringify({ error: 'order_id oder order_number erforderlich.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: order, error } = await query.maybeSingle()

    if (error || !order) {
      return new Response(
        JSON.stringify({ error: 'Auftrag nicht gefunden.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const id = order.id
    const prefix = id + '/'

    const downloadUrls: Record<string, string> = {}

    if (order.main_pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(order.main_pdf_storage_path, 3600)
      if (signed?.signedUrl) downloadUrls.mainPdf = signed.signedUrl
    } else if (order.main_pdf_external_url) {
      downloadUrls.mainPdfExternalUrl = order.main_pdf_external_url
    } else {
      const pdfPath = prefix + order.order_number + '.pdf'
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(pdfPath, 3600)
      if (signed?.signedUrl) downloadUrls.mainPdf = signed.signedUrl
    }

    const { data: files } = await supabase.storage.from(BUCKET).list(prefix)
    const svgFiles = (files || []).filter((f) => f.name?.toLowerCase().endsWith('.svg'))
    for (const f of svgFiles) {
      const path = prefix + f.name
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
      if (signed?.signedUrl) downloadUrls['svg_' + f.name] = signed.signedUrl
    }

    return new Response(
      JSON.stringify({ order, downloadUrls }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
