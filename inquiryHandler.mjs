// inquiryHandler.mjs
// Manages the multi-step inquiry modal.
// V3: Receives DOM elements as dependencies and corrected export.
// V4: Added complete submission logic.
// V5: Added loading overlay handling.
// V6: Order submission via Supabase (orders table + storage).

let DOM = {}; // Wird von initInquiryHandler befüllt
let currentStep = 1;
let inquiryStateCache, calculationResultsCache, configCache;

const STORAGE_BUCKET = 'order-files';

/** Generiert eine lesbare Auftragsnummer (z. B. A-20250211-X7K9M2). */
function generateOrderNumber() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `A-${datePart}-${randomPart}`;
}

/** Entfernt nicht serialisierbare Felder aus dem State für die DB. */
function buildPayloadForDb(inquiryState, calculationResults, customerData, shippingData) {
    const inquiryDetails = { ...inquiryState };
    if (inquiryDetails.bookBlock) {
        inquiryDetails.bookBlock = { ...inquiryDetails.bookBlock };
        delete inquiryDetails.bookBlock.mainPdfFile;
    }
    return {
        inquiryDetails,
        priceDetails: calculationResults,
        customerData,
        shippingData,
    };
}
function updateModalStep() {
    if (!DOM.customerDataStep) return;
    DOM.customerDataStep.classList.toggle('hidden', currentStep !== 1);
    DOM.deliveryAddressStep.classList.toggle('hidden', currentStep !== 2);
    DOM.finalReviewStep.classList.toggle('hidden', currentStep !== 3);

    DOM.backButton.classList.toggle('hidden', currentStep === 1);
    DOM.nextButton.classList.toggle('hidden', currentStep === 3);
    DOM.submitButton.classList.toggle('hidden', currentStep !== 3);
}

function nextStep() {
    if (currentStep === 1 && !validateCustomerForm()) {
        alert("Bitte füllen Sie alle Pflichtfelder im Kundenformular aus.");
        return;
    }
    if (currentStep < 3) {
        currentStep++;
        updateModalStep();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateModalStep();
    }
}

function openModal(inquiryState, calculationResults, config) {
    if (!DOM.overlay) return;
    inquiryStateCache = inquiryState;
    calculationResultsCache = calculationResults;
    configCache = config;
    
    currentStep = 1;
    populateModalData();
    updateModalStep();
    DOM.overlay.classList.add('active');
}

function closeModal() {
    if (DOM.overlay) DOM.overlay.classList.remove('active');
}

function populateModalData() {
    if (!configCache) return;
    const deliveryMethod = configCache.productionAndDelivery.deliveryMethods.find(d => d.id === inquiryStateCache.production.deliveryMethodId);
    if (deliveryMethod && DOM.selectedDeliveryMethodDisplay) {
        DOM.selectedDeliveryMethodDisplay.textContent = deliveryMethod.name;
        const needsAddress = deliveryMethod.requiresAddress;
        if(DOM.shippingAddressFields) DOM.shippingAddressFields.classList.toggle('hidden', !needsAddress);
        if(DOM.noAddressNeededInfo) DOM.noAddressNeededInfo.classList.toggle('hidden', needsAddress);
    }

    let summaryHTML = `<p><strong>Ihre Konfiguration:</strong></p><ul>`;
    calculationResultsCache.variantsWithPrices.forEach(v => {
        summaryHTML += `<li>${v.quantity}x ${v.name}</li>`;
    });
    summaryHTML += `</ul>`;
    if(DOM.finalSummaryDetails) DOM.finalSummaryDetails.innerHTML = summaryHTML;
    if(DOM.finalTotal) DOM.finalTotal.textContent = calculationResultsCache.totalOrderPrice.toFixed(2);
}

// --- NEU: Funktion zur Validierung des Kundenformulars ---
function validateCustomerForm() {
    if (!DOM.customerForm) return true; // Wenn kein Formular da ist, nicht validieren
    const requiredFields = DOM.customerForm.querySelectorAll('[required]');
    for (const field of requiredFields) {
        if (!field.value.trim()) {
            return false;
        }
    }
    return true;
}


// --- KORRIGIERT: Die komplette Logik zum Absenden der Anfrage mit Lade-Overlay ---
async function handleSubmit(event) {
    event.preventDefault(); // Verhindert das Standard-Formular-Verhalten

    if (!DOM.acceptTermsCheckbox || !DOM.acceptTermsCheckbox.checked) {
        alert('Bitte akzeptieren Sie die AGB, um fortzufahren.');
        return;
    }

    // Show loading overlay. If it exists, it handles the visual state.
    // If not, fall back to disabling the button.
    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.classList.add('active');
    } else {
        DOM.submitButton.disabled = true;
        DOM.submitButton.textContent = 'Daten werden übermittelt...';
    }

    // 1. Kundendaten und Lieferadresse
    const customerFormData = new FormData(DOM.customerForm);
    const customerData = Object.fromEntries(customerFormData.entries());
    const shippingData = {};
    const deliveryMethod = configCache.productionAndDelivery.deliveryMethods.find(d => d.id === inquiryStateCache.production.deliveryMethodId);
    if (deliveryMethod && deliveryMethod.requiresAddress) {
        const shippingForm = DOM.shippingAddressFields?.querySelector('#inquiryShippingForm');
        if (shippingForm) {
            Object.assign(shippingData, Object.fromEntries(new FormData(shippingForm).entries()));
        }
    }

    const orderId = crypto.randomUUID();
    const orderNumber = generateOrderNumber();
    const payload = buildPayloadForDb(inquiryStateCache, calculationResultsCache, customerData, shippingData);
    const totalPrice = calculationResultsCache.totalOrderPrice;
    const isExpress = inquiryStateCache.production?.productionTimeId === 'prod_express';

    try {
        const { getSupabaseClient } = await import('./supabaseClient.mjs');
        const supabase = await getSupabaseClient();

        const { error: insertError } = await supabase.from('orders').insert({
            id: orderId,
            order_number: orderNumber,
            customer_email: customerData.customerEmail || customerData.email || '',
            customer_name: customerData.customerName || customerData.name || '',
            customer_phone: customerData.customerPhone || customerData.phone || null,
            status: 'Eingegangen',
            total_price: totalPrice,
            is_express: isExpress,
            payload,
            shipping_data: Object.keys(shippingData).length ? shippingData : null,
            main_pdf_storage_path: inquiryStateCache.bookBlock?.mainPdfFile ? `${orderId}/${orderNumber}.pdf` : null,
        });

        if (insertError) throw new Error(insertError.message || 'Auftrag konnte nicht gespeichert werden.');

        const prefix = `${orderId}/`;

        if (inquiryStateCache.bookBlock?.mainPdfFile) {
            const pdfFileName = `${orderNumber}.pdf`;
            const { error: pdfError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(prefix + pdfFileName, inquiryStateCache.bookBlock.mainPdfFile, {
                    contentType: 'application/pdf',
                    upsert: true,
                });
            if (pdfError) console.warn('PDF-Upload Warnung:', pdfError.message);
        }

        for (const variantId in inquiryStateCache.personalizations || {}) {
            const perso = inquiryStateCache.personalizations[variantId];
            if (!perso?.editorData?.svgString) continue;
            const variant = inquiryStateCache.variants.find(v => v.id === variantId);
            const safeName = (variant?.name ?? 'personalisierung').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `personalisierung_${safeName}_${variantId}.svg`;
            const blob = new Blob([perso.editorData.svgString], { type: 'image/svg+xml' });
            const { error: svgError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(prefix + fileName, blob, { contentType: 'image/svg+xml', upsert: true });
            if (svgError) console.warn('SVG-Upload Warnung:', fileName, svgError.message);
        }

        try { localStorage.removeItem('kalkulator_inquiry_state'); } catch (_) {}
        const customerEmail = customerData.customerEmail || customerData.email || '';
        const statusUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html?$/i, '')}auftrag.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(customerEmail)}`;
        alert(`Vielen Dank! Ihre Bestellung wurde erfasst.\n\nIhre Auftragsnummer: ${orderNumber}\n\nÜber den folgenden Link können Sie Ihren Auftragsstatus jederzeit einsehen:\n${statusUrl}`);
        window.location.href = statusUrl;
    } catch (error) {
        console.error('Fehler beim Senden der Bestellung:', error);
        alert(`Es gab ein Problem bei der Übermittlung: ${error.message}`);
        DOM.submitButton.disabled = false;
        DOM.submitButton.textContent = 'Anfrage jetzt absenden';
    } finally {
        if (DOM.loadingOverlay) DOM.loadingOverlay.classList.remove('active');
    }
}


/**
 * Initializes the inquiry handler.
 * @param {object} domElements - An object containing all required DOM elements.
 */
export function initInquiryHandler(domElements) {
    if (!domElements || !domElements.overlay || !domElements.closeButton) {
        console.warn("Inquiry Handler wurde nicht vollständig initialisiert: Wichtige DOM-Elemente fehlen.");
        return;
    }
    DOM = domElements;

    DOM.closeButton.addEventListener('click', closeModal);
    if(DOM.cancelButton) DOM.cancelButton.addEventListener('click', closeModal);
    if(DOM.backButton) DOM.backButton.addEventListener('click', prevStep);
    if(DOM.nextButton) DOM.nextButton.addEventListener('click', nextStep);
    
    if(DOM.submitButton) {
        DOM.submitButton.addEventListener('click', handleSubmit);
    }
    
    DOM.overlay.addEventListener('click', e => {
        if(e.target === DOM.overlay) closeModal();
    });
    
    console.log("✅ Inquiry Handler Initialized.");
}

// Die `openInquiryModal` Funktion wird von script.js importiert und aufgerufen.
export { openModal as openInquiryModal };
