// personalizationHandler.mjs
// Modul zur Handhabung des Personalisierungs-Modals für Bindungsvarianten (V1.8.14)
// V1.8.14: Verbesserte Persistenz von Eingaben, Logo-Vorschau beim Öffnen und bei Auswahl.

let personalizationModalOverlay = null;
let personalizationModalTitle = null;
let personalizationModalBody = null;
let savePersonalizationButton = null;
let closePersonalizationModalButton = null;
let cancelPersonalizationModalButton = null;

let currentVariantId = null;
let currentBindingConfig = null;
let onSaveCallback = null;

/**
 * Initialisiert das Personalisierungs-Modal und seine Event-Listener.
 * @param {Function} saveCb - Callback-Funktion, die beim Speichern der Personalisierung aufgerufen wird.
 */
export function initPersonalizationModal(saveCb) {
    onSaveCallback = saveCb;

    personalizationModalOverlay = document.getElementById('personalizationModalOverlay');
    personalizationModalTitle = document.getElementById('personalizationModalTitle');
    personalizationModalBody = document.getElementById('personalizationModalBody');
    savePersonalizationButton = document.getElementById('savePersonalizationButton');
    closePersonalizationModalButton = document.getElementById('closePersonalizationModalButton');
    cancelPersonalizationModalButton = document.getElementById('cancelPersonalizationModalButton');

    if (!personalizationModalOverlay || !personalizationModalTitle || !personalizationModalBody || !savePersonalizationButton || !closePersonalizationModalButton || !cancelPersonalizationModalButton) {
        console.error("Einige Elemente des Personalisierungs-Modals konnten nicht im DOM gefunden werden!");
        return;
    }

    closePersonalizationModalButton.addEventListener('click', closePersonalizationModal);
    cancelPersonalizationModalButton.addEventListener('click', closePersonalizationModal);
    personalizationModalOverlay.addEventListener('click', (e) => {
        if (e.target === personalizationModalOverlay) {
            closePersonalizationModal();
        }
    });
    savePersonalizationButton.addEventListener('click', handleSavePersonalization);

    personalizationModalBody.addEventListener('change', (event) => {
        if (event.target.type === 'checkbox' && event.target.dataset.controlsVisibilityFor) {
            const dependentFieldId = event.target.dataset.controlsVisibilityFor;
            const dependentFieldContainer = personalizationModalBody.querySelector(`#fieldContainer_${dependentFieldId}_${currentVariantId}`);
            if (dependentFieldContainer) {
                const isChecked = event.target.checked;
                dependentFieldContainer.style.display = isChecked ? '' : 'none';
                if (!isChecked) { // Wenn Checkbox deaktiviert wird
                    const fileInput = dependentFieldContainer.querySelector(`input[type="file"][name="${dependentFieldId}"]`);
                    if (fileInput) fileInput.value = ''; // Datei-Input zurücksetzen

                    const previewImg = dependentFieldContainer.querySelector(`#logoPreview_${dependentFieldId}_${currentVariantId}`);
                    if (previewImg) {
                        previewImg.src = '';
                        previewImg.style.display = 'none';
                    }
                    const fileNameP = dependentFieldContainer.querySelector(`#logoFileName_${dependentFieldId}_${currentVariantId}`);
                    if (fileNameP) fileNameP.textContent = '';
                }
            }
        } else if (event.target.type === 'file' && event.target.name === 'cover_customLogoFile') {
            // Live-Vorschau für neu ausgewählte Datei
            const fileInput = event.target;
            const fieldContainer = fileInput.closest('div'); // Das fieldContainerDiv finden
            const previewImgId = `logoPreview_${fileInput.name}_${currentVariantId}`;
            const fileNamePId = `logoFileName_${fileInput.name}_${currentVariantId}`;

            let previewImg = fieldContainer.querySelector(`#${previewImgId}`);
            let fileNameP = fieldContainer.querySelector(`#${fileNamePId}`);

            // Sicherstellen, dass Preview-Elemente existieren
            if (!previewImg) {
                previewImg = document.createElement('img');
                previewImg.id = previewImgId;
                previewImg.style.maxWidth = '100px';
                previewImg.style.maxHeight = '100px';
                previewImg.style.marginTop = '5px';
                previewImg.style.border = '1px solid #ddd';
                previewImg.style.objectFit = 'contain';
                fieldContainer.appendChild(previewImg);
            }
            if (!fileNameP) {
                fileNameP = document.createElement('p');
                fileNameP.id = fileNamePId;
                fileNameP.style.fontSize = '0.85em';
                fileNameP.style.marginTop = '3px';
                fileNameP.style.color = '#555';
                fieldContainer.appendChild(fileNameP);
            }

            if (fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                fileNameP.textContent = `Ausgewählt: ${file.name}`;
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewImg.src = e.target.result;
                        previewImg.style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                } else {
                    previewImg.src = '';
                    previewImg.style.display = 'none';
                    fileNameP.textContent += ' (Keine gültige Bilddatei für Vorschau)';
                }
            } else {
                previewImg.src = '';
                previewImg.style.display = 'none';
                fileNameP.textContent = '';
            }
        }
    });

    console.log("Personalisierungs-Modal V1.8.14 initialisiert.");
}

/**
 * Öffnet das Personalisierungs-Modal für eine spezifische Variante.
 * @param {string} variantId - Die ID der zu personalisierenden Variante.
 * @param {Object} bindingConfig - Die Konfiguration des Bindungstyps der Variante.
 * @param {Object} existingPersonalizationData - Bereits vorhandene Personalisierungsdaten für diese Variante.
 */
export function openPersonalizationModal(variantId, bindingConfig, existingPersonalizationData = {}) {
    if (!personalizationModalOverlay || !bindingConfig || !bindingConfig.personalizationFields) {
        console.error("Personalisierungs-Modal nicht initialisiert oder Bindungskonfiguration unvollständig.");
        return;
    }

    currentVariantId = variantId;
    currentBindingConfig = bindingConfig;
    personalizationModalTitle.textContent = `Personalisierung für: ${bindingConfig.name}`;
    personalizationModalBody.innerHTML = '';

    const form = document.createElement('form');
    form.id = 'personalizationForm';
    form.setAttribute('novalidate', '');

    bindingConfig.personalizationFields.forEach(fieldConfig => {
        const fieldContainerDiv = document.createElement('div');
        fieldContainerDiv.style.marginBottom = '12px';
        fieldContainerDiv.id = `fieldContainer_${fieldConfig.id}_${variantId}`;

        const label = document.createElement('label');
        label.htmlFor = `perso_${fieldConfig.id}_${variantId}`;
        label.textContent = `${fieldConfig.label}${fieldConfig.required ? '*' : ''}:`;
        label.style.display = 'block';
        label.style.marginBottom = '4px';
        label.style.fontWeight = 'bold';
        fieldContainerDiv.appendChild(label);

        let inputElement;
        const existingValue = existingPersonalizationData[fieldConfig.id];

        if (fieldConfig.type === 'textarea') {
            inputElement = document.createElement('textarea');
            inputElement.rows = fieldConfig.rows || 3;
            inputElement.value = existingValue || '';
        } else if (fieldConfig.type === 'checkbox') {
            inputElement = document.createElement('input');
            inputElement.type = 'checkbox';
            inputElement.checked = typeof existingValue === 'boolean' ? existingValue : (fieldConfig.default || false);
            if (bindingConfig.personalizationFields.some(pf => pf.dependsOn === fieldConfig.id)) {
                inputElement.dataset.controlsVisibilityFor = bindingConfig.personalizationFields.find(pf => pf.dependsOn === fieldConfig.id).id;
            }
        } else if (fieldConfig.type === 'file') {
            inputElement = document.createElement('input');
            inputElement.type = 'file';
            if (fieldConfig.accept) {
                inputElement.accept = fieldConfig.accept;
            }
            // Elemente für Dateiname und Vorschau erstellen (werden bei Bedarf gefüllt)
            const fileNameP = document.createElement('p');
            fileNameP.id = `logoFileName_${fieldConfig.id}_${variantId}`;
            fileNameP.style.fontSize = '0.85em';
            fileNameP.style.marginTop = '3px';
            fileNameP.style.color = '#555';

            const previewImg = document.createElement('img');
            previewImg.id = `logoPreview_${fieldConfig.id}_${variantId}`;
            previewImg.style.maxWidth = '100px';
            previewImg.style.maxHeight = '100px';
            previewImg.style.marginTop = '5px';
            previewImg.style.border = '1px solid #ddd';
            previewImg.style.objectFit = 'contain';
            previewImg.style.display = 'none'; // Standardmäßig versteckt

            fieldContainerDiv.appendChild(inputElement); // Input zuerst
            fieldContainerDiv.appendChild(fileNameP);    // Dann Dateiname
            fieldContainerDiv.appendChild(previewImg);   // Dann Vorschau

            // Wenn ein File-Objekt im State existiert (von script.js übergeben)
            if (existingValue instanceof File) {
                fileNameP.textContent = `Aktuell ausgewählt: ${existingValue.name}`;
                if (existingValue.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewImg.src = e.target.result;
                        previewImg.style.display = 'block';
                    };
                    reader.readAsDataURL(existingValue);
                }
            } else if (typeof existingValue === 'string' && existingValue) {
                // Wenn nur ein Dateiname als String existiert (z.B. wenn File-Objekt nicht serialisierbar war, aber Name schon)
                 fileNameP.textContent = `Zuletzt ausgewählte Datei: ${existingValue}`;
            }


        } else { // Default to text input
            inputElement = document.createElement('input');
            inputElement.type = fieldConfig.type || 'text';
            inputElement.value = existingValue || '';
        }

        if (inputElement) {
            inputElement.id = `perso_${fieldConfig.id}_${variantId}`;
            inputElement.name = fieldConfig.id;
            // Allgemeine Styles für Inputs (außer File, das schon im Container ist)
            if (fieldConfig.type !== 'file') {
                 inputElement.style.width = fieldConfig.type === 'checkbox' ? 'auto' : '100%';
                 inputElement.style.padding = '8px';
                 inputElement.style.border = '1px solid #ccc';
                 inputElement.style.borderRadius = '4px';
                 inputElement.style.boxSizing = 'border-box';
            }

            if (fieldConfig.type === 'checkbox') {
                inputElement.style.marginRight = '5px';
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.insertBefore(inputElement, label.firstChild);
            } else if (fieldConfig.type !== 'file') { // File input ist schon im Container
                 fieldContainerDiv.appendChild(inputElement);
            }
        }

        if (fieldConfig.dependsOn) {
            const controllingField = bindingConfig.personalizationFields.find(f => f.id === fieldConfig.dependsOn);
            if (controllingField) {
                let controllingValue = existingPersonalizationData[controllingField.id];
                if (controllingField.type === 'checkbox') {
                    controllingValue = typeof existingPersonalizationData[controllingField.id] === 'boolean' ? existingPersonalizationData[controllingField.id] : (controllingField.default || false);
                }
                if (controllingValue !== fieldConfig.dependsValue) {
                    fieldContainerDiv.style.display = 'none';
                }
            }
        }
        form.appendChild(fieldContainerDiv);
    });

    personalizationModalBody.appendChild(form);
    personalizationModalOverlay.classList.add('active');
}

function closePersonalizationModal() {
    if (personalizationModalOverlay) {
        personalizationModalOverlay.classList.remove('active');
    }
}

function handleSavePersonalization() {
    if (!currentVariantId || !currentBindingConfig || !onSaveCallback) return;

    const form = document.getElementById('personalizationForm');
    if (!form) return;

    const personalizationData = {};
    let logoFileObject = null;
    let allRequiredFieldsValid = true;
    let firstInvalidFieldLabel = null;

    currentBindingConfig.personalizationFields.forEach(fieldConfig => {
        const inputElement = form.querySelector(`[name="${fieldConfig.id}"]`);
        if (inputElement) {
            if (fieldConfig.type === 'checkbox') {
                personalizationData[fieldConfig.id] = inputElement.checked;
            } else if (fieldConfig.type === 'file') {
                if (inputElement.files && inputElement.files.length > 0) {
                    logoFileObject = inputElement.files[0];
                    // Der Dateiname wird nicht mehr explizit in personalizationData gespeichert,
                    // da das File-Objekt (logoFileObject) an den Callback geht und script.js
                    // daraus den Namen und das Objekt selbst im State verwaltet.
                } else {
                    // Wenn keine neue Datei ausgewählt wurde, und die Checkbox (falls vorhanden)
                    // immer noch "Logo verwenden" sagt, soll das alte Logo (File-Objekt) im State bleiben.
                    // Das wird im onSaveCallback in script.js gehandhabt, indem das übergebene
                    // logoFileObject (das hier null wäre) nur dann das alte ersetzt, wenn es nicht null ist.
                    // Wenn die Checkbox "Logo verwenden" deaktiviert wurde, wird das Logo in script.js entfernt.
                }
            } else {
                personalizationData[fieldConfig.id] = inputElement.value.trim();
            }

            if (fieldConfig.required && (personalizationData[fieldConfig.id] === undefined || personalizationData[fieldConfig.id] === '' || (personalizationData[fieldConfig.id] === false && fieldConfig.type !== 'checkbox'))) {
                allRequiredFieldsValid = false;
                if (!firstInvalidFieldLabel) {
                    firstInvalidFieldLabel = fieldConfig.label;
                }
            }
        }
    });

    if (allRequiredFieldsValid) {
        // Übergebe das File-Objekt (oder null) als drittes Argument
        onSaveCallback(currentVariantId, personalizationData, logoFileObject);
        closePersonalizationModal();
    } else {
        alert(`Bitte füllen Sie alle Pflichtfelder aus. Das Feld "${firstInvalidFieldLabel.replace('*','')}" ist erforderlich.`);
    }
}
