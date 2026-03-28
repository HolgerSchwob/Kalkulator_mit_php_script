/**
 * @file HardcoverEditor.mjs
 * Spezialisierter Editor für Hardcover.
 *
 * LUCY'S REFACTOR V13.1 (LOGO PERSISTENCE):
 * - FEATURE: Hochgeladene Logos bleiben nun beim Wechsel zwischen Templates erhalten.
 * - LOGIC: Der `logoInputs`-Zustand wird nicht mehr gelöscht. Die `_updateLogos`-Funktion rendert ein Logo nur, wenn der entsprechende Platzhalter im aktuellen Template existiert.
 */
import { BaseEditor } from './baseEditor.mjs';
import { generateU1Thumbnail } from './svg-thumbnail-generator.mjs';
import { getSupabaseConfig } from './supabaseConfig.mjs';

const EDITOR_BEHAVIOR_CONFIG = {
    DEFAULT_SPINE_WIDTH: 35.0,
    ZOOM_STEP: 0.2,
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 3,
    FADE_DURATION: 250,
    TEXT_FIT_MIN_SCALE: 0.75, 
    LOGO_MANUAL_SCALE_MIN: 0.5,
    LOGO_MANUAL_SCALE_MAX: 2.0,
    LOGO_MOVE_STEP: 1,
};

const HCE_ICON = {
    svgOpen: '<svg class="hce-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    svgClose: '</svg>',
    chevronLeft: () => `${HCE_ICON.svgOpen}<path d="m15 18-6-6 6-6"/>${HCE_ICON.svgClose}`,
    chevronRight: () => `${HCE_ICON.svgOpen}<path d="m9 18 6-6-6-6"/>${HCE_ICON.svgClose}`,
    minus: () => `${HCE_ICON.svgOpen}<path d="M5 12h14"/>${HCE_ICON.svgClose}`,
    plus: () => `${HCE_ICON.svgOpen}<path d="M5 12h14"/><path d="M12 5v14"/>${HCE_ICON.svgClose}`,
    rotateCcw: () => `${HCE_ICON.svgOpen}<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>${HCE_ICON.svgClose}`,
};

export class HardcoverEditor extends BaseEditor {
    constructor(config) {
        super(config, 'Buchdecke gestalten');
        // Konfiguration aus config.json übernehmen
        this.templatePath = config.templatePath || '';
        this.templateSource = config.templateSource || null; // 'supabase' = Liste + SVGs aus Supabase
        this.templateGroup = config.templateGroup || null;   // z. B. hardcover_modern, paperback
        this.dimensions = config.dimensions;
        this.usesPdfPreviewAsCover = config.usesPdfPreviewAsCover; // Für zukünftige Erweiterungen
        this.pdfPreviewUrl = config.pdfPreviewUrl; // Für zukünftige Erweiterungen
        // Dynamische Werte zur Laufzeit
        this.spineWidth = config.spineWidth;
        this.initialData = config.initialData || {};
        this.availableTemplates = [];
        this.svgDoc = null;
        this.svgNode = null;
        this.svgContainer = null;
        this.colorPairs = [];
        this.initialTransforms = {};
        this.isTemplateSelectorOpen = false;
        this.uiState = {
            currentTemplateIndex: this.initialData.templateIndex || 0,
            textInputs: { ...this.initialData.textInputs },
            logoInputs: { ...this.initialData.logoInputs },
            selectedColorPairIndex: this.initialData.selectedColorPairIndex || 0,
        };

        this.zoomLevel = 1;
        this.pan = { x: 0, y: 0 };
        this.isPanning = false;
        this.startPan = { x: 0, y: 0 };
        this._lastPinchDistance = null;
        this._applyDebounceTimer = null;
        /** @type {AbortController | null} Nur für exklusives Akkordeon (toggle-Listener), pro UI-Aufbau neu. */
        this._accordionExclusiveAbort = null;
        this._fitGeneration = {};
        this._thumbnailsLoaded = false;
        this._thumbnailsLoadingPromise = null;

        this._init();
    }

    async _init() {
        this.bodyElement.innerHTML = `
            <div class="hardcover-editor-container">
                <div class="editor-preview-panel">
                    <div class="editor-header-controls">
                        <button type="button" id="hce-prev-template" class="btn btn-icon btn-icon-nav" title="Vorheriges Design" aria-label="Vorheriges Design">${HCE_ICON.chevronLeft()}</button>
                        <div class="template-selector-wrapper">
                            <button type="button" id="hce-template-title-btn" class="template-title-btn">Lade...</button>
                            <div id="hce-template-selector-dropdown" class="template-selector-dropdown"></div>
                        </div>
                        <button type="button" id="hce-next-template" class="btn btn-icon btn-icon-nav" title="Nächstes Design" aria-label="Nächstes Design">${HCE_ICON.chevronRight()}</button>
                    </div>
                    <div id="hce-svg-container" class="svg-container" role="img" aria-label="Vorschau Buchdecke"></div>
                    <div class="preview-footer">
                        <div class="preview-footer-section preview-footer-colors">
                            <span class="preview-footer-label">Farben</span>
                            <div id="hce-color-palette-container" class="color-palette-container"></div>
                        </div>
                        <div class="preview-footer-section preview-footer-zoom">
                            <span class="preview-footer-label">Ansicht</span>
                            <div id="hce-zoom-controls" class="zoom-controls"></div>
                        </div>
                    </div>
                </div>
                <div id="hce-controls-panel" class="editor-controls-panel">
                    <div class="editor-controls-panel-head">
                        <h3 class="editor-controls-panel-title">Eingaben</h3>
                        <p class="editor-controls-panel-subtitle">Texte, Logos und Farben</p>
                    </div>
                    <div id="hce-controls-scroll" class="editor-controls-panel-body"></div>
                </div>
            </div>`;

        this.svgContainer = this.bodyElement.querySelector('#hce-svg-container');
        const ls = { signal: this._abortController.signal };
        this.bodyElement.querySelector('#hce-prev-template').addEventListener('click', () => this._selectTemplateByOffset(-1), ls);
        this.bodyElement.querySelector('#hce-next-template').addEventListener('click', () => this._selectTemplateByOffset(1), ls);
        this.bodyElement.querySelector('#hce-template-title-btn').addEventListener('click', () => this._toggleTemplateSelector(), ls);

        this._setupZoomControls();

        try {
            await this._fetchTemplateList();
            if (this.availableTemplates.length === 0) throw new Error(this.templateSource === 'supabase' ? "Keine Templates in Supabase für diese Gruppe. Bitte im Dashboard unter Einstellungen → Templates welche hochladen." : "Keine Templates im Manifest gefunden.");
            this._setupTemplateSelector();
            if (this.uiState.currentTemplateIndex >= this.availableTemplates.length) {
                this.uiState.currentTemplateIndex = 0;
            }
            const initialTemplate = this.availableTemplates[this.uiState.currentTemplateIndex];
            await this._loadTemplate(initialTemplate);
            this._updateEditorTitle();
        } catch (error) {
            console.error("Fehler bei der Initialisierung des HardcoverEditors:", error);
            this.bodyElement.querySelector('#hce-template-title-btn').textContent = 'Fehler!';
            this.svgContainer.innerHTML = `<p class="error" style="color: red; padding: 1rem;">${error.message}</p>`;
        }
    }

    _setupZoomControls() {
        const zoomControlsContainer = this.bodyElement.querySelector('#hce-zoom-controls');
        zoomControlsContainer.innerHTML = `
            <button type="button" id="hce-zoom-out" class="btn btn-icon btn-zoom" title="Herauszoomen" aria-label="Herauszoomen">${HCE_ICON.minus()}</button>
            <button type="button" id="hce-zoom-reset" class="btn btn-icon btn-zoom" title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen">${HCE_ICON.rotateCcw()}</button>
            <button type="button" id="hce-zoom-in" class="btn btn-icon btn-zoom" title="Hineinzoomen" aria-label="Hineinzoomen">${HCE_ICON.plus()}</button>
        `;
        const ls = { signal: this._abortController.signal };
        this.bodyElement.querySelector('#hce-zoom-in').addEventListener('click', () => this._zoom(1), ls);
        this.bodyElement.querySelector('#hce-zoom-out').addEventListener('click', () => this._zoom(-1), ls);
        this.bodyElement.querySelector('#hce-zoom-reset').addEventListener('click', () => this._resetZoomAndPan(), ls);

        this.svgContainer.addEventListener('mousedown', (e) => this._onPanStart(e), ls);
        this.svgContainer.addEventListener('mousemove', (e) => this._onPanMove(e), ls);
        this.svgContainer.addEventListener('mouseup', () => this._onPanEnd(), ls);
        this.svgContainer.addEventListener('mouseleave', () => this._onPanEnd(), ls);

        const touchWheel = { ...ls, passive: false };
        this.svgContainer.addEventListener('touchstart', (e) => this._onTouchStart(e), touchWheel);
        this.svgContainer.addEventListener('touchmove', (e) => this._onTouchMove(e), touchWheel);
        this.svgContainer.addEventListener('touchend', () => this._onPanEnd(), ls);
        this.svgContainer.addEventListener('touchcancel', () => this._onPanEnd(), ls);

        this.svgContainer.addEventListener('wheel', (e) => this._onWheel(e), touchWheel);
    }

    async _fetchTemplateList() {
        if (this.templateSource === 'supabase') {
            const { url: baseUrl, anonKey } = await getSupabaseConfig();
            const groupParam = this.templateGroup ? '?gruppe=' + encodeURIComponent(this.templateGroup) : '';
            const response = await fetch(baseUrl + '/functions/v1/get-cover-templates' + groupParam, {
                headers: {
                    'Authorization': 'Bearer ' + anonKey,
                    'apikey': anonKey,
                },
            });
            if (!response.ok) throw new Error("Template-Liste von Supabase konnte nicht geladen werden.");
            const data = await response.json();
            this.availableTemplates = data.templates || [];
            return;
        }
        const manifestUrl = `${this.templatePath}templates.json?t=${new Date().getTime()}`;
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error("templates.json konnte nicht geladen werden.");
        const manifest = await response.json();
        this.availableTemplates = manifest.templates;
    }

    _setupTemplateSelector() {
        const dropdown = this.bodyElement.querySelector('#hce-template-selector-dropdown');
        dropdown.innerHTML = '';
        this._thumbnailsLoaded = false;
        this._thumbnailsLoadingPromise = null;

        const ls = { signal: this._abortController.signal };

        this.availableTemplates.forEach((template, index) => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.dataset.index = String(index);

            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'template-item-thumb';
            thumbContainer.innerHTML = '<span class="template-thumb-placeholder">…</span>';
            item.appendChild(thumbContainer);

            const name = document.createElement('span');
            name.textContent = template.name;
            item.appendChild(name);

            item.addEventListener('click', () => {
                this._selectTemplateByIndex(index);
                this._toggleTemplateSelector(false);
            }, ls);

            dropdown.appendChild(item);
        });
    }

    async _ensureTemplateThumbnailsLoaded() {
        if (this._thumbnailsLoaded) return;
        if (this._thumbnailsLoadingPromise) return this._thumbnailsLoadingPromise;

        const dropdown = this.bodyElement.querySelector('#hce-template-selector-dropdown');
        const items = dropdown.querySelectorAll('.template-item');

        this._thumbnailsLoadingPromise = (async () => {
            await Promise.all(
                this.availableTemplates.map(async (template, index) => {
                    const item = items[index];
                    if (!item) return;
                    const thumbContainer = item.querySelector('.template-item-thumb');
                    if (!thumbContainer) return;
                    try {
                        const svgUrl = template.url || `${this.templatePath}${template.file}?t=${new Date().getTime()}`;
                        const response = await fetch(svgUrl);
                        const svgText = await response.text();
                        const thumbnailUrl = await generateU1Thumbnail(svgText, this.dimensions, this.spineWidth, 120);
                        thumbContainer.innerHTML = `<img src="${thumbnailUrl}" alt="${template.name}">`;
                    } catch (e) {
                        thumbContainer.innerHTML = `<span>Vorschau<br>fehlerhaft</span>`;
                        console.error(`Konnte Thumbnail für ${template.file} nicht erstellen`, e);
                    }
                })
            );
            this._thumbnailsLoaded = true;
        })();

        return this._thumbnailsLoadingPromise;
    }

    _toggleTemplateSelector(forceState) {
        const dropdown = this.bodyElement.querySelector('#hce-template-selector-dropdown');
        this.isTemplateSelectorOpen = typeof forceState !== 'undefined' ? forceState : !this.isTemplateSelectorOpen;
        dropdown.classList.toggle('is-open', this.isTemplateSelectorOpen);
        if (this.isTemplateSelectorOpen) {
            this._ensureTemplateThumbnailsLoaded().catch((e) => console.warn('Thumbnails:', e));
        }
    }

    _selectTemplateByOffset(offset) {
        let newIndex = this.uiState.currentTemplateIndex + offset;
        if (newIndex < 0) newIndex = this.availableTemplates.length - 1;
        if (newIndex >= this.availableTemplates.length) newIndex = 0;
        this._selectTemplateByIndex(newIndex);
    }

    async _selectTemplateByIndex(index) {
        if (index === this.uiState.currentTemplateIndex) return;
        
        this.uiState.currentTemplateIndex = index;

        this.svgContainer.classList.add('is-loading');
        await this._sleep(EDITOR_BEHAVIOR_CONFIG.FADE_DURATION);

        const template = this.availableTemplates[index];
        await this._loadTemplate(template);

        this.svgContainer.classList.remove('is-loading');
    }

    async _loadTemplate(templateOrFileName) {
        this.svgContainer.innerHTML = '';
        const template = typeof templateOrFileName === 'object' && templateOrFileName && templateOrFileName.file
            ? templateOrFileName
            : { file: templateOrFileName, name: templateOrFileName };
        const fileName = template.file;
        const url = (this.templateSource === 'supabase' && template.url) ? template.url : `${this.templatePath}${fileName}?t=${new Date().getTime()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Template ${fileName} konnte nicht geladen werden.`);
        const svgText = await response.text();
        const parser = new DOMParser();
        this.svgDoc = parser.parseFromString(svgText, "image/svg+xml");

        const parserError = this.svgDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            console.error("Parser Error:", parserError[0].textContent);
            throw new Error(`Fehler beim Parsen von ${fileName}.`);
        }

        this.svgNode = this.svgDoc.documentElement;
        this.svgNode.removeAttribute('width');
        this.svgNode.removeAttribute('height');
        this.svgContainer.appendChild(this.svgNode);
        
        await document.fonts.ready;

        await this._loadPaletteFromSupabase(fileName);
        this._storeInitialTransforms();
        this._createUiFromSvg();
        this._applyStateToSvg(); 
        this._resetZoomAndPan(); 
    }

    /**
     * Lädt Farbpalette aus Supabase (cover_templates → cover_template_paletten → cover_farbpaare).
     * Jedes Farbpaar ist eine atomare Einheit mit color1 und color2.
     */
    async _loadPaletteFromSupabase(templateFileName) {
        this.colorPairs = [];
        try {
            const { getSupabaseClient } = await import('./supabaseClient.mjs');
            const supabase = await getSupabaseClient();

            // 1. Template-ID anhand des Dateinamens ermitteln
            const { data: template } = await supabase
                .from('cover_templates')
                .select('id')
                .eq('filename', templateFileName)
                .maybeSingle();

            if (!template?.id) return;

            // 2. Zugewiesene Farbpaare für dieses Template laden (mit Farbdaten)
            const { data: assignments } = await supabase
                .from('cover_template_paletten')
                .select('sort_order, cover_farbpaare(id, name, color1_name, color1_rgb, color2_name, color2_rgb)')
                .eq('template_id', template.id)
                .order('sort_order', { ascending: true });

            this.colorPairs = (assignments ?? [])
                .map((a) => a.cover_farbpaare)
                .filter(Boolean)
                .map((fp) => ({
                    id:     fp.id,
                    name:   fp.name || 'Farbpaar',
                    color1: fp.color1_rgb  || '#888888',
                    name1:  fp.color1_name || 'Farbe 1',
                    color2: fp.color2_rgb  || '#cccccc',
                    name2:  fp.color2_name || 'Farbe 2',
                }));
        } catch (e) {
            console.warn('Palette aus Supabase konnte nicht geladen werden:', e.message);
        }
    }
    
    _storeInitialTransforms() {
        this.initialTransforms = {};
        this.svgNode.querySelectorAll('[id^="tpl-"]').forEach(el => {
            this.initialTransforms[el.id] = el.getAttribute('transform') || '';
        });
    }

    _createUiFromSvg() {
        if (this._accordionExclusiveAbort) {
            this._accordionExclusiveAbort.abort();
        }
        this._accordionExclusiveAbort = new AbortController();
        const accSignal = this._accordionExclusiveAbort.signal;

        const controlsScroll = this.bodyElement.querySelector('#hce-controls-scroll');
        const colorPaletteContainer = this.bodyElement.querySelector('#hce-color-palette-container');
        controlsScroll.innerHTML = '';
        colorPaletteContainer.innerHTML = '';
        this._createTextInputs(controlsScroll);
        this._createLogoInputs(controlsScroll);
        this._createColorPalettes(colorPaletteContainer);

        // Nur ein Akkordeon gleichzeitig offen (klassisches Accordion).
        // Wichtig: `toggle` auf <details> blubbert nicht → Listener müssen am jeweiligen Element sitzen.
        this._bindExclusiveAccordions(controlsScroll, accSignal);
    }

    /**
     * Schließt alle anderen `.accordion`-Details, sobald eines geöffnet wird.
     * @param {HTMLElement} scrollContainer
     * @param {AbortSignal} signal
     */
    _bindExclusiveAccordions(scrollContainer, signal) {
        scrollContainer.querySelectorAll('details.accordion').forEach((details) => {
            details.addEventListener('toggle', () => {
                if (!details.open) return;
                scrollContainer.querySelectorAll('details.accordion').forEach((other) => {
                    if (other !== details) other.open = false;
                });
            }, { signal });
        });
    }

    _createTextInputs(panel) {
        const allTextElements = Array.from(this.svgNode.querySelectorAll('text[id^="tpl-"]'));
        if (allTextElements.length === 0) return;

        const accordionGroups = {
            front: { title: 'Beschriftung Vorderseite', elements: [], isOpen: true },
            spine: { title: 'Beschriftung Buchrücken', elements: [], isOpen: false }
        };

        allTextElements.forEach(el => {
            if (el.closest('#tpl-group-u1')) {
                accordionGroups.front.elements.push(el);
            } else if (el.closest('#tpl-group-spine')) {
                accordionGroups.spine.elements.push(el);
            }
        });

        Object.values(accordionGroups).forEach(group => {
            if (group.elements.length > 0) {
                this._createAccordionGroup(panel, group.title, group.elements, group.isOpen);
            }
        });
    }

    _createAccordionGroup(panel, title, elements, isOpen) {
        const ls = { signal: this._abortController.signal };
        const details = document.createElement('details');
        details.className = 'accordion';
        details.open = isOpen;
        const summary = document.createElement('summary');
        summary.textContent = title;
        details.appendChild(summary);
        const content = document.createElement('div');
        content.className = 'accordion-content';
        details.appendChild(content);

        elements.forEach(el => {
            const explicitLabel = (el.getAttribute('data-label') || '').trim();
            const fallbackLabel = el.id.replace('tpl-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const labelText = explicitLabel || fallbackLabel;
            const fieldWrapper = document.createElement('div');
            fieldWrapper.className = 'form-field';

            const labelEl = document.createElement('label');
            labelEl.htmlFor = `hce-input-${el.id}`;
            labelEl.textContent = labelText;
            fieldWrapper.appendChild(labelEl);

            const isMultiline = el.dataset.multiline === 'true';
            const maxLines = parseInt(el.dataset.maxLines, 10) || 0;
            let input;

            if (isMultiline) {
                input = document.createElement('textarea');
                input.rows = maxLines > 1 ? Math.min(maxLines, 3) : 2;
                if (maxLines > 0) {
                    input.addEventListener('input', () => {
                        const lines = input.value.split('\n');
                        if (lines.length > maxLines) {
                            input.value = lines.slice(0, maxLines).join('\n');
                        }
                    }, ls);
                }
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }

            input.className = 'form-input';
            input.id = `hce-input-${el.id}`;
            input.placeholder = labelText;

            let initialText = this.uiState.textInputs[el.id];
            if (typeof initialText === 'undefined') {
                const tspans = Array.from(el.querySelectorAll('tspan'));
                if (tspans.length > 0) {
                    initialText = tspans.map(t => t.textContent).join('\n');
                } else {
                    initialText = el.textContent.trim();
                }
            }
            input.value = initialText;
            
            this.uiState.textInputs[el.id] = initialText; 

            input.addEventListener('input', () => {
                this.uiState.textInputs[el.id] = input.value;
                this._scheduleApply();
            }, ls);

            fieldWrapper.appendChild(input);
            content.appendChild(fieldWrapper);
        });
        panel.appendChild(details);
    }
    
    _createLogoInputs(panel) {
        const logoPlaceholders = Array.from(this.svgNode.querySelectorAll('rect[id^="tpl-logo"]'));
        if (logoPlaceholders.length === 0) return;

        const ls = { signal: this._abortController.signal };
        const details = document.createElement('details');
        details.className = 'accordion';
        details.open = false;
        const summary = document.createElement('summary');
        summary.textContent = 'Logos & Bilder';
        details.appendChild(summary);
        const content = document.createElement('div');
        content.className = 'accordion-content';
        details.appendChild(content);

        logoPlaceholders.forEach(placeholder => {
            const logoId = placeholder.id;
            const fieldWrapper = document.createElement('div');
            fieldWrapper.className = 'form-field form-field-logo';
            fieldWrapper.id = `hce-logo-controls-${logoId}`;

            const explicitLabel = (placeholder.getAttribute('data-label') || '').trim();
            const fallbackLabel = `Logo ${logoId.replace('tpl-logo', '')}`;
            const labelText = explicitLabel || fallbackLabel;
            fieldWrapper.dataset.label = labelText;
            
            const inputContainer = document.createElement('div');
            inputContainer.className = 'logo-input-container';

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = `hce-input-${logoId}`;
            fileInput.accept = "image/svg+xml, image/png, image/jpeg";
            fileInput.style.display = 'none';

            const uploadButton = document.createElement('button');
            uploadButton.className = 'btn btn-secondary btn-upload';
            uploadButton.textContent = `${labelText} hochladen...`;
            uploadButton.addEventListener('click', () => fileInput.click(), ls);

            const removeButton = document.createElement('button');
            removeButton.className = 'btn-remove-logo';
            removeButton.innerHTML = '&times;';
            removeButton.title = 'Logo entfernen';
            removeButton.style.display = 'none';

            inputContainer.appendChild(fileInput);
            inputContainer.appendChild(uploadButton);
            inputContainer.appendChild(removeButton);

            fieldWrapper.appendChild(inputContainer);
            
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'logo-controls-wrapper';
            
            const previewArea = document.createElement('div');
            previewArea.className = 'logo-preview-area';
            previewArea.innerHTML = `
                <div class="logo-preview-container"></div>
                <div class="logo-position-controls">
                    <button class="btn-move" data-direction="up" title="Nach oben">↑</button>
                    <button class="btn-move" data-direction="left" title="Nach links">←</button>
                    <button class="btn-move" data-direction="right" title="Nach rechts">→</button>
                    <button class="btn-move" data-direction="down" title="Nach unten">↓</button>
                </div>
            `;

            const sliderWrapper = document.createElement('div');
            sliderWrapper.className = 'logo-slider-wrapper';
            const sliderLabel = document.createElement('label');
            sliderLabel.textContent = 'Größe anpassen';
            sliderLabel.htmlFor = `hce-slider-${logoId}`;
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = `hce-slider-${logoId}`;
            slider.min = EDITOR_BEHAVIOR_CONFIG.LOGO_MANUAL_SCALE_MIN;
            slider.max = EDITOR_BEHAVIOR_CONFIG.LOGO_MANUAL_SCALE_MAX;
            slider.step = '0.05';
            slider.value = '1';
            sliderWrapper.appendChild(sliderLabel);
            sliderWrapper.appendChild(slider);
            
            controlsWrapper.appendChild(previewArea);
            controlsWrapper.appendChild(sliderWrapper);
            fieldWrapper.appendChild(controlsWrapper);
            
            content.appendChild(fieldWrapper);

            fileInput.addEventListener('change', (e) => this._handleLogoUpload(e, logoId), ls);
            removeButton.addEventListener('click', () => this._removeLogo(logoId), ls);
            slider.addEventListener('input', (e) => {
                if (this.uiState.logoInputs[logoId]) {
                    this.uiState.logoInputs[logoId].manualScale = parseFloat(e.target.value);
                    this._applyStateToSvg();
                }
            }, ls);
            previewArea.querySelector('.logo-position-controls').addEventListener('click', (e) => {
                const button = e.target.closest('.btn-move');
                if (button) {
                    this._moveLogo(logoId, button.dataset.direction);
                }
            }, ls);
            
            if(this.uiState.logoInputs[logoId]) {
                this._updateLogoControlUI(logoId, this.uiState.logoInputs[logoId].fileName);
            }
        });

        panel.appendChild(details);
    }
    
    /**
     * Baut die Farbpaletten-Buttons ausschließlich aus this.colorPairs (aus Supabase).
     * SVG-Farbfelder (pal-p) werden nicht mehr ausgewertet.
     */
    _createColorPalettes(container) {
        if (!this.colorPairs || this.colorPairs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'hce-color-palette-empty';
            empty.textContent = 'Keine Farben hinterlegt. Zuweisung im Dashboard prüfen oder Verbindung testen.';
            container.appendChild(empty);
            return;
        }
        if (this.uiState.selectedColorPairIndex >= this.colorPairs.length) this.uiState.selectedColorPairIndex = 0;
        const ls = { signal: this._abortController.signal };
        this.colorPairs.forEach((pair, index) => {
            const btn = document.createElement('button');
            btn.className = 'color-pair-button';
            btn.title = `${pair.name1} / ${pair.name2}`;
            btn.style.background = `linear-gradient(45deg, ${pair.color1} 50%, ${pair.color2} 50%)`;
            if (index === this.uiState.selectedColorPairIndex) btn.classList.add('active');
            btn.addEventListener('click', () => {
                this.uiState.selectedColorPairIndex = index;
                container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._applyStateToSvg();
            }, ls);
            container.appendChild(btn);
        });
    }

    _zoom(direction) {
        this.zoomLevel += direction * EDITOR_BEHAVIOR_CONFIG.ZOOM_STEP;
        this.zoomLevel = Math.max(EDITOR_BEHAVIOR_CONFIG.MIN_ZOOM, Math.min(EDITOR_BEHAVIOR_CONFIG.MAX_ZOOM, this.zoomLevel));
        this._updateSvgTransform();
    }

    _resetZoomAndPan() {
        this.zoomLevel = 1;
        this.pan = { x: 0, y: 0 };
        this._updateSvgTransform();
    }

    _onPanStart(e) {
        e.preventDefault();
        this.isPanning = true;
        this.startPan.x = e.clientX - this.pan.x;
        this.startPan.y = e.clientY - this.pan.y;
        this.svgContainer.classList.add('panning');
    }

    _onPanMove(e) {
        if (!this.isPanning) return;
        e.preventDefault();
        this.pan.x = e.clientX - this.startPan.x;
        this.pan.y = e.clientY - this.startPan.y;
        this._updateSvgTransform();
    }

    _onPanEnd() {
        this.isPanning = false;
        this._lastPinchDistance = null;
        this.svgContainer.classList.remove('panning');
    }

    _onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const t = e.touches[0];
            this.isPanning = true;
            this.startPan.x = t.clientX - this.pan.x;
            this.startPan.y = t.clientY - this.pan.y;
            this.svgContainer.classList.add('panning');
        } else if (e.touches.length === 2) {
            e.preventDefault();
            this._lastPinchDistance = this._getPinchDistance(e.touches);
        }
    }

    _onTouchMove(e) {
        if (e.touches.length === 2 && this._lastPinchDistance != null) {
            e.preventDefault();
            const dist = this._getPinchDistance(e.touches);
            const delta = dist - this._lastPinchDistance;
            if (Math.abs(delta) > 2) {
                this._zoom(delta > 0 ? 1 : -1);
                this._lastPinchDistance = dist;
            }
            return;
        }
        if (!this.isPanning || e.touches.length !== 1) return;
        e.preventDefault();
        const t = e.touches[0];
        this.pan.x = t.clientX - this.startPan.x;
        this.pan.y = t.clientY - this.startPan.y;
        this._updateSvgTransform();
    }

    _getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    _onWheel(e) {
        e.preventDefault();
        this._zoom(e.deltaY < 0 ? 1 : -1);
    }

    _updateSvgTransform() {
        if (!this.svgNode) return;
        this.svgNode.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoomLevel})`;
    }

    async _handleLogoUpload(event, logoId) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = e.target.result;
            const logoData = {
                id: logoId,
                fileName: file.name,
                type: file.type,
                content: data,
                manualScale: 1.0,
                offsetX: 0,
                offsetY: 0
            };
            
            if (file.type.includes('svg')) {
                const { width, height } = await this._getSvgDimensions(data);
                logoData.width = width;
                logoData.height = height;
            } else {
                 const { width, height } = await this._getRasterImageDimensions(data);
                 logoData.width = width;
                 logoData.height = height;
            }

            this.uiState.logoInputs[logoId] = logoData;
            this._updateLogoControlUI(logoId, file.name);
            this._applyStateToSvg();
        };

        if (file.type.includes('svg')) {
            reader.readAsText(file);
        } else if (file.type.includes('image')) {
            reader.readAsDataURL(file);
        }
    }

    _removeLogo(logoId) {
        delete this.uiState.logoInputs[logoId];
        this._updateLogoControlUI(logoId, null);
        this._applyStateToSvg();
    }
    
    _moveLogo(logoId, direction) {
        if (!this.uiState.logoInputs[logoId]) return;

        const logoData = this.uiState.logoInputs[logoId];
        logoData.offsetX = logoData.offsetX || 0;
        logoData.offsetY = logoData.offsetY || 0;

        const moveStep = EDITOR_BEHAVIOR_CONFIG.LOGO_MOVE_STEP;
        switch (direction) {
            case 'up':    logoData.offsetY -= moveStep; break;
            case 'down':  logoData.offsetY += moveStep; break;
            case 'left':  logoData.offsetX -= moveStep; break;
            case 'right': logoData.offsetX += moveStep; break;
        }
        this._applyStateToSvg();
    }

    _updateLogoControlUI(logoId, fileName) {
        const controls = this.bodyElement.querySelector(`#hce-logo-controls-${logoId}`);
        if (!controls) return;
        
        const uploadButton = controls.querySelector('.btn-upload');
        const removeButton = controls.querySelector('.btn-remove-logo');
        const controlsWrapper = controls.querySelector('.logo-controls-wrapper');
        const previewContainer = controls.querySelector('.logo-preview-container');
        const slider = controls.querySelector('input[type="range"]');

        const baseLabel = (controls.dataset.label || '').trim() || `Logo ${logoId.replace('tpl-logo', '')}`;

        if (fileName) {
            uploadButton.textContent = fileName;
            removeButton.style.display = 'inline-block';
            controlsWrapper.style.display = 'flex';
            slider.value = this.uiState.logoInputs[logoId]?.manualScale || 1;
            
            const logoData = this.uiState.logoInputs[logoId];
            const previewSrc = logoData.type.includes('svg') 
                ? `data:image/svg+xml;utf8,${encodeURIComponent(logoData.content)}` 
                : logoData.content;
            previewContainer.innerHTML = `<img src="${previewSrc}" alt="Vorschau"/>`;

        } else {
            uploadButton.textContent = `${baseLabel} hochladen...`;
            removeButton.style.display = 'none';
            controlsWrapper.style.display = 'none';
            previewContainer.innerHTML = '';
            slider.value = 1;
        }
    }
    
    _getSvgDimensions(svgText) {
        return new Promise((resolve) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svg = doc.documentElement;
            if (svg.hasAttribute('viewBox')) {
                const viewBox = svg.getAttribute('viewBox').split(/[ ,]+/);
                resolve({ width: parseFloat(viewBox[2]), height: parseFloat(viewBox[3]) });
            } else {
                resolve({ width: parseFloat(svg.getAttribute('width')), height: parseFloat(svg.getAttribute('height')) });
            }
        });
    }

    _getRasterImageDimensions(base64Data) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.src = base64Data;
        });
    }

    _applyStateToSvg() {
        if (!this.svgNode) return;
        this._applyTexts();
        this._applyColors();
        this._updateLogos();
        this._updateSpineAndLayout();
        this._updateEditorTitle();
    }

    _applyTexts() {
        this.svgNode.querySelectorAll('text[id^="tpl-"]').forEach(textElement => {
            const id = textElement.id;
            const hasAdvancedFeatures = textElement.dataset.multiline === 'true' || this.svgNode.querySelector(`#${id}_bbox`);
            if (hasAdvancedFeatures) this._updateAdvancedText(id);
            else this._updateSimpleText(id);
        });
    }

    _applyColors() {
        const activePair = this.colorPairs[this.uiState.selectedColorPairIndex];
        if (!activePair) return;
        this.svgNode.querySelectorAll('[data-color-role="color-1"]').forEach(el => this._applyColorToElement(el, activePair.color1));
        this.svgNode.querySelectorAll('[data-color-role="color-2"]').forEach(el => this._applyColorToElement(el, activePair.color2));
    }

    _applyColorToElement(el, color) {
        this._setColorOnNode(el, color);
        el.querySelectorAll('*').forEach(desc => {
            if (desc.hasAttribute('data-color-role')) return;
            if (this._isExplicitWhite(desc)) return;
            this._setColorOnNode(desc, color);
        });
    }

    _setColorOnNode(node, color) {
        node.setAttribute('fill', color);
        const style = node.getAttribute('style') || '';
        let newStyle = style.replace(/fill\s*:\s*[^;]+/gi, '').replace(/;\s*;/g, ';').replace(/^;|;$/g, '').trim();
        newStyle = (newStyle ? newStyle + '; ' : '') + 'fill: ' + color;
        if (node.getAttribute('stroke-width') != null || node.getAttribute('stroke') !== null) {
            node.setAttribute('stroke', color);
            newStyle += '; stroke: ' + color;
        }
        node.setAttribute('style', newStyle);
    }

    _isExplicitWhite(node) {
        const fill = (node.getAttribute('fill') || '').trim().toLowerCase();
        const style = node.getAttribute('style') || '';
        const fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
        const styleFill = (fillMatch && fillMatch[1]) ? fillMatch[1].trim().toLowerCase() : '';
        const effective = fill || styleFill;
        return effective === '#ffffff' || effective === '#fff' || effective === 'white' || effective === 'rgb(255,255,255)' || effective === 'rgb(255, 255, 255)';
    }
    
    _updateLogos() {
        const logoPlaceholders = this.svgNode.querySelectorAll('rect[id^="tpl-logo"]');
        logoPlaceholders.forEach(placeholder => {
            const wrapperId = `${placeholder.id}-wrapper`;
            const existingWrapper = this.svgNode.querySelector(`#${wrapperId}`);
            if (existingWrapper) {
                existingWrapper.remove();
            }
        });

        for (const logoId in this.uiState.logoInputs) {
            const logoData = this.uiState.logoInputs[logoId];
            if (!logoData || !logoData.content) continue;
            
            const placeholder = this.svgNode.querySelector(`#${logoId}`);
            if (!placeholder) continue;

            const pbox = placeholder.getBBox();
            const logoWidth = logoData.width || 1;
            const logoHeight = logoData.height || 1;
            
            const wrapperGroup = document.createElementNS("http://www.w3.org/2000/svg", 'g');
            wrapperGroup.id = `${logoId}-wrapper`;

            if (logoData.type.includes('svg')) {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(logoData.content, "image/svg+xml");
                const importedSvg = svgDoc.documentElement;
                importedSvg.removeAttribute('width');
                importedSvg.removeAttribute('height');
                wrapperGroup.appendChild(importedSvg);
            } else {
                const imageElement = document.createElementNS("http://www.w3.org/2000/svg", 'image');
                imageElement.setAttributeNS('http://www.w3.org/1999/xlink', 'href', logoData.content);
                imageElement.setAttribute('width', logoWidth);
                imageElement.setAttribute('height', logoHeight);
                wrapperGroup.appendChild(imageElement);
            }
            
            const scaleX = pbox.width / logoWidth;
            const scaleY = pbox.height / logoHeight;
            const baseScale = Math.min(scaleX, scaleY);
            const manualScale = logoData.manualScale || 1.0;
            const finalScale = baseScale * manualScale;

            const newWidth = logoWidth * finalScale;
            const newHeight = logoHeight * finalScale;

            const offsetX = logoData.offsetX || 0;
            const offsetY = logoData.offsetY || 0;

            const translateX = pbox.x + (pbox.width - newWidth) / 2 + offsetX;
            const translateY = pbox.y + (pbox.height - newHeight) / 2 + offsetY;

            wrapperGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${finalScale})`);
            
            placeholder.parentNode.insertBefore(wrapperGroup, placeholder.nextSibling);
        }
    }
    
    _updateSimpleText(elementId) {
        const textElement = this.svgNode.querySelector(`#${elementId}`);
        if (!textElement) return;

        const newText = this.uiState.textInputs[elementId] || ' ';
        const tspan = textElement.querySelector('tspan');

        if (tspan) {
            tspan.textContent = newText;
        } else {
            textElement.textContent = newText;
        }
    }

    _updateAdvancedText(elementId) {
        const textElement = this.svgNode.querySelector(`#${elementId}`);
        if (!textElement) return;

        textElement.setAttribute('transform', this.initialTransforms[elementId] || '');

        let masterTspanTemplate = textElement.querySelector('tspan');
        if (!masterTspanTemplate) {
            textElement.textContent = ''; 
            masterTspanTemplate = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            if (textElement.getAttribute('x')) masterTspanTemplate.setAttribute('x', textElement.getAttribute('x'));
            textElement.appendChild(masterTspanTemplate);
        }
        
        while(masterTspanTemplate.querySelector('tspan')) {
            masterTspanTemplate = masterTspanTemplate.querySelector('tspan');
        }
        
        this._removeTextWarning(elementId);
        
        const rawText = this.uiState.textInputs[elementId] || ''; 
        const lines = rawText.split('\n');
        
        const masterX = masterTspanTemplate.getAttribute('x');

        textElement.innerHTML = ''; 

        lines.forEach((line, index) => {
            const newTspan = masterTspanTemplate.cloneNode(true);
            newTspan.textContent = line || ' ';

            newTspan.setAttribute('x', masterX);

            if (index > 0) {
                newTspan.removeAttribute('y');
                newTspan.setAttribute('dy', '1.2em');
            } else {
                newTspan.removeAttribute('dy');
            }
            
            textElement.appendChild(newTspan);
        });

        const bbox = this.svgNode.querySelector(`#${elementId}_bbox`);
        if (bbox) {
            this._fitTextToBbox(textElement, bbox);
        }
    }

    async _fitTextToBbox(textElement, bbox) {
        const id = textElement.id;
        const gen = (this._fitGeneration[id] || 0) + 1;
        this._fitGeneration[id] = gen;

        textElement.setAttribute('transform', this.initialTransforms[id] || '');
        this._removeTextWarning(id);
        
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (this._fitGeneration[id] !== gen) return;
    
        const bboxWidth = bbox.getBoundingClientRect().width;
        const textWidth = textElement.getBoundingClientRect().width;
    
        if (textWidth <= bboxWidth) return;
    
        let scale = bboxWidth / textWidth;

        if (scale < EDITOR_BEHAVIOR_CONFIG.TEXT_FIT_MIN_SCALE) {
            this._createTextWarning(textElement, 'Eingabe zu lang');
            scale = EDITOR_BEHAVIOR_CONFIG.TEXT_FIT_MIN_SCALE;
        }

        const textBBox = textElement.getBBox();
        const cx = textBBox.x + textBBox.width / 2;
        const cy = textBBox.y + textBBox.height / 2;
        textElement.setAttribute('transform', `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`);
    }
    
    _createTextWarning(textElement, message) {
        this._removeTextWarning(textElement.id);
        const bbox = this.svgNode.querySelector(`#${textElement.id}_bbox`);
        if(!bbox) return; 

        const warningText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        warningText.id = `${textElement.id}_warning`;
        warningText.textContent = message;
        warningText.setAttribute('fill', 'red');
        
        const bboxRect = bbox.getBBox();
        const yPos = bboxRect.y + bboxRect.height + 10;
        const xPos = bboxRect.x + bboxRect.width / 2;
        
        warningText.setAttribute('x', xPos);
        warningText.setAttribute('y', yPos);
        warningText.setAttribute('font-size', '8px');
        warningText.setAttribute('text-anchor', 'middle');
        warningText.setAttribute('font-family', 'Roboto, sans-serif');

        bbox.parentNode.appendChild(warningText);

        const inputEl = this.bodyElement.querySelector(`#hce-input-${textElement.id}`);
        if (inputEl) {
            inputEl.classList.add('has-warning');
            const wrapper = inputEl.closest('.form-field');
            if (wrapper && !wrapper.querySelector('.form-field-hint')) {
                const hint = document.createElement('div');
                hint.className = 'form-field-hint';
                hint.textContent = message;
                wrapper.appendChild(hint);
            }
        }
    }
    
    _removeTextWarning(elementId) {
        const warningElement = this.svgNode.querySelector(`#${elementId}_warning`);
        if (warningElement) {
            warningElement.remove();
        }
        const inputEl = this.bodyElement.querySelector(`#hce-input-${elementId}`);
        if (inputEl) {
            inputEl.classList.remove('has-warning');
            const hint = inputEl.closest('.form-field')?.querySelector('.form-field-hint');
            if (hint) hint.remove();
        }
    }

    _updateSpineAndLayout() {
        if (!this.svgNode) return;
        const groupU1 = this.svgNode.querySelector('#tpl-group-u1');
        const groupU4 = this.svgNode.querySelector('#tpl-group-u4');
        const groupSpine = this.svgNode.querySelector('#tpl-group-spine');
        if (!groupU1 || !groupU4 || !groupSpine) return;

        const initialU1Transform = this.initialTransforms['tpl-group-u1'] || 'translate(0,0)';
        const initialU4Transform = this.initialTransforms['tpl-group-u4'] || 'translate(0,0)';

        const spineW = this.spineWidth;
        const delta = (spineW - EDITOR_BEHAVIOR_CONFIG.DEFAULT_SPINE_WIDTH) / 2.0;
        groupU4.setAttribute('transform', `${initialU4Transform} translate(${-delta}, 0)`);
        groupU1.setAttribute('transform', `${initialU1Transform} translate(${delta}, 0)`);
        const spineBackground = groupSpine.querySelector('rect');
        if (spineBackground) spineBackground.setAttribute('width', spineW);

        const visibleWidth = this.dimensions.u4Width + spineW + this.dimensions.u1Width;
        const startX = this.dimensions.svgCenterX - (spineW / 2) - this.dimensions.u4Width;
        const startY = (this.dimensions.svgTotalHeight - this.dimensions.visibleCoverHeight) / 2;

        this.svgNode.setAttribute('viewBox', `${startX} ${startY} ${visibleWidth} ${this.dimensions.visibleCoverHeight}`);

        this._drawHelperLines();
    }

    _updateEditorTitle() {
        const titleElement = this.bodyElement.querySelector('#hce-template-title-btn');
        if (!titleElement || !this.availableTemplates.length) return;
        const currentTemplate = this.availableTemplates[this.uiState.currentTemplateIndex];
        titleElement.textContent = `Vorlage: ${currentTemplate.name}`;
    }

    _drawHelperLines() {
        if (!this.svgNode) return;
        this._removeHelperLines();

        const spineW = this.spineWidth;
        const topY = 0;
        const bottomY = this.dimensions.svgTotalHeight;
        const center = this.dimensions.svgCenterX;
        const leftSpineX = center - spineW / 2;
        const rightSpineX = center + spineW / 2;
        const falzW = this.dimensions.falzZoneWidth;

        const helperGroup = this._createSvgElement('g', {
            id: 'hce-helper-lines', 'pointer-events': 'none'
        });

        const dashLineAttrs = { stroke: 'rgba(0,0,0,0.5)', 'stroke-width': '0.5', 'stroke-dasharray': '3,3' };

        helperGroup.appendChild(this._createSvgElement('rect', { x: leftSpineX - falzW, y: topY, width: falzW, height: bottomY, fill: 'rgba(0,0,0,0.1)' }));
        helperGroup.appendChild(this._createSvgElement('rect', { x: rightSpineX, y: topY, width: falzW, height: bottomY, fill: 'rgba(0,0,0,0.1)' }));
        helperGroup.appendChild(this._createSvgElement('line', { x1: leftSpineX, y1: topY, x2: leftSpineX, y2: bottomY, ...dashLineAttrs }));
        helperGroup.appendChild(this._createSvgElement('line', { x1: rightSpineX, y1: topY, x2: rightSpineX, y2: bottomY, ...dashLineAttrs }));

        this.svgNode.appendChild(helperGroup);
    }

    _createSvgElement(tag, attrs = {}) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value);
        }
        return el;
    }

    _removeHelperLines() {
        const existingHelpers = this.svgNode.querySelector('#hce-helper-lines');
        if (existingHelpers) {
            existingHelpers.remove();
        }
    }

    _removeAllSvgOverlays() {
        this._removeHelperLines();
        this.svgNode.querySelectorAll('[id$="_warning"]').forEach(el => el.remove());
    }

    async _getFinalResult() {
        this._resetZoomAndPan();
        this._removeAllSvgOverlays();

        const currentTemplate = this.availableTemplates[this.uiState.currentTemplateIndex];
        if (!currentTemplate) throw new Error("Kein Template ausgewählt.");

        const originalViewBox = this.svgNode.getAttribute('viewBox');
        this.svgNode.setAttribute('viewBox', `0 0 ${this.dimensions.svgTotalWidth} ${this.dimensions.svgTotalHeight}`);

        const finalSvgString = new XMLSerializer().serializeToString(this.svgNode);

        if (originalViewBox) {
            this.svgNode.setAttribute('viewBox', originalViewBox);
        } else {
            this._updateSpineAndLayout();
        }

        this._drawHelperLines();

        const thumbnailDataUrl = await generateU1Thumbnail(finalSvgString, this.dimensions, this.spineWidth).catch(err => {
            console.error("Fehler bei Thumbnail-Erstellung:", err);
            return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        });

        return {
            svgString: finalSvgString,
            thumbnailDataUrl: thumbnailDataUrl,
            parameters: {
                templateFile: currentTemplate.file,
                templateDisplayName: currentTemplate.name,
                templateIndex: this.uiState.currentTemplateIndex,
                textInputs: this.uiState.textInputs,
                logoInputs: this.uiState.logoInputs,
                selectedColorPairIndex: this.uiState.selectedColorPairIndex,
                spineWidth: this.spineWidth,
            }
        };
    }

    _destroy() {
        clearTimeout(this._applyDebounceTimer);
        if (this._accordionExclusiveAbort) {
            this._accordionExclusiveAbort.abort();
            this._accordionExclusiveAbort = null;
        }
        this.svgNode = null;
        this.svgDoc = null;
    }

    _scheduleApply(delayMs = 120) {
        clearTimeout(this._applyDebounceTimer);
        this._applyDebounceTimer = setTimeout(() => this._applyStateToSvg(), delayMs);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
