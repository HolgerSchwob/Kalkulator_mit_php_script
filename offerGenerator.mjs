// offerGenerator.mjs
// Modul zur Erstellung eines Angebots-PDFs mit pdfmake (V1.9.2)
// Anpassung für Produktions- & Lieferoptionen

export async function generateOfferPdf(
    bookBlockState,
    configuredVariants,
    configuredExtras,
    productionDeliveryState, // NEUER PARAMETER
    CALC_CONFIG,
    totalPages, // totalPages wird hier separat übergeben, obwohl es Teil von bookBlockState ist. Könnte man konsolidieren.
    overallTotal,
    calculationResults // NEU: Um direkten Zugriff auf berechnete Kosten zu haben
) {
    if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
        alert("pdfMake ist nicht korrekt geladen. Das PDF kann nicht erstellt werden.");
        console.error("pdfMake is not defined or createPdf is not a function.");
        return;
    }

    const companyData = {
        name: "SCHWOB DIGITALDRUCK",
        owner: "Inhaber Holger Schwob",
        street: "Michael-Henkel-Straße 4-6",
        city: "36043 Fulda",
        phone: "0661 977717",
        email: "info@schwob-digitaldruck.de",
        ustIdNr: "DE274642127",
        logoPlaceholderText: "SCHWOB\nDIGITALDRUCK",
    };

    // Zugriff auf currencySymbol über das korrekt übergebene CALC_CONFIG Objekt
    const currencySymbol = CALC_CONFIG.general.currencySymbol || '€';
    const today = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const vatRate = CALC_CONFIG.general.vatRate || 7;

    const getPaperConfigById = (paperId) => CALC_CONFIG.papers.find(p => p.id === paperId);
    const getBindingConfigById = (bindingId) => CALC_CONFIG.bindings.find(b => b.id === bindingId);
    const getExtraConfigById = (extraId) => CALC_CONFIG.extras.find(ex => ex.id === extraId);
    const getProductionTimeById = (id) => CALC_CONFIG.productionAndDelivery.productionTimes.find(pt => pt.id === id);
    const getDeliveryMethodById = (id) => CALC_CONFIG.productionAndDelivery.deliveryMethods.find(dm => dm.id === id);


    let documentDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 90, 40, 70], // top margin erhöht für Logo/Header
        header: {
            columns: [
                {
                    text: companyData.logoPlaceholderText,
                    style: 'headerLogo',
                    alignment: 'left',
                    margin: [40, 30, 0, 0] // Angepasst für neues pageMargin
                },
                {
                    stack: [
                        { text: companyData.name, style: 'headerCompanyName', alignment: 'right'},
                        { text: companyData.owner, style: 'headerOwner', alignment: 'right'},
                        { text: companyData.street, style: 'headerAddress', alignment: 'right'},
                        { text: companyData.city, style: 'headerAddress', alignment: 'right'},
                        { text: `Tel: ${companyData.phone}`, style: 'headerAddress', alignment: 'right'},
                        { text: `E-Mail: ${companyData.email}`, style: 'headerAddress', alignment: 'right'}
                    ],
                    width: '*',
                    margin: [0, 20, 40, 0] // Angepasst für neues pageMargin
                }
            ],
        },
        footer: function(currentPage, pageCount) {
            return {
                columns: [
                    { text: `${companyData.name}, ${companyData.street}, ${companyData.city} - USt-IdNr.: ${companyData.ustIdNr}`, alignment: 'left', style: 'footerText', margin: [40, 30, 0, 0] },
                    { text: `Seite ${currentPage.toString()} von ${pageCount}`, alignment: 'right', style: 'footerText', margin: [0, 30, 40, 0] }
                ],
            };
        },
        content: [
            {
                text: 'An:\n(Kundenname)\n(Kundenstraße)\n(PLZ Ort Kunde)',
                style: 'recipientAddress',
                alignment: 'left',
                margin: [0, 20, 0, 20] 
            },
            {
                columns: [
                    { text: '', width: '*' },
                    {
                        text: `Fulda, den ${today}\nAngebotsnr.: WebKalk-${new Date().getTime().toString().slice(-6)}`,
                        style: 'offerDetails',
                        alignment: 'right',
                        width: 'auto',
                        margin: [0, 0, 0, 20]
                    }
                ]
            },
            { text: 'Unverbindliches Angebot', style: 'mainTitle' },
            { text: 'Sehr geehrte Damen und Herren,', style: 'salutation', margin: [0, 0, 0, 10] },
            { text: 'vielen Dank für Ihr Interesse an unseren Dienstleistungen. Gerne unterbreiten wir Ihnen folgendes unverbindliches Angebot basierend auf Ihrer Online-Konfiguration:', style: 'paragraph', margin: [0, 0, 0, 15] }, // Mehr Abstand nach unten
        ],
        styles: {
            headerLogo: { fontSize: 14, bold: true, color: '#333333' },
            headerCompanyName: { fontSize: 12, bold: true, color: '#2c3e50'},
            headerOwner: { fontSize: 10, color: '#2c3e50'},
            headerAddress: { fontSize: 9, color: '#333333', lineHeight: 1.2 },
            recipientAddress: { fontSize: 10, lineHeight: 1.3, margin: [0,0,0,20] },
            offerDetails: { fontSize: 10 },
            mainTitle: { fontSize: 16, bold: true, alignment: 'left', color: '#2c3e50', margin: [0, 0, 0, 15] },
            salutation: { fontSize: 10, margin: [0, 10, 0, 5] },
            sectionTitle: { fontSize: 12, bold: true, margin: [0, 15, 0, 8], color: '#34495e', decoration: 'underline', decorationColor: '#bdc3c7' },
            paragraph: { fontSize: 10, margin: [0, 0, 0, 5], lineHeight: 1.3 },
            tableHeader: { bold: true, fontSize: 9, color: 'white', fillColor: '#34495e', alignment: 'left' },
            tableCell: { fontSize: 9, margin: [0, 3, 0, 3], lineHeight: 1.2 },
            tableCellRight: { fontSize: 9, margin: [0, 3, 0, 3], alignment: 'right', lineHeight: 1.2 },
            totalRowCell: { bold: false, fontSize: 10, margin: [0, 3, 0, 3] },
            totalRowCellRight: { bold: false, fontSize: 10, margin: [0, 3, 0, 3], alignment: 'right' },
            grossTotalCell: { bold: true, fontSize: 11, margin: [0, 5, 0, 5], color: '#c0392b' },
            grossTotalCellRight: { bold: true, fontSize: 11, margin: [0, 5, 0, 5], alignment: 'right', color: '#c0392b' },
            footerText: { fontSize: 8, color: '#7f8c8d', alignment: 'center' },
            listItem: { fontSize: 9, margin: [10, 0, 0, 3], lineHeight: 1.2 },
            imagePreviewContainer: { margin: [0, 5, 0, 10], alignment: 'center' },
            imageCaption: {fontSize: 8, italics: true, color: '#555555', alignment: 'center', margin: [0,2,0,0]},
            vatDisclaimer: {fontSize: 8, italics: true, color: '#7f8c8d', margin: [0,5,0,0], alignment: 'left'}
        },
        defaultStyle: {
            font: 'Roboto' // Standard-Schriftart für pdfmake
        }
    };

    // --- Buchblock Details ---
    if (totalPages > 0 || (bookBlockState.hasA3Pages && bookBlockState.a3PagesCount > 0)) {
        documentDefinition.content.push({ text: 'I. Buchblock Konfiguration', style: 'sectionTitle' });
        const paperConf = getPaperConfigById(bookBlockState.paperId);
        let bookBlockTableBody = [
            [{text: 'Eigenschaft', style: 'tableHeader'}, {text: 'Spezifikation', style: 'tableHeader'}]
        ];
        if (totalPages > 0) {
            bookBlockTableBody.push([{text: 'Gesamtseiten A4:', style: 'tableCell'}, {text: `${totalPages}`, style: 'tableCell'}]);
            bookBlockTableBody.push([{text: 'Druckmodus A4:', style: 'tableCell'}, {text: `${bookBlockState.printMode === 'double_sided' ? 'Beidseitig' : 'Einseitig'}`, style: 'tableCell'}]);
        }
        bookBlockTableBody.push([{text: 'Papiersorte:', style: 'tableCell'}, {text: `${paperConf ? paperConf.name : 'N/A'}`, style: 'tableCell'}]);

        if (bookBlockState.hasA3Pages && bookBlockState.a3PagesCount > 0) {
            bookBlockTableBody.push([{text: 'Anzahl A3-Seiten:', style: 'tableCell'}, {text: `${bookBlockState.a3PagesCount} (gefalzt auf A4)`, style: 'tableCell'}]);
        }
        documentDefinition.content.push({
            table: { body: bookBlockTableBody, widths: ['auto', '*'] },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 10]
        });

        if (bookBlockState.firstPagePreviewDataURL) {
            try {
                documentDefinition.content.push({
                    image: bookBlockState.firstPagePreviewDataURL,
                    width: 120, // Breite des Vorschaubildes
                    style: 'imagePreviewContainer'
                });
                documentDefinition.content.push({text: 'Vorschau Titelseite (basierend auf PDF-Analyse)', style: 'imageCaption'});
            } catch (e) {
                console.error("Error embedding title page preview:", e);
            }
        }
    }

    // --- Bindungsvarianten ---
    if (configuredVariants.length > 0 && calculationResults && calculationResults.variantCalculations) {
        documentDefinition.content.push({ text: 'II. Bindungsvarianten & Druck', style: 'sectionTitle' });
        const { variantsWithPrices } = calculationResults.variantCalculations;

        variantsWithPrices.forEach((variantWithPrice, index) => {
            const originalVariant = configuredVariants.find(v => v.id === variantWithPrice.id);
            if (!originalVariant || variantWithPrice.isInvalid) return; // Ungültige Varianten nicht im Angebot aufführen

            const bindingConf = getBindingConfigById(originalVariant.bindingTypeId);
            if (!bindingConf) return;

            let variantDetailsTable = [
                [{text: 'Pos.', style: 'tableHeader', alignment:'left'}, {text: 'Beschreibung', style: 'tableHeader'}, {text: 'Menge', style: 'tableHeader', alignment:'center'}, {text: 'Einzelpreis (Brutto)', style: 'tableHeader', alignment:'right'}, {text: 'Gesamt (Brutto)', style: 'tableHeader', alignment:'right'}]
            ];

            let optionsText = [];
            if (bindingConf.options && Object.keys(originalVariant.options).length > 0) {
                bindingConf.options.forEach(optConf => {
                    const selectedOptionValue = originalVariant.options[optConf.optionKey];
                    if (selectedOptionValue !== undefined && selectedOptionValue !== null && selectedOptionValue !== false) {
                        let valText = '';
                        if (optConf.type === 'checkbox') {
                            if (selectedOptionValue === true) valText = 'Ja'; else return; // Nur anzeigen wenn ausgewählt
                        } else if (optConf.type === 'radio') {
                            const choice = optConf.choices.find(c => c.id === selectedOptionValue);
                            valText = choice ? choice.name : 'N/A';
                        } else if (optConf.type === 'gallery_select') {
                            valText = String(selectedOptionValue).replace(/_/g, ' ');
                        }
                        if (valText) optionsText.push(`${optConf.name}: ${valText}`);
                    }
                });
            }
            
            // Titel der Variante + Optionen
            let descriptionStack = [{text: `${bindingConf.name} (inkl. Buchblock & Grundpauschale anteilig)`, bold:true}];
            if (optionsText.length > 0) {
                descriptionStack.push({ul: optionsText.map(opt => {return {text: opt, style:'listItem', margin:[0,0,0,0]};}) });
            }


            variantDetailsTable.push([
                {text: `${index + 1}.1`, style: 'tableCell'},
                {stack: descriptionStack, style: 'tableCell' },
                {text: `${originalVariant.quantity}`, style: 'tableCell', alignment:'center'},
                {text: `${variantWithPrice.unitPrice.toFixed(2)} ${currencySymbol}`, style: 'tableCellRight'},
                {text: `${variantWithPrice.totalPrice.toFixed(2)} ${currencySymbol}`, style: 'tableCellRight', bold:true}
            ]);
            
            documentDefinition.content.push({
                table: { body: variantDetailsTable, widths: ['auto', '*', 'auto', 'auto', 'auto'] },
                layout: 'lightHorizontalLines',
                margin: [0, 5, 0, 10]
            });
        });
    }

    // --- Zusätzliche Produkte / Extras ---
    if (configuredExtras.length > 0 && calculationResults && calculationResults.extraCalculations) {
        documentDefinition.content.push({ text: 'III. Zusätzliche Produkte / Extras', style: 'sectionTitle' });
        const { extrasWithPrices } = calculationResults.extraCalculations;
        let extrasTableBody = [
            [{text: 'Pos.', style: 'tableHeader', alignment:'left'}, {text: 'Beschreibung', style: 'tableHeader'}, {text: 'Menge', style: 'tableHeader', alignment:'center'}, {text: 'Einzelpreis (Brutto)', style: 'tableHeader', alignment:'right'}, {text: 'Gesamt (Brutto)', style: 'tableHeader', alignment:'right'}]
        ];
        let extraPositionCounter = 1;
        extrasWithPrices.forEach((extraWithPrice) => {
            const originalExtra = configuredExtras.find(ex => ex.instanceId === extraWithPrice.instanceId);
            if (!originalExtra) return;

            const extraConf = getExtraConfigById(originalExtra.extraId);
            if (!extraConf) return;
            
            let optionsText = [];
            if (extraConf.options && Object.keys(originalExtra.selectedOptions).length > 0) {
                 extraConf.options.forEach(optGroup => {
                    const selectedChoiceId = originalExtra.selectedOptions[optGroup.optionKey];
                    if (selectedChoiceId) {
                        const choiceConfig = optGroup.choices.find(c => c.id === selectedChoiceId);
                        const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                        if (choiceConfig && (!defaultChoice || choiceConfig.id !== defaultChoice.id || choiceConfig.price > 0 )) { // Nur anzeigen wenn nicht Standard oder Preis hat
                             optionsText.push(`${optGroup.groupName}: ${choiceConfig.name}`);
                        }
                    }
                 });
            }
            
            let descriptionStackExtras = [{text: extraConf.name, bold:true}];
            if (optionsText.length > 0) {
                descriptionStackExtras.push({ul: optionsText.map(opt => {return {text: opt, style:'listItem', margin:[0,0,0,0]};}) });
            }

            extrasTableBody.push([
                {text: `${(configuredVariants.length > 0 ? configuredVariants.length : 0) + extraPositionCounter}.1`, style: 'tableCell'},
                {stack: descriptionStackExtras, style: 'tableCell' },
                {text: `${originalExtra.quantity}`, style: 'tableCell', alignment:'center'},
                {text: `${extraWithPrice.unitPrice.toFixed(2)} ${currencySymbol}`, style: 'tableCellRight'},
                {text: `${extraWithPrice.totalPrice.toFixed(2)} ${currencySymbol}`, style: 'tableCellRight', bold:true}
            ]);
            extraPositionCounter++;
        });
         documentDefinition.content.push({
            table: { body: extrasTableBody, widths: ['auto', '*', 'auto', 'auto', 'auto'] },
            layout: 'lightHorizontalLines',
            margin: [0, 5, 0, 10]
        });
    }

    // --- Produktionszeit & Lieferung ---
    if (productionDeliveryState && calculationResults && calculationResults.productionAndDeliveryCalculations) {
        documentDefinition.content.push({ text: 'IV. Produktionszeit & Lieferung', style: 'sectionTitle' });
        const { selectedProductionTime, productionTimeCost, selectedDeliveryMethod, deliveryMethodCost } = calculationResults.productionAndDeliveryCalculations;
        
        let prodDelTableBody = [
             [{text: 'Option', style: 'tableHeader'}, {text: 'Auswahl', style: 'tableHeader'}, {text: 'Kosten (Brutto)', style: 'tableHeader', alignment:'right'}]
        ];

        if (selectedProductionTime) {
            prodDelTableBody.push([
                {text: 'Produktionszeit', style:'tableCell'},
                {text: selectedProductionTime.name, style:'tableCell'},
                {text: `${productionTimeCost.toFixed(2)} ${currencySymbol}`, style:'tableCellRight'}
            ]);
        }
        if (selectedDeliveryMethod) {
             prodDelTableBody.push([
                {text: 'Lieferart', style:'tableCell'},
                {text: selectedDeliveryMethod.name, style:'tableCell'},
                {text: `${deliveryMethodCost.toFixed(2)} ${currencySymbol}`, style:'tableCellRight'}
            ]);
        }
        if (prodDelTableBody.length > 1) { // Nur anzeigen, wenn Optionen gewählt wurden
            documentDefinition.content.push({
                table: { body: prodDelTableBody, widths: ['auto', '*', 'auto'] },
                layout: 'lightHorizontalLines',
                margin: [0, 5, 0, 10]
            });
        }
    }


    // --- Gesamtkosten ---
    documentDefinition.content.push({ text: 'V. Gesamtkostenübersicht', style: 'sectionTitle' }); // Nummerierung angepasst
    
    const grossTotal = overallTotal; // overallTotal kommt jetzt direkt vom calculationService
    const netTotal = grossTotal / (1 + (vatRate / 100));
    const vatAmount = grossTotal - netTotal;

    documentDefinition.content.push({
        table: {
            body: [
                [
                    { text: 'Summe Netto', style: 'totalRowCell'},
                    { text: `${netTotal.toFixed(2)} ${currencySymbol}`, style: 'totalRowCellRight' }
                ],
                [
                    { text: `enthaltene ${vatRate}% MwSt.`, style: 'totalRowCell' },
                    { text: `${vatAmount.toFixed(2)} ${currencySymbol}`, style: 'totalRowCellRight' }
                ],
                [
                    { text: 'Gesamtsumme (Brutto)', style: 'grossTotalCell' },
                    { text: `${grossTotal.toFixed(2)} ${currencySymbol}`, style: 'grossTotalCellRight'}
                ]
            ],
            widths: ['*', 'auto']
        },
        layout: {
            hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length || i === node.table.body.length -1 ) ? 0.5 : 0; },
            vLineWidth: function (i, node) { return 0; },
            hLineColor: function (i, node) { return '#cccccc';},
            paddingTop: function(i, node) { return i === 0 ? 5 : 3; },
            paddingBottom: function(i, node) { return i === node.table.body.length -1 ? 5 : 3; },
        },
        margin: [0, 10, 0, 0]
    });

    const vatDisclaimerText = `Alle Preise sind Endpreise und enthalten die gesetzliche Mehrwertsteuer in Höhe von ${vatRate}%. Dieses Angebot und der ermäßigte Mehrwertsteuersatz gelten ausschließlich für Druckschriften, deren Herstellung und Lieferung unter den Anwendungsbereich des ermäßigten Steuersatzes fallen (z.B. wissenschaftliche Arbeiten, Bücher, Broschüren und ähnliche Publikationen gemäß §12 Abs. 2 Nr. 1 UStG i.V.m. Anlage 2 zum UStG).`;

    documentDefinition.content.push(
        { text: 'Hinweise zu diesem Angebot:', style: 'sectionTitle', fontSize: 11, margin: [0, 25, 0, 5] },
        { text: 'Dieses Angebot ist unverbindlich und freibleibend. Die Preise basieren auf den von Ihnen online getätigten Angaben. Ein verbindlicher Vertrag kommt erst nach unserer Prüfung Ihrer Anfrage und unserer expliziten Auftragsbestätigung zustande.', style: 'paragraph', italics: true, fontSize: 9 },
        { text: vatDisclaimerText, style: 'paragraph', italics: true, fontSize: 9, margin: [0,5,0,20] },
        { text: 'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.', style: 'paragraph', margin: [0, 10, 0, 0] },
        { text: 'Mit freundlichen Grüßen,', style: 'paragraph', margin: [0, 20, 0, 0] },
        { text: `Ihr Team von ${companyData.name}`, style: 'paragraph' }
    );

    try {
        pdfMake.createPdf(documentDefinition).download(`Angebot_SchwobDigitaldruck_${today.replace(/\./g, '-')}.pdf`);
    } catch (error) {
        console.error("Error during PDF creation with pdfMake:", error);
        alert("Es gab einen Fehler beim Erstellen des PDFs. Bitte prüfen Sie die Konsole für Details.");
    }
}