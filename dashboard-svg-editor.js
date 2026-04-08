/**
 * SVG-Personalisierung – Layer-Erkennung, Elementliste, Farbrollen, Editor-/Produktion-Export
 * Konfiguration per postMessage (dashboard-tool-config) wie andere Dashboard-Tools.
 */

const INK_NS = 'http://www.inkscape.org/namespaces/inkscape';
const SODIPODI_NS = 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd';
const SVG_NS = 'http://www.w3.org/2000/svg';

const INTERESTING = new Set([
    'text',
    'image',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polygon',
    'polyline',
    'use',
]);

// ─── Font-Embedding ───────────────────────────────────────────────────────────
const IGNORE_FONTS = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'arial', 'helvetica', 'times', 'times new roman', 'georgia', 'verdana',
    'courier', 'courier new', 'inherit', 'initial', 'unset',
]);

function normalizeFontWeight(w) {
    const map = { bold: '700', normal: '400', regular: '400', light: '300',
                  medium: '500', semibold: '600', 'extra-bold': '800', black: '900' };
    return map[(w || '').toLowerCase()] ?? (/^\d+$/.test(String(w)) ? String(w) : '400');
}

function scanSvgFonts(doc) {
    const fontMap = new Map();
    for (const el of doc.querySelectorAll('text, tspan, flowPara, flowSpan')) {
        const style = el.getAttribute('style') || '';
        let family = el.getAttribute('font-family') || (style.match(/font-family:\s*([^;"]+)/)?.[1] ?? '');
        family = family.split(',')[0].replace(/['"]/g, '').trim();
        if (!family || IGNORE_FONTS.has(family.toLowerCase())) continue;
        let weight = el.getAttribute('font-weight') || (style.match(/font-weight:\s*([^;"]+)/)?.[1]?.trim() ?? '400');
        weight = normalizeFontWeight(weight);
        const italic = el.getAttribute('font-style') === 'italic' || /font-style:\s*italic/.test(style);
        if (!fontMap.has(family)) fontMap.set(family, new Set());
        fontMap.get(family).add(weight + (italic ? 'italic' : ''));
    }
    return fontMap;
}

async function fetchGoogleFontsCss(family, variantsSet) {
    const tuples = [...variantsSet].map(v => {
        const italic = v.endsWith('italic') ? 1 : 0;
        return [italic, parseInt(v.replace('italic', '')) || 400];
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const axisStr = tuples.map(t => `${t[0]},${t[1]}`).join(';');
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@${axisStr}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Fonts: ${res.status} für „${family}"`);
    return res.text();
}

async function inlineWoff2Urls(cssText) {
    const urlRe = /url\(['"]?(https:\/\/[^'")\s]+)['"]?\)/g;
    const seen = new Map();
    for (const [, url] of cssText.matchAll(urlRe)) {
        if (!seen.has(url)) seen.set(url, url);
    }
    await Promise.all([...seen.keys()].map(async url => {
        try {
            const blob = await fetch(url).then(r => r.blob());
            const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            seen.set(url, b64);
        } catch { /* keep original URL */ }
    }));
    return cssText.replace(/url\(['"]?(https:\/\/[^'")\s]+)['"]?\)/g, (_, url) => `url('${seen.get(url) ?? url}')`);
}

async function buildEmbeddedFontsCss(doc) {
    const fontMap = scanSvgFonts(doc);
    if (!fontMap.size) return '';
    let css = '';
    for (const [family, variants] of fontMap) {
        try {
            const raw = await fetchGoogleFontsCss(family, variants);
            css += await inlineWoff2Urls(raw) + '\n';
        } catch (e) {
            console.warn('[FontEmbed]', e.message);
        }
    }
    return css;
}

/** @type {{ supabaseUrl?: string, anonKey?: string, adminSecret?: string }} */
let toolConfig = {};
/** @type {SVGSVGElement | null} */
let svgRoot = null;
/** @type {Array<{ uid: string, el: Element, layer: string, tag: string }>} */
let elementRows = [];
let schemaElements = [];
/** Alle Einträge inkl. inaktiv (nur mit Admin-Header von get-cover-schema) */
let schemaElementsAll = [];
let palettesAll = [];
/** @type {object[]} */
let schemaNewRows = [];
/** @type {object[]} */
let paletteNewRows = [];
/** Globale Farbpaare (Tabelle cover_farbpaare) – globaler Pool aller Farbpaare */
let farbpaareRef = [];
/** Dateiname des zuletzt per Dateiauswahl geladenen SVG */
let currentSvgFilename = '';
/** Cover-Templates (admin-cover-templates), nur mit Admin-Secret */
let coverTemplatesList = [];
/** Cover-Templates von get-cover-templates (öffentlich): { file, name, url } */
let supabaseTemplatesCache = [];
/** UUID aus admin-cover-templates, wenn currentSvgFilename einem Eintrag entspricht (Upload „ersetzen") */
let currentCoverTemplateId = null;
/** Template-Gruppe (`cover_templates.gruppe`) für eindeutige Zuordnung bei gleichem Dateinamen in mehreren Gruppen */
let currentTemplateGruppe = null;

/** Fallback wenn Admin-API nicht erreichbar (z. B. ohne Secret) */
const TEMPLATE_GROUPS_FALLBACK = [
    { id: 'hardcover_modern', name: 'Hardcover Modern' },
    { id: 'hardcover_efalin', name: 'Hardcover Klassik (Efalin)' },
    { id: 'paperback_modern', name: 'Paperback Modern' },
    { id: 'paperback_classic', name: 'Paperback Classic' },
    { id: 'paperback', name: 'Paperback (Legacy)' },
];

/** Rohe Zeilen aus GET admin-cover-template-groups */
let templateGroupsRowsCache = [];
/** Bis zum ersten erfolgreichen API-Lauf Fallback-Dropdowns nutzen */
let templateGroupsLoadFailed = true;

/**
 * @returns {Array<{ id: string, name: string }>}
 */
function getTemplateGroupsList() {
    if (templateGroupsRowsCache.length) {
        return templateGroupsRowsCache.map((r) => ({
            id: r.id,
            name: String(r.display_name || r.id || '').trim() || r.id,
        }));
    }
    return templateGroupsLoadFailed ? [...TEMPLATE_GROUPS_FALLBACK] : [];
}

function refillTemplateGroupDropdowns() {
    const list = getTemplateGroupsList();
    const optsFromList =
        list.map((g) => `<option value="${escapeAttr(g.id)}">${escapeHtml(g.name)}</option>`).join('');
    const gruppeEl = document.getElementById('supabaseTemplateGruppe');
    if (gruppeEl) {
        const v = gruppeEl.value;
        gruppeEl.innerHTML = '<option value="">Alle Gruppen</option>' + optsFromList;
        if (v && [...gruppeEl.options].some((o) => o.value === v)) gruppeEl.value = v;
    }
    const filt = document.getElementById('tmplOverviewGruppeFilter');
    if (filt) {
        const fv = filt.value;
        filt.innerHTML = '<option value="">Alle Gruppen</option>' + optsFromList;
        if (fv && [...filt.options].some((o) => o.value === fv)) filt.value = fv;
    }
    const uploadSel = document.getElementById('supabaseUploadGruppe');
    if (uploadSel) {
        const uv = uploadSel.value;
        uploadSel.innerHTML = optsFromList;
        if (uv && [...uploadSel.options].some((o) => o.value === uv)) uploadSel.value = uv;
        else if (list.length && !uv) uploadSel.selectedIndex = 0;
    }
}

async function refreshTemplateGroupsCache() {
    if (!hasAdminSecret() || !(toolConfig.supabaseUrl || '').trim()) {
        templateGroupsRowsCache = [];
        templateGroupsLoadFailed = true;
        refillTemplateGroupDropdowns();
        renderTemplateGroupsSettingsTable();
        return;
    }
    try {
        const d = await apiFetchEdge('GET', '/functions/v1/admin-cover-template-groups');
        templateGroupsRowsCache = Array.isArray(d.data) ? d.data : [];
        templateGroupsLoadFailed = false;
    } catch (e) {
        templateGroupsRowsCache = [];
        templateGroupsLoadFailed = true;
        console.warn('[Template-Gruppen]', e);
    }
    refillTemplateGroupDropdowns();
    renderTemplateGroupsSettingsTable();
    tmplOverviewRenderTable();
}

function renderTemplateGroupsSettingsTable() {
    const wrap = document.getElementById('templateGroupsTableWrap');
    if (!wrap) return;
    if (!hasAdminSecret()) {
        wrap.innerHTML = '<p class="schema-status err">Admin-Secret erforderlich (Tool über das Dashboard öffnen).</p>';
        return;
    }
    const rows = templateGroupsRowsCache;
    if (!rows.length) {
        wrap.innerHTML =
            '<p class="schema-status">' +
            (templateGroupsLoadFailed
                ? 'API nicht erreichbar – Fallback-Gruppen in den Dropdowns.'
                : 'Keine Gruppen. Legen Sie eine neue Gruppe an oder „Neu laden“.') +
            '</p>';
        return;
    }

    const head =
        '<table class="template-groups-table"><thead><tr>' +
        '<th>Sort</th><th>id</th><th>Anzeigename</th><th>spine_off</th><th>Höhe</th><th>U1/U4</th>' +
        '<th>Spine-Ref</th><th>Falz</th><th>svg_W</th><th>svg_H</th><th>center_X</th><th></th>' +
        '</tr></thead><tbody>';
    const body = rows
        .map((r) => {
            const id = escapeAttr(r.id);
            const dims = r.dimensions && typeof r.dimensions === 'object' ? r.dimensions : {};
            const sw = dims.svg_total_width ?? 500;
            const sh = dims.svg_total_height ?? 330;
            const cx = dims.svg_center_x ?? 250;
            const dsp = escapeAttr(r.display_name || '');
            const defSpine =
                r.default_spine_width_mm != null && r.default_spine_width_mm !== ''
                    ? String(r.default_spine_width_mm)
                    : '';
            return (
                `<tr data-tg-id="${id}">` +
                `<td><input type="number" class="tg-sort svg-shop-input" min="0" value="${Number(r.sort_order) || 0}" /></td>` +
                `<td class="tg-id"><code>${escapeHtml(r.id)}</code></td>` +
                `<td><input type="text" class="tg-display svg-shop-input tg-inp-wide" value="${dsp}" /></td>` +
                `<td><input type="number" class="tg-spine-off svg-shop-input" step="0.1" value="${Number(r.spine_offset_mm) || 0}" /></td>` +
                `<td><input type="number" class="tg-vis-h svg-shop-input" step="0.1" value="${Number(r.visible_cover_height_mm) || 0}" /></td>` +
                `<td><input type="number" class="tg-u1 svg-shop-input" step="0.1" value="${Number(r.u1_width_mm) || 0}" /></td>` +
                `<td><input type="number" class="tg-def-spine svg-shop-input" step="0.1" value="${defSpine}" placeholder="leer" /></td>` +
                `<td><input type="number" class="tg-falz svg-shop-input" step="0.1" value="${Number(r.falz_zone_width_mm) || 0}" /></td>` +
                `<td><input type="number" class="tg-svg-w svg-shop-input" step="0.1" value="${Number(sw) || 0}" /></td>` +
                `<td><input type="number" class="tg-svg-h svg-shop-input" step="0.1" value="${Number(sh) || 0}" /></td>` +
                `<td><input type="number" class="tg-svg-cx svg-shop-input" step="0.1" value="${Number(cx) || 0}" /></td>` +
                `<td><button type="button" class="btn btn-sm btn-tg-open-templates" data-gruppe="${id}">Templates</button></td>` +
                `</tr>`
            );
        })
        .join('');
    wrap.innerHTML = head + body + '</tbody></table>';
}

async function saveAllTemplateGroupsFromTable() {
    const wrap = document.getElementById('templateGroupsTableWrap');
    if (!wrap || !hasAdminSecret()) return;
    const trs = wrap.querySelectorAll('tbody tr[data-tg-id]');
    if (!trs.length) return;
    try {
        for (const tr of trs) {
            const gid = tr.getAttribute('data-tg-id');
            if (!gid) continue;
            const parseNum = (sel, fallback) => {
                const v = parseFloat(String(tr.querySelector(sel)?.value ?? '').replace(',', '.'));
                return Number.isFinite(v) ? v : fallback;
            };
            const defRaw = (tr.querySelector('.tg-def-spine')?.value ?? '').trim();
            const defSpineParsed = parseFloat(defRaw.replace(',', '.'));
            const payload = {
                id: gid,
                display_name: (tr.querySelector('.tg-display')?.value ?? '').trim(),
                sort_order: parseInt(tr.querySelector('.tg-sort')?.value ?? '0', 10) || 0,
                spine_offset_mm: parseNum('.tg-spine-off', 0),
                visible_cover_height_mm: parseNum('.tg-vis-h', 302),
                u1_width_mm: parseNum('.tg-u1', 215),
                falz_zone_width_mm: parseNum('.tg-falz', 8),
                default_spine_width_mm: defRaw === '' ? null : (Number.isFinite(defSpineParsed) ? defSpineParsed : null),
                dimensions: {
                    svg_total_width: parseNum('.tg-svg-w', 500),
                    svg_total_height: parseNum('.tg-svg-h', 330),
                    svg_center_x: parseNum('.tg-svg-cx', 250),
                },
            };
            await apiFetchEdge('PATCH', '/functions/v1/admin-cover-template-groups', payload);
        }
        showToast('Template-Gruppen gespeichert.', 'success');
        await refreshTemplateGroupsCache();
    } catch (e) {
        showToast(e && e.message ? e.message : String(e), 'error');
    }
}

async function createNewTemplateGroupFromForm() {
    if (!hasAdminSecret()) {
        showToast('Admin-Secret erforderlich.', 'error');
        return;
    }
    const rawId = (document.getElementById('newGroupId')?.value ?? '').trim().toLowerCase();
    const display_name = (document.getElementById('newGroupDisplayName')?.value ?? '').trim();
    if (!rawId || !/^[a-z0-9_]+$/.test(rawId)) {
        showToast('id: nur Kleinbuchstaben, Ziffern und Unterstrich.', 'warn');
        return;
    }
    try {
        await apiFetchEdge('POST', '/functions/v1/admin-cover-template-groups', {
            id: rawId,
            display_name: display_name || rawId,
        });
        showToast('Gruppe angelegt.', 'success');
        const nid = document.getElementById('newGroupId');
        const ndn = document.getElementById('newGroupDisplayName');
        if (nid) nid.value = '';
        if (ndn) ndn.value = '';
        await refreshTemplateGroupsCache();
    } catch (e) {
        showToast(e && e.message ? e.message : String(e), 'error');
    }
}

/**
 * @param {string} gruppeId
 */
function switchToEditorTemplatesForGroup(gruppeId) {
    document.querySelectorAll('.svg-editor-mode-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-mode') === 'editor');
    });
    const editorPanel = document.getElementById('panelModeEditor');
    const settingsPanel = document.getElementById('panelModeSettings');
    if (editorPanel) editorPanel.hidden = false;
    if (settingsPanel) settingsPanel.hidden = true;
    const tabBtn = document.querySelector('.svg-editor-tabs button[data-tab="templates"]');
    if (tabBtn) tabBtn.click();
    const filt = document.getElementById('tmplOverviewGruppeFilter');
    if (filt && gruppeId) {
        if ([...filt.options].some((o) => o.value === gruppeId)) filt.value = gruppeId;
        tmplOverviewRenderTable();
    }
    syncSupabaseUploadForm();
    void renderTemplateOverview();
}

/** @type {Map<string, object>} */
const schemaByElementId = new Map();
let uidCounter = 0;
/** @type {Map<string, string>} hex -> '' | 'color-1' | 'color-2' */
const colorRoleByHex = new Map();
let selectedUid = null;

// ════════════════════════════════════════════════════════════════════════════
// TOAST-SYSTEM
// ════════════════════════════════════════════════════════════════════════════

/**
 * Zeigt eine nicht-blockierende Toast-Benachrichtigung.
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} [type='info']
 * @param {number} [duration=4000]
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) { console.warn('[Toast]', type, message); return; }

    const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `svg-editor-toast svg-editor-toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML =
        `<span class="svg-editor-toast-icon">${icons[type] || 'ℹ'}</span>` +
        `<span class="svg-editor-toast-body">${String(message).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>` +
        `<span class="svg-editor-toast-close" aria-hidden="true">✕</span>`;

    container.appendChild(toast);

    const dismiss = () => {
        if (!toast.parentNode) return;
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 350);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
}

// ════════════════════════════════════════════════════════════════════════════
// SUPABASE STATUS-DOT
// ════════════════════════════════════════════════════════════════════════════

/**
 * @param {'loading'|'ok'|'err'|'idle'} status
 * @param {string} [title]
 */
function setConnectionStatus(status, title) {
    const dot = document.getElementById('supabaseStatusDot');
    if (!dot) return;
    dot.classList.remove('dot-ok', 'dot-err', 'dot-loading');
    if (status === 'ok')      dot.classList.add('dot-ok');
    if (status === 'err')     dot.classList.add('dot-err');
    if (status === 'loading') dot.classList.add('dot-loading');
    if (title) dot.title = title;
}

/** Textfeld-Liste: Vorderseite, Buchrücken, Rückseite (SSOT: tpl-group-u1 / -spine / -u4) */
const TEXT_GROUP_ORDER = ['front', 'spine', 'back'];
const TEXT_GROUP_LABELS = {
    front: 'Vorderseite',
    spine: 'Buchrücken',
    back: 'Rückseite',
};

/** Reihenfolge der Schema-Layer im Dropdown (wird pro Akkordeon mit preferredLayer rotiert) */
const SCHEMA_LAYER_BASE_ORDER = ['front', 'spine', 'back', 'any', ''];

const SCHEMA_LAYER_OPTGROUP_LABELS = {
    front: 'Vorderseite',
    spine: 'Buchrücken',
    back: 'Rückseite',
    any: 'Alle Bereiche',
    '': 'Sonstige',
};

/**
 * @param {object} se
 */
function schemaLayerKey(se) {
    const L = (se.layer || '').trim().toLowerCase();
    if (['front', 'spine', 'back', 'any'].includes(L)) return L;
    return '';
}

/**
 * HTML für &lt;select&gt;: kein Schema + optgroups nach layer, sort_order innerhalb der Gruppe.
 * @param {'front' | 'spine' | 'back' | null} [preferredLayer] – Gruppe dieses Akkordeons zuerst (schneller finden)
 */
function buildSchemaSelectOptionsHtml(preferredLayer) {
    const parts = ['<option value="">— kein Schema —</option>'];
    const byLayer = new Map();
    for (const se of schemaElements) {
        if (!se || !se.element_id) continue;
        const k = schemaLayerKey(se);
        if (!byLayer.has(k)) byLayer.set(k, []);
        byLayer.get(k).push(se);
    }
    for (const arr of byLayer.values()) {
        arr.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    }
    let order = [...SCHEMA_LAYER_BASE_ORDER];
    if (['front', 'spine', 'back'].includes(preferredLayer)) {
        order = [preferredLayer, ...SCHEMA_LAYER_BASE_ORDER.filter((k) => k !== preferredLayer)];
    }
    for (const layerKey of order) {
        const arr = byLayer.get(layerKey);
        if (!arr || !arr.length) continue;
        const lg = SCHEMA_LAYER_OPTGROUP_LABELS[layerKey] || SCHEMA_LAYER_OPTGROUP_LABELS[''];
        parts.push(`<optgroup label="${escapeAttr(lg)}">`);
        for (const se of arr) {
            parts.push(
                `<option value="${escapeAttr(se.element_id)}">${escapeHtml(se.element_id)} – ${escapeHtml(se.label)}</option>`
            );
        }
        parts.push('</optgroup>');
    }
    return parts.join('');
}

/**
 * Buchrücken: Inkscape-ID endet mit …-spine (z. B. tpl-title-spine), oder Schema-ID beginnt mit spine-,
 * oder Ebene „Spine" aus Inkscape.
 * @param {{ el: Element, layer: string }} r
 */
function isSpineTextRow(r) {
    if (r.layer === 'spine') return true;
    const id = (r.el.getAttribute('id') || '').trim();
    if (!id) return false;
    const lower = id.toLowerCase();
    if (lower.startsWith('spine-')) return true;
    return /(?:^|[-_])spine$/i.test(id);
}

/**
 * Zuordnung Textzeile → Akkordeon (Vorderseite / Buchrücken / Rückseite).
 * @param {{ el: Element, layer: string }} r
 */
function textRowGroupKey(r) {
    if ((r.layer || '').toLowerCase() === 'back') return 'back';
    if (isSpineTextRow(r)) return 'spine';
    return 'front';
}

const RULER_PX = 36;
let rulerResizeObserver = null;
/** @type {(() => void) | null} */
let rulerWindowResizeHandler = null;
/** @type {{ widthMm: number, heightMm: number, source: string }} */
let svgDocSizeMm = { widthMm: 210, heightMm: 297, source: 'fallback' };

/**
 * @param {string | null} val
 * @returns {number | null}
 */
function parseLengthToMm(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim();
    const m = /^([\d.]+)\s*(mm|cm|in|px|pt)?$/i.exec(s);
    if (!m) return null;
    const num = parseFloat(m[1]);
    if (Number.isNaN(num)) return null;
    const u = (m[2] || 'px').toLowerCase();
    if (u === 'mm') return num;
    if (u === 'cm') return num * 10;
    if (u === 'in') return num * 25.4;
    if (u === 'px' || u === 'pt') return (num * 25.4) / 96;
    return null;
}

/**
 * @param {SVGSVGElement} svg
 */
function getSvgDimensionsMm(svg) {
    const wAttr = parseLengthToMm(svg.getAttribute('width'));
    const hAttr = parseLengthToMm(svg.getAttribute('height'));
    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (wAttr != null && hAttr != null && wAttr > 0 && hAttr > 0) {
        return { widthMm: wAttr, heightMm: hAttr, source: 'attr' };
    }
    if (vb && vb.width > 0 && vb.height > 0) {
        return {
            widthMm: vb.width,
            heightMm: vb.height,
            source: 'viewBox',
        };
    }
    return { widthMm: 210, heightMm: 297, source: 'fallback' };
}

function teardownRulers() {
    if (rulerResizeObserver) {
        rulerResizeObserver.disconnect();
        rulerResizeObserver = null;
    }
    if (rulerWindowResizeHandler) {
        window.removeEventListener('resize', rulerWindowResizeHandler);
        rulerWindowResizeHandler = null;
    }
    const cTop = document.getElementById('rulerTop');
    const cLeft = document.getElementById('rulerLeft');
    if (cTop) {
        const ctx = cTop.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, cTop.width, cTop.height);
    }
    if (cLeft) {
        const ctx = cLeft.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, cLeft.width, cLeft.height);
    }
    const hint = document.getElementById('scaleHint');
    if (hint) hint.textContent = '';
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cssW
 * @param {number} cssH
 * @param {{
 *   offsetPx: number,
 *   displayPx: number,
 *   originMm: number,
 *   spanMm: number,
 * }} map
 */
function drawRulerHorizontal(ctx, cssW, cssH, map) {
    const dpr = window.devicePixelRatio || 1;
    const { offsetPx, displayPx, originMm, spanMm } = map;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgba(8, 18, 32, 0.72)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#152a42';
    {
        const left = Math.max(0, offsetPx);
        const right = Math.min(cssW, offsetPx + displayPx);
        ctx.fillRect(left, 0, Math.max(0, right - left), cssH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px Instrument Sans, system-ui, sans-serif';
    const span = Math.max(spanMm, 1e-6);
    const step = span > 500 ? 50 : span > 120 ? 10 : 5;
    const minor = Math.max(1, step / 5);
    const maxTicks = 500;
    const mmStart = originMm - minor;
    const mmEnd = originMm + span + minor;
    let tick = 0;
    for (let mm = Math.floor(mmStart / minor) * minor; mm <= mmEnd + 0.0001 && tick < maxTicks; mm += minor, tick++) {
        const x = offsetPx + ((mm - originMm) / span) * displayPx;
        if (x < -2 || x > cssW + 2) continue;
        const isMajor = Math.abs(mm / step - Math.round(mm / step)) < 0.001;
        ctx.beginPath();
        ctx.moveTo(x, isMajor ? 4 : 16);
        ctx.lineTo(x, cssH);
        ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
        ctx.stroke();
        if (isMajor) {
            ctx.fillStyle = '#e5e7eb';
            const label = String(Math.round(mm));
            ctx.fillText(label, Math.min(Math.max(x + 2, 2), cssW - 28), 14);
        }
    }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cssW
 * @param {number} cssH
 * @param {{
 *   offsetPx: number,
 *   displayPx: number,
 *   originMm: number,
 *   spanMm: number,
 * }} map
 */
function drawRulerVertical(ctx, cssW, cssH, map) {
    const dpr = window.devicePixelRatio || 1;
    const { offsetPx, displayPx, originMm, spanMm } = map;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgba(8, 18, 32, 0.72)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#152a42';
    {
        const top = Math.max(0, offsetPx);
        const bottom = Math.min(cssH, offsetPx + displayPx);
        ctx.fillRect(0, top, cssW, Math.max(0, bottom - top));
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '10px Instrument Sans, system-ui, sans-serif';
    const span = Math.max(spanMm, 1e-6);
    const step = span > 500 ? 50 : span > 120 ? 10 : 5;
    const minor = Math.max(1, step / 5);
    const maxTicks = 500;
    const mmStart = originMm - minor;
    const mmEnd = originMm + span + minor;
    let tick = 0;
    for (let mm = Math.floor(mmStart / minor) * minor; mm <= mmEnd + 0.0001 && tick < maxTicks; mm += minor, tick++) {
        const y = offsetPx + ((mm - originMm) / span) * displayPx;
        if (y < -2 || y > cssH + 2) continue;
        const isMajor = Math.abs(mm / step - Math.round(mm / step)) < 0.001;
        ctx.beginPath();
        ctx.moveTo(isMajor ? 4 : 16, y);
        ctx.lineTo(cssW, y);
        ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
        ctx.stroke();
        if (isMajor) {
            ctx.save();
            ctx.translate(12, Math.min(Math.max(y + 3, 10), cssH - 4));
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(String(Math.round(mm)), 0, 0);
            ctx.restore();
        }
    }
}

function setupRulers() {
    teardownRulers();
    if (!svgRoot) return;
    svgDocSizeMm = getSvgDimensionsMm(svgRoot);
    const hint = document.getElementById('scaleHint');
    if (hint) {
        const srcLabel =
            svgDocSizeMm.source === 'attr' ? 'width/height' : svgDocSizeMm.source === 'viewBox' ? 'ViewBox' : 'Fallback';
        let t = `${svgDocSizeMm.widthMm.toFixed(0)}×${svgDocSizeMm.heightMm.toFixed(0)} mm (${srcLabel})`;
        const vb0 = svgRoot.viewBox && svgRoot.viewBox.baseVal;
        if (vb0 && vb0.width > 0 && vb0.height > 0) {
            const ox = vb0.x * (svgDocSizeMm.widthMm / vb0.width);
            const oy = vb0.y * (svgDocSizeMm.heightMm / vb0.height);
            if (Math.abs(ox) > 0.01 || Math.abs(oy) > 0.01) {
                t += ` · ViewBox ${ox.toFixed(1)} / ${oy.toFixed(1)} mm`;
            }
        }
        hint.textContent = t;
    }
    const host = document.getElementById('svgPreviewHost');
    const cTop = document.getElementById('rulerTop');
    const cLeft = document.getElementById('rulerLeft');
    if (!host || !cTop || !cLeft) return;

    function paint() {
        if (!svgRoot) return;
        const hostRect = host.getBoundingClientRect();
        const svgRect = svgRoot.getBoundingClientRect();
        const w = Math.max(1, Math.round(hostRect.width));
        const h = Math.max(1, Math.round(hostRect.height));
        const offsetX = svgRect.left - hostRect.left;
        const offsetY = svgRect.top - hostRect.top;
        const displayW = Math.max(0.5, svgRect.width);
        const displayH = Math.max(0.5, svgRect.height);
        const dpr = window.devicePixelRatio || 1;
        cTop.width = Math.floor(w * dpr);
        cTop.height = Math.floor(RULER_PX * dpr);
        cTop.style.width = `${w}px`;
        cTop.style.height = `${RULER_PX}px`;
        cLeft.width = Math.floor(RULER_PX * dpr);
        cLeft.height = Math.floor(h * dpr);
        cLeft.style.width = `${RULER_PX}px`;
        cLeft.style.height = `${h}px`;
        const ctxT = cTop.getContext('2d');
        const ctxL = cLeft.getContext('2d');
        const vb = svgRoot.viewBox && svgRoot.viewBox.baseVal;
        const wm = svgDocSizeMm.widthMm;
        const hm = svgDocSizeMm.heightMm;
        let originMmX = 0;
        let originMmY = 0;
        if (vb && vb.width > 0 && vb.height > 0) {
            originMmX = vb.x * (wm / vb.width);
            originMmY = vb.y * (hm / vb.height);
        }
        const mapH = {
            offsetPx: offsetX,
            displayPx: displayW,
            originMm: originMmX,
            spanMm: wm,
        };
        const mapV = {
            offsetPx: offsetY,
            displayPx: displayH,
            originMm: originMmY,
            spanMm: hm,
        };
        if (ctxT) drawRulerHorizontal(ctxT, w, RULER_PX, mapH);
        if (ctxL) drawRulerVertical(ctxL, RULER_PX, h, mapV);
    }

    rulerResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(paint);
    });
    rulerResizeObserver.observe(host);
    rulerWindowResizeHandler = () => requestAnimationFrame(paint);
    window.addEventListener('resize', rulerWindowResizeHandler);
    requestAnimationFrame(() => requestAnimationFrame(paint));
}

function normalizeInkLabel(raw) {
    return (raw || '')
        .toLowerCase()
        .replace(/ü/g, 'ue')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ß/g, 'ss');
}

/**
 * @param {Element} el
 * @returns {string | null}
 */
function detectLayer(el) {
    const inkLabel = el.getAttributeNS(INK_NS, 'label') || '';
    const isLayer = el.getAttributeNS(INK_NS, 'groupmode') === 'layer';
    if (!isLayer) return null;
    const normalized = normalizeInkLabel(inkLabel);
    if (['front', 'vorderseite', 'deckel'].some((s) => normalized.includes(s))) return 'front';
    if (['spine', 'ruecken', 'rücken'].some((s) => normalized.includes(s))) return 'spine';
    if (['back', 'rueckseite', 'rückseite'].some((s) => normalized.includes(s))) return 'back';
    return null;
}

function isLayerGroup(el) {
    return el.getAttributeNS(INK_NS, 'groupmode') === 'layer';
}

function isInteresting(el) {
    const tag = el.tagName.toLowerCase();
    if (!INTERESTING.has(tag)) return false;
    if (tag === 'text') {
        let p = el.parentElement;
        while (p && p !== svgRoot) {
            if (p.tagName && p.tagName.toLowerCase() === 'text') return false;
            p = p.parentElement;
        }
    }
    return true;
}

/**
 * @param {Element} node
 * @param {string} layer
 * @param {boolean} inDefs
 */
function walkCollect(node, layer, inDefs) {
    if (node.nodeType !== 1) return;
    const el = /** @type {Element} */ (node);
    const tag = el.tagName.toLowerCase();
    if (tag === 'defs' || inDefs) {
        for (let i = 0; i < el.children.length; i++) walkCollect(el.children[i], layer, true);
        return;
    }
    if (tag === 'svg' || tag === 'g') {
        if (isLayerGroup(el)) {
            const L = detectLayer(el);
            if (L) layer = L;
        }
    }
    if (isInteresting(el)) {
        const uid = `se-${++uidCounter}`;
        el.setAttribute('data-uid', uid);
        elementRows.push({ uid, el, layer: layer || 'unknown', tag });
    }
    for (let i = 0; i < el.children.length; i++) walkCollect(el.children[i], layer, false);
}

function parseStyleFill(styleStr) {
    const m = /fill\s*:\s*([^;!]+)/i.exec(styleStr || '');
    return m ? m[1].trim() : '';
}

function parseStyleStroke(styleStr) {
    const m = /stroke\s*:\s*([^;!]+)/i.exec(styleStr || '');
    return m ? m[1].trim() : '';
}

/**
 * @param {Element} el
 * @returns {string | null}
 */
function getRawFill(el) {
    let f = el.getAttribute('fill');
    if (f && f !== 'none') return f;
    const st = el.getAttribute('style');
    const pf = parseStyleFill(st);
    if (pf && pf !== 'none') return pf;
    return null;
}

/**
 * @param {Element} el
 * @returns {string | null}
 */
function getRawStroke(el) {
    let f = el.getAttribute('stroke');
    if (f && f !== 'none') return f;
    const st = el.getAttribute('style');
    const pf = parseStyleStroke(st);
    if (pf && pf !== 'none') return pf;
    return null;
}

/**
 * @param {string} raw
 * @returns {string | null} #rrggbb
 */
function normalizeColorToHex(raw) {
    if (!raw || raw === 'none') return null;
    const s = raw.trim();
    if (s.startsWith('url(')) return null;
    if (s.startsWith('#')) {
        let h = s.slice(1);
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return '#' + h.toLowerCase();
        return null;
    }
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (m) {
        const r = +m[1];
        const g = +m[2];
        const b = +m[3];
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    return null;
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function rgbToHex(r, g, b) {
    const c = (x) => Math.max(0, Math.min(255, Math.round(x)));
    return (
        '#' +
        [c(r), c(g), c(b)]
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('')
    );
}

/**
 * Wie im Browser gerendert: rgb/rgba, %-Werte, #hex
 * @param {string} str
 * @returns {string | null}
 */
function parseCssColorToHex(str) {
    if (!str) return null;
    const s = str.trim();
    if (!s || s === 'none' || s === 'transparent') return null;
    if (s.startsWith('url(')) return null;
    const direct = normalizeColorToHex(s);
    if (direct) return direct;
    const m = /^rgba?\(\s*([^)]+)\s*\)/i.exec(s);
    if (!m) return null;
    const parts = m[1].split(',').map((x) => x.trim());
    if (parts.length < 3) return null;
    if (parts.length >= 4) {
        const a = parseFloat(parts[3]);
        if (!Number.isNaN(a) && a === 0) return null;
    }
    const comp = (p) => {
        if (p.endsWith('%')) return (parseFloat(p) / 100) * 255;
        return parseFloat(p);
    };
    const r = comp(parts[0]);
    const g = comp(parts[1]);
    const b = comp(parts[2]);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return rgbToHex(r, g, b);
}

/**
 * @param {Element} el
 * @param {'fill'|'stroke'} prop
 * @returns {string | null}
 */
function getComputedPaintHex(el, prop) {
    try {
        const win = el.ownerDocument && el.ownerDocument.defaultView;
        if (win) {
            const cs = win.getComputedStyle(el);
            const raw = cs.getPropertyValue(prop === 'stroke' ? 'stroke' : 'fill');
            const hex = parseCssColorToHex(raw);
            if (hex) return hex;
        }
    } catch (_) {}
    if (prop === 'stroke') {
        const rs = getRawStroke(el);
        return rs ? parseCssColorToHex(rs) || normalizeColorToHex(rs) : null;
    }
    const rf = getRawFill(el);
    return rf ? parseCssColorToHex(rf) || normalizeColorToHex(rf) : null;
}

/**
 * @param {Element} el
 */
function strokeWidthEffective(el) {
    try {
        const win = el.ownerDocument && el.ownerDocument.defaultView;
        if (!win) return 0;
        const cs = win.getComputedStyle(el);
        const n = parseFloat(cs.strokeWidth);
        return Number.isNaN(n) ? 0 : n;
    } catch (_) {
        return 0;
    }
}

/**
 * Alle sichtbaren Vollfarben (Fill + Stroke), wie in der Vorschau
 * @param {Element} el
 * @returns {string[]}
 */
function collectPaintHexesForElement(el) {
    const set = new Set();
    const f = getComputedPaintHex(el, 'fill');
    if (f) set.add(f);
    const st = getComputedPaintHex(el, 'stroke');
    if (st && strokeWidthEffective(el) > 0) set.add(st);
    return [...set];
}

/**
 * @param {Element} el
 * @param {string} hex
 */
function elementMatchesPaintHex(el, hex) {
    return collectPaintHexesForElement(el).includes(hex);
}

/**
 * @param {Element} el
 * @returns {string}
 */
function resolveColorRoleFromElement(el) {
    const fillHex = getComputedPaintHex(el, 'fill');
    const strokeHex = getComputedPaintHex(el, 'stroke');
    if (fillHex && colorRoleByHex.get(fillHex)) return colorRoleByHex.get(fillHex) || '';
    if (strokeHex && colorRoleByHex.get(strokeHex)) return colorRoleByHex.get(strokeHex) || '';
    return '';
}

/**
 * Liest bestehende Zuweisungen aus dem SVG (data-color-role, colorselector) in die Map für den Tab „Farben“.
 */
function hydrateColorRolesFromSvg() {
    if (!svgRoot) return;
    /**
     * @param {Element} el
     * @returns {'' | 'color-1' | 'color-2'}
     */
    const roleFromElement = (el) => {
        const dr = (el.getAttribute('data-color-role') || '').trim();
        if (dr === 'color-1' || dr === 'color-2') return dr;
        const cs = (el.getAttribute('colorselector') || '').trim().toLowerCase();
        if (cs === 'color1' || cs === 'color-1') return 'color-1';
        if (cs === 'color2' || cs === 'color-2') return 'color-2';
        return '';
    };
    for (const r of elementRows) {
        const role = roleFromElement(r.el);
        if (!role) continue;
        for (const hex of collectPaintHexesForElement(r.el)) {
            colorRoleByHex.set(hex, role);
        }
    }
}

/**
 * Schreibt die aktuelle Map als data-color-role auf die Live-DOM-Knoten (Shop-Konvention).
 */
function syncLiveDataColorRoles() {
    if (!svgRoot) return;
    for (const r of elementRows) {
        const role = resolveColorRoleFromElement(r.el);
        if (role) r.el.setAttribute('data-color-role', role);
        else r.el.removeAttribute('data-color-role');
    }
}

function idConventionOk(id) {
    const s = (id || '').trim();
    if (!s) return false;
    // SSOT: Webshop (HardcoverEditor) — tpl-* für Texte und Bild-/Logo-Platzhalter
    if (/^tpl-[a-z0-9-]+$/i.test(s)) return true;
    // Legacy (Migration 020 / alte SVGs)
    if (/^(front|spine|back)-(text|img|zone|bg|deco)-[a-z0-9-]+$/i.test(s)) return true;
    return false;
}

function hasAdminSecret() {
    return Boolean((toolConfig.adminSecret || '').trim());
}

async function loadSchema() {
    const statusEl = document.getElementById('schemaStatus');
    const url = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    if (!url || !key) {
        statusEl.textContent = 'Schema: nicht verbunden (Supabase-URL / anonKey fehlen).';
        statusEl.className = 'schema-status err';
        setConnectionStatus('err', 'Supabase: nicht verbunden');
        await refreshSupabaseTemplateList();
        return;
    }
    setConnectionStatus('loading', 'Supabase: verbinde…');
    try {
        const headers = { apikey: key, Authorization: `Bearer ${key}` };
        if (hasAdminSecret()) headers['x-admin-secret'] = toolConfig.adminSecret.trim();
        const res = await fetch(`${url}/functions/v1/get-cover-schema`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        schemaElementsAll = Array.isArray(data.elements) ? data.elements : [];
        palettesAll = Array.isArray(data.farbpaare) ? data.farbpaare : [];
        schemaNewRows = [];
        paletteNewRows = [];
        schemaElements = schemaElementsAll.filter((e) => e && e.active);
        schemaByElementId.clear();
        for (const e of schemaElements) {
            if (e && e.element_id) schemaByElementId.set(e.element_id, e);
        }
        statusEl.textContent = `Schema: ${schemaElements.length} aktive Felder geladen.`;
        statusEl.className = 'schema-status ok';
        setConnectionStatus('ok', `Supabase verbunden · ${schemaElements.length} Schema-Felder`);
        if (elementRows.length) renderElementsTable();
        await loadFarbpaareRef();
        renderFarbpaareReference();
        renderSchemaManagerTables();
    } catch (e) {
        const msg = e && e.message ? e.message : 'Ladefehler';
        statusEl.textContent = 'Schema: ' + msg;
        statusEl.className = 'schema-status err';
        setConnectionStatus('err', `Supabase: ${msg}`);
    } finally {
        await refreshSupabaseTemplateList();
        syncSupabaseUploadForm();
    }
}

/**
 * Liste der Cover-Templates aus Supabase (Edge Function get-cover-templates, anon).
 */
async function refreshSupabaseTemplateList() {
    const sel = document.getElementById('supabaseTemplateSelect');
    const btnLoad = document.getElementById('btnLoadSupabaseTemplate');
    const btnRef = document.getElementById('btnRefreshSupabaseTemplates');
    const gruppeEl = document.getElementById('supabaseTemplateGruppe');
    const url = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    if (!url || !key) {
        supabaseTemplatesCache = [];
        if (sel) {
            sel.innerHTML = '<option value="">— Supabase verbinden —</option>';
            sel.disabled = true;
        }
        if (btnLoad) btnLoad.disabled = true;
        if (btnRef) btnRef.disabled = true;
        if (gruppeEl) gruppeEl.disabled = true;
        return;
    }
    if (gruppeEl) gruppeEl.disabled = false;
    const gruppe = gruppeEl ? gruppeEl.value.trim() : '';
    const qs = gruppe ? `?gruppe=${encodeURIComponent(gruppe)}` : '';
    let preserveFile = '';
    if (sel && sel.value !== '') {
        const pi = parseInt(sel.value, 10);
        if (!Number.isNaN(pi) && supabaseTemplatesCache[pi]) preserveFile = supabaseTemplatesCache[pi].file || '';
    }
    try {
        const res = await fetch(`${url}/functions/v1/get-cover-templates${qs}`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        supabaseTemplatesCache = Array.isArray(data.templates) ? data.templates : [];
        if (sel) {
            if (!supabaseTemplatesCache.length) {
                sel.innerHTML = '<option value="">— Keine Templates in Supabase —</option>';
            } else {
                sel.innerHTML =
                    '<option value="">— Template wählen —</option>' +
                    supabaseTemplatesCache
                        .map(
                            (t, i) =>
                                `<option value="${i}">${escapeHtml(t.name || t.file)} (${escapeHtml(
                                    t.file || ''
                                )})</option>`
                        )
                        .join('');
                if (preserveFile) {
                    const ni = supabaseTemplatesCache.findIndex((t) => (t.file || '') === preserveFile);
                    if (ni >= 0) sel.value = String(ni);
                }
            }
            sel.disabled = false;
        }
        if (btnLoad) btnLoad.disabled = supabaseTemplatesCache.length === 0;
        if (btnRef) btnRef.disabled = false;
    } catch (e) {
        supabaseTemplatesCache = [];
        const msg = e && e.message ? String(e.message) : 'Fehler';
        if (sel) {
            sel.innerHTML = `<option value="">— ${escapeHtml(msg)} —</option>`;
            sel.disabled = true;
        }
        if (btnLoad) btnLoad.disabled = true;
        if (btnRef) btnRef.disabled = false;
    }
    const pTmpl = document.getElementById('panelTemplates');
    if (pTmpl && !pTmpl.classList.contains('hidden')) {
        void renderTemplateOverview();
    }
}

async function loadSelectedSupabaseTemplate() {
    const sel = document.getElementById('supabaseTemplateSelect');
    const idx = sel && sel.value !== '' ? parseInt(sel.value, 10) : NaN;
    if (Number.isNaN(idx) || !supabaseTemplatesCache[idx]) {
        showToast('Bitte ein Template aus der Liste wählen.', 'warn');
        return;
    }
    const t = supabaseTemplatesCache[idx];
    const fetchUrl = (t.url || '').trim();
    if (!fetchUrl) {
        showToast('Keine öffentliche URL für dieses Template (Supabase Storage).', 'error');
        return;
    }
    try {
        const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const fname = (t.file || 'template.svg').trim() || 'template.svg';
        await loadCoverTemplatesListIfNeeded();
        const row = t.id ? coverTemplatesList.find((x) => x.id === t.id) : null;
        const g = row?.gruppe ?? null;
        loadSvgFromText(text, fname, 'Quelle: Supabase Storage', t.id || null, g);
    } catch (e) {
        showToast('Template konnte nicht geladen werden: ' + (e && e.message ? e.message : String(e)), 'error');
    }
}

function initSupabaseTemplateBar() {
    const gruppeEl = document.getElementById('supabaseTemplateGruppe');
    refillTemplateGroupDropdowns();
    gruppeEl?.addEventListener('change', () => {
        void refreshSupabaseTemplateList();
    });
    document.getElementById('btnLoadSupabaseTemplate')?.addEventListener('click', () => {
        void loadSelectedSupabaseTemplate();
    });
    document.getElementById('btnRefreshSupabaseTemplates')?.addEventListener('click', () => {
        void refreshSupabaseTemplateList();
    });
    void refreshSupabaseTemplateList();
}

/**
 * @param {'POST'|'PATCH'} method
 * @param {FormData} formData
 */
async function apiAdminCoverTemplatesMultipart(method, formData) {
    const base = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    const res = await fetch(`${base}/functions/v1/admin-cover-templates`, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'x-admin-secret': toolConfig.adminSecret || '',
        },
        body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

/**
 * Findet die cover_templates-Zeile zum Dateinamen (exakt, Groß/Klein, ohne _production).
 * @param {string} filename
 * @param {object[]} rows
 * @param {string|null|undefined} [gruppe] – Wenn gesetzt, nur in dieser Template-Gruppe suchen (verhindert falsche Zeile bei gleichem Dateinamen).
 * @returns {object | null}
 */
function findCoverTemplateRowForFilename(filename, rows, gruppe) {
    const fn = String(filename || '').trim();
    if (!fn || !Array.isArray(rows)) return null;
    const norm = (s) => String(s || '').trim();
    const gTrim = gruppe != null && String(gruppe).trim() !== '' ? String(gruppe).trim() : null;
    const pool = gTrim ? rows.filter((t) => norm(t.gruppe) === gTrim) : rows;

    const matchOne = (list) => {
        let r = list.find((t) => norm(t.filename) === fn);
        if (r) return r;
        const lower = fn.toLowerCase();
        r = list.find((t) => norm(t.filename).toLowerCase() === lower);
        if (r) return r;
        const m = fn.match(/^(.*)_production(\.svg)$/i);
        if (m) {
            const alt = m[1] + m[2];
            r = list.find((t) => norm(t.filename) === alt || norm(t.filename).toLowerCase() === alt.toLowerCase());
            if (r) return r;
        }
        return null;
    };

    if (gTrim) {
        return matchOne(pool);
    }

    const matches = rows.filter((t) => {
        const n = norm(t.filename);
        if (n === fn || n.toLowerCase() === fn.toLowerCase()) return true;
        const m = fn.match(/^(.*)_production(\.svg)$/i);
        if (m) {
            const alt = m[1] + m[2];
            if (n === alt || n.toLowerCase() === alt.toLowerCase()) return true;
        }
        return false;
    });
    if (matches.length === 1) return matches[0];
    return null;
}

async function resolveCurrentCoverTemplateId() {
    currentCoverTemplateId = null;
    if (!hasAdminSecret() || !(currentSvgFilename || '').trim()) {
        syncSupabaseUploadForm();
        return;
    }
    try {
        const d = await apiFetchEdge('GET', '/functions/v1/admin-cover-templates');
        const rows = Array.isArray(d.data) ? d.data : [];
        const uploadGruppe = document.getElementById('supabaseUploadGruppe')?.value?.trim() || '';
        const gruppe =
            (currentTemplateGruppe && String(currentTemplateGruppe).trim()) || uploadGruppe || null;
        const row = findCoverTemplateRowForFilename(currentSvgFilename, rows, gruppe);
        if (row && row.id) currentCoverTemplateId = row.id;
    } catch (_) {
        currentCoverTemplateId = null;
    }
    syncSupabaseUploadForm();
}

function syncSupabaseUploadForm() {
    const hint = document.getElementById('supabaseUploadHint');
    const wrap = document.getElementById('supabaseUploadFormWrap');
    const modeRep = document.getElementById('supabaseUploadModeReplace');
    const modeNewEl = document.getElementById('supabaseUploadModeNew');
    const repInfo = document.getElementById('supabaseUploadReplaceInfo');
    const fieldsNew = document.getElementById('supabaseUploadFieldsNew');
    if (!hint || !wrap) return;
    if (!hasAdminSecret()) {
        hint.textContent =
            'Supabase-Upload: bitte mit Admin-Secret über das Dashboard öffnen (gleicher Wert wie ADMIN_SECRET in Supabase).';
        hint.className = 'schema-status err';
        wrap.classList.add('hidden');
        return;
    }
    hint.textContent =
        'Produktions-SVG (Fonts eingebettet) aus dem aktuellen Editor in den Bucket cover-templates – siehe Formular unten im Tab „Templates“.';
    hint.className = 'schema-status';
    wrap.classList.remove('hidden');
    if (modeRep) {
        modeRep.disabled = !currentCoverTemplateId;
        if (modeRep.disabled && modeRep.checked && modeNewEl) {
            modeNewEl.checked = true;
        }
    }
    const mode = document.querySelector('input[name="supabaseUploadMode"]:checked')?.value || 'new';
    if (fieldsNew) fieldsNew.classList.toggle('hidden', mode === 'replace');
    if (repInfo) {
        const showRep = mode === 'replace' && currentCoverTemplateId && (currentSvgFilename || '').trim();
        repInfo.classList.toggle('hidden', !showRep);
        if (showRep) {
            const uploadGruppe = document.getElementById('supabaseUploadGruppe')?.value?.trim() || '';
            const g = (currentTemplateGruppe && String(currentTemplateGruppe).trim()) || uploadGruppe || '—';
            const idShort = currentCoverTemplateId ? String(currentCoverTemplateId).slice(0, 8) + '…' : '—';
            repInfo.textContent =
                `Storage-Datei wird überschrieben (DB-Zeile bleibt). Datei: ${currentSvgFilename} · Gruppe: ${g} · Template-ID: ${idShort}`;
        }
    }
    const fn = (currentSvgFilename || '').trim();
    const baseName = fn.replace(/\.svg$/i, '').replace(/_/g, ' ').trim() || 'Template';
    const disp = document.getElementById('supabaseUploadDisplayName');
    const fnInp = document.getElementById('supabaseUploadFilename');
    if (disp && !disp.value.trim()) disp.value = baseName;
    if (fnInp && !fnInp.value.trim()) fnInp.value = fn || 'template.svg';
}

/** Cache für Tab „Templates“ (Admin-Liste). */
let templateOverviewCache = [];

function tmplOverviewGroupLabel(gruppeId) {
    const g = getTemplateGroupsList().find((x) => x.id === gruppeId);
    return g ? g.name : (gruppeId || '–');
}

function tmplOverviewRenderTable() {
    const wrap = document.getElementById('tmplOverviewTableWrap');
    const filterEl = document.getElementById('tmplOverviewGruppeFilter');
    if (!wrap) return;
    const gruppe = filterEl ? filterEl.value.trim() : '';
    let rows = Array.isArray(templateOverviewCache) ? [...templateOverviewCache] : [];
    if (gruppe) rows = rows.filter((r) => (r.gruppe || '') === gruppe);
    if (gruppe) {
        rows.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    } else {
        rows.sort((a, b) => {
            const g = (a.gruppe || '').localeCompare(b.gruppe || '');
            if (g !== 0) return g;
            return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
        });
    }

    if (rows.length === 0) {
        wrap.innerHTML =
            '<p class="schema-status">' +
            (templateOverviewCache.length === 0
                ? 'Keine Templates in Supabase.'
                : 'Keine Einträge für diese Gruppe.') +
            '</p>';
        return;
    }

    const head =
        '<table class="tmpl-overview-table"><thead><tr>' +
        '<th>Aktiv</th><th>Sort</th><th>Anzeigename</th><th>Dateiname</th><th>Gruppe</th><th>Aktionen</th>' +
        '</tr></thead><tbody>';
    const body = rows
        .map((r) => {
            const id = escapeAttr(r.id || '');
            const url = escapeAttr(r.url || '');
            const fn = escapeAttr(r.filename || '');
            const fnRaw = String(r.filename || '');
            const active = r.active !== false;
            const so = Number(r.sort_order) || 0;
            const disp = escapeAttr(r.display_name || '');
            const gruppeOpts = getTemplateGroupsList()
                .map(
                    (g) =>
                        `<option value="${escapeAttr(g.id)}" ${(r.gruppe || '') === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
                )
                .join('');
            const gruppeSelect =
                gruppeOpts.length > 0
                    ? `<select class="tmpl-gruppe svg-shop-select">${gruppeOpts}</select>`
                    : `<span>${escapeHtml(tmplOverviewGroupLabel(r.gruppe))}</span>`;
            const dataGruppe = escapeAttr(r.gruppe || '');
            return (
                `<tr data-id="${id}" data-url="${url}" data-filename="${fn}" data-gruppe="${dataGruppe}">` +
                `<td style="text-align:center"><input type="checkbox" class="tmpl-act" ${active ? 'checked' : ''} title="Im Shop"></td>` +
                `<td><input type="number" class="tmpl-sort svg-shop-input" min="0" value="${so}"></td>` +
                `<td><input type="text" class="tmpl-disp svg-shop-input" value="${disp}"></td>` +
                `<td><code class="tmpl-fn">${escapeHtml(fnRaw)}</code></td>` +
                `<td>${gruppeSelect}</td>` +
                `<td class="tmpl-overview-actions-cell">` +
                `<button type="button" class="btn btn-sm tmpl-load">Laden</button> ` +
                `<button type="button" class="btn btn-sm danger tmpl-del">Löschen</button>` +
                `</td></tr>`
            );
        })
        .join('');
    wrap.innerHTML = head + body + '</tbody></table>';
}

async function renderTemplateOverview() {
    const wrap = document.getElementById('tmplOverviewTableWrap');
    if (!wrap) return;
    if (!hasAdminSecret()) {
        wrap.innerHTML = '<p class="schema-status err">Admin-Secret erforderlich (über das Dashboard öffnen).</p>';
        return;
    }
    wrap.innerHTML = '<p class="schema-status">Lade…</p>';
    try {
        const d = await apiFetchEdge('GET', '/functions/v1/admin-cover-templates');
        templateOverviewCache = Array.isArray(d.data) ? d.data : [];
        tmplOverviewRenderTable();
    } catch (e) {
        wrap.innerHTML = '<p class="schema-status err">' + escapeHtml(e && e.message ? e.message : String(e)) + '</p>';
    }
}

async function saveTemplateOverviewList() {
    const wrap = document.getElementById('tmplOverviewTableWrap');
    if (!wrap || !hasAdminSecret()) return;
    const trs = wrap.querySelectorAll('tbody tr[data-id]');
    if (!trs.length) return;
    try {
        for (const tr of trs) {
            const id = tr.getAttribute('data-id');
            if (!id) continue;
            const active = !!tr.querySelector('.tmpl-act')?.checked;
            const sort_order = parseInt(tr.querySelector('.tmpl-sort')?.value ?? '0', 10) || 0;
            const display_name = (tr.querySelector('.tmpl-disp')?.value ?? '').trim();
            const gruppeEl = tr.querySelector('.tmpl-gruppe');
            const gruppe = gruppeEl ? (gruppeEl.value ?? '').trim() : undefined;
            const patch = { id, active, sort_order, display_name };
            if (gruppe !== undefined) patch.gruppe = gruppe;
            await apiFetchEdge('PATCH', '/functions/v1/admin-cover-templates', patch);
        }
        showToast('Template-Liste gespeichert.', 'success');
        await refreshSupabaseTemplateList();
    } catch (e) {
        showToast(e && e.message ? e.message : String(e), 'error');
    }
}

async function submitSupabaseUpload() {
    if (!svgRoot) {
        showToast('Zuerst ein SVG laden.', 'warn');
        return;
    }
    if (!hasAdminSecret()) {
        showToast('Admin-Secret erforderlich – Tool über das Dashboard öffnen.', 'error');
        return;
    }
    showToast('Fonts werden eingebettet…', 'info', 10000);
    let svgStr;
    try {
        svgStr = await buildProductionSvgString();
    } catch (e) {
        showToast('SVG-Aufbereitung fehlgeschlagen: ' + (e?.message ?? String(e)), 'error');
        return;
    }
    if (!svgStr) {
        showToast('SVG-Inhalt leer.', 'error');
        return;
    }
    const mode = document.querySelector('input[name="supabaseUploadMode"]:checked')?.value || 'new';
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    try {
        if (mode === 'replace') {
            if (!currentCoverTemplateId) {
                showToast('Kein bestehendes Template erkannt – Dateiname muss zu einem Eintrag in cover_templates passen.', 'error');
                return;
            }
            const fname = (currentSvgFilename || 'template.svg').trim() || 'template.svg';
            const fd = new FormData();
            fd.append('id', currentCoverTemplateId);
            fd.append('file', new File([blob], fname, { type: 'image/svg+xml' }));
            await apiAdminCoverTemplatesMultipart('PATCH', fd);
            showToast('Datei in Supabase erfolgreich ersetzt.', 'success');
        } else {
            const display_name =
                document.getElementById('supabaseUploadDisplayName')?.value.trim() ||
                (currentSvgFilename || 'template').replace(/\.svg$/i, '') ||
                'Template';
            const list = getTemplateGroupsList();
            const gruppe =
                document.getElementById('supabaseUploadGruppe')?.value ||
                (list.length ? list[0].id : 'hardcover_modern');
            const sortEl = document.getElementById('supabaseUploadSort');
            const sort_order = parseInt(sortEl && sortEl.value ? sortEl.value : '0', 10) || 0;
            let fname = document.getElementById('supabaseUploadFilename')?.value.trim() || '';
            if (!fname.toLowerCase().endsWith('.svg')) fname = (fname || 'template') + '.svg';
            const fd = new FormData();
            fd.append('file', new File([blob], fname, { type: 'image/svg+xml' }));
            fd.append('display_name', display_name);
            fd.append('gruppe', gruppe);
            fd.append('sort_order', String(sort_order));
            await apiAdminCoverTemplatesMultipart('POST', fd);
            currentSvgFilename = fname;
            showToast(`Neues Template „${fname}" in Supabase angelegt.`, 'success');
        }
        await refreshSupabaseTemplateList();
        await resolveCurrentCoverTemplateId();
    } catch (e) {
        showToast(e && e.message ? e.message : String(e), 'error', 14000);
    }
}

function initSupabaseUploadPanel() {
    refillTemplateGroupDropdowns();
    document.querySelectorAll('input[name="supabaseUploadMode"]').forEach((r) => {
        r.addEventListener('change', () => syncSupabaseUploadForm());
    });
    document.getElementById('supabaseUploadGruppe')?.addEventListener('change', () => {
        void resolveCurrentCoverTemplateId();
    });
    document.getElementById('btnSupabaseUpload')?.addEventListener('click', () => {
        void submitSupabaseUpload();
    });
    syncSupabaseUploadForm();
}

function initTemplateOverviewPanel() {
    const filt = document.getElementById('tmplOverviewGruppeFilter');
    refillTemplateGroupDropdowns();
    filt?.addEventListener('change', () => tmplOverviewRenderTable());
    document.getElementById('btnTmplOverviewRefresh')?.addEventListener('click', () => void renderTemplateOverview());
    document.getElementById('btnTmplOverviewSaveList')?.addEventListener('click', () => void saveTemplateOverviewList());

    document.getElementById('tmplOverviewTableWrap')?.addEventListener('click', (e) => {
        const loadBtn = e.target.closest('.tmpl-load');
        const delBtn = e.target.closest('.tmpl-del');
        const tr = e.target.closest('tr[data-id]');
        if (loadBtn && tr) {
            const url = tr.getAttribute('data-url') || '';
            const fname = (tr.getAttribute('data-filename') || 'template.svg').trim() || 'template.svg';
            if (!url) {
                showToast('Keine URL für dieses Template.', 'error');
                return;
            }
            void (async () => {
                try {
                    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    const tid = tr.getAttribute('data-id');
                    const gAttr = tr.getAttribute('data-gruppe');
                    loadSvgFromText(text, fname, 'Quelle: Supabase Storage', tid || null, gAttr || null);
                    showToast('Template im Editor geladen.', 'success');
                } catch (err) {
                    showToast('Laden fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), 'error');
                }
            })();
            return;
        }
        if (delBtn && tr) {
            const id = tr.getAttribute('data-id');
            if (!id || !hasAdminSecret()) return;
            if (!confirm('Template wirklich löschen? Die Datei wird aus dem Storage entfernt.')) return;
            void (async () => {
                try {
                    await apiFetchEdge('DELETE', '/functions/v1/admin-cover-templates', { id });
                    showToast('Template gelöscht.', 'success');
                    await renderTemplateOverview();
                    await refreshSupabaseTemplateList();
                    await resolveCurrentCoverTemplateId();
                    syncSupabaseUploadForm();
                } catch (err) {
                    showToast(err && err.message ? err.message : String(err), 'error');
                }
            })();
        }
    });
}

/**
 * @param {string} s
 */
function normalizeHexForMatch(s) {
    if (!s) return '';
    let h = String(s).trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    return h.toLowerCase();
}

/**
 * Bereinigt Anführungszeichen aus einem Farbpaar-Datensatz (DB-Artefakt).
 * @param {object} row
 * @returns {object}
 */
function cleanFarbpaarRow(row) {
    if (!row || typeof row !== 'object') return row;
    const stripQ = (s) => {
        let r = (s == null ? '' : String(s)).trim();
        while (r.length >= 2 && r[0] === '"' && r[r.length - 1] === '"') r = r.slice(1, -1).trim();
        return r;
    };
    const strFields = ['name','color1_name','color1_rgb','color1_cmyk','color1_spot',
                       'color2_name','color2_rgb','color2_cmyk','color2_spot'];
    const out = { ...row };
    for (const f of strFields) if (f in out) out[f] = stripQ(out[f]);
    if ('sort_order' in out) {
        const n = parseInt(stripQ(String(out.sort_order ?? 0)), 10);
        out.sort_order = Number.isNaN(n) ? 0 : n;
    }
    return out;
}

async function loadFarbpaareRef() {
    farbpaareRef = [];
    const url = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    if (!url || !key) return;
    try {
        const res = await fetch(
            `${url}/rest/v1/cover_farbpaare?select=id,name,color1_name,color1_rgb,color1_cmyk,color1_spot,color2_name,color2_rgb,color2_cmyk,color2_spot,sort_order,active&order=sort_order.asc`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        const data = await res.json();
        if (Array.isArray(data)) farbpaareRef = data.map(cleanFarbpaarRow);
    } catch (_) {}
}

function renderFarbpaareReference() {
    const el = document.getElementById('farbpaareRefWrap');
    if (!el) return;
    if (!farbpaareRef.length) {
        el.innerHTML =
            '<p class="schema-status">Keine Farbpaare geladen (Supabase-URL/Key oder Tabelle cover_farbpaare leer).</p>';
        return;
    }
    let html =
        '<details class="farbpaare-ref-details"><summary>Referenz: Farbpaare (globaler Pool)</summary>';
    html +=
        '<table class="schema-crud-table farbpaare-ref-table"><thead><tr>' +
        '<th>Name</th><th>Farbe 1</th><th>CMYK 1</th><th>Farbe 2</th><th>CMYK 2</th>' +
        '</tr></thead><tbody>';
    for (const f of farbpaareRef) {
        const sw1 = f.color1_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(f.color1_rgb)}"></span>` : '';
        const sw2 = f.color2_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(f.color2_rgb)}"></span>` : '';
        html += `<tr>
            <td>${escapeHtml(f.name || '')}</td>
            <td>${sw1}<code>${escapeHtml(f.color1_rgb || '—')}</code></td>
            <td>${escapeHtml(f.color1_cmyk || '—')}</td>
            <td>${sw2}<code>${escapeHtml(f.color2_rgb || '—')}</code></td>
            <td>${escapeHtml(f.color2_cmyk || '—')}</td>
        </tr>`;
    }
    html += '</tbody></table></details>';
    el.innerHTML = html;
}

/**
 * @param {string} hex
 */
function findFarbpaarMatch(hex) {
    const n = normalizeHexForMatch(hex);
    if (!n || n.length !== 6) return null;
    for (const f of farbpaareRef) {
        if (normalizeHexForMatch(f.color1_rgb || '') === n) return { ...f, _matchedSlot: 'color1' };
        if (normalizeHexForMatch(f.color2_rgb || '') === n) return { ...f, _matchedSlot: 'color2' };
    }
    return null;
}

/**
 * @param {string} hex
 */
function findCoverPaletteMatch(hex) {
    const n = normalizeHexForMatch(hex);
    if (!n || n.length !== 6) return null;
    for (const p of palettesAll) {
        if (p && p.active !== false) {
            if (normalizeHexForMatch(p.color1_rgb || '') === n) return { ...p, _matchedSlot: 'color1' };
            if (normalizeHexForMatch(p.color2_rgb || '') === n) return { ...p, _matchedSlot: 'color2' };
        }
    }
    return null;
}

/**
 * @param {string} path
 * @param {object} body
 */
async function apiPostEdge(path, body) {
    const base = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            'x-admin-secret': toolConfig.adminSecret || '',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = {};
    if (text && text.trim()) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { _raw: text };
        }
    }
    if (!res.ok) {
        const msg =
            data.error ||
            data.message ||
            (text ? undefined : `HTTP ${res.status} (leerer Antwort-Body)`);
        throw new Error(msg || `HTTP ${res.status}`);
    }
    return data;
}

/**
 * @param {'GET'|'POST'|'PATCH'|'DELETE'|'PUT'} method
 * @param {string} path
 * @param {object} [body]
 */
async function apiFetchEdge(method, path, body) {
    const base = (toolConfig.supabaseUrl || '').replace(/\/$/, '');
    const key = toolConfig.anonKey || '';
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'x-admin-secret': toolConfig.adminSecret || '',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    if (text && text.trim()) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { _raw: text };
        }
    }
    if (!res.ok) {
        const msg =
            data.error ||
            data.message ||
            (text ? undefined : `HTTP ${res.status} (leerer Antwort-Body)`);
        throw new Error(msg || `HTTP ${res.status}`);
    }
    return data;
}

/** @param {string} str */
function rgbToHexForPicker(str) {
    if (!str || typeof str !== 'string') return '#888888';
    const s = str.trim();
    const hex3 = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/;
    const hex6 = /^#([0-9A-Fa-f]{6})$/;
    if (hex6.test(s)) return s.toLowerCase();
    const m3 = s.match(hex3);
    if (m3) return '#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3];
    const rgb = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgb) {
        const r = ('0' + Math.max(0, Math.min(255, parseInt(rgb[1], 10))).toString(16)).slice(-2);
        const g = ('0' + Math.max(0, Math.min(255, parseInt(rgb[2], 10))).toString(16)).slice(-2);
        const b = ('0' + Math.max(0, Math.min(255, parseInt(rgb[3], 10))).toString(16)).slice(-2);
        return '#' + r + g + b;
    }
    return '#888888';
}

/** @param {unknown} colorIds */
function colorIdsToPairs(colorIds) {
    const ids = Array.isArray(colorIds) ? colorIds : [];
    const pairs = [];
    for (let i = 0; i + 1 < ids.length; i += 2) {
        pairs.push({ color1_id: ids[i], color2_id: ids[i + 1] });
    }
    return pairs;
}

/** @param {{ color1_id?: string, color2_id?: string }[]} pairs */
function pairsToColorIds(pairs) {
    return (pairs || []).flatMap((p) => [p.color1_id, p.color2_id].filter(Boolean));
}

async function loadCoverTemplatesListIfNeeded() {
    if (!hasAdminSecret()) return;
    const d = await apiFetchEdge('GET', '/functions/v1/admin-cover-templates');
    coverTemplatesList = Array.isArray(d.data) ? d.data : [];
}

async function loadFarbpaareAdminList() {
    if (!hasAdminSecret()) {
        await loadFarbpaareRef();
        return;
    }
    const d = await apiFetchEdge('GET', '/functions/v1/admin-farbpaare');
    farbpaareRef = Array.isArray(d.data) ? d.data.map(cleanFarbpaarRow) : [];
}

/**
 * @param {string} templateFilename
 * @returns {Promise<object | null>}
 */
/** Lädt zugewiesene Farbpaar-IDs für ein Template (by UUID). */
async function fetchTemplatePalette(templateId) {
    if (!templateId) return [];
    const data = await apiFetchEdge(
        'GET',
        `/functions/v1/admin-template-zuordnung?template_id=${encodeURIComponent(templateId)}`
    );
    return Array.isArray(data.farbpaar_ids) ? data.farbpaar_ids : [];
}

// Legacy-Stubs (nicht mehr genutzt, sicherstellen dass kein Aufruf bricht)
function svgTzColorDropdownOptions() { return ''; }
function svgTzPairRowHtml() {
    return (
        '<div class="tz-pair-row">' +
        '<select class="tz-color1 shop-config-select" title="Farbe 1">' +
        '' +
        '</select>' +
        '<select class="tz-color2 shop-config-select" title="Farbe 2">' +
        '' +
        '</select>' +
        '<span class="tz-pair-actions">' +
        '<button type="button" class="btn btn-sm tz-pair-up" title="Nach oben">↑</button>' +
        '<button type="button" class="btn btn-sm tz-pair-down" title="Nach unten">↓</button>' +
        '<button type="button" class="btn btn-sm secondary tz-pair-delete" title="Farbpaar löschen">Löschen</button>' +
        '</span></div>'
    );
}

function maybeRefreshSvgShopPanels() {
    // Palette-Tab im Editor aktualisieren falls sichtbar
    const palettePanel = document.getElementById('panelPalette');
    if (palettePanel && !palettePanel.classList.contains('hidden')) void renderTemplatePalettePanel();
}

/**
 * Palette-Tab: zeigt Farbpaar-Checkboxen für das aktuell geladene Template.
 */
async function renderTemplatePalettePanel() {
    const wrap = document.getElementById('palettePanelWrap');
    if (!wrap) return;
    if (!hasAdminSecret()) {
        wrap.innerHTML = '<p class="schema-status err">Admin-Secret erforderlich.</p>';
        return;
    }
    wrap.innerHTML = '<p class="schema-status">Lade…</p>';
    try {
        await loadCoverTemplatesListIfNeeded();
        await loadFarbpaareAdminList();

        let templateId = (currentCoverTemplateId || '').trim();
        let currentTemplate = templateId ? coverTemplatesList.find((t) => t.id === templateId) : null;
        if (!currentTemplate && currentSvgFilename) {
            currentTemplate = findCoverTemplateRowForFilename(
                currentSvgFilename,
                coverTemplatesList,
                currentTemplateGruppe
            );
            if (currentTemplate?.id) templateId = currentTemplate.id;
        }
        const templateName = currentTemplate?.display_name || currentTemplate?.filename || null;

        // Info-Box
        const infoHtml = `<div class="palette-template-info">
            <span>Template (cover_templates):</span>
            ${
                templateName && templateId
                    ? `<strong>${escapeHtml(templateName)}</strong> <code class="palette-tid">${escapeHtml(templateId)}</code>`
                    : `<span class="palette-no-template">Kein Supabase-Template zugeordnet — SVG über die Kopfleiste oder Tab „Templates“ → „Laden“ öffnen, oder lokale Datei mit passendem Dateinamen in der DB.</span>`
            }
        </div>`;

        if (!templateId) {
            wrap.innerHTML = infoHtml;
            return;
        }

        // Zugewiesene IDs laden
        const assignedIds = await fetchTemplatePalette(templateId);

        const sortedPaare = [...farbpaareRef].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const paarChecks = sortedPaare.length === 0
            ? '<p class="schema-status">Noch keine Farbpaare vorhanden — in <strong>Einstellungen → Farbpaare</strong> anlegen.</p>'
            : '<div class="tz-farbpaare-checks">' +
              sortedPaare.map((fp) => {
                  const checked = assignedIds.includes(fp.id) ? ' checked' : '';
                  const sw1 = fp.color1_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color1_rgb)}"></span>` : '';
                  const sw2 = fp.color2_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color2_rgb)}"></span>` : '';
                  return `<label class="tz-farbpaar-check">
                      <input type="checkbox" value="${escapeAttr(fp.id)}"${checked}>
                      ${sw1}${sw2}
                      <span>${escapeHtml(fp.name || fp.id)}</span>
                  </label>`;
              }).join('') +
              '</div>';

        wrap.innerHTML = infoHtml + paarChecks +
            `<div class="svg-shop-actions">
                <button type="button" class="btn btn-primary btn-sm" id="btnPaletteSave">Palette speichern</button>
            </div>`;

        document.getElementById('btnPaletteSave')?.addEventListener('click', async () => {
            const ids = /** @type {string[]} */ ([]);
            wrap.querySelectorAll('.tz-farbpaar-check input[type="checkbox"]:checked').forEach((cb) => {
                ids.push(/** @type {HTMLInputElement} */ (cb).value);
            });
            try {
                await apiFetchEdge('PUT', '/functions/v1/admin-template-zuordnung', { template_id: templateId, farbpaar_ids: ids });
                showToast(`Palette gespeichert – ${ids.length} Farbpaar${ids.length !== 1 ? 'e' : ''} zugewiesen.`, 'success');
                const btn = document.getElementById('btnPaletteSave');
                if (btn) { btn.textContent = '✓ Gespeichert'; setTimeout(() => { if (btn) btn.textContent = 'Palette speichern'; }, 2000); }
            } catch (e) {
                showToast(e?.message || String(e), 'error');
            }
        });

    } catch (err) {
        wrap.innerHTML = '<p class="schema-status err">' + escapeHtml(err?.message || String(err)) + '</p>';
    }
}

/**
 * Einstellungen → Farbpaare: lädt globale Farbpaare und zeigt die Liste.
 */
async function initSettingsFarbpaare() {
    if (!hasAdminSecret()) return;
    await loadFarbpaareAdminList();
    renderSvgFarbpaareListOnly();
    // btnSvgFarbpaarAdd Listener ist global bereits gesetzt (via ID im HTML)
}

/**
 * Globale Farbpaare (cover_farbpaare) + Template-Palette (cover_template_paletten).
 * @deprecated Wird nicht mehr direkt aus Tabs aufgerufen. Noch für maybeRefresh-Kompatibilität.
 */
async function renderSvgShopPanels() {
    const wrap = document.getElementById('schemaShopWrap');
    if (!wrap) return;
    if (!hasAdminSecret()) {
        wrap.innerHTML = '<p class="schema-status err">Admin-Secret erforderlich.</p>';
        return;
    }
    try {
        await loadCoverTemplatesListIfNeeded();
        await loadFarbpaareAdminList();

        let currentTemplate = currentCoverTemplateId
            ? coverTemplatesList.find((t) => t.id === currentCoverTemplateId)
            : null;
        if (!currentTemplate && currentSvgFilename) {
            currentTemplate =
                findCoverTemplateRowForFilename(currentSvgFilename, coverTemplatesList, currentTemplateGruppe) ||
                null;
        }
        if (!currentTemplate && coverTemplatesList.length) {
            currentTemplate = coverTemplatesList[0];
        }
        const selectedTemplateId = currentTemplate?.id || '';

        // Zugewiesene Farbpaar-IDs für dieses Template laden
        const assignedIds = selectedTemplateId ? await fetchTemplatePalette(selectedTemplateId) : [];

        const sortedPaare = [...farbpaareRef].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        // Template-Dropdown
        const templateOpts = coverTemplatesList.map((t) => {
            const sel = t.id === selectedTemplateId ? ' selected' : '';
            const lab = escapeHtml((t.display_name || t.filename || '').trim());
            return `<option value="${escapeAttr(t.id)}"${sel}>${lab}</option>`;
        }).join('');

        // Farbpaar-Checkboxen
        const paarChecks = sortedPaare.length === 0
            ? '<p class="schema-status">Noch keine Farbpaare angelegt – erst globale Farbpaare erstellen.</p>'
            : sortedPaare.map((fp) => {
                const checked = assignedIds.includes(fp.id) ? ' checked' : '';
                const sw1 = fp.color1_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color1_rgb)}"></span>` : '';
                const sw2 = fp.color2_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color2_rgb)}"></span>` : '';
                return `<label class="tz-farbpaar-check">
                    <input type="checkbox" value="${escapeAttr(fp.id)}"${checked}>
                    ${sw1}${sw2}
                    <span>${escapeHtml(fp.name || fp.id)}</span>
                </label>`;
            }).join('');

        wrap.innerHTML =
            '<section class="svg-shop-section">' +
            '<h3 class="svg-shop-section-title">Globale Farbpaare <code>(cover_farbpaare)</code></h3>' +
            '<p class="schema-status ok">Jedes Farbpaar ist eine atomare Einheit: Farbe 1 + Farbe 2 mit RGB, CMYK und Spot.</p>' +
            '<button type="button" class="btn btn-primary btn-sm" id="btnSvgFarbpaarAdd">＋ Neues Farbpaar</button>' +
            '<div id="svgFarbpaareList" class="svg-farbpaare-list"></div>' +
            '<div id="svgFarbpaareForm" class="svg-farbpaare-form hidden"></div>' +
            '</section>' +
            '<section class="svg-shop-section">' +
            '<h3 class="svg-shop-section-title">Palette für Template</h3>' +
            '<p class="schema-status">Welche Farbpaare soll der Kunde für dieses Template wählen können?</p>' +
            '<div class="svg-shop-form-row"><label for="svgTzTemplateSelect">Template</label>' +
            `<select id="svgTzTemplateSelect" class="svg-shop-select">${templateOpts || '<option>– keine Templates –</option>'}</select></div>` +
            '<div class="tz-farbpaare-checks">' + paarChecks + '</div>' +
            '<div class="svg-shop-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" id="btnSvgTzSave">Palette speichern</button>' +
            '</div>' +
            '</section>';

        renderSvgFarbpaareListOnly();

        // Template-Wechsel → Checkboxen neu laden
        document.getElementById('svgTzTemplateSelect')?.addEventListener('change', async (e) => {
            const tid = /** @type {HTMLSelectElement} */ (e.target).value;
            if (!tid) return;
            const ids = await fetchTemplatePalette(tid);
            wrap.querySelectorAll('.tz-farbpaar-check input[type="checkbox"]').forEach((cb) => {
                cb.checked = ids.includes(/** @type {HTMLInputElement} */ (cb).value);
            });
        });

        document.getElementById('btnSvgFarbpaarAdd')?.addEventListener('click', () => openSvgFarbpaareForm(null));
        document.getElementById('btnSvgTzSave')?.addEventListener('click', saveSvgTemplateZuordnung);

    } catch (err) {
        wrap.innerHTML = '<p class="schema-status err">' + escapeHtml(err?.message || String(err)) + '</p>';
    }
}

function renderSvgFarbpaareListOnly() {
    const list = document.getElementById('svgFarbpaareList');
    if (!list) return;
    const sorted = [...farbpaareRef].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!sorted.length) {
        list.innerHTML = '<p class="schema-status">Noch keine Farbpaare. „+ Neues Farbpaar" nutzen.</p>';
        return;
    }
    list.innerHTML = sorted.map((fp) => {
        const id = escapeAttr(fp.id || '');

        // Farbinfo-Zeile für jede Seite
        function colorLine(rgb, name, cmyk, spot) {
            const sw = rgb ? `<span class="fpl-swatch" style="background:${escapeAttr(rgb)}"></span>` : '';
            const hex = rgb ? `<code class="fpl-hex">${escapeHtml(rgb)}</code>` : '';
            const nameStr = name ? `<strong class="fpl-name">${escapeHtml(name)}</strong>` : '';
            const cmykStr = cmyk ? `<span class="fpl-meta"><span class="fpl-channel fpl-c">C</span><span class="fpl-channel fpl-m">M</span><span class="fpl-channel fpl-y">Y</span><span class="fpl-channel fpl-k">K</span> ${escapeHtml(cmyk)}</span>` : '';
            const spotStr = spot ? `<span class="fpl-spot" title="Spotfarbe (EFI RIP)">⬡ ${escapeHtml(spot)}</span>` : '';
            return `<div class="fpl-color-line">${sw}${hex}${nameStr}${cmykStr}${spotStr}</div>`;
        }

        return `<div class="svg-farbpaar-item" data-id="${id}">
            <div class="fpl-preview-strip">
                <div class="fpl-strip-half" style="background:${escapeAttr(fp.color1_rgb || '#888')}"></div>
                <div class="fpl-strip-half" style="background:${escapeAttr(fp.color2_rgb || '#ccc')}"></div>
            </div>
            <div class="fpl-body">
                <div class="fpl-pair-name">${escapeHtml(fp.name || '–')}</div>
                ${colorLine(fp.color1_rgb, fp.color1_name, fp.color1_cmyk, fp.color1_spot)}
                ${colorLine(fp.color2_rgb, fp.color2_name, fp.color2_cmyk, fp.color2_spot)}
            </div>
            <span class="svg-farbpaar-actions">
                <button type="button" class="btn btn-sm btn-edit-svg-farbpaar" data-id="${id}">Bearbeiten</button>
                <button type="button" class="btn btn-sm danger btn-delete-svg-farbpaar" data-id="${id}">Löschen</button>
            </span>
        </div>`;
    }).join('');

    list.querySelectorAll('.btn-edit-svg-farbpaar').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = farbpaareRef.findIndex((x) => x.id === btn.getAttribute('data-id'));
            openSvgFarbpaareForm(idx >= 0 ? idx : null);
        });
    });
    list.querySelectorAll('.btn-delete-svg-farbpaar').forEach((btn) => {
        btn.addEventListener('click', () => deleteSvgFarbpaar(btn.getAttribute('data-id')));
    });
}

/**
 * Parst einen CMYK-String "C,M,Y,K" in ein Objekt {c,m,y,k}.
 * @param {string} str
 * @returns {{ c: string, m: string, y: string, k: string }}
 */
function parseCmykString(str) {
    const s = String(str ?? '').replace(/^"+|"+$/g, '').trim();
    if (!s) return { c: '', m: '', y: '', k: '' };
    const parts = s.split(',').map((p) => p.replace(/"+/g, '').trim());
    const toVal = (p) => {
        const n = parseFloat(p);
        return Number.isFinite(n) ? String(Math.round(Math.min(100, Math.max(0, n)))) : '';
    };
    return {
        c: toVal(parts[0] ?? ''),
        m: toVal(parts[1] ?? ''),
        y: toVal(parts[2] ?? ''),
        k: toVal(parts[3] ?? ''),
    };
}

/**
 * Baut aus vier CMYK-Eingabefeldern den "C,M,Y,K"-String zusammen.
 * Gibt '' zurück wenn alle leer.
 */
function buildCmykString(c, m, y, k) {
    const vals = [c, m, y, k].map((v) => String(v ?? '').trim());
    if (vals.every((v) => v === '')) return '';
    return vals.map((v) => (v === '' ? '0' : v)).join(',');
}

/**
 * Näherung sRGB (#rrggbb) → CMYK in % — gedacht als praktikable Vorgabe für FOGRA51 / ISO Coated v2.
 * Ohne ICC-Profil-Engine: lineares sRGB + übliche Subtraktions-CMYK-Formel (kein exaktes Profil-Mapping).
 * @param {string} hex
 * @returns {{ c: number, m: number, y: number, k: number } | null}
 */
function approxSrgbHexToCmykPercent(hex) {
    const h = String(hex ?? '').replace(/^"+|"+$/g, '').trim();
    if (!/^#[0-9a-fA-F]{6}$/i.test(h)) return null;
    const r8 = parseInt(h.slice(1, 3), 16);
    const g8 = parseInt(h.slice(3, 5), 16);
    const b8 = parseInt(h.slice(5, 7), 16);
    const toLin = (u8) => {
        const u = u8 / 255;
        return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
    };
    const r = toLin(r8);
    const g = toLin(g8);
    const b = toLin(b8);
    const k = 1 - Math.max(r, g, b);
    let c = 0;
    let m = 0;
    let y = 0;
    if (k < 1 - 1e-9) {
        const inv = 1 / (1 - k);
        c = (1 - r - k) * inv;
        m = (1 - g - k) * inv;
        y = (1 - b - k) * inv;
    }
    const q = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));
    return { c: q(c), m: q(m), y: q(y), k: q(k) };
}

/** Parst #rrggbb → {r,g,b} 0–255 oder null. */
function hexToRgb255(hex) {
    const h = String(hex ?? '').replace(/^"+|"+$/g, '').trim();
    if (!/^#[0-9a-fA-F]{6}$/i.test(h)) return null;
    return {
        r: parseInt(h.slice(1, 3), 16),
        g: parseInt(h.slice(3, 5), 16),
        b: parseInt(h.slice(5, 7), 16),
    };
}

function clampByte255(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(255, Math.round(x)));
}

/** Drei Kanäle 0–255 → #rrggbb (für Speicher / Picker). */
function rgb255ToHex(r, g, b) {
    return `#${[clampByte255(r), clampByte255(g), clampByte255(b)]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')}`;
}

/** Liest die drei RGB-Felder und liefert #rrggbb. */
function readRgbTripletAsHex(rId, gId, bId) {
    const rv = document.getElementById(rId)?.value ?? '';
    const gv = document.getElementById(gId)?.value ?? '';
    const bv = document.getElementById(bId)?.value ?? '';
    return rgb255ToHex(rv, gv, bv);
}

/** Datalist-IDs für Spotfarben */
const SPOT_DATALIST_ID = 'fpSpotColorList';

/** Erzeugt (einmalig) die Datalist mit gängigen HKS/Pantone-Spotfarbennamen */
function ensureSpotColorDatalist() {
    if (document.getElementById(SPOT_DATALIST_ID)) return;
    const list = document.createElement('datalist');
    list.id = SPOT_DATALIST_ID;
    // HKS K-Reihe (Offset/Tief), HKS E (Endlos), Pantone C/U, RAL
    const spots = [
        'HKS 5 K','HKS 7 K','HKS 10 K','HKS 13 K','HKS 15 K','HKS 16 K',
        'HKS 17 K','HKS 18 K','HKS 21 K','HKS 22 K','HKS 25 K','HKS 27 K',
        'HKS 28 K','HKS 31 K','HKS 32 K','HKS 33 K','HKS 36 K','HKS 38 K',
        'HKS 41 K','HKS 43 K','HKS 44 K','HKS 47 K','HKS 48 K','HKS 51 K',
        'HKS 52 K','HKS 53 K','HKS 55 K','HKS 57 K','HKS 58 K','HKS 61 K',
        'HKS 62 K','HKS 63 K','HKS 65 K','HKS 67 K','HKS 68 K','HKS 71 K',
        'HKS 72 K','HKS 73 K','HKS 75 K','HKS 77 K','HKS 82 K','HKS 83 K',
        'HKS 84 K','HKS 85 K','HKS 86 K','HKS 88 K','HKS 91 K','HKS 92 K',
        'HKS 93 K','HKS 95 K','HKS 96 K','HKS 97 K','HKS 98 K',
        'PANTONE 280 C','PANTONE 286 C','PANTONE 287 C','PANTONE 288 C',
        'PANTONE 300 C','PANTONE 301 C','PANTONE 485 C','PANTONE 186 C',
        'PANTONE 032 C','PANTONE Yellow C','PANTONE 871 C','PANTONE 877 C',
        'PANTONE 872 C','PANTONE Gold 10122 C','PANTONE 432 C',
        'PANTONE Black C','PANTONE Cool Gray 11 C','PANTONE 7540 C',
    ];
    list.innerHTML = spots.map((s) => `<option value="${escapeAttr(s)}">`).join('');
    document.body.appendChild(list);
}

/** Formular für ein Farbpaar (neu oder bearbeiten). */
function openSvgFarbpaareForm(index) {
    const items = farbpaareRef;
    const fp = index != null && index >= 0 && items[index] ? items[index] : null;
    const container = document.getElementById('svgFarbpaareForm');
    if (!container) return;
    ensureSpotColorDatalist();

    const nextOrder = items.length === 0 ? 0
        : Math.max(0, ...items.map((x) => Number(x.sort_order ?? -1))) + 1;

    // Bereinigt Anführungszeichen die in älteren DB-Einträgen stecken können
    // (z. B. wenn Werte als '"#1a2f5a"' gespeichert wurden)
    function clean(s) {
        let r = (s == null ? '' : String(s)).trim();
        // Iterativ äußere Anführungszeichen entfernen ('"..."' → '...')
        while (r.length >= 2 && r[0] === '"' && r[r.length - 1] === '"') r = r.slice(1, -1).trim();
        return r;
    }
    const v = (field) => escapeAttr(fp ? clean(fp[field]) : '');
    const rawRgb1 = clean(fp?.color1_rgb);
    const rawRgb2 = clean(fp?.color2_rgb);
    const rgb1 = /^#[0-9a-fA-F]{6}$/i.test(rawRgb1) ? rawRgb1 : '#1a2f5a';
    const rgb2 = /^#[0-9a-fA-F]{6}$/i.test(rawRgb2) ? rawRgb2 : '#e8a000';
    const comp1 = hexToRgb255(rgb1) || { r: 26, g: 47, b: 90 };
    const comp2 = hexToRgb255(rgb2) || { r: 232, g: 160, b: 0 };

    const cmyk1 = parseCmykString(clean(fp?.color1_cmyk));
    const cmyk2 = parseCmykString(clean(fp?.color2_cmyk));

    // Schriftfarbe (weiß/schwarz) je nach Helligkeit des Hintergrunds
    function textContrast(hex) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return (0.299*r + 0.587*g + 0.114*b) > 140 ? '#111' : '#fff';
    }

    container.classList.remove('hidden');
    container.innerHTML = `
    <div class="fp-form-wrap">

        <!-- ── Live-Vorschau ──────────────────────────────────────── -->
        <div class="fp-preview" id="fpPreview" title="Live-Vorschau des Farbpaars">
            <div class="fp-preview-half" id="fpPreviewC1" style="background:${escapeAttr(rgb1)};color:${textContrast(rgb1)}">
                <span class="fp-preview-label" id="fpPreviewC1Label">${escapeHtml(clean(fp?.color1_name) || 'Farbe 1')}</span>
                <code class="fp-preview-hex" id="fpPreviewC1Hex">${escapeHtml(rgb1)}</code>
            </div>
            <div class="fp-preview-half fp-preview-c2" id="fpPreviewC2" style="background:${escapeAttr(rgb2)};color:${textContrast(rgb2)}">
                <span class="fp-preview-label" id="fpPreviewC2Label">${escapeHtml(clean(fp?.color2_name) || 'Farbe 2')}</span>
                <code class="fp-preview-hex" id="fpPreviewC2Hex">${escapeHtml(rgb2)}</code>
            </div>
        </div>

        <!-- ── Paartitel + Sort ───────────────────────────────────── -->
        <div class="fp-pair-header">
            <div class="fp-pair-name-wrap">
                <label class="fp-meta-label">Name im Shop</label>
                <div class="fp-pair-name-row">
                    <input type="text" id="svgFpName" class="fp-pair-name-input"
                        value="${v('name')}" placeholder="z. B. Navy / Gold">
                    <button type="button" id="svgFpNameSuggest" class="btn btn-sm fp-suggest-btn"
                        title="Aus Farbbezeichnungen vorschlagen">⟳</button>
                </div>
            </div>
            <div class="fp-pair-sort-wrap">
                <label class="fp-meta-label">Sort.</label>
                <input type="number" min="0" id="svgFpSort" class="fp-sort-input"
                    value="${fp ? clean(String(fp.sort_order ?? 0)) : nextOrder}">
            </div>
        </div>

        <!-- ── Farben nebeneinander ───────────────────────────────── -->
        <div class="fp-colors-grid">

            <!-- FARBE 1 -->
            <div class="fp-color-block">
                <div class="fp-block-header">
                    <div class="fp-block-dot" id="fpDot1" style="background:${escapeAttr(rgb1)}"></div>
                    <h5 class="fp-block-title">Farbe 1 · Hauptfarbe</h5>
                </div>

                <label class="fp-field-label">
                    Bezeichnung
                    <span class="fp-field-hint">→ Shop-Anzeigename</span>
                </label>
                <input type="text" id="svgFpC1Name" class="fp-text-input"
                    value="${v('color1_name')}" placeholder="z. B. Royalblau">

                <label class="fp-field-label">
                    RGB
                    <span class="fp-field-hint">0–255 · Hex in der Vorschau oben</span>
                </label>
                <div class="fp-rgb-row">
                    <span class="fp-swatch" id="fpSwatch1" style="background:${escapeAttr(rgb1)}" title="Klicken zum Öffnen des Farbwählers">
                        <input type="color" id="svgFpC1Picker" class="fp-color-well-hidden" value="${escapeAttr(rgb1)}">
                    </span>
                    <div class="fp-rgb-255-wrap">
                        <div class="fp-rgb-255-row">
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">R</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC1R" class="fp-rgb-255-input"
                                    value="${comp1.r}">
                            </div>
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">G</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC1G" class="fp-rgb-255-input"
                                    value="${comp1.g}">
                            </div>
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">B</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC1B" class="fp-rgb-255-input"
                                    value="${comp1.b}">
                            </div>
                        </div>
                    </div>
                </div>

                <label class="fp-field-label">
                    CMYK
                    <span class="fp-field-hint">→ Fogra 51 / ISO Coated v2 · Ricoh Pro 7200</span>
                </label>
                <div class="fp-cmyk-rgb-btn-row">
                    <button type="button" class="btn btn-sm fp-cmyk-rgb-btn" id="svgFpC1RgbToCmyk"
                        title="RGB (oben) in CMYK-% eintragen — Näherung für ISO Coated v2, nicht ICC-exakt">RGB → CMYK</button>
                </div>
                <div class="fp-cmyk-row">
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-c">C</span>
                        <input type="number" min="0" max="100" id="svgFpC1C" class="fp-cmyk-input"
                            value="${cmyk1.c}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-m">M</span>
                        <input type="number" min="0" max="100" id="svgFpC1M" class="fp-cmyk-input"
                            value="${cmyk1.m}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-y">Y</span>
                        <input type="number" min="0" max="100" id="svgFpC1Y" class="fp-cmyk-input"
                            value="${cmyk1.y}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-k">K</span>
                        <input type="number" min="0" max="100" id="svgFpC1K" class="fp-cmyk-input"
                            value="${cmyk1.k}" placeholder="0">
                    </div>
                </div>

                <label class="fp-field-label">
                    Spotfarbe (RIP)
                    <span class="fp-field-hint">→ EFI RIP · CMYK = Fallback</span>
                </label>
                <input type="text" id="svgFpC1Spot" class="fp-text-input"
                    list="${SPOT_DATALIST_ID}"
                    value="${v('color1_spot')}" placeholder="z. B. HKS 41 K">
            </div>

            <!-- FARBE 2 -->
            <div class="fp-color-block">
                <div class="fp-block-header">
                    <div class="fp-block-dot" id="fpDot2" style="background:${escapeAttr(rgb2)}"></div>
                    <h5 class="fp-block-title">Farbe 2 · Akzentfarbe</h5>
                </div>

                <label class="fp-field-label">
                    Bezeichnung
                    <span class="fp-field-hint">→ Shop-Anzeigename</span>
                </label>
                <input type="text" id="svgFpC2Name" class="fp-text-input"
                    value="${v('color2_name')}" placeholder="z. B. Sonnengelb">

                <label class="fp-field-label">
                    RGB
                    <span class="fp-field-hint">0–255 · Hex in der Vorschau oben</span>
                </label>
                <div class="fp-rgb-row">
                    <span class="fp-swatch" id="fpSwatch2" style="background:${escapeAttr(rgb2)}" title="Klicken zum Öffnen des Farbwählers">
                        <input type="color" id="svgFpC2Picker" class="fp-color-well-hidden" value="${escapeAttr(rgb2)}">
                    </span>
                    <div class="fp-rgb-255-wrap">
                        <div class="fp-rgb-255-row">
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">R</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC2R" class="fp-rgb-255-input"
                                    value="${comp2.r}">
                            </div>
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">G</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC2G" class="fp-rgb-255-input"
                                    value="${comp2.g}">
                            </div>
                            <div class="fp-rgb-255-cell">
                                <span class="fp-rgb-255-chan">B</span>
                                <input type="number" min="0" max="255" step="1" id="svgFpC2B" class="fp-rgb-255-input"
                                    value="${comp2.b}">
                            </div>
                        </div>
                    </div>
                </div>

                <label class="fp-field-label">
                    CMYK
                    <span class="fp-field-hint">→ Fogra 51 / ISO Coated v2 · Ricoh Pro 7200</span>
                </label>
                <div class="fp-cmyk-rgb-btn-row">
                    <button type="button" class="btn btn-sm fp-cmyk-rgb-btn" id="svgFpC2RgbToCmyk"
                        title="RGB (oben) in CMYK-% eintragen — Näherung für ISO Coated v2, nicht ICC-exakt">RGB → CMYK</button>
                </div>
                <div class="fp-cmyk-row">
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-c">C</span>
                        <input type="number" min="0" max="100" id="svgFpC2C" class="fp-cmyk-input"
                            value="${cmyk2.c}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-m">M</span>
                        <input type="number" min="0" max="100" id="svgFpC2M" class="fp-cmyk-input"
                            value="${cmyk2.m}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-y">Y</span>
                        <input type="number" min="0" max="100" id="svgFpC2Y" class="fp-cmyk-input"
                            value="${cmyk2.y}" placeholder="0">
                    </div>
                    <div class="fp-cmyk-cell">
                        <span class="fp-cmyk-chan fp-cmyk-k">K</span>
                        <input type="number" min="0" max="100" id="svgFpC2K" class="fp-cmyk-input"
                            value="${cmyk2.k}" placeholder="0">
                    </div>
                </div>

                <label class="fp-field-label">
                    Spotfarbe (RIP)
                    <span class="fp-field-hint">→ EFI RIP · CMYK = Fallback</span>
                </label>
                <input type="text" id="svgFpC2Spot" class="fp-text-input"
                    list="${SPOT_DATALIST_ID}"
                    value="${v('color2_spot')}" placeholder="z. B. HKS 92 K">
            </div>

        </div><!-- /.fp-colors-grid -->

        <div class="fp-form-actions">
            <button type="button" class="btn btn-primary" id="svgFpSave">Speichern</button>
            <button type="button" class="btn" id="svgFpCancel">Abbrechen</button>
        </div>

    </div><!-- /.fp-form-wrap -->`;

    // ── Live-Preview: RGB-Picker ↔ R/G/B 0–255 ↔ abgeleiteter Hex in Vorschau ─
    function wireRgbRow(pickerId, rId, gId, bId, previewId, hexDisplayId, dotId, labelId, nameInputId, swatchId) {
        const picker  = document.getElementById(pickerId);
        const rIn     = document.getElementById(rId);
        const gIn     = document.getElementById(gId);
        const bIn     = document.getElementById(bId);
        const preview = document.getElementById(previewId);
        const hexDisp = document.getElementById(hexDisplayId);
        const dot     = document.getElementById(dotId);
        const swatch  = swatchId ? document.getElementById(swatchId) : null;
        const nameInp = document.getElementById(nameInputId);

        function applyColor(hex) {
            if (!preview) return;
            preview.style.background = hex;
            const tc = (() => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? '#111' : '#fff';
            })();
            preview.style.color = tc;
            if (hexDisp) hexDisp.textContent = hex;
            if (dot) dot.style.background = hex;
            if (swatch) swatch.style.background = hex;
        }

        function setRgbInputsFromHex(hex) {
            const o = hexToRgb255(hex);
            if (!o || !rIn || !gIn || !bIn) return;
            rIn.value = String(o.r);
            gIn.value = String(o.g);
            bIn.value = String(o.b);
        }

        function applyLabel(name) {
            const lbl = document.getElementById(labelId);
            if (lbl) lbl.textContent = name || (pickerId.includes('C1') ? 'Farbe 1' : 'Farbe 2');
        }

        picker?.addEventListener('input', () => {
            setRgbInputsFromHex(picker.value);
            applyColor(picker.value);
        });

        [rIn, gIn, bIn].forEach((inp) => {
            inp?.addEventListener('input', () => {
                const hex = readRgbTripletAsHex(rId, gId, bId);
                if (picker) picker.value = hex;
                applyColor(hex);
            });
        });

        nameInp?.addEventListener('input', () => applyLabel(nameInp.value));
    }

    wireRgbRow('svgFpC1Picker', 'svgFpC1R', 'svgFpC1G', 'svgFpC1B', 'fpPreviewC1', 'fpPreviewC1Hex', 'fpDot1', 'fpPreviewC1Label', 'svgFpC1Name', 'fpSwatch1');
    wireRgbRow('svgFpC2Picker', 'svgFpC2R', 'svgFpC2G', 'svgFpC2B', 'fpPreviewC2', 'fpPreviewC2Hex', 'fpDot2', 'fpPreviewC2Label', 'svgFpC2Name', 'fpSwatch2');

    function wireRgbToCmyk(btnId, rId, gId, bId, cId, mId, yId, kId) {
        document.getElementById(btnId)?.addEventListener('click', () => {
            const hex = readRgbTripletAsHex(rId, gId, bId);
            const conv = approxSrgbHexToCmykPercent(hex);
            if (!conv) {
                showToast('RGB 0–255 prüfen.', 'warn');
                return;
            }
            const c = document.getElementById(cId);
            const m = document.getElementById(mId);
            const y = document.getElementById(yId);
            const k = document.getElementById(kId);
            if (c) c.value = String(conv.c);
            if (m) m.value = String(conv.m);
            if (y) y.value = String(conv.y);
            if (k) k.value = String(conv.k);
        });
    }
    wireRgbToCmyk('svgFpC1RgbToCmyk', 'svgFpC1R', 'svgFpC1G', 'svgFpC1B', 'svgFpC1C', 'svgFpC1M', 'svgFpC1Y', 'svgFpC1K');
    wireRgbToCmyk('svgFpC2RgbToCmyk', 'svgFpC2R', 'svgFpC2G', 'svgFpC2B', 'svgFpC2C', 'svgFpC2M', 'svgFpC2Y', 'svgFpC2K');

    // ── Auto-Suggest: Paarnamen aus Bezeichnungen zusammensetzen ────────────
    document.getElementById('svgFpNameSuggest')?.addEventListener('click', () => {
        const n1 = (document.getElementById('svgFpC1Name')?.value || '').trim();
        const n2 = (document.getElementById('svgFpC2Name')?.value || '').trim();
        const nameInput = document.getElementById('svgFpName');
        if (!nameInput) return;
        if (n1 && n2)      nameInput.value = `${n1} / ${n2}`;
        else if (n1)       nameInput.value = n1;
        else if (n2)       nameInput.value = n2;
        else showToast('Bitte zuerst Farbbezeichnungen eingeben.', 'info', 2500);
    });

    document.getElementById('svgFpSave')?.addEventListener('click', () => saveSvgFarbpaare(fp?.id));
    document.getElementById('svgFpCancel')?.addEventListener('click', () => {
        container.classList.add('hidden');
        container.innerHTML = '';
    });
}

async function saveSvgFarbpaare(existingId) {
    const sort_order = parseInt(document.getElementById('svgFpSort')?.value ?? '0', 10);

    // Liest Wert und bereinigt Anführungszeichen (Schutz gegen alte DB-Einträge)
    const g = (id) => (document.getElementById(id)?.value ?? '').replace(/^"+|"+$/g, '').trim();

    // CMYK aus den vier Einzelfeldern zusammenbauen
    const cmyk1 = buildCmykString(g('svgFpC1C'), g('svgFpC1M'), g('svgFpC1Y'), g('svgFpC1K'));
    const cmyk2 = buildCmykString(g('svgFpC2C'), g('svgFpC2M'), g('svgFpC2Y'), g('svgFpC2K'));

    const rgb1 = readRgbTripletAsHex('svgFpC1R', 'svgFpC1G', 'svgFpC1B');
    const rgb2 = readRgbTripletAsHex('svgFpC2R', 'svgFpC2G', 'svgFpC2B');

    const payload = {
        name:        g('svgFpName')  || 'Farbpaar',
        color1_name: g('svgFpC1Name'),
        color1_rgb:  rgb1,
        color1_cmyk: cmyk1,
        color1_spot: g('svgFpC1Spot'),
        color2_name: g('svgFpC2Name'),
        color2_rgb:  rgb2,
        color2_cmyk: cmyk2,
        color2_spot: g('svgFpC2Spot'),
        sort_order:  Number.isNaN(sort_order) ? 0 : sort_order,
    };
    try {
        if (existingId) {
            await apiFetchEdge('PATCH', '/functions/v1/admin-farbpaare', { id: existingId, ...payload });
        } else {
            await apiFetchEdge('POST', '/functions/v1/admin-farbpaare', payload);
        }
        await loadFarbpaareAdminList();
        renderFarbpaareReference();
        const form = document.getElementById('svgFarbpaareForm');
        if (form) { form.classList.add('hidden'); form.innerHTML = ''; }
        renderSvgFarbpaareListOnly();
        showToast('Farbpaar gespeichert.', 'success');
    } catch (e) {
        showToast(e?.message || String(e), 'error');
    }
}

async function deleteSvgFarbpaar(id) {
    if (!id || !confirm('Farbpaar wirklich löschen? Template-Zuordnungen werden automatisch entfernt.')) return;
    try {
        await apiFetchEdge('DELETE', '/functions/v1/admin-farbpaare', { id });
        await loadFarbpaareAdminList();
        renderFarbpaareReference();
        renderSvgFarbpaareListOnly();
        showToast('Farbpaar gelöscht.', 'info');
    } catch (e) {
        showToast(e?.message || String(e), 'error');
    }
}

async function saveSvgTemplateZuordnung() {
    const selEl = /** @type {HTMLSelectElement|null} */ (document.getElementById('svgTzTemplateSelect'));
    const template_id = selEl?.value?.trim() || '';
    if (!template_id) { showToast('Bitte ein Template auswählen.', 'warn'); return; }
    const farbpaar_ids = /** @type {string[]} */ ([]);
    document.querySelectorAll('.tz-farbpaar-check input[type="checkbox"]:checked').forEach((cb) => {
        farbpaar_ids.push(/** @type {HTMLInputElement} */ (cb).value);
    });
    try {
        await apiFetchEdge('PUT', '/functions/v1/admin-template-zuordnung', { template_id, farbpaar_ids });
        showToast(`Palette gespeichert – ${farbpaar_ids.length} Farbpaar${farbpaar_ids.length !== 1 ? 'e' : ''} zugewiesen.`, 'success');
    } catch (e) {
        showToast(e?.message || String(e), 'error');
    }
}

function renderSchemaManagerTables() {
    renderSchemaFieldsTable();
    renderPalettesTable();
    if (document.querySelector('[data-schema-sub="shop"].active')) void renderSvgShopPanels();
}

function renderSchemaFieldsTable() {
    const wrap = document.getElementById('schemaFieldsWrap');
    const hint = document.getElementById('schemaManageHint');
    if (!wrap) return;

    const rows = [...schemaElementsAll, ...schemaNewRows].sort(
        (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    );
    const layerOpts = ['', 'front', 'spine', 'back', 'any'];
    const typeOpts = ['text', 'image', 'zone'];

    if (!hasAdminSecret()) {
        if (hint) {
            hint.textContent =
                'Schema verwalten: bitte über das Dashboard öffnen (Admin-Secret). Unten nur Lesen der aktiven Felder.';
            hint.className = 'schema-status err';
        }
        if (!rows.length) {
            wrap.innerHTML = '<p class="empty-state">Keine Daten.</p>';
            return;
        }
        let html =
            '<table class="schema-crud-table"><thead><tr><th>element_id</th><th>Label</th><th>Typ</th><th>Layer</th><th>aktiv</th></tr></thead><tbody>';
        for (const e of rows.filter((x) => x.active)) {
            html += `<tr><td><code>${escapeHtml(e.element_id)}</code></td><td>${escapeHtml(e.label)}</td><td>${escapeHtml(
                e.element_type
            )}</td><td>${escapeHtml(e.layer || '—')}</td><td>${e.active ? 'ja' : 'nein'}</td></tr>`;
        }
        html += '</tbody></table>';
        wrap.innerHTML = html;
        return;
    }

    if (hint) {
        hint.textContent =
            'Felder (cover_schema_elements): Speichern pro Zeile. Deaktivieren = ausblenden; Löschen nur wenn inaktiv und nicht in Template-SVGs.';
        hint.className = 'schema-status ok';
    }

    let html =
        '<table class="schema-crud-table"><thead><tr><th style="width:80px"></th><th>element_id</th><th>Label</th><th>Placeholder</th><th>Typ</th><th>Layer</th><th>Sort</th><th>Pflicht</th><th>aktiv</th></tr></thead><tbody>';

    for (const e of rows) {
        const id = e.id || '';
        const tmp = e._tmp ? String(e._tmp) : '';
        const layerSel = layerOpts
            .map(
                (lv) =>
                    `<option value="${escapeAttr(lv)}"${(e.layer || '') === lv ? ' selected' : ''}>${
                        lv || '—'
                    }</option>`
            )
            .join('');
        const typeSel = typeOpts
            .map(
                (tv) =>
                    `<option value="${escapeAttr(tv)}"${e.element_type === tv ? ' selected' : ''}>${escapeHtml(
                        tv
                    )}</option>`
            )
            .join('');
        html += `<tr data-field-id="${escapeAttr(id)}"${tmp ? ` data-tmp="${escapeAttr(tmp)}"` : ''}>`;
        // Aktionen ZUERST – immer sichtbar ohne scrollen
        html += '<td class="schema-row-actions">';
        html += `<button type="button" class="btn btn-sm btn-primary sf-save" data-sf-id="${escapeAttr(id)}">↑ Speichern</button>`;
        if (id && e.active) {
            html += `<button type="button" class="btn btn-sm sf-off" data-sf-id="${escapeAttr(id)}">Aus</button>`;
        }
        if (id && !e.active) {
            html += `<button type="button" class="btn btn-sm sf-del danger" data-sf-id="${escapeAttr(id)}">✕</button>`;
        }
        html += '</td>';
        html += `<td><input type="text" class="sf-id" value="${escapeAttr(
            e.element_id || ''
        )}" ${id && !e._tmp ? 'readonly' : ''}></td>`;
        html += `<td><input type="text" class="sf-label" value="${escapeAttr(e.label || '')}"></td>`;
        html += `<td><input type="text" class="sf-ph" value="${escapeAttr(e.placeholder || '')}"></td>`;
        html += `<td><select class="sf-type">${typeSel}</select></td>`;
        html += `<td><select class="sf-layer">${layerSel}</select></td>`;
        html += `<td><input type="number" class="sf-sort" value="${escapeAttr(String(e.sort_order ?? 0))}"></td>`;
        html += `<td style="text-align:center"><input type="checkbox" class="sf-req" ${e.required ? ' checked' : ''}></td>`;
        html += `<td style="text-align:center"><input type="checkbox" class="sf-act" ${e.active !== false ? ' checked' : ''}></td>`;
        html += '</tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

/** Übersicht globaler Farbpaare im Schema-Tab (readonly, Bearbeitung im Tab "Farbpaare & Template"). */
function renderPalettesTable() {
    const wrap = document.getElementById('schemaPalettesWrap');
    if (!wrap) return;
    const rows = [...palettesAll].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).filter((p) => p.active !== false);
    if (!rows.length) {
        wrap.innerHTML = '<p class="schema-status">Keine aktiven Farbpaare. Im Tab „Farbpaare &amp; Template" anlegen.</p>';
        return;
    }
    let html = '<table class="schema-crud-table"><thead><tr>' +
        '<th colspan="2">Farbe 1</th><th colspan="2">Farbe 2</th><th>Name</th><th>Sort</th>' +
        '</tr></thead><tbody>';
    for (const fp of rows) {
        const sw1 = fp.color1_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color1_rgb)}"></span>` : '';
        const sw2 = fp.color2_rgb ? `<span class="schema-pal-swatch" style="background:${escapeAttr(fp.color2_rgb)}"></span>` : '';
        html += `<tr>
            <td>${sw1}</td>
            <td>${escapeHtml(fp.color1_name || '')} <code>${escapeHtml(fp.color1_rgb || '')}</code></td>
            <td>${sw2}</td>
            <td>${escapeHtml(fp.color2_name || '')} <code>${escapeHtml(fp.color2_rgb || '')}</code></td>
            <td>${escapeHtml(fp.name || '')}</td>
            <td>${fp.sort_order ?? '–'}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function collectDataLayersInSvg() {
    const found = new Set();
    if (!svgRoot) return found;
    function walk(el) {
        if (el.nodeType !== 1) return;
        const dl = el.getAttribute('data-layer');
        if (dl) {
            const v = dl.trim().toLowerCase();
            if (['front', 'spine', 'back'].includes(v)) found.add(v);
        }
        if (el.getAttributeNS(INK_NS, 'groupmode') === 'layer') {
            const L = detectLayer(el);
            if (L) found.add(L);
        }
        for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
    }
    walk(svgRoot);
    return found;
}

function getUsedIdsFromSvgTexts() {
    const set = new Set();
    for (const r of elementRows) {
        if (r.tag !== 'text') continue;
        const dl = (r.el.getAttribute('data-label') || '').trim();
        const idAttr = (r.el.getAttribute('id') || '').trim();
        if (dl) set.add(dl);
        if (idAttr) set.add(idAttr);
    }
    return set;
}

function runPreflight() {
    const host = document.getElementById('preflightList');
    if (!host) return;
    /** @type {{ level: string, text: string }[]} */
    const issues = [];

    if (!svgRoot) {
        issues.push({ level: 'error', text: 'Kein SVG geladen.' });
        renderPreflightList(host, issues);
        return;
    }

    const used = getUsedIdsFromSvgTexts();
    const requiredEls = schemaElements.filter((e) => e.required && e.active);
    for (const se of requiredEls) {
        if (!used.has(se.element_id)) {
            issues.push({
                level: 'error',
                text: `Pflichtfeld aus Schema nicht zugewiesen: ${se.element_id} (${se.label})`,
            });
        }
    }

    const layers = collectDataLayersInSvg();
    for (const need of ['front', 'spine']) {
        if (!layers.has(need)) {
            issues.push({
                level: 'warn',
                text: `Keine Inkscape-/data-layer-Ebene „${need}" erkannt (Vorderseite/Buchrücken).`,
            });
        }
    }
    if (!layers.has('back')) {
        issues.push({
            level: 'info',
            text: 'Keine Ebene „back" (Rückseite) erkannt – bei reinem Vorderseiten-/Rücken-Spread oft nicht nötig.',
        });
    }

    const dlCounts = new Map();
    for (const r of elementRows) {
        if (r.tag !== 'text') continue;
        const dl = (r.el.getAttribute('data-label') || '').trim();
        if (!dl) continue;
        dlCounts.set(dl, (dlCounts.get(dl) || 0) + 1);
    }
    for (const [lab, n] of dlCounts) {
        if (n > 1) issues.push({ level: 'warn', text: `data-label „${lab}" mehrfach vergeben (${n}×).` });
    }

    for (const r of elementRows) {
        if (r.tag !== 'text') continue;
        const idv = (r.el.getAttribute('id') || '').trim();
        if (idv && !idConventionOk(idv)) {
            issues.push({ level: 'info', text: `ID weicht von Konvention ab: ${idv}` });
        }
    }

    let hasC1 = false;
    for (const v of colorRoleByHex.values()) {
        if (v === 'color-1') hasC1 = true;
    }
    if (!hasC1) {
        issues.push({
            level: 'info',
            text: 'Keine Fläche mit Farbrolle color-1 (Hauptfarbe) zugewiesen.',
        });
    }

    for (const se of schemaElements) {
        if (!used.has(se.element_id)) {
            issues.push({
                level: 'info',
                text: `Schema-Feld im SVG nicht genutzt: ${se.element_id}`,
            });
        }
    }

    if (!issues.length) {
        issues.push({ level: 'ok', text: 'Keine Beanstandungen.' });
    }
    renderPreflightList(host, issues);
}

/**
 * @param {HTMLElement} host
 * @param {{ level: string, text: string }[]} issues
 */
function renderPreflightList(host, issues) {
    const levelClass = { error: 'preflight-err', warn: 'preflight-warn', info: 'preflight-info', ok: 'preflight-ok' };
    host.innerHTML = `<ul class="preflight-ul">${issues
        .map(
            (i) =>
                `<li class="${levelClass[i.level] || 'preflight-info'}"><span class="preflight-tag">${escapeHtml(
                    i.level
                )}</span> ${escapeHtml(i.text)}</li>`
        )
        .join('')}</ul>`;
}

function clearPreview() {
    const host = document.getElementById('svgPreviewHost');
    // Nur das SVG entfernen, Empty-State-Node erhalten
    const svgInHost = host.querySelector(':scope > svg');
    if (svgInHost) svgInHost.remove();
    host.classList.remove('has-svg');
    svgRoot = null;
    elementRows = [];
    uidCounter = 0;
    colorRoleByHex.clear();
    selectedUid = null;
    currentCoverTemplateId = null;
    currentTemplateGruppe = null;
    document.getElementById('elementsTableWrap').innerHTML = '';
    document.getElementById('colorsWrap').innerHTML = '';
    updatePreviewTemplateName('');
    teardownRulers();
}

/**
 * @param {string} text
 * @param {string} [filename] – z. B. aus Dateiauswahl oder cover_templates.filename
 * @param {string} [sourceNote] – z. B. „Quelle: Supabase Storage" für die Kopfzeile
 * @param {string | null} [knownTemplateId] – UUID aus cover_templates (zuverlässige Palette/Upload-Zuordnung)
 * @param {string | null} [knownGruppe] – cover_templates.gruppe (verhindert falsche Zuordnung bei gleichem Dateinamen)
 */
function loadSvgFromText(text, filename, sourceNote, knownTemplateId, knownGruppe) {
    if (filename !== undefined) currentSvgFilename = String(filename || '').trim();
    clearPreview();
    if (knownGruppe != null && String(knownGruppe).trim() !== '') {
        currentTemplateGruppe = String(knownGruppe).trim();
    }
    const host = document.getElementById('svgPreviewHost');

    // Empty-State-Div im DOM erhalten, nur das SVG-Element hinzufügen
    const cleaned = String(text)
        .replace(/^\uFEFF?/, '')
        .replace(/<\?xml[^?]*\?>/i, '')
        .trim();
    // SVG direkt als Kind einfügen, ohne den Empty-State-Node zu verlieren
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;
    const svgEl = tmp.querySelector('svg');
    if (!svgEl) {
        showToast('Kein SVG-Wurzelelement im Dokument.', 'error');
        return;
    }
    host.appendChild(svgEl);
    host.classList.add('has-svg');
    svgRoot = svgEl;

    walkCollect(svgRoot, 'unknown', false);

    const nText = elementRows.filter((r) => r.tag === 'text').length;
    const baseHint = `${nText} Textfelder · ${elementRows.length} Elemente gesamt · Ebenen aus Inkscape.`;
    document.getElementById('topHint').textContent = sourceNote ? `${baseHint} · ${sourceNote}` : baseHint;

    // Template-Name in Preview-Caption
    updatePreviewTemplateName(currentSvgFilename);

    renderElementsTable();
    setupRulers();
    loadFarbpaareRef().then(() => {
        renderFarbpaareReference();
        maybeRefreshSvgShopPanels();
        const tid = knownTemplateId != null ? String(knownTemplateId).trim() : '';
        if (tid && /^[0-9a-f-]{36}$/i.test(tid)) {
            currentCoverTemplateId = tid;
            if (!currentTemplateGruppe) {
                void loadCoverTemplatesListIfNeeded().then(() => {
                    const r = coverTemplatesList.find((x) => x.id === tid);
                    if (r && r.gruppe) currentTemplateGruppe = r.gruppe;
                    syncSupabaseUploadForm();
                });
            } else {
                syncSupabaseUploadForm();
            }
        } else {
            void resolveCurrentCoverTemplateId();
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                hydrateColorRolesFromSvg();
                renderColors();
                syncLiveDataColorRoles();
            });
        });
    });

    showToast(`„${currentSvgFilename || 'Template'}" geladen – ${nText} Textfelder`, 'success', 3500);
}

/** Template-Name in der Preview-Caption anzeigen/ausblenden. */
function updatePreviewTemplateName(name) {
    const el = document.getElementById('previewTemplateName');
    if (!el) return;
    if (name) {
        el.textContent = name;
        el.classList.add('visible');
    } else {
        el.textContent = '';
        el.classList.remove('visible');
    }
}

/**
 * Welches Schema ist für die Dropdown-Auswahl maßgeblich: zuerst SVG-id wenn element_id,
 * sonst data-label wenn es schon element_id ist, sonst Abgleich über Schema-Label (z. B. „Titel der Arbeit“ → tpl-title).
 * @param {{ el: Element }} r
 */
function getSchemaSelectValue(r) {
    const idAttr = (r.el.getAttribute('id') || '').trim();
    const dl = (r.el.getAttribute('data-label') || '').trim();
    if (idAttr && schemaByElementId.has(idAttr)) return idAttr;
    if (dl && schemaByElementId.has(dl)) return dl;
    if (dl) {
        for (const se of schemaElements) {
            if (se && (se.label || '').trim() === dl) return se.element_id;
        }
    }
    return '';
}

/**
 * Erkennung wie HardcoverEditor / Webshop: data-multiline, mehrere tspan, dy-Zeilenumbrüche.
 * @param {Element} textEl
 * @returns {{ isMultiline: boolean, lineCount: number, maxLines: number | null }}
 */
function getTextMultilineInfo(textEl) {
    if (!textEl || textEl.tagName.toLowerCase() !== 'text') {
        return { isMultiline: false, lineCount: 1, maxLines: null };
    }
    const rawMax = textEl.getAttribute('data-max-lines');
    const maxLines =
        rawMax != null && String(rawMax).trim() !== '' && !Number.isNaN(parseInt(String(rawMax), 10))
            ? parseInt(String(rawMax), 10)
            : null;

    const directTspans = [...textEl.children].filter((c) => c.nodeName === 'tspan');
    const allTspans = Array.from(textEl.querySelectorAll('tspan'));
    const hasDyBreak = allTspans.some((t) => t.getAttribute('dy'));

    if (textEl.getAttribute('data-multiline') === 'true') {
        let lineCount = 2;
        if (directTspans.length >= 2) lineCount = directTspans.length;
        else if (allTspans.length >= 2) lineCount = allTspans.length;
        else if (maxLines != null) lineCount = maxLines;
        if (maxLines != null) lineCount = Math.min(lineCount, maxLines);
        return { isMultiline: true, lineCount, maxLines };
    }

    if (directTspans.length >= 2) {
        return { isMultiline: true, lineCount: directTspans.length, maxLines };
    }

    if (allTspans.length >= 2 && hasDyBreak) {
        return { isMultiline: true, lineCount: allTspans.length, maxLines };
    }

    return { isMultiline: false, lineCount: 1, maxLines };
}

function refreshMultilinePreviewClasses() {
    if (!svgRoot) return;
    for (const r of elementRows) {
        if (r.tag !== 'text') continue;
        const info = getTextMultilineInfo(r.el);
        r.el.classList.toggle('svg-editor-text-multiline', info.isMultiline);
    }
}

function renderElementsTable() {
    const wrap = document.getElementById('elementsTableWrap');
    const textRows = elementRows.filter((r) => r.tag === 'text');

    if (!textRows.length) {
        wrap.innerHTML =
            '<p class="empty-state">Keine Textelemente gefunden. In Inkscape Text als echte Textobjekte anlegen und ggf. Ebenen „Front" / „Spine" / „Back" benennen.</p>';
        return;
    }

    let firstOpen = true;
    let html = '';
    for (const groupKey of TEXT_GROUP_ORDER) {
        const rows = textRows.filter((r) => textRowGroupKey(r) === groupKey);
        if (!rows.length) continue;
        const optsHtml = buildSchemaSelectOptionsHtml(groupKey);
        const openAttr = firstOpen ? ' open' : '';
        firstOpen = false;
        html += `<details class="layer-accordion"${openAttr} data-text-group="${escapeAttr(groupKey)}">`;
        html += `<summary><span>${escapeHtml(TEXT_GROUP_LABELS[groupKey])}</span><span class="layer-accordion-count">${rows.length}</span></summary>`;
        html +=
            '<div class="layer-accordion-body"><table class="svg-editor-element-table"><thead><tr><th>Schema-Feld</th><th>SVG-ID</th></tr></thead><tbody>';
        for (const r of rows) {
            const idVal = r.el.getAttribute('id') || '';
            const idClass = idConventionOk(idVal) ? '' : ' id-warn';
            const active = selectedUid === r.uid ? ' active' : '';
            const ml = getTextMultilineInfo(r.el);
            const mlAttr = ml.isMultiline ? ` data-text-multiline="true"` : '';
            const maxHint =
                ml.maxLines != null ? ` max. ${ml.maxLines}` : '';
            const badgeTitle = ml.isMultiline
                ? `Mehrzeilig (${ml.lineCount} sichtbare Zeile(n) im SVG)${maxHint}. Im Webshop: Eingabe mit Zeilenumbrüchen wird in einzelne Zeilen (tspan) aufgeteilt.`
                : '';
            const badgeHtml = ml.isMultiline
                ? `<span class="svg-editor-line-badge" title="${escapeAttr(badgeTitle)}"><span class="svg-editor-line-badge-icon" aria-hidden="true">↵</span>${ml.lineCount}</span>`
                : '';
            html += `<tr data-uid-row="${escapeAttr(r.uid)}" class="${active}"${mlAttr}>`;
            html += `<td class="td-schema-select">${badgeHtml}<select class="row-label" data-uid="${escapeAttr(r.uid)}">${optsHtml}</select></td>`;
            html += `<td><input type="text" class="row-id${idClass}" data-uid="${escapeAttr(r.uid)}" value="${escapeAttr(idVal)}" placeholder="z. B. tpl-title" title="Wird bei Schema-Auswahl gesetzt, manuell editierbar (SSOT: docs/SSOT_SVG_COVER_TEMPLATES.md)"></td>`;
            html += '</tr>';
        }
        html += '</tbody></table></div></details>';
    }
    wrap.innerHTML = html;

    refreshMultilinePreviewClasses();

    wrap.querySelectorAll('select.row-label').forEach((sel) => {
        const uid = sel.getAttribute('data-uid');
        const row = elementRows.find((x) => x.uid === uid);
        if (!row) return;
        sel.value = getSchemaSelectValue(row);
        sel.addEventListener('change', () => {
            const wasGroup = textRowGroupKey(row);
            const val = sel.value.trim();
            const idInput = wrap.querySelector(`input.row-id[data-uid="${uid}"]`);
            if (val) {
                row.el.setAttribute('data-label', val);
                row.el.setAttribute('id', val);
                const sch = schemaByElementId.get(val);
                if (sch && sch.placeholder != null) {
                    row.el.setAttribute('data-placeholder', String(sch.placeholder));
                } else {
                    row.el.removeAttribute('data-placeholder');
                }
                if (idInput) {
                    idInput.value = val;
                    idInput.classList.toggle('id-warn', !idConventionOk(val));
                }
            } else {
                row.el.removeAttribute('data-label');
                row.el.removeAttribute('data-placeholder');
                row.el.removeAttribute('id');
                if (idInput) {
                    idInput.value = '';
                    idInput.classList.add('id-warn');
                }
            }
            const nowGroup = textRowGroupKey(row);
            if (wasGroup !== nowGroup) {
                renderElementsTable();
            }
            renderColors();
        });
    });

    wrap.querySelectorAll('input.row-id').forEach((inp) => {
        inp.addEventListener('input', () => {
            const uid = inp.getAttribute('data-uid');
            const row = elementRows.find((x) => x.uid === uid);
            if (!row) return;
            const wasGroup = textRowGroupKey(row);
            const v = inp.value.trim();
            if (v) {
                row.el.setAttribute('id', v);
                if (schemaByElementId.has(v)) {
                    row.el.setAttribute('data-label', v);
                    const sch = schemaByElementId.get(v);
                    if (sch && sch.placeholder != null) {
                        row.el.setAttribute('data-placeholder', String(sch.placeholder));
                    }
                    const sel = wrap.querySelector(`select.row-label[data-uid="${uid}"]`);
                    if (sel) sel.value = v;
                }
            } else {
                row.el.removeAttribute('id');
            }
            inp.classList.toggle('id-warn', !idConventionOk(v));
            const nowGroup = textRowGroupKey(row);
            if (wasGroup !== nowGroup) {
                renderElementsTable();
            }
        });
    });

    wrap.querySelectorAll('tr[data-uid-row]').forEach((tr) => {
        tr.addEventListener('click', (e) => {
            const t = /** @type {HTMLElement} */ (e.target);
            if (t.closest('input,select')) return;
            const uid = tr.getAttribute('data-uid-row');
            if (uid) selectByUid(uid);
        });
    });
}

function renderColors() {
    const wrap = document.getElementById('colorsWrap');
    const hexFreq = new Map();
    for (const r of elementRows) {
        for (const hex of collectPaintHexesForElement(r.el)) {
            hexFreq.set(hex, (hexFreq.get(hex) || 0) + 1);
        }
    }
    const list = [...hexFreq.entries()].sort((a, b) => b[1] - a[1]);
    if (!list.length) {
        wrap.innerHTML =
            '<p class="empty-state">Keine Füll- oder Strichfarben erkannt (wie in der Vorschau gerendert).</p>';
        return;
    }
    let html = '';
    for (const [hex, n] of list) {
        if (!colorRoleByHex.has(hex)) colorRoleByHex.set(hex, '');
        const role = colorRoleByHex.get(hex) || '';
        const cp = findCoverPaletteMatch(hex);
        const fp = cp ? null : findFarbpaarMatch(hex);
        let matchLine = '';
        if (cp) {
            matchLine = `<div class="color-match-line">Cover-Palette: <strong>${escapeHtml(
                cp.name || ''
            )}</strong> · CMYK ${escapeHtml(cp.cmyk || '—')} · Spot ${escapeHtml(cp.spotbezeichnung || '—')}</div>`;
        } else if (fp) {
            matchLine = `<div class="color-match-line">Shop-Farbpaar: <strong>${escapeHtml(
                fp.farbbezeichnung || ''
            )}</strong> · CMYK ${escapeHtml(fp.cmyk || '—')} · Spot ${escapeHtml(fp.spotbezeichnung || '—')}</div>`;
        }
        html += `<div class="color-swatch-row" data-hex="${escapeAttr(hex)}">`;
        html += `<div class="color-swatch-box" style="background:${escapeAttr(hex)}"></div>`;
        html += `<div class="color-swatch-meta"><code>${escapeHtml(hex)}</code> · ${n}×`;
        if (matchLine) html += matchLine;
        html += '</div>';
        html += `<select class="row-color-role" data-hex="${escapeAttr(hex)}">`;
        html += `<option value=""${role === '' ? ' selected' : ''}>— fest —</option>`;
        html += `<option value="color-1"${role === 'color-1' ? ' selected' : ''}>color-1 (Hauptfarbe)</option>`;
        html += `<option value="color-2"${role === 'color-2' ? ' selected' : ''}>color-2 (Akzentfarbe)</option>`;
        html += '</select></div>';
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('select.row-color-role').forEach((sel) => {
        sel.addEventListener('change', () => {
            const hex = sel.getAttribute('data-hex');
            if (!hex) return;
            colorRoleByHex.set(hex, sel.value);
            syncLiveDataColorRoles();
            highlightElementsForHex(hex);
        });
    });
}

/**
 * @param {string} hex
 */
function highlightElementsForHex(hex) {
    clearHighlights();
    for (const r of elementRows) {
        if (elementMatchesPaintHex(r.el, hex)) r.el.classList.add('svg-editor-hl');
    }
}

function clearHighlights() {
    if (!svgRoot) return;
    svgRoot.querySelectorAll('.svg-editor-hl').forEach((n) => n.classList.remove('svg-editor-hl'));
}

/**
 * @param {string} uid
 */
function selectByUid(uid) {
    selectedUid = uid;
    clearHighlights();
    const row = elementRows.find((r) => r.uid === uid);
    if (row) row.el.classList.add('svg-editor-hl');
    document.querySelectorAll('[data-uid-row]').forEach((tr) => {
        tr.classList.toggle('active', tr.getAttribute('data-uid-row') === uid);
    });
    const tr = document.querySelector(`tr[data-uid-row="${uid}"]`);
    if (tr) {
        const det = tr.closest('details');
        if (det && !det.open) det.open = true;
        tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function onPreviewClick(e) {
    const t = /** @type {HTMLElement} */ (e.target).closest('[data-uid]');
    if (!t || !svgRoot || !svgRoot.contains(t)) return;
    const uid = t.getAttribute('data-uid');
    if (!uid || !uid.startsWith('se-')) return;
    selectByUid(uid);
}

function applyLayerMarkers(doc) {
    const root = doc.documentElement;
    function walk(el) {
        if (el.nodeType !== 1) return;
        if (el.getAttributeNS(INK_NS, 'groupmode') === 'layer') {
            const L = detectLayer(el);
            if (L) el.setAttribute('data-layer', L);
        }
        for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
    }
    walk(root);
}

/**
 * @param {Document} doc
 */
function applyAnnotationsToDoc(doc) {
    applyLayerMarkers(doc);
    const root = doc.documentElement;
    for (const r of elementRows) {
        const el = root.querySelector(`[data-uid="${r.uid}"]`);
        if (!el) continue;
        const role = resolveColorRoleFromElement(r.el);
        if (role) el.setAttribute('data-color-role', role);
        else el.removeAttribute('data-color-role');
        const dl = el.getAttribute('data-label');
        if (dl) {
            const sch = schemaByElementId.get(dl);
            if (sch && sch.placeholder != null) el.setAttribute('data-placeholder', String(sch.placeholder));
        }
    }
}

/**
 * Nur Vorschau/Editor: svg-editor-*-Klassen nicht ins exportierte SVG übernehmen.
 * @param {Document} doc
 */
function stripEditorOnlyClasses(doc) {
    const root = doc.documentElement;
    function walk(el) {
        if (el.nodeType !== 1) return;
        const c = el.getAttribute('class');
        if (c) {
            const next = c
                .split(/\s+/)
                .filter((x) => x && !x.startsWith('svg-editor-'))
                .join(' ');
            if (next) el.setAttribute('class', next);
            else el.removeAttribute('class');
        }
        for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
    }
    walk(root);
}

/**
 * @param {Document} doc
 */
function stripProductionSvg(doc) {
    const svg = doc.documentElement;
    if (!svg || svg.localName !== 'svg') return;

    let metas = svg.getElementsByTagName('metadata');
    while (metas.length) {
        const m = metas[0];
        m.parentNode.removeChild(m);
        metas = svg.getElementsByTagName('metadata');
    }

    let nv = doc.getElementsByTagNameNS(SODIPODI_NS, 'namedview');
    while (nv.length) {
        const n = nv[0];
        n.parentNode.removeChild(n);
        nv = doc.getElementsByTagNameNS(SODIPODI_NS, 'namedview');
    }

    function stripAttrs(el) {
        if (el.nodeType !== 1) return;
        const toRemove = [];
        for (const attr of [...el.attributes]) {
            const n = attr.name;
            const ns = attr.namespaceURI;
            if (n === 'data-uid') toRemove.push(attr);
            else if (n.startsWith('inkscape:') || n.startsWith('sodipodi:')) toRemove.push(attr);
            else if (ns === INK_NS || ns === SODIPODI_NS) toRemove.push(attr);
        }
        for (const a of toRemove) el.removeAttributeNode(a);
        for (let i = 0; i < el.children.length; i++) stripAttrs(el.children[i]);
    }
    stripAttrs(svg);

    const xmlnsRm = ['xmlns:inkscape', 'xmlns:sodipodi', 'xmlns:dc', 'xmlns:cc', 'xmlns:rdf'];
    for (const name of xmlnsRm) {
        if (svg.hasAttribute(name)) svg.removeAttribute(name);
    }

    stripGuideElementsFromDoc(doc);
}

/**
 * Entfernt Hilfslinien (z. B. Magenta-Rahmen aus Inkscape) – id beginnt mit guide- oder data-editor="guide".
 * @param {Document} doc
 */
function stripGuideElementsFromDoc(doc) {
    const root = doc.documentElement;
    if (!root) return;
    const remove = [];
    root
        .querySelectorAll('#guide-sichtbereich, [id^="guide-"], [id^="guide_"], [data-editor="guide"]')
        .forEach((el) => remove.push(el));
    for (const el of remove) {
        try {
            el.parentNode && el.parentNode.removeChild(el);
        } catch (_) {}
    }
}

async function buildProductionSvgString() {
    if (!svgRoot) return null;
    const xml = new XMLSerializer().serializeToString(svgRoot);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'image/svg+xml');
    applyAnnotationsToDoc(doc);
    stripEditorOnlyClasses(doc);
    stripProductionSvg(doc);
    const fontCss = await buildEmbeddedFontsCss(doc);
    if (fontCss) {
        const styleEl = doc.createElementNS(SVG_NS, 'style');
        styleEl.textContent = fontCss;
        doc.documentElement.insertBefore(styleEl, doc.documentElement.firstChild);
    }
    return new XMLSerializer().serializeToString(doc);
}

/**
 * Aktuelles SVG wie Editor-Download (Annotationen, ohne svg-editor-*-Klassen).
 * @returns {string}
 */
function getEditorSvgString() {
    if (!svgRoot) return '';
    const xml = new XMLSerializer().serializeToString(svgRoot);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'image/svg+xml');
    applyAnnotationsToDoc(doc);
    stripEditorOnlyClasses(doc);
    return new XMLSerializer().serializeToString(doc);
}

function exportEditorSvg() {
    if (!svgRoot) {
        showToast('Zuerst ein SVG laden.', 'warn');
        return;
    }
    const out = getEditorSvgString();
    downloadBlob(out, 'cover-editor.svg', 'image/svg+xml');
    showToast('Editor-SVG exportiert.', 'success', 2500);
}

async function exportProductionSvg() {
    if (!svgRoot) { showToast('Zuerst ein SVG laden.', 'warn'); return; }
    showToast('Fonts werden eingebettet…', 'info', 10000);
    try {
        const out = await buildProductionSvgString();
        if (!out) { showToast('SVG-Inhalt leer.', 'error'); return; }
        downloadBlob(out, 'cover-produktion.svg', 'image/svg+xml');
        showToast('Produktion-SVG gespeichert – Fonts eingebettet.', 'success', 3500);
    } catch (e) {
        showToast('Export fehlgeschlagen: ' + (e?.message ?? String(e)), 'error');
    }
}

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {string} s
 */
function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

initSupabaseTemplateBar();
initSupabaseUploadPanel();
initTemplateOverviewPanel();

document.getElementById('btnTemplateGroupCreate')?.addEventListener('click', () => void createNewTemplateGroupFromForm());
document.getElementById('btnTemplateGroupsReload')?.addEventListener('click', () => void refreshTemplateGroupsCache());
document.getElementById('btnTemplateGroupsSaveAll')?.addEventListener('click', () => void saveAllTemplateGroupsFromTable());
document.getElementById('templateGroupsTableWrap')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-tg-open-templates');
    if (!btn) return;
    const g = btn.getAttribute('data-gruppe');
    if (g) switchToEditorTemplatesForGroup(g);
});

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'dashboard-tool-config') return;
    toolConfig = {
        supabaseUrl: d.supabaseUrl || '',
        anonKey: d.anonKey || '',
        adminSecret: d.adminSecret || '',
    };
    loadSchema();
    void refreshTemplateGroupsCache();
});

document.getElementById('fileSvg').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
        if (typeof r.result === 'string') loadSvgFromText(r.result, f.name);
    };
    r.readAsText(f);
    ev.target.value = '';
});

document.getElementById('btnExportEditor').addEventListener('click', exportEditorSvg);
document.getElementById('btnExportProd').addEventListener('click', exportProductionSvg);

// ── Editor-Tab-Switching ───────────────────────────────────────────────────
document.querySelectorAll('.svg-editor-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.svg-editor-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
        const panelMap = {
            elements:  'panelElements',
            colors:    'panelColors',
            palette:   'panelPalette',
            preflight: 'panelPreflight',
            templates: 'panelTemplates',
            export:    'panelExport',
            schema:    'panelSchema', // legacy, hidden
        };
        Object.entries(panelMap).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const visible = key === tab;
            el.classList.toggle('hidden', !visible);
            if (visible) el.scrollTop = 0;
        });
        if (tab === 'palette') void renderTemplatePalettePanel();
        if (tab === 'templates') {
            syncSupabaseUploadForm();
            void renderTemplateOverview();
        }
        if (tab === 'export') syncSupabaseUploadForm();
    });
});

// ── Modus-Umschalter: Editor ↔ Einstellungen ─────────────────────────────
document.querySelectorAll('.svg-editor-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        document.querySelectorAll('.svg-editor-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
        const editorPanel   = document.getElementById('panelModeEditor');
        const settingsPanel = document.getElementById('panelModeSettings');
        if (editorPanel)   editorPanel.hidden   = (mode !== 'editor');
        if (settingsPanel) settingsPanel.hidden = (mode !== 'settings');
        if (mode === 'settings') {
            syncSettingsBodyTemplateGroupsWide();
            // Aktiven Einstellungs-Tab initialisieren
            const activeTab = document.querySelector('.svg-editor-settings-tab.active');
            if (activeTab) {
                const st = activeTab.getAttribute('data-settings-tab');
                if (st === 'schema-fields') renderSchemaFieldsTable();
                if (st === 'farbpaare') void initSettingsFarbpaare();
                if (st === 'template-groups') void refreshTemplateGroupsCache();
            }
        }
    });
});

function syncSettingsBodyTemplateGroupsWide() {
    const body = document.querySelector('.svg-editor-settings-body');
    if (!body) return;
    const active = document.querySelector('.svg-editor-settings-tab.active');
    const wide = active?.getAttribute('data-settings-tab') === 'template-groups';
    body.classList.toggle('svg-editor-settings-body--template-groups-wide', wide);
}

// ── Einstellungs-Tab-Switching ────────────────────────────────────────────
document.querySelectorAll('.svg-editor-settings-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        const st = btn.getAttribute('data-settings-tab');
        document.querySelectorAll('.svg-editor-settings-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.svg-editor-settings-panel').forEach((p) => p.classList.add('hidden'));
        const panelMap = {
            'schema-fields': 'settingsPanelFields',
            'farbpaare':     'settingsPanelFarbpaare',
            'template-groups': 'settingsPanelTemplateGroups',
        };
        const panelId = panelMap[st];
        if (panelId) {
            const panel = document.getElementById(panelId);
            if (panel) { panel.classList.remove('hidden'); panel.scrollTop = 0; }
        }
        syncSettingsBodyTemplateGroupsWide();
        if (st === 'schema-fields') renderSchemaFieldsTable();
        if (st === 'farbpaare')     void initSettingsFarbpaare();
        if (st === 'template-groups') void refreshTemplateGroupsCache();
    });
});

// ── Schema-Sub-Tab-Switching (Legacy, für Rückwärtskompatibilität) ────────
document.querySelectorAll('[data-schema-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const sub = btn.getAttribute('data-schema-sub');
        document.querySelectorAll('[data-schema-sub]').forEach((b) => b.classList.toggle('active', b === btn));
        document.getElementById('schemaSubFields')?.classList.toggle('hidden', sub !== 'fields');
        document.getElementById('schemaSubPalettes')?.classList.toggle('hidden', sub !== 'palettes');
        document.getElementById('schemaSubShop')?.classList.toggle('hidden', sub !== 'shop');
    });
});

// Globaler Listener für statischen btnSvgFarbpaarAdd im Einstellungs-Panel
document.getElementById('btnSvgFarbpaarAdd')?.addEventListener('click', () => openSvgFarbpaareForm(null));

document.getElementById('btnSchemaReload')?.addEventListener('click', () => loadSchema());

document.getElementById('btnSchemaNewField')?.addEventListener('click', () => {
    if (!hasAdminSecret()) {
        const hint = document.getElementById('schemaManageHint');
        if (hint) { hint.textContent = 'Kein Admin-Secret – bitte das Tool über das Dashboard öffnen.'; hint.className = 'schema-status err'; }
        return;
    }
    schemaNewRows.push({
        _tmp: Date.now(),
        element_id: '',
        label: '',
        placeholder: '',
        element_type: 'text',
        required: false,
        layer: 'front',
        sort_order: 0,
        active: true,
    });
    renderSchemaFieldsTable();
});

document.getElementById('btnPaletteNew')?.addEventListener('click', () => {
    if (!hasAdminSecret()) {
        const hint = document.getElementById('schemaManageHint');
        if (hint) { hint.textContent = 'Kein Admin-Secret – bitte das Tool über das Dashboard öffnen.'; hint.className = 'schema-status err'; }
        return;
    }
    paletteNewRows.push({
        _tmp: Date.now(),
        name: '',
        hex: '#1a3a5c',
        cmyk: '',
        spotbezeichnung: '',
        sort_order: 0,
        active: true,
    });
    renderPalettesTable();
});

document.getElementById('schemaFieldsWrap')?.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const tr = t.closest('tr');
    if (!tr) return;
    try {
        if (t.classList.contains('sf-save')) {
            await saveSchemaFieldRow(tr);
        } else if (t.classList.contains('sf-off')) {
            const id = t.getAttribute('data-sf-id');
            if (!id) return;
            await apiPostEdge('/functions/v1/update-cover-schema', {
                operation: 'deactivate',
                element: { id },
            });
            await loadSchema();
        } else if (t.classList.contains('sf-del')) {
            const id = t.getAttribute('data-sf-id');
            if (!id || !confirm('Eintrag endgültig aus der Datenbank löschen?')) return;
            await apiPostEdge('/functions/v1/update-cover-schema', { operation: 'delete', element: { id } });
            await loadSchema();
        }
    } catch (err) {
        showToast(err && err.message ? err.message : String(err), 'error');
    }
});

// schemaPalettesWrap: readonly-Ansicht, Bearbeitung über Tab "Farbpaare & Template"

document.getElementById('btnPreflightRun')?.addEventListener('click', () => runPreflight());

/**
 * @param {HTMLTableRowElement} tr
 */
async function saveSchemaFieldRow(tr) {
    const id = (tr.getAttribute('data-field-id') || '').trim();
    const tmp = tr.getAttribute('data-tmp');
    const element_id = tr.querySelector('.sf-id')?.value.trim() ?? '';
    const label = tr.querySelector('.sf-label')?.value.trim() ?? '';
    if (!element_id || !label) {
        showToast('element_id und Label sind Pflicht.', 'warn');
        return;
    }
    const layerRaw = tr.querySelector('.sf-layer')?.value ?? '';
    const layer = layerRaw && layerRaw.trim() ? layerRaw.trim() : null;
    const element = {
        element_id,
        label,
        placeholder: tr.querySelector('.sf-ph')?.value.trim() ?? '',
        element_type: tr.querySelector('.sf-type')?.value || 'text',
        required: Boolean(tr.querySelector('.sf-req')?.checked),
        layer,
        sort_order: parseInt(tr.querySelector('.sf-sort')?.value ?? '0', 10) || 0,
        active: Boolean(tr.querySelector('.sf-act')?.checked),
    };
    if (id) {
        await apiPostEdge('/functions/v1/update-cover-schema', {
            operation: 'update',
            element: { ...element, id },
        });
    } else {
        await apiPostEdge('/functions/v1/update-cover-schema', { operation: 'create', element });
    }
    if (tmp) schemaNewRows = schemaNewRows.filter((r) => String(r._tmp) !== tmp);
    await loadSchema();
    showToast(`Schema-Feld „${element.element_id}" gespeichert.`, 'success', 2500);
}

// savePaletteRow: entfernt – Farbpaar-Bearbeitung läuft über openSvgFarbpaareForm / saveSvgFarbpaare

document.getElementById('svgPreviewHost').addEventListener('click', onPreviewClick);

// ════════════════════════════════════════════════════════════════════════════
// DRAG & DROP – SVG in die Preview-Zone ziehen
// ════════════════════════════════════════════════════════════════════════════

(function initDragDrop() {
    const host = document.getElementById('svgPreviewHost');
    if (!host) return;

    let dragCounter = 0;

    host.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) host.classList.add('drag-over');
    });

    host.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; host.classList.remove('drag-over'); }
    });

    host.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    host.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        host.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
            showToast('Nur SVG-Dateien werden unterstützt.', 'warn');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') loadSvgFromText(reader.result, file.name);
        };
        reader.readAsText(file);
    });
})();

// ── Zweites Datei-Input (im Empty State) ─────────────────────────────────
document.getElementById('fileSvgEmpty')?.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
        if (typeof r.result === 'string') loadSvgFromText(r.result, f.name);
    };
    r.readAsText(f);
    ev.target.value = '';
});

// ════════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
    // Keine Shortcuts wenn Fokus in Eingabefeld
    const tag = document.activeElement?.tagName?.toLowerCase() ?? '';
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Aktiver Modus
    const inEditor = !document.getElementById('panelModeEditor')?.hidden;

    switch (e.key) {
        // ── Modus-Umschalter ─────────────────────────────────────────────
        case 'e':
        case 'E': {
            e.preventDefault();
            const btn = document.querySelector('.svg-editor-mode-btn[data-mode="editor"]');
            btn?.click();
            break;
        }
        case 's':
        case 'S': {
            e.preventDefault();
            const btn = document.querySelector('.svg-editor-mode-btn[data-mode="settings"]');
            btn?.click();
            break;
        }
        // ── Editor-Tabs 1–5 (nur im Editor-Modus) ────────────────────────
        case '1': case '2': case '3': case '4': case '5': {
            if (!inEditor) return;
            e.preventDefault();
            const tabBtns = Array.from(document.querySelectorAll('.svg-editor-tabs button[data-tab]'));
            const idx = parseInt(e.key, 10) - 1;
            if (tabBtns[idx]) tabBtns[idx].click();
            break;
        }
    }
});

if (new URLSearchParams(location.search).get('embed') === '1') {
    document.documentElement.classList.add('svg-editor-embed');
}

// Eigenständig ohne iframe: Schema aus window.__SVG_EDITOR_CONFIG__ oder nichts
if (typeof window.__SVG_EDITOR_CONFIG__ === 'object' && window.__SVG_EDITOR_CONFIG__) {
    toolConfig = window.__SVG_EDITOR_CONFIG__;
    loadSchema();
    void refreshTemplateGroupsCache();
}
