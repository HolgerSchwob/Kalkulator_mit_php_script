/**
 * Detail-Panel: Auftrag anzeigen, bearbeiten, PDF, Aktionen.
 */
import { state, STATUS_DROPDOWN, ASSIGNEES } from './dashboard-state.js';
import { escapeHtml } from './dashboard-utils.js';
import { getOrderDetail, updateOrder, sendOrderEmail, getEmailTemplates, getShopConfig, getFarbpaare, getTemplateZuordnungAll, getCoverTemplatesAdmin } from './dashboard-api.js';
import { showListView, showDetailView } from './dashboard-nav.js';
import { initOrders, refreshList } from './dashboard-orders.js';
import { renderTemplatesList } from './dashboard-settings-mail.js';
import { ensureShopConfig, renderShopConfigTabs, renderShopGeneralForm, renderShopPapersList, renderShopProductionLists, renderShopBindingsList, renderShopExtrasList, renderShopColorPairsList, renderTemplateZuordnungList, renderCoverTemplatesList } from './dashboard-settings-shop.js';

async function closeDetailAndSave() {
    if (!state.currentOrderId) {
        showListView();
        return;
    }
    const content = document.getElementById('detailContent');
    const statusEl = content?.querySelector('#detailStatus');
    if (!statusEl) {
        showListView();
        return;
    }
    const status = statusEl.value;
    const assigneeRaw = content.querySelector('#detailAssignee')?.value || '';
    const assignee = assigneeRaw.trim() || null;
    const notes = content.querySelector('#detailNotes')?.value ?? null;
    if (status !== 'Eingegangen' && !assignee) {
        alert('Bitte weisen Sie eine Auftragsverantwortung zu, bevor Sie den Status von "Eingegangen" ändern oder den Auftrag schließen.');
        content.querySelector('#detailAssignee')?.focus();
        return;
    }
    const statusChanged = state.currentDetail?.order && (state.currentDetail.order.status || 'Eingegangen') !== status;
    try {
        await updateOrder(state.currentOrderId, { status, assignee, notes });
        if (state.currentDetail?.order) {
            state.currentDetail.order = { ...state.currentDetail.order, status, assignee, notes };
        }
        if (statusChanged && state.currentDetail?.order?.customer_email && confirm('Status wurde geändert. Status-E-Mail an den Kunden senden?')) {
            try {
                await sendOrderEmail(state.currentOrderId, 'status', status);
            } catch (_) {
                alert('E-Mail konnte nicht gesendet werden. Sie können die Status-E-Mail später im Auftrag erneut anstoßen.');
            }
        }
        showListView();
        refreshList();
    } catch (e) {
        alert('Beim Speichern ist ein Fehler aufgetreten: ' + e.message);
    }
}

async function showSettingsView() {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailPanel').classList.remove('visible');
    document.getElementById('toolsView').classList.add('hidden');
    document.getElementById('settingsView').classList.remove('hidden');
    const listEl = document.getElementById('settingsTemplatesList');
    const formEl = document.getElementById('settingsTemplateForm');
    if (formEl && formEl.parentElement === listEl) document.getElementById('settingsTemplateFormContainer').appendChild(formEl);
    if (listEl) listEl.innerHTML = '';
    if (formEl) formEl.classList.add('hidden');
    document.getElementById('settingsTemplatesLoading').style.display = 'block';
    try {
        const templates = await getEmailTemplates();
        renderTemplatesList(templates);
    } catch (e) {
        alert(e.message);
    } finally {
        document.getElementById('settingsTemplatesLoading').style.display = 'none';
    }
    document.getElementById('shopConfigLoading').style.display = 'block';
    document.getElementById('shopConfigError').style.display = 'none';
    document.getElementById('shopConfigWrap').style.display = 'none';
    try {
        state.shopConfigData = await getShopConfig();
        state.farbpaareList = await getFarbpaare();
        state.templateZuordnungList = await getTemplateZuordnungAll();
        state.coverTemplatesList = await getCoverTemplatesAdmin().catch(() => []);
        state.availableTemplates = [];
        const templatePath = state.shopConfigData?.bindings?.find(b => b.editorConfig?.templatePath)?.editorConfig?.templatePath;
        if (templatePath) {
            try {
                const r = await fetch(templatePath + 'templates.json');
                if (r.ok) {
                    const d = await r.json();
                    state.availableTemplates = Array.isArray(d.templates) ? d.templates : [];
                }
            } catch (_) {}
        }
        document.getElementById('shopConfigWrap').style.display = 'block';
        renderShopConfigTabs();
        renderShopGeneralForm();
        renderShopPapersList();
        renderShopProductionLists();
        renderShopBindingsList();
        renderShopExtrasList();
        renderShopColorPairsList();
        renderCoverTemplatesList();
        renderTemplateZuordnungList();
    } catch (e) {
        document.getElementById('shopConfigError').textContent = e.message;
        document.getElementById('shopConfigError').style.display = 'block';
    } finally {
        document.getElementById('shopConfigLoading').style.display = 'none';
    }
}

async function openDetail(orderId) {
    state.currentOrderId = orderId;
    showDetailView();
    const panel = document.getElementById('detailPanel');
    const content = document.getElementById('detailContent');
    const loading = document.getElementById('detailLoading');
    content.style.display = 'none';
    loading.style.display = 'block';
    try {
        const data = await getOrderDetail(orderId);
        state.currentDetail = data;
        content.innerHTML = renderDetail(data);
        content.style.display = 'block';
        bindDetailActions(content, data);
    } catch (e) {
        content.innerHTML = '<p class="error-msg">' + escapeHtml(e.message) + '</p>';
        content.style.display = 'block';
    } finally {
        loading.style.display = 'none';
    }
}

initOrders(openDetail); // Callback für "Öffnen" in der Auftragsliste registrieren

function renderDetail(data) {
    const order = data.order || {};
    const p = order.payload || {};
    const inquiry = p.inquiryDetails || {};
    const priceDetails = p.priceDetails || {};
    const variants = priceDetails.variantsWithPrices || [];
    const extras = priceDetails.extrasWithPrices || [];
    const total = order.total_price != null ? Number(order.total_price) : (priceDetails.totalOrderPrice != null ? Number(priceDetails.totalOrderPrice) : 0);
    const customerData = p.customerData || {};
    const shippingData = p.shippingData || order.shipping_data || {};
    const personalizations = inquiry.personalizations || {};
    const production = inquiry.production || {};
    const deliveryMethods = inquiry.productionAndDelivery?.deliveryMethods || [
        { id: 'pickup', name: 'Selbstabholung', requiresAddress: false },
        { id: 'standard_shipping', name: 'Standardversand (DE)', requiresAddress: true },
    ];
    const delivery = deliveryMethods.find(d => d.id === production.deliveryMethodId) || { name: '–', requiresAddress: false };
    const downloadUrls = data.downloadUrls || {};

    const detailEmail = (customerData.customerEmail || customerData.email || order.customer_email || '').trim();
    const emailLog = order.email_sent_log;
    const logEntries = Array.isArray(emailLog) ? emailLog : [];
    const hasReceivedEmail = logEntries.some(function(e) { return e.type === 'received'; });
    const orderNotesFromCustomer = (customerData.customerNotes != null && String(customerData.customerNotes).trim()) ? String(customerData.customerNotes).trim() : (order.notes != null && String(order.notes).trim()) ? String(order.notes).trim() : '';
    const detailCustomerEmail = customerData.customerEmail || customerData.email || order.customer_email || '';
    const detailMailto = detailCustomerEmail ? ('mailto:' + encodeURIComponent(detailCustomerEmail) + '?subject=' + encodeURIComponent('Auftrag ' + (order.order_number || ''))) : '#';
    const customerName = customerData.customerName || customerData.name || order.customer_name || '–';
    const emailLogTitle = logEntries.length > 0 ? logEntries.map(function(entry) {
        const label = entry.type === 'received' ? 'Auftrag eingegangen' : ('Status: ' + (entry.status || '–'));
        const sentAt = entry.sent_at ? (function(d) { try { return d.toLocaleString('de-DE'); } catch (_) { return entry.sent_at; } })(new Date(entry.sent_at)) : '–';
        return label + ' – ' + sentAt;
    }).join('\n') : 'Bisher keine E-Mails versendet.';

    let html = '<div class="detail-sticky-head">';
    html += '<div class="detail-head-left">';
    html += '<span class="detail-order-number">' + escapeHtml(order.order_number || '') + '</span>';
    html += '<span class="status-badge" data-status="' + escapeHtml(order.status || 'Eingegangen') + '">' + escapeHtml(order.status || 'Eingegangen') + '</span>';
    html += '<span class="detail-head-total">' + total.toFixed(2) + ' €</span>';
    html += '</div>';
    html += '<div class="detail-head-center">';
    html += '<span class="detail-head-customer-name">' + escapeHtml(customerName) + '</span>';
    html += '<span class="detail-head-customer-email"><a href="' + detailMailto + '" class="mailto-link">' + escapeHtml(detailCustomerEmail || '–') + '</a></span>';
    html += '</div>';
    html += '<div class="detail-head-actions">';
    html += '<button type="button" class="secondary btn-copy-email" data-email="' + escapeHtml(detailEmail) + '" title="E-Mail in Zwischenablage kopieren">E-Mail kopieren</button>';
    if (detailEmail) {
        html += '<button type="button" class="secondary" id="btnSendReceivedEmail" title="' + (hasReceivedEmail ? 'Eingangsbestätigung erneut an Kunden senden' : 'Eingangsbestätigung manuell senden (wird sonst automatisch nach Bestelleingang versendet)') + '">' + (hasReceivedEmail ? 'Eingangs-E-Mail erneut senden' : 'Eingangs-E-Mail senden') + '</button>';
    }
    html += '<span class="detail-email-log-badge" title="' + escapeHtml(emailLogTitle) + (logEntries.length === 0 ? '\n\nDie Eingangsbestätigung wird automatisch direkt nach Bestelleingang versendet.' : '') + '">' + (logEntries.length > 0 ? logEntries.length + ' E-Mail(s)' : 'Keine E-Mails') + '</span>';
    html += '<button type="button" class="secondary" id="btnDetailSave">Speichern</button>';
    html += '<button type="button" class="btn-primary" id="btnDetailClose">Schließen</button>';
    html += '</div></div>';

    if ((order.status || 'Eingegangen') === 'Eingegangen' && !order.assignee) {
        html += '<p class="detail-assignee-hint">Bitte weisen Sie vor dem ersten Statuswechsel eine Auftragsverantwortung zu.</p>';
    }

    const statusOptions = order.status === 'Wartet auf Zahlung' ? [...STATUS_DROPDOWN, 'Wartet auf Zahlung'] : STATUS_DROPDOWN;
    const isPaid = order.status === 'Bezahlt';
    const isPaymentOpen = order.status === 'Wartet auf Zahlung';

    html += '<div class="detail-grid">';
    html += '<div class="detail-section"><h3>Administration</h3>';
    if (isPaymentOpen || isPaid) {
        html += '<div class="form-row"><button type="button" id="btnPaymentToggle" class="' + (isPaid ? 'btn-payment-paid' : 'btn-payment-open') + '">' + (isPaid ? 'BEZAHLT' : 'ZAHLUNG OFFEN') + '</button></div>';
    }
    html += '<div class="form-row"><label>Status</label><select id="detailStatus">';
    statusOptions.forEach(s => {
        html += '<option value="' + escapeHtml(s) + '"' + (order.status === s ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
    });
    html += '</select></div>';
    html += '<div class="form-row"><label>Auftragsverantwortung</label><select id="detailAssignee"><option value="">–</option>';
    ASSIGNEES.forEach(a => {
        html += '<option value="' + escapeHtml(a) + '"' + (order.assignee === a ? ' selected' : '') + '>' + escapeHtml(a) + '</option>';
    });
    html += '</select></div>';
    html += '<div class="form-row"><label>Notizen</label><textarea id="detailNotes">' + escapeHtml(order.notes || '') + '</textarea></div>';
    html += '</div>';

    html += '<div class="detail-section"><h3>Kunde & Lieferung</h3>';
    html += '<dl class="detail-dl">';
    html += '<dt>Name</dt><dd>' + escapeHtml(customerName) + '</dd>';
    html += '<dt>E-Mail</dt><dd><a href="' + detailMailto + '" class="mailto-link">' + escapeHtml(detailCustomerEmail || '–') + '</a></dd>';
    html += '<dt>Telefon</dt><dd>' + escapeHtml(customerData.customerPhone || order.customer_phone || '–') + '</dd>';
    html += '<dt>Lieferart</dt><dd>' + escapeHtml(delivery.name) + '</dd>';
    if (delivery.requiresAddress && (shippingData.shippingStreet || shippingData.shippingZip || shippingData.shippingCity)) {
        html += '<dt>Adresse</dt><dd>' + escapeHtml([shippingData.shippingStreet, shippingData.shippingZip, shippingData.shippingCity].filter(Boolean).join(', ')) + '</dd>';
    }
    html += '</dl>';
    if (orderNotesFromCustomer) {
        html += '<div class="customer-notes-box"><strong>Auftragshinweise (vom Kunden)</strong><br><span class="order-notes-text">' + escapeHtml(orderNotesFromCustomer) + '</span></div>';
    }
    html += '</div>';

    html += '<div class="detail-section"><h3>Bestellung</h3>';
    variants.forEach(v => {
        const thumb = personalizations[v.id]?.editorData?.thumbnailDataUrl;
        const thumbHtml = thumb ? '<img class="thumb" src="' + escapeHtml(thumb) + '" alt="">' : '<div class="thumb placeholder">–</div>';
        const name = v.name != null ? v.name : 'Variante';
        html += '<div class="cart-item">' + thumbHtml + '<div><strong>' + (v.quantity || 1) + ' × ' + escapeHtml(name) + '</strong> ' + (v.totalPrice != null ? Number(v.totalPrice).toFixed(2) + ' €' : '') + '</div></div>';
    });
    extras.forEach(e => {
        html += '<div class="cart-item"><div class="thumb placeholder">–</div><div><strong>' + (e.quantity || 1) + '× ' + escapeHtml(e.name || 'Extra') + '</strong> ' + (e.totalPrice != null ? Number(e.totalPrice).toFixed(2) + ' €' : '') + '</div></div>';
    });
    html += '<p style="margin-top:10px;"><strong>Gesamt: ' + total.toFixed(2) + ' €</strong></p></div>';
    html += '</div>';

    html += '<div class="detail-section detail-section--full"><h3>Produktions-Aktionen</h3><div class="actions-row">';
    if (downloadUrls.mainPdfExternalUrl) {
        html += '<a href="' + escapeHtml(downloadUrls.mainPdfExternalUrl) + '" target="_blank" rel="noopener" class="btn-primary">Druckdaten (externer Link)</a>';
    } else if (downloadUrls.mainPdf) {
        html += '<a href="' + escapeHtml(downloadUrls.mainPdf) + '" target="_blank" rel="noopener" class="btn-primary">Druckdaten (PDF)</a>';
    } else {
        html += '<span class="text-muted">Kein PDF gespeichert.</span>';
    }
    const svgKeys = Object.keys(downloadUrls).filter(k => k.startsWith('svg_'));
    svgKeys.forEach((k, idx) => {
        const fullLabel = k.replace(/^svg_/, '');
        html += '<a href="' + escapeHtml(downloadUrls[k]) + '" target="_blank" rel="noopener" class="secondary" title="' + escapeHtml(fullLabel) + '">Buchdecke ' + (idx + 1) + '</a>';
    });
    const hasAgent = !!state.config.agentUrl;
    const localSyncedAt = order.local_synced_at;
    if (hasAgent) {
        if (localSyncedAt) {
            html += '<button type="button" class="secondary" id="btnOpenLocalFolder" title="Öffnet den Auftragsordner auf diesem Rechner (FileAgent)">Lokalen Auftragsordner öffnen</button>';
        }
        html += '<button type="button" class="secondary" id="btnSyncToNas" data-order-id="' + escapeHtml(order.id || '') + '" data-order-number="' + escapeHtml(order.order_number || '') + '">' + (localSyncedAt ? 'Dateien erneut auf NAS speichern' : 'Dateien auf NAS speichern') + '</button>';
    }
    html += '<button type="button" class="secondary" id="btnShipping">Versandetiketten (demnächst)</button>';
    html += '<button type="button" id="btnOrderSheet" class="btn-primary">Auftragszettel drucken</button>';
    html += '</div></div>';

    return html;
}

async function generateOrderSheetPdf(data) {
    if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
        alert('pdfMake ist nicht geladen. Auftragszettel kann nicht erstellt werden.');
        return;
    }
    const order = data.order || {};
    const p = order.payload || {};
    const inquiry = p.inquiryDetails || {};
    const priceDetails = p.priceDetails || {};
    const variants = priceDetails.variantsWithPrices || [];
    const extras = priceDetails.extrasWithPrices || [];
    const total = order.total_price != null ? Number(order.total_price) : (Number(priceDetails.totalOrderPrice) || 0);
    const customerData = p.customerData || {};
    const shippingData = p.shippingData || order.shipping_data || {};
    const personalizations = inquiry.personalizations || {};
    const production = inquiry.production || {};
    const deliveryMethods = inquiry.productionAndDelivery?.deliveryMethods || [
        { id: 'pickup', name: 'Selbstabholung', requiresAddress: false },
        { id: 'standard_shipping', name: 'Standardversand (DE)', requiresAddress: true },
    ];
    const deliveryFromInquiry = deliveryMethods.find(d => d.id === production.deliveryMethodId) || { id: production.deliveryMethodId, name: '–', requiresAddress: false };
    const bookBlock = inquiry.bookBlock || {};
    const createdDate = order.created_at ? new Date(order.created_at) : null;
    const created = createdDate ? createdDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

    const prodCalc = priceDetails.productionAndDeliveryCalculations || {};
    const selectedProdTime = prodCalc.selectedProductionTime || null;
    const selectedDelMethod = prodCalc.selectedDeliveryMethod || deliveryFromInquiry;
    const isPickup = (selectedDelMethod?.id || production.deliveryMethodId) === 'pickup' || selectedDelMethod?.requiresAddress === false;

    const baseDate = createdDate || new Date();
    const prodDays = typeof selectedProdTime?.productionDays === 'number' ? selectedProdTime.productionDays : 0;
    const dueDateObj = new Date(baseDate.getTime() + Math.max(0, prodDays) * 24 * 60 * 60 * 1000);
    const dueDate = dueDateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dueLabel = isPickup ? 'Fertig bis (Abholung)' : 'Warenausgang (Versand)';

    let shopConfig = state.shopConfigData || null;
    if (!shopConfig) {
        try {
            shopConfig = await getShopConfig();
            state.shopConfigData = shopConfig;
        } catch (_) {
            shopConfig = null;
        }
    }
    const papersConf = shopConfig?.papers || [];
    const bindingsConf = shopConfig?.bindings || [];

    const paperConf = papersConf.find(pcfg => pcfg.id === bookBlock.paperId) || null;
    const paperName = paperConf?.name || (bookBlock.paperId || '–');
    let thicknessRaw = null;
    if (priceDetails.bookBlockCalculations?.thickness != null) {
        thicknessRaw = priceDetails.bookBlockCalculations.thickness;
    } else if (priceDetails.bookBlockThickness != null) {
        thicknessRaw = priceDetails.bookBlockThickness;
    }
    const thicknessMm = thicknessRaw != null && !isNaN(thicknessRaw)
        ? Number(thicknessRaw).toFixed(1)
        : '–';

    function describeBindingVariant(variant) {
        const lines = [];
        const bindingConf = bindingsConf.find(b => b.id === variant.bindingTypeId) || null;
        if (bindingConf) {
            lines.push(bindingConf.name || (variant.name || 'Variante'));
            if (bindingConf.options && variant.options) {
                bindingConf.options.forEach(opt => {
                    const selectedValue = variant.options[opt.optionKey];
                    if (selectedValue === undefined || selectedValue === null) return;
                    const label = opt.name || opt.groupName || opt.optionKey;
                    if (opt.type === 'radio') {
                        const choice = (opt.choices || []).find(c => c.id === selectedValue);
                        if (choice) lines.push(`${label}: ${choice.name}`);
                    } else if (opt.type === 'checkbox') {
                        if (selectedValue === true) lines.push(`${label}: JA`);
                    } else if (opt.type === 'gallery_select') {
                        lines.push(`${label}: Motiv gewählt`);
                    }
                });
            }
        } else {
            lines.push(variant.name || 'Variante');
        }
        const perso = personalizations[variant.id];
        const params = perso?.editorData?.parameters || {};
        if (params.templateDisplayName) {
            lines.push(`Cover-Template: ${params.templateDisplayName}`);
        }
        if (typeof params.selectedColorPairIndex === 'number') {
            lines.push(`Farbvariante: #${params.selectedColorPairIndex + 1}`);
        }
        return lines.join('\n');
    }

    const content = [];

    const customerName = customerData.customerName || customerData.name || order.customer_name || '–';

    content.push({ text: isPickup ? 'SELBSTABHOLUNG' : 'VERSANDAUFTRAG', style: 'orderType', margin: [0, 0, 0, 2] });
    content.push({ text: `${dueLabel}: ${dueDate}`, style: 'dueLine', margin: [0, 0, 0, 6] });
    content.push({
        columns: [
            { text: `Auftrag: ${order.order_number || '–'}`, style: 'headerMeta' },
            { text: `Kunde: ${customerName}`, style: 'headerMeta', alignment: 'right' }
        ],
        margin: [0, 0, 0, 10]
    });
    content.push({
        columns: [
            { text: `Erfasst am: ${created}`, style: 'headerMeta' },
            { text: `Status: ${order.status || '–'} · Verantwortliche/r: ${order.assignee || '–'}`, style: 'headerMeta', alignment: 'right' }
        ],
        margin: [0, 0, 0, 14]
    });

    content.push({ text: 'Kunde & Lieferung', style: 'sectionTitle', margin: [0, 0, 0, 4] });
    const custEmail = customerData.customerEmail || customerData.email || order.customer_email || '–';
    const custPhone = customerData.customerPhone || order.customer_phone || '–';
    content.push({ text: `Name: ${customerName}`, style: 'body' });
    content.push({ text: `E-Mail: ${custEmail}`, style: 'body' });
    content.push({ text: `Telefon: ${custPhone}`, style: 'body' });
    content.push({ text: `Lieferart: ${selectedDelMethod?.name || deliveryFromInquiry.name}`, style: 'body' });
    if (selectedDelMethod?.requiresAddress && (shippingData.shippingStreet || shippingData.shippingZip || shippingData.shippingCity)) {
        content.push({ text: `Adresse: ${[shippingData.shippingStreet, shippingData.shippingZip, shippingData.shippingCity].filter(Boolean).join(', ')}`, style: 'body', margin: [0, 0, 0, 8] });
    } else {
        content.push({ text: '', margin: [0, 0, 0, 8] });
    }

    const bb = bookBlock;
    const firstPageImg = bb.firstPagePreviewDataURL || bb.firstPagePreviewUrl;

    content.push({
        columns: [
            {
                width: 190,
                stack: [
                    { text: 'Buchblock & Vorschau', style: 'sectionTitle', margin: [0, 6, 0, 4] },
                    firstPageImg
                        ? { image: firstPageImg, fit: [180, 240], margin: [0, 0, 0, 4] }
                        : { text: 'Keine Vorschau verfügbar', style: 'body', margin: [0, 0, 0, 4] },
                    {
                        text: [
                            `Seiten A4: ${bb.totalPages || '–'}`,
                            `Druck: ${bb.printMode === 'double_sided' ? 'beidseitig' : 'einseitig'}`,
                            `Papier: ${paperName}`,
                            `A3-Seiten: ${bb.hasA3Pages ? (bb.a3PagesCount || 0) : 0}`,
                            `Blockdicke (ca.): ${thicknessMm} mm`
                        ].join('\n'),
                        style: 'bodySmall'
                    }
                ]
            },
            {
                width: '*',
                stack: [
                    { text: 'Bindung & Cover je Variante', style: 'sectionTitle', margin: [0, 6, 0, 4] },
                    {
                        table: {
                            headerRows: 1,
                            widths: [18, '*', '*', 55],
                            body: (function () {
                                const header = [
                                    { text: '#', style: 'tableHeader', alignment: 'center' },
                                    { text: 'Menge × Bindung', style: 'tableHeader' },
                                    { text: 'Details (Karton, Folie, Cover etc.)', style: 'tableHeader' },
                                    { text: 'Vorschau', style: 'tableHeader', alignment: 'center' }
                                ];
                                const rows = [header];
                                variants.forEach((v, i) => {
                                    const qty = v.quantity || 1;
                                    const bindingConf = bindingsConf.find(b => b.id === v.bindingTypeId) || null;
                                    const bindingName = bindingConf?.name || v.name || 'Variante';
                                    const thumb = personalizations[v.id]?.editorData?.thumbnailDataUrl;
                                    const thumbCell = thumb ? { image: thumb, width: 40, height: 53 } : { text: '–', fontSize: 9, alignment: 'center' };
                                    rows.push([
                                        { text: String(i + 1), alignment: 'center', fontSize: 9 },
                                        { text: `${qty} × ${bindingName}`, fontSize: 9 },
                                        { text: describeBindingVariant(v), fontSize: 9 },
                                        thumbCell
                                    ]);
                                });
                                return rows;
                            })()
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 0, 0, 8]
                    }
                ]
            }
        ],
        columnGap: 16,
        margin: [0, 4, 0, 10]
    });

    if (extras.length > 0) {
        content.push({ text: 'Extras & Verpackung', style: 'sectionTitle', margin: [0, 4, 0, 4] });
        const extraRows = [['Pos.', 'Beschreibung', 'Menge', 'Preis'].map(t => ({ text: t, bold: true }))];
        extras.forEach((e, i) => {
            extraRows.push([
                { text: 'E' + (i + 1) },
                { text: e.name || 'Extra' },
                { text: String(e.quantity || 1) },
                { text: (e.totalPrice != null ? Number(e.totalPrice).toFixed(2) + ' €' : '–') }
            ]);
        });
        content.push({
            table: { headerRows: 1, widths: [30, '*', 45, 55], body: extraRows },
            layout: 'lightHorizontalLines',
            margin: [0, 4, 0, 12]
        });
    }

    content.push({ text: 'Gesamtsumme', style: 'sectionTitle', margin: [0, 4, 0, 4] });
    content.push({ text: total.toFixed(2) + ' € (brutto)', fontSize: 12, bold: true, margin: [0, 0, 0, 8] });

    const notesForPdf = (order.notes != null && String(order.notes).trim()) ? String(order.notes).trim() : (p.customerData && p.customerData.customerNotes != null && String(p.customerData.customerNotes).trim()) ? String(p.customerData.customerNotes).trim() : '';
    if (notesForPdf) {
        content.push({ text: 'Notizen / Auftragshinweise', style: 'sectionTitle', margin: [0, 4, 0, 4] });
        content.push({ text: notesForPdf, style: 'body', margin: [0, 0, 0, 6] });
    }

    const docDef = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content,
        styles: {
            orderType: { fontSize: 18, bold: true, color: '#1A3A5C' },
            dueLine: { fontSize: 12, bold: true, color: '#1A3A5C' },
            headerMeta: { fontSize: 9, color: '#555555' },
            sectionTitle: { fontSize: 11, bold: true, color: '#1A3A5C' },
            sectionTitleSmall: { fontSize: 10, bold: true, color: '#1A3A5C' },
            subSectionTitle: { fontSize: 10, bold: true, color: '#333333' },
            body: { fontSize: 10 },
            bodySmall: { fontSize: 9, color: '#333333' },
            tableHeader: { fontSize: 9, bold: true }
        },
        defaultStyle: { fontSize: 10 }
    };
    const fileName = `Auftragszettel_${(order.order_number || order.id || 'Auftrag').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    pdfMake.createPdf(docDef).download(fileName);
}

function bindDetailActions(content, data) {
    const order = data.order || {};
    const orderId = order.id;
    content.querySelector('#btnPaymentToggle')?.addEventListener('click', async () => {
        const isPaid = order.status === 'Bezahlt';
        const msg = isPaid ? 'Zahlung noch offen? Ja / Nein' : 'Zahlung eingegangen? Ja / Nein';
        const ja = confirm(msg + '\n\nKlicken Sie OK für Ja, Abbrechen für Nein.');
        if (ja === false) return;
        const newStatus = isPaid ? 'Wartet auf Zahlung' : 'Bezahlt';
        try {
            await updateOrder(orderId, { status: newStatus });
            if (state.currentDetail?.order) state.currentDetail.order.status = newStatus;
            const statusSelect = content.querySelector('#detailStatus');
            if (statusSelect) {
                if (!statusSelect.querySelector('option[value="' + newStatus + '"]')) {
                    const opt = document.createElement('option');
                    opt.value = newStatus;
                    opt.textContent = newStatus;
                    statusSelect.appendChild(opt);
                }
                statusSelect.value = newStatus;
            }
            const btn = content.querySelector('#btnPaymentToggle');
            if (btn) {
                btn.textContent = newStatus === 'Bezahlt' ? 'BEZAHLT' : 'ZAHLUNG OFFEN';
                btn.className = newStatus === 'Bezahlt' ? 'btn-payment-paid' : 'btn-payment-open';
            }
            const headBadge = content.querySelector('.detail-sticky-head .status-badge');
            if (headBadge) { headBadge.textContent = newStatus; headBadge.setAttribute('data-status', newStatus); }
            refreshList();
        } catch (e) {
            alert(e.message);
        }
    });
    content.querySelector('#btnOrderSheet')?.addEventListener('click', async () => {
        if (state.currentDetail) await generateOrderSheetPdf(state.currentDetail);
    });
    content.querySelector('#btnOpenLocalFolder')?.addEventListener('click', async () => {
        if (!state.config.agentUrl) return;
        const orderNumber = order.order_number || content.querySelector('#btnSyncToNas')?.getAttribute('data-order-number') || '';
        if (!orderNumber) return;
        try {
            const h = { 'Content-Type': 'application/json' };
            if (state.config.agentApiKey) h['X-Agent-Key'] = state.config.agentApiKey;
            const res = await fetch(state.config.agentUrl + '/open-folder', { method: 'POST', headers: h, body: JSON.stringify({ orderNumber }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) alert(data.error || 'FileAgent nicht erreichbar. Läuft der Agent auf diesem Rechner?');
        } catch (e) {
            alert('FileAgent nicht erreichbar: ' + e.message);
        }
    });
    content.querySelector('#btnSyncToNas')?.addEventListener('click', async () => {
        if (!state.config.agentUrl) return;
        const orderId = order.id || content.querySelector('#btnSyncToNas')?.getAttribute('data-order-id') || '';
        const orderNumber = order.order_number || content.querySelector('#btnSyncToNas')?.getAttribute('data-order-number') || '';
        try {
            const h = { 'Content-Type': 'application/json' };
            if (state.config.agentApiKey) h['X-Agent-Key'] = state.config.agentApiKey;
            const body = orderId ? { orderId } : { orderNumber };
            const res = await fetch(state.config.agentUrl + '/sync-order', { method: 'POST', headers: h, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { alert(data.error || 'Sync fehlgeschlagen.'); return; }
            const detailData = await getOrderDetail(orderId);
            if (detailData && detailData.order) {
                if (!detailData.order.local_synced_at && (data.syncedAt || data.path)) {
                    detailData.order.local_synced_at = data.syncedAt || new Date().toISOString();
                }
            }
            state.currentDetail = detailData;
            document.getElementById('detailContent').innerHTML = renderDetail(detailData);
            bindDetailActions(document.getElementById('detailContent'), detailData);
            alert('Dateien wurden auf der NAS gespeichert.' + (data.path ? '\nOrdner: ' + data.path : ''));
        } catch (e) {
            alert('FileAgent nicht erreichbar: ' + e.message);
        }
    });
    content.querySelectorAll('.btn-copy-email').forEach(btn => {
        btn.addEventListener('click', async () => {
            const email = btn.getAttribute('data-email') || '';
            if (!email) return;
            try {
                await navigator.clipboard.writeText(email);
                const oldText = btn.textContent;
                btn.textContent = 'E-Mail kopiert';
                setTimeout(() => { btn.textContent = oldText; }, 1500);
            } catch (_) {
                alert('Kopieren fehlgeschlagen. Bitte E-Mail manuell übernehmen.');
            }
        });
    });
    content.querySelector('#btnDetailSave')?.addEventListener('click', async () => {
        const statusEl = content.querySelector('#detailStatus');
        if (!statusEl) return;
        const status = statusEl.value;
        const assigneeRaw = content.querySelector('#detailAssignee')?.value || '';
        const assignee = assigneeRaw.trim() || null;
        const notes = content.querySelector('#detailNotes')?.value ?? null;
        if (status !== 'Eingegangen' && !assignee) {
            alert('Bitte weisen Sie eine Auftragsverantwortung zu, bevor Sie den Status von "Eingegangen" ändern.');
            content.querySelector('#detailAssignee')?.focus();
            return;
        }
        try {
            await updateOrder(orderId, { status, assignee, notes });
            if (state.currentDetail?.order) state.currentDetail.order = { ...state.currentDetail.order, status, assignee, notes };
            const headBadge = content.querySelector('.detail-sticky-head .status-badge');
            if (headBadge) { headBadge.textContent = status; headBadge.setAttribute('data-status', status); }
            const saveBtn = content.querySelector('#btnDetailSave');
            if (saveBtn) { const t = saveBtn.textContent; saveBtn.textContent = 'Gespeichert'; setTimeout(() => { saveBtn.textContent = t; }, 1500); }
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + e.message);
        }
    });
    content.querySelector('#btnDetailClose')?.addEventListener('click', () => closeDetailAndSave());
    content.querySelector('#btnSendReceivedEmail')?.addEventListener('click', async () => {
        const btn = content.querySelector('#btnSendReceivedEmail');
        if (btn) btn.disabled = true;
        try {
            await sendOrderEmail(orderId, 'received');
            const data = await getOrderDetail(orderId);
            state.currentDetail = data;
            document.getElementById('detailContent').innerHTML = renderDetail(data);
            bindDetailActions(document.getElementById('detailContent'), data);
        } catch (e) {
            alert('E-Mail-Versand fehlgeschlagen: ' + e.message);
            if (btn) btn.disabled = false;
        }
    });
}

export {
    closeDetailAndSave, openDetail, renderDetail, bindDetailActions, generateOrderSheetPdf,
    showSettingsView
};
