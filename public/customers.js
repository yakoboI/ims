let customers = [];

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadCustomers() {
    const tbody = document.getElementById('customersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 5);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    
    try {
        customers = await apiRequest('/customers');
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderCustomersTable(customers);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        const errorMsg = window.i18n ? window.i18n.t('messages.errorLoadingCustomers') : 'Error loading customers';
        showNotification(errorMsg, 'error');
        if (tbody) {
            const errorText = window.i18n ? window.i18n.t('messages.errorLoadingCustomers') : 'Error loading customers';
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">${errorText}</td></tr>`;
        }
        if (customers.length === 0 && tableContainer) {
            const emptyTitle = window.i18n ? window.i18n.t('messages.noCustomers') : 'No Customers';
            const emptyMessage = window.i18n ? window.i18n.t('messages.noCustomersMessage') : 'No customers have been added yet.';
            const emptyAction = window.i18n ? window.i18n.t('customers.addCustomer') : 'Add Customer';
            showEmptyState(tableContainer, EmptyStates.customers || {
                icon: '<i class="fas fa-users fa-icon-success" style="font-size: 4rem;"></i>',
                title: emptyTitle,
                message: emptyMessage,
                actionLabel: emptyAction,
                actionCallback: () => openCustomerModal()
            });
        }
    }
}

function renderCustomersTable(customersList) {
    const tbody = document.getElementById('customersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (customersList.length === 0) {
        tbody.innerHTML = '';
        const emptyTitle = window.i18n ? window.i18n.t('messages.noCustomers') : 'No Customers';
        const emptyMessage = window.i18n ? window.i18n.t('messages.noCustomersMessage') : 'No customers have been added yet.';
        const emptyAction = window.i18n ? window.i18n.t('customers.addCustomer') : 'Add Customer';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.customers || {
            icon: '<i class="fas fa-users fa-icon-success" style="font-size: 4rem;"></i>',
            title: emptyTitle,
            message: emptyMessage,
            actionLabel: emptyAction,
            actionCallback: () => openCustomerModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = customersList.map(customer => `
        <tr>
            <td data-label="Name"><strong>${escapeHtml(customer.name || '-')}</strong></td>
            <td data-label="Email">${escapeHtml(customer.email || '-')}</td>
            <td data-label="Phone">${escapeHtml(customer.phone || '-')}</td>
            <td data-label="Address">${escapeHtml(customer.address || '-')}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editCustomer(${customer.id})" aria-label="Edit customer ${customer.id}">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${customer.id})" aria-label="Delete customer ${customer.id}">Delete</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    const customerForm = document.getElementById('customerForm');
    
    if (customerForm) {
        customerForm.addEventListener('submit', handleCustomerSubmit);
    }
}

async function openCustomerModal(customerId = null) {
    const modal = document.getElementById('customerModal');
    const form = document.getElementById('customerForm');
    const title = document.getElementById('customerModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (customerId) {
        title.textContent = window.i18n ? window.i18n.t('customers.editCustomer') : 'Edit Customer';
        const customer = customers.find(c => c.id === customerId);
        if (customer) {
            const customerIdEl = document.getElementById('customerId');
            const customerNameEl = document.getElementById('customerName');
            const customerEmailEl = document.getElementById('customerEmail');
            const customerPhoneEl = document.getElementById('customerPhone');
            const customerAddressEl = document.getElementById('customerAddress');
            
            if (customerIdEl) customerIdEl.value = customer.id;
            if (customerNameEl) customerNameEl.value = customer.name || '';
            if (customerEmailEl) customerEmailEl.value = customer.email || '';
            if (customerPhoneEl) customerPhoneEl.value = customer.phone || '';
            if (customerAddressEl) customerAddressEl.value = customer.address || '';
        }
    } else {
        title.textContent = window.i18n ? window.i18n.t('customers.addCustomer') : 'Add Customer';
        form.reset();
        const customerIdEl = document.getElementById('customerId');
        if (customerIdEl) customerIdEl.value = '';
    }
    
    const firstInput = document.getElementById('customerName');
    openModal('customerModal', firstInput);
}

function closeCustomerModal() {
    closeModal('customerModal');
    const form = document.getElementById('customerForm');
    const customerIdEl = document.getElementById('customerId');
    
    if (form) form.reset();
    if (customerIdEl) customerIdEl.value = '';
}

async function handleCustomerSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const customerIdEl = document.getElementById('customerId');
    const customerNameEl = document.getElementById('customerName');
    const customerEmailEl = document.getElementById('customerEmail');
    const customerPhoneEl = document.getElementById('customerPhone');
    const customerAddressEl = document.getElementById('customerAddress');
    
    if (!customerIdEl || !customerNameEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const customerId = customerIdEl.value;
    
    // Validate form
    const validationRules = {
        customerName: { required: true, minLength: 2 }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const customerData = {
        name: customerNameEl.value.trim(),
        email: customerEmailEl ? customerEmailEl.value.trim() || null : null,
        phone: customerPhoneEl ? customerPhoneEl.value.trim() || null : null,
        address: customerAddressEl ? customerAddressEl.value.trim() || null : null
    };
    
    try {
        if (customerId) {
            await apiRequest(`/customers/${customerId}`, {
                method: 'PUT',
                body: customerData
            });
            showNotification(window.i18n ? window.i18n.t('messages.customerUpdated') : 'Customer updated successfully');
        } else {
            await apiRequest('/customers', {
                method: 'POST',
                body: customerData
            });
            showNotification(window.i18n ? window.i18n.t('messages.customerCreated') : 'Customer created successfully');
        }
        
        closeCustomerModal();
        await loadCustomers();
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorSaving', { item: window.i18n.t('customers.title') }) : 'Error saving customer');
        showNotification(errorMsg, 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editCustomer(customerId) {
    openCustomerModal(customerId);
}

async function deleteCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        const notFoundMsg = window.i18n ? window.i18n.t('messages.errorLoading', { item: window.i18n.t('customers.title') }) : 'Customer not found';
        showNotification(notFoundMsg, 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this customer?\n\nName: ${customer.name}`)) {
        return;
    }
    
    try {
        await apiRequest(`/customers/${customerId}`, {
            method: 'DELETE'
        });
        showNotification('Customer deleted successfully');
        await loadCustomers();
    } catch (error) {
        showNotification(error.message || 'Error deleting customer', 'error');
    }
}

// Expose functions to global scope
window.openCustomerModal = openCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.editCustomer = editCustomer;
window.deleteCustomer = deleteCustomer;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomers();
    setupEventListeners();
});

