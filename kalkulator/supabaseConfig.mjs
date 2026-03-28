/**
 * Zentrale Supabase-Konfiguration (url, anonKey) aus supabase.config.json.
 * Ein Fetch, danach gecacht – alle Module nutzen dieselbe Quelle.
 */

let cachedConfig = null;
let loadPromise = null;

/**
 * @returns {Promise<{ url: string, anonKey: string }>}
 */
export async function getSupabaseConfig() {
    if (cachedConfig) return cachedConfig;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const response = await fetch('../supabase.config.json');
        if (!response.ok) throw new Error('Supabase-Konfiguration nicht geladen.');
        const raw = await response.json();
        const url = (raw.url || '').replace(/\/$/, '');
        const anonKey = raw.anonKey || raw.key || '';
        if (!url || !anonKey) throw new Error('Supabase-Konfiguration unvollständig (url, anonKey).');
        cachedConfig = { url, anonKey };
        return cachedConfig;
    })();

    return loadPromise;
}

/** Nur für Tests oder nach Logout nötig */
export function clearSupabaseConfigCache() {
    cachedConfig = null;
    loadPromise = null;
}
