// productionDeliveryHandler.mjs
// Manages the production time and delivery method options. By Lucy.

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG_REF;
let onUpdateCallback;
let inquiryStateRef;

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    productionTimeContainer: document.getElementById('productionTimeOptionsContainer'),
    deliveryMethodContainer: document.getElementById('deliveryMethodOptionsContainer'),
};

/**
 * Renders the production time and delivery options based on the config.
 */
function renderOptions() {
    if (!CALC_CONFIG_REF) return;

    // Render Production Time Options
    const prodTimes = CALC_CONFIG_REF.productionAndDelivery.productionTimes;
    let prodTimeHTML = `<legend>Produktionszeit</legend>`;
    prodTimes.forEach(option => {
        const isChecked = inquiryStateRef.production.productionTimeId === option.id;
        prodTimeHTML += `
            <div>
                <label>
                    <input type="radio" name="productionTime" value="${option.id}" ${isChecked ? 'checked' : ''}>
                    ${option.name} (+${option.price.toFixed(2)} ${CALC_CONFIG_REF.general.currencySymbol})
                </label>
            </div>
        `;
    });
    DOM.productionTimeContainer.innerHTML = prodTimeHTML;

    // Render Delivery Method Options
    const deliveryMethods = CALC_CONFIG_REF.productionAndDelivery.deliveryMethods;
    let deliveryMethodHTML = `<legend>Lieferart</legend>`;
    deliveryMethods.forEach(option => {
        const isChecked = inquiryStateRef.production.deliveryMethodId === option.id;
        deliveryMethodHTML += `
            <div>
                <label>
                    <input type="radio" name="deliveryMethod" value="${option.id}" ${isChecked ? 'checked' : ''}>
                    ${option.name} (+${option.price.toFixed(2)} ${CALC_CONFIG_REF.general.currencySymbol})
                </label>
            </div>
        `;
    });
    DOM.deliveryMethodContainer.innerHTML = deliveryMethodHTML;
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

    console.log("Production & Delivery Handler Initialized.");
}
