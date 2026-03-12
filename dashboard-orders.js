/**
 * Auftragsliste: Laden und Anzeige.
 * openDetail wird bei init übergeben (aus Detail-Modul).
 */

import { state } from './dashboard-state.js';
import { formatDate, escapeHtml } from './dashboard-utils.js';
import { listOrders } from './dashboard-api.js';

let openDetailCb = null;

export function initOrders(openDetail) {
    openDetailCb = openDetail;
}

function renderOrderRow(o) {
    const tr = document.createElement('tr');
    tr.classList.add('order-row-clickable');
    tr.setAttribute('data-order-id', o.id);
    tr.setAttribute('role', 'button');
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('title', 'Auftrag ' + (o.order_number || '') + ' öffnen');
    if ((o.status || 'Eingegangen') === 'Eingegangen') tr.classList.add('row-eingegangen');
    const orderNum = escapeHtml(o.order_number);
    const custName = escapeHtml(o.customer_name || '–');
    const custEmail = escapeHtml(o.customer_email);
    const statusVal = o.status || 'Eingegangen';
    const assigneeVal = escapeHtml(o.assignee || '–');
    const priceVal = o.total_price != null ? Number(o.total_price).toFixed(2) + ' €' : '–';
    const dateVal = formatDate(o.created_at);
    tr.innerHTML =
        '<td title="' + orderNum + '">' + orderNum + '</td>' +
        '<td title="' + custName + '">' + custName + '</td>' +
        '<td title="' + custEmail + '">' + escapeHtml(custEmail) + '</td>' +
        '<td><span class="status-badge" data-status="' + escapeHtml(statusVal) + '">' + escapeHtml(statusVal) + '</span>' + (o.is_express ? ' <span class="express-badge">Express</span>' : '') + '</td>' +
        '<td title="' + assigneeVal + '">' + assigneeVal + '</td>' +
        '<td title="' + priceVal + '">' + priceVal + '</td>' +
        '<td title="' + dateVal + '">' + dateVal + '</td>';
    tr.addEventListener('click', () => {
        if (openDetailCb) openDetailCb(o.id);
    });
    tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (openDetailCb) openDetailCb(o.id);
        }
    });
    return tr;
}

export async function refreshList() {
    document.getElementById('listLoading').style.display = 'block';
    document.getElementById('tableWrap').style.display = 'none';
    document.getElementById('emptyList').style.display = 'none';
    try {
        const orders = await listOrders();
        state.lastOrders = orders;
        const tbody = document.getElementById('ordersBody');
        tbody.innerHTML = '';
        orders.forEach(o => tbody.appendChild(renderOrderRow(o)));
        document.getElementById('tableWrap').style.display = 'block';
        if (orders.length === 0) document.getElementById('emptyList').style.display = 'block';
        const newCount = orders.filter(o => (o.status || 'Eingegangen') === 'Eingegangen').length;
        document.getElementById('btnNewOrders').style.display = newCount > 0 ? 'inline-block' : 'none';
    } catch (e) {
        alert(e.message);
    } finally {
        document.getElementById('listLoading').style.display = 'none';
    }
}
