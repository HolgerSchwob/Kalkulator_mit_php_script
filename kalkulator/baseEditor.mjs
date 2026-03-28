/**
 * @file BaseEditor.mjs
 * Stellt die grundlegende Struktur und Funktionalität für alle Editoren bereit,
 * insbesondere das Modal-Fenster, den Header und den Footer mit den
 * Bestätigen/Abbrechen-Buttons.
 */
export class BaseEditor {
    /**
     * @param {object} config - Die Konfiguration vom Factory Aufruf.
     * @param {string} title - Der Titel für das Modal-Fenster.
     */
    constructor(config, title = 'Editor') {
        this.config = config;
        this.onSubmit = config.onSubmit;
        this.onCancel = config.onCancel;
        this._abortController = new AbortController();

        this._createModal(title);
    }

    _createModal(title) {
        // Erzeuge das Modal-Overlay
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'editor-modal-overlay';

        // Erzeuge den Modal-Container
        const modalContent = document.createElement('div');
        modalContent.className = 'editor-modal-content';
        this.modalElement.appendChild(modalContent);

        // -- Header --
        const header = document.createElement('header');
        header.className = 'editor-modal-header';
        header.innerHTML = `<h2>${title}</h2><button class="close-btn" title="Schließen">&times;</button>`;
        modalContent.appendChild(header);

        // -- Body (wird vom spezialisierten Editor gefüllt) --
        this.bodyElement = document.createElement('main');
        this.bodyElement.className = 'editor-modal-body';
        modalContent.appendChild(this.bodyElement);

        // -- Footer --
        const footer = document.createElement('footer');
        footer.className = 'editor-modal-footer';
        footer.innerHTML = `
            <button class="btn btn-secondary cancel-btn">Abbrechen</button>
            <button class="btn btn-primary confirm-btn">Fertigstellen & Übernehmen</button>
        `;
        modalContent.appendChild(footer);
        
        const sig = { signal: this._abortController.signal };
        this.modalElement.querySelector('.close-btn').addEventListener('click', () => this.close(), sig);
        this.modalElement.querySelector('.cancel-btn').addEventListener('click', () => this.close(), sig);
        this.modalElement.querySelector('.confirm-btn').addEventListener('click', () => this._handleConfirm(), sig);

        // Füge das Modal zum Body hinzu und zeige es an
        document.body.appendChild(this.modalElement);
        // Ein kleiner Timeout, damit CSS-Transitionen greifen können
        setTimeout(() => this.modalElement.classList.add('visible'), 10);
    }

    /**
     * Muss vom spezialisierten Editor implementiert werden.
     * @returns {Promise<object>} Das Ergebnisobjekt.
     */
    async _getFinalResult() {
        throw new Error("'_getFinalResult' muss vom spezialisierten Editor implementiert werden.");
    }

    async _handleConfirm() {
        // Deaktiviere den Button, um doppelte Klicks zu verhindern
        const confirmBtn = this.modalElement.querySelector('.confirm-btn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Verarbeite...';

        try {
            const result = await this._getFinalResult();
            if (result && typeof this.onSubmit === 'function') {
                this.onSubmit(result);
            }
            this.close(false); // Schließe Modal ohne den onCancel-Callback auszulösen
        } catch (error) {
            console.error("Fehler beim Erstellen der finalen Daten:", error);
            alert("Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut."); // Hier wäre ein schöneres Alert-Modal gut
        } finally {
            // Stelle sicher, dass der Button wieder aktiviert wird, falls der User nicht schließt.
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Fertigstellen & Übernehmen';
        }
    }
    
    /**
     * Schließt das Modal und entfernt es aus dem DOM.
     * @param {boolean} [triggerCancel=true] - Ob der onCancel-Callback ausgelöst werden soll.
     */
    close(triggerCancel = true) {
        if (triggerCancel && typeof this.onCancel === 'function') {
            this.onCancel();
        }
        this._destroy();
        this._abortController.abort();
        if (this.modalElement) {
            this.modalElement.classList.remove('visible');
            this.modalElement.addEventListener('transitionend', () => {
                this.modalElement.remove();
            }, { once: true });
            setTimeout(() => { if (this.modalElement?.parentNode) this.modalElement.remove(); }, 500);
        }
    }

    /** Wird beim Schließen aufgerufen. Subklassen überschreiben dies für eigenes Cleanup. */
    _destroy() {}
}
