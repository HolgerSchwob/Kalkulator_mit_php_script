// Edge Function: get-cover-template-group – für Editor (anon)
// GET ?gruppe=xxx. Liefert Gruppen-Config: Dimensionen, spine_offset_mm, falz_zone_width_mm für den Cover-Editor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GroupRow {
  id: string
  display_name: string
  spine_offset_mm: number
  visible_cover_height_mm: number
  u1_width_mm: number
  default_spine_width_mm: number | null
  falz_zone_width_mm: number
  dimensions: { svg_total_width?: number; svg_total_height?: number; svg_center_x?: number } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, anonKey)

  try {
    const url = new URL(req.url)
    const gruppe = url.searchParams.get('gruppe')?.trim() || url.searchParams.get('id')?.trim() || null

    if (!gruppe) {
      return new Response(JSON.stringify({ error: 'Parameter gruppe (oder id) erforderlich.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: row, error } = await supabase
      .from('cover_template_groups')
      .select('id, display_name, spine_offset_mm, visible_cover_height_mm, u1_width_mm, default_spine_width_mm, falz_zone_width_mm, dimensions')
      .eq('id', gruppe)
      .single()

    if (error || !row) {
      return new Response(JSON.stringify({ error: error?.message ?? 'Gruppe nicht gefunden.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const r = row as GroupRow
    const dims = r.dimensions ?? {}
    const dimensions = {
      u1Width: Number(r.u1_width_mm),
      u4Width: Number(r.u1_width_mm),
      visibleCoverHeight: Number(r.visible_cover_height_mm),
      svgTotalWidth: Number(dims.svg_total_width ?? 500),
      svgTotalHeight: Number(dims.svg_total_height ?? 330),
      svgCenterX: Number(dims.svg_center_x ?? 250),
      falzZoneWidth: Number(r.falz_zone_width_mm),
    }

    const body = {
      id: r.id,
      display_name: r.display_name,
      spine_offset_mm: Number(r.spine_offset_mm),
      default_spine_width_mm: r.default_spine_width_mm != null ? Number(r.default_spine_width_mm) : null,
      dimensions,
    }

    return new Response(JSON.stringify(body), {
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
