// Shop Selector Component for Superadmin
// Allows superadmin to switch between shops to view their data

let selectedShopId = null;
let shopsList = [];

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
        const shopSelectorHTML = `
            <div id="shopSelectorContainer" class="shop-selector-container">
                <label for="shopSelector" class="shop-selector-label">
                    <i class="fas fa-store"></i> View Shop:
                </label>
                <select id="shopSelector" class="shop-selector" onchange="handleShopSelection(event)">
                    <option value="">All Shops</option>
                    ${shopsList.map(shop => `
                        <option value="${shop.id}" ${selectedShopId === shop.id ? 'selected' : ''}>
                            ${escapeHtml(shop.shop_name)} (${escapeHtml(shop.shop_code)})
                        </option>
                    `).join('')}
                </select>
                ${selectedShopId ? `
                    <button class="btn btn-secondary" onclick="clearShopSelection()" title="View All Shops">
                        <i class="fas fa-store"></i> <span class="btn-text">All Shops</span>
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
            const selector = document.getElementById('shopSelector');
            if (selector) {
                selector.value = savedShopId;
            }
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
    
    // Save to localStorage
    if (selectedShopId) {
        localStorage.setItem('selectedShopId', selectedShopId.toString());
    } else {
        localStorage.removeItem('selectedShopId');
    }

    // Reload current page data
    reloadPageData();
}

// Clear shop selection
function clearShopSelection() {
    selectedShopId = null;
    localStorage.removeItem('selectedShopId');
    const selector = document.getElementById('shopSelector');
    if (selector) {
        selector.value = '';
    }
    reloadPageData();
}

// Reload page data based on current page
function reloadPageData() {
    const path = window.location.pathname;
    
    // Reload data based on current page
    if (path.includes('dashboard.html')) {
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        } else if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
    } else if (path.includes('inventory-items.html') || path.includes('inventory-operations.html') || path.includes('goods-prices.html') || path.includes('stock-manage.html')) {
        if (typeof loadItems === 'function') {
            loadItems();
        }
    } else if (path.includes('sales.html')) {
        if (typeof loadSales === 'function') {
            loadSales();
        }
    } else if (path.includes('purchases.html')) {
        if (typeof loadPurchases === 'function') {
            loadPurchases();
        }
    } else if (path.includes('users.html')) {
        if (typeof loadUsers === 'function') {
            loadUsers();
        }
    } else if (path.includes('reports.html')) {
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
    } else if (path.includes('inventory.html')) {
        if (typeof loadItems === 'function') {
            loadItems();
        }
    } else if (path.includes('users.html')) {
        if (typeof loadUsers === 'function') {
            loadUsers();
        }
    }
    
    // Show notification
    const shopName = selectedShopId 
        ? shopsList.find(s => s.id === selectedShopId)?.shop_name || 'Selected Shop'
        : 'All Shops';
    if (typeof showNotification === 'function') {
        showNotification(`Viewing data for: ${shopName}`, 'info');
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

