// script.js
// Orchestrates the entire calculator application. V3.3 by Lucy.
// V3.3: Correctly displays all cost components in the cart.

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
let CALC_CONFIG;
let inquiryState = {
    bookBlock: {
        totalPages: 50,
        paperId: null,
        printMode: 'double_sided',
        hasA3Pages: false,
        a3PagesCount: 0,
        mainPdfFile: null,
        firstPagePreviewUrl: null,
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

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    totalPagesInput: document.getElementById('totalPages'),
    printModeRadios: document.querySelectorAll('input[name="printMode"]'),
    bookBlockOptionsContainer: document.getElementById('bookBlockOptionsContainer'),
    bookBlockThicknessInfo: document.getElementById('bookBlockThicknessInfo'),
    hasA3PagesCheckbox: document.getElementById('hasA3Pages'),
    a3PagesCountContainer: document.getElementById('a3PagesCountContainer'),
    a3PagesCountInput: document.getElementById('a3PagesCount'),
    cartItemsContainerDesktop: document.getElementById('cartItemsContainerDesktop'),
    orderTotalDesktop: document.getElementById('orderTotalDesktop'),
    addExtraButton: document.getElementById('addExtraButton'),
    uploadAndAnalyzePdfBtn: document.getElementById('uploadAndAnalyzePdfBtn'),
    downloadOfferPdfButton: document.getElementById('downloadOfferPdfButton'),
    startInquiryButton: document.getElementById('startInquiryButton'),
};

/**
 * Displays a non-blocking notification message to the user.
 * @param {string} message - The message to display.
 * @param {string} type - 'error' or 'success' or 'info'.
 */
function showNotification(message, type = 'error') {
    let notificationBar = document.getElementById('lucy-notification-bar');
    if (!notificationBar) {
        notificationBar = document.createElement('div');
        notificationBar.id = 'lucy-notification-bar';
        // Basic styling
        notificationBar.style.position = 'fixed';
        notificationBar.style.bottom = '-100px'; // Start off-screen
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
}

/**
 * Central function to update all UI components.
 * @param {object} calculationResults - The results from getCalculationResults.
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
    DOM.totalPagesInput.value = inquiryState.bookBlock.totalPages;
    DOM.a3PagesCountInput.value = inquiryState.bookBlock.a3PagesCount;
    DOM.hasA3PagesCheckbox.checked = inquiryState.bookBlock.hasA3Pages;
    DOM.a3PagesCountContainer.classList.toggle('hidden', !inquiryState.bookBlock.hasA3Pages);
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
    DOM.bookBlockOptionsContainer.innerHTML = paperOptionsHTML;
}

/**
 * Updates the shopping cart view for both desktop and mobile.
 */
function updateCartUI({ variantsWithPrices, extrasWithPrices, totalOrderPrice }) {
    if (!DOM.cartItemsContainerDesktop || !DOM.orderTotalDesktop) return;
    
    let cartItemsHTML = '';
    
    // 1. Display products (variants)
    if (variantsWithPrices.length > 0) {
        cartItemsHTML += '<h4>Ihre Produkte</h4>';
        variantsWithPrices.forEach((variant) => {
            const personalizationData = inquiryState.personalizations[variant.id] || {};
            let thumb = (personalizationData.editorData && personalizationData.editorData.thumbnailDataUrl) 
                ? `<img src="${personalizationData.editorData.thumbnailDataUrl}" alt="Vorschau" class="cart-item-binding-thumbnail">` 
                : (inquiryState.bookBlock.firstPagePreviewUrl ? `<img src="${inquiryState.bookBlock.firstPagePreviewUrl}" alt="Vorschau" class="cart-item-binding-thumbnail">` : '');
            
            cartItemsHTML += `
                <div class="cart-item" style="display: flex; gap: 15px; align-items: flex-start;">
                    ${thumb}
                    <div>
                        <p><strong>${variant.quantity} x ${variant.name}</strong></p>
                        <p style="font-size: 0.9em; color: #555;">(Stückpreis: ${variant.unitPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol})</p>
                        <div class="variant-item-details"><p class="item-price">Gesamt: ${variant.totalPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div>
                    </div>
                </div>`;
        });
    }

    // 2. Display extras
    if (extrasWithPrices.length > 0) {
        cartItemsHTML += '<h4>Extras</h4>';
        extrasWithPrices.forEach(extra => { 
            cartItemsHTML += `<div class="cart-item"><p><strong>${extra.quantity}x ${extra.name}</strong></p><div class="extra-item-details"><p class="item-price">Gesamt: ${extra.totalPrice.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`; 
        });
    }
    
    // 3. Display fees and shipping
    let serviceCostsHTML = '';
    const serviceFee = CALC_CONFIG.general.orderBaseFee;
    const prodTime = CALC_CONFIG.productionAndDelivery.productionTimes.find(p => p.id === inquiryState.production.productionTimeId);
    const delivery = CALC_CONFIG.productionAndDelivery.deliveryMethods.find(d => d.id === inquiryState.production.deliveryMethodId);

    if (serviceFee > 0 || prodTime?.price > 0 || delivery?.price > 0) {
        serviceCostsHTML += '<h4>Service & Versand</h4>';
        if (serviceFee > 0) {
            serviceCostsHTML += `<div class="cart-item"><p><strong>Service-Pauschale</strong></p><div class="variant-item-details"><p class="item-price">${serviceFee.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
        }
        if (prodTime?.price > 0) {
            serviceCostsHTML += `<div class="cart-item"><p><strong>${prodTime.name}</strong></p><div class="variant-item-details"><p class="item-price">${prodTime.price.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
        }
        if (delivery?.price > 0) {
            serviceCostsHTML += `<div class="cart-item"><p><strong>${delivery.name}</strong></p><div class="variant-item-details"><p class="item-price">${delivery.price.toFixed(2)} ${CALC_CONFIG.general.currencySymbol}</p></div></div>`;
        }
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
    const isReady = calculationResults.totalOrderPrice > 0 && inquiryState.variants.length > 0;
    DOM.downloadOfferPdfButton.disabled = !isReady;
    DOM.startInquiryButton.disabled = !isReady;
}

/**
 * Callback from PDF handler.
 */
function handlePdfAnalysisApply(analysisData) {
    inquiryState.bookBlock.totalPages = analysisData.calculatedA4Pages;
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
    const existingPersonalization = inquiryState.personalizations[variantId] || {};
    launchEditorForVariant(variant, bindingConfig, spineWidth, existingPersonalization, handleEditorSubmit);
}

/**
 * Callback from SVG editor.
 */
function handleEditorSubmit(variantId, editorResult) {
    if (!inquiryState.personalizations[variantId]) {
        inquiryState.personalizations[variantId] = {};
    }
    inquiryState.personalizations[variantId].editorData = editorResult;
    updateApp();
}

/**
 * Handles the click on the "Start Inquiry" button.
 */
function handleStartInquiry() {
    const validationResult = validateConfiguration(inquiryState, CALC_CONFIG);
    if (validationResult.isValid) {
        const calculationResults = getCalculationResults();
        openInquiryModal(inquiryState, calculationResults, CALC_CONFIG);
    } else {
        showNotification(validationResult.errors[0], 'error');
    }
}

/**
 * Binds all event listeners.
 */
function bindEventListeners() {
    DOM.totalPagesInput.addEventListener('input', e => { inquiryState.bookBlock.totalPages = parseInt(e.target.value, 10) || 0; updateApp(); });
    DOM.printModeRadios.forEach(radio => radio.addEventListener('change', e => { inquiryState.bookBlock.printMode = e.target.value; updateApp(); }));
    DOM.bookBlockOptionsContainer.addEventListener('change', e => { if (e.target.name === 'paperType') { inquiryState.bookBlock.paperId = e.target.value; updateApp(); } });
    DOM.hasA3PagesCheckbox.addEventListener('change', e => { inquiryState.bookBlock.hasA3Pages = e.target.checked; if (!e.target.checked) inquiryState.bookBlock.a3PagesCount = 0; updateApp(); });
    DOM.a3PagesCountInput.addEventListener('input', e => { inquiryState.bookBlock.a3PagesCount = parseInt(e.target.value, 10) || 0; if (inquiryState.bookBlock.a3PagesCount > 0) inquiryState.bookBlock.hasA3Pages = true; updateApp(); });
    DOM.downloadOfferPdfButton.addEventListener('click', () => {
        const calculationResults = getCalculationResults();
        generateOfferPdf(inquiryState, calculationResults, CALC_CONFIG);
    });
    DOM.startInquiryButton.addEventListener('click', handleStartInquiry);
}

/**
 * Initializes the entire application.
 */
async function initApp() {
    GlobalWorkerOptions.workerSrc = `./pdf.worker.mjs`;
    try {
        const response = await fetch('./config.json');
        if (!response.ok) throw new Error(`Failed to load config.json: ${response.statusText}`);
        CALC_CONFIG = await response.json();
        console.log("✅ Config loaded.");

        inquiryState.bookBlock.paperId = CALC_CONFIG.papers[0]?.id;
        inquiryState.production.productionTimeId = CALC_CONFIG.productionAndDelivery.productionTimes.find(p => p.default)?.id;
        inquiryState.production.deliveryMethodId = CALC_CONFIG.productionAndDelivery.deliveryMethods.find(d => d.default)?.id;

        renderBookBlockOptions();
        
        initVariantHandler(CALC_CONFIG, updateApp, inquiryState, openEditorForVariant);
        initExtrasHandler(CALC_CONFIG, updateApp, inquiryState);
        initPdfHandler(handlePdfAnalysisApply);
        initMobileUIHandler();
        initProductionDeliveryHandler(CALC_CONFIG, updateApp, inquiryState);
        initInquiryHandler();

        addInitialVariant(); 
        bindEventListeners();
        updateApp();
        
        console.log("🚀 Application initialized successfully.");
    } catch (error) {
        console.error("❌ Fatal Error during app initialization:", error);
        document.body.innerHTML = `<div style="padding:20px;text-align:center;color:red;"><h1>Fehler</h1><p>Anwendung konnte nicht gestartet werden.</p><p><em>${error.message}</em></p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', initApp);
