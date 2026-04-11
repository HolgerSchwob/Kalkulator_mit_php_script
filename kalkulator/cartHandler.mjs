// cartHandler.mjs
// Einzige Quelle für die Warenkorb-Darstellung (Desktop + Mobile). V2: Vereinheitlicht mit script.js-Logik, keine Dopplung.

let CALC_CONFIG_REF;

let cartItemsContainerDesktop_DOM;
let orderTotalDesktop_DOM;
let cartItemsContainerMobile_DOM;
let orderTotalMobileFooter_DOM;
let orderTotalMobileModal_DOM;

/** XSS-sicher: HTML escapen für Ausgabe in Templates. */
function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    const span = document.createElement('span');
    span.textContent = String(s);
    return span.innerHTML;
}

const DEFAULT_BOOK_BLOCK_CART_FALLBACK = '../media/book-block-first-page-placeholder.png';

/**
 * Vorschau-URL für Warenkorb: Editor-Thumbnail, sonst PDF-Seite 1, sonst Platzhalter-PNG (Paperback-Deck).
 */
function resolveCartVariantThumbnail(variant, personalizationData, inquiryState, config) {
    const editorThumb = personalizationData.editorData?.thumbnailDataUrl;
    if (editorThumb) return { src: editorThumb, kind: 'editor' };
    const pdfPrev = inquiryState.bookBlock?.firstPagePreviewUrl;
    if (pdfPrev) return { src: pdfPrev, kind: 'pdf' };

    const binding = config.bindings?.find((b) => b.id === variant.bindingTypeId);
    const ec = binding?.editorConfig || {};
    const useBbFallback =
        ec.usesPdfPreviewAsCover === true ||
        variant.bindingTypeId === 'softcover_foil' ||
        variant.bindingTypeId === 'paperback_perfect';
    if (!useBbFallback) return { src: null, kind: 'none' };

    let path = ec.bookBlockPreviewFallbackUrl;
    if (path == null || String(path).trim() === '') path = DEFAULT_BOOK_BLOCK_CART_FALLBACK;
    path = String(path).trim();
    try {
        if (typeof window !== 'undefined' && window.location?.href) {
            return { src: new URL(path, window.location.href).href, kind: 'bookblock-fallback' };
        }
    } catch {
        /* ignore */
    }
    return { src: path, kind: 'bookblock-fallback' };
}

/**
 * CD-Beschriftung: gleiches Thumbnail wie im Editor (HardcoverEditor → thumbnailDataUrl).
 */
function resolveCdLabelCartThumbnail(inquiryState) {
    const url = inquiryState.personalizations?.cd_label?.editorData?.thumbnailDataUrl;
    if (url) return { src: url, kind: 'cd' };
    return { src: null, kind: 'none' };
}

export function initCartHandler(calcConfig) {
    CALC_CONFIG_REF = calcConfig;
    cartItemsContainerDesktop_DOM = document.getElementById('cartItemsContainerDesktop');
    orderTotalDesktop_DOM = document.getElementById('orderTotalDesktop');
    cartItemsContainerMobile_DOM = document.getElementById('cartItemsContainerMobile');
    orderTotalMobileFooter_DOM = document.getElementById('orderTotalMobileFooter');
    orderTotalMobileModal_DOM = document.getElementById('orderTotalMobileModal');
}

/**
 * Aktualisiert die Warenkorb-Ansicht für Desktop und Mobile (eine gemeinsame Implementierung).
 * @param {object} calculationResults - { variantsWithPrices, extrasWithPrices, totalOrderPrice }
 * @param {object} inquiryState - Globaler State (production, bookBlock, personalizations)
 * @param {object} calcConfig - CALC_CONFIG (general.currencySymbol, productionAndDelivery, general.orderBaseFee)
 */
export function updateCartUI(calculationResults, inquiryState, calcConfig) {
    const config = calcConfig || CALC_CONFIG_REF;
    if (!config) return;
    if (!cartItemsContainerDesktop_DOM || !orderTotalDesktop_DOM) return;

    const { variantsWithPrices = [], extrasWithPrices = [], totalOrderPrice = 0 } = calculationResults;
    const currency = config.general.currencySymbol;

    let cartItemsHTML = '';

    if (variantsWithPrices.length > 0) {
        variantsWithPrices.forEach((variant) => {
            const personalizationData = inquiryState.personalizations?.[variant.id] || {};
            const { src: thumbSrc, kind: thumbKind } = resolveCartVariantThumbnail(
                variant,
                personalizationData,
                inquiryState,
                config
            );
            const thumbClass =
                thumbKind === 'bookblock-fallback'
                    ? 'cart-item-binding-thumbnail cart-item-binding-thumbnail--bookblock-fallback'
                    : 'cart-item-binding-thumbnail';
            const thumb = thumbSrc
                ? `<img src="${escapeHtml(thumbSrc)}" alt="Vorschau" class="${thumbClass}">`
                : '';
            cartItemsHTML += `<div class="cart-item cart-item-variant" id="variant-item-${escapeHtml(variant.id)}">
                ${thumb}
                <div>
                    <p><strong>${escapeHtml(variant.quantity)} x ${escapeHtml(variant.name)}</strong></p>
                    <p class="cart-item-unit-price">(Stückpreis: ${escapeHtml(variant.unitPrice.toFixed(2))} ${escapeHtml(currency)})</p>
                    <div class="variant-item-details"><p class="item-price">Gesamt: ${escapeHtml(variant.totalPrice.toFixed(2))} ${escapeHtml(currency)}</p></div>
                </div>
            </div>`;
        });
    }

    if (extrasWithPrices.length > 0) {
        cartItemsHTML += '<h4>Extras</h4>';
        extrasWithPrices.forEach((extra) => {
            let thumbHtml = '';
            let rowClass = 'cart-item';
            if (extra.extraId === 'cd_packaging_service') {
                const { src: cdSrc, kind: cdKind } = resolveCdLabelCartThumbnail(inquiryState);
                if (cdSrc && cdKind === 'cd') {
                    thumbHtml = `<img src="${escapeHtml(cdSrc)}" alt="" class="cart-item-binding-thumbnail cart-item-binding-thumbnail--cd">`;
                    rowClass = 'cart-item cart-item-variant';
                }
            }
            cartItemsHTML += `<div class="${rowClass}">
                ${thumbHtml}
                <div>
                    <p><strong>${escapeHtml(extra.quantity)}x ${escapeHtml(extra.name)}</strong></p>
                    <div class="extra-item-details"><p class="item-price">Gesamt: ${escapeHtml(extra.totalPrice.toFixed(2))} ${escapeHtml(currency)}</p></div>
                </div>
            </div>`;
        });
    }

    const serviceFee = config.general?.orderBaseFee ?? 0;
    const prodTimes = config.productionAndDelivery?.productionTimes ?? [];
    const deliveryMethods = config.productionAndDelivery?.deliveryMethods ?? [];
    const prodTime = prodTimes.find(p => p.id === inquiryState.production?.productionTimeId);
    const delivery = deliveryMethods.find(d => d.id === inquiryState.production?.deliveryMethodId);

    if (serviceFee > 0 || (prodTime?.price > 0) || (delivery?.price > 0)) {
        cartItemsHTML += '<h4>Service & Versand</h4>';
        if (serviceFee > 0) {
            cartItemsHTML += `<div class="cart-item"><p><strong><i data-lucide="shield-check"></i> Datenprüfung</strong></p><div class="variant-item-details"><p class="item-price">${escapeHtml(serviceFee.toFixed(2))} ${escapeHtml(currency)}</p></div></div>`;
        }
        if (prodTime?.price > 0) {
            cartItemsHTML += `<div class="cart-item"><p><strong><i data-lucide="zap"></i> ${escapeHtml(prodTime.name)}</strong></p><div class="variant-item-details"><p class="item-price">${escapeHtml(prodTime.price.toFixed(2))} ${escapeHtml(currency)}</p></div></div>`;
        }
        if (delivery?.price > 0) {
            cartItemsHTML += `<div class="cart-item"><p><strong><i data-lucide="truck"></i> ${escapeHtml(delivery.name)}</strong></p><div class="variant-item-details"><p class="item-price">${escapeHtml(delivery.price.toFixed(2))} ${escapeHtml(currency)}</p></div></div>`;
        }
    }

    cartItemsContainerDesktop_DOM.innerHTML = cartItemsHTML;
    orderTotalDesktop_DOM.textContent = totalOrderPrice.toFixed(2);

    if (cartItemsContainerMobile_DOM) {
        cartItemsContainerMobile_DOM.innerHTML = cartItemsHTML;
    }
    if (orderTotalMobileFooter_DOM) {
        orderTotalMobileFooter_DOM.textContent = `Gesamt: ${totalOrderPrice.toFixed(2)} ${currency}`;
    }
    if (orderTotalMobileModal_DOM) {
        orderTotalMobileModal_DOM.textContent = `Gesamt: ${totalOrderPrice.toFixed(2)} ${currency}`;
    }

    if (typeof window !== 'undefined' && window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}
