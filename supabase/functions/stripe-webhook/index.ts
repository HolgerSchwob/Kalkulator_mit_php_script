// Supabase Edge Function: Stripe Webhook
// Stripe ruft diese URL auf (Webhook-Endpunkt). Signatur mit STRIPE_WEBHOOK_SIGNING_SECRET prüfen.
// Bei checkout.session.completed: Auftrag in orders aktualisieren (payment_status = paid, paid_at, status = Eingegangen).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
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

  const webhookSecret =
    (Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET') ?? Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '').trim()
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SIGNING_SECRET (oder STRIPE_WEBHOOK_SECRET) nicht gesetzt.')
    return new Response(JSON.stringify({ error: 'Webhook nicht konfiguriert.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const signature = req.headers.get('Stripe-Signature') ?? ''
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-11-20.acacia' })
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe Webhook Signatur ungültig:', err)
    return new Response(JSON.stringify({ error: 'Ungültige Signatur' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const orderId = session.metadata?.order_id ?? null
  const orderNumber = session.metadata?.order_number ?? null

  if (!orderId && !orderNumber) {
    console.error('Webhook checkout.session.completed ohne order_id/order_number in metadata.')
    return new Response(JSON.stringify({ error: 'Metadata fehlt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let query = supabase.from('orders').select('id').limit(1)
  if (orderId) {
    query = query.eq('id', orderId)
  } else {
    query = query.eq('order_number', orderNumber!)
  }

  const { data: order, error: findError } = await query.maybeSingle()

  if (findError || !order) {
    console.error('Auftrag für Webhook nicht gefunden:', orderId ?? orderNumber, findError)
    return new Response(JSON.stringify({ error: 'Auftrag nicht gefunden' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      status: 'Eingegangen',
    })
    .eq('id', order.id)

  if (updateError) {
    console.error('Auftrag-Update nach Zahlung fehlgeschlagen:', updateError)
    return new Response(JSON.stringify({ error: 'Update fehlgeschlagen' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true, order_id: order.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
