// variantHandler.mjs
// Handles all UI and logic for binding variants.
// V5.2: Optimized adding/removing variants based on user feedback.

// --- MODULE SCOPE VARIABLES ---
let CALC_CONFIG;
let onUpdateCallback;
let openEditorCb;
let inquiryStateRef;
let addVariantButton; // Reference to the "Add" button

// DOM Elements
const variantsContainer = document.getElementById('bindingVariantsContainer');

/**
 * Creates a new, default variant object.
 * @returns {object} The new variant object.
 */
function createNewVariantObject() {
    const defaultBinding = CALC_CONFIG.bindings.find(b => b.id === CALC_CONFIG.general.defaultFallbackBindingId) || CALC_CONFIG.bindings[0];
    const newVariant = {
        id: `variant_${self.crypto.randomUUID()}`,
        bindingTypeId: defaultBinding.id,
        quantity: 1,
        selectedOptions: {},
        isExpanded: true, // New variants are expanded by default
    };

    // Pre-select default options for the new variant
    if (defaultBinding.options) {
        defaultBinding.options.forEach(optGroup => {
            const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
            if (defaultChoice) {
                newVariant.selectedOptions[optGroup.optionKey] = defaultChoice.id;
            }
        });
    }
    return newVariant;
}

/**
 * Adds a new variant to the state and updates the UI.
 */
function addNewVariant() {
    // Guard condition remains, but without the alert. The button is now hidden via UI.
    if (inquiryStateRef.variants.length >= CALC_CONFIG.general.maxVariants) {
        console.warn(`Attempted to add a variant beyond the maximum of ${CALC_CONFIG.general.maxVariants}.`);
        return;
    }
    // Collapse all other variants before adding a new one
    inquiryStateRef.variants.forEach(v => v.isExpanded = false);
    const newVariant = createNewVariantObject();
    inquiryStateRef.variants.push(newVariant);
    onUpdateCallback();
}

/**
 * Removes a variant from the state.
 * @param {string} variantIdToRemove - The ID of the variant to remove.
 */
function removeVariant(variantIdToRemove) {
    inquiryStateRef.variants = inquiryStateRef.variants.filter(v => v.id !== variantIdToRemove);
     // If no variant is expanded, expand the last one for better UX.
    if (!inquiryStateRef.variants.some(v => v.isExpanded) && inquiryStateRef.variants.length > 0) {
        inquiryStateRef.variants[inquiryStateRef.variants.length - 1].isExpanded = true;
    }
    onUpdateCallback();
}

/**
 * Toggles the expanded/collapsed state of a variant.
 * @param {string} variantIdToToggle - The ID of the variant to toggle.
 */
function toggleVariantExpansion(variantIdToToggle) {
    const variantToToggle = inquiryStateRef.variants.find(v => v.id === variantIdToToggle);
    if (!variantToToggle) return;

    const wasExpanded = variantToToggle.isExpanded;
    
    // First, close all variants
    inquiryStateRef.variants.forEach(v => v.isExpanded = false);
    
    // If it was closed, open it now.
    if (!wasExpanded) {
        variantToToggle.isExpanded = true;
    }
    onUpdateCallback();
}

/**
 * Handles input changes within a variant's UI.
 * @param {string} variantId - The ID of the variant being changed.
 * @param {string} field - The name of the field being changed (e.g., 'bindingTypeId', 'quantity').
 * @param {*} value - The new value.
 */
function handleVariantInputChange(variantId, field, value) {
    const variant = inquiryStateRef.variants.find(v => v.id === variantId);
    if (!variant) return;

    if (field === 'bindingTypeId') {
        variant.bindingTypeId = value;
        // Reset options when binding type changes
        variant.selectedOptions = {};
        const newBindingConfig = CALC_CONFIG.bindings.find(b => b.id === value);
        if (newBindingConfig && newBindingConfig.options) {
            newBindingConfig.options.forEach(optGroup => {
                const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                if (defaultChoice) {
                    variant.selectedOptions[optGroup.optionKey] = defaultChoice.id;
                }
            });
        }
    } else if (field === 'quantity') {
        variant.quantity = Math.max(1, parseInt(value, 10) || 1);
    } else { // It's a radio button option
        variant.selectedOptions[field] = value;
    }
    onUpdateCallback();
}


// --- PUBLIC API ---

/**
 * Renders the UI for all binding variants.
 * @param {Array} variantsWithPrices - The variant data including calculated prices.
 * @param {object} bookBlockState - The current state of the book block.
 * @param {object} personalizations - The personalization data.
 */
export function updateVariantsUI(variantsWithPrices, bookBlockState, personalizations) {
    if (!variantsContainer) return;
    variantsContainer.innerHTML = '';

    // Loop through each variant and render its UI
    variantsWithPrices.forEach(variant => {
        const bindingConfig = CALC_CONFIG.bindings.find(b => b.id === variant.bindingTypeId);
        if (!bindingConfig) return;

        const itemEl = document.createElement('div');
        itemEl.className = 'accordion-item variant-item';
        itemEl.id = `variant-item-${variant.id}`;

        const header = document.createElement('div');
        header.className = `accordion-header variant-header ${variant.isExpanded ? 'expanded' : ''}`;
        
        // --- CHANGE: Conditionally create the delete button ---
        const canBeDeleted = variantsWithPrices.length > 1;
        const deleteButtonHTML = canBeDeleted ? `<button class="button-danger remove-item-btn">Löschen</button>` : '';

        header.innerHTML = `
            <div>
                <h4>${variant.quantity}x ${bindingConfig.name}</h4>
                <div class="accordion-header-summary">
                    Stückpreis: ${variant.unitPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol} / Gesamt: ${variant.totalPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}
                </div>
            </div>
            <div class="accordion-controls">
                <button class="button-secondary edit-item-btn" style="display:${variant.isExpanded ? 'none' : 'inline-block'};">Bearbeiten</button>
                ${deleteButtonHTML}
            </div>
        `;

        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            toggleVariantExpansion(variant.id);
        });

        header.querySelector('.edit-item-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleVariantExpansion(variant.id);
        });
        
        // Add listener only if the delete button exists
        const removeBtn = header.querySelector('.remove-item-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeVariant(variant.id);
            });
        }

        itemEl.appendChild(header);

        // ... (rest of the expanded body rendering remains the same)
        if (variant.isExpanded) {
            const body = document.createElement('div');
            body.className = 'accordion-body variant-body';

            let bindingSelectHTML = '<div><label>Bindungsart:</label><select class="binding-type-select">';
            CALC_CONFIG.bindings.forEach(b => {
                bindingSelectHTML += `<option value="${b.id}" ${b.id === variant.bindingTypeId ? 'selected' : ''}>${b.name}</option>`;
            });
            bindingSelectHTML += '</select></div>';

            let quantityInputHTML = `
                <div class="number-input-wrapper">
                    <label for="variant_quantity_${variant.id}">Anzahl:</label>
                    <div class="input-group">
                        <button type="button" class="btn-number" data-type="minus" data-field="variant_quantity_${variant.id}">-</button>
                        <input type="number" id="variant_quantity_${variant.id}" class="variant-quantity-input" min="1" value="${variant.quantity}">
                        <button type="button" class="btn-number" data-type="plus" data-field="variant_quantity_${variant.id}">+</button>
                    </div>
                </div>`;

            let optionsHTML = '';
            if (bindingConfig.options && bindingConfig.options.length > 0) {
                bindingConfig.options.forEach(optGroup => {
                    optionsHTML += `<fieldset class="variant-option-group"><legend>${optGroup.name}</legend>`;
                    optGroup.choices.forEach(choice => {
                        const isChecked = variant.selectedOptions[optGroup.optionKey] === choice.id;
                        optionsHTML += `<div><label><input type="radio" name="variant_option_${optGroup.optionKey}_${variant.id}" data-option-key="${optGroup.optionKey}" value="${choice.id}" ${isChecked ? 'checked' : ''}> ${choice.name}</label></div>`;
                    });
                    optionsHTML += '</fieldset>';
                });
            }

            let personalizationHTML = '';
            const personalizationData = personalizations[variant.id] || {};
            if (bindingConfig.requiresPersonalization) {
                 const isPersonalized = personalizationData.editorData;
                 const buttonText = isPersonalized ? 'Personalisierung bearbeiten' : 'Deckel personalisieren';
                 personalizationHTML = `<div class="personalization-control"><button class="button-primary personalize-btn">${buttonText}</button></div>`;
            }

            body.innerHTML = bindingSelectHTML + quantityInputHTML + optionsHTML + personalizationHTML;
            
            body.querySelector('.binding-type-select').addEventListener('change', e => handleVariantInputChange(variant.id, 'bindingTypeId', e.target.value));
            body.querySelector('.variant-quantity-input').addEventListener('input', e => handleVariantInputChange(variant.id, 'quantity', e.target.value));
            body.querySelectorAll('input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', e => handleVariantInputChange(variant.id, e.target.dataset.optionKey, e.target.value));
            });
            if (bindingConfig.requiresPersonalization) {
                body.querySelector('.personalize-btn').addEventListener('click', () => openEditorCb(variant.id));
            }
            
            itemEl.appendChild(body);
        }
        variantsContainer.appendChild(itemEl);
    });

    // --- CHANGE: Show/hide the main "Add Variant" button ---
    if (addVariantButton) {
        const canAddMore = variantsWithPrices.length < CALC_CONFIG.general.maxVariants;
        addVariantButton.style.display = canAddMore ? 'inline-block' : 'none';
    }
}

/**
 * Gets the current configuration of variants.
 * @returns {Array} The array of variant objects.
 */
export function getConfiguredVariants() {
    return inquiryStateRef.variants;
}

/**
 * Adds the very first variant when the app loads.
 */
export function addInitialVariant() {
    if (inquiryStateRef.variants.length === 0) {
        addNewVariant();
    }
}

/**
 * Initializes the variant handler module.
 * @param {object} config - The main application config.
 * @param {function} updateCb - The main update callback function.
 * @param {object} state - The main application state object.
 * @param {function} editorCb - The callback function to open the editor.
 * @param {HTMLElement} addBtn - The button to add a new variant.
 */
export function initVariantHandler(config, updateCb, state, editorCb, addBtn) {
    CALC_CONFIG = config;
    onUpdateCallback = updateCb;
    inquiryStateRef = state;
    openEditorCb = editorCb;
    addVariantButton = addBtn; // Store the button reference
    
    if (addVariantButton) {
        addVariantButton.addEventListener('click', addNewVariant);
    }
}
