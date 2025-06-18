// uiUtils.mjs
// General UI helper functions, e.g., for modals, accordions

// --- Accordion Logic ---
/**
 * Toggles the expansion state of an accordion item and collapses others.
 * @param {Array} collection - The array of items (variants or extras).
 * @param {string} itemIdToToggle - The ID of the item to toggle.
 * @param {string} itemType - 'variant' or 'extra'.
 * @param {Function} onUpdateCallback - Callback to trigger a re-render.
 * @param {Array} otherCollection - The other collection (e.g., extras if itemType is variant) to collapse.
 */
export function toggleAccordionItemExpansion(collection, itemIdToToggle, itemType, onUpdateCallback, otherCollection = []) {
    const idProp = itemType === 'variant' ? 'id' : 'instanceId';

    collection.forEach(item => {
        if (item[idProp] === itemIdToToggle) {
            item.isExpanded = !item.isExpanded;
        } else {
            item.isExpanded = false;
        }
    });

    // Collapse items in the other collection
    otherCollection.forEach(item => item.isExpanded = false);

    if (onUpdateCallback) {
        onUpdateCallback();
    }
}


// --- Image Gallery Modal Logic ---
// DOM Elements for Image Gallery (assumed to be consistent with index.html)
let imageGalleryModalOverlay_DOM, imageGalleryTitle_DOM, closeImageGalleryModalButton_DOM,
    galleryImagePreview_DOM, galleryImageNamePreview_DOM, galleryThumbnailsContainer_DOM,
    selectImageFromGalleryButton_DOM, zoomImageModalOverlay_DOM, zoomedImage_DOM, closeZoomModalButton_DOM;

// Context and callbacks for image gallery
let currentGalleryContextInternal = { variantId: null, optionKey: null, selectedBasename: null, config: null };
let setGalleryContextCallback;
let getGalleryContextCallback;
let applyGallerySelectionCallback;
let getBookBlockStateForGalleryCallback; // To pass bookBlockState to applyGallerySelectionCallback


export function setupImageGalleryEventListeners(setContextCb, getContextCb, applyCb, getBbStateCb) {
    setGalleryContextCallback = setContextCb;
    getGalleryContextCallback = getContextCb;
    applyGallerySelectionCallback = applyCb;
    getBookBlockStateForGalleryCallback = getBbStateCb;


    imageGalleryModalOverlay_DOM = document.getElementById('imageGalleryModalOverlay');
    imageGalleryTitle_DOM = document.getElementById('imageGalleryTitle');
    closeImageGalleryModalButton_DOM = document.getElementById('closeImageGalleryModalButton');
    galleryImagePreview_DOM = document.getElementById('galleryImagePreview');
    galleryImageNamePreview_DOM = document.getElementById('galleryImageNamePreview');
    galleryThumbnailsContainer_DOM = document.getElementById('galleryThumbnailsContainer');
    selectImageFromGalleryButton_DOM = document.getElementById('selectImageFromGalleryButton');
    zoomImageModalOverlay_DOM = document.getElementById('zoomImageModalOverlay');
    zoomedImage_DOM = document.getElementById('zoomedImage');
    closeZoomModalButton_DOM = document.getElementById('closeZoomModalButton');

    if (closeImageGalleryModalButton_DOM) closeImageGalleryModalButton_DOM.addEventListener('click', closeImageGalleryModal);
    if (imageGalleryModalOverlay_DOM) imageGalleryModalOverlay_DOM.addEventListener('click', (e) => { if (e.target === imageGalleryModalOverlay_DOM) closeImageGalleryModal(); });
    if (selectImageFromGalleryButton_DOM) selectImageFromGalleryButton_DOM.addEventListener('click', () => {
        const context = getGalleryContextCallback ? getGalleryContextCallback() : currentGalleryContextInternal;
        const bookBlockState = getBookBlockStateForGalleryCallback ? getBookBlockStateForGalleryCallback() : {};
         if (context.variantId && context.optionKey && context.selectedBasename && applyGallerySelectionCallback) {
            // The applyCb (handleVariantInputChange) needs the current bookBlockState
            applyGallerySelectionCallback(
                context.variantId,
                'gallery_selection', // field type
                context.selectedBasename, // value
                { optionKey: context.optionKey }, // optionMeta
                bookBlockState // currentBookBlockState
            );
            closeImageGalleryModal();
        } else {
            console.warn("Galerieauswahl unvollständig oder Callback fehlt:", context);
            closeImageGalleryModal();
        }
    });

    if (galleryImagePreview_DOM) {
        galleryImagePreview_DOM.style.cursor = "zoom-in";
        galleryImagePreview_DOM.addEventListener('click', () => {
            if (galleryImagePreview_DOM.src && galleryImagePreview_DOM.src !== window.location.href && zoomImageModalOverlay_DOM && zoomedImage_DOM) {
                zoomedImage_DOM.src = galleryImagePreview_DOM.src;
                zoomImageModalOverlay_DOM.classList.add('active');
            }
        });
    }
    if (closeZoomModalButton_DOM) closeZoomModalButton_DOM.addEventListener('click', () => zoomImageModalOverlay_DOM.classList.remove('active'));
    if (zoomImageModalOverlay_DOM) zoomImageModalOverlay_DOM.addEventListener('click', (e) => { if (e.target === zoomImageModalOverlay_DOM) zoomImageModalOverlay_DOM.classList.remove('active'); });
    if (zoomedImage_DOM) zoomedImage_DOM.addEventListener('click', () => zoomImageModalOverlay_DOM.classList.remove('active'));
}


export function openImageGalleryModal(variantId, galleryOptionConfig, currentSelection, galleryContextFromHandler) {
    if (!imageGalleryModalOverlay_DOM || !galleryOptionConfig) {
        console.error("Kann Galerie nicht öffnen, Overlay oder Config fehlt."); return;
    }
    
    // Use the context passed from the handler (variantHandler)
    const newContext = {
        variantId,
        optionKey: galleryOptionConfig.optionKey,
        selectedBasename: currentSelection || galleryOptionConfig.defaultSelection,
        config: galleryOptionConfig
    };
    if (setGalleryContextCallback) setGalleryContextCallback(newContext);
    else currentGalleryContextInternal = newContext;


    if(imageGalleryTitle_DOM) imageGalleryTitle_DOM.textContent = galleryOptionConfig.galleryTitle || "Bildauswahl";
    if(galleryThumbnailsContainer_DOM) galleryThumbnailsContainer_DOM.innerHTML = '';
    if(galleryImagePreview_DOM) { galleryImagePreview_DOM.src = ''; galleryImagePreview_DOM.alt = 'Vorschaubild'; }
    if(galleryImageNamePreview_DOM) galleryImageNamePreview_DOM.textContent = '';

    if (!galleryOptionConfig.availableImages || galleryOptionConfig.availableImages.length === 0) {
        if(galleryThumbnailsContainer_DOM) galleryThumbnailsContainer_DOM.innerHTML = '<p class="info-text">Keine Bilder verfügbar.</p>';
        imageGalleryModalOverlay_DOM.classList.add('active');
        return;
    }

    galleryOptionConfig.availableImages.forEach(basename => {
        const thumbItem = document.createElement('div');
        thumbItem.className = 'gallery-thumbnail-item';
        if (galleryOptionConfig.imageDisplayType === 'swatch') {
            thumbItem.classList.add('swatch');
        }
        thumbItem.dataset.basename = basename;

        const img = document.createElement('img');
        const thumbSrc = `${galleryOptionConfig.imageFolderPath}${basename}`;
        img.src = thumbSrc;
        img.alt = String(basename).replace(/_/g, ' ').replace(/-/g, ' ');
        img.addEventListener('error', () => {
            img.alt = `Fehler: ${basename}`;
            thumbItem.style.border = "1px dashed red";
            thumbItem.textContent = "!";
        });

        thumbItem.appendChild(img);
        thumbItem.addEventListener('click', () => handleThumbnailClick(basename, galleryOptionConfig));
        if(galleryThumbnailsContainer_DOM) galleryThumbnailsContainer_DOM.appendChild(thumbItem);
    });

    const contextForInitialClick = getGalleryContextCallback ? getGalleryContextCallback() : currentGalleryContextInternal;
    const initialSelectionForDisplay = contextForInitialClick.selectedBasename || (galleryOptionConfig.availableImages && galleryOptionConfig.availableImages.length > 0 ? galleryOptionConfig.availableImages[0] : null);

    if (initialSelectionForDisplay) {
        handleThumbnailClick(initialSelectionForDisplay, galleryOptionConfig);
    } else if(galleryImageNamePreview_DOM) {
        galleryImageNamePreview_DOM.textContent = 'Bitte wählen';
    }
    imageGalleryModalOverlay_DOM.classList.add('active');
}

export function handleThumbnailClick(basename, config) {
    const context = getGalleryContextCallback ? getGalleryContextCallback() : currentGalleryContextInternal;
    const newContext = { ...context, selectedBasename: basename };
    if (setGalleryContextCallback) setGalleryContextCallback(newContext);
    else currentGalleryContextInternal = newContext;


    const highResSrc = `${config.imageFolderPath}${basename}`;
    const namePreviewText = String(basename).replace(/_/g, ' ').replace(/-/g, ' ');

    if (galleryImagePreview_DOM) {
        galleryImagePreview_DOM.src = highResSrc;
        galleryImagePreview_DOM.alt = `Vorschau: ${namePreviewText}`;
        galleryImagePreview_DOM.onerror = () => {
            galleryImagePreview_DOM.alt = `Bild ${namePreviewText} konnte nicht geladen werden.`;
            galleryImagePreview_DOM.src = '';
        };
    }
    if (galleryImageNamePreview_DOM) galleryImageNamePreview_DOM.textContent = namePreviewText;

    if (galleryThumbnailsContainer_DOM) {
        galleryThumbnailsContainer_DOM.querySelectorAll('.gallery-thumbnail-item').forEach(item => {
            item.classList.remove('active-thumbnail');
            if (item.dataset.basename === basename) {
                item.classList.add('active-thumbnail');
            }
        });
    }
}

export function closeImageGalleryModal() {
    if (imageGalleryModalOverlay_DOM) imageGalleryModalOverlay_DOM.classList.remove('active');
    const newContext = { variantId: null, optionKey: null, selectedBasename: null, config: null };
    if (setGalleryContextCallback) setGalleryContextCallback(newContext);
    else currentGalleryContextInternal = newContext;
}

// This function is now called directly from the event listener in setupImageGalleryEventListeners
// export function applyGallerySelection() { /* ... see setup ... */ }


// Called by main script on DOMContentLoaded
export function initUiUtils(modalElements) {
    // If uiUtils were to manage more generic modal open/close, it would use modalElements
    // For now, it's mainly for accordion and image gallery setup
    console.log("UI Utils Initialized");
}
