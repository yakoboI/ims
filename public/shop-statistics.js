// Shop Statistics JavaScript

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0.00';
    return parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let currentShopId = null;

// Load shop statistics
async function loadShopStatistics(shopId = null) {
    currentShopId = shopId;
    
    const cardsContainer = document.getElementById('statisticsCards');
    if (cardsContainer) {
        cardsContainer.innerHTML = '<div class="text-center"><p>Loading statistics...</p></div>';
    }
    
    try {
        let stats;
        if (shopId) {
            // Load specific shop statistics
            stats = await apiRequest(`/shops/${shopId}/statistics`);
            renderShopStatistics(stats, shopId);
        } else {
            // Load all shops summary (superadmin only)
            const shops = await apiRequest('/shops/statistics/summary');
            renderAllShopsSummary(shops);
        }
    } catch (error) {
        console.error('Error loading shop statistics:', error);
        const errorMessage = error.message || 'Error loading shop statistics';
        showNotification(errorMessage, 'error');
        
        // Show error in cards container
        if (cardsContainer) {
            cardsContainer.innerHTML = `
                <div class="text-center error" style="grid-column: 1 / -1; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--danger); margin-bottom: 1rem;"></i>
                    <h3>Error Loading Statistics</h3>
                    <p>${escapeHtml(errorMessage)}</p>
                    <button class="btn btn-primary" onclick="refreshStatistics()" style="margin-top: 1rem;">
                        <i class="fas fa-sync-alt"></i> Try Again
                    </button>
                </div>
            `;
        }
    }
}

// Render single shop statistics
function renderShopStatistics(stats, shopId) {
    const cardsContainer = document.getElementById('statisticsCards');
    const comparisonSection = document.getElementById('shopComparisonSection');
    
    if (!cardsContainer) return;
    
    // Hide comparison section for single shop view
    if (comparisonSection) {
        comparisonSection.style.display = 'none';
    }
    
    // Get shop name
    const shop = window.shopsList ? window.shopsList.find(s => s.id === shopId) : null;
    const shopName = shop ? shop.shop_name : 'Shop';
    
    cardsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-boxes fa-icon-primary" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${escapeHtml(shopName)}</h3>
                <p class="stat-label">Shop Statistics</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #f0fdf4;">
                <i class="fas fa-cube fa-icon-success" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${stats.totalItems || 0}</h3>
                <p class="stat-label">Total Items</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #fef3c7;">
                <i class="fas fa-exclamation-triangle fa-icon-warning" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${stats.lowStockItems || 0}</h3>
                <p class="stat-label">Low Stock Items</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #f0fdf4;">
                <i class="fas fa-dollar-sign fa-icon-success" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${formatCurrency(stats.todaySales?.total || 0)}</h3>
                <p class="stat-label">Today's Sales (${stats.todaySales?.count || 0} transactions)</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-chart-line fa-icon-info" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${formatCurrency(stats.monthSales?.total || 0)}</h3>
                <p class="stat-label">This Month's Sales (${stats.monthSales?.count || 0} transactions)</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #fef3c7;">
                <i class="fas fa-shopping-cart fa-icon-warning" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${formatCurrency(stats.todayPurchases?.total || 0)}</h3>
                <p class="stat-label">Today's Purchases (${stats.todayPurchases?.count || 0} orders)</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-users fa-icon-primary" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${stats.totalUsers || 0}</h3>
                <p class="stat-label">Active Users</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #f0fdf4;">
                <i class="fas fa-tags fa-icon-success" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${stats.totalCategories || 0}</h3>
                <p class="stat-label">Categories</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #fef3c7;">
                <i class="fas fa-truck fa-icon-warning" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${stats.totalSuppliers || 0}</h3>
                <p class="stat-label">Suppliers</p>
            </div>
        </div>
    `;
}

// Render all shops summary (superadmin)
function renderAllShopsSummary(shops) {
    const cardsContainer = document.getElementById('statisticsCards');
    const comparisonSection = document.getElementById('shopComparisonSection');
    const comparisonBody = document.getElementById('shopComparisonBody');
    
    if (!cardsContainer) return;
    
    // Show comparison section
    if (comparisonSection) {
        comparisonSection.style.display = 'block';
    }
    
    // Render summary cards
    const totalShops = shops.length;
    const totalItems = shops.reduce((sum, s) => sum + (s.total_items || 0), 0);
    const totalLowStock = shops.reduce((sum, s) => sum + (s.low_stock_items || 0), 0);
    const totalTodaySales = shops.reduce((sum, s) => sum + (parseFloat(s.today_sales) || 0), 0);
    const totalMonthSales = shops.reduce((sum, s) => sum + (parseFloat(s.month_sales) || 0), 0);
    const totalUsers = shops.reduce((sum, s) => sum + (s.total_users || 0), 0);
    
    cardsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-store fa-icon-primary" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${totalShops}</h3>
                <p class="stat-label">Total Shops</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #f0fdf4;">
                <i class="fas fa-cube fa-icon-success" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${totalItems}</h3>
                <p class="stat-label">Total Items (All Shops)</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #fef3c7;">
                <i class="fas fa-exclamation-triangle fa-icon-warning" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${totalLowStock}</h3>
                <p class="stat-label">Low Stock Items (All Shops)</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #f0fdf4;">
                <i class="fas fa-dollar-sign fa-icon-success" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${formatCurrency(totalTodaySales)}</h3>
                <p class="stat-label">Today's Total Sales</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-chart-line fa-icon-info" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${formatCurrency(totalMonthSales)}</h3>
                <p class="stat-label">This Month's Total Sales</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon" style="background: #eff6ff;">
                <i class="fas fa-users fa-icon-primary" style="font-size: 2rem;"></i>
            </div>
            <div class="stat-card-content">
                <h3>${totalUsers}</h3>
                <p class="stat-label">Total Active Users</p>
            </div>
        </div>
    `;
    
    // Render comparison table
    if (comparisonBody && shops.length > 0) {
        comparisonBody.innerHTML = shops.map(shop => `
            <tr>
                <td data-label="Shop Name">${escapeHtml(shop.shop_name || '')}</td>
                <td data-label="Code"><code>${escapeHtml(shop.shop_code || '')}</code></td>
                <td data-label="Users">${shop.total_users || 0}</td>
                <td data-label="Items">${shop.total_items || 0}</td>
                <td data-label="Low Stock">
                    <span class="badge ${shop.low_stock_items > 0 ? 'badge-warning' : 'badge-success'}">
                        ${shop.low_stock_items || 0}
                    </span>
                </td>
                <td data-label="Today Sales">${formatCurrency(shop.today_sales || 0)}</td>
                <td data-label="Month Sales">${formatCurrency(shop.month_sales || 0)}</td>
                <td data-label="Status">
                    <span class="badge ${shop.status === 'active' ? 'badge-success' : shop.status === 'suspended' ? 'badge-danger' : 'badge-secondary'}">
                        ${escapeHtml(shop.status || 'active')}
                    </span>
                </td>
            </tr>
        `).join('');
    } else if (comparisonBody) {
        comparisonBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 2rem;">No shops found</td></tr>';
    }
}

// Refresh statistics
async function refreshStatistics() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    
    if (currentUser && currentUser.role === 'superadmin') {
        // Superadmin: load all shops summary or selected shop
        const selectedShopId = window.selectedShopId || null;
        await loadShopStatistics(selectedShopId);
    } else if (currentUser && currentUser.shop_id) {
        // Shop admin: load their shop statistics
        await loadShopStatistics(currentUser.shop_id);
    }
}

// Initialize shop selector for statistics page
async function initShopStatsSelector() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const selectorContainer = document.getElementById('shopStatsSelector');
    
    if (!selectorContainer) return;
    
    if (currentUser && currentUser.role === 'superadmin') {
        try {
            const shops = await apiRequest('/shops');
            window.shopsList = shops;
            
            selectorContainer.innerHTML = `
                <div class="shop-selector-container">
                    <label for="shopStatsSelect" class="shop-selector-label">
                        <i class="fas fa-store"></i> Select Shop:
                    </label>
                    <select id="shopStatsSelect" class="shop-selector" onchange="handleShopStatsSelection(event)">
                        <option value="">All Shops Summary</option>
                        ${shops.map(shop => `
                            <option value="${shop.id}">${escapeHtml(shop.shop_name)} (${escapeHtml(shop.shop_code)})</option>
                        `).join('')}
                    </select>
                </div>
            `;
            
            // Load default (all shops summary)
            await loadShopStatistics(null);
        } catch (error) {
            console.error('Error initializing shop stats selector:', error);
        }
    } else if (currentUser && currentUser.shop_id) {
        // Shop admin: show their shop only
        selectorContainer.innerHTML = `
            <div class="shop-selector-container">
                <label class="shop-selector-label">
                    <i class="fas fa-store"></i> Shop: ${escapeHtml(currentUser.shop?.shop_name || 'Your Shop')}
                </label>
            </div>
        `;
        await loadShopStatistics(currentUser.shop_id);
    }
}

// Handle shop selection for statistics
function handleShopStatsSelection(event) {
    const shopId = event.target.value ? parseInt(event.target.value) : null;
    window.selectedShopId = shopId;
    loadShopStatistics(shopId);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            initShopStatsSelector();
        }, 500);
    });
} else {
    setTimeout(() => {
        initShopStatsSelector();
    }, 500);
}

// Expose functions globally
window.refreshStatistics = refreshStatistics;
window.handleShopStatsSelection = handleShopStatsSelection;
window.loadShopStatistics = loadShopStatistics;

