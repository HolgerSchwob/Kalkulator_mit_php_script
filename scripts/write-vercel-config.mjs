/**
 * Läuft auf Vercel im Build: schreibt supabase.config.json und optional dashboard.config.json
 * aus Umgebungsvariablen (siehe GITHUB_ANLEITUNG.md → Vercel).
 * Lokal ohne gesetzte Variablen: beendet mit 0, überschreibt nichts.
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')
const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !anonKey) {
  console.log(
    '[write-vercel-config] SUPABASE_URL und SUPABASE_ANON_KEY nicht gesetzt – überspringe (lokaler Build ohne Vercel-Env).'
  )
  process.exit(0)
}

writeFileSync(
  join(root, 'supabase.config.json'),
  `${JSON.stringify({ url: supabaseUrl, anonKey }, null, 2)}\n`,
  'utf8'
)
console.log('[write-vercel-config] supabase.config.json geschrieben.')

const adminSecret = (process.env.ADMIN_SECRET || '').trim()
if (adminSecret) {
  const dashboard = {
    supabaseUrl,
    anonKey,
    adminSecret,
    dashboardPassword: (process.env.DASHBOARD_PASSWORD || '').trim(),
    agentUrl: (process.env.AGENT_URL || '').trim(),
    agentApiKey: (process.env.AGENT_API_KEY || '').trim(),
  }
  writeFileSync(
    join(root, 'dashboard.config.json'),
    `${JSON.stringify(dashboard, null, 2)}\n`,
    'utf8'
  )
  console.log('[write-vercel-config] dashboard.config.json geschrieben.')
} else {
  console.log(
    '[write-vercel-config] Kein ADMIN_SECRET – dashboard.config.json nicht erzeugt (nur öffentliche Seiten).'
  )
}
