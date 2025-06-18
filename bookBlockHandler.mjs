// bookBlockHandler.mjs
// Manages the state and UI for the book block section (V1.9.4)

let CALC_CONFIG_REF;
let onUpdateCallback; 
let openPdfAnalysisModalCallback; 
let onMainPdfUpdateCallback; // Callback to script.js: (fileObject, fileNameString)

let bookBlockState = {
    totalPages: 80, 
    printMode: 'double_sided',
    paperId: null, 
    hasA3Pages: false,
    a3PagesCount: 0,
    firstPagePreviewDataURL: null, 
    thickness: 0,
    // mainPdfFile und mainPdfFileName werden jetzt im globalen inquiryState in script.js verwaltet
};

// DOM Elements
let totalPagesInput, printModeRadios, bookBlockOptionsContainer,
    hasA3PagesCheckbox, a3PagesCountContainer, a3PagesCountInput,
    bookBlockThicknessInfo, uploadAndAnalyzePdfBtn_DOM, // Umbenannt von openPdfAnalysisModalBtn_DOM
    mainPdfStatusInBookBlock_DOM; // Neuer Status-Anzeigecontainer


function getPaperConfigById(paperId) {
    return CALC_CONFIG_REF.papers.find(p => p.id === paperId);
}

function calculateBlockThickness(pages, paperId, printMode, a3Count = 0) {
    if (!CALC_CONFIG_REF || (pages <= 0 && a3Count <= 0) || !paperId) return 0;
    const paperConfig = getPaperConfigById(paperId);
    if (!paperConfig || paperConfig.paperThickness === undefined) {
        console.warn(`Papierkonfiguration für ID ${paperId} nicht gefunden oder Dicke nicht definiert.`);
        return 0;
    }
    const numA4Sheets = (printMode === 'single_sided') ? pages : Math.ceil(pages / 2);
    let totalEffectiveSheets = numA4Sheets;
    totalEffectiveSheets += a3Count * 1; 
    return totalEffectiveSheets * paperConfig.paperThickness;
}

function renderBookBlockOptionsDOM() {
    if (!bookBlockOptionsContainer || !CALC_CONFIG_REF) return;

    if (!bookBlockState.paperId && CALC_CONFIG_REF.papers.length > 0) {
        bookBlockState.paperId = CALC_CONFIG_REF.papers[0].id;
    }

    printModeRadios.forEach(radio => {
        radio.checked = radio.value === bookBlockState.printMode;
    });

    let paperOptionsHTML = '<fieldset><legend>Papiersorte (A4 & A3):</legend>';
    CALC_CONFIG_REF.papers.forEach(paper => {
        paperOptionsHTML += `<div><label><input type="radio" name="paperId" value="${paper.id}" ${paper.id === bookBlockState.paperId ? 'checked' : ''}> ${paper.name}</label></div>`;
    });
    paperOptionsHTML += '</fieldset>';
    bookBlockOptionsContainer.innerHTML = paperOptionsHTML;

    bookBlockOptionsContainer.querySelectorAll('input[name="paperId"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            bookBlockState.paperId = event.target.value;
            handleBookBlockChange();
        });
    });
}

function toggleA3CountInputVisibility() {
    if (a3PagesCountContainer && hasA3PagesCheckbox) {
        a3PagesCountContainer.classList.toggle('hidden', !hasA3PagesCheckbox.checked);
    }
}

function handleBookBlockChange() {
    bookBlockState.totalPages = parseInt(totalPagesInput.value) || 0;
    const selectedPrintMode = Array.from(printModeRadios).find(r => r.checked);
    bookBlockState.printMode = selectedPrintMode ? selectedPrintMode.value : 'double_sided';
    bookBlockState.hasA3Pages = hasA3PagesCheckbox.checked;
    bookBlockState.a3PagesCount = bookBlockState.hasA3Pages ? (parseInt(a3PagesCountInput.value) || 0) : 0;
    
    if (bookBlockState.a3PagesCount > 15) {
        bookBlockState.a3PagesCount = 15;
        a3PagesCountInput.value = 15;
    }

    bookBlockState.thickness = calculateBlockThickness(
        bookBlockState.totalPages,
        bookBlockState.paperId,
        bookBlockState.printMode,
        bookBlockState.a3PagesCount
    );

    if (onUpdateCallback) {
        onUpdateCallback(); 
    }
}

// Diese Funktion wird nicht mehr benötigt, da es keinen direkten File-Input mehr gibt.
// Das File-Objekt kommt jetzt über das Analyse-Modal.
/*
function handleMainPdfUpload(event) { ... } 
*/

export function initBookBlockHandler(calcConfig, updateCb, openPdfModalCb, mainPdfUpdateCb) {
    CALC_CONFIG_REF = calcConfig;
    onUpdateCallback = updateCb;
    openPdfAnalysisModalCallback = openPdfModalCb;
    onMainPdfUpdateCallback = mainPdfUpdateCb;

    totalPagesInput = document.getElementById('totalPages');
    printModeRadios = document.querySelectorAll('input[name="printMode"]');
    bookBlockOptionsContainer = document.getElementById('bookBlockOptionsContainer');
    hasA3PagesCheckbox = document.getElementById('hasA3Pages');
    a3PagesCountContainer = document.getElementById('a3PagesCountContainer');
    a3PagesCountInput = document.getElementById('a3PagesCount');
    bookBlockThicknessInfo = document.getElementById('bookBlockThicknessInfo');
    uploadAndAnalyzePdfBtn_DOM = document.getElementById('uploadAndAnalyzePdfBtn'); // Neuer Button-ID
    mainPdfStatusInBookBlock_DOM = document.getElementById('mainPdfStatusInBookBlock'); // Neuer Status-Div

    if (totalPagesInput) bookBlockState.totalPages = parseInt(totalPagesInput.value) || 80;
    const initialPrintMode = Array.from(printModeRadios).find(r => r.checked);
    bookBlockState.printMode = initialPrintMode ? initialPrintMode.value : 'double_sided';
    if (CALC_CONFIG_REF.papers.length > 0) {
        bookBlockState.paperId = CALC_CONFIG_REF.papers[0].id;
    }
    if (hasA3PagesCheckbox) bookBlockState.hasA3Pages = hasA3PagesCheckbox.checked;
    if (a3PagesCountInput) bookBlockState.a3PagesCount = parseInt(a3PagesCountInput.value) || 0;

    renderBookBlockOptionsDOM();
    toggleA3CountInputVisibility();

    if (totalPagesInput) totalPagesInput.addEventListener('change', handleBookBlockChange);
    
    // Event-Listener für den neuen, einzigen Upload-Button
    if (uploadAndAnalyzePdfBtn_DOM) uploadAndAnalyzePdfBtn_DOM.addEventListener('click', () => {
        if (openPdfAnalysisModalCallback) openPdfAnalysisModalCallback();
    });

    printModeRadios.forEach(radio => {
        radio.addEventListener('change', handleBookBlockChange);
    });

    if (hasA3PagesCheckbox) {
        hasA3PagesCheckbox.addEventListener('change', () => {
            toggleA3CountInputVisibility();
            if (!hasA3PagesCheckbox.checked && a3PagesCountInput) {
                a3PagesCountInput.value = "0"; 
            }
            handleBookBlockChange();
        });
    }

    if (a3PagesCountInput) {
        a3PagesCountInput.addEventListener('input', () => {
            let val = parseInt(a3PagesCountInput.value) || 0;
            val = Math.max(0, Math.min(15, val));
            a3PagesCountInput.value = val;
            handleBookBlockChange();
        });
    }
    
    handleBookBlockChange(); // Initial call
}

export function updateBookBlockUI(calculatedThickness, currentMainPdfFileName) {
    if (bookBlockThicknessInfo) {
        if ((bookBlockState.totalPages > 0 || bookBlockState.a3PagesCount > 0) && bookBlockState.paperId) {
            bookBlockThicknessInfo.textContent = `Geschätzte Dicke: ${calculatedThickness.toFixed(2)}mm`;
        } else {
            bookBlockThicknessInfo.textContent = 'Bitte Seitenzahl und Papier wählen für Dickenabschätzung.';
        }
    }
    // Aktualisiere den PDF-Status direkt hier
    updateMainPdfStatusUI(currentMainPdfFileName);
}

export function updateMainPdfStatusUI(fileName) {
    if (mainPdfStatusInBookBlock_DOM) {
        if (fileName) {
            mainPdfStatusInBookBlock_DOM.textContent = `Ausgewählte Datei: ${fileName}`;
            mainPdfStatusInBookBlock_DOM.classList.remove('error-text'); // Nur zur Sicherheit
        } else {
            mainPdfStatusInBookBlock_DOM.textContent = 'Noch keine Datei hochgeladen.';
        }
    }
}


export function getBookBlockState() {
    return { ...bookBlockState };
}

// Wird von script.js aufgerufen, wenn Daten aus dem Analyse-Modal übernommen werden
export function applyPdfAnalysisToBookBlock(analysisData, originalFileObject) {
    if (analysisData) {
        bookBlockState.totalPages = analysisData.calculatedA4Pages > 0 ? analysisData.calculatedA4Pages : (analysisData.pdfTotalPages || 0);
        bookBlockState.hasA3Pages = analysisData.a3PageCount > 0;
        bookBlockState.a3PagesCount = Math.min(15, analysisData.a3PageCount || 0);
        bookBlockState.firstPagePreviewDataURL = analysisData.firstPagePreviewDataURL;

        if (totalPagesInput) totalPagesInput.value = bookBlockState.totalPages;
        if (hasA3PagesCheckbox) hasA3PagesCheckbox.checked = bookBlockState.hasA3Pages;
        if (a3PagesCountInput) a3PagesCountInput.value = bookBlockState.a3PagesCount;
        toggleA3CountInputVisibility();
        
        // Rufe den Callback auf, um das File-Objekt und den Namen an script.js zu senden
        if (onMainPdfUpdateCallback && originalFileObject) {
            // Erzeuge einen Dateinamen, falls der Originalname nicht verfügbar ist oder für Konsistenz
            const generatedName = originalFileObject.name || `Analyse_${analysisData.pdfTotalPages}S.pdf`;
            onMainPdfUpdateCallback(originalFileObject, generatedName);
        } else if (onMainPdfUpdateCallback) {
            // Fallback, falls kein originalFileObject übergeben wurde (sollte nicht passieren)
            onMainPdfUpdateCallback(null, null);
        }
        // handleBookBlockChange(); // Wird durch onUpdateCallback in script.js getriggert
    }
}