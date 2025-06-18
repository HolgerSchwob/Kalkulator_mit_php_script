// cartHandler.mjs
// Manages the display of the cart/summary section
// V1.9.5: Integration Buchdeckeneditor-Thumbnail

let CALC_CONFIG_REF;

// DOM Elements
let cartItemsContainerDesktop_DOM, orderTotalSpanDesktop_DOM,
    orderTotalMobileFooterSpan_DOM, showMobileCartButton_DOM,
    mobileCartModalOverlay_DOM, cartItemsContainerMobile_DOM,
    orderTotalMobileModalSpan_DOM, closeMobileCartButton_DOM;

function getPaperConfigById(paperId) {
    if (!CALC_CONFIG_REF || !CALC_CONFIG_REF.papers) return null;
    return CALC_CONFIG_REF.papers.find(p => p.id === paperId);
}
function getBindingConfigById(bindingId) {
    if (!CALC_CONFIG_REF || !CALC_CONFIG_REF.bindings) return null;
    return CALC_CONFIG_REF.bindings.find(b => b.id === bindingId);
}
function getExtraConfigById(extraId) {
    if (!CALC_CONFIG_REF || !CALC_CONFIG_REF.extras) return null;
    return CALC_CONFIG_REF.extras.find(ex => ex.id === extraId);
}


export function initCartHandler(calcConfig) {
    CALC_CONFIG_REF = calcConfig;

    cartItemsContainerDesktop_DOM = document.getElementById('cartItemsContainerDesktop');
    orderTotalSpanDesktop_DOM = document.getElementById('orderTotalDesktop');
    orderTotalMobileFooterSpan_DOM = document.getElementById('orderTotalMobileFooter');
    showMobileCartButton_DOM = document.getElementById('showMobileCartButton');
    mobileCartModalOverlay_DOM = document.getElementById('mobileCartModalOverlay');
    cartItemsContainerMobile_DOM = document.getElementById('cartItemsContainerMobile');
    orderTotalMobileModalSpan_DOM = document.getElementById('orderTotalMobileModal');
    closeMobileCartButton_DOM = document.getElementById('closeMobileCartButton');

    if (showMobileCartButton_DOM) showMobileCartButton_DOM.addEventListener('click', () => mobileCartModalOverlay_DOM.classList.add('active'));
    if (closeMobileCartButton_DOM) closeMobileCartButton_DOM.addEventListener('click', () => mobileCartModalOverlay_DOM.classList.remove('active'));
    if (mobileCartModalOverlay_DOM) {
        mobileCartModalOverlay_DOM.addEventListener('click', (e) => {
            if (e.target === mobileCartModalOverlay_DOM) mobileCartModalOverlay_DOM.classList.remove('active');
        });
    }
}

export function updateCartUI(
    bookBlockState,
    configuredVariants,
    configuredExtras,
    productionDeliveryState,
    calculationResults,
    CALC_CONFIG_PASSED,
    personalizationsState // NEU: personalizationsState als Parameter
) {
    if (!cartItemsContainerDesktop_DOM || !cartItemsContainerMobile_DOM) return;
    CALC_CONFIG_REF = CALC_CONFIG_PASSED;

    cartItemsContainerDesktop_DOM.innerHTML = '';
    cartItemsContainerMobile_DOM.innerHTML = '';

    const {
        overallTotal,
        bookBlockCalculations,
        variantCalculations,
        extraCalculations,
        productionAndDeliveryCalculations
    } = calculationResults;

    const { variantsWithPrices } = variantCalculations;
    const { extrasWithPrices } = extraCalculations;


    const totalA4PagesVal = bookBlockState.totalPages;
    const hasA3Val = bookBlockState.hasA3Pages;
    const numA3PagesVal = bookBlockState.a3PagesCount;
    const selPaperConfVal = getPaperConfigById(bookBlockState.paperId);
    const printModeTxtVal = bookBlockState.printMode === 'double_sided' ? 'beidseitig' : 'einseitig';
    const currency = CALC_CONFIG_REF.general.currencySymbol;

    const createCartItemHTML = (item) => {
        let html = '';
        if (item.isBookBlockInfo) {
            html += `<div class="cart-item-header">`;
            // Das Thumbnail für den Buchblock (Titelseite Vorschau) bleibt wie es war
            if (item.firstPagePreviewDataURL) {
                html += `<img src="${item.firstPagePreviewDataURL}" alt="Titelseite Vorschau" class="cart-item-binding-thumbnail">`;
            }
            html += `<div style="flex-grow: 1;">${item.name}</div></div>`; // Name hier als HTML erlaubt
            if (item.a3Info) html += `<p class="a3-info">${item.a3Info}</p>`;
            if (item.costInfo) html += `<p>Grundkosten Buchblock: ${item.costInfo}</p>`;
            return html;
        }

        if (item.isProdDelInfo) {
            html += `<p><strong>${item.name}</strong></p>`;
            if(item.price > 0) html += `<p>Kosten: ${item.price.toFixed(2)} ${currency}</p>`;
            return html;
        }

        // Hier wird das item.bindingThumbnailSrc verwendet, das jetzt vom Editor kommen kann
        if (item.bindingThumbnailSrc) {
            html += `<div class="cart-item-header"><img src="${item.bindingThumbnailSrc}" alt="${item.name}" class="cart-item-binding-thumbnail"><p><strong>${item.quantity}x ${item.name}</strong></p></div>`;
        } else {
            html += `<p><strong>${item.quantity}x ${item.name}</strong></p>`;
        }

        if (item.variantDetails?.length) {
            html += `<div class="variant-item-details">${item.variantDetails.map(d => `<p class="item-options">- ${d}</p>`).join('')}</div>`;
        }
        if (item.extraDetails?.length) {
            html += `<div class="extra-item-details">${item.extraDetails.map(d => `<p class="item-options">- ${d}</p>`).join('')}</div>`;
        }

        if (item.unitPrice !== undefined && !item.isProdDelInfo) {
            html += `<p>Stückpreis: ${item.unitPrice.toFixed(2)} ${currency}</p>`;
        }
        if (item.totalPrice !== undefined && !item.isProdDelInfo) {
             html += `<p>Gesamt: ${item.totalPrice.toFixed(2)} ${currency}</p>`;
        }

        if (item.isInvalid) {
            html += `<p class="cart-item-invalid-notice">Diese Variante ist für die aktuelle Buchblockdicke nicht gültig und wird nicht berechnet.</p>`;
        }
        return html;
    };

    // 1. Buchblock
    if ((totalA4PagesVal > 0 || (hasA3Val && numA3PagesVal > 0)) && selPaperConfVal) {
        let bbNameHTML = '';
        if (totalA4PagesVal > 0) {
            const numA4Sheets = (bookBlockState.printMode === 'single_sided') ? totalA4PagesVal : Math.ceil(totalA4PagesVal / 2);
            bbNameHTML = `<p><strong>Buchblock (A4):</strong> ${totalA4PagesVal} S. (${numA4Sheets} Blatt), ${printModeTxtVal} auf ${selPaperConfVal.name}.</p>`;
        } else {
            bbNameHTML = `<p><strong>Buchblock:</strong> Keine A4 Seiten (nur A3 auf ${selPaperConfVal.name}).</p>`;
        }
        let a3InfoTxt = '';
        if (hasA3Val && numA3PagesVal > 0) {
            a3InfoTxt = `+ ${numA3PagesVal} x A3-Seiten (gefalzt, Preis: ${(bookBlockCalculations.costA3).toFixed(2)}${currency})`;
        }
        const costInfoTxt = `${(bookBlockCalculations.totalDirectCost).toFixed(2)} ${currency}`;
        const bbItemData = {
            isBookBlockInfo: true, name: bbNameHTML, a3Info: a3InfoTxt,
            firstPagePreviewDataURL: bookBlockState.firstPagePreviewDataURL, costInfo: costInfoTxt
        };
        const bbDesktopItem = document.createElement('div');
        bbDesktopItem.className = 'cart-item cart-bookblock-info-wrapper'; // Geändert von cart-bookblock-info zu -wrapper für Konsistenz
        bbDesktopItem.innerHTML = createCartItemHTML(bbItemData);
        cartItemsContainerDesktop_DOM.appendChild(bbDesktopItem);
        const bbMobileItem = bbDesktopItem.cloneNode(true);
        cartItemsContainerMobile_DOM.appendChild(bbMobileItem);
    }

    // 2. Varianten
    variantsWithPrices.forEach((variantPriceData, index) => {
        const originalVariant = configuredVariants.find(v => v.id === variantPriceData.id);
        if (!originalVariant) return;

        const bindingConfig = getBindingConfigById(originalVariant.bindingTypeId);
        let variantDetails = [];
        let bindingThumbnailSrc = null; // Wird hier initialisiert

        // Standard-Logik für Thumbnail aus Galerie-Optionen der Bindung
        if (bindingConfig?.options) {
            bindingConfig.options.forEach(optConf => {
                const selectedOptionValue = originalVariant.options[optConf.optionKey];
                if (selectedOptionValue !== undefined && selectedOptionValue !== null && selectedOptionValue !== false) {
                    if (optConf.type === 'checkbox' && selectedOptionValue === true) {
                        variantDetails.push(optConf.name);
                    } else if (optConf.type === 'radio') {
                        const choice = optConf.choices.find(c => c.id === selectedOptionValue);
                         if (choice && (choice.price > 0 || optConf.optionKey.toLowerCase().includes("color") || !choice.default)) {
                             variantDetails.push(`${optConf.name}: ${choice.name}`);
                        }
                    } else if (optConf.type === 'gallery_select') {
                        variantDetails.push(`${optConf.name}: ${String(selectedOptionValue).replace(/_/g, ' ')}`);
                        if (optConf.imageFolderPath) {
                            bindingThumbnailSrc = `${optConf.imageFolderPath}${selectedOptionValue}`; // Fallback-Thumbnail
                        }
                    }
                }
            });
        }

        // NEU: Überschreibe bindingThumbnailSrc mit dem Editor-Thumbnail, falls vorhanden
        if (personalizationsState && personalizationsState[originalVariant.id]) {
            const persoData = personalizationsState[originalVariant.id];
            if (persoData.coverEditorData && persoData.coverEditorData.thumbnailDataUrl) {
                bindingThumbnailSrc = persoData.coverEditorData.thumbnailDataUrl;
            }
        }
        // ENDE NEU

        const itemData = {
            name: `Variante ${index + 1}: ${bindingConfig?.name || 'N/A'}`,
            quantity: originalVariant.quantity, variantDetails,
            unitPrice: variantPriceData.unitPrice, totalPrice: variantPriceData.totalPrice,
            isInvalid: variantPriceData.isInvalid, bindingThumbnailSrc // bindingThumbnailSrc wird hier übergeben
        };
        if (variantPriceData.totalPrice > 0 || originalVariant.quantity > 0 || variantPriceData.isInvalid) {
            const desktopItem = document.createElement('div');
            desktopItem.className = 'cart-item';
            desktopItem.innerHTML = createCartItemHTML(itemData);
            cartItemsContainerDesktop_DOM.appendChild(desktopItem);
            const mobileItem = desktopItem.cloneNode(true);
            cartItemsContainerMobile_DOM.appendChild(mobileItem);
        }
    });

    // 3. Extras
    extrasWithPrices.forEach(extraPriceData => {
        const originalExtra = configuredExtras.find(ex => ex.instanceId === extraPriceData.instanceId);
        if (!originalExtra) return;
        const extraConfig = getExtraConfigById(originalExtra.extraId);
        if (!extraConfig) return;

        if (originalExtra.extraId && (originalExtra.quantity > 0 || !extraConfig.hasIndependentQuantity || extraConfig.options?.length > 0)) {
            let extraDetails = [];
            if (extraConfig.options) {
                extraConfig.options.forEach(optGroup => {
                    const selectedChoiceId = originalExtra.selectedOptions[optGroup.optionKey];
                    if (selectedChoiceId) {
                        const choiceConfig = optGroup.choices.find(c => c.id === selectedChoiceId);
                        const defaultChoice = optGroup.choices.find(c => c.default) || optGroup.choices[0];
                        if (choiceConfig && (!defaultChoice || choiceConfig.id !== defaultChoice.id || choiceConfig.price > 0)) {
                            extraDetails.push(`${optGroup.groupName}: ${choiceConfig.name}`);
                        }
                    }
                });
            }
            const itemData = {
                name: `Extra: ${extraConfig.name || 'N/A'}`,
                quantity: extraConfig.hasIndependentQuantity ? originalExtra.quantity : 1,
                extraDetails, unitPrice: extraPriceData.unitPrice, totalPrice: extraPriceData.totalPrice
            };
            const dItem = document.createElement('div');
            dItem.className = 'cart-item';
            dItem.innerHTML = createCartItemHTML(itemData);
            cartItemsContainerDesktop_DOM.appendChild(dItem);
            const mItem = dItem.cloneNode(true);
            cartItemsContainerMobile_DOM.appendChild(mItem);
        }
    });

    // 4. Produktionszeit & Lieferung
    const { selectedProductionTime, productionTimeCost, selectedDeliveryMethod, deliveryMethodCost } = productionAndDeliveryCalculations;

    if (selectedProductionTime) {
        const prodItemData = {
            isProdDelInfo: true,
            name: `Produktionszeit: ${selectedProductionTime.name}`,
            price: productionTimeCost
        };
        const dProdItem = document.createElement('div');
        dProdItem.className = 'cart-item';
        dProdItem.innerHTML = createCartItemHTML(prodItemData);
        cartItemsContainerDesktop_DOM.appendChild(dProdItem);
        const mProdItem = dProdItem.cloneNode(true);
        cartItemsContainerMobile_DOM.appendChild(mProdItem);
    }

    if (selectedDeliveryMethod) {
        const delItemData = {
            isProdDelInfo: true,
            name: `Lieferart: ${selectedDeliveryMethod.name}`,
            price: deliveryMethodCost
        };
        const dDelItem = document.createElement('div');
        dDelItem.className = 'cart-item';
        dDelItem.innerHTML = createCartItemHTML(delItemData);
        cartItemsContainerDesktop_DOM.appendChild(dDelItem);
        const mDelItem = dDelItem.cloneNode(true);
        cartItemsContainerMobile_DOM.appendChild(mDelItem);
    }

    // Update Totals
    if (orderTotalSpanDesktop_DOM) orderTotalSpanDesktop_DOM.textContent = overallTotal.toFixed(2);
    if (orderTotalMobileFooterSpan_DOM) orderTotalMobileFooterSpan_DOM.textContent = `${overallTotal.toFixed(2)} ${currency}`;
    if (orderTotalMobileModalSpan_DOM) orderTotalMobileModalSpan_DOM.textContent = `${overallTotal.toFixed(2)} ${currency}`;
}

