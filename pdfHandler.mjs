// pdfHandler.mjs
// Manages the PDF analysis modal and its logic. By Lucy.
// V2: Receives DOM elements as dependencies to prevent timing issues.

import { analyzePdfFile } from './pdfAnalyzer.mjs';

// --- MODULE SCOPE VARIABLES ---
let onApplyDataCallback;
let DOM = {}; // Wird von initPdfHandler befüllt
let analysisResultCache = null;

/**
 * Opens the PDF analysis modal.
 */
function openModal() {
    if (!DOM.overlay) return;
    resetModalUI();
    DOM.overlay.classList.add('active');
}

/**
 * Closes the PDF analysis modal.
 */
function closeModal() {
    if (DOM.overlay) DOM.overlay.classList.remove('active');
}

/**
 * Resets the modal UI to its initial state.
 */
function resetModalUI() {
    if(DOM.modalFileInput) DOM.modalFileInput.value = '';
    if(DOM.loadingMessage) DOM.loadingMessage.classList.add('hidden');
    if(DOM.resultArea) DOM.resultArea.classList.add('hidden');
    if(DOM.previewContainer) DOM.previewContainer.classList.add('hidden');
    if(DOM.resultText) DOM.resultText.textContent = '';
    if (DOM.previewCanvas) {
        const ctx = DOM.previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);
    }
    if(DOM.applyButton) DOM.applyButton.disabled = true;
    analysisResultCache = null;
}

/**
 * Handles the file selection within the modal.
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    resetModalUI();
    DOM.loadingMessage.classList.remove('hidden');
    DOM.applyButton.disabled = true;

    try {
        const fileBuffer = await file.arrayBuffer();
        const result = await analyzePdfFile(fileBuffer);

        analysisResultCache = { ...result, fileObject: file };

        DOM.resultText.textContent = result.analysisReportText;
        DOM.resultArea.classList.remove('hidden');

        if (result.firstPagePreviewDataURL) {
            const img = new Image();
            img.onload = () => {
                DOM.previewCanvas.width = img.width;
                DOM.previewCanvas.height = img.height;
                const ctx = DOM.previewCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                DOM.previewContainer.classList.remove('hidden');
            };
            img.src = result.firstPagePreviewDataURL;
        }

        DOM.applyButton.disabled = false;

    } catch (error) {
        console.error("Error during PDF analysis:", error);
        DOM.resultText.textContent = `Ein Fehler ist aufgetreten:\n${error.message}\n\nStellen Sie sicher, dass es sich um eine valide PDF-Datei handelt.`;
        DOM.resultArea.classList.remove('hidden');
    } finally {
        DOM.loadingMessage.classList.add('hidden');
    }
}

/**
 * Handles the click on the "Apply Data" button.
 */
function applyData() {
    if (onApplyDataCallback && analysisResultCache) {
        onApplyDataCallback(analysisResultCache);
        
        if(DOM.mainPdfStatus) {
            DOM.mainPdfStatus.textContent = `Datei "${analysisResultCache.fileObject.name}" geladen. Daten wurden übernommen.`;
            DOM.mainPdfStatus.classList.remove('error-text');
        }
    }
    closeModal();
}

/**
 * Initializes the PDF handler.
 * @param {object} domElements - An object containing all required DOM elements.
 * @param {Function} applyCallback - The function to call when data is applied.
 */
export function initPdfHandler(domElements, applyCallback) {
    // Überprüfen, ob die essentiellen Elemente vorhanden sind
    if (!domElements || !domElements.openModalButton || !domElements.overlay) {
        console.warn("PDF Handler wurde nicht vollständig initialisiert: Open-Button fehlt.");
        return;
    }

    DOM = domElements; // DOM-Referenzen für das gesamte Modul setzen
    onApplyDataCallback = applyCallback;

    DOM.openModalButton.addEventListener('click', openModal);
    
    // Event Listeners für Modal-Elemente nur hinzufügen, wenn sie existieren
    if (DOM.closeButton) DOM.closeButton.addEventListener('click', closeModal);
    if (DOM.cancelButton) DOM.cancelButton.addEventListener('click', closeModal);
    if (DOM.overlay) {
        DOM.overlay.addEventListener('click', (e) => {
            if (e.target === DOM.overlay) {
                closeModal();
            }
        });
    }
    if (DOM.modalFileInput) DOM.modalFileInput.addEventListener('change', handleFileSelect);
    if (DOM.applyButton) DOM.applyButton.addEventListener('click', applyData);
    
    console.log("✅ PDF Handler Initialized.");
}
