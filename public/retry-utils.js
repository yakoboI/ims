/**
 * Retry Utility
 * Provides retry logic for failed network requests
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry (should return a Promise)
 * @param {Object} options - Retry options
 * @returns {Promise} - Promise that resolves with function result
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        backoffMultiplier = 2,
        retryableErrors = ['NetworkError', 'TimeoutError', 'Failed to fetch']
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            // Check if error is retryable
            const isRetryable = retryableErrors.some(errorType => 
                error.name === errorType || 
                error.message.includes(errorType) ||
                error.message.includes('network') ||
                error.message.includes('timeout')
            );

            // Don't retry if not retryable or if it's the last attempt
            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                initialDelay * Math.pow(backoffMultiplier, attempt),
                maxDelay
            );

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Enhanced API request with retry logic
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @param {Object} retryOptions - Retry options
 * @returns {Promise} - Promise that resolves with response data
 */
async function apiRequestWithRetry(endpoint, options = {}, retryOptions = {}) {
    return retryWithBackoff(async () => {
        return await apiRequest(endpoint, options);
    }, retryOptions);
}

// Make functions globally available
window.retryWithBackoff = retryWithBackoff;
window.apiRequestWithRetry = apiRequestWithRetry;

