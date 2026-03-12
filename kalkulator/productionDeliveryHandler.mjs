// productionDeliveryHandler.mjs
// Manages the production time and delivery method options. By Lucy.

import { escapeHtml, escapeAttr } from './uiUtils.mjs';

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG_REF;
let onUpdateCallback;
let inquiryStateRef;

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    productionTimeContainer: document.getElementById('productionTimeOptionsContainer'),
    deliveryMethodContainer: document.getElementById('deliveryMethodOptionsContainer'),
};

/** Icon für Produktionszeit-Option (id-basiert). */
function getProductionTimeIcon(id) {
    if (!id) return 'clock';
    const lower = String(id).toLowerCase();
    if (lower.includes('express')) return 'zap';
    return 'clock';
}
/** Icon für Lieferart-Option (id-basiert). */
function getDeliveryMethodIcon(id) {
    if (!id) return 'truck';
    const lower = String(id).toLowerCase();
    if (lower.includes('pickup') || lower.includes('abholung')) return 'store';
    return 'truck';
}

/**
 * Renders the production time and delivery options based on the config.
 */
function renderOptions() {
    if (!CALC_CONFIG_REF || !inquiryStateRef) return;
    const production = inquiryStateRef.production || {};

    // Render Production Time Options
    const prodTimes = CALC_CONFIG_REF.productionAndDelivery.productionTimes || [];
    let prodTimeHTML = `<legend>Produktionszeit</legend>`;
    prodTimes.forEach(option => {
        const isChecked = production.productionTimeId === option.id;
        const icon = getProductionTimeIcon(option.id);
        prodTimeHTML += `
            <div>
                <label>
                    <input type="radio" name="productionTime" value="${escapeAttr(option.id)}" ${isChecked ? 'checked' : ''}>
                    <i data-lucide="${escapeAttr(icon)}"></i>
                    ${escapeHtml(option.name)} (+${(option.price ?? 0).toFixed(2)}\u00A0${CALC_CONFIG_REF.general.currencySymbol})
                </label>
            </div>
        `;
    });
    DOM.productionTimeContainer.innerHTML = prodTimeHTML;

    // Render Delivery Method Options
    const deliveryMethods = CALC_CONFIG_REF.productionAndDelivery.deliveryMethods || [];
    let deliveryMethodHTML = `<legend>Lieferart</legend>`;
    deliveryMethods.forEach(option => {
        const isChecked = production.deliveryMethodId === option.id;
        const icon = getDeliveryMethodIcon(option.id);
        deliveryMethodHTML += `
            <div>
                <label>
                    <input type="radio" name="deliveryMethod" value="${escapeAttr(option.id)}" ${isChecked ? 'checked' : ''}>
                    <i data-lucide="${escapeAttr(icon)}"></i>
                    ${escapeHtml(option.name)} (+${(option.price ?? 0).toFixed(2)}\u00A0${CALC_CONFIG_REF.general.currencySymbol})
                </label>
            </div>
        `;
    });
    DOM.deliveryMethodContainer.innerHTML = deliveryMethodHTML;

    if (typeof window !== 'undefined' && window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

/**
 * Handles changes to the radio button selections.
 * @param {Event} event - The input change event.
 */
function handleSelectionChange(event) {
    const { name, value } = event.target;
    if (name === 'productionTime') {
        inquiryStateRef.production.productionTimeId = value;
    } else if (name === 'deliveryMethod') {
        inquiryStateRef.production.deliveryMethodId = value;
    }
    
    // Trigger a full application update
    if (onUpdateCallback) {
        onUpdateCallback();
    }
}

/**
 * Initializes the production and delivery handler.
 * @param {object} calcConfig - The main calculator configuration.
 * @param {function} updateCb - The main application update callback.
 * @param {object} globalInquiryStateRef - A reference to the global state.
 */
export function initProductionDeliveryHandler(calcConfig, updateCb, globalInquiryStateRef) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;
    inquiryStateRef = globalInquiryStateRef;

    // Render the options once on initialization
    renderOptions();

    // Add event listeners to the containers
    DOM.productionTimeContainer.addEventListener('change', handleSelectionChange);
    DOM.deliveryMethodContainer.addEventListener('change', handleSelectionChange);

}

/**
 * Re-renders production and delivery options (e.g. after Lieferzeiten-Modal "Übernehmen").
 * Call from updateApp so the radio selection stays in sync with inquiryState.
 */
export function refreshProductionDeliveryUI() {
    if (CALC_CONFIG_REF && inquiryStateRef) renderOptions();
}
