let currentReport = 'stock';
// Chart instances stored globally for cleanup
if (typeof window.chartInstances === 'undefined') {
    window.chartInstances = {};
}
let chartInstances = window.chartInstances; // Reference to global chartInstances

document.addEventListener('DOMContentLoaded', async () => {
    await loadStockReport();
    await loadAnalyticsOverview();
    
    // Setup mobile sidebar toggle
    setupMobileSidebar();
    
    // Setup tab button event listeners (replaces inline onclick handlers)
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const reportType = btn.id.replace('tab-', '');
            showReport(reportType);
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
    
    // Setup new report filter buttons
    const stockoutFilterBtn = document.getElementById('stockoutFilterBtn');
    if (stockoutFilterBtn) {
        stockoutFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadStockoutReport();
        });
    }
    
    const varianceFilterBtn = document.getElementById('varianceFilterBtn');
    if (varianceFilterBtn) {
        varianceFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadVarianceReport();
        });
    }
    
    const laborFilterBtn = document.getElementById('laborFilterBtn');
    if (laborFilterBtn) {
        laborFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadLaborHoursReport();
        });
    }

    const abcRecalculateBtn = document.getElementById('abcRecalculateBtn');
    if (abcRecalculateBtn) {
        abcRecalculateBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await apiRequest('/abc-analysis/calculate', { method: 'POST' });
                await loadABCAnalysisReport();
                if (typeof showNotification === 'function') {
                    showNotification('ABC analysis recalculated successfully', 'success');
                }
            } catch (error) {
                console.error('Error recalculating ABC analysis:', error);
                if (typeof showNotification === 'function') {
                    showNotification('Error recalculating ABC analysis', 'error');
                }
            }
        });
    }

    const abcCategoryFilter = document.getElementById('abcCategoryFilter');
    if (abcCategoryFilter) {
        abcCategoryFilter.addEventListener('change', (e) => {
            e.preventDefault();
            loadABCAnalysisReport();
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
        'slow-moving': 'slowMovingReport',
        'sales-trends': 'salesTrendsReport',
        'revenue-analysis': 'revenueAnalysisReport',
        'category-performance': 'categoryPerformanceReport',
        'monthly-comparison': 'monthlyComparisonReport',
        'profit-analysis': 'profitAnalysisReport',
        'stockout': 'stockoutReport',
        'variance': 'varianceReport',
        'labor-hours': 'laborHoursReport',
        'abc-analysis': 'abcAnalysisReport'
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
            console.log('Loading revenue analysis chart...');
            if (typeof loadRevenueAnalysisChart === 'function') {
                loadRevenueAnalysisChart().catch(err => {
                    console.error('Error loading revenue analysis chart:', err);
                    if (typeof showNotification === 'function') {
                        showNotification(window.i18n ? window.i18n.t('messages.errorLoadingChart') : 'Error loading revenue analysis chart', 'error');
                    }
                });
            } else {
                console.error('loadRevenueAnalysisChart function not found');
                if (typeof showNotification === 'function') {
                    showNotification('Chart function not available. Please refresh the page.', 'error');
                }
            }
            break;
        case 'category-performance':
            console.log('Loading category performance chart...');
            if (typeof loadCategoryPerformanceChart === 'function') {
                loadCategoryPerformanceChart().catch(err => {
                    console.error('Error loading category performance chart:', err);
                    if (typeof showNotification === 'function') {
                        showNotification(window.i18n ? window.i18n.t('messages.errorLoadingChart') : 'Error loading category performance chart', 'error');
                    }
                });
            } else {
                console.error('loadCategoryPerformanceChart function not found');
                if (typeof showNotification === 'function') {
                    showNotification('Chart function not available. Please refresh the page.', 'error');
                }
            }
            break;
        case 'monthly-comparison':
            console.log('Loading monthly comparison chart...');
            if (typeof loadMonthlyComparisonChart === 'function') {
                loadMonthlyComparisonChart().catch(err => {
                    console.error('Error loading monthly comparison chart:', err);
                    if (typeof showNotification === 'function') {
                        showNotification('Error loading monthly comparison chart', 'error');
                    }
                });
            } else {
                console.error('loadMonthlyComparisonChart function not found');
                if (typeof showNotification === 'function') {
                    showNotification('Chart function not available. Please refresh the page.', 'error');
                }
            }
            break;
        case 'profit-analysis':
            console.log('Loading profit analysis chart...');
            if (typeof loadProfitAnalysisChart === 'function') {
                loadProfitAnalysisChart().catch(err => {
                    console.error('Error loading profit analysis chart:', err);
                    if (typeof showNotification === 'function') {
                        showNotification('Error loading profit analysis chart', 'error');
                    }
                });
            } else {
                console.error('loadProfitAnalysisChart function not found');
                if (typeof showNotification === 'function') {
                    showNotification('Chart function not available. Please refresh the page.', 'error');
                }
            }
            break;
        case 'stockout':
            loadStockoutReport();
            break;
        case 'variance':
            loadVarianceReport();
            break;
        case 'labor-hours':
            loadLaborHoursReport();
            break;
        case 'abc-analysis':
            loadABCAnalysisReport();
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

// Mobile Sidebar Toggle Functionality
function setupMobileSidebar() {
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('analyticsSidebar');
    const mobileClose = document.getElementById('mobileSidebarClose');
    
    if (!mobileToggle || !sidebar) return;
    
    // Show/hide close button based on screen size
    function updateCloseButton() {
        if (window.innerWidth <= 768) {
            if (mobileClose) mobileClose.style.display = 'block';
        } else {
            if (mobileClose) mobileClose.style.display = 'none';
            sidebar.classList.remove('mobile-open');
            document.body.style.overflow = '';
        }
    }
    
    // Toggle sidebar
    mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
    });
    
    // Close sidebar
    if (mobileClose) {
        mobileClose.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            document.body.style.overflow = '';
        });
    }
    
    // Close sidebar when clicking outside
    sidebar.addEventListener('click', (e) => {
        if (e.target === sidebar && sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
            document.body.style.overflow = '';
        }
    });
    
    
    // Handle window resize
    window.addEventListener('resize', updateCloseButton);
    updateCloseButton();
}

// TEST 001: Load Stockout Report
async function loadStockoutReport() {
    const tbody = document.getElementById('stockoutReportBody');
    const reportSection = document.getElementById('stockoutReport');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
    }
    
    try {
        const startDate = document.getElementById('stockoutStartDate')?.value || '';
        const endDate = document.getElementById('stockoutEndDate')?.value || '';
        const sku = document.getElementById('stockoutSKU')?.value || '';
        
        let url = '/api/reports/stockout?';
        const params = [];
        if (startDate) {
            params.push(`start_date=${startDate}`);
        }
        if (endDate) {
            params.push(`end_date=${endDate}`);
        }
        if (sku) {
            params.push(`sku=${encodeURIComponent(sku)}`);
        }
        url += params.join('&');
        
        const data = await apiRequest(url.replace('/api', ''));
        
        // Update summary
        if (data.summary) {
            document.getElementById('stockoutTotalEvents').textContent = data.summary.total_events || 0;
            document.getElementById('stockoutUnresolved').textContent = data.summary.unresolved_events || 0;
            document.getElementById('stockoutAvgDuration').textContent = data.summary.average_duration_minutes || 0;
        }
        
        // Render table
        if (tbody) {
            if (!data.events || data.events.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No stockout events found</td></tr>';
            } else {
                tbody.innerHTML = data.events.map(event => `
                    <tr>
                        <td>${event.sku || '-'}</td>
                        <td>${event.item_name || '-'}</td>
                        <td>${event.category_name || '-'}</td>
                        <td>${new Date(event.stockout_date).toLocaleString()}</td>
                        <td>${event.resolved_date ? new Date(event.resolved_date).toLocaleString() : '<span style="color: red;">Unresolved</span>'}</td>
                        <td>${event.duration_minutes || '-'}</td>
                        <td>${event.resolved_date ? '<span style="color: green;">Resolved</span>' : '<span style="color: red;">Active</span>'}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading stockout report:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: red;">Error loading report</td></tr>';
        }
    }
}

// TEST 002: Load Variance Report
async function loadVarianceReport() {
    const tbody = document.getElementById('varianceReportBody');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
    }
    
    try {
        const startDate = document.getElementById('varianceStartDate')?.value || '';
        const endDate = document.getElementById('varianceEndDate')?.value || '';
        const severity = document.getElementById('varianceSeverity')?.value || '';
        
        let url = '/api/reports/variance?';
        const params = [];
        if (startDate) {
            params.push(`start_date=${startDate}`);
        }
        if (endDate) {
            params.push(`end_date=${endDate}`);
        }
        if (severity) {
            params.push(`severity=${severity}`);
        }
        url += params.join('&');
        
        const data = await apiRequest(url.replace('/api', ''));
        
        // Update summary
        if (data.summary) {
            document.getElementById('varianceTotalCounts').textContent = data.summary.total_counts || 0;
            document.getElementById('varianceAcceptable').textContent = data.summary.acceptable || 0;
            document.getElementById('varianceConcerning').textContent = data.summary.concerning || 0;
            document.getElementById('varianceCritical').textContent = data.summary.critical || 0;
            const totalValue = data.summary.total_variance_value || 0;
            document.getElementById('varianceTotalValue').textContent = formatCurrency(totalValue);
        }
        
        // Render table
        if (tbody) {
            if (!data.variances || data.variances.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No variance data found</td></tr>';
            } else {
                tbody.innerHTML = data.variances.map(v => {
                    const severityClass = v.variance_severity === 'critical' ? 'red' : 
                                        v.variance_severity === 'concerning' ? 'orange' : 'green';
                    return `
                        <tr>
                            <td>${v.item_name || '-'}</td>
                            <td>${v.sku || '-'}</td>
                            <td>${v.system_quantity_before || '-'}</td>
                            <td>${v.physical_count || '-'}</td>
                            <td>${v.variance_amount || 0}</td>
                            <td>${v.variance_percentage ? v.variance_percentage.toFixed(2) + '%' : '-'}</td>
                            <td>${v.variance_value ? formatCurrency(v.variance_value) : '-'}</td>
                            <td><span style="color: ${severityClass};">${v.variance_severity || '-'}</span></td>
                            <td>${new Date(v.created_at).toLocaleDateString()}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading variance report:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: red;">Error loading report</td></tr>';
        }
    }
}

// TEST 003: Load Labor Hours Report
async function loadLaborHoursReport() {
    const tbody = document.getElementById('laborHoursReportBody');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
    }
    
    try {
        const startDate = document.getElementById('laborStartDate')?.value || '';
        const endDate = document.getElementById('laborEndDate')?.value || '';
        const activityType = document.getElementById('laborActivityType')?.value || '';
        
        let url = '/api/labor/hours?';
        const params = [];
        if (startDate) {
            params.push(`start_date=${startDate}`);
        }
        if (endDate) {
            params.push(`end_date=${endDate}`);
        }
        if (activityType) {
            params.push(`activity_type=${activityType}`);
        }
        url += params.join('&');
        
        const data = await apiRequest(url.replace('/api', ''));
        
        // Update summary
        if (data.summary) {
            document.getElementById('laborTotalEntries').textContent = data.summary.total_entries || 0;
            document.getElementById('laborTotalHours').textContent = (data.summary.total_hours || 0).toFixed(2);
            document.getElementById('laborTotalCost').textContent = formatCurrency(data.summary.total_labor_cost || 0);
        }
        
        // Render table
        if (tbody) {
            if (!data.hours || data.hours.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No labor hours found</td></tr>';
            } else {
                tbody.innerHTML = data.hours.map(h => `
                    <tr>
                        <td>${h.full_name || h.username || '-'}</td>
                        <td>${h.activity_type ? h.activity_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '-'}</td>
                        <td>${h.start_time ? new Date(h.start_time).toLocaleString() : '-'}</td>
                        <td>${h.end_time ? new Date(h.end_time).toLocaleString() : '<span style="color: orange;">In Progress</span>'}</td>
                        <td>${h.duration_minutes || '-'}</td>
                        <td>${h.item_name || '-'}</td>
                        <td>${h.labor_cost ? formatCurrency(h.labor_cost) : '-'}</td>
                        <td>${h.notes || '-'}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading labor hours report:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: red;">Error loading report</td></tr>';
        }
    }
}

// TEST 009: Load ABC Analysis Report
async function loadABCAnalysisReport() {
    const tbody = document.getElementById('abcAnalysisReportBody');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading...</td></tr>';
    }
    
    try {
        // Optional: recalculate is triggered by button; here we just load
        const category = document.getElementById('abcCategoryFilter')?.value || '';
        
        let url = '/api/reports/abc-analysis?';
        const params = [];
        if (category) {
            params.push(`category=${encodeURIComponent(category)}`);
        }
        url += params.join('&');
        
        const data = await apiRequest(url.replace('/api', ''));
        
        // Update summary
        if (data.summary) {
            document.getElementById('abcTotalItems').textContent = data.summary.total_items || 0;
            document.getElementById('abcCategoryA').textContent = data.summary.category_a || 0;
            document.getElementById('abcCategoryB').textContent = data.summary.category_b || 0;
            document.getElementById('abcCategoryC').textContent = data.summary.category_c || 0;
            document.getElementById('abcTotalValue').textContent = formatCurrency(data.summary.total_value || 0);
        }
        
        // Render table
        if (tbody) {
            if (!data.analysis || data.analysis.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No ABC analysis data found</td></tr>';
            } else {
                tbody.innerHTML = data.analysis.map(row => `
                    <tr>
                        <td>${row.item_name || '-'}</td>
                        <td>${row.sku || '-'}</td>
                        <td>${row.category || '-'}</td>
                        <td>${row.annual_quantity_sold || 0}</td>
                        <td>${formatCurrency(row.annual_usage_value || 0)}</td>
                        <td>${row.percentage_of_value ? row.percentage_of_value.toFixed(2) + '%' : '-'}</td>
                        <td>${row.percentage_of_skus ? row.percentage_of_skus.toFixed(2) + '%' : '-'}</td>
                        <td>${row.analysis_date || '-'}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading ABC analysis report:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: red;">Error loading report</td></tr>';
        }
    }
}

// Make functions globally available
window.showReport = showReport;
window.loadSalesReport = loadSalesReport;
window.loadPurchasesReport = loadPurchasesReport;
window.loadStockoutReport = loadStockoutReport;
window.loadVarianceReport = loadVarianceReport;
window.loadLaborHoursReport = loadLaborHoursReport;
window.loadABCAnalysisReport = loadABCAnalysisReport;

