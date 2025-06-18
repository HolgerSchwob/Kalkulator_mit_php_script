// script.js (Haupt-Kalkulator-Skript) V1.9.8
// V1.9.8: Sicherstellung korrekte PHP_UPLOAD_URL für XAMPP

import { GlobalWorkerOptions } from './pdf.mjs';
import { analyzePdfFile } from './pdfAnalyzer.mjs';
import { generateOfferPdf } from './offerGenerator.mjs';
import { initInquiryModal, openInquiryModal, closeModal as closeInquiryModalFromHandler } from './inquiryHandler.mjs';
import { initPersonalizationModal, openPersonalizationModal } from './personalizationHandler.mjs';

import { initBookBlockHandler, updateBookBlockUI, getBookBlockState, applyPdfAnalysisToBookBlock, updateMainPdfStatusUI } from './bookBlockHandler.mjs';
import { initVariantHandler, updateVariantsUI, getConfiguredVariants, getNextVariantId } from './variantHandler.mjs';
import { initExtrasHandler, updateExtrasUI, getConfiguredExtras, getNextExtraInstanceId } from './extrasHandler.mjs';
import { initCartHandler, updateCartUI } from './cartHandler.mjs';
import { calculateAllPrices } from './calculationService.mjs';
import { initUiUtils } from './uiUtils.mjs';
import { initProductionDeliveryHandler, getProductionDeliveryState, updateProductionDeliveryUI } from './productionDeliveryHandler.mjs';

import { svgCoverEditor } from './editor.mjs';

let loadedConfigInstance = null;
// WICHTIG: Passe diese URL an den Pfad an, unter dem dein upload.php Skript
// auf deinem XAMPP-Server erreichbar ist!
const PHP_UPLOAD_URL = 'http://localhost/projects/upload.php';
// Mögliche Alternativen, falls localhost nicht direkt geht oder dein Projekt woanders liegt:
// const PHP_UPLOAD_URL = 'http://127.0.0.1/projects/upload.php';
// const PHP_UPLOAD_URL = 'http://localhost/DEIN_PROJEKTORDNER_IN_HTDOCS/upload.php';


try {
    GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
} catch (e) {
    console.error("Fehler beim Setzen von GlobalWorkerOptions.workerSrc:", e);
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
    } else {
        alert("PDF.js Worker konnte nicht initialisiert werden. Die PDF-Analyse-Funktion wird nicht korrekt funktionieren.");
    }
}

async function loadConfigAndInitializeApp() {
    try {
        const response = await fetch('./config.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - Konnte config.json nicht laden.`);
        }
        loadedConfigInstance = await response.json();
        console.log("Konfiguration erfolgreich geladen:", loadedConfigInstance);
        initializeApp(loadedConfigInstance);
    } catch (error) {
        console.error("Fehler beim Laden oder Parsen der Konfiguration:", error);
        document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red; font-family: sans-serif;">
            <h1>Kritischer Fehler</h1>
            <p>Die Anwendungskonfiguration konnte nicht geladen werden. Bitte versuchen Sie es später erneut oder kontaktieren Sie den Support.</p>
            <p>Details: ${error.message}</p>
        </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Kalkulator DOMContentLoaded V1.9.8 - PHP Upload Integration");
    loadConfigAndInitializeApp();
});

let inquiryState = {
    customerName: '', customerEmail: '', customerPhone: '', customerNotes: '',
    personalizations: {},
    mainPdfFile: null, mainPdfFileName: null,
    agbAccepted: false,
    bookBlock: null,
    productionAndDelivery: null,
    shippingAddress: null
};
let overallTotalForPdf = 0;
let currentModalAnalysisData = {
    analysisReportText: '',
    calculatedA4Pages: 0,
    a3PageCount: 0,
    firstPagePreviewDataURL: null,
    pdfTotalPages: 0,
    originalFile: null
};
let currentCalculationResults = null;

const downloadOfferPdfButton = document.getElementById('downloadOfferPdfButton');
const startInquiryButton = document.getElementById('startInquiryButton');
const pdfUploadRequirementNotice = document.getElementById('pdfUploadRequirementNotice');
const personalizationRequirementNotice = document.getElementById('personalizationRequirementNotice');
const pdfAnalysisModalOverlay = document.getElementById('pdfAnalysisModalOverlay');
const closePdfAnalysisModalButton = document.getElementById('closePdfAnalysisModalButton');
const modalPdfFile = document.getElementById('modalPdfFile');
const modalLoadingMessage = document.getElementById('modalLoadingMessage');
const modalAnalysisResultArea = document.getElementById('modalAnalysisResultArea');
const modalAnalysisResultText = document.getElementById('modalAnalysisResultText');
const modalPreviewContainer = document.getElementById('modalPreviewContainer');
const modalPreviewCanvas = document.getElementById('modalPreviewCanvas');
const applyPdfDataButton = document.getElementById('applyPdfDataButton');
const cancelPdfAnalysisButton = document.getElementById('cancelPdfAnalysisButton');
const bookBlockSection_DOM = document.getElementById('bookBlockSection');
const bindingVariantsSection_DOM = document.getElementById('bindingVariantsSection');

function dataURLtoFile(dataurl, filename) {
    if (!dataurl || !dataurl.includes(',')) {
        console.warn("Ungültige oder leere DataURL für dataURLtoFile:", filename);
        return null;
    }
    try {
        var arr = dataurl.split(','), 
            mimeMatch = arr[0].match(/:(.*?);/);
        if (!mimeMatch || !mimeMatch[1]) {
            console.warn("Konnte MimeType nicht aus DataURL extrahieren:", filename);
            return null;
        }
        var mime = mimeMatch[1],
            bstr = atob(arr[1]), 
            n = bstr.length, 
            u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type:mime});
    } catch (e) {
        console.error("Fehler beim Erstellen der Datei aus DataURL:", filename, e);
        try {
            var blob = new Blob([u8arr], {type: mime});
            blob.lastModifiedDate = new Date();
            blob.name = filename;
            return blob;
        } catch (blobError) {
            console.error("Fehler beim Erstellen des Blobs aus DataURL:", filename, blobError);
            return null;
        }
    }
}

function updateApp() {
    if (!loadedConfigInstance) {
        console.error("UpdateApp aufgerufen, bevor die Konfiguration geladen wurde.");
        return;
    }
    const currentBookBlockState = getBookBlockState();
    const currentProductionDeliveryState = getProductionDeliveryState();
    inquiryState.bookBlock = currentBookBlockState;
    inquiryState.productionAndDelivery = currentProductionDeliveryState;
    const configuredVariants = getConfiguredVariants();
    const configuredExtras = getConfiguredExtras();
    currentCalculationResults = calculateAllPrices(
        currentBookBlockState, configuredVariants, configuredExtras,
        currentProductionDeliveryState, loadedConfigInstance
    );
    overallTotalForPdf = currentCalculationResults.overallTotal;
    updateBookBlockUI(currentCalculationResults.bookBlockCalculations.thickness, inquiryState.mainPdfFileName);
    updateProductionDeliveryUI();
    updateVariantsUI(currentCalculationResults.variantCalculations, currentBookBlockState, inquiryState.personalizations);
    updateExtrasUI(currentCalculationResults.extraCalculations);
    updateCartUI(
        currentBookBlockState, configuredVariants, configuredExtras,
        currentProductionDeliveryState, currentCalculationResults,
        loadedConfigInstance, inquiryState.personalizations
    );
    const canDownloadPdf = currentCalculationResults.overallTotal > 0;
    if (downloadOfferPdfButton) downloadOfferPdfButton.disabled = !canDownloadPdf;
    if (startInquiryButton) startInquiryButton.disabled = !canDownloadPdf;
    if (pdfUploadRequirementNotice) pdfUploadRequirementNotice.classList.add('hidden');
    if (personalizationRequirementNotice) personalizationRequirementNotice.classList.add('hidden');
    removeValidationHighlights();
}

function getBindingConfigById(bindingId) {
    if (!loadedConfigInstance || !loadedConfigInstance.bindings) {
        console.error("Konfiguration für Bindungen nicht geladen.");
        return null;
    }
    return loadedConfigInstance.bindings.find(b => b.id === bindingId);
}

function removeValidationHighlights() {
    bookBlockSection_DOM?.classList.remove('section-invalid');
    bindingVariantsSection_DOM?.classList.remove('section-invalid');
    document.querySelectorAll('#bindingVariantsContainer .accordion-item.section-invalid').forEach(item => {
        item.classList.remove('section-invalid');
    });
}

function checkAllRequirementsMetAndHighlight() {
    if (!loadedConfigInstance) return false;
    removeValidationHighlights();
    let allOk = true;
    let pdfUploaded = !!inquiryState.mainPdfFile;
    if (!pdfUploaded) {
        allOk = false;
        if (pdfUploadRequirementNotice) pdfUploadRequirementNotice.classList.remove('hidden');
        if (bookBlockSection_DOM) bookBlockSection_DOM.classList.add('section-invalid');
    } else {
        if (pdfUploadRequirementNotice) pdfUploadRequirementNotice.classList.add('hidden');
    }
    let allPersonalizationsDone = true;
    let hasPersonalizableBinding = false;
    getConfiguredVariants().forEach(v => {
        const bConf = getBindingConfigById(v.bindingTypeId);
        if (bConf && bConf.requiresPersonalization) {
            hasPersonalizableBinding = true;
            const persoData = inquiryState.personalizations[v.id] || {};
            let requiredFieldsDoneForVariant = true;
            if (bConf.personalizationInterface === 'coverEditor') {
                if (!persoData.coverEditorData || !persoData.coverEditorData.thumbnailDataUrl) {
                    requiredFieldsDoneForVariant = false;
                }
            } else if (bConf.personalizationFields) {
                requiredFieldsDoneForVariant = bConf.personalizationFields
                    .filter(pf => pf.required)
                    .every(pf => {
                        if (pf.type === 'file' && pf.dependsOn) {
                            const controllingCheckboxId = pf.dependsOn;
                            if (persoData[controllingCheckboxId] === true) {
                                return persoData[pf.id] instanceof File || typeof persoData[pf.id] === 'string';
                            }
                            return true;
                        }
                        return persoData.hasOwnProperty(pf.id) &&
                               (typeof persoData[pf.id] === 'boolean' || (persoData[pf.id] && String(persoData[pf.id]).trim() !== ''));
                    });
            }
            if (!requiredFieldsDoneForVariant) {
                allPersonalizationsDone = false;
                const variantItemDOM = document.querySelector(`.accordion-item[data-variant-id="${v.id}"]`);
                if (variantItemDOM) variantItemDOM.classList.add('section-invalid');
            }
        }
    });
    if (hasPersonalizableBinding && !allPersonalizationsDone) {
        allOk = false;
        if (personalizationRequirementNotice) personalizationRequirementNotice.classList.remove('hidden');
    } else {
        if (personalizationRequirementNotice) personalizationRequirementNotice.classList.add('hidden');
    }
    return allOk;
}

function addPdfAnalysisModalEventListeners() {
    if (!pdfAnalysisModalOverlay) return;
    if (closePdfAnalysisModalButton) closePdfAnalysisModalButton.addEventListener('click', closePdfAnalysisModal);
    if (cancelPdfAnalysisButton) cancelPdfAnalysisButton.addEventListener('click', closePdfAnalysisModal);
    pdfAnalysisModalOverlay.addEventListener('click', (e) => { if (e.target === pdfAnalysisModalOverlay) closePdfAnalysisModal(); });
    if (modalPdfFile) modalPdfFile.addEventListener('change', handleModalPdfFileSelect);
    if (applyPdfDataButton) applyPdfDataButton.addEventListener('click', () => {
        if (currentModalAnalysisData && currentModalAnalysisData.originalFile) {
            applyPdfAnalysisToBookBlock(currentModalAnalysisData, currentModalAnalysisData.originalFile);
        }
        closePdfAnalysisModal();
        updateApp();
    });
}
async function handleModalPdfFileSelect(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        if(modalAnalysisResultText) modalAnalysisResultText.textContent = 'Bitte eine gültige PDF-Datei auswählen.';
        if(modalPreviewContainer) modalPreviewContainer.classList.add('hidden');
        if(modalLoadingMessage) modalLoadingMessage.classList.add('hidden');
        if(applyPdfDataButton) applyPdfDataButton.disabled = true;
        currentModalAnalysisData.originalFile = null;
        return;
    }
    currentModalAnalysisData.originalFile = file;
    if(modalLoadingMessage) modalLoadingMessage.classList.remove('hidden');
    if(modalAnalysisResultText) modalAnalysisResultText.textContent = 'Verarbeite PDF...';
    if(modalAnalysisResultArea) modalAnalysisResultArea.classList.remove('hidden');
    if(modalPreviewContainer) modalPreviewContainer.classList.add('hidden');
    if(applyPdfDataButton) applyPdfDataButton.disabled = true;
    try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            try {
                const analysisResults = await analyzePdfFile(this.result);
                currentModalAnalysisData = { ...currentModalAnalysisData, ...analysisResults };
                if (modalAnalysisResultText) modalAnalysisResultText.textContent = currentModalAnalysisData.analysisReportText;
                if (currentModalAnalysisData.firstPagePreviewDataURL && modalPreviewCanvas) {
                    const img = new Image();
                    img.onload = () => {
                        const ctx = modalPreviewCanvas.getContext('2d');
                        modalPreviewCanvas.width = img.width;
                        modalPreviewCanvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        if(modalPreviewContainer) modalPreviewContainer.classList.remove('hidden');
                    };
                    img.onerror = () => { console.error("Fehler beim Laden des Vorschau-Bildes für Canvas."); }
                    img.src = currentModalAnalysisData.firstPagePreviewDataURL;
                }
                if(applyPdfDataButton) applyPdfDataButton.disabled = false;
            } catch (analysisError) {
                console.error('Fehler bei der PDF-Analyse:', analysisError);
                if(modalAnalysisResultText) modalAnalysisResultText.textContent = `Fehler bei der PDF-Analyse: ${analysisError.message || 'Unbekannter Fehler'}`;
                currentModalAnalysisData.originalFile = null;
            } finally {
                if(modalLoadingMessage) modalLoadingMessage.classList.add('hidden');
            }
        };
        fileReader.onerror = () => {
            console.error("FileReader Fehler:", fileReader.error);
            if(modalAnalysisResultText) modalAnalysisResultText.textContent = `Fehler beim Lesen der Datei.`;
            if(modalLoadingMessage) modalLoadingMessage.classList.add('hidden');
            currentModalAnalysisData.originalFile = null;
        };
        fileReader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('Fehler (vor Analyse):', error);
        if(modalAnalysisResultText) modalAnalysisResultText.textContent = `Fehler: ${error.message || 'Unbekannter Fehler'}`;
        if(modalLoadingMessage) modalLoadingMessage.classList.add('hidden');
        currentModalAnalysisData.originalFile = null;
    }
}
function openPdfAnalysisModalFromScript() {
    if (!pdfAnalysisModalOverlay) return;
    if(modalPdfFile) modalPdfFile.value = '';
    if(modalAnalysisResultText) modalAnalysisResultText.textContent = 'Noch keine Datei ausgewählt.';
    if(modalAnalysisResultArea) modalAnalysisResultArea.classList.remove('hidden');
    if(modalPreviewContainer) modalPreviewContainer.classList.add('hidden');
    if(modalLoadingMessage) modalLoadingMessage.classList.add('hidden');
    if(applyPdfDataButton) applyPdfDataButton.disabled = true;
    currentModalAnalysisData = { originalFile: null };
    pdfAnalysisModalOverlay.classList.add('active');
}
function closePdfAnalysisModal() {
    if (pdfAnalysisModalOverlay) pdfAnalysisModalOverlay.classList.remove('active');
}

async function handleFinalInquirySubmit(inquiryModalData) {
    if (!loadedConfigInstance || !currentCalculationResults) {
        alert("Fehler: Konfiguration oder Berechnungsergebnisse nicht verfügbar.");
        return;
    }
    const submitButton = document.getElementById('submitInquiryFormButton');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Sende Anfrage...';
    try {
        // NEU: Lade-Animation anzeigen
        if (loadingOverlay) loadingOverlay.classList.add('active');
        submitButton.disabled = true;
        submitButton.textContent = 'Sende Anfrage...';
        const comprehensiveData = {
            timestamp: new Date().toISOString(),
            kalkulatorVersion: "1.9.7-PHP", // Angepasst für PHP-Version
            kundenDaten: inquiryModalData.customerData,
            lieferDetails: {
                methodeId: inquiryState.productionAndDelivery.deliveryMethodId,
                methodeName: loadedConfigInstance.productionAndDelivery.deliveryMethods.find(dm => dm.id === inquiryState.productionAndDelivery.deliveryMethodId)?.name || 'N/A',
                adresse: inquiryState.shippingAddress
            },
            produktionszeit: {
                id: inquiryState.productionAndDelivery.productionTimeId,
                name: loadedConfigInstance.productionAndDelivery.productionTimes.find(pt => pt.id === inquiryState.productionAndDelivery.productionTimeId)?.name || 'N/A',
            },
            agbAkzeptiert: inquiryModalData.agbAccepted,
            buchblock: getBookBlockState(),
            varianten: getConfiguredVariants().map(v => ({
                ...v,
                personalizationDetails: inquiryState.personalizations[v.id] ?
                    Object.fromEntries(Object.entries(inquiryState.personalizations[v.id]).map(([key, val]) => {
                        if (val instanceof File) return [key, val.name];
                        if (key === 'coverEditorData' && val && val.thumbnailDataUrl) {
                            return [key, { ...val, thumbnailDataUrl: 'thumbnail_via_file_upload', svgString: 'svg_via_file_upload' }];
                        }
                        return [key, val];
                    }))
                    : {}
            })),
            extras: getConfiguredExtras(),
            berechnungen: currentCalculationResults,
            dateienMeta: {
                 hauptPdfName: inquiryState.mainPdfFileName || null,
                 coverDateien: []
            }
        };
        const formData = new FormData();
        formData.append('jsonData', JSON.stringify(comprehensiveData));
        if (inquiryState.mainPdfFile instanceof File) {
            const pdfFileNameToUse = inquiryState.mainPdfFileName || 'hauptdokument.pdf';
            formData.append('hauptPdfDatei', inquiryState.mainPdfFile, pdfFileNameToUse);
            comprehensiveData.dateienMeta.hauptPdfName = pdfFileNameToUse;
        }
        getConfiguredVariants().forEach((variant) => {
            const persoData = inquiryState.personalizations[variant.id];
            if (persoData) {
                if (persoData.coverEditorData) {
                    if (persoData.coverEditorData.thumbnailDataUrl) {
                        const thumbnailFilename = `${variant.id}_thumbnail.png`;
                        const thumbnailFile = dataURLtoFile(persoData.coverEditorData.thumbnailDataUrl, thumbnailFilename);
                        if (thumbnailFile) {
                            formData.append(`coverThumbnailDatei_${variant.id}`, thumbnailFile, thumbnailFilename);
                            comprehensiveData.dateienMeta.coverDateien.push({variantId: variant.id, type: 'thumbnail', name: thumbnailFilename, keyInFormData: `coverThumbnailDatei_${variant.id}`});
                        }
                    }
                    if (persoData.coverEditorData.svgString) {
                        const svgFilename = `${variant.id}_cover.svg`;
                        const svgFile = new File([persoData.coverEditorData.svgString], svgFilename, {type: "image/svg+xml"});
                        formData.append(`coverSvgDatei_${variant.id}`, svgFile, svgFilename);
                        comprehensiveData.dateienMeta.coverDateien.push({variantId: variant.id, type: 'svg', name: svgFilename, keyInFormData: `coverSvgDatei_${variant.id}`});
                    }
                }
                if (persoData.cover_customLogoFile instanceof File) {
                    const logoFilename = persoData.cover_customLogoFile.name || `${variant.id}_legacy_logo.png`;
                    formData.append(`legacyLogoDatei_${variant.id}`, persoData.cover_customLogoFile, logoFilename);
                     comprehensiveData.dateienMeta.coverDateien.push({variantId: variant.id, type: 'legacyLogo', name: logoFilename, keyInFormData: `legacyLogoDatei_${variant.id}`});
                }
            }
        });
        formData.set('jsonData', JSON.stringify(comprehensiveData));
        console.log("Sende FormData an PHP-Skript. Ziel-URL:", PHP_UPLOAD_URL, "JSON-Teil:", comprehensiveData);

        const response = await fetch(PHP_UPLOAD_URL, {
            method: 'POST',
            body: formData,
        });

        const resultText = await response.text();
        console.log("Antwort vom PHP-Server (roher Text):", resultText);
        
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            console.error("Antwort vom PHP-Server ist kein valides JSON:", e, "\nText war (wiederholt für Klarheit):", resultText);
            throw new Error("Server-Antwort konnte nicht verarbeitet werden. Bitte prüfen Sie die Server-Logs für Details.");
        }

        if (response.ok && result && result.status === "success") { // Hier wird der Status "success" vom PHP erwartet
            // alert("Vielen Dank! Ihre unverbindliche Anfrage wurde erfolgreich an den Server übermittelt.\n" + (result.message || '') + (result.data && result.data.driveFolderName ? "\nOrdner: " + result.data.driveFolderName : ""));
            alert("Vielen Dank! Ihre unverbindliche Anfrage wurde erfolgreich an den Server übermittelt. Wir prüfen Ihren Auftrag und melden uns bei Ihnen in Kürze per Mail mit unserer Auftragsbestätigung.");
            inquiryState = {
                customerName: '', customerEmail: '', customerPhone: '', customerNotes: '',
                personalizations: {},
                mainPdfFile: null, mainPdfFileName: null,
                agbAccepted: false,
                bookBlock: getBookBlockState(),
                productionAndDelivery: getProductionDeliveryState(),
                shippingAddress: null
            };
            updateMainPdfStatusUI(null);
            updateApp();
            if (typeof closeInquiryModalFromHandler === 'function') {
                closeInquiryModalFromHandler();
            }
        } else {
             // Wenn der Status vom PHP-Skript nicht "success" ist, aber die Antwort valides JSON war
            throw new Error(result.message || "Unbekannter Fehler vom Server. Status: " + (result.status || response.status) );
        }
    } catch (error) {
        console.error("Fehler beim Senden der Anfrage an PHP-Skript:", error);
        alert(`Fehler beim Senden Ihrer Anfrage: ${error.message}. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns direkt.`);
    } finally {
         if (loadingOverlay) loadingOverlay.classList.remove('active'); // Hinzugefügt: Lade-Animation ausblenden
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

function handleInquiryCancel() {
    console.log("Anfrageprozess vom Nutzer abgebrochen.");
}

function handleInquiryDataUpdate(dataType, data, itemId) {
    if (!loadedConfigInstance) return null;
    if (dataType === 'customerData') {
        inquiryState.customerName = data.name;
        inquiryState.customerEmail = data.email;
        inquiryState.customerPhone = data.phone;
        inquiryState.customerNotes = data.notes || '';
    } else if (dataType === 'deliveryAddressData') {
        if (inquiryState.productionAndDelivery?.deliveryMethodId && loadedConfigInstance.productionAndDelivery.deliveryMethods.find(dm => dm.id === inquiryState.productionAndDelivery.deliveryMethodId)?.requiresAddress) {
            inquiryState.shippingAddress = { ...data.shippingAddress };
        } else {
            inquiryState.shippingAddress = { street: '', zip: '', city: '' };
        }
    } else if (dataType === 'agbAcceptedUpdate') {
        inquiryState.agbAccepted = data.accepted;
    } else if (dataType === 'getVariantData') {
        return getConfiguredVariants().find(v => v.id === itemId);
    } else if (dataType === 'getPersonalizationData') {
         return inquiryState.personalizations[itemId] || {};
    } else if (dataType === 'getPdfUploadData') {
         if (data === 'mainPdfFile') return inquiryState.mainPdfFile;
         if (data === 'mainPdfFileName') return inquiryState.mainPdfFileName;
         return null;
    } else if (dataType === 'getBookBlockState') {
        return getBookBlockState();
    } else if (dataType === 'getProductionDeliveryState') {
        return getProductionDeliveryState();
    }
}

function handleSavePersonalizationData(variantId, personalizationData, logoFileObject = null) {
    const variantToUpdate = getConfiguredVariants().find(v => v.id === variantId);
    if (variantToUpdate) {
        inquiryState.personalizations[variantId] = { ...personalizationData };
        if (logoFileObject) {
            inquiryState.personalizations[variantId].cover_customLogoFile = logoFileObject;
        } else if (personalizationData.cover_useCustomLogo === true && inquiryState.personalizations[variantId]?.cover_customLogoFile) {
            // Keep old logo
        } else if (personalizationData.cover_useCustomLogo === false) {
            delete inquiryState.personalizations[variantId].cover_customLogoFile;
        }
        console.log(`Personalisierung für Variante ${variantId} im inquiryState gespeichert:`, inquiryState.personalizations[variantId]);
        updateApp();
    }
}

function openCoverEditorModal(variantId, bindingConfig) {
    if (!loadedConfigInstance) {
        alert("Fehler: Anwendungskonfiguration nicht geladen.");
        return;
    }
    console.log(`Versuche Buchdeckeneditor für Variante ${variantId} zu öffnen. Binding: ${bindingConfig.name}`);
    if (!currentCalculationResults || !currentCalculationResults.bookBlockCalculations) {
        console.error("Buchblockberechnungen nicht verfügbar, um Rückenbreite zu ermitteln.");
        alert("Fehler: Rückenbreite konnte nicht ermittelt werden. Bitte konfigurieren Sie zuerst den Buchblock.");
        return;
    }
    const spineWidth = currentCalculationResults.bookBlockCalculations.thickness;
    if (spineWidth <= 0) {
        alert("Bitte konfigurieren Sie zuerst den Buchblock, damit eine gültige Rückenbreite ermittelt werden kann.");
        return;
    }
    const existingPersoForVariant = inquiryState.personalizations[variantId] || {};
    const existingEditorData = existingPersoForVariant.coverEditorData || {};
    const initialTextData = {};
    if (existingPersoForVariant.cover_mainTitle) initialTextData.cover_title = existingPersoForVariant.cover_mainTitle;
    if (existingPersoForVariant.cover_subTitle) initialTextData.cover_subtitle = existingPersoForVariant.cover_subTitle;
    if (existingPersoForVariant.cover_authorName) initialTextData.cover_authorName = existingPersoForVariant.cover_authorName;
    if (existingPersoForVariant.spine_title) initialTextData.spine_title = existingPersoForVariant.spine_title;
    if (existingEditorData.editorParameters && existingEditorData.editorParameters.textInputs) {
        if (existingEditorData.editorParameters.textInputs['text-title-input']) initialTextData.cover_title = existingEditorData.editorParameters.textInputs['text-title-input'];
        if (existingEditorData.editorParameters.textInputs['text-subtitle-input']) initialTextData.cover_subtitle = existingEditorData.editorParameters.textInputs['text-subtitle-input'];
        if (existingEditorData.editorParameters.textInputs['text-author-input']) initialTextData.cover_authorName = existingEditorData.editorParameters.textInputs['text-author-input'];
        if (existingEditorData.editorParameters.textInputs['text-spine-title-input']) initialTextData.spine_title = existingEditorData.editorParameters.textInputs['text-spine-title-input'];
    }
    const editorConfig = {
        spineWidth: parseFloat(spineWidth.toFixed(2)),
        initialLayoutTemplate: existingEditorData.editorParameters?.templateFile || existingEditorData.editorParameters?.templateId || null,
        initialTextData: initialTextData,
        parameters: {
            colorU1: existingEditorData.editorParameters?.colorU1 || null,
            colorU4: existingEditorData.editorParameters?.colorU4 || null,
        },
        logoDataUrl: existingEditorData.logoDataUrl || (existingPersoForVariant.cover_customLogoFile instanceof File ? URL.createObjectURL(existingPersoForVariant.cover_customLogoFile) : null),
        onSubmit: (result) => {
            console.log("Buchdeckeneditor Ergebnis:", result);
            inquiryState.personalizations[variantId] = inquiryState.personalizations[variantId] || {};
            inquiryState.personalizations[variantId].coverEditorData = {
                svgString: result.svgString,
                thumbnailDataUrl: result.thumbnailDataUrl,
                editorParameters: result.parameters,
                logoDataUrl: result.parameters.logoDataUrl || existingEditorData.logoDataUrl || null 
            };
            if (result.parameters && result.parameters.textInputs) {
                if (result.parameters.textInputs['text-title-input']) inquiryState.personalizations[variantId].cover_mainTitle = result.parameters.textInputs['text-title-input'];
                if (result.parameters.textInputs['text-subtitle-input']) inquiryState.personalizations[variantId].cover_subTitle = result.parameters.textInputs['text-subtitle-input'];
                if (result.parameters.textInputs['text-author-input']) inquiryState.personalizations[variantId].cover_authorName = result.parameters.textInputs['text-author-input'];
                if (result.parameters.textInputs['text-spine-title-input']) inquiryState.personalizations[variantId].spine_title = result.parameters.textInputs['text-spine-title-input'];
            }
            updateApp();
        },
        onCancel: () => {
            console.log("Buchdeckeneditor abgebrochen.");
        }
    };
    console.log("Öffne Buchdeckeneditor mit Config:", JSON.stringify(editorConfig, (key, value) => {
        if (value instanceof File) return "[File Object]";
        if (key === "logoDataUrl" && typeof value === "string" && value.startsWith("data:image")) return "[Data URL]";
        return value;
    }, 2));
    try {
        svgCoverEditor.open(editorConfig);
    } catch (e) {
        console.error("Fehler beim Öffnen des Buchdeckeneditors:", e);
        alert("Der Buchdeckeneditor konnte nicht gestartet werden. Bitte versuchen Sie es später erneut oder kontaktieren Sie den Support.");
    }
}

function initializeApp(CALC_CONFIG_PARAM) {
    inquiryState.bookBlock = getBookBlockState(); 
    inquiryState.productionAndDelivery = getProductionDeliveryState(); 
    initUiUtils({}); 
    initBookBlockHandler(
        CALC_CONFIG_PARAM, updateApp, openPdfAnalysisModalFromScript,
        (uploadedFile, generatedName) => {
            inquiryState.mainPdfFile = uploadedFile;
            inquiryState.mainPdfFileName = uploadedFile ? (uploadedFile.name || generatedName) : null;
            updateApp();
        }
    );
    initProductionDeliveryHandler(CALC_CONFIG_PARAM, updateApp);
    initVariantHandler(
        CALC_CONFIG_PARAM, updateApp, inquiryState,
        openPersonalizationModal, openCoverEditorModal
    );
    initExtrasHandler(CALC_CONFIG_PARAM, updateApp);
    initCartHandler(CALC_CONFIG_PARAM); 
    addPdfAnalysisModalEventListeners();
    initPersonalizationModal(handleSavePersonalizationData);
    initInquiryModal(handleFinalInquirySubmit, handleInquiryCancel, handleInquiryDataUpdate, CALC_CONFIG_PARAM);
    if (downloadOfferPdfButton) {
        downloadOfferPdfButton.addEventListener('click', async () => {
            if (downloadOfferPdfButton.disabled || !currentCalculationResults) return;
            const currentBookBlockState = getBookBlockState();
            const currentProdDelState = getProductionDeliveryState();
            await generateOfferPdf(
                currentBookBlockState, getConfiguredVariants(), getConfiguredExtras(),
                currentProdDelState, CALC_CONFIG_PARAM, 
                currentBookBlockState.totalPages, overallTotalForPdf, currentCalculationResults
            );
        });
    }
    if (startInquiryButton) {
        startInquiryButton.addEventListener('click', () => {
            if (startInquiryButton.disabled) {
                 alert("Bitte konfigurieren Sie zuerst Ihr Produkt, sodass ein Preis berechnet werden kann.");
                return;
            }
            if (checkAllRequirementsMetAndHighlight()) {
                const calculatorDataForInquiry = {
                    bookBlockState: getBookBlockState(),
                    configuredVariants: getConfiguredVariants(),
                    configuredExtras: getConfiguredExtras(),
                    productionAndDeliveryState: getProductionDeliveryState(),
                    CALC_CONFIG: CALC_CONFIG_PARAM, 
                    overallTotal: overallTotalForPdf
                };
                openInquiryModal(calculatorDataForInquiry, inquiryState);
            } else {
                alert("Bitte überprüfen Sie die rot markierten Bereiche und füllen Sie alle erforderlichen Informationen aus, bevor Sie eine Anfrage stellen.");
            }
        });
    }
    window.mainAppGetConfiguredVariants = getConfiguredVariants;
    window.mainAppGetConfiguredExtras = getConfiguredExtras;
    updateApp();
}
