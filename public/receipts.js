let receipts = [];
let returnedReceipts = [];
let currentTab = 'all';
let returnImageFile = null;
let returnImagePath = null;

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

// Local formatCurrency function - completely self-contained to avoid recursion
function formatCurrency(amount) {
    // Handle null/undefined/NaN
    if (amount == null || amount === undefined) {
        return 'Tshs 0.00';
    }
    // Parse and validate
    const num = parseFloat(amount);
    if (isNaN(num) || !isFinite(num)) {
        return 'Tshs 0.00';
    }
    // Format directly - no function calls that could cause recursion
    return 'Tshs ' + num.toFixed(2);
}

function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    if (tab === 'all') {
        document.getElementById('tab-all').classList.add('active');
        document.getElementById('tab-all').setAttribute('aria-selected', 'true');
        document.getElementById('allReceiptsSection').style.display = 'block';
        document.getElementById('returnedReceiptsSection').style.display = 'none';
        loadReceipts();
    } else {
        document.getElementById('tab-returns').classList.add('active');
        document.getElementById('tab-returns').setAttribute('aria-selected', 'true');
        document.getElementById('allReceiptsSection').style.display = 'none';
        document.getElementById('returnedReceiptsSection').style.display = 'block';
        loadReturnedReceipts();
    }
}

async function loadReceipts() {
    const tbody = document.getElementById('receiptsTableBody');
    const tableContainer = document.querySelector('#allReceiptsSection .table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 7);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    
    try {
        // Get shop filter - apiRequest handles shop_id automatically for superadmin
        const sales = await apiRequest('/sales');
        
        // Filter out returns (is_return = 1)
        const salesArray = Array.isArray(sales) ? sales : [];
        receipts = salesArray.filter(sale => !sale.is_return || sale.is_return === 0);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderReceiptsTable(receipts);
    } catch (error) {
        console.error('Error loading receipts:', error);
        receipts = [];
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading receipts: ' + (error.message || 'Unknown error'), 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading receipts</td></tr>';
        }
    }
}

async function loadReturnedReceipts() {
    const tbody = document.getElementById('returnedReceiptsTableBody');
    const tableContainer = document.querySelector('#returnedReceiptsSection .table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 8);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
    
    try {
        const response = await apiRequest('/sales/returns');
        returnedReceipts = Array.isArray(response) ? response : [];
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderReturnedReceiptsTable(returnedReceipts);
    } catch (error) {
        returnedReceipts = [];
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading returned receipts', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Error loading returned receipts</td></tr>';
        }
    }
}

function renderReceiptsTable(receiptsList) {
    const tbody = document.getElementById('receiptsTableBody');
    const tableContainer = document.querySelector('#allReceiptsSection .table-container');
    
    if (!tbody) return;
    
    if (!Array.isArray(receiptsList)) {
        receiptsList = [];
    }
    
    if (receiptsList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.receipts || {
            icon: '<i class="fas fa-file-invoice fa-icon-primary" style="font-size: 4rem;"></i>',
            title: 'No Receipts',
            message: 'No receipts have been generated yet.',
            className: 'empty-state-small'
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = receiptsList.map(receipt => `
        <tr>
            <td data-label="Invoice #"><strong>${escapeHtml(receipt.invoice_number || `#${receipt.id}`)}</strong></td>
            <td data-label="Date">${formatDate(receipt.sale_date)}</td>
            <td data-label="Customer">${escapeHtml(receipt.customer_name || 'Walk-in')}</td>
            <td data-label="Total Amount"><strong>${formatCurrency(receipt.total_amount)}</strong></td>
            <td data-label="Payment Method">${escapeHtml(receipt.payment_method || 'Cash')}</td>
            <td data-label="Created By">${escapeHtml(receipt.created_by_name || '-')}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="viewReceipt(${receipt.id})" aria-label="View receipt ${receipt.id}">View</button>
                <button class="btn btn-sm btn-warning" onclick="openReturnReceiptModal(${receipt.id})" aria-label="Return receipt ${receipt.id}">Return</button>
            </td>
        </tr>
    `).join('');
}

function renderReturnedReceiptsTable(returnsList) {
    const tbody = document.getElementById('returnedReceiptsTableBody');
    const tableContainer = document.querySelector('#returnedReceiptsSection .table-container');
    
    if (!tbody) return;
    
    if (!Array.isArray(returnsList)) {
        returnsList = [];
    }
    
    if (returnsList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.returns || {
            icon: '<i class="fas fa-undo fa-icon-warning" style="font-size: 4rem;"></i>',
            title: 'No Returns',
            message: 'No receipts have been returned yet.',
            className: 'empty-state-small'
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = returnsList.map(returnRecord => {
        const statusClass = returnRecord.status === 'completed' ? 'badge-success' : 
                           returnRecord.status === 'pending' ? 'badge-warning' : 
                           returnRecord.status === 'rejected' ? 'badge-danger' : 'badge-info';
        const statusText = returnRecord.status.charAt(0).toUpperCase() + returnRecord.status.slice(1);
        
        return `
            <tr>
                <td data-label="Invoice #"><strong>${escapeHtml(returnRecord.invoice_number || `#${returnRecord.sale_id}`)}</strong></td>
                <td data-label="Return Date">${formatDate(returnRecord.return_date)}</td>
                <td data-label="Customer">${escapeHtml(returnRecord.customer_name || 'Walk-in')}</td>
                <td data-label="Return Amount"><strong style="color: var(--danger-color);">-${formatCurrency(Math.abs(returnRecord.total_amount))}</strong></td>
                <td data-label="Reason">${escapeHtml(returnRecord.reason || '-')}</td>
                <td data-label="Image">
                    ${returnRecord.image_path ? 
                        `<button class="btn btn-sm btn-info" onclick="viewReturnImage('${escapeHtml(returnRecord.image_path)}')" aria-label="View return image"><i class="fas fa-image"></i> View</button>` : 
                        '<span style="color: var(--text-secondary);">-</span>'
                    }
                </td>
                <td data-label="Status">
                    <span class="badge ${statusClass}">${statusText}</span>
                </td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewReturnDetails(${returnRecord.id})" aria-label="View return details ${returnRecord.id}">Details</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewReceipt(saleId) {
    try {
        const sale = await apiRequest(`/sales/${saleId}`);
        // Open in new window or show modal with receipt details
        showNotification(`Viewing receipt #${sale.invoice_number || saleId}`, 'info');
        // You can implement a receipt viewer modal here
    } catch (error) {
        showNotification('Error loading receipt details', 'error');
    }
}

async function openReturnReceiptModal(saleId) {
    const modal = document.getElementById('returnReceiptModal');
    const form = document.getElementById('returnReceiptForm');
    const title = document.getElementById('returnReceiptModalTitle');
    const saleIdEl = document.getElementById('returnSaleId');
    const originalSaleInfo = document.getElementById('originalSaleInfo');
    const returnItemsList = document.getElementById('returnItemsList');
    
    if (!modal || !form || !title || !saleIdEl) {
        console.error('Required modal elements not found');
        return;
    }
    
    try {
        // Load sale details
        const sale = await apiRequest(`/sales/${saleId}`);
        
        if (sale.is_return || sale.is_return === 1) {
            showNotification('This is already a return receipt', 'error');
            return;
        }
        
        saleIdEl.value = saleId;
        
        // Display original sale information
        originalSaleInfo.innerHTML = `
            <div><strong>Invoice:</strong> ${escapeHtml(sale.invoice_number || `#${sale.id}`)}</div>
            <div><strong>Date:</strong> ${formatDate(sale.sale_date)}</div>
            <div><strong>Customer:</strong> ${escapeHtml(sale.customer_name || 'Walk-in')}</div>
            <div><strong>Total Amount:</strong> ${formatCurrency(sale.total_amount)}</div>
        `;
        
        // Display items for return selection in a structured table
        if (sale.items && sale.items.length > 0) {
            const itemsHTML = sale.items.map(item => {
                const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
                return `
                    <tr>
                        <td style="width: 40px; text-align: center;">
                            <input type="checkbox" id="returnItem_${item.item_id}" 
                                   data-item-id="${item.item_id}" 
                                   data-item-name="${escapeHtml(item.item_name)}" 
                                   data-unit-price="${item.unit_price || 0}" 
                                   data-item-quantity="${item.quantity || 0}" 
                                   onchange="updateReturnItems()"
                                   style="cursor: pointer;">
                        </td>
                        <td><strong>${escapeHtml(item.item_name || 'N/A')}</strong></td>
                        <td class="text-right" style="width: 100px;">
                            <div id="returnQty_${item.item_id}" style="display: none;">
                                <input type="number" 
                                       min="1" 
                                       max="${item.quantity || 0}" 
                                       value="${item.quantity || 0}" 
                                       class="form-control" 
                                       style="width: 80px; text-align: right; padding: 0.375rem;"
                                       onchange="updateReturnItems()"
                                       aria-label="Return quantity for ${escapeHtml(item.item_name)}">
                            </div>
                            <span id="returnQtyDisplay_${item.item_id}">${item.quantity || 0}</span>
                        </td>
                        <td class="text-right" style="width: 120px;">${formatCurrency(item.unit_price || 0)}</td>
                        <td class="text-right" style="width: 120px;">
                            <strong id="returnItemTotal_${item.item_id}">${formatCurrency(itemTotal)}</strong>
                        </td>
                    </tr>
                `;
            }).join('');
            
            // Calculate total
            const grandTotal = sale.items.reduce((sum, item) => {
                return sum + ((item.quantity || 0) * (item.unit_price || 0));
            }, 0);
            
            returnItemsList.innerHTML = `
                <div style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; margin-bottom: 1rem;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">Select</th>
                                <th>Item Name</th>
                                <th class="text-right" style="width: 100px;">Quantity</th>
                                <th class="text-right" style="width: 120px;">Unit Price</th>
                                <th class="text-right" style="width: 120px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                            <tr style="background: var(--bg-secondary); font-weight: 600;">
                                <td colspan="4" class="text-right"><strong>Original Total:</strong></td>
                                <td class="text-right"><strong>${formatCurrency(grandTotal)}</strong></td>
                            </tr>
                            <tr id="returnTotalRow" style="display: none; background: #fee2e2; font-weight: 600;">
                                <td colspan="4" class="text-right"><strong style="color: var(--danger-color);">Return Total:</strong></td>
                                <td class="text-right"><strong id="returnTotalAmount" style="color: var(--danger-color);">${formatCurrency(0)}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            returnItemsList.innerHTML = '<p style="color: var(--text-secondary); padding: 1rem; text-align: center;">No items found for this sale.</p>';
        }
        
        // Reset form
        form.reset();
        returnImageFile = null;
        returnImagePath = null;
        document.getElementById('returnImagePreview').style.display = 'none';
        
        const firstInput = document.getElementById('returnReason');
        openModal('returnReceiptModal', firstInput);
    } catch (error) {
        showNotification('Error loading sale details', 'error');
    }
}

function updateReturnItems() {
    const checkboxes = document.querySelectorAll('#returnItemsList input[type="checkbox"]');
    let returnTotal = 0;
    let hasSelectedItems = false;
    
    checkboxes.forEach(checkbox => {
        const itemId = checkbox.dataset.itemId;
        const qtyDiv = document.getElementById(`returnQty_${itemId}`);
        const qtyDisplay = document.getElementById(`returnQtyDisplay_${itemId}`);
        const qtyInput = qtyDiv ? qtyDiv.querySelector('input[type="number"]') : null;
        const itemTotalEl = document.getElementById(`returnItemTotal_${itemId}`);
        
        if (checkbox.checked) {
            hasSelectedItems = true;
            // Show quantity input, hide display
            if (qtyDiv) qtyDiv.style.display = 'block';
            if (qtyDisplay) qtyDisplay.style.display = 'none';
            
            // Get quantity and calculate total
            const quantity = qtyInput ? parseInt(qtyInput.value) || 0 : parseInt(checkbox.dataset.itemQuantity || '0');
            const unitPrice = parseFloat(checkbox.dataset.unitPrice || '0');
            const itemTotal = quantity * unitPrice;
            returnTotal += itemTotal;
            
            // Update item total display
            if (itemTotalEl) {
                itemTotalEl.textContent = formatCurrency(itemTotal);
                itemTotalEl.style.color = 'var(--danger-color)';
            }
        } else {
            // Hide quantity input, show display
            if (qtyDiv) qtyDiv.style.display = 'none';
            if (qtyDisplay) qtyDisplay.style.display = 'inline';
            
            // Reset item total to original
            const originalQty = parseInt(checkbox.dataset.itemQuantity || '0');
            const unitPrice = parseFloat(checkbox.dataset.unitPrice || '0');
            const originalTotal = originalQty * unitPrice;
            
            if (itemTotalEl) {
                itemTotalEl.textContent = formatCurrency(originalTotal);
                itemTotalEl.style.color = '';
            }
        }
    });
    
    // Update return total row
    const returnTotalRow = document.getElementById('returnTotalRow');
    const returnTotalAmount = document.getElementById('returnTotalAmount');
    
    if (returnTotalRow && returnTotalAmount) {
        if (hasSelectedItems) {
            returnTotalRow.style.display = '';
            returnTotalAmount.textContent = formatCurrency(returnTotal);
        } else {
            returnTotalRow.style.display = 'none';
            returnTotalAmount.textContent = formatCurrency(0);
        }
    }
}

function closeReturnReceiptModal() {
    closeModal('returnReceiptModal');
    const form = document.getElementById('returnReceiptForm');
    const returnImagePreview = document.getElementById('returnImagePreview');
    
    if (form) form.reset();
    if (returnImagePreview) returnImagePreview.style.display = 'none';
    returnImageFile = null;
    returnImagePath = null;
}

// Handle image upload preview
document.addEventListener('DOMContentLoaded', () => {
    const returnImageInput = document.getElementById('returnImage');
    if (returnImageInput) {
        returnImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    showNotification('Image size must be less than 10MB', 'error');
                    this.value = '';
                    return;
                }
                
                returnImageFile = file;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('returnImagePreview');
                    const previewImg = document.getElementById('returnImagePreviewImg');
                    if (preview && previewImg) {
                        previewImg.src = e.target.result;
                        preview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

function removeReturnImage() {
    const returnImageInput = document.getElementById('returnImage');
    const returnImagePreview = document.getElementById('returnImagePreview');
    
    if (returnImageInput) returnImageInput.value = '';
    if (returnImagePreview) returnImagePreview.style.display = 'none';
    returnImageFile = null;
    returnImagePath = null;
}

async function handleReturnReceiptSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const saleIdEl = document.getElementById('returnSaleId');
    const returnReasonEl = document.getElementById('returnReason');
    const returnInfoEl = document.getElementById('returnInfo');
    
    if (!saleIdEl || !returnReasonEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const saleId = saleIdEl.value;
    const reason = returnReasonEl.value.trim();
    
    if (!reason) {
        showNotification('Return reason is required', 'error');
        return;
    }
    
    // Get selected items
    const selectedItems = [];
    const checkboxes = document.querySelectorAll('#returnItemsList input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
        showNotification('Please select at least one item to return', 'error');
        return;
    }
    
    checkboxes.forEach(checkbox => {
        const itemId = checkbox.dataset.itemId;
        const qtyDiv = document.getElementById(`returnQty_${itemId}`);
        const qtyInput = qtyDiv ? qtyDiv.querySelector('input[type="number"]') : null;
        const quantity = qtyInput ? parseInt(qtyInput.value) || 0 : parseInt(checkbox.dataset.itemQuantity || '0');
        const unitPrice = parseFloat(checkbox.dataset.unitPrice || '0');
        
        // Only add if quantity is valid
        if (quantity > 0 && unitPrice >= 0) {
            selectedItems.push({
                item_id: parseInt(itemId),
                quantity: quantity,
                unit_price: unitPrice,
                total_price: quantity * unitPrice
            });
        }
    });
    
    // Show loading state
    showFormLoading(form);
    
    try {
        // Upload image first if provided
        if (returnImageFile) {
            const formData = new FormData();
            formData.append('image', returnImageFile);
            
            const uploadResponse = await fetch('/api/sales/return/upload-image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });
            
            if (!uploadResponse.ok) {
                throw new Error('Failed to upload image');
            }
            
            const uploadData = await uploadResponse.json();
            returnImagePath = uploadData.image_path;
        }
        
        // Process return
        await apiRequest('/sales/return', {
            method: 'POST',
            body: {
                original_sale_id: saleId,
                items: selectedItems,
                reason: reason,
                return_info: returnInfoEl ? returnInfoEl.value.trim() || null : null,
                image_path: returnImagePath
            }
        });
        
        showNotification('Return processed successfully. Inventory has been updated.', 'success');
        closeReturnReceiptModal();
        
        // Reload data
        if (currentTab === 'all') {
            await loadReceipts();
        } else {
            await loadReturnedReceipts();
        }
    } catch (error) {
        showNotification(error.message || 'Error processing return', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function viewReturnImage(imagePath) {
    if (!imagePath) {
        showNotification('Image path not provided', 'error');
        return;
    }
    
    // Ensure path starts with / if it doesn't already
    const normalizedPath = imagePath.startsWith('/') ? imagePath : '/' + imagePath;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-width: 800px; position: relative;">
            <button class="close" onclick="this.closest('.modal').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.5); color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 20px; line-height: 1;">&times;</button>
            <h2 style="margin-top: 0;">Return Image</h2>
            <div id="imageLoading" style="text-align: center; padding: 2rem;">
                <p>Loading image...</p>
            </div>
            <div id="imageError" style="display: none; text-align: center; padding: 2rem; color: var(--danger-color);">
                <p><strong>Failed to load image</strong></p>
                <p style="font-size: 0.9em; margin-top: 0.5rem;">The image may have been deleted or moved.</p>
            </div>
            <img id="returnImageView" src="${escapeHtml(normalizedPath)}" alt="Return receipt documentation image showing proof of return" style="display: none; max-width: 100%; border-radius: 4px; margin-top: 1rem;" onload="document.getElementById('imageLoading').style.display='none'; this.style.display='block';" onerror="document.getElementById('imageLoading').style.display='none'; document.getElementById('imageError').style.display='block';">
        </div>
    `;
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Close on Escape key
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

async function viewReturnDetails(returnId) {
    const returnRecord = returnedReceipts.find(r => r.id === returnId);
    if (!returnRecord) {
        showNotification('Return record not found', 'error');
        return;
    }
    
    const modal = document.getElementById('viewReturnModal');
    const title = document.getElementById('viewReturnModalTitle');
    const content = document.getElementById('returnDetailsContent');
    
    if (!modal || !title || !content) return;
    
    title.textContent = `Return Details - ${escapeHtml(returnRecord.invoice_number || `#${returnRecord.sale_id}`)}`;
    
    content.innerHTML = `
        <div style="display: grid; gap: 1rem;">
            <div><strong>Invoice Number:</strong> ${escapeHtml(returnRecord.invoice_number || `#${returnRecord.sale_id}`)}</div>
            <div><strong>Return Date:</strong> ${formatDate(returnRecord.return_date)}</div>
            <div><strong>Customer:</strong> ${escapeHtml(returnRecord.customer_name || 'Walk-in')}</div>
            <div><strong>Return Amount:</strong> <span style="color: var(--danger-color);">-${formatCurrency(Math.abs(returnRecord.total_amount))}</span></div>
            <div><strong>Reason:</strong> ${escapeHtml(returnRecord.reason || '-')}</div>
            ${returnRecord.return_info ? `<div><strong>Additional Information:</strong> ${escapeHtml(returnRecord.return_info)}</div>` : ''}
            <div><strong>Status:</strong> <span class="badge badge-${returnRecord.status === 'completed' ? 'success' : returnRecord.status === 'pending' ? 'warning' : 'danger'}">${returnRecord.status.charAt(0).toUpperCase() + returnRecord.status.slice(1)}</span></div>
            <div><strong>Processed By:</strong> ${escapeHtml(returnRecord.processed_by_name || returnRecord.created_by_name || '-')}</div>
            ${returnRecord.image_path ? `
                <div>
                    <strong>Return Image:</strong><br>
                    <div style="position: relative; margin-top: 0.5rem;" id="returnImageContainer-${returnRecord.id}">
                        <img src="${escapeHtml(returnRecord.image_path.startsWith('/') ? returnRecord.image_path : '/' + returnRecord.image_path)}" 
                             alt="Return receipt documentation for ${escapeHtml(returnRecord.invoice_number || 'invoice')} showing proof of return" 
                             style="max-width: 100%; max-height: 400px; border-radius: 4px; cursor: pointer; border: 1px solid var(--border-color);" 
                             onclick="viewReturnImage('${escapeHtml(returnRecord.image_path)}')"
                             onerror="const container = document.getElementById('returnImageContainer-${returnRecord.id}'); if(container) { container.innerHTML = '<div style=\\'padding: 1rem; text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 4px;\\'><p>Image not available</p><button class=\\'btn btn-sm btn-secondary\\' onclick=\\'viewReturnImage(\\'${escapeHtml(returnRecord.image_path)}\\')\\'>Try again</button></div>'; }">
                    </div>
                    <p style="font-size: 0.85em; color: var(--text-secondary); margin-top: 0.25rem;">Click image to view full size</p>
                </div>
            ` : ''}
        </div>
    `;
    
    openModal('viewReturnModal');
}

function closeViewReturnModal() {
    closeModal('viewReturnModal');
}

function applyReceiptFilters() {
    // Filter logic will be implemented based on current tab
    if (currentTab === 'all') {
        loadReceipts();
    } else {
        loadReturnedReceipts();
    }
}

function clearReceiptFilters() {
    const dateFrom = document.getElementById('receiptDateFrom');
    const dateTo = document.getElementById('receiptDateTo');
    const search = document.getElementById('searchReceipts');
    
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (search) search.value = '';
    
    if (currentTab === 'all') {
        loadReceipts();
    } else {
        loadReturnedReceipts();
    }
}

async function printAllReceipts() {
    const dateFrom = document.getElementById('receiptDateFrom');
    const dateTo = document.getElementById('receiptDateTo');
    
    if (!dateFrom || !dateTo || !dateFrom.value || !dateTo.value) {
        showNotification('Please select both start and end dates', 'error');
        return;
    }
    
    const startDate = dateFrom.value;
    const endDate = dateTo.value;
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before or equal to end date', 'error');
        return;
    }
    
    try {
        showNotification('Loading receipts...', 'info');
        
        // Get all receipts in the date range - apiRequest handles shop_id automatically
        const allSales = await apiRequest('/sales');
        const salesArray = Array.isArray(allSales) ? allSales : [];
        
        // Filter by date range and exclude returns
        const filteredReceipts = salesArray.filter(sale => {
            if (sale.is_return && sale.is_return === 1) return false;
            const saleDate = new Date(sale.sale_date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include entire end date
            return saleDate >= start && saleDate <= end;
        });
        
        if (filteredReceipts.length === 0) {
            showNotification('No receipts found in the selected date range', 'error');
            return;
        }
        
        // Fetch full details for each receipt
        showNotification(`Loading ${filteredReceipts.length} receipts...`, 'info');
        const receiptsWithDetails = await Promise.all(
            filteredReceipts.map(async (receipt) => {
                try {
                    const fullReceipt = await apiRequest(`/sales/${receipt.id}`);
                    return fullReceipt;
                } catch (error) {
                    console.error(`Error loading receipt ${receipt.id}:`, error);
                    return receipt;
                }
            })
        );
        
        // Open print window
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        
        if (!printWindow) {
            showNotification('Pop-up blocked. Please allow pop-ups for this site to print receipts.', 'error');
            return;
        }
        
        // Generate print content - format data before writing to print window
        const currentDate = new Date();
        const totalAmount = receiptsWithDetails.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
        
        // Helper functions for formatting (will be used before writing to print window)
        const formatCurrencyForPrint = (amount) => {
            if (amount == null) return 'Tshs 0.00';
            return 'Tshs ' + parseFloat(amount).toFixed(2);
        };
        
        const formatDateForPrint = (dateString) => {
            if (!dateString) return '-';
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return dateString;
            }
        };
        
        const escapeHtmlForPrint = (text) => {
            if (text == null) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        // Format all data before generating HTML
        const formattedReceipts = receiptsWithDetails.map(sale => {
            let items = [];
            try {
                if (Array.isArray(sale.items)) {
                    items = sale.items;
                } else if (typeof sale.items === 'string') {
                    items = JSON.parse(sale.items || '[]');
                } else if (sale.items) {
                    items = [sale.items];
                }
            } catch (parseError) {
                console.error('Error parsing items for sale', sale.id, ':', parseError);
                items = [];
            }
            
            return {
                ...sale,
                items: items.map(item => ({
                    ...item,
                    formattedUnitPrice: formatCurrencyForPrint(item.unit_price || 0),
                    formattedTotalPrice: formatCurrencyForPrint(item.total_price || (item.quantity || 0) * (item.unit_price || 0)),
                    escapedItemName: escapeHtmlForPrint(item.item_name || '-')
                })),
                formattedDate: formatDateForPrint(sale.sale_date),
                formattedTotal: formatCurrencyForPrint(sale.total_amount || 0),
                escapedCustomer: escapeHtmlForPrint(sale.customer_name || 'Walk-in Customer'),
                escapedCashier: escapeHtmlForPrint(sale.created_by_name || 'System'),
                escapedNotes: sale.notes ? escapeHtmlForPrint(sale.notes) : null
            };
        });
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>All Receipts - ${startDate} to ${endDate}</title>
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
                        .receipt {
                            page-break-after: always;
                        }
                        .receipt:last-child {
                            page-break-after: auto;
                        }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        color: #000;
                    }
                    .summary {
                        text-align: center;
                        border-bottom: 3px solid #000;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .summary h1 {
                        margin: 0 0 10px 0;
                        font-size: 24px;
                        font-weight: bold;
                    }
                    .summary p {
                        margin: 5px 0;
                        font-size: 14px;
                    }
                    .receipt {
                        border: 2px solid #000;
                        padding: 20px;
                        margin-bottom: 30px;
                        page-break-inside: avoid;
                    }
                    .receipt-header {
                        text-align: center;
                        border-bottom: 2px solid #000;
                        padding-bottom: 15px;
                        margin-bottom: 20px;
                    }
                    .receipt-header h2 {
                        margin: 0 0 10px 0;
                        font-size: 20px;
                        font-weight: bold;
                    }
                    .receipt-info {
                        margin-bottom: 15px;
                        line-height: 1.6;
                    }
                    .receipt-info p {
                        margin: 4px 0;
                        font-size: 13px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .receipt-info p strong {
                        min-width: 100px;
                        font-weight: 600;
                    }
                    .receipt-items {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 15px;
                        font-size: 12px;
                    }
                    .receipt-items th {
                        background: #f0f0f0;
                        padding: 8px 6px;
                        text-align: left;
                        border-bottom: 2px solid #000;
                        font-weight: bold;
                    }
                    .receipt-items td {
                        padding: 6px;
                        border-bottom: 1px solid #ddd;
                    }
                    .receipt-items tfoot td {
                        border-top: 2px solid #000;
                        font-weight: bold;
                        padding: 8px 6px;
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
                        margin: 0 10px;
                    }
                </style>
            </head>
            <body>
                <div class="summary">
                    <h1>INVENTORY MANAGEMENT SYSTEM</h1>
                    <p><strong>All Receipts Report</strong></p>
                    <p>Date Range: ${startDate} to ${endDate}</p>
                    <p>Total Receipts: ${receiptsWithDetails.length}</p>
                    <p>Grand Total: ${formatCurrencyForPrint(totalAmount)}</p>
                    <p>Generated: ${currentDate.toLocaleString()}</p>
                </div>
                
                ${formattedReceipts.map((sale) => {
                    return `
                <div class="receipt">
                    <div class="receipt-header">
                        <h2>RECEIPT #${sale.id}</h2>
                        <p>${sale.formattedDate}</p>
                    </div>
                    
                    <div class="receipt-info">
                        <p><strong>Customer:</strong> <span>${sale.escapedCustomer}</span></p>
                        <p><strong>Cashier:</strong> <span>${sale.escapedCashier}</span></p>
                        ${sale.escapedNotes ? `<p><strong>Notes:</strong> <span>${sale.escapedNotes}</span></p>` : ''}
                    </div>
                    
                    <table class="receipt-items">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Price</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sale.items.map(item => `
                            <tr>
                                <td>${item.escapedItemName}</td>
                                <td class="text-right">${item.quantity || 0}</td>
                                <td class="text-right">${item.formattedUnitPrice}</td>
                                <td class="text-right">${item.formattedTotalPrice}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="text-right"><strong>TOTAL:</strong></td>
                                <td class="text-right"><strong>${sale.formattedTotal}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                    `;
                }).join('')}
                
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Print All Receipts</button>
                    <button onclick="window.close()">Close</button>
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        showNotification(`Loaded ${receiptsWithDetails.length} receipts. Click Print in the new window.`, 'success');
        
        // Auto-print after a short delay
        setTimeout(() => {
            printWindow.print();
        }, 500);
    } catch (error) {
        console.error('Error printing receipts:', error);
        showNotification(error.message || 'Error printing receipts', 'error');
    }
}

// Expose functions to global scope
window.switchTab = switchTab;
window.viewReceipt = viewReceipt;
window.openReturnReceiptModal = openReturnReceiptModal;
window.closeReturnReceiptModal = closeReturnReceiptModal;
window.viewReturnImage = viewReturnImage;
window.viewReturnDetails = viewReturnDetails;
window.closeViewReturnModal = closeViewReturnModal;
window.applyReceiptFilters = applyReceiptFilters;
window.clearReceiptFilters = clearReceiptFilters;
window.removeReturnImage = removeReturnImage;
window.updateReturnItems = updateReturnItems;
window.printAllReceipts = printAllReceipts;

document.addEventListener('DOMContentLoaded', async () => {
    await loadReceipts();
    
    // Setup form submit handler
    const returnForm = document.getElementById('returnReceiptForm');
    if (returnForm) {
        returnForm.addEventListener('submit', handleReturnReceiptSubmit);
    }
});

