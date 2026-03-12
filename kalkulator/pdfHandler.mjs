// pdfHandler.mjs
// Manages the PDF analysis modal and its logic. By Lucy.
// V2: Receives DOM elements as dependencies to prevent timing issues.
// V3: Dateien > 45 MB → Link-Eingabe statt Upload (Option 2).

import { analyzePdfFile } from './pdfAnalyzer.mjs';
import { updateMainPdfStatusUI } from './bookBlockHandler.mjs';
import { escapeHtml } from './uiUtils.mjs';

/** Max. Größe für direkten PDF-Upload (45 MB); darüber wird externer Link angeboten. */
const MAX_PDF_SIZE_BYTES = 45 * 1024 * 1024;
/** Ab dieser Größe im Analyse-Ergebnis Hinweis auf File-Transfer-Link einblenden (20 MB). */
const LARGE_FILE_HINT_THRESHOLD_BYTES = 20 * 1024 * 1024;

// --- MODULE SCOPE VARIABLES ---
let onApplyDataCallback;
let DOM = {}; // Wird von initPdfHandler befüllt
let analysisResultCache = null;

/**
 * Öffnet nur die Dateiauswahl – Modal erscheint erst nach gewählter Datei (kein Modal im Hintergrund).
 */
function triggerFileSelect() {
    DOM.modalFileInput?.click();
}

/**
 * Closes the PDF analysis modal and setzt UI für nächste Öffnung zurück.
 */
function closeModal() {
    if (DOM.overlay) DOM.overlay.classList.remove('active');
    resetModalUI();
}

/**
 * Resets the modal UI to its initial state (Intro + Dateiauswahl sichtbar, Ergebnis ausgeblendet).
 */
function resetModalUI() {
    if (DOM.modalFileInput) DOM.modalFileInput.value = '';
    if (DOM.introArea) DOM.introArea.classList.remove('hidden');
    if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = '';
    if (DOM.summaryDisplay) DOM.summaryDisplay.innerHTML = '';
    if (DOM.loadingMessage) DOM.loadingMessage.classList.add('hidden');
    if (DOM.resultArea) DOM.resultArea.classList.add('hidden');
    if (DOM.tooLargeArea) DOM.tooLargeArea.classList.add('hidden');
    if (DOM.externalLinkInput) DOM.externalLinkInput.value = '';
    if (DOM.previewContainer) DOM.previewContainer.classList.add('hidden');
    if (DOM.resultText) DOM.resultText.textContent = '';
    if (DOM.previewCanvas) {
        const ctx = DOM.previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);
    }
    if (DOM.applyButton) DOM.applyButton.disabled = true;
    analysisResultCache = null;
}

/**
 * Handles the file selection – Modal öffnet erst hier (nach Dateiwahl), dann Loading, dann Ergebnis.
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    DOM.overlay?.classList.add('active');
    DOM.introArea?.classList.add('hidden');
    DOM.resultArea.classList.add('hidden');
    if (DOM.tooLargeArea) DOM.tooLargeArea.classList.add('hidden');
    DOM.loadingMessage.classList.remove('hidden');
    DOM.applyButton.disabled = true;
    if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = '';
    if (DOM.summaryDisplay) DOM.summaryDisplay.innerHTML = '';

    if (file.size > MAX_PDF_SIZE_BYTES) {
        DOM.loadingMessage.classList.add('hidden');
        if (DOM.tooLargeArea) DOM.tooLargeArea.classList.remove('hidden');
        if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = file.name + ' (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB)';
        if (DOM.externalLinkInput) DOM.externalLinkInput.value = '';
        return;
    }

    try {
        const fileBuffer = await file.arrayBuffer();
        const result = await analyzePdfFile(fileBuffer);

        analysisResultCache = { ...result, fileObject: file };

        if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = file.name;
        DOM.resultText.textContent = result.analysisReportText;

        const a4 = result.calculatedA4Pages ?? (result.a4Hoch + result.a4Quer);
        const a4Hoch = result.a4Hoch ?? 0;
        const a4Quer = result.a4Quer ?? 0;
        const a3 = result.a3PageCount ?? 0;
        const total = result.pdfTotalPages ?? (a4 + a3);
        const noStandardFormat = total > 0 && a4 === 0 && a3 === 0;

        if (DOM.summaryDisplay) {
            let html = '';
            if (file.size >= LARGE_FILE_HINT_THRESHOLD_BYTES) {
                html += `<div class="pdf-modal-summary-item pdf-modal-summary-hint" style="grid-column:1/-1;"><span class="pdf-modal-summary-label">Große Datei – beim Bestellabschluss kann der direkte Upload an Grenzen stoßen. Dann: PDF z.&nbsp;B. über <a href="https://www.swisstransfer.com" target="_blank" rel="noopener noreferrer">SwissTransfer</a> oder <a href="https://wetransfer.com" target="_blank" rel="noopener noreferrer">WeTransfer</a> hochladen und den Download-Link angeben.</span></div>`;
            }
            html += `<div class="pdf-modal-summary-item"><span class="pdf-modal-summary-value">${total}</span><span class="pdf-modal-summary-label">Seiten gesamt</span></div>`;
            html += `<div class="pdf-modal-summary-item"><span class="pdf-modal-summary-value">${a4}</span><span class="pdf-modal-summary-label">A4-Seiten</span></div>`;
            if (a4Quer > 0) html += `<div class="pdf-modal-summary-item"><span class="pdf-modal-summary-value">${a4Hoch} / ${a4Quer}</span><span class="pdf-modal-summary-label">A4 Hoch / Quer</span></div>`;
            if (a3 > 0) html += `<div class="pdf-modal-summary-item"><span class="pdf-modal-summary-value">${a3}</span><span class="pdf-modal-summary-label">A3-Seiten</span></div>`;
            if (noStandardFormat) html += `<div class="pdf-modal-summary-item pdf-modal-summary-warning"><span class="pdf-modal-summary-label">Keine A4- oder A3-Seiten erkannt. Bitte Format prüfen.</span></div>`;
            DOM.summaryDisplay.innerHTML = html;
        }
        DOM.resultArea.classList.remove('hidden');

        if (result.firstPagePreviewDataURL) {
            const img = new Image();
            img.onload = () => {
                DOM.previewCanvas.width = img.width;
                DOM.previewCanvas.height = img.height;
                const ctx = DOM.previewCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                if (DOM.previewContainer) DOM.previewContainer.classList.remove('hidden');
            };
            img.src = result.firstPagePreviewDataURL;
        }

        DOM.applyButton.disabled = false;

    } catch (error) {
        console.error("Error during PDF analysis:", error);
        DOM.introArea?.classList.add('hidden');
        if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = file.name;
        if (DOM.summaryDisplay) {
            DOM.summaryDisplay.innerHTML = `<div class="pdf-modal-summary-item" style="grid-column:1/-1;text-align:left;"><span class="pdf-modal-summary-value" style="font-size:1rem;color:var(--error);">Fehler</span><span class="pdf-modal-summary-label" style="display:block;margin-top:4px;">${escapeHtml(error.message)}</span></div>`;
        }
        DOM.resultArea.classList.remove('hidden');
    } finally {
        DOM.loadingMessage.classList.add('hidden');
    }
}

/**
 * Handles the click on the "Apply Data" button (normale Analyse-Daten).
 */
function applyData() {
    if (onApplyDataCallback && analysisResultCache) {
        onApplyDataCallback(analysisResultCache);
        if (DOM.openModalButton) {
            DOM.openModalButton.textContent = 'Druckdatei auswählen';
        }
        updateMainPdfStatusUI(analysisResultCache.fileObject.name);
    }
    closeModal();
}

/**
 * Handles the click on "Link übernehmen" – externer Download-Link ersetzt die Datei.
 */
function applyLink() {
    const url = DOM.externalLinkInput?.value?.trim();
    if (!url) return;
    if (onApplyDataCallback) {
        onApplyDataCallback({ externalUrl: url });
        if (DOM.openModalButton) {
            DOM.openModalButton.textContent = 'Druckdatei auswählen';
        }
        updateMainPdfStatusUI('Druckdatei per Link');
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

    DOM.openModalButton.addEventListener('click', triggerFileSelect);
    
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
    if (DOM.applyLinkButton) DOM.applyLinkButton.addEventListener('click', applyLink);
}
