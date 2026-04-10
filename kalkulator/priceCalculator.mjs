// priceCalculator.mjs
// Handles all pricing calculations for the calculator. V3.0 by Lucy.
// V3.0: Implemented final base fee logic for quantity scaling.

/**
 * Finds a specific config item by its ID from a given array.
 * @param {string} id - The ID to find.
 * @param {Array} configArray - The array to search in (e.g., config.papers).
 * @returns {object|null} The config object or null if not found.
 */
function getConfigById(id, configArray) {
    return configArray ? configArray.find(item => item.id === id) || null : null;
}

/**
 * Calculates the variable price of a SINGLE book block (without base fees).
 * @param {object} bookBlockState - The current state of the book block.
 * @param {object} config - The main calculator configuration object.
 * @returns {number} The variable price of one book block.
 */
function calculateVariableBookBlockPrice(bookBlockState, config) {
    const { totalPages, paperId, printMode, a3PagesCount } = bookBlockState;
    const paperConfig = getConfigById(paperId, config.papers);

    if (!paperConfig) return 0;

    const numA4Sheets = (printMode === 'single_sided') ? totalPages : Math.ceil(totalPages / 2);
    const totalSheets = numA4Sheets + a3PagesCount;
    
    const materialPrice = totalSheets * paperConfig.pricePerSheetMaterial;
    const printPrice = totalPages * paperConfig.pricePerPagePrint;
    const a3Price = a3PagesCount * config.general.a3PagePrice;

    return materialPrice + printPrice + a3Price;
}

/**
 * Calculates the prices for all configured binding variants, bundling all costs correctly.
 * @param {object} inquiryState - The global inquiry state.
 * @param {object} config - The main calculator configuration object.
 * @returns {object} An object containing variants with their calculated prices.
 */
export function calculateVariantPrices(inquiryState, config) {
    const { variants, bookBlock, personalizations = {} } = inquiryState;
    
    const variableBookBlockPrice = calculateVariableBookBlockPrice(bookBlock, config);
    const bookBlockBaseFee = config.general.bookBlockBaseFee || 0;

    const variantsWithPrices = variants.map(variant => {
        const bindingConfig = getConfigById(variant.bindingTypeId, config.bindings);
        if (!bindingConfig) {
            return { ...variant, unitPrice: 0, totalPrice: 0, name: "Ungültige Bindung", isInvalid: true };
        }

        const bindingBaseFee = bindingConfig.bindingTypeBaseFee || 0;
        let variableBindingPrice = bindingConfig.pricePerItem || 0;

        // Optionen: State nutzt selectedOptions; foil_type bei Cover-Editor aus gespeicherten Editor-Parametern (nicht Formular)
        let optionsForPricing = { ...(variant.selectedOptions || variant.options || {}) };
        if (bindingConfig.personalizationInterface === 'coverEditor') {
            const foilFromEditor = personalizations[variant.id]?.editorData?.parameters?.foilTypeId;
            if (foilFromEditor) {
                optionsForPricing = { ...optionsForPricing, foil_type: foilFromEditor };
            }
        }

        // Add prices for selected options
        if (bindingConfig.options && optionsForPricing) {
            bindingConfig.options.forEach(opt => {
                const selectedOption = optionsForPricing[opt.optionKey];
                if (opt.type === 'radio' && selectedOption) {
                    const choice = opt.choices.find(c => c.id === selectedOption);
                    if (choice) variableBindingPrice += choice.price || 0;
                }
            });
        }
        
        // The final unit price is the sum of variable costs plus the base fees divided by quantity.
        // This creates the scaling price effect.
        const finalVariantUnitPrice = variableBookBlockPrice + variableBindingPrice + ((bookBlockBaseFee + bindingBaseFee) / variant.quantity);
        const totalPrice = finalVariantUnitPrice * variant.quantity;

        return {
            ...variant,
            unitPrice: finalVariantUnitPrice,
            totalPrice,
            name: bindingConfig.name,
            isInvalid: false
        };
    });

    return { variantsWithPrices };
}


/**
 * Calculates the prices for all configured extras.
 */
export function calculateExtrasPrices(inquiryState, config) {
    const { extras } = inquiryState;
    const extrasWithPrices = extras.map(extra => {
        const extraConfig = getConfigById(extra.extraId, config.extras);
        if (!extraConfig) return { ...extra, unitPrice: 0, totalPrice: 0, name: "Ungültiges Extra" };
        
        let unitPrice = extraConfig.unitPrice || 0;
        if (extraConfig.options && extra.selectedOptions) {
             extraConfig.options.forEach(optGroup => {
                const selectedChoiceId = extra.selectedOptions[optGroup.optionKey];
                if (selectedChoiceId) {
                    const choice = optGroup.choices.find(c => c.id === selectedChoiceId);
                    if (choice) unitPrice += choice.price || 0;
                }
            });
        }
        const totalPrice = unitPrice * extra.quantity;
        return { ...extra, unitPrice, totalPrice, name: extraConfig.name };
    });
    return { extrasWithPrices };
}

/**
 * Calculates the final total price for the entire order.
 */
export function calculateTotalOrderPrice(variantsWithPrices, extrasWithPrices, inquiryState, config) {
    let total = config.general.orderBaseFee || 0;
    
    variantsWithPrices.forEach(variant => total += variant.totalPrice || 0);
    extrasWithPrices.forEach(extra => total += extra.totalPrice || 0);

    const prodTime = getConfigById(inquiryState.production.productionTimeId, config.productionAndDelivery.productionTimes);
    const deliveryMethod = getConfigById(inquiryState.production.deliveryMethodId, config.productionAndDelivery.deliveryMethods);
    if(prodTime) total += prodTime.price || 0;
    if(deliveryMethod) total += deliveryMethod.price || 0;

    return total;
}

/**
 * Calculates the thickness of the book block.
 */
export function calculateBookBlockThickness(bookBlockState, config) {
    const { totalPages, paperId, printMode, a3PagesCount } = bookBlockState;
    if (!paperId || (totalPages <= 0 && a3PagesCount <= 0)) return 0;
    const paperConfig = getConfigById(paperId, config.papers);
    if (!paperConfig || paperConfig.paperThickness === undefined) return 0;
    const numA4Sheets = (printMode === 'single_sided') ? totalPages : Math.ceil(totalPages / 2);
    let totalEffectiveSheets = numA4Sheets + a3PagesCount;
    return totalEffectiveSheets * paperConfig.paperThickness;
}
