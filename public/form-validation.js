/**
 * Client-Side Form Validation Utility
 * Provides real-time validation feedback and visual indicators
 */

/**
 * Initialize form validation for a form element
 * @param {HTMLFormElement} form - The form element to validate
 * @param {Object} rules - Validation rules object
 */
function initFormValidation(form, rules = {}) {
    if (!form) return;

    const inputs = form.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
        // Real-time validation on blur
        input.addEventListener('blur', () => validateField(input, rules[input.id] || rules[input.name]));
        
        // Clear errors on input
        input.addEventListener('input', () => {
            if (input.classList.contains('error')) {
                clearFieldError(input);
            }
        });
    });

    // Validate on submit
    form.addEventListener('submit', (e) => {
        let isValid = true;
        
        inputs.forEach(input => {
            if (!validateField(input, rules[input.id] || rules[input.name])) {
                isValid = false;
            }
        });

        if (!isValid) {
            e.preventDefault();
            // Focus first invalid field
            const firstError = form.querySelector('.error');
            if (firstError) {
                firstError.focus();
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}

/**
 * Validate a single field
 * @param {HTMLElement} field - The input field to validate
 * @param {Object} rule - Validation rule object
 * @returns {boolean} - Whether the field is valid
 */
function validateField(field, rule = {}) {
    if (!field) return true;
    
    const value = field.value.trim();
    const fieldId = field.id || field.name;
    const fieldLabel = field.labels?.[0]?.textContent || fieldId;
    
    // Remove existing error
    clearFieldError(field);

    // Required validation
    if (rule.required !== false && field.hasAttribute('required')) {
        if (!value) {
            showFieldError(field, `${fieldLabel} is required`);
            return false;
        }
    }

    // Skip other validations if field is empty and not required
    if (!value && !field.hasAttribute('required')) {
        return true;
    }

    // Min length validation
    if (rule.minLength && value.length < rule.minLength) {
        showFieldError(field, `${fieldLabel} must be at least ${rule.minLength} characters`);
        return false;
    }

    // Max length validation
    if (rule.maxLength && value.length > rule.maxLength) {
        showFieldError(field, `${fieldLabel} must be no more than ${rule.maxLength} characters`);
        return false;
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
        showFieldError(field, rule.patternMessage || `${fieldLabel} format is invalid`);
        return false;
    }

    // Email validation
    if (rule.type === 'email' || field.type === 'email') {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
            showFieldError(field, 'Please enter a valid email address');
            return false;
        }
    }

    // Number validation
    if (rule.type === 'number' || field.type === 'number') {
        const num = parseFloat(value);
        if (isNaN(num)) {
            showFieldError(field, `${fieldLabel} must be a valid number`);
            return false;
        }
        if (rule.min !== undefined && num < rule.min) {
            showFieldError(field, `${fieldLabel} must be at least ${rule.min}`);
            return false;
        }
        if (rule.max !== undefined && num > rule.max) {
            showFieldError(field, `${fieldLabel} must be no more than ${rule.max}`);
            return false;
        }
    }

    // Custom validation function
    if (rule.custom && typeof rule.custom === 'function') {
        const customResult = rule.custom(value, field);
        if (customResult !== true) {
            showFieldError(field, customResult || `${fieldLabel} is invalid`);
            return false;
        }
    }

    // Show success indicator
    showFieldSuccess(field);
    return true;
}

/**
 * Show error message for a field
 * @param {HTMLElement} field - The input field
 * @param {string} message - Error message
 */
function showFieldError(field, message) {
    field.classList.add('error');
    field.setAttribute('aria-invalid', 'true');
    
    // Remove existing error message
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }

    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'polite');
    errorElement.textContent = message;
    
    // Insert after field
    field.parentElement.appendChild(errorElement);
    
    // Announce to screen readers
    field.setAttribute('aria-describedby', `error-${field.id || field.name}`);
    errorElement.id = `error-${field.id || field.name}`;
}

/**
 * Show success indicator for a field
 * @param {HTMLElement} field - The input field
 */
function showFieldSuccess(field) {
    field.classList.remove('error');
    field.classList.add('success');
    field.setAttribute('aria-invalid', 'false');
    
    // Remove error message if exists
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

/**
 * Clear error from a field
 * @param {HTMLElement} field - The input field
 */
function clearFieldError(field) {
    field.classList.remove('error', 'success');
    field.removeAttribute('aria-invalid');
    
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    const errorId = `error-${field.id || field.name}`;
    field.removeAttribute('aria-describedby');
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.remove();
    }
}

/**
 * Validate entire form
 * @param {HTMLFormElement} form - The form element
 * @param {Object} rules - Validation rules
 * @returns {boolean} - Whether form is valid
 */
function validateForm(form, rules = {}) {
    if (!form) return false;
    
    const inputs = form.querySelectorAll('input, select, textarea');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!validateField(input, rules[input.id] || rules[input.name])) {
            isValid = false;
        }
    });
    
    return isValid;
}

// Common validation rules
const ValidationRules = {
    username: {
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_]+$/,
        patternMessage: 'Username can only contain letters, numbers, and underscores'
    },
    email: {
        required: true,
        type: 'email'
    },
    password: {
        required: true,
        minLength: 8,
        custom: (value) => {
            if (!/[A-Z]/.test(value)) {
                return 'Password must contain at least one uppercase letter';
            }
            if (!/[a-z]/.test(value)) {
                return 'Password must contain at least one lowercase letter';
            }
            if (!/[0-9]/.test(value)) {
                return 'Password must contain at least one number';
            }
            return true;
        }
    },
    price: {
        required: true,
        type: 'number',
        min: 0
    },
    quantity: {
        required: true,
        type: 'number',
        min: 0
    }
};

// Make functions globally available
window.initFormValidation = initFormValidation;
window.validateField = validateField;
window.validateForm = validateForm;
window.ValidationRules = ValidationRules;

