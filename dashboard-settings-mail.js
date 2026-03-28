/**
 * Einstellungen: E-Mail-Templates (Liste, Bearbeiten, Platzhalter).
 */
import { state } from './dashboard-state.js';
import { escapeHtml } from './dashboard-utils.js';

export function GetEmailDetails() {
    const placeholders = [
        '{{order_number}} – Auftragsnummer',
        '{{customer_name}} – Kundenname',
        '{{customer_email}} – E-Mail des Kunden',
        '{{status}} – aktueller Auftragsstatus',
        '{{review_url}} – Link zur Bewertungsseite (Secret REVIEW_PAGE_URL in Supabase)',
    ];
    alert('Verfügbare Platzhalter in E-Mail-Templates:\n\n' + placeholders.join('\n'));
}

export function renderTemplatesList(templates) {
    const listEl = document.getElementById('settingsTemplatesList');
    const formEl = document.getElementById('settingsTemplateForm');
    const formContainer = document.getElementById('settingsTemplateFormContainer');
    if (!listEl || !formEl || !formContainer) return;
    if (listEl.contains(formEl)) formContainer.appendChild(formEl);
    listEl.innerHTML = '';
    const list = Array.isArray(templates) ? templates : [];
    list.forEach(t => {
        const item = document.createElement('div');
        item.className = 'template-item';
        item.setAttribute('data-template-key', t.template_key || '');
        const row = document.createElement('div');
        row.className = 'template-row';
        const activeClass = t.active ? 'template-active' : 'template-inactive';
        const activeText = t.active ? 'Aktiv' : 'Inaktiv';
        row.innerHTML = '<span class="template-name">' + escapeHtml(t.name || t.template_key) + '</span><span class="' + activeClass + '">' + activeText + '</span>';
        row.addEventListener('click', () => openTemplateEdit(t));
        item.appendChild(row);
        listEl.appendChild(item);
    });
}

export function openTemplateEdit(template) {
    if (!template || typeof template !== 'object') return;
    state.currentEditingTemplate = template;
    const keyEl = document.getElementById('settingsTemplateKey');
    const activeEl = document.getElementById('settingsTemplateActive');
    const subjectEl = document.getElementById('settingsSubject');
    const bodyPlainEl = document.getElementById('settingsBodyPlain');
    const bodyHtmlEl = document.getElementById('settingsBodyHtml');
    const titleEl = document.getElementById('settingsTemplateFormTitle');
    if (!keyEl || !activeEl || !subjectEl || !bodyPlainEl || !bodyHtmlEl || !titleEl) return;
    keyEl.value = template.template_key || '';
    activeEl.checked = !!template.active;
    subjectEl.value = template.subject_template || '';
    bodyPlainEl.value = template.body_plain || '';
    bodyHtmlEl.value = template.body_html || '';
    titleEl.textContent = 'Template: ' + (template.name || template.template_key);
    const formEl = document.getElementById('settingsTemplateForm');
    const listEl = document.getElementById('settingsTemplatesList');
    const formContainer = document.getElementById('settingsTemplateFormContainer');
    if (!formEl || !listEl || !formContainer) return;
    const key = template.template_key || '';
    const items = listEl.querySelectorAll('.template-item');
    let targetItem = null;
    items.forEach(function(el) { if (el.getAttribute('data-template-key') === key) targetItem = el; });
    listEl.querySelectorAll('.template-item-expanded').forEach(function(el) { el.classList.remove('template-item-expanded'); });
    if (targetItem) {
        targetItem.classList.add('template-item-expanded');
        if (formEl.parentNode) formEl.parentNode.removeChild(formEl);
        targetItem.appendChild(formEl);
        formEl.classList.remove('hidden');
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        formContainer.appendChild(formEl);
        formEl.classList.remove('hidden');
    }
}

export function closeTemplateForm() {
    state.currentEditingTemplate = null;
    const formEl = document.getElementById('settingsTemplateForm');
    const formContainer = document.getElementById('settingsTemplateFormContainer');
    const listEl = document.getElementById('settingsTemplatesList');
    if (formEl) {
        formEl.classList.add('hidden');
        if (formContainer && formEl.parentElement !== formContainer) formContainer.appendChild(formEl);
    }
    if (listEl) listEl.querySelectorAll('.template-item-expanded').forEach(function(el) { el.classList.remove('template-item-expanded'); });
}
