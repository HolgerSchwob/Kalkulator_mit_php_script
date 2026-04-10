/**
 * Einstellungen: Shop-Konfiguration (Allgemein, Papier, Produktion, Bindungen, Extras).
 * Buchdecken-Templates und Farben: zentral im SCG-Editor (dashboard-svg-editor.html).
 */
import { state } from './dashboard-state.js';
import { escapeHtml } from './dashboard-utils.js';
import { saveShopConfig, uploadPreviewAsset } from './dashboard-api.js';

function ensureShopConfig() {
    if (!state.shopConfigData) {
        state.shopConfigData = { general: {}, productionAndDelivery: { productionTimes: [], deliveryMethods: [] }, papers: [], bindings: [], extras: [], colorPairPalette: [] };
    }
    if (!state.shopConfigData.general) state.shopConfigData.general = {};
    if (!state.shopConfigData.productionAndDelivery) state.shopConfigData.productionAndDelivery = { productionTimes: [], deliveryMethods: [] };
    if (!state.shopConfigData.papers) state.shopConfigData.papers = [];
    if (!state.shopConfigData.bindings) state.shopConfigData.bindings = [];
    if (!state.shopConfigData.extras) state.shopConfigData.extras = [];
    if (!Array.isArray(state.shopConfigData.colorPairPalette)) state.shopConfigData.colorPairPalette = [];
    return state.shopConfigData;
}

function sortBySortOrder(arr) {
    if (!Array.isArray(arr)) return arr;
    return [...arr].sort((a, b) => (Number(a.sortOrder) ?? 999999) - (Number(b.sortOrder) ?? 999999));
}

function renderShopConfigTabs() {
    document.querySelectorAll('.shop-config-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === 'general');
        tab.onclick = () => {
            document.querySelectorAll('.shop-config-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.shop-config-panel').forEach(p => p.classList.add('hidden'));
            const panel = document.getElementById('shopConfigPanel' + (tab.getAttribute('data-tab').charAt(0).toUpperCase() + tab.getAttribute('data-tab').slice(1)));
            if (panel) panel.classList.remove('hidden');
        };
    });
    document.querySelectorAll('.shop-config-panel').forEach((p, i) => {
        p.classList.toggle('hidden', i !== 0);
    });
}

function renderShopGeneralForm() {
    const g = ensureShopConfig().general;
    const form = document.getElementById('shopGeneralForm');
    if (!form) return;
    const stripeEnabled = g.stripeEnabled === true;
    const stripeMode = (g.stripeMode === 'live') ? 'live' : 'test';
    const requireOnline = g.requireOnlinePayment === true;
    form.innerHTML = ''
        + '<div class="shop-config-form-row"><label>Auftragspauschale (€)</label><input type="number" step="0.01" id="shopGenOrderBaseFee" value="' + (g.orderBaseFee ?? 9.5) + '"></div>'
        + '<div class="shop-config-form-row"><label>Buchblock-Pauschale (€)</label><input type="number" step="0.01" id="shopGenBookBlockBaseFee" value="' + (g.bookBlockBaseFee ?? 5) + '"></div>'
        + '<div class="shop-config-form-row"><label>Währungssymbol</label><input type="text" id="shopGenCurrencySymbol" value="' + escapeHtml(g.currencySymbol ?? '€') + '"></div>'
        + '<div class="shop-config-form-row"><label>Max. Varianten</label><input type="number" min="1" id="shopGenMaxVariants" value="' + (g.maxVariants ?? 3) + '"></div>'
        + '<div class="shop-config-form-row"><label>Min. Rückenstärke (mm)</label><input type="number" step="0.1" id="shopGenMinThickness" value="' + (g.absoluteMinThicknessMm ?? 2) + '"></div>'
        + '<div class="shop-config-form-row"><label>Max. Rückenstärke (mm)</label><input type="number" step="0.1" id="shopGenMaxThickness" value="' + (g.absoluteMaxThicknessMm ?? 50) + '"></div>'
        + '<div class="shop-config-form-row"><label>Standard-Bindung (ID)</label><input type="text" id="shopGenDefaultBindingId" value="' + escapeHtml(g.defaultFallbackBindingId ?? '') + '" placeholder="z.B. softcover_foil"></div>'
        + '<div class="shop-config-form-row"><label>A3-Seitenpreis (€)</label><input type="number" step="0.01" id="shopGenA3Price" value="' + (g.a3PagePrice ?? 0.85) + '"></div>'
        + '<div class="shop-config-form-row"><label>MwSt.-Satz (%)</label><input type="number" step="0.01" id="shopGenVatRate" value="' + (g.vatRate ?? 7) + '"></div>'
        + '<div class="shop-config-form-row" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border, #ddd);"><strong>Stripe (Online-Zahlung)</strong></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopGenStripeEnabled" ' + (stripeEnabled ? 'checked' : '') + '> Stripe aktivieren</label></div>'
        + '<div class="shop-config-form-row"><label>Stripe-Modus</label><select id="shopGenStripeMode"><option value="test"' + (stripeMode === 'test' ? ' selected' : '') + '>Test</option><option value="live"' + (stripeMode === 'live' ? ' selected' : '') + '>Live</option></select></div>'
        + '<div class="shop-config-form-row"><label>Stripe Publishable Key</label><input type="text" id="shopGenStripePublishableKey" value="' + escapeHtml(g.stripePublishableKey ?? '') + '" placeholder="pk_test_… oder pk_live_…"></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopGenRequireOnlinePayment" ' + (requireOnline ? 'checked' : '') + '> Online-Zahlung erzwingen (keine Rechnung/Vorkasse)</label></div>';
}

function renderShopPapersList() {
    const list = document.getElementById('shopPapersList');
    if (!list) return;
    const papers = ensureShopConfig().papers;
    const sorted = sortBySortOrder(papers);
    list.innerHTML = sorted.length === 0 ? '<p class="text-muted">Keine Papiersorten.</p>' : sorted.map((p) => {
        const name = escapeHtml(p.name || p.id || '');
        const id = escapeHtml(p.id || '');
        const order = p.sortOrder != null ? p.sortOrder : '–';
        return '<div class="shop-config-item" data-id="' + escapeHtml(p.id || '') + '"><span class="shop-config-item-info">' + name + ' <span class="text-muted">(' + id + ')</span> <span class="text-muted">· Reihenfolge ' + order + '</span></span><div class="shop-config-item-actions"><button type="button" class="btn-edit-paper">Bearbeiten</button><button type="button" class="btn-delete btn-delete-paper">Löschen</button></div></div>';
    }).join('');
    list.querySelectorAll('.btn-edit-paper').forEach(btn => {
        btn.addEventListener('click', () => { const idx = papers.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')); openPaperForm(idx); });
    });
    list.querySelectorAll('.btn-delete-paper').forEach(btn => {
        btn.addEventListener('click', () => { const idx = papers.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')); deletePaper(idx); });
    });
}

function openPaperForm(index) {
    const papers = ensureShopConfig().papers;
    const p = index >= 0 && papers[index] ? papers[index] : null;
    const container = document.getElementById('shopPaperFormContainer');
    if (!container) return;
    container.classList.remove('hidden');
    const nextOrder = papers.length === 0 ? 0 : Math.max(0, ...papers.map(x => (x.sortOrder != null ? Number(x.sortOrder) : -1))) + 1;
    container.innerHTML = '<h4 style="margin:0 0 12px 0;">' + (p ? 'Papiersorte bearbeiten' : 'Neue Papiersorte') + '</h4>'
        + '<div class="shop-config-form-row"><label>Sortierreihenfolge (Anzeige im Shop)</label><input type="number" min="0" id="shopPaperSortOrder" value="' + (p != null && p.sortOrder != null ? p.sortOrder : nextOrder) + '" title="Kleinere Zahl = weiter oben"></div>'
        + '<div class="shop-config-form-row"><label>ID (eindeutig)</label><input type="text" id="shopPaperId" value="' + (p ? escapeHtml(p.id) : '') + '" placeholder="z.B. soporset_100"></div>'
        + '<div class="shop-config-form-row"><label>Name</label><input type="text" id="shopPaperName" value="' + (p ? escapeHtml(p.name) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Preis pro Bogen Material (€)</label><input type="number" step="0.01" id="shopPaperPriceSheet" value="' + (p ? (p.pricePerSheetMaterial ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Preis pro Seite Druck (€)</label><input type="number" step="0.01" id="shopPaperPricePage" value="' + (p ? (p.pricePerPagePrint ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Papierdicke (mm)</label><input type="number" step="0.01" id="shopPaperThickness" value="' + (p ? (p.paperThickness ?? 0) : '') + '"></div>'
        + '<div class="form-row" style="margin-top:12px;"><button type="button" id="btnSavePaper" class="btn-primary">Speichern</button><button type="button" id="btnCancelPaper" class="secondary">Abbrechen</button></div>';
    container.querySelector('#btnSavePaper').onclick = () => savePaper(index);
    container.querySelector('#btnCancelPaper').onclick = () => { container.classList.add('hidden'); };
}

async function savePaper(index) {
    const id = document.getElementById('shopPaperId').value.trim() || 'paper_' + Date.now();
    const name = document.getElementById('shopPaperName').value.trim() || id;
    const sortOrder = parseInt(document.getElementById('shopPaperSortOrder').value, 10);
    const pricePerSheetMaterial = parseFloat(document.getElementById('shopPaperPriceSheet').value) || 0;
    const pricePerPagePrint = parseFloat(document.getElementById('shopPaperPricePage').value) || 0;
    const paperThickness = parseFloat(document.getElementById('shopPaperThickness').value) || 0;
    const papers = [...ensureShopConfig().papers];
    const item = { id, name, sortOrder: isNaN(sortOrder) ? 0 : sortOrder, pricePerSheetMaterial, pricePerPagePrint, paperThickness };
    if (index >= 0 && index < papers.length) papers[index] = item; else papers.push(item);
    state.shopConfigData.papers = papers;
    try {
        await saveShopConfig({ papers });
        document.getElementById('shopPaperFormContainer').classList.add('hidden');
        renderShopPapersList();
    } catch (e) { alert(e.message); }
}

async function deletePaper(index) {
    if (!confirm('Papiersorte wirklich entfernen?')) return;
    const papers = ensureShopConfig().papers.filter((_, i) => i !== index);
    state.shopConfigData.papers = papers;
    try {
        await saveShopConfig({ papers });
        renderShopPapersList();
    } catch (e) { alert(e.message); }
}

function renderShopProductionLists() {
    const pd = ensureShopConfig().productionAndDelivery;
    const prodTimes = pd.productionTimes || [];
    const deliveryMethods = pd.deliveryMethods || [];
    const listProd = document.getElementById('shopProdTimesList');
    const listDel = document.getElementById('shopDeliveryList');
    const sortedProd = sortBySortOrder(prodTimes);
    const sortedDel = sortBySortOrder(deliveryMethods);
    if (listProd) {
        listProd.innerHTML = sortedProd.length === 0 ? '<p class="text-muted">Keine Produktionszeiten.</p>' : sortedProd.map((pt) => {
            const name = escapeHtml(pt.name || pt.id || '');
            const price = pt.price != null ? pt.price : 0;
            const order = pt.sortOrder != null ? pt.sortOrder : '–';
            return '<div class="shop-config-item" data-id="' + escapeHtml(pt.id || '') + '"><span class="shop-config-item-info">' + name + ' – ' + price + ' €' + (pt.default ? ' (Standard)' : '') + ' <span class="text-muted">· Reihenfolge ' + order + '</span></span><div class="shop-config-item-actions"><button type="button" class="btn-edit-prodtime">Bearbeiten</button><button type="button" class="btn-delete btn-delete-prodtime">Löschen</button></div></div>';
        }).join('');
        listProd.querySelectorAll('.btn-edit-prodtime').forEach(btn => { const list = ensureShopConfig().productionAndDelivery.productionTimes; btn.addEventListener('click', () => openProdTimeForm(list.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
        listProd.querySelectorAll('.btn-delete-prodtime').forEach(btn => { const list = ensureShopConfig().productionAndDelivery.productionTimes; btn.addEventListener('click', () => deleteProdTime(list.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
    }
    if (listDel) {
        listDel.innerHTML = sortedDel.length === 0 ? '<p class="text-muted">Keine Liefermethoden.</p>' : sortedDel.map((d) => {
            const name = escapeHtml(d.name || d.id || '');
            const price = d.price != null ? d.price : 0;
            const order = d.sortOrder != null ? d.sortOrder : '–';
            return '<div class="shop-config-item" data-id="' + escapeHtml(d.id || '') + '"><span class="shop-config-item-info">' + name + ' – ' + price + ' €' + (d.default ? ' (Standard)' : '') + ' <span class="text-muted">· Reihenfolge ' + order + '</span></span><div class="shop-config-item-actions"><button type="button" class="btn-edit-delivery">Bearbeiten</button><button type="button" class="btn-delete btn-delete-delivery">Löschen</button></div></div>';
        }).join('');
        listDel.querySelectorAll('.btn-edit-delivery').forEach(btn => { const list = ensureShopConfig().productionAndDelivery.deliveryMethods; btn.addEventListener('click', () => openDeliveryForm(list.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
        listDel.querySelectorAll('.btn-delete-delivery').forEach(btn => { const list = ensureShopConfig().productionAndDelivery.deliveryMethods; btn.addEventListener('click', () => deleteDelivery(list.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
    }
}

function openProdTimeForm(index) {
    const list = ensureShopConfig().productionAndDelivery.productionTimes;
    const pt = index >= 0 && list[index] ? list[index] : null;
    const container = document.getElementById('shopProdTimeFormContainer');
    if (!container) return;
    const nextOrder = list.length === 0 ? 0 : Math.max(0, ...list.map(x => (x.sortOrder != null ? Number(x.sortOrder) : -1))) + 1;
    container.classList.remove('hidden');
    container.innerHTML = '<h4 style="margin:0 0 12px 0;">' + (pt ? 'Produktionszeit bearbeiten' : 'Neue Produktionszeit') + '</h4>'
        + '<div class="shop-config-form-row"><label>Sortierreihenfolge (Anzeige im Shop)</label><input type="number" min="0" id="shopProdTimeSortOrder" value="' + (pt != null && pt.sortOrder != null ? pt.sortOrder : nextOrder) + '"></div>'
        + '<div class="shop-config-form-row"><label>ID</label><input type="text" id="shopProdTimeId" value="' + (pt ? escapeHtml(pt.id) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Name</label><input type="text" id="shopProdTimeName" value="' + (pt ? escapeHtml(pt.name) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Produktionsdauer (Werktage)</label><input type="number" min="0" max="99" id="shopProdTimeProductionDays" value="' + (pt && typeof pt.productionDays === 'number' ? pt.productionDays : '') + '" placeholder="z.B. 3"> <span class="text-muted">Für Lieferzeitenrechner</span></div>'
        + '<div class="shop-config-form-row"><label>Preis (€)</label><input type="number" step="0.01" id="shopProdTimePrice" value="' + (pt ? (pt.price ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopProdTimeDefault" ' + (pt && pt.default ? 'checked' : '') + '> Standard</label></div>'
        + '<div class="form-row" style="margin-top:12px;"><button type="button" id="btnSaveProdTime" class="btn-primary">Speichern</button><button type="button" id="btnCancelProdTime" class="secondary">Abbrechen</button></div>';
    container.querySelector('#btnSaveProdTime').onclick = () => saveProdTime(index);
    container.querySelector('#btnCancelProdTime').onclick = () => { container.classList.add('hidden'); };
}

async function saveProdTime(index) {
    const id = document.getElementById('shopProdTimeId').value.trim() || 'prod_' + Date.now();
    const name = document.getElementById('shopProdTimeName').value.trim() || id;
    const sortOrder = parseInt(document.getElementById('shopProdTimeSortOrder').value, 10);
    const productionDaysRaw = document.getElementById('shopProdTimeProductionDays').value.trim();
    const productionDays = productionDaysRaw === '' ? undefined : Math.max(0, parseInt(productionDaysRaw, 10));
    const price = parseFloat(document.getElementById('shopProdTimePrice').value) || 0;
    const default_ = document.getElementById('shopProdTimeDefault').checked;
    const list = [...ensureShopConfig().productionAndDelivery.productionTimes];
    const item = { id, name, sortOrder: isNaN(sortOrder) ? 0 : sortOrder, price, default: default_ };
    if (productionDays !== undefined) item.productionDays = productionDays;
    if (index >= 0 && index < list.length) list[index] = item; else list.push(item);
    if (default_) list.forEach((x, i) => { if (i !== list.indexOf(item)) x.default = false; });
    state.shopConfigData.productionAndDelivery.productionTimes = list;
    try {
        await saveShopConfig({ productionAndDelivery: state.shopConfigData.productionAndDelivery });
        document.getElementById('shopProdTimeFormContainer').classList.add('hidden');
        renderShopProductionLists();
    } catch (e) { alert(e.message); }
}

async function deleteProdTime(index) {
    if (!confirm('Produktionszeit entfernen?')) return;
    const list = ensureShopConfig().productionAndDelivery.productionTimes.filter((_, i) => i !== index);
    state.shopConfigData.productionAndDelivery.productionTimes = list;
    try {
        await saveShopConfig({ productionAndDelivery: state.shopConfigData.productionAndDelivery });
        renderShopProductionLists();
    } catch (e) { alert(e.message); }
}

function openDeliveryForm(index) {
    const list = ensureShopConfig().productionAndDelivery.deliveryMethods;
    const d = index >= 0 && list[index] ? list[index] : null;
    const container = document.getElementById('shopDeliveryFormContainer');
    if (!container) return;
    container.classList.remove('hidden');
    const nextOrder = list.length === 0 ? 0 : Math.max(0, ...list.map(x => (x.sortOrder != null ? Number(x.sortOrder) : -1))) + 1;
    container.innerHTML = '<h4 style="margin:0 0 12px 0;">' + (d ? 'Liefermethode bearbeiten' : 'Neue Liefermethode') + '</h4>'
        + '<div class="shop-config-form-row"><label>Sortierreihenfolge (Anzeige im Shop)</label><input type="number" min="0" id="shopDeliverySortOrder" value="' + (d != null && d.sortOrder != null ? d.sortOrder : nextOrder) + '"></div>'
        + '<div class="shop-config-form-row"><label>ID</label><input type="text" id="shopDeliveryId" value="' + (d ? escapeHtml(d.id) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Name</label><input type="text" id="shopDeliveryName" value="' + (d ? escapeHtml(d.name) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Versanddauer (Werktage)</label><input type="number" min="0" max="99" id="shopDeliveryShippingDays" value="' + (d && typeof d.shippingDays === 'number' ? d.shippingDays : '') + '" placeholder="0 = Abholung"> <span class="text-muted">Für Lieferzeitenrechner</span></div>'
        + '<div class="shop-config-form-row"><label>Bestellschluss (Uhrzeit)</label><input type="number" min="0" max="23" id="shopDeliveryCutoffHour" value="' + (d && typeof d.cutoffHour === 'number' ? d.cutoffHour : '') + '" placeholder="z.B. 14"> <span class="text-muted">Bis wann Bestellung zählt als „heute“ (0–23). Wird im Lieferzeitenrechner als „Bestellung bis DD.MM. um HH:00 Uhr“ angezeigt.</span></div>'
        + '<div class="shop-config-form-row"><label>Preis (€)</label><input type="number" step="0.01" id="shopDeliveryPrice" value="' + (d ? (d.price ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopDeliveryRequiresAddress" ' + (d && d.requiresAddress ? 'checked' : '') + '> Adresse erforderlich</label></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopDeliveryDefault" ' + (d && d.default ? 'checked' : '') + '> Standard</label></div>'
        + '<div class="form-row" style="margin-top:12px;"><button type="button" id="btnSaveDelivery" class="btn-primary">Speichern</button><button type="button" id="btnCancelDelivery" class="secondary">Abbrechen</button></div>';
    container.querySelector('#btnSaveDelivery').onclick = () => saveDelivery(index);
    container.querySelector('#btnCancelDelivery').onclick = () => { container.classList.add('hidden'); };
}

async function saveDelivery(index) {
    const id = document.getElementById('shopDeliveryId').value.trim() || 'delivery_' + Date.now();
    const name = document.getElementById('shopDeliveryName').value.trim() || id;
    const sortOrder = parseInt(document.getElementById('shopDeliverySortOrder').value, 10);
    const shippingDaysRaw = document.getElementById('shopDeliveryShippingDays').value.trim();
    const shippingDays = shippingDaysRaw === '' ? undefined : Math.max(0, parseInt(shippingDaysRaw, 10));
    const cutoffHourRaw = document.getElementById('shopDeliveryCutoffHour').value.trim();
    const cutoffHour = cutoffHourRaw === '' ? undefined : Math.min(23, Math.max(0, parseInt(cutoffHourRaw, 10)));
    const price = parseFloat(document.getElementById('shopDeliveryPrice').value) || 0;
    const requiresAddress = document.getElementById('shopDeliveryRequiresAddress').checked;
    const default_ = document.getElementById('shopDeliveryDefault').checked;
    const list = [...ensureShopConfig().productionAndDelivery.deliveryMethods];
    const item = { id, name, sortOrder: isNaN(sortOrder) ? 0 : sortOrder, price, requiresAddress, default: default_ };
    if (shippingDays !== undefined) item.shippingDays = shippingDays;
    if (cutoffHour !== undefined) item.cutoffHour = cutoffHour;
    if (index >= 0 && index < list.length) list[index] = item; else list.push(item);
    if (default_) list.forEach((x) => { if (x !== item) x.default = false; });
    state.shopConfigData.productionAndDelivery.deliveryMethods = list;
    try {
        await saveShopConfig({ productionAndDelivery: state.shopConfigData.productionAndDelivery });
        document.getElementById('shopDeliveryFormContainer').classList.add('hidden');
        renderShopProductionLists();
    } catch (e) { alert(e.message); }
}

async function deleteDelivery(index) {
    if (!confirm('Liefermethode entfernen?')) return;
    const list = ensureShopConfig().productionAndDelivery.deliveryMethods.filter((_, i) => i !== index);
    state.shopConfigData.productionAndDelivery.deliveryMethods = list;
    try {
        await saveShopConfig({ productionAndDelivery: state.shopConfigData.productionAndDelivery });
        renderShopProductionLists();
    } catch (e) { alert(e.message); }
}

function renderShopBindingsList() {
    const list = document.getElementById('shopBindingsList');
    if (!list) return;
    const bindings = ensureShopConfig().bindings;
    const sorted = sortBySortOrder(bindings);
    list.innerHTML = sorted.length === 0 ? '<p class="text-muted">Keine Bindungen.</p>' : sorted.map((b) => {
        const name = escapeHtml(b.name || b.id || '');
        const id = escapeHtml(b.id || '');
        const order = b.sortOrder != null ? b.sortOrder : '–';
        return '<div class="shop-config-item" data-id="' + escapeHtml(b.id || '') + '"><span class="shop-config-item-info">' + name + ' <span class="text-muted">(' + id + ')</span> <span class="text-muted">· Reihenfolge ' + order + '</span></span><div class="shop-config-item-actions"><button type="button" class="btn-edit-binding">Bearbeiten</button><button type="button" class="btn-delete btn-delete-binding">Löschen</button></div></div>';
    }).join('');
    list.querySelectorAll('.btn-edit-binding').forEach(btn => { btn.addEventListener('click', () => openBindingForm(ensureShopConfig().bindings.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
    list.querySelectorAll('.btn-delete-binding').forEach(btn => { btn.addEventListener('click', () => deleteBinding(ensureShopConfig().bindings.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
}

function openBindingForm(index) {
    const bindings = ensureShopConfig().bindings;
    const b = index >= 0 && bindings[index] ? bindings[index] : null;
    const container = document.getElementById('shopBindingFormContainer');
    if (!container) return;
    const optsJson = b && b.options ? JSON.stringify(b.options, null, 2) : '[]';
    const editorJson = b && b.editorConfig ? JSON.stringify(b.editorConfig, null, 2) : '{}';
    const previewJson = (b && b.previewConfig) ? JSON.stringify(b.previewConfig, null, 2) : '';
    const previewLayers = (b && Array.isArray(b.previewBackgroundLayers)) ? b.previewBackgroundLayers : [];
    const layer1 = previewLayers[0] != null ? escapeHtml(previewLayers[0]) : '';
    const layer2 = previewLayers[1] != null ? escapeHtml(previewLayers[1]) : '';
    const layer3 = previewLayers[2] != null ? escapeHtml(previewLayers[2]) : '';
    const nextOrder = bindings.length === 0 ? 0 : Math.max(0, ...bindings.map(x => (x.sortOrder != null ? Number(x.sortOrder) : -1))) + 1;
    container.classList.remove('hidden');
    container.innerHTML = '<h4 style="margin:0 0 12px 0;">' + (b ? 'Bindung bearbeiten' : 'Neue Bindung') + '</h4>'
        + '<div class="shop-config-form-row"><label>Sortierreihenfolge (Anzeige im Shop)</label><input type="number" min="0" id="shopBindingSortOrder" value="' + (b != null && b.sortOrder != null ? b.sortOrder : nextOrder) + '"></div>'
        + '<div class="shop-config-form-row"><label>ID</label><input type="text" id="shopBindingId" value="' + (b ? escapeHtml(b.id) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Name</label><input type="text" id="shopBindingName" value="' + (b ? escapeHtml(b.name) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Basisgebühr (€)</label><input type="number" step="0.01" id="shopBindingBaseFee" value="' + (b ? (b.bindingTypeBaseFee ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Stückpreis (€)</label><input type="number" step="0.01" id="shopBindingPriceItem" value="' + (b ? (b.pricePerItem ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Min. Rücken (mm)</label><input type="number" step="0.1" id="shopBindingMinMm" value="' + (b ? (b.minBlockThicknessMm ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Max. Rücken (mm)</label><input type="number" step="0.1" id="shopBindingMaxMm" value="' + (b ? (b.maxBlockThicknessMm ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopBindingPersonalization" ' + (b && b.requiresPersonalization ? 'checked' : '') + '> Personalisierung (Cover-Editor)</label></div>'
        + '<div class="shop-config-form-row"><label>Optionen (JSON)</label><textarea id="shopBindingOptions" rows="6" style="font-family:monospace;font-size:0.85rem;">' + escapeHtml(optsJson) + '</textarea></div>'
        + '<div class="shop-config-form-row"><label>editorConfig (JSON, optional)</label><textarea id="shopBindingEditorConfig" rows="8" style="font-family:monospace;font-size:0.85rem;">' + escapeHtml(editorJson) + '</textarea></div>'
        + '<div class="shop-config-form-row shop-binding-preview-section" style="margin-top:16px; padding:12px; background:var(--bg-elevated); border-radius:var(--radius-sm); border:1px solid var(--border);">'
        + '<strong style="font-size:0.9em;">Shop-Vorschau (Hintergrund + transformiertes Thumbnail)</strong>'
        + '<p class="text-muted" style="margin:6px 0 10px 0; font-size:0.85em;">Für Bindungen ohne Cover-Editor: Vorschau = Ihre Hintergrundbilder + das erste Buchblock-Thumbnail (mit im Editor ermittelter Verzerrung). Transformation im Tool „Preview-Overlay-Editor“ erzeugen, hier einfügen.</p>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopBindingPreviewEnabled" ' + (b && b.previewMode === 'firstPageWithOverlay' ? 'checked' : '') + '> Vorschau mit Hintergrund + Transformation aktiv</label></div>'
        + '<div id="shopBindingPreviewFields" style="margin-top:10px;">'
        + '<div class="shop-config-form-row"><label>Transformation (JSON aus Preview-Overlay-Editor)</label><textarea id="shopBindingPreviewJson" rows="6" style="font-family:monospace;font-size:0.8rem; width:100%;" placeholder="{\n  \"previewWidth\": 700,\n  \"previewHeight\": 980,\n  \"thumbnailTransform\": { \"x\": 350, \"y\": 490, ... }\n}">' + escapeHtml(previewJson) + '</textarea></div>'
        + '<p class="text-muted" style="margin:8px 0 4px 0; font-size:0.85em;">Hintergrund-Layer: Bild hochladen (speichert in Supabase Storage und trägt die URL ein) oder URL von Hand einfügen.</p>'
        + '<div class="shop-config-form-row"><label>Hintergrund-Layer 1 URL (unten)</label><div class="shop-config-input-with-btn"><input type="text" id="shopBindingPreviewLayer1" placeholder="https://…/storage/…/preview-assets/…/bg.png" value="' + layer1 + '"><input type="file" id="shopBindingPreviewUpload1" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn-secondary shop-upload-btn" data-layer="1">Hochladen</button></div></div>'
        + '<div class="shop-config-form-row"><label>Hintergrund-Layer 2 URL</label><div class="shop-config-input-with-btn"><input type="text" id="shopBindingPreviewLayer2" placeholder="optional" value="' + layer2 + '"><input type="file" id="shopBindingPreviewUpload2" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn-secondary shop-upload-btn" data-layer="2">Hochladen</button></div></div>'
        + '<div class="shop-config-form-row"><label>Hintergrund-Layer 3 URL (oben)</label><div class="shop-config-input-with-btn"><input type="text" id="shopBindingPreviewLayer3" placeholder="optional" value="' + layer3 + '"><input type="file" id="shopBindingPreviewUpload3" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn-secondary shop-upload-btn" data-layer="3">Hochladen</button></div></div>'
        + '</div></div>'
        + '<div class="form-row" style="margin-top:12px;"><button type="button" id="btnSaveBinding" class="btn-primary">Speichern</button><button type="button" id="btnCancelBinding" class="secondary">Abbrechen</button></div>';
    const previewEnabledEl = document.getElementById('shopBindingPreviewEnabled');
    const previewFieldsEl = document.getElementById('shopBindingPreviewFields');
    function togglePreviewFields() {
        if (previewFieldsEl) previewFieldsEl.style.opacity = previewEnabledEl && previewEnabledEl.checked ? '1' : '0.6';
    }
    if (previewEnabledEl) previewEnabledEl.addEventListener('change', togglePreviewFields);
    togglePreviewFields();
    [1, 2, 3].forEach((num) => {
        const btn = document.querySelector('.shop-upload-btn[data-layer="' + num + '"]');
        const fileInput = document.getElementById('shopBindingPreviewUpload' + num);
        const urlInput = document.getElementById('shopBindingPreviewLayer' + num);
        if (!btn || !fileInput || !urlInput) return;
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async function () {
            const file = this.files && this.files[0];
            if (!file || !file.type.startsWith('image/')) return;
            const pathPrefix = (document.getElementById('shopBindingId') && document.getElementById('shopBindingId').value.trim()) || 'preview';
            btn.disabled = true;
            btn.textContent = 'Lade hoch …';
            try {
                const data = await uploadPreviewAsset(file, pathPrefix);
                urlInput.value = data.url || '';
            } catch (e) {
                alert(e.message || 'Upload fehlgeschlagen.');
            }
            btn.disabled = false;
            btn.textContent = 'Hochladen';
            this.value = '';
        });
    });
    container.querySelector('#btnSaveBinding').onclick = () => saveBinding(index);
    container.querySelector('#btnCancelBinding').onclick = () => { container.classList.add('hidden'); };
}

async function saveBinding(index) {
    let options = [];
    let editorConfig = null;
    try {
        options = JSON.parse(document.getElementById('shopBindingOptions').value);
        if (!Array.isArray(options)) options = [];
    } catch (_) { alert('Optionen: Ungültiges JSON.'); return; }
    try {
        const ec = document.getElementById('shopBindingEditorConfig').value.trim();
        editorConfig = ec ? JSON.parse(ec) : null;
    } catch (_) { alert('editorConfig: Ungültiges JSON.'); return; }
    const id = document.getElementById('shopBindingId').value.trim() || 'binding_' + Date.now();
    const name = document.getElementById('shopBindingName').value.trim() || id;
    const sortOrder = parseInt(document.getElementById('shopBindingSortOrder').value, 10);
    const bindingTypeBaseFee = parseFloat(document.getElementById('shopBindingBaseFee').value) || 0;
    const pricePerItem = parseFloat(document.getElementById('shopBindingPriceItem').value) || 0;
    const minBlockThicknessMm = parseFloat(document.getElementById('shopBindingMinMm').value) || 0;
    const maxBlockThicknessMm = parseFloat(document.getElementById('shopBindingMaxMm').value) || 0;
    const requiresPersonalization = document.getElementById('shopBindingPersonalization').checked;
    const previewEnabled = document.getElementById('shopBindingPreviewEnabled') && document.getElementById('shopBindingPreviewEnabled').checked;
    const bindings = [...ensureShopConfig().bindings];
    const item = { id, name, sortOrder: isNaN(sortOrder) ? 0 : sortOrder, bindingTypeBaseFee, pricePerItem, minBlockThicknessMm, maxBlockThicknessMm, requiresPersonalization, options };
    if (requiresPersonalization) {
        item.personalizationInterface = 'coverEditor';
        if (editorConfig && typeof editorConfig === 'object') item.editorConfig = editorConfig;
    }
    if (previewEnabled) {
        item.previewMode = 'firstPageWithOverlay';
        const previewJsonEl = document.getElementById('shopBindingPreviewJson');
        const previewJsonStr = previewJsonEl ? previewJsonEl.value.trim() : '';
        if (previewJsonStr) {
            try {
                const parsed = JSON.parse(previewJsonStr);
                item.previewConfig = {
                    previewWidth: parsed.previewWidth,
                    previewHeight: parsed.previewHeight,
                    thumbnailTransform: parsed.thumbnailTransform && typeof parsed.thumbnailTransform === 'object' ? parsed.thumbnailTransform : {}
                };
            } catch (_) {
                alert('Preview-Transformation: Ungültiges JSON.');
                return;
            }
        } else {
            item.previewConfig = null;
        }
        const l1 = (document.getElementById('shopBindingPreviewLayer1') && document.getElementById('shopBindingPreviewLayer1').value.trim()) || null;
        const l2 = (document.getElementById('shopBindingPreviewLayer2') && document.getElementById('shopBindingPreviewLayer2').value.trim()) || null;
        const l3 = (document.getElementById('shopBindingPreviewLayer3') && document.getElementById('shopBindingPreviewLayer3').value.trim()) || null;
        item.previewBackgroundLayers = [l1, l2, l3].filter(Boolean);
    } else {
        item.previewMode = undefined;
        item.previewConfig = undefined;
        item.previewBackgroundLayers = undefined;
    }
    if (index >= 0 && index < bindings.length) bindings[index] = item; else bindings.push(item);
    state.shopConfigData.bindings = bindings;
    try {
        await saveShopConfig({ bindings });
        document.getElementById('shopBindingFormContainer').classList.add('hidden');
        renderShopBindingsList();
    } catch (e) { alert(e.message); }
}

async function deleteBinding(index) {
    if (!confirm('Bindung wirklich entfernen?')) return;
    const bindings = ensureShopConfig().bindings.filter((_, i) => i !== index);
    state.shopConfigData.bindings = bindings;
    try {
        await saveShopConfig({ bindings });
        renderShopBindingsList();
    } catch (e) { alert(e.message); }
}

function renderShopExtrasList() {
    const list = document.getElementById('shopExtrasList');
    if (!list) return;
    const extras = ensureShopConfig().extras;
    const sorted = sortBySortOrder(extras);
    list.innerHTML = sorted.length === 0 ? '<p class="text-muted">Keine Extras.</p>' : sorted.map((e) => {
        const name = escapeHtml(e.name || e.id || '');
        const id = escapeHtml(e.id || '');
        const order = e.sortOrder != null ? e.sortOrder : '–';
        return '<div class="shop-config-item" data-id="' + escapeHtml(e.id || '') + '"><span class="shop-config-item-info">' + name + ' <span class="text-muted">(' + id + ')</span> <span class="text-muted">· Reihenfolge ' + order + '</span></span><div class="shop-config-item-actions"><button type="button" class="btn-edit-extra">Bearbeiten</button><button type="button" class="btn-delete btn-delete-extra">Löschen</button></div></div>';
    }).join('');
    list.querySelectorAll('.btn-edit-extra').forEach(btn => { btn.addEventListener('click', () => openExtraForm(ensureShopConfig().extras.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
    list.querySelectorAll('.btn-delete-extra').forEach(btn => { btn.addEventListener('click', () => deleteExtra(ensureShopConfig().extras.findIndex(x => x.id === btn.closest('.shop-config-item').getAttribute('data-id')))); });
}

function openExtraForm(index) {
    const extras = ensureShopConfig().extras;
    const e = index >= 0 && extras[index] ? extras[index] : null;
    const container = document.getElementById('shopExtraFormContainer');
    if (!container) return;
    const optsJson = e && e.options ? JSON.stringify(e.options, null, 2) : '[]';
    const nextOrder = extras.length === 0 ? 0 : Math.max(0, ...extras.map(x => (x.sortOrder != null ? Number(x.sortOrder) : -1))) + 1;
    container.classList.remove('hidden');
    container.innerHTML = '<h4 style="margin:0 0 12px 0;">' + (e ? 'Extra bearbeiten' : 'Neues Extra') + '</h4>'
        + '<div class="shop-config-form-row"><label>Sortierreihenfolge (Anzeige im Shop)</label><input type="number" min="0" id="shopExtraSortOrder" value="' + (e != null && e.sortOrder != null ? e.sortOrder : nextOrder) + '"></div>'
        + '<div class="shop-config-form-row"><label>ID</label><input type="text" id="shopExtraId" value="' + (e ? escapeHtml(e.id) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Name</label><input type="text" id="shopExtraName" value="' + (e ? escapeHtml(e.name) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label>Einheitspreis (€)</label><input type="number" step="0.01" id="shopExtraUnitPrice" value="' + (e ? (e.unitPrice ?? 0) : '') + '"></div>'
        + '<div class="shop-config-form-row"><label><input type="checkbox" id="shopExtraIndependentQty" ' + (e && e.hasIndependentQuantity !== false ? 'checked' : '') + '> Unabhängige Menge</label></div>'
        + '<div class="shop-config-form-row"><label>Standardmenge</label><input type="number" min="0" id="shopExtraDefaultQty" value="' + (e ? (e.defaultQuantity ?? 0) : '0') + '"></div>'
        + '<div class="shop-config-form-row"><label>Optionen (JSON)</label><textarea id="shopExtraOptions" rows="8" style="font-family:monospace;font-size:0.85rem;">' + escapeHtml(optsJson) + '</textarea></div>'
        + '<div class="form-row" style="margin-top:12px;"><button type="button" id="btnSaveExtra" class="btn-primary">Speichern</button><button type="button" id="btnCancelExtra" class="secondary">Abbrechen</button></div>';
    container.querySelector('#btnSaveExtra').onclick = () => saveExtra(index);
    container.querySelector('#btnCancelExtra').onclick = () => { container.classList.add('hidden'); };
}

async function saveExtra(index) {
    let options = [];
    try {
        options = JSON.parse(document.getElementById('shopExtraOptions').value);
        if (!Array.isArray(options)) options = [];
    } catch (_) { alert('Optionen: Ungültiges JSON.'); return; }
    const id = document.getElementById('shopExtraId').value.trim() || 'extra_' + Date.now();
    const name = document.getElementById('shopExtraName').value.trim() || id;
    const sortOrder = parseInt(document.getElementById('shopExtraSortOrder').value, 10);
    const unitPrice = parseFloat(document.getElementById('shopExtraUnitPrice').value) || 0;
    const hasIndependentQuantity = document.getElementById('shopExtraIndependentQty').checked;
    const defaultQuantity = parseInt(document.getElementById('shopExtraDefaultQty').value, 10) || 0;
    const extras = [...ensureShopConfig().extras];
    const item = { id, name, sortOrder: isNaN(sortOrder) ? 0 : sortOrder, unitPrice, options, hasIndependentQuantity, defaultQuantity };
    if (index >= 0 && index < extras.length) extras[index] = item; else extras.push(item);
    state.shopConfigData.extras = extras;
    try {
        await saveShopConfig({ extras });
        document.getElementById('shopExtraFormContainer').classList.add('hidden');
        renderShopExtrasList();
    } catch (e) { alert(e.message); }
}

async function deleteExtra(index) {
    if (!confirm('Extra wirklich entfernen?')) return;
    const extras = ensureShopConfig().extras.filter((_, i) => i !== index);
    state.shopConfigData.extras = extras;
    try {
        await saveShopConfig({ extras });
        renderShopExtrasList();
    } catch (e) { alert(e.message); }
}

export {
    ensureShopConfig, renderShopConfigTabs, renderShopGeneralForm, renderShopPapersList,
    openPaperForm, renderShopProductionLists, openProdTimeForm, openDeliveryForm,
    renderShopBindingsList, openBindingForm, renderShopExtrasList, openExtraForm,
};
