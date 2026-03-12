// offerGenerator.mjs
// Angebots-PDF im bamadi.de CI (Navy/Gold, Typo, Text-Logo)

/** bamadi Design-Tokens für PDF (Navy/Gold) */
const CI = {
    primary: '#1A3A5C',   // Navy
    primaryDark: '#122843',
    accent: '#E8A000',   // Gold
    textMuted: '#6B7280',
    textLight: '#9CA3AF'
};

/**
 * Generates and downloads a professional offer PDF based on the current application state.
 * @param {object} inquiryState - The complete state of the user's configuration.
 * @param {object} calculationResults - An object with all calculated prices.
 * @param {object} config - The main calculator configuration object.
 */
export async function generateOfferPdf(inquiryState, calculationResults, config) {
    if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
        alert("pdfMake ist nicht korrekt geladen. Das PDF kann nicht erstellt werden.");
        console.error("pdfMake is not defined or createPdf is not a function.");
        return;
    }

    // Firmendaten bamadi / Impressum
    const companyData = {
        name: "bamadi",
        owner: "Holger Schwob – Schwob Digitaldruck",
        street: "Michael-Henkel-Str. 4–6",
        city: "36043 Fulda",
        phone: "Tel: +49 661 9 777 17",
        email: "hallo@bamadi.de",
        web: "www.bamadi.de",
        ustIdNr: "DE263189591"
    };

    const currencySymbol = config.general.currencySymbol || '€';
    const today = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const vatRate = config.general.vatRate || 7;
    const offerNumber = `ANG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const getBindingConfigById = (bindingId) => config.bindings.find(b => b.id === bindingId);
    
    // Helper function to format currency
    const formatCurrency = (amount) => `${amount.toFixed(2)} ${currencySymbol}`;

    let content = [];

    // Header: bamadi Text-Logo (Navy + Gold) + Firmeninfos
    const headerContent = [
        {
            width: 120,
            stack: [
                {
                    columns: [
                        { text: 'bamad', style: 'logoText' },
                        { text: 'i', style: 'logoAccent' }
                    ],
                    margin: [0, 0, 0, 0]
                }
            ],
            margin: [0, 5, 0, 0]
        }
    ];
    
    // Company info columns
    headerContent.push(
        {
            width: '*',
            stack: [
                { text: companyData.name, style: 'companyName' },
                { text: companyData.owner, style: 'companyOwner' },
                { text: companyData.street, style: 'companyAddress' },
                { text: companyData.city, style: 'companyAddress' }
            ]
        },
        {
            width: 150,
            stack: [
                { text: companyData.phone, style: 'contactInfo' },
                { text: companyData.email, style: 'contactInfo' },
                { text: companyData.web, style: 'contactInfo' },
                { text: `USt-IdNr: ${companyData.ustIdNr}`, style: 'contactInfoSmall' }
            ]
        }
    );

    content.push({
        columns: headerContent,
        margin: [0, 0, 0, 30]
    });

    // Offer details header
    content.push({
        columns: [
            {
                width: '*',
                stack: [
                    { text: 'UNVERBINDLICHES ANGEBOT', style: 'mainTitle' },
                    { text: `Angebots-Nr.: ${offerNumber}`, style: 'offerNumber' },
                    { text: `Datum: ${today}`, style: 'offerDate' }
                ]
            },
            {
                width: 200,
                stack: [
                    { text: 'Gültig bis:', style: 'validityLabel' },
                    { text: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE'), style: 'validityDate' }
                ],
                alignment: 'right'
            }
        ],
        margin: [0, 0, 0, 25]
    });

    // Greeting and introduction
    content.push(
        { text: 'Sehr geehrte Damen und Herren,', style: 'salutation' },
        { 
            text: 'vielen Dank für Ihr Interesse an unseren Druckdienstleistungen. Gerne unterbreiten wir Ihnen das folgende unverbindliche Angebot basierend auf Ihrer Online-Konfiguration:', 
            style: 'introText' 
        }
    );

    // Section 1: Book Block Configuration
    content.push({ text: 'I. BUCHBLOCK KONFIGURATION', style: 'sectionTitle' });
    
    const paperConf = config.papers.find(p => p.id === inquiryState.bookBlock.paperId);
    const bookBlockData = [
        ['Gesamtseiten A4:', inquiryState.bookBlock.totalPages.toString()],
        ['Papiersorte:', paperConf ? paperConf.name : 'N/A'],
        ['Papiergewicht:', paperConf ? `${paperConf.weight || 'Standard'} g/m²` : 'N/A']
    ];

    if (inquiryState.bookBlock.hasA3Pages && inquiryState.bookBlock.a3PagesCount > 0) {
        bookBlockData.push(['Anzahl A3-Seiten:', inquiryState.bookBlock.a3PagesCount.toString()]);
    }

    content.push({
        table: {
            headerRows: 0,
            widths: ['40%', '*'],
            body: bookBlockData.map(row => [
                { text: row[0], style: 'specLabel' },
                { text: row[1], style: 'specValue' }
            ])
        },
        layout: {
            fillColor: function (rowIndex) {
                return (rowIndex % 2 === 0) ? '#f8f9fa' : null;
            },
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => '#e9ecef'
        },
        margin: [0, 5, 0, 15]
    });

    // Preview image if available
    if (inquiryState.bookBlock.firstPagePreviewUrl) {
        content.push({
            columns: [
                { width: '*', text: '' },
                {
                    width: 150,
                    stack: [
                        { text: 'Vorschau erste Seite:', style: 'previewLabel' },
                        { 
                            image: inquiryState.bookBlock.firstPagePreviewUrl, 
                            width: 120, 
                            alignment: 'center',
                            margin: [0, 5, 0, 0]
                        }
                    ]
                },
                { width: '*', text: '' }
            ],
            margin: [0, 0, 0, 20]
        });
    }

    // Section 2: Binding Variants & Printing
    content.push({ text: 'II. BINDUNGSVARIANTEN & PREISE', style: 'sectionTitle' });
    
    const variantsTableHeader = [
        { text: 'Pos.', style: 'tableHeader', alignment: 'center' },
        { text: 'Beschreibung', style: 'tableHeader' },
        { text: 'Menge', style: 'tableHeader', alignment: 'center' },
        { text: 'Einzel (Brutto)', style: 'tableHeader', alignment: 'right' },
        { text: 'Gesamt (Brutto)', style: 'tableHeader', alignment: 'right' }
    ];

    let variantsTableBody = [variantsTableHeader];
    
    calculationResults.variantsWithPrices.forEach((variant, index) => {
        const bindingConf = getBindingConfigById(variant.bindingTypeId);
        variantsTableBody.push([
            { text: `${index + 1}`, style: 'tableCell', alignment: 'center' },
            { 
                stack: [
                    { text: bindingConf.name, style: 'itemName' },
                    { text: bindingConf.description || 'Professionelle Bindung', style: 'itemDescription' }
                ]
            },
            { text: variant.quantity.toString(), style: 'tableCell', alignment: 'center' },
            { text: formatCurrency(variant.unitPrice), style: 'tableCellRight' },
            { text: formatCurrency(variant.totalPrice), style: 'tableCellRightBold' }
        ]);
    });

    content.push({
        table: {
            headerRows: 1,
            widths: ['8%', '45%', '12%', '17%', '18%'],
            body: variantsTableBody
        },
        layout: {
            fillColor: function (rowIndex) {
                return rowIndex === 0 ? CI.primary : (rowIndex % 2 === 1) ? '#f8f9fa' : null;
            },
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#dee2e6',
            vLineColor: () => '#dee2e6'
        },
        margin: [0, 5, 0, 15]
    });

    // Section 3: Extras (if any)
    if (calculationResults.extrasWithPrices && calculationResults.extrasWithPrices.length > 0) {
        content.push({ text: 'III. ZUSÄTZLICHE PRODUKTE / EXTRAS', style: 'sectionTitle' });
        
        const extrasTableHeader = [
            { text: 'Pos.', style: 'tableHeader', alignment: 'center' },
            { text: 'Beschreibung', style: 'tableHeader' },
            { text: 'Menge', style: 'tableHeader', alignment: 'center' },
            { text: 'Einzel (Brutto)', style: 'tableHeader', alignment: 'right' },
            { text: 'Gesamt (Brutto)', style: 'tableHeader', alignment: 'right' }
        ];

        let extrasTableBody = [extrasTableHeader];
        
        calculationResults.extrasWithPrices.forEach((extra, index) => {
            extrasTableBody.push([
                { text: `E${index + 1}`, style: 'tableCell', alignment: 'center' },
                { text: extra.name || 'Zusatzleistung', style: 'tableCell' },
                { text: extra.quantity?.toString() || '1', style: 'tableCell', alignment: 'center' },
                { text: formatCurrency(extra.unitPrice || extra.price), style: 'tableCellRight' },
                { text: formatCurrency(extra.totalPrice || extra.price), style: 'tableCellRightBold' }
            ]);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ['8%', '45%', '12%', '17%', '18%'],
                body: extrasTableBody
            },
            layout: {
                fillColor: function (rowIndex) {
                    return rowIndex === 0 ? CI.primary : (rowIndex % 2 === 1) ? '#f8f9fa' : null;
                },
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#dee2e6',
                vLineColor: () => '#dee2e6'
            },
            margin: [0, 5, 0, 15]
        });
    }

    // Section 4: Price Summary
    const grossTotal = calculationResults.totalOrderPrice;
    const netTotal = grossTotal / (1 + (vatRate / 100));
    const vatAmount = grossTotal - netTotal;

    content.push({ text: 'IV. GESAMTKOSTENÜBERSICHT', style: 'sectionTitle' });
    
    content.push({
        table: {
            widths: ['*', '25%'],
            body: [
                [
                    { text: 'Summe Netto:', style: 'summaryLabel' },
                    { text: formatCurrency(netTotal), style: 'summaryValue' }
                ],
                [
                    { text: `enthaltene ${vatRate}% MwSt.:`, style: 'summaryLabel' },
                    { text: formatCurrency(vatAmount), style: 'summaryValue' }
                ],
                [
                    { text: 'GESAMTSUMME (BRUTTO):', style: 'totalLabel' },
                    { text: formatCurrency(grossTotal), style: 'totalValue' }
                ]
            ]
        },
        layout: {
            fillColor: function (rowIndex) {
                return rowIndex === 2 ? CI.primary : null;
            },
            hLineWidth: function (i, node) {
                return (i === 0 || i === node.table.body.length) ? 1 : 0.5;
            },
            vLineWidth: () => 0,
            hLineColor: () => CI.primary
        },
        margin: [0, 5, 0, 20]
    });

    // Terms and conditions
    content.push({ text: 'V. ANGEBOTSBEDINGUNGEN', style: 'sectionTitle' });
    content.push({
        ul: [
            'Dieses Angebot ist 30 Tage gültig',
            'Alle Preise verstehen sich inklusive der gesetzlichen Mehrwertsteuer',
            'Lieferzeit: 5-7 Werktage nach Auftragserteilung und Datenfreigabe',
            'Zahlung: 30 Tage netto nach Rechnungsstellung',
            'Es gelten unsere Allgemeinen Geschäftsbedingungen'
        ],
        style: 'terms',
        margin: [0, 5, 0, 20]
    });

    // Footer
    content.push({
        columns: [
            {
                width: '*',
                stack: [
                    { text: 'Wir freuen uns auf Ihre Beauftragung!', style: 'closingText' },
                    { text: 'Mit freundlichen Grüßen', style: 'closingGreeting' },
                    { text: 'Ihr Team von bamadi', style: 'closingSignature' }
                ]
            }
        ],
        margin: [0, 15, 0, 0]
    });

    // Document definition with enhanced styles
    const documentDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content: content,
        styles: {
            // Header styles
            companyName: { 
                fontSize: 16, 
                bold: true, 
                color: CI.primary,
                margin: [0, 5, 0, 2]
            },
            companyOwner: { 
                fontSize: 10, 
                color: CI.textMuted,
                margin: [0, 0, 0, 2]
            },
            companyAddress: { 
                fontSize: 9, 
                color: CI.textMuted,
                margin: [0, 0, 0, 1]
            },
            contactInfo: { 
                fontSize: 9, 
                color: CI.textMuted,
                margin: [0, 0, 0, 2]
            },
            contactInfoSmall: { 
                fontSize: 8, 
                color: CI.textLight,
                margin: [0, 2, 0, 0]
            },
            logoText: { fontSize: 22, bold: true, color: CI.primary },
            logoAccent: { fontSize: 22, bold: true, color: CI.accent },
            
            // Title styles
            mainTitle: { 
                fontSize: 18, 
                bold: true, 
                color: CI.primary,
                margin: [0, 0, 0, 5]
            },
            offerNumber: { 
                fontSize: 10, 
                bold: true,
                margin: [0, 0, 0, 2]
            },
            offerDate: { 
                fontSize: 10,
                margin: [0, 0, 0, 2]
            },
            validityLabel: { 
                fontSize: 9, 
                color: CI.textMuted
            },
            validityDate: { 
                fontSize: 10, 
                bold: true, 
                color: CI.primary
            },
            
            // Content styles
            salutation: { 
                fontSize: 11, 
                margin: [0, 0, 0, 10]
            },
            introText: { 
                fontSize: 10, 
                margin: [0, 0, 0, 20],
                lineHeight: 1.3
            },
            sectionTitle: { 
                fontSize: 13, 
                bold: true, 
                color: CI.primary,
                margin: [0, 15, 0, 8],
                decoration: 'underline'
            },
            
            // Specification styles
            specLabel: { 
                fontSize: 10, 
                bold: true,
                margin: [5, 4, 5, 4]
            },
            specValue: { 
                fontSize: 10,
                margin: [5, 4, 5, 4]
            },
            previewLabel: { 
                fontSize: 9, 
                italics: true, 
                color: CI.textMuted,
                alignment: 'center'
            },
            
            // Table styles
            tableHeader: { 
                bold: true, 
                fontSize: 10, 
                color: 'white',
                margin: [5, 5, 5, 5]
            },
            tableCell: { 
                fontSize: 10, 
                margin: [5, 4, 5, 4]
            },
            tableCellRight: { 
                fontSize: 10, 
                margin: [5, 4, 5, 4], 
                alignment: 'right'
            },
            tableCellRightBold: { 
                fontSize: 10, 
                bold: true, 
                margin: [5, 4, 5, 4], 
                alignment: 'right'
            },
            itemName: { 
                fontSize: 10, 
                bold: true,
                margin: [0, 0, 0, 2]
            },
            itemDescription: { 
                fontSize: 8, 
                color: CI.textMuted,
                italics: true
            },
            
            // Summary styles
            summaryLabel: { 
                fontSize: 11, 
                margin: [10, 6, 10, 6]
            },
            summaryValue: { 
                fontSize: 11, 
                alignment: 'right',
                margin: [10, 6, 10, 6]
            },
            totalLabel: { 
                fontSize: 12, 
                bold: true, 
                color: 'white',
                margin: [10, 8, 10, 8]
            },
            totalValue: { 
                fontSize: 12, 
                bold: true, 
                color: 'white',
                alignment: 'right',
                margin: [10, 8, 10, 8]
            },
            
            // Terms and closing styles
            terms: { 
                fontSize: 9, 
                margin: [15, 0, 0, 0],
                lineHeight: 1.4
            },
            closingText: { 
                fontSize: 11, 
                bold: true, 
                color: CI.primary,
                margin: [0, 0, 0, 8]
            },
            closingGreeting: { 
                fontSize: 10,
                margin: [0, 0, 0, 5]
            },
            closingSignature: { 
                fontSize: 10, 
                bold: true,
                margin: [0, 0, 0, 0]
            }
        },
        defaultStyle: { 
            font: 'Roboto',
            fontSize: 10,
            lineHeight: 1.2
            // Roboto entspricht --font-sans (tokens.css), CI-konform
        }
    };

    // Generate and download PDF
    const fileName = `Angebot_${offerNumber}_bamadi_${today.replace(/\./g, '-')}.pdf`;
    pdfMake.createPdf(documentDefinition).download(fileName);
}