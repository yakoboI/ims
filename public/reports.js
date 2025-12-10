let currentReport = 'stock';
let chartInstances = {}; // Store chart instances for cleanup

document.addEventListener('DOMContentLoaded', async () => {
    await loadStockReport();
    await loadAnalyticsOverview();
    
    // Setup tab button event listeners (replaces inline onclick handlers)
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const reportType = btn.id.replace('tab-', '');
            showReport(reportType);
        });
    });
    
    // Setup sidebar navigation buttons
    const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-btn');
    sidebarNavButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const reportType = btn.getAttribute('data-report');
            showReport(reportType);
            // Update sidebar active state
            sidebarNavButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Setup filter button listeners
    const salesFilterBtn = document.getElementById('salesFilterBtn');
    if (salesFilterBtn) {
        salesFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadSalesReport();
        });
    }
    
    const purchasesFilterBtn = document.getElementById('purchasesFilterBtn');
    if (purchasesFilterBtn) {
        purchasesFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadPurchasesReport();
        });
    }
});

// Load analytics overview for sidebar
async function loadAnalyticsOverview() {
    try {
        // Load multiple analytics endpoints in parallel
        const [salesData, purchasesData, stockData] = await Promise.all([
            apiRequest('/reports/sales').catch(() => []),
            apiRequest('/reports/purchases').catch(() => []),
            apiRequest('/reports/stock').catch(() => [])
        ]);
        
        // Calculate total sales
        const totalSales = salesData.reduce((sum, sale) => sum + (sale.total_revenue || 0), 0);
        const totalSalesElement = document.getElementById('totalSalesAmount');
        if (totalSalesElement) {
            totalSalesElement.textContent = formatCurrency(totalSales);
        }
        
        // Calculate total purchases
        const totalPurchases = purchasesData.reduce((sum, purchase) => sum + (purchase.total_spent || 0), 0);
        const totalPurchasesElement = document.getElementById('totalPurchasesAmount');
        if (totalPurchasesElement) {
            totalPurchasesElement.textContent = formatCurrency(totalPurchases);
        }
        
        // Calculate total items and low stock
        const totalItems = stockData.length;
        const lowStockItems = stockData.filter(item => item.low_stock).length;
        
        const totalItemsElement = document.getElementById('totalItemsCount');
        if (totalItemsElement) {
            totalItemsElement.textContent = totalItems;
        }
        
        const lowStockElement = document.getElementById('lowStockCount');
        if (lowStockElement) {
            lowStockElement.textContent = lowStockItems;
        }
    } catch (error) {
        console.error('Error loading analytics overview:', error);
    }
}

function showReport(reportType) {
    const idMap = {
        'stock': 'stockReport',
        'sales': 'salesReport',
        'purchases': 'purchasesReport',
        'fast-moving': 'fastMovingReport',
        'slow-moving': 'slowMovingReport'
    };
    
    const reportId = idMap[reportType] || (reportType + 'Report');
    
    document.querySelectorAll('.report-section').forEach(section => {
        if (section) {
            section.style.display = 'none';
        }
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    const reportElement = document.getElementById(reportId);
    if (reportElement) {
        reportElement.style.display = 'block';
    } else {
        return;
    }
    
    // Update active tab button
    const activeTab = document.getElementById(`tab-${reportType}`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.setAttribute('aria-selected', 'true');
    }
    
    // Update aria-hidden for sections
    document.querySelectorAll('.report-section').forEach(section => {
        if (section.id === reportId) {
            section.setAttribute('aria-hidden', 'false');
        } else {
            section.setAttribute('aria-hidden', 'true');
        }
    });
    
    currentReport = reportType;
    
    switch(reportType) {
        case 'stock':
            loadStockReport();
            break;
        case 'sales':
            loadSalesReport();
            break;
        case 'purchases':
            loadPurchasesReport();
            break;
        case 'fast-moving':
            loadFastMovingReport();
            break;
        case 'slow-moving':
            loadSlowMovingReport();
            break;
        case 'sales-trends':
            if (typeof loadSalesTrendsChart === 'function') {
                loadSalesTrendsChart();
            }
            break;
        case 'revenue-analysis':
            if (typeof loadRevenueAnalysisChart === 'function') {
                loadRevenueAnalysisChart();
            }
            break;
        case 'category-performance':
            if (typeof loadCategoryPerformanceChart === 'function') {
                loadCategoryPerformanceChart();
            }
            break;
        case 'monthly-comparison':
            if (typeof loadMonthlyComparisonChart === 'function') {
                loadMonthlyComparisonChart();
            }
            break;
        case 'profit-analysis':
            if (typeof loadProfitAnalysisChart === 'function') {
                loadProfitAnalysisChart();
            }
            break;
    }
}

async function loadStockReport() {
    const tbody = document.getElementById('stockReportBody');
    const reportSection = document.getElementById('stockReport');
    
    // Show loading state
    if (tbody) {
        hideTableSkeleton(reportSection);
        showTableSkeleton(reportSection, 5, 6);
        tbody.innerHTML = '';
    }
    
    try {
        const items = await apiRequest('/reports/stock');
        if (reportSection) {
            hideTableSkeleton(reportSection);
        }
        renderStockReport(items);
    } catch (error) {
        if (reportSection) {
            hideTableSkeleton(reportSection);
        }
        showNotification('Error loading stock report', 'error');
    }
}

function renderStockReport(items) {
    const tbody = document.getElementById('stockReportBody');
    const reportSection = document.getElementById('stockReport');
    
    if (items.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (reportSection) {
            showEmptyState(reportSection, {
                icon: '📊',
                title: 'No Stock Data',
                message: 'No stock information available at this time.'
            });
        }
        return;
    }

    if (reportSection) {
        hideEmptyState(reportSection);
    }
    if (tbody) {
        tbody.innerHTML = items.map(item => `
        <tr>
            <td data-label="SKU">${item.sku || '-'}</td>
            <td data-label="Name"><strong>${item.name}</strong></td>
            <td data-label="Category">${item.category_name || '-'}</td>
            <td data-label="Stock Qty" class="col-stock numeric">
                <span class="${item.low_stock ? 'badge badge-warning' : 'badge badge-success'}">
                    ${item.stock_quantity} ${item.unit || 'pcs'}
                </span>
            </td>
            <td data-label="Min Level" class="col-min-stock numeric">${item.min_stock_level}</td>
            <td data-label="Status">
                ${item.low_stock 
                    ? '<span class="badge badge-warning">Low Stock</span>' 
                    : '<span class="badge badge-success">In Stock</span>'}
            </td>
        </tr>
    `).join('');
    }
    
    const searchInput = document.getElementById('stockSearch');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = items.filter(item => 
                item.name.toLowerCase().includes(searchTerm) ||
                (item.sku && item.sku.toLowerCase().includes(searchTerm))
            );
            renderStockReport(filtered);
        };
    }
}

async function loadSalesReport() {
    const tbody = document.getElementById('salesReportBody');
    const reportSection = document.getElementById('salesReport');
    
    // Show loading state
    if (tbody) {
        hideTableSkeleton(reportSection);
        showTableSkeleton(reportSection, 5, 4);
        tbody.innerHTML = '';
    }
    
    try {
        const startDate = document.getElementById('salesStartDate')?.value;
        const endDate = document.getElementById('salesEndDate')?.value;
        
        let url = '/reports/sales';
        if (startDate && endDate) {
            url += `?start_date=${startDate}&end_date=${endDate}`;
        }
        
        const sales = await apiRequest(url);
        if (reportSection) hideTableSkeleton(reportSection);
        renderSalesReport(sales);
    } catch (error) {
        if (reportSection) hideTableSkeleton(reportSection);
        showNotification('Error loading sales report', 'error');
        renderSalesReport([]);
    }
}

function renderSalesReport(sales) {
    const tbody = document.getElementById('salesReportBody');
    const reportSection = document.getElementById('salesReport');
    
    if (sales.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (reportSection) {
            showEmptyState(reportSection, {
                icon: '📊',
                title: 'No Sales Data',
                message: 'No sales data available for the selected period.'
            });
        }
        return;
    }

    if (reportSection) hideEmptyState(reportSection);
    
    if (!tbody) return;

    const totalRevenue = sales.reduce((sum, sale) => sum + (sale.total_revenue || 0), 0);
    const totalItemsSold = sales.reduce((sum, sale) => sum + (sale.total_items_sold || 0), 0);

    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td data-label="Date">${sale.date}</td>
            <td data-label="Total Sales" class="col-quantity numeric">${sale.total_sales || 0}</td>
            <td data-label="Total Revenue" class="col-amount numeric"><strong>${formatCurrency(sale.total_revenue || 0)}</strong></td>
            <td data-label="Items Sold" class="col-quantity numeric">${sale.total_items_sold || 0}</td>
        </tr>
    `).join('') + `
        <tr class="report-total-row">
            <td data-label="Date">-</td>
            <td data-label="Total Sales" class="col-quantity numeric"><strong>Total</strong></td>
            <td data-label="Total Revenue" class="col-amount numeric"><strong>${formatCurrency(totalRevenue)}</strong></td>
            <td data-label="Items Sold" class="col-quantity numeric"><strong>${totalItemsSold}</strong></td>
        </tr>
    `;
}

async function loadPurchasesReport() {
    const tbody = document.getElementById('purchasesReportBody');
    const reportSection = document.getElementById('purchasesReport');
    
    // Show loading state
    if (tbody) {
        hideTableSkeleton(reportSection);
        showTableSkeleton(reportSection, 5, 4);
        tbody.innerHTML = '';
    }
    
    try {
        const startDate = document.getElementById('purchasesStartDate')?.value;
        const endDate = document.getElementById('purchasesEndDate')?.value;
        
        let url = '/reports/purchases';
        if (startDate && endDate) {
            url += `?start_date=${startDate}&end_date=${endDate}`;
        }
        
        const purchases = await apiRequest(url);
        if (reportSection) hideTableSkeleton(reportSection);
        renderPurchasesReport(purchases);
    } catch (error) {
        if (reportSection) hideTableSkeleton(reportSection);
        showNotification('Error loading purchases report', 'error');
        renderPurchasesReport([]);
    }
}

function renderPurchasesReport(purchases) {
    const tbody = document.getElementById('purchasesReportBody');
    const reportSection = document.getElementById('purchasesReport');
    
    if (purchases.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (reportSection) {
            showEmptyState(reportSection, {
                icon: '📊',
                title: 'No Purchase Data',
                message: 'No purchase data available for the selected period.'
            });
        }
        return;
    }

    if (reportSection) hideEmptyState(reportSection);

    const totalSpent = purchases.reduce((sum, purchase) => sum + (purchase.total_spent || 0), 0);
    const totalItemsPurchased = purchases.reduce((sum, purchase) => sum + (purchase.total_items_purchased || 0), 0);

    if (!tbody) return;
    
    tbody.innerHTML = purchases.map(purchase => `
        <tr>
            <td data-label="Date">${purchase.date}</td>
            <td data-label="Total Purchases" class="col-quantity numeric">${purchase.total_purchases || 0}</td>
            <td data-label="Total Spent" class="col-amount numeric"><strong>${formatCurrency(purchase.total_spent || 0)}</strong></td>
            <td data-label="Items Purchased" class="col-quantity numeric">${purchase.total_items_purchased || 0}</td>
        </tr>
    `).join('') + `
        <tr class="report-total-row">
            <td data-label="Date">-</td>
            <td data-label="Total Purchases" class="col-quantity numeric"><strong>Total</strong></td>
            <td data-label="Total Spent" class="col-amount numeric"><strong>${formatCurrency(totalSpent)}</strong></td>
            <td data-label="Items Purchased" class="col-quantity numeric"><strong>${totalItemsPurchased}</strong></td>
        </tr>
    `;
}

async function loadFastMovingReport() {
    const tbody = document.getElementById('fastMovingReportBody');
    const reportSection = document.getElementById('fastMovingReport');
    
    // Show loading state
    if (tbody) {
        hideTableSkeleton(reportSection);
        showTableSkeleton(reportSection, 5, 4);
        tbody.innerHTML = '';
    }
    
    try {
        const items = await apiRequest('/reports/fast-moving');
        if (reportSection) hideTableSkeleton(reportSection);
        renderFastMovingReport(items);
    } catch (error) {
        if (reportSection) hideTableSkeleton(reportSection);
        showNotification('Error loading fast moving report', 'error');
        renderFastMovingReport([]);
    }
}

function renderFastMovingReport(items) {
    const tbody = document.getElementById('fastMovingReportBody');
    const reportSection = document.getElementById('fastMovingReport');
    
    if (items.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (reportSection) {
            showEmptyState(reportSection, {
                icon: '📊',
                title: 'No Fast Moving Items',
                message: 'No fast moving items data available at this time.'
            });
        }
        return;
    }

    if (reportSection) hideEmptyState(reportSection);

    tbody.innerHTML = items.map(item => `
        <tr>
            <td data-label="SKU">${item.sku || '-'}</td>
            <td data-label="Item Name"><strong>${item.name}</strong></td>
            <td data-label="Total Sold" class="col-quantity numeric">${item.total_sold || 0}</td>
            <td data-label="Total Revenue" class="col-amount numeric"><strong>${formatCurrency(item.total_revenue || 0)}</strong></td>
        </tr>
    `).join('');
}

async function loadSlowMovingReport() {
    const tbody = document.getElementById('slowMovingReportBody');
    const reportSection = document.getElementById('slowMovingReport');
    
    // Show loading state
    if (tbody) {
        hideTableSkeleton(reportSection);
        showTableSkeleton(reportSection, 5, 4);
        tbody.innerHTML = '';
    }
    
    try {
        const items = await apiRequest('/reports/slow-moving');
        if (reportSection) hideTableSkeleton(reportSection);
        renderSlowMovingReport(items);
    } catch (error) {
        if (reportSection) hideTableSkeleton(reportSection);
        showNotification('Error loading slow moving report', 'error');
        renderSlowMovingReport([]);
    }
}

function renderSlowMovingReport(items) {
    const tbody = document.getElementById('slowMovingReportBody');
    const reportSection = document.getElementById('slowMovingReport');
    
    if (items.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (reportSection) {
            showEmptyState(reportSection, {
                icon: '📊',
                title: 'No Slow Moving Items',
                message: 'No slow moving items data available at this time.'
            });
        }
        return;
    }

    if (reportSection) hideEmptyState(reportSection);

    tbody.innerHTML = items.map(item => `
        <tr>
            <td data-label="SKU">${item.sku || '-'}</td>
            <td data-label="Item Name"><strong>${item.name}</strong></td>
            <td data-label="Stock Qty" class="col-stock numeric">${item.stock_quantity || 0}</td>
            <td data-label="Total Sold" class="col-quantity numeric">${item.total_sold || 0}</td>
        </tr>
    `).join('');
}

// Make functions globally available
window.showReport = showReport;
window.loadSalesReport = loadSalesReport;
window.loadPurchasesReport = loadPurchasesReport;

