/**
 * Dashboard-Einstieg: Config, Login, Event-Bindings.
 */
import { state, STATUS_ORDER, STATUS_DROPDOWN, ASSIGNEES, TOOL_URLS } from './dashboard-state.js';
import { formatDate, escapeHtml } from './dashboard-utils.js';
import { listOrders, getOrderDetail, updateOrder, sendOrderEmail, getEmailTemplates, saveEmailTemplate, getShopConfig, saveShopConfig } from './dashboard-api.js';
import { refreshList } from './dashboard-orders.js';
import { showListView, showToolsView, showDetailView, openTool, showToolsList } from './dashboard-nav.js';
import {
    openDetail, closeDetailAndSave, renderDetail, bindDetailActions, generateOrderSheetPdf,
    showSettingsView
} from './dashboard-detail.js';
import { closeTemplateForm, renderTemplatesList, GetEmailDetails } from './dashboard-settings-mail.js';
import { ensureShopConfig, openPaperForm, openProdTimeForm, openDeliveryForm, openBindingForm, openExtraForm, openColorPairForm, openTemplateZuordnungForm, openCoverTemplateUploadForm } from './dashboard-settings-shop.js';
import { initStatsModal } from './dashboard-stats.js';
window.GetEmailDetails = GetEmailDetails;

initStatsModal();

async function loadConfig() {
    const configUrl = new URL('dashboard.config.json', document.baseURI || window.location.href);
    let r;
    try {
        r = await fetch(configUrl.href + '?t=' + Date.now());
    } catch (err) {
        document.getElementById('authWarn').innerHTML = 'Konfiguration konnte nicht geladen werden (Netzwerk/CORS). Bei <code>file://</code>: Dashboard über einen lokalen Webserver öffnen (z.&nbsp;B. Ordner im Explorer öffnen, dann <code>npx serve</code> oder VS Code Live Server). In <code>dashboard.config.json</code> bitte <strong>adminSecret</strong> eintragen.';
        document.getElementById('authWarn').style.display = 'block';
        return;
    }
    if (!r.ok) {
        document.getElementById('authWarn').innerHTML = '<strong>dashboard.config.json</strong> nicht gefunden (HTTP ' + r.status + '). Datei im gleichen Ordner wie diese Seite anlegen (Vorlage: <code>dashboard.config.json.example</code>). Darin <strong>adminSecret</strong> und ggf. <strong>supabaseUrl</strong>, <strong>anonKey</strong> eintragen. Bei Supabase: Edge Functions → Secrets → <code>ADMIN_SECRET</code> setzen.';
        document.getElementById('authWarn').style.display = 'block';
        return;
    }
    try {
        state.config = await r.json();
    } catch (e) {
        document.getElementById('authWarn').innerHTML = 'Ungültiger Inhalt in <code>dashboard.config.json</code> (kein gültiges JSON). Bitte <strong>adminSecret</strong> eintragen.';
        document.getElementById('authWarn').style.display = 'block';
        return;
    }
    state.config.supabaseUrl = (state.config.supabaseUrl || '').replace(/\/$/, '');
    state.config.agentUrl = (state.config.agentUrl || '').replace(/\/$/, '') || null;
    state.config.adminSecret = (state.config.adminSecret || '').replace(/[\r\n\t]/g, '').trim();
    state.config.dashboardPassword = (state.config.dashboardPassword || '').trim() || null;
    if (!state.config.adminSecret) {
        document.getElementById('authWarn').innerHTML = 'Bitte in <code>dashboard.config.json</code> einen <strong>adminSecret</strong> eintragen (gleicher Wert wie in Supabase → Edge Functions → Secrets → <code>ADMIN_SECRET</code>). Ohne Secret werden keine Aufträge geladen.';
        document.getElementById('authWarn').style.display = 'block';
    }
}

function requireLogin() {
    if (!state.config.dashboardPassword) return true;
    if (sessionStorage.getItem('dashboardAuth') === 'true') return true;
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
    return false;
}

function hideLoginAndShowApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    if (state.config.dashboardPassword) document.getElementById('logoutWrap').style.display = 'inline-block';
}

document.getElementById('filterStatus').addEventListener('change', refreshList);
document.getElementById('btnRefresh').addEventListener('click', refreshList);
document.getElementById('btnNewOrders').addEventListener('click', () => {
    document.getElementById('filterStatus').value = 'Eingegangen';
    refreshList();
});
document.getElementById('detailClose').addEventListener('click', () => closeDetailAndSave());

document.getElementById('btnTools').addEventListener('click', showToolsView);
document.getElementById('btnToolsBack').addEventListener('click', showListView);
document.getElementById('btnToolBackToList').addEventListener('click', showToolsList);
document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        const toolId = card.getAttribute('data-tool');
        if (toolId) openTool(toolId);
    });
});
document.getElementById('btnSettings').addEventListener('click', () => {
    if (!state.config.adminSecret) { alert('Bitte adminSecret in dashboard.config.json eintragen.'); return; }
    showSettingsView();
});
document.getElementById('btnSettingsBack').addEventListener('click', showListView);
document.getElementById('settingsAccordion').addEventListener('click', (e) => {
    const header = e.target.closest('.settings-accordion-header');
    if (!header) return;
    const item = header.closest('.settings-accordion-item');
    if (!item) return;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('#settingsAccordion .settings-accordion-item').forEach((el) => {
        el.classList.remove('open');
        const h = el.querySelector('.settings-accordion-header');
        if (h) h.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
        item.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
    }
});
document.getElementById('btnShowEmailPlaceholders')?.addEventListener('click', GetEmailDetails);
document.getElementById('btnTemplateCancel').addEventListener('click', closeTemplateForm);
document.getElementById('btnTemplateSave').addEventListener('click', async () => {
    if (!state.currentEditingTemplate) return;
    const payload = {
        template_key: state.currentEditingTemplate.template_key,
        subject_template: document.getElementById('settingsSubject').value,
        body_plain: document.getElementById('settingsBodyPlain').value,
        body_html: document.getElementById('settingsBodyHtml').value,
        active: document.getElementById('settingsTemplateActive').checked,
    };
    try {
        await saveEmailTemplate(payload);
        const templates = await getEmailTemplates();
        renderTemplatesList(templates);
        closeTemplateForm();
    } catch (e) {
        alert(e.message);
    }
});

document.getElementById('btnSaveGeneral')?.addEventListener('click', async () => {
    const g = ensureShopConfig().general;
    g.orderBaseFee = parseFloat(document.getElementById('shopGenOrderBaseFee').value) || 0;
    g.bookBlockBaseFee = parseFloat(document.getElementById('shopGenBookBlockBaseFee').value) || 0;
    g.currencySymbol = document.getElementById('shopGenCurrencySymbol').value.trim() || '€';
    g.maxVariants = parseInt(document.getElementById('shopGenMaxVariants').value, 10) || 1;
    g.absoluteMinThicknessMm = parseFloat(document.getElementById('shopGenMinThickness').value) || 0;
    g.absoluteMaxThicknessMm = parseFloat(document.getElementById('shopGenMaxThickness').value) || 50;
    g.defaultFallbackBindingId = document.getElementById('shopGenDefaultBindingId').value.trim() || '';
    g.a3PagePrice = parseFloat(document.getElementById('shopGenA3Price').value) || 0;
    g.vatRate = parseFloat(document.getElementById('shopGenVatRate').value) || 7;
    g.stripeEnabled = document.getElementById('shopGenStripeEnabled')?.checked === true;
    g.stripeMode = document.getElementById('shopGenStripeMode')?.value === 'live' ? 'live' : 'test';
    g.stripePublishableKey = (document.getElementById('shopGenStripePublishableKey')?.value ?? '').trim() || '';
    g.requireOnlinePayment = document.getElementById('shopGenRequireOnlinePayment')?.checked === true;
    try {
        await saveShopConfig({ general: g });
        alert('Allgemeine Einstellungen gespeichert.');
    } catch (e) { alert(e.message); }
});
document.getElementById('btnAddPaper')?.addEventListener('click', () => openPaperForm(-1));
document.getElementById('btnAddProdTime')?.addEventListener('click', () => openProdTimeForm(-1));
document.getElementById('btnAddDelivery')?.addEventListener('click', () => openDeliveryForm(-1));
document.getElementById('btnAddBinding')?.addEventListener('click', () => openBindingForm(-1));
document.getElementById('btnAddExtra')?.addEventListener('click', () => openExtraForm(-1));
document.getElementById('btnAddColorPair')?.addEventListener('click', () => openColorPairForm(-1));
document.getElementById('btnAddTemplateZuordnung')?.addEventListener('click', () => openTemplateZuordnungForm(null));
document.getElementById('btnUploadCoverTemplate')?.addEventListener('click', () => openCoverTemplateUploadForm());

document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = document.getElementById('loginPassword')?.value || '';
    const errEl = document.getElementById('loginError');
    if (state.config.dashboardPassword && pw === state.config.dashboardPassword) {
        sessionStorage.setItem('dashboardAuth', 'true');
        errEl.style.display = 'none';
        hideLoginAndShowApp();
        if (state.config.adminSecret) refreshList();
    } else {
        errEl.textContent = 'Falsches Passwort.';
        errEl.style.display = 'block';
    }
});
document.getElementById('btnLogout')?.addEventListener('click', () => {
    sessionStorage.removeItem('dashboardAuth');
    location.reload();
});

setInterval(() => {
    if (!document.getElementById('listView').classList.contains('hidden') && state.config.adminSecret) {
        refreshList();
    }
}, 2 * 60 * 1000);

(async () => {
    try {
        await loadConfig();
        if (requireLogin() === false) return;
        hideLoginAndShowApp();
        if (state.config.dashboardPassword) document.getElementById('logoutWrap').style.display = 'inline-block';
        if (state.config.adminSecret) await refreshList();
    } catch (err) {
        alert(err.message || String(err));
    }
})();
