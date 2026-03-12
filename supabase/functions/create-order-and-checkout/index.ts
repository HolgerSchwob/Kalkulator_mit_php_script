// Supabase Edge Function: Create Order and optionally Stripe Checkout Session
// Aufruf vom Kalkulator-Frontend (Authorization: Bearer anonKey).
// POST Body: { inquiryDetails, customerData, shippingData, paymentMethod: 'stripe' | 'offline', totalOrderPrice }
// Antwort: { order_id, order_number, checkout_url? }. Bei Stripe: checkout_url für Redirect.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `A-${datePart}-${randomPart}`
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
    const body = await req.json().catch(() => ({})) as {
      inquiryDetails?: unknown
      customerData?: Record<string, string>
      shippingData?: Record<string, string>
      paymentMethod?: string
      totalOrderPrice?: number
      priceDetails?: unknown
    }

    const inquiryDetails = body.inquiryDetails
    const customerData = body.customerData || {}
    const shippingData = body.shippingData || {}
    const paymentMethod = (body.paymentMethod === 'stripe') ? 'stripe' : 'offline'
    const totalOrderPrice = typeof body.totalOrderPrice === 'number' ? body.totalOrderPrice : 0

    if (!inquiryDetails || typeof inquiryDetails !== 'object') {
      return new Response(JSON.stringify({ error: 'inquiryDetails fehlt oder ungültig.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const orderId = crypto.randomUUID()
    const orderNumber = generateOrderNumber()
    const customerEmail = customerData.customerEmail || customerData.email || ''
    const customerName = customerData.customerName || customerData.name || null
    const customerPhone = customerData.customerPhone || customerData.phone || null
    const notes = (customerData.customerNotes != null && String(customerData.customerNotes).trim())
      ? String(customerData.customerNotes).trim()
      : null

    const priceDetails = body.priceDetails && typeof body.priceDetails === 'object' ? body.priceDetails : undefined
    const payload = {
      inquiryDetails,
      customerData,
      shippingData,
      ...(priceDetails ? { priceDetails } : {}),
    }

    const isExpress = (inquiryDetails as { production?: { productionTimeId?: string } }).production?.productionTimeId === 'prod_express'

    const status = paymentMethod === 'stripe' ? 'Zahlung ausstehend' : 'Eingegangen'
    const payProvider = paymentMethod === 'stripe' ? 'stripe' : 'offline'
    const payStatus = paymentMethod === 'stripe' ? 'pending' : 'unpaid'

    const inquiryBookBlock = inquiryDetails && typeof inquiryDetails === 'object' && (inquiryDetails as { bookBlock?: { mainPdfExternalUrl?: string } }).bookBlock
      ? (inquiryDetails as { bookBlock: { mainPdfExternalUrl?: string } }).bookBlock
      : null
    const mainPdfExternalUrl = inquiryBookBlock?.mainPdfExternalUrl && typeof inquiryBookBlock.mainPdfExternalUrl === 'string'
      ? inquiryBookBlock.mainPdfExternalUrl.trim()
      : null

    const insertRow: Record<string, unknown> = {
      id: orderId,
      order_number: orderNumber,
      customer_email: customerEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      status,
      total_price: totalOrderPrice,
      is_express: isExpress,
      payload,
      shipping_data: Object.keys(shippingData).length ? shippingData : null,
      main_pdf_storage_path: null,
      main_pdf_external_url: mainPdfExternalUrl || null,
      notes,
      payment_provider: payProvider,
      payment_status: payStatus,
    }

    const { error: insertError } = await supabase.from('orders').insert(insertRow)

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message || 'Auftrag konnte nicht gespeichert werden.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let checkoutUrl: string | null = null
    const stripeSecret = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim()

    if (paymentMethod === 'stripe' && stripeSecret && totalOrderPrice > 0) {
      try {
        const stripe = new Stripe(stripeSecret, { apiVersion: '2024-11-20.acacia' })
        const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? supabaseUrl.replace(/\.supabase\.co.*/, '')).replace(/\/$/, '')
        const successUrl = siteUrl
          ? `${siteUrl}/auftrag.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(customerEmail)}&paid=1`
          : `${req.url.replace(/\/functions\/v1\/create-order-and-checkout.*/, '')}/auftrag.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(customerEmail)}&paid=1`
        const cancelUrl = siteUrl
          ? `${siteUrl}/index.html?cancel=1`
          : `${req.url.replace(/\/functions\/v1\/create-order-and-checkout.*/, '')}/index.html?cancel=1`

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'eur',
                unit_amount: Math.round(totalOrderPrice * 100),
                product_data: {
                  name: 'Druckauftrag ' + orderNumber,
                  description: 'Abschlussarbeit / Buchdruck',
                },
              },
              quantity: 1,
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            order_id: orderId,
            order_number: orderNumber,
            customer_email: customerEmail,
          },
          customer_email: customerEmail || undefined,
        })

        checkoutUrl = session.url || null
        if (session.id) {
          await supabase
            .from('orders')
            .update({ stripe_checkout_session_id: session.id })
            .eq('id', orderId)
        }
      } catch (stripeErr) {
        console.error('Stripe Checkout Session fehlgeschlagen:', stripeErr)
        return new Response(
          JSON.stringify({ error: 'Zahlungsdienst konnte nicht gestartet werden. Bitte Rechnung/Vorkasse wählen oder später erneut versuchen.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({
        order_id: orderId,
        order_number: orderNumber,
        total_order_price: totalOrderPrice,
        checkout_url: checkoutUrl ?? undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
