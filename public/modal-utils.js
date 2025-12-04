/**
 * Modal Utility Functions
 * Provides accessible modal functionality with keyboard navigation, focus trapping, and ARIA management
 */

// Track currently open modal
let currentModal = null;
let previousActiveElement = null;
let modalFocusableElements = [];

/**
 * Open a modal with full accessibility support
 * @param {string} modalId - ID of the modal element
 * @param {HTMLElement} initialFocus - Element to focus when modal opens (optional)
 */
function openModal(modalId, initialFocus = null) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with ID "${modalId}" not found`);
        return;
    }

    // Store previous active element for focus restoration
    previousActiveElement = document.activeElement;

    // Set modal as current
    currentModal = modal;

    // Update ARIA attributes
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-modal', 'true');
    modal.classList.add('show');

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Get all focusable elements in modal
    modalFocusableElements = getFocusableElements(modal);

    // Set up keyboard event listeners
    setupModalKeyboardHandlers(modal);

    // Focus management
    if (initialFocus && modal.contains(initialFocus)) {
        initialFocus.focus();
    } else if (modalFocusableElements.length > 0) {
        // Focus first focusable element
        modalFocusableElements[0].focus();
    } else {
        // Focus modal itself if no focusable elements
        modal.focus();
    }

    // Trap focus within modal
    trapFocus(modal);
}

/**
 * Close a modal with proper cleanup
 * @param {string} modalId - ID of the modal element
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Update ARIA attributes
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-modal', 'false');
    modal.classList.remove('show');

    // Restore body scroll
    document.body.style.overflow = '';

    // Remove keyboard event listeners
    removeModalKeyboardHandlers(modal);

    // Restore focus to previous element
    if (previousActiveElement && previousActiveElement.focus) {
        previousActiveElement.focus();
    }

    // Clear current modal
    if (currentModal === modal) {
        currentModal = null;
    }

    modalFocusableElements = [];
}

/**
 * Get all focusable elements within a container
 * @param {HTMLElement} container - Container element
 * @returns {Array} Array of focusable elements
 */
function getFocusableElements(container) {
    const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    return Array.from(container.querySelectorAll(focusableSelectors))
        .filter(el => {
            // Filter out hidden elements
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   !el.hasAttribute('aria-hidden');
        });
}

/**
 * Trap focus within modal
 * @param {HTMLElement} modal - Modal element
 */
function trapFocus(modal) {
    const handleTabKey = (e) => {
        if (e.key !== 'Tab') return;

        if (modalFocusableElements.length === 0) {
            e.preventDefault();
            return;
        }

        const firstElement = modalFocusableElements[0];
        const lastElement = modalFocusableElements[modalFocusableElements.length - 1];

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    };

    modal.addEventListener('keydown', handleTabKey);
    modal._tabKeyHandler = handleTabKey;
}

/**
 * Setup keyboard handlers for modal
 * @param {HTMLElement} modal - Modal element
 */
function setupModalKeyboardHandlers(modal) {
    const handleEscape = (e) => {
        if (e.key === 'Escape' && currentModal === modal) {
            const closeButton = modal.querySelector('.close');
            if (closeButton) {
                closeButton.click();
            } else {
                closeModal(modal.id);
            }
        }
    };

    document.addEventListener('keydown', handleEscape);
    modal._escapeKeyHandler = handleEscape;
}

/**
 * Remove keyboard handlers for modal
 * @param {HTMLElement} modal - Modal element
 */
function removeModalKeyboardHandlers(modal) {
    if (modal._escapeKeyHandler) {
        document.removeEventListener('keydown', modal._escapeKeyHandler);
        delete modal._escapeKeyHandler;
    }

    if (modal._tabKeyHandler) {
        modal.removeEventListener('keydown', modal._tabKeyHandler);
        delete modal._tabKeyHandler;
    }
}

/**
 * Close modal when clicking outside (on backdrop)
 */
document.addEventListener('click', (e) => {
    if (currentModal && e.target === currentModal) {
        const closeButton = currentModal.querySelector('.close');
        if (closeButton) {
            closeButton.click();
        } else {
            closeModal(currentModal.id);
        }
    }
});

// Make functions globally available
window.openModal = openModal;
window.closeModal = closeModal;

