// Supabase Edge Function: Create Order and optionally Stripe Checkout Session
// POST Body: { inquiryDetails, customerData, shippingData, paymentMethod, totalOrderPrice, priceDetails?, b2bCode? }
// Bei b2bCode: Kostenaufteilung serverseitig, Einlösung des Codes nach erfolgreichem Insert.

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

function normalizeB2bCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function eurToCents(eur: number): number {
  if (!Number.isFinite(eur) || eur < 0) return 0
  return Math.round(eur * 100)
}

function resolveSplit(
  totalCents: number,
  model: string,
  cap: number | null,
  fixed: number | null,
): { employer: number; student: number } {
  const t = Math.max(0, totalCents)
  switch (model) {
    case 'full':
      return { employer: t, student: 0 }
    case 'capped': {
      const c = Math.max(0, cap ?? 0)
      const employer = Math.min(c, t)
      return { employer, student: t - employer }
    }
    case 'fixed': {
      const f = Math.max(0, fixed ?? 0)
      const employer = Math.min(f, t)
      return { employer, student: t - employer }
    }
    case 'student_pays':
    default:
      return { employer: 0, student: t }
  }
}

function effectiveBilling(
  account: {
    billing_model: string
    cap_amount: number | null
    fixed_amount: number | null
  },
  group: {
    billing_model: string | null
    cap_amount: number | null
    fixed_amount: number | null
  } | null,
): { model: string; cap: number | null; fixed: number | null } {
  if (group && group.billing_model) {
    return {
      model: group.billing_model,
      cap: group.cap_amount ?? account.cap_amount,
      fixed: group.fixed_amount ?? account.fixed_amount,
    }
  }
  return {
    model: account.billing_model,
    cap: account.cap_amount,
    fixed: account.fixed_amount,
  }
}

type B2bResolve =
  | { ok: true; studentId: string; accountId: string; employerCents: number; studentCents: number }
  | { ok: false; message: string }

async function resolveB2bCode(
  supabase: ReturnType<typeof createClient>,
  rawCode: string,
  totalOrderPrice: number,
): Promise<B2bResolve> {
  const code = normalizeB2bCode(rawCode)
  if (!code || code.length < 4) {
    return { ok: false, message: 'Ungültiger B2B-Code.' }
  }

  const { data: student, error: qErr } = await supabase
    .from('b2b_students')
    .select(`
      id,
      account_id,
      redeemed,
      code_type,
      b2b_accounts (
        id,
        company_name,
        active,
        billing_model,
        cap_amount,
        fixed_amount
      ),
      b2b_groups (
        billing_model,
        cap_amount,
        fixed_amount
      )
    `)
    .eq('code', code)
    .maybeSingle()

  if (qErr) {
    console.error('resolveB2bCode:', qErr)
    return { ok: false, message: 'Code konnte nicht geprüft werden.' }
  }
  if (!student) {
    return { ok: false, message: 'Unbekannter Code.' }
  }
  if (student.code_type !== 'personal') {
    return { ok: false, message: 'Dieser Codetyp wird noch nicht unterstützt.' }
  }
  if (student.redeemed) {
    return { ok: false, message: 'Dieser Code wurde bereits eingelöst.' }
  }

  const acc = student.b2b_accounts as {
    id: string
    active: boolean
    billing_model: string
    cap_amount: number | null
    fixed_amount: number | null
  } | null

  if (!acc?.id) {
    return { ok: false, message: 'Konto nicht gefunden.' }
  }
  if (!acc.active) {
    return { ok: false, message: 'Dieses Partnerkonto ist nicht freigeschaltet.' }
  }

  const grp = student.b2b_groups as {
    billing_model: string | null
    cap_amount: number | null
    fixed_amount: number | null
  } | null

  const eff = effectiveBilling(acc, grp)
  const totalCents = eurToCents(totalOrderPrice)
  const split = resolveSplit(totalCents, eff.model, eff.cap, eff.fixed)

  return {
    ok: true,
    studentId: student.id as string,
    accountId: acc.id,
    employerCents: split.employer,
    studentCents: split.student,
  }
}

function resolvePublicSiteUrl(req: Request): string | null {
  const fromEnv = (Deno.env.get('PUBLIC_SITE_URL') ?? '').trim().replace(/\/$/, '')
  if (fromEnv) {
    try {
      const raw = fromEnv.startsWith('http://') || fromEnv.startsWith('https://') ? fromEnv : `https://${fromEnv}`
      const u = new URL(raw)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return `${u.protocol}//${u.host}`
      }
    } catch {
      console.error('PUBLIC_SITE_URL ungültig:', fromEnv)
    }
  }

  const origin = req.headers.get('Origin')
  if (origin) {
    try {
      const u = new URL(origin)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return `${u.protocol}//${u.host}`
      }
    } catch {
      /* ignore */
    }
  }

  const referer = req.headers.get('Referer')
  if (referer) {
    try {
      const u = new URL(referer)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return `${u.protocol}//${u.host}`
      }
    } catch {
      /* ignore */
    }
  }

  return null
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
      b2bCode?: string
    }

    const inquiryDetails = body.inquiryDetails
    const customerData = body.customerData || {}
    const shippingData = body.shippingData || {}
    let paymentMethod = (body.paymentMethod === 'stripe') ? 'stripe' : 'offline'
    const totalOrderPrice = typeof body.totalOrderPrice === 'number' ? body.totalOrderPrice : 0
    const b2bCodeRaw = typeof body.b2bCode === 'string' ? body.b2bCode : ''

    if (!inquiryDetails || typeof inquiryDetails !== 'object') {
      return new Response(JSON.stringify({ error: 'inquiryDetails fehlt oder ungültig.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    let b2bStudentId: string | null = null
    let b2bAccountId: string | null = null
    let employerCents = 0
    let studentCents = 0

    if (b2bCodeRaw.trim()) {
      const resolved = await resolveB2bCode(supabase, b2bCodeRaw, totalOrderPrice)
      if (!resolved.ok) {
        return new Response(JSON.stringify({ error: resolved.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      b2bStudentId = resolved.studentId
      b2bAccountId = resolved.accountId
      employerCents = resolved.employerCents
      studentCents = resolved.studentCents
      if (studentCents === 0) {
        paymentMethod = 'offline'
      }
    }

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

    const inquiryBookBlock = inquiryDetails && typeof inquiryDetails === 'object' && (inquiryDetails as { bookBlock?: { mainPdfExternalUrl?: string } }).bookBlock
      ? (inquiryDetails as { bookBlock: { mainPdfExternalUrl?: string } }).bookBlock
      : null
    const mainPdfExternalUrl = inquiryBookBlock?.mainPdfExternalUrl && typeof inquiryBookBlock.mainPdfExternalUrl === 'string'
      ? inquiryBookBlock.mainPdfExternalUrl.trim()
      : null

    let status: string
    let payProvider: string
    let payStatus: string
    let paidAt: string | null = null

    const hasB2b = Boolean(b2bStudentId && b2bAccountId)

    if (hasB2b && studentCents === 0) {
      status = 'Eingegangen'
      payProvider = 'offline'
      payStatus = 'paid'
      paidAt = new Date().toISOString()
    } else if (hasB2b && studentCents > 0 && paymentMethod === 'stripe') {
      status = 'Zahlung ausstehend'
      payProvider = 'stripe'
      payStatus = 'pending'
    } else if (hasB2b && studentCents > 0 && paymentMethod === 'offline') {
      status = 'Eingegangen'
      payProvider = 'offline'
      payStatus = 'unpaid'
    } else {
      status = paymentMethod === 'stripe' ? 'Zahlung ausstehend' : 'Eingegangen'
      payProvider = paymentMethod === 'stripe' ? 'stripe' : 'offline'
      payStatus = paymentMethod === 'stripe' ? 'pending' : 'unpaid'
    }

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

    if (paidAt) {
      insertRow.paid_at = paidAt
    }

    if (hasB2b) {
      insertRow.b2b_student_id = b2bStudentId
      insertRow.b2b_account_id = b2bAccountId
      insertRow.employer_amount = employerCents
      insertRow.student_amount = studentCents
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

    const studentEurForStripe = studentCents / 100
    const stripeAmount = hasB2b ? studentEurForStripe : totalOrderPrice
    const needStripe = paymentMethod === 'stripe' && stripeSecret && stripeAmount > 0

    if (needStripe) {
      try {
        const siteUrl = resolvePublicSiteUrl(req)
        if (!siteUrl) {
          await supabase.from('orders').delete().eq('id', orderId)
          return new Response(
            JSON.stringify({
              error:
                'Öffentliche Shop-URL fehlt. Bitte in Supabase Secret PUBLIC_SITE_URL setzen (z. B. https://bamadi.de) oder Bestellung im normalen Browser-Tab starten (kein file://).',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        const stripe = new Stripe(stripeSecret, { apiVersion: '2024-11-20.acacia' })
        const successUrl =
          `${siteUrl}/kalkulator/auftrag.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(customerEmail)}&paid=1`
        const cancelUrl = `${siteUrl}/index.html?cancel=1`

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'eur',
                unit_amount: Math.round(stripeAmount * 100),
                product_data: {
                  name: 'Druckauftrag ' + orderNumber,
                  description: hasB2b ? 'Abschlussarbeit (Anteil laut Firmencode)' : 'Abschlussarbeit / Buchdruck',
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
        await supabase.from('orders').delete().eq('id', orderId)
        return new Response(
          JSON.stringify({ error: 'Zahlungsdienst konnte nicht gestartet werden. Bitte Rechnung/Vorkasse wählen oder später erneut versuchen.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (hasB2b && b2bStudentId) {
      const { error: redeemErr } = await supabase
        .from('b2b_students')
        .update({
          redeemed: true,
          redeemed_at: new Date().toISOString(),
          order_id: orderId,
          employer_amount: employerCents,
          student_amount: studentCents,
        })
        .eq('id', b2bStudentId)
        .eq('redeemed', false)

      if (redeemErr) {
        console.error('B2B redeem failed:', redeemErr)
        await supabase.from('orders').delete().eq('id', orderId)
        return new Response(JSON.stringify({ error: 'Code konnte nicht eingelöst werden. Bitte erneut versuchen oder Support kontaktieren.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(
      JSON.stringify({
        order_id: orderId,
        order_number: orderNumber,
        total_order_price: totalOrderPrice,
        checkout_url: checkoutUrl ?? undefined,
        b2b: hasB2b
          ? { employer_amount_cents: employerCents, student_amount_cents: studentCents }
          : undefined,
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
