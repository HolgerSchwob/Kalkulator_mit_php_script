// variantHandler.mjs
// Manages binding variants. V3.2 by Lucy.
// V3.2: Differentiated personalization types to correctly call the editor.

import { toggleAccordionItemExpansion } from './uiUtils.mjs';

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG_REF;
let onUpdateCallback;
let inquiryStateRef;
let openEditorCallback; // Callback to open the SVG editor

// Local state
let configuredVariants = []; 
let nextVariantId = 1;

// DOM elements
let bindingVariantsContainer_DOM, addVariantButton_DOM;

/**
 * Initializes the variant handler.
 * @param {object} calcConfig The calculator's configuration.
 * @param {function} updateCb The main updateApp function to call on changes.
 * @param {object} globalInquiryStateRef A reference to the global state object.
 * @param {function} editorCb The callback function to launch the SVG editor.
 */
export function initVariantHandler(calcConfig, updateCb, globalInquiryStateRef, editorCb) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;
    inquiryStateRef = globalInquiryStateRef;
    openEditorCallback = editorCb;

    bindingVariantsContainer_DOM = document.getElementById('bindingVariantsContainer');
    addVariantButton_DOM = document.getElementById('addVariantButton');

    if (addVariantButton_DOM) {
        addVariantButton_DOM.addEventListener('click', () => addNewVariant());
    }
    configuredVariants = inquiryStateRef.variants;
}

export function addInitialVariant() {
    if (configuredVariants.length > 0) return;
    const newVariant = createNewVariantObject();
    configuredVariants.push(newVariant);
    inquiryStateRef.variants = configuredVariants;
}

export function getConfiguredVariants() {
    inquiryStateRef.variants = configuredVariants;
    return configuredVariants;
}

function createNewVariantObject() {
    const initialBindingConfig = getBindingConfigById(CALC_CONFIG_REF.general.defaultFallbackBindingId) || CALC_CONFIG_REF.bindings[0];
    return {
        id: `variant_${nextVariantId++}`,
        bindingTypeId: initialBindingConfig.id,
        quantity: 1,
        options: setDefaultOptionsForBinding(initialBindingConfig),
        personalization: {},
        isExpanded: true,
    };
}

function addNewVariant() {
    if (configuredVariants.length >= CALC_CONFIG_REF.general.maxVariants) {
        alert("Maximale Anzahl an Varianten erreicht.");
        return;
    }
    const newVariant = createNewVariantObject();
    configuredVariants.forEach(v => v.isExpanded = false);
    configuredVariants.push(newVariant);
    if (onUpdateCallback) onUpdateCallback();
}

function removeVariant(variantIdToRemove) {
    if (configuredVariants.length <= 1) {
        alert("Die letzte Variante kann nicht gelöscht werden.");
        return;
    }
    configuredVariants = configuredVariants.filter(v => v.id !== variantIdToRemove);
    if (inquiryStateRef.personalizations[variantIdToRemove]) {
        delete inquiryStateRef.personalizations[variantIdToRemove];
    }
    if (!configuredVariants.some(v => v.isExpanded) && configuredVariants.length > 0) {
        configuredVariants[configuredVariants.length - 1].isExpanded = true;
    }
    if (onUpdateCallback) onUpdateCallback();
}

function handleVariantInputChange(variantId, field, value) {
    const variant = configuredVariants.find(v => v.id === variantId);
    if (!variant) return;

    if (field === 'bindingTypeId') {
        variant.bindingTypeId = value;
        const newBindingConfig = getBindingConfigById(value);
        variant.options = setDefaultOptionsForBinding(newBindingConfig);
        variant.personalization = {};
         if (inquiryStateRef.personalizations[variantId]) {
            delete inquiryStateRef.personalizations[variantId];
        }
    } else if (field === 'quantity') {
        variant.quantity = Math.max(1, parseInt(value, 10) || 1);
    } else if (field.startsWith('option_')) {
        variant.options[field.substring(7)] = value;
    }
    if (onUpdateCallback) onUpdateCallback();
}

function toggleVariantExpansion(variantIdToToggle) {
    configuredVariants.forEach(v => {
        v.isExpanded = (v.id === variantIdToToggle) ? !v.isExpanded : false;
    });
    if (onUpdateCallback) onUpdateCallback();
}

export function updateVariantsUI(variantsWithPrices, currentBookBlockState, currentPersonalizations) {
    if (!bindingVariantsContainer_DOM) return;
    bindingVariantsContainer_DOM.innerHTML = ''; 

    configuredVariants = variantsWithPrices;

    variantsWithPrices.forEach((variant, index) => {
        const bindingConfig = getBindingConfigById(variant.bindingTypeId);
        if(!bindingConfig) return;
        
        const itemEl = document.createElement('div');
        itemEl.className = 'accordion-item variant-item';

        const header = document.createElement('div');
        header.className = `accordion-header variant-header ${variant.isExpanded ? 'expanded' : ''}`;
        header.innerHTML = `
            <div>
                <h3>Variante ${index + 1}: ${bindingConfig.name}</h3>
                <div class="accordion-header-summary">
                    Menge: ${variant.quantity} Stk. | Stk.-Preis: ${variant.unitPrice.toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol} | Gesamt: ${variant.totalPrice.toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol}
                </div>
            </div>
            <div class="accordion-controls">
                <button class="button-secondary edit-item-btn" style="display:${variant.isExpanded ? 'none' : 'inline-block'};">Bearbeiten</button>
                <button class="button-danger remove-item-btn">Löschen</button>
            </div>`;
        
        header.querySelector('.edit-item-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleVariantExpansion(variant.id);
        });
        const removeBtn = header.querySelector('.remove-item-btn');
        removeBtn.disabled = configuredVariants.length <= 1;
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            removeVariant(variant.id);
        });

        if(!variant.isExpanded) {
            header.addEventListener('click', (e) => {
                 if (!e.target.closest('button')) {
                    toggleVariantExpansion(variant.id);
                }
            });
        }
        itemEl.appendChild(header);

        if (variant.isExpanded) {
            const body = document.createElement('div');
            body.className = 'accordion-body variant-body';
            
            let formHTML = `
                <div>
                    <label for="bindingType_${variant.id}">Bindungstyp:</label>
                    <select id="bindingType_${variant.id}" data-variant-id="${variant.id}">
                        ${CALC_CONFIG_REF.bindings.map(b => `<option value="${b.id}" ${b.id === variant.bindingTypeId ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>`;

            if (bindingConfig.options && bindingConfig.options.length > 0) {
                formHTML += '<div class="options-section">';
                bindingConfig.options.forEach(opt => {
                    formHTML += `<fieldset class="variant-option-group"><legend>${opt.name}</legend>`;
                    if (opt.type === 'radio') {
                        opt.choices.forEach(choice => {
                            const isChecked = variant.options[opt.optionKey] === choice.id;
                            formHTML += `<div><label><input type="radio" name="option_${opt.optionKey}_${variant.id}" data-option-key="${opt.optionKey}" value="${choice.id}" ${isChecked ? 'checked' : ''}> ${choice.name} (+${(choice.price||0).toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
                        });
                    }
                    // Add other option types like checkbox or gallery here if needed
                    formHTML += '</fieldset>';
                });
                formHTML += '</div>';
            }

            if (bindingConfig.requiresPersonalization) {
                 const personalizationData = currentPersonalizations[variant.id] || {};
                 let isPersonalized, summaryHTML;
                 
                 // Determine summary and status based on personalization type
                 if (bindingConfig.personalizationInterface === 'coverEditor') {
                    isPersonalized = !!(personalizationData.editorData && personalizationData.editorData.thumbnailDataUrl);
                    summaryHTML = isPersonalized 
                        ? `<p><em>Design erstellt.</em><br><img src="${personalizationData.editorData.thumbnailDataUrl}" style="max-height: 60px; border: 1px solid #ccc; margin-top: 5px;" alt="Vorschau"></p>`
                        : '<p><em>Noch nicht personalisiert.</em></p>';
                 } else {
                    // Placeholder for other personalization types (like the old modal)
                    isPersonalized = Object.keys(personalizationData).length > 0; // Simple check
                    summaryHTML = isPersonalized 
                        ? `<p><em>Daten für Prägung erfasst (Funktion in Arbeit).</em></p>`
                        : '<p><em>Noch nicht personalisiert.</em></p>';
                 }

                 let buttonText = isPersonalized ? 'Personalisierung bearbeiten' : 'Personalisieren (Pflicht)';

                 formHTML += `
                    <div class="personalization-control-area" style="margin-top:15px; padding-top:15px; border-top: 1px solid #eee;">
                        <button type="button" class="button-primary personalize-variant-btn" data-variant-id="${variant.id}">${buttonText}</button>
                        <div class="personalization-summary" style="font-size:0.9em; margin-top:8px;">
                            ${summaryHTML}
                        </div>
                    </div>`;
            }

            formHTML += `
                <div style="margin-top: 15px;">
                    <label for="quantity_${variant.id}">Anzahl:</label>
                    <input type="number" id="quantity_${variant.id}" min="1" value="${variant.quantity}">
                </div>`;
            
            body.innerHTML = formHTML;

            body.querySelector(`#bindingType_${variant.id}`).addEventListener('change', e => handleVariantInputChange(variant.id, 'bindingTypeId', e.target.value));
            body.querySelector(`#quantity_${variant.id}`).addEventListener('input', e => handleVariantInputChange(variant.id, 'quantity', e.target.value));
            body.querySelectorAll('input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', e => {
                    if (e.target.checked) handleVariantInputChange(variant.id, `option_${e.target.dataset.optionKey}`, e.target.value);
                });
            });

            const personalizeBtn = body.querySelector('.personalize-variant-btn');
            if (personalizeBtn) {
                personalizeBtn.addEventListener('click', e => {
                    // NEW: Check which personalization interface to use
                    if (bindingConfig.personalizationInterface === 'coverEditor') {
                        if (openEditorCallback) {
                            openEditorCallback(variant.id);
                        }
                    } else {
                        // This is where you would call the old modal for text-based personalization
                        alert('Dieser Personalisierungstyp (z.B. für Prägungen) ist in dieser Version noch nicht wieder implementiert.');
                    }
                });
            }

            itemEl.appendChild(body);
        }
        
        bindingVariantsContainer_DOM.appendChild(itemEl);
    });

    updateAddVariantButtonState();
}

// --- HELPER FUNCTIONS ---
function getBindingConfigById(bindingId) {
    return CALC_CONFIG_REF.bindings.find(b => b.id === bindingId);
}

function setDefaultOptionsForBinding(bindingConfig) {
    const defaultOptions = {};
    if (bindingConfig && bindingConfig.options) {
        bindingConfig.options.forEach(opt => {
            if (opt.type === 'radio') {
                defaultOptions[opt.optionKey] = opt.choices.find(c => c.default)?.id || opt.choices[0]?.id;
            } else if (opt.type === 'checkbox') {
                defaultOptions[opt.optionKey] = opt.defaultState || false;
            }
        });
    }
    return defaultOptions;
}

function updateAddVariantButtonState() {
    if (!addVariantButton_DOM) return;
    const isDisabled = configuredVariants.length >= CALC_CONFIG_REF.general.maxVariants;
    addVariantButton_DOM.disabled = isDisabled;
    addVariantButton_DOM.textContent = isDisabled ? "Max. Varianten erreicht" : "+ Weitere Variante hinzufügen";
}
