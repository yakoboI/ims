/**
 * Error Handling Utilities
 * Provides user-friendly error messages and retry functionality
 */

/**
 * Show user-friendly error message with retry option
 * @param {Error|string} error - Error object or error message
 * @param {Object} options - Options
 */
function showErrorWithRetry(error, options = {}) {
    const {
        message = null,
        retryCallback = null,
        retryLabel = 'Retry',
        showDetails = false,
        context = ''
    } = options;
    
    let errorMessage = message || (error instanceof Error ? error.message : error);
    
    // Make error messages more user-friendly
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Network connection error. Please check your internet connection and try again.';
    } else if (errorMessage.includes('404')) {
        errorMessage = 'The requested resource was not found. It may have been moved or deleted.';
    } else if (errorMessage.includes('500')) {
        errorMessage = 'Server error occurred. Please try again in a moment or contact support.';
    } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorMessage = 'You do not have permission to perform this action.';
    } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
    }
    
    // Add context if provided
    if (context) {
        errorMessage = `${context}: ${errorMessage}`;
    }
    
    // Create error notification with retry button
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    
    let retryButtonHTML = '';
    if (retryCallback && typeof retryCallback === 'function') {
        retryButtonHTML = `
            <button class="btn btn-sm" onclick="
                this.parentElement.remove();
                (${retryCallback.toString()})();
            " style="margin-top: 0.5rem; background: white; color: #991b1b; border: 1px solid #991b1b;">
                ${retryLabel}
            </button>
        `;
    }
    
    notification.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <span style="flex-shrink: 0; font-size: 1.25rem;">✕</span>
            <div style="flex: 1;">
                <div>${escapeHtml(errorMessage)}</div>
                ${retryButtonHTML}
                ${showDetails && error instanceof Error && error.stack ? `
                    <details style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.8;">
                        <summary style="cursor: pointer;">Show details</summary>
                        <pre style="margin-top: 0.5rem; white-space: pre-wrap; word-break: break-word;">${escapeHtml(error.stack)}</pre>
                    </details>
                ` : ''}
            </div>
            <button class="notification-close" aria-label="Close notification" onclick="this.parentElement.parentElement.remove();" style="
                background: none;
                border: none;
                color: #991b1b;
                cursor: pointer;
                font-size: 1.25rem;
                line-height: 1;
                padding: 0;
                opacity: 0.7;
                flex-shrink: 0;
            ">×</button>
        </div>
    `;
    
    // Use showNotification if available, otherwise create custom notification
    if (window.showNotification) {
        // For retry functionality, we need custom notification
        const container = document.getElementById('notification-container') || document.body;
        notification.style.cssText = `
            padding: 1rem 1.5rem;
            background: #fee2e2;
            color: #991b1b;
            border-left: 4px solid #ef4444;
            border-radius: 0;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            margin-bottom: 10px;
            animation: slideInRight 0.3s ease;
            pointer-events: auto;
            max-width: 100%;
        `;
        container.appendChild(notification);
    } else {
        showNotification(errorMessage, 'error');
    }
    
    // Announce to screen readers
    if (window.AccessibilityUtils && typeof window.AccessibilityUtils.announceError === 'function') {
        window.AccessibilityUtils.announceError(errorMessage);
    }
}

/**
 * Handle API errors with retry functionality
 * @param {Error} error - Error object
 * @param {Function} retryCallback - Function to retry the operation
 * @param {string} context - Context of the error
 */
function handleApiError(error, retryCallback = null, context = '') {
    const isNetworkError = error.message.includes('fetch') || 
                          error.message.includes('network') ||
                          error.message.includes('Failed to fetch');
    
    showErrorWithRetry(error, {
        retryCallback: isNetworkError && retryCallback ? retryCallback : null,
        retryLabel: 'Retry',
        context: context,
        showDetails: process.env.NODE_ENV === 'development'
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export for use in other files
window.showErrorWithRetry = showErrorWithRetry;
window.handleApiError = handleApiError;

