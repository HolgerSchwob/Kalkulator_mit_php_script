// POST { code: string, order_total_eur: number }
// Antwort: { valid, billing_model?, employer_amount_cents?, student_amount_cents?, account_name?, b2b_student_id?, error? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function normalizeB2bCode(raw: string): string {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ valid: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      code?: string
      order_total_eur?: number
    }

    const code = normalizeB2bCode(body.code || '')
    const orderTotalEur = typeof body.order_total_eur === 'number' ? body.order_total_eur : NaN

    if (!code || code.length < 4) {
      return new Response(JSON.stringify({ valid: false, error: 'Bitte einen gültigen Code eingeben.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Number.isFinite(orderTotalEur) || orderTotalEur < 0) {
      return new Response(JSON.stringify({ valid: false, error: 'Bestellsumme ungültig.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: student, error: qErr } = await supabase
      .from('b2b_students')
      .select(`
        id,
        account_id,
        group_id,
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
      console.error('validate-b2b-code query:', qErr)
      return new Response(JSON.stringify({ valid: false, error: 'Code konnte nicht geprüft werden.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!student) {
      return new Response(JSON.stringify({ valid: false, error: 'Unbekannter Code.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (student.code_type !== 'personal') {
      return new Response(JSON.stringify({ valid: false, error: 'Dieser Codetyp wird hier noch nicht unterstützt.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (student.redeemed) {
      return new Response(JSON.stringify({ valid: false, error: 'Dieser Code wurde bereits eingelöst.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const acc = student.b2b_accounts as {
      id: string
      company_name: string
      active: boolean
      billing_model: string
      cap_amount: number | null
      fixed_amount: number | null
    } | null

    if (!acc || !acc.id) {
      return new Response(JSON.stringify({ valid: false, error: 'Konto nicht gefunden.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!acc.active) {
      return new Response(JSON.stringify({ valid: false, error: 'Dieses Partnerkonto ist noch nicht freigeschaltet.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const grp = student.b2b_groups as {
      billing_model: string | null
      cap_amount: number | null
      fixed_amount: number | null
    } | null

    const eff = effectiveBilling(acc, grp)
    const totalCents = eurToCents(orderTotalEur)
    const split = resolveSplit(totalCents, eff.model, eff.cap, eff.fixed)

    return new Response(
      JSON.stringify({
        valid: true,
        billing_model: eff.model,
        employer_amount_cents: split.employer,
        student_amount_cents: split.student,
        account_name: acc.company_name,
        b2b_student_id: student.id,
        b2b_account_id: acc.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ valid: false, error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
