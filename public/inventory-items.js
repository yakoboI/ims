let categories = [];
let items = [];
let filteredItems = [];
let currentEditingItem = null;
// No bulk selection in items view
let selectedItems = new Set(); // Keep for compatibility but won't be used
let currentSort = { column: null, direction: 'asc' };
// Column visibility - only show the columns we're using
let visibleColumns = new Set(['name', 'image', 'unit', 'description', 'expiration_date']);
let uploadedImageData = null;
let uploadedImages = []; // For batch upload
let itemVariants = [];
let reorderAutoEnabled = false;
let itemTemplates = [];
let showArchivedItems = false;

/**
 * Render barcode on a canvas element
 * @param {HTMLElement} canvas - Canvas element
 * @param {string} value - Value to encode (SKU or item ID)
 */
function renderBarcode(canvas, value) {
    if (!canvas) {
        return;
    }
    
    if (!value) {
        if (canvas.parentElement) {
            const container = canvas.parentElement;
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; padding: 0.5rem;">
                    <span style="font-family: monospace; font-size: 12px; color: var(--text-secondary);">N/A</span>
                    <small style="color: var(--text-secondary); font-size: 10px;">No barcode</small>
                </div>
            `;
        }
        return;
    }
    
    // Ensure canvas has proper dimensions
    if (!canvas.width) canvas.width = 200;
    if (!canvas.height) canvas.height = 60;
    
    // Check if JsBarcode is loaded
    if (!window.JsBarcode) {
        // Retry after a short delay
        setTimeout(() => {
            if (window.JsBarcode) {
                renderBarcode(canvas, value);
            } else {
                if (canvas.parentElement) {
                    const container = canvas.parentElement;
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; padding: 0.5rem;">
                            <span style="font-family: monospace; font-size: 12px; color: var(--text-primary);">${value}</span>
                            <small style="color: var(--warning-color); font-size: 10px;">Library not loaded</small>
                        </div>
                    `;
                }
            }
        }, 500);
        return;
    }
    
    try {
        // Clear canvas first
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        // Generate barcode with better visibility
        JsBarcode(canvas, value, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: false, // We show value separately below
            fontSize: 10,
            margin: 8,
            background: "#ffffff",
            lineColor: "#000000",
            valid: function(valid) {
                if (!valid) {
                    if (canvas.parentElement) {
                        const container = canvas.parentElement;
                        container.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; padding: 0.5rem;">
                                <span style="font-family: monospace; font-size: 12px; color: var(--text-primary);">${value}</span>
                                <small style="color: var(--warning-color); font-size: 10px;">Invalid barcode</small>
                            </div>
                        `;
                    }
                } else {
                    // Success - ensure canvas is visible (batch style changes)
                    requestAnimationFrame(() => {
                        canvas.style.cssText = 'display: block; visibility: visible; opacity: 1;';
                    });
                }
            }
        });
        
        // Ensure canvas is visible and properly sized - batch style changes to avoid forced reflow
        requestAnimationFrame(() => {
            canvas.style.cssText = 'display: block; visibility: visible; opacity: 1; max-width: 100%; width: auto; height: 60px;';
        });
        
    } catch (error) {
        console.error('Error generating barcode:', error, 'Value:', value);
        // Fallback: show text if barcode generation fails
        if (canvas.parentElement) {
            const container = canvas.parentElement;
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; padding: 0.5rem;">
                    <span style="font-family: monospace; font-size: 12px; color: var(--text-primary);">${value}</span>
                    <small style="color: var(--danger-color); font-size: 10px;">Error: ${error.message}</small>
                </div>
            `;
        }
    }
}

/**
 * Wait for JsBarcode library to load and then render all barcodes
 */
function renderAllBarcodes(itemsList) {
    if (!itemsList || itemsList.length === 0) {
        return;
    }
    
    const maxAttempts = 20; // Increased attempts
    let attempts = 0;
    
    const tryRender = () => {
        attempts++;
        
        if (window.JsBarcode) {
            // Library is loaded, render all barcodes
            itemsList.forEach((item, index) => {
                const barcodeValue = item.sku || `ITEM-${item.id}`;
                const barcodeId = `barcode-${item.id}`;
                
                // Use setTimeout to avoid blocking
                setTimeout(() => {
                    const canvas = document.getElementById(barcodeId);
                    if (canvas) {
                        renderBarcode(canvas, barcodeValue);
                    } else {
                    }
                }, index * 10); // Stagger rendering slightly
            });
        } else if (attempts < maxAttempts) {
            // Library not loaded yet, try again
            setTimeout(tryRender, 300);
        } else {
            // Library failed to load, show text fallback
            console.error('JsBarcode library failed to load after', maxAttempts, 'attempts');
            itemsList.forEach(item => {
                const barcodeValue = item.sku || `ITEM-${item.id}`;
                const barcodeId = `barcode-${item.id}`;
                const canvas = document.getElementById(barcodeId);
                if (canvas && canvas.parentElement) {
                    const container = canvas.parentElement;
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; padding: 0.5rem;">
                            <span style="font-family: monospace; font-size: 12px; color: var(--text-primary);">${barcodeValue}</span>
                            <small style="color: var(--danger-color); font-size: 10px;">Library not loaded</small>
                        </div>
                    `;
                }
            });
        }
    };
    
    // Start trying to render
    tryRender();
}

document.addEventListener('DOMContentLoaded', async () => {
    
    
    await loadCategories();
    await loadItems();
    await loadItemTemplates();
    setupEventListeners();
});

async function loadCategories() {
    try {
        categories = await apiRequest('/categories');
        // Category field removed from form
    } catch (error) {
    }
}

function populateUnitFilter() {
    const unitFilter = document.getElementById('unitFilter');
    if (!unitFilter || !items || items.length === 0) return;
    
    // Get unique units from items
    const uniqueUnits = [...new Set(items.map(item => (item.unit || 'pcs').toLowerCase()))].sort();
    
    const options = uniqueUnits.map(unit => 
        `<option value="${unit}">${unit.charAt(0).toUpperCase() + unit.slice(1)}</option>`
    ).join('');
    
    unitFilter.innerHTML = '<option value="">All Units</option>' + options;
}

async function loadItems() {
    const tbody = document.getElementById('itemsTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    hideTableSkeleton(tableContainer);
    showTableSkeleton(tableContainer, 5, 8);
    tbody.innerHTML = '';
    
    try {
        // Get shop filter if superadmin has selected a shop
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        let url = showArchivedItems ? '/items?includeArchived=true' : '/items';
        // Only add shop_id if it's a valid number
        if (shopFilter.shop_id && !isNaN(parseInt(shopFilter.shop_id))) {
            url += url.includes('?') ? `&shop_id=${shopFilter.shop_id}` : `?shop_id=${shopFilter.shop_id}`;
        }
        items = await apiRequest(url);
        hideTableSkeleton(tableContainer);
        renderItemsTable(items);
        populateUnitFilter(); // Populate unit filter with unique units
        await loadReorderSuggestions();
    } catch (error) {
        hideTableSkeleton(tableContainer);
        // Extract error message from various possible error formats
        let errorMessage = 'Error loading items';
        if (error && typeof error === 'object') {
            errorMessage = error.error || error.message || error.toString();
        } else if (error) {
            errorMessage = error.toString();
        }
        console.error('Error loading items:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        showNotification(errorMessage, 'error');
        if (items.length === 0) {
            showEmptyState(tableContainer, EmptyStates.items);
        }
    }
}

async function loadItemTemplates() {
    try {
        itemTemplates = await apiRequest('/item-templates');
    } catch (error) {
        console.error('Error loading templates:', error);
        itemTemplates = [];
    }
}

async function saveItemTemplate(name, description, itemData) {
    try {
        await apiRequest('/item-templates', 'POST', {
            name,
            description,
            item_data: itemData
        });
        showNotification('Template saved successfully', 'success');
        await loadItemTemplates();
    } catch (error) {
        showNotification('Error saving template', 'error');
    }
}

async function loadItemTemplate(templateId) {
    try {
        const id = parseInt(templateId);
        if (isNaN(id)) {
            showNotification('Invalid template ID', 'error');
            return;
        }
        const template = itemTemplates.find(t => t.id === id);
        if (!template || !template.item_data) {
            showNotification('Template not found', 'error');
            return;
        }
        
        const itemData = template.item_data;
        
        // Clear existing form state
        clearImagePreview();
        
        // Open modal first
        openItemModal();
        
        // Populate form with template data (only fields that exist)
        document.getElementById('itemName').value = itemData.name || '';
        document.getElementById('itemImageUrl').value = itemData.image_url || '';
        document.getElementById('itemUnit').value = itemData.unit || 'pcs';
        document.getElementById('itemDescription').value = itemData.description || '';
        document.getElementById('itemExpirationDate').value = itemData.expiration_date || '';
        
        // Show image preview if exists
        if (itemData.image_url) {
            const preview = document.getElementById('imagePreview');
            const container = document.getElementById('imagePreviewContainer');
            if (preview && container) {
                preview.src = itemData.image_url;
                container.style.display = 'block';
            }
        }
        
        // Handle image preview
        if (itemData.image_url) {
            uploadedImageData = itemData.image_url;
            const preview = document.getElementById('imagePreview');
            const container = document.getElementById('imagePreviewContainer');
            if (preview && container) {
                preview.src = uploadedImageData;
                container.style.display = 'block';
            }
        }
        
        showNotification('Template loaded', 'success');
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Error loading template: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function archiveItem(itemId) {
    if (!confirm('Archive this item? It will be hidden from the main list.')) return;
    
    try {
        await apiRequest(`/items/${itemId}/archive`, 'POST');
        showNotification('Item archived successfully', 'success');
        await loadItems();
    } catch (error) {
        showNotification('Error archiving item', 'error');
    }
}

async function unarchiveItem(itemId) {
    try {
        await apiRequest(`/items/${itemId}/unarchive`, 'POST');
        showNotification('Item unarchived successfully', 'success');
        await loadItems();
    } catch (error) {
        showNotification('Error unarchiving item', 'error');
    }
}

async function viewItemHistory(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const titleEl = document.getElementById('itemHistoryTitle');
    const content = document.getElementById('itemHistoryContent');
    
    if (!titleEl || !content) {
        showNotification('History modal elements not found', 'error');
        return;
    }
    
    titleEl.textContent = `Item History - ${escapeHtml(item.name || 'Unknown')}`;
    openModal('itemHistoryModal');
    content.innerHTML = '<p>Loading history...</p>';
    
    try {
        const history = await apiRequest(`/items/${itemId}/history`);
        
        if (history.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No history recorded</p>';
            return;
        }
        
        content.innerHTML = `
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Field</th>
                        <th>Old Value</th>
                        <th>New Value</th>
                        <th>Changed By</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(h => `
                        <tr>
                            <td>${formatDate(h.created_at)}</td>
                            <td><code>${h.field_name}</code></td>
                            <td>${h.old_value || '<em>null</em>'}</td>
                            <td>${h.new_value || '<em>null</em>'}</td>
                            <td>${h.changed_by_name || 'Unknown'}</td>
                            <td><span class="badge badge-${h.change_type === 'create' ? 'success' : h.change_type === 'archive' ? 'warning' : h.change_type === 'unarchive' ? 'info' : 'secondary'}">${h.change_type}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        const errorMsg = escapeHtml(error.message || 'Unknown error');
        content.innerHTML = `<p style="color: var(--danger-color);">Error loading history: ${errorMsg}</p>`;
    }
}

function toggleArchivedItems() {
    showArchivedItems = !showArchivedItems;
    const btn = document.getElementById('toggleArchivedBtn');
    if (btn) {
        btn.textContent = showArchivedItems ? 'Hide Archived' : 'Show Archived';
    }
    loadItems();
}

// Load and display reorder suggestions
async function loadReorderSuggestions() {
    const section = document.getElementById('reorderSuggestionsSection');
    const list = document.getElementById('reorderSuggestionsList');
    if (!section || !list) return;
    
    try {
        // Get items with reorder automation enabled
        const itemsWithAutoReorder = items.filter(item => item.reorder_auto_enabled === 1);
        
        if (itemsWithAutoReorder.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        // Calculate suggestions for each item
        const suggestions = [];
        
        for (const item of itemsWithAutoReorder) {
            try {
                const sales = await apiRequest('/sales').catch(() => []);
                if (!Array.isArray(sales)) {
                    continue;
                }
                
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                let totalSold = 0;
                const salesByDay = {};
                
                const salePromises = sales
                    .filter(sale => {
                        if (!sale || !sale.sale_date) return false;
                        const saleDate = new Date(sale.sale_date);
                        return !isNaN(saleDate.getTime()) && saleDate >= thirtyDaysAgo;
                    })
                    .map(sale => apiRequest(`/sales/${sale.id}`).catch(() => null));
                
                const saleDetails = await Promise.all(salePromises);
                
                saleDetails.forEach(saleDetail => {
                    if (saleDetail && saleDetail.items) {
                        saleDetail.items.forEach(saleItem => {
                            if (saleItem.item_id === item.id) {
                                totalSold += saleItem.quantity || 0;
                                const saleDate = new Date(saleDetail.sale_date || saleDetail.created_at);
                                const dayKey = saleDate.toISOString().split('T')[0];
                                if (!salesByDay[dayKey]) {
                                    salesByDay[dayKey] = 0;
                                }
                                salesByDay[dayKey] += saleItem.quantity || 0;
                            }
                        });
                    }
                });
                
                const daysWithSales = Object.keys(salesByDay).length;
                const avgDailySales = daysWithSales > 0 ? totalSold / daysWithSales : 0;
                const currentStock = item.stock_quantity || 0;
                const minStock = item.min_stock_level || 10;
                const daysRemaining = avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : 999;
                
                const leadTimeDays = 7;
                const safetyStockDays = 3;
                const reorderPoint = Math.ceil(avgDailySales * (leadTimeDays + safetyStockDays));
                const suggestedReorder = Math.max(reorderPoint - currentStock, 0);
                
                if (suggestedReorder > 0 || currentStock <= minStock || daysRemaining < 14) {
                    suggestions.push({
                        item: item,
                        suggestedReorder: suggestedReorder,
                        daysRemaining: daysRemaining,
                        avgDailySales: avgDailySales,
                        currentStock: currentStock,
                        priority: daysRemaining < 7 ? 'high' : daysRemaining < 14 ? 'medium' : 'low'
                    });
                }
            } catch (error) {
                console.error(`Error calculating suggestion for item ${item.id}:`, error);
            }
        }
        
        if (suggestions.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        // Sort by priority
        suggestions.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            if (a.priority === 'medium' && b.priority === 'low') return -1;
            if (a.priority === 'low' && b.priority === 'medium') return 1;
            return a.daysRemaining - b.daysRemaining;
        });
        
        section.style.display = 'block';
        list.innerHTML = `
            <div style="display: grid; gap: 0.5rem;">
                ${suggestions.map(suggestion => {
                    const badgeClass = suggestion.priority === 'high' ? 'badge-danger' : suggestion.priority === 'medium' ? 'badge-warning' : 'badge-info';
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--${suggestion.priority === 'high' ? 'danger' : suggestion.priority === 'medium' ? 'warning' : 'info'}-color);">
                            <div>
                                <strong>${suggestion.item.name}</strong>
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
                                    Current: ${suggestion.currentStock} ${suggestion.item.unit || 'pcs'} | 
                                    Days remaining: ${suggestion.daysRemaining > 999 ? 'N/A' : suggestion.daysRemaining} | 
                                    Avg sales: ${suggestion.avgDailySales.toFixed(1)}/${suggestion.item.unit || 'pcs'}/day
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div class="badge ${badgeClass}" style="margin-bottom: 0.25rem;">${suggestion.priority.toUpperCase()}</div>
                                <div><strong>Reorder: ${suggestion.suggestedReorder} ${suggestion.item.unit || 'pcs'}</strong></div>
                                <button class="btn btn-sm btn-primary" onclick="openAdjustStockModal(${suggestion.item.id})" style="margin-top: 0.25rem;">
                                    <i class="fas fa-plus"></i> Adjust Stock
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading reorder suggestions:', error);
        section.style.display = 'none';
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderItemsTable(itemsList) {
    filteredItems = itemsList;
    const tbody = document.getElementById('itemsTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) {
        console.error('itemsTableBody not found');
        return;
    }
    
    if (itemsList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.items);
        return;
    }

    hideEmptyState(tableContainer);
    
    // Apply sorting
    const sorted = [...itemsList].sort((a, b) => {
        if (!currentSort.column) return 0;
        let aVal, bVal;
        switch(currentSort.column) {
            case 'name': aVal = a.name || ''; bVal = b.name || ''; break;
            case 'unit': aVal = a.unit || ''; bVal = b.unit || ''; break;
            case 'expiration_date': aVal = a.expiration_date || ''; bVal = b.expiration_date || ''; break;
            default: return 0;
        }
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    sorted.forEach(item => {
        const isSelected = selectedItems.has(item.id);
        const rowClass = isSelected ? 'row-selected' : '';
        
        const tr = document.createElement('tr');
        tr.setAttribute('data-item-id', item.id);
        if (rowClass) {
            tr.className = rowClass;
        }
        
        // Build row HTML - escape all user data to prevent XSS
        const safeName = escapeHtml(item.name || '');
        const safeUnit = escapeHtml(item.unit || 'pcs');
        const safeDescription = escapeHtml(item.description || '-');
        const safeImageUrl = item.image_url ? escapeHtml(item.image_url) : '';
        // Format expiration date if it exists, otherwise show dash - ALWAYS include year
        let safeExpirationDate = '-';
        if (item.expiration_date) {
            try {
                const date = new Date(item.expiration_date);
                if (!isNaN(date.getTime())) {
                    // Always format with year included
                    safeExpirationDate = date.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            } catch (e) {
                // If parsing fails, just show the raw value
                safeExpirationDate = item.expiration_date;
            }
        }
        const safeItemId = item.id;
        
        tr.innerHTML = `
            <td data-label="Name" data-column="name" class="col-name">
                <div class="cell-content-wrapper">
                    <strong>${safeName}</strong>
                    ${item.is_archived ? `<span class="badge badge-warning"><i class="fas fa-archive"></i> Archived</span>` : ''}
                </div>
            </td>
            <td data-label="Image" data-column="image" class="col-image">
                ${safeImageUrl ? `<img src="${safeImageUrl}" alt="Product image for ${safeName}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : '<span style="color: var(--text-secondary);">-</span>'}
            </td>
            <td data-label="Unit" data-column="unit" class="col-unit">${safeUnit}</td>
            <td data-label="Description" data-column="description" class="col-description">${safeDescription}</td>
            <td data-label="Expiration Date" data-column="expiration_date" class="col-expiration-date">${safeExpirationDate}</td>
        `;
        
        fragment.appendChild(tr);
    });
    
    // Clear and append fragment (single DOM operation)
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    
    // Ensure all required columns are visible
    visibleColumns = new Set(['name', 'image', 'unit', 'description', 'expiration_date']);
    
    // Update column visibility in header
    updateColumnVisibility();
    
    // No barcodes or bulk selection in items view
}

function setupEventListeners() {
    const itemForm = document.getElementById('itemForm');
    if (itemForm) {
        itemForm.addEventListener('submit', handleItemSubmit);
    }
    
    // Search input with debounced filtering
    const searchInput = document.getElementById('searchItems');
    if (searchInput) {
        searchInput.addEventListener('input', filterItems);
    }
    
    // Filter controls - immediate execution (no debounce for selects)
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', handleCategorySubmit);
    }
    
    const unitFilter = document.getElementById('unitFilter');
    if (unitFilter) {
        unitFilter.addEventListener('change', performFiltering);
    }
    
    const expirationFilter = document.getElementById('expirationFilter');
    if (expirationFilter) {
        expirationFilter.addEventListener('change', performFiltering);
    }
    
    // Load column visibility preferences
    // Only load if it contains our new column names (to avoid old preferences hiding new columns)
    const savedColumns = localStorage.getItem('inventoryVisibleColumns');
    if (savedColumns) {
        try {
            const saved = new Set(JSON.parse(savedColumns));
            // Check if saved columns include our new columns
            const newColumns = ['name', 'image', 'unit', 'description', 'expiration_date'];
            const hasNewColumns = newColumns.some(col => saved.has(col));
            if (hasNewColumns) {
                // Filter to only include columns that exist in our new table
                visibleColumns = new Set([...saved].filter(col => newColumns.includes(col)));
            }
            // If no new columns found, use default (already set above)
        } catch (e) {
            console.error('Error loading column preferences:', e);
        }
    }
}

// Debounce filter function for better performance
let filterTimeout = null;

function filterItems() {
    // Clear existing timeout
    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }
    
    // Debounce filter execution (300ms delay for search input)
    filterTimeout = setTimeout(() => {
        performFiltering();
    }, 300);
}

// Actual filtering logic (separated for immediate execution on select changes)
function performFiltering() {
    const searchTerm = document.getElementById('searchItems').value.toLowerCase().trim();
    const unitFilter = document.getElementById('unitFilter').value;
    const expirationFilter = document.getElementById('expirationFilter').value;
    
    // Start with all items (or filtered items if archived filter is active)
    let filtered = showArchivedItems ? items : items.filter(item => !item.is_archived);
    
    // Apply search filter (search by name and description only)
    if (searchTerm) {
        filtered = filtered.filter(item => {
            const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
            const descMatch = item.description && item.description.toLowerCase().includes(searchTerm);
            return nameMatch || descMatch;
        });
    }
    
    // Apply unit filter
    if (unitFilter) {
        filtered = filtered.filter(item => {
            const itemUnit = (item.unit || 'pcs').toLowerCase();
            return itemUnit === unitFilter.toLowerCase();
        });
    }
    
    // Apply expiration date filter
    if (expirationFilter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        filtered = filtered.filter(item => {
            if (!item.expiration_date) {
                return expirationFilter === 'no_expiration';
            }
            
            const expirationDate = new Date(item.expiration_date);
            expirationDate.setHours(0, 0, 0, 0);
            
            if (expirationFilter === 'expired') {
                return expirationDate < today;
            } else if (expirationFilter === 'expiring_soon') {
                return expirationDate >= today && expirationDate <= thirtyDaysFromNow;
            } else if (expirationFilter === 'not_expired') {
                return expirationDate > thirtyDaysFromNow;
            } else if (expirationFilter === 'no_expiration') {
                return false; // This item has an expiration date
            }
            return true;
        });
    }
    
    // Re-render table with filtered data
    renderItemsTable(filtered);
}

function clearFilters() {
    // Clear filter inputs
    const searchInput = document.getElementById('searchItems');
    const unitFilter = document.getElementById('unitFilter');
    const expirationFilter = document.getElementById('expirationFilter');
    
    if (searchInput) searchInput.value = '';
    if (unitFilter) unitFilter.value = '';
    if (expirationFilter) expirationFilter.value = '';
    
    // Clear timeout and apply filters immediately
    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }
    performFiltering();
}

function openItemModal(itemId = null) {
    currentEditingItem = itemId;
    const modal = document.getElementById('itemModal');
    const form = document.getElementById('itemForm');
    const title = document.getElementById('modalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (itemId) {
        title.textContent = 'Edit Item';
        const item = items.find(i => i.id === itemId);
        if (item) {
            const itemIdEl = document.getElementById('itemId');
            const itemNameEl = document.getElementById('itemName');
            const itemImageUrlEl = document.getElementById('itemImageUrl');
            const itemUnitEl = document.getElementById('itemUnit');
            const itemDescriptionEl = document.getElementById('itemDescription');
            const itemExpirationDateEl = document.getElementById('itemExpirationDate');
            
            if (itemIdEl) itemIdEl.value = item.id;
            if (itemNameEl) itemNameEl.value = item.name || '';
            if (itemImageUrlEl) itemImageUrlEl.value = item.image_url || '';
            if (itemUnitEl) itemUnitEl.value = item.unit || 'pcs';
            if (itemDescriptionEl) itemDescriptionEl.value = item.description || '';
            if (itemExpirationDateEl) itemExpirationDateEl.value = item.expiration_date || '';
            
            // Show image preview if exists
            if (item.image_url) {
                const preview = document.getElementById('imagePreview');
                const container = document.getElementById('imagePreviewContainer');
                if (preview && container) {
                    preview.src = item.image_url;
                    container.style.display = 'block';
                }
            }
        }
    } else {
        title.textContent = 'Add Item';
        form.reset();
        document.getElementById('itemId').value = '';
        clearImagePreview();
    }
    
    // Initialize barcode scanner on SKU input automatically when modal opens
    const skuInput = document.getElementById('itemSku');
    if (skuInput && window.BarcodeScanner) {
        // Only initialize if not already initialized
        // This prevents duplicate event listeners
        if (skuInput.dataset.barcodeScannerInitialized !== 'true') {
            // Initialize barcode scanner on SKU input field
            window.BarcodeScanner.init(
            skuInput,
            async (item, barcode) => {
                // Item found - ask if user wants to edit existing
                if (confirm(`Item "${item.name}" already exists with this barcode/SKU. Do you want to edit it?`)) {
                    closeItemModal();
                    setTimeout(() => openItemModal(item.id), 100);
                } else {
                    // User wants to create new item with this barcode
                    skuInput.value = barcode;
                    skuInput.focus();
                    showNotification('Barcode set. You can continue creating the new item.', 'info');
                }
            },
            async (error, barcode) => {
                // Item not found - set barcode for new item (this is normal for new items)
                skuInput.value = barcode;
                skuInput.focus();
            }
            );
        }
    }
    
    // Use accessible modal function
    const firstInput = document.getElementById('itemName');
    openModal('itemModal', firstInput);
}

async function scanBarcodeForSKU() {
    const skuInput = document.getElementById('itemSku');
    if (!skuInput) {
        showNotification('SKU input field not found', 'error');
        return;
    }
    
    // Clear the input and focus it for scanning
    skuInput.value = '';
    skuInput.focus();
    skuInput.select();
    
    showNotification('Ready to scan. Scan barcode or type and press Enter', 'info');
    
    // Scanner is already initialized when modal opens
    // If for some reason it's not initialized, initialize it now as fallback
    if (window.BarcodeScanner && skuInput.dataset.barcodeScannerInitialized !== 'true') {
        window.BarcodeScanner.init(
            skuInput,
            async (item, barcode) => {
                if (confirm(`Item "${item.name}" already exists with this barcode/SKU. Do you want to edit it?`)) {
                    closeItemModal();
                    setTimeout(() => openItemModal(item.id), 100);
                } else {
                    skuInput.value = barcode;
                    skuInput.focus();
                    showNotification('Barcode set. You can continue creating the new item.', 'info');
                }
            },
            async (error, barcode) => {
                skuInput.value = barcode;
                skuInput.focus();
            }
        );
    }
}

window.scanBarcodeForSKU = scanBarcodeForSKU;

function generateSKU() {
    const skuInput = document.getElementById('itemSku');
    const nameInput = document.getElementById('itemName');
    const categorySelect = document.getElementById('itemCategory');
    
    if (!skuInput || !nameInput) return;
    
    const itemName = nameInput.value.trim();
    if (!itemName) {
        showNotification('Please enter item name first', 'error');
        nameInput.focus();
        return;
    }
    
    if (window.SKUUtils) {
        const categoryId = categorySelect ? categorySelect.value : null;
        const suggestedSku = window.SKUUtils.suggest(itemName, items);
        
        if (suggestedSku) {
            skuInput.value = suggestedSku;
            showNotification('SKU generated successfully', 'success');
            skuInput.focus();
            skuInput.select();
        } else {
            showNotification('Could not generate SKU', 'error');
        }
    } else {
        showNotification('SKU utilities not loaded', 'error');
    }
}

window.generateSKU = generateSKU;

// Add real-time SKU validation
document.addEventListener('DOMContentLoaded', () => {
    const skuInput = document.getElementById('itemSku');
    if (skuInput && window.SKUUtils) {
        skuInput.addEventListener('blur', () => {
            const value = skuInput.value.trim();
            if (value) {
                const validation = window.SKUUtils.validate(value);
                if (!validation.valid) {
                    showNotification(validation.message, 'error');
                    skuInput.focus();
                } else {
                    // Auto-format on blur
                    const formatted = window.SKUUtils.format(value);
                    if (formatted !== value) {
                        skuInput.value = formatted;
                    }
                }
            }
        });
        
        // Format on input (uppercase)
        skuInput.addEventListener('input', (e) => {
            const cursorPos = e.target.selectionStart;
            const value = e.target.value;
            const formatted = window.SKUUtils.format(value, { uppercase: true });
            if (formatted !== value) {
                e.target.value = formatted;
                // Restore cursor position
                e.target.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }
});

function closeItemModal() {
    closeModal('itemModal');
    document.getElementById('itemForm').reset();
    clearImagePreview();
    currentEditingItem = null;
    uploadedImageData = null;
    itemVariants = [];
    reorderAutoEnabled = false;
    updateVariantsPreview();
}

async function handleItemSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!form) return;
    
    const submitButton = form.querySelector('button[type="submit"]');
    
    // Validate form (only name is required now)
    if (!validateForm(form, {
        itemName: ValidationRules.username
    })) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    // Use first batch image if available, otherwise use single uploaded image or URL
    let imageUrl = null;
    if (uploadedImages.length > 0) {
        imageUrl = uploadedImages[0].dataUrl;
    } else if (uploadedImageData) {
        imageUrl = uploadedImageData;
    } else {
        imageUrl = document.getElementById('itemImageUrl').value.trim() || null;
    }
    
    const itemId = document.getElementById('itemId').value;
    
    // For new items, include required fields with defaults
    // For updates, only send the fields we're editing
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        description: document.getElementById('itemDescription').value.trim() || null,
        unit: document.getElementById('itemUnit').value || 'pcs',
        image_url: imageUrl,
        expiration_date: document.getElementById('itemExpirationDate').value || null
    };
    
    // Add required fields for new items (server requires unit_price and shop_id)
    if (!itemId) {
        itemData.unit_price = 0; // Required by server, default to 0
        itemData.stock_quantity = 0; // Default to 0
        itemData.min_stock_level = 10; // Default to 10
        
        // Add shop_id - required by server
        // For superadmin: must specify shop_id in body
        // For other users: server uses req.user.shop_id from token, but we can include it explicitly
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const isSuperadmin = currentUser && currentUser.role === 'superadmin';
        
        if (isSuperadmin) {
            // Superadmin must select a shop
            if (shopFilter.shop_id) {
                itemData.shop_id = shopFilter.shop_id;
            } else {
                showNotification('Please select a shop before creating an item', 'error');
                hideFormLoading(form);
                return;
            }
        } else {
            // For non-superadmin users, include shop_id from user if available
            // Server will use req.user.shop_id, but including it explicitly is safe
            if (currentUser && currentUser.shop_id) {
                itemData.shop_id = currentUser.shop_id;
            }
        }
    } else {
        // For updates, preserve existing unit_price or use 0 as fallback
        // We need to get it from the existing item
        const existingItem = items.find(i => i.id == itemId);
        itemData.unit_price = existingItem ? (existingItem.unit_price || 0) : 0;
    }
    
    try {
        if (itemId) {
            await apiRequest(`/items/${itemId}`, {
                method: 'PUT',
                body: itemData
            });
            showNotification('Item updated successfully');
        } else {
            await apiRequest('/items', {
                method: 'POST',
                body: itemData
            });
            showNotification('Item created successfully');
        }
        
        closeItemModal();
        
        // Notify product flow of change
        if (window.ProductFlow) {
            window.ProductFlow.handleProductChange(itemData, !itemId);
        }
        
        await loadItems();
        await loadReorderSuggestions(); // Refresh reorder suggestions after item save
    } catch (error) {
        showNotification(error.message || 'Error saving item', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editItem(itemId) {
    openItemModal(itemId);
}

function openCategoryModal() {
    document.getElementById('categoryForm').reset();
    const firstInput = document.getElementById('categoryName');
    openModal('categoryModal', firstInput);
}

function closeCategoryModal() {
    closeModal('categoryModal');
    document.getElementById('categoryForm').reset();
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    
    const categoryData = {
        name: document.getElementById('categoryName').value,
        description: document.getElementById('categoryDescription').value || null
    };
    
    try {
        await apiRequest('/categories', {
            method: 'POST',
            body: categoryData
        });
        
        showNotification('Category created successfully');
        closeCategoryModal();
        
        await loadCategories();
        
        const updatedCategories = await apiRequest('/categories');
        const newCategory = updatedCategories.find(cat => cat.name === categoryData.name);
        // Category field removed from form, so we don't need to set it
    } catch (error) {
        showNotification(error.message || 'Error creating category', 'error');
    }
}

function openAdjustStockModal(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('adjustItemId').value = itemId;
    document.getElementById('currentStock').value = item.stock_quantity;
    document.getElementById('adjustQuantity').value = '';
    document.getElementById('adjustReason').value = '';
    document.getElementById('adjustmentType').value = 'increase';
    
    const firstInput = document.getElementById('adjustmentType');
    openModal('adjustStockModal', firstInput);
}

function closeAdjustStockModal() {
    closeModal('adjustStockModal');
    const form = document.getElementById('adjustStockForm');
    if (form) form.reset();
}

// Stock adjustment form only exists in inventory-operations.html
// Setup event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const adjustStockForm = document.getElementById('adjustStockForm');
    if (adjustStockForm) {
        adjustStockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const adjustmentData = {
                item_id: parseInt(document.getElementById('adjustItemId').value),
                adjustment_type: document.getElementById('adjustmentType').value,
                quantity: parseInt(document.getElementById('adjustQuantity').value),
                reason: document.getElementById('adjustReason').value
            };
            
            try {
                await apiRequest('/stock-adjustments', {
                    method: 'POST',
                    body: adjustmentData
                });
                
                showNotification('Stock adjusted successfully');
                closeAdjustStockModal();
                
                // Notify product flow of stock adjustment
                const itemId = parseInt(document.getElementById('adjustItemId').value);
                if (window.ProductFlow && itemId) {
                    window.ProductFlow.invalidateProduct(itemId);
                }
                
                await loadItems();
                await loadReorderSuggestions(); // Refresh reorder suggestions after stock adjustment
            } catch (error) {
                showNotification(error.message || 'Error adjusting stock', 'error');
            }
        });
    }
});

// Bulk Operations
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllItems');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        const itemId = parseInt(cb.dataset.itemId);
        if (selectAll.checked) {
            selectedItems.add(itemId);
        } else {
            selectedItems.delete(itemId);
        }
    });
    updateSelectedCount();
    renderItemsTable(filteredItems);
}

function toggleItemSelection(itemId) {
    if (selectedItems.has(itemId)) {
        selectedItems.delete(itemId);
    } else {
        selectedItems.add(itemId);
    }
    updateSelectedCount();
    const selectAll = document.getElementById('selectAllItems');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.item-checkbox');
        selectAll.checked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    }
}

function updateSelectedCount() {
    const count = selectedItems.size;
    const countElement = document.getElementById('selectedCount');
    const bulkBtn = document.getElementById('bulkActionsBtn');
    if (countElement) countElement.textContent = count;
    if (bulkBtn) bulkBtn.style.display = count > 0 ? 'inline-block' : 'none';
}

function openBulkActionsModal() {
    if (selectedItems.size === 0) {
        showNotification('Please select items first', 'warning');
        return;
    }
    document.getElementById('bulkSelectedCount').textContent = selectedItems.size;
    openModal('bulkActionsModal');
}

function closeBulkActionsModal() {
    closeModal('bulkActionsModal');
}

function bulkUpdatePrice() {
    const newPrice = prompt(`Enter new price for ${selectedItems.size} item(s):`);
    if (!newPrice || isNaN(parseFloat(newPrice))) return;
    
    const price = parseFloat(newPrice);
    if (confirm(`Update price to ${formatCurrency(price)} for ${selectedItems.size} item(s)?`)) {
        bulkUpdateField('unit_price', price);
    }
}

function bulkUpdateStock() {
    const adjustment = prompt(`Enter stock adjustment (positive to add, negative to subtract) for ${selectedItems.size} item(s):`);
    if (!adjustment || isNaN(parseInt(adjustment))) return;
    
    const qty = parseInt(adjustment);
    if (confirm(`Adjust stock by ${qty > 0 ? '+' : ''}${qty} for ${selectedItems.size} item(s)?`)) {
        bulkAdjustStock(qty);
    }
}

function bulkChangeCategory() {
    const categorySelect = document.createElement('select');
    categorySelect.innerHTML = '<option value="">Select Category</option>' + 
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    
    if (confirm(`Change category for ${selectedItems.size} item(s)?\n\nSelect category:`)) {
        const categoryId = prompt('Enter category ID:');
        if (categoryId) {
            bulkUpdateField('category_id', parseInt(categoryId));
        }
    }
}

async function bulkUpdateField(field, value) {
    const itemIds = Array.from(selectedItems);
    try {
        for (const itemId of itemIds) {
            const item = items.find(i => i.id === itemId);
            if (item) {
                await apiRequest(`/items/${itemId}`, {
                    method: 'PUT',
                    body: { ...item, [field]: value }
                });
            }
        }
        showNotification(`${itemIds.length} item(s) updated successfully`);
        selectedItems.clear();
        updateSelectedCount();
        await loadItems();
    } catch (error) {
        showNotification('Error updating items', 'error');
    }
}

async function bulkAdjustStock(adjustment) {
    const itemIds = Array.from(selectedItems);
    try {
        for (const itemId of itemIds) {
            const item = items.find(i => i.id === itemId);
            if (item) {
                await apiRequest('/stock-adjustments', {
                    method: 'POST',
                    body: {
                        item_id: itemId,
                        adjustment_type: adjustment > 0 ? 'increase' : 'decrease',
                        quantity: Math.abs(adjustment),
                        reason: 'Bulk stock adjustment'
                    }
                });
            }
        }
        showNotification(`Stock adjusted for ${itemIds.length} item(s)`);
        selectedItems.clear();
        updateSelectedCount();
        await loadItems();
    } catch (error) {
        showNotification('Error adjusting stock', 'error');
    }
}

async function bulkDelete() {
    if (!confirm(`Delete ${selectedItems.size} selected item(s)? This cannot be undone.`)) return;
    
    const itemIds = Array.from(selectedItems);
    try {
        for (const itemId of itemIds) {
            await apiRequest(`/items/${itemId}`, { method: 'DELETE' });
        }
        showNotification(`${itemIds.length} item(s) deleted successfully`);
        selectedItems.clear();
        updateSelectedCount();
        await loadItems();
    } catch (error) {
        showNotification('Error deleting items', 'error');
    }
}

// Import/Export
function exportInventory() {
    const data = filteredItems.length > 0 ? filteredItems : items;
    const csv = [
        ['Name', 'SKU', 'Category', 'Unit Price', 'Cost Price', 'Stock Quantity', 'Min Stock Level', 'Unit', 'Supplier', 'Expiration Date'].join(','),
        ...data.map(item => [
            `"${(item.name || '').replace(/"/g, '""')}"`,
            `"${(item.sku || '').replace(/"/g, '""')}"`,
            `"${(item.category_name || '').replace(/"/g, '""')}"`,
            item.unit_price || 0,
            item.cost_price || '',
            item.stock_quantity || 0,
            item.min_stock_level || 0,
            `"${(item.unit || 'pcs').replace(/"/g, '""')}"`,
            `"${(item.supplier || '').replace(/"/g, '""')}"`,
            item.expiration_date || ''
        ].join(','))
    ].join('\n');
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function openImportModal() {
    openModal('importModal');
}

function closeImportModal() {
    closeModal('importModal');
    const form = document.getElementById('importForm');
    if (form) form.reset();
}

// Import form only exists in inventory-operations.html
// Setup event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const importForm = document.getElementById('importForm');
    if (importForm) {
        importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const csv = event.target.result;
            const lines = csv.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            
            let imported = 0;
            let errors = 0;
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
                if (values.length < headers.length) continue;
                
                try {
                    await apiRequest('/items', {
                        method: 'POST',
                        body: {
                            name: values[0] || '',
                            sku: values[1] || null,
                            category_id: categories.find(c => c.name === values[2])?.id || null,
                            unit_price: parseFloat(values[3]) || 0,
                            cost_price: values[4] ? parseFloat(values[4]) : null,
                            stock_quantity: parseInt(values[5]) || 0,
                            min_stock_level: parseInt(values[6]) || 10,
                            unit: values[7] || 'pcs',
                            supplier: values[8] || null,
                            expiration_date: values[9] || null
                        }
                    });
                    imported++;
                } catch (error) {
                    errors++;
                }
            }
            
            showNotification(`Imported ${imported} item(s)${errors > 0 ? `, ${errors} error(s)` : ''}`);
            closeImportModal();
            await loadItems();
        } catch (error) {
            showNotification('Error importing file', 'error');
        }
    };
    reader.readAsText(file);
        });
    }
});

// Image optimization function
function optimizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('File is not an image'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = width * ratio;
                    height = height * ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 with compression
                const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({
                    dataUrl: optimizedDataUrl,
                    originalSize: file.size,
                    optimizedSize: Math.round((optimizedDataUrl.length - 22) * 3 / 4), // Approximate size
                    width: width,
                    height: height
                });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Single image upload with optimization
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file', 'error');
        return;
    }
    
    // Show loading state
    const preview = document.getElementById('imagePreview');
    const container = document.getElementById('imagePreviewContainer');
    if (container) {
        container.style.display = 'block';
        if (preview) {
            preview.src = '';
            preview.style.opacity = '0.5';
        }
    }
    
    optimizeImage(file, 1920, 1080, 0.85)
        .then(result => {
            uploadedImageData = result.dataUrl;
            if (preview && container) {
                preview.src = uploadedImageData;
                preview.style.opacity = '1';
            }
            document.getElementById('itemImageUrl').value = uploadedImageData;
            
            const savings = result.originalSize - result.optimizedSize;
            if (savings > 0) {
                console.log(`Image optimized: ${(savings / 1024).toFixed(2)}KB saved`);
            }
        })
        .catch(error => {
            console.error('Image optimization error:', error);
            // Fallback to original file
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImageData = e.target.result;
                if (preview && container) {
                    preview.src = uploadedImageData;
                    preview.style.opacity = '1';
                }
                document.getElementById('itemImageUrl').value = uploadedImageData;
            };
            reader.readAsDataURL(file);
        });
}

// Batch image upload handler
function handleBatchImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
        showNotification('Please select image files', 'error');
        return;
    }
    
    uploadedImages = [];
    const previewContainer = document.getElementById('batchImagePreview');
    if (previewContainer) {
        previewContainer.style.display = 'block';
        previewContainer.innerHTML = '<p>Processing images...</p>';
    }
    
    let processed = 0;
    imageFiles.forEach((file, index) => {
        optimizeImage(file, 1920, 1080, 0.85)
            .then(result => {
                uploadedImages.push({
                    dataUrl: result.dataUrl,
                    name: file.name,
                    index: index
                });
                processed++;
                
                if (previewContainer) {
                    renderBatchImagePreviews();
                }
                
                if (processed === imageFiles.length) {
                    showNotification(`${processed} image(s) processed successfully`, 'success');
                }
            })
            .catch(error => {
                console.error(`Error processing ${file.name}:`, error);
                // Fallback to original
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedImages.push({
                        dataUrl: e.target.result,
                        name: file.name,
                        index: index
                    });
                    processed++;
                    if (previewContainer) {
                        renderBatchImagePreviews();
                    }
                    if (processed === imageFiles.length) {
                        showNotification(`${processed} image(s) processed successfully`, 'success');
                    }
                };
                reader.onerror = () => {
                    processed++;
                    if (processed === imageFiles.length) {
                        if (previewContainer) {
                            renderBatchImagePreviews();
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
    });
}

function renderBatchImagePreviews() {
    const previewContainer = document.getElementById('batchImagePreview');
    if (!previewContainer) return;
    
    if (uploadedImages.length === 0) {
        previewContainer.innerHTML = '<p style="color: var(--text-secondary);">No images uploaded</p>';
        previewContainer.style.display = 'none';
        return;
    }
    
    previewContainer.style.display = 'block';
    previewContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem;">
            ${uploadedImages.map((img, idx) => `
                <div style="position: relative; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden;">
                    <img src="${img.dataUrl}" alt="Batch uploaded product image: ${img.name}" style="width: 100%; height: 150px; object-fit: cover;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeBatchImage(${idx})" style="position: absolute; top: 0.25rem; right: 0.25rem; padding: 0.25rem 0.5rem;"><i class="fas fa-times"></i></button>
                    <div style="padding: 0.25rem; font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${img.name}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function removeBatchImage(index) {
    uploadedImages.splice(index, 1);
    renderBatchImagePreviews();
}

function clearImagePreview() {
    uploadedImageData = null;
    uploadedImages = [];
    const preview = document.getElementById('imagePreview');
    const container = document.getElementById('imagePreviewContainer');
    const batchContainer = document.getElementById('batchImagePreview');
    if (preview) preview.src = '';
    if (container) container.style.display = 'none';
    if (batchContainer) {
        batchContainer.innerHTML = '';
        batchContainer.style.display = 'none';
    }
    const itemImageFile = document.getElementById('itemImageFile');
    if (itemImageFile) itemImageFile.value = '';
    const itemImageFilesBatch = document.getElementById('itemImageFilesBatch');
    if (itemImageFilesBatch) itemImageFilesBatch.value = '';
    const itemImageUrl = document.getElementById('itemImageUrl');
    if (itemImageUrl) itemImageUrl.value = '';
}

// Sorting
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderItemsTable(filteredItems.length > 0 ? filteredItems : items);
}

// Column Visibility
function toggleColumnVisibility() {
    const list = document.getElementById('columnVisibilityList');
    const columns = [
        { id: 'sku', label: 'SKU' },
        { id: 'barcode', label: 'Barcode' },
        { id: 'image', label: 'Image' },
        { id: 'name', label: 'Name' },
        { id: 'category', label: 'Category' },
        { id: 'stock', label: 'Stock Qty' },
        { id: 'price', label: 'Unit Price' },
        { id: 'status', label: 'Status' },
        { id: 'actions', label: 'Actions' }
    ];
    
    list.innerHTML = columns.map(col => `
        <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" ${visibleColumns.has(col.id) ? 'checked' : ''} onchange="toggleColumn('${col.id}')">
            <span>${col.label}</span>
        </label>
    `).join('');
    
    openModal('columnVisibilityModal');
}

function toggleColumn(columnId) {
    if (visibleColumns.has(columnId)) {
        visibleColumns.delete(columnId);
    } else {
        visibleColumns.add(columnId);
    }
    // Save preferences
    localStorage.setItem('inventoryVisibleColumns', JSON.stringify(Array.from(visibleColumns)));
    renderItemsTable(filteredItems.length > 0 ? filteredItems : items);
}

function updateColumnVisibility() {
    document.querySelectorAll('[data-column]').forEach(cell => {
        const column = cell.dataset.column;
        if (column && !visibleColumns.has(column)) {
            cell.style.display = 'none';
        } else if (column) {
            cell.style.display = '';
        }
    });
    
    // Update header columns
    document.querySelectorAll('th[data-column]').forEach(th => {
        const column = th.dataset.column;
        if (column && !visibleColumns.has(column)) {
            th.style.display = 'none';
        } else if (column) {
            th.style.display = '';
        }
    });
}

function closeColumnVisibilityModal() {
    closeModal('columnVisibilityModal');
}

// Item Duplication
function duplicateItem(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    if (confirm(`Duplicate item "${item.name}"?`)) {
        const duplicated = {
            ...item,
            name: `${item.name} (Copy)`,
            id: undefined
        };
        delete duplicated.id;
        
        openItemModal();
        document.getElementById('itemName').value = duplicated.name;
        document.getElementById('itemImageUrl').value = duplicated.image_url || '';
        document.getElementById('itemUnit').value = duplicated.unit || 'pcs';
        document.getElementById('itemDescription').value = duplicated.description || '';
        document.getElementById('itemExpirationDate').value = duplicated.expiration_date || '';
        
        // Show image preview if exists
        if (duplicated.image_url) {
            const preview = document.getElementById('imagePreview');
            const container = document.getElementById('imagePreviewContainer');
            if (preview && container) {
                preview.src = duplicated.image_url;
                container.style.display = 'block';
            }
        }
    }
}

// Make functions globally available
window.clearFilters = clearFilters;
window.toggleSelectAll = toggleSelectAll;
window.toggleItemSelection = toggleItemSelection;
window.openBulkActionsModal = openBulkActionsModal;
window.closeBulkActionsModal = closeBulkActionsModal;
window.bulkUpdatePrice = bulkUpdatePrice;
window.bulkUpdateStock = bulkUpdateStock;
window.bulkChangeCategory = bulkChangeCategory;
window.bulkDelete = bulkDelete;
window.exportInventory = exportInventory;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.handleImageUpload = handleImageUpload;
window.clearImagePreview = clearImagePreview;
window.sortTable = sortTable;
window.toggleColumnVisibility = toggleColumnVisibility;
window.toggleColumn = toggleColumn;
window.closeColumnVisibilityModal = closeColumnVisibilityModal;
window.duplicateItem = duplicateItem;

// Stock Movement History
async function viewStockHistory(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const stockHistoryTitleEl = document.getElementById('stockHistoryTitle');
    if (stockHistoryTitleEl) {
        stockHistoryTitleEl.textContent = `Stock History - ${escapeHtml(item.name || 'Unknown')}`;
    }
    openModal('stockHistoryModal');
    
    const content = document.getElementById('stockHistoryContent');
    content.innerHTML = '<p>Loading history...</p>';
    
    try {
        const adjustments = await apiRequest(`/stock-adjustments?item_id=${itemId}`);
        
        if (adjustments.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No stock adjustments recorded</p>';
            return;
        }
        
        content.innerHTML = `
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Previous Stock</th>
                        <th>New Stock</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>
                    ${adjustments.map(adj => {
                        const prevStock = adj.previous_quantity || 0;
                        const newStock = adj.new_quantity || prevStock + (adj.adjustment_type === 'increase' ? adj.quantity : -adj.quantity);
                        return `
                            <tr>
                                <td>${formatDate(adj.created_at || adj.adjustment_date)}</td>
                                <td><span class="badge badge-${adj.adjustment_type === 'increase' ? 'success' : adj.adjustment_type === 'decrease' ? 'warning' : 'info'}">${adj.adjustment_type}</span></td>
                                <td>${adj.quantity}</td>
                                <td>${prevStock}</td>
                                <td>${newStock}</td>
                                <td>${adj.reason || '-'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        const errorMsg = escapeHtml(error.message || 'Unknown error');
        content.innerHTML = `<p style="color: var(--danger-color);">Error loading history: ${errorMsg}</p>`;
    }
}

function closeStockHistoryModal() {
    closeModal('stockHistoryModal');
}

window.closeStockHistoryModal = closeStockHistoryModal;

// Item Variants Management
function openVariantsModal() {
    renderVariantsList();
    openModal('variantsModal');
}

function closeVariantsModal() {
    closeModal('variantsModal');
}

function renderVariantsList() {
    const list = document.getElementById('variantsList');
    if (!list) return;
    
    if (itemVariants.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No variants added yet. Add variants below.</p>';
        return;
    }
    
    list.innerHTML = `
        <table class="data-table" style="width: 100%;">
            <thead>
                <tr>
                    <th>Variant Name</th>
                    <th>Value</th>
                    <th>Price Override</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${itemVariants.map((variant, index) => `
                    <tr>
                        <td>${variant.name || '-'}</td>
                        <td>${variant.value || '-'}</td>
                        <td>${variant.price_override ? formatCurrency(variant.price_override) : 'Base Price'}</td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="removeVariant(${index})" title="Remove"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function addVariant() {
    const name = document.getElementById('variantName').value.trim();
    const value = document.getElementById('variantValue').value.trim();
    const price = document.getElementById('variantPrice').value.trim();
    
    if (!name || !value) {
        showNotification('Variant name and value are required', 'error');
        return;
    }
    
    // Check for duplicates
    if (itemVariants.some(v => v.name === name && v.value === value)) {
        showNotification('This variant already exists', 'error');
        return;
    }
    
    itemVariants.push({
        name: name,
        value: value,
        price_override: price ? parseFloat(price) : null
    });
    
    document.getElementById('variantName').value = '';
    document.getElementById('variantValue').value = '';
    document.getElementById('variantPrice').value = '';
    
    renderVariantsList();
    updateVariantsPreview();
    showNotification('Variant added', 'success');
}

function removeVariant(index) {
    if (confirm('Remove this variant?')) {
        itemVariants.splice(index, 1);
        renderVariantsList();
        updateVariantsPreview();
        showNotification('Variant removed', 'success');
    }
}

function updateVariantsPreview() {
    const preview = document.getElementById('variantsPreview');
    const count = document.getElementById('variantsCount');
    if (preview && count) {
        if (itemVariants.length > 0) {
            preview.style.display = 'block';
            count.textContent = itemVariants.length;
            const variantsText = itemVariants.map(v => `${escapeHtml(v.name)}: ${escapeHtml(v.value)}`).join(', ');
            preview.innerHTML = `<strong>Variants:</strong> <span id="variantsCount">${itemVariants.length}</span><br><small style="color: var(--text-secondary);">${variantsText}</small>`;
        } else {
            preview.style.display = 'none';
        }
    }
}

// Reorder Automation
function toggleReorderAuto() {
    const checkbox = document.getElementById('enableReorderAuto');
    if (!checkbox) return;
    
    reorderAutoEnabled = checkbox.checked;
    const suggestionsDiv = document.getElementById('reorderSuggestions');
    
    if (reorderAutoEnabled && currentEditingItem) {
        const item = items.find(i => i.id === currentEditingItem);
        if (item) {
            calculateReorderSuggestions(item);
        } else if (suggestionsDiv) {
            suggestionsDiv.style.display = 'none';
        }
    } else {
        if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    }
}

async function calculateReorderSuggestions(item) {
    const suggestionsDiv = document.getElementById('reorderSuggestions');
    const suggestionText = document.getElementById('reorderSuggestionText');
    
    if (!suggestionsDiv || !suggestionText || !item) return;
    
    try {
        // Get sales items data for this item (last 30 days)
        const sales = await apiRequest('/sales').catch(() => []);
        if (!Array.isArray(sales)) {
            throw new Error('Invalid sales data');
        }
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Calculate sales velocity - fetch all sale details
        let totalSold = 0;
        const salesByDay = {};
        
        // Process sales in parallel
        const salePromises = sales
            .filter(sale => {
                if (!sale || !sale.sale_date) return false;
                const saleDate = new Date(sale.sale_date);
                return !isNaN(saleDate.getTime()) && saleDate >= thirtyDaysAgo;
            })
            .map(sale => apiRequest(`/sales/${sale.id}`).catch(() => null));
        
        const saleDetails = await Promise.all(salePromises);
        
        saleDetails.forEach(saleDetail => {
            if (saleDetail && saleDetail.items) {
                saleDetail.items.forEach(saleItem => {
                    if (saleItem.item_id === item.id) {
                        totalSold += saleItem.quantity || 0;
                        const saleDate = new Date(saleDetail.sale_date || saleDetail.created_at);
                        const dayKey = saleDate.toISOString().split('T')[0];
                        if (!salesByDay[dayKey]) {
                            salesByDay[dayKey] = 0;
                        }
                        salesByDay[dayKey] += saleItem.quantity || 0;
                    }
                });
            }
        });
        
        const daysWithSales = Object.keys(salesByDay).length;
        const avgDailySales = daysWithSales > 0 ? totalSold / daysWithSales : 0;
        const currentStock = item.stock_quantity || 0;
        const minStock = item.min_stock_level || 10;
        const daysRemaining = avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : 999;
        
        // Calculate reorder point (lead time + safety stock)
        const leadTimeDays = 7; // Assume 7 days lead time
        const safetyStockDays = 3; // 3 days safety stock
        const reorderPoint = Math.ceil(avgDailySales * (leadTimeDays + safetyStockDays));
        const suggestedReorder = Math.max(reorderPoint - currentStock, 0);
        
        if (daysRemaining < 14 || currentStock <= minStock) {
            suggestionsDiv.style.display = 'block';
            suggestionsDiv.style.borderLeftColor = 'var(--danger-color)';
            suggestionText.innerHTML = `
                <strong>⚠️ Low Stock Alert:</strong><br>
                Current stock: ${currentStock} ${item.unit || 'pcs'}<br>
                Estimated days remaining: ${daysRemaining > 999 ? 'N/A' : daysRemaining} days<br>
                <strong>Recommended reorder quantity: ${suggestedReorder} ${item.unit || 'pcs'}</strong><br>
                <small>Based on ${daysWithSales} days of sales data (avg ${avgDailySales.toFixed(1)} ${item.unit || 'pcs'}/day)</small>
            `;
        } else if (daysRemaining < 30) {
            suggestionsDiv.style.display = 'block';
            suggestionsDiv.style.borderLeftColor = 'var(--warning-color)';
            suggestionText.innerHTML = `
                <strong>📊 Stock Status:</strong><br>
                Current stock: ${currentStock} ${item.unit || 'pcs'}<br>
                Estimated days remaining: ${daysRemaining} days<br>
                <strong>Consider reordering: ${suggestedReorder} ${item.unit || 'pcs'}</strong><br>
                <small>Based on ${daysWithSales} days of sales data</small>
            `;
        } else {
            suggestionsDiv.style.display = 'block';
            suggestionsDiv.style.borderLeftColor = 'var(--success-color)';
            suggestionText.innerHTML = `
                <strong>✅ Stock Status:</strong><br>
                Current stock: ${currentStock} ${item.unit || 'pcs'}<br>
                Estimated days remaining: ${daysRemaining} days<br>
                Stock level is healthy
            `;
        }
    } catch (error) {
        console.error('Error calculating reorder suggestions:', error);
        suggestionsDiv.style.display = 'block';
        suggestionText.textContent = 'Unable to calculate reorder suggestions at this time.';
    }
}

// Make functions globally available
window.openVariantsModal = openVariantsModal;
window.closeVariantsModal = closeVariantsModal;
window.addVariant = addVariant;
window.removeVariant = removeVariant;
window.toggleReorderAuto = toggleReorderAuto;
window.loadReorderSuggestions = loadReorderSuggestions;
window.handleBatchImageUpload = handleBatchImageUpload;
window.removeBatchImage = removeBatchImage;
window.archiveItem = archiveItem;
window.unarchiveItem = unarchiveItem;
window.viewItemHistory = viewItemHistory;
window.toggleArchivedItems = toggleArchivedItems;
window.openTemplatesModal = openTemplatesModal;
window.loadItemTemplate = loadItemTemplate;
window.saveCurrentItemAsTemplate = saveCurrentItemAsTemplate;

// Templates Modal Functions
// Suggested templates based on inventory fields
const suggestedTemplates = {
    productTypes: [
        {
            name: 'Electronics',
            icon: 'fa-microchip',
            fields: {
                category: 'Electronics',
                unit: 'pcs',
                min_stock_level: 5,
                reorder_auto_enabled: true,
                description: 'Electronic device or component'
            }
        },
        {
            name: 'Clothing',
            icon: 'fa-tshirt',
            fields: {
                category: 'Clothing',
                unit: 'pcs',
                min_stock_level: 10,
                hasVariants: true,
                description: 'Clothing item with size/color variants'
            }
        },
        {
            name: 'Food & Beverages',
            icon: 'fa-utensils',
            fields: {
                category: 'Food & Beverages',
                unit: 'pcs',
                min_stock_level: 20,
                hasExpiration: true,
                reorder_auto_enabled: true,
                description: 'Food or beverage item with expiration date'
            }
        },
        {
            name: 'Books',
            icon: 'fa-book',
            fields: {
                category: 'Books',
                unit: 'pcs',
                min_stock_level: 15,
                description: 'Book or publication'
            }
        },
        {
            name: 'Office Supplies',
            icon: 'fa-clipboard',
            fields: {
                category: 'Office Supplies',
                unit: 'pcs',
                min_stock_level: 25,
                reorder_auto_enabled: true,
                description: 'Office supply item'
            }
        },
        {
            name: 'Pharmaceuticals',
            icon: 'fa-pills',
            fields: {
                category: 'Pharmaceuticals',
                unit: 'pcs',
                min_stock_level: 30,
                hasExpiration: true,
                reorder_auto_enabled: true,
                description: 'Pharmaceutical product with expiration tracking'
            }
        },
        {
            name: 'Cosmetics',
            icon: 'fa-palette',
            fields: {
                category: 'Cosmetics',
                unit: 'pcs',
                min_stock_level: 12,
                hasVariants: true,
                hasExpiration: true,
                description: 'Cosmetic product with variants and expiration'
            }
        },
        {
            name: 'Home & Garden',
            icon: 'fa-home',
            fields: {
                category: 'Home & Garden',
                unit: 'pcs',
                min_stock_level: 8,
                description: 'Home and garden product'
            }
        }
    ],
    quickTemplates: [
        {
            name: 'Basic Item',
            icon: 'fa-box',
            fields: {
                unit: 'pcs',
                min_stock_level: 10,
                description: 'Basic inventory item'
            },
            description: 'Quick add with essential fields only'
        },
        {
            name: 'Full Details',
            icon: 'fa-file-alt',
            fields: {
                unit: 'pcs',
                min_stock_level: 10,
                hasSupplier: true,
                hasDescription: true,
                reorder_auto_enabled: true,
                description: 'Complete item with all details'
            },
            description: 'All fields including supplier and description'
        },
        {
            name: 'With Variants',
            icon: 'fa-layer-group',
            fields: {
                unit: 'pcs',
                min_stock_level: 10,
                hasVariants: true,
                description: 'Item with size/color variants'
            },
            description: 'For items with multiple variants'
        },
        {
            name: 'Perishable',
            icon: 'fa-clock',
            fields: {
                unit: 'pcs',
                min_stock_level: 20,
                hasExpiration: true,
                reorder_auto_enabled: true,
                description: 'Perishable item with expiration date'
            },
            description: 'Items with expiration tracking'
        },
        {
            name: 'Bulk Product',
            icon: 'fa-boxes',
            fields: {
                unit: 'kg',
                min_stock_level: 50,
                reorder_auto_enabled: true,
                description: 'Bulk product sold by weight'
            },
            description: 'For bulk/weight-based products'
        },
        {
            name: 'Digital Product',
            icon: 'fa-download',
            fields: {
                unit: 'license',
                min_stock_level: 0,
                description: 'Digital product or license'
            },
            description: 'Digital products with unlimited stock'
        }
    ]
};

async function openTemplatesModal() {
    await loadItemTemplates();
    renderSuggestedTemplates();
    renderTemplatesList();
    openModal('templatesModal');
}

function renderSuggestedTemplates() {
    // Render Product Type Templates (Left Sidebar)
    const productTypeContainer = document.getElementById('productTypeTemplates');
    if (productTypeContainer) {
        productTypeContainer.innerHTML = suggestedTemplates.productTypes.map(template => `
            <div class="template-card" onclick="loadSuggestedTemplate('productType', '${template.name}')" role="button" tabindex="0" aria-label="Load ${template.name} template">
                <div class="template-icon">
                    <i class="fas ${template.icon}"></i>
                </div>
                <div class="template-name">${escapeHtml(template.name)}</div>
                <div class="template-description">${escapeHtml(template.fields.description || '')}</div>
            </div>
        `).join('');
    }
    
    // Render Quick Templates (Right Sidebar)
    const quickTemplatesContainer = document.getElementById('quickTemplates');
    if (quickTemplatesContainer) {
        quickTemplatesContainer.innerHTML = suggestedTemplates.quickTemplates.map(template => `
            <div class="template-card" onclick="loadSuggestedTemplate('quick', '${template.name}')" role="button" tabindex="0" aria-label="Load ${template.name} template">
                <div class="template-icon">
                    <i class="fas ${template.icon}"></i>
                </div>
                <div class="template-name">${escapeHtml(template.name)}</div>
                <div class="template-description">${escapeHtml(template.description || '')}</div>
            </div>
        `).join('');
    }
}

function loadSuggestedTemplate(type, templateName) {
    let template;
    if (type === 'productType') {
        template = suggestedTemplates.productTypes.find(t => t.name === templateName);
    } else {
        template = suggestedTemplates.quickTemplates.find(t => t.name === templateName);
    }
    
    if (!template) return;
    
    // Close templates modal and open item modal
    closeModal('templatesModal');
    
    // Clear form first
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    itemVariants = [];
    uploadedImageData = null;
    uploadedImages = [];
    
    // Apply template fields
    const fields = template.fields;
    
    if (fields.category) {
        // Try to find category by name
        const category = categories.find(c => c.name.toLowerCase() === fields.category.toLowerCase());
        if (category) {
            document.getElementById('itemCategory').value = category.id;
        }
    }
    
    if (fields.unit) {
        document.getElementById('itemUnit').value = fields.unit;
    }
    
    if (fields.min_stock_level !== undefined) {
        document.getElementById('itemMinStock').value = fields.min_stock_level;
    }
    
    if (fields.description) {
        document.getElementById('itemDescription').value = fields.description;
    }
    
    if (fields.hasVariants) {
        // Variants will be managed separately
    }
    
    if (fields.hasExpiration) {
        // Expiration date will be set by user
    }
    
    if (fields.hasSupplier) {
        // Supplier will be entered by user
    }
    
    if (fields.reorder_auto_enabled) {
        document.getElementById('enableReorderAuto').checked = true;
        toggleReorderAuto();
    }
    
    // Open item modal
    openItemModal();
    
    // Focus on name field
    setTimeout(() => {
        document.getElementById('itemName').focus();
    }, 100);
}

window.loadSuggestedTemplate = loadSuggestedTemplate;

function renderTemplatesList() {
    const list = document.getElementById('templatesList');
    if (!list) return;
    
    if (itemTemplates.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No templates saved yet. Create a template from an item.</p>';
        return;
    }
    
    list.innerHTML = `
        <table class="data-table" style="width: 100%;">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${itemTemplates.map(template => {
                    const safeName = escapeHtml(template.name || '');
                    const safeDescription = escapeHtml(template.description || '-');
                    return `
                    <tr>
                        <td><strong>${safeName}</strong></td>
                        <td>${safeDescription}</td>
                        <td>${formatDate(template.created_at)}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="loadItemTemplate(${template.id})" title="Load Template"><i class="fas fa-download"></i> Load</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteItemTemplate(${template.id})" title="Delete"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function deleteItemTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    
    try {
        await apiRequest(`/item-templates/${templateId}`, 'DELETE');
        showNotification('Template deleted', 'success');
        await loadItemTemplates();
        renderTemplatesList();
    } catch (error) {
        showNotification('Error deleting template', 'error');
    }
}

async function saveCurrentItemAsTemplate() {
    const name = prompt('Enter template name:');
    if (!name) return;
    
    const description = prompt('Enter template description (optional):') || '';
    
    // Use first batch image if available, otherwise use single uploaded image or URL
    let imageUrl = null;
    if (uploadedImages.length > 0) {
        imageUrl = uploadedImages[0].dataUrl;
    } else if (uploadedImageData) {
        imageUrl = uploadedImageData;
    } else {
        imageUrl = document.getElementById('itemImageUrl').value.trim() || null;
    }
    
    const itemData = {
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        unit: document.getElementById('itemUnit').value || 'pcs',
        expiration_date: document.getElementById('itemExpirationDate').value || null,
        image_url: imageUrl
    };
    
    await saveItemTemplate(name, description, itemData);
    closeModal('templatesModal');
}

window.deleteItemTemplate = deleteItemTemplate;

// Barcode Viewer Functions
let currentBarcodeItem = null;
let currentBarcodeValue = null;

function viewBarcode(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) {
        showNotification('Item not found', 'error');
        return;
    }
    
    currentBarcodeItem = item;
    const barcodeValue = item.sku || `ITEM-${item.id}`;
    currentBarcodeValue = barcodeValue;
    
    // Update modal content
    const barcodeViewerItemNameEl = document.getElementById('barcodeViewerItemName');
    if (barcodeViewerItemNameEl) {
        barcodeViewerItemNameEl.textContent = item.name || 'Unknown';
    }
    document.getElementById('barcodeViewerValue').textContent = barcodeValue;
    
    // Open modal
    openModal('barcodeViewerModal');
    
    // Render barcode in viewer
    const canvas = document.getElementById('barcodeViewerCanvas');
    if (canvas && window.JsBarcode) {
        try {
            JsBarcode(canvas, barcodeValue, {
                format: "CODE128",
                width: 3,
                height: 120,
                displayValue: false,
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
        // Wait for library to load
        const maxAttempts = 10;
        let attempts = 0;
        const tryRender = () => {
            attempts++;
            if (window.JsBarcode && canvas) {
                try {
                    JsBarcode(canvas, barcodeValue, {
                        format: "CODE128",
                        width: 3,
                        height: 120,
                        displayValue: false,
                        fontSize: 16,
                        margin: 15,
                        background: "#ffffff",
                        lineColor: "#000000"
                    });
                } catch (error) {
                    console.error('Error rendering barcode:', error);
                }
            } else if (attempts < maxAttempts) {
                setTimeout(tryRender, 200);
            }
        };
        tryRender();
    }
}

function printBarcode() {
    if (!currentBarcodeItem || !currentBarcodeValue) return;
    
    const printWindow = window.open('', '_blank');
    const item = currentBarcodeItem;
    const barcodeValue = currentBarcodeValue;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barcode - ${item.name}</title>
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
                @media print {
                    body { margin: 0; padding: 1rem; }
                    .barcode-container { border: none; }
                }
            </style>
            <script src="/js/jsbarcode.all.min.js"></script>
        </head>
        <body>
            <div class="barcode-container">
                <div class="item-name">${item.name}</div>
                <canvas id="printBarcode"></canvas>
                <div class="barcode-value">${barcodeValue}</div>
            </div>
            <script>
                window.onload = function() {
                    if (window.JsBarcode) {
                        JsBarcode('#printBarcode', '${barcodeValue}', {
                            format: "CODE128",
                            width: 3,
                            height: 120,
                            displayValue: false,
                            fontSize: 16,
                            margin: 15,
                            background: "#ffffff",
                            lineColor: "#000000"
                        });
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    }
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function downloadBarcode() {
    if (!currentBarcodeItem || !currentBarcodeValue) return;
    
    const canvas = document.getElementById('barcodeViewerCanvas');
    if (!canvas) return;
    
    try {
        const link = document.createElement('a');
        link.download = `barcode-${currentBarcodeValue}-${currentBarcodeItem.name.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('Barcode downloaded', 'success');
    } catch (error) {
        console.error('Error downloading barcode:', error);
        showNotification('Error downloading barcode', 'error');
    }
}

function copyBarcodeValue() {
    if (!currentBarcodeValue) return;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentBarcodeValue).then(() => {
            showNotification('Barcode value copied to clipboard', 'success');
        }).catch(err => {
            console.error('Error copying to clipboard:', err);
            fallbackCopyTextToClipboard(currentBarcodeValue);
        });
    } else {
        fallbackCopyTextToClipboard(currentBarcodeValue);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('Barcode value copied to clipboard', 'success');
        } else {
            showNotification('Failed to copy barcode value', 'error');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showNotification('Failed to copy barcode value', 'error');
    }
    
    document.body.removeChild(textArea);
}

window.viewBarcode = viewBarcode;
window.printBarcode = printBarcode;
window.downloadBarcode = downloadBarcode;
window.copyBarcodeValue = copyBarcodeValue;
window.openItemModal = openItemModal;
window.closeItemModal = closeItemModal;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.filterItems = filterItems;
window.editItem = openItemModal;
window.archiveItem = archiveItem;
window.unarchiveItem = unarchiveItem;
window.viewItemHistory = viewItemHistory;
window.openAdjustStockModal = openAdjustStockModal;
window.closeAdjustStockModal = closeAdjustStockModal;

