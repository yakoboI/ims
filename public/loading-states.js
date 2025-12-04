/**
 * Loading States Utility
 * Provides loading spinners, skeletons, and progress indicators
 */

/**
 * Show loading spinner
 * @param {HTMLElement|string} container - Container element or selector
 * @param {string} message - Optional loading message
 * @returns {HTMLElement} - The loading element
 */
function showLoading(container, message = 'Loading...') {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return null;

    // Remove existing loading
    hideLoading(container);

    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-spinner';
    loadingEl.setAttribute('role', 'status');
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.innerHTML = `
        <div class="spinner"></div>
        <span class="loading-message">${message}</span>
    `;

    containerEl.appendChild(loadingEl);
    return loadingEl;
}

/**
 * Hide loading spinner
 * @param {HTMLElement|string} container - Container element or selector
 */
function hideLoading(container) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return;

    const loadingEl = containerEl.querySelector('.loading-spinner');
    if (loadingEl) {
        loadingEl.remove();
    }
}

/**
 * Show skeleton loader for table
 * @param {HTMLElement|string} container - Container element or selector
 * @param {number} rows - Number of skeleton rows
 * @param {number} cols - Number of columns
 */
function showTableSkeleton(container, rows = 5, cols = 6) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return null;

    const skeletonEl = document.createElement('div');
    skeletonEl.className = 'table-skeleton';
    skeletonEl.setAttribute('aria-busy', 'true');
    skeletonEl.setAttribute('aria-label', 'Loading table data');

    let skeletonHTML = '<div class="skeleton-table">';
    for (let i = 0; i < rows; i++) {
        skeletonHTML += '<div class="skeleton-row">';
        for (let j = 0; j < cols; j++) {
            skeletonHTML += '<div class="skeleton-cell"></div>';
        }
        skeletonHTML += '</div>';
    }
    skeletonHTML += '</div>';

    skeletonEl.innerHTML = skeletonHTML;
    containerEl.appendChild(skeletonEl);
    return skeletonEl;
}

/**
 * Hide table skeleton
 * @param {HTMLElement|string} container - Container element or selector
 */
function hideTableSkeleton(container) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return;

    const skeletonEl = containerEl.querySelector('.table-skeleton');
    if (skeletonEl) {
        skeletonEl.remove();
    }
}

/**
 * Show button loading state
 * @param {HTMLElement|string} button - Button element or selector
 * @param {string} loadingText - Text to show while loading
 */
function showButtonLoading(button, loadingText = 'Loading...') {
    const buttonEl = typeof button === 'string' 
        ? document.querySelector(button) 
        : button;
    
    if (!buttonEl) return;

    if (buttonEl.dataset.originalText === undefined) {
        buttonEl.dataset.originalText = buttonEl.textContent;
    }

    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
    buttonEl.innerHTML = `<span class="button-spinner"></span> ${loadingText}`;
}

/**
 * Hide button loading state
 * @param {HTMLElement|string} button - Button element or selector
 */
function hideButtonLoading(button) {
    const buttonEl = typeof button === 'string' 
        ? document.querySelector(button) 
        : button;
    
    if (!buttonEl) return;

    buttonEl.disabled = false;
    buttonEl.removeAttribute('aria-busy');
    buttonEl.textContent = buttonEl.dataset.originalText || buttonEl.textContent;
}

/**
 * Show inline loading for form submission
 * @param {HTMLFormElement} form - Form element
 */
function showFormLoading(form) {
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        showButtonLoading(submitButton, 'Saving...');
    }

    const inputs = form.querySelectorAll('input, select, textarea, button');
    inputs.forEach(input => {
        input.disabled = true;
    });
}

/**
 * Hide form loading
 * @param {HTMLFormElement} form - Form element
 */
function hideFormLoading(form) {
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        hideButtonLoading(submitButton);
    }

    const inputs = form.querySelectorAll('input, select, textarea, button');
    inputs.forEach(input => {
        input.disabled = false;
    });
}

// Make functions globally available
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showTableSkeleton = showTableSkeleton;
window.hideTableSkeleton = hideTableSkeleton;
window.showButtonLoading = showButtonLoading;
window.hideButtonLoading = hideButtonLoading;
window.showFormLoading = showFormLoading;
window.hideFormLoading = hideFormLoading;

