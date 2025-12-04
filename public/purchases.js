let allItems = [];
let suppliers = [];
let purchaseItems = [];
let purchaseBarcodeScanTimeout = null;
let lastPurchaseBarcodeTime = 0;
let purchaseBarcodeScanInProgress = false;
let purchaseItemsCache = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    await loadSuppliers();
    await loadPurchases();
    setupEventListeners();
});

async function loadItems() {
    try {
        allItems = await apiRequest('/items');
        
        // Update purchase items cache
        purchaseItemsCache.clear();
        allItems.forEach(item => {
            if (item.sku) {
                purchaseItemsCache.set(item.sku.toLowerCase(), item);
                
                // Also update barcode scanner cache
                if (window.BarcodeScanner) {
                    window.BarcodeScanner.barcodeCache.set(item.sku.toLowerCase(), {
                        item: item,
                        timestamp: Date.now()
                    });
                }
            }
        });
        
        const select = document.getElementById('purchaseItemSelect');
        if (select) {
            select.innerHTML = '<option value="">Select Item</option>' + 
                allItems.map(item => 
                    `<option value="${item.id}">${item.name}</option>`
                ).join('');
        }
    } catch (error) {
        if (window.ErrorLogger) {
            window.ErrorLogger.log(error, { type: 'load_items_error', page: 'purchases' });
        }
    }
}

async function loadSuppliers() {
    try {
        suppliers = await apiRequest('/suppliers');
        const select = document.getElementById('purchaseSupplier');
        select.innerHTML = '<option value="">Select Supplier</option>' + 
            suppliers.map(supplier => 
                `<option value="${supplier.id}">${supplier.name}</option>`
            ).join('');
    } catch (error) {
    }
}

async function loadPurchases() {
    const tbody = document.getElementById('purchasesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 6);
    }
    if (tbody) tbody.innerHTML = '';
    
    try {
        const purchases = await apiRequest('/purchases');
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderPurchasesTable(purchases);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading purchases', 'error');
        renderPurchasesTable([]);
    }
}

function renderPurchasesTable(purchases) {
    const tbody = document.getElementById('purchasesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (purchases.length === 0) {
        tbody.innerHTML = '';
        showEmptyState(tableContainer, EmptyStates.purchases);
        return;
    }

    hideEmptyState(tableContainer);
    tbody.innerHTML = purchases.map(purchase => `
        <tr>
            <td data-label="Purchase ID">#${purchase.id}</td>
            <td data-label="Date">${formatDate(purchase.purchase_date)}</td>
            <td data-label="Supplier">${purchase.supplier_name || '-'}</td>
            <td data-label="Total Amount" class="col-amount numeric"><strong>${formatCurrency(purchase.total_amount)}</strong></td>
            <td data-label="Created By">${purchase.created_by_name || '-'}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="viewPurchase(${purchase.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('newPurchaseForm').addEventListener('submit', handlePurchaseSubmit);
    document.getElementById('supplierForm').addEventListener('submit', handleSupplierSubmit);
    
    // Use unified barcode scanner
    const barcodeInput = document.getElementById('purchaseBarcodeInput');
    if (barcodeInput && window.BarcodeScanner) {
        window.BarcodeScanner.init(
            barcodeInput,
            (item, barcode) => {
                // Success - item found
                handlePurchaseBarcodeScanSuccess(item, barcode);
            },
            (error, barcode) => {
                // Error - item not found
                showNotification(error.message || `Item not found with barcode: ${barcode}`, 'error');
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
        );
    }
    
    // Listen for product updates
    if (window.ProductFlow) {
        window.ProductFlow.onProductUpdate((data) => {
            if (data.type === 'product_invalidated') {
                // Reload items if barcode was invalidated
                if (data.barcode) {
                    loadItems();
                }
            }
        });
    }
}

function openNewPurchaseModal() {
    purchaseItems = [];
    document.getElementById('purchaseItemsList').innerHTML = '';
    document.getElementById('purchaseTotal').textContent = '0.00';
    document.getElementById('newPurchaseForm').reset();
    
    const barcodeInput = document.getElementById('purchaseBarcodeInput');
    openModal('newPurchaseModal', barcodeInput);
}

function handlePurchaseBarcodeInput(e) {
    if (purchaseBarcodeScanInProgress) return;
    
    const barcode = e.target.value.trim();
    const currentTime = Date.now();
    const timeSinceLastChar = currentTime - lastPurchaseBarcodeTime;
    const inputLength = barcode.length;
    
    if (purchaseBarcodeScanTimeout) {
        clearTimeout(purchaseBarcodeScanTimeout);
    }
    
    const isLikelyScanner = timeSinceLastChar < 50 && inputLength > 5;
    const isCompleteBarcode = inputLength >= 8 && inputLength <= 20;
    
    if (isLikelyScanner || isCompleteBarcode) {
        purchaseBarcodeScanTimeout = setTimeout(() => {
            handlePurchaseBarcodeScan(barcode);
        }, 20);
    } else if (inputLength >= 3) {
        purchaseBarcodeScanTimeout = setTimeout(() => {
            if (e.target.value.trim() === barcode) {
                handlePurchaseBarcodeScan(barcode);
            }
        }, 300);
    }
    
    lastPurchaseBarcodeTime = currentTime;
}

async function handlePurchaseBarcodeScan(barcode) {
    if (!barcode || barcode.length < 1 || purchaseBarcodeScanInProgress) return;
    
    purchaseBarcodeScanInProgress = true;
    const barcodeInput = document.getElementById('purchaseBarcodeInput');
    const barcodeLower = barcode.toLowerCase();
    
    let item = purchaseItemsCache.get(barcodeLower);
    
    if (!item) {
        try {
            const apiCall = apiRequest(`/items/barcode/${encodeURIComponent(barcode)}`);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 2000)
            );
            
            item = await Promise.race([apiCall, timeoutPromise]);
            
            if (item && item.sku) {
                purchaseItemsCache.set(item.sku.toLowerCase(), item);
            }
        } catch (error) {
            purchaseBarcodeScanInProgress = false;
            showNotification(error.message || `Item not found with barcode: ${barcode}`, 'error');
            if (barcodeInput) {
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
            return;
        }
    }
    
    if (!item) {
        purchaseBarcodeScanInProgress = false;
        showNotification(`Item not found with barcode: ${barcode}`, 'error');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
        return;
    }
    
    const quantity = parseInt(document.getElementById('purchaseQuantity').value) || 1;
    const unitPriceInput = document.getElementById('purchaseUnitPrice');
    const unitPrice = parseFloat(unitPriceInput.value) || item.cost_price || item.unit_price;
    const existingIndex = purchaseItems.findIndex(pi => pi.item_id === item.id);
    
    if (existingIndex >= 0) {
        purchaseItems[existingIndex].quantity += quantity;
        purchaseItems[existingIndex].unit_price = unitPrice;
        purchaseItems[existingIndex].total_price = purchaseItems[existingIndex].quantity * unitPrice;
    } else {
        purchaseItems.push({
            item_id: item.id,
            item_name: item.name,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: quantity * unitPrice
        });
    }
    
    requestAnimationFrame(() => {
        renderPurchaseItems();
        
        const itemSelect = document.getElementById('purchaseItemSelect');
        if (itemSelect) {
            itemSelect.value = item.id;
        }
        
        if (unitPriceInput && !unitPriceInput.value) {
            unitPriceInput.value = item.cost_price || item.unit_price || '';
        }
        
        if (barcodeInput) {
            barcodeInput.value = '';
            requestAnimationFrame(() => {
                barcodeInput.focus();
                purchaseBarcodeScanInProgress = false;
            });
        } else {
            purchaseBarcodeScanInProgress = false;
        }
    });
}

function closeNewPurchaseModal() {
    closeModal('newPurchaseModal');
    purchaseItems = [];
}

function addPurchaseItem() {
    const itemSelect = document.getElementById('purchaseItemSelect');
    const quantityInput = document.getElementById('purchaseQuantity');
    const unitPriceInput = document.getElementById('purchaseUnitPrice');
    
    const itemId = parseInt(itemSelect.value);
    const quantity = parseInt(quantityInput.value);
    const unitPrice = parseFloat(unitPriceInput.value);
    
    if (!itemId || !quantity || quantity <= 0 || !unitPrice || unitPrice <= 0) {
        showNotification('Please fill all fields with valid values', 'error');
        return;
    }
    
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    const existingIndex = purchaseItems.findIndex(item => item.item_id === itemId);
    if (existingIndex >= 0) {
        purchaseItems[existingIndex].quantity += quantity;
        purchaseItems[existingIndex].unit_price = unitPrice;
        purchaseItems[existingIndex].total_price = purchaseItems[existingIndex].quantity * unitPrice;
    } else {
        purchaseItems.push({
            item_id: itemId,
            item_name: item.name,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: quantity * unitPrice
        });
    }
    
    renderPurchaseItems();
    itemSelect.value = '';
    quantityInput.value = '';
    unitPriceInput.value = '';
}

function removePurchaseItem(index) {
    purchaseItems.splice(index, 1);
    renderPurchaseItems();
}

function renderPurchaseItems() {
    const tbody = document.getElementById('purchaseItemsList');
    const total = purchaseItems.reduce((sum, item) => sum + item.total_price, 0);
    
    if (purchaseItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No items added</td></tr>';
        document.getElementById('purchaseTotal').textContent = '0.00';
        return;
    }
    
    tbody.innerHTML = purchaseItems.map((item, index) => `
        <tr>
            <td>${item.item_name}</td>
            <td class="col-quantity numeric">${item.quantity}</td>
            <td class="col-price numeric">${formatCurrency(item.unit_price)}</td>
            <td class="col-total numeric">${formatCurrency(item.total_price)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removePurchaseItem(${index})">Remove</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('purchaseTotal').textContent = formatCurrency(total);
}

async function handlePurchaseSubmit(e) {
    e.preventDefault();
    
    if (purchaseItems.length === 0) {
        showNotification('Please add at least one item', 'error');
        return;
    }
    
    const supplierId = document.getElementById('purchaseSupplier').value;
    if (!supplierId) {
        showNotification('Please select a supplier', 'error');
        return;
    }
    
    const purchaseData = {
        supplier_id: parseInt(supplierId),
        items: purchaseItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.unit_price
        })),
        notes: document.getElementById('purchaseNotes').value || null
    };
    
    try {
        await apiRequest('/purchases', {
            method: 'POST',
            body: purchaseData
        });
        
        showNotification('Purchase recorded successfully');
        closeNewPurchaseModal();
        
        // Notify product flow of purchase (affects stock)
        if (window.ProductFlow) {
            purchaseData.items.forEach(item => {
                window.ProductFlow.invalidateProduct(item.item_id);
            });
        }
        
        await loadPurchases();
        await loadItems();
    } catch (error) {
        showNotification(error.message || 'Error recording purchase', 'error');
    }
}

async function viewPurchase(purchaseId) {
    try {
        const purchase = await apiRequest(`/purchases/${purchaseId}`);
        const items = Array.isArray(purchase.items) ? purchase.items : JSON.parse(purchase.items || '[]');
        
        const details = `
            <div class="purchase-detail-header">
                <p><strong>Purchase ID:</strong> #${purchase.id}</p>
                <p><strong>Date:</strong> ${formatDate(purchase.purchase_date)}</p>
                <p><strong>Supplier:</strong> ${purchase.supplier_name || '-'}</p>
                <p><strong>Created By:</strong> ${purchase.created_by_name || '-'}</p>
                ${purchase.notes ? `<p><strong>Notes:</strong> ${purchase.notes}</p>` : ''}
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${item.item_name}</td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.unit_price)}</td>
                                <td>${formatCurrency(item.total_price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" class="text-right"><strong>Total:</strong></td>
                            <td><strong>${formatCurrency(purchase.total_amount)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        document.getElementById('purchaseDetails').innerHTML = details;
        openModal('viewPurchaseModal');
    } catch (error) {
        showNotification(error.message || 'Error loading purchase details', 'error');
    }
}

function closeViewPurchaseModal() {
    closeModal('viewPurchaseModal');
}

function openSupplierModal() {
    document.getElementById('supplierForm').reset();
    const firstInput = document.getElementById('supplierName');
    openModal('supplierModal', firstInput);
}

function closeSupplierModal() {
    closeModal('supplierModal');
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    
    const supplierData = {
        name: document.getElementById('supplierName').value,
        contact_person: document.getElementById('supplierContact').value || null,
        email: document.getElementById('supplierEmail').value || null,
        phone: document.getElementById('supplierPhone').value || null,
        address: document.getElementById('supplierAddress').value || null
    };
    
    try {
        await apiRequest('/suppliers', {
            method: 'POST',
            body: supplierData
        });
        
        showNotification('Supplier added successfully');
        closeSupplierModal();
        await loadSuppliers();
    } catch (error) {
        showNotification(error.message || 'Error adding supplier', 'error');
    }
}

