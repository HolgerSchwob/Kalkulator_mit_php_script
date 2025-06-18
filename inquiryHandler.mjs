// inquiryHandler.mjs
// Steuert das mehrstufige Anfrage-Modal (V1.9.6)
// V1.9.6: closeModal exportiert, Debugging für populateDeliveryStep

let inquiryModalOverlay, inquiryModalTitle, inquiryModalBody, inquiryModalFooter,
    closeInquiryModalButton, inquiryModalBackButton, inquiryModalNextButton,
    submitInquiryFormButton, cancelInquiryModalButton;

let inquiryStepCustomerData, inquiryStepDeliveryAddress, inquiryStepFinalReview;
let inquiryCustomerForm, inquiryDeliveryForm, inquiryAcceptTermsCheckbox;
let displaySelectedDeliveryMethod, inquiryShippingAddressFields, noAddressNeededInfo;
let inquiryFinalSummaryDetails, inquiryFinalTotalSpan;
let inquiryCustomerNotesInput;

let currentStep = 1;
let maxSteps = 3;
let calculatorDataForInquiry = null;
let localInquiryState = {};

let onSubmitCallback = null;
let onCancelCallback = null;
let onUpdateDataCallback = null;
let CALC_CONFIG_REF_IH = null;

const STEPS = {
    CUSTOMER_DATA: 1,
    DELIVERY_ADDRESS: 2,
    FINAL_REVIEW: 3
};

export function initInquiryModal(submitCb, cancelCb, updateDataCb, calcConfig) {
    onSubmitCallback = submitCb;
    onCancelCallback = cancelCb;
    onUpdateDataCallback = updateDataCb;
    CALC_CONFIG_REF_IH = calcConfig;

    inquiryModalOverlay = document.getElementById('inquiryModalOverlay');
    inquiryModalTitle = document.getElementById('inquiryModalTitle');
    inquiryModalBody = document.getElementById('inquiryModalBody');
    inquiryModalFooter = document.getElementById('inquiryModalFooter');
    closeInquiryModalButton = document.getElementById('closeInquiryModalButton');
    inquiryModalBackButton = document.getElementById('inquiryModalBackButton');
    inquiryModalNextButton = document.getElementById('inquiryModalNextButton');
    submitInquiryFormButton = document.getElementById('submitInquiryFormButton');
    cancelInquiryModalButton = document.getElementById('cancelInquiryModalButton');

    inquiryStepCustomerData = document.getElementById('inquiryStepCustomerData');
    inquiryStepDeliveryAddress = document.getElementById('inquiryStepDeliveryAddress');
    inquiryStepFinalReview = document.getElementById('inquiryStepFinalReview');

    inquiryCustomerForm = document.getElementById('inquiryCustomerForm');
    inquiryDeliveryForm = document.getElementById('inquiryDeliveryForm');
    inquiryAcceptTermsCheckbox = document.getElementById('inquiryAcceptTerms');
    inquiryCustomerNotesInput = document.getElementById('inquiryCustomerNotes');
    
    displaySelectedDeliveryMethod = document.getElementById('displaySelectedDeliveryMethod');
    inquiryShippingAddressFields = document.getElementById('inquiryShippingAddressFields');
    noAddressNeededInfo = document.getElementById('noAddressNeededInfo');

    inquiryFinalSummaryDetails = document.getElementById('inquiryFinalSummaryDetails');
    inquiryFinalTotalSpan = document.getElementById('inquiryFinalTotal');


    if (!inquiryModalOverlay || !inquiryCustomerForm || !inquiryDeliveryForm || 
        !inquiryAcceptTermsCheckbox || !submitInquiryFormButton || !displaySelectedDeliveryMethod || 
        !inquiryShippingAddressFields || !noAddressNeededInfo || !inquiryFinalSummaryDetails || !inquiryFinalTotalSpan) {
        console.error("Einige Elemente des Anfrage-Modals konnten nicht im DOM gefunden werden! Überprüfe IDs.", {
            inquiryModalOverlay, inquiryCustomerForm, inquiryDeliveryForm, inquiryAcceptTermsCheckbox,
            submitInquiryFormButton, displaySelectedDeliveryMethod, inquiryShippingAddressFields,
            noAddressNeededInfo, inquiryFinalSummaryDetails, inquiryFinalTotalSpan
        });
        return;
    }

    closeInquiryModalButton.addEventListener('click', closeModal);
    cancelInquiryModalButton.addEventListener('click', closeModalAndCancel);
    inquiryModalOverlay.addEventListener('click', (e) => {
        if (e.target === inquiryModalOverlay) closeModalAndCancel();
    });

    inquiryModalBackButton.addEventListener('click', navigateBack);
    inquiryModalNextButton.addEventListener('click', navigateNext);
    submitInquiryFormButton.addEventListener('click', handleSubmit);

    console.log("Anfrage-Modal (inquiryHandler.mjs) V1.9.6 initialisiert (mit Debugging).");
}

export function openInquiryModal(calcData, currentGlobalInquiryState) {
    if (!inquiryModalOverlay) return;
    calculatorDataForInquiry = calcData;
    localInquiryState = JSON.parse(JSON.stringify(currentGlobalInquiryState));
    
    if (inquiryCustomerForm) {
        inquiryCustomerForm.customerName.value = localInquiryState.customerName || '';
        inquiryCustomerForm.customerEmail.value = localInquiryState.customerEmail || '';
        inquiryCustomerForm.customerPhone.value = localInquiryState.customerPhone || '';
        if (inquiryCustomerNotesInput) inquiryCustomerNotesInput.value = localInquiryState.customerNotes || '';
    }
    if(inquiryAcceptTermsCheckbox) inquiryAcceptTermsCheckbox.checked = localInquiryState.agbAccepted || false;


    currentStep = STEPS.CUSTOMER_DATA;
    updateModalStepVisibility();
    updateButtonStates();
    inquiryModalOverlay.classList.add('active');
}

// closeModal wird hier exportiert
export function closeModal() {
    if (inquiryModalOverlay) inquiryModalOverlay.classList.remove('active');
}

function closeModalAndCancel() {
    closeModal();
    if (onCancelCallback) onCancelCallback();
}

function updateModalStepVisibility() {
    inquiryStepCustomerData.classList.toggle('hidden', currentStep !== STEPS.CUSTOMER_DATA);
    inquiryStepDeliveryAddress.classList.toggle('hidden', currentStep !== STEPS.DELIVERY_ADDRESS);
    inquiryStepFinalReview.classList.toggle('hidden', currentStep !== STEPS.FINAL_REVIEW);

    if (currentStep === STEPS.DELIVERY_ADDRESS) populateDeliveryStep();
    if (currentStep === STEPS.FINAL_REVIEW) populateFinalReviewStep();
}

function updateButtonStates() {
    inquiryModalBackButton.classList.toggle('hidden', currentStep === STEPS.CUSTOMER_DATA);
    inquiryModalNextButton.classList.toggle('hidden', currentStep === STEPS.FINAL_REVIEW);
    submitInquiryFormButton.classList.toggle('hidden', currentStep !== STEPS.FINAL_REVIEW);
    submitInquiryFormButton.disabled = (currentStep === STEPS.FINAL_REVIEW && !inquiryAcceptTermsCheckbox.checked);
}

function validateCurrentStep() {
    if (currentStep === STEPS.CUSTOMER_DATA) {
        if (!inquiryCustomerForm.customerName.value.trim() || !inquiryCustomerForm.customerEmail.value.trim()) {
            alert("Bitte geben Sie Ihren Namen und Ihre E-Mail-Adresse ein.");
            return false;
        }
        if (!inquiryCustomerForm.customerEmail.checkValidity()) {
            alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
            return false;
        }
        localInquiryState.customerName = inquiryCustomerForm.customerName.value.trim();
        localInquiryState.customerEmail = inquiryCustomerForm.customerEmail.value.trim();
        localInquiryState.customerPhone = inquiryCustomerForm.customerPhone.value.trim();
        if (inquiryCustomerNotesInput) localInquiryState.customerNotes = inquiryCustomerNotesInput.value.trim();
    } else if (currentStep === STEPS.DELIVERY_ADDRESS) {
        const deliveryMethodId = calculatorDataForInquiry.productionAndDeliveryState.deliveryMethodId;
        const deliveryMethodConfig = CALC_CONFIG_REF_IH.productionAndDelivery.deliveryMethods.find(dm => dm.id === deliveryMethodId);
        if (deliveryMethodConfig && deliveryMethodConfig.requiresAddress) {
            if (!inquiryDeliveryForm.street.value.trim() || !inquiryDeliveryForm.zip.value.trim() || !inquiryDeliveryForm.city.value.trim()) {
                alert("Bitte füllen Sie alle Adressfelder aus.");
                return false;
            }
            if (!/^[0-9]{5}$/.test(inquiryDeliveryForm.zip.value.trim())) {
                 alert("Bitte geben Sie eine gültige 5-stellige Postleitzahl ein.");
                 return false;
            }
            localInquiryState.shippingAddress = {
                street: inquiryDeliveryForm.street.value.trim(),
                zip: inquiryDeliveryForm.zip.value.trim(),
                city: inquiryDeliveryForm.city.value.trim()
            };
        } else {
            localInquiryState.shippingAddress = { street: '', zip: '', city: '' };
        }
    } else if (currentStep === STEPS.FINAL_REVIEW) {
        if (!inquiryAcceptTermsCheckbox.checked) {
            alert("Bitte akzeptieren Sie die AGB und Datenschutzerklärung.");
            return false;
        }
        localInquiryState.agbAccepted = inquiryAcceptTermsCheckbox.checked;
    }
    return true;
}

function navigateNext() {
    if (!validateCurrentStep()) return;
    if (currentStep < maxSteps) {
        currentStep++;
        updateModalStepVisibility();
        updateButtonStates();
    }
}

function navigateBack() {
    if (currentStep > STEPS.CUSTOMER_DATA) {
        currentStep--;
        updateModalStepVisibility();
        updateButtonStates();
    }
}

function populateDeliveryStep() {
    console.log("[inquiryHandler] populateDeliveryStep CALLED. Current Step:", currentStep);

    if (!displaySelectedDeliveryMethod) {
        console.error("[inquiryHandler] displaySelectedDeliveryMethod DOM element is NULL!");
        return;
    }
    if (!calculatorDataForInquiry || !calculatorDataForInquiry.productionAndDeliveryState) {
        console.error("[inquiryHandler] populateDeliveryStep: calculatorDataForInquiry oder calculatorDataForInquiry.productionAndDeliveryState fehlt.");
        displaySelectedDeliveryMethod.textContent = "Fehler: P&D State fehlt.";
        return;
    }
     if (!CALC_CONFIG_REF_IH || !CALC_CONFIG_REF_IH.productionAndDelivery || !CALC_CONFIG_REF_IH.productionAndDelivery.deliveryMethods) {
        console.error("[inquiryHandler] populateDeliveryStep: CALC_CONFIG_REF_IH.productionAndDelivery.deliveryMethods fehlt.");
        displaySelectedDeliveryMethod.textContent = "Fehler: Config (Liefermethoden) fehlt.";
        return;
    }

    const deliveryMethodId = calculatorDataForInquiry.productionAndDeliveryState.deliveryMethodId;
    console.log("[inquiryHandler] deliveryMethodId in populateDeliveryStep:", deliveryMethodId);

    if (typeof deliveryMethodId === 'undefined' || deliveryMethodId === null) {
        console.warn("[inquiryHandler] deliveryMethodId ist undefined oder null.");
        displaySelectedDeliveryMethod.textContent = "Keine Lieferart gewählt";
        if(inquiryShippingAddressFields) inquiryShippingAddressFields.classList.add('hidden');
        if(noAddressNeededInfo) {
            noAddressNeededInfo.classList.remove('hidden');
            noAddressNeededInfo.textContent = "Bitte wählen Sie eine Lieferart im Hauptkalkulator.";
        }
        return;
    }

    const deliveryMethodConfig = CALC_CONFIG_REF_IH.productionAndDelivery.deliveryMethods.find(dm => dm.id === deliveryMethodId);
    console.log("[inquiryHandler] deliveryMethodConfig in populateDeliveryStep:", deliveryMethodConfig);

    if (deliveryMethodConfig) {
        displaySelectedDeliveryMethod.textContent = deliveryMethodConfig.name;
        console.log(`[inquiryHandler] Set displaySelectedDeliveryMethod.textContent to: "${deliveryMethodConfig.name}"`);

        const needsAddress = deliveryMethodConfig.requiresAddress;
        inquiryShippingAddressFields.classList.toggle('hidden', !needsAddress);
        noAddressNeededInfo.classList.toggle('hidden', needsAddress);
        
        if (!needsAddress && noAddressNeededInfo) {
            noAddressNeededInfo.textContent = "Für die gewählte Lieferart ist keine Adressangabe notwendig.";
        }

        Array.from(inquiryShippingAddressFields.querySelectorAll('input')).forEach(input => {
            input.required = needsAddress;
            if (!needsAddress) input.value = '';
        });

        if (needsAddress && localInquiryState.shippingAddress) {
            inquiryDeliveryForm.street.value = localInquiryState.shippingAddress.street || '';
            inquiryDeliveryForm.zip.value = localInquiryState.shippingAddress.zip || '';
            inquiryDeliveryForm.city.value = localInquiryState.shippingAddress.city || '';
        } else if (!needsAddress) {
            if (inquiryDeliveryForm) {
                inquiryDeliveryForm.street.value = '';
                inquiryDeliveryForm.zip.value = '';
                inquiryDeliveryForm.city.value = '';
            }
        }
    } else {
        console.warn(`[inquiryHandler] Lieferart mit ID "${deliveryMethodId}" nicht in Config gefunden.`);
        displaySelectedDeliveryMethod.textContent = `Fehler: Lieferart (${deliveryMethodId}) nicht gefunden.`;
        if(inquiryShippingAddressFields) inquiryShippingAddressFields.classList.add('hidden');
        if(noAddressNeededInfo) {
            noAddressNeededInfo.classList.remove('hidden');
            noAddressNeededInfo.textContent = "Die gewählte Lieferart ist ungültig oder nicht konfiguriert.";
        }
    }
}

function populateFinalReviewStep() {
    if (!calculatorDataForInquiry || !onUpdateDataCallback) {
        inquiryFinalSummaryDetails.innerHTML = "<p>Fehler: Kalkulationsdaten nicht verfügbar.</p>";
        return;
    }
    inquiryAcceptTermsCheckbox.checked = localInquiryState.agbAccepted || false;
    inquiryAcceptTermsCheckbox.onchange = () => {
        submitInquiryFormButton.disabled = !inquiryAcceptTermsCheckbox.checked;
    };
    submitInquiryFormButton.disabled = !inquiryAcceptTermsCheckbox.checked;

    let summaryHTML = `<h4>Ihre Kontaktdaten:</h4>
                       <p>Name: ${localInquiryState.customerName || 'N/A'}</p>
                       <p>E-Mail: ${localInquiryState.customerEmail || 'N/A'}</p>
                       <p>Telefon: ${localInquiryState.customerPhone || 'Nicht angegeben'}</p>`;
    if (localInquiryState.customerNotes) {
        summaryHTML += `<p>Bemerkungen: ${localInquiryState.customerNotes}</p>`;
    }

    const deliveryMethodId = calculatorDataForInquiry.productionAndDeliveryState.deliveryMethodId;
    const deliveryMethodConfig = CALC_CONFIG_REF_IH.productionAndDelivery.deliveryMethods.find(dm => dm.id === deliveryMethodId);
    summaryHTML += `<h4>Lieferung:</h4><p>Lieferart: ${deliveryMethodConfig ? deliveryMethodConfig.name : 'N/A'}</p>`;
    if (deliveryMethodConfig && deliveryMethodConfig.requiresAddress && localInquiryState.shippingAddress) {
        summaryHTML += `<p>Lieferadresse: ${localInquiryState.shippingAddress.street}, ${localInquiryState.shippingAddress.zip} ${localInquiryState.shippingAddress.city}</p>`;
    }

    summaryHTML += `<h4>Konfiguration:</h4>`;
    const bookBlockState = onUpdateDataCallback('getBookBlockState');
    if (bookBlockState) {
        const paper = CALC_CONFIG_REF_IH.papers.find(p => p.id === bookBlockState.paperId);
        summaryHTML += `<p><strong>Buchblock:</strong> ${bookBlockState.totalPages} S. A4 (${bookBlockState.printMode === 'double_sided' ? 'beidseitig' : 'einseitig'}) auf ${paper ? paper.name : 'N/A'}.`;
        if (bookBlockState.hasA3Pages && bookBlockState.a3PagesCount > 0) {
            summaryHTML += ` Inkl. ${bookBlockState.a3PagesCount} A3-Seiten.`;
        }
        summaryHTML += `</p>`;
    }
     const mainPdfFileName = onUpdateDataCallback('getPdfUploadData', 'mainPdfFileName');
     if (mainPdfFileName) {
        summaryHTML += `<p><em>Hochgeladene Inhalts-PDF:</em> ${mainPdfFileName}</p>`;
     }

    const variants = calculatorDataForInquiry.configuredVariants;
    variants.forEach((variant, index) => {
        const bindingConfig = CALC_CONFIG_REF_IH.bindings.find(b => b.id === variant.bindingTypeId);
        summaryHTML += `<p><strong>Variante ${index + 1}: ${bindingConfig ? bindingConfig.name : 'N/A'} (Menge: ${variant.quantity})</strong></p><ul>`;
        Object.entries(variant.options).forEach(([key, value]) => {
            const optConfig = bindingConfig.options.find(o => o.optionKey === key);
            if (optConfig) {
                let valText = value;
                if (optConfig.type === 'radio') {
                    const choice = optConfig.choices.find(c => c.id === value);
                    valText = choice ? choice.name : value;
                } else if (optConfig.type === 'checkbox') {
                    valText = value ? 'Ja' : 'Nein';
                }
                summaryHTML += `<li>${optConfig.name}: ${valText}</li>`;
            }
        });
        const persoData = onUpdateDataCallback('getPersonalizationData', variant.id);
        if (persoData) {
            if (persoData.coverEditorData && persoData.coverEditorData.thumbnailDataUrl) {
                summaryHTML += `<li>Buchdecke: Gestaltet (Vorschau im Warenkorb)</li>`;
            } else if (bindingConfig && bindingConfig.personalizationFields) {
                 bindingConfig.personalizationFields.forEach(pf => {
                    if (persoData[pf.id] && pf.type !== 'file' && pf.type !== 'checkbox') {
                        summaryHTML += `<li>${pf.label.replace('*','')}: ${String(persoData[pf.id]).substring(0,50)}${String(persoData[pf.id]).length > 50 ? '...' : ''}</li>`;
                    } else if (pf.id === 'cover_useCustomLogo' && persoData[pf.id] === true) {
                        summaryHTML += `<li>Logo verwenden: Ja`;
                        if (persoData.cover_customLogoFile) {
                             summaryHTML += ` (${persoData.cover_customLogoFile instanceof File ? persoData.cover_customLogoFile.name : persoData.cover_customLogoFile })`;
                        }
                        summaryHTML += `</li>`;
                    }
                 });
            }
        }
        summaryHTML += `</ul>`;
    });

    const extras = calculatorDataForInquiry.configuredExtras;
    if (extras.length > 0) {
        summaryHTML += `<p><strong>Zusatzprodukte:</strong></p><ul>`;
        extras.forEach(extra => {
            const extraConfig = CALC_CONFIG_REF_IH.extras.find(e => e.id === extra.extraId);
            summaryHTML += `<li>${extraConfig ? extraConfig.name : 'N/A'} (Menge: ${extra.quantity})`;
            if (extraConfig && extraConfig.options) {
                let optsSummary = [];
                extraConfig.options.forEach(optGroup => {
                    const choice = optGroup.choices.find(c => c.id === extra.selectedOptions[optGroup.optionKey]);
                    if (choice) optsSummary.push(choice.name);
                });
                if (optsSummary.length > 0) summaryHTML += ` (${optsSummary.join(', ')})`;
            }
            summaryHTML += `</li>`;
        });
        summaryHTML += `</ul>`;
    }

    inquiryFinalSummaryDetails.innerHTML = summaryHTML;
    inquiryFinalTotalSpan.textContent = calculatorDataForInquiry.overallTotal.toFixed(2);
}

function handleSubmit() {
    if (!validateCurrentStep()) return;

    const fullInquiryData = {
        customerData: {
            name: localInquiryState.customerName,
            email: localInquiryState.customerEmail,
            phone: localInquiryState.customerPhone,
            notes: localInquiryState.customerNotes || ''
        },
        deliveryData: {
            methodId: calculatorDataForInquiry.productionAndDeliveryState.deliveryMethodId,
            shippingAddress: localInquiryState.shippingAddress
        },
        agbAccepted: localInquiryState.agbAccepted,
    };

    if (onSubmitCallback) {
        onSubmitCallback(fullInquiryData);
    }
}
