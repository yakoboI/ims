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

function formatCurrency(amount) {
    if (amount == null) return '0.00';
    return parseFloat(amount).toFixed(2);
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
        // Get shop filter if superadmin has selected a shop
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const sales = await apiRequest(`/sales${queryParams}`);
        
        // Filter out returns (is_return = 1)
        receipts = sales.filter(sale => !sale.is_return || sale.is_return === 0);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderReceiptsTable(receipts);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading receipts', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading receipts</td></tr>';
        }
        if (receipts.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.receipts || {
                icon: '<i class="fas fa-file-invoice fa-icon-primary" style="font-size: 4rem;"></i>',
                title: 'No Receipts',
                message: 'No receipts have been generated yet.',
                className: 'empty-state-small'
            });
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
        returnedReceipts = await apiRequest('/sales/returns');
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderReturnedReceiptsTable(returnedReceipts);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading returned receipts', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Error loading returned receipts</td></tr>';
        }
        if (returnedReceipts.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.returns || {
                icon: '<i class="fas fa-undo fa-icon-warning" style="font-size: 4rem;"></i>',
                title: 'No Returns',
                message: 'No receipts have been returned yet.',
                className: 'empty-state-small'
            });
        }
    }
}

function renderReceiptsTable(receiptsList) {
    const tbody = document.getElementById('receiptsTableBody');
    const tableContainer = document.querySelector('#allReceiptsSection .table-container');
    
    if (!tbody) return;
    
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
        
        // Display items for return selection
        if (sale.items && sale.items.length > 0) {
            returnItemsList.innerHTML = sale.items.map(item => `
                <div style="display: flex; align-items: center; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 0.5rem;">
                    <input type="checkbox" id="returnItem_${item.item_id}" data-item-id="${item.item_id}" data-item-name="${escapeHtml(item.item_name)}" data-unit-price="${item.unit_price}" data-item-quantity="${item.quantity}" style="margin-right: 1rem;" onchange="updateReturnItems()">
                    <div style="flex: 1;">
                        <strong>${escapeHtml(item.item_name)}</strong><br>
                        <small style="color: var(--text-secondary);">Quantity: ${item.quantity} × ${formatCurrency(item.unit_price)} = ${formatCurrency(item.total_price)}</small>
                    </div>
                    <div id="returnQty_${item.item_id}" style="display: none; margin-left: 1rem;">
                        <label>Qty:</label>
                        <input type="number" min="1" max="${item.quantity}" value="${item.quantity}" style="width: 80px; margin-left: 0.5rem;" onchange="updateReturnItems()">
                    </div>
                </div>
            `).join('');
        } else {
            returnItemsList.innerHTML = '<p style="color: var(--text-secondary);">No items found for this sale.</p>';
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
    checkboxes.forEach(checkbox => {
        const itemId = checkbox.dataset.itemId;
        const qtyDiv = document.getElementById(`returnQty_${itemId}`);
        if (qtyDiv) {
            qtyDiv.style.display = checkbox.checked ? 'block' : 'none';
        }
    });
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
        const quantity = qtyInput ? parseInt(qtyInput.value) : parseInt(checkbox.dataset.itemQuantity || '1');
        const unitPrice = parseFloat(checkbox.dataset.unitPrice);
        
        selectedItems.push({
            item_id: parseInt(itemId),
            quantity: quantity,
            unit_price: unitPrice
        });
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
    if (!imagePath) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <button class="close" onclick="this.closest('.modal').remove()">&times;</button>
            <h2>Return Image</h2>
            <img src="${escapeHtml(imagePath)}" alt="Return receipt documentation image showing proof of return" style="max-width: 100%; border-radius: 4px;">
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
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
                    <img src="${escapeHtml(returnRecord.image_path)}" alt="Return receipt documentation for ${escapeHtml(returnRecord.invoice_number || 'invoice')} showing proof of return" style="max-width: 100%; max-height: 400px; border-radius: 4px; margin-top: 0.5rem; cursor: pointer;" onclick="viewReturnImage('${escapeHtml(returnRecord.image_path)}')">
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

document.addEventListener('DOMContentLoaded', async () => {
    await loadReceipts();
    
    // Setup form submit handler
    const returnForm = document.getElementById('returnReceiptForm');
    if (returnForm) {
        returnForm.addEventListener('submit', handleReturnReceiptSubmit);
    }
});

