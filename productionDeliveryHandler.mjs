// productionDeliveryHandler.mjs
// Manages the Production Time and Delivery Options section

let CALC_CONFIG_REF;
let onUpdateCallback;

// State for this handler
let productionDeliveryState = {
    productionTimeId: null,
    deliveryMethodId: null,
};

// DOM Elements
let productionTimeOptionsContainer_DOM;
let deliveryMethodOptionsContainer_DOM;

function renderOptions() {
    if (!CALC_CONFIG_REF || !CALC_CONFIG_REF.productionAndDelivery) return;

    const { productionTimes, deliveryMethods } = CALC_CONFIG_REF.productionAndDelivery;

    // Render Production Times
    if (productionTimeOptionsContainer_DOM && productionTimes) {
        let html = '';
        productionTimes.forEach(pt => {
            const isChecked = pt.id === productionDeliveryState.productionTimeId;
            html += `<div><label><input type="radio" name="productionTime" value="${pt.id}" ${isChecked ? 'checked' : ''}> ${pt.name} (+${pt.price.toFixed(2)} ${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
        });
        productionTimeOptionsContainer_DOM.innerHTML = `<legend>Produktionszeit</legend>${html}<p class="info-text">Wählen Sie die gewünschte Bearbeitungsgeschwindigkeit.</p>`;
        
        productionTimeOptionsContainer_DOM.querySelectorAll('input[name="productionTime"]').forEach(radio => {
            radio.addEventListener('change', handleSelectionChange);
        });
    }

    // Render Delivery Methods
    if (deliveryMethodOptionsContainer_DOM && deliveryMethods) {
        let html = '';
        deliveryMethods.forEach(dm => {
            const isChecked = dm.id === productionDeliveryState.deliveryMethodId;
            html += `<div><label><input type="radio" name="deliveryMethod" value="${dm.id}" ${isChecked ? 'checked' : ''}> ${dm.name} (+${dm.price.toFixed(2)} ${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
        });
        deliveryMethodOptionsContainer_DOM.innerHTML = `<legend>Lieferart</legend>${html}<p class="info-text">Wählen Sie die gewünschte Lieferart.</p>`;

        deliveryMethodOptionsContainer_DOM.querySelectorAll('input[name="deliveryMethod"]').forEach(radio => {
            radio.addEventListener('change', handleSelectionChange);
        });
    }
}

function handleSelectionChange(event) {
    const { name, value } = event.target;
    if (name === 'productionTime') {
        productionDeliveryState.productionTimeId = value;
    } else if (name === 'deliveryMethod') {
        productionDeliveryState.deliveryMethodId = value;
    }

    if (onUpdateCallback) {
        onUpdateCallback();
    }
}

export function initProductionDeliveryHandler(calcConfig, updateCb) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;

    productionTimeOptionsContainer_DOM = document.getElementById('productionTimeOptionsContainer');
    deliveryMethodOptionsContainer_DOM = document.getElementById('deliveryMethodOptionsContainer');

    // Set initial default state from CALC_CONFIG
    if (CALC_CONFIG_REF.productionAndDelivery) {
        const defaultProdTime = CALC_CONFIG_REF.productionAndDelivery.productionTimes.find(pt => pt.default);
        productionDeliveryState.productionTimeId = defaultProdTime ? defaultProdTime.id : (CALC_CONFIG_REF.productionAndDelivery.productionTimes[0]?.id || null);

        const defaultDelMethod = CALC_CONFIG_REF.productionAndDelivery.deliveryMethods.find(dm => dm.default);
        productionDeliveryState.deliveryMethodId = defaultDelMethod ? defaultDelMethod.id : (CALC_CONFIG_REF.productionAndDelivery.deliveryMethods[0]?.id || null);
    }

    renderOptions();
    // Initial onUpdateCallback call not strictly necessary if script.js calls updateApp after all inits
}

export function getProductionDeliveryState() {
    return { ...productionDeliveryState };
}

export function updateProductionDeliveryUI() {
    // This handler's UI is mostly static once rendered, based on radio selections.
    // Re-rendering can ensure checked states are correct if state is ever set externally,
    // but typically selection changes handle this.
    // For now, we can just ensure the radio buttons reflect the current state.
    if (productionTimeOptionsContainer_DOM) {
        const selectedProdRadio = productionTimeOptionsContainer_DOM.querySelector(`input[name="productionTime"][value="${productionDeliveryState.productionTimeId}"]`);
        if (selectedProdRadio && !selectedProdRadio.checked) selectedProdRadio.checked = true;
    }
    if (deliveryMethodOptionsContainer_DOM) {
        const selectedDelRadio = deliveryMethodOptionsContainer_DOM.querySelector(`input[name="deliveryMethod"][value="${productionDeliveryState.deliveryMethodId}"]`);
        if (selectedDelRadio && !selectedDelRadio.checked) selectedDelRadio.checked = true;
    }
}