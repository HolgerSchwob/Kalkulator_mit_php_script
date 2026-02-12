// editorHandler.mjs
// Acts as the bridge between the main calculator and the SVG editor modules. By Lucy.

import { openEditor } from './EditorFactory.mjs'; // Assuming EditorFactory is in the same directory

/**
 * Opens the appropriate SVG editor for a given variant.
 * @param {object} variant - The variant object from the inquiryState.
 * @param {object} bindingConfig - The configuration for the variant's binding type.
 * @param {number} spineWidth - The calculated spine width for the book block.
 * @param {object} existingPersonalization - Any existing personalization data for this variant.
 * @param {function} onSubmitCallback - The function to call when the editor is successfully submitted.
 */
export function launchEditorForVariant(variant, bindingConfig, spineWidth, existingPersonalization, onSubmitCallback) {
    if (!bindingConfig.personalizationInterface || bindingConfig.personalizationInterface !== 'coverEditor') {
        console.warn(`Attempted to launch SVG editor for binding type "${bindingConfig.id}" which does not use it.`);
        return;
    }

    // The bindingType in the editor's config needs to match the cases in EditorFactory.
    // We can map our binding IDs to the editor's expected types here.
    const editorBindingType = mapBindingIdToEditorType(variant.bindingTypeId);
    if (!editorBindingType) {
        alert(`Für den Bindungstyp "${bindingConfig.name}" ist kein passender Editor implementiert.`);
        return;
    }

    // NEU: Holen der spezifischen Editor-Konfiguration aus der Haupt-Konfigurationsdatei.
    const bindingSpecificConfig = bindingConfig.editorConfig || {};

    const editorConfig = {
        ...bindingSpecificConfig, // Übernimmt alle Werte wie templatePath, dimensions, etc.

        // Überschreibt oder ergänzt mit dynamischen Werten zur Laufzeit
        bindingType: editorBindingType,
        spineWidth: spineWidth,
        initialData: existingPersonalization || {}, // Pass previous editor data if available
        onSubmit: (result) => {
            console.log("Editor submitted successfully. Result:", result);
            if (onSubmitCallback) {
                onSubmitCallback(variant.id, result);
            }
        },
        onCancel: () => {
            console.log("Editor was cancelled.");
        }
    };

    // Call the factory to open the editor with our prepared config
    openEditor(editorConfig);
}

/**
 * Maps a calculator binding ID to an editor type understood by the EditorFactory.
 * @param {string} bindingId - The binding ID from the calculator's config.
 * @returns {string|null} The corresponding editor type or null if not found.
 */
function mapBindingIdToEditorType(bindingId) {
    // This mapping allows flexibility between calculator config and editor implementation.
    const mapping = {
        'hardcover_modern_fullcolor': 'hardcover',
        // Add other mappings here, e.g. 'wire-o-binding': 'wire-o'
    };
    return mapping[bindingId] || null;
}
