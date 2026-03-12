// bookBlockHandler.mjs
// Stellt nur die Anzeige „Ausgewählte Druckdatei“ im Buchblock-Bereich bereit.
//
// HINWEIS – Keine Dopplung mit script.js:
// State und UI des Buchblocks (Seitenzahl, Papier, Druckmodus, A3, Dicken-Anzeige,
// Papier-Optionen rendern) liegen ausschließlich in script.js (inquiryState.bookBlock,
// renderBookBlockOptions, updateBookBlockUI, Event-Binding). Dieses Modul exportiert
// ausschließlich updateMainPdfStatusUI() für die kleine Statuszeile/Button-Beschriftung.

const PDF_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h1"/><path d="M9 17h1"/><path d="M13 13h3"/><path d="M13 17h3"/><path d="M5 13h1v4H5z"/></svg>';

/**
 * Aktualisiert die Anzeige „Ausgewählte Druckdatei“ im Buchblock-Bereich.
 * @param {string|null|undefined} fileName - Dateiname der gewählten PDF oder null/undefined wenn keine.
 */
export function updateMainPdfStatusUI(fileName) {
    const statusEl = document.getElementById('mainPdfStatusInBookBlock');
    const btnEl = document.getElementById('uploadAndAnalyzePdfBtn');
    if (btnEl) {
        btnEl.textContent = 'Druckdatei auswählen';
    }
    if (statusEl) {
        if (fileName) {
            statusEl.innerHTML = '';
            const iconWrap = document.createElement('span');
            iconWrap.className = 'pdf-upload-filename-icon-wrap';
            iconWrap.innerHTML = PDF_ICON_SVG;
            statusEl.appendChild(iconWrap);
            statusEl.appendChild(document.createTextNode(`Ausgewählte Datei: ${fileName}`));
            statusEl.classList.remove('error-text');
        } else {
            statusEl.textContent = 'Nur lokale Auswertung – es erfolgt kein Upload.';
        }
    }
}
