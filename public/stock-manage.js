let categories = [];
let items = [];
let filteredItems = [];
let currentEditingItem = null;
let currentSort = { column: null, direction: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadItems();
    setupEventListeners();
});

async function loadCategories() {
    try {
        categories = await apiRequest('/categories');
        const categoryFilter = document.getElementById('categoryStockFilter');
        if (categoryFilter) {
            const options = categories.map(cat => 
                `<option value="${cat.id}">${cat.name}</option>`
            ).join('');
            categoryFilter.innerHTML = '<option value="">All Categories</option>' + options;
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadItems() {
    const tbody = document.getElementById('stockTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" data-label="">Loading...</td></tr>';
    }
    
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        let url = '/items';
        if (shopFilter.shop_id) {
            url += `?shop_id=${shopFilter.shop_id}`;
        }
        items = await apiRequest(url);
        renderStockTable(items);
    } catch (error) {
        showNotification('Error loading items', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" data-label="">Error loading items</td></tr>';
        }
    }
}

function renderStockTable(itemsList) {
    filteredItems = itemsList;
    const tbody = document.getElementById('stockTableBody');
    
    if (!tbody) return;
    
    if (itemsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" data-label="">No items found</td></tr>';
        return;
    }
    
    const sorted = [...itemsList].sort((a, b) => {
        if (!currentSort.column) return 0;
        let aVal, bVal;
        switch(currentSort.column) {
            case 'name': aVal = a.name || ''; bVal = b.name || ''; break;
            case 'stock_quantity': aVal = a.stock_quantity || 0; bVal = b.stock_quantity || 0; break;
            case 'min_stock_level': aVal = a.min_stock_level || 0; bVal = b.min_stock_level || 0; break;
            default: return 0;
        }
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });
    
    const fragment = document.createDocumentFragment();
    
    sorted.forEach(item => {
        const isLowStock = item.stock_quantity > 0 && item.stock_quantity <= item.min_stock_level;
        const isOutOfStock = item.stock_quantity === 0;
        
        const tr = document.createElement('tr');
        tr.setAttribute('data-item-id', item.id);
        if (isLowStock) tr.className = 'low-stock-row';
        if (isOutOfStock) tr.className = 'out-of-stock-row';
        
        const safeName = escapeHtml(item.name || '');
        const safeSku = escapeHtml(item.sku || '');
        const safeCategoryName = escapeHtml(item.category_name || '-');
        const safeUnit = escapeHtml(item.unit || 'pcs');
        
        tr.innerHTML = `
            <td data-label="Name">${safeName}</td>
            <td data-label="SKU">${safeSku || '<span style="color: var(--text-secondary);">-</span>'}</td>
            <td data-label="Category">${safeCategoryName}</td>
            <td data-label="Stock Quantity" class="numeric">
                <span class="${isLowStock ? 'badge badge-warning' : isOutOfStock ? 'badge badge-danger' : ''}">
                    ${item.stock_quantity} ${safeUnit}
                </span>
            </td>
            <td data-label="Min Stock Level" class="numeric">${item.min_stock_level || 10}</td>
            <td data-label="Unit">${safeUnit}</td>
            <td data-label="Status">
                ${isLowStock 
                    ? '<span class="badge badge-warning"><i class="fas fa-exclamation-triangle"></i> Low Stock</span>' 
                    : isOutOfStock
                    ? '<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Out of Stock</span>'
                    : '<span class="badge badge-success"><i class="fas fa-check-circle"></i> In Stock</span>'}
            </td>
            <td data-label="Actions">
                <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                    <button class="btn btn-sm btn-secondary" onclick="openStockUpdateModal(${item.id})" title="Update Stock" aria-label="Update stock"><i class="fas fa-edit"></i> <span class="btn-text-mobile">Update</span></button>
                </div>
            </td>
        `;
        
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function setupEventListeners() {
    const stockUpdateForm = document.getElementById('stockUpdateForm');
    if (stockUpdateForm) {
        stockUpdateForm.addEventListener('submit', handleStockUpdate);
    }
    
    const bulkStockUpdateForm = document.getElementById('bulkStockUpdateForm');
    if (bulkStockUpdateForm) {
        bulkStockUpdateForm.addEventListener('submit', handleBulkStockUpdate);
    }
    
    const searchInput = document.getElementById('searchStock');
    if (searchInput) {
        searchInput.addEventListener('input', filterStock);
    }
    
    const categoryFilter = document.getElementById('categoryStockFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', performStockFiltering);
    }
    
    const stockStatusFilter = document.getElementById('stockStatusFilter');
    if (stockStatusFilter) {
        stockStatusFilter.addEventListener('change', performStockFiltering);
    }
}

function filterStock() {
    setTimeout(() => performStockFiltering(), 300);
}

function performStockFiltering() {
    const searchTerm = document.getElementById('searchStock').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('categoryStockFilter').value;
    const stockStatusFilter = document.getElementById('stockStatusFilter').value;
    
    let filtered = [...items];
    
    if (searchTerm) {
        filtered = filtered.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(searchTerm);
            const skuMatch = item.sku && item.sku.toLowerCase().includes(searchTerm);
            return nameMatch || skuMatch;
        });
    }
    
    if (categoryFilter) {
        filtered = filtered.filter(item => item.category_id == categoryFilter);
    }
    
    if (stockStatusFilter) {
        filtered = filtered.filter(item => {
            if (stockStatusFilter === 'in_stock') return item.stock_quantity > item.min_stock_level;
            if (stockStatusFilter === 'low_stock') return item.stock_quantity > 0 && item.stock_quantity <= item.min_stock_level;
            if (stockStatusFilter === 'out_of_stock') return item.stock_quantity === 0;
            return true;
        });
    }
    
    renderStockTable(filtered);
}

function clearStockFilters() {
    const searchInput = document.getElementById('searchStock');
    const categoryFilter = document.getElementById('categoryStockFilter');
    const stockStatusFilter = document.getElementById('stockStatusFilter');
    
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (stockStatusFilter) stockStatusFilter.value = '';
    
    performStockFiltering();
}

function sortStockTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderStockTable(filteredItems);
}

async function openStockUpdateModal(itemId) {
    currentEditingItem = itemId;
    const item = items.find(i => i.id === itemId);
    if (!item) {
        showNotification('Item not found', 'error');
        return;
    }
    
    document.getElementById('stockItemId').value = item.id;
    document.getElementById('stockItemNameDisplay').value = item.name || '';
    document.getElementById('updateStockQuantity').value = item.stock_quantity || 0;
    document.getElementById('updateMinStockLevel').value = item.min_stock_level || 10;
    document.getElementById('updateUnit').value = item.unit || 'pcs';
    
    const firstInput = document.getElementById('updateStockQuantity');
    openModal('stockUpdateModal', firstInput);
}

function closeStockUpdateModal() {
    closeModal('stockUpdateModal');
    const form = document.getElementById('stockUpdateForm');
    if (form) form.reset();
    currentEditingItem = null;
}

async function handleStockUpdate(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('stockItemId').value;
    const stockQuantity = parseInt(document.getElementById('updateStockQuantity').value) || 0;
    const minStockLevel = parseInt(document.getElementById('updateMinStockLevel').value) || 10;
    const unit = document.getElementById('updateUnit').value || 'pcs';
    
    if (!itemId) {
        showNotification('Item ID is required', 'error');
        return;
    }
    
    try {
        await apiRequest(`/items/${itemId}`, {
            method: 'PUT',
            body: {
                stock_quantity: stockQuantity,
                min_stock_level: minStockLevel,
                unit: unit
            }
        });
        
        showNotification('Stock updated successfully', 'success');
        closeStockUpdateModal();
        await loadItems();
    } catch (error) {
        showNotification(error.message || 'Error updating stock', 'error');
    }
}

function openBulkStockUpdateModal() {
    const categoryFilter = document.getElementById('bulkStockCategory');
    if (categoryFilter) {
        const options = categories.map(cat => 
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + options;
    }
    openModal('bulkStockUpdateModal');
}

function closeBulkStockUpdateModal() {
    closeModal('bulkStockUpdateModal');
    const form = document.getElementById('bulkStockUpdateForm');
    if (form) form.reset();
}

async function handleBulkStockUpdate(e) {
    e.preventDefault();
    
    const updateType = document.getElementById('bulkStockType').value;
    const stockQuantity = parseInt(document.getElementById('bulkStockQuantity').value) || 0;
    const minStockLevel = parseInt(document.getElementById('bulkMinStockLevel').value) || 10;
    const categoryFilter = document.getElementById('bulkStockCategory').value;
    
    let itemsToUpdate = [...items];
    
    if (categoryFilter) {
        itemsToUpdate = itemsToUpdate.filter(item => item.category_id == categoryFilter);
    }
    
    if (itemsToUpdate.length === 0) {
        showNotification('No items match the filter criteria', 'error');
        return;
    }
    
    if (!confirm(`Update stock for ${itemsToUpdate.length} item(s)?`)) {
        return;
    }
    
    try {
        let updated = 0;
        for (const item of itemsToUpdate) {
            let newStockQuantity = item.stock_quantity || 0;
            
            if (updateType === 'increase') {
                newStockQuantity = newStockQuantity + stockQuantity;
            } else if (updateType === 'decrease') {
                newStockQuantity = Math.max(0, newStockQuantity - stockQuantity);
            } else if (updateType === 'set') {
                newStockQuantity = stockQuantity;
            }
            
            await apiRequest(`/items/${item.id}`, {
                method: 'PUT',
                body: {
                    stock_quantity: newStockQuantity,
                    min_stock_level: minStockLevel
                }
            });
            updated++;
        }
        
        showNotification(`Updated stock for ${updated} item(s)`, 'success');
        closeBulkStockUpdateModal();
        await loadItems();
    } catch (error) {
        showNotification(error.message || 'Error updating stock', 'error');
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.openStockUpdateModal = openStockUpdateModal;
window.closeStockUpdateModal = closeStockUpdateModal;
window.openBulkStockUpdateModal = openBulkStockUpdateModal;
window.closeBulkStockUpdateModal = closeBulkStockUpdateModal;
window.sortStockTable = sortStockTable;
window.filterStock = filterStock;
window.clearStockFilters = clearStockFilters;

