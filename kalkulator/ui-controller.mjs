// ui-controller.mjs
import { UI_ELEMENT_IDS, TEMPLATES } from './constants.mjs'; // <-- .mjs Endung
import * as SvgManager from './svg-manager.mjs'; // <-- .mjs Endung

let titleInput, subtitleInput, authorInput, spineTitleInput, spineWidthInput;
let paletteU1, paletteU4;
let miniaturesList, prevTemplateButton, nextTemplateButton;
let editorModal, previewModal, svgContainerElement;

let onSpineWidthChangeCallback;
let onTextChangeCallback;
let onColorChangeCallback;
let onTemplateChangeCallback;
let onZoomInCallback, onZoomOutCallback, onZoomResetCallback;
let onPreviewOpenCallback, onPreviewCloseCallback, onPreviewDownloadCallback;
let onConfirmCallback, onCancelCallback;
let onOpenEditorUICallback;
let onWindowResizeCallback;


let currentTemplateIndex = 0;
const miniatureWidthWithMargin = 80 + 8;
let visibleMiniaturesInSlider = 3;

export function initUI(callbacks) {
    onSpineWidthChangeCallback = callbacks.onSpineWidthChange;
    onTextChangeCallback = callbacks.onTextChange;
    onColorChangeCallback = callbacks.onColorChange;
    onTemplateChangeCallback = callbacks.onTemplateChange;
    onZoomInCallback = callbacks.onZoomIn;
    onZoomOutCallback = callbacks.onZoomOut;
    onZoomResetCallback = callbacks.onZoomReset;
    onPreviewOpenCallback = callbacks.onPreviewOpen;
    onPreviewCloseCallback = callbacks.onPreviewClose;
    onPreviewDownloadCallback = callbacks.onPreviewDownload;
    onConfirmCallback = callbacks.onConfirm;
    onCancelCallback = callbacks.onCancel;
    onOpenEditorUICallback = callbacks.onOpenEditorUI;
    onWindowResizeCallback = callbacks.onWindowResize;


    editorModal = document.getElementById(UI_ELEMENT_IDS.EDITOR_MODAL);
    previewModal = document.getElementById(UI_ELEMENT_IDS.PREVIEW_MODAL);
    svgContainerElement = document.getElementById(UI_ELEMENT_IDS.SVG_CONTAINER);

    titleInput = document.getElementById(UI_ELEMENT_IDS.TITLE_INPUT);
    subtitleInput = document.getElementById(UI_ELEMENT_IDS.SUBTITLE_INPUT);
    authorInput = document.getElementById(UI_ELEMENT_IDS.AUTHOR_INPUT);
    spineTitleInput = document.getElementById(UI_ELEMENT_IDS.SPINE_TITLE_INPUT);
    spineWidthInput = document.getElementById(UI_ELEMENT_IDS.SPINE_WIDTH_INPUT);

    paletteU1 = document.getElementById(UI_ELEMENT_IDS.PALETTE_U1);
    paletteU4 = document.getElementById(UI_ELEMENT_IDS.PALETTE_U4);

    miniaturesList = document.getElementById(UI_ELEMENT_IDS.TEMPLATE_MINIATURES_LIST);
    prevTemplateButton = document.getElementById(UI_ELEMENT_IDS.PREV_TEMPLATE_BUTTON);
    nextTemplateButton = document.getElementById(UI_ELEMENT_IDS.NEXT_TEMPLATE_BUTTON);

    titleInput?.addEventListener('input', (e) => {
        if (onTextChangeCallback) onTextChangeCallback(UI_ELEMENT_IDS.TITLE_INPUT, e.target.value);
    });
    subtitleInput?.addEventListener('input', (e) => {
        if (onTextChangeCallback) onTextChangeCallback(UI_ELEMENT_IDS.SUBTITLE_INPUT, e.target.value);
    });
    authorInput?.addEventListener('input', (e) => {
        if (onTextChangeCallback) onTextChangeCallback(UI_ELEMENT_IDS.AUTHOR_INPUT, e.target.value);
    });
    spineTitleInput?.addEventListener('input', (e) => {
        if (onTextChangeCallback) onTextChangeCallback(UI_ELEMENT_IDS.SPINE_TITLE_INPUT, e.target.value);
    });
    spineWidthInput?.addEventListener('input', (e) => {
        const newWidth = parseFloat(e.target.value);
        if (!isNaN(newWidth) && onSpineWidthChangeCallback) {
            onSpineWidthChangeCallback(newWidth);
        }
    });

    paletteU1?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.color && onColorChangeCallback) {
            onColorChangeCallback(UI_ELEMENT_IDS.PALETTE_U1, e.target.dataset.color);
            paletteU1.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
    paletteU4?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.color && onColorChangeCallback) {
            onColorChangeCallback(UI_ELEMENT_IDS.PALETTE_U4, e.target.dataset.color);
            paletteU4.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        }
    });

    populateTemplateSlider();
    prevTemplateButton?.addEventListener('click', slideTemplatesPrevious);
    nextTemplateButton?.addEventListener('click', slideTemplatesNext);

    document.getElementById(UI_ELEMENT_IDS.ZOOM_IN_BUTTON)?.addEventListener('click', onZoomInCallback);
    document.getElementById(UI_ELEMENT_IDS.ZOOM_OUT_BUTTON)?.addEventListener('click', onZoomOutCallback);
    document.getElementById(UI_ELEMENT_IDS.ZOOM_RESET_BUTTON)?.addEventListener('click', onZoomResetCallback);

    svgContainerElement?.addEventListener('mousedown', (e) => {
        if (SvgManager.startPan(e)) {
            svgContainerElement.style.cursor = 'grabbing';
        }
    });
    document.addEventListener('mousemove', (e) => {
        SvgManager.pan(e);
    });
    document.addEventListener('mouseup', () => {
        if (SvgManager.endPan() && svgContainerElement) {
            svgContainerElement.style.cursor = 'grab';
        }
    });
     svgContainerElement?.addEventListener('mouseleave', () => {
        if (SvgManager.endPan() && svgContainerElement) {
            svgContainerElement.style.cursor = 'grab';
        }
    });

    document.getElementById(UI_ELEMENT_IDS.EDITOR_PREVIEW_BUTTON)?.addEventListener('click', onPreviewOpenCallback);
    document.getElementById(UI_ELEMENT_IDS.CLOSE_PREVIEW_MODAL_BUTTON)?.addEventListener('click', onPreviewCloseCallback);
    document.getElementById(UI_ELEMENT_IDS.DOWNLOAD_PREVIEW_SVG_BUTTON)?.addEventListener('click', onPreviewDownloadCallback);
    document.getElementById(UI_ELEMENT_IDS.EDITOR_CONFIRM_BUTTON)?.addEventListener('click', onConfirmCallback);
    document.getElementById(UI_ELEMENT_IDS.EDITOR_CANCEL_BUTTON)?.addEventListener('click', onCancelCallback);

    const openEditorButton = document.getElementById(UI_ELEMENT_IDS.OPEN_EDITOR_BUTTON);
    if (openEditorButton && onOpenEditorUICallback) {
         openEditorButton.addEventListener('click', onOpenEditorUICallback);
    }

    window.addEventListener('resize', () => {
        calculateVisibleMiniatures();
        if (onWindowResizeCallback) { // Sicherstellen, dass der Callback existiert
            onWindowResizeCallback();
        }
    });
    calculateVisibleMiniatures();
}

function populateTemplateSlider() {
    if (!miniaturesList) return;
    miniaturesList.innerHTML = '';
    TEMPLATES.forEach((template, index) => {
        const img = document.createElement('img');
        img.src = `./${template.file}`;
        img.alt = template.name;
        img.classList.add('template-miniature');
        if (index === currentTemplateIndex) {
            img.classList.add('active');
        }
        img.addEventListener('click', () => {
            currentTemplateIndex = index;
            if (onTemplateChangeCallback) onTemplateChangeCallback(template);
            updateActiveMiniatureVisuals();
        });
        miniaturesList.appendChild(img);
    });
    calculateVisibleMiniatures();
}

function updateActiveMiniatureVisuals() {
    if (!miniaturesList) return;
    miniaturesList.querySelectorAll('.template-miniature').forEach((m, i) => {
        m.classList.toggle('active', i === currentTemplateIndex);
    });
}

function calculateVisibleMiniatures() {
    const sliderElement = miniaturesList?.parentElement;
    if (sliderElement) {
        visibleMiniaturesInSlider = Math.max(1, Math.floor(sliderElement.clientWidth / miniatureWidthWithMargin));
    }
}

function slideTemplatesPrevious() {
    if (!miniaturesList) return;
    const currentOffset = parseFloat(miniaturesList.style.transform.replace('translateX(', '').replace('px)', '')) || 0;
    const scrollAmount = miniatureWidthWithMargin * visibleMiniaturesInSlider;
    const newOffset = Math.min(0, currentOffset + scrollAmount);
    miniaturesList.style.transform = `translateX(${newOffset}px)`;
}

function slideTemplatesNext() {
    if (!miniaturesList) return;
    const sliderElement = miniaturesList.parentElement;
    if (!sliderElement) return;

    const sliderVisibleWidth = sliderElement.clientWidth;
    const totalMiniaturesWidth = TEMPLATES.length * miniatureWidthWithMargin;
    const maxPossibleScroll = totalMiniaturesWidth - sliderVisibleWidth;

    if (maxPossibleScroll <= 0) return;

    const currentOffset = parseFloat(miniaturesList.style.transform.replace('translateX(', '').replace('px)', '')) || 0;
    const scrollAmount = miniatureWidthWithMargin * visibleMiniaturesInSlider;
    const newOffset = Math.max(-maxPossibleScroll, currentOffset - scrollAmount);
    miniaturesList.style.transform = `translateX(${newOffset}px)`;
}

export function setTextFormValues(textData) {
    if (!textData) return;
    if (titleInput && textData.cover_title !== undefined) titleInput.value = textData.cover_title;
    if (subtitleInput && textData.cover_subtitle !== undefined) subtitleInput.value = textData.cover_subtitle;
    if (authorInput && textData.cover_authorName !== undefined) authorInput.value = textData.cover_authorName;
    if (spineTitleInput && textData.spine_title !== undefined) spineTitleInput.value = textData.spine_title;
}

export function setSpineWidthFormValue(width) {
    if (spineWidthInput && width !== undefined) {
        spineWidthInput.value = width;
    }
}

export function getTextFormValues() {
    return {
        cover_title: titleInput?.value || "",
        cover_subtitle: subtitleInput?.value || "",
        cover_authorName: authorInput?.value || "",
        spine_title: spineTitleInput?.value || ""
    };
}

export function getSpineWidthFormValue() {
    return parseFloat(spineWidthInput?.value);
}

export function showEditorModal(show) {
    if (editorModal) editorModal.style.display = show ? 'flex' : 'none';
    if (typeof window !== 'undefined' && window !== window.top && window.parent.postMessage) {
        try {
            window.parent.postMessage({ type: show ? 'kalkulator-modal-opened' : 'kalkulator-modal-closed' }, '*');
        } catch (_) {}
    }
}

export function showPreviewModal(show) {
    if (previewModal) previewModal.style.display = show ? 'flex' : 'none';
    if (typeof window !== 'undefined' && window !== window.top && window.parent.postMessage) {
        try {
            window.parent.postMessage({ type: show ? 'kalkulator-modal-opened' : 'kalkulator-modal-closed' }, '*');
        } catch (_) {}
    }
}

export function setActiveTemplate(templateFile) {
    const index = TEMPLATES.findIndex(t => t.file === templateFile);
    if (index !== -1) {
        currentTemplateIndex = index;
        updateActiveMiniatureVisuals();
    } else {
        console.warn(`setActiveTemplate: Template mit Dateinamen "${templateFile}" nicht in TEMPLATES gefunden.`);
    }
}

export function getCurrentTemplate() {
    return TEMPLATES[currentTemplateIndex] || null;
}

export function setResultOutput(text) { // Behalten für einfache Textausgaben, falls noch irgendwo genutzt
    const outputDiv = document.getElementById(UI_ELEMENT_IDS.RESULT_OUTPUT);
    if (outputDiv) {
        outputDiv.textContent = text;
    }
}

export function clearPreviewSvgCanvas() {
    const previewSvgCanvasDiv = document.getElementById(UI_ELEMENT_IDS.PREVIEW_SVG_CANVAS_DIV);
    if (previewSvgCanvasDiv) {
        previewSvgCanvasDiv.innerHTML = '';
    }
}

export function setPreviewSvgCanvasContent(svgString) {
    const previewSvgCanvasDiv = document.getElementById(UI_ELEMENT_IDS.PREVIEW_SVG_CANVAS_DIV);
    if (!previewSvgCanvasDiv) return null;

    previewSvgCanvasDiv.innerHTML = '';
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = svgString.trim();
    const previewSvgElement = tempContainer.firstChild;

    if (previewSvgElement && previewSvgElement.nodeName.toLowerCase() === 'svg') {
        previewSvgCanvasDiv.appendChild(previewSvgElement);
        return previewSvgElement;
    } else {
        previewSvgCanvasDiv.innerHTML = "<p style='color:red;'>Fehler bei Vorschau-SVG.</p>";
        return null;
    }
}

export function getPreviewSvgContainerElement() {
    return document.getElementById(UI_ELEMENT_IDS.PREVIEW_SVG_CONTAINER);
}

export function getSvgCanvasElement() {
    return document.getElementById(UI_ELEMENT_IDS.SVG_CANVAS_DIV);
}

export function setActiveColorInPalette(paletteId, color) {
    const paletteElement = document.getElementById(paletteId);
    if (paletteElement) {
        paletteElement.querySelectorAll('button').forEach(btn => {
            if (btn.dataset.color === color) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}
