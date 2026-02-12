/**
 * @file HardcoverEditor.mjs
 * Spezialisierter Editor für Hardcover.
 *
 * LUCY'S REFACTOR V13.1 (LOGO PERSISTENCE):
 * - FEATURE: Hochgeladene Logos bleiben nun beim Wechsel zwischen Templates erhalten.
 * - LOGIC: Der `logoInputs`-Zustand wird nicht mehr gelöscht. Die `_updateLogos`-Funktion rendert ein Logo nur, wenn der entsprechende Platzhalter im aktuellen Template existiert.
 */
import { BaseEditor } from './BaseEditor.mjs';
import { generateU1Thumbnail } from './svg-thumbnail-generator.mjs';

// --- CONFIGURATION ---
//const EDITOR_CONFIG = {
    //TEMPLATE_PATH: 'templates/hardcover/',
    // --- BEHAVIOR CONFIGURATION (nicht-dimensionale Werte) ---
    const EDITOR_BEHAVIOR_CONFIG = {
    DEFAULT_SPINE_WIDTH: 35.0,

    //VISIBLE_COVER_HEIGHT: 302.0,
    //U1_WIDTH: 215.0,
    //U4_WIDTH: 215.0,
    //SVG_TOTAL_WIDTH: 500.0,
    //SVG_TOTAL_HEIGHT: 330.0,
    //SVG_CENTER_X: 250.0,
    // FALZ_ZONE_WIDTH: 8.0,
    ZOOM_STEP: 0.2,
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 3,
    FADE_DURATION: 250,
    TEXT_FIT_MIN_SCALE: 0.75, 
    LOGO_MANUAL_SCALE_MIN: 0.5,
    LOGO_MANUAL_SCALE_MAX: 2.0,
    LOGO_MOVE_STEP: 1,
};

export class HardcoverEditor extends BaseEditor {
    constructor(config) {
        super(config, 'Buchdecke gestalten');
        // Konfiguration aus config.json übernehmen
        this.templatePath = config.templatePath;
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

        this._init();
    }

    async _init() {
        this.bodyElement.innerHTML = `
            <div class="hardcover-editor-container">
                <div class="editor-preview-panel">
                    <div class="editor-header-controls">
                        <button id="hce-prev-template" class="btn btn-icon" title="Vorheriges Design">‹</button>
                        <div class="template-selector-wrapper">
                            <button id="hce-template-title-btn" class="template-title-btn">Lade...</button>
                            <div id="hce-template-selector-dropdown" class="template-selector-dropdown"></div>
                        </div>
                        <button id="hce-next-template" class="btn btn-icon" title="Nächstes Design">›</button>
                    </div>
                    <div id="hce-svg-container" class="svg-container"></div>
                    <div class="preview-footer">
                        <div id="hce-color-palette-container" class="color-palette-container"></div>
                        <div id="hce-zoom-controls" class="zoom-controls"></div>
                    </div>
                </div>
                <div id="hce-controls-panel" class="editor-controls-panel"></div>
            </div>`;

        this.svgContainer = this.bodyElement.querySelector('#hce-svg-container');
        this.bodyElement.querySelector('#hce-prev-template').addEventListener('click', () => this._selectTemplateByOffset(-1));
        this.bodyElement.querySelector('#hce-next-template').addEventListener('click', () => this._selectTemplateByOffset(1));
        this.bodyElement.querySelector('#hce-template-title-btn').addEventListener('click', () => this._toggleTemplateSelector());

        this._setupZoomControls();

        try {
            await this._fetchTemplateList();
            if (this.availableTemplates.length === 0) throw new Error("Keine Templates im Manifest gefunden.");
            await this._setupTemplateSelector();
            if (this.uiState.currentTemplateIndex >= this.availableTemplates.length) {
                this.uiState.currentTemplateIndex = 0;
            }
            const initialTemplate = this.availableTemplates[this.uiState.currentTemplateIndex];
            await this._loadTemplate(initialTemplate.file);
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
            <button id="hce-zoom-out" class="btn btn-icon btn-zoom" title="Herauszoomen">-</button>
            <button id="hce-zoom-reset" class="btn btn-icon btn-zoom" title="Zoom zurücksetzen">⟲</button>
            <button id="hce-zoom-in" class="btn btn-icon btn-zoom" title="Hineinzoomen">+</button>
        `;
        this.bodyElement.querySelector('#hce-zoom-in').addEventListener('click', () => this._zoom(1));
        this.bodyElement.querySelector('#hce-zoom-out').addEventListener('click', () => this._zoom(-1));
        this.bodyElement.querySelector('#hce-zoom-reset').addEventListener('click', () => this._resetZoomAndPan());
        this.svgContainer.addEventListener('mousedown', (e) => this._onPanStart(e));
        this.svgContainer.addEventListener('mousemove', (e) => this._onPanMove(e));
        this.svgContainer.addEventListener('mouseup', () => this._onPanEnd());
        this.svgContainer.addEventListener('mouseleave', () => this._onPanEnd());
    }

    async _fetchTemplateList() {
        const manifestUrl = `${this.templatePath}templates.json?t=${new Date().getTime()}`;
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error("templates.json konnte nicht geladen werden.");
        const manifest = await response.json();
        this.availableTemplates = manifest.templates;
    }

    async _setupTemplateSelector() {
        const dropdown = this.bodyElement.querySelector('#hce-template-selector-dropdown');
        dropdown.innerHTML = '';

        const templatePromises = this.availableTemplates.map(async (template, index) => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.dataset.index = index;

            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'template-item-thumb';
            item.appendChild(thumbContainer);

            const name = document.createElement('span');
            name.textContent = template.name;
            item.appendChild(name);

            item.addEventListener('click', () => {
                this._selectTemplateByIndex(index);
                this._toggleTemplateSelector(false);
            });

            dropdown.appendChild(item);

            try {
                const response = await fetch(`${this.templatePath}${template.file}?t=${new Date().getTime()}`);
                const svgText = await response.text();
                const thumbnailUrl = await generateU1Thumbnail(svgText, this.dimensions, this.spineWidth, 120);
                thumbContainer.innerHTML = `<img src="${thumbnailUrl}" alt="${template.name}">`;
            } catch (e) {
                thumbContainer.innerHTML = `<span>Vorschau<br>fehlerhaft</span>`;
                console.error(`Konnte Thumbnail für ${template.file} nicht erstellen`, e);
            }
        });

        await Promise.all(templatePromises);
    }

    _toggleTemplateSelector(forceState) {
        const dropdown = this.bodyElement.querySelector('#hce-template-selector-dropdown');
        this.isTemplateSelectorOpen = typeof forceState !== 'undefined' ? forceState : !this.isTemplateSelectorOpen;
        dropdown.classList.toggle('is-open', this.isTemplateSelectorOpen);
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
        await this._loadTemplate(template.file);

        this.svgContainer.classList.remove('is-loading');
    }

    async _loadTemplate(fileName) {
        this.svgContainer.innerHTML = '';
        const response = await fetch(`${this.templatePath}${fileName}?t=${new Date().getTime()}`);
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

        this._storeInitialTransforms();
        this._createUiFromSvg();
        this._applyStateToSvg(); 
        this._resetZoomAndPan(); 
    }
    
    _storeInitialTransforms() {
        this.initialTransforms = {};
        this.svgNode.querySelectorAll('[id^="tpl-"]').forEach(el => {
            this.initialTransforms[el.id] = el.getAttribute('transform') || '';
        });
    }

    _createUiFromSvg() {
        const controlsPanel = this.bodyElement.querySelector('#hce-controls-panel');
        const colorPaletteContainer = this.bodyElement.querySelector('#hce-color-palette-container');
        controlsPanel.innerHTML = '';
        colorPaletteContainer.innerHTML = '';
        this._createTextInputs(controlsPanel);
        this._createLogoInputs(controlsPanel);
        this._createColorPalettes(colorPaletteContainer);
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
            const labelText = el.id.replace('tpl-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
                input.rows = maxLines > 1 ? Math.min(maxLines, 4) : 2;
                if (maxLines > 0) {
                    input.addEventListener('input', () => {
                        const lines = input.value.split('\n');
                        if (lines.length > maxLines) {
                            input.value = lines.slice(0, maxLines).join('\n');
                        }
                    });
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
                this._applyStateToSvg();
            });

            fieldWrapper.appendChild(input);
            content.appendChild(fieldWrapper);
        });
        panel.appendChild(details);
    }
    
    _createLogoInputs(panel) {
        const logoPlaceholders = Array.from(this.svgNode.querySelectorAll('rect[id^="tpl-logo"]'));
        if (logoPlaceholders.length === 0) return;

        const details = document.createElement('details');
        details.className = 'accordion';
        details.open = true;
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

            const labelText = `Logo ${logoId.replace('tpl-logo', '')}`;
            
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
            uploadButton.onclick = () => fileInput.click();

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

            // Event Listeners
            fileInput.addEventListener('change', (e) => this._handleLogoUpload(e, logoId));
            removeButton.addEventListener('click', () => this._removeLogo(logoId));
            slider.addEventListener('input', (e) => {
                if (this.uiState.logoInputs[logoId]) {
                    this.uiState.logoInputs[logoId].manualScale = parseFloat(e.target.value);
                    this._applyStateToSvg();
                }
            });
            previewArea.querySelector('.logo-position-controls').addEventListener('click', (e) => {
                const button = e.target.closest('.btn-move');
                if (button) {
                    this._moveLogo(logoId, button.dataset.direction);
                }
            });
            
            if(this.uiState.logoInputs[logoId]) {
                this._updateLogoControlUI(logoId, this.uiState.logoInputs[logoId].fileName);
            }
        });

        panel.appendChild(details);
    }
    
    _createColorPalettes(container) {
        const paletteRects = Array.from(this.svgNode.querySelectorAll('rect[id^="pal-p"]'));
        const colorPairsData = {};
        paletteRects.forEach(rect => {
            const idParts = rect.id.replace('pal-p', '').split('_c');
            if (idParts.length < 2) return;
            const pairNum = parseInt(idParts[0], 10) - 1;
            const colorIndex = parseInt(idParts[1].charAt(0), 10);
            if (isNaN(pairNum) || isNaN(colorIndex)) return;
            if (!colorPairsData[pairNum]) colorPairsData[pairNum] = {};
            const colorValue = rect.getAttribute('fill');
            const namePart = idParts[1].substring(1);
            const colorName = namePart ? namePart.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : `Farbe ${colorIndex}`;
            if (colorIndex === 1) {
                colorPairsData[pairNum].color1 = colorValue;
                colorPairsData[pairNum].name1 = colorName;
            } else if (colorIndex === 2) {
                colorPairsData[pairNum].color2 = colorValue;
                colorPairsData[pairNum].name2 = colorName;
            }
        });
        this.colorPairs = Object.values(colorPairsData);
        if (this.colorPairs.length === 0) return;
        if (this.uiState.selectedColorPairIndex >= this.colorPairs.length) this.uiState.selectedColorPairIndex = 0;
        this.colorPairs.forEach((pair, index) => {
             const btn = document.createElement('button');
             btn.className = 'color-pair-button';
             btn.title = `${pair.name1} / ${pair.name2}`;
             btn.style.background = `linear-gradient(45deg, ${pair.color1} 50%, ${pair.color2} 50%)`;
             if(index === this.uiState.selectedColorPairIndex) btn.classList.add('active');
             btn.addEventListener('click', () => {
                 this.uiState.selectedColorPairIndex = index;
                 container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                 btn.classList.add('active');
                 this._applyStateToSvg();
             });
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
        this.svgContainer.classList.remove('panning');
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
            uploadButton.textContent = `Logo ${logoId.replace('tpl-logo', '')} hochladen...`;
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
        
        this.svgNode.querySelectorAll('text[id^="tpl-"]').forEach(textElement => {
            const id = textElement.id;
            const hasAdvancedFeatures = textElement.dataset.multiline === 'true' || this.svgNode.querySelector(`#${id}_bbox`);
            if (hasAdvancedFeatures) this._updateAdvancedText(id);
            else this._updateSimpleText(id);
        });
        
        const activePair = this.colorPairs[this.uiState.selectedColorPairIndex];
        if (activePair) {
            this.svgNode.querySelectorAll('[colorselector="color1"]').forEach(el => el.setAttribute('fill', activePair.color1));
            this.svgNode.querySelectorAll('[colorselector="color2"]').forEach(el => el.setAttribute('fill', activePair.color2));
        }
        
        this._updateLogos();

        this._updateSpineAndLayout();
        this._updateEditorTitle();
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
        textElement.setAttribute('transform', this.initialTransforms[textElement.id] || '');
        this._removeTextWarning(textElement.id);
        
        await new Promise(resolve => requestAnimationFrame(resolve));
    
        const bboxWidth = bbox.getBoundingClientRect().width;
        const textWidth = textElement.getBoundingClientRect().width;
    
        if (textWidth <= bboxWidth) {
            return;
        }
    
        const scaleFactor = bboxWidth / textWidth;
    
        if (scaleFactor < EDITOR_BEHAVIOR_CONFIG.TEXT_FIT_MIN_SCALE) {
            this._createTextWarning(textElement, 'Eingabe zu lang');
            const minScale = EDITOR_BEHAVIOR_CONFIG.TEXT_FIT_MIN_SCALE;
            const textBBox = textElement.getBBox();
            const centerX = textBBox.x + textBBox.width / 2;
            const centerY = textBBox.y + textBBox.height / 2;
            textElement.setAttribute('transform', `translate(${centerX}, ${centerY}) scale(${minScale}) translate(${-centerX}, ${-centerY})`);
        } else {
            const textBBox = textElement.getBBox();
            const centerX = textBBox.x + textBBox.width / 2;
            const centerY = textBBox.y + textBBox.height / 2;
            textElement.setAttribute('transform', `translate(${centerX}, ${centerY}) scale(${scaleFactor}) translate(${-centerX}, ${-centerY})`);
        }
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
    }
    
    _removeTextWarning(elementId) {
        const warningElement = this.svgNode.querySelector(`#${elementId}_warning`);
        if (warningElement) {
            warningElement.remove();
        }
    }


    _updateSpineAndLayout() {
        if (!this.svgNode) return;
        const groupU1 = this.svgNode.querySelector('#tpl-group-u1');
        const groupU4 = this.svgNode.querySelector('#tpl-group-u4');
        const groupSpine = this.svgNode.querySelector('#tpl-group-spine');
        if (!groupU1 || !groupU4 || !groupSpine) return;

        const initialU1Transform = this.initialTransforms['#tpl-group-u1'] || 'translate(0,0)';
        const initialU4Transform = this.initialTransforms['#tpl-group-u4'] || 'translate(0,0)';

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
        const topY = 0; // Annahme: Helper lines sollen über die ganze SVG-Höhe gehen
        const bottomY = this.dimensions.svgTotalHeight;
        const halfSpine = spineW / 2;
          const center = this.dimensions.svgCenterX;

        const leftSpineX = center - halfSpine;
        const rightSpineX = center + halfSpine;

        const helperGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        helperGroup.id = 'hce-helper-lines';
        helperGroup.setAttribute('pointer-events', 'none');

        const lineLeft = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineLeft.setAttribute('x1', leftSpineX);
        lineLeft.setAttribute('y1', topY);
        lineLeft.setAttribute('x2', leftSpineX);
        lineLeft.setAttribute('y2', bottomY);
        lineLeft.setAttribute('stroke', 'rgba(0,0,0,0.5)');
        lineLeft.setAttribute('stroke-width', '0.5');
        lineLeft.setAttribute('stroke-dasharray', '3,3');

        const lineRight = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineRight.setAttribute('x1', rightSpineX);
        lineRight.setAttribute('y1', topY);
        lineRight.setAttribute('x2', rightSpineX);
        lineRight.setAttribute('y2', bottomY);
        lineRight.setAttribute('stroke', 'rgba(0,0,0,0.5)');
        lineRight.setAttribute('stroke-width', '0.5');
        lineRight.setAttribute('stroke-dasharray', '3,3');

        const falzLeft = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        falzLeft.setAttribute('x', leftSpineX - this.dimensions.falzZoneWidth);
      falzLeft.setAttribute('y', topY);
        falzLeft.setAttribute('width', this.dimensions.falzZoneWidth);
        falzLeft.setAttribute('height', bottomY);
        falzLeft.setAttribute('fill', 'rgba(0,0,0,0.1)');

        const falzRight = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        falzRight.setAttribute('x', rightSpineX);
        falzRight.setAttribute('y', topY);
        falzRight.setAttribute('width', this.dimensions.falzZoneWidth);
        falzRight.setAttribute('height', bottomY);
        falzRight.setAttribute('fill', 'rgba(0,0,0,0.1)');

        helperGroup.appendChild(falzLeft);
        helperGroup.appendChild(falzRight);
        helperGroup.appendChild(lineLeft);
        helperGroup.appendChild(lineRight);
        this.svgNode.appendChild(helperGroup);
    }

    _removeHelperLines() {
        const existingHelpers = this.svgNode.querySelector('#hce-helper-lines');
        if (existingHelpers) {
            existingHelpers.remove();
        }
        this.svgNode.querySelectorAll('[id$="_warning"]').forEach(el => el.remove());
    }

    async _getFinalResult() {
       this._resetZoomAndPan();
        this._removeHelperLines();

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

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
