// mobileUIHandler.mjs
// Verwaltet nur das Öffnen/Schließen des mobilen Warenkorb-Modals.
// Cart-Inhalt und Totale werden ausschließlich von cartHandler.updateCartUI gesetzt.

const DOM = {
    showMobileCartButton: document.getElementById('showMobileCartButton'),
    mobileCartModalOverlay: document.getElementById('mobileCartModalOverlay'),
    closeMobileCartButton: document.getElementById('closeMobileCartButton'),
};

function openMobileCart() {
    if (DOM.mobileCartModalOverlay) {
        DOM.mobileCartModalOverlay.classList.add('active');
    }
}

function closeMobileCart() {
    if (DOM.mobileCartModalOverlay) {
        DOM.mobileCartModalOverlay.classList.remove('active');
    }
}

export function initMobileUIHandler() {
    if (DOM.showMobileCartButton) {
        DOM.showMobileCartButton.addEventListener('click', openMobileCart);
    }
    if (DOM.closeMobileCartButton) {
        DOM.closeMobileCartButton.addEventListener('click', closeMobileCart);
    }
    if (DOM.mobileCartModalOverlay) {
        DOM.mobileCartModalOverlay.addEventListener('click', (e) => {
            if (e.target === DOM.mobileCartModalOverlay) {
                closeMobileCart();
            }
        });
    }
}
