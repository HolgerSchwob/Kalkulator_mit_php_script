// script.js
// Orchestrates the entire calculator application. V5.0 with Stepper.
// V5.0: Robust initialization by passing DOM elements to modules.

// --- MODULE IMPORTS ---
import { initVariantHandler, updateVariantsUI, getConfiguredVariants, addInitialVariant } from './variantHandler.mjs';
import { initExtrasHandler, updateExtrasUI, getConfiguredExtras } from './extrasHandler.mjs';
import { initPdfHandler } from './pdfHandler.mjs'; 
import { initMobileUIHandler, updateMobileCartUI } from './mobileUIHandler.mjs';
import { initProductionDeliveryHandler } from './productionDeliveryHandler.mjs';
import { initInquiryHandler, openInquiryModal } from './inquiryHandler.mjs';
import { launchEditorForVariant } from './editorHandler.mjs';
import { generateOfferPdf } from './offerGenerator.mjs';
import { validateConfiguration } from './validator.mjs';
import { calculateVariantPrices, calculateExtrasPrices, calculateTotalOrderPrice, calculateBookBlockThickness } from './priceCalculator.mjs';
import { initUiUtils } from './uiUtils.mjs';
import { GlobalWorkerOptions } from './pdf.mjs';

// --- GLOBAL STATE & CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'kalkulator_inquiry_state';

let CALC_CONFIG;
let inquiryState = {
    bookBlock: {
        totalPages: 80,
        paperId: null,
        printMode: 'double_sided',
        hasA3Pages: false,
        a3PagesCount: 0,
        mainPdfFile: null,
        firstPagePreviewUrl: null,
        pdfPageCount: null, // Stores the page count from the analyzed PDF
    },
    variants: [],
    extras: [],
    production: {
        productionTimeId: null,
        deliveryMethodId: null,
    },
    personalizations: {},
    customer: {}
};
let notificationTimeout;
let saveStateTimeout = null;
const SAVE_STATE_DEBOUNCE_MS = 400;

// --- DOM ELEMENT REFERENCES ---
let DOM = {};

// --- STEPPER STATE ---
let currentStep = 1;
let highestCompletedStep = 1;
let stepperPanels;
let stepperNavItems;


// =========================================================================
// LOCAL STORAGE PERSISTENCE (Single Source of Truth in Konfigurationsphase)
// =========================================================================

/**
 * Erstellt eine speicherbare Kopie des States (ohne File/Blob).
 * mainPdfFile wird nie gespeichert – nach Reload muss die Druckdatei erneut hochgeladen werden.
 */
function getStateForStorage() {
    const bookBlock = { ...inquiryState.bookBlock };
    delete bookBlock.mainPdfFile; // File-Objekt nicht serialisierbar
    return {
        bookBlock,
        variants: JSON.parse(JSON.stringify(inquiryState.variants)),
        extras: JSON.parse(JSON.stringify(inquiryState.extras)),
        production: { ...inquiryState.production },
        personalizations: JSON.parse(JSON.stringify(inquiryState.personalizations)),
        customer: typeof inquiryState.customer === 'object' ? { ...inquiryState.customer } : {}
    };
}

/**
 * Speichert den aktuellen State in localStorage (debounced).
 * Bei QuotaExceededError wird ein reduzierter State ohne große Data-URLs versucht.
 */
function saveStateToStorage() {
    if (saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        saveStateTimeout = null;
        try {
            const data = getStateForStorage();
            const json = JSON.stringify(data);
            localStorage.setItem(LOCAL_STORAGE_KEY, json);
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                try {
                    const data = getStateForStorage();
                    if (data.bookBlock.firstPagePreviewUrl) data.bookBlock.firstPagePreviewUrl = null;
                    Object.keys(data.personalizations || {}).forEach(id => {
                        if (data.personalizations[id].editorData) {
                            data.personalizations[id].editorData.thumbnailDataUrl = null;
                            if (data.personalizations[id].editorData.svgString && data.personalizations[id].editorData.svgString.length > 50000) {
                                data.personalizations[id].editorData.svgString = null;
                            }
                        }
                    });
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                } catch (e2) {
                    console.warn('localStorage: Speichern auch reduziert fehlgeschlagen.', e2);
                }
            } else {
                console.warn('localStorage: Speichern fehlgeschlagen.', e);
            }
        }
    }, SAVE_STATE_DEBOUNCE_MS);
}

/**
 * Lädt den gespeicherten State aus localStorage.
 * @returns {object|null} Gespeichertes Objekt oder null.
 */
function loadStateFromStorage() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('localStorage: Laden fehlgeschlagen.', e);
        return null;
    }
}

/**
 * Wendet einen aus localStorage geladenen State auf inquiryState an.
 * mainPdfFile bleibt absichtlich null (Druckdatei muss erneut hochgeladen werden).
 */
function applyLoadedState(loaded) {
    if (!loaded || typeof loaded !== 'object') return;
    if (loaded.bookBlock) {
        Object.assign(inquiryState.bookBlock, loaded.bookBlock);
        inquiryState.bookBlock.mainPdfFile = null; // Nie aus Storage wiederherstellen
    }
    if (Array.isArray(loaded.variants) && loaded.variants.length > 0) {
        inquiryState.variants.length = 0;
        inquiryState.variants.push(...loaded.variants);
    }
    if (Array.isArray(loaded.extras)) {
        inquiryState.extras.length = 0;
        inquiryState.extras.push(...loaded.extras);
    }
    if (loaded.production) {
        Object.assign(inquiryState.production, loaded.production);
    }
    if (loaded.personalizations && typeof loaded.personalizations === 'object') {
        Object.assign(inquiryState.personalizations, loaded.personalizations);
    }
    if (loaded.customer && typeof loaded.customer === 'object') {
        Object.assign(inquiryState.customer, loaded.customer);
    }
}


// =========================================================================
// FUNCTION DEFINITIONS
// =========================================================================

/**
 * Shows a customizable confirmation modal.
 * @param {string} message - The message to display.
 * @param {function} onConfirm - Callback function if the user confirms.
 * @param {function} onCancel - Callback function if the user cancels.
 * @param {string} [confirmText='Beibehalten und Fortfahren'] - Text for the confirm button.
 * @param {string} [cancelText='Ändern'] - Text for the cancel button.
 */
function showConfirmationDialog(message, onConfirm, onCancel, confirmText = 'Beibehalten und Fortfahren', cancelText = 'Ändern') {
    // Set message and button texts
    DOM.confirmationModalMessage.textContent = message;
    DOM.confirmationModalConfirmButton.textContent = confirmText;
    DOM.confirmationModalCancelButton.textContent = cancelText;

    // Define handlers that will be removed after use
    const confirmHandler = () => {
        hideDialog();
        onConfirm();
    };
    const cancelHandler = () => {
        hideDialog();
        onCancel();
    };
    const closeHandler = () => {
        hideDialog();
        // Typically, closing via 'x' should be the same as cancelling
        onCancel();
    };

    const hideDialog = () => {
        DOM.confirmationModalOverlay.classList.remove('active');
        DOM.confirmationModalConfirmButton.removeEventListener('click', confirmHandler);
        DOM.confirmationModalCancelButton.removeEventListener('click', cancelHandler);
        DOM.closeConfirmationModalButton.removeEventListener('click', closeHandler);
    };

    // Attach one-time event listeners
    DOM.confirmationModalConfirmButton.addEventListener('click', confirmHandler, { once: true });
    DOM.confirmationModalCancelButton.addEventListener('click', cancelHandler, { once: true });
    DOM.closeConfirmationModalButton.addEventListener('click', closeHandler, { once: true });

    // Show the modal
    DOM.confirmationModalOverlay.classList.add('active');
}


/**
 * Dynamically adds CSS for highlighting elements with validation errors.
 */
function addHighlightStyle() {
    const styleId = 'dynamic-highlight-style';
    if (document.getElementById(styleId)) return; // Style already added

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .element-focus-highlight {
            transition: border-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out;
            border: 2px solid #d9534f !important;
            box-shadow: 0 0 10px rgba(217, 83, 79, 0.5) !important;
            border-radius: 5px; /* Ensure rounded corners are visible */
        }
    `;
    document.head.appendChild(style);
}

/**
 * Caches references to ALL DOM elements needed by the application.
 */
function cacheDomElements() {
    DOM = {
        // General elements
        totalPagesInput: document.getElementById('totalPages'),
        printModeRadios: document.querySelectorAll('input[name="printMode"]'),
        bookBlockOptionsContainer: document.getElementById('bookBlockOptionsContainer'),
        bookBlockThicknessInfo: document.getElementById('bookBlockThicknessInfo'),
        hasA3PagesCheckbox: document.getElementById('hasA3Pages'),
        a3PagesCountContainer: document.getElementById('a3PagesCountContainer'),
        a3PagesCountInput: document.getElementById('a3PagesCount'),
        cartItemsContainerDesktop: document.getElementById('cartItemsContainerDesktop'),
        orderTotalDesktop: document.getElementById('orderTotalDesktop'),
        addVariantButton: document.getElementById('addVariantButton'),
        addExtraButton: document.getElementById('addExtraButton'),
        downloadOfferPdfButton: document.getElementById('downloadOfferPdfButton'),
        startInquiryButton: document.getElementById('startInquiryButton'),
        stepperNav: document.getElementById('stepperNav'),
        
        // PDF Handler Elements
        pdfAnalysisModalOverlay: document.getElementById('pdfAnalysisModalOverlay'),
        closePdfAnalysisModalButton: document.getElementById('closePdfAnalysisModalButton'),
        modalPdfFile: document.getElementById('modalPdfFile'),
        modalLoadingMessage: document.getElementById('modalLoadingMessage'),
        modalAnalysisResultArea: document.getElementById('modalAnalysisResultArea'),
        modalAnalysisResultText: document.getElementById('modalAnalysisResultText'),
        modalPreviewContainer: document.getElementById('modalPreviewContainer'),
        modalPreviewCanvas: document.getElementById('modalPreviewCanvas'),
        applyPdfDataButton: document.getElementById('applyPdfDataButton'),
        cancelPdfAnalysisButton: document.getElementById('cancelPdfAnalysisButton'),
        uploadAndAnalyzePdfBtn: document.getElementById('uploadAndAnalyzePdfBtn'),
        mainPdfStatusInBookBlock: document.getElementById('mainPdfStatusInBookBlock'),

        // Inquiry Handler Elements
        inquiryModalOverlay: document.getElementById('inquiryModalOverlay'),
        closeInquiryModalButton: document.getElementById('closeInquiryModalButton'),
        inquiryModalTitle: document.getElementById('inquiryModalTitle'),
        inquiryModalBody: document.getElementById('inquiryModalBody'),
        inquiryModalFooter: document.getElementById('inquiryModalFooter'),
        inquiryStepCustomerData: document.getElementById('inquiryStepCustomerData'),
        inquiryCustomerForm: document.getElementById('inquiryCustomerForm'),
        inquiryStepDeliveryAddress: document.getElementById('inquiryStepDeliveryAddress'),
        displaySelectedDeliveryMethod: document.getElementById('displaySelectedDeliveryMethod'),
        inquiryShippingAddressFields: document.getElementById('inquiryShippingAddressFields'),
        noAddressNeededInfo: document.getElementById('noAddressNeededInfo'),
        inquiryStepFinalReview: document.getElementById('inquiryStepFinalReview'),
        inquiryFinalSummaryDetails: document.getElementById('inquiryFinalSummaryDetails'),
        inquiryFinalTotal: document.getElementById('inquiryFinalTotal'),
        inquiryAcceptTerms: document.getElementById('inquiryAcceptTerms'),
        inquiryModalBackButton: document.getElementById('inquiryModalBackButton'),
        inquiryModalNextButton: document.getElementById('inquiryModalNextButton'),
        submitInquiryFormButton: document.getElementById('submitInquiryFormButton'),
        cancelInquiryModalButton: document.getElementById('cancelInquiryModalButton'),
        
        // Confirmation Modal Elements
        confirmationModalOverlay: document.getElementById('confirmationModalOverlay'),
        closeConfirmationModalButton: document.getElementById('closeConfirmationModalButton'),
        confirmationModalMessage: document.getElementById('confirmationModalMessage'),
        confirmationModalConfirmButton: document.getElementById('confirmationModalConfirmButton'),
        confirmationModalCancelButton: document.getElementById('confirmationModalCancelButton'),
        
        // Loading Overlay
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loading-text'),
    };
}


/**
 * Initializes the stepper logic.
 */
function initStepper() {
    stepperPanels = document.querySelectorAll('.stepper-panel');
    stepperNavItems = document.querySelectorAll('.stepper-nav-item');

    stepperPanels.forEach(panel => {
        const prevButton = panel.querySelector('.stepper-btn-prev');
        const nextButton = panel.querySelector('.stepper-btn-next');

        if (prevButton) {
            prevButton.addEventListener('click', () => navigateToStep(currentStep - 1));
        }
        if (nextButton) {
            nextButton.addEventListener('click', () => navigateToStep(currentStep + 1));
        }
    });

    stepperNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetStep = parseInt(e.target.dataset.step, 10);
            if (targetStep <= highestCompletedStep) {
                navigateToStep(targetStep);
            }
        });
    });

    navigateToStep(1);
}

/**
 * Navigates to a specific step and optionally focuses on an element.
 * @param {number} stepNumber The step to navigate to.
 * @param {string|null} focusElementId The ID of the element to scroll to and highlight.
 */
function navigateToStep(stepNumber, focusElementId = null) {
    if (stepNumber < 1 || stepNumber > stepperPanels.length) return;
    
    currentStep = stepNumber;
    if (currentStep > highestCompletedStep) {
        highestCompletedStep = currentStep;
    }

    stepperPanels.forEach(panel => {
        panel.classList.toggle('active', parseInt(panel.dataset.step, 10) === currentStep);
    });

    stepperNavItems.forEach(item => {
        const itemStep = parseInt(item.dataset.step, 10);
        item.classList.remove('active', 'completed');
        if (itemStep < currentStep) {
            item.classList.add('completed');
        } else if (itemStep === currentStep) {
            item.classList.add('active');
        }
        item.disabled = itemStep > highestCompletedStep;
    });

    // Use a timeout to ensure the panel is visible before scrolling and focusing.
    setTimeout(() => {
        const targetElement = focusElementId ? document.getElementById(focusElementId) : null;
        
        if (targetElement) {
            // Scroll the specific element into view.
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add a temporary highlight effect class.
            targetElement.classList.add('element-focus-highlight');
            setTimeout(() => {
                targetElement.classList.remove('element-focus-highlight');
            }, 2500); // Highlight for 2.5 seconds
        } else {
            // Fallback to scrolling the whole column if no specific element is targeted.
            const configuratorColumn = document.querySelector('.configurator-column');
            if (configuratorColumn) {
                configuratorColumn.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, 100); // A small delay is sometimes necessary for the DOM to update.
}

/**
 * Displays a non-blocking notification message to the user.
 */
function showNotification(message, type = 'error') {
    let notificationBar = document.getElementById('lucy-notification-bar');
    if (!notificationBar) {
        notificationBar = document.createElement('div');
        notificationBar.id = 'lucy-notification-bar';
        notificationBar.style.position = 'fixed';
        notificationBar.style.bottom = '-100px';
        notificationBar.style.left = '50%';
        notificationBar.style.transform = 'translateX(-50%)';
        notificationBar.style.padding = '12px 24px';
        notificationBar.style.borderRadius = '8px';
        notificationBar.style.color = 'white';
        notificationBar.style.zIndex = '2000';
        notificationBar.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        notificationBar.style.transition = 'bottom 0.4s ease-in-out';
        document.body.appendChild(notificationBar);
    }
    notificationBar.textContent = message;
    notificationBar.style.backgroundColor = type === 'error' ? '#d9534f' : '#5cb85c';
    notificationBar.style.bottom = '20px';
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        notificationBar.style.bottom = '-100px';
    }, 5000);
}

/**
 * Main application update function.
 */
function updateApp() {
    if (!CALC_CONFIG) return;
    inquiryState.variants = getConfiguredVariants();
    inquiryState.extras = getConfiguredExtras();
    const calculationResults = getCalculationResults();
    updateAllUIs(calculationResults);
    saveStateToStorage();
}

/**
 * Central function to update all UI components.
 */
function updateAllUIs(calculationResults) {
    updateVariantsUI(calculationResults.variantsWithPrices, inquiryState.bookBlock, inquiryState.personalizations);
    updateExtrasUI(calculationResults.extrasWithPrices);
    updateCartUI(calculationResults);
    updateBookBlockUI(calculationResults.bookBlockThickness);
    updateActionButtons(calculationResults);
}

/**
 * Performs all price calculations.
 */
function getCalculationResults() {
    const { variantsWithPrices } = calculateVariantPrices(inquiryState, CALC_CONFIG);
    const { extrasWithPrices } = calculateExtrasPrices(inquiryState, CALC_CONFIG);
    const totalOrderPrice = calculateTotalOrderPrice(variantsWithPrices, extrasWithPrices, inquiryState, CALC_CONFIG);
    const bookBlockThickness = calculateBookBlockThickness(inquiryState.bookBlock, CALC_CONFIG);
    return { variantsWithPrices, extrasWithPrices, totalOrderPrice, bookBlockThickness };
}

/**
 * Updates UI elements within the book block section.
 */
function updateBookBlockUI(thickness) {
    if (DOM.bookBlockThicknessInfo) {
        DOM.bookBlockThicknessInfo.textContent = thickness > 0 ? `Geschätzte Buchblockdicke: ${thickness.toFixed(2)} mm` : 'Bitte Seitenzahl und Papier wählen.';
    }
    if (DOM.totalPagesInput) DOM.totalPagesInput.value = inquiryState.bookBlock.totalPages;
    if (DOM.a3PagesCountInput) DOM.a3PagesCountInput.value = inquiryState.bookBlock.a3PagesCount;
    if (DOM.hasA3PagesCheckbox) DOM.hasA3PagesCheckbox.checked = inquiryState.bookBlock.hasA3Pages;
    if (DOM.a3PagesCountContainer) DOM.a3PagesCountContainer.classList.toggle('hidden', !inquiryState.bookBlock.hasA3Pages);
}

/**
 * Renders dynamic options for the book block.
 */
function renderBookBlockOptions() {
    let paperOptionsHTML = `<fieldset class="bookblock-options-group"><legend>Papiersorte (A4)</legend>`;
    CALC_CONFIG.papers.forEach(paper => {
        const isChecked = paper.id === inquiryState.bookBlock.paperId;
        paperOptionsHTML += `<div><label><input type="radio" name="paperType" value="${paper.id}" ${isChecked ? 'checked' : ''}> ${paper.name}</label></div>`;
    });
    paperOptionsHTML += '</fieldset>';
    if (DOM.bookBlockOptionsContainer) {
        DOM.bookBlockOptionsContainer.innerHTML = paperOptionsHTML;
    }
}

/**
 * Updates the shopping cart view for both desktop and mobile.
 */
function updateCartUI({ variantsWithPrices, extrasWithPrices, totalOrderPrice }) {
    if (!DOM.cartItemsContainerDesktop || !DOM.orderTotalDesktop) return;
    let cartItemsHTML = '';
    if (variantsWithPrices.length > 0) {
        variantsWithPrices.forEach((variant) => {
            const personalizationData = inquiryState.personalizations[variant.id] || {};
            let thumb = (personalizationData.editorData && personalizationData.editorData.thumbnailDataUrl)
                ? `<img src="${personalizationData.editorData.thumbnailDataUrl}" alt="Vorschau" class="cart-item-binding-thumbnail">`
                : (inquiryState.bookBlock.firstPagePreviewUrl ? `<img src="${inquiryState.bookBlock.firstPagePreviewUrl}" alt="Vorschau" class="cart-item-binding-thumbnail">` : '');
            const bindingConfig = CALC_CONFIG.bindings.find(b => b.id === variant.bindingTypeId);
            const buttonText = (bindingConfig && bindingConfig.requiresPersonalization && personalizationData.editorData) ? 'Buchdecke bearbeiten' : 'Buchdecke personalisieren';
            const buttonHTML = (bindingConfig && bindingConfig.requiresPersonalization) ? `<button class="button-secondary button-small edit-personalization-btn" data-variant-id="${variant.id}" style="margin-top: 5px;">${buttonText}</button>` : '';
           console.log("Button HTML:", buttonHTML); // Hinzugefügt
            cartItemsHTML += `<div class="cart-item" style="display: flex; gap: 15px; align-items: flex-start;" id="variant-item-${variant.id}">
                                ${thumb}
                                <div>
                                    <p><strong>${variant.quantity} x ${variant.name}</strong></p>
                                    <p style="font-size: 0.9em; color: #555;">(Stückpreis: ${variant.unitPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol})</p>
                                    <div class="variant-item-details"><p class="item-price">Gesamt: ${variant.totalPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div>
                                </div>
                                ${buttonHTML}
                            </div>`;
        });
    }
    if (extrasWithPrices.length > 0) {
        cartItemsHTML += '<h4>Extras</h4>';
        extrasWithPrices.forEach(extra => { cartItemsHTML += `<div class="cart-item"><p><strong>${extra.quantity}x ${extra.name}</strong></p><div class="extra-item-details"><p class="item-price">Gesamt: ${extra.totalPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`; });
    }
    let serviceCostsHTML = '';
    const serviceFee = CALC_CONFIG.general.orderBaseFee;
    const prodTime = CALC_CONFIG.productionAndDelivery.productionTimes.find(p => p.id === inquiryState.production.productionTimeId);
    const delivery = CALC_CONFIG.productionAndDelivery.deliveryMethods.find(d => d.id === inquiryState.production.deliveryMethodId);
    if (serviceFee > 0 || prodTime?.price > 0 || delivery?.price > 0) {
        serviceCostsHTML += '<h4>Service & Versand</h4>';
        if (serviceFee > 0) serviceCostsHTML += `<div class="cart-item"><p><strong>Datenprüfung</strong></p><div class="variant-item-details"><p class="item-price">${serviceFee.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
        if (prodTime?.price > 0) serviceCostsHTML += `<div class="cart-item"><p><strong>${prodTime.name}</strong></p><div class="variant-item-details"><p class="item-price">${prodTime.price.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
        if (delivery?.price > 0) serviceCostsHTML += `<div class="cart-item"><p><strong>${delivery.name}</strong></p><div class="variant-item-details"><p class="item-price">${delivery.price.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
    }
    cartItemsHTML += serviceCostsHTML;
    DOM.cartItemsContainerDesktop.innerHTML = cartItemsHTML;
    DOM.orderTotalDesktop.textContent = totalOrderPrice.toFixed(2);
    updateMobileCartUI(cartItemsHTML, totalOrderPrice, CALC_CONFIG.general.currencySymbol);
}

/**
 * Updates the state of the main action buttons.
 */
function updateActionButtons(calculationResults) {
    const isReadyForInquiry = calculationResults.totalOrderPrice > 0 && inquiryState.variants.length > 0;
    const isReadyForOffer = calculationResults.totalOrderPrice > 0;

    if (DOM.downloadOfferPdfButton) {
        // Offer button is enabled as soon as there is a price.
        DOM.downloadOfferPdfButton.disabled = !isReadyForOffer;
    }
    if (DOM.startInquiryButton) {
        // Inquiry button requires a basic configuration to be enabled. Full validation happens on click.
        DOM.startInquiryButton.disabled = !isReadyForInquiry;
    }
}

/**
 * Callback from PDF handler.
 */
function handlePdfAnalysisApply(analysisData) {
    inquiryState.bookBlock.totalPages = analysisData.calculatedA4Pages;
    // Store the original page count from the PDF separately.
    inquiryState.bookBlock.pdfPageCount = analysisData.calculatedA4Pages;
    inquiryState.bookBlock.a3PagesCount = analysisData.a3PageCount;
    inquiryState.bookBlock.hasA3Pages = analysisData.a3PageCount > 0;
    inquiryState.bookBlock.mainPdfFile = analysisData.fileObject;
    inquiryState.bookBlock.firstPagePreviewUrl = analysisData.firstPagePreviewDataURL;
    updateApp();
}

/**
 * Opens the editor for a specific variant.
 */
function openEditorForVariant(variantId) {
    const variant = inquiryState.variants.find(v => v.id === variantId);
    if (!variant) return;
    const bindingConfig = CALC_CONFIG.bindings.find(b => b.id === variant.bindingTypeId);
    if (!bindingConfig) return;
    const spineWidth = calculateBookBlockThickness(inquiryState.bookBlock, CALC_CONFIG);
    if (spineWidth < CALC_CONFIG.general.absoluteMinThicknessMm) {
        alert(`Die Buchblockdicke (${spineWidth.toFixed(2)}mm) ist zu gering für diese Bindung.`);
        return;
    }
    // KORREKTUR: Wir müssen dem Editor das 'parameters'-Objekt übergeben, nicht das gesamte 'editorData'-Objekt.
    const existingPersonalizationParameters = inquiryState.personalizations[variantId]?.editorData?.parameters;
    launchEditorForVariant(variant, bindingConfig, spineWidth, existingPersonalizationParameters, handleEditorSubmit);
}

/**
 * Callback from SVG editor.
 */
function handleEditorSubmit(variantId, editorResult) {
    const spineWidthAtCreation = calculateBookBlockThickness(inquiryState.bookBlock, CALC_CONFIG);
    if (!inquiryState.personalizations[variantId]) {
        inquiryState.personalizations[variantId] = {};
    }
    inquiryState.personalizations[variantId].editorData = editorResult;
    inquiryState.personalizations[variantId].spineWidthAtCreation = spineWidthAtCreation;
    updateApp();
}

/**
 * Handles the click on the "Start Inquiry" button, checking for page mismatches and then validating.
 */
function handleStartInquiry() {
    const pdfUploaded = inquiryState.bookBlock.mainPdfFile;
    const pdfPageCount = inquiryState.bookBlock.pdfPageCount;
    const manualPageCount = inquiryState.bookBlock.totalPages;

    // First, check for page count mismatch if a PDF has been uploaded and analyzed.
    if (pdfUploaded && pdfPageCount !== null && pdfPageCount !== manualPageCount) {
        showConfirmationDialog(
            `Die Seitenzahl im Formular (${manualPageCount}) stimmt nicht mit Ihrer hochgeladenen Druckdatei (${pdfPageCount}) überein.`,
            () => { // On Confirm ("Beibehalten") -> Proceed with the current (manual) page count
                proceedWithFullValidation();
            },
            () => { // On Cancel ("Ändern") -> Correct the page number and navigate
                inquiryState.bookBlock.totalPages = pdfPageCount;
                updateApp();
                navigateToStep(1, 'totalPages');
            },
            "Manuelle Zahl beibehalten",
            "Zahl aus PDF übernehmen"
        );
    } else {
        // If no mismatch, proceed directly to the main validation.
        proceedWithFullValidation();
    }
}

/**
 * Runs the main validation checks (PDF exists, personalizations are done).
 */
function proceedWithFullValidation() {
    const validationResult = validateConfiguration(inquiryState, CALC_CONFIG);
    if (validationResult.isValid) {
        const calculationResults = getCalculationResults();
        openInquiryModal(inquiryState, calculationResults, CALC_CONFIG);
    } else {
        const firstError = validationResult.errors[0];
        const errorMessage = (typeof firstError === 'string') ? firstError : firstError.message;
        showNotification(errorMessage, 'error');

        const msg = errorMessage.toLowerCase();

        if (msg.includes('druckdatei') || msg.includes('pdf')) {
            navigateToStep(1, 'uploadAndAnalyzePdfBtn');
        } else if (msg.includes('personalisierung') || msg.includes('personalisiert')) {
             //const unpersonalizedVariant = inquiryState.variants.find(variant => {
            // This can be a general personalization error or our new spine width mismatch error
            const problematicVariantId = firstError.variantId;

            const targetVariant = problematicVariantId ? inquiryState.variants.find(v => v.id === problematicVariantId) : inquiryState.variants.find(variant => {

                const bindingConfig = CALC_CONFIG.bindings.find(b => b.id === variant.bindingTypeId);
                return bindingConfig && bindingConfig.requiresPersonalization && !inquiryState.personalizations[variant.id];
            });
            if (targetVariant) {
                const variantElementId = `variant-item-${targetVariant.id}`;
                navigateToStep(2, variantElementId);
            } else {
                navigateToStep(2);
            }
        } else {
            console.warn("Could not map error to a specific step:", errorMessage);
            navigateToStep(4);
        }
    }
}


/**
 * Binds all event listeners.
 */
function bindEventListeners() {
    // This listener handles all number inputs across the app
    document.body.addEventListener('click', e => {
        if (e.target.matches('.btn-number')) {
            const type = e.target.dataset.type;
            const fieldName = e.target.dataset.field;
            const input = document.getElementById(fieldName);
            if (!input) return;

            let currentValue = parseInt(input.value, 10) || 0;
            const minValue = parseInt(input.min, 10);
            const step = 1;

            if (type === 'plus') {
                currentValue += step;
            } else if (type === 'minus') {
                currentValue -= step;
            }
            
            if (!isNaN(minValue) && currentValue < minValue) {
                currentValue = minValue;
            }

            input.value = currentValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // NEU: Event-Delegation, um den "Bearbeiten"-Button im Warenkorb klickbar zu machen.
        const cartEditButton = e.target.closest('.edit-personalization-btn');
        if (cartEditButton) {
            e.preventDefault();
            const variantId = cartEditButton.dataset.variantId;
            if (variantId) openEditorForVariant(variantId);
        }
    });

    if (DOM.totalPagesInput) {
        DOM.totalPagesInput.addEventListener('input', e => { inquiryState.bookBlock.totalPages = parseInt(e.target.value, 10) || 0; updateApp(); });
    }
    if (DOM.printModeRadios) {
        DOM.printModeRadios.forEach(radio => radio.addEventListener('change', e => { inquiryState.bookBlock.printMode = e.target.value; updateApp(); }));
    }
    if (DOM.bookBlockOptionsContainer) {
        DOM.bookBlockOptionsContainer.addEventListener('change', e => { if (e.target.name === 'paperType') { inquiryState.bookBlock.paperId = e.target.value; updateApp(); } });
    }
    if (DOM.hasA3PagesCheckbox) {
        DOM.hasA3PagesCheckbox.addEventListener('change', e => { inquiryState.bookBlock.hasA3Pages = e.target.checked; if (!e.target.checked) inquiryState.bookBlock.a3PagesCount = 0; updateApp(); });
    }
    if (DOM.a3PagesCountInput) {
        DOM.a3PagesCountInput.addEventListener('input', e => { inquiryState.bookBlock.a3PagesCount = parseInt(e.target.value, 10) || 0; if (inquiryState.bookBlock.a3PagesCount > 0) inquiryState.bookBlock.hasA3Pages = true; updateApp(); });
    }
    if(DOM.downloadOfferPdfButton) {
        // The offer button no longer requires validation.
        DOM.downloadOfferPdfButton.addEventListener('click', () => {
            const calculationResults = getCalculationResults();
            generateOfferPdf(inquiryState, calculationResults, CALC_CONFIG);
        });
    }
    if(DOM.startInquiryButton) {
       // The inquiry button keeps its validation logic.
       DOM.startInquiryButton.addEventListener('click', handleStartInquiry);
    }
}


// =========================================================================
// APPLICATION INITIALIZATION
// =========================================================================

/**
 * Initializes the entire application.
 */
async function main() {
    GlobalWorkerOptions.workerSrc = `./pdf.worker.mjs`;
    try {
        const response = await fetch('./config.json');
        if (!response.ok) throw new Error(`Failed to load config.json: ${response.statusText}`);
        CALC_CONFIG = await response.json();
        console.log("✅ Config loaded.");

        cacheDomElements();
        addHighlightStyle(); // Add the dynamic CSS for highlighting errors.

        inquiryState.bookBlock.paperId = CALC_CONFIG.papers[0]?.id;
        inquiryState.production.productionTimeId = CALC_CONFIG.productionAndDelivery.productionTimes.find(p => p.default)?.id;
        inquiryState.production.deliveryMethodId = CALC_CONFIG.productionAndDelivery.deliveryMethods.find(d => d.default)?.id;

        const savedState = loadStateFromStorage();
        if (savedState) {
            applyLoadedState(savedState);
            console.log("✅ Gespeicherte Konfiguration aus localStorage wiederhergestellt.");
        }

        renderBookBlockOptions();
        
        // init-Funktionen der Module werden jetzt sicher aufgerufen.
        initVariantHandler(
            CALC_CONFIG, 
            updateApp, 
            inquiryState, 
            openEditorForVariant,
            DOM.addVariantButton
        );
        initExtrasHandler(
            CALC_CONFIG, 
            updateApp, 
            inquiryState,
            DOM.addExtraButton
        );
        initPdfHandler({
            overlay: DOM.pdfAnalysisModalOverlay,
            closeButton: DOM.closePdfAnalysisModalButton,
            modalFileInput: DOM.modalPdfFile,
            loadingMessage: DOM.modalLoadingMessage,
            resultArea: DOM.modalAnalysisResultArea,
            resultText: DOM.modalAnalysisResultText,
            previewContainer: DOM.modalPreviewContainer,
            previewCanvas: DOM.modalPreviewCanvas,
            applyButton: DOM.applyPdfDataButton,
            cancelButton: DOM.cancelPdfAnalysisButton,
            openModalButton: DOM.uploadAndAnalyzePdfBtn,
            mainPdfStatus: DOM.mainPdfStatusInBookBlock,
        }, handlePdfAnalysisApply);
        initMobileUIHandler();
        initProductionDeliveryHandler(CALC_CONFIG, updateApp, inquiryState);
        initInquiryHandler({
            overlay: DOM.inquiryModalOverlay,
            closeButton: DOM.closeInquiryModalButton,
            title: DOM.inquiryModalTitle,
            body: DOM.inquiryModalBody,
            footer: DOM.inquiryModalFooter,
            customerDataStep: DOM.inquiryStepCustomerData,
            customerForm: DOM.inquiryCustomerForm,
            deliveryAddressStep: DOM.inquiryStepDeliveryAddress,
            selectedDeliveryMethodDisplay: DOM.displaySelectedDeliveryMethod,
            shippingAddressFields: DOM.inquiryShippingAddressFields,
            noAddressNeededInfo: DOM.noAddressNeededInfo,
            finalReviewStep: DOM.inquiryStepFinalReview,
            finalSummaryDetails: DOM.inquiryFinalSummaryDetails,
            finalTotal: DOM.inquiryFinalTotal,
            acceptTermsCheckbox: document.getElementById('inquiryAcceptTerms'),
            backButton: DOM.inquiryModalBackButton,
            nextButton: DOM.inquiryModalNextButton,
            submitButton: DOM.submitInquiryFormButton,
            cancelButton: DOM.cancelInquiryModalButton,
            // Pass the loading overlay element to the handler
            loadingOverlay: DOM.loadingOverlay,
        });

        addInitialVariant(); 
        bindEventListeners();
        initStepper(); 
        updateApp();
        
        console.log("🚀 Application initialized successfully with Smart Stepper.");
    } catch (error) {
        console.error("❌ Fatal Error during app initialization:", error);
        document.body.innerHTML = `<div style="padding:20px;text-align:center;color:red;"><h1>Fehler</h1><p>Anwendung konnte nicht gestartet werden.</p><p><em>${error.message}</em></p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', main);
