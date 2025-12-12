let invoices = [];
let customers = [];
let items = [];
let invoiceItems = [];
let currentInvoiceId = null;

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
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

function formatCurrency(amount) {
    // Format as Tanzanian Shillings (Tshs) with 2 decimal places
    if (amount == null) return 'Tshs 0.00';
    return 'Tshs ' + new Intl.NumberFormat('en-TZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

async function loadInvoices() {
    const tbody = document.getElementById('invoicesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 9);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center">Loading...</td></tr>';
    
    try {
        // Get shop filter if superadmin has selected a shop
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        invoices = await apiRequest(`/invoices${queryParams}`);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderInvoicesTable(invoices);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading invoices', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Error loading invoices</td></tr>';
        }
        if (invoices.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.invoices || {
                icon: '<i class="fas fa-file-invoice-dollar fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Invoices',
                message: 'No invoices have been created yet.',
                actionLabel: 'Create Invoice',
                actionCallback: () => openInvoiceModal()
            });
        }
    }
}

async function loadCustomers() {
    try {
        customers = await apiRequest('/customers');
        const customerSelect = document.getElementById('invoiceCustomer');
        if (customerSelect) {
            customerSelect.innerHTML = '<option value="">Select Customer</option>' +
                customers.map(c => `<option value="${c.id}">${escapeHtml(c.name || 'Unknown')}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

async function loadItems() {
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        items = await apiRequest(`/items${queryParams}`);
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

function renderInvoicesTable(invoicesList) {
    const tbody = document.getElementById('invoicesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (invoicesList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.invoices || {
            icon: '<i class="fas fa-file-invoice-dollar fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Invoices',
            message: 'No invoices have been created yet.',
            actionLabel: 'Create Invoice',
            actionCallback: () => openInvoiceModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = invoicesList.map(invoice => {
        const statusClass = invoice.status === 'paid' ? 'badge-success' : 
                           invoice.status === 'sent' ? 'badge-info' : 
                           invoice.status === 'overdue' ? 'badge-danger' : 
                           invoice.status === 'partial' ? 'badge-warning' : 
                           invoice.status === 'cancelled' ? 'badge-secondary' : 'badge-secondary';
        const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
        const balance = parseFloat(invoice.balance_amount || 0);
        const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && balance > 0 && invoice.status !== 'paid' && invoice.status !== 'cancelled';
        
        return `
            <tr>
                <td data-label="Invoice #"><strong>${escapeHtml(invoice.invoice_number || '-')}</strong></td>
                <td data-label="Date">${formatDate(invoice.invoice_date)}</td>
                <td data-label="Due Date">${formatDate(invoice.due_date)} ${isOverdue ? '<span class="badge badge-danger" style="margin-left: 0.5rem;">Overdue</span>' : ''}</td>
                <td data-label="Customer">${escapeHtml(invoice.customer_name || invoice.customer_name_full || 'N/A')}</td>
                <td data-label="Total Amount"><strong>${formatCurrency(invoice.total_amount)}</strong></td>
                <td data-label="Paid">${formatCurrency(invoice.paid_amount || 0)}</td>
                <td data-label="Balance"><strong style="color: ${balance > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${formatCurrency(balance)}</strong></td>
                <td data-label="Status">
                    <span class="badge ${statusClass}">${statusText}</span>
                </td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewInvoice(${invoice.id})" aria-label="View invoice ${invoice.invoice_number || invoice.id}">
                        <i class="fas fa-eye"></i> <span class="btn-text-mobile">View</span>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="editInvoice(${invoice.id})" aria-label="Edit invoice ${invoice.invoice_number || invoice.id}">
                        <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteInvoice(${invoice.id})" aria-label="Delete invoice ${invoice.invoice_number || invoice.id}">
                        <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function setupEventListeners() {
    const invoiceForm = document.getElementById('invoiceForm');
    
    if (invoiceForm) {
        invoiceForm.addEventListener('submit', handleInvoiceSubmit);
    }
    
    // Set default invoice date to today
    const invoiceDateEl = document.getElementById('invoiceDate');
    if (invoiceDateEl && !invoiceDateEl.value) {
        invoiceDateEl.value = new Date().toISOString().split('T')[0];
    }
}

async function openInvoiceModal(invoiceId = null) {
    const modal = document.getElementById('invoiceModal');
    const form = document.getElementById('invoiceForm');
    const title = document.getElementById('invoiceModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    await loadCustomers();
    await loadItems();
    
    if (invoiceId) {
        title.textContent = 'Edit Invoice';
        currentInvoiceId = invoiceId;
        const invoice = invoices.find(i => i.id === invoiceId);
        if (invoice) {
            populateInvoiceForm(invoice);
        }
    } else {
        title.textContent = 'Create Invoice';
        currentInvoiceId = null;
        form.reset();
        invoiceItems = [];
        renderInvoiceItems();
        
        // Set default date
        const invoiceDateEl = document.getElementById('invoiceDate');
        if (invoiceDateEl) {
            invoiceDateEl.value = new Date().toISOString().split('T')[0];
        }
        
        // Generate invoice number automatically
        await generateInvoiceNumber();
        
        // Make invoice number read-only for new invoices
        const invoiceNumberEl = document.getElementById('invoiceNumber');
        const regenerateBtn = document.getElementById('regenerateInvoiceNumberBtn');
        if (invoiceNumberEl) {
            invoiceNumberEl.readOnly = true;
            invoiceNumberEl.style.backgroundColor = '#f8f9fa';
            invoiceNumberEl.style.cursor = 'not-allowed';
        }
        // Hide regenerate button for new invoices (it's auto-generated)
        if (regenerateBtn) {
            regenerateBtn.style.display = 'none';
        }
    }
    
    const firstInput = document.getElementById('invoiceNumber');
    openModal('invoiceModal', firstInput);
}

function populateInvoiceForm(invoice) {
    const invoiceIdEl = document.getElementById('invoiceId');
    const invoiceNumberEl = document.getElementById('invoiceNumber');
    const invoiceDateEl = document.getElementById('invoiceDate');
    const invoiceDueDateEl = document.getElementById('invoiceDueDate');
    const invoiceStatusEl = document.getElementById('invoiceStatus');
    const invoiceCustomerEl = document.getElementById('invoiceCustomer');
    const invoiceCustomerNameEl = document.getElementById('invoiceCustomerName');
    const invoiceCustomerEmailEl = document.getElementById('invoiceCustomerEmail');
    const invoiceCustomerPhoneEl = document.getElementById('invoiceCustomerPhone');
    const invoiceCustomerAddressEl = document.getElementById('invoiceCustomerAddress');
    const invoicePaymentMethodEl = document.getElementById('invoicePaymentMethod');
    const invoiceSubtotalEl = document.getElementById('invoiceSubtotal');
    const invoiceDiscountEl = document.getElementById('invoiceDiscount');
    const invoiceTaxEl = document.getElementById('invoiceTax');
    const invoiceTotalEl = document.getElementById('invoiceTotal');
    const invoicePaidAmountEl = document.getElementById('invoicePaidAmount');
    const invoiceBalanceEl = document.getElementById('invoiceBalance');
    const invoicePaymentTermsEl = document.getElementById('invoicePaymentTerms');
    const invoiceNotesEl = document.getElementById('invoiceNotes');
    const invoiceTermsConditionsEl = document.getElementById('invoiceTermsConditions');
    
    if (invoiceIdEl) invoiceIdEl.value = invoice.id;
    if (invoiceNumberEl) {
        invoiceNumberEl.value = invoice.invoice_number || '';
        // Make invoice number editable when editing
        invoiceNumberEl.readOnly = false;
        invoiceNumberEl.style.backgroundColor = '';
        invoiceNumberEl.style.cursor = '';
    }
    // Show regenerate button when editing
    const regenerateBtn = document.getElementById('regenerateInvoiceNumberBtn');
    if (regenerateBtn) {
        regenerateBtn.style.display = 'inline-flex';
    }
    if (invoiceDateEl) invoiceDateEl.value = invoice.invoice_date ? invoice.invoice_date.split('T')[0] : '';
    if (invoiceDueDateEl) invoiceDueDateEl.value = invoice.due_date ? invoice.due_date.split('T')[0] : '';
    if (invoiceStatusEl) invoiceStatusEl.value = invoice.status || 'draft';
    if (invoiceCustomerEl) invoiceCustomerEl.value = invoice.customer_id || '';
    if (invoiceCustomerNameEl) invoiceCustomerNameEl.value = invoice.customer_name || invoice.customer_name_full || '';
    if (invoiceCustomerEmailEl) invoiceCustomerEmailEl.value = invoice.customer_email || invoice.customer_email_full || '';
    if (invoiceCustomerPhoneEl) invoiceCustomerPhoneEl.value = invoice.customer_phone || invoice.customer_phone_full || '';
    if (invoiceCustomerAddressEl) invoiceCustomerAddressEl.value = invoice.customer_address || invoice.customer_address_full || '';
    if (invoicePaymentMethodEl) invoicePaymentMethodEl.value = invoice.payment_method || '';
    if (invoiceSubtotalEl) invoiceSubtotalEl.value = invoice.subtotal || 0;
    if (invoiceDiscountEl) invoiceDiscountEl.value = invoice.discount_amount || 0;
    if (invoiceTaxEl) invoiceTaxEl.value = invoice.tax_amount || 0;
    if (invoiceTotalEl) invoiceTotalEl.value = invoice.total_amount || 0;
    if (invoicePaidAmountEl) invoicePaidAmountEl.value = invoice.paid_amount || 0;
    if (invoiceBalanceEl) invoiceBalanceEl.value = invoice.balance_amount || 0;
    if (invoicePaymentTermsEl) invoicePaymentTermsEl.value = invoice.payment_terms || '';
    if (invoiceNotesEl) invoiceNotesEl.value = invoice.notes || '';
    if (invoiceTermsConditionsEl) invoiceTermsConditionsEl.value = invoice.terms_conditions || '';
    
    // Load invoice items
    invoiceItems = invoice.items || [];
    renderInvoiceItems();
}

function loadCustomerDetails() {
    const customerSelect = document.getElementById('invoiceCustomer');
    const customerId = customerSelect ? customerSelect.value : null;
    
    if (!customerId) return;
    
    const customer = customers.find(c => c.id == customerId);
    if (customer) {
        const invoiceCustomerNameEl = document.getElementById('invoiceCustomerName');
        const invoiceCustomerEmailEl = document.getElementById('invoiceCustomerEmail');
        const invoiceCustomerPhoneEl = document.getElementById('invoiceCustomerPhone');
        const invoiceCustomerAddressEl = document.getElementById('invoiceCustomerAddress');
        
        if (invoiceCustomerNameEl) invoiceCustomerNameEl.value = customer.name || '';
        if (invoiceCustomerEmailEl) invoiceCustomerEmailEl.value = customer.email || '';
        if (invoiceCustomerPhoneEl) invoiceCustomerPhoneEl.value = customer.phone || '';
        if (invoiceCustomerAddressEl) invoiceCustomerAddressEl.value = customer.address || '';
    }
}

function addInvoiceItem() {
    invoiceItems.push({
        item_id: null,
        item_name: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        tax_rate: 0,
        total_price: 0
    });
    renderInvoiceItems();
}

function removeInvoiceItem(index) {
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
    calculateInvoiceTotal();
}

function renderInvoiceItems() {
    const itemsList = document.getElementById('invoiceItemsList');
    if (!itemsList) return;
    
    if (invoiceItems.length === 0) {
        itemsList.innerHTML = '<p style="color: var(--text-secondary);">No items added. Click "Add Item" to add items.</p>';
        return;
    }
    
    itemsList.innerHTML = invoiceItems.map((item, index) => `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 0.5rem; align-items: center;">
            <div>
                <select class="form-control" onchange="selectInvoiceItem(${index}, this.value)" aria-label="Select item">
                    <option value="">Select Item</option>
                    ${items.map(i => `<option value="${i.id}" ${item.item_id == i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}
                </select>
                <input type="text" class="form-control" style="margin-top: 0.5rem;" placeholder="Item name" value="${escapeHtml(item.item_name)}" onchange="updateInvoiceItem(${index}, 'item_name', this.value)" aria-label="Item name">
            </div>
            <div>
                <label style="font-size: 0.875rem;">Qty</label>
                <input type="number" class="form-control" min="0.01" step="0.01" value="${item.quantity}" onchange="updateInvoiceItem(${index}, 'quantity', this.value)" aria-label="Quantity">
            </div>
            <div>
                <label style="font-size: 0.875rem;">Unit Price</label>
                <input type="number" class="form-control" min="0" step="0.01" value="${item.unit_price}" onchange="updateInvoiceItem(${index}, 'unit_price', this.value)" aria-label="Unit price">
            </div>
            <div>
                <label style="font-size: 0.875rem;">Discount</label>
                <input type="number" class="form-control" min="0" step="0.01" value="${item.discount || 0}" onchange="updateInvoiceItem(${index}, 'discount', this.value)" aria-label="Discount">
            </div>
            <div>
                <label style="font-size: 0.875rem;">Total</label>
                <input type="number" class="form-control" readonly value="${formatCurrency(item.total_price)}" aria-label="Total">
            </div>
            <div>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeInvoiceItem(${index})" aria-label="Remove item"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

function selectInvoiceItem(index, itemId) {
    if (!itemId) return;
    
    const item = items.find(i => i.id == itemId);
    if (item) {
        invoiceItems[index].item_id = item.id;
        invoiceItems[index].item_name = item.name;
        invoiceItems[index].unit_price = item.unit_price || 0;
        updateInvoiceItemTotal(index);
        renderInvoiceItems();
        calculateInvoiceTotal();
    }
}

function updateInvoiceItem(index, field, value) {
    if (!invoiceItems[index]) return;
    
    invoiceItems[index][field] = field === 'quantity' || field === 'unit_price' || field === 'discount' ? parseFloat(value) || 0 : value;
    updateInvoiceItemTotal(index);
    calculateInvoiceTotal();
}

function updateInvoiceItemTotal(index) {
    const item = invoiceItems[index];
    if (item) {
        item.total_price = ((item.quantity || 0) * (item.unit_price || 0)) - (item.discount || 0);
    }
}

function calculateInvoiceTotal() {
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const discount = parseFloat(document.getElementById('invoiceDiscount')?.value || 0);
    const tax = parseFloat(document.getElementById('invoiceTax')?.value || 0);
    const total = Math.max(0, subtotal - discount) + tax;
    
    const invoiceSubtotalEl = document.getElementById('invoiceSubtotal');
    const invoiceTotalEl = document.getElementById('invoiceTotal');
    
    if (invoiceSubtotalEl) invoiceSubtotalEl.value = subtotal.toFixed(2);
    if (invoiceTotalEl) invoiceTotalEl.value = total.toFixed(2);
    
    calculateInvoiceBalance();
}

function calculateInvoiceBalance() {
    const total = parseFloat(document.getElementById('invoiceTotal')?.value || 0);
    const paid = parseFloat(document.getElementById('invoicePaidAmount')?.value || 0);
    const balance = total - paid;
    
    const invoiceBalanceEl = document.getElementById('invoiceBalance');
    if (invoiceBalanceEl) {
        invoiceBalanceEl.value = balance.toFixed(2);
        invoiceBalanceEl.style.color = balance > 0 ? 'var(--danger-color)' : 'var(--success-color)';
    }
}

async function generateInvoiceNumber() {
    try {
        const response = await apiRequest('/invoices/generate-number');
        const invoiceNumberEl = document.getElementById('invoiceNumber');
        if (invoiceNumberEl && response.invoice_number) {
            invoiceNumberEl.value = response.invoice_number;
            return response.invoice_number;
        }
    } catch (error) {
        console.error('Error generating invoice number:', error);
        // Fallback: Generate invoice number client-side if API fails
        const invoiceNumberEl = document.getElementById('invoiceNumber');
        if (invoiceNumberEl && !invoiceNumberEl.value) {
            const fallbackNumber = `INV-${Date.now()}`;
            invoiceNumberEl.value = fallbackNumber;
            return fallbackNumber;
        }
    }
    return null;
}

function closeInvoiceModal() {
    closeModal('invoiceModal');
    const form = document.getElementById('invoiceForm');
    const invoiceIdEl = document.getElementById('invoiceId');
    const invoiceNumberEl = document.getElementById('invoiceNumber');
    
    if (form) form.reset();
    if (invoiceIdEl) invoiceIdEl.value = '';
    if (invoiceNumberEl) {
        invoiceNumberEl.readOnly = false;
        invoiceNumberEl.style.backgroundColor = '';
        invoiceNumberEl.style.cursor = '';
    }
    invoiceItems = [];
    currentInvoiceId = null;
}

async function handleInvoiceSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const invoiceIdEl = document.getElementById('invoiceId');
    const invoiceNumberEl = document.getElementById('invoiceNumber');
    const invoiceDateEl = document.getElementById('invoiceDate');
    
    if (!invoiceIdEl || !invoiceNumberEl || !invoiceDateEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    if (invoiceItems.length === 0) {
        showNotification('Please add at least one item to the invoice', 'error');
        return;
    }
    
    // Validate form
    const validationRules = {
        invoiceNumber: { required: true },
        invoiceDate: { required: true }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const invoiceData = {
        invoice_number: invoiceNumberEl.value.trim(),
        invoice_date: invoiceDateEl.value,
        due_date: document.getElementById('invoiceDueDate')?.value || null,
        customer_id: document.getElementById('invoiceCustomer')?.value || null,
        customer_name: document.getElementById('invoiceCustomerName')?.value.trim() || null,
        customer_email: document.getElementById('invoiceCustomerEmail')?.value.trim() || null,
        customer_phone: document.getElementById('invoiceCustomerPhone')?.value.trim() || null,
        customer_address: document.getElementById('invoiceCustomerAddress')?.value.trim() || null,
        items: invoiceItems,
        subtotal: parseFloat(document.getElementById('invoiceSubtotal')?.value || 0),
        discount_amount: parseFloat(document.getElementById('invoiceDiscount')?.value || 0),
        tax_amount: parseFloat(document.getElementById('invoiceTax')?.value || 0),
        total_amount: parseFloat(document.getElementById('invoiceTotal')?.value || 0),
        paid_amount: parseFloat(document.getElementById('invoicePaidAmount')?.value || 0),
        payment_method: document.getElementById('invoicePaymentMethod')?.value || null,
        payment_terms: document.getElementById('invoicePaymentTerms')?.value.trim() || null,
        notes: document.getElementById('invoiceNotes')?.value.trim() || null,
        terms_conditions: document.getElementById('invoiceTermsConditions')?.value.trim() || null,
        status: document.getElementById('invoiceStatus')?.value || 'draft'
    };
    
    try {
        if (invoiceIdEl.value) {
            await apiRequest(`/invoices/${invoiceIdEl.value}`, {
                method: 'PUT',
                body: invoiceData
            });
            showNotification('Invoice updated successfully');
        } else {
            await apiRequest('/invoices', {
                method: 'POST',
                body: invoiceData
            });
            showNotification('Invoice created successfully');
        }
        
        closeInvoiceModal();
        await loadInvoices();
    } catch (error) {
        showNotification(error.message || 'Error saving invoice', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editInvoice(invoiceId) {
    openInvoiceModal(invoiceId);
}

async function deleteInvoice(invoiceId) {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) {
        showNotification('Invoice not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this invoice?\n\nInvoice: ${invoice.invoice_number}`)) {
        return;
    }
    
    try {
        await apiRequest(`/invoices/${invoiceId}`, {
            method: 'DELETE'
        });
        showNotification('Invoice deleted successfully');
        await loadInvoices();
    } catch (error) {
        showNotification(error.message || 'Error deleting invoice', 'error');
    }
}

async function viewInvoice(invoiceId) {
    try {
        const invoice = await apiRequest(`/invoices/${invoiceId}`);
        
        // Store invoice for printing
        window.currentViewingInvoice = invoice;
        currentViewingInvoiceId = invoiceId;
        
        const modal = document.getElementById('viewInvoiceModal');
        const title = document.getElementById('viewInvoiceModalTitle');
        const content = document.getElementById('invoiceDetailsContent');
        
        if (!modal || !title || !content) return;
        
        title.textContent = `Invoice ${escapeHtml(invoice.invoice_number)}`;
        
        const statusClass = invoice.status === 'paid' ? 'badge-success' : 
                           invoice.status === 'sent' ? 'badge-info' : 
                           invoice.status === 'overdue' ? 'badge-danger' : 
                           invoice.status === 'partial' ? 'badge-warning' : 'badge-secondary';
        
        content.innerHTML = `
            <div style="display: grid; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Invoice Details</h3>
                        <p><strong>Invoice Number:</strong> ${escapeHtml(invoice.invoice_number)}</p>
                        <p><strong>Date:</strong> ${formatDate(invoice.invoice_date)}</p>
                        <p><strong>Due Date:</strong> ${formatDate(invoice.due_date) || 'N/A'}</p>
                        <p><strong>Status:</strong> <span class="badge ${statusClass}">${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</span></p>
                    </div>
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Customer Details</h3>
                        <p><strong>Name:</strong> ${escapeHtml(invoice.customer_name || invoice.customer_name_full || 'N/A')}</p>
                        <p><strong>Email:</strong> ${escapeHtml(invoice.customer_email || invoice.customer_email_full || 'N/A')}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(invoice.customer_phone || invoice.customer_phone_full || 'N/A')}</p>
                        ${invoice.customer_address || invoice.customer_address_full ? `<p><strong>Address:</strong> ${escapeHtml(invoice.customer_address || invoice.customer_address_full)}</p>` : ''}
                    </div>
                </div>
                
                <div>
                    <h3 style="margin-bottom: 0.5rem;">Invoice Items</h3>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Discount</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(invoice.items || []).map(item => `
                                <tr>
                                    <td>${escapeHtml(item.item_name || 'N/A')}</td>
                                    <td>${escapeHtml(item.description || '-')}</td>
                                    <td>${item.quantity}</td>
                                    <td>${formatCurrency(item.unit_price)}</td>
                                    <td>${formatCurrency(item.discount || 0)}</td>
                                    <td><strong>${formatCurrency(item.total_price)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        ${invoice.payment_terms ? `<p><strong>Payment Terms:</strong> ${escapeHtml(invoice.payment_terms)}</p>` : ''}
                        ${invoice.payment_method ? `<p><strong>Payment Method:</strong> ${escapeHtml(invoice.payment_method)}</p>` : ''}
                        ${invoice.notes ? `<p><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <p><strong>Subtotal:</strong> ${formatCurrency(invoice.subtotal)}</p>
                        <p><strong>Discount:</strong> -${formatCurrency(invoice.discount_amount || 0)}</p>
                        <p><strong>Tax:</strong> ${formatCurrency(invoice.tax_amount || 0)}</p>
                        <p style="font-size: 1.25rem; margin-top: 0.5rem;"><strong>Total:</strong> ${formatCurrency(invoice.total_amount)}</p>
                        <p><strong>Paid:</strong> ${formatCurrency(invoice.paid_amount || 0)}</p>
                        <p style="color: ${parseFloat(invoice.balance_amount || 0) > 0 ? 'var(--danger-color)' : 'var(--success-color)'};"><strong>Balance:</strong> ${formatCurrency(invoice.balance_amount || 0)}</p>
                    </div>
                </div>
                
                ${invoice.terms_conditions ? `<div><h3>Terms & Conditions</h3><p>${escapeHtml(invoice.terms_conditions)}</p></div>` : ''}
            </div>
        `;
        
        openModal('viewInvoiceModal');
    } catch (error) {
        showNotification('Error loading invoice details', 'error');
    }
}

function closeViewInvoiceModal() {
    closeModal('viewInvoiceModal');
}

function printInvoice() {
    // Get current invoice from stored data
    let invoiceData = window.currentViewingInvoice;
    
    // If not available, try to fetch it
    if (!invoiceData && currentViewingInvoiceId) {
        apiRequest(`/invoices/${currentViewingInvoiceId}`)
            .then(invoice => {
                printInvoiceWithData(invoice);
            })
            .catch(() => {
                window.print(); // Fallback to printing current page
            });
        return;
    }
    
    if (!invoiceData) {
        window.print(); // Fallback to printing current page
        return;
    }
    
    printInvoiceWithData(invoiceData);
}

function printInvoiceWithData(invoiceData) {
    // Create a print window with professional invoice layout
    const printWindow = window.open('', '_blank');
    
    const statusClass = invoiceData.status === 'paid' ? 'badge-success' : 
                       invoiceData.status === 'sent' ? 'badge-info' : 
                       invoiceData.status === 'overdue' ? 'badge-danger' : 
                       invoiceData.status === 'partial' ? 'badge-warning' : 'badge-secondary';
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice ${escapeHtml(invoiceData.invoice_number)}</title>
            <meta charset="UTF-8">
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
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: Arial, sans-serif;
                    font-size: 12pt;
                    line-height: 1.6;
                    color: #000;
                    padding: 20px;
                    background: #fff;
                }
                .invoice-container {
                    max-width: 210mm;
                    margin: 0 auto;
                    background: #fff;
                }
                .invoice-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 3px solid #2563eb;
                }
                .invoice-header-left h1 {
                    font-size: 32pt;
                    color: #2563eb;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .invoice-header-left p {
                    color: #666;
                    font-size: 10pt;
                }
                .invoice-header-right {
                    text-align: right;
                }
                .invoice-header-right h2 {
                    font-size: 24pt;
                    color: #2563eb;
                    margin-bottom: 10px;
                }
                .invoice-info {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                    margin-bottom: 30px;
                }
                .invoice-section {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 4px;
                }
                .invoice-section h3 {
                    font-size: 14pt;
                    color: #2563eb;
                    margin-bottom: 10px;
                    border-bottom: 2px solid #2563eb;
                    padding-bottom: 5px;
                }
                .invoice-section p {
                    margin: 5px 0;
                    font-size: 11pt;
                }
                .invoice-section strong {
                    display: inline-block;
                    width: 120px;
                    color: #333;
                }
                .invoice-items {
                    margin: 30px 0;
                }
                .invoice-items table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                .invoice-items thead {
                    background: #2563eb;
                    color: #fff;
                }
                .invoice-items th {
                    padding: 12px;
                    text-align: left;
                    font-weight: bold;
                    font-size: 11pt;
                }
                .invoice-items td {
                    padding: 10px 12px;
                    border-bottom: 1px solid #ddd;
                    font-size: 11pt;
                }
                .invoice-items tbody tr:hover {
                    background: #f8f9fa;
                }
                .invoice-items tfoot {
                    background: #f8f9fa;
                    font-weight: bold;
                }
                .invoice-items tfoot td {
                    padding: 12px;
                    border-top: 2px solid #2563eb;
                    border-bottom: none;
                }
                .invoice-totals {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                    margin-top: 30px;
                }
                .invoice-totals-left {
                    padding: 15px;
                }
                .invoice-totals-left p {
                    margin: 8px 0;
                    font-size: 11pt;
                }
                .invoice-totals-right {
                    text-align: right;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 4px;
                }
                .invoice-totals-right p {
                    margin: 8px 0;
                    font-size: 11pt;
                }
                .invoice-totals-right .total-amount {
                    font-size: 18pt;
                    font-weight: bold;
                    color: #2563eb;
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 2px solid #2563eb;
                }
                .invoice-totals-right .balance-amount {
                    font-size: 14pt;
                    font-weight: bold;
                    margin-top: 10px;
                }
                .invoice-footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 2px solid #ddd;
                }
                .invoice-footer h3 {
                    font-size: 12pt;
                    color: #2563eb;
                    margin-bottom: 10px;
                }
                .invoice-footer p {
                    font-size: 10pt;
                    color: #666;
                    line-height: 1.8;
                }
                .status-badge {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 10pt;
                    font-weight: bold;
                    text-transform: uppercase;
                }
                .status-paid { background: #10b981; color: #fff; }
                .status-sent { background: #3b82f6; color: #fff; }
                .status-overdue { background: #ef4444; color: #fff; }
                .status-partial { background: #f59e0b; color: #fff; }
                .status-draft { background: #64748b; color: #fff; }
                .status-cancelled { background: #94a3b8; color: #fff; }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <div class="invoice-header">
                    <div class="invoice-header-left">
                        <h1>INVOICE</h1>
                        <p>Inventory Management System</p>
                    </div>
                    <div class="invoice-header-right">
                        <h2>${escapeHtml(invoiceData.invoice_number)}</h2>
                        <p><strong>Date:</strong> ${formatDate(invoiceData.invoice_date)}</p>
                        ${invoiceData.due_date ? `<p><strong>Due Date:</strong> ${formatDate(invoiceData.due_date)}</p>` : ''}
                        <p><span class="status-badge status-${invoiceData.status}">${invoiceData.status.charAt(0).toUpperCase() + invoiceData.status.slice(1)}</span></p>
                    </div>
                </div>
                
                <div class="invoice-info">
                    <div class="invoice-section">
                        <h3>Bill To</h3>
                        <p><strong>Name:</strong> ${escapeHtml(invoiceData.customer_name || 'N/A')}</p>
                        ${invoiceData.customer_email ? `<p><strong>Email:</strong> ${escapeHtml(invoiceData.customer_email)}</p>` : ''}
                        ${invoiceData.customer_phone ? `<p><strong>Phone:</strong> ${escapeHtml(invoiceData.customer_phone)}</p>` : ''}
                        ${invoiceData.customer_address ? `<p><strong>Address:</strong> ${escapeHtml(invoiceData.customer_address)}</p>` : ''}
                    </div>
                    <div class="invoice-section">
                        <h3>Payment Information</h3>
                        ${invoiceData.payment_method ? `<p><strong>Method:</strong> ${escapeHtml(invoiceData.payment_method)}</p>` : ''}
                        ${invoiceData.payment_terms ? `<p><strong>Terms:</strong> ${escapeHtml(invoiceData.payment_terms)}</p>` : ''}
                        <p><strong>Paid:</strong> ${formatCurrency(invoiceData.paid_amount || 0)}</p>
                        <p><strong>Balance:</strong> <span style="color: ${parseFloat(invoiceData.balance_amount || 0) > 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">${formatCurrency(invoiceData.balance_amount || 0)}</span></p>
                    </div>
                </div>
                
                <div class="invoice-items">
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Description</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Unit Price</th>
                                <th style="text-align: right;">Discount</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(invoiceData.items || []).map(item => `
                                <tr>
                                    <td>${escapeHtml(item.item_name || 'N/A')}</td>
                                    <td>${escapeHtml(item.description || '-')}</td>
                                    <td style="text-align: center;">${item.quantity}</td>
                                    <td style="text-align: right;">${formatCurrency(item.unit_price)}</td>
                                    <td style="text-align: right;">${formatCurrency(item.discount || 0)}</td>
                                    <td style="text-align: right;"><strong>${formatCurrency(item.total_price)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="5" style="text-align: right;"><strong>Subtotal:</strong></td>
                                <td style="text-align: right;"><strong>${formatCurrency(invoiceData.subtotal || 0)}</strong></td>
                            </tr>
                            ${invoiceData.discount_amount > 0 ? `
                            <tr>
                                <td colspan="5" style="text-align: right;"><strong>Discount:</strong></td>
                                <td style="text-align: right;"><strong>-${formatCurrency(invoiceData.discount_amount)}</strong></td>
                            </tr>
                            ` : ''}
                            ${invoiceData.tax_amount > 0 ? `
                            <tr>
                                <td colspan="5" style="text-align: right;"><strong>Tax:</strong></td>
                                <td style="text-align: right;"><strong>${formatCurrency(invoiceData.tax_amount)}</strong></td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td colspan="5" style="text-align: right;"><strong>Total Amount:</strong></td>
                                <td style="text-align: right;"><strong class="total-amount">${formatCurrency(invoiceData.total_amount)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <div class="invoice-totals">
                    <div class="invoice-totals-left">
                        ${invoiceData.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(invoiceData.notes)}</p>` : ''}
                    </div>
                    <div class="invoice-totals-right">
                        <p><strong>Subtotal:</strong> ${formatCurrency(invoiceData.subtotal || 0)}</p>
                        ${invoiceData.discount_amount > 0 ? `<p><strong>Discount:</strong> -${formatCurrency(invoiceData.discount_amount)}</p>` : ''}
                        ${invoiceData.tax_amount > 0 ? `<p><strong>Tax:</strong> ${formatCurrency(invoiceData.tax_amount)}</p>` : ''}
                        <p class="total-amount">Total: ${formatCurrency(invoiceData.total_amount)}</p>
                        <p><strong>Paid:</strong> ${formatCurrency(invoiceData.paid_amount || 0)}</p>
                        <p class="balance-amount" style="color: ${parseFloat(invoiceData.balance_amount || 0) > 0 ? '#ef4444' : '#10b981'};">Balance: ${formatCurrency(invoiceData.balance_amount || 0)}</p>
                    </div>
                </div>
                
                ${invoiceData.terms_conditions ? `
                <div class="invoice-footer">
                    <h3>Terms & Conditions</h3>
                    <p>${escapeHtml(invoiceData.terms_conditions)}</p>
                </div>
                ` : ''}
                
                <div class="invoice-footer" style="margin-top: 30px; text-align: center; color: #999; font-size: 9pt;">
                    <p>Thank you for your business!</p>
                    <p>This is a computer-generated invoice.</p>
                </div>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 250);
}

// Store current viewing invoice ID
let currentViewingInvoiceId = null;

function applyInvoiceFilters() {
    const statusFilter = document.getElementById('invoiceStatusFilter')?.value || '';
    const dateFrom = document.getElementById('invoiceDateFrom')?.value || '';
    const dateTo = document.getElementById('invoiceDateTo')?.value || '';
    const search = document.getElementById('searchInvoices')?.value.toLowerCase().trim() || '';
    
    let filtered = [...invoices];
    
    // Status filter
    if (statusFilter) {
        filtered = filtered.filter(inv => inv.status === statusFilter);
    }
    
    // Date range filter
    if (dateFrom) {
        filtered = filtered.filter(inv => {
            const invDate = new Date(inv.invoice_date);
            return invDate >= new Date(dateFrom);
        });
    }
    if (dateTo) {
        filtered = filtered.filter(inv => {
            const invDate = new Date(inv.invoice_date);
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            return invDate <= toDate;
        });
    }
    
    // Search filter
    if (search) {
        filtered = filtered.filter(inv => {
            const invoiceNum = (inv.invoice_number || '').toLowerCase();
            const customerName = (inv.customer_name || inv.customer_name_full || '').toLowerCase();
            return invoiceNum.includes(search) || customerName.includes(search);
        });
    }
    
    renderInvoicesTable(filtered);
}

function clearInvoiceFilters() {
    const statusFilter = document.getElementById('invoiceStatusFilter');
    const dateFrom = document.getElementById('invoiceDateFrom');
    const dateTo = document.getElementById('invoiceDateTo');
    const search = document.getElementById('searchInvoices');
    
    if (statusFilter) statusFilter.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (search) search.value = '';
    
    loadInvoices();
}

// Expose functions to global scope
window.openInvoiceModal = openInvoiceModal;
window.closeInvoiceModal = closeInvoiceModal;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.viewInvoice = viewInvoice;
window.closeViewInvoiceModal = closeViewInvoiceModal;
window.addInvoiceItem = addInvoiceItem;
window.removeInvoiceItem = removeInvoiceItem;
window.selectInvoiceItem = selectInvoiceItem;
window.updateInvoiceItem = updateInvoiceItem;
window.loadCustomerDetails = loadCustomerDetails;
window.generateInvoiceNumber = generateInvoiceNumber;
window.calculateInvoiceTotal = calculateInvoiceTotal;
window.calculateInvoiceBalance = calculateInvoiceBalance;
window.applyInvoiceFilters = applyInvoiceFilters;
window.clearInvoiceFilters = clearInvoiceFilters;
window.printInvoice = printInvoice;

document.addEventListener('DOMContentLoaded', async () => {
    await loadInvoices();
    setupEventListeners();
});

