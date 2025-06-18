// variantHandler.mjs
// Manages binding variants: state, UI, interactions (V1.9.5)
// V1.9.5: Integration Buchdeckeneditor-Aufruf

import { toggleAccordionItemExpansion, openImageGalleryModal as openGalleryModalHelper, setupImageGalleryEventListeners } from './uiUtils.mjs';

let CALC_CONFIG_REF;
let onUpdateCallback;
let inquiryStateRef;
let openPersonalizationModalCallback; // Für das alte Text-Modal
let openCoverEditorModalCallback;   // NEU: Für den Buchdeckeneditor

let configuredVariants = [];
let nextVariantId = 1;
let currentGalleryContext = { variantId: null, optionKey: null, selectedBasename: null, config: null };

let bindingVariantsContainer_DOM, addVariantButton_DOM;

function getBindingConfigById(bindingId) {
    return CALC_CONFIG_REF.bindings.find(b => b.id === bindingId);
}

function getPaperConfigById(paperId) {
    if (!CALC_CONFIG_REF || !CALC_CONFIG_REF.papers) return null;
    return CALC_CONFIG_REF.papers.find(p => p.id === paperId);
}

function calculateBookBlockThickness(pages, paperId, printMode, a3Count = 0) {
    if (!CALC_CONFIG_REF || (pages <= 0 && a3Count <= 0) || !paperId) return 0;
    const paperConfig = getPaperConfigById(paperId);
    if (!paperConfig || paperConfig.paperThickness === undefined) return 0;
    const numA4Sheets = (printMode === 'single_sided') ? pages : Math.ceil(pages / 2);
    let totalEffectiveSheets = numA4Sheets + (a3Count * 1);
    return totalEffectiveSheets * paperConfig.paperThickness;
}


function setDefaultOptionsForBinding(bindingConfig) {
    const defaultOptions = {};
    if (bindingConfig && bindingConfig.options) {
        bindingConfig.options.forEach(opt => {
            if (opt.type === 'checkbox') {
                defaultOptions[opt.optionKey] = opt.defaultState || false;
            } else if (opt.type === 'radio') {
                const defaultChoice = opt.choices.find(c => c.default) || opt.choices[0];
                if (defaultChoice) defaultOptions[opt.optionKey] = defaultChoice.id;
            } else if (opt.type === 'gallery_select') {
                defaultOptions[opt.optionKey] = opt.defaultSelection || (opt.availableImages && opt.availableImages.length > 0 ? opt.availableImages[0] : null);
            }
        });
    }
    return defaultOptions;
}

function addNewVariant(currentBookBlockState) {
    if (CALC_CONFIG_REF.bindings.length === 0) {
        alert("Keine Bindungstypen konfiguriert.");
        return;
    }
    if (configuredVariants.length >= CALC_CONFIG_REF.general.maxVariants) {
        alert("Maximale Anzahl an Varianten erreicht.");
        return;
    }

    const { totalPages, paperId, printMode, a3PagesCount } = currentBookBlockState || { totalPages: 0, paperId: null, printMode: 'double_sided', a3PagesCount: 0 };
    const currentBlockThickness = calculateBookBlockThickness(totalPages, paperId, printMode, a3PagesCount);

    let initialBindingConfig = CALC_CONFIG_REF.bindings.find(b => {
        if (b.minBlockThicknessMm === undefined || b.maxBlockThicknessMm === undefined) return false;
        const minValid = Math.max(b.minBlockThicknessMm, CALC_CONFIG_REF.general.absoluteMinThicknessMm);
        const maxValid = Math.min(b.maxBlockThicknessMm, CALC_CONFIG_REF.general.absoluteMaxThicknessMm);
        return currentBlockThickness >= minValid && currentBlockThickness <= maxValid;
    });

    if (!initialBindingConfig) {
        initialBindingConfig = getBindingConfigById(CALC_CONFIG_REF.general.defaultFallbackBindingId) || CALC_CONFIG_REF.bindings[0];
        if ((totalPages > 0 || a3PagesCount > 0) && paperId) {
             console.info(`Standardbindung passt nicht zur Dicke (${currentBlockThickness.toFixed(2)}mm). Fallback-Bindung "${initialBindingConfig.name}" wurde gewählt.`);
        }
    }

    const newVariant = {
        id: `variant_${nextVariantId++}`,
        bindingTypeId: initialBindingConfig.id,
        quantity: 1,
        options: setDefaultOptionsForBinding(initialBindingConfig),
        personalization: {},
        isExpanded: true,
        unitPrice: 0,
        totalPrice: 0
    };

    configuredVariants.forEach(v => v.isExpanded = false);
    configuredVariants.push(newVariant);
    if (onUpdateCallback) onUpdateCallback();
}

function removeVariant(variantIdToRemove) {
    if (configuredVariants.length === 1) {
        console.log("Die letzte verbleibende Variante kann nicht gelöscht werden.");
        return;
    }
    configuredVariants = configuredVariants.filter(v => v.id !== variantIdToRemove);
    if (inquiryStateRef.personalizations && inquiryStateRef.personalizations[variantIdToRemove]) {
        delete inquiryStateRef.personalizations[variantIdToRemove];
    }

    if (!configuredVariants.some(v => v.isExpanded) && configuredVariants.length > 0) {
        configuredVariants[configuredVariants.length - 1].isExpanded = true;
    }

    if (onUpdateCallback) onUpdateCallback();
}

function handleVariantInputChange(variantId, field, value, optionMeta = null, currentBookBlockState) {
    const variant = configuredVariants.find(v => v.id === variantId);
    if (!variant) return;

    const { totalPages, paperId, printMode, a3PagesCount } = currentBookBlockState || { totalPages: 0, paperId: null, printMode: 'double_sided', a3PagesCount: 0 };
    const currentBlockThickness = calculateBookBlockThickness(totalPages, paperId, printMode, a3PagesCount);

    if (field === 'bindingTypeId') {
        const newBindingConfig = getBindingConfigById(value);
        if (newBindingConfig) {
            let chosenBindingId = value;
            if ((totalPages > 0 || a3PagesCount > 0) && paperId && newBindingConfig.minBlockThicknessMm !== undefined) {
                const minValid = Math.max(newBindingConfig.minBlockThicknessMm, CALC_CONFIG_REF.general.absoluteMinThicknessMm);
                const maxValid = Math.min(newBindingConfig.maxBlockThicknessMm, CALC_CONFIG_REF.general.absoluteMaxThicknessMm);

                if (currentBlockThickness < minValid || currentBlockThickness > maxValid) {
                    const fallbackBindingConfig = getBindingConfigById(CALC_CONFIG_REF.general.defaultFallbackBindingId);
                    if (fallbackBindingConfig) {
                        chosenBindingId = CALC_CONFIG_REF.general.defaultFallbackBindingId;
                        alert(`Die gewählte Bindung "${newBindingConfig.name}" ist für die aktuelle Buchblockdicke (${currentBlockThickness.toFixed(2)}mm) nicht geeignet. Fallback-Bindung "${fallbackBindingConfig.name}" wurde stattdessen gewählt.`);
                    } else {
                        alert(`Die gewählte Bindung "${newBindingConfig.name}" ist für die aktuelle Buchblockdicke (${currentBlockThickness.toFixed(2)}mm) nicht geeignet und keine Fallback-Bindung ist optimal.`);
                    }
                }
            }
            variant.bindingTypeId = chosenBindingId;
            variant.options = setDefaultOptionsForBinding(getBindingConfigById(chosenBindingId));
            variant.personalization = {};
            if (inquiryStateRef.personalizations && inquiryStateRef.personalizations[variant.id]) {
                // Wenn der Bindungstyp wechselt, sollten spezifische Personalisierungsdaten gelöscht werden,
                // insbesondere die coverEditorData, da Templates etc. nicht mehr passen.
                delete inquiryStateRef.personalizations[variant.id].coverEditorData;
                // Überlege, ob auch andere Felder aus personalizationFields gelöscht werden sollen,
                // oder ob sie für eine Vorbefüllung eines anderen Editors/Modals erhalten bleiben.
            }
        }
    } else if (field === 'quantity') {
        variant.quantity = Math.max(1, parseInt(value) || 1);
    } else if (field.startsWith('option_')) {
        variant.options[field.substring(7)] = value;
    } else if (field === 'gallery_selection' && optionMeta && optionMeta.optionKey) {
        variant.options[optionMeta.optionKey] = value;
    }

    if (onUpdateCallback) onUpdateCallback();
}

function handleVariantApply(variantId) {
    const variant = configuredVariants.find(v => v.id === variantId);
    if (variant) {
        variant.isExpanded = false;
    }
    if (onUpdateCallback) onUpdateCallback();
}

function updateAddVariantButtonState() {
    if (!addVariantButton_DOM) return;
    addVariantButton_DOM.disabled = configuredVariants.length >= CALC_CONFIG_REF.general.maxVariants;
    addVariantButton_DOM.textContent = addVariantButton_DOM.disabled ? "Max. Varianten erreicht" : "+ Weitere Variante hinzufügen";
}

// NEU: openCoverEditorModalCb als Parameter hinzugefügt
export function initVariantHandler(calcConfig, updateCb, globalInquiryStateRef, openPersoModalCb, openCoverEdCb) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;
    inquiryStateRef = globalInquiryStateRef;
    openPersonalizationModalCallback = openPersoModalCb;
    openCoverEditorModalCallback = openCoverEdCb; // NEU

    bindingVariantsContainer_DOM = document.getElementById('bindingVariantsContainer');
    addVariantButton_DOM = document.getElementById('addVariantButton');

    setupImageGalleryEventListeners(
        (ctx) => currentGalleryContext = ctx,
        () => currentGalleryContext,
        (variantId, field, value, optionMeta, bookBlockState) => handleVariantInputChange(variantId, field, value, optionMeta, bookBlockState),
        () => inquiryStateRef.bookBlock
    );


    if (addVariantButton_DOM) {
        addVariantButton_DOM.addEventListener('click', () => {
            addNewVariant(inquiryStateRef.bookBlock);
        });
    }

    if (configuredVariants.length === 0 && CALC_CONFIG_REF.bindings.length > 0) {
        addNewVariant(inquiryStateRef.bookBlock);
    }
}

export function updateVariantsUI(variantCalculations, currentBookBlockState, currentPersonalizations) {
    if (!bindingVariantsContainer_DOM) return;
    bindingVariantsContainer_DOM.innerHTML = '';

    const { variantsWithPrices } = variantCalculations;

    variantsWithPrices.forEach((variant, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'accordion-item variant-item';
        itemEl.dataset.variantId = variant.id;
        itemEl.id = `variantItem_${variant.id}`;

        const bindingConfig = getBindingConfigById(variant.bindingTypeId);
        const name = bindingConfig ? bindingConfig.name : 'Unbekannte Bindung';
        let isCurrentlyInvalid = variant.isInvalid || false;

        const header = document.createElement('div');
        header.className = `accordion-header variant-header ${variant.isExpanded ? 'expanded' : ''} ${isCurrentlyInvalid ? 'invalid-variant-header' : ''}`;
        header.innerHTML = `
            <div>
                <h3>Variante ${index + 1}: ${name} ${isCurrentlyInvalid ? '<span style="color:red; font-size:0.8em;">(Dicke ungültig)</span>' : ''}</h3>
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
            toggleAccordionItemExpansion(configuredVariants, variant.id, 'variant', onUpdateCallback, getConfiguredExtras());
        });
        const removeBtn = header.querySelector('.remove-item-btn');
        removeBtn.disabled = configuredVariants.length === 1;
        removeBtn.style.display = configuredVariants.length === 1 ? 'none' : 'inline-block';
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            removeVariant(variant.id);
        });

        if (!variant.isExpanded) {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                     toggleAccordionItemExpansion(configuredVariants, variant.id, 'variant', onUpdateCallback, getConfiguredExtras());
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

            if (bindingConfig) {
                if (bindingConfig.description) {
                    formHTML += `<p class="binding-description info-text">${bindingConfig.description}</p>`;
                }
                if (bindingConfig.requiresPersonalization) {
                    const persoDataFromState = currentPersonalizations[variant.id] || {};
                    let isPersonalized = false;
                    let personalizationButtonText = 'Bindung personalisieren';
                    let personalizationSummaryHTML = '<p><em>Noch nicht personalisiert.</em></p>';


                    if (bindingConfig.personalizationInterface === 'coverEditor') {
                        // NEU: Logik für Cover Editor Status
                        if (persoDataFromState.coverEditorData && persoDataFromState.coverEditorData.thumbnailDataUrl) {
                            isPersonalized = true;
                            personalizationButtonText = 'Buchdecke bearbeiten';
                            personalizationSummaryHTML = `<p style="display:flex; align-items:center; gap:10px;"><em>Buchdecke gestaltet.</em> <img src="${persoDataFromState.coverEditorData.thumbnailDataUrl}" alt="Cover Vorschau" style="height:40px; border:1px solid #ccc;"/></p>`;
                        } else {
                            personalizationButtonText = 'Buchdecke gestalten (Pflicht)';
                        }
                    } else if (bindingConfig.personalizationFields) { // Altes System
                        isPersonalized = bindingConfig.personalizationFields
                            .filter(pf => pf.required)
                            .every(pf => {
                                if (pf.type === 'file' && pf.dependsOn) {
                                    const controllingCheckboxId = pf.dependsOn;
                                    if (persoDataFromState[controllingCheckboxId] === true) {
                                        return persoDataFromState[pf.id] instanceof File || typeof persoDataFromState[pf.id] === 'string';
                                    }
                                    return true;
                                }
                                return persoDataFromState.hasOwnProperty(pf.id) &&
                                       (typeof persoDataFromState[pf.id] === 'boolean' || (persoDataFromState[pf.id] && String(persoDataFromState[pf.id]).trim() !== ''));
                            });
                        if (isPersonalized) {
                            personalizationButtonText = 'Personalisierung bearbeiten';
                            personalizationSummaryHTML = '';
                            bindingConfig.personalizationFields.forEach(field => {
                                if (persoDataFromState[field.id] && field.type !== 'file' && field.type !== 'checkbox') {
                                    personalizationSummaryHTML += `<p><em>${field.label.replace('*', '')}:</em> ${String(persoDataFromState[field.id]).substring(0,30)}${String(persoDataFromState[field.id]).length > 30 ? '...' : ''}</p>`;
                                } else if (field.id === 'cover_useCustomLogo' && persoDataFromState[field.id] === true) {
                                    personalizationSummaryHTML += `<p><em>Logo verwenden:</em> Ja</p>`;
                                    if (persoDataFromState.cover_customLogoFile instanceof File) {
                                        personalizationSummaryHTML += `<p style="padding-left:10px;"><em>Datei:</em> ${persoDataFromState.cover_customLogoFile.name}</p>`;
                                    } else if (typeof persoDataFromState.cover_customLogoFile === 'string') {
                                         personalizationSummaryHTML += `<p style="padding-left:10px;"><em>Datei:</em> ${persoDataFromState.cover_customLogoFile}</p>`;
                                    }
                                } else if (field.id === 'cover_useCustomLogo' && persoDataFromState[field.id] === false) {
                                     personalizationSummaryHTML += `<p><em>Logo verwenden:</em> Nein</p>`;
                                }
                            });
                            if (!personalizationSummaryHTML) personalizationSummaryHTML = '<p><em>Personalisierung abgeschlossen.</em></p>';
                        } else {
                             personalizationButtonText = 'Personalisieren (Pflichtfelder ausfüllen)';
                        }
                    }


                    formHTML += `
                        <div class="personalization-control-area" style="margin-top:10px; margin-bottom:10px; padding:8px; border:1px solid #eee; border-radius:4px;">
                            <button type="button" class="button-secondary personalize-variant-btn ${isPersonalized ? 'status-completed' : 'status-pending'}" data-variant-id="${variant.id}">
                                ${personalizationButtonText}
                            </button>
                            <div class="personalization-summary" style="font-size:0.85em; margin-top:5px;">
                                ${personalizationSummaryHTML}
                            </div>
                        </div>`;
                }

                if (bindingConfig.options && bindingConfig.options.length > 0) {
                    formHTML += '<div class="options-section">';
                    bindingConfig.options.forEach(opt => {
                        formHTML += `<fieldset class="variant-option-group"><legend>${opt.name}</legend>`;
                        if (opt.type === 'checkbox') {
                            formHTML += `<div><label><input type="checkbox" name="option_${opt.optionKey}" data-variant-id="${variant.id}" data-option-key="${opt.optionKey}" ${variant.options[opt.optionKey] ? 'checked' : ''}> ${opt.name} (+${(opt.price||0).toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
                        } else if (opt.type === 'radio') {
                            opt.choices.forEach(choice => {
                                formHTML += `<div><label><input type="radio" name="option_${opt.optionKey}_${variant.id}" data-variant-id="${variant.id}" data-option-key="${opt.optionKey}" value="${choice.id}" ${variant.options[opt.optionKey] === choice.id ? 'checked' : ''}> ${choice.name} (+${(choice.price||0).toFixed(2)}${CALC_CONFIG_REF.general.currencySymbol})</label></div>`;
                            });
                        } else if (opt.type === 'gallery_select') {
                            const selectedValue = variant.options[opt.optionKey];
                            const previewSrc = (selectedValue && opt.imageFolderPath) ? `${opt.imageFolderPath}${selectedValue}` : "";
                            formHTML += `
                                <div class="gallery-select-control">
                                    ${previewSrc ? `<img src="${previewSrc}" alt="${selectedValue}" class="gallery-current-preview-thumb">` : `<div class="gallery-current-preview-thumb placeholder">Bild</div>`}
                                    <button class="button-secondary open-gallery-btn" data-variant-id="${variant.id}" data-option-key="${opt.optionKey}">${opt.name} wählen</button>
                                </div>`;
                        }
                        formHTML += '</fieldset>';
                    });
                    formHTML += '</div>';
                }
            }

            formHTML += `
                <div>
                    <label for="quantity_${variant.id}">Anzahl:</label>
                    <input type="number" id="quantity_${variant.id}" data-variant-id="${variant.id}" min="1" value="${variant.quantity}">
                </div>
                <button class="button-primary apply-item-btn" data-variant-id="${variant.id}">Übernehmen</button>
            `;
            body.innerHTML = formHTML;

            body.querySelector(`#bindingType_${variant.id}`).addEventListener('change', e => handleVariantInputChange(e.target.dataset.variantId, 'bindingTypeId', e.target.value, null, currentBookBlockState));
            body.querySelectorAll('input[type="checkbox"][name^="option_"]').forEach(chk => chk.addEventListener('change', e => handleVariantInputChange(e.target.dataset.variantId, `option_${e.target.dataset.optionKey}`, e.target.checked, null, currentBookBlockState)));
            body.querySelectorAll('input[type="radio"][name^="option_"]').forEach(rad => rad.addEventListener('change', e => { if (e.target.checked) handleVariantInputChange(e.target.dataset.variantId, `option_${e.target.dataset.optionKey}`, e.target.value, null, currentBookBlockState); }));

            body.querySelectorAll('.open-gallery-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const vId = e.target.dataset.variantId;
                    const oKey = e.target.dataset.optionKey;
                    const cVar = configuredVariants.find(v_find => v_find.id === vId);
                    if (!cVar) return;
                    const cBConf = getBindingConfigById(cVar.bindingTypeId);
                    if (!cBConf?.options) return;
                    const gOptConf = cBConf.options.find(o => o.optionKey === oKey && o.type === 'gallery_select');
                    if (gOptConf) {
                        openGalleryModalHelper(vId, gOptConf, cVar.options[oKey] || gOptConf.defaultSelection, currentGalleryContext);
                    }
                });
            });

            // NEU: Logik für den Klick auf den Personalisierungs-Button
            body.querySelectorAll('.personalize-variant-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const variantId = e.target.dataset.variantId;
                    const v = configuredVariants.find(vari => vari.id === variantId);
                    const bConf = getBindingConfigById(v.bindingTypeId);

                    if (v && bConf && bConf.requiresPersonalization) {
                        if (bConf.personalizationInterface === 'coverEditor' && openCoverEditorModalCallback) {
                            openCoverEditorModalCallback(variantId, bConf); // Ruft die neue Funktion in script.js auf
                        } else if (bConf.personalizationFields && openPersonalizationModalCallback) {
                            // Fallback oder für Bindungen, die das alte Modal nutzen
                            openPersonalizationModalCallback(variantId, bConf, inquiryStateRef.personalizations[variantId] || {});
                        } else {
                            console.warn("Kein passender Personalisierungs-Callback gefunden für Bindung:", bConf.id);
                        }
                    }
                });
            });

            body.querySelector(`#quantity_${variant.id}`).addEventListener('input', e => handleVariantInputChange(e.target.dataset.variantId, 'quantity', e.target.value, null, currentBookBlockState));
            body.querySelector('.apply-item-btn').addEventListener('click', e => handleVariantApply(e.target.dataset.variantId));
            itemEl.appendChild(body);
        }
        bindingVariantsContainer_DOM.appendChild(itemEl);
    });
    updateAddVariantButtonState();
}

export function getConfiguredVariants() { return configuredVariants; }
export function getNextVariantId() { return nextVariantId; }

function getConfiguredExtras() {
    if (typeof window.mainAppGetConfiguredExtras === 'function') {
        return window.mainAppGetConfiguredExtras();
    }
    console.warn("getConfiguredExtras in variantHandler could not find global accessor mainAppGetConfiguredExtras.");
    return [];
}
