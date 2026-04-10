/**
 * Semantische Slots aus cover_schema_elements.editor_slot → SVG (Webshop HardcoverEditor).
 * SSOT: docs/SSOT_SVG_COVER_TEMPLATES.md
 */

export const EDITOR_SLOT = {
    NONE: 'none',
    BOOK_BLOCK_FIRST_PAGE: 'book_block_first_page',
};

/**
 * Bekannte `<image id="…">` für Buchblock Seite 1 — auch ohne Zeile in cover_schema_elements
 * (z. B. Paperback Deckfolie: `Template_Paperback_Deckfolie.svg`).
 */
export const KNOWN_BOOK_BLOCK_FIRST_PAGE_IMAGE_IDS = ['tpl-pdf-page1'];

/**
 * @param {{ bookBlockPreviewUrl?: string | null, bookBlockPreviewFallbackUrl?: string | null }} runtime
 * @returns {string | null} href oder null (SVG-Default beibehalten)
 */
export function resolveBookBlockFirstPageHref(runtime) {
    const u = runtime?.bookBlockPreviewUrl;
    if (u != null && String(u).trim() !== '') return String(u).trim();
    const f = runtime?.bookBlockPreviewFallbackUrl;
    if (f != null && String(f).trim() !== '') return String(f).trim();
    return null;
}

/**
 * Setzt href auf passende `<image id="…">` gemäß Schema (nur aktive Zeilen).
 * @param {SVGSVGElement | Element | null} svgRoot
 * @param {object[]} schemaElements – get-cover-schema → elements
 * @param {{ bookBlockPreviewUrl?: string | null, bookBlockPreviewFallbackUrl?: string | null }} runtime
 */
export function applyEditorSlotsToSvg(svgRoot, schemaElements, runtime) {
    if (!svgRoot || !Array.isArray(schemaElements)) return;
    const doc = svgRoot.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    for (const row of schemaElements) {
        if (!row || row.active === false) continue;
        const slot = (row.editor_slot || EDITOR_SLOT.NONE).trim();
        if (slot === EDITOR_SLOT.NONE || !row.element_id) continue;
        if (String(row.element_type || '').trim() !== 'image') continue;

        const id = String(row.element_id).trim();
        if (!id) continue;

        const el = doc.getElementById(id);
        if (!el || el.tagName.toLowerCase() !== 'image') continue;

        if (slot === EDITOR_SLOT.BOOK_BLOCK_FIRST_PAGE) {
            const href = resolveBookBlockFirstPageHref(runtime || {});
            if (href) {
                el.setAttribute('href', href);
                el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
            }
        }
    }

    const hrefKnown = resolveBookBlockFirstPageHref(runtime || {});
    if (!hrefKnown) return;

    for (const knownId of KNOWN_BOOK_BLOCK_FIRST_PAGE_IMAGE_IDS) {
        const el = doc.getElementById(knownId);
        if (!el || el.tagName.toLowerCase() !== 'image') continue;
        el.setAttribute('href', hrefKnown);
        el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', hrefKnown);
    }
}
