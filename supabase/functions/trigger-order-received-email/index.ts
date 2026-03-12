// Supabase Edge Function: TriggerOrderReceivedEmail
// Wird von einem Database Webhook aufgerufen (INSERT in orders).
// Sendet automatisch die Eingangsbestätigung (type: received) an den Kunden – 24/7 direkt nach Auftragseingang.
//
// Einrichtung im Supabase-Dashboard:
// 1. Database → Webhooks → Create a new hook
// 2. Name: z. B. "Eingangs-E-Mail bei neuem Auftrag"
// 3. Table: public.orders
// 4. Events: INSERT
// 5. Type: Supabase Edge Functions
// 6. Function: trigger-order-received-email
//
// Secrets: ADMIN_SECRET (wird an send-order-email weitergegeben), plus alle für send-order-email (Gmail etc.)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  type?: string
  table?: string
  schema?: string
  record?: { id?: string; [key: string]: unknown }
  old_record?: unknown
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

  try {
    const body = (await req.json().catch(() => ({}))) as WebhookPayload
    if (body.type !== 'INSERT' || body.table !== 'orders' || !body.record?.id) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'Kein INSERT auf orders oder record.id fehlt.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orderId = body.record.id as string
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')
    const adminSecret = Deno.env.get('ADMIN_SECRET')?.trim()

    if (!supabaseUrl || !adminSecret) {
      console.error('SUPABASE_URL oder ADMIN_SECRET fehlt.')
      return new Response(
        JSON.stringify({ error: 'Server-Konfiguration unvollständig.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = `${supabaseUrl}/functions/v1/send-order-email`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      },
      body: JSON.stringify({ order_id: orderId, type: 'received' }),
    })

    const text = await res.text()
    if (!res.ok) {
      console.error('send-order-email failed:', res.status, text)
      return new Response(
        JSON.stringify({ error: 'E-Mail-Versand fehlgeschlagen.', details: text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, message: 'Eingangs-E-Mail ausgelöst.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('trigger-order-received-email error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
