/**
 * Statistik-Modal: Monatsauswertung – KPIs, Aufträge pro Tag, Laufend/Fertiggestellt.
 */
import { listAllOrdersForStats } from './dashboard-api.js';
import { escapeHtml } from './dashboard-utils.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

let allOrdersCache = [];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function getModal() {
    return document.getElementById('statsModalOverlay');
}

function getContent() {
    return document.getElementById('statsContent');
}

function getLoading() {
    return document.getElementById('statsLoading');
}

function openModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.add('stats-modal-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    fillPeriodSelectors();
    loadAndRender();
}

function closeModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('stats-modal-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function fillPeriodSelectors() {
    const monthSelect = document.getElementById('statsMonth');
    const yearSelect = document.getElementById('statsYear');
    if (!monthSelect || !yearSelect) return;
    monthSelect.innerHTML = MONTHS.map((name, i) => `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${name}</option>`).join('');
    const year = new Date().getFullYear();
    const years = [];
    for (let y = year; y >= year - 5; y--) years.push(y);
    yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
}

function getOrdersInPeriod(orders, month, year) {
    return orders.filter(o => {
        const d = o.created_at ? new Date(o.created_at) : null;
        if (!d || isNaN(d.getTime())) return false;
        return d.getMonth() === month && d.getFullYear() === year;
    });
}

function getOrdersByDayInMonth(orders, month, year) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = Array.from({ length: daysInMonth }, () => 0);
    orders.forEach(o => {
        const d = new Date(o.created_at);
        if (d.getMonth() === month && d.getFullYear() === year) {
            const day = d.getDate() - 1;
            if (day >= 0 && day < daysInMonth) byDay[day]++;
        }
    });
    return byDay;
}

const STATUS_LAUFEND = ['Eingegangen', 'In Prüfung', 'Wartet auf Zahlung', 'Bezahlt', 'Bereit für Druck', 'Bereit für Bindung', 'Versand-/Abholbereit'];
const STATUS_FERTIG = ['Versendet', 'Abgeholt'];

function renderStats(ordersInPeriod, month, year) {
    const revenue = ordersInPeriod.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
    const count = ordersInPeriod.length;
    const avgOrder = count > 0 ? revenue / count : 0;
    const byDay = getOrdersByDayInMonth(allOrdersCache, month, year);
    const maxDayCount = Math.max(1, ...byDay);

    const laufend = ordersInPeriod.filter(o => STATUS_LAUFEND.includes(o.status || ''));
    const fertig = ordersInPeriod.filter(o => STATUS_FERTIG.includes(o.status || ''));
    const sumLaufend = laufend.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const sumFertig = fertig.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

    const monthName = MONTHS[month];
    let html = '';

    html += '<div class="stats-kpi-grid">';
    html += '<div class="stats-kpi-card"><span class="stats-kpi-value">' + count + '</span><span class="stats-kpi-label">Aufträge</span></div>';
    html += '<div class="stats-kpi-card stats-kpi-revenue"><span class="stats-kpi-value">' + revenue.toFixed(2) + ' €</span><span class="stats-kpi-label">Umsatz</span></div>';
    html += '<div class="stats-kpi-card"><span class="stats-kpi-value">' + avgOrder.toFixed(2) + ' €</span><span class="stats-kpi-label">Ø Auftragswert</span></div>';
    html += '</div>';

    html += '<section class="stats-section"><h3>Aufträge pro Tag</h3><div class="stats-timeline" aria-label="Aufträge pro Tag im ' + monthName + ' ' + year + '">';
    byDay.forEach((n, i) => {
        const h = maxDayCount > 0 ? Math.max(4, (n / maxDayCount) * 40) : 4;
        const title = (i + 1) + '. ' + monthName + ': ' + n + ' Auftrag/Aufträge';
        html += '<div class="stats-timeline-day" style="height:' + h + 'px" title="' + escapeHtml(title) + '"><span class="stats-timeline-day-count">' + (n > 0 ? n : '') + '</span></div>';
    });
    html += '</div><div class="stats-timeline-labels"><span>1</span><span>15</span><span>' + byDay.length + '</span></div></section>';

    html += '<section class="stats-section stats-summary"><h3>Zusammenfassung</h3>';
    html += '<div class="stats-summary-grid">';
    html += '<div class="stats-summary-card"><span class="stats-summary-label">Laufende Aufträge</span><span class="stats-summary-value">' + laufend.length + '</span><span class="stats-summary-eur">' + sumLaufend.toFixed(2) + ' €</span></div>';
    html += '<div class="stats-summary-card"><span class="stats-summary-label">Fertiggestellt</span><span class="stats-summary-value">' + fertig.length + '</span><span class="stats-summary-eur">' + sumFertig.toFixed(2) + ' €</span></div>';
    html += '</div></section>';

    html += '<section class="stats-section"><h3>Express-Aufträge</h3><p class="stats-express">' + ordersInPeriod.filter(o => o.is_express).length + ' von ' + count + ' Aufträgen im Zeitraum sind Express.</p></section>';

    return html;
}

async function loadAndRender() {
    const content = getContent();
    const loading = getLoading();
    if (!content || !loading) return;

    const monthSelect = document.getElementById('statsMonth');
    const yearSelect = document.getElementById('statsYear');
    const month = monthSelect ? parseInt(monthSelect.value, 10) : currentMonth;
    const year = yearSelect ? parseInt(yearSelect.value, 10) : currentYear;

    loading.style.display = 'block';
    content.innerHTML = '';
    try {
        if (allOrdersCache.length === 0) {
            allOrdersCache = await listAllOrdersForStats();
        }
        const inPeriod = getOrdersInPeriod(allOrdersCache, month, year);
        content.innerHTML = renderStats(inPeriod, month, year);
    } catch (e) {
        content.innerHTML = '<p class="stats-error">' + escapeHtml(e.message) + '</p>';
    } finally {
        loading.style.display = 'none';
    }
}

function bindStatsModal() {
    const btn = document.getElementById('btnStats');
    const overlay = getModal();
    const closeBtn = document.getElementById('statsModalClose');
    const applyBtn = document.getElementById('statsApplyPeriod');

    if (btn) btn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }
    if (applyBtn) applyBtn.addEventListener('click', loadAndRender);

    const monthSelect = document.getElementById('statsMonth');
    const yearSelect = document.getElementById('statsYear');
    if (monthSelect) monthSelect.addEventListener('change', loadAndRender);
    if (yearSelect) yearSelect.addEventListener('change', loadAndRender);
}

export function initStatsModal() {
    bindStatsModal();
}
