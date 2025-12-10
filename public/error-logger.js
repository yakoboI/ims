/**
 * Error Logger Utility
 * Centralized error logging and tracking
 */

const ErrorLogger = {
    // Error log storage (in production, this would be sent to a logging service)
    errorLogs: [],

    /**
     * Log an error
     * @param {Error|string} error - Error object or error message
     * @param {Object} context - Additional context information
     */
    log(error, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : null,
            url: window.location.href,
            userAgent: navigator.userAgent,
            context: context
        };

        // Store error
        this.errorLogs.push(errorEntry);

        // Keep only last 100 errors in memory
        if (this.errorLogs.length > 100) {
            this.errorLogs.shift();
        }

        // Log to console in development (always log in browser)
        // Check if we're in development mode by checking if console methods are available
        const isDevelopment = typeof console !== 'undefined' && console.error;
        
        if (isDevelopment) {
            console.error('Error logged:', errorEntry);
        }

        // In production, send to error tracking service
        // For browser, we'll always log to localStorage as fallback
        this.sendToErrorService(errorEntry);

        return errorEntry;
    },

    /**
     * Send error to error tracking service (e.g., Sentry)
     * @param {Object} errorEntry - Error entry object
     */
    sendToErrorService(errorEntry) {
        // This would integrate with services like Sentry, LogRocket, etc.
        // For now, we'll store in localStorage as fallback
        try {
            const storedErrors = JSON.parse(localStorage.getItem('errorLogs') || '[]');
            storedErrors.push(errorEntry);
            
            // Keep only last 50 errors in localStorage
            if (storedErrors.length > 50) {
                storedErrors.shift();
            }
            
            localStorage.setItem('errorLogs', JSON.stringify(storedErrors));
        } catch (e) {
            // Silently fail if localStorage is not available
        }
    },

    /**
     * Get all error logs
     * @returns {Array} Array of error entries
     */
    getLogs() {
        return this.errorLogs;
    },

    /**
     * Clear error logs
     */
    clearLogs() {
        this.errorLogs = [];
        try {
            localStorage.removeItem('errorLogs');
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * Get error logs from localStorage
     * @returns {Array} Array of error entries
     */
    getStoredLogs() {
        try {
            return JSON.parse(localStorage.getItem('errorLogs') || '[]');
        } catch (e) {
            return [];
        }
    }
};

// Global error handler
window.addEventListener('error', (event) => {
    ErrorLogger.log(event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    ErrorLogger.log(event.reason, {
        type: 'unhandledrejection'
    });
});

// Make ErrorLogger globally available
window.ErrorLogger = ErrorLogger;

