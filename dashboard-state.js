/**
 * Zentraler State und Konstanten für das Production-Dashboard.
 * Wird von allen Modulen importiert.
 */

export const STATUS_ORDER = ['Eingegangen', 'In Prüfung', 'Wartet auf Zahlung', 'Bezahlt', 'Bereit für Druck', 'Bereit für Bindung', 'Versand-/Abholbereit', 'Versendet', 'Abgeholt', 'Storniert', 'Archiviert'];
export const STATUS_DROPDOWN = ['Eingegangen', 'In Prüfung', 'Bezahlt', 'Bereit für Druck', 'Bereit für Bindung', 'Versand-/Abholbereit', 'Versendet', 'Abgeholt', 'Storniert', 'Archiviert'];
export const ASSIGNEES = ['Holger Schwob', 'Martin Rabold', 'Katja DeHaney', 'Lea Süß', 'Tim Rösner'];
export const TOOL_URLS = {
    'svg-productioner': 'svg%20productioner/svgproductioner.html',
    'preview-overlay-editor': 'tools/preview-overlay-editor/index.html',
    'svg-template-preflight': 'tools/svg-template-preflight/index.html',
    'svg-inkscape-to-editor': 'tools/svg-inkscape-to-editor/index.html',
    'svg-personalisierung': 'dashboard-svg-editor.html?embed=1',
};

export const state = {
    config: { supabaseUrl: '', anonKey: '', adminSecret: '' },
    lastOrders: [],
    currentOrderId: null,
    currentDetail: null,
    shopConfigData: null,
    currentEditingTemplate: null,
    headers() {
        const c = this.config;
        const h = { 'Content-Type': 'application/json' };
        if (c.anonKey) {
            h['Authorization'] = 'Bearer ' + c.anonKey;
            h['apikey'] = c.anonKey;
        }
        if (c.adminSecret) h['x-admin-secret'] = c.adminSecret;
        return h;
    }
};
