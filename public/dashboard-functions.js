// Dashboard Enhancement Functions - Loaded before dashboard.js
// These functions must be available globally before HTML onclick handlers execute

// Dashboard Enhancement Variables
let dashboardDateRange = {
    start: null,
    end: null,
    preset: 'thisMonth'
};

let chartInstances = {}; // Store chart instances for cleanup
let statCardListeners = new Map(); // Track event listeners to prevent duplicates

// Export Dashboard
async function exportDashboard() {
    try {
        const role = getUserRole();
        let data = {};
        
        // Collect dashboard data based on role
        switch(role) {
            case 'admin':
                data = await apiRequest('/reports/dashboard');
                break;
            case 'storekeeper':
                data = await apiRequest('/reports/storekeeper-analytics');
                break;
            case 'sales':
                data = await apiRequest('/reports/sales-analytics');
                break;
            case 'manager':
                data = await apiRequest('/reports/manager-analytics');
                break;
        }
        
        // Create CSV content
        const csvContent = convertToCSV(data);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `dashboard_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Dashboard exported successfully', 'success');
    } catch (error) {
        showNotification('Error exporting dashboard', 'error');
    }
}

function convertToCSV(data) {
    // Simple CSV conversion - can be enhanced
    let csv = 'Metric,Value\n';
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null) {
            for (const [subKey, subValue] of Object.entries(value)) {
                csv += `${key}_${subKey},"${subValue}"\n`;
            }
        } else {
            csv += `${key},"${value}"\n`;
        }
    }
    return csv;
}

// Print Dashboard
function printDashboard() {
    window.print();
}

// Date Range Handling Functions
function handleDateRangePreset() {
    const preset = document.getElementById('dateRangePreset')?.value;
    if (!preset) return;
    const customRange = document.getElementById('customDateRange');
    
    if (preset === 'custom') {
        if (customRange) customRange.style.display = 'flex';
        dashboardDateRange.preset = 'custom';
    } else {
        if (customRange) customRange.style.display = 'none';
        dashboardDateRange.preset = preset;
        setDateRangeFromPreset(preset);
        refreshDashboard();
    }
}

function setDateRangeFromPreset(preset) {
    const today = new Date();
    const start = new Date();
    const end = new Date();
    
    switch(preset) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            start.setDate(today.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(today.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case 'thisWeek':
            const dayOfWeek = today.getDay();
            start.setDate(today.getDate() - dayOfWeek);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'lastWeek':
            const lastWeekDay = today.getDay();
            start.setDate(today.getDate() - lastWeekDay - 7);
            start.setHours(0, 0, 0, 0);
            end.setDate(today.getDate() - lastWeekDay - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case 'thisMonth':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'lastMonth':
            start.setMonth(today.getMonth() - 1, 1);
            start.setHours(0, 0, 0, 0);
            end.setMonth(today.getMonth(), 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'thisYear':
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
    }
    
    dashboardDateRange.start = start;
    dashboardDateRange.end = end;
}

function applyCustomDateRange() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    if (startDate && endDate) {
        dashboardDateRange.start = new Date(startDate);
        dashboardDateRange.end = new Date(endDate);
        dashboardDateRange.end.setHours(23, 59, 59, 999);
        refreshDashboard();
    } else {
        showNotification('Please select both start and end dates', 'warning');
    }
}

// Make all functions globally available immediately
window.exportDashboard = exportDashboard;
window.printDashboard = printDashboard;
window.handleDateRangePreset = handleDateRangePreset;
window.applyCustomDateRange = applyCustomDateRange;

// Initialize date range on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setDateRangeFromPreset('thisMonth');
    });
} else {
    setDateRangeFromPreset('thisMonth');
}

