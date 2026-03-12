// supabaseClient.mjs
// Zentraler Supabase-Client für den Kalkulator (Aufträge, später Auth/Storage).
// Konfiguration aus supabase.config.json.

let cachedClient = null;
let initPromise = null;

/**
 * Lädt die Supabase-Konfiguration aus supabase.config.json.
 * @returns {Promise<{ url: string, anonKey: string }>}
 */
async function loadConfig() {
    const response = await fetch('../supabase.config.json');
    if (!response.ok) throw new Error('Supabase-Konfiguration konnte nicht geladen werden.');
    const config = await response.json();
    if (!config.url || !config.anonKey) throw new Error('Supabase-Konfiguration unvollständig (url, anonKey).');
    return config;
}

/**
 * Erstellt den Supabase-Client (einmalig, danach gecacht).
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export async function getSupabaseClient() {
    if (cachedClient) return cachedClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const config = await loadConfig();
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        cachedClient = createClient(config.url, config.anonKey);
        return cachedClient;
    })();

    return initPromise;
}
