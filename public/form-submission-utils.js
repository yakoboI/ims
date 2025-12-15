/**
 * Form Submission Utilities
 * Provides consistent form submission handling with loading states and validation
 */

/**
 * Handle form submission with loading state
 * @param {HTMLFormElement} form - Form element
 * @param {Function} submitHandler - Async function to handle submission
 * @param {Object} options - Options
 */
async function handleFormSubmission(form, submitHandler, options = {}) {
    const {
        disableSubmitButton = true,
        showLoadingState = true,
        preventDoubleSubmit = true,
        validateBeforeSubmit = true,
        successMessage = 'Saved successfully',
        errorMessage = 'Error saving data'
    } = options;
    
    // Prevent double submission
    if (preventDoubleSubmit && form.dataset.submitting === 'true') {
        return;
    }
    
    // Validate form if needed
    if (validateBeforeSubmit && !form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Get submit button
    const submitButton = form.querySelector('button[type="submit"]') || 
                        form.querySelector('input[type="submit"]') ||
                        form.querySelector('.btn-primary');
    
    const originalButtonText = submitButton ? submitButton.innerHTML : '';
    const originalButtonDisabled = submitButton ? submitButton.disabled : false;
    
    try {
        // Set submitting state
        form.dataset.submitting = 'true';
        
        // Disable submit button
        if (disableSubmitButton && submitButton) {
            submitButton.disabled = true;
            if (showLoadingState) {
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }
        }
        
        // Show loading state on form
        if (showLoadingState) {
            form.classList.add('submitting');
        }
        
        // Execute submit handler
        await submitHandler(form);
        
        // Show success message
        if (successMessage && window.showNotification) {
            showNotification(successMessage, 'success');
        }
        
    } catch (error) {
        // Show error message
        const errorMsg = error.message || errorMessage;
        if (window.showNotification) {
            showNotification(errorMsg, 'error');
        }
        
        // Announce error to screen readers
        if (window.AccessibilityUtils && typeof window.AccessibilityUtils.announceError === 'function') {
            window.AccessibilityUtils.announceError(errorMsg);
        }
        
        throw error;
    } finally {
        // Reset submitting state
        form.dataset.submitting = 'false';
        
        // Re-enable submit button
        if (disableSubmitButton && submitButton) {
            submitButton.disabled = originalButtonDisabled;
            if (showLoadingState) {
                submitButton.innerHTML = originalButtonText;
            }
        }
        
        // Remove loading state
        if (showLoadingState) {
            form.classList.remove('submitting');
        }
    }
}

/**
 * Add form submission handler to a form
 * @param {string|HTMLFormElement} formSelector - Form selector or element
 * @param {Function} submitHandler - Async function to handle submission
 * @param {Object} options - Options
 */
function setupFormSubmission(formSelector, submitHandler, options = {}) {
    const form = typeof formSelector === 'string' 
        ? document.querySelector(formSelector) 
        : formSelector;
    
    if (!form) {
        console.error('Form not found:', formSelector);
        return;
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFormSubmission(form, submitHandler, options);
    });
}

// Export for use in other files
window.handleFormSubmission = handleFormSubmission;
window.setupFormSubmission = setupFormSubmission;

