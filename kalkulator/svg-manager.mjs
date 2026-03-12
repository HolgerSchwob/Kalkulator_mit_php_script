// svg-manager.mjs
import {
    SVG_TOTAL_WIDTH, SVG_TOTAL_HEIGHT, VISIBLE_COVER_HEIGHT, U1_WIDTH, U4_WIDTH, SVG_IDS,
    UI_ELEMENT_IDS, ZOOM_STEP, DEFAULT_SPINE_WIDTH
} from './constants.mjs'; // THUMBNAIL_TARGET_WIDTH entfernt, da nicht mehr hier verwendet

let draw; 
let groupU1, groupU4, groupSpine; 
let textTitle, textSubtitle, textAuthor, textSpineTitle; 
let colorTargetU1, colorTargetU4; 
let spineBgRect; 
let initialSpineTextY; 

let currentZoomLevel = 1.0; 
let panOffset = { x: 0, y: 0 }; 
let baseViewBox = { x: 0, y: 0, width: SVG_TOTAL_WIDTH, height: VISIBLE_COVER_HEIGHT };

export function initSVG(svgCanvasElementId = UI_ELEMENT_IDS.SVG_CANVAS_DIV) {
    const svgCanvasElement = document.getElementById(svgCanvasElementId);
    if (!svgCanvasElement) {
        console.error(`SVG Manager: SVG Canvas Element mit ID '${svgCanvasElementId}' nicht gefunden.`);
        return null;
    }
    svgCanvasElement.innerHTML = ''; 
    return svgCanvasElement;
}

export async function loadTemplate(fileName, svgCanvasDiv, initialTextValues = {}, initialSpineWidth) {
    try {
        const response = await fetch(`./${fileName}`); 
        if (!response.ok) throw new Error(`Template ${fileName} nicht geladen. Status: ${response.status}`);
        const svgText = await response.text(); 

        svgCanvasDiv.innerHTML = ''; 
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = svgText.trim(); 
        const loadedSvgElement = tempContainer.firstChild;

        if (loadedSvgElement && loadedSvgElement.nodeName.toLowerCase() === 'svg') {
            svgCanvasDiv.appendChild(loadedSvgElement); 
            if (typeof SVG === 'undefined') {
                console.error("SVG.js ist nicht global verfügbar. Stelle sicher, dass die Bibliothek geladen ist.");
                return false;
            }
            draw = SVG(loadedSvgElement); 
        } else {
            throw new Error("Kein gültiges SVG-Wurzelelement im Template gefunden.");
        }

        if (!draw || !draw.node) {
            console.error("Konnte SVG nicht mit SVG.js verbinden. 'draw' Instanz ist ungültig.");
            return false;
        }

        draw.attr('preserveAspectRatio', 'xMidYMid meet'); 
        draw.attr('width', null);
        draw.attr('height', null);

        groupU1 = draw.findOne(SVG_IDS.GROUP_U1);
        groupU4 = draw.findOne(SVG_IDS.GROUP_U4);
        groupSpine = draw.findOne(SVG_IDS.GROUP_SPINE);
        textTitle = draw.findOne(SVG_IDS.TEXT_TITLE);
        textSubtitle = draw.findOne(SVG_IDS.TEXT_SUBTITLE);
        textAuthor = draw.findOne(SVG_IDS.TEXT_AUTHOR);
        textSpineTitle = draw.findOne(SVG_IDS.TEXT_SPINE_TITLE);
        colorTargetU1 = draw.findOne(SVG_IDS.COLOR_TARGET_U1);
        colorTargetU4 = draw.findOne(SVG_IDS.COLOR_TARGET_U4);
        spineBgRect = draw.findOne(SVG_IDS.SPINE_BG);

        if (!groupU1 || !groupU4 || !groupSpine || !textTitle || !textSubtitle || !textAuthor || !textSpineTitle || !spineBgRect) {
            console.error("Ein oder mehrere wichtige SVG-Elemente (definiert in SVG_IDS) wurden im Template nicht gefunden:", fileName);
            draw = null; 
            return false;
        }

        initialSpineTextY = parseFloat(textSpineTitle.attr('y'));
        if (isNaN(initialSpineTextY)) initialSpineTextY = VISIBLE_COVER_HEIGHT / 2; 

        if (initialTextValues.cover_title && textTitle) textTitle.text(initialTextValues.cover_title);
        if (initialTextValues.cover_subtitle && textSubtitle) textSubtitle.text(initialTextValues.cover_subtitle);
        if (initialTextValues.cover_authorName && textAuthor) textAuthor.text(initialTextValues.cover_authorName);
        if (initialTextValues.spine_title && textSpineTitle) textSpineTitle.text(initialTextValues.spine_title);

        currentZoomLevel = 1.0; 
        panOffset = { x: 0, y: 0 }; 

        const actualSpineWidth = initialSpineWidth !== undefined ?
                                 initialSpineWidth :
                                 (parseFloat(document.getElementById(UI_ELEMENT_IDS.SPINE_WIDTH_INPUT)?.value) || DEFAULT_SPINE_WIDTH);

        calculateBasePositionsAndViewBox(actualSpineWidth); 

        console.log(`Template "${fileName}" erfolgreich geladen. Rückenbreite: ${actualSpineWidth}mm. Die ViewBox wird durch zoomReset() oder updateLayoutAndDisplay() initial gesetzt.`);
        return true;
    } catch (error) {
        console.error(`Fehler beim Laden oder Initialisieren des SVG-Templates "${fileName}":`, error);
        if (svgCanvasDiv) svgCanvasDiv.innerHTML = `<p style='color:red;'>Fehler beim Laden des Templates: ${error.message}. Bitte Konsole prüfen.</p>`;
        draw = null;
        return false;
    }
}

export function updateText(elementIdSelector, newText) {
    if (!draw) return;
    const textElement = draw.findOne(elementIdSelector);
    if (textElement) {
        textElement.text(newText);
    } else {
        console.warn(`Textelement mit Selektor "${elementIdSelector}" nicht gefunden.`);
    }
}

export function applyColor(targetIdSelector, color) {
    if (!draw) return;
    const targetElement = draw.findOne(targetIdSelector);
    if (targetElement) {
        targetElement.fill(color);
    } else {
        console.warn(`Farb-Zielelement mit Selektor "${targetIdSelector}" nicht gefunden.`);
    }
}

export function addLogo(logoDataUrl) {
    if (!draw) return;
    let existingLogo = draw.findOne(SVG_IDS.USER_LOGO); 
    if (existingLogo) existingLogo.remove(); 

    let logoPlaceholder = draw.findOne(SVG_IDS.LOGO_PLACEHOLDER); 
    if (logoPlaceholder) {
        const x = parseFloat(logoPlaceholder.x());
        const y = parseFloat(logoPlaceholder.y());
        const w = parseFloat(logoPlaceholder.width());
        const h = parseFloat(logoPlaceholder.height());

        if (![x, y, w, h].some(isNaN) && w > 0 && h > 0) {
            draw.image(logoDataUrl).size(w, h).move(x, y).attr('id', SVG_IDS.USER_LOGO.substring(1));
            logoPlaceholder.opacity(0); 
        } else {
            console.warn("Logo-Platzhalter hat ungültige Dimensionen. Logo wird mit Standardgröße platziert.");
            draw.image(logoDataUrl).size(50, 50).move(25, 25).attr('id', SVG_IDS.USER_LOGO.substring(1));
        }
    } else {
        console.warn("Kein Logo-Platzhalter im SVG definiert. Logo wird mit Standardgröße und -position platziert.");
        draw.image(logoDataUrl).size(50, 50).move(25, 25).attr('id', SVG_IDS.USER_LOGO.substring(1));
    }
    updateLayoutAndDisplay(); 
}

function calculateBasePositionsAndViewBox(currentSpineWidth) {
    if (!draw || !groupU4 || !groupU1 || !groupSpine || !spineBgRect || !textSpineTitle) {
        console.warn("calculateBasePositionsAndViewBox: Wichtige SVG-Elemente sind nicht initialisiert.");
        return null;
    }
    const spineW = parseFloat(currentSpineWidth);
    if (isNaN(spineW) || spineW <= 0) {
        console.warn("calculateBasePositionsAndViewBox: Ungültige Rückenbreite:", currentSpineWidth);
        return null;
    }

    const SVG_DESIGN_AREA_CENTER_X = SVG_TOTAL_WIDTH / 2;

    const targetU4_X = SVG_DESIGN_AREA_CENTER_X - (spineW / 2) - U4_WIDTH;
    const targetSpine_X = SVG_DESIGN_AREA_CENTER_X - (spineW / 2);
    const targetU1_X = SVG_DESIGN_AREA_CENTER_X + (spineW / 2);

    groupU4.transform({ translateX: targetU4_X });
    groupSpine.transform({ translateX: targetSpine_X });
    groupU1.transform({ translateX: targetU1_X });

    spineBgRect.width(spineW);

    const newSpineTextRelX = spineW / 2;
    textSpineTitle.attr('x', newSpineTextRelX);

    const currentVisibleContentWidth = U4_WIDTH + spineW + U1_WIDTH;
    const viewBoxY = (SVG_TOTAL_HEIGHT - VISIBLE_COVER_HEIGHT) / 2;

    baseViewBox = {
        x: targetU4_X, 
        y: viewBoxY,
        width: currentVisibleContentWidth,
        height: VISIBLE_COVER_HEIGHT
    };
    return baseViewBox;
}

function applyViewPortAndScaling(currentSpineWidth) {
    if (!draw) { console.warn("applyViewPortAndScaling: 'draw' ist nicht initialisiert."); return; }
    const svgContainer = document.getElementById(UI_ELEMENT_IDS.SVG_CONTAINER);
    if (!svgContainer) { console.warn("applyViewPortAndScaling: SVG Container Element nicht gefunden."); return; }

    const spineW = parseFloat(currentSpineWidth);
    if (isNaN(spineW) || spineW <= 0) {
        console.warn("applyViewPortAndScaling: Ungültige Rückenbreite:", currentSpineWidth);
        return; 
    }

    const calculatedBaseViewBox = calculateBasePositionsAndViewBox(spineW);
    if (!calculatedBaseViewBox) {
        console.warn("applyViewPortAndScaling: Konnte baseViewBox nicht berechnen. Layout wird nicht aktualisiert.");
        return;
    }

    const finalViewBoxWidth = calculatedBaseViewBox.width / currentZoomLevel;
    const finalViewBoxHeight = calculatedBaseViewBox.height / currentZoomLevel;

    const finalViewBoxX = calculatedBaseViewBox.x + (calculatedBaseViewBox.width - finalViewBoxWidth) / 2 + panOffset.x;
    const finalViewBoxY = calculatedBaseViewBox.y + (calculatedBaseViewBox.height - finalViewBoxHeight) / 2 + panOffset.y;
    
    draw.viewbox(finalViewBoxX, finalViewBoxY, finalViewBoxWidth, finalViewBoxHeight);
    draw.size('100%', '100%');
}

export function updateLayoutAndDisplay(currentSpineWidthFromInput) {
    const editorModalElement = document.getElementById(UI_ELEMENT_IDS.EDITOR_MODAL);
    if (!editorModalElement || editorModalElement.style.display === 'none' || !draw) {
        return;
    }

    let currentSpineWidth = parseFloat(currentSpineWidthFromInput);
    if (isNaN(currentSpineWidth) || currentSpineWidth <= 0) {
        const spineWidthInputEl = document.getElementById(UI_ELEMENT_IDS.SPINE_WIDTH_INPUT);
        currentSpineWidth = parseFloat(spineWidthInputEl?.value) || DEFAULT_SPINE_WIDTH;
    }

    requestAnimationFrame(() => {
        applyViewPortAndScaling(currentSpineWidth);
    });
}

export function updateSpineWidth(newSpineWidth) {
    const width = parseFloat(newSpineWidth);
    if (isNaN(width) || width <= 0) {
        console.warn("updateSpineWidth: Ungültige Rückenbreite:", newSpineWidth);
        return;
    }
    updateLayoutAndDisplay(width);
}


export function zoomIn() {
    currentZoomLevel += ZOOM_STEP;
    currentZoomLevel = Math.min(currentZoomLevel, 5.0); 
    updateLayoutAndDisplay();
}

export function zoomOut() {
    currentZoomLevel -= ZOOM_STEP;
    currentZoomLevel = Math.max(currentZoomLevel, 0.2); 
    updateLayoutAndDisplay();
}

export function zoomReset() {
    currentZoomLevel = 1.0;
    panOffset = { x: 0, y: 0 };
    updateLayoutAndDisplay(); 
}

let isPanning = false;
let lastPanPosition = { x: 0, y: 0 }; 

export function startPan(event) {
    if (!draw || event.button !== 0) return false; 
    isPanning = true;
    const pt = draw.point(event.clientX, event.clientY);
    if (pt) {
        lastPanPosition = { x: pt.x, y: pt.y };
        return true;
    }
    isPanning = false; 
    return false;
}

export function pan(event) {
    if (!isPanning || !draw) return;
    event.preventDefault(); 
    const pt = draw.point(event.clientX, event.clientY);
    if (!pt) return;

    const dx = pt.x - lastPanPosition.x; 
    const dy = pt.y - lastPanPosition.y;

    panOffset.x -= dx;
    panOffset.y -= dy;

    lastPanPosition = { x: pt.x, y: pt.y };

    updateLayoutAndDisplay();
}

export function endPan() {
    if (isPanning) {
        isPanning = false;
        return true;
    }
    return false;
}

export function getDrawInstance() { return draw; }

export function getFullSvgString(currentSpineWidth) {
    if (!draw) return null;
    const spineW = parseFloat(currentSpineWidth);
    if (isNaN(spineW) || spineW <= 0) {
        console.error("getFullSvgString: Ungültige Rückenbreite für Export:", currentSpineWidth);
        return null;
    }

    const originalViewBoxForDisplay = draw.viewbox();
    const originalSize = { width: draw.attr('width'), height: draw.attr('height') };

    const exportViewBox = getFullCoverViewBox(spineW); 
    if (!exportViewBox) {
        console.error("getFullSvgString: Konnte Export-ViewBox nicht berechnen.");
        if (originalViewBoxForDisplay) draw.viewbox(originalViewBoxForDisplay);
        if (originalSize.width !== null || originalSize.height !== null) draw.size(originalSize.width, originalSize.height);
        return null;
    }

    draw.viewbox(exportViewBox.x, exportViewBox.y, exportViewBox.width, exportViewBox.height);
    draw.attr({ width: null, height: null }); 

    const svgString = draw.svg(); 

    if (originalViewBoxForDisplay) draw.viewbox(originalViewBoxForDisplay);
    if (originalSize.width !== null || originalSize.height !== null) {
        draw.size(originalSize.width, originalSize.height);
    } else {
        draw.size('100%', '100%');
    }
    return svgString;
}

export function getFullCoverViewBox(currentSpineWidth) {
    const spineW = parseFloat(currentSpineWidth);
    if (isNaN(spineW) || spineW <= 0) {
        console.warn("getFullCoverViewBox: Ungültige Rückenbreite:", currentSpineWidth);
        return null;
    }
    const SVG_DESIGN_AREA_CENTER_X = SVG_TOTAL_WIDTH / 2;
    const targetU4_X = SVG_DESIGN_AREA_CENTER_X - (spineW / 2) - U4_WIDTH;
    const currentVisibleContentWidth = U4_WIDTH + spineW + U1_WIDTH;
    const viewBoxY = (SVG_TOTAL_HEIGHT - VISIBLE_COVER_HEIGHT) / 2;

    return {
        x: targetU4_X,
        y: viewBoxY,
        width: currentVisibleContentWidth,
        height: VISIBLE_COVER_HEIGHT
    };
}

// Die alte Funktion generateU1ThumbnailDataUrl wurde entfernt.

export function resetPanOffset() { panOffset = { x: 0, y: 0 }; }
export function resetZoomLevel() { currentZoomLevel = 1.0; }