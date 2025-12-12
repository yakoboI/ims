function getUserRole() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return currentUser?.role || 'admin';
}

function showRoleDashboard(role) {
    document.querySelectorAll('.role-dashboard').forEach(dash => {
        dash.style.display = 'none';
    });
    
    const refreshBtn = document.getElementById('refreshBtn');
    const clearDataBtn = document.getElementById('initiateClearDataBtn');
    
    // Superadmin and admin get the same UI appearance - same buttons, same layout
    const isAdminOrSuperadmin = role === 'admin' || role === 'superadmin';
    
    if (role === 'manager') {
        if (refreshBtn) refreshBtn.style.display = 'none';
        if (clearDataBtn) clearDataBtn.style.display = 'none';
    } else if (role === 'admin') {
        // Admin only - show both refresh and clear data buttons
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        if (clearDataBtn) clearDataBtn.style.display = 'inline-block';
    } else if (role === 'superadmin') {
        // Superadmin - show refresh button but NOT clear data button
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        if (clearDataBtn) clearDataBtn.style.display = 'none';
    } else {
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        if (clearDataBtn) clearDataBtn.style.display = 'none';
    }
    
    // Superadmin uses admin dashboard (same UI, same buttons, same appearance)
    const dashboardRole = role === 'superadmin' ? 'admin' : role;
    const dashboardId = `${dashboardRole}Dashboard`;
    const dashboard = document.getElementById(dashboardId);
    if (dashboard) {
        dashboard.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const role = getUserRole();
    showRoleDashboard(role);
    await refreshDashboard();
    
    // Superadmin gets the same functionality as admin (same buttons, same features)
    const isAdminOrSuperadmin = role === 'admin' || role === 'superadmin';
    
    // Note: loadAdminClearDataStatus() is already called inside loadAdminDashboard()
    // so we don't need to call it here to avoid duplicate calls
    if (role === 'manager') {
        await checkManagerPendingRequests();
        // Check every 10 seconds for new requests
        setInterval(checkManagerPendingRequests, 10000);
    }
    
    setInterval(async () => {
        await refreshDashboard();
    }, 30000);
    
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            await refreshDashboard();
            // Note: loadAdminClearDataStatus() is already called inside loadAdminDashboard()
            // via refreshDashboard(), so no need to call it again here
            if (role === 'manager') {
                await checkManagerPendingRequests();
            }
        }
    });
    
    window.addEventListener('focus', async () => {
        await refreshDashboard();
        // Note: loadAdminClearDataStatus() is already called inside loadAdminDashboard()
        // via refreshDashboard(), so no need to call it again here
        if (role === 'manager') {
            await checkManagerPendingRequests();
        }
    });
});

async function refreshDashboard() {
    const refreshBtn = document.getElementById('refreshBtn');
    
    // Show button loading state
    if (refreshBtn) {
        const refreshingText = window.i18n ? window.i18n.t('common.refreshing') : 'Refreshing...';
        showButtonLoading(refreshBtn, refreshingText);
    }
    
    try {
        const role = getUserRole();
        
        // Superadmin uses admin dashboard (same UI, same data, same appearance)
        const dashboardRole = role === 'superadmin' ? 'admin' : role;
        
        switch(dashboardRole) {
            case 'admin':
                await loadAdminDashboard();
                break;
            case 'storekeeper':
                await loadStorekeeperDashboard();
                break;
            case 'sales':
                await loadSalesDashboard();
                break;
            case 'manager':
                await loadManagerDashboard();
                break;
            default:
                await loadAdminDashboard();
        }
    } catch (error) {
        showNotification('Error refreshing dashboard', 'error');
    } finally {
        if (refreshBtn) {
            hideButtonLoading(refreshBtn);
        }
    }
}

window.refreshDashboard = refreshDashboard;

async function loadAdminDashboard() {
    try {
        const data = await apiRequest('/reports/dashboard');
        
        document.getElementById('adminTotalItems').textContent = data.totalItems?.count || 0;
        document.getElementById('adminLowStockItems').textContent = data.lowStockItems?.count || 0;
        document.getElementById('adminTodaySales').textContent = formatCurrency(data.totalSales?.total || 0);
        document.getElementById('adminTodayPurchases').textContent = formatCurrency(data.totalPurchases?.total || 0);
        
        await loadAdminLowStockItems();
        await loadAdminRecentSales();
        await loadAdminRecentPurchases();
        
        // Load clear data status - ONLY for admin, NOT for superadmin
        const role = getUserRole();
        if (role === 'admin' && typeof loadAdminClearDataStatus === 'function') {
            await loadAdminClearDataStatus();
        }
    } catch (error) {
    }
}

async function loadAdminLowStockItems() {
    try {
        const items = await apiRequest('/reports/stock');
        const lowStockItems = items.filter(item => item.low_stock === 1).slice(0, 5);
        
        const container = document.getElementById('adminLowStockList');
        if (!container) return;
        
        if (lowStockItems.length === 0) {
            hideEmptyState(container);
            showEmptyState(container, {
                icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'All Stock Levels Good',
                message: 'No low stock items at this time.',
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);
        container.innerHTML = lowStockItems.map(item => `
            <div class="alert-item">
                <strong>${item.name}</strong> - Stock: ${item.stock_quantity} ${item.unit} (Min: ${item.min_stock_level})
            </div>
        `).join('');
    } catch (error) {
        const container = document.getElementById('adminLowStockList');
        if (container) {
            container.innerHTML = '<p class="text-center error-text">Error loading low stock items</p>';
        }
    }
}

async function loadAdminRecentSales() {
    try {
        const sales = await apiRequest('/sales');
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(sale => {
            const saleDate = new Date(sale.sale_date).toISOString().split('T')[0];
            return saleDate === today;
        });
        const recentSales = todaySales.length > 0 ? todaySales.slice(0, 5) : sales.slice(0, 5);
        
        const container = document.getElementById('adminRecentSales');
        if (!container) return;
        
        if (recentSales.length === 0) {
            hideEmptyState(container);
            showEmptyState(container, {
                icon: '<i class="fas fa-dollar-sign fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Recent Sales',
                message: 'No sales recorded today.',
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);

        container.innerHTML = recentSales.map(sale => `
            <div class="recent-item">
                <div class="recent-item-row">
                    <div class="recent-item-info">
                        <strong>Sale #${sale.id}</strong>
                        <div class="recent-item-date">${formatDate(sale.sale_date)}</div>
                    </div>
                    <div class="recent-item-amount">${formatCurrency(sale.total_amount || 0)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
    }
}

async function loadAdminRecentPurchases() {
    try {
        const purchases = await apiRequest('/purchases');
        const today = new Date().toISOString().split('T')[0];
        const todayPurchases = purchases.filter(purchase => {
            const purchaseDate = new Date(purchase.purchase_date).toISOString().split('T')[0];
            return purchaseDate === today;
        });
        const recentPurchases = todayPurchases.length > 0 ? todayPurchases.slice(0, 5) : purchases.slice(0, 5);
        
        const container = document.getElementById('adminRecentPurchases');
        if (!container) return;
        
        if (recentPurchases.length === 0) {
            hideEmptyState(container);
            const emptyTitle = window.i18n ? window.i18n.t('messages.noRecentPurchases') : 'No Recent Purchases';
            const emptyMessage = window.i18n ? window.i18n.t('messages.noPurchasesRecordedToday') : 'No purchases recorded today.';
            showEmptyState(container, {
                icon: '<i class="fas fa-shopping-cart fa-icon-success" style="font-size: 4rem;"></i>',
                title: emptyTitle,
                message: emptyMessage,
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);

        container.innerHTML = recentPurchases.map(purchase => `
            <div class="recent-item">
                <div class="recent-item-row">
                    <div class="recent-item-info">
                        <strong>Purchase #${purchase.id}</strong>
                        <div class="recent-item-date">${formatDate(purchase.purchase_date)}</div>
                    </div>
                    <div class="recent-item-amount">${formatCurrency(purchase.total_amount || 0)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
    }
}

async function loadStorekeeperDashboard() {
    try {
        const analytics = await apiRequest('/reports/storekeeper-analytics');
        
        // KPI Cards
        const inventory = analytics.inventory || {};
        document.getElementById('storekeeperTotalItems').textContent = inventory.total_items || 0;
        document.getElementById('storekeeperTotalUnits').textContent = `${inventory.total_units || 0} total units`;
        
        document.getElementById('storekeeperLowStockItems').textContent = inventory.low_stock_count || 0;
        document.getElementById('storekeeperOutOfStock').textContent = `${inventory.out_of_stock_count || 0} out of stock`;
        
        const todayPurchases = analytics.todayPurchases || {};
        document.getElementById('storekeeperTodayPurchases').textContent = formatCurrency(todayPurchases.total_amount || 0);
        document.getElementById('storekeeperTodayPurchaseItems').textContent = `${todayPurchases.total_items || 0} items purchased`;
        
        document.getElementById('storekeeperTotalStockValue').textContent = formatCurrency(inventory.total_cost_value || 0);
        document.getElementById('storekeeperSalesValue').textContent = `Sales value: ${formatCurrency(inventory.total_sales_value || 0)}`;
        
        // Critical Stock
        renderStorekeeperCriticalStock(analytics.criticalStock || []);
        
        // Reorder Recommendations
        renderStorekeeperReorderRecommendations(analytics.reorderRecommendations || []);
        
        // Purchase Statistics
        renderStorekeeperPurchaseStats(analytics);
        
        // Recent Purchases
        await loadStorekeeperRecentPurchases();
        
        // Category Stock
        renderStorekeeperCategoryStock(analytics.categorySummary || []);
        
        // Recent Stock Adjustments
        renderStorekeeperRecentAdjustments(analytics.recentAdjustments || []);
        
        // Top Suppliers
        renderStorekeeperTopSuppliers(analytics.topSuppliers || []);
        
        // Items Needing Attention
        renderStorekeeperItemsNeedingAttention(analytics.itemsNeedingAttention || []);
        
        // Purchase Trend
        renderStorekeeperPurchaseTrend(analytics.purchaseTrend || []);
        
    } catch (error) {
        console.error('Error loading storekeeper dashboard:', error);
        showNotification('Error loading dashboard', 'error');
    }
}

function renderStorekeeperCriticalStock(items) {
    const container = document.getElementById('storekeeperCriticalStock');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Stock Levels Good',
            message: 'No critical stock items at this time.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const urgencyClass = item.urgency === 'Out of Stock' ? 'badge-danger' : item.urgency === 'Critical' ? 'badge-warning' : 'badge-info';
        return `
            <div class="alert-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${urgencyClass}">${item.urgency}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    Stock: <strong>${item.stock_quantity} ${item.unit}</strong> | 
                    Min Level: <strong>${item.min_stock_level} ${item.unit}</strong> | 
                    Category: ${item.category_name || 'N/A'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStorekeeperReorderRecommendations(items) {
    const container = document.getElementById('storekeeperReorderRecommendations');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Reorders Needed',
            message: 'All items have adequate stock levels.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${item.name}</strong>
                    ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                </div>
                <strong style="color: var(--warning-color);">+${item.recommended_qty} ${item.unit}</strong>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                Current: ${item.stock_quantity} ${item.unit} | 
                Min: ${item.min_stock_level} ${item.unit} | 
                Category: ${item.category_name || 'N/A'}
            </div>
        </div>
    `).join('');
}

function renderStorekeeperPurchaseStats(analytics) {
    const container = document.getElementById('storekeeperPurchaseStats');
    if (!container) return;
    
    const today = analytics.todayPurchases || {};
    const month = analytics.monthPurchases || {};
    const lastMonth = analytics.lastMonthPurchases || {};
    const growth = lastMonth.total_amount > 0 
        ? ((month.total_amount - lastMonth.total_amount) / lastMonth.total_amount * 100) 
        : (month.total_amount > 0 ? 100 : 0);
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Today</h4>
                <h3 style="color: var(--info-color);">${formatCurrency(today.total_amount || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">${today.total_items || 0} items</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">This Month</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(month.total_amount || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">${month.count || 0} purchases</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Growth</h4>
                <h3 style="color: ${growth >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${growth >= 0 ? '↑' : '↓'} ${Math.abs(growth).toFixed(1)}%</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">vs last month</p>
            </div>
        </div>
    `;
}

function renderStorekeeperCategoryStock(categories) {
    const container = document.getElementById('storekeeperCategoryStock');
    if (!container) return;
    
    if (categories.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Category Data',
            message: 'No category stock information available.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = categories.map(cat => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${cat.category || 'Uncategorized'}</strong>
                <span class="badge ${cat.low_stock_count > 0 ? 'badge-warning' : 'badge-success'}">${cat.low_stock_count || 0} low stock</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${cat.item_count}</strong> items</span>
                <span><strong>${cat.total_stock}</strong> units</span>
                <span><strong>${formatCurrency(cat.total_value || 0)}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderStorekeeperRecentAdjustments(adjustments) {
    const container = document.getElementById('storekeeperRecentAdjustments');
    if (!container) return;
    
    if (adjustments.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-edit fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Adjustments',
            message: 'No stock adjustments recorded recently.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = adjustments.map(adj => {
        const typeIcon = adj.adjustment_type === 'increase' ? '↑' : adj.adjustment_type === 'decrease' ? '↓' : '=';
        const typeColor = adj.adjustment_type === 'increase' ? 'var(--success-color)' : adj.adjustment_type === 'decrease' ? 'var(--danger-color)' : 'var(--info-color)';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${adj.item_name}</strong>
                        ${adj.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${adj.sku}</small>` : ''}
                    </div>
                    <span style="color: ${typeColor}; font-weight: bold; font-size: 1.2rem;">${typeIcon} ${adj.quantity}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    ${adj.reason || 'No reason provided'} | 
                    ${formatDate(adj.created_at)} | 
                    By: ${adj.created_by_name || 'System'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStorekeeperTopSuppliers(suppliers) {
    const container = document.getElementById('storekeeperTopSuppliers');
    if (!container) return;
    
    if (suppliers.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-building fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Supplier Data',
            message: 'No supplier purchase data available this month.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = suppliers.map(supplier => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${supplier.name}</strong>
                    ${supplier.contact_person ? `<br><small style="color: var(--text-secondary);">Contact: ${supplier.contact_person}</small>` : ''}
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(supplier.total_spent || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span>${supplier.purchase_count || 0} purchases</span>
                <span>${supplier.total_items || 0} items</span>
            </div>
        </div>
    `).join('');
}

function renderStorekeeperItemsNeedingAttention(items) {
    const container = document.getElementById('storekeeperItemsNeedingAttention');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Items Stable',
            message: 'No items need immediate attention.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const daysRemaining = item.days_remaining === 999 ? 'Out of Stock' : `${Math.round(item.days_remaining)} days`;
        const urgencyClass = item.days_remaining < 7 ? 'badge-danger' : item.days_remaining < 14 ? 'badge-warning' : 'badge-info';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${urgencyClass}">${daysRemaining}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    Stock: ${item.stock_quantity} ${item.unit} | 
                    Sold (30d): ${item.total_sold_last_month || 0} | 
                    Category: ${item.category_name || 'N/A'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStorekeeperPurchaseTrend(trend) {
    const container = document.getElementById('storekeeperPurchaseTrend');
    if (!container) return;
    
    if (trend.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No purchase data available</p>';
        return;
    }
    
    const maxAmount = Math.max(...trend.map(t => t.total_amount || 0), 1);
    
    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${trend.map(day => {
                const height = ((day.total_amount || 0) / maxAmount) * 100;
                return `
                    <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span><strong>${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong></span>
                            <span><strong>${formatCurrency(day.total_amount || 0)}</strong> (${day.purchase_count || 0} purchases, ${day.total_items || 0} items)</span>
                        </div>
                        <div style="background: #e2e8f0; height: 20px; border-radius: 0; overflow: hidden;">
                            <div style="background: var(--info-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function loadStorekeeperRecentPurchases() {
    try {
        const purchases = await apiRequest('/purchases');
        const recentPurchases = purchases.slice(0, 10);
        
        const container = document.getElementById('storekeeperRecentPurchases');
        if (!container) return;
        
        if (recentPurchases.length === 0) {
            hideEmptyState(container);
            showEmptyState(container, {
                icon: '<i class="fas fa-shopping-cart fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Recent Purchases',
                message: 'No purchases have been recorded yet.',
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);
        container.innerHTML = recentPurchases.map(purchase => `
            <div class="recent-item">
                <div class="recent-item-row">
                    <div class="recent-item-info">
                        <strong>Purchase #${purchase.id}</strong>
                        <div class="recent-item-date">${formatDate(purchase.purchase_date)}</div>
                        <small>Supplier: ${purchase.supplier_name || 'N/A'}</small>
                    </div>
                    <div class="recent-item-amount">${formatCurrency(purchase.total_amount || 0)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        const container = document.getElementById('storekeeperRecentPurchases');
        if (container) {
            container.innerHTML = '<p class="text-center error-text">Error loading recent purchases</p>';
        }
    }
}

async function loadSalesDashboard() {
    try {
        const analytics = await apiRequest('/reports/sales-analytics');
        
        // KPI Cards
        const today = analytics.todaySales || {};
        document.getElementById('salesTodaySales').textContent = formatCurrency(today.total_revenue || 0);
        document.getElementById('salesTodayItems').textContent = `${today.total_items_sold || 0} items sold`;
        
        const week = analytics.weekSales || {};
        document.getElementById('salesWeekSales').textContent = formatCurrency(week.total_revenue || 0);
        document.getElementById('salesWeekTransactions').textContent = `${week.transaction_count || 0} transactions`;
        
        const month = analytics.monthSales || {};
        const lastMonth = analytics.lastMonthSales || {};
        const growth = lastMonth.total_revenue > 0 
            ? ((month.total_revenue - lastMonth.total_revenue) / lastMonth.total_revenue * 100) 
            : (month.total_revenue > 0 ? 100 : 0);
        document.getElementById('salesMonthSales').textContent = formatCurrency(month.total_revenue || 0);
        document.getElementById('salesMonthGrowth').textContent = `${growth >= 0 ? '↑' : '↓'} ${Math.abs(growth).toFixed(1)}% vs last month`;
        
        const overview = analytics.salesOverview || {};
        document.getElementById('salesAvgTransaction').textContent = formatCurrency(overview.average_transaction_value || 0);
        document.getElementById('salesTotalTransactions').textContent = `${overview.total_transactions || 0} total transactions`;
        
        // Sales Performance Metrics
        renderSalesPerformanceMetrics(analytics.performanceMetrics || {});
        
        // Sales Trend
        renderSalesTrend(analytics.salesTrend || []);
        
        // Recent Sales
        renderSalesRecentSales(analytics.recentSales || []);
        
        // Top Selling Items
        renderSalesTopSellingItems(analytics.topSellingItems || []);
        
        // Sales by Category
        renderSalesByCategory(analytics.salesByCategory || []);
        
        // Hourly Pattern
        renderSalesHourlyPattern(analytics.hourlyPattern || []);
        
        // Top Customers
        renderSalesTopCustomers(analytics.topCustomers || []);
        
        // Available Items
        renderSalesAvailableItems(analytics.availableItems || []);
        
        // Out of Stock Items
        renderSalesOutOfStockItems(analytics.outOfStockItems || []);
        
    } catch (error) {
        console.error('Error loading sales dashboard:', error);
        showNotification('Error loading dashboard', 'error');
    }
}

function renderSalesPerformanceMetrics(metrics) {
    const container = document.getElementById('salesPerformanceMetrics');
    if (!container) return;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Active Days</h4>
                <h3 style="color: var(--info-color);">${metrics.active_days || 0}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Daily Average</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(metrics.daily_average || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">Revenue per day</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Largest Transaction</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(metrics.largest_transaction || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Smallest Transaction</h4>
                <h3 style="color: var(--info-color);">${formatCurrency(metrics.smallest_transaction || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
        </div>
    `;
}

function renderSalesTrend(trend) {
    const container = document.getElementById('salesTrend');
    if (!container) return;
    
    if (trend.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No sales data available</p>';
        return;
    }
    
    const maxRevenue = Math.max(...trend.map(t => t.total_revenue || 0), 1);
    
    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${trend.map(day => {
                const height = ((day.total_revenue || 0) / maxRevenue) * 100;
                return `
                    <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span><strong>${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong></span>
                            <span><strong>${formatCurrency(day.total_revenue || 0)}</strong> (${day.transaction_count || 0} transactions, ${day.total_items_sold || 0} items)</span>
                        </div>
                        <div style="background: #e2e8f0; height: 20px; border-radius: 0; overflow: hidden;">
                            <div style="background: var(--success-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderSalesRecentSales(sales) {
    const container = document.getElementById('salesRecentSales');
    if (!container) return;
    
    if (sales.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-dollar-sign fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Recent Sales',
            message: 'No sales transactions recorded yet.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = sales.map(sale => `
        <div class="recent-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div class="recent-item-row" style="display: flex; justify-content: space-between; align-items: start;">
                <div class="recent-item-info">
                    <strong>Sale #${sale.id}</strong>
                    <div class="recent-item-date" style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">${formatDate(sale.sale_date)}</div>
                    ${sale.customer_name ? `<small style="color: var(--text-secondary);">Customer: ${sale.customer_name}</small>` : ''}
                    <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">${sale.item_count || 0} items • ${sale.total_quantity || 0} units</small>
                    ${sale.created_by_name ? `<small style="display: block; color: var(--text-secondary);">By: ${sale.created_by_name}</small>` : ''}
                </div>
                <div class="recent-item-amount" style="font-weight: bold; color: var(--success-color); font-size: 1.1rem;">${formatCurrency(sale.total_amount || 0)}</div>
            </div>
        </div>
    `).join('');
}

function renderSalesTopSellingItems(items) {
    const container = document.getElementById('salesTopSellingItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Sales Data',
            message: 'No items sold this month yet.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map((item, index) => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <span style="font-weight: bold; color: var(--text-secondary); min-width: 24px;">#${index + 1}</span>
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(item.total_revenue || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${item.total_sold || 0}</strong> sold</span>
                <span><strong>${item.transaction_count || 0}</strong> transactions</span>
                <span>Price: ${formatCurrency(item.unit_price || 0)}</span>
            </div>
        </div>
    `).join('');
}

function renderSalesByCategory(categories) {
    const container = document.getElementById('salesByCategory');
    if (!container) return;
    
    if (categories.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-chart-bar fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Category Sales',
            message: 'No sales by category data available.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = categories.map(cat => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${cat.category || 'Uncategorized'}</strong>
                <strong style="color: var(--success-color);">${formatCurrency(cat.total_revenue || 0)}</strong>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${cat.transaction_count || 0}</strong> transactions</span>
                <span><strong>${cat.total_items_sold || 0}</strong> items</span>
                <span>Avg: <strong>${formatCurrency((cat.total_revenue || 0) / Math.max(cat.transaction_count || 1, 1))}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderSalesHourlyPattern(pattern) {
    const container = document.getElementById('salesHourlyPattern');
    if (!container) return;
    
    if (pattern.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No sales data for today</p>';
        return;
    }
    
    const maxRevenue = Math.max(...pattern.map(p => p.total_revenue || 0), 1);
    
    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${pattern.map(hour => {
                const height = ((hour.total_revenue || 0) / maxRevenue) * 100;
                const hourLabel = `${hour.hour}:00`;
                return `
                    <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span><strong>${hourLabel}</strong></span>
                            <span><strong>${formatCurrency(hour.total_revenue || 0)}</strong> (${hour.transaction_count || 0} transactions)</span>
                        </div>
                        <div style="background: #e2e8f0; height: 16px; border-radius: 0; overflow: hidden;">
                            <div style="background: var(--info-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderSalesTopCustomers(customers) {
    const container = document.getElementById('salesTopCustomers');
    if (!container) return;
    
    if (customers.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-users fa-icon-primary" style="font-size: 4rem;"></i>',
            title: 'No Customer Data',
            message: 'No customer sales data available this month.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = customers.map((customer, index) => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <span style="font-weight: bold; color: var(--text-secondary); min-width: 24px;">#${index + 1}</span>
                    <div>
                        <strong>${customer.customer_name}</strong>
                        <br><small style="color: var(--text-secondary);">Last purchase: ${formatDate(customer.last_purchase_date)}</small>
                    </div>
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(customer.total_spent || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${customer.transaction_count || 0}</strong> transactions</span>
                <span>Avg: <strong>${formatCurrency(customer.average_transaction_value || 0)}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderSalesAvailableItems(items) {
    const container = document.getElementById('salesAvailableItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Available Items',
            message: 'No items available for sale.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const statusClass = item.availability_status === 'Available' ? 'badge-success' : 
                           item.availability_status === 'Low Stock' ? 'badge-warning' : 'badge-danger';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${statusClass}">${item.availability_status}</span>
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                    <span>Stock: <strong>${item.stock_quantity} ${item.unit}</strong></span>
                    <span>Price: <strong>${formatCurrency(item.unit_price || 0)}</strong></span>
                    <span>Category: ${item.category_name || 'N/A'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderSalesOutOfStockItems(items) {
    const container = document.getElementById('salesOutOfStockItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Items Available',
            message: 'No out of stock items.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => `
        <div class="alert-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${item.name}</strong>
                    ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                </div>
                <span class="badge badge-danger">Out of Stock</span>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                Price: ${formatCurrency(item.unit_price || 0)} | 
                Category: ${item.category_name || 'N/A'} | 
                Sold last month: <strong>${item.sold_last_month || 0}</strong>
            </div>
        </div>
    `).join('');
}

async function loadSalesRecentSales() {
    try {
        const sales = await apiRequest('/sales');
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(sale => {
            const saleDate = new Date(sale.sale_date).toISOString().split('T')[0];
            return saleDate === today;
        });
        const recentSales = todaySales.length > 0 ? todaySales.slice(0, 10) : sales.slice(0, 10);
        
        const container = document.getElementById('salesRecentSales');
        if (!container) return;
        
        if (recentSales.length === 0) {
            hideEmptyState(container);
            showEmptyState(container, {
                icon: '<i class="fas fa-dollar-sign fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Recent Sales',
                message: 'No sales recorded today.',
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);
        container.innerHTML = recentSales.map(sale => `
            <div class="recent-item">
                <div class="recent-item-row">
                    <div class="recent-item-info">
                        <strong>Sale #${sale.id}</strong>
                        <div class="recent-item-date">${formatDate(sale.sale_date)}</div>
                        <small>Customer: ${sale.customer_name || 'Walk-in'}</small>
                    </div>
                    <div class="recent-item-amount">${formatCurrency(sale.total_amount || 0)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
    }
}

async function loadSalesAvailableItems() {
    try {
        const items = await apiRequest('/items');
        const availableItems = items.filter(item => item.stock_quantity > 0).slice(0, 10);
        
        const container = document.getElementById('salesAvailableItems');
        if (!container) return;
        
        if (availableItems.length === 0) {
            hideEmptyState(container);
            showEmptyState(container, {
                icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
                title: 'No Available Items',
                message: 'No items are currently in stock.',
                actionLabel: null,
                actionCallback: null,
                className: 'empty-state-small'
            });
            return;
        }

        hideEmptyState(container);

        container.innerHTML = availableItems.map(item => `
            <div class="recent-item">
                <div class="recent-item-row">
                    <div class="recent-item-info">
                        <strong>${item.name}</strong>
                        <div class="recent-item-date">Stock: ${item.stock_quantity} ${item.unit}</div>
                        <small>Price: ${formatCurrency(item.unit_price || 0)}</small>
                    </div>
                    <div class="recent-item-amount">${formatCurrency((item.unit_price || 0) * item.stock_quantity)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
    }
}

async function loadManagerDashboard() {
    try {
        const analytics = await apiRequest('/reports/manager-analytics');
        
        // KPI Cards
        document.getElementById('managerMonthRevenue').textContent = formatCurrency(analytics.thisMonth?.revenue || 0);
        const monthGrowth = analytics.growth?.percentage || 0;
        const growthElement = document.getElementById('managerMonthGrowth');
        if (growthElement) {
            growthElement.textContent = monthGrowth >= 0 
                ? `↑ ${monthGrowth.toFixed(1)}% vs last month` 
                : `↓ ${Math.abs(monthGrowth).toFixed(1)}% vs last month`;
            growthElement.style.color = monthGrowth >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        }
        
        const profitMargin = analytics.profit?.margin || 0;
        document.getElementById('managerProfitMargin').textContent = `${profitMargin.toFixed(1)}%`;
        document.getElementById('managerProfitAmount').textContent = `Profit: ${formatCurrency(analytics.profit?.profit || 0)}`;
        
        document.getElementById('managerInventoryValue').textContent = formatCurrency(analytics.inventory?.total_value || 0);
        document.getElementById('managerInventoryItems').textContent = `${analytics.inventory?.total_items || 0} items`;
        
        const healthScore = analytics.healthScore?.overall || 0;
        document.getElementById('managerHealthScore').textContent = `${healthScore}%`;
        const healthDetails = document.getElementById('managerHealthDetails');
        if (healthDetails) {
            healthDetails.textContent = `${analytics.healthScore?.lowStockItems || 0} low stock items`;
        }
        
        // Performance Comparison
        document.getElementById('managerTodayRevenue').textContent = formatCurrency(analytics.today?.revenue || 0);
        document.getElementById('managerTodayTransactions').textContent = `${analytics.today?.transactions || 0} transactions`;
        
        document.getElementById('managerWeekRevenue').textContent = formatCurrency(analytics.thisWeek?.revenue || 0);
        const weekGrowth = analytics.lastWeek?.revenue > 0 
            ? ((analytics.thisWeek?.revenue - analytics.lastWeek?.revenue) / analytics.lastWeek?.revenue * 100) 
            : 0;
        const weekGrowthEl = document.getElementById('managerWeekGrowth');
        if (weekGrowthEl) {
            weekGrowthEl.textContent = weekGrowth >= 0 
                ? `↑ ${weekGrowth.toFixed(1)}% vs last week` 
                : `↓ ${Math.abs(weekGrowth).toFixed(1)}% vs last week`;
            weekGrowthEl.style.color = weekGrowth >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        }
        
        document.getElementById('managerMonthRevenue2').textContent = formatCurrency(analytics.thisMonth?.revenue || 0);
        const monthGrowthEl = document.getElementById('managerMonthGrowth2');
        if (monthGrowthEl) {
            monthGrowthEl.textContent = monthGrowth >= 0 
                ? `↑ ${monthGrowth.toFixed(1)}% vs last month` 
                : `↓ ${Math.abs(monthGrowth).toFixed(1)}% vs last month`;
            monthGrowthEl.style.color = monthGrowth >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        }
        
        // Top Performing Items
        renderManagerTopItems(analytics.topItems || []);
        
        // Financial Analysis
        renderManagerFinancialAnalysis(analytics);
        
        // Category Performance
        renderManagerCategoryPerformance(analytics.categoryPerformance || []);
        
        // Inventory Analysis
        renderManagerInventoryAnalysis(analytics);
        
        // Inventory Turnover
        renderManagerInventoryTurnover(analytics.inventoryTurnover || []);
        
        // Sales Trend
        renderManagerSalesTrend(analytics.salesTrend || []);
        
        // Admin Dashboard Sections
        renderManagerLowStockItems(analytics.lowStockItems || []);
        renderManagerRecentSales(analytics.recentSales || []);
        renderManagerRecentPurchases(analytics.recentPurchases || []);
        
        // Storekeeper Dashboard Sections
        renderManagerCriticalStock(analytics.criticalStock || []);
        renderManagerReorderRecommendations(analytics.reorderRecommendations || []);
        renderManagerPurchaseStats(analytics);
        renderManagerCategoryStock(analytics.categoryStock || []);
        renderManagerRecentAdjustments(analytics.recentAdjustments || []);
        renderManagerTopSuppliers(analytics.topSuppliers || []);
        renderManagerItemsNeedingAttention(analytics.itemsNeedingAttention || []);
        renderManagerPurchaseTrend(analytics.purchaseTrend || []);
        
        // Sales Dashboard Sections
        renderManagerSalesPerformanceMetrics(analytics.salesPerformanceMetrics || {});
        renderManagerTopSellingItems(analytics.topSellingItems || []);
        renderManagerSalesByCategory(analytics.salesByCategory || []);
        renderManagerHourlyPattern(analytics.hourlyPattern || []);
        renderManagerTopCustomers(analytics.topCustomers || []);
        renderManagerAvailableItems(analytics.availableItems || []);
        renderManagerOutOfStockItems(analytics.outOfStockItems || []);
        
    } catch (error) {
        console.error('Error loading manager dashboard:', error);
        showNotification('Error loading analytics', 'error');
    }
}

function renderManagerTopItems(items) {
    const container = document.getElementById('managerTopItems');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No sales data available</p>';
        return;
    }
    
    container.innerHTML = items.map(item => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${item.name}</strong>
                ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
            </div>
            <div style="text-align: right;">
                <strong style="color: var(--success-color);">${formatCurrency(item.total_revenue)}</strong>
                <br><small style="color: var(--text-secondary);">${item.total_sold} sold</small>
            </div>
        </div>
    `).join('');
}

function renderManagerFinancialAnalysis(analytics) {
    const container = document.getElementById('managerFinancialAnalysis');
    if (!container) return;
    
    const profit = analytics.profit || {};
    const purchases = analytics.purchases || {};
    const transactionMetrics = analytics.transactionMetrics || {};
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Total Revenue</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(profit.revenue || 0)}</h3>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Total Cost</h4>
                <h3 style="color: var(--danger-color);">${formatCurrency(profit.cost || 0)}</h3>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Net Profit</h4>
                <h3 style="color: ${(profit.profit || 0) >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${formatCurrency(profit.profit || 0)}</h3>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Avg Transaction</h4>
                <h3>${formatCurrency(transactionMetrics.avg_value || 0)}</h3>
            </div>
        </div>
        <div style="margin-top: 1rem; padding: 1rem; background: #fef3c7; border-radius: 0; border: 1px solid var(--border-color);">
            <strong>Purchases This Month:</strong> ${purchases.total_purchases || 0} transactions, ${formatCurrency(purchases.total_spent || 0)} spent
        </div>
    `;
}

function renderManagerCategoryPerformance(categories) {
    const container = document.getElementById('managerCategoryPerformance');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No category data available</p>';
        return;
    }
    
    container.innerHTML = categories.map(cat => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${cat.category || 'Uncategorized'}</strong>
                <strong style="color: var(--success-color);">${formatCurrency(cat.total_revenue)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span>${cat.items_sold} items</span>
                <span>${cat.total_quantity} units sold</span>
            </div>
        </div>
    `).join('');
}

function renderManagerInventoryAnalysis(analytics) {
    const container = document.getElementById('managerInventoryAnalysis');
    if (!container) return;
    
    const inventory = analytics.inventory || {};
    const healthScore = analytics.healthScore || {};
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Total Items</h4>
                <h3>${inventory.total_items || 0}</h3>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Inventory Value</h4>
                <h3>${formatCurrency(inventory.total_value || 0)}</h3>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Potential Revenue</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(inventory.potential_revenue || 0)}</h3>
            </div>
            <div style="padding: 1rem; background: #fee2e2; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Low Stock Items</h4>
                <h3 style="color: var(--warning-color);">${inventory.low_stock_count || 0}</h3>
            </div>
        </div>
        <div style="margin-top: 1rem; padding: 1rem; background: ${healthScore.overall >= 70 ? '#d1fae5' : healthScore.overall >= 50 ? '#fef3c7' : '#fee2e2'}; border-radius: 0; border: 1px solid var(--border-color);">
            <strong>Stock Health:</strong> ${healthScore.stockHealth || 0}% | 
            <strong>Revenue Health:</strong> ${healthScore.revenueHealth || 0}% | 
            <strong>Overall:</strong> ${healthScore.overall || 0}%
        </div>
    `;
}

function renderManagerInventoryTurnover(items) {
    const container = document.getElementById('managerInventoryTurnover');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No turnover data available</p>';
        return;
    }
    
    container.innerHTML = items.map(item => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${item.name}</strong>
                <strong style="color: var(--info-color);">${(item.turnover_rate || 0).toFixed(2)}x</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span>Stock: ${item.stock_quantity}</span>
                <span>Sold: ${item.total_sold}</span>
            </div>
        </div>
    `).join('');
}

function renderManagerSalesTrend(trend) {
    const container = document.getElementById('managerSalesTrend');
    if (!container) return;
    
    if (trend.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No trend data available</p>';                        
        return;
    }

    const maxRevenue = Math.max(...trend.map(t => t.revenue || 0), 1);

    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${trend.map(day => {
                const height = ((day.revenue || 0) / maxRevenue) * 100;
                return `
                    <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">                                    
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">                                                     
                            <span><strong>${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong></span>                                                                               
                            <span><strong>${formatCurrency(day.revenue || 0)}</strong> (${day.transactions || 0} transactions)</span>                           
                        </div>
                        <div style="background: #e2e8f0; height: 20px; border-radius: 0; overflow: hidden;">                                                  
                            <div style="background: var(--primary-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>                      
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Admin Dashboard Rendering Functions for Manager
function renderManagerLowStockItems(items) {
    const container = document.getElementById('managerLowStockList');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Stock Levels Good',
            message: 'No low stock items at this time.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => `
        <div class="alert-item">
            <strong>${item.name}</strong> - Stock: ${item.stock_quantity} ${item.unit} (Min: ${item.min_stock_level})
            <br><small>Category: ${item.category_name || 'N/A'}</small>
        </div>
    `).join('');
}

function renderManagerRecentSales(sales) {
    const container = document.getElementById('managerRecentSales');
    if (!container) return;
    
    if (sales.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-dollar-sign fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Recent Sales',
            message: 'No sales transactions recorded yet.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = sales.map(sale => `
        <div class="recent-item">
            <div class="recent-item-row">
                <div class="recent-item-info">
                    <strong>Sale #${sale.id}</strong>
                    <div class="recent-item-date">${formatDate(sale.sale_date)}</div>
                    <small>Customer: ${sale.customer_name || 'Walk-in'}</small>
                    <small style="display: block; margin-top: 0.25rem;">${sale.item_count || 0} items • ${sale.total_quantity || 0} units</small>
                </div>
                <div class="recent-item-amount">${formatCurrency(sale.total_amount || 0)}</div>
            </div>
        </div>
    `).join('');
}

function renderManagerRecentPurchases(purchases) {
    const container = document.getElementById('managerRecentPurchases');
    if (!container) return;
    
    if (purchases.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-shopping-cart fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Recent Purchases',
            message: 'No purchases recorded yet.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = purchases.map(purchase => `
        <div class="recent-item">
            <div class="recent-item-row">
                <div class="recent-item-info">
                    <strong>Purchase #${purchase.id}</strong>
                    <div class="recent-item-date">${formatDate(purchase.purchase_date)}</div>
                    <small>Supplier: ${purchase.supplier_name || 'N/A'}</small>
                    <small style="display: block; margin-top: 0.25rem;">${purchase.item_count || 0} items • ${purchase.total_quantity || 0} units</small>
                </div>
                <div class="recent-item-amount">${formatCurrency(purchase.total_amount || 0)}</div>
            </div>
        </div>
    `).join('');
}

// Storekeeper Dashboard Rendering Functions for Manager
function renderManagerCriticalStock(items) {
    const container = document.getElementById('managerCriticalStock');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Stock Levels Good',
            message: 'No critical stock items at this time.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const urgencyClass = item.urgency === 'Out of Stock' ? 'badge-danger' : item.urgency === 'Critical' ? 'badge-warning' : 'badge-info';
        return `
            <div class="alert-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${urgencyClass}">${item.urgency}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    Stock: <strong>${item.stock_quantity} ${item.unit}</strong> | 
                    Min Level: <strong>${item.min_stock_level} ${item.unit}</strong> | 
                    Category: ${item.category_name || 'N/A'}
                </div>
            </div>
        `;
    }).join('');
}

function renderManagerReorderRecommendations(items) {
    const container = document.getElementById('managerReorderRecommendations');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Reorders Needed',
            message: 'All items have adequate stock levels.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${item.name}</strong>
                    ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                </div>
                <strong style="color: var(--warning-color);">+${item.recommended_qty} ${item.unit}</strong>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                Current: ${item.stock_quantity} ${item.unit} | 
                Min: ${item.min_stock_level} ${item.unit} | 
                Category: ${item.category_name || 'N/A'}
            </div>
        </div>
    `).join('');
}

function renderManagerPurchaseStats(analytics) {
    const container = document.getElementById('managerPurchaseStats');
    if (!container) return;
    
    const today = analytics.todayPurchases || {};
    const month = analytics.monthPurchases || {};
    const lastMonth = analytics.lastMonthPurchases || {};
    const growth = lastMonth.total_amount > 0 
        ? ((month.total_amount - lastMonth.total_amount) / lastMonth.total_amount * 100) 
        : (month.total_amount > 0 ? 100 : 0);
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Today</h4>
                <h3 style="color: var(--info-color);">${formatCurrency(today.total_amount || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">${today.total_items || 0} items</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">This Month</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(month.total_amount || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">${month.count || 0} purchases</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Growth</h4>
                <h3 style="color: ${growth >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${growth >= 0 ? '↑' : '↓'} ${Math.abs(growth).toFixed(1)}%</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">vs last month</p>
            </div>
        </div>
    `;
}

function renderManagerCategoryStock(categories) {
    const container = document.getElementById('managerCategoryStock');
    if (!container) return;
    
    if (categories.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Category Data',
            message: 'No category stock information available.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = categories.map(cat => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${cat.category || 'Uncategorized'}</strong>
                <span class="badge ${cat.low_stock_count > 0 ? 'badge-warning' : 'badge-success'}">${cat.low_stock_count || 0} low stock</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${cat.item_count}</strong> items</span>
                <span><strong>${cat.total_stock}</strong> units</span>
                <span><strong>${formatCurrency(cat.total_value || 0)}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderManagerRecentAdjustments(adjustments) {
    const container = document.getElementById('managerRecentAdjustments');
    if (!container) return;
    
    if (adjustments.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-edit fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Adjustments',
            message: 'No stock adjustments recorded recently.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = adjustments.map(adj => {
        const typeIcon = adj.adjustment_type === 'increase' ? '↑' : adj.adjustment_type === 'decrease' ? '↓' : '=';
        const typeColor = adj.adjustment_type === 'increase' ? 'var(--success-color)' : adj.adjustment_type === 'decrease' ? 'var(--danger-color)' : 'var(--info-color)';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${adj.item_name}</strong>
                        ${adj.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${adj.sku}</small>` : ''}
                    </div>
                    <span style="color: ${typeColor}; font-weight: bold; font-size: 1.2rem;">${typeIcon} ${adj.quantity}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    ${adj.reason || 'No reason provided'} | 
                    ${formatDate(adj.created_at)} | 
                    By: ${adj.created_by_name || 'System'}
                </div>
            </div>
        `;
    }).join('');
}

function renderManagerTopSuppliers(suppliers) {
    const container = document.getElementById('managerTopSuppliers');
    if (!container) return;
    
    if (suppliers.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-building fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Supplier Data',
            message: 'No supplier purchase data available this month.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = suppliers.map(supplier => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${supplier.name}</strong>
                    ${supplier.contact_person ? `<br><small style="color: var(--text-secondary);">Contact: ${supplier.contact_person}</small>` : ''}
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(supplier.total_spent || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span>${supplier.purchase_count || 0} purchases</span>
                <span>${supplier.total_items || 0} items</span>
            </div>
        </div>
    `).join('');
}

function renderManagerItemsNeedingAttention(items) {
    const container = document.getElementById('managerItemsNeedingAttention');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Items Stable',
            message: 'No items need immediate attention.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const daysRemaining = item.days_remaining === 999 ? 'Out of Stock' : `${Math.round(item.days_remaining)} days`;
        const urgencyClass = item.days_remaining < 7 ? 'badge-danger' : item.days_remaining < 14 ? 'badge-warning' : 'badge-info';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${urgencyClass}">${daysRemaining}</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    Stock: ${item.stock_quantity} ${item.unit} | 
                    Sold (30d): ${item.total_sold_last_month || 0} | 
                    Category: ${item.category_name || 'N/A'}
                </div>
            </div>
        `;
    }).join('');
}

function renderManagerPurchaseTrend(trend) {
    const container = document.getElementById('managerPurchaseTrend');
    if (!container) return;
    
    if (trend.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No purchase data available</p>';
        return;
    }
    
    const maxAmount = Math.max(...trend.map(t => t.total_amount || 0), 1);
    
    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${trend.map(day => {
                const height = ((day.total_amount || 0) / maxAmount) * 100;
                return `
                    <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span><strong>${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong></span>
                            <span><strong>${formatCurrency(day.total_amount || 0)}</strong> (${day.purchase_count || 0} purchases, ${day.total_items || 0} items)</span>
                        </div>
                        <div style="background: #e2e8f0; height: 20px; border-radius: 0; overflow: hidden;">
                            <div style="background: var(--info-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Sales Dashboard Rendering Functions for Manager
function renderManagerSalesPerformanceMetrics(metrics) {
    const container = document.getElementById('managerSalesPerformanceMetrics');
    if (!container) return;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; margin-bottom: 1rem;">
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Active Days</h4>
                <h3 style="color: var(--info-color);">${metrics.active_days || 0}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Daily Average</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(metrics.daily_average || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">Revenue per day</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Largest Transaction</h4>
                <h3 style="color: var(--success-color);">${formatCurrency(metrics.largest_transaction || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
            <div style="padding: 1rem; background: #f1f5f9; border-radius: 0; border: 1px solid var(--border-color);">
                <h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Smallest Transaction</h4>
                <h3 style="color: var(--info-color);">${formatCurrency(metrics.smallest_transaction || 0)}</h3>
                <p style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">This month</p>
            </div>
        </div>
    `;
}

function renderManagerTopSellingItems(items) {
    const container = document.getElementById('managerTopSellingItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Sales Data',
            message: 'No items sold this month yet.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map((item, index) => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <span style="font-weight: bold; color: var(--text-secondary); min-width: 24px;">#${index + 1}</span>
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(item.total_revenue || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${item.total_sold || 0}</strong> sold</span>
                <span><strong>${item.transaction_count || 0}</strong> transactions</span>
                <span>Price: ${formatCurrency(item.unit_price || 0)}</span>
            </div>
        </div>
    `).join('');
}

function renderManagerSalesByCategory(categories) {
    const container = document.getElementById('managerSalesByCategory');
    if (!container) return;
    
    if (categories.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-chart-bar fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Category Sales',
            message: 'No sales by category data available.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = categories.map(cat => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>${cat.category || 'Uncategorized'}</strong>
                <strong style="color: var(--success-color);">${formatCurrency(cat.total_revenue || 0)}</strong>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${cat.transaction_count || 0}</strong> transactions</span>
                <span><strong>${cat.total_items_sold || 0}</strong> items</span>
                <span>Avg: <strong>${formatCurrency((cat.total_revenue || 0) / Math.max(cat.transaction_count || 1, 1))}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderManagerHourlyPattern(pattern) {
    const container = document.getElementById('managerHourlyPattern');
    if (!container) return;
    
    if (pattern.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No sales data for today</p>';
        return;
    }
    
    const maxRevenue = Math.max(...pattern.map(p => p.total_revenue || 0), 1);
    
    container.innerHTML = `
        <div style="margin-top: 1rem;">
            ${pattern.map(hour => {
                const height = ((hour.total_revenue || 0) / maxRevenue) * 100;
                const hourLabel = `${hour.hour}:00`;
                return `
                    <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span><strong>${hourLabel}</strong></span>
                            <span><strong>${formatCurrency(hour.total_revenue || 0)}</strong> (${hour.transaction_count || 0} transactions)</span>
                        </div>
                        <div style="background: #e2e8f0; height: 16px; border-radius: 0; overflow: hidden;">
                            <div style="background: var(--info-color); height: 100%; width: ${height}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderManagerTopCustomers(customers) {
    const container = document.getElementById('managerTopCustomers');
    if (!container) return;
    
    if (customers.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-users fa-icon-primary" style="font-size: 4rem;"></i>',
            title: 'No Customer Data',
            message: 'No customer sales data available this month.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = customers.map((customer, index) => `
        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <span style="font-weight: bold; color: var(--text-secondary); min-width: 24px;">#${index + 1}</span>
                    <div>
                        <strong>${customer.customer_name}</strong>
                        <br><small style="color: var(--text-secondary);">Last purchase: ${formatDate(customer.last_purchase_date)}</small>
                    </div>
                </div>
                <strong style="color: var(--success-color);">${formatCurrency(customer.total_spent || 0)}</strong>
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                <span><strong>${customer.transaction_count || 0}</strong> transactions</span>
                <span>Avg: <strong>${formatCurrency(customer.average_transaction_value || 0)}</strong></span>
            </div>
        </div>
    `).join('');
}

function renderManagerAvailableItems(items) {
    const container = document.getElementById('managerAvailableItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Available Items',
            message: 'No items available for sale.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => {
        const statusClass = item.availability_status === 'Available' ? 'badge-success' : 
                           item.availability_status === 'Low Stock' ? 'badge-warning' : 'badge-danger';
        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${item.name}</strong>
                        ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                    </div>
                    <span class="badge ${statusClass}">${item.availability_status}</span>
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                    <span>Stock: <strong>${item.stock_quantity} ${item.unit}</strong></span>
                    <span>Price: <strong>${formatCurrency(item.unit_price || 0)}</strong></span>
                    <span>Category: ${item.category_name || 'N/A'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderManagerOutOfStockItems(items) {
    const container = document.getElementById('managerOutOfStockItems');
    if (!container) return;
    
    if (items.length === 0) {
        showEmptyState(container, {
            icon: '<i class="fas fa-check-circle fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'All Items Available',
            message: 'No out of stock items.',
            className: 'empty-state-small'
        });
        return;
    }
    
    hideEmptyState(container);
    container.innerHTML = items.map(item => `
        <div class="alert-item" style="padding: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${item.name}</strong>
                    ${item.sku ? `<br><small style="color: var(--text-secondary);">SKU: ${item.sku}</small>` : ''}
                </div>
                <span class="badge badge-danger">Out of Stock</span>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                Price: ${formatCurrency(item.unit_price || 0)} | 
                Category: ${item.category_name || 'N/A'} | 
                Sold last month: <strong>${item.sold_last_month || 0}</strong>
            </div>
        </div>
    `).join('');
}
