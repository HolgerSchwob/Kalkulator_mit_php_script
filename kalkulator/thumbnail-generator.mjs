// thumbnail-generator.mjs
// Generiert ein PNG-Thumbnail des U1-Bereichs aus einem SVG-String.

// Importiere Konstanten für Dimensionen
import {
    U1_WIDTH as U1_DESIGN_WIDTH,
    VISIBLE_COVER_HEIGHT as U1_DESIGN_HEIGHT,
    U4_WIDTH,
} from './constants.mjs';


/**
 * Generiert ein PNG-Thumbnail (als Data-URL) für den U1-Bereich eines gegebenen SVG-Strings.
 * Der übergebene svgString sollte bereits durch eine ViewBox auf den Bereich U1, Rücken, U4 zugeschnitten sein.
 *
 * @param {string} svgString - Der rohe SVG-String (sollte bereits auf U1,Rücken,U4 zugeschnitten sein).
 * @param {number} spineWidthMM - Die Buchrückenbreite in Millimetern.
 * @param {number} [outputWidthPx=200] - Die gewünschte Breite des ausgegebenen PNG-Thumbnails in Pixel.
 * Die Höhe wird proportional skaliert.
 * @returns {Promise<string>} Ein Promise, das mit der PNG-Data-URL aufgelöst wird oder bei einem Fehler rejected.
 */
export async function generateU1Thumbnail(svgString, spineWidthMM, outputWidthPx = 200) {
    return new Promise((resolve, reject) => {
        if (!svgString || typeof svgString !== 'string') {
            reject(new Error("Ungültiger SVG-String übergeben."));
            return;
        }
        if (typeof spineWidthMM !== 'number' || spineWidthMM < 0) {
            reject(new Error("Ungültige Buchrückenbreite übergeben."));
            return;
        }

        let viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
        if (!viewBoxMatch || !viewBoxMatch[1]) {
            reject(new Error("ViewBox nicht im SVG-String gefunden."));
            return;
        }
        const viewBoxParts = viewBoxMatch[1].split(/\s+|,/);
        if (viewBoxParts.length !== 4) {
            reject(new Error("Ungültiges ViewBox-Format im SVG-String."));
            return;
        }
        const svgViewBoxWidth = parseFloat(viewBoxParts[2]);
        const svgViewBoxHeight = parseFloat(viewBoxParts[3]);

        if (isNaN(svgViewBoxWidth) || isNaN(svgViewBoxHeight) || svgViewBoxWidth <= 0 || svgViewBoxHeight <= 0) {
            reject(new Error("Ungültige ViewBox-Dimensionen im SVG-String."));
            return;
        }

        let modifiedSvgString = svgString.replace(
            /<svg/i,
            `<svg width="${svgViewBoxWidth}" height="${svgViewBoxHeight}"`
        );
        if (!modifiedSvgString.includes(`width="${svgViewBoxWidth}"`)) {
             modifiedSvgString = modifiedSvgString.replace(
                />/,
                ` width="${svgViewBoxWidth}" height="${svgViewBoxHeight}">`
            );
        }

        const sourceX = U4_WIDTH + spineWidthMM;
        const sourceY = 0; 
        const sourceWidth = U1_DESIGN_WIDTH;
        const sourceHeight = U1_DESIGN_HEIGHT;

        const image = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        image.onload = () => {
            if (image.naturalWidth === 0 || image.naturalHeight === 0) {
                reject(new Error("SVG konnte nicht korrekt als Bild gerastert werden (Nulldimensionen)."));
                return;
            }

            const u1AspectRatio = sourceWidth / sourceHeight;
            if (u1AspectRatio <= 0 || !isFinite(u1AspectRatio)) {
                reject(new Error("Ungültiges Seitenverhältnis für U1-Bereich."));
                return;
            }

            canvas.width = outputWidthPx;
            canvas.height = outputWidthPx / u1AspectRatio;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height); 

            try {
                ctx.drawImage(
                    image,
                    sourceX, sourceY, sourceWidth, sourceHeight, 
                    0, 0, canvas.width, canvas.height             
                );
            } catch (e) {
                reject(new Error("Fehler beim Zeichnen des Bildes auf den Canvas: " + e.message));
                return;
            }

            try {
                const dataUrl = canvas.toDataURL('image/png');
                resolve(dataUrl);
            } catch (e) {
                reject(new Error("Fehler beim Generieren des PNG vom Canvas: " + e.message));
            }
        };

        image.onerror = (e) => {
            reject(new Error("Fehler beim Laden des SVG-Strings als Bild."));
        };

        try {
            const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(modifiedSvgString);
            image.src = svgDataUrl;
        } catch (e) {
            reject(new Error("Fehler beim Kodieren des SVG-Strings für die Bildquelle: " + e.message));
        }
    });
}