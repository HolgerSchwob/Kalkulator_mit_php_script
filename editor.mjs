// editor.mjs
import * as Constants from './constants.mjs';
import * as SvgManager from './svg-manager.mjs';
import * as UiController from './ui-controller.mjs';
import { generateU1Thumbnail } from './thumbnail-generator.mjs';

let currentEditorConfig = null;
let svgForPreviewDownload = '';

function init() {
    SvgManager.initSVG(Constants.UI_ELEMENT_IDS.SVG_CANVAS_DIV);
    UiController.initUI({
        onSpineWidthChange: handleSpineWidthChange,
        onTextChange: handleTextChange,
        onColorChange: handleColorChange,
        onTemplateChange: handleTemplateChange,
        onZoomIn: SvgManager.zoomIn,
        onZoomOut: SvgManager.zoomOut,
        onZoomReset: SvgManager.zoomReset,
        onPreviewOpen: openPreviewModal,
        onPreviewClose: closePreviewModal,
        onPreviewDownload: downloadPreviewSvg,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
        onOpenEditorUI: openEditorWithTestConfig,
        onWindowResize: handleWindowResize
    });
    console.log("Buchdecken-Editor (.mjs) initialisiert.");
}

function handleSpineWidthChange(newWidth) {
    SvgManager.updateSpineWidth(newWidth);
}

function handleTextChange(htmlInputId, newText) {
    let svgSelector;
    if (htmlInputId === undefined) {
        console.warn(`handleTextChange: htmlInputId ist undefined. Text: "${newText}"`);
        return;
    }
    switch (htmlInputId) {
        case Constants.UI_ELEMENT_IDS.TITLE_INPUT: svgSelector = Constants.SVG_IDS.TEXT_TITLE; break;
        case Constants.UI_ELEMENT_IDS.SUBTITLE_INPUT: svgSelector = Constants.SVG_IDS.TEXT_SUBTITLE; break;
        case Constants.UI_ELEMENT_IDS.AUTHOR_INPUT: svgSelector = Constants.SVG_IDS.TEXT_AUTHOR; break;
        case Constants.UI_ELEMENT_IDS.SPINE_TITLE_INPUT: svgSelector = Constants.SVG_IDS.TEXT_SPINE_TITLE; break;
        default: console.warn(`Unbekannte HTML Input ID für Text: ${htmlInputId}`); return;
    }
    SvgManager.updateText(svgSelector, newText);
}

function handleColorChange(htmlPaletteId, newColor) {
    let svgSelector;
    if (htmlPaletteId === undefined) {
        console.warn(`handleColorChange: htmlPaletteId ist undefined. Farbe: "${newColor}"`);
        return;
    }
    switch (htmlPaletteId) {
        case Constants.UI_ELEMENT_IDS.PALETTE_U1: svgSelector = Constants.SVG_IDS.COLOR_TARGET_U1; break;
        case Constants.UI_ELEMENT_IDS.PALETTE_U4: svgSelector = Constants.SVG_IDS.COLOR_TARGET_U4; break;
        default: console.warn(`Unbekannte HTML Paletten ID für Farbe: ${htmlPaletteId}`); return;
    }
    SvgManager.applyColor(svgSelector, newColor);
}

async function handleTemplateChange(template) {
    if (!template || !template.file) return;
    const svgCanvasDiv = UiController.getSvgCanvasElement();
    if (!svgCanvasDiv) return;

    const currentTextData = UiController.getTextFormValues();
    const currentSpineWidth = UiController.getSpineWidthFormValue();
    const success = await SvgManager.loadTemplate(template.file, svgCanvasDiv, currentTextData, currentSpineWidth);

    if (success) {
        if (currentEditorConfig?.logoDataUrl) SvgManager.addLogo(currentEditorConfig.logoDataUrl);
        if (currentEditorConfig?.parameters) {
            if (currentEditorConfig.parameters.colorU1) {
                SvgManager.applyColor(Constants.SVG_IDS.COLOR_TARGET_U1, currentEditorConfig.parameters.colorU1);
                UiController.setActiveColorInPalette(Constants.UI_ELEMENT_IDS.PALETTE_U1, currentEditorConfig.parameters.colorU1);
            }
            if (currentEditorConfig.parameters.colorU4) {
                SvgManager.applyColor(Constants.SVG_IDS.COLOR_TARGET_U4, currentEditorConfig.parameters.colorU4);
                UiController.setActiveColorInPalette(Constants.UI_ELEMENT_IDS.PALETTE_U4, currentEditorConfig.parameters.colorU4);
            }
        }
        console.log("Template-Wechsel erfolgreich, führe Zoom-Reset aus.");
        SvgManager.zoomReset();
    }
}

function handleWindowResize() {
    const currentSpineWidthForMainEditor = UiController.getSpineWidthFormValue();
    SvgManager.updateLayoutAndDisplay(currentSpineWidthForMainEditor);

    if (document.getElementById(Constants.UI_ELEMENT_IDS.PREVIEW_MODAL)?.style.display === 'flex') {
        const previewSvgElement = document.querySelector(`#${Constants.UI_ELEMENT_IDS.PREVIEW_SVG_CANVAS_DIV} > svg`);
        if (previewSvgElement) {
            previewSvgElement.setAttribute('width', '100%');
            previewSvgElement.setAttribute('height', '100%');
            previewSvgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            
            const currentSpineWidth = UiController.getSpineWidthFormValue();
            const targetViewBox = SvgManager.getFullCoverViewBox(currentSpineWidth);
            if (targetViewBox) {
                previewSvgElement.setAttribute('viewBox', `${targetViewBox.x} ${targetViewBox.y} ${targetViewBox.width} ${targetViewBox.height}`);
            }
        }
    }
}

async function openPreviewModal() {
    const mainDrawInstance = SvgManager.getDrawInstance();
    if (!mainDrawInstance) {
        console.error("Vorschau nicht möglich: Haupt-SVG-Instanz nicht gefunden.");
        return;
    }
    const currentSpineWidth = UiController.getSpineWidthFormValue();
    if (isNaN(currentSpineWidth) || currentSpineWidth <= 0) {
        console.error("Vorschau nicht möglich: Ungültige Rückenbreite.");
        return;
    }

    const targetViewBox = SvgManager.getFullCoverViewBox(currentSpineWidth);
    if (!targetViewBox) {
        console.error("Fehler beim Berechnen der ViewBox für die Vorschau.");
        return;
    }

    const tempExportRoot = SVG();
    mainDrawInstance.children().forEach(child => tempExportRoot.add(child.clone()));

    tempExportRoot.viewbox(targetViewBox.x, targetViewBox.y, targetViewBox.width, targetViewBox.height);
    tempExportRoot.attr({ width: null, height: null }); 
    svgForPreviewDownload = tempExportRoot.svg(); 
    tempExportRoot.remove(); 

    if (!svgForPreviewDownload) {
        console.error("Fehler beim Erstellen des SVG-Strings für die Vorschau.");
        return;
    }

    UiController.clearPreviewSvgCanvas();
    const previewSvgElement = UiController.setPreviewSvgCanvasContent(svgForPreviewDownload); 

    if (previewSvgElement) { 
        UiController.showPreviewModal(true);
        requestAnimationFrame(() => {
            // Die Debugging Logs wurden hier entfernt.
            previewSvgElement.setAttribute('width', '100%');
            previewSvgElement.setAttribute('height', '100%');
            previewSvgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        });
    } else {
        console.error("Fehler: Vorschau-SVG-Element konnte nicht zum DOM hinzugefügt werden.");
    }
}

function closePreviewModal() {
    UiController.showPreviewModal(false);
    UiController.clearPreviewSvgCanvas();
    svgForPreviewDownload = '';
}

function downloadPreviewSvg() {
    if (!svgForPreviewDownload) return;
    triggerDownload(URL.createObjectURL(new Blob([svgForPreviewDownload], { type: 'image/svg+xml' })), 'vorschau_buchdecke.svg');
}

async function handleConfirm() {
    if (!currentEditorConfig || typeof currentEditorConfig.onSubmit !== 'function') {
        console.error("Confirm Handler: onSubmit Callback oder Konfiguration fehlt.");
        return;
    }

    const currentSpineWidth = UiController.getSpineWidthFormValue();
    if (isNaN(currentSpineWidth) || currentSpineWidth <= 0) {
        console.error("Bitte geben Sie eine gültige Rückenbreite ein.");
        return;
    }

    const finalSvgString = SvgManager.getFullSvgString(currentSpineWidth);
    if (!finalSvgString) {
        console.error("Fehler beim Erstellen der SVG-Daten. Bitte versuchen Sie es erneut.");
        return;
    }

    let u1ThumbnailDataUrl = null;
    try {
        u1ThumbnailDataUrl = await generateU1Thumbnail(finalSvgString, currentSpineWidth, Constants.THUMBNAIL_TARGET_WIDTH);
    } catch (error) {
        console.error("Fehler beim Generieren des U1 Thumbnails:", error);
        u1ThumbnailDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }

    const textParameters = UiController.getTextFormValues();
    const currentTemplate = UiController.getCurrentTemplate();
    const activeColorU1 = document.querySelector(`#${Constants.UI_ELEMENT_IDS.PALETTE_U1} button.active`)?.dataset.color;
    const activeColorU4 = document.querySelector(`#${Constants.UI_ELEMENT_IDS.PALETTE_U4} button.active`)?.dataset.color;

    const result = {
        svgString: finalSvgString,
        thumbnailDataUrl: u1ThumbnailDataUrl,
        parameters: {
            textInputs: textParameters,
            templateId: currentTemplate?.id || null,
            templateFile: currentTemplate?.file || null,
            colorU1: activeColorU1 || currentEditorConfig.parameters?.colorU1 || null,
            colorU4: activeColorU4 || currentEditorConfig.parameters?.colorU4 || null,
            spineWidth: currentSpineWidth,
        }
    };

    currentEditorConfig.onSubmit(result);
    closeEditor();
}

function displayTestOutput(result) {
    const outputDiv = document.getElementById(Constants.UI_ELEMENT_IDS.RESULT_OUTPUT);
    if (!outputDiv) return;
    outputDiv.innerHTML = '';

    const thumbHeader = document.createElement('h4');
    thumbHeader.textContent = 'Generiertes U1 Thumbnail (PNG):';
    outputDiv.appendChild(thumbHeader);
    const img = document.createElement('img');
    img.src = result.thumbnailDataUrl;
    img.alt = 'U1 Thumbnail';
    img.style.border = "1px solid #ccc";
    img.style.maxWidth = "200px";
    outputDiv.appendChild(img);

    const downloadThumbButton = document.createElement('button');
    downloadThumbButton.textContent = 'Thumbnail Herunterladen';
    downloadThumbButton.onclick = () => triggerDownload(result.thumbnailDataUrl, 'u1_thumbnail.png');
    outputDiv.appendChild(downloadThumbButton);
    outputDiv.appendChild(document.createElement('hr'));

    const svgHeader = document.createElement('h4');
    svgHeader.textContent = 'SVG Rohdaten (gekürzt):';
    outputDiv.appendChild(svgHeader);
    const svgPre = document.createElement('pre');
    svgPre.textContent = result.svgString.substring(0, 500) + (result.svgString.length > 500 ? '...' : '');
    outputDiv.appendChild(svgPre);

    const downloadSvgButton = document.createElement('button');
    downloadSvgButton.textContent = 'SVG Herunterladen';
    downloadSvgButton.onclick = () => downloadData(result.svgString, 'buchdecke.svg', 'image/svg+xml');
    outputDiv.appendChild(downloadSvgButton);
    outputDiv.appendChild(document.createElement('hr'));

    const paramsHeader = document.createElement('h4');
    paramsHeader.textContent = 'Übergebene Parameter:';
    outputDiv.appendChild(paramsHeader);
    const paramsPre = document.createElement('pre');
    paramsPre.textContent = JSON.stringify(result.parameters, null, 2);
    outputDiv.appendChild(paramsPre);
}

function downloadData(data, fileName, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    URL.revokeObjectURL(url);
}

function triggerDownload(href, fileName) {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


function handleCancel() {
    if (currentEditorConfig?.onCancel) {
        currentEditorConfig.onCancel();
    }
    closeEditor();
}

async function openEditor(config) {
    currentEditorConfig = config;
    if (!currentEditorConfig) {
        console.error("Editor konnte nicht geöffnet werden: Keine Konfiguration übergeben.");
        return;
    }

    const spineWidth = config.spineWidth || Constants.DEFAULT_SPINE_WIDTH;
    UiController.setSpineWidthFormValue(spineWidth);

    const svgCanvasDiv = UiController.getSvgCanvasElement();
    if (!svgCanvasDiv) {
        console.error("SVG Canvas Element nicht gefunden. Editor kann nicht initialisiert werden.");
        return;
    }

    let templateFileToLoad;
    if (config.initialLayoutTemplate) {
        const foundTemplateById = Constants.TEMPLATES.find(t => t.id === config.initialLayoutTemplate);
        templateFileToLoad = foundTemplateById ? foundTemplateById.file :
            (config.initialLayoutTemplate.endsWith('.svg') ? config.initialLayoutTemplate : `${config.initialLayoutTemplate}.svg`);
    } else {
        templateFileToLoad = Constants.TEMPLATES[0]?.file || null;
    }

    let successLoading = false;
    if (templateFileToLoad) {
        successLoading = await SvgManager.loadTemplate(templateFileToLoad, svgCanvasDiv, config.initialTextData, spineWidth);
    } else {
        svgCanvasDiv.innerHTML = "<p style='color:red;'>Fehler: Kein gültiges Template zum Laden spezifiziert.</p>";
    }

    if (successLoading) {
        UiController.setActiveTemplate(templateFileToLoad);
        if (config.initialTextData) UiController.setTextFormValues(config.initialTextData);

        if (config.parameters) {
            if (config.parameters.colorU1) {
                 SvgManager.applyColor(Constants.SVG_IDS.COLOR_TARGET_U1, currentEditorConfig.parameters.colorU1);
                 UiController.setActiveColorInPalette(Constants.UI_ELEMENT_IDS.PALETTE_U1, currentEditorConfig.parameters.colorU1);
            }
            if (config.parameters.colorU4) {
                 SvgManager.applyColor(Constants.SVG_IDS.COLOR_TARGET_U4, currentEditorConfig.parameters.colorU4);
                 UiController.setActiveColorInPalette(Constants.UI_ELEMENT_IDS.PALETTE_U4, currentEditorConfig.parameters.colorU4);
            }
        }

        if (config.logoFileObject) {
            try {
                currentEditorConfig.logoDataUrl = await readFileAsDataURL(config.logoFileObject);
                SvgManager.addLogo(currentEditorConfig.logoDataUrl);
            } catch (error) {
                console.error("Fehler beim Lesen oder Anzeigen der Logo-Datei:", error);
            }
        }
    } else {
        console.error(`Konnte Template ${templateFileToLoad || 'unbekannt'} nicht laden. Editor möglicherweise nicht voll funktionsfähig.`);
    }

    UiController.showEditorModal(true);

    requestAnimationFrame(() => {
        console.log("Explizites SvgManager.zoomReset() nach Modal-Anzeige im nächsten Frame.");
        SvgManager.zoomReset();
    });
}

function closeEditor() {
    UiController.showEditorModal(false);
    currentEditorConfig = null;
}

function readFileAsDataURL(fileObject) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(new Error("Fehler beim Lesen der Datei: " + error));
        reader.readAsDataURL(fileObject);
    });
}

function openEditorWithTestConfig() {
    const templateToUse = Constants.TEMPLATES[1] || Constants.TEMPLATES[0];
    const testConfig = {
        spineWidth: 22,
        initialLayoutTemplate: templateToUse?.file || null,
        initialTextData: {
            cover_title: "Test Titel aus Config",
            cover_subtitle: "Ein Untertitel zum Testen",
            cover_authorName: "Dr. Config Tester",
            spine_title: "Config Rücken"
        },
        parameters: {
            colorU1: "orange",
            colorU4: "blue"
        },
        onSubmit: (result) => {
            console.log("Editor onSubmit Callback (Test-Modus):", result);
            displayTestOutput(result);
        },
        onCancel: () => {
            console.log("Editor onCancel Callback (Test)");
            const outputDiv = document.getElementById(Constants.UI_ELEMENT_IDS.RESULT_OUTPUT);
            if (outputDiv) outputDiv.textContent = "Editor abgebrochen.";
        }
    };
    openEditor(testConfig);
}

init();

export const svgCoverEditor = {
    open: openEditor
};
