let categories = [];
let items = [];
let currentEditingItem = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadItems();
    setupEventListeners();
});

async function loadCategories() {
    try {
        categories = await apiRequest('/categories');
        const categorySelect = document.getElementById('itemCategory');
        const categoryFilter = document.getElementById('categoryFilter');
        
        const options = categories.map(cat => 
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');
        
        categorySelect.innerHTML = '<option value="">Select Category</option>' + options;
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + options;
    } catch (error) {
    }
}

async function loadItems() {
    const tbody = document.getElementById('itemsTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    hideTableSkeleton(tableContainer);
    showTableSkeleton(tableContainer, 5, 8);
    tbody.innerHTML = '';
    
    try {
        items = await apiRequest('/items');
        hideTableSkeleton(tableContainer);
        renderItemsTable(items);
    } catch (error) {
        hideTableSkeleton(tableContainer);
        showNotification('Error loading items', 'error');
        if (items.length === 0) {
            showEmptyState(tableContainer, EmptyStates.items);
        }
    }
}

function renderItemsTable(itemsList) {
    const tbody = document.getElementById('itemsTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (itemsList.length === 0) {
        tbody.innerHTML = '';
        showEmptyState(tableContainer, EmptyStates.items);
        return;
    }

    hideEmptyState(tableContainer);
    tbody.innerHTML = itemsList.map(item => `
        <tr>
            <td data-label="SKU">${item.sku || '-'}</td>
            <td data-label="Image">
                ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : '<span style="color: var(--text-secondary);">-</span>'}
            </td>
            <td data-label="Name"><strong>${item.name}</strong></td>
            <td data-label="Category">${item.category_name || '-'}</td>
            <td data-label="Stock Qty" class="col-stock numeric">
                <span class="${item.stock_quantity <= item.min_stock_level ? 'badge badge-warning' : ''}">
                    ${item.stock_quantity} ${item.unit || 'pcs'}
                </span>
            </td>
            <td data-label="Unit Price" class="col-price numeric">${formatCurrency(item.unit_price)}</td>
            <td data-label="Status">
                ${item.stock_quantity <= item.min_stock_level 
                    ? '<span class="badge badge-warning">Low Stock</span>' 
                    : '<span class="badge badge-success">In Stock</span>'}
            </td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editItem(${item.id})">Edit</button>
                <button class="btn btn-sm btn-info" onclick="openAdjustStockModal(${item.id})">Adjust Stock</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('itemForm').addEventListener('submit', handleItemSubmit);
    document.getElementById('searchItems').addEventListener('input', filterItems);
    document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
}

function filterItems() {
    const searchTerm = document.getElementById('searchItems').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    let filtered = items;
    
    if (searchTerm) {
        filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(searchTerm) ||
            (item.sku && item.sku.toLowerCase().includes(searchTerm))
        );
    }
    
    if (categoryFilter) {
        filtered = filtered.filter(item => item.category_id == categoryFilter);
    }
    
    renderItemsTable(filtered);
}

function openItemModal(itemId = null) {
    currentEditingItem = itemId;
    const modal = document.getElementById('itemModal');
    const form = document.getElementById('itemForm');
    const title = document.getElementById('modalTitle');
    
    if (itemId) {
        title.textContent = 'Edit Item';
        const item = items.find(i => i.id === itemId);
        if (item) {
            document.getElementById('itemId').value = item.id;
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemSku').value = item.sku || '';
            document.getElementById('itemImageUrl').value = item.image_url || '';
            document.getElementById('itemCategory').value = item.category_id || '';
            document.getElementById('itemUnitPrice').value = item.unit_price;
            document.getElementById('itemCostPrice').value = item.cost_price || '';
            document.getElementById('itemStockQty').value = item.stock_quantity;
            document.getElementById('itemMinStock').value = item.min_stock_level;
            document.getElementById('itemUnit').value = item.unit || 'pcs';
            document.getElementById('itemDescription').value = item.description || '';
        }
    } else {
        title.textContent = 'Add Item';
        form.reset();
        document.getElementById('itemId').value = '';
    }
    
    // Use accessible modal function
    const firstInput = document.getElementById('itemName');
    openModal('itemModal', firstInput);
}

async function scanBarcodeForSKU() {
    const skuInput = document.getElementById('itemSku');
    if (!skuInput) return;
    
    // Use unified barcode scanner if available
    if (window.BarcodeScanner) {
        // Create a temporary input for barcode scanning
        const tempInput = document.createElement('input');
        tempInput.type = 'text';
        tempInput.style.position = 'fixed';
        tempInput.style.left = '-9999px';
        tempInput.style.opacity = '0';
        document.body.appendChild(tempInput);
        
        // Focus the temporary input
        tempInput.focus();
        showNotification('Scan barcode or type and press Enter', 'info');
        
        // Initialize barcode scanner on temp input
        window.BarcodeScanner.init(
            tempInput,
            async (item, barcode) => {
                // Item found - ask if user wants to edit existing
                document.body.removeChild(tempInput);
                
                if (confirm(`Item "${item.name}" already exists with this barcode. Do you want to edit it?`)) {
                    closeItemModal();
                    openItemModal(item.id);
                } else {
                    skuInput.value = barcode;
                    skuInput.focus();
                }
            },
            async (error, barcode) => {
                // Item not found - set barcode for new item
                document.body.removeChild(tempInput);
                skuInput.value = barcode;
                showNotification('Barcode set. Creating new item.', 'info');
                skuInput.focus();
            }
        );
        
        // Cleanup after 30 seconds if no input
        setTimeout(() => {
            if (document.body.contains(tempInput)) {
                document.body.removeChild(tempInput);
            }
        }, 30000);
    } else {
        // Fallback to prompt
        const barcode = prompt('Scan or enter barcode:');
        if (barcode && barcode.trim()) {
            skuInput.value = barcode.trim();
            skuInput.focus();
        }
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
    currentEditingItem = null;
}

async function handleItemSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    // Get SKU value
    const skuInput = document.getElementById('itemSku');
    const skuValue = skuInput ? skuInput.value.trim() : '';
    
    // Validate SKU if provided
    if (skuValue && window.SKUUtils) {
        const skuValidation = window.SKUUtils.validate(skuValue);
        if (!skuValidation.valid) {
            showNotification(skuValidation.message, 'error');
            if (skuInput) {
                skuInput.focus();
                skuInput.select();
            }
            return;
        }
        
        // Format SKU
        const formattedSku = window.SKUUtils.format(skuValue);
        if (skuInput && formattedSku !== skuValue) {
            skuInput.value = formattedSku;
        }
        
        // Check uniqueness (client-side check)
        const itemId = document.getElementById('itemId').value;
        if (!window.SKUUtils.isUnique(formattedSku, items, itemId ? parseInt(itemId) : null)) {
            if (!confirm(`SKU "${formattedSku}" already exists. Do you want to continue?`)) {
                if (skuInput) {
                    skuInput.focus();
                    skuInput.select();
                }
                return;
            }
        }
    }
    
    // Validate form
    if (!validateForm(form, {
        itemName: ValidationRules.username,
        itemUnitPrice: ValidationRules.price,
        itemStockQty: ValidationRules.quantity
    })) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        sku: skuValue ? window.SKUUtils ? window.SKUUtils.format(skuValue) : skuValue : null,
        description: document.getElementById('itemDescription').value.trim() || null,
        category_id: document.getElementById('itemCategory').value || null,
        unit_price: parseFloat(document.getElementById('itemUnitPrice').value),
        cost_price: document.getElementById('itemCostPrice').value ? parseFloat(document.getElementById('itemCostPrice').value) : null,
        stock_quantity: parseInt(document.getElementById('itemStockQty').value) || 0,
        min_stock_level: parseInt(document.getElementById('itemMinStock').value) || 10,
        unit: document.getElementById('itemUnit').value || 'pcs',
        image_url: document.getElementById('itemImageUrl').value.trim() || null
    };
    
    const itemId = document.getElementById('itemId').value;
    
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
        if (newCategory) {
            document.getElementById('itemCategory').value = newCategory.id;
        }
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
    document.getElementById('adjustStockForm').reset();
}

document.getElementById('adjustStockForm').addEventListener('submit', async (e) => {
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
    } catch (error) {
        showNotification(error.message || 'Error adjusting stock', 'error');
    }
});

