/**
 * SKU Utility Functions
 * Handles SKU validation, generation, and formatting
 */

const SKUUtils = {
    /**
     * Validate SKU format
     * @param {string} sku - SKU to validate
     * @returns {Object} - { valid: boolean, message: string }
     */
    validate(sku) {
        if (!sku || typeof sku !== 'string') {
            return { valid: false, message: 'SKU is required' };
        }

        const trimmed = sku.trim();

        // Empty SKU is allowed (optional field)
        if (trimmed.length === 0) {
            return { valid: true };
        }

        // Minimum length
        if (trimmed.length < 2) {
            return { valid: false, message: 'SKU must be at least 2 characters' };
        }

        // Maximum length
        if (trimmed.length > 50) {
            return { valid: false, message: 'SKU must be no more than 50 characters' };
        }

        // Allowed characters: alphanumeric, hyphens, underscores, dots
        // No spaces allowed
        if (/\s/.test(trimmed)) {
            return { valid: false, message: 'SKU cannot contain spaces' };
        }

        // Must start with alphanumeric
        if (!/^[A-Za-z0-9]/.test(trimmed)) {
            return { valid: false, message: 'SKU must start with a letter or number' };
        }

        // Allowed characters: A-Z, a-z, 0-9, -, _, .
        if (!/^[A-Za-z0-9\-_.]+$/.test(trimmed)) {
            return { valid: false, message: 'SKU can only contain letters, numbers, hyphens, underscores, and dots' };
        }

        return { valid: true };
    },

    /**
     * Format SKU (uppercase, trim, remove extra spaces)
     * @param {string} sku - SKU to format
     * @param {Object} options - Formatting options
     * @returns {string} - Formatted SKU
     */
    format(sku, options = {}) {
        if (!sku || typeof sku !== 'string') {
            return '';
        }

        let formatted = sku.trim();

        // Remove spaces
        formatted = formatted.replace(/\s+/g, '');

        // Uppercase by default (can be overridden)
        if (options.uppercase !== false) {
            formatted = formatted.toUpperCase();
        }

        // Remove special characters if option is set
        if (options.removeSpecialChars) {
            formatted = formatted.replace(/[^A-Za-z0-9]/g, '');
        }

        return formatted;
    },

    /**
     * Generate SKU from item name
     * @param {string} name - Item name
     * @param {number} categoryId - Category ID (optional)
     * @param {Object} options - Generation options
     * @returns {string} - Generated SKU
     */
    generateFromName(name, categoryId = null, options = {}) {
        if (!name || typeof name !== 'string') {
            return '';
        }

        const prefix = options.prefix || '';
        const length = options.length || 8;
        const includeCategory = options.includeCategory !== false && categoryId;

        // Clean name: remove special chars, keep only alphanumeric
        let cleanName = name.replace(/[^A-Za-z0-9\s]/g, '');
        
        // Get first letters of words
        const words = cleanName.split(/\s+/).filter(w => w.length > 0);
        let sku = words.map(w => w.charAt(0).toUpperCase()).join('');

        // If too short, add more characters from first word
        if (sku.length < 3 && words.length > 0) {
            const firstWord = words[0];
            sku = firstWord.substring(0, Math.min(3, firstWord.length)).toUpperCase();
        }

        // Add category prefix if needed
        if (includeCategory && options.categoryPrefix) {
            sku = options.categoryPrefix + sku;
        }

        // Add custom prefix
        if (prefix) {
            sku = prefix + sku;
        }

        // Add timestamp suffix for uniqueness
        const timestamp = Date.now().toString().slice(-4);
        sku = sku + timestamp;

        // Limit length
        if (sku.length > length) {
            sku = sku.substring(0, length);
        }

        return sku;
    },

    /**
     * Generate sequential SKU
     * @param {string} prefix - SKU prefix
     * @param {number} number - Sequential number
     * @param {number} padding - Zero padding length
     * @returns {string} - Generated SKU
     */
    generateSequential(prefix = 'SKU', number = 1, padding = 4) {
        const paddedNumber = number.toString().padStart(padding, '0');
        return `${prefix}-${paddedNumber}`;
    },

    /**
     * Check if SKU is unique (client-side check)
     * Note: This is a helper, actual uniqueness is enforced by server
     * @param {string} sku - SKU to check
     * @param {Array} existingItems - Array of existing items
     * @param {number} excludeId - Item ID to exclude from check (for updates)
     * @returns {boolean} - True if unique
     */
    isUnique(sku, existingItems = [], excludeId = null) {
        if (!sku || sku.trim().length === 0) {
            return true; // Empty SKU is allowed
        }

        const normalized = sku.trim().toUpperCase();
        
        return !existingItems.some(item => {
            if (excludeId && item.id === excludeId) {
                return false; // Exclude current item
            }
            return item.sku && item.sku.trim().toUpperCase() === normalized;
        });
    },

    /**
     * Suggest SKU based on item name
     * @param {string} name - Item name
     * @param {Array} existingItems - Existing items to avoid duplicates
     * @param {Object} options - Options
     * @returns {string} - Suggested SKU
     */
    suggest(name, existingItems = [], options = {}) {
        if (!name || typeof name !== 'string') {
            return '';
        }

        let suggested = this.generateFromName(name, null, options);
        
        // Check if unique, if not, add suffix
        if (!this.isUnique(suggested, existingItems)) {
            let counter = 1;
            let baseSku = suggested;
            
            // Remove timestamp if present
            if (baseSku.length > 4 && /^\d+$/.test(baseSku.slice(-4))) {
                baseSku = baseSku.slice(0, -4);
            }
            
            while (!this.isUnique(baseSku + counter, existingItems) && counter < 1000) {
                counter++;
            }
            
            suggested = baseSku + counter;
        }

        return suggested;
    }
};

// Make globally available
window.SKUUtils = SKUUtils;

