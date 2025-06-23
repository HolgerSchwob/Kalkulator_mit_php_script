// mobileUIHandler.mjs
// Manages the mobile sticky footer and the mobile cart modal. By Lucy.

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    // Mobile Footer
    mobileFooter: document.getElementById('mobileStickyFooter'),
    orderTotalMobileFooter: document.getElementById('orderTotalMobileFooter'),
    showMobileCartButton: document.getElementById('showMobileCartButton'),

    // Mobile Cart Modal
    mobileCartModalOverlay: document.getElementById('mobileCartModalOverlay'),
    closeMobileCartButton: document.getElementById('closeMobileCartButton'),
    cartItemsContainerMobile: document.getElementById('cartItemsContainerMobile'),
    orderTotalMobileModal: document.getElementById('orderTotalMobileModal'),
};

/**
 * Opens the mobile cart modal.
 */
function openMobileCart() {
    if (DOM.mobileCartModalOverlay) {
        DOM.mobileCartModalOverlay.classList.add('active');
    }
}

/**
 * Closes the mobile cart modal.
 */
function closeMobileCart() {
    if (DOM.mobileCartModalOverlay) {
        DOM.mobileCartModalOverlay.classList.remove('active');
    }
}

/**
 * Updates all parts of the mobile cart UI.
 * This function is called from the main script.js update cycle.
 * @param {string} cartItemsHTML - The fully rendered HTML string for the cart items.
 * @param {number} totalOrderPrice - The total price of the order.
 * @param {string} currencySymbol - The currency symbol (e.g., '€').
 */
export function updateMobileCartUI(cartItemsHTML, totalOrderPrice, currencySymbol) {
    if (DOM.orderTotalMobileFooter) {
        DOM.orderTotalMobileFooter.textContent = `${totalOrderPrice.toFixed(2)} ${currencySymbol}`;
    }
    if (DOM.cartItemsContainerMobile) {
        DOM.cartItemsContainerMobile.innerHTML = cartItemsHTML;
    }
    if (DOM.orderTotalMobileModal) {
        DOM.orderTotalMobileModal.textContent = `${totalOrderPrice.toFixed(2)}`;
    }
}

/**
 * Initializes the event listeners for the mobile cart UI.
 */
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
    console.log("Mobile UI Handler Initialized.");
}
