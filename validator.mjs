// validator.mjs
// Handles the validation of the entire user configuration before inquiry. By Lucy.

/**
 * Checks if a binding configuration requires personalization.
 * @param {object} bindingConfig - The configuration object for a binding type.
 * @returns {boolean} - True if personalization is required.
 */
function isPersonalizationRequired(bindingConfig) {
    return bindingConfig && bindingConfig.requiresPersonalization;
}

/**
 * Checks if a specific variant's personalization is complete.
 * @param {object} variant - The variant to check.
 * @param {object} personalizationData - The corresponding personalization data for the variant.
 * @param {object} bindingConfig - The configuration for the variant's binding type.
 * @returns {boolean} - True if personalization is complete.
 */
function isPersonalizationComplete(variant, personalizationData, bindingConfig) {
    if (!isPersonalizationRequired(bindingConfig)) {
        return true; // No personalization needed.
    }

    if (!personalizationData) {
        return false; // Required but no data provided.
    }

    // Logic for the SVG editor
    if (bindingConfig.personalizationInterface === 'coverEditor') {
        return !!(personalizationData.editorData && personalizationData.editorData.thumbnailDataUrl);
    }
    
    // Placeholder for other personalization types (e.g., text-based modal)
    // This needs to be expanded when the old modal is re-integrated.
    if (Object.keys(personalizationData).length > 0) {
        return true;
    }

    return false;
}


/**
 * Validates the entire inquiry state.
 * @param {object} inquiryState - The global state of the application.
 * @param {object} config - The main calculator configuration.
 * @returns {{isValid: boolean, errors: string[]}} - An object indicating validity and a list of error messages.
 */
export function validateConfiguration(inquiryState, config) {
    const errors = [];

    // 1. Check if a main PDF for the book block has been uploaded.
    if (!inquiryState.bookBlock.mainPdfFile) {
        errors.push("Bitte laden Sie Ihre Druckdatei für den Buch-Inhalt hoch (siehe Sektion 1).");
    }

    // 2. Check each variant for required personalizations.
    inquiryState.variants.forEach((variant, index) => {
        const bindingConfig = config.bindings.find(b => b.id === variant.bindingTypeId);
        const personalizationData = inquiryState.personalizations[variant.id];
        
        if (isPersonalizationRequired(bindingConfig) && !isPersonalizationComplete(variant, personalizationData, bindingConfig)) {
            errors.push(`Die Personalisierung für Variante ${index + 1} (${bindingConfig.name}) ist noch nicht abgeschlossen.`);
        }
    });
    
    // Add any other checks here in the future.

    return {
        isValid: errors.length === 0,
        errors: errors,
    };
}
