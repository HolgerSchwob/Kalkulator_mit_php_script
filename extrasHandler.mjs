// extrasHandler.mjs
// V5.4: UI aligned with variantHandler by removing the top-level select dropdown.

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG;
let onUpdateCallback;
let inquiryStateRef;
let addExtraButton;

// DOM Elements
const extrasContainer = document.getElementById('extrasContainer');

/**
 * Creates a new extra object based on the selected ID from the config.
 * @param {string} extraId - The ID of the extra to create (e.g., 'cd_packaging_service').
 * @returns {object | null} The new extra object, or null if the extraId is not found.
 */
function createNewExtraObject(extraId) {
    const defaultConfig = CALC_CONFIG.extras.find(e => e.id === extraId);
    if (!defaultConfig) return null;

    const newExtra = {
        instanceId: `extra_instance_${self.crypto.randomUUID()}`,
        extraId: defaultConfig.id,
        selectedOptions: {},
        quantity: defaultConfig.hasIndependentQuantity ? (defaultConfig.defaultQuantity || 1) : 1,
        isExpanded: true, // New extras are expanded by default.
    };

    // Pre-select default options for the new extra.
    if (defaultConfig.options) {
        defaultConfig.options.forEach(optGroup => {
            if (optGroup.choices && Array.isArray(optGroup.choices)) {
                const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                if (defaultChoice) {
                    newExtra.selectedOptions[optGroup.optionKey] = defaultChoice.id;
                }
            }
        });
    }
    return newExtra;
}

/**
 * Adds a new default extra to the configuration and triggers a global update.
 */
function addNewExtra() {
    // Take the first extra from the config as the default one to add.
    const defaultExtraId = CALC_CONFIG.extras[0]?.id;
    if (!defaultExtraId) {
        console.error("Keine Extras in der Konfiguration gefunden.");
        return;
    }

    const newExtra = createNewExtraObject(defaultExtraId);
    if (!newExtra) {
        console.error("Standard-Extra konnte nicht erstellt werden.");
        return;
    }
    // Collapse all other extras before adding the new one.
    inquiryStateRef.extras.forEach(ex => ex.isExpanded = false);
    inquiryStateRef.extras.push(newExtra);
    
    onUpdateCallback();
}

/**
 * Removes an extra from the configuration.
 * @param {string} instanceIdToRemove - The unique ID of the extra instance to remove.
 */
function removeExtra(instanceIdToRemove) {
    inquiryStateRef.extras = inquiryStateRef.extras.filter(ex => ex.instanceId !== instanceIdToRemove);
    if (!inquiryStateRef.extras.some(ex => ex.isExpanded) && inquiryStateRef.extras.length > 0) {
        inquiryStateRef.extras[inquiryStateRef.extras.length - 1].isExpanded = true;
    }
    onUpdateCallback();
}

/**
 * Changes the type of an existing extra.
 * @param {string} instanceId - The instanceId of the extra to change.
 * @param {string} newExtraId - The ID of the new extra type.
 */
function handleExtraTypeChange(instanceId, newExtraId) {
    const extraIndex = inquiryStateRef.extras.findIndex(ex => ex.instanceId === instanceId);
    if (extraIndex === -1) return;

    const newExtraConfig = CALC_CONFIG.extras.find(e => e.id === newExtraId);
    if (!newExtraConfig) return;
    
    const wasExpanded = inquiryStateRef.extras[extraIndex].isExpanded;

    const changedExtra = createNewExtraObject(newExtraId);
    changedExtra.instanceId = instanceId;
    changedExtra.isExpanded = wasExpanded;
    
    inquiryStateRef.extras[extraIndex] = changedExtra;

    onUpdateCallback();
}

/**
 * Handles changes from input fields within an extra's accordion body.
 * @param {string} instanceId - The ID of the extra being changed.
 * @param {string} field - The name of the field being changed (e.g., 'quantity' or an optionKey).
 * @param {*} value - The new value of the field.
 */
function handleExtraInputChange(instanceId, field, value) {
    const extra = inquiryStateRef.extras.find(ex => ex.instanceId === instanceId);
    if (!extra) return;

    if (field === 'quantity') {
        extra.quantity = Math.max(1, parseInt(value, 10) || 1);
    } else { // Assumes it's an option key
        extra.selectedOptions[field] = value;
    }
    
    onUpdateCallback();
}

/**
 * Toggles the expanded state of an extra and collapses others.
 * @param {string} instanceIdToToggle The extra to toggle.
 */
function toggleExtraExpansion(instanceIdToToggle) {
    const extraToToggle = inquiryStateRef.extras.find(ex => ex.instanceId === instanceIdToToggle);
    if (!extraToToggle) return;

    const wasExpanded = extraToToggle.isExpanded;
    
    inquiryStateRef.extras.forEach(ex => ex.isExpanded = false);
    
    if (!wasExpanded) {
        extraToToggle.isExpanded = true;
    }
    onUpdateCallback();
}

// --- PUBLIC API ---

/**
 * Renders the UI for all configured extras based on the current state.
 * @param {Array} extrasWithPrices - The extra data including calculated prices from the main app.
 */
export function updateExtrasUI(extrasWithPrices) {
    if (!extrasContainer) return;
    extrasContainer.innerHTML = '';
    
    inquiryStateRef.extras.forEach((extra) => {
        const extraPriceInfo = extrasWithPrices.find(p => p.instanceId === extra.instanceId) || { totalPrice: 0 };
        const extraConfig = CALC_CONFIG.extras.find(e => e.id === extra.extraId);
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
                    Gesamt: ${extraPriceInfo.totalPrice.toFixed(2)}${CALC_CONFIG.general.currencySymbol}
                </div>
            </div>
            <div class="accordion-controls">
                 <button class="button-secondary edit-item-btn" style="display:${extra.isExpanded ? 'none' : 'inline-block'};">Bearbeiten</button>
                 <button class="button-danger remove-item-btn">Löschen</button>
            </div>`;
        
        header.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            toggleExtraExpansion(extra.instanceId);
        });

        header.querySelector('.edit-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleExtraExpansion(extra.instanceId);
        });
        
        header.querySelector('.remove-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            removeExtra(extra.instanceId);
        });
        
        itemEl.appendChild(header);

        if (extra.isExpanded) {
            const body = document.createElement('div');
            body.className = 'accordion-body extra-body';
            
            let selectTypeHtml = `<div><label>Extra-Art:</label><select class="extra-type-select" data-instance-id="${extra.instanceId}">`;
            CALC_CONFIG.extras.forEach(opt => {
                selectTypeHtml += `<option value="${opt.id}" ${opt.id === extra.extraId ? 'selected' : ''}>${opt.name}</option>`;
            });
            selectTypeHtml += '</select></div>';

            let optionsHTML = '';
            if (extraConfig.options && extraConfig.options.length > 0) {
                 extraConfig.options.forEach(optGroup => {
                    optionsHTML += `<fieldset class="extra-options-group"><legend>${optGroup.groupName}</legend>`;
                    if (optGroup.choices && Array.isArray(optGroup.choices)) {
                        optGroup.choices.forEach(choice => {
                            const isChecked = extra.selectedOptions[optGroup.optionKey] === choice.id;
                            optionsHTML += `<div><label><input type="radio" name="extra_option_${optGroup.optionKey}_${extra.instanceId}" 
                                       data-option-key="${optGroup.optionKey}" 
                                       value="${choice.id}" ${isChecked ? 'checked' : ''}> 
                                ${choice.name} (+${choice.price.toFixed(2)}${CALC_CONFIG.general.currencySymbol})
                            </label></div>`;
                        });
                    }
                    optionsHTML += `</fieldset>`;
                });
            }

            let quantityInputHTML = '';
            if (extraConfig.hasIndependentQuantity) {
                quantityInputHTML += `<div class="number-input-wrapper">
                                <label for="extra_quantity_${extra.instanceId}">Anzahl:</label>
                                <div class="input-group">
                                    <button type="button" class="btn-number" data-type="minus" data-field="extra_quantity_${extra.instanceId}">-</button>
                                    <input type="number" id="extra_quantity_${extra.instanceId}" class="extra-quantity-input" min="1" value="${extra.quantity}">
                                    <button type="button" class="btn-number" data-type="plus" data-field="extra_quantity_${extra.instanceId}">+</button>
                                </div>
                             </div>`;
            }
            body.innerHTML = selectTypeHtml + optionsHTML + quantityInputHTML;

            body.querySelector('.extra-type-select').addEventListener('change', e => {
                handleExtraTypeChange(e.target.dataset.instanceId, e.target.value);
            });

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
        extrasContainer.appendChild(itemEl);
    });
}

/**
 * Returns the current local state of extras.
 */
export function getConfiguredExtras() {
    return inquiryStateRef.extras;
}

/**
 * Initializes the extras handler.
 * @param {object} config - The main application config.
 * @param {function} updateCb - The main update callback function.
 * @param {object} state - The main application state object.
 * @param {HTMLElement} addBtn - The button to add a new extra.
 */
export function initExtrasHandler(config, updateCb, state, addBtn) {
    CALC_CONFIG = config;
    onUpdateCallback = updateCb;
    inquiryStateRef = state;
    addExtraButton = addBtn;
    
    if (addExtraButton) {
        addExtraButton.addEventListener('click', addNewExtra);
    }
}
