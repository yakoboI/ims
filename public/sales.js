let allItems = [];
let saleItems = [];
let barcodeScanTimeout = null;
let lastBarcodeTime = 0;
let barcodeScanInProgress = false;
let itemsCache = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    await loadSales();
    setupEventListeners();
});

async function loadItems() {
    try {
        allItems = await apiRequest('/items');
        
        // Update items cache
        itemsCache.clear();
        allItems.forEach(item => {
            if (item.sku) {
                itemsCache.set(item.sku.toLowerCase(), item);
                
                // Also update barcode scanner cache
                if (window.BarcodeScanner) {
                    window.BarcodeScanner.barcodeCache.set(item.sku.toLowerCase(), {
                        item: item,
                        timestamp: Date.now()
                    });
                }
            }
        });
        
        const select = document.getElementById('saleItemSelect');
        if (select) {
            select.innerHTML = '<option value="">Select Item</option>' + 
                allItems.map(item => 
                    `<option value="${item.id}" data-price="${item.unit_price}" data-stock="${item.stock_quantity}">
                        ${item.name} (Stock: ${item.stock_quantity} ${item.unit || 'pcs'})
                    </option>`
                ).join('');
        }
    } catch (error) {
        if (window.ErrorLogger) {
            window.ErrorLogger.log(error, { type: 'load_items_error', page: 'sales' });
        }
    }
}

async function loadSales() {
    const tbody = document.getElementById('salesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 6);
    }
    if (tbody) tbody.innerHTML = '';
    
    try {
        const sales = await apiRequest('/sales');
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderSalesTable(sales);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading sales', 'error');
        renderSalesTable([]);
    }
}

function renderSalesTable(sales) {
    const tbody = document.getElementById('salesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (sales.length === 0) {
        tbody.innerHTML = '';
        showEmptyState(tableContainer, EmptyStates.sales);
        return;
    }

    hideEmptyState(tableContainer);
    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td data-label="Sale ID">#${sale.id}</td>
            <td data-label="Date">${formatDate(sale.sale_date)}</td>
            <td data-label="Customer">${sale.customer_name || 'Walk-in'}</td>
            <td data-label="Total Amount" class="col-amount numeric"><strong>${formatCurrency(sale.total_amount)}</strong></td>
            <td data-label="Created By">${sale.created_by_name || '-'}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="viewSale(${sale.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('newSaleForm').addEventListener('submit', handleSaleSubmit);
    
    // Use unified barcode scanner
    const barcodeInput = document.getElementById('saleBarcodeInput');
    if (barcodeInput && window.BarcodeScanner) {
        window.BarcodeScanner.init(
            barcodeInput,
            (item, barcode) => {
                // Success - item found
                handleBarcodeScanSuccess(item, barcode);
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

function openNewSaleModal() {
    saleItems = [];
    document.getElementById('saleItemsList').innerHTML = '';
    document.getElementById('saleTotal').textContent = '0.00';
    document.getElementById('newSaleForm').reset();
    
    const barcodeInput = document.getElementById('saleBarcodeInput');
    openModal('newSaleModal', barcodeInput);
}

function handleBarcodeInput(e) {
    if (barcodeScanInProgress) return;
    
    const barcode = e.target.value.trim();
    const currentTime = Date.now();
    const timeSinceLastChar = currentTime - lastBarcodeTime;
    const inputLength = barcode.length;
    
    if (barcodeScanTimeout) {
        clearTimeout(barcodeScanTimeout);
    }
    
    const isLikelyScanner = timeSinceLastChar < 50 && inputLength > 5;
    const isCompleteBarcode = inputLength >= 8 && inputLength <= 20;
    
    if (isLikelyScanner || isCompleteBarcode) {
        barcodeScanTimeout = setTimeout(() => {
            handleBarcodeScan(barcode);
        }, 20);
    } else if (inputLength >= 3) {
        barcodeScanTimeout = setTimeout(() => {
            if (e.target.value.trim() === barcode) {
                handleBarcodeScan(barcode);
            }
        }, 300);
    }
    
    lastBarcodeTime = currentTime;
}

async function handleBarcodeScan(barcode) {
    if (!barcode || barcode.length < 1 || barcodeScanInProgress) return;
    
    barcodeScanInProgress = true;
    const barcodeInput = document.getElementById('saleBarcodeInput');
    
    try {
        // Use unified barcode scanner
        const item = await window.BarcodeScanner.scanBarcode(
            barcode,
            (item, scannedBarcode) => {
                // Success callback - item found
                handleBarcodeScanSuccess(item, scannedBarcode);
            },
            (error, scannedBarcode) => {
                // Error callback
                barcodeScanInProgress = false;
                showNotification(error.message || `Item not found with barcode: ${scannedBarcode}`, 'error');
                if (barcodeInput) {
                    barcodeInput.value = '';
                    setTimeout(() => barcodeInput.focus(), 50);
                }
            }
        );
    } catch (error) {
        barcodeScanInProgress = false;
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
    }
}

function handleBarcodeScanSuccess(item, barcode) {
    const barcodeInput = document.getElementById('saleBarcodeInput');
    barcodeScanInProgress = false;
    
    if (!item) {
        showNotification(`Item not found with barcode: ${barcode}`, 'error');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
        return;
    }
    
    // Update items cache
    if (item.sku) {
        itemsCache.set(item.sku.toLowerCase(), item);
    }
    
    if (item.stock_quantity <= 0) {
        showNotification(`${item.name} is out of stock`, 'error');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
        return;
    }
    
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 1;
    const existingIndex = saleItems.findIndex(si => si.item_id === item.id);
    
    if (existingIndex >= 0) {
        const newQty = saleItems[existingIndex].quantity + quantity;
        if (newQty > item.stock_quantity) {
            barcodeScanInProgress = false;
            showNotification(`Insufficient stock. Available: ${item.stock_quantity}`, 'error');
            if (barcodeInput) {
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
            return;
        }
        saleItems[existingIndex].quantity = newQty;
        saleItems[existingIndex].total_price = newQty * item.unit_price;
    } else {
        if (quantity > item.stock_quantity) {
            barcodeScanInProgress = false;
            showNotification(`Insufficient stock. Available: ${item.stock_quantity}`, 'error');
            if (barcodeInput) {
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
            return;
        }
        
        saleItems.push({
            item_id: item.id,
            item_name: item.name,
            quantity: quantity,
            unit_price: item.unit_price,
            total_price: quantity * item.unit_price
        });
    }
    
    requestAnimationFrame(() => {
        renderSaleItems();
        const itemSelect = document.getElementById('saleItemSelect');
        if (itemSelect) {
            itemSelect.value = item.id;
        }
        if (barcodeInput) {
            barcodeInput.value = '';
            requestAnimationFrame(() => {
                barcodeInput.focus();
                barcodeScanInProgress = false;
            });
        } else {
            barcodeScanInProgress = false;
        }
    });
}

// Make function globally available
window.handleBarcodeScanSuccess = handleBarcodeScanSuccess;

function closeNewSaleModal() {
    closeModal('newSaleModal');
    saleItems = [];
}

function addSaleItem() {
    const itemSelect = document.getElementById('saleItemSelect');
    const quantityInput = document.getElementById('saleQuantity');
    
    const itemId = parseInt(itemSelect.value);
    const quantity = parseInt(quantityInput.value);
    
    if (!itemId || !quantity || quantity <= 0) {
        showNotification('Please select an item and enter a valid quantity', 'error');
        return;
    }
    
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    const unitPrice = parseFloat(selectedOption.dataset.price);
    const stock = parseInt(selectedOption.dataset.stock);
    
    if (quantity > stock) {
        showNotification(`Insufficient stock. Available: ${stock}`, 'error');
        return;
    }
    
    const existingIndex = saleItems.findIndex(item => item.item_id === itemId);
    if (existingIndex >= 0) {
        const newQty = saleItems[existingIndex].quantity + quantity;
        if (newQty > stock) {
            showNotification(`Insufficient stock. Available: ${stock}`, 'error');
            return;
        }
        saleItems[existingIndex].quantity = newQty;
        saleItems[existingIndex].total_price = newQty * unitPrice;
    } else {
        const item = allItems.find(i => i.id === itemId);
        saleItems.push({
            item_id: itemId,
            item_name: item.name,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: quantity * unitPrice
        });
    }
    
    renderSaleItems();
    itemSelect.value = '';
    quantityInput.value = '';
}

function removeSaleItem(index) {
    saleItems.splice(index, 1);
    renderSaleItems();
}

function renderSaleItems() {
    const tbody = document.getElementById('saleItemsList');
    const total = saleItems.reduce((sum, item) => sum + item.total_price, 0);
    
    if (saleItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No items added</td></tr>';
        document.getElementById('saleTotal').textContent = '0.00';
        return;
    }
    
    tbody.innerHTML = saleItems.map((item, index) => `
        <tr>
            <td>${item.item_name}</td>
            <td class="col-quantity numeric">${item.quantity}</td>
            <td class="col-price numeric">${formatCurrency(item.unit_price)}</td>
            <td class="col-total numeric">${formatCurrency(item.total_price)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeSaleItem(${index})">Remove</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('saleTotal').textContent = formatCurrency(total);
}

async function handleSaleSubmit(e) {
    e.preventDefault();
    
    if (saleItems.length === 0) {
        showNotification('Please add at least one item', 'error');
        return;
    }
    
    const saleData = {
        items: saleItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.unit_price
        })),
        customer_name: document.getElementById('customerName').value || null,
        notes: document.getElementById('saleNotes').value || null
    };
    
    try {
        const response = await apiRequest('/sales', {
            method: 'POST',
            body: saleData
        });
        
        showNotification('Sale recorded successfully');
        closeNewSaleModal();
        
        // Notify product flow of sale (affects stock)
        if (window.ProductFlow) {
            saleData.items.forEach(item => {
                window.ProductFlow.invalidateProduct(item.item_id);
            });
        }
        
        await loadSales();
        
        if (confirm('Sale completed successfully! Would you like to print the receipt?')) {
            printReceipt(response.id);
        }
    } catch (error) {
        showNotification(error.message || 'Error recording sale', 'error');
    }
}

async function viewSale(saleId) {
    try {
        const sale = await apiRequest(`/sales/${saleId}`);
        const items = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || '[]');
        
        const details = `
            <div class="sale-detail-header">
                <div class="sale-detail-title-row">
                    <h3>Sale Details</h3>
                    <button class="btn btn-primary" onclick="printReceipt(${sale.id})">🖨️ Print Receipt</button>
                </div>
                <p><strong>Sale ID:</strong> #${sale.id}</p>
                <p><strong>Date:</strong> ${formatDate(sale.sale_date)}</p>
                <p><strong>Customer:</strong> ${sale.customer_name || 'Walk-in'}</p>
                <p><strong>Created By:</strong> ${sale.created_by_name || '-'}</p>
                ${sale.notes ? `<p><strong>Notes:</strong> ${sale.notes}</p>` : ''}
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
                        ${items.map((item, index) => {
                            const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                            const barcodeId = `viewItemBarcode${sale.id}-${index}`;
                            return `
                            <tr>
                                <td>
                                    ${item.item_name}
                                    <div style="margin-top: 5px;">
                                        <canvas id="${barcodeId}" data-barcode="${barcodeValue}" style="max-width: 120px; height: 35px;"></canvas>
                                    </div>
                                </td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.unit_price)}</td>
                                <td>${formatCurrency(item.total_price)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" class="text-right"><strong>Total:</strong></td>
                            <td class="col-total numeric"><strong>${formatCurrency(sale.total_amount)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        document.getElementById('saleDetails').innerHTML = details;
        openModal('viewSaleModal');
        
        // Render barcodes in the modal after it opens
        setTimeout(() => {
            if (window.JsBarcode) {
                items.forEach((item, index) => {
                    const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                    const barcodeId = `viewItemBarcode${sale.id}-${index}`;
                    const canvas = document.getElementById(barcodeId);
                    if (canvas) {
                        try {
                            JsBarcode(canvas, barcodeValue, {
                                format: "CODE128",
                                width: 1.5,
                                height: 30,
                                displayValue: true,
                                fontSize: 10,
                                margin: 2
                            });
                        } catch (error) {
                            console.error('Error rendering barcode:', error);
                        }
                    }
                });
            }
        }, 300);
    } catch (error) {
        showNotification(error.message || 'Error loading sale details', 'error');
    }
}

async function printReceipt(saleId) {
    try {
        const sale = await apiRequest(`/sales/${saleId}`);
        const items = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || '[]');
        const currentDate = new Date();
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt #${sale.id}</title>
                <style>
                    @media print {
                        @page {
                            size: A4;
                            margin: 1cm;
                        }
                        body {
                            margin: 0;
                            padding: 0;
                        }
                        .no-print {
                            display: none;
                        }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        color: #000;
                    }
                    .receipt-header {
                        text-align: center;
                        border-bottom: 3px solid #000;
                        padding-bottom: 20px;
                        margin-bottom: 25px;
                    }
                    .receipt-header h1 {
                        margin: 0 0 10px 0;
                        font-size: 26px;
                        font-weight: bold;
                        letter-spacing: 1px;
                    }
                    .receipt-header p {
                        margin: 8px 0;
                        font-size: 16px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .receipt-info {
                        margin-bottom: 20px;
                        line-height: 1.8;
                    }
                    .receipt-info p {
                        margin: 6px 0;
                        font-size: 14px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .receipt-info p strong {
                        min-width: 100px;
                        font-weight: 600;
                    }
                    .receipt-info p span {
                        text-align: right;
                        flex: 1;
                    }
                    .receipt-items {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    .receipt-items th {
                        background: #f0f0f0;
                        padding: 12px 8px;
                        text-align: left;
                        border-bottom: 2px solid #000;
                        font-size: 14px;
                        font-weight: bold;
                    }
                    .receipt-items td {
                        padding: 10px 8px;
                        border-bottom: 1px solid #ddd;
                        font-size: 14px;
                        vertical-align: top;
                    }
                    .item-barcode {
                        margin-top: 5px;
                        text-align: center;
                    }
                    .item-barcode canvas {
                        max-width: 120px;
                        height: 35px;
                    }
                    .receipt-items tfoot td {
                        border-top: 2px solid #000;
                        font-weight: bold;
                        padding: 12px 8px;
                        font-size: 16px;
                    }
                    .receipt-items {
                        table-layout: fixed;
                    }
                    .receipt-items th.col-item {
                        width: 45%;
                    }
                    .receipt-items th.col-qty {
                        width: 15%;
                    }
                    .receipt-items th.col-price {
                        width: 20%;
                    }
                    .receipt-items th.col-total {
                        width: 20%;
                    }
                    .receipt-items .col-qty,
                    .receipt-items .col-price,
                    .receipt-items .col-total {
                        text-align: right;
                        font-variant-numeric: tabular-nums;
                    }
                    .receipt-items .col-item {
                        text-align: left;
                    }
                    .receipt-items tbody tr:last-child td {
                        border-bottom: 2px solid #ddd;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .text-left {
                        text-align: left;
                    }
                    .receipt-footer {
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 2px solid #ddd;
                        text-align: center;
                        font-size: 13px;
                        color: #666;
                        line-height: 1.8;
                    }
                    .receipt-footer p {
                        margin: 8px 0;
                    }
                    .sale-notes {
                        margin-top: 15px;
                        padding: 10px;
                        background: #f9f9f9;
                        border-left: 3px solid #2563eb;
                        font-size: 13px;
                        line-height: 1.6;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .no-print {
                        text-align: center;
                        margin-top: 20px;
                    }
                    .no-print button {
                        padding: 10px 20px;
                        font-size: 16px;
                        background: #2563eb;
                        color: white;
                        border: none;
                        border-radius: 0;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="receipt-header">
                    <h1>INVENTORY MANAGEMENT SYSTEM</h1>
                    <p>Sales Receipt</p>
                    <div style="margin-top: 15px;">
                        <canvas id="receiptBarcode" style="max-width: 200px; height: 50px;"></canvas>
                    </div>
                </div>
                
                <div class="receipt-info">
                    <p><strong>Receipt #:</strong> <span>#${sale.id}</span></p>
                    <p><strong>Date:</strong> <span>${formatDate(sale.sale_date)}</span></p>
                    <p><strong>Customer:</strong> <span>${sale.customer_name || 'Walk-in Customer'}</span></p>
                    <p><strong>Cashier:</strong> <span>${sale.created_by_name || 'System'}</span></p>
                </div>
                
                <table class="receipt-items">
                    <thead>
                        <tr>
                            <th class="col-item">Item</th>
                            <th class="col-qty text-right">Qty</th>
                            <th class="col-price text-right">Price</th>
                            <th class="col-total text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => {
                            const calculatedTotal = (item.quantity || 0) * (item.unit_price || 0);
                            const displayTotal = item.total_price || calculatedTotal;
                            const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                            
                            return `
                            <tr>
                                <td class="col-item">
                                    ${item.item_name || '-'}
                                    <div class="item-barcode">
                                        <canvas id="itemBarcode${index}" data-barcode="${barcodeValue}"></canvas>
                                    </div>
                                </td>
                                <td class="col-qty text-right">${item.quantity || 0}</td>
                                <td class="col-price text-right">${formatCurrency(item.unit_price || 0)}</td>
                                <td class="col-total text-right">${formatCurrency(displayTotal)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td class="col-item text-right"><strong>GRAND TOTAL:</strong></td>
                            <td class="col-qty text-right"></td>
                            <td class="col-price text-right"></td>
                            <td class="col-total text-right"><strong>${formatCurrency(sale.total_amount || 0)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
                
                ${sale.notes ? `<div class="sale-notes"><strong>Notes:</strong> ${sale.notes}</div>` : ''}
                
                <div class="receipt-footer">
                    <p>Thank you for your business!</p>
                    <p>Generated on ${currentDate.toLocaleString()}</p>
                </div>
                
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Print Receipt</button>
                    <button onclick="window.close()" class="btn receipt-close-btn">Close</button>
                </div>
                
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <script>
                    window.onload = function() {
                        // Generate barcodes for receipt and items
                        if (window.JsBarcode) {
                            // Receipt barcode
                            const receiptBarcode = document.getElementById('receiptBarcode');
                            if (receiptBarcode) {
                                JsBarcode(receiptBarcode, 'RECEIPT-${sale.id}', {
                                    format: "CODE128",
                                    width: 2,
                                    height: 40,
                                    displayValue: true,
                                    fontSize: 12,
                                    margin: 5
                                });
                            }
                            
                            // Item barcodes
                            ${items.map((item, index) => {
                                const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                                return `
                                const itemBarcode${index} = document.getElementById('itemBarcode${index}');
                                if (itemBarcode${index}) {
                                    JsBarcode(itemBarcode${index}, '${barcodeValue}', {
                                        format: "CODE128",
                                        width: 1.5,
                                        height: 30,
                                        displayValue: true,
                                        fontSize: 10,
                                        margin: 2
                                    });
                                }`;
                            }).join('')}
                        }
                        
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    } catch (error) {
        showNotification(error.message || 'Error generating receipt', 'error');
    }
}

function closeViewSaleModal() {
    closeModal('viewSaleModal');
}

