// inquiryHandler.mjs
// Manages the multi-step inquiry modal. V1.1 by Lucy.
// V1.1: Implemented dynamic content population for all steps.

// --- MODULE SCOPE VARIABLES ---
let inquiryStateRef;
let calculationResultsRef;
let configRef;
let currentStep = 1;
const totalSteps = 3;

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    overlay: document.getElementById('inquiryModalOverlay'),
    closeButton: document.getElementById('closeInquiryModalButton'),
    cancelButton: document.getElementById('cancelInquiryModalButton'),
    backButton: document.getElementById('inquiryModalBackButton'),
    nextButton: document.getElementById('inquiryModalNextButton'),
    submitButton: document.getElementById('submitInquiryFormButton'),

    // Step Content Divs
    steps: {
        1: document.getElementById('inquiryStepCustomerData'),
        2: document.getElementById('inquiryStepDeliveryAddress'),
        3: document.getElementById('inquiryStepFinalReview'),
    },
    
    // Form Elements & Displays
    customerName: document.getElementById('inquiryCustomerName'),
    customerEmail: document.getElementById('inquiryCustomerEmail'),
    customerPhone: document.getElementById('inquiryCustomerPhone'),
    
    displaySelectedDeliveryMethod: document.getElementById('displaySelectedDeliveryMethod'),
    inquiryShippingAddressFields: document.getElementById('inquiryShippingAddressFields'),
    streetInput: document.getElementById('inquiryStreet'),
    zipInput: document.getElementById('inquiryZip'),
    cityInput: document.getElementById('inquiryCity'),
    noAddressNeededInfo: document.getElementById('noAddressNeededInfo'),

    finalSummaryDetails: document.getElementById('inquiryFinalSummaryDetails'),
    finalTotal: document.getElementById('inquiryFinalTotal'),
    acceptTermsCheckbox: document.getElementById('inquiryAcceptTerms'),
};

/**
 * Populates Step 2 (Delivery Address) with current data.
 */
function populateStep2() {
    const deliveryMethodId = inquiryStateRef.production.deliveryMethodId;
    const deliveryMethod = configRef.productionAndDelivery.deliveryMethods.find(dm => dm.id === deliveryMethodId);

    if (deliveryMethod) {
        DOM.displaySelectedDeliveryMethod.textContent = deliveryMethod.name;
        const needsAddress = deliveryMethod.requiresAddress;

        DOM.inquiryShippingAddressFields.classList.toggle('hidden', !needsAddress);
        DOM.noAddressNeededInfo.classList.toggle('hidden', needsAddress);

        // Make address fields required only if they are visible
        [DOM.streetInput, DOM.zipInput, DOM.cityInput].forEach(input => {
            input.required = needsAddress;
        });
    } else {
        DOM.displaySelectedDeliveryMethod.textContent = "Fehler: Keine Lieferart gewählt.";
    }
}

/**
 * Populates Step 3 (Final Review) with a summary of the configuration.
 */
function populateStep3() {
    let summaryHTML = '<h4>Ihre Konfiguration:</h4>';
    
    // Book Block Summary
    const paper = configRef.papers.find(p => p.id === inquiryStateRef.bookBlock.paperId)?.name || 'N/A';
    summaryHTML += `<p><strong>Buchblock:</strong> ${inquiryStateRef.bookBlock.totalPages} Seiten, Papier: ${paper}</p>`;

    // Variants Summary
    summaryHTML += '<ul>';
    calculationResultsRef.variantsWithPrices.forEach((variant, index) => {
        summaryHTML += `<li>Variante ${index + 1}: ${variant.quantity}x ${variant.name}</li>`;
    });
    summaryHTML += '</ul>';

     // Extras Summary
    if (calculationResultsRef.extrasWithPrices.length > 0) {
        summaryHTML += '<p><strong>Extras:</strong></p><ul>';
        calculationResultsRef.extrasWithPrices.forEach(extra => {
            summaryHTML += `<li>${extra.quantity}x ${extra.name}</li>`;
        });
        summaryHTML += '</ul>';
    }

    DOM.finalSummaryDetails.innerHTML = summaryHTML;
    DOM.finalTotal.textContent = calculationResultsRef.totalOrderPrice.toFixed(2);
}


/**
 * Shows or hides modal steps based on the current step number.
 */
function updateVisibleStep() {
    Object.values(DOM.steps).forEach(stepEl => stepEl.classList.add('hidden'));
    if (DOM.steps[currentStep]) {
        DOM.steps[currentStep].classList.remove('hidden');
    }

    DOM.backButton.classList.toggle('hidden', currentStep === 1);
    DOM.nextButton.classList.toggle('hidden', currentStep === totalSteps);
    DOM.submitButton.classList.toggle('hidden', currentStep !== totalSteps);
    
    // Enable/disable submit button based on checkbox
    DOM.submitButton.disabled = !DOM.acceptTermsCheckbox.checked;
}

/**
 * Navigates to the next step.
 */
function nextStep() {
    if (currentStep === 1) {
        if (!DOM.customerName.value || !DOM.customerEmail.value) {
            alert("Bitte füllen Sie alle Pflichtfelder aus (Name und E-Mail).");
            return;
        }
        inquiryStateRef.customer.name = DOM.customerName.value;
        inquiryStateRef.customer.email = DOM.customerEmail.value;
        inquiryStateRef.customer.phone = DOM.customerPhone.value;
    } else if (currentStep === 2) {
        if(DOM.streetInput.required && (!DOM.streetInput.value || !DOM.zipInput.value || !DOM.cityInput.value)) {
            alert("Bitte geben Sie Ihre vollständige Lieferadresse an.");
            return;
        }
        inquiryStateRef.customer.street = DOM.streetInput.value;
        inquiryStateRef.customer.zip = DOM.zipInput.value;
        inquiryStateRef.customer.city = DOM.cityInput.value;
    }

    if (currentStep < totalSteps) {
        currentStep++;
        if (currentStep === 2) populateStep2();
        if (currentStep === 3) populateStep3();
        updateVisibleStep();
    }
}

/**
 * Navigates to the previous step.
 */
function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateVisibleStep();
    }
}

/**
 * Closes the inquiry modal and resets its state.
 */
function closeModal() {
    currentStep = 1;
    DOM.overlay.classList.remove('active');
}

/**
 * Handles the final submission of the inquiry.
 */
function submitInquiry() {
    if (!DOM.acceptTermsCheckbox.checked) {
        alert("Bitte akzeptieren Sie die AGB und die Datenschutzerklärung.");
        return;
    }
    console.log("Submitting inquiry with final state:", inquiryStateRef);
    alert("Anfrage wird gesendet! (Dies ist eine Simulation)");
    closeModal();
}

/**
 * Opens and prepares the inquiry modal.
 */
export function openInquiryModal(state, calculations, config) {
    inquiryStateRef = state;
    calculationResultsRef = calculations;
    configRef = config;
    
    DOM.customerName.value = inquiryStateRef.customer.name || '';
    DOM.customerEmail.value = inquiryStateRef.customer.email || '';
    DOM.customerPhone.value = inquiryStateRef.customer.phone || '';
    DOM.streetInput.value = inquiryStateRef.customer.street || '';
    DOM.zipInput.value = inquiryStateRef.customer.zip || '';
    DOM.cityInput.value = inquiryStateRef.customer.city || '';
    
    currentStep = 1;
    updateVisibleStep();
    DOM.overlay.classList.add('active');
}

/**
 * Initializes the inquiry handler and its event listeners.
 */
export function initInquiryHandler() {
    DOM.closeButton.addEventListener('click', closeModal);
    DOM.cancelButton.addEventListener('click', closeModal);
    DOM.overlay.addEventListener('click', (e) => {
        if (e.target === DOM.overlay) closeModal();
    });

    DOM.nextButton.addEventListener('click', nextStep);
    DOM.backButton.addEventListener('click', previousStep);
    DOM.submitButton.addEventListener('click', submitInquiry);
    
    // Add listener to the terms checkbox to enable/disable the submit button
    DOM.acceptTermsCheckbox.addEventListener('change', () => {
        if (currentStep === totalSteps) {
            DOM.submitButton.disabled = !DOM.acceptTermsCheckbox.checked;
        }
    });

    console.log("Inquiry Handler Initialized.");
}
