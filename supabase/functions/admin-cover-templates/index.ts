// Edge Function: admin-cover-templates – Dashboard: Templates verwalten (Admin)
// GET: Alle Einträge (optional ?gruppe=). POST: Upload SVG + Metadaten. PATCH: Metadaten/Datei. DELETE: Löschen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'cover-templates'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

function checkAdmin(req: Request): boolean {
  const secret = req.headers.get('x-admin-secret')?.trim() ?? ''
  const expected = (Deno.env.get('ADMIN_SECRET') ?? '').trim()
  return expected.length > 0 && secret === expected
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'template'
}

/** UserSpace mm: 500×330, vertikale Mittelachse x = 250; Marken am physischen Bogenrand (Vollformat / Druck) */
const MITTELMARKE_CENTER_X = 250
const MITTELMARKE_WHITE_W = 3
const MITTELMARKE_TICK_LEN = 10
const MITTELMARKE_STROKE_W = 1
const MITTELMARKE_SVG_H = 330

/** Nach Upload: Rückentexte mit id tpl-*-spine: dominant-baseline ergänzen (optische Mitte auf x≈250, nicht Baseline). Mehrzeilig = weiterhin ein &lt;text&gt;-Element mit &lt;tspan&gt;. */
function ensureSpineDominantBaseline(svg: string): { svg: string; spineBaselineAdded: number } {
  let spineBaselineAdded = 0
  const out = svg.replace(/<text\b([\s\S]*?)>/gi, (_full, attrs: string) => {
    if (!/\bid\s*=\s*["']tpl-[^"']*-spine["']/i.test(attrs)) return `<text${attrs}>`
    if (/\bdominant-baseline\s*=/i.test(attrs)) return `<text${attrs}>`
    spineBaselineAdded += 1
    return `<text${attrs} dominant-baseline="central">`
  })
  return { svg: out, spineBaselineAdded }
}

type ProductionPrepInfo = {
  /** Anzahl &lt;text&gt;-Tags mit id=tpl-*-spine, denen dominant-baseline ergänzt wurde */
  spine_baseline_added: number
  /** Mittelmarke-Gruppe eingefügt/ersetzt */
  mittelmarke: boolean
}

/**
 * Entfernt vorhandene Gruppe `Mittelmarke` und hängt die Produktions-Mittelmarke vor `</svg>` ein.
 * Zwei vertikale Striche bei x=250 (weiß 3 mm, schwarz ~1 mm), je 10 mm von y=0 bzw. y=330 nach innen — Vollformat, nicht an die Web-viewBox angepasst.
 */
function injectMittelmarkeIntoSvg(svg: string): string {
  const t = svg.trim()
  if (!/^[\s\S]*<svg\b/i.test(t)) return t

  /** Nur die Gruppe mit id=Mittelmarke im Öffnungs-Tag — NICHT `<g[\s\S]*?id="Mittelmarke"` vom ersten `<g` aus (löscht sonst fast das ganze SVG). */
  const stripped = t.replace(/<g[^>]*\bid\s*=\s*["']Mittelmarke["'][^>]*>[\s\S]*?<\/g>/gi, '')

  const xWhite = MITTELMARKE_CENTER_X - MITTELMARKE_WHITE_W / 2
  const yBottom = MITTELMARKE_SVG_H - MITTELMARKE_TICK_LEN
  const mark = `
<g id="Mittelmarke" pointer-events="none" data-layer="production-mark">
  <rect x="${xWhite}" y="0" width="${MITTELMARKE_WHITE_W}" height="${MITTELMARKE_TICK_LEN}" fill="#ffffff" stroke="none"/>
  <rect x="${xWhite}" y="${yBottom}" width="${MITTELMARKE_WHITE_W}" height="${MITTELMARKE_TICK_LEN}" fill="#ffffff" stroke="none"/>
  <line x1="${MITTELMARKE_CENTER_X}" y1="0" x2="${MITTELMARKE_CENTER_X}" y2="${MITTELMARKE_TICK_LEN}" stroke="#000000" stroke-width="${MITTELMARKE_STROKE_W}" stroke-linecap="butt"/>
  <line x1="${MITTELMARKE_CENTER_X}" y1="${MITTELMARKE_SVG_H}" x2="${MITTELMARKE_CENTER_X}" y2="${yBottom}" stroke="#000000" stroke-width="${MITTELMARKE_STROKE_W}" stroke-linecap="butt"/>
</g>
`

  const lower = stripped.toLowerCase()
  let lastClose = -1
  let pos = 0
  while (true) {
    const j = lower.indexOf('</svg>', pos)
    if (j === -1) break
    lastClose = j
    pos = j + 1
  }
  if (lastClose === -1) return stripped + mark
  return stripped.slice(0, lastClose).trimEnd() + '\n' + mark.trim() + '\n' + stripped.slice(lastClose)
}

function prepareSvgForProduction(
  bytes: ArrayBuffer,
  filename: string
): { bytes: ArrayBuffer; prep: ProductionPrepInfo } {
  const noop = (): { bytes: ArrayBuffer; prep: ProductionPrepInfo } => ({
    bytes,
    prep: { spine_baseline_added: 0, mittelmarke: false },
  })
  if (!filename.toLowerCase().endsWith('.svg')) return noop()
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    const { svg: withBaseline, spineBaselineAdded } = ensureSpineDominantBaseline(text)
    const out = injectMittelmarkeIntoSvg(withBaseline)
    return {
      bytes: new TextEncoder().encode(out),
      prep: { spine_baseline_added: spineBaselineAdded, mittelmarke: true },
    }
  } catch {
    return noop()
  }
}

/**
 * Multipart-Datei aus FormData: In Deno ist der Wert oft ein Blob (kein `instanceof File`),
 * sonst liefert die Prüfung nur auf File fälschlich 400.
 */
function getFormDataFile(entry: FormDataEntryValue | null): { blob: Blob; filename: string } | null {
  if (entry == null || typeof entry === 'string') return null
  if (!(entry instanceof Blob) || entry.size === 0) return null
  const filename =
    typeof (entry as File).name === 'string' && (entry as File).name
      ? (entry as File).name
      : 'template.svg'
  return { blob: entry, filename }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
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
      const url = new URL(req.url)
      const gruppe = url.searchParams.get('gruppe')?.trim() || null
      let query = supabase
        .from('cover_templates')
        .select('*')
        .order('sort_order', { ascending: true })
      if (gruppe) query = query.eq('gruppe', gruppe)
      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const withUrl = (data ?? []).map((r: { storage_path: string; [k: string]: unknown }) => ({
        ...r,
        url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${r.storage_path}`,
      }))
      return new Response(JSON.stringify({ data: withUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      const formData = await req.formData()
      const filePart = getFormDataFile(formData.get('file'))
      if (!filePart) {
        return new Response(JSON.stringify({ error: 'Keine Datei im Feld "file".' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { blob, filename: rawUploadName } = filePart
      const display_name =
        (formData.get('display_name') ?? formData.get('displayName') ?? '').toString().trim() ||
        rawUploadName
      const gruppe = (formData.get('gruppe') ?? '').toString().trim()
      const sort_order = parseInt((formData.get('sort_order') ?? '0').toString(), 10) || 0
      const baseName = rawUploadName.replace(/\.[^.]+$/, '') || 'template'
      const ext = rawUploadName.includes('.') ? rawUploadName.slice(rawUploadName.lastIndexOf('.')) : '.svg'
      const filename = sanitizeFilename(baseName) + (ext.toLowerCase() === '.svg' ? '.svg' : ext)
      const storage_path = gruppe ? `${gruppe}/${filename}` : filename

      const fileBytes = await blob.arrayBuffer()
      const { bytes: preparedBytes, prep: productionPrep } = prepareSvgForProduction(fileBytes, filename)
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storage_path, preparedBytes, { contentType: 'image/svg+xml', upsert: true })

      if (uploadErr) {
        return new Response(JSON.stringify({ error: 'Storage: ' + uploadErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: row, error: insertErr } = await supabase
        .from('cover_templates')
        .insert({
          filename,
          display_name,
          gruppe,
          sort_order,
          storage_path,
          active: true,
        })
        .select()
        .single()

      if (insertErr) {
        await supabase.storage.from(BUCKET).remove([storage_path])
        const msg = insertErr.message || ''
        let hint = msg
        if (/duplicate key|23505/i.test(msg) && /filename|gruppe/i.test(msg)) {
          hint =
            'Eintrag existiert bereits: gleicher Dateiname in dieser Template-Gruppe. ' +
            'Hinweis: Nach DB-Migration 029 ist die Eindeutigkeit nur noch pro Gruppe; ' +
            'bei weiterem Konflikt anderen Dateinamen wählen oder bestehendes Template ersetzen (PATCH). ' +
            `(${msg})`
        } else if (/duplicate key|23505/i.test(msg)) {
          hint = `Datenbank: doppelter Schlüssel. ${msg}`
        }
        return new Response(JSON.stringify({ error: hint }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ...row, production_prep: productionPrep }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'PATCH') {
      const contentType = req.headers.get('content-type') ?? ''
      // Multipart: SVG-Datei am gleichen storage_path ersetzen (z. B. SVG-Editor)
      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        const id = (formData.get('id') ?? '').toString().trim()
        const filePart = getFormDataFile(formData.get('file'))
        if (!id) {
          return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!filePart) {
          return new Response(JSON.stringify({ error: 'Keine Datei im Feld "file".' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { data: existing, error: fetchErr } = await supabase
          .from('cover_templates')
          .select('storage_path, filename')
          .eq('id', id)
          .single()

        if (fetchErr || !existing) {
          return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const fileBytes = await filePart.blob.arrayBuffer()
        const { bytes: preparedBytes, prep: productionPrep } = prepareSvgForProduction(
          fileBytes,
          existing.filename,
        )
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(existing.storage_path, preparedBytes, { contentType: 'image/svg+xml', upsert: true })

        if (uploadErr) {
          return new Response(JSON.stringify({ error: 'Storage: ' + uploadErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: updated, error: updateErr } = await supabase
          .from('cover_templates')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()

        if (updateErr) {
          return new Response(JSON.stringify({ error: updateErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const row = updated as { storage_path: string; [k: string]: unknown }
        return new Response(
          JSON.stringify({
            ...row,
            url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${row.storage_path}`,
            production_prep: productionPrep,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const body = await req.json().catch(() => ({})) as {
        id?: string
        filename?: string
        display_name?: string
        gruppe?: string
        sort_order?: number
        active?: boolean
        file?: string
        cd_label_template_id?: string | null
      }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: existing, error: fetchErr } = await supabase
        .from('cover_templates')
        .select('storage_path, filename, gruppe')
        .eq('id', id)
        .single()

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.display_name !== undefined) updates.display_name = String(body.display_name).trim()
      if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
      if (typeof body.active === 'boolean') updates.active = body.active
      if (body.cd_label_template_id !== undefined) {
        const raw = body.cd_label_template_id
        if (raw === null || raw === '') {
          updates.cd_label_template_id = null
        } else {
          const s = String(raw).trim()
          updates.cd_label_template_id = /^[0-9a-f-]{36}$/i.test(s) ? s : null
        }
      }

      let productionPrepFromMove: ProductionPrepInfo | undefined

      if (body.gruppe !== undefined) {
        const newG = String(body.gruppe).trim()
        const ex = existing as { storage_path: string; filename: string; gruppe: string | null }
        const oldG = String(ex.gruppe ?? '').trim()
        const oldPath = String(ex.storage_path)
        const filename = String(ex.filename)
        const newStoragePath = newG ? `${newG}/${filename}` : filename

        if (newG !== oldG && oldPath !== newStoragePath) {
          const { data: blobData, error: dlErr } = await supabase.storage.from(BUCKET).download(oldPath)
          if (dlErr || !blobData) {
            return new Response(
              JSON.stringify({
                error: 'Storage-Download für Gruppenwechsel fehlgeschlagen: ' + (dlErr?.message ?? ''),
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
          const bytes = await blobData.arrayBuffer()
          const { bytes: preparedMove, prep } = prepareSvgForProduction(bytes, filename)
          productionPrepFromMove = prep
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(newStoragePath, preparedMove, {
            contentType: 'image/svg+xml',
            upsert: false,
          })
          if (upErr) {
            return new Response(JSON.stringify({ error: upErr.message }), {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath])
          if (rmErr) {
            console.warn('admin-cover-templates: alter Storage-Pfad nicht entfernt', rmErr)
          }
          updates.gruppe = newG
          updates.storage_path = newStoragePath
        } else {
          updates.gruppe = newG
        }
      }

      const { data: updated, error: updateErr } = await supabase
        .from('cover_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify(
          productionPrepFromMove ? { ...updated, production_prep: productionPrepFromMove } : updated,
        ),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => ({})) as { id?: string }
      const id = (body.id ?? '').trim()
      if (!id) {
        return new Response(JSON.stringify({ error: 'id erforderlich.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: row, error: fetchErr } = await supabase
        .from('cover_templates')
        .select('storage_path')
        .eq('id', id)
        .single()

      if (fetchErr || !row) {
        return new Response(JSON.stringify({ error: 'Template nicht gefunden.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabase.storage.from(BUCKET).remove([row.storage_path])
      const { error: delErr } = await supabase.from('cover_templates').delete().eq('id', id)
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Ein Fehler ist aufgetreten.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
