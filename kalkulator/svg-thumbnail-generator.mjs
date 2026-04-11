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
 * Ersetzt Same-Origin-`<image>`-Referenzen durch data:-URLs, damit SVG→Canvas (Thumbnail)
 * eingebettete Raster zuverlässig rendert — bei Blob-URL-SVG werden externe http(s)-Pfade oft nicht geladen.
 * @param {string} svgString
 * @returns {Promise<string>}
 */
export async function inlineSameOriginImageHrefsInSvgString(svgString) {
    if (typeof window === 'undefined' || !window.DOMParser) return svgString;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svgString;
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') return svgString;

    const images = root.querySelectorAll('image');
    for (const img of images) {
        const href =
            img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (!href) continue;
        const t = String(href).trim();
        if (/^(data:|blob:)/i.test(t)) continue;
        let abs;
        try {
            abs = new URL(t, window.location.href);
        } catch {
            continue;
        }
        if (abs.origin !== window.location.origin) continue;
        try {
            const res = await fetch(abs.href);
            if (!res.ok) continue;
            const blob = await res.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
            img.setAttribute('href', dataUrl);
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
        } catch {
            /* ignore */
        }
    }
    return new XMLSerializer().serializeToString(root);
}

/**
 * Generiert ein PNG-Thumbnail (als Data-URL) für den U1-Bereich (Vorderseite) eines SVG-Strings.
 * @param {string} svgString - Der rohe SVG-String der gesamten Buchdecke.
 * @param {string} svgString - Der rohe SVG-String der gesamten Buchdecke im originalen Koordinatensystem.
 * @param {number} spineWidthMM - Die aktuelle Buchrückenbreite in Millimetern.
 * @param {number} [outputWidthPx=200] - Die gewünschte Breite des PNG-Thumbnails in Pixel.
 * @returns {Promise<string>} Ein Promise, das mit der PNG-Data-URL aufgelöst wird.
 */
export async function generateU1Thumbnail(svgString, dimensions, spineWidthMM, outputWidthPx = 200) {
    return new Promise((resolve, reject) => {
        // Y-Position ist konstant, schneidet den oberen Beschnitt ab.
        const sourceY = (dimensions.svgTotalHeight - dimensions.visibleCoverHeight) / 2;

        // X-Position wird von der Mitte aus berechnet.
        // Die rechte Kante des Rückens ist `SVG_CENTER_X + halbe Rückenbreite`.
        // Dort beginnt die Vorderseite (U1).
        const sourceX = dimensions.svgCenterX + (spineWidthMM / 2);

        const sourceWidth = dimensions.u1Width;
        const sourceHeight = dimensions.visibleCoverHeight;

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

/**
 * Liest viewBox-Breite/-Höhe aus dem Root-&lt;svg&gt; (userSpace), sonst null.
 * @param {SVGSVGElement} svgNode
 * @returns {{ width: number, height: number } | null}
 */
function parseRootViewBoxSize(svgNode) {
    const vb = svgNode.getAttribute('viewBox');
    if (vb) {
        const p = vb
            .trim()
            .split(/[\s,]+/)
            .map((x) => parseFloat(x));
        if (p.length === 4 && p.every((n) => Number.isFinite(n)) && p[2] > 0 && p[3] > 0) {
            return { width: p[2], height: p[3] };
        }
    }
    return null;
}

/**
 * Gesamtes SVG-Dokument als Thumbnail (z. B. CD-Label: kein U1/Rücken-Schnitt).
 * Die viewBox im SVG-String hat Vorrang (Template z. B. 0 0 140 140); keine Überschreibung mit
 * evtl. falschen DB-Dimensionen.
 * @param {string} svgString
 * @param {{ svgTotalWidth?: number, svgTotalHeight?: number }} dimensions Fallback nur ohne viewBox
 * @param {number} [outputWidthPx=200]
 * @returns {Promise<string>} PNG data URL
 */
export async function generateFullSvgThumbnail(svgString, dimensions, outputWidthPx = 200) {
    return new Promise((resolve, reject) => {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = svgString;
        const svgNode = tempContainer.querySelector('svg');
        if (!svgNode) return reject(new Error("Could not find SVG element in string."));

        svgNode.removeAttribute('width');
        svgNode.removeAttribute('height');
        // viewBox nicht mit dimensions überschreiben — sonst Weißfläche bei CD vs. Template

        const vbSize = parseRootViewBoxSize(svgNode);
        const sourceWidth = (vbSize?.width ?? Number(dimensions?.svgTotalWidth)) || 140;
        const sourceHeight = (vbSize?.height ?? Number(dimensions?.svgTotalHeight)) || 140;

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
            reject(new Error("Failed to load SVG as an image for full-document thumbnail.", { cause: err }));
        };

        const svgBlob = new Blob([new XMLSerializer().serializeToString(svgNode)], {
            type: 'image/svg+xml;charset=utf-8',
        });
        image.src = URL.createObjectURL(svgBlob);
    });
}
