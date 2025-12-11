/**
 * Product Flow Management
 * Handles product/item synchronization across pages and cache management
 */

const ProductFlow = {
    // Event listeners for product updates
    listeners: new Set(),

    /**
     * Register a listener for product updates
     * @param {Function} callback - Callback function to call when products update
     */
    onProductUpdate(callback) {
        this.listeners.add(callback);
    },

    /**
     * Remove a listener
     * @param {Function} callback - Callback function to remove
     */
    offProductUpdate(callback) {
        this.listeners.delete(callback);
    },

    /**
     * Notify all listeners of product update
     * @param {Object} data - Update data
     */
    notifyListeners(data) {
        this.listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                if (window.ErrorLogger) {
                    window.ErrorLogger.log(error, {
                        type: 'product_flow_listener_error'
                    });
                }
            }
        });
    },

    /**
     * Invalidate product caches across all pages
     * @param {number|string} itemId - Item ID (optional, if null invalidates all)
     * @param {string} barcode - Barcode/SKU (optional)
     */
    invalidateProduct(itemId = null, barcode = null) {
        // Invalidate barcode cache
        if (window.BarcodeScanner) {
            if (barcode) {
                window.BarcodeScanner.invalidateBarcode(barcode);
            } else if (itemId) {
                // Try to find barcode from item
                // This would need item data, so we'll invalidate all for safety
                window.BarcodeScanner.clearCache();
            } else {
                window.BarcodeScanner.clearCache();
            }
        }

        // Notify listeners
        this.notifyListeners({
            type: 'product_invalidated',
            itemId: itemId,
            barcode: barcode
        });

        // Dispatch custom event for other scripts
        window.dispatchEvent(new CustomEvent('productUpdated', {
            detail: { itemId, barcode }
        }));
    },

    /**
     * Refresh product data on current page
     * @param {string} pageType - Type of page ('inventory', 'sales', 'purchases')
     */
    refreshPageData(pageType) {
        const page = window.location.pathname.split('/').pop() || '';
        
        switch(pageType || page) {
            case 'inventory.html':
            case 'inventory':
                if (typeof loadItems === 'function') {
                    loadItems();
                }
                break;
            case 'sales.html':
            case 'sales':
                if (typeof loadItems === 'function') {
                    loadItems();
                }
                if (typeof loadSales === 'function') {
                    loadSales();
                }
                break;
            case 'purchases.html':
            case 'purchases':
                if (typeof loadItems === 'function') {
                    loadItems();
                }
                if (typeof loadPurchases === 'function') {
                    loadPurchases();
                }
                break;
            case 'dashboard.html':
            case 'dashboard':
                if (typeof refreshDashboard === 'function') {
                    refreshDashboard();
                }
                break;
        }
    },

    /**
     * Handle product creation/update
     * @param {Object} itemData - Item data
     * @param {boolean} isNew - Whether this is a new item
     */
    handleProductChange(itemData, isNew = false) {
        // Invalidate caches
        this.invalidateProduct(itemData.id, itemData.sku);

        // Refresh current page
        this.refreshPageData();

        // Show notification
        const message = isNew 
            ? `Product "${itemData.name}" created successfully`
            : `Product "${itemData.name}" updated successfully`;
        
        if (typeof showNotification === 'function') {
            showNotification(message, 'success');
        }
    },

    /**
     * Handle product deletion/deactivation
     * @param {number} itemId - Item ID
     * @param {string} itemName - Item name
     */
    handleProductDelete(itemId, itemName) {
        // Invalidate caches
        this.invalidateProduct(itemId);

        // Refresh current page
        this.refreshPageData();

        // Show notification
        if (typeof showNotification === 'function') {
            showNotification(`Product "${itemName}" deactivated`, 'success');
        }
    }
};

// Listen for storage events (cross-tab synchronization)
window.addEventListener('storage', (e) => {
    if (e.key === 'productUpdated') {
        try {
            const data = JSON.parse(e.newValue);
            ProductFlow.invalidateProduct(data.itemId, data.barcode);
        } catch (error) {
            // Silently fail
        }
    }
});

// Make globally available
window.ProductFlow = ProductFlow;

