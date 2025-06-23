/**
 * @file test-runner.js
 * Dieses Skript initialisiert die Testumgebung, sammelt Konfigurationsdaten
 * aus der HTML-Seite und startet den Editor über die EditorFactory.
 */

// Importiere die zentrale Funktion aus der EditorFactory
import { openEditor } from './EditorFactory.mjs';

// Warte, bis das gesamte DOM geladen ist, bevor Skripte ausgeführt werden
document.addEventListener('DOMContentLoaded', () => {

    // DOM-Elemente für die Steuerung und Ausgabe
    const launchButton = document.getElementById('launch-editor-button');
    const spineWidthInput = document.getElementById('spine-width-input');
    const initialTitleInput = document.getElementById('initial-text-title');
    const initialAuthorInput = document.getElementById('initial-text-author');
    const resultOutput = document.getElementById('result-output');

    // Event-Listener für den Start-Button
    launchButton.addEventListener('click', () => {
        // 1. Sammle die aktuellen Konfigurationswerte aus den Formularfeldern
        const spineWidth = parseFloat(spineWidthInput.value) || 0;
        
        // Validiere die Eingabe der Rückenbreite
        if (spineWidth <= 0) {
            alert('Bitte geben Sie eine gültige Buchrückenbreite an.');
            return;
        }

        // Erstelle das Objekt mit den initialen Daten. In einer echten Anwendung
        // würde dies aus einem globalen Zustand (z.B. inquiryState) geladen.
        const initialData = {
            // Wir übergeben keine templateIndex, damit der Editor beim ersten Template startet
            textInputs: {
                'tpl-title': initialTitleInput.value,
                'tpl-name': initialAuthorInput.value,
            },
            // Wir übergeben keinen selectedColorPairIndex, damit die erste Farbe vorausgewählt ist
        };


        // 2. Erstelle das finale Konfigurationsobjekt für den Editor
        const editorConfig = {
            bindingType: 'hardcover', // Dieser String entscheidet, welcher Editor geladen wird
            spineWidth: spineWidth,
            initialData: initialData,

            /**
             * Callback-Funktion, die ausgeführt wird, wenn der Benutzer im Editor
             * auf "Fertigstellen & Übernehmen" klickt.
             * @param {object} result - Das vom Editor zurückgegebene Ergebnisobjekt.
             */
            onSubmit: (result) => {
                console.log("Erfolgreich vom Editor zurückgekehrt. Ergebnis:", result);
                resultOutput.innerHTML = `
                    <h3 class="font-semibold text-lg">Ergebnis erhalten:</h3>
                    <div class="mt-2">
                        <p><strong>Gewähltes Template:</strong> ${result.parameters.templateDisplayName} (${result.parameters.templateFile})</p>
                        <p><strong>Rückenbreite:</strong> ${result.parameters.spineWidth}mm</p>
                    </div>
                    <div class="mt-4">
                        <h4 class="font-semibold">Vorschau:</h4>
                        <img src="${result.thumbnailDataUrl}" alt="Vorschau der Buchdecke" class="mt-2 border rounded-md shadow-md max-w-xs">
                    </div>
                    <div class="mt-4">
                         <h4 class="font-semibold">Übergebene Text-Parameter:</h4>
                         <pre class="bg-gray-100 p-2 rounded-md mt-2 text-xs overflow-auto">${JSON.stringify(result.parameters.textInputs, null, 2)}</pre>
                    </div>
                `;
            },

            /**
             * Optionale Callback-Funktion, die ausgeführt wird, wenn der Benutzer
             * den Editor abbricht oder schließt.
             */
            onCancel: () => {
                console.log("Editor wurde abgebrochen.");
                resultOutput.innerHTML = `<p class="text-gray-500">Editor wurde ohne Speichern geschlossen.</p>`;
            }
        };

        // 3. Starte den Editor mit der erstellten Konfiguration
        openEditor(editorConfig);
    });
});
