// editorHandler.mjs
// Acts as the bridge between the main calculator and the SVG editor modules. By Lucy.

import { openEditor } from './EditorFactory.mjs';
import { getSupabaseConfig } from './supabaseConfig.mjs';

/**
 * Lädt die Gruppen-Config für die angegebene Template-Gruppe (Dimensionen, spine_offset_mm, falz_zone_width).
 * @param {string} templateGroup - z.B. hardcover_modern, paperback_modern
 * @returns {Promise<{ spine_offset_mm: number, dimensions: object }|null>} oder null bei Fehler/404
 */
async function fetchCoverTemplateGroupConfig(templateGroup) {
    if (!templateGroup) return null;
    try {
        const { url, anonKey } = await getSupabaseConfig();
        const res = await fetch(url + '/functions/v1/get-cover-template-group?gruppe=' + encodeURIComponent(templateGroup), {
            headers: { 'Authorization': 'Bearer ' + anonKey, 'apikey': anonKey },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn('Gruppen-Config konnte nicht geladen werden, Fallback auf Bindungskonfiguration.', e);
        return null;
    }
}

/**
 * Opens the appropriate SVG editor for a given variant.
 * Lädt ggf. Gruppen-Config aus Supabase; Rückenbreite = Buchblockdicke + spine_offset_mm; Dimensionen aus Gruppe oder editorConfig.
 * @param {object} variant - The variant object from the inquiryState.
 * @param {object} bindingConfig - The configuration for the variant's binding type.
 * @param {number} bookBlockThicknessMm - The calculated book block thickness in mm (Buchblockdicke).
 * @param {object} existingPersonalization - Any existing personalization data for this variant.
 * @param {function} onSubmitCallback - The function to call when the editor is successfully submitted.
 */
/**
 * @param {object} [options]
 * @param {string | null} [options.bookBlockPreviewUrl] – Data-URL / URL erste PDF-Seite (Buchblock)
 * @param {string | null} [options.bookBlockPreviewFallbackUrl] – optional, überschreibt editorConfig
 */
export async function launchEditorForVariant(
    variant,
    bindingConfig,
    bookBlockThicknessMm,
    existingPersonalization,
    onSubmitCallback,
    options = {}
) {
    if (!bindingConfig.personalizationInterface || bindingConfig.personalizationInterface !== 'coverEditor') {
        console.warn(`Attempted to launch SVG editor for binding type "${bindingConfig.id}" which does not use it.`);
        return;
    }

    const editorBindingType = mapBindingIdToEditorType(variant.bindingTypeId);
    if (!editorBindingType) {
        alert(`Für den Bindungstyp "${bindingConfig.name}" ist kein passender Editor implementiert.`);
        return;
    }

    const bindingSpecificConfig = bindingConfig.editorConfig || {};
    const templateSource = bindingSpecificConfig.templateSource ?? 'supabase';
    const templateGroup = bindingSpecificConfig.templateGroup ?? deriveTemplateGroupFromBindingId(bindingConfig.id);

    let spineWidth = bookBlockThicknessMm;
    let dimensions = bindingSpecificConfig.dimensions || null;

    const groupConfig = await fetchCoverTemplateGroupConfig(templateGroup);
    if (groupConfig) {
        spineWidth = bookBlockThicknessMm + (Number(groupConfig.spine_offset_mm) || 0);
        if (groupConfig.dimensions) dimensions = groupConfig.dimensions;
    }
    if (!dimensions) {
        dimensions = {
            u1Width: 215, u4Width: 215, visibleCoverHeight: 302,
            svgTotalWidth: 500, svgTotalHeight: 330, svgCenterX: 250,
            falzZoneWidth: 8,
        };
    }

    const ec = bindingSpecificConfig || {};
    const bookBlockPreviewUrl =
        options.bookBlockPreviewUrl !== undefined ? options.bookBlockPreviewUrl : null;
    const bookBlockPreviewFallbackUrl =
        options.bookBlockPreviewFallbackUrl !== undefined
            ? options.bookBlockPreviewFallbackUrl
            : ec.bookBlockPreviewFallbackUrl ?? null;

    const foilOptionGroup = (bindingConfig.options || []).find((o) => o.optionKey === 'foil_type');
    const foilTypeChoices = foilOptionGroup?.choices || null;

    const initialDataMerged = { ...(existingPersonalization || {}) };

    const editorConfig = {
        ...bindingSpecificConfig,
        templateSource,
        templateGroup,
        bindingType: editorBindingType,
        spineWidth,
        dimensions: dimensions || undefined,
        foilTypeChoices,
        initialData: initialDataMerged,
        bookBlockPreviewUrl,
        bookBlockPreviewFallbackUrl,
        onSubmit: (result) => {
            if (onSubmitCallback) onSubmitCallback(variant.id, result);
        },
        onCancel: () => { }
    };

    openEditor(editorConfig);
}

/**
 * Maps a calculator binding ID to an editor type understood by the EditorFactory.
 * @param {string} bindingId - The binding ID from the calculator's config.
 * @returns {string|null} The corresponding editor type or null if not found.
 */
function mapBindingIdToEditorType(bindingId) {
    const mapping = {
        'hardcover_modern_fullcolor': 'hardcover',
        'hardcover_efalin_fullcolor': 'hardcover',
        'softcover_foil': 'hardcover',
        'paperback_perfect': 'hardcover',
        'paperback_modern': 'hardcover',
        'paperback_classic': 'hardcover',
    };
    return mapping[bindingId] || null;
}

/**
 * Leitet die Supabase-Template-Gruppe aus der Bindungs-ID ab (falls editorConfig.templateGroup fehlt, z. B. bei Shop-Config aus Supabase).
 */
function deriveTemplateGroupFromBindingId(bindingId) {
    const known = {
        hardcover_modern_fullcolor: 'hardcover_modern',
        hardcover_efalin_fullcolor: 'hardcover_efalin',
        softcover_foil: 'paperback_foil',
        paperback_perfect: 'paperback_modern',
        paperback_modern: 'paperback_modern',
        paperback_classic: 'paperback_classic',
    };
    return known[bindingId] || bindingId;
}
