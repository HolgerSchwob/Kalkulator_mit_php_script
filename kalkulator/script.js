// script.js
// Orchestrates the entire calculator application. V5.0 with Stepper.
// V5.0: Robust initialization by passing DOM elements to modules.

// --- MODULE IMPORTS ---
import { initVariantHandler, updateVariantsUI, getConfiguredVariants, addInitialVariant } from './variantHandler.mjs';
import { initExtrasHandler, updateExtrasUI, getConfiguredExtras } from './extrasHandler.mjs';
import { initPdfHandler } from './pdfHandler.mjs'; 
import { initMobileUIHandler } from './mobileUIHandler.mjs';
import { initCartHandler, updateCartUI } from './cartHandler.mjs';
import { initProductionDeliveryHandler, refreshProductionDeliveryUI } from './productionDeliveryHandler.mjs';
import { openLieferzeitenModal } from './lieferzeitenModal.mjs';
import { initInquiryHandler, openInquiryModal } from './inquiryHandler.mjs';
import { launchEditorForVariant } from './editorHandler.mjs';
import { generateOfferPdf } from './offerGenerator.mjs';
import { validateConfiguration } from './validator.mjs';
import { calculateVariantPrices, calculateExtrasPrices, calculateTotalOrderPrice, calculateBookBlockThickness } from './priceCalculator.mjs';
import { initUiUtils } from './uiUtils.mjs';
import { GlobalWorkerOptions } from './pdf.mjs';
import { updateMainPdfStatusUI } from './bookBlockHandler.mjs';

/** Escaped String für sichere Ausgabe in HTML (XSS-Schutz). */
function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    const t = document.createElement('span');
    t.textContent = String(s);
    return t.innerHTML;
}

// --- GLOBAL STATE & CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'kalkulator_inquiry_state';

let CALC_CONFIG;
/** true, wenn Supabase konfiguriert war, aber get-shop-config fehlgeschlagen ist (Fallback auf config.json). */
let supabaseUnavailable = false;
let inquiryState = {
    bookBlock: {
        totalPages: 80,
        paperId: null,
        printMode: 'double_sided',
        hasA3Pages: false,
        a3PagesCount: 0,
        mainPdfFile: null,
        mainPdfExternalUrl: null, // Bei Dateien > 45 MB: Download-Link ersetzt die Datei
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
        openLieferzeitenModalButton: document.getElementById('openLieferzeitenModalButton'),
        stepperNav: document.getElementById('stepperNav'),
        
        // PDF Handler Elements
        pdfAnalysisModalOverlay: document.getElementById('pdfAnalysisModalOverlay'),
        closePdfAnalysisModalButton: document.getElementById('closePdfAnalysisModalButton'),
        modalPdfFile: document.getElementById('modalPdfFile'),
        pdfModalIntroArea: document.getElementById('pdfModalIntroArea'),
        pdfModalFileName: document.getElementById('pdfModalFileName'),
        pdfModalSummary: document.getElementById('pdfModalSummary'),
        modalLoadingMessage: document.getElementById('modalLoadingMessage'),
        modalAnalysisResultArea: document.getElementById('modalAnalysisResultArea'),
        modalAnalysisResultText: document.getElementById('modalAnalysisResultText'),
        modalPreviewContainer: document.getElementById('modalPreviewContainer'),
        modalPreviewCanvas: document.getElementById('modalPreviewCanvas'),
        applyPdfDataButton: document.getElementById('applyPdfDataButton'),
        cancelPdfAnalysisButton: document.getElementById('cancelPdfAnalysisButton'),
        pdfModalTooLargeArea: document.getElementById('pdfModalTooLargeArea'),
        pdfModalExternalLinkInput: document.getElementById('pdfModalExternalLinkInput'),
        applyPdfLinkButton: document.getElementById('applyPdfLinkButton'),
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
        inquiryStepPaymentMethod: document.getElementById('inquiryStepPaymentMethod'),
        inquiryPaymentMethodStripeWrap: document.getElementById('inquiryPaymentMethodStripeWrap'),
        inquiryPaymentMethodOfflineOnly: document.getElementById('inquiryPaymentMethodOfflineOnly'),
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

    // Beim Schrittwechsel immer von oben anzeigen (kein Scroll nach unten)
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const targetElement = focusElementId ? document.getElementById(focusElementId) : null;
        if (targetElement) {
            targetElement.classList.add('element-focus-highlight');
            setTimeout(() => targetElement.classList.remove('element-focus-highlight'), 2500);
        }
    }, 100);
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
    refreshProductionDeliveryUI();
    updateVariantsUI(calculationResults.variantsWithPrices, inquiryState.bookBlock, inquiryState.personalizations);
    updateExtrasUI(calculationResults.extrasWithPrices);
    updateCartUI(calculationResults, inquiryState, CALC_CONFIG);
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
    const pdfFileName = inquiryState.bookBlock.mainPdfFile?.name
        || (inquiryState.bookBlock.mainPdfExternalUrl ? 'Druckdatei per Link' : null);
    updateMainPdfStatusUI(pdfFileName);
}

/**
 * Renders dynamic options for the book block.
 * Wenn das Container-Element bereits ein Fieldset mit option-card-group ist (statisches HTML),
 * wird nur der checked-Zustand an inquiryState.bookBlock.paperId angepasst.
 */
function renderBookBlockOptions() {
    const container = DOM.bookBlockOptionsContainer;
    if (!container) return;

    const fieldset = container.matches?.('fieldset.option-card-group') ? container : container.querySelector?.('fieldset.option-card-group');
    if (fieldset) {
        const targetId = inquiryState.bookBlock.paperId;
        fieldset.querySelectorAll('input[name="paperType"]').forEach(radio => {
            radio.checked = radio.value === targetId;
        });
        return;
    }

    let paperOptionsHTML = `<fieldset class="bookblock-options-group option-card-group"><legend>Papiersorte (A4)</legend>`;
    CALC_CONFIG.papers.forEach(paper => {
        const isChecked = paper.id === inquiryState.bookBlock.paperId;
        const idAttr = `paper_${String(paper.id).replace(/[^a-z0-9_]/gi, '_')}`;
        const title = escapeHtml(paper.cardTitle || paper.name);
        const desc = escapeHtml(paper.cardDesc || '');
        paperOptionsHTML += `<label class="option-card" for="${idAttr}">
            <input type="radio" class="visually-hidden" name="paperType" id="${idAttr}" value="${escapeHtml(paper.id)}" ${isChecked ? 'checked' : ''}>
            <span class="option-card__title">${title}</span>
            <span class="option-card__desc">${desc}</span>
        </label>`;
    });
    paperOptionsHTML += '</fieldset>';
    container.innerHTML = paperOptionsHTML;
}

/**
 * Updates the state of the main action buttons.
 */
function updateActionButtons(calculationResults) {
    if (supabaseUnavailable) {
        if (DOM.downloadOfferPdfButton) DOM.downloadOfferPdfButton.disabled = true;
        if (DOM.startInquiryButton) DOM.startInquiryButton.disabled = true;
        return;
    }
    const isReadyForInquiry = calculationResults.totalOrderPrice > 0 && inquiryState.variants.length > 0;
    const isReadyForOffer = calculationResults.totalOrderPrice > 0;

    if (DOM.downloadOfferPdfButton) {
        DOM.downloadOfferPdfButton.disabled = !isReadyForOffer;
    }
    if (DOM.startInquiryButton) {
        DOM.startInquiryButton.disabled = !isReadyForInquiry;
    }
}

/**
 * Callback from PDF handler (normale Analyse oder externer Link bei Dateien > 45 MB).
 */
function handlePdfAnalysisApply(analysisData) {
    if (analysisData.externalUrl) {
        inquiryState.bookBlock.mainPdfExternalUrl = analysisData.externalUrl;
        inquiryState.bookBlock.mainPdfFile = null;
        inquiryState.bookBlock.pdfPageCount = null;
        inquiryState.bookBlock.firstPagePreviewUrl = null;
        updateApp();
        return;
    }
    inquiryState.bookBlock.mainPdfExternalUrl = null;
    inquiryState.bookBlock.totalPages = analysisData.calculatedA4Pages;
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
async function openEditorForVariant(variantId) {
    const variant = inquiryState.variants.find(v => v.id === variantId);
    if (!variant) return;
    const bindingConfig = CALC_CONFIG.bindings.find(b => b.id === variant.bindingTypeId);
    if (!bindingConfig) return;
    const bookBlockThickness = calculateBookBlockThickness(inquiryState.bookBlock, CALC_CONFIG);
    if (bookBlockThickness < CALC_CONFIG.general.absoluteMinThicknessMm) {
        alert(`Die Buchblockdicke (${bookBlockThickness.toFixed(2)}mm) ist zu gering für diese Bindung.`);
        return;
    }
    const existingPersonalizationParameters = inquiryState.personalizations[variantId]?.editorData?.parameters;
    try {
        await launchEditorForVariant(variant, bindingConfig, bookBlockThickness, existingPersonalizationParameters, handleEditorSubmit);
    } catch (e) {
        console.error('Editor konnte nicht geöffnet werden.', e);
        alert(e.message || 'Editor konnte nicht geöffnet werden.');
    }
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
    if (DOM.openLieferzeitenModalButton) {
        DOM.openLieferzeitenModalButton.addEventListener('click', () => {
            openLieferzeitenModal(CALC_CONFIG, inquiryState, updateApp);
        });
    }
}


// =========================================================================
// APPLICATION INITIALIZATION
// =========================================================================

/**
 * Sortiert Konfigurations-Arrays nach sortOrder (kleinere Zahl = zuerst angezeigt).
 * Einträge ohne sortOrder landen am Ende.
 */
function applySortOrderToConfig(config) {
    if (!config) return;
    const sortByOrder = (arr) => {
        if (!Array.isArray(arr)) return arr;
        return [...arr].sort((a, b) => (Number(a.sortOrder) ?? 999999) - (Number(b.sortOrder) ?? 999999));
    };
    if (config.papers) config.papers = sortByOrder(config.papers);
    if (config.bindings) config.bindings = sortByOrder(config.bindings);
    if (config.extras) config.extras = sortByOrder(config.extras);
    if (config.productionAndDelivery) {
        if (config.productionAndDelivery.productionTimes) config.productionAndDelivery.productionTimes = sortByOrder(config.productionAndDelivery.productionTimes);
        if (config.productionAndDelivery.deliveryMethods) config.productionAndDelivery.deliveryMethods = sortByOrder(config.productionAndDelivery.deliveryMethods);
    }
}

/**
 * Initializes the entire application.
 */
async function loadCalcConfig() {
    supabaseUnavailable = false;
    try {
        const supabaseRes = await fetch('../supabase.config.json?t=' + Date.now());
        if (supabaseRes.ok) {
            const supabaseConfig = await supabaseRes.json();
            const baseUrl = (supabaseConfig.url || '').replace(/\/$/, '');
            const anonKey = supabaseConfig.anonKey || supabaseConfig.key || '';
            if (baseUrl && anonKey) {
                try {
                    const apiRes = await fetch(baseUrl + '/functions/v1/get-shop-config', {
                        headers: {
                            'Authorization': 'Bearer ' + anonKey,
                            'apikey': anonKey
                        }
                    });
                    if (apiRes.ok) {
                        const data = await apiRes.json();
                        if (data && data.config) {
                            CALC_CONFIG = data.config;
                            applySortOrderToConfig(CALC_CONFIG);
                            return;
                        }
                    }
                } catch (_) {
                    console.warn("Supabase get-shop-config nicht erreichbar, Fallback auf config.json.");
                }
                supabaseUnavailable = true;
            }
        }
    } catch (e) {
        console.warn("Supabase-Config nicht verfügbar, Fallback auf config.json:", e.message);
    }
    const response = await fetch('../config.json');
    if (!response.ok) throw new Error(`Failed to load config.json: ${response.statusText}`);
    CALC_CONFIG = await response.json();
    applySortOrderToConfig(CALC_CONFIG);
}

async function main() {
    GlobalWorkerOptions.workerSrc = `./pdf.worker.mjs`;
    try {
        await loadCalcConfig();
        if (!CALC_CONFIG) throw new Error('Konfiguration konnte nicht geladen werden.');

        cacheDomElements();
        addHighlightStyle(); // Add the dynamic CSS for highlighting errors.

        if (supabaseUnavailable) {
            const banner = document.getElementById('configFallbackBanner');
            if (banner) {
                banner.textContent = 'Shop wird mit lokaler Konfiguration angezeigt. Anfragen und Angebote sind deaktiviert. Bitte später erneut versuchen oder die Verbindung prüfen.';
                banner.classList.remove('hidden');
            }
            if (DOM.downloadOfferPdfButton) {
                DOM.downloadOfferPdfButton.disabled = true;
                DOM.downloadOfferPdfButton.title = 'Derzeit deaktiviert: Shop-Konfiguration nicht erreichbar.';
            }
            if (DOM.startInquiryButton) {
                DOM.startInquiryButton.disabled = true;
                DOM.startInquiryButton.title = 'Derzeit deaktiviert: Shop-Konfiguration nicht erreichbar.';
            }
        }

        inquiryState.bookBlock.paperId = CALC_CONFIG.papers[0]?.id;
        inquiryState.production.productionTimeId = CALC_CONFIG.productionAndDelivery.productionTimes.find(p => p.default)?.id;
        inquiryState.production.deliveryMethodId = CALC_CONFIG.productionAndDelivery.deliveryMethods.find(d => d.default)?.id;

        const savedState = loadStateFromStorage();
        if (savedState) {
            applyLoadedState(savedState);
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
            introArea: DOM.pdfModalIntroArea,
            fileNameDisplay: DOM.pdfModalFileName,
            summaryDisplay: DOM.pdfModalSummary,
            loadingMessage: DOM.modalLoadingMessage,
            resultArea: DOM.modalAnalysisResultArea,
            resultText: DOM.modalAnalysisResultText,
            previewContainer: DOM.modalPreviewContainer,
            previewCanvas: DOM.modalPreviewCanvas,
            tooLargeArea: DOM.pdfModalTooLargeArea,
            externalLinkInput: DOM.pdfModalExternalLinkInput,
            applyLinkButton: DOM.applyPdfLinkButton,
            applyButton: DOM.applyPdfDataButton,
            cancelButton: DOM.cancelPdfAnalysisButton,
            openModalButton: DOM.uploadAndAnalyzePdfBtn,
            mainPdfStatus: DOM.mainPdfStatusInBookBlock,
        }, handlePdfAnalysisApply);
        initMobileUIHandler();
        initCartHandler(CALC_CONFIG);
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
            paymentStep: DOM.inquiryStepPaymentMethod,
            paymentMethodStripeWrap: DOM.inquiryPaymentMethodStripeWrap,
            paymentMethodOfflineOnly: DOM.inquiryPaymentMethodOfflineOnly,
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
    } catch (error) {
        console.error("❌ Fatal Error during app initialization:", error);
        document.body.innerHTML = `<div style="padding:20px;text-align:center;color:red;"><h1>Fehler</h1><p>Anwendung konnte nicht gestartet werden.</p><p><em>${escapeHtml(error.message)}</em></p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', main);
