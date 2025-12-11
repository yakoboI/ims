let suppliers = [];

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadSuppliers() {
    const tbody = document.getElementById('suppliersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 6);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    
    try {
        // Get shop filter if superadmin has selected a shop
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        suppliers = await apiRequest(`/suppliers${queryParams}`);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderSuppliersTable(suppliers);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading suppliers', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Error loading suppliers</td></tr>';
        }
        if (suppliers.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.suppliers || {
                icon: '<i class="fas fa-truck fa-icon-primary" style="font-size: 4rem;"></i>',
                title: 'No Suppliers',
                message: 'No suppliers have been added yet.',
                actionLabel: 'Add Supplier',
                actionCallback: () => openSupplierModal()
            });
        }
    }
}

function renderSuppliersTable(suppliersList) {
    const tbody = document.getElementById('suppliersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (suppliersList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.suppliers || {
            icon: '<i class="fas fa-truck fa-icon-primary" style="font-size: 4rem;"></i>',
            title: 'No Suppliers',
            message: 'No suppliers have been added yet.',
            actionLabel: 'Add Supplier',
            actionCallback: () => openSupplierModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = suppliersList.map(supplier => `
        <tr>
            <td data-label="Name"><strong>${escapeHtml(supplier.name || '-')}</strong></td>
            <td data-label="Contact Person">${escapeHtml(supplier.contact_person || '-')}</td>
            <td data-label="Email">${escapeHtml(supplier.email || '-')}</td>
            <td data-label="Phone">${escapeHtml(supplier.phone || '-')}</td>
            <td data-label="Address">${escapeHtml(supplier.address || '-')}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editSupplier(${supplier.id})" aria-label="Edit supplier ${escapeHtml(supplier.name || supplier.id)}">
                    <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSupplier(${supplier.id})" aria-label="Delete supplier ${escapeHtml(supplier.name || supplier.id)}">
                    <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    const supplierForm = document.getElementById('supplierForm');
    
    if (supplierForm) {
        supplierForm.addEventListener('submit', handleSupplierSubmit);
    }
}

async function openSupplierModal(supplierId = null) {
    const modal = document.getElementById('supplierModal');
    const form = document.getElementById('supplierForm');
    const title = document.getElementById('supplierModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (supplierId) {
        title.textContent = 'Edit Supplier';
        const supplier = suppliers.find(s => s.id === supplierId);
        if (supplier) {
            const supplierIdEl = document.getElementById('supplierId');
            const supplierNameEl = document.getElementById('supplierName');
            const supplierContactPersonEl = document.getElementById('supplierContactPerson');
            const supplierEmailEl = document.getElementById('supplierEmail');
            const supplierPhoneEl = document.getElementById('supplierPhone');
            const supplierAddressEl = document.getElementById('supplierAddress');
            
            if (supplierIdEl) supplierIdEl.value = supplier.id;
            if (supplierNameEl) supplierNameEl.value = supplier.name || '';
            if (supplierContactPersonEl) supplierContactPersonEl.value = supplier.contact_person || '';
            if (supplierEmailEl) supplierEmailEl.value = supplier.email || '';
            if (supplierPhoneEl) supplierPhoneEl.value = supplier.phone || '';
            if (supplierAddressEl) supplierAddressEl.value = supplier.address || '';
        }
    } else {
        title.textContent = 'Add Supplier';
        form.reset();
        const supplierIdEl = document.getElementById('supplierId');
        if (supplierIdEl) supplierIdEl.value = '';
    }
    
    const firstInput = document.getElementById('supplierName');
    openModal('supplierModal', firstInput);
}

function closeSupplierModal() {
    closeModal('supplierModal');
    const form = document.getElementById('supplierForm');
    const supplierIdEl = document.getElementById('supplierId');
    
    if (form) form.reset();
    if (supplierIdEl) supplierIdEl.value = '';
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const supplierIdEl = document.getElementById('supplierId');
    const supplierNameEl = document.getElementById('supplierName');
    const supplierContactPersonEl = document.getElementById('supplierContactPerson');
    const supplierEmailEl = document.getElementById('supplierEmail');
    const supplierPhoneEl = document.getElementById('supplierPhone');
    const supplierAddressEl = document.getElementById('supplierAddress');
    
    if (!supplierIdEl || !supplierNameEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const supplierId = supplierIdEl.value;
    
    // Validate form
    const validationRules = {
        supplierName: { required: true, minLength: 2 }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const supplierData = {
        name: supplierNameEl.value.trim(),
        contact_person: supplierContactPersonEl ? supplierContactPersonEl.value.trim() || null : null,
        email: supplierEmailEl ? supplierEmailEl.value.trim() || null : null,
        phone: supplierPhoneEl ? supplierPhoneEl.value.trim() || null : null,
        address: supplierAddressEl ? supplierAddressEl.value.trim() || null : null
    };
    
    try {
        if (supplierId) {
            await apiRequest(`/suppliers/${supplierId}`, {
                method: 'PUT',
                body: supplierData
            });
            showNotification('Supplier updated successfully');
        } else {
            await apiRequest('/suppliers', {
                method: 'POST',
                body: supplierData
            });
            showNotification('Supplier added successfully');
        }
        
        closeSupplierModal();
        await loadSuppliers();
    } catch (error) {
        showNotification(error.message || 'Error saving supplier', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editSupplier(supplierId) {
    openSupplierModal(supplierId);
}

async function deleteSupplier(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) {
        showNotification('Supplier not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this supplier?\n\nName: ${supplier.name}`)) {
        return;
    }
    
    try {
        await apiRequest(`/suppliers/${supplierId}`, {
            method: 'DELETE'
        });
        showNotification('Supplier deleted successfully');
        await loadSuppliers();
    } catch (error) {
        showNotification(error.message || 'Error deleting supplier', 'error');
    }
}

// Expose functions to global scope
window.openSupplierModal = openSupplierModal;
window.closeSupplierModal = closeSupplierModal;
window.editSupplier = editSupplier;
window.deleteSupplier = deleteSupplier;

document.addEventListener('DOMContentLoaded', async () => {
    await loadSuppliers();
    setupEventListeners();
});

