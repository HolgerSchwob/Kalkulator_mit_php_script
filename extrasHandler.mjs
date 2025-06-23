// extrasHandler.mjs
// Manages additional products/extras. V2.2 by Lucy.
// V2.2: Restored full UI rendering logic to match original functionality.

import { toggleAccordionItemExpansion } from './uiUtils.mjs';

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG_REF;
let onUpdateCallback;
let inquiryStateRef;

// Local state for this module
let configuredExtras = [];
let nextExtraInstanceId = 1;

// DOM Elements
let extrasContainer_DOM, addExtraButton_DOM;

/**
 * Initializes the extras handler. Is passive and does not trigger updates.
 * @param {object} calcConfig - The calculator's configuration.
 * @param {function} updateCb - The main updateApp function to call on changes.
 * @param {object} globalInquiryStateRef - A reference to the global state object.
 */
export function initExtrasHandler(calcConfig, updateCb, globalInquiryStateRef) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;
    inquiryStateRef = globalInquiryStateRef;

    extrasContainer_DOM = document.getElementById('extrasContainer');
    addExtraButton_DOM = document.getElementById('addExtraButton');

    if (addExtraButton_DOM) {
        addExtraButton_DOM.addEventListener('click', addNewExtra);
    }
    
    configuredExtras = inquiryStateRef.extras || [];
}

/**
 * Returns the current local state of extras.
 * @returns {Array} The array of configured extras.
 */
export function getConfiguredExtras() {
    inquiryStateRef.extras = configuredExtras;
    return configuredExtras;
}

/**
 * Creates a new extra object with default values.
 * @returns {object} The new extra object.
 */
function createNewExtraObject() {
    const defaultConfig = CALC_CONFIG_REF.extras[0];
    const newExtra = {
        instanceId: `extra_instance_${nextExtraInstanceId++}`,
        extraId: defaultConfig.id,
        selectedOptions: {},
        quantity: defaultConfig.hasIndependentQuantity ? (defaultConfig.defaultQuantity || 1) : 1,
        isExpanded: true,
    };

    if (defaultConfig.options) {
        defaultConfig.options.forEach(optGroup => {
            const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
            if (defaultChoice) newExtra.selectedOptions[optGroup.optionKey] = defaultChoice.id;
        });
    }
    return newExtra;
}

/**
 * Adds a new extra to the configuration and triggers an update.
 */
function addNewExtra() {
    const newExtra = createNewExtraObject();
    configuredExtras.forEach(ex => ex.isExpanded = false);
    configuredExtras.push(newExtra);
    
    if (onUpdateCallback) onUpdateCallback();
}

/**
 * Removes an extra from the configuration.
 * @param {string} instanceIdToRemove - The unique ID of the extra instance to remove.
 */
function removeExtra(instanceIdToRemove) {
    configuredExtras = configuredExtras.filter(ex => ex.instanceId !== instanceIdToRemove);
    if (!configuredExtras.some(ex => ex.isExpanded) && configuredExtras.length > 0) {
        configuredExtras[configuredExtras.length - 1].isExpanded = true;
    }
    if (onUpdateCallback) onUpdateCallback();
}

/**
 * Handles changes from input fields within an extra's accordion body.
 * @param {string} instanceId - The ID of the extra being changed.
 * @param {string} field - The name of the field being changed.
 * @param {*} value - The new value of the field.
 */
function handleExtraInputChange(instanceId, field, value) {
    const extra = configuredExtras.find(ex => ex.instanceId === instanceId);
    if (!extra) return;

    if (field === 'quantity') {
        extra.quantity = Math.max(1, parseInt(value, 10) || 1);
    } else { // Assumes an option key
        extra.selectedOptions[field] = value;
    }
    
    if (onUpdateCallback) onUpdateCallback();
}

/**
 * Toggles the expanded state of an extra.
 * @param {string} instanceIdToToggle The extra to toggle.
 */
function toggleExtraExpansion(instanceIdToToggle) {
    configuredExtras.forEach(ex => {
        ex.isExpanded = (ex.instanceId === instanceIdToToggle) ? !ex.isExpanded : false;
    });
    if (onUpdateCallback) onUpdateCallback();
}

/**
 * Renders the UI for all configured extras.
 * @param {Array} extrasWithPrices - The extra data including calculated prices.
 */
export function updateExtrasUI(extrasWithPrices) {
    if (!extrasContainer_DOM) return;
    extrasContainer_DOM.innerHTML = '';
    
    configuredExtras = extrasWithPrices; 

    extrasWithPrices.forEach((extra, index) => {
        const extraConfig = CALC_CONFIG_REF.extras.find(e => e.id === extra.extraId);
        if (!extraConfig) return;

        const itemEl = document.createElement('div');
        itemEl.className = 'accordion-item extra-item';

        const header = document.createElement('div');
        header.className = `accordion-header extra-header ${extra.isExpanded ? 'expanded' : ''}`;
        const quantityText = extraConfig.hasIndependentQuantity ? `(Menge: ${extra.quantity})` : '';
        header.innerHTML = `
            <div>
                <h4>${extraConfig.name} ${quantityText}</h4>
                <div class="accordion-header-summary">
                    Gesamt: ${extra.totalPrice.toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol}
                </div>
            </div>
            <div class="accordion-controls">
                 <button class="button-secondary edit-item-btn" style="display:${extra.isExpanded ? 'none' : 'inline-block'};">Bearbeiten</button>
                 <button class="button-danger remove-item-btn">Löschen</button>
            </div>`;
        
        header.querySelector('.edit-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleExtraExpansion(extra.instanceId);
        });
        header.querySelector('.remove-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            removeExtra(extra.instanceId);
        });
        header.addEventListener('click', e => {
            if (!e.target.closest('button')) {
                toggleExtraExpansion(extra.instanceId);
            }
        });
        itemEl.appendChild(header);

        if (extra.isExpanded) {
            const body = document.createElement('div');
            body.className = 'accordion-body extra-body';
            
            let formHTML = '';
            if (extraConfig.options && extraConfig.options.length > 0) {
                 extraConfig.options.forEach(optGroup => {
                    formHTML += `<fieldset class="extra-options-group"><legend>${optGroup.groupName}</legend>`;
                    optGroup.choices.forEach(choice => {
                        const isChecked = extra.selectedOptions[optGroup.optionKey] === choice.id;
                        formHTML += `<div><label>
                            <input type="radio" name="extra_option_${optGroup.optionKey}_${extra.instanceId}" 
                                   data-option-key="${optGroup.optionKey}" 
                                   value="${choice.id}" ${isChecked ? 'checked' : ''}> 
                            ${choice.name} (+${(choice.price || 0).toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol})
                        </label></div>`;
                    });
                    formHTML += `</fieldset>`;
                });
            }

            if (extraConfig.hasIndependentQuantity) {
                formHTML += `<div>
                                <label for="extra_quantity_${extra.instanceId}">Anzahl:</label>
                                <input type="number" id="extra_quantity_${extra.instanceId}" min="1" value="${extra.quantity}">
                             </div>`;
            }
            body.innerHTML = formHTML;

            body.querySelectorAll('input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', e => {
                    if (e.target.checked) {
                        handleExtraInputChange(extra.instanceId, e.target.dataset.optionKey, e.target.value);
                    }
                });
            });

            if (extraConfig.hasIndependentQuantity) {
                body.querySelector(`#extra_quantity_${extra.instanceId}`).addEventListener('input', e => {
                    handleExtraInputChange(extra.instanceId, 'quantity', e.target.value);
                });
            }
            itemEl.appendChild(body);
        }
        extrasContainer_DOM.appendChild(itemEl);
    });

    updateAddExtraButtonState();
}

/**
 * Updates the state of the "Add Extra" button.
 */
function updateAddExtraButtonState() {
    if (!addExtraButton_DOM) return;
    addExtraButton_DOM.disabled = false;
    addExtraButton_DOM.textContent = "+ Extra hinzufügen";
}
