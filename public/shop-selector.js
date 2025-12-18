// Shop Selector Component for Superadmin
// Allows superadmin to switch between shops to view their data

let selectedShopId = null;
let shopsList = [];

// Expose selectedShopId globally for apiRequest to use
window.selectedShopId = selectedShopId;

// Initialize shop selector
async function initShopSelector() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    
    // Only show for superadmin
    if (!currentUser || currentUser.role !== 'superadmin') {
        return;
    }

    try {
        // Load shops
        shopsList = await apiRequest('/shops');
        
        // Create shop selector HTML
        const viewShopLabel = window.i18n ? window.i18n.t('dashboard.viewShop') : 'View Shop:';
        const allShopsOption = window.i18n ? window.i18n.t('dashboard.allShops') : 'All Shops';
        const viewAllShopsTitle = window.i18n ? window.i18n.t('dashboard.viewAllShops') : 'View All Shops';
        const allShopsButtonText = window.i18n ? window.i18n.t('dashboard.allShops') : 'All Shops';
        
        const shopSelectorHTML = `
            <div id="shopSelectorContainer" class="shop-selector-container">
                <label for="shopSelector" class="shop-selector-label">
                    <i class="fas fa-store"></i> ${viewShopLabel}
                </label>
                <select id="shopSelector" class="shop-selector" onchange="handleShopSelection(event)">
                    <option value="">${allShopsOption}</option>
                    ${shopsList.map(shop => `
                        <option value="${shop.id}" ${selectedShopId === shop.id ? 'selected' : ''}>
                            ${escapeHtml(shop.shop_name)} (${escapeHtml(shop.shop_code)})
                        </option>
                    `).join('')}
                </select>
                ${selectedShopId ? `
                    <button class="btn btn-secondary" onclick="clearShopSelection()" title="${viewAllShopsTitle}">
                        <i class="fas fa-store"></i> <span class="btn-text">${allShopsButtonText}</span>
                    </button>
                ` : ''}
            </div>
        `;

        // Insert shop selector into page header
        const pageHeader = document.querySelector('.page-header');
        if (pageHeader) {
            const existingSelector = document.getElementById('shopSelectorContainer');
            if (existingSelector) {
                existingSelector.remove();
            }
            pageHeader.insertAdjacentHTML('afterbegin', shopSelectorHTML);
        }

        // Load saved selection from localStorage
        const savedShopId = localStorage.getItem('selectedShopId');
        if (savedShopId) {
            selectedShopId = parseInt(savedShopId);
            window.selectedShopId = selectedShopId; // Update global reference
            const selector = document.getElementById('shopSelector');
            if (selector) {
                selector.value = savedShopId;
            }
        } else {
            window.selectedShopId = null; // Ensure global reference is set
        }

        // Store shop list globally for other functions
        window.shopsList = shopsList;
    } catch (error) {
        console.error('Error initializing shop selector:', error);
    }
}

// Handle shop selection change
function handleShopSelection(event) {
    const shopId = event.target.value;
    selectedShopId = shopId ? parseInt(shopId) : null;
    
    // Update global reference
    window.selectedShopId = selectedShopId;
    
    // Save to localStorage
    if (selectedShopId) {
        localStorage.setItem('selectedShopId', selectedShopId.toString());
    } else {
        localStorage.removeItem('selectedShopId');
    }

    // Reload current page data
    reloadPageData();
    
    // Update system name display when shop changes
    if (window.updateSystemNameDisplay) {
        window.updateSystemNameDisplay();
    }
}

// Clear shop selection
function clearShopSelection() {
    selectedShopId = null;
    window.selectedShopId = null; // Update global reference
    localStorage.removeItem('selectedShopId');
    const selector = document.getElementById('shopSelector');
    if (selector) {
        selector.value = '';
    }
    reloadPageData();
    
    // Update system name display when shop selection is cleared
    if (window.updateSystemNameDisplay) {
        window.updateSystemNameDisplay();
    }
}

// Reload page data based on current page
function reloadPageData() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || path;
    
    // Reload data based on current page
    if (filename.includes('dashboard.html') || filename === 'dashboard.html') {
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        } else if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
    } else if (filename.includes('inventory.html') || filename === 'inventory.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        }
    } else if (filename.includes('inventory-items.html') || filename === 'inventory-items.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        }
    } else if (filename.includes('inventory-operations.html') || filename === 'inventory-operations.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        } else if (typeof loadOperations === 'function') {
            loadOperations();
        }
    } else if (filename.includes('goods-prices.html') || filename === 'goods-prices.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        } else if (typeof loadPrices === 'function') {
            loadPrices();
        }
    } else if (filename.includes('stock-manage.html') || filename === 'stock-manage.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        } else if (typeof loadStock === 'function') {
            loadStock();
        }
    } else if (filename.includes('goods-barcodes.html') || filename === 'goods-barcodes.html') {
        if (typeof loadItems === 'function') {
            loadItems();
        } else if (typeof loadBarcodes === 'function') {
            loadBarcodes();
        }
    } else if (filename.includes('sales.html') || filename === 'sales.html') {
        if (typeof loadSales === 'function') {
            loadSales();
        }
    } else if (filename.includes('purchases.html') || filename === 'purchases.html') {
        if (typeof loadPurchases === 'function') {
            loadPurchases();
        }
    } else if (filename.includes('users.html') || filename === 'users.html') {
        if (typeof loadUsers === 'function') {
            loadUsers();
        }
    } else if (filename.includes('categories.html') || filename === 'categories.html') {
        if (typeof loadCategories === 'function') {
            loadCategories();
        }
    } else if (filename.includes('customers.html') || filename === 'customers.html') {
        if (typeof loadCustomers === 'function') {
            loadCustomers();
        }
    } else if (filename.includes('suppliers.html') || filename === 'suppliers.html') {
        if (typeof loadSuppliers === 'function') {
            loadSuppliers();
        }
    } else if (filename.includes('expenses.html') || filename === 'expenses.html') {
        if (typeof loadExpenses === 'function') {
            loadExpenses();
        }
    } else if (filename.includes('settings.html') || filename === 'settings.html') {
        if (typeof loadSettings === 'function') {
            loadSettings();
        }
    } else if (filename.includes('invoices.html') || filename === 'invoices.html') {
        if (typeof loadInvoices === 'function') {
            loadInvoices();
        }
    } else if (filename.includes('receipts.html') || filename === 'receipts.html') {
        if (typeof loadReceipts === 'function') {
            loadReceipts();
        }
    } else if (filename.includes('reports.html') || filename === 'reports.html') {
        // Refresh analytics overview first
        if (typeof loadAnalyticsOverview === 'function') {
            loadAnalyticsOverview();
        }
        // Then refresh the current report
        if (typeof showReport === 'function') {
            // Get current report type from active tab
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const reportType = activeTab.getAttribute('data-report') || activeTab.id.replace('tab-', '') || 'stock';
                showReport(reportType);
            } else {
                // Default to stock report
                showReport('stock');
            }
        } else if (typeof loadReports === 'function') {
            loadReports();
        }
    } else if (filename.includes('shop-statistics.html') || filename === 'shop-statistics.html') {
        if (typeof loadShopStatistics === 'function') {
            loadShopStatistics();
        }
    }
    
    // Show notification
    const shopName = selectedShopId 
        ? shopsList.find(s => s.id === selectedShopId)?.shop_name || 'Selected Shop'
        : 'All Shops';
    if (typeof showNotification === 'function') {
        const viewingMessage = window.i18n ? window.i18n.t('dashboard.viewingDataFor', {shopName: shopName}) : `Viewing data for: ${shopName}`;
        showNotification(viewingMessage, 'success');
    } else {
        console.log(`Viewing data for: ${shopName}`);
    }
}

// Get current shop filter for API requests
function getShopFilterForRequest() {
    return selectedShopId ? { shop_id: selectedShopId } : {};
}

// Enhanced API request wrapper that includes shop filter
async function apiRequestWithShopFilter(endpoint, method = 'GET', body = null) {
    const shopFilter = getShopFilterForRequest();
    let url = endpoint;
    
    // Add shop_id to query params for GET requests
    if (method === 'GET' && shopFilter.shop_id) {
        const separator = endpoint.includes('?') ? '&' : '?';
        url = `${endpoint}${separator}shop_id=${shopFilter.shop_id}`;
    }
    
    // Add shop_id to body for POST/PUT requests
    if ((method === 'POST' || method === 'PUT') && shopFilter.shop_id && body) {
        body = { ...body, ...shopFilter };
    }
    
    // Use the global apiRequest function
    if (method === 'GET') {
        return apiRequest(url);
    } else {
        return apiRequest(url, { method, body });
    }
}

// Escape HTML helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions globally
window.initShopSelector = initShopSelector;
window.handleShopSelection = handleShopSelection;
window.clearShopSelection = clearShopSelection;
window.getShopFilterForRequest = getShopFilterForRequest;

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initShopSelector, 500); // Wait for app.js to load
    });
} else {
    setTimeout(initShopSelector, 500);
}

