// pdfHandler.mjs
// Manages the PDF analysis modal and its logic. By Lucy.

import { analyzePdfFile } from './pdfAnalyzer.mjs';

// --- MODULE SCOPE VARIABLES ---
let onApplyDataCallback; // Callback to send data back to script.js

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    // Modal elements
    overlay: document.getElementById('pdfAnalysisModalOverlay'),
    closeButton: document.getElementById('closePdfAnalysisModalButton'),
    modalFileInput: document.getElementById('modalPdfFile'),
    loadingMessage: document.getElementById('modalLoadingMessage'),
    resultArea: document.getElementById('modalAnalysisResultArea'),
    resultText: document.getElementById('modalAnalysisResultText'),
    previewContainer: document.getElementById('modalPreviewContainer'),
    previewCanvas: document.getElementById('modalPreviewCanvas'),
    applyButton: document.getElementById('applyPdfDataButton'),
    cancelButton: document.getElementById('cancelPdfAnalysisButton'),
    
    // Main button in the calculator UI
    openModalButton: document.getElementById('uploadAndAnalyzePdfBtn'),
    mainPdfStatus: document.getElementById('mainPdfStatusInBookBlock'),
};

let analysisResultCache = null; // Caches the result of the last analysis

/**
 * Opens the PDF analysis modal.
 */
function openModal() {
    resetModalUI();
    DOM.overlay.classList.add('active');
}

/**
 * Closes the PDF analysis modal.
 */
function closeModal() {
    DOM.overlay.classList.remove('active');
}

/**
 * Resets the modal UI to its initial state.
 */
function resetModalUI() {
    DOM.modalFileInput.value = ''; // Clear file input
    DOM.loadingMessage.classList.add('hidden');
    DOM.resultArea.classList.add('hidden');
    DOM.previewContainer.classList.add('hidden');
    DOM.resultText.textContent = '';
    const ctx = DOM.previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);
    DOM.applyButton.disabled = true;
    analysisResultCache = null;
}

/**
 * Handles the file selection within the modal.
 * @param {Event} event - The file input change event.
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
        
        // Update the status message in the main UI
        if(DOM.mainPdfStatus) {
            DOM.mainPdfStatus.textContent = `Datei "${analysisResultCache.fileObject.name}" geladen. Daten wurden übernommen.`;
            DOM.mainPdfStatus.classList.remove('error-text');
        }
    }
    closeModal();
}


/**
 * Initializes the PDF handler.
 * @param {Function} applyCallback - The function to call when data is applied.
 */
export function initPdfHandler(applyCallback) {
    onApplyDataCallback = applyCallback;

    DOM.openModalButton.addEventListener('click', openModal);
    DOM.closeButton.addEventListener('click', closeModal);
    DOM.cancelButton.addEventListener('click', closeModal);
    DOM.overlay.addEventListener('click', (e) => {
        if (e.target === DOM.overlay) {
            closeModal();
        }
    });

    DOM.modalFileInput.addEventListener('change', handleFileSelect);
    DOM.applyButton.addEventListener('click', applyData);
    
    console.log("PDF Handler Initialized.");
}
