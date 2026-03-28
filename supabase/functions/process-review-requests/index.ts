// Geplanter Job: Bewertungsanfragen für abgeschlossene Aufträge (Versendet / Abgeholt)
// Nach REVIEW_REQUEST_DELAY_DAYS (Standard 4) ab fulfillment_completed_at, sofern Template aktiv und noch nicht versendet.
// Aufruf: täglich per Supabase Scheduled Function oder externer Cron (POST + x-admin-secret).
// Secrets: ADMIN_SECRET (wie andere Admin-Functions), optional REVIEW_REQUEST_DELAY_DAYS, REVIEW_PAGE_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

function alreadySentReview(log: unknown): boolean {
  if (!Array.isArray(log)) return false
  return log.some((e: { type?: string }) => e?.type === 'review_request')
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
    const delayDays = Math.max(
      1,
      parseInt(Deno.env.get('REVIEW_REQUEST_DELAY_DAYS') || '4', 10) || 4
    )
    const maxPerRun = Math.min(
      100,
      Math.max(1, parseInt(Deno.env.get('REVIEW_REQUEST_BATCH_MAX') || '40', 10) || 40)
    )

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error } = await supabase
      .from('orders')
      .select('id, order_number, status, email_sent_log, fulfillment_completed_at')
      .in('status', ['Versendet', 'Abgeholt'])
      .not('fulfillment_completed_at', 'is', null)
      .lte('fulfillment_completed_at', cutoff)
      .limit(200)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const candidates = (rows ?? []).filter((o) => !alreadySentReview(o.email_sent_log))
    const toProcess = candidates.slice(0, maxPerRun)

    const results: { order_id: string; ok: boolean; error?: string }[] = []

    for (const o of toProcess) {
      const sendUrl = `${supabaseUrl}/functions/v1/send-order-email`
      try {
        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret,
          },
          body: JSON.stringify({ order_id: o.id, type: 'review_request' }),
        })
        const text = await res.text()
        if (!res.ok) {
          let errMsg = text
          try {
            const j = JSON.parse(text) as { error?: string }
            if (j.error) errMsg = j.error
          } catch {
            /* ignore */
          }
          results.push({ order_id: o.id, ok: false, error: errMsg })
        } else {
          results.push({ order_id: o.id, ok: true })
        }
      } catch (e) {
        results.push({
          order_id: o.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const ok = results.filter((r) => r.ok).length
    const fail = results.filter((r) => !r.ok).length

    return new Response(
      JSON.stringify({
        ok: true,
        delay_days: delayDays,
        candidates: candidates.length,
        processed: toProcess.length,
        sent: ok,
        failed: fail,
        details: results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('process-review-requests error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
