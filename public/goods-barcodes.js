let allBarcodes = [];
let filteredBarcodes = [];
let categories = [];
let currentSort = { column: 'name', direction: 'asc' };

// Load all barcodes from different sources
async function loadAllBarcodes() {
    const tbody = document.getElementById('barcodesTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading barcodes...</td></tr>';
    }
    
    try {
        allBarcodes = [];
        
        // Load inventory items
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const items = await apiRequest(`/items${queryParams}`);
        
        items.forEach(item => {
            const barcodeValue = item.sku || `ITEM-${item.id}`;
            allBarcodes.push({
                id: item.id,
                name: item.name,
                sku: item.sku,
                barcode: barcodeValue,
                source: 'inventory',
                category: item.category_name || 'Uncategorized',
                category_id: item.category_id,
                stock_quantity: item.stock_quantity || 0,
                unit_price: item.unit_price || 0,
                image_url: item.image_url,
                unit: item.unit,
                description: item.description
            });
        });
        
        // Load sales items
        try {
            const sales = await apiRequest(`/sales${queryParams}`);
            const salesMap = new Map();
            
            sales.forEach(sale => {
                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(saleItem => {
                        const itemId = saleItem.item_id;
                        const barcodeValue = saleItem.sku || saleItem.barcode || `ITEM-${itemId}`;
                        
                        // Avoid duplicates - use a composite key
                        const key = `${itemId}-${barcodeValue}-sales`;
                        if (!salesMap.has(key)) {
                            salesMap.set(key, {
                                id: itemId,
                                name: saleItem.item_name || saleItem.name || 'Unknown Item',
                                sku: saleItem.sku || saleItem.barcode,
                                barcode: barcodeValue,
                                source: 'sales',
                                category: saleItem.category_name || 'Uncategorized',
                                category_id: saleItem.category_id,
                                quantity_sold: saleItem.quantity || 0,
                                sale_date: sale.sale_date,
                                sale_id: sale.id,
                                unit_price: saleItem.unit_price || 0,
                                image_url: saleItem.image_url,
                                unit: saleItem.unit
                            });
                        }
                    });
                }
            });
            
            // Add sales items to allBarcodes
            salesMap.forEach(item => {
                allBarcodes.push(item);
            });
        } catch (error) {
            console.error('Error loading sales items:', error);
        }
        
        // Load purchase items
        try {
            const purchases = await apiRequest(`/purchases${queryParams}`);
            const purchasesMap = new Map();
            
            purchases.forEach(purchase => {
                if (purchase.items && Array.isArray(purchase.items)) {
                    purchase.items.forEach(purchaseItem => {
                        const itemId = purchaseItem.item_id;
                        const barcodeValue = purchaseItem.sku || purchaseItem.barcode || `ITEM-${itemId}`;
                        
                        const key = `${itemId}-${barcodeValue}-purchases`;
                        if (!purchasesMap.has(key)) {
                            purchasesMap.set(key, {
                                id: itemId,
                                name: purchaseItem.item_name || purchaseItem.name || 'Unknown Item',
                                sku: purchaseItem.sku || purchaseItem.barcode,
                                barcode: barcodeValue,
                                source: 'purchases',
                                category: purchaseItem.category_name || 'Uncategorized',
                                category_id: purchaseItem.category_id,
                                quantity_purchased: purchaseItem.quantity || 0,
                                purchase_date: purchase.purchase_date,
                                purchase_id: purchase.id,
                                unit_price: purchaseItem.unit_price || 0,
                                image_url: purchaseItem.image_url,
                                unit: purchaseItem.unit
                            });
                        }
                    });
                }
            });
            
            purchasesMap.forEach(item => {
                allBarcodes.push(item);
            });
        } catch (error) {
            console.error('Error loading purchase items:', error);
        }
        
        // Load categories for filter
        try {
            categories = await apiRequest('/categories');
            populateCategoryFilter();
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        
        // Apply filters and render
        applyBarcodeFilters();
        
    } catch (error) {
        console.error('Error loading barcodes:', error);
        showNotification('Error loading barcodes', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading barcodes. Please try again.</td></tr>';
        }
    }
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById('barcodeCategoryFilter');
    if (!categoryFilter) return;
    
    const currentValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
    
    if (currentValue) {
        categoryFilter.value = currentValue;
    }
}

function applyBarcodeFilters() {
    const searchTerm = (document.getElementById('barcodeSearch')?.value || '').toLowerCase().trim();
    const sourceFilter = document.getElementById('barcodeSourceFilter')?.value || '';
    const categoryFilter = document.getElementById('barcodeCategoryFilter')?.value || '';
    
    filteredBarcodes = allBarcodes.filter(barcode => {
        // Search filter
        if (searchTerm) {
            const matchesSearch = 
                (barcode.name || '').toLowerCase().includes(searchTerm) ||
                (barcode.sku || '').toLowerCase().includes(searchTerm) ||
                (barcode.barcode || '').toLowerCase().includes(searchTerm) ||
                (barcode.description || '').toLowerCase().includes(searchTerm);
            if (!matchesSearch) return false;
        }
        
        // Source filter
        if (sourceFilter && barcode.source !== sourceFilter) {
            return false;
        }
        
        // Category filter
        if (categoryFilter && String(barcode.category_id) !== String(categoryFilter)) {
            return false;
        }
        
        return true;
    });
    
    renderBarcodes();
}

function renderBarcodes() {
    const tbody = document.getElementById('barcodesTableBody');
    if (!tbody) return;
    
    if (filteredBarcodes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No barcodes found matching your filters.</td></tr>';
        return;
    }
    
    // Group by barcode value to avoid duplicates
    const barcodeMap = new Map();
    filteredBarcodes.forEach(item => {
        const key = item.barcode;
        if (!barcodeMap.has(key)) {
            barcodeMap.set(key, {
                ...item,
                sources: [item.source],
                count: 1
            });
        } else {
            const existing = barcodeMap.get(key);
            if (!existing.sources.includes(item.source)) {
                existing.sources.push(item.source);
            }
            existing.count++;
        }
    });
    
    let uniqueBarcodes = Array.from(barcodeMap.values());
    
    // Apply sorting
    uniqueBarcodes.sort((a, b) => {
        let aVal, bVal;
        switch (currentSort.column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'sku':
                aVal = (a.sku || '').toLowerCase();
                bVal = (b.sku || '').toLowerCase();
                break;
            case 'barcode':
                aVal = (a.barcode || '').toLowerCase();
                bVal = (b.barcode || '').toLowerCase();
                break;
            case 'category':
                aVal = (a.category || '').toLowerCase();
                bVal = (b.category || '').toLowerCase();
                break;
            default:
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
        }
        
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    tbody.innerHTML = uniqueBarcodes.map(item => {
        const safeName = escapeHtml(item.name || 'Unknown');
        const safeBarcode = escapeHtml(item.barcode);
        const safeSku = escapeHtml(item.sku || 'N/A');
        const safeCategory = escapeHtml(item.category || 'Uncategorized');
        const safeItemId = item.id || 0;
        
        const sourcesBadge = item.sources.map(s => {
            const colors = {
                'inventory': 'badge-info',
                'sales': 'badge-success',
                'purchases': 'badge-warning'
            };
            return `<span class="badge ${colors[s] || 'badge-secondary'}">${s}</span>`;
        }).join(' ');
        
        const imageHtml = item.image_url 
            ? `<img src="${escapeHtml(item.image_url)}" alt="${safeName}" style="max-width: 50px; max-height: 50px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none'">`
            : '<span style="color: var(--text-secondary);">-</span>';
        
        return `
            <tr>
                <td data-label="Name"><strong>${safeName}</strong></td>
                <td data-label="SKU">${safeSku !== 'N/A' ? safeSku : '<span style="color: var(--text-secondary); font-style: italic;">N/A</span>'}</td>
                <td data-label="Barcode"><code style="background: var(--bg-color); padding: 0.25rem 0.5rem; border-radius: 4px; font-family: monospace;">${safeBarcode}</code></td>
                <td data-label="Category">${safeCategory}</td>
                <td data-label="Source">${sourcesBadge}</td>
                <td data-label="Barcode Display">
                    <div style="display: flex; justify-content: center; align-items: center; padding: 0.5rem;">
                        <canvas id="barcode-canvas-${safeItemId}-${item.barcode.replace(/[^a-zA-Z0-9]/g, '-')}" style="max-width: 200px; height: auto;"></canvas>
                    </div>
                </td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-primary" onclick="viewBarcodeDetail('${safeBarcode}')" aria-label="View barcode details" title="View">
                        <i class="fas fa-eye"></i> <span class="btn-text-mobile">View</span>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="printSingleBarcode('${safeBarcode}')" aria-label="Print barcode" title="Print">
                        <i class="fas fa-print"></i> <span class="btn-text-mobile">Print</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Render barcodes using JsBarcode
    renderBarcodeCanvases();
}

function renderBarcodeCanvases() {
    if (!window.JsBarcode) {
        // Wait for library to load
        setTimeout(() => {
            if (window.JsBarcode) {
                renderBarcodeCanvases();
            }
        }, 100);
        return;
    }
    
    // Get unique barcodes from filtered list
    const barcodeMap = new Map();
    filteredBarcodes.forEach(item => {
        const key = item.barcode;
        if (!barcodeMap.has(key)) {
            barcodeMap.set(key, item);
        }
    });
    
    Array.from(barcodeMap.values()).forEach(item => {
        const canvasId = `barcode-canvas-${item.id || 0}-${item.barcode.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            try {
                JsBarcode(canvas, item.barcode, {
                    format: "CODE128",
                    width: 2,
                    height: 60,
                    displayValue: true,
                    fontSize: 12,
                    margin: 5,
                    background: "#ffffff",
                    lineColor: "#000000"
                });
            } catch (error) {
                console.error('Error rendering barcode:', error);
            }
        }
    });
}

function sortBarcodes(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    
    // Update sort indicators
    document.querySelectorAll('.data-table th.sortable i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    
    const clickedHeader = event?.target?.closest('th') || document.querySelector(`th[data-column="${column}"]`);
    if (clickedHeader) {
        const icon = clickedHeader.querySelector('i');
        if (icon) {
            icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    }
    
    renderBarcodes();
}

function viewBarcodeDetail(barcodeValue) {
    const item = allBarcodes.find(b => b.barcode === barcodeValue);
    if (!item) {
        showNotification('Barcode not found', 'error');
        return;
    }
    
    const modal = document.getElementById('barcodeViewerModal');
    const titleEl = document.getElementById('barcodeViewerModalTitle');
    const nameEl = document.getElementById('barcodeViewerItemName');
    const valueEl = document.getElementById('barcodeViewerValue');
    const canvasEl = document.getElementById('barcodeViewerCanvas');
    
    if (!modal || !titleEl || !nameEl || !valueEl || !canvasEl) {
        showNotification('Barcode viewer elements not found', 'error');
        return;
    }
    
    titleEl.textContent = 'Barcode Details';
    nameEl.textContent = item.name || 'Unknown Item';
    valueEl.textContent = barcodeValue;
    
    // Store current barcode for print/download
    window.currentBarcodeForViewer = {
        name: item.name || 'Unknown Item',
        barcode: barcodeValue
    };
    
    // Render barcode
    if (window.JsBarcode) {
        try {
            JsBarcode(canvasEl, barcodeValue, {
                format: "CODE128",
                width: 3,
                height: 120,
                displayValue: true,
                fontSize: 16,
                margin: 15,
                background: "#ffffff",
                lineColor: "#000000"
            });
        } catch (error) {
            console.error('Error rendering barcode:', error);
            showNotification('Error rendering barcode', 'error');
        }
    } else {
        canvasEl.innerHTML = '<p>Barcode: ' + escapeHtml(barcodeValue) + '</p>';
    }
    
    openModal('barcodeViewerModal');
}

function closeBarcodeViewer() {
    closeModal('barcodeViewerModal');
    window.currentBarcodeForViewer = null;
}

function printBarcode() {
    if (!window.currentBarcodeForViewer) return;
    
    const printWindow = window.open('', '_blank');
    const item = window.currentBarcodeForViewer;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barcode - ${escapeHtml(item.name)}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 2rem;
                }
                .barcode-container {
                    text-align: center;
                    padding: 2rem;
                    border: 2px solid #000;
                    border-radius: 8px;
                    background: white;
                }
                .item-name {
                    font-size: 1.5rem;
                    font-weight: bold;
                    margin-bottom: 1rem;
                }
                .barcode-value {
                    font-family: monospace;
                    font-size: 1.25rem;
                    margin-top: 1rem;
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            <div class="barcode-container">
                <div class="item-name">${escapeHtml(item.name)}</div>
                <canvas id="printBarcode"></canvas>
                <div class="barcode-value">${escapeHtml(item.barcode)}</div>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <script>
                JsBarcode("#printBarcode", "${escapeHtml(item.barcode)}", {
                    format: "CODE128",
                    width: 3,
                    height: 120,
                    displayValue: false,
                    fontSize: 16,
                    margin: 15,
                    background: "#ffffff",
                    lineColor: "#000000"
                });
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function downloadBarcode() {
    if (!window.currentBarcodeForViewer) return;
    
    const canvas = document.getElementById('barcodeViewerCanvas');
    if (!canvas) return;
    
    const item = window.currentBarcodeForViewer;
    const link = document.createElement('a');
    link.download = `barcode-${item.barcode}-${item.name.replace(/[^a-z0-9]/gi, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function printSingleBarcode(barcodeValue) {
    const item = allBarcodes.find(b => b.barcode === barcodeValue);
    if (!item) {
        showNotification('Barcode not found', 'error');
        return;
    }
    
    window.currentBarcodeForViewer = {
        name: item.name || 'Unknown Item',
        barcode: barcodeValue
    };
    printBarcode();
}

function printAllBarcodes() {
    if (filteredBarcodes.length === 0) {
        showNotification('No barcodes to print', 'error');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const uniqueBarcodes = Array.from(new Set(filteredBarcodes.map(b => b.barcode)));
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>All Barcodes</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 1rem;
                }
                .barcode-page {
                    page-break-after: always;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 2rem;
                }
                .barcode-container {
                    text-align: center;
                    padding: 2rem;
                    border: 2px solid #000;
                    border-radius: 8px;
                    background: white;
                    margin: 1rem;
                }
                .item-name {
                    font-size: 1.2rem;
                    font-weight: bold;
                    margin-bottom: 0.5rem;
                }
                .barcode-value {
                    font-family: monospace;
                    font-size: 1rem;
                    margin-top: 0.5rem;
                    font-weight: 600;
                }
                @media print {
                    .barcode-page {
                        page-break-after: always;
                    }
                }
            </style>
        </head>
        <body>
            ${uniqueBarcodes.map((barcodeValue, index) => {
                const item = allBarcodes.find(b => b.barcode === barcodeValue);
                const safeName = escapeHtml(item?.name || 'Unknown Item');
                const safeBarcode = escapeHtml(barcodeValue);
                return `
                    <div class="barcode-page">
                        <div class="barcode-container">
                            <div class="item-name">${safeName}</div>
                            <canvas id="printBarcode${index}"></canvas>
                            <div class="barcode-value">${safeBarcode}</div>
                        </div>
                    </div>
                `;
            }).join('')}
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <script>
                ${uniqueBarcodes.map((barcodeValue, index) => `
                    JsBarcode("#printBarcode${index}", "${escapeHtml(barcodeValue)}", {
                        format: "CODE128",
                        width: 3,
                        height: 100,
                        displayValue: false,
                        fontSize: 16,
                        margin: 15,
                        background: "#ffffff",
                        lineColor: "#000000"
                    });
                `).join('')}
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function clearBarcodeFilters() {
    const searchInput = document.getElementById('barcodeSearch');
    const sourceFilter = document.getElementById('barcodeSourceFilter');
    const categoryFilter = document.getElementById('barcodeCategoryFilter');
    
    if (searchInput) searchInput.value = '';
    if (sourceFilter) sourceFilter.value = '';
    if (categoryFilter) categoryFilter.value = '';
    
    applyBarcodeFilters();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('barcodeSearch');
    const sourceFilter = document.getElementById('barcodeSourceFilter');
    const categoryFilter = document.getElementById('barcodeCategoryFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyBarcodeFilters, 300));
    }
    
    if (sourceFilter) {
        sourceFilter.addEventListener('change', applyBarcodeFilters);
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', applyBarcodeFilters);
    }
}

// Make applyBarcodeFilters available for onclick handler (if needed)
window.applyBarcodeFilters = applyBarcodeFilters;

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Expose functions globally
window.loadAllBarcodes = loadAllBarcodes;
window.viewBarcodeDetail = viewBarcodeDetail;
window.closeBarcodeViewer = closeBarcodeViewer;
window.printBarcode = printBarcode;
window.downloadBarcode = downloadBarcode;
window.printSingleBarcode = printSingleBarcode;
window.printAllBarcodes = printAllBarcodes;
window.clearBarcodeFilters = clearBarcodeFilters;
window.sortBarcodes = sortBarcodes;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadAllBarcodes();
});

