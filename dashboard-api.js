/**
 * Alle Backend-/Supabase-Aufrufe des Dashboards.
 * Verwendet state.config und state.headers() aus dashboard-state.js.
 */

import { state } from './dashboard-state.js';

export async function listOrders() {
    const status = document.getElementById('filterStatus').value;
    const params = new URLSearchParams();
    if (state.config.adminSecret) params.set('admin_secret', state.config.adminSecret);
    if (status) params.set('status', status);
    const qs = params.toString();
    const url = state.config.supabaseUrl + '/functions/v1/list-orders' + (qs ? '?' + qs : '');
    const res = await fetch(url, { method: 'GET', headers: state.headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        let msg = data.error || ('Liste konnte nicht geladen werden. (HTTP ' + res.status + ')');
        if (res.status === 401) {
            const sent = state.config.adminSecret ? 'Es wurde ein Secret gesendet (Länge ' + state.config.adminSecret.length + '). ' : 'Kein adminSecret in der Config – bitte dashboard.config.json prüfen. ';
            msg += ' ' + sent + 'Supabase: Projekt öffnen → Edge Functions → Secrets. Dort ADMIN_SECRET eintragen (z. B. kurz: admin42). Prüfen mit: npx supabase secrets list (evtl. --project-ref <deine-project-ref>).';
        }
        if (res.status === 404) {
            msg += ' Edge Function "list-orders" nicht gefunden. Bitte deployen: npx supabase functions deploy list-orders (im Projektordner mit supabase/). Prüfen: supabaseUrl in dashboard.config.json = https://DEIN-PROJECT-REF.supabase.co';
        }
        throw new Error(msg);
    }
    return data.orders || [];
}

/** Alle Aufträge ohne Statusfilter für Statistik (Monatsauswertung). */
export async function listAllOrdersForStats() {
    const params = new URLSearchParams();
    if (state.config.adminSecret) params.set('admin_secret', state.config.adminSecret);
    const url = state.config.supabaseUrl + '/functions/v1/list-orders' + (params.toString() ? '?' + params.toString() : '');
    const res = await fetch(url, { method: 'GET', headers: state.headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Aufträge für Statistik konnten nicht geladen werden.');
    return data.orders || [];
}

export async function getOrderDetail(orderId) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/order-detail', {
        method: 'POST',
        headers: state.headers(),
        body: JSON.stringify({ order_id: orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Details konnten nicht geladen werden.');
    return data;
}

export async function updateOrder(orderId, payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/update-order', {
        method: 'POST',
        headers: state.headers(),
        body: JSON.stringify({ order_id: orderId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

/**
 * @param {string} orderId
 * @param {'received'|'status'|'review_request'} type
 * @param {string} [statusText] – bei type 'status'
 * @param {{ resend?: boolean }} [opts] – bei Bewertungsanfrage: erneut senden trotz Log-Eintrag
 */
export async function sendOrderEmail(orderId, type, statusText, opts) {
    const payload = { order_id: orderId, type, status: statusText || undefined };
    if (opts && opts.resend) payload.allow_resend = true;
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/send-order-email', {
        method: 'POST',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (data.details || 'E-Mail-Versand fehlgeschlagen.'));
    return data;
}

export async function getEmailTemplates() {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/email-templates', {
        method: 'GET',
        headers: state.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Templates konnten nicht geladen werden.');
    return data.templates || [];
}

export async function saveEmailTemplate(payload) {
    let res;
    try {
        res = await fetch(state.config.supabaseUrl + '/functions/v1/email-templates', {
            method: 'PATCH',
            headers: state.headers(),
            body: JSON.stringify(payload),
        });
    } catch (err) {
        throw new Error('Netzwerkfehler (Failed to fetch). Prüfen Sie die Supabase-URL in dashboard.config.json und ob die Function email-templates deployed ist.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

export async function getShopConfig() {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/shop-config', { method: 'GET', headers: state.headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Shop-Konfiguration konnte nicht geladen werden.');
    return data.config;
}

export async function saveShopConfig(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/shop-config', {
        method: 'PATCH',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

/**
 * Preview-Asset in Supabase Storage hochladen (für Shop-Vorschau-Hintergründe).
 * @param {File} file - Bilddatei (PNG, JPEG, WebP)
 * @param {string} [pathPrefix] - Optionaler Ordner, z. B. Bindung-ID (softcover_foil)
 * @returns {Promise<{ url: string }>} - Öffentliche URL des hochgeladenen Bildes
 */
// --- Farbpaare (Supabase-Tabelle farbpaare) ---
export async function getFarbpaare() {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-farbpaare', {
        method: 'GET',
        headers: state.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Farbpaare konnten nicht geladen werden.');
    return data.data ?? [];
}

export async function postFarbpaare(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-farbpaare', {
        method: 'POST',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

export async function patchFarbpaare(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-farbpaare', {
        method: 'PATCH',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

export async function deleteFarbpaare(id) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-farbpaare', {
        method: 'DELETE',
        headers: state.headers(),
        body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen.');
    return data;
}

// --- Template-Zuordnung (Supabase-Tabelle template_zuordnung) ---
export async function getTemplateZuordnungAll() {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-template-zuordnung', {
        method: 'GET',
        headers: state.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Template-Zuordnungen konnten nicht geladen werden.');
    return data.data ?? [];
}

export async function getTemplateZuordnungByFile(templateFilename) {
    const res = await fetch(
        state.config.supabaseUrl + '/functions/v1/admin-template-zuordnung?template_filename=' + encodeURIComponent(templateFilename),
        { method: 'GET', headers: state.headers() }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Template-Zuordnung konnte nicht geladen werden.');
    return data;
}

export async function putTemplateZuordnung(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-template-zuordnung', {
        method: 'PUT',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

// --- Cover-Templates (Supabase Storage + cover_templates) ---
export async function getCoverTemplatesAdmin(gruppe = null) {
    const qs = gruppe ? '?gruppe=' + encodeURIComponent(gruppe) : '';
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-templates' + qs, {
        method: 'GET',
        headers: state.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Templates konnten nicht geladen werden.');
    return data.data ?? [];
}

export async function uploadCoverTemplate(formData) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-templates', {
        method: 'POST',
        headers: {
            'x-admin-secret': state.config.adminSecret || '',
            'Authorization': 'Bearer ' + (state.config.anonKey || ''),
            apikey: state.config.anonKey || '',
        },
        body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen.');
    return data;
}

export async function patchCoverTemplate(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-templates', {
        method: 'PATCH',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    return data;
}

export async function deleteCoverTemplate(id) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-templates', {
        method: 'DELETE',
        headers: state.headers(),
        body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen.');
    return data;
}

// --- Cover-Template-Gruppen (Dimensionen, Falz pro Gruppe) ---
export async function getCoverTemplateGroups() {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-template-groups', {
        method: 'GET',
        headers: state.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Template-Gruppen konnten nicht geladen werden.');
    return data.data ?? [];
}

export async function patchCoverTemplateGroup(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-template-groups', {
        method: 'PATCH',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Gruppe konnte nicht gespeichert werden.');
    return data;
}

export async function postCoverTemplateGroup(payload) {
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/admin-cover-template-groups', {
        method: 'POST',
        headers: state.headers(),
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Gruppe konnte nicht angelegt werden.');
    return data;
}

export async function uploadPreviewAsset(file, pathPrefix = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (pathPrefix) formData.append('path', pathPrefix);
    const res = await fetch(state.config.supabaseUrl + '/functions/v1/upload-preview-asset', {
        method: 'POST',
        headers: {
            'x-admin-secret': state.config.adminSecret || '',
            'Authorization': 'Bearer ' + (state.config.anonKey || ''),
            apikey: state.config.anonKey || '',
        },
        body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen.');
    return data;
}
