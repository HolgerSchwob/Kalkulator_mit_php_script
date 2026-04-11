/**
 * CD/DVD-Beschriftung: gleicher HardcoverEditor-Stack, templateGroup cd_label,
 * Farbpalette vom gewählten Buchdecken-Template (Quell-Variante).
 */
import { openEditor } from './EditorFactory.mjs';
import { getSupabaseConfig } from './supabaseConfig.mjs';
import { getSupabaseClient } from './supabaseClient.mjs';
import { fetchCoverTemplateGroupConfig, deriveTemplateGroupFromBindingId } from './editorHandler.mjs';

const CD_DIM_FALLBACK = {
    u1Width: 120,
    u4Width: 120,
    visibleCoverHeight: 120,
    svgTotalWidth: 120,
    svgTotalHeight: 120,
    svgCenterX: 60,
    falzZoneWidth: 0,
};

/**
 * UUID des Buchdecken-Templates für Palette + ggf. cd_label_template_id — aus gespeicherter Personalisierung oder DB-Lookup.
 * @param {object} variant
 * @param {object} personalizations
 * @param {object} calcConfig
 * @returns {Promise<string|null>}
 */
export async function resolveBookCoverTemplateIdForVariant(variant, personalizations, calcConfig) {
    const pers = personalizations?.[variant.id]?.editorData?.parameters;
    if (pers?.templateId && /^[0-9a-f-]{36}$/i.test(String(pers.templateId))) {
        return String(pers.templateId).trim();
    }
    const bindingConfig = calcConfig.bindings.find((b) => b.id === variant.bindingTypeId);
    if (!pers?.templateFile || !bindingConfig) return null;
    const gruppe =
        bindingConfig.editorConfig?.templateGroup ?? deriveTemplateGroupFromBindingId(bindingConfig.id);
    const supabase = await getSupabaseClient();
    const file = String(pers.templateFile).trim();
    const { data, error } = await supabase
        .from('cover_templates')
        .select('id')
        .eq('filename', file)
        .eq('gruppe', gruppe)
        .limit(1)
        .maybeSingle();
    if (error || !data?.id) return null;
    return data.id;
}

async function fetchCdTemplatesList() {
    const { url, anonKey } = await getSupabaseConfig();
    const res = await fetch(`${url}/functions/v1/get-cover-templates?gruppe=${encodeURIComponent('cd_label')}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.templates) ? data.templates : [];
}

/** Fallback-Dateinamen in Reihenfolge (ältere Deployments: default.svg). */
const CD_FALLBACK_FILENAMES = ['DEFAULT_CDLABEL.svg', 'default.svg'];

/**
 * Effektives CD-Label-Template: Zuordnung am Buchdecken oder Fallback DEFAULT_CDLABEL.svg in cd_label.
 * @param {string|null} bookCoverTemplateId
 * @returns {Promise<string|null>} UUID cd_label template row
 */
export async function resolveEffectiveCdTemplateId(bookCoverTemplateId) {
    const supabase = await getSupabaseClient();
    if (bookCoverTemplateId && /^[0-9a-f-]{36}$/i.test(bookCoverTemplateId)) {
        const { data: row } = await supabase
            .from('cover_templates')
            .select('cd_label_template_id')
            .eq('id', bookCoverTemplateId)
            .maybeSingle();
        if (row?.cd_label_template_id) return row.cd_label_template_id;
    }
    for (const fn of CD_FALLBACK_FILENAMES) {
        const { data: def } = await supabase
            .from('cover_templates')
            .select('id')
            .eq('gruppe', 'cd_label')
            .eq('filename', fn)
            .eq('active', true)
            .limit(1)
            .maybeSingle();
        if (def?.id) return def.id;
    }
    return null;
}

function paramsToInitialData(params) {
    if (!params || typeof params !== 'object') return {};
    return {
        templateIndex: typeof params.templateIndex === 'number' ? params.templateIndex : 0,
        textInputs: params.textInputs && typeof params.textInputs === 'object' ? { ...params.textInputs } : {},
        logoInputs: params.logoInputs && typeof params.logoInputs === 'object' ? { ...params.logoInputs } : {},
        selectedColorPairIndex: params.selectedColorPairIndex ?? 0,
        foilTypeId: params.foilTypeId,
    };
}

/**
 * @param {object} options
 * @param {object} options.inquiryState
 * @param {object} options.calcConfig
 * @param {function} [options.onSaved]
 * @param {function} [options.onCancel]
 */
export async function launchCdLabelEditor(options) {
    const { inquiryState, calcConfig, onSaved, onCancel } = options;
    const variants = inquiryState.variants || [];
    if (variants.length === 0) {
        alert('Bitte zuerst mindestens eine Bindung wählen und das Buchdeckel gestalten.');
        return;
    }

    let sourceId = inquiryState.cdLabel?.sourceVariantId || null;
    if (!sourceId || !variants.some((v) => v.id === sourceId)) {
        sourceId = variants[0].id;
    }

    const sourceVariant = variants.find((v) => v.id === sourceId);
    const coverParams = inquiryState.personalizations?.[sourceId]?.editorData?.parameters;
    if (!coverParams) {
        alert('Bitte zuerst das Buchdeckel für die gewählte Variante gestalten (Quelle für Farben und Textvorschlag).');
        return;
    }

    const paletteSourceTemplateId = await resolveBookCoverTemplateIdForVariant(sourceVariant, inquiryState.personalizations, calcConfig);
    if (!paletteSourceTemplateId) {
        alert('Buchdecken-Template konnte nicht zugeordnet werden. Bitte Speichern Sie die Buchdecken-Personalisierung erneut.');
        return;
    }

    const cdTemplates = await fetchCdTemplatesList();
    if (cdTemplates.length === 0) {
        alert('Keine CD-Label-Templates (Gruppe cd_label) in Supabase. Bitte im Dashboard ein Template unter „cd_label“ hochladen.');
        return;
    }

    const effectiveCdId = await resolveEffectiveCdTemplateId(paletteSourceTemplateId);
    let startIndex = 0;
    if (effectiveCdId) {
        const ix = cdTemplates.findIndex((t) => t.id === effectiveCdId);
        if (ix >= 0) startIndex = ix;
    }

    const existingCd = inquiryState.personalizations?.cd_label?.editorData?.parameters;
    const fromCover = paramsToInitialData(coverParams);
    const fromExisting = paramsToInitialData(existingCd);
    const hasSavedCd =
        existingCd &&
        (existingCd.templateFile ||
            (existingCd.textInputs && typeof existingCd.textInputs === 'object' && Object.keys(existingCd.textInputs).length > 0));
    const initialData = hasSavedCd
        ? {
              templateIndex: fromExisting.templateIndex ?? startIndex,
              textInputs: { ...fromCover.textInputs, ...fromExisting.textInputs },
              logoInputs: { ...fromCover.logoInputs, ...fromExisting.logoInputs },
              selectedColorPairIndex:
                  fromExisting.selectedColorPairIndex !== undefined
                      ? fromExisting.selectedColorPairIndex
                      : fromCover.selectedColorPairIndex || 0,
              foilTypeId: fromExisting.foilTypeId ?? fromCover.foilTypeId,
          }
        : {
              templateIndex: startIndex,
              textInputs: { ...fromCover.textInputs },
              logoInputs: { ...fromCover.logoInputs },
              selectedColorPairIndex: fromCover.selectedColorPairIndex || 0,
              foilTypeId: fromCover.foilTypeId,
          };

    let dimensions = CD_DIM_FALLBACK;
    const groupConfig = await fetchCoverTemplateGroupConfig('cd_label');
    if (groupConfig && groupConfig.dimensions) {
        dimensions = groupConfig.dimensions;
    }

    const editorConfig = {
        templateSource: 'supabase',
        templateGroup: 'cd_label',
        bindingType: 'hardcover',
        spineWidth: 0,
        dimensions,
        paletteSourceTemplateId,
        editorTitle: 'CD-Beschriftung',
        foilTypeChoices: null,
        initialData,
        bookBlockPreviewUrl: null,
        bookBlockPreviewFallbackUrl: null,
        onSubmit: (result) => {
            if (!inquiryState.personalizations) inquiryState.personalizations = {};
            inquiryState.personalizations.cd_label = {
                editorData: result,
                sourceVariantId: sourceId,
                paletteSourceTemplateId,
            };
            if (typeof onSaved === 'function') onSaved(result);
        },
        onCancel: () => {
            if (typeof onCancel === 'function') onCancel();
        },
    };

    openEditor(editorConfig);
}
