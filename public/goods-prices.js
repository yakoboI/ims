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
        const categoryFilter = document.getElementById('categoryPriceFilter');
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
    const tbody = document.getElementById('pricesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" data-label="">Loading...</td></tr>';
    }
    
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        let url = '/items';
        if (shopFilter.shop_id) {
            url += `?shop_id=${shopFilter.shop_id}`;
        }
        items = await apiRequest(url);
        renderPricesTable(items);
    } catch (error) {
        showNotification('Error loading items', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" data-label="">Error loading items</td></tr>';
        }
    }
}

function renderPricesTable(itemsList) {
    filteredItems = itemsList;
    const tbody = document.getElementById('pricesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (itemsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" data-label="">No items found</td></tr>';
        return;
    }
    
    const sorted = [...itemsList].sort((a, b) => {
        if (!currentSort.column) return 0;
        let aVal, bVal;
        switch(currentSort.column) {
            case 'name': aVal = a.name || ''; bVal = b.name || ''; break;
            case 'unit_price': aVal = a.unit_price || 0; bVal = b.unit_price || 0; break;
            case 'cost_price': aVal = a.cost_price || 0; bVal = b.cost_price || 0; break;
            default: return 0;
        }
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });
    
    const fragment = document.createDocumentFragment();
    
    sorted.forEach(item => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-item-id', item.id);
        
        const safeName = escapeHtml(item.name || '');
        const safeSku = escapeHtml(item.sku || '');
        const safeCategoryName = escapeHtml(item.category_name || '-');
        
        tr.innerHTML = `
            <td data-label="Name">${safeName}</td>
            <td data-label="SKU">${safeSku || '<span style="color: var(--text-secondary);">-</span>'}</td>
            <td data-label="Category">${safeCategoryName}</td>
            <td data-label="Unit Price" class="numeric">${formatCurrency(item.unit_price || 0)}</td>
            <td data-label="Cost Price" class="numeric">${item.cost_price ? formatCurrency(item.cost_price) : '<span style="color: var(--text-secondary);">-</span>'}</td>
            <td data-label="Actions">
                <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                    <button class="btn btn-sm btn-secondary" onclick="openPriceUpdateModal(${item.id})" title="Update Prices" aria-label="Update prices"><i class="fas fa-edit"></i> <span class="btn-text-mobile">Update</span></button>
                </div>
            </td>
        `;
        
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function setupEventListeners() {
    const priceUpdateForm = document.getElementById('priceUpdateForm');
    if (priceUpdateForm) {
        priceUpdateForm.addEventListener('submit', handlePriceUpdate);
    }
    
    const bulkPriceUpdateForm = document.getElementById('bulkPriceUpdateForm');
    if (bulkPriceUpdateForm) {
        bulkPriceUpdateForm.addEventListener('submit', handleBulkPriceUpdate);
    }
    
    const searchInput = document.getElementById('searchPrices');
    if (searchInput) {
        searchInput.addEventListener('input', filterPrices);
    }
    
    const categoryFilter = document.getElementById('categoryPriceFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', performPriceFiltering);
    }
}

function filterPrices() {
    setTimeout(() => performPriceFiltering(), 300);
}

function performPriceFiltering() {
    const searchTerm = document.getElementById('searchPrices').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('categoryPriceFilter').value;
    
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
    
    renderPricesTable(filtered);
}

function clearPriceFilters() {
    const searchInput = document.getElementById('searchPrices');
    const categoryFilter = document.getElementById('categoryPriceFilter');
    
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    
    performPriceFiltering();
}

function sortPriceTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderPricesTable(filteredItems);
}

async function openPriceUpdateModal(itemId) {
    currentEditingItem = itemId;
    const item = items.find(i => i.id === itemId);
    if (!item) {
        showNotification('Item not found', 'error');
        return;
    }
    
    document.getElementById('priceItemId').value = item.id;
    document.getElementById('itemNameDisplay').value = item.name || '';
    document.getElementById('updateUnitPrice').value = item.unit_price || 0;
    document.getElementById('updateCostPrice').value = item.cost_price || '';
    
    const firstInput = document.getElementById('updateUnitPrice');
    openModal('priceUpdateModal', firstInput);
}

function closePriceUpdateModal() {
    closeModal('priceUpdateModal');
    const form = document.getElementById('priceUpdateForm');
    if (form) form.reset();
    currentEditingItem = null;
}

async function handlePriceUpdate(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('priceItemId').value;
    const unitPrice = parseFloat(document.getElementById('updateUnitPrice').value);
    const costPrice = document.getElementById('updateCostPrice').value ? parseFloat(document.getElementById('updateCostPrice').value) : null;
    
    if (!itemId || isNaN(unitPrice)) {
        showNotification('Please fill in required fields', 'error');
        return;
    }
    
    try {
        await apiRequest(`/items/${itemId}`, {
            method: 'PUT',
            body: {
                unit_price: unitPrice,
                cost_price: costPrice
            }
        });
        
        showNotification('Prices updated successfully', 'success');
        closePriceUpdateModal();
        await loadItems();
    } catch (error) {
        showNotification(error.message || 'Error updating prices', 'error');
    }
}

function openBulkPriceUpdateModal() {
    const categoryFilter = document.getElementById('bulkPriceCategory');
    if (categoryFilter) {
        const options = categories.map(cat => 
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + options;
    }
    openModal('bulkPriceUpdateModal');
}

function closeBulkPriceUpdateModal() {
    closeModal('bulkPriceUpdateModal');
    const form = document.getElementById('bulkPriceUpdateForm');
    if (form) form.reset();
}

async function handleBulkPriceUpdate(e) {
    e.preventDefault();
    
    const updateType = document.getElementById('bulkPriceType').value;
    const unitPriceValue = parseFloat(document.getElementById('bulkUnitPriceValue').value) || 0;
    const costPriceValue = document.getElementById('bulkCostPriceValue').value ? parseFloat(document.getElementById('bulkCostPriceValue').value) : null;
    const categoryFilter = document.getElementById('bulkPriceCategory').value;
    
    let itemsToUpdate = [...items];
    
    if (categoryFilter) {
        itemsToUpdate = itemsToUpdate.filter(item => item.category_id == categoryFilter);
    }
    
    if (itemsToUpdate.length === 0) {
        showNotification('No items match the filter criteria', 'error');
        return;
    }
    
    if (!confirm(`Update prices for ${itemsToUpdate.length} item(s)?`)) {
        return;
    }
    
    try {
        let updated = 0;
        for (const item of itemsToUpdate) {
            let newUnitPrice = item.unit_price || 0;
            let newCostPrice = item.cost_price;
            
            if (updateType === 'percentage') {
                newUnitPrice = newUnitPrice * (1 + unitPriceValue / 100);
                if (newCostPrice) {
                    newCostPrice = newCostPrice * (1 + (costPriceValue || 0) / 100);
                }
            } else if (updateType === 'fixed') {
                newUnitPrice = newUnitPrice + unitPriceValue;
                if (newCostPrice && costPriceValue) {
                    newCostPrice = newCostPrice + costPriceValue;
                }
            } else if (updateType === 'set') {
                newUnitPrice = unitPriceValue;
                if (costPriceValue !== null && costPriceValue !== '') {
                    newCostPrice = costPriceValue;
                }
            }
            
            await apiRequest(`/items/${item.id}`, {
                method: 'PUT',
                body: {
                    unit_price: newUnitPrice,
                    cost_price: newCostPrice
                }
            });
            updated++;
        }
        
        showNotification(`Updated prices for ${updated} item(s)`, 'success');
        closeBulkPriceUpdateModal();
        await loadItems();
    } catch (error) {
        showNotification(error.message || 'Error updating prices', 'error');
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

window.openPriceUpdateModal = openPriceUpdateModal;
window.closePriceUpdateModal = closePriceUpdateModal;
window.openBulkPriceUpdateModal = openBulkPriceUpdateModal;
window.closeBulkPriceUpdateModal = closeBulkPriceUpdateModal;
window.sortPriceTable = sortPriceTable;
window.filterPrices = filterPrices;
window.clearPriceFilters = clearPriceFilters;

