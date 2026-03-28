// supabaseClient.mjs
// Zentraler Supabase-Client für den Kalkulator (Aufträge, später Auth/Storage).

import { getSupabaseConfig } from './supabaseConfig.mjs';

let cachedClient = null;
let initPromise = null;

/**
 * Erstellt den Supabase-Client (einmalig, danach gecacht).
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export async function getSupabaseClient() {
    if (cachedClient) return cachedClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const config = await getSupabaseConfig();
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        cachedClient = createClient(config.url, config.anonKey);
        return cachedClient;
    })();

    return initPromise;
}
