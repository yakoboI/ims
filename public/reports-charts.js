// Chart.js configuration and chart rendering functions

// Wait for Chart.js to be available
function waitForChartJS() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof Chart !== 'undefined') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.error('Chart.js failed to load');
                resolve(); // Resolve anyway to prevent hanging
            }, 5000);
        }
    });
}

// Destroy existing chart if it exists
function destroyChart(chartId) {
    if (!window.chartInstances) {
        window.chartInstances = {};
    }
    if (window.chartInstances[chartId]) {
        try {
            window.chartInstances[chartId].destroy();
        } catch (e) {
            console.warn('Error destroying chart:', e);
        }
        delete window.chartInstances[chartId];
    }
}

// Common Chart.js configuration
const chartConfig = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
        legend: {
            position: 'top',
        },
        tooltip: {
            mode: 'index',
            intersect: false,
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            ticks: {
                callback: function(value) {
                    if (value >= 1000) {
                        return (value / 1000).toFixed(1) + 'K';
                    }
                    return value;
                }
            }
        }
    }
};

// Sales Trends Chart (Line Chart)
async function loadSalesTrendsChart() {
    await waitForChartJS();
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        showNotification('Chart library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    const canvas = document.getElementById('salesTrendsChart');
    if (!canvas) {
        console.error('Sales trends chart canvas not found');
        return;
    }
    
    destroyChart('salesTrendsChart');
    
    try {
        const startDate = document.getElementById('salesTrendsStartDate')?.value;
        const endDate = document.getElementById('salesTrendsEndDate')?.value;
        
        let url = '/reports/sales';
        if (startDate && endDate) {
            url += `?start_date=${startDate}&end_date=${endDate}`;
        }
        
        const salesData = await apiRequest(url);
        
        // Process data for chart
        const labels = salesData.map(sale => sale.date || sale.sale_date);
        const revenueData = salesData.map(sale => sale.total_revenue || 0);
        const itemsSoldData = salesData.map(sale => sale.total_items_sold || 0);
        
        const ctx = canvas.getContext('2d');
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances['salesTrendsChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: revenueData,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Items Sold',
                    data: itemsSoldData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }]
            },
            options: {
                ...chartConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Revenue ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Items Sold'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    ...chartConfig.plugins,
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return 'Revenue: ' + formatCurrency(context.parsed.y);
                                }
                                return 'Items Sold: ' + context.parsed.y;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading sales trends chart:', error);
        showNotification('Error loading sales trends chart', 'error');
    }
}

// Revenue Analysis Chart (Bar Chart)
async function loadRevenueAnalysisChart() {
    await waitForChartJS();
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        showNotification('Chart library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    const canvas = document.getElementById('revenueAnalysisChart');
    if (!canvas) {
        console.error('Revenue analysis chart canvas not found');
        return;
    }
    
    destroyChart('revenueAnalysisChart');
    
    try {
        const startDate = document.getElementById('revenueStartDate')?.value;
        const endDate = document.getElementById('revenueEndDate')?.value;
        
        let url = '/reports/sales';
        if (startDate && endDate) {
            url += `?start_date=${startDate}&end_date=${endDate}`;
        }
        
        const salesData = await apiRequest(url);
        
        // Process data - group by date
        const labels = salesData.map(sale => sale.date || sale.sale_date);
        const revenueData = salesData.map(sale => sale.total_revenue || 0);
        const salesCountData = salesData.map(sale => sale.total_sales || 0);
        
        const ctx = canvas.getContext('2d');
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances['revenueAnalysisChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: revenueData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                }, {
                    label: 'Number of Sales',
                    data: salesCountData,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                ...chartConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Revenue ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Number of Sales'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    ...chartConfig.plugins,
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return 'Revenue: ' + formatCurrency(context.parsed.y);
                                }
                                return 'Sales: ' + context.parsed.y;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading revenue analysis chart:', error);
        showNotification('Error loading revenue analysis chart', 'error');
    }
}

// Category Performance Chart (Doughnut Chart)
async function loadCategoryPerformanceChart() {
    await waitForChartJS();
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        showNotification('Chart library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    const canvas = document.getElementById('categoryPerformanceChart');
    if (!canvas) {
        console.error('Category performance chart canvas not found');
        return;
    }
    
    destroyChart('categoryPerformanceChart');
    
    try {
        // Get all sales data and items data
        const [salesData, itemsData] = await Promise.all([
            apiRequest('/sales').catch(() => []),
            apiRequest('/items').catch(() => [])
        ]);
        
        // Create a map of item_id to category_name
        const itemCategoryMap = new Map();
        itemsData.forEach(item => {
            itemCategoryMap.set(item.id, item.category_name || 'Uncategorized');
        });
        
        // Group sales by category
        const categoryMap = new Map();
        
        // Process each sale and its items
        salesData.forEach(sale => {
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(saleItem => {
                    // Get category from item map or from saleItem
                    const category = saleItem.category_name || 
                                   itemCategoryMap.get(saleItem.item_id) || 
                                   'Uncategorized';
                    const revenue = (saleItem.total_price || 
                                   saleItem.quantity * (saleItem.unit_price || 0)) || 0;
                    
                    if (categoryMap.has(category)) {
                        categoryMap.set(category, categoryMap.get(category) + revenue);
                    } else {
                        categoryMap.set(category, revenue);
                    }
                });
            }
        });
        
        const labels = Array.from(categoryMap.keys());
        const data = Array.from(categoryMap.values());
        
        // If no data, show message
        if (labels.length === 0 || data.every(d => d === 0)) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('No sales data available by category', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Generate colors
        const colors = [
            'rgba(59, 130, 246, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(251, 191, 36, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(168, 85, 247, 0.8)',
            'rgba(236, 72, 153, 0.8)',
            'rgba(20, 184, 166, 0.8)',
            'rgba(249, 115, 22, 0.8)',
            'rgba(99, 102, 241, 0.8)',
            'rgba(14, 165, 233, 0.8)'
        ];
        
        const ctx = canvas.getContext('2d');
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances['categoryPerformanceChart'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading category performance chart:', error);
        showNotification('Error loading category performance chart: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Monthly Comparison Chart (Bar Chart)
async function loadMonthlyComparisonChart() {
    await waitForChartJS();
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        showNotification('Chart library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    const canvas = document.getElementById('monthlyComparisonChart');
    if (!canvas) {
        console.error('Monthly comparison chart canvas not found');
        return;
    }
    
    destroyChart('monthlyComparisonChart');
    
    try {
        const selectedYear = document.getElementById('monthlyYear')?.value;
        
        // Get sales and purchases data
        const salesData = await apiRequest('/reports/sales');
        const purchasesData = await apiRequest('/reports/purchases');
        
        // Process data by month
        const monthlySales = {};
        const monthlyPurchases = {};
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        salesData.forEach(sale => {
            const date = new Date(sale.date || sale.sale_date);
            const year = date.getFullYear();
            const month = date.getMonth();
            
            if (!selectedYear || year.toString() === selectedYear) {
                const key = `${year}-${month}`;
                if (!monthlySales[key]) {
                    monthlySales[key] = { revenue: 0, count: 0 };
                }
                monthlySales[key].revenue += sale.total_revenue || 0;
                monthlySales[key].count += sale.total_sales || 0;
            }
        });
        
        purchasesData.forEach(purchase => {
            const date = new Date(purchase.date || purchase.purchase_date);
            const year = date.getFullYear();
            const month = date.getMonth();
            
            if (!selectedYear || year.toString() === selectedYear) {
                const key = `${year}-${month}`;
                if (!monthlyPurchases[key]) {
                    monthlyPurchases[key] = { spent: 0, count: 0 };
                }
                monthlyPurchases[key].spent += purchase.total_spent || 0;
                monthlyPurchases[key].count += purchase.total_purchases || 0;
            }
        });
        
        // Get unique months and sort
        const allMonths = new Set([...Object.keys(monthlySales), ...Object.keys(monthlyPurchases)]);
        const sortedMonths = Array.from(allMonths).sort();
        
        const labels = sortedMonths.map(key => {
            const [year, month] = key.split('-');
            return `${months[parseInt(month)]} ${year}`;
        });
        
        const salesRevenue = sortedMonths.map(key => monthlySales[key]?.revenue || 0);
        const purchasesSpent = sortedMonths.map(key => monthlyPurchases[key]?.spent || 0);
        
        const ctx = canvas.getContext('2d');
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances['monthlyComparisonChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales Revenue',
                    data: salesRevenue,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                }, {
                    label: 'Purchase Expenses',
                    data: purchasesSpent,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 1
                }]
            },
            options: {
                ...chartConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                },
                plugins: {
                    ...chartConfig.plugins,
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
        
        // Populate year dropdown
        const yearSelect = document.getElementById('monthlyYear');
        if (yearSelect) {
            const years = new Set();
            salesData.forEach(sale => {
                const date = new Date(sale.date || sale.sale_date);
                years.add(date.getFullYear().toString());
            });
            purchasesData.forEach(purchase => {
                const date = new Date(purchase.date || purchase.purchase_date);
                years.add(date.getFullYear().toString());
            });
            
            const currentOptions = Array.from(yearSelect.options).map(opt => opt.value);
            Array.from(years).sort().reverse().forEach(year => {
                if (!currentOptions.includes(year)) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading monthly comparison chart:', error);
        showNotification('Error loading monthly comparison chart', 'error');
    }
}

// Profit Analysis Chart (Area Chart)
async function loadProfitAnalysisChart() {
    await waitForChartJS();
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not available');
        showNotification('Chart library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    const canvas = document.getElementById('profitAnalysisChart');
    if (!canvas) {
        console.error('Profit analysis chart canvas not found');
        return;
    }
    
    destroyChart('profitAnalysisChart');
    
    try {
        const startDate = document.getElementById('profitStartDate')?.value;
        const endDate = document.getElementById('profitEndDate')?.value;
        
        let salesUrl = '/reports/sales';
        let purchasesUrl = '/reports/purchases';
        
        if (startDate && endDate) {
            salesUrl += `?start_date=${startDate}&end_date=${endDate}`;
            purchasesUrl += `?start_date=${startDate}&end_date=${endDate}`;
        }
        
        const [salesData, purchasesData] = await Promise.all([
            apiRequest(salesUrl),
            apiRequest(purchasesUrl)
        ]);
        
        // Combine and process data by date
        const dateMap = new Map();
        
        salesData.forEach(sale => {
            const date = sale.date || sale.sale_date;
            if (!dateMap.has(date)) {
                dateMap.set(date, { revenue: 0, expenses: 0 });
            }
            dateMap.get(date).revenue += sale.total_revenue || 0;
        });
        
        purchasesData.forEach(purchase => {
            const date = purchase.date || purchase.purchase_date;
            if (!dateMap.has(date)) {
                dateMap.set(date, { revenue: 0, expenses: 0 });
            }
            dateMap.get(date).expenses += purchase.total_spent || 0;
        });
        
        const sortedDates = Array.from(dateMap.keys()).sort();
        const labels = sortedDates;
        const revenueData = sortedDates.map(date => dateMap.get(date).revenue);
        const expensesData = sortedDates.map(date => dateMap.get(date).expenses);
        const profitData = sortedDates.map(date => dateMap.get(date).revenue - dateMap.get(date).expenses);
        
        const ctx = canvas.getContext('2d');
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances['profitAnalysisChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: revenueData,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Expenses',
                    data: expensesData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Profit',
                    data: profitData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true,
                    tension: 0.4,
                    borderDash: [5, 5]
                }]
            },
            options: {
                ...chartConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                },
                plugins: {
                    ...chartConfig.plugins,
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading profit analysis chart:', error);
        showNotification('Error loading profit analysis chart', 'error');
    }
}

// Make functions globally available
window.loadSalesTrendsChart = loadSalesTrendsChart;
window.loadRevenueAnalysisChart = loadRevenueAnalysisChart;
window.loadCategoryPerformanceChart = loadCategoryPerformanceChart;
window.loadMonthlyComparisonChart = loadMonthlyComparisonChart;
window.loadProfitAnalysisChart = loadProfitAnalysisChart;

