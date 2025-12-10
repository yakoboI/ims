let allItems = [];
let suppliers = [];
let purchaseItems = [];
let purchaseItemsCache = new Map();

// Orders management
let allOrders = [];
let filteredOrders = [];
let currentPage = 1;
let itemsPerPage = 25;
let currentSort = { column: 'created_on', direction: 'desc' };
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    await loadSuppliers();
    await loadPurchases();
    setupEventListeners();
    setupOrdersControls();
});

async function loadItems() {
    try {
        allItems = await apiRequest('/items');
        
        // Update purchase items cache
        purchaseItemsCache.clear();
        allItems.forEach(item => {
            if (item.sku) {
                purchaseItemsCache.set(item.sku.toLowerCase(), item);
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
        showTableSkeleton(tableContainer, 5, 7);
    }
    if (tbody) tbody.innerHTML = '';
    
    try {
        const purchases = await apiRequest('/purchases');
        if (tableContainer) hideTableSkeleton(tableContainer);
        
        // Transform purchases to orders format
        allOrders = purchases.map((purchase, index) => ({
            id: purchase.id,
            order_no: `ORDER-${purchase.id}`,
            supplier_name: purchase.supplier_name || '-',
            created_on: purchase.purchase_date,
            delivery_date: purchase.delivery_date || purchase.purchase_date,
            status: purchase.status || 'received', // Default to 'received'
            total_amount: purchase.total_amount,
            created_by_name: purchase.created_by_name || '-',
            supplier_id: purchase.supplier_id,
            notes: purchase.notes,
            items: purchase.items
        }));
        
        applyFiltersAndRender();
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading purchase orders', 'error');
        allOrders = [];
        filteredOrders = [];
        renderOrdersTable();
    }
}

function applyFiltersAndRender() {
    // Apply search filter
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredOrders = allOrders.filter(order => 
            order.order_no.toLowerCase().includes(query) ||
            order.supplier_name.toLowerCase().includes(query) ||
            order.status.toLowerCase().includes(query)
        );
    } else {
        filteredOrders = [...allOrders];
    }
    
    // Apply sorting
    filteredOrders.sort((a, b) => {
        let aVal, bVal;
        
        if (currentSort.column === 'index') {
            // Index sorting is handled by pagination, use order_no instead
            aVal = a.order_no;
            bVal = b.order_no;
        } else {
            aVal = a[currentSort.column];
            bVal = b[currentSort.column];
        }
        
        if (currentSort.column === 'created_on' || currentSort.column === 'delivery_date') {
            aVal = new Date(aVal || 0);
            bVal = new Date(bVal || 0);
        } else if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    renderOrdersTable();
}

function renderOrdersTable() {
    const tbody = document.getElementById('purchasesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No orders found</td></tr>';
        updatePagination(0);
        return;
    }

    // Paginate
    const paginated = paginateArray(filteredOrders, currentPage, itemsPerPage);
    
    hideEmptyState(tableContainer);
    tbody.innerHTML = paginated.items.map((order, index) => {
        const rowIndex = (currentPage - 1) * itemsPerPage + index + 1;
        // Normalize status: handle spaces, underscores, and ensure proper format
        let statusClass = order.status.toLowerCase().trim();
        statusClass = statusClass.replace(/[\s_]+/g, '-'); // Convert spaces and underscores to hyphens
        
        // Map common status variations to standard format
        const statusMap = {
            'partial': 'partial-delivered',
            'partialdelivered': 'partial-delivered',
            'partially-delivered': 'partial-delivered',
            'completed': 'delivered',
            'fulfilled': 'delivered',
            'pending': 'received',
            'new': 'received'
        };
        
        if (statusMap[statusClass]) {
            statusClass = statusMap[statusClass];
        }
        
        // Format status label for display
        const statusLabel = statusClass
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        return `
        <tr class="status-${statusClass}">
            <td data-label="#">${rowIndex}</td>
            <td data-label="Order No">${order.order_no}</td>
            <td data-label="Supplier Name">${order.supplier_name}</td>
            <td data-label="Created On">${formatDate(order.created_on)}</td>
            <td data-label="Delivery Date">${formatDate(order.delivery_date)}</td>
            <td data-label="Status">
                <span class="order-status ${statusClass}">${statusLabel}</span>
            </td>
            <td data-label="View">
                <div class="view-actions">
                    <button class="btn btn-sm btn-view" onclick="viewPurchase(${order.id})" aria-label="View order ${order.order_no}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-order" onclick="downloadOrder(${order.id})" aria-label="Download order ${order.order_no}">
                        <i class="fas fa-download"></i> Order
                    </button>
                    <button class="btn btn-sm btn-pi" onclick="downloadPI(${order.id})" aria-label="Download proforma invoice for ${order.order_no}">
                        <i class="fas fa-download"></i> P.I.
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
    
    updatePagination(paginated.totalItems);
}

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, totalItems);
    
    const entriesInfo = document.getElementById('entriesInfo');
    if (entriesInfo) {
        entriesInfo.textContent = `Showing ${startIndex} to ${endIndex} of ${totalItems} entries`;
    }
    
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer && window.createPagination) {
        createPagination(paginationContainer, currentPage, totalPages, (page) => {
            currentPage = page;
            renderOrdersTable();
        });
    }
}

function setupOrdersControls() {
    // Entries per page
    const entriesSelect = document.getElementById('entriesPerPage');
    if (entriesSelect) {
        entriesSelect.value = itemsPerPage;
        entriesSelect.addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderOrdersTable();
        });
    }
    
    // Search
    const searchInput = document.getElementById('searchOrders');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value;
                currentPage = 1;
                applyFiltersAndRender();
            }, 300);
        });
    }
    
    // Sortable columns
    const sortableHeaders = document.querySelectorAll('.data-table th.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            // Update UI
            sortableHeaders.forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            header.classList.add(`sort-${currentSort.direction}`);
            
            applyFiltersAndRender();
        });
    });
    
    // Initialize sort indicator
    const initialSortHeader = document.querySelector(`th[data-sort="${currentSort.column}"]`);
    if (initialSortHeader) {
        initialSortHeader.classList.add(`sort-${currentSort.direction}`);
    }
}

function setupEventListeners() {
    document.getElementById('newPurchaseForm').addEventListener('submit', handlePurchaseSubmit);
    document.getElementById('supplierForm').addEventListener('submit', handleSupplierSubmit);
    
    // Listen for product updates
    if (window.ProductFlow) {
        window.ProductFlow.onProductUpdate((data) => {
            if (data.type === 'product_invalidated') {
                // Reload items if product was invalidated
                loadItems();
            }
        });
    }
}

function openNewPurchaseModal() {
    purchaseItems = [];
    document.getElementById('purchaseItemsList').innerHTML = '';
    document.getElementById('purchaseTotal').textContent = '0.00';
    document.getElementById('newPurchaseForm').reset();
    
    const itemSelect = document.getElementById('purchaseItemSelect');
    openModal('newPurchaseModal', itemSelect);
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
    
    const deliveryDateInput = document.getElementById('purchaseDeliveryDate');
    const deliveryDate = deliveryDateInput ? deliveryDateInput.value : null;
    
    const purchaseData = {
        supplier_id: parseInt(supplierId),
        items: purchaseItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.unit_price
        })),
        notes: document.getElementById('purchaseNotes').value || null,
        delivery_date: deliveryDate,
        status: 'received' // Default status for new orders
    };
    
    try {
        await apiRequest('/purchases', {
            method: 'POST',
            body: purchaseData
        });
        
        showNotification('Purchase order created successfully');
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
        showNotification(error.message || 'Error creating purchase order', 'error');
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

function downloadOrder(orderId) {
    viewPurchase(orderId);
    // In a real implementation, this would generate and download a PDF
    showNotification('Order download feature coming soon', 'info');
}

function downloadPI(orderId) {
    // Proforma Invoice download
    viewPurchase(orderId);
    // In a real implementation, this would generate and download a Proforma Invoice PDF
    showNotification('Proforma Invoice download feature coming soon', 'info');
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

