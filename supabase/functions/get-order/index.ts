// Supabase Edge Function: GetOrder – für Kunden-Landingpage
// Aufruf: POST mit Body { order_number: string, email: string }
// Liefert den Auftrag nur, wenn customer_email zur angegebenen E-Mail passt. Keine Storage-URLs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { order_number, email } = await req.json()
    const orderNumber = typeof order_number === 'string' ? order_number.trim() : ''
    const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (!orderNumber || !emailNorm) {
      return new Response(
        JSON.stringify({ error: 'Auftragsnummer und E-Mail sind erforderlich.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_email, customer_name, customer_phone, status, total_price, is_express, payload, shipping_data, created_at')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Datenbankfehler.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Auftrag nicht gefunden.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const customerEmailNorm = (order.customer_email || '').trim().toLowerCase()
    if (customerEmailNorm !== emailNorm) {
      return new Response(
        JSON.stringify({ error: 'Auftrag nicht gefunden oder E-Mail stimmt nicht überein.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify(order), {
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
