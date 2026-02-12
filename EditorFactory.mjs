/**
 * @file EditorFactory.mjs
 * Dieses Modul dient als zentrale Verteilerstelle, um den passenden
 * Editor für einen gegebenen Bindungstyp zu instanziieren und zu öffnen.
 */

// Import der spezialisierten Editoren. In Zukunft können hier weitere
// Editoren wie WireOEditor, PaperbackEditor etc. hinzugefügt werden.
import { HardcoverEditor } from './HardcoverEditor.mjs';

/**
 * Öffnet den passenden Editor basierend auf der Konfiguration.
 * @param {object} config - Das Konfigurationsobjekt für den Editor.
 * @param {string} config.bindingType - Der Typ der Bindung (z.B. 'hardcover').
 * @param {number} config.spineWidth - Die initiale Buchrückenbreite.
 * @param {object} [config.initialData={}] - Bereits vorhandene Personalisierungsdaten.
 * @param {function} config.onSubmit - Callback, der bei Bestätigung aufgerufen wird.
 * @param {function} [config.onCancel] - Optionaler Callback, der bei Abbruch aufgerufen wird.
 */
export function openEditor(config) {
    if (!config || !config.bindingType) {
        console.error("EditorFactory: Kein 'bindingType' in der Konfiguration gefunden.");
        return;
    }
    // Die Factory entscheidet, welcher spezialisierte Editor geladen wird.
    switch (config.bindingType) {
        case 'hardcover':
            // Instanziiert und startet den Hardcover-Editor.
            // Die Logik zum Laden der Templates liegt nun vollständig im Editor selbst.
            new HardcoverEditor(config);
            break;

        // case 'wire-o':
        //     new WireOEditor(config);
        //     break;
            
        default:
            console.error(`EditorFactory: Kein passender Editor für den Typ "${config.bindingType}" gefunden.`);
            // Optional: Öffne einen Standard-Fallback-Editor oder zeige eine Fehlermeldung.
            break;
    }
}
