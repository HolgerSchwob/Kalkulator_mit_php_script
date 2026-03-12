// pdfAnalyzer.mjs (Version 5 - Fokus CropBox, klare Hinweise)

import { getDocument } from './pdf.mjs'; // Pfad ggf. anpassen!

const TOLERANCE_MM = 1.5; // Toleranz für Maßvergleiche
const PREVIEW_CANVAS_TARGET_WIDTH = 200; // Breite des Canvas im Modal-Preview

const DIN_A4_W_MM = 210;
const DIN_A4_H_MM = 297;
const DIN_A3_W_MM = 297;
const DIN_A3_H_MM = 420;

const POINTS_PER_MM = 72 / 25.4;

function pointsToMm(points) { return points / POINTS_PER_MM; }
function checkDimensions(wMm, hMm, tWMm, tHMm, tolMm) {
    return Math.abs(wMm - tWMm) <= tolMm && Math.abs(hMm - tHMm) <= tolMm;
}

export async function analyzePdfFile(fileArrayBuffer) {
    const typedarray = new Uint8Array(fileArrayBuffer);
    const pdfDoc = await getDocument({ data: typedarray }).promise;

    let analysisMessages = []; // Array für Nachrichten, die später formatiert werden
    let dinA4HochFormatCount = 0;
    let dinA4LandscapeCount = 0;
    let dinA3HochCount = 0;
    let dinA3QuerCount = 0;
    let otherFormatCount = 0; // Zähler für alles, was nicht A4 oder A3 ist

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const userUnit = page.userUnit || 1.0;
        
        // Wir verwenden page.view (CropBox) als primäre Quelle für die Dimensionen
        const cropBox = page.view; // [llx, lly, urx, ury]
        let pageWidthPoints, pageHeightPoints;

        if (cropBox && Array.isArray(cropBox) && cropBox.length === 4) {
            pageWidthPoints = (cropBox[2] - cropBox[0]) * userUnit;
            pageHeightPoints = (cropBox[3] - cropBox[1]) * userUnit;
        } else {
            // Fallback auf MediaBox, wenn CropBox nicht valide (sehr unwahrscheinlich für page.view)
            const mediaBox = page.mediaBox;
            if (mediaBox && Array.isArray(mediaBox) && mediaBox.length === 4) {
                pageWidthPoints = (mediaBox[2] - mediaBox[0]) * userUnit;
                pageHeightPoints = (mediaBox[3] - mediaBox[1]) * userUnit;
                analysisMessages.push(`Hinweis Seite ${i}: CropBox nicht lesbar, MediaBox verwendet.`);
            } else {
                analysisMessages.push(`FEHLER Seite ${i}: Konnte keine Seitengröße ermitteln.`);
                otherFormatCount++; // Zählen als "anderes Format", um den Hinweis auszulösen
                continue; // Nächste Seite
            }
        }

        const widthMm = pointsToMm(pageWidthPoints);
        const heightMm = pointsToMm(pageHeightPoints);

        if (checkDimensions(widthMm, heightMm, DIN_A4_W_MM, DIN_A4_H_MM, TOLERANCE_MM)) {
            dinA4HochFormatCount++;
        } else if (checkDimensions(widthMm, heightMm, DIN_A4_H_MM, DIN_A4_W_MM, TOLERANCE_MM)) {
            dinA4LandscapeCount++;
        } else if (checkDimensions(widthMm, heightMm, DIN_A3_W_MM, DIN_A3_H_MM, TOLERANCE_MM)) {
            dinA3HochCount++;
        } else if (checkDimensions(widthMm, heightMm, DIN_A3_H_MM, DIN_A3_W_MM, TOLERANCE_MM)) {
            dinA3QuerCount++;
        } else {
            otherFormatCount++; // Alles andere zählt als "Überformat" oder abweichendes Format
        }
    }

    // --- Nachrichten für den Nutzer zusammenstellen ---
    analysisMessages.unshift(`PDF-Analyse abgeschlossen. Gesamtseiten in Datei: ${pdfDoc.numPages}`);
    analysisMessages.push(`-----------------------------------------`);
    analysisMessages.push(`Erkannte DIN A4 Hochformat Seiten: ${dinA4HochFormatCount}`);
    if (dinA4LandscapeCount > 0) {
        analysisMessages.push(`Erkannte DIN A4 Querformat Seiten: ${dinA4LandscapeCount}`);
        analysisMessages.push(`   -> Hinweis: Querformatige A4-Seiten werden für den Druck automatisch gedreht.`);
    }
    const totalA3Count = dinA3HochCount + dinA3QuerCount;
    if (totalA3Count > 0) {
        analysisMessages.push(`Erkannte DIN A3 Seiten: ${totalA3Count} (Hoch: ${dinA3HochCount}, Quer: ${dinA3QuerCount})`);
        analysisMessages.push(`   -> Hinweis: A3-Seiten werden standardmäßig einseitig bedruckt und auf A4 gefalzt.`);
    }

    if (otherFormatCount > 0) {
        analysisMessages.push(`-----------------------------------------`);
        analysisMessages.push(`ACHTUNG: ${otherFormatCount} Seite(n) mit abweichenden Formaten (weder A4 noch A3 innerhalb der Toleranz) erkannt.`);
        analysisMessages.push(`Dies kann auf Beschnittzugaben (für randlosen Druck) oder andere spezielle Formate hindeuten.`);
        analysisMessages.push(`Der Druck erfolgt in solchen Fällen typischerweise randlos auf Basis des Inhalts.`);
        analysisMessages.push(`Bitte prüfen Sie die automatisch übernommene A4-Seitenzahl und A3-Anzahl und korrigieren Sie diese ggf. manuell im Kalkulator.`);
        analysisMessages.push(`Vor Produktionsbeginn erfolgt bei uns immer ein detaillierter Preflight-Check Ihrer Daten. Bei Unklarheiten melden wir uns bei Ihnen.`);
    }
    analysisMessages.push(`-----------------------------------------`);
    analysisMessages.push(`Für den Kalkulator werden folgende Werte vorgeschlagen:`);
    const calculatedA4PagesForCalculator = dinA4HochFormatCount + dinA4LandscapeCount;
    analysisMessages.push(`   - A4-Seiten: ${calculatedA4PagesForCalculator}`);
    analysisMessages.push(`   - A3-Seiten: ${totalA3Count}`);


    let firstPagePreviewDataURL = null;
    if (pdfDoc.numPages > 0) {
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1 }); // Basiert auf page.view (CropBox)
        const scale = PREVIEW_CANVAS_TARGET_WIDTH / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = Math.floor(scaledViewport.width);
        tempCanvas.height = Math.floor(scaledViewport.height);
        await page.render({ canvasContext: tempCtx, viewport: scaledViewport }).promise;
        firstPagePreviewDataURL = tempCanvas.toDataURL('image/png');
    }
    
    return {
        pdfTotalPages: pdfDoc.numPages,
        calculatedA4Pages: calculatedA4PagesForCalculator,
        a4Hoch: dinA4HochFormatCount,
        a4Quer: dinA4LandscapeCount,
        a3PageCount: totalA3Count,
        firstPagePreviewDataURL: firstPagePreviewDataURL,
        analysisReportText: analysisMessages.join('\n')
    };
}