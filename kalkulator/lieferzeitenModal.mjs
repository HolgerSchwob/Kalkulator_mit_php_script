/**
 * Lieferzeiten-Kalkulator als Modal (Vanilla-JS-Port von calendar/lieferzeiten-kalkulator.jsx).
 * Hilft bei der Auswahl von Produktions- und Lieferzeit anhand eines Wunschlieferdatums.
 * "Übernehmen" setzt die gewählte Produktionszeit und Lieferart im inquiryState und schließt das Modal.
 */

import { getHessianHolidaysDateStrings } from '../src/utils/holidays.mjs';

const DEFAULT_CLOSED_DAYS = [
    '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25',
    '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01',
];
const DATA_CHECK_BUFFER = 1;
const DEFAULT_CUTOFF_HOUR = 14;

function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
}
function isHoliday(d, closedDays) {
    return closedDays.includes(toLocalDateString(d));
}
function isWorkday(d, closedDays) {
    return !isWeekend(d) && !isHoliday(d, closedDays);
}
function today0() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
}
function sameDay(a, b) {
    return a && b && a.toDateString() === b.toDateString();
}
function addWorkdays(date, n, closedDays) {
    let d = new Date(date);
    let added = 0;
    const dir = n >= 0 ? 1 : -1;
    while (added < Math.abs(n)) {
        d.setDate(d.getDate() + dir);
        if (isWorkday(d, closedDays)) added++;
    }
    return d;
}
function workdaysBetween(a, b, closedDays) {
    if (b < a) return 0;
    let count = 0;
    let d = new Date(a);
    d.setDate(d.getDate() + 1);
    while (d <= b) {
        if (isWorkday(d, closedDays)) count++;
        d.setDate(d.getDate() + 1);
    }
    return count;
}

/**
 * Berechnet Fristen von einem Wunschlieferdatum rückwärts.
 * productionDays/shippingDays = Werktage; shippingDays 0 = Abholung.
 */
function calcRoute(deliveryDate, productionDays, shippingDays, closedDays) {
    const total = productionDays + shippingDays + DATA_CHECK_BUFFER;
    const orderDeadline = addWorkdays(deliveryDate, -total, closedDays);
    const productionStart = addWorkdays(orderDeadline, DATA_CHECK_BUFFER, closedDays);
    const productionEnd = addWorkdays(productionStart, productionDays, closedDays);
    const shippedOn = shippingDays > 0 ? addWorkdays(productionEnd, 1, closedDays) : null;
    return { orderDeadline, productionStart, productionEnd, shippedOn, total, prod: productionDays, ship: shippingDays };
}

/**
 * @param {number} [cutoffHour] - Bis zu dieser Stunde (0–23) zählt eine Bestellung als „heute“. Fehlt: DEFAULT_CUTOFF_HOUR.
 */
function getStatus(deliveryDate, productionDays, shippingDays, closedDays, cutoffHour) {
    if (!deliveryDate) return { type: 'idle' };
    const now = new Date();
    const today = today0();
    const currentHour = now.getHours();
    const cutoff = typeof cutoffHour === 'number' ? cutoffHour : DEFAULT_CUTOFF_HOUR;

    const r = calcRoute(deliveryDate, productionDays, shippingDays, closedDays);
    const days = workdaysBetween(today, r.orderDeadline, closedDays);

    if (r.orderDeadline < today) return { type: 'impossible', r, cutoffHour: cutoff };
    if (sameDay(r.orderDeadline, today) && currentHour >= cutoff) return { type: 'impossible', r, reason: 'cutoff', cutoffHour: cutoff };
    if (days === 0) return { type: 'today', r, days, cutoffHour: cutoff };
    if (days === 1) return { type: 'tomorrow', r, days, cutoffHour: cutoff };
    return { type: 'ok', r, days, cutoffHour: cutoff };
}

function fmtShort(d) {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}
function fmtFull(d) {
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Datum als YYYY-MM-DD in lokaler Zeit (nicht UTC), damit Klick auf eine Zelle genau dieses Datum trifft. */
function toLocalDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/**
 * Mappt Shop-Config (productionTimes, deliveryMethods) auf Werktage für die Rechnung.
 * Nutzt optionale Felder productionDays / shippingDays; Fallback aus id/Name.
 */
function getProductionDays(productionTime, _all) {
    if (typeof productionTime.productionDays === 'number') return productionTime.productionDays;
    const id = (productionTime.id || '').toLowerCase();
    if (id.includes('express')) return 2;
    return 5;
}
function getShippingDays(deliveryMethod, _all) {
    if (typeof deliveryMethod.shippingDays === 'number') return deliveryMethod.shippingDays;
    if (deliveryMethod.requiresAddress === false && (deliveryMethod.id || '').toLowerCase().includes('pickup')) return 0;
    const id = (deliveryMethod.id || '').toLowerCase();
    if (id.includes('express')) return 1;
    return 3;
}

function getCutoffHour(deliveryMethod) {
    if (deliveryMethod && typeof deliveryMethod.cutoffHour === 'number') return deliveryMethod.cutoffHour;
    return DEFAULT_CUTOFF_HOUR;
}

let overlayEl = null;
let calcConfigRef = null;
let inquiryStateRef = null;
let onApplyCallback = null;
let closedDaysList = DEFAULT_CLOSED_DAYS;

function getModalRoot() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'lieferzeiten-modal-overlay';
    overlayEl.className = 'lieferzeiten-modal-overlay';
    document.body.appendChild(overlayEl);
    return overlayEl;
}

function closeModal() {
    if (typeof window !== 'undefined' && window !== window.top && window.parent.postMessage) {
        try { window.parent.postMessage({ type: 'kalkulator-modal-closed' }, '*'); } catch (_) {}
    }
    const root = document.getElementById('lieferzeiten-modal-overlay');
    if (root) {
        root.classList.remove('active');
        root.innerHTML = '';
    }
}

function renderCalendar(container, selectedDate, hlDates, onSelect, calendarState) {
    const today = today0();
    const state = calendarState || { vy: today.getFullYear(), vm: today.getMonth() };
    if (!calendarState) {
        calendarState = state;
        if (selectedDate) {
            state.vy = selectedDate.getFullYear();
            state.vm = selectedDate.getMonth();
        }
    }
    const vy = state.vy;
    const vm = state.vm;
    const firstDay = new Date(vy, vm, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInM = new Date(vy, vm + 1, 0).getDate();
    const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInM }, (_, i) => new Date(vy, vm, i + 1))];
    const mon = new Date(vy, vm, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    let html = '<div class="lz-calendar">';
    html += '<div class="lz-cal-header"><button type="button" class="lz-cal-prev">‹</button><span class="lz-cal-month">' + mon + '</span><button type="button" class="lz-cal-next">›</button></div>';
    html += '<div class="lz-cal-weekdays">';
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(w => { html += '<span>' + w + '</span>'; });
    html += '</div>';
    html += '<div class="lz-cal-grid">';
    cells.forEach((day, i) => {
        if (!day) {
            html += '<div class="lz-cal-cell lz-cal-empty"></div>';
            return;
        }
        const past = day < today;
        const we = isWeekend(day);
        const hol = isHoliday(day, closedDaysList);
        const unavail = past || we || hol;
        const sel = sameDay(day, selectedDate);
        let hlKey = null;
        if (hlDates) {
            for (const [k, d] of Object.entries(hlDates)) {
                if (d && sameDay(day, d)) { hlKey = k; break; }
            }
        }
        const inRange = !unavail && hlDates && hlDates.orderDeadline && selectedDate && day > hlDates.orderDeadline && day < selectedDate;
        let cls = 'lz-cal-cell';
        if (unavail) cls += ' lz-cal-unavail';
        if (sel) cls += ' lz-cal-selected';
        if (hlKey) cls += ' lz-cal-hl lz-cal-hl-' + hlKey;
        if (inRange) cls += ' lz-cal-range';
        html += '<button type="button" class="' + cls + '" data-date="' + toLocalDateString(day) + '"' + (unavail ? ' disabled' : '') + '>' + day.getDate() + '</button>';
    });
    html += '</div></div>';

    container.innerHTML = html;
    container.querySelector('.lz-cal-prev').addEventListener('click', () => {
        if (state.vm === 0) { state.vm = 11; state.vy--; } else state.vm--;
        renderCalendar(container, selectedDate, hlDates, onSelect, state);
    });
    container.querySelector('.lz-cal-next').addEventListener('click', () => {
        if (state.vm === 11) { state.vm = 0; state.vy++; } else state.vm++;
        renderCalendar(container, selectedDate, hlDates, onSelect, state);
    });
    container.querySelectorAll('.lz-cal-cell:not(.lz-cal-empty):not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = new Date(btn.getAttribute('data-date') + 'T12:00:00');
            onSelect(d);
        });
    });
}

/**
 * Öffnet das Lieferzeiten-Modal.
 * @param {object} calcConfig - CALC_CONFIG (productionAndDelivery.productionTimes, deliveryMethods)
 * @param {object} inquiryState - global inquiry state (production.productionTimeId, deliveryMethodId)
 * @param {function} onApply - wird aufgerufen nach "Übernehmen" (optional, sonst nur State setzen + updateApp)
 */
export function openLieferzeitenModal(calcConfig, inquiryState, onApply) {
    calcConfigRef = calcConfig;
    inquiryStateRef = inquiryState;
    onApplyCallback = onApply || null;

    closedDaysList = getHessianHolidaysDateStrings();

    const pd = calcConfig.productionAndDelivery || {};
    const productionTimes = pd.productionTimes || [];
    const deliveryMethods = pd.deliveryMethods || [];

    if (productionTimes.length === 0 || deliveryMethods.length === 0) {
        alert('Keine Produktionszeiten oder Lieferarten konfiguriert.');
        return;
    }

    let selectedDate = null;
    let selectedProdId = inquiryState.production?.productionTimeId || productionTimes.find(p => p.default)?.id || productionTimes[0]?.id;
    let selectedDelId = inquiryState.production?.deliveryMethodId || deliveryMethods.find(d => d.default)?.id || deliveryMethods[0]?.id;

    const selectedProd = productionTimes.find(p => p.id === selectedProdId) || productionTimes[0];
    const selectedDel = deliveryMethods.find(d => d.id === selectedDelId) || deliveryMethods[0];
    const prodDays = getProductionDays(selectedProd, productionTimes);
    const shipDays = getShippingDays(selectedDel, deliveryMethods);
    let status = getStatus(selectedDate, prodDays, shipDays, closedDaysList, getCutoffHour(selectedDel));
    let hlDates = (status.type !== 'idle' && status.type !== 'impossible') ? {
        orderDeadline: status.r.orderDeadline,
        productionStart: status.r.productionStart,
        productionEnd: status.r.productionEnd,
        shippedOn: status.r.shippedOn,
    } : null;

    const root = getModalRoot();
    root.classList.add('active');
    if (typeof window !== 'undefined' && window !== window.top && window.parent.postMessage) {
        try { window.parent.postMessage({ type: 'kalkulator-modal-opened' }, '*'); } catch (_) {}
    }

    function renderResult() {
        const selDel = deliveryMethods.find(d => d.id === selectedDelId) || selectedDel;
        status = getStatus(selectedDate, getProductionDays(productionTimes.find(p => p.id === selectedProdId) || selectedProd, productionTimes), getShippingDays(selDel, deliveryMethods), closedDaysList, getCutoffHour(selDel));
        hlDates = (status.type !== 'idle' && status.type !== 'impossible') ? {
            orderDeadline: status.r.orderDeadline,
            productionStart: status.r.productionStart,
            productionEnd: status.r.productionEnd,
            shippedOn: status.r.shippedOn,
        } : null;

        const resEl = root.querySelector('.lz-result-inner');
        if (!resEl) return;

        if (status.type === 'idle') {
            resEl.innerHTML = '<div class="lz-result-idle"><span style="font-size:24px;">📅</span><br>Wunschtermin im Kalender wählen</div>';
            return;
        }

        if (status.type === 'impossible') {
            const cutoffH = status.cutoffHour !== undefined ? status.cutoffHour : getCutoffHour(deliveryMethods.find(d => d.id === selectedDelId) || selectedDel);
            const msg = status.reason === 'cutoff'
                ? 'Heute nicht mehr möglich. Bestellschluss war ' + cutoffH + ':00 Uhr. Bitte früheren Wunschtermin oder schnellere Option wählen.'
                : 'Termin nicht erreichbar. ' + (selectedDate ? fmtFull(selectedDate) : '') + ' ist mit der gewählten Kombination nicht machbar. Bitte früheren Wunschtermin oder schnellere Produktion/Versand wählen.';
            resEl.innerHTML = '<div class="lz-impossible">' + msg + '</div>';
            return;
        }

        const r = status.r;
        const sk = selectedDelId;
        const cutoffDisplay = (status.cutoffHour !== undefined ? status.cutoffHour : DEFAULT_CUTOFF_HOUR);
        const isPickup = (deliveryMethods.find(d => d.id === sk) || {}).requiresAddress === false;
        const urgencyText = status.type === 'today' ? 'Heute bestellen — bis ' + cutoffDisplay + ':00 Uhr' : status.type === 'tomorrow' ? 'Deadline morgen bis ' + cutoffDisplay + ':00 Uhr' : 'Noch ' + status.days + ' Werktage — Bestellung bis ' + fmtShort(r.orderDeadline) + ' um ' + cutoffDisplay + ':00 Uhr';
        const steps = [
            { label: 'Auftragseingang bis', date: r.orderDeadline, color: '#D95C5C', timeExtra: cutoffDisplay + ':00 Uhr' },
            { label: 'Produktion', date: r.productionStart, dateEnd: r.productionEnd, color: '#D48C2A' },
            ...(r.shippedOn ? [{ label: 'Versand', date: r.shippedOn, color: '#5090D8' }] : []),
            { label: isPickup ? 'Abholbereit' : 'Lieferung', date: selectedDate, color: '#C4AA78' },
        ];

        let h = '<div class="lz-urgency ' + status.type + '">' + urgencyText + '</div>';
        h += '<div class="lz-timeline">';
        steps.forEach((s, i) => {
            const dateStr = fmtShort(s.date) + (s.timeExtra ? ' · ' + s.timeExtra : '');
            h += '<div class="lz-timeline-step"><div class="lz-timeline-dot" style="border-color:' + s.color + ';background:' + s.color + '20"></div><div style="text-align:center;margin-top:5px;"><div style="font-size:10px;color:' + s.color + '">' + dateStr + '</div><div style="font-size:8px;color:#635B50">' + s.label + '</div></div></div>';
        });
        h += '</div>';
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:14px;">';
        const cards = [
            { label: 'Auftragseingang bis', date: r.orderDeadline, color: '#D95C5C', timeExtra: cutoffDisplay + ':00 Uhr' },
            { label: 'Produktion', date: r.productionStart, dateEnd: r.productionEnd, color: '#D48C2A' },
            ...(r.shippedOn ? [{ label: 'Versand', date: r.shippedOn, color: '#5090D8' }] : []),
            { label: isPickup ? 'Abholbereit' : 'Lieferung', date: selectedDate, color: '#C4AA78' },
        ];
        cards.forEach(c => {
            const valueHtml = fmtShort(c.date) + (c.timeExtra ? ' <span style="font-size:9px;color:#635B50">um ' + c.timeExtra + '</span>' : '') + (c.dateEnd ? ' <span style="font-size:9px;color:#635B50">bis ' + fmtShort(c.dateEnd) + '</span>' : '');
            h += '<div class="lz-date-card" style="border-left-color:' + c.color + '"><div class="lz-date-card-label">' + c.label + '</div><div class="lz-date-card-value" style="color:' + c.color + '">' + valueHtml + '</div></div>';
        });
        h += '</div>';
        h += '<button type="button" class="lz-btn-apply">Auswahl übernehmen</button>';
        resEl.innerHTML = h;
        resEl.querySelector('.lz-btn-apply')?.addEventListener('click', () => {
            if (inquiryStateRef) {
                inquiryStateRef.production = inquiryStateRef.production || {};
                inquiryStateRef.production.productionTimeId = selectedProdId;
                inquiryStateRef.production.deliveryMethodId = selectedDelId;
            }
            if (onApplyCallback) onApplyCallback();
            closeModal();
        });
    }

    function buildLeftCol() {
        let html = '<div class="lz-left">';
        html += '<div class="lz-seg-group"><label>Produktionszeit</label><div class="lz-seg-btns" id="lz-prod-btns">';
        productionTimes.forEach(pt => {
            const active = pt.id === selectedProdId;
            html += '<button type="button" class="lz-seg-btn' + (active ? ' active' : '') + '" data-prod-id="' + (pt.id || '') + '">' + (pt.name || pt.id) + '</button>';
        });
        html += '</div></div>';
        html += '<div class="lz-seg-group"><label>Versandart</label><div class="lz-seg-btns" id="lz-del-btns">';
        deliveryMethods.forEach(dm => {
            const active = dm.id === selectedDelId;
            html += '<button type="button" class="lz-seg-btn' + (active ? ' active' : '') + '" data-del-id="' + (dm.id || '') + '">' + (dm.name || dm.id) + '</button>';
        });
        html += '</div></div>';
        html += '<hr style="border:none;border-top:1px solid #1E1C17;margin:12px 0;">';
        html += '<div class="lz-seg-group"><label>Wunschlieferdatum</label><div id="lz-calendar-container"></div></div>';
        html += '</div>';
        return html;
    }

    root.innerHTML = '<div class="lz-modal">' +
        '<div class="lz-modal-header"><div><div class="lz-modal-sub">LIEFERZEITENRECHNER</div><div class="lz-modal-title">Wann muss ich bestellen?</div></div><button type="button" class="lz-modal-close" id="lz-close">×</button></div>' +
        '<div class="lz-modal-body">' +
        buildLeftCol() +
        '<div class="lz-result"><div class="lz-result-inner"></div></div>' +
        '</div></div>';

    root.querySelector('#lz-close').addEventListener('click', closeModal);
    root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });

    const calendarState = { vy: today0().getFullYear(), vm: today0().getMonth() };
    const calContainer = root.querySelector('#lz-calendar-container');

    function refreshCalendar() {
        if (calContainer) renderCalendar(calContainer, selectedDate, hlDates, onDateSelect, calendarState);
    }

    function scrollResultIntoView() {
        const resultEl = root.querySelector('.lz-result');
        if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    root.querySelectorAll('#lz-prod-btns .lz-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedProdId = btn.getAttribute('data-prod-id');
            root.querySelectorAll('#lz-prod-btns .lz-seg-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-prod-id') === selectedProdId));
            renderResult();
            refreshCalendar();
            if (selectedDate) scrollResultIntoView();
        });
    });
    root.querySelectorAll('#lz-del-btns .lz-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDelId = btn.getAttribute('data-del-id');
            root.querySelectorAll('#lz-del-btns .lz-seg-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-del-id') === selectedDelId));
            renderResult();
            refreshCalendar();
            if (selectedDate) scrollResultIntoView();
        });
    });
    function onDateSelect(d) {
        selectedDate = d;
        const curDel = deliveryMethods.find(dm => dm.id === selectedDelId) || selectedDel;
        const prodDays = getProductionDays(productionTimes.find(p => p.id === selectedProdId) || selectedProd, productionTimes);
        const shipDays = getShippingDays(curDel, deliveryMethods);
        const newStatus = getStatus(selectedDate, prodDays, shipDays, closedDaysList, getCutoffHour(curDel));
        hlDates = (newStatus.type !== 'idle' && newStatus.type !== 'impossible')
            ? { orderDeadline: newStatus.r.orderDeadline, productionStart: newStatus.r.productionStart, productionEnd: newStatus.r.productionEnd, shippedOn: newStatus.r.shippedOn }
            : null;
        renderCalendar(calContainer, selectedDate, hlDates, onDateSelect, calendarState);
        renderResult();
        scrollResultIntoView();
    }
    if (calContainer) renderCalendar(calContainer, selectedDate, hlDates, onDateSelect, calendarState);

    renderResult();

    // Beim Öffnen: Kalender in den Fokus scrollen (bei langem Modal)
    requestAnimationFrame(() => {
        if (calContainer) calContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
}

export function setClosedDays(dates) {
    closedDaysList = Array.isArray(dates) ? dates.map(d => typeof d === 'string' ? d : (d instanceof Date ? d.toISOString().slice(0, 10) : '')) : DEFAULT_CLOSED_DAYS;
}
