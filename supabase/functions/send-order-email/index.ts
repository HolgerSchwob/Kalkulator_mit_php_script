// Supabase Edge Function: SendOrderEmail – E-Mail per Gmail API versenden
// Voraussetzung: Google Service Account mit Domain-Wide Delegation (Gmail senden als bamadi@ / info@)
// Secrets: ADMIN_SECRET, GOOGLE_SERVICE_ACCOUNT_JSON (kompletter JSON-String), GMAIL_IMPERSONATE_EMAIL (z. B. info@schwob-digitaldruck.de)
// POST Body: { order_id: uuid, type: 'received' | 'status' } – type 'status' optional: body.status für Status-Text

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SignJWT } from 'https://esm.sh/jose@5.2.0'
import { importPKCS8 } from 'https://esm.sh/jose@5.2.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const FROM_EMAIL = 'bamadi@schwob-digitaldruck.de'

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

async function getGoogleAccessToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  const impersonate = (Deno.env.get('GMAIL_IMPERSONATE_EMAIL') ?? '').trim()
  if (!raw || !impersonate) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON oder GMAIL_IMPERSONATE_EMAIL fehlt in Supabase Secrets.')
  }
  let key: { client_email?: string; private_key?: string }
  try {
    key = JSON.parse(raw) as { client_email?: string; private_key?: string }
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ist kein gültiges JSON.')
  }
  const clientEmail = key.client_email
  const privateKeyPem = key.private_key
  if (!clientEmail || !privateKeyPem) {
    throw new Error('Service-Account-JSON muss client_email und private_key enthalten.')
  }

  const privateKey = await importPKCS8(privateKeyPem.replace(/\\n/g, '\n'), 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({ scope: GMAIL_SEND_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setSubject(impersonate)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error('Google Token fehlgeschlagen: ' + err)
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string }
  if (!tokenData.access_token) throw new Error('Kein access_token in Google-Antwort.')
  return tokenData.access_token
}

/** RFC 2047 encoded-word für E-Mail-Header (Umlaute, Gedankenstriche etc.) */
function encodeHeaderValue(value: string): string {
  const hasNonAscii = /[^\x00-\x7F]/.test(value)
  if (!hasNonAscii) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const b64 = btoa(binary).replace(/=+$/, '')
  return '=?UTF-8?B?' + b64 + '?='
}

function replacePlaceholders(
  str: string,
  vars: { order_number: string; customer_name: string; status: string }
): string {
  return str
    .replace(/\{\{order_number\}\}/g, vars.order_number)
    .replace(/\{\{customer_name\}\}/g, vars.customer_name)
    .replace(/\{\{status\}\}/g, vars.status)
}

function buildMimeMessage(to: string, subject: string, bodyText: string): string {
  const lines = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    bodyText,
  ]
  return lines.join('\r\n')
}

function buildMultipartMime(to: string, subject: string, bodyText: string, bodyHtml: string): string {
  const boundary = '----=_Part_' + Math.random().toString(36).slice(2) + '_' + Date.now()
  const parts: string[] = [
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    bodyText,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    '',
    bodyHtml,
  ]
  const body = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    parts.join('\r\n'),
    `--${boundary}--`,
  ].join('\r\n')
  return body
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
    const body = (await req.json().catch(() => ({}))) as { order_id?: string; type?: string; status?: string }
    const orderId = body.order_id
    const type = (body.type === 'status' ? 'status' : 'received') as 'received' | 'status'
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'order_id erforderlich.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, customer_email, customer_name, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Auftrag nicht gefunden.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const to = (order.customer_email || '').trim()
    if (!to) {
      return new Response(
        JSON.stringify({ error: 'Keine Kunden-E-Mail beim Auftrag.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orderNum = order.order_number || orderId
    const customerName = (order.customer_name || '').trim()
    const statusText = (body.status || order.status || '').trim() || 'aktualisiert'
    const templateKey = type === 'received' ? 'Eingegangen' : statusText
    const vars = { order_number: orderNum, customer_name: customerName, status: statusText }

    let subject: string
    let bodyText: string
    let bodyHtml: string | null = null

    const { data: template } = await supabase
      .from('email_templates')
      .select('subject_template, body_plain, body_html, active')
      .eq('template_key', templateKey)
      .single()

    const useTemplate =
      template?.active &&
      (template.subject_template?.trim() || template.body_plain?.trim() || template.body_html?.trim())

    if (useTemplate && template) {
      subject = replacePlaceholders(template.subject_template?.trim() || `Auftrag ${orderNum}`, vars)
      bodyText = replacePlaceholders(template.body_plain?.trim() || '', vars)
      if (template.body_html?.trim()) bodyHtml = replacePlaceholders(template.body_html.trim(), vars)
      if (bodyHtml != null && !bodyText) bodyText = 'Diese E-Mail enthält formatierte Inhalte. Bitte HTML-Anzeige in Ihrem E-Mail-Programm aktivieren.'
    } else {
      if (type === 'received') {
        subject = `Auftrag ${orderNum} – eingegangen`
        bodyText = [
          `Hallo${customerName ? ' ' + customerName : ''},`,
          '',
          `vielen Dank für Ihre Bestellung. Wir haben Ihren Auftrag ${orderNum} erhalten.`,
          '',
          'Sie können den Status Ihres Auftrags jederzeit mit Ihrer E-Mail-Adresse und der Auftragsnummer einsehen.',
          '',
          'Mit freundlichen Grüßen',
          'Ihr Team SCHWOB DIGITALDRUCK',
        ].join('\n')
      } else {
        subject = `Auftrag ${orderNum} – ${statusText}`
        bodyText = [
          `Hallo${customerName ? ' ' + customerName : ''},`,
          '',
          `der Status Ihres Auftrags ${orderNum} wurde aktualisiert: ${statusText}.`,
          '',
          'Mit freundlichen Grüßen',
          'Ihr Team SCHWOB DIGITALDRUCK',
        ].join('\n')
      }
    }

    const mime =
      bodyHtml != null && bodyHtml.length > 0
        ? buildMultipartMime(to, subject, bodyText, bodyHtml)
        : buildMimeMessage(to, subject, bodyText)
    const raw = base64UrlEncode(mime)

    const accessToken = await getGoogleAccessToken()
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })

    if (!gmailRes.ok) {
      const errText = await gmailRes.text()
      console.error('Gmail API error:', gmailRes.status, errText)
      return new Response(
        JSON.stringify({ error: 'E-Mail-Versand fehlgeschlagen.', details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    try {
      const logEntry = {
        type,
        status: type === 'received' ? 'Eingegangen' : statusText,
        sent_at: new Date().toISOString(),
      }
      const { data: existing } = await supabase
        .from('orders')
        .select('email_sent_log')
        .eq('id', orderId)
        .single()
      const log = Array.isArray(existing?.email_sent_log) ? [...existing.email_sent_log] : []
      log.push(logEntry)
      await supabase
        .from('orders')
        .update({ email_sent_log: log, updated_at: new Date().toISOString() })
        .eq('id', orderId)
    } catch (_) {
      // Spalte email_sent_log evtl. noch nicht vorhanden (Migration nicht ausgeführt)
    }

    return new Response(
      JSON.stringify({ ok: true, message: 'E-Mail gesendet.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('send-order-email error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
