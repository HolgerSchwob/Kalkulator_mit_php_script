// calculationService.mjs
// Handles all price and thickness calculations

function getPaperConfigById(paperId, papersConfig) {
    return papersConfig.find(p => p.id === paperId);
}

function getBindingConfigById(bindingId, bindingsConfig) {
    return bindingsConfig.find(b => b.id === bindingId);
}

function getExtraConfigById(extraId, extrasConfig) {
    return extrasConfig.find(ex => ex.id === extraId);
}

function getProductionTimeById(id, prodTimesConfig) {
    return prodTimesConfig.find(pt => pt.id === id);
}

function getDeliveryMethodById(id, deliveryMethodsConfig) {
    return deliveryMethodsConfig.find(dm => dm.id === id);
}

function calculateBookBlockThicknessInternal(pages, paperId, printMode, a3Count, papersConfig) {
    if ((pages <= 0 && a3Count <= 0) || !paperId) return 0;
    const paperConfig = getPaperConfigById(paperId, papersConfig);
    if (!paperConfig || paperConfig.paperThickness === undefined) {
        console.warn(`Papierkonfiguration für ID ${paperId} nicht gefunden oder Dicke nicht definiert.`);
        return 0;
    }
    const numA4Sheets = (printMode === 'single_sided') ? pages : Math.ceil(pages / 2);
    let totalEffectiveSheets = numA4Sheets;
    totalEffectiveSheets += a3Count * 1; 
    return totalEffectiveSheets * paperConfig.paperThickness;
}

export function calculateAllPrices(bookBlockState, configuredVariants, configuredExtras, productionDeliveryState, CALC_CONFIG) {
    const { totalPages, paperId, printMode, hasA3Pages, a3PagesCount } = bookBlockState;
    const { productionTimeId, deliveryMethodId } = productionDeliveryState;
    const { papers, bindings, extras, general, productionAndDelivery } = CALC_CONFIG;

    let bookBlockCostA4 = 0;
    let bookBlockCostA3 = 0;
    const selPaperConf = getPaperConfigById(paperId, papers);

    if (totalPages > 0 && selPaperConf) {
        const numA4Sheets = (printMode === 'single_sided') ? totalPages : Math.ceil(totalPages / 2);
        bookBlockCostA4 = (numA4Sheets * selPaperConf.pricePerSheetMaterial) + (totalPages * selPaperConf.pricePerPagePrint);
    }
    if (hasA3Pages && a3PagesCount > 0) {
        bookBlockCostA3 = a3PagesCount * general.a3PagePrice;
    }
    const totalBookBlockDirectCost = bookBlockCostA4 + bookBlockCostA3;
    const currentBlockThickness = calculateBookBlockThicknessInternal(totalPages, paperId, printMode, a3PagesCount, papers);

    let overallTotal = 0;
    const variantsWithPrices = [];
    const extrasWithPrices = [];

    // Calculate for Variants
    if (configuredVariants.length > 0) {
        const validVariantsForFee = configuredVariants.filter(v => {
            const conf = getBindingConfigById(v.bindingTypeId, bindings);
            if (!conf || conf.minBlockThicknessMm === undefined || conf.maxBlockThicknessMm === undefined) return true; 
            if (totalPages <= 0 && a3PagesCount <=0 && !selPaperConf) return false; 
            
            const minV = Math.max(conf.minBlockThicknessMm, general.absoluteMinThicknessMm);
            const maxV = Math.min(conf.maxBlockThicknessMm, general.absoluteMaxThicknessMm);
            return currentBlockThickness >= minV && currentBlockThickness <= maxV;
        });

        let totalValidQuantityForFee = validVariantsForFee.reduce((sum, v) => sum + v.quantity, 0);
        if (totalValidQuantityForFee === 0 && validVariantsForFee.length > 0) {
            totalValidQuantityForFee = validVariantsForFee.length;
        }

        const sharedOrderBaseFeePerItem = (totalValidQuantityForFee > 0) ? general.orderBaseFee / totalValidQuantityForFee : 0;

        configuredVariants.forEach(variant => {
            const bindingConf = getBindingConfigById(variant.bindingTypeId, bindings);
            let unitPrice = 0;
            let totalPrice = 0;
            let isInvalid = false;

            if (!bindingConf || variant.quantity <= 0) {
                isInvalid = true; 
            } else if (totalPages <= 0 && a3PagesCount <= 0 && !selPaperConf) {
                 isInvalid = true; 
            } else if (bindingConf.minBlockThicknessMm !== undefined && bindingConf.maxBlockThicknessMm !== undefined) {
                const minValid = Math.max(bindingConf.minBlockThicknessMm, general.absoluteMinThicknessMm);
                const maxValid = Math.min(bindingConf.maxBlockThicknessMm, general.absoluteMaxThicknessMm);
                if (currentBlockThickness < minValid || currentBlockThickness > maxValid) {
                    isInvalid = true;
                }
            }

            if (!isInvalid) {
                let optionsCost = 0;
                if (bindingConf.options) {
                    bindingConf.options.forEach(opt => {
                        const selectedValue = variant.options[opt.optionKey];
                        if (selectedValue !== undefined && selectedValue !== null) {
                            if (opt.type === 'checkbox' && selectedValue === true) {
                                optionsCost += opt.price || 0;
                            } else if (opt.type === 'radio') {
                                const choice = opt.choices.find(c => c.id === selectedValue);
                                if (choice) optionsCost += choice.price || 0;
                            } else if (opt.type === 'gallery_select') {
                                optionsCost += opt.price || 0; 
                            }
                        }
                    });
                }
                const feeForThisItem = validVariantsForFee.some(vv => vv.id === variant.id) ? sharedOrderBaseFeePerItem : 0;
                
                unitPrice = feeForThisItem + totalBookBlockDirectCost + (bindingConf.bindingTypeBaseFee / variant.quantity) + bindingConf.pricePerItem + optionsCost;
                totalPrice = unitPrice * variant.quantity;
                overallTotal += totalPrice;
            }
            
            variantsWithPrices.push({
                ...variant, 
                unitPrice,
                totalPrice,
                isInvalid
            });
        });
    }

    // Calculate for Extras
    configuredExtras.forEach(extraInstance => {
        const extraConf = getExtraConfigById(extraInstance.extraId, extras);
        let unitPrice = 0;
        let totalPrice = 0;

        if (extraConf) {
            let extraOptionsCost = 0;
            if (extraConf.options?.length) {
                extraConf.options.forEach(grp => {
                    const selectedChoiceId = extraInstance.selectedOptions[grp.optionKey];
                    const choiceConfig = grp.choices.find(c => c.id === selectedChoiceId);
                    if (choiceConfig) extraOptionsCost += choiceConfig.price || 0;
                });
            }
            unitPrice = (extraConf.unitPrice || 0) + extraOptionsCost;
            totalPrice = unitPrice * (extraConf.hasIndependentQuantity ? extraInstance.quantity : 1);
            overallTotal += totalPrice;
        }
        
        extrasWithPrices.push({
            ...extraInstance, 
            unitPrice,
            totalPrice
        });
    });

    // Add Production Time Cost
    let productionTimeCost = 0;
    const selectedProdTime = getProductionTimeById(productionTimeId, productionAndDelivery.productionTimes);
    if (selectedProdTime) {
        productionTimeCost = selectedProdTime.price || 0;
        overallTotal += productionTimeCost;
    }

    // Add Delivery Method Cost
    let deliveryMethodCost = 0;
    const selectedDelMethod = getDeliveryMethodById(deliveryMethodId, productionAndDelivery.deliveryMethods);
    if (selectedDelMethod) {
        deliveryMethodCost = selectedDelMethod.price || 0;
        overallTotal += deliveryMethodCost;
    }
    
    if (Math.abs(overallTotal) < 0.001 && overallTotal < 0) {
        overallTotal = 0;
    }

    return {
        overallTotal,
        bookBlockCalculations: {
            thickness: currentBlockThickness,
            costA4: bookBlockCostA4,
            costA3: bookBlockCostA3,
            totalDirectCost: totalBookBlockDirectCost
        },
        variantCalculations: {
            variantsWithPrices,
            bookBlockThickness: currentBlockThickness 
        },
        extraCalculations: {
            extrasWithPrices
        },
        productionAndDeliveryCalculations: { // NEU
            selectedProductionTime: selectedProdTime,
            productionTimeCost: productionTimeCost,
            selectedDeliveryMethod: selectedDelMethod,
            deliveryMethodCost: deliveryMethodCost
        }
    };
}