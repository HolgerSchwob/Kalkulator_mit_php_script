// constants.mjs
// Globale Konstanten für den Buchdecken-Editor

export const SVG_TOTAL_WIDTH = 500; // Gesamtbreite des SVG-Designs
export const SVG_TOTAL_HEIGHT = 330; // Gesamthöhe des SVG-Designs
export const VISIBLE_COVER_HEIGHT = 302; // Sichtbare Höhe des Covers im Design
export const U1_WIDTH = 215; // Breite der Umschlagseite 1 (Vorderseite)
export const U4_WIDTH = 215; // Breite der Umschlagseite 4 (Rückseite)
export const ZOOM_STEP = 0.15; // Schrittweite für Zoom-Operationen
export const DEFAULT_SPINE_WIDTH = 20; // Standard-Rückenbreite in mm
export const THUMBNAIL_TARGET_WIDTH = 200; // Zielbreite für das generierte PNG-Thumbnail in Pixel

// IDs von SVG-Elementen, die häufig verwendet werden
export const SVG_IDS = {
    GROUP_U1: '#group-u1',
    GROUP_U4: '#group-u4',
    GROUP_SPINE: '#group-spine',
    TEXT_TITLE: '#text-title',
    TEXT_SUBTITLE: '#text-subtitle',
    TEXT_AUTHOR: '#text-author',
    TEXT_SPINE_TITLE: '#text-spine-title',
    COLOR_TARGET_U1: '#color-target-u1',
    COLOR_TARGET_U4: '#color-target-u4',
    SPINE_BG: '#spine-bg',
    LOGO_PLACEHOLDER: '#logo-placeholder',
    USER_LOGO: '#user-logo'
};

// CSS-Klassen oder IDs für UI-Elemente
export const UI_ELEMENT_IDS = {
    EDITOR_MODAL: 'editor-modal',
    PREVIEW_MODAL: 'preview-modal',
    SVG_CONTAINER: 'svg-container',
    SVG_CANVAS_DIV: 'svg-canvas',
    PREVIEW_SVG_CANVAS_DIV: 'preview-svg-canvas',
    TITLE_INPUT: 'text-title-input',
    SUBTITLE_INPUT: 'text-subtitle-input',
    AUTHOR_INPUT: 'text-author-input',
    SPINE_TITLE_INPUT: 'text-spine-title-input',
    SPINE_WIDTH_INPUT: 'spine-width-input',
    PALETTE_U1: 'palette-u1',
    PALETTE_U4: 'palette-u4',
    TEMPLATE_MINIATURES_LIST: 'template-miniatures-list',
    PREV_TEMPLATE_BUTTON: 'prev-template',
    NEXT_TEMPLATE_BUTTON: 'next-template',
    ZOOM_IN_BUTTON: 'zoom-in-button',
    ZOOM_OUT_BUTTON: 'zoom-out-button',
    ZOOM_RESET_BUTTON: 'zoom-reset-button',
    EDITOR_PREVIEW_BUTTON: 'editor-preview-button',
    CLOSE_PREVIEW_MODAL_BUTTON: 'close-preview-modal-button',
    DOWNLOAD_PREVIEW_SVG_BUTTON: 'download-preview-svg-button',
    EDITOR_CONFIRM_BUTTON: 'editor-confirm-button',
    EDITOR_CANCEL_BUTTON: 'editor-cancel-button',
    OPEN_EDITOR_BUTTON: 'open-editor-button',
    RESULT_OUTPUT: 'result-output',
};

export const TEMPLATES = [
    { name: "Design Klassik", file: "template1.svg", id: "layout_classic_01" },
    { name: "Design Modern", file: "template2.svg", id: "layout_modern_02" },
    { name: "Design Elegant", file: "template3.svg", id: "layout_elegant_03" },
    { name: "Design Minimal", file: "template4.svg", id: "layout_minimal_04" }
];
