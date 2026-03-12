// Supabase Edge Function: ShopConfig – Admin: Shop-Konfiguration laden/speichern (Dashboard)
// Header: x-admin-secret = ADMIN_SECRET
// GET: Liefert die komplette Config (wie get-shop-config, aber mit Auth).
// PATCH: Body = { config?: object } (vollständiges Config-Objekt) oder Teilbereiche: general, papers, bindings, extras, productionAndDelivery (werden in bestehende Config eingefügt).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    if (req.method === 'GET') {
      const { data: row, error } = await supabase
        .from('shop_config')
        .select('config, updated_at')
        .eq('id', 1)
        .maybeSingle()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!row || !row.config) {
        return new Response(JSON.stringify({ error: 'Konfiguration nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ config: row.config, updated_at: row.updated_at }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH
    const body = await req.json().catch(() => ({})) as { config?: unknown; general?: unknown; papers?: unknown; bindings?: unknown; extras?: unknown; productionAndDelivery?: unknown; colorPairPalette?: unknown }
    let newConfig: Record<string, unknown>

    if (body.config != null && typeof body.config === 'object' && !Array.isArray(body.config)) {
      newConfig = body.config as Record<string, unknown>
    } else {
      const { data: row, error: fetchError } = await supabase
        .from('shop_config')
        .select('config')
        .eq('id', 1)
        .maybeSingle()
      if (fetchError || !row?.config) {
        return new Response(JSON.stringify({ error: 'Konfiguration nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const current = (row.config as Record<string, unknown>) || {}
      newConfig = { ...current }
      if (body.general != null) newConfig.general = body.general
      if (body.papers != null) newConfig.papers = body.papers
      if (body.bindings != null) newConfig.bindings = body.bindings
      if (body.extras != null) newConfig.extras = body.extras
      if (body.productionAndDelivery != null) newConfig.productionAndDelivery = body.productionAndDelivery
      if (body.colorPairPalette != null) newConfig.colorPairPalette = body.colorPairPalette
    }

    const { data, error } = await supabase
      .from('shop_config')
      .update({ config: newConfig, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('config, updated_at')
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ config: data?.config, updated_at: data?.updated_at }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
