// extrasHandler.mjs
// Manages additional products/extras: state, UI, interactions

import { toggleAccordionItemExpansion } from './uiUtils.mjs';

let CALC_CONFIG_REF;
let onUpdateCallback; // To notify script.js

// State
let configuredExtras = [];
let nextExtraInstanceId = 1;

// DOM Elements
let extrasContainer_DOM, addExtraButton_DOM;

function addNewExtraConfigBlock() {
    const availableExtrasToAdd = CALC_CONFIG_REF.extras.filter(ec => {
        if (!ec.isSingleton) return true;
        return !configuredExtras.some(confEx => confEx.extraId === ec.id);
    });

    if (availableExtrasToAdd.length === 0) {
        alert("Keine weiteren Extras verfügbar oder alle einmaligen Extras wurden bereits hinzugefügt.");
        return;
    }

    const defaultConfig = availableExtrasToAdd[0];
    const newExtra = {
        instanceId: `extra_instance_${nextExtraInstanceId++}`,
        extraId: defaultConfig.id,
        selectedOptions: {},
        quantity: defaultConfig.hasIndependentQuantity ? (defaultConfig.defaultQuantity || 1) : 1,
        isExpanded: true,
        unitPrice: 0, // Will be calculated by calculationService
        totalPrice: 0 // Will be calculated by calculationService
    };

    if (defaultConfig.options) {
        defaultConfig.options.forEach(optGroup => {
            const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
            if (defaultChoice) newExtra.selectedOptions[optGroup.optionKey] = defaultChoice.id;
        });
    }
    
    // Collapse other items (variants and other extras)
    // This might need coordination with variantHandler or a global UI state manager
    // For now, just set own items. Main script can coordinate collapsing others if needed.
    // configuredVariants.forEach(v => v.isExpanded = false); // Managed by main script or variantHandler
    configuredExtras.forEach(ex => ex.isExpanded = false);
    
    configuredExtras.push(newExtra);
    if (onUpdateCallback) onUpdateCallback();
}

function removeExtraConfigBlock(instanceIdToRemove) {
    configuredExtras = configuredExtras.filter(ex => ex.instanceId !== instanceIdToRemove);
    if (!configuredExtras.some(ex => ex.isExpanded) && configuredExtras.length > 0) {
        configuredExtras[configuredExtras.length - 1].isExpanded = true;
    }
    // else if (configuredExtras.length === 0 && configuredVariants.length > 0 && !configuredVariants.some(v => v.isExpanded)) {
        // configuredVariants[configuredVariants.length - 1].isExpanded = true; // Managed by variantHandler
    // }
    if (onUpdateCallback) onUpdateCallback();
}

function handleExtraInputChange(instanceId, field, value) {
    const extra = configuredExtras.find(ex => ex.instanceId === instanceId);
    if (!extra) return;

    const currentExtraConfig = CALC_CONFIG_REF.extras.find(exConf => exConf.id === extra.extraId);

    if (field === 'extraIdSelection') { // User changed the type of extra
        extra.extraId = value;
        extra.selectedOptions = {}; // Reset options
        const newExtraConfig = CALC_CONFIG_REF.extras.find(exConf => exConf.id === extra.extraId);
        if (newExtraConfig?.options) {
            newExtraConfig.options.forEach(optGroup => {
                const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                if (defaultChoice) extra.selectedOptions[optGroup.optionKey] = defaultChoice.id;
            });
        }
        if (newExtraConfig) {
            extra.quantity = newExtraConfig.hasIndependentQuantity ? (newExtraConfig.defaultQuantity || 1) : 1;
        }
    } else if (currentExtraConfig?.options?.some(og => og.optionKey === field)) { // Option changed
        extra.selectedOptions[field] = value;
    } else if (field === 'extra_quantity') { // Quantity changed
        if (currentExtraConfig?.hasIndependentQuantity) {
            extra.quantity = Math.max(1, parseInt(value) || 1);
        }
    }
    if (onUpdateCallback) onUpdateCallback();
}

function handleExtraApply(instanceId) {
    const extra = configuredExtras.find(ex => ex.instanceId === instanceId);
    if (extra) {
        extra.isExpanded = false;
    }
    if (onUpdateCallback) onUpdateCallback(); // Re-render to collapse
}

function updateAddExtraButtonState() {
    if (!addExtraButton_DOM) return;
    const availableExtrasToAdd = CALC_CONFIG_REF.extras.filter(ec => {
        if (!ec.isSingleton) return true;
        return !configuredExtras.some(confEx => confEx.extraId === ec.id);
    });
    addExtraButton_DOM.disabled = availableExtrasToAdd.length === 0;
    addExtraButton_DOM.title = addExtraButton_DOM.disabled ? "Alle einmaligen Extras wurden hinzugefügt oder keine weiteren Extras verfügbar." : "";
}

export function initExtrasHandler(calcConfig, updateCb) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;

    extrasContainer_DOM = document.getElementById('extrasContainer');
    addExtraButton_DOM = document.getElementById('addExtraButton');

    if (addExtraButton_DOM) {
        addExtraButton_DOM.addEventListener('click', addNewExtraConfigBlock);
    }
    
    // Add default singleton extras
    CALC_CONFIG_REF.extras.forEach(extraConfig => {
        if (extraConfig.isSingleton) {
            const alreadyExists = configuredExtras.some(ex => ex.extraId === extraConfig.id);
            if (!alreadyExists) {
                const newExtra = {
                    instanceId: `extra_instance_${nextExtraInstanceId++}`,
                    extraId: extraConfig.id,
                    selectedOptions: {},
                    quantity: extraConfig.hasIndependentQuantity ? (extraConfig.defaultQuantity || 1) : 1,
                    isExpanded: true, // Default singletons might be expanded initially
                    unitPrice: 0,
                    totalPrice: 0
                };
                if (extraConfig.options) {
                    extraConfig.options.forEach(optGroup => {
                        const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                        if (defaultChoice) newExtra.selectedOptions[optGroup.optionKey] = defaultChoice.id;
                    });
                }
                configuredExtras.unshift(newExtra); // Add to the beginning
            }
        }
    });

}

export function updateExtrasUI(extraCalculations) {
    if (!extrasContainer_DOM) return;
    extrasContainer_DOM.innerHTML = ''; // Clear previous content

    const { extrasWithPrices } = extraCalculations;

    extrasWithPrices.forEach((extra, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'accordion-item extra-item';
        itemEl.dataset.instanceId = extra.instanceId;

        const extraConfig = CALC_CONFIG_REF.extras.find(e => e.id === extra.extraId);
        if (!extraConfig) return;

        const name = extraConfig.name;
        const quantityText = extraConfig.hasIndependentQuantity ? `(Menge: ${extra.quantity})` : '';

        const header = document.createElement('div');
        header.className = `accordion-header extra-header ${extra.isExpanded ? 'expanded' : ''}`;
        header.innerHTML = `
            <div>
                <h4>Extra ${index + 1}: ${name} ${quantityText}</h4>
                 <div class="accordion-header-summary">
                    Stk.-Preis: ${extra.unitPrice.toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol} | Gesamt: ${extra.totalPrice.toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol}
                </div>
            </div>
            <div class="accordion-controls">
                <button class="button-secondary edit-item-btn" style="display:${extra.isExpanded ? 'none' : 'inline-block'};">Bearbeiten</button>
                ${extraConfig.isSingleton ? '' : '<button class="button-danger remove-item-btn">Löschen</button>'}
            </div>`;

        header.querySelector('.edit-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleAccordionItemExpansion(configuredExtras, extra.instanceId, 'extra', onUpdateCallback, getConfiguredVariants());
        });
        const removeBtn = header.querySelector('.remove-item-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', e => {
                e.stopPropagation();
                removeExtraConfigBlock(extra.instanceId);
            });
        }
        
        if (!extra.isExpanded) {
            header.addEventListener('click', (e) => {
                 if (!e.target.closest('button')) {
                    toggleAccordionItemExpansion(configuredExtras, extra.instanceId, 'extra', onUpdateCallback, getConfiguredVariants());
                }
            });
        }
        itemEl.appendChild(header);

        if (extra.isExpanded) {
            const body = document.createElement('div');
            body.className = 'accordion-body extra-body';

            let selectOptionsHTML = '';
            if (extraConfig.isSingleton) {
                selectOptionsHTML = `<option value="${extraConfig.id}" selected>${extraConfig.name}</option>`;
            } else {
                const availableExtraTypes = CALC_CONFIG_REF.extras.filter(ec => {
                    if (!ec.isSingleton) return true;
                    // Allow current singleton if it's this instance, or if not present elsewhere
                    return ec.id === extra.extraId || !configuredExtras.some(confEx => confEx.extraId === ec.id && confEx.instanceId !== extra.instanceId);
                });
                selectOptionsHTML = availableExtraTypes.map(ec =>
                    `<option value="${ec.id}" ${ec.id === extra.extraId ? 'selected' : ''}>${ec.name}</option>`
                ).join('');
            }

            let formHTML = `
                <div>
                    <label for="extraType_${extra.instanceId}">Extra-Typ:</label>
                    <select id="extraType_${extra.instanceId}" data-instance-id="${extra.instanceId}" ${extraConfig.isSingleton ? 'disabled' : ''}>
                        ${selectOptionsHTML}
                    </select>
                </div>`;

            if (extraConfig.options && extraConfig.options.length > 0) {
                extraConfig.options.forEach(optGroup => {
                    formHTML += `<fieldset class="extra-options-group"><legend>${optGroup.groupName}</legend>`;
                    optGroup.choices.forEach(choice => {
                        formHTML += `<div><label><input type="radio" name="extra_option_${optGroup.optionKey}_${extra.instanceId}" data-instance-id="${extra.instanceId}" data-option-key="${optGroup.optionKey}" value="${choice.id}" ${extra.selectedOptions[optGroup.optionKey] === choice.id ? 'checked' : ''}> ${choice.name} (+${(choice.price||0).toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
                    });
                    formHTML += '</fieldset>';
                });
            }

            if (extraConfig.hasIndependentQuantity) {
                formHTML += `
                    <div>
                        <label for="extra_quantity_${extra.instanceId}">Anzahl:</label>
                        <input type="number" id="extra_quantity_${extra.instanceId}" name="extra_quantity" data-instance-id="${extra.instanceId}" min="1" value="${extra.quantity}">
                    </div>`;
            }
            formHTML += `<button class="button-primary apply-item-btn" data-instance-id="${extra.instanceId}">Übernehmen</button>`;
            body.innerHTML = formHTML;

            // Event Listeners for this extra's body
            const selectElement = body.querySelector(`#extraType_${extra.instanceId}`);
            if (selectElement && !extraConfig.isSingleton) { // Only add listener if not disabled
                 selectElement.addEventListener('change', e => handleExtraInputChange(e.target.dataset.instanceId, 'extraIdSelection', e.target.value));
            }
            body.querySelectorAll('input[type="radio"][name^="extra_option_"]').forEach(rad => rad.addEventListener('change', e => { if (e.target.checked) handleExtraInputChange(e.target.dataset.instanceId, e.target.dataset.optionKey, e.target.value); }));
            if (extraConfig.hasIndependentQuantity) {
                body.querySelector(`#extra_quantity_${extra.instanceId}`).addEventListener('input', e => handleExtraInputChange(e.target.dataset.instanceId, 'extra_quantity', e.target.value));
            }
            body.querySelector('.apply-item-btn').addEventListener('click', e => handleExtraApply(e.target.dataset.instanceId));
            itemEl.appendChild(body);
        }
        extrasContainer_DOM.appendChild(itemEl);
    });
    updateAddExtraButtonState();
}

export function getConfiguredExtras() { return configuredExtras; }
export function getNextExtraInstanceId() { return nextExtraInstanceId; }
export function setNextExtraInstanceId(id) { nextExtraInstanceId = id; }
export function setConfiguredExtras(extras) { configuredExtras = extras; }

// Helper to get variant state, needed by uiUtils for toggling accordion
function getConfiguredVariants() {
    // This is a bit of a hack. Ideally, uiUtils wouldn't need to know about variants directly.
    // Or, the main script would pass the correct collections to toggleAccordionItemExpansion.
    // For now, to avoid circular dependencies or overly complex main script, we provide this.
    // Consider refactoring toggleAccordionItemExpansion to not need the other collection.
    if (typeof window.getConfiguredVariants === 'function') { // Check if main script exposed it
        return window.getConfiguredVariants();
    }
    return []; // Fallback
}
