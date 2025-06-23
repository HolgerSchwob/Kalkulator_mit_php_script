/**
 * @file thumbnail-generator.mjs
 * Generiert ein PNG-Thumbnail des U1-Bereichs (Vorderseite) aus einem SVG-String.
 *
 * LUCY'S REFACTOR V7 (BUGFIX VIEWBOX):
 * - KORREKTUR: Entfernt explizit die 'width' und 'height' Attribute vom SVG-Knoten.
 * - BEGRÜNDUNG: Dies verhindert, dass diese Attribute die 'viewBox' überschreiben,
 * wenn das SVG als Bild-Quelle verwendet wird. Dies stellt sicher, dass exakt
 * der durch die viewBox definierte Ausschnitt gerendert wird und löst das Problem
 * der "gequetschten" Thumbnails.
 */

/**
 * Generiert ein PNG-Thumbnail (als Data-URL) für den U1-Bereich (Vorderseite) eines SVG-Strings.
 * @param {string} svgString - Der rohe SVG-String der gesamten Buchdecke im originalen Koordinatensystem.
 * @param {number} spineWidthMM - Die aktuelle Buchrückenbreite in Millimetern.
 * @param {number} [outputWidthPx=200] - Die gewünschte Breite des PNG-Thumbnails in Pixel.
 * @returns {Promise<string>} Ein Promise, das mit der PNG-Data-URL aufgelöst wird.
 */
export async function generateU1Thumbnail(svgString, spineWidthMM, outputWidthPx = 200) {
    return new Promise((resolve, reject) => {
        // --- Basis-Dimensionen ---
        const SVG_CENTER_X = 250.0;
        const SVG_TOTAL_HEIGHT = 330.0;
        const VISIBLE_COVER_HEIGHT = 302.0;
        const U1_WIDTH = 215.0;

        // Y-Position ist konstant, schneidet den oberen Beschnitt ab.
        const sourceY = (SVG_TOTAL_HEIGHT - VISIBLE_COVER_HEIGHT) / 2;

        // X-Position wird von der Mitte aus berechnet.
        // Die rechte Kante des Rückens ist `SVG_CENTER_X + halbe Rückenbreite`.
        // Dort beginnt die Vorderseite (U1).
        const sourceX = SVG_CENTER_X + (spineWidthMM / 2);

        const sourceWidth = U1_WIDTH;
        const sourceHeight = VISIBLE_COVER_HEIGHT;

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = svgString;
        const svgNode = tempContainer.querySelector('svg');
        if (!svgNode) return reject(new Error("Could not find SVG element in string."));

        // --- KORREKTUR START ---
        // Entfernt width/height, damit die viewBox die alleinige Kontrolle hat.
        // Dies ist der entscheidende Fix, um gequetschte Bilder zu verhindern.
        svgNode.removeAttribute('width');
        svgNode.removeAttribute('height');
        // --- KORREKTUR ENDE ---

        // Setzt die viewBox, um exakt den U1-Bereich auszuschneiden.
        svgNode.setAttribute('viewBox', `${sourceX} ${sourceY} ${sourceWidth} ${sourceHeight}`);
        
        const image = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        image.onload = () => {
            const aspectRatio = sourceWidth / sourceHeight;
            canvas.width = outputWidthPx;
            canvas.height = outputWidthPx / aspectRatio;
            
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            
            URL.revokeObjectURL(image.src);
            resolve(canvas.toDataURL('image/png'));
        };

        image.onerror = (err) => {
            URL.revokeObjectURL(image.src);
            reject(new Error("Failed to load SVG as an image for thumbnail.", { cause: err }));
        };

        const svgBlob = new Blob([new XMLSerializer().serializeToString(svgNode)], {type: 'image/svg+xml;charset=utf-8'});
        image.src = URL.createObjectURL(svgBlob);
    });
}
