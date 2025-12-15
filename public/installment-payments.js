let installmentPlans = [];
let customers = [];
let items = [];
let currentPlanId = null;
let currentViewingPlanId = null;
let currentComponent = 'plans'; // Current active component tab
let allPayments = []; // Store all payments for payment history component

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(amount) {
    if (amount == null || amount === '') return '0.00';
    return parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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

function formatDateTime(dateString) {
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

// Load customers and products for dropdowns
async function loadCustomersAndProducts() {
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        
        [customers, items] = await Promise.all([
            apiRequest('/customers'),
            apiRequest(`/items${queryParams}`)
        ]);
        
        populateCustomerDropdown();
        populateProductDropdown();
    } catch (error) {
        console.error('Error loading customers and products:', error);
        const errorMsg = window.i18n ? window.i18n.t('messages.errorLoading', { item: window.i18n.t('nav.customers') + ' & ' + window.i18n.t('inventory.title') }) : 'Error loading customers and products';
        showNotification(errorMsg, 'error');
    }
}

function populateCustomerDropdown() {
    const customerSelect = document.getElementById('planCustomer');
    if (!customerSelect) return;
    
    const selectCustomer = window.i18n ? window.i18n.t('common.select') + ' ' + window.i18n.t('nav.customers') : 'Select Customer';
    customerSelect.innerHTML = `<option value="">${selectCustomer}</option>` +
        customers.map(customer => 
            `<option value="${customer.id}">${escapeHtml(customer.name || 'Unknown')} ${customer.phone ? `(${escapeHtml(customer.phone)})` : ''}</option>`
        ).join('');
}

function populateProductDropdown() {
    const productSelect = document.getElementById('planProduct');
    if (!productSelect) return;
    
    const selectProduct = window.i18n ? window.i18n.t('common.select') + ' ' + window.i18n.t('inventory.title') : 'Select Product';
    productSelect.innerHTML = `<option value="">${selectProduct}</option>` +
        items.map(item => 
            `<option value="${item.id}" data-price="${item.unit_price || 0}">${escapeHtml(item.name || 'Unknown')} - ${formatCurrency(item.unit_price || 0)}</option>`
        ).join('');
    
    // Auto-fill price when product is selected
    productSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const price = selectedOption.getAttribute('data-price');
        const totalPriceInput = document.getElementById('planTotalPrice');
        if (totalPriceInput && price) {
            totalPriceInput.value = parseFloat(price).toFixed(2);
            calculateRemainingAfterDownPayment();
        }
    });
}

function calculateRemainingAfterDownPayment() {
    const totalPrice = parseFloat(document.getElementById('planTotalPrice')?.value || 0);
    const downPayment = parseFloat(document.getElementById('planDownPayment')?.value || 0);
    const remaining = totalPrice - downPayment;
    
    if (remaining > 0) {
        const installmentAmountInput = document.getElementById('planInstallmentAmount');
        const numberOfInstallmentsInput = document.getElementById('planNumberOfInstallments');
        
        if (installmentAmountInput && numberOfInstallmentsInput) {
            // Auto-calculate if one is filled
            if (installmentAmountInput.value && !numberOfInstallmentsInput.value) {
                const amount = parseFloat(installmentAmountInput.value);
                if (amount > 0) {
                    numberOfInstallmentsInput.value = Math.ceil(remaining / amount);
                }
            } else if (numberOfInstallmentsInput.value && !installmentAmountInput.value) {
                const installments = parseInt(numberOfInstallmentsInput.value);
                if (installments > 0) {
                    installmentAmountInput.value = (remaining / installments).toFixed(2);
                }
            }
        }
    }
}

// Add event listeners for auto-calculation
document.addEventListener('DOMContentLoaded', function() {
    const totalPriceInput = document.getElementById('planTotalPrice');
    const downPaymentInput = document.getElementById('planDownPayment');
    const installmentAmountInput = document.getElementById('planInstallmentAmount');
    const numberOfInstallmentsInput = document.getElementById('planNumberOfInstallments');
    
    if (totalPriceInput) {
        totalPriceInput.addEventListener('input', calculateRemainingAfterDownPayment);
    }
    if (downPaymentInput) {
        downPaymentInput.addEventListener('input', calculateRemainingAfterDownPayment);
    }
    if (installmentAmountInput) {
        installmentAmountInput.addEventListener('input', calculateRemainingAfterDownPayment);
    }
    if (numberOfInstallmentsInput) {
        numberOfInstallmentsInput.addEventListener('input', calculateRemainingAfterDownPayment);
    }
});

async function loadInstallmentPlans() {
    const tbody = document.getElementById('installmentPlansTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 8);
    }
    const loadingText = window.i18n ? window.i18n.t('common.loading') : 'Loading...';
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center">${loadingText}</td></tr>`;
    
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const response = await apiRequest(`/installment-payments${queryParams}`);
        installmentPlans = Array.isArray(response) ? response : [];
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderInstallmentPlansTable(installmentPlans);
    } catch (error) {
        installmentPlans = [];
        if (tableContainer) hideTableSkeleton(tableContainer);
        const errorMsg = window.i18n ? window.i18n.t('messages.errorLoadingPlans') : 'Error loading installment plans';
        showNotification(errorMsg, 'error');
        if (tbody) {
            const errorText = window.i18n ? window.i18n.t('messages.errorLoadingPlans') : 'Error loading installment plans';
            tbody.innerHTML = `<tr><td colspan="8" class="text-center">${errorText}</td></tr>`;
        }
        if (installmentPlans.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.installmentPlans || {
                icon: '<i class="fas fa-credit-card fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Installment Plans',
                message: 'No installment payment plans have been created yet.',
                actionLabel: 'Create Installment Plan',
                actionCallback: () => openInstallmentPlanModal()
            });
        }
    }
}

function renderInstallmentPlansTable(plansList) {
    const tbody = document.getElementById('installmentPlansTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (!Array.isArray(plansList)) {
        plansList = [];
    }
    
    if (plansList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.installmentPlans || {
            icon: '<i class="fas fa-credit-card fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Installment Plans',
            message: 'No installment payment plans have been created yet.',
            actionLabel: 'Create Installment Plan',
            actionCallback: () => openInstallmentPlanModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    const rows = plansList.map(plan => {
        const totalPrice = parseFloat(plan.total_price || 0);
        const paidAmount = parseFloat(plan.paid_amount || 0);
        const remaining = totalPrice - paidAmount;
        const status = plan.status || 'active';
        
        let statusBadge = 'badge-info';
        let statusText = 'Active';
        if (status === 'completed') {
            statusBadge = 'badge-success';
            statusText = 'Completed';
        } else if (status === 'cancelled') {
            statusBadge = 'badge-danger';
            statusText = 'Cancelled';
        }
        
        const customer = customers.find(c => c.id === plan.customer_id);
        const product = items.find(i => i.id === plan.item_id);
        
        return `
            <tr>
                <td data-label="Customer"><strong>${escapeHtml(customer?.name || 'Unknown')}</strong></td>
                <td data-label="Product">${escapeHtml(product?.name || 'Unknown')}</td>
                <td data-label="Total Price" class="text-right">${formatCurrency(totalPrice)}</td>
                <td data-label="Paid Amount" class="text-right"><strong style="color: var(--success-color);">${formatCurrency(paidAmount)}</strong></td>
                <td data-label="Remaining" class="text-right"><strong style="color: var(--danger-color);">${formatCurrency(remaining)}</strong></td>
                <td data-label="Status"><span class="badge ${statusBadge}">${statusText}</span></td>
                <td data-label="Created">${formatDate(plan.created_at)}</td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewPlan(${plan.id})" aria-label="View plan ${plan.id}">
                        <i class="fas fa-eye"></i> <span class="btn-text-mobile">View</span>
                    </button>
                    ${status === 'active' ? `
                        <button class="btn btn-sm btn-success" onclick="recordPayment(${plan.id})" aria-label="Record payment for plan ${plan.id}">
                            <i class="fas fa-money-bill-wave"></i> <span class="btn-text-mobile">Pay</span>
                        </button>
                    ` : ''}
                    ${status === 'active' ? `
                        <button class="btn btn-sm btn-primary" onclick="editPlan(${plan.id})" aria-label="Edit plan ${plan.id}">
                            <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deletePlan(${plan.id})" aria-label="Delete plan ${plan.id}">
                        <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Create temporary container for innerHTML assignment
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rows.join('');
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function setupEventListeners() {
    const planForm = document.getElementById('installmentPlanForm');
    const paymentForm = document.getElementById('recordPaymentForm');
    
    if (planForm) {
        planForm.addEventListener('submit', handleInstallmentPlanSubmit);
    }
    
    if (paymentForm) {
        paymentForm.addEventListener('submit', handleRecordPaymentSubmit);
    }
}

async function openInstallmentPlanModal(planId = null) {
    await loadCustomersAndProducts();
    
    const modal = document.getElementById('installmentPlanModal');
    const form = document.getElementById('installmentPlanForm');
    const title = document.getElementById('installmentPlanModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (planId) {
        title.textContent = window.i18n ? window.i18n.t('nav.installmentPayments') + ' - ' + (window.i18n ? window.i18n.t('common.edit') : 'Edit') : 'Edit Installment Plan';
        currentPlanId = planId;
        const plan = installmentPlans.find(p => p.id === planId);
        if (plan) {
            populatePlanForm(plan);
        }
    } else {
        title.textContent = window.i18n ? window.i18n.t('nav.installmentPayments') + ' - ' + (window.i18n ? window.i18n.t('common.add') : 'Create') : 'Create Installment Plan';
        currentPlanId = null;
        form.reset();
        // Set default payment date to today
        const paymentDateInput = document.getElementById('paymentDate');
        if (paymentDateInput) {
            paymentDateInput.value = new Date().toISOString().split('T')[0];
        }
    }
    
    const firstInput = document.getElementById('planCustomer');
    openModal('installmentPlanModal', firstInput);
}

function populatePlanForm(plan) {
    const planIdEl = document.getElementById('planId');
    const customerEl = document.getElementById('planCustomer');
    const productEl = document.getElementById('planProduct');
    const totalPriceEl = document.getElementById('planTotalPrice');
    const downPaymentEl = document.getElementById('planDownPayment');
    const installmentAmountEl = document.getElementById('planInstallmentAmount');
    const numberOfInstallmentsEl = document.getElementById('planNumberOfInstallments');
    const notesEl = document.getElementById('planNotes');
    
    if (planIdEl) planIdEl.value = plan.id;
    if (customerEl) customerEl.value = plan.customer_id || '';
    if (productEl) productEl.value = plan.item_id || '';
    if (totalPriceEl) totalPriceEl.value = plan.total_price || '';
    if (downPaymentEl) downPaymentEl.value = plan.down_payment || '';
    if (installmentAmountEl) installmentAmountEl.value = plan.installment_amount || '';
    if (numberOfInstallmentsEl) numberOfInstallmentsEl.value = plan.number_of_installments || '';
    if (notesEl) notesEl.value = plan.notes || '';
}

function closeInstallmentPlanModal() {
    closeModal('installmentPlanModal');
    const form = document.getElementById('installmentPlanForm');
    const planIdEl = document.getElementById('planId');
    
    if (form) form.reset();
    if (planIdEl) planIdEl.value = '';
    currentPlanId = null;
}

async function handleInstallmentPlanSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const planIdEl = document.getElementById('planId');
    const customerEl = document.getElementById('planCustomer');
    const productEl = document.getElementById('planProduct');
    const totalPriceEl = document.getElementById('planTotalPrice');
    const downPaymentEl = document.getElementById('planDownPayment');
    const installmentAmountEl = document.getElementById('planInstallmentAmount');
    const numberOfInstallmentsEl = document.getElementById('planNumberOfInstallments');
    const notesEl = document.getElementById('planNotes');
    
    if (!planIdEl || !customerEl || !productEl || !totalPriceEl || !downPaymentEl || !installmentAmountEl || !numberOfInstallmentsEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    // Validate form
    const validationRules = {
        planCustomer: { required: true },
        planProduct: { required: true },
        planTotalPrice: { required: true, min: 0.01 },
        planDownPayment: { required: true, min: 0 },
        planInstallmentAmount: { required: true, min: 0.01 },
        planNumberOfInstallments: { required: true, min: 1 }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    const totalPrice = parseFloat(totalPriceEl.value);
    const downPayment = parseFloat(downPaymentEl.value);
    const installmentAmount = parseFloat(installmentAmountEl.value);
    const numberOfInstallments = parseInt(numberOfInstallmentsEl.value);
    
    // Validate business logic
    if (downPayment >= totalPrice) {
        showNotification(window.i18n ? window.i18n.t('messages.downPaymentMustBeLessThanTotal') : 'Down payment must be less than total price', 'error');
        return;
    }
    
    const remaining = totalPrice - downPayment;
    const expectedTotal = installmentAmount * numberOfInstallments;
    
    if (Math.abs(expectedTotal - remaining) > 0.01) {
        if (!confirm(`The installment amount (${formatCurrency(installmentAmount)} × ${numberOfInstallments} = ${formatCurrency(expectedTotal)}) does not match the remaining balance (${formatCurrency(remaining)}). Do you want to continue?`)) {
            return;
        }
    }
    
    // Show loading state
    showFormLoading(form);
    
    const planData = {
        customer_id: parseInt(customerEl.value),
        item_id: parseInt(productEl.value),
        total_price: totalPrice,
        down_payment: downPayment,
        installment_amount: installmentAmount,
        number_of_installments: numberOfInstallments,
        notes: notesEl ? notesEl.value.trim() || null : null
    };
    
    try {
        if (planIdEl.value) {
            await apiRequest(`/installment-payments/${planIdEl.value}`, {
                method: 'PUT',
                body: planData
            });
            showNotification(window.i18n ? window.i18n.t('messages.planUpdated') : 'Installment plan updated successfully');
        } else {
            await apiRequest('/installment-payments', {
                method: 'POST',
                body: planData
            });
            showNotification(window.i18n ? window.i18n.t('messages.planCreated') : 'Installment plan created successfully');
        }
        
        closeInstallmentPlanModal();
        await loadInstallmentPlans();
        await loadCustomersAndProducts(); // Reload to refresh dropdowns
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorSaving', { item: window.i18n.t('nav.installmentPayments') }) : 'Error saving installment plan');
        showNotification(errorMsg, 'error');
    } finally {
        hideFormLoading(form);
    }
}

// Handle payment type change
function handlePaymentTypeChange() {
    const paymentType = document.getElementById('paymentType')?.value;
    const serviceDateGroup = document.getElementById('serviceDateGroup');
    const serviceDateInput = document.getElementById('serviceDate');
    const installationCostGroup = document.getElementById('installationCostGroup');
    const serviceFeeGroup = document.getElementById('serviceFeeGroup');
    const serviceDateRequired = document.getElementById('serviceDateRequired');
    
    if (paymentType === 'per_visit') {
        if (serviceDateGroup) serviceDateGroup.style.display = 'block';
        if (installationCostGroup) installationCostGroup.style.display = 'block';
        if (serviceFeeGroup) serviceFeeGroup.style.display = 'block';
        if (serviceDateRequired) serviceDateRequired.style.display = 'inline';
        if (serviceDateInput) {
            serviceDateInput.required = true;
            const today = new Date().toISOString().split('T')[0];
            serviceDateInput.max = today;
        }
    } else {
        if (serviceDateGroup) serviceDateGroup.style.display = 'none';
        if (installationCostGroup) installationCostGroup.style.display = 'none';
        if (serviceFeeGroup) serviceFeeGroup.style.display = 'none';
        if (serviceDateRequired) serviceDateRequired.style.display = 'none';
        if (serviceDateInput) {
            serviceDateInput.required = false;
            serviceDateInput.value = '';
        }
        // Clear installation and service fee fields
        const installationCostInput = document.getElementById('installationCost');
        const serviceFeeInput = document.getElementById('serviceFee');
        if (installationCostInput) installationCostInput.value = '0';
        if (serviceFeeInput) serviceFeeInput.value = '0';
    }
    
    // Recalculate payment amount if per-visit
    if (paymentType === 'per_visit') {
        calculatePerVisitAmount();
    }
}

// Handle partial payment checkbox change
function handlePartialPaymentChange() {
    const isPartial = document.getElementById('isPartialPayment')?.checked;
    const expectedAmountGroup = document.getElementById('expectedAmountGroup');
    const expectedAmountInput = document.getElementById('expectedAmount');
    
    if (isPartial) {
        if (expectedAmountGroup) expectedAmountGroup.style.display = 'block';
        if (expectedAmountInput) {
            expectedAmountInput.required = true;
            // Set default expected amount to current payment amount
            const paymentAmount = parseFloat(document.getElementById('paymentAmount')?.value || 0);
            if (paymentAmount > 0 && !expectedAmountInput.value) {
                expectedAmountInput.value = paymentAmount.toFixed(2);
            }
        }
    } else {
        if (expectedAmountGroup) expectedAmountGroup.style.display = 'none';
        if (expectedAmountInput) {
            expectedAmountInput.required = false;
            expectedAmountInput.value = '';
        }
    }
}

// Calculate per-visit amount from installation cost + service fee
function calculatePerVisitAmount() {
    const installationCost = parseFloat(document.getElementById('installationCost')?.value || 0);
    const serviceFee = parseFloat(document.getElementById('serviceFee')?.value || 0);
    const paymentAmountInput = document.getElementById('paymentAmount');
    
    if (paymentAmountInput && installationCost + serviceFee > 0) {
        const total = installationCost + serviceFee;
        paymentAmountInput.value = total.toFixed(2);
    }
}

// Add event listeners for installation cost and service fee
document.addEventListener('DOMContentLoaded', function() {
    const installationCostInput = document.getElementById('installationCost');
    const serviceFeeInput = document.getElementById('serviceFee');
    
    if (installationCostInput) {
        installationCostInput.addEventListener('input', function() {
            if (document.getElementById('paymentType')?.value === 'per_visit') {
                calculatePerVisitAmount();
            }
        });
    }
    
    if (serviceFeeInput) {
        serviceFeeInput.addEventListener('input', function() {
            if (document.getElementById('paymentType')?.value === 'per_visit') {
                calculatePerVisitAmount();
            }
        });
    }
});

async function recordPayment(planId) {
    try {
        const plan = await apiRequest(`/installment-payments/${planId}`);
        currentPlanId = planId;
        
        const modal = document.getElementById('recordPaymentModal');
        const title = document.getElementById('recordPaymentModalTitle');
        const planIdInput = document.getElementById('paymentPlanId');
        const customerNameInput = document.getElementById('paymentCustomerName');
        const productNameInput = document.getElementById('paymentProductName');
        const totalPriceInput = document.getElementById('paymentTotalPrice');
        const paidSoFarInput = document.getElementById('paymentPaidSoFar');
        const remainingBalanceInput = document.getElementById('paymentRemainingBalance');
        const paymentDateInput = document.getElementById('paymentDate');
        const serviceDateInput = document.getElementById('serviceDate');
        
        if (!modal || !title) return;
        
        const customer = customers.find(c => c.id === plan.customer_id);
        const product = items.find(i => i.id === plan.item_id);
        const totalPrice = parseFloat(plan.total_price || 0);
        const paidAmount = parseFloat(plan.paid_amount || 0);
        const remaining = totalPrice - paidAmount;
        const installmentAmount = parseFloat(plan.installment_amount || 0);
        
        title.textContent = `Record Payment - ${escapeHtml(customer?.name || 'Customer')}`;
        if (planIdInput) planIdInput.value = planId;
        if (customerNameInput) customerNameInput.value = customer?.name || 'Unknown';
        if (productNameInput) productNameInput.value = product?.name || 'Unknown';
        if (totalPriceInput) totalPriceInput.value = formatCurrency(totalPrice);
        if (paidSoFarInput) paidSoFarInput.value = formatCurrency(paidAmount);
        if (remainingBalanceInput) remainingBalanceInput.value = formatCurrency(remaining);
        
        const today = new Date().toISOString().split('T')[0];
        if (paymentDateInput) {
            paymentDateInput.value = today;
            paymentDateInput.max = today; // Can't be future date
        }
        if (serviceDateInput) {
            serviceDateInput.max = today; // Can't be future date
        }
        
        // Set default payment amount based on installment amount for per-visit
        const paymentAmountInput = document.getElementById('paymentAmount');
        if (paymentAmountInput) {
            paymentAmountInput.max = remaining;
            paymentAmountInput.value = '';
        }
        
        // Set default installation cost and service fee for per-visit
        const installationCostInput = document.getElementById('installationCost');
        const serviceFeeInput = document.getElementById('serviceFee');
        if (installationCostInput) installationCostInput.value = '0';
        if (serviceFeeInput) {
            // Default service fee to installment amount for per-visit
            serviceFeeInput.value = installmentAmount.toFixed(2);
        }
        
        // Reset form
        const paymentForm = document.getElementById('recordPaymentForm');
        if (paymentForm) {
            paymentForm.reset();
            // Restore the values we just set
            if (planIdInput) planIdInput.value = planId;
            if (customerNameInput) customerNameInput.value = customer?.name || 'Unknown';
            if (productNameInput) productNameInput.value = product?.name || 'Unknown';
            if (totalPriceInput) totalPriceInput.value = formatCurrency(totalPrice);
            if (paidSoFarInput) paidSoFarInput.value = formatCurrency(paidAmount);
            if (remainingBalanceInput) remainingBalanceInput.value = formatCurrency(remaining);
            if (paymentDateInput) {
                paymentDateInput.value = today;
                paymentDateInput.max = today;
            }
            if (serviceDateInput) {
                serviceDateInput.max = today;
            }
            if (paymentAmountInput) {
                paymentAmountInput.max = remaining;
            }
            if (serviceFeeInput) {
                serviceFeeInput.value = installmentAmount.toFixed(2);
            }
            
            // Reset payment type to default
            const paymentTypeInput = document.getElementById('paymentType');
            if (paymentTypeInput) {
                paymentTypeInput.value = 'full_contract';
                handlePaymentTypeChange();
            }
        }
        
        openModal('recordPaymentModal', paymentAmountInput);
    } catch (error) {
        showNotification('Error loading plan details', 'error');
    }
}

function closeRecordPaymentModal() {
    closeModal('recordPaymentModal');
    const form = document.getElementById('recordPaymentForm');
    const planIdInput = document.getElementById('paymentPlanId');
    
    if (form) form.reset();
    if (planIdInput) planIdInput.value = '';
    
    // Reset payment type and hide conditional fields
    const paymentTypeInput = document.getElementById('paymentType');
    if (paymentTypeInput) {
        paymentTypeInput.value = 'full_contract';
        handlePaymentTypeChange();
    }
    
    // Reset partial payment checkbox
    const isPartialPaymentInput = document.getElementById('isPartialPayment');
    if (isPartialPaymentInput) {
        isPartialPaymentInput.checked = false;
        handlePartialPaymentChange();
    }
    
    currentPlanId = null;
}

async function handleRecordPaymentSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const planIdInput = document.getElementById('paymentPlanId');
    const paymentTypeInput = document.getElementById('paymentType');
    const serviceDateInput = document.getElementById('serviceDate');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const isPartialPaymentInput = document.getElementById('isPartialPayment');
    const expectedAmountInput = document.getElementById('expectedAmount');
    const installationCostInput = document.getElementById('installationCost');
    const serviceFeeInput = document.getElementById('serviceFee');
    const paymentMethodInput = document.getElementById('paymentMethod');
    const paymentDateInput = document.getElementById('paymentDate');
    const receiptNumberInput = document.getElementById('receiptNumber');
    const transactionReferenceInput = document.getElementById('transactionReference');
    const paymentNotesInput = document.getElementById('paymentNotes');
    
    if (!planIdInput || !paymentAmountInput || !paymentMethodInput || !paymentDateInput || !paymentTypeInput) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const paymentType = paymentTypeInput.value;
    const isPartialPayment = isPartialPaymentInput?.checked || false;
    
    // Validate form
    const validationRules = {
        paymentAmount: { required: true, min: 0.01 },
        paymentMethod: { required: true },
        paymentDate: { required: true }
    };
    
    // Add service_date validation for per-visit payments
    if (paymentType === 'per_visit') {
        validationRules.serviceDate = { required: true };
    }
    
    // Add expected_amount validation for partial payments
    if (isPartialPayment) {
        validationRules.expectedAmount = { required: true, min: 0.01 };
    }
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    const paymentAmount = parseFloat(paymentAmountInput.value);
    const serviceDate = serviceDateInput?.value || null;
    const expectedAmount = expectedAmountInput?.value ? parseFloat(expectedAmountInput.value) : null;
    const installationCost = installationCostInput ? parseFloat(installationCostInput.value || 0) : 0;
    const serviceFee = serviceFeeInput ? parseFloat(serviceFeeInput.value || 0) : 0;
    
    // Validate per-visit payment components
    if (paymentType === 'per_visit') {
        const totalComponents = installationCost + serviceFee;
        if (totalComponents > 0 && Math.abs(paymentAmount - totalComponents) > 0.01) {
            const msg = window.i18n ? window.i18n.t('messages.paymentAmountMustEqualComponents', {
                amount: formatCurrency(paymentAmount),
                cost: formatCurrency(installationCost),
                fee: formatCurrency(serviceFee),
                total: formatCurrency(totalComponents)
            }) : `Payment amount (${formatCurrency(paymentAmount)}) must equal Installation Cost (${formatCurrency(installationCost)}) + Service Fee (${formatCurrency(serviceFee)}) = ${formatCurrency(totalComponents)}`;
            showNotification(msg, 'error');
            return;
        }
    }
    
    // Validate partial payment
    if (isPartialPayment) {
        if (!expectedAmount || expectedAmount <= 0) {
            showNotification(window.i18n ? window.i18n.t('messages.expectedAmountRequiredForPartial') : 'Expected amount is required for partial payments', 'error');
            return;
        }
        if (paymentAmount >= expectedAmount) {
            showNotification(window.i18n ? window.i18n.t('messages.partialPaymentMustBeLessThanExpected') : 'Partial payment amount must be less than expected amount', 'error');
            return;
        }
    }
    
    // Get current plan to check remaining balance
    try {
        const plan = await apiRequest(`/installment-payments/${planIdInput.value}`);
        const totalPrice = parseFloat(plan.total_price || 0);
        const paidAmount = parseFloat(plan.paid_amount || 0);
        const remaining = totalPrice - paidAmount;
        
        // For full contract payments, validate against remaining balance
        if (paymentType === 'full_contract' && paymentAmount > remaining) {
            const msg = window.i18n ? window.i18n.t('messages.paymentAmountCannotExceedBalance', { balance: formatCurrency(remaining) }) : `Payment amount cannot exceed remaining balance of ${formatCurrency(remaining)}`;
            showNotification(msg, 'error');
            return;
        }
        
        if (paymentAmount <= 0) {
            showNotification(window.i18n ? window.i18n.t('messages.paymentAmountMustBeGreaterThanZero') : 'Payment amount must be greater than 0', 'error');
            return;
        }
    } catch (error) {
        showNotification(window.i18n ? window.i18n.t('messages.errorValidatingPayment') : 'Error validating payment', 'error');
        return;
    }
    
    // Validate dates
    const paymentDate = new Date(paymentDateInput.value);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (paymentDate > today) {
        showNotification(window.i18n ? window.i18n.t('messages.paymentDateCannotBeInFuture') : 'Payment date cannot be in the future', 'error');
        return;
    }
    
    if (paymentType === 'per_visit' && serviceDate) {
        const serviceDateObj = new Date(serviceDate);
        if (serviceDateObj > today) {
            showNotification(window.i18n ? window.i18n.t('messages.serviceDateCannotBeInFuture') : 'Service date cannot be in the future. Service must be delivered before payment is recorded.', 'error');
            return;
        }
    }
    
    // Show loading state
    showFormLoading(form);
    
    const paymentData = {
        installment_plan_id: parseInt(planIdInput.value),
        payment_amount: paymentAmount,
        payment_method: paymentMethodInput.value,
        payment_date: paymentDateInput.value,
        notes: paymentNotesInput ? paymentNotesInput.value.trim() || null : null,
        // Pay-per-visit fields
        payment_type: paymentType,
        service_date: serviceDate,
        receipt_number: receiptNumberInput?.value.trim() || null,
        transaction_reference: transactionReferenceInput?.value.trim() || null,
        is_partial_payment: isPartialPayment,
        expected_amount: expectedAmount,
        installation_cost: installationCost,
        service_fee: serviceFee
    };
    
    try {
        const response = await apiRequest('/installment-payments/payments', {
            method: 'POST',
            body: paymentData
        });
        
        const message = response.message || 'Payment recorded successfully';
        if (response.receipt_number) {
            const successMsg = window.i18n ? window.i18n.t('messages.paymentRecordedWithReceipt', { message: message, receipt: response.receipt_number }) : `${message} (Receipt: ${response.receipt_number})`;
            showNotification(successMsg, 'success');
        } else {
            showNotification(message, 'success');
        }
        
        closeRecordPaymentModal();
        await loadInstallmentPlans();
        
        // Check if plan is now completed
        const updatedPlan = await apiRequest(`/installment-payments/${planIdInput.value}`);
        const newPaidAmount = parseFloat(updatedPlan.paid_amount || 0);
        const totalPrice = parseFloat(updatedPlan.total_price || 0);
        
        if (newPaidAmount >= totalPrice && updatedPlan.status === 'active') {
            showNotification(window.i18n ? window.i18n.t('messages.planCompleted') : 'Installment plan completed! Product can now be delivered.', 'success');
        }
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorSaving', { item: window.i18n.t('common.amount') }) : 'Error recording payment');
        showNotification(errorMsg, 'error');
    } finally {
        hideFormLoading(form);
    }
}

async function viewPlan(planId) {
    try {
        const plan = await apiRequest(`/installment-payments/${planId}`);
        const payments = await apiRequest(`/installment-payments/${planId}/payments`);
        
        const modal = document.getElementById('viewPlanModal');
        const title = document.getElementById('viewPlanModalTitle');
        const content = document.getElementById('planDetailsContent');
        const recordPaymentBtn = document.getElementById('recordPaymentFromViewBtn');
        
        if (!modal || !title || !content) return;
        
        const customer = customers.find(c => c.id === plan.customer_id);
        const product = items.find(i => i.id === plan.item_id);
        const totalPrice = parseFloat(plan.total_price || 0);
        const paidAmount = parseFloat(plan.paid_amount || 0);
        const remaining = totalPrice - paidAmount;
        const status = plan.status || 'active';
        
        let statusBadge = 'badge-info';
        let statusText = 'Active';
        if (status === 'completed') {
            statusBadge = 'badge-success';
            statusText = 'Completed';
        } else if (status === 'cancelled') {
            statusBadge = 'badge-danger';
            statusText = 'Cancelled';
        }
        
        currentViewingPlanId = planId;
        title.textContent = `Installment Plan: ${escapeHtml(customer?.name || 'Customer')} - ${escapeHtml(product?.name || 'Product')}`;
        
        // Show/hide record payment button based on status
        if (recordPaymentBtn) {
            if (status === 'active' && remaining > 0) {
                recordPaymentBtn.style.display = 'inline-flex';
            } else {
                recordPaymentBtn.style.display = 'none';
            }
        }
        
        const progressPercentage = totalPrice > 0 ? Math.min((paidAmount / totalPrice) * 100, 100) : 0;
        
        content.innerHTML = `
            <div style="display: grid; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Plan Information</h3>
                        <p><strong>Customer:</strong> ${escapeHtml(customer?.name || 'Unknown')}</p>
                        <p><strong>Product:</strong> ${escapeHtml(product?.name || 'Unknown')}</p>
                        <p><strong>Status:</strong> <span class="badge ${statusBadge}">${statusText}</span></p>
                        <p><strong>Created:</strong> ${formatDateTime(plan.created_at)}</p>
                    </div>
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Payment Details</h3>
                        <p><strong>Total Price:</strong> ${formatCurrency(totalPrice)}</p>
                        <p><strong>Down Payment:</strong> ${formatCurrency(plan.down_payment || 0)}</p>
                        <p><strong>Installment Amount:</strong> ${formatCurrency(plan.installment_amount || 0)}</p>
                        <p><strong>Number of Installments:</strong> ${plan.number_of_installments || 0}</p>
                    </div>
                </div>
                
                <div>
                    <h3 style="margin-bottom: 0.5rem;">Payment Progress</h3>
                    <div style="background: #f5f5f5; border-radius: 4px; padding: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span><strong>Paid:</strong> ${formatCurrency(paidAmount)}</span>
                            <span><strong>Remaining:</strong> ${formatCurrency(remaining)}</span>
                        </div>
                        <div style="background: #e0e0e0; border-radius: 4px; height: 24px; overflow: hidden;">
                            <div style="background: ${status === 'completed' ? 'var(--success-color)' : 'var(--primary-color)'}; height: 100%; width: ${progressPercentage}%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.75rem;">
                                ${progressPercentage.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
                
                ${plan.notes ? `
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Notes</h3>
                        <p>${escapeHtml(plan.notes)}</p>
                    </div>
                ` : ''}
                
                <div>
                    <h3 style="margin-bottom: 0.5rem;">Payment History</h3>
                    ${payments.length > 0 ? `
                        <div style="overflow-x: auto;">
                            <table class="data-table" style="width: 100%;">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Service Date</th>
                                        <th class="text-right">Amount</th>
                                        <th>Method</th>
                                        <th>Receipt</th>
                                        <th>Status</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${payments.map(payment => {
                                        const paymentType = payment.payment_type || 'full_contract';
                                        const isPartial = payment.is_partial_payment === 1 || payment.is_partial_payment === true;
                                        const installationCost = parseFloat(payment.installation_cost || 0);
                                        const serviceFee = parseFloat(payment.service_fee || 0);
                                        const hasComponents = installationCost > 0 || serviceFee > 0;
                                        
                                        let typeBadge = paymentType === 'per_visit' 
                                            ? '<span class="badge badge-info">Per-Visit</span>' 
                                            : '<span class="badge badge-secondary">Full Contract</span>';
                                        
                                        let statusBadge = '';
                                        if (isPartial) {
                                            statusBadge = '<span class="badge badge-warning">Partial</span>';
                                        }
                                        
                                        let amountDisplay = formatCurrency(payment.payment_amount);
                                        if (hasComponents && paymentType === 'per_visit') {
                                            amountDisplay += `<br><small style="color: var(--text-secondary);">Install: ${formatCurrency(installationCost)} | Service: ${formatCurrency(serviceFee)}</small>`;
                                        }
                                        
                                        return `
                                        <tr>
                                            <td>${formatDateTime(payment.payment_date || payment.created_at)}</td>
                                            <td>${typeBadge}</td>
                                            <td>${payment.service_date ? formatDate(payment.service_date) : '-'}</td>
                                            <td class="text-right"><strong>${amountDisplay}</strong></td>
                                            <td>${escapeHtml(payment.payment_method || '-')}</td>
                                            <td><small>${escapeHtml(payment.receipt_number || payment.transaction_reference || '-')}</small></td>
                                            <td>${statusBadge}</td>
                                            <td>${escapeHtml(payment.notes || '-')}</td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p style="color: var(--text-secondary);">No payments recorded yet.</p>'}
                </div>
            </div>
        `;
        
        openModal('viewPlanModal');
    } catch (error) {
        showNotification('Error loading plan details', 'error');
    }
}

function closeViewPlanModal() {
    closeModal('viewPlanModal');
    currentViewingPlanId = null;
}

function recordPaymentFromView() {
    if (currentViewingPlanId) {
        closeViewPlanModal();
        setTimeout(() => {
            recordPayment(currentViewingPlanId);
        }, 300);
    }
}

function editPlan(planId) {
    openInstallmentPlanModal(planId);
}

async function deletePlan(planId) {
    const plan = installmentPlans.find(p => p.id === planId);
    if (!plan) {
        showNotification(window.i18n ? window.i18n.t('messages.planNotFound') : 'Plan not found', 'error');
        return;
    }
    
    const customer = customers.find(c => c.id === plan.customer_id);
    const product = items.find(i => i.id === plan.item_id);
    
    if (!confirm(`Are you sure you want to delete this installment plan?\n\nCustomer: ${customer?.name || 'Unknown'}\nProduct: ${product?.name || 'Unknown'}\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        await apiRequest(`/installment-payments/${planId}`, {
            method: 'DELETE'
        });
        showNotification(window.i18n ? window.i18n.t('messages.planDeleted') : 'Installment plan deleted successfully');
        await loadInstallmentPlans();
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorDeleting', { item: window.i18n.t('nav.installmentPayments') }) : 'Error deleting installment plan');
        showNotification(errorMsg, 'error');
    }
}

// Debounced filter function (will be initialized after DOM loads)
let debouncedApplyFilters = applyFilters;

function applyFilters() {
    const search = document.getElementById('searchPlans')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    
    let filtered = [...installmentPlans];
    
    // Status filter
    if (statusFilter) {
        filtered = filtered.filter(p => (p.status || 'active') === statusFilter);
    }
    
    // Search filter
    if (search) {
        filtered = filtered.filter(p => {
            const customer = customers.find(c => c.id === p.customer_id);
            const product = items.find(i => i.id === p.item_id);
            const customerName = (customer?.name || '').toLowerCase();
            const productName = (product?.name || '').toLowerCase();
            return customerName.includes(search) || productName.includes(search);
        });
    }
    
    // Use optimized rendering if available
    if (window.renderTableOptimized) {
        window.renderTableOptimized(() => renderInstallmentPlansTable(filtered), document.querySelector('.table-container'));
    } else {
        renderInstallmentPlansTable(filtered);
    }
}

function clearFilters() {
    const search = document.getElementById('searchPlans');
    const statusFilter = document.getElementById('statusFilter');
    
    if (search) search.value = '';
    if (statusFilter) statusFilter.value = '';
    
    renderInstallmentPlansTable(installmentPlans);
}

// Expose functions to global scope
window.openInstallmentPlanModal = openInstallmentPlanModal;
window.closeInstallmentPlanModal = closeInstallmentPlanModal;
window.editPlan = editPlan;
window.deletePlan = deletePlan;
window.viewPlan = viewPlan;
window.closeViewPlanModal = closeViewPlanModal;
window.recordPaymentFromView = recordPaymentFromView;
window.recordPayment = recordPayment;
window.closeRecordPaymentModal = closeRecordPaymentModal;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

// Setup component tab navigation
function setupComponentNavigation() {
    const tabs = document.querySelectorAll('.settings-tabs .tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const component = tab.getAttribute('data-component');
            switchComponent(component);
        });
    });
}

// Switch between components
function switchComponent(component) {
    currentComponent = component;
    
    // Update tab states
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(tab => {
        if (tab.getAttribute('data-component') === component) {
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
        } else {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        }
    });
    
    // Hide all component sections
    document.querySelectorAll('.component-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show selected component
    const selectedComponent = document.getElementById(`${component}Component`);
    if (selectedComponent) {
        selectedComponent.style.display = 'block';
        selectedComponent.classList.add('active');
        
        // Load component-specific data
        loadComponentData(component);
    }
}

// Load data for specific component
async function loadComponentData(component) {
    switch(component) {
        case 'plans':
            await loadInstallmentPlans();
            break;
        case 'payments':
            await loadAllPayments();
            break;
        case 'analytics':
            await loadAnalytics();
            break;
        case 'reports':
            // Reports component is static, no data loading needed
            break;
    }
}

// Load all payments across all plans
async function loadAllPayments() {
    const tbody = document.getElementById('allPaymentsTableBody');
    if (!tbody) return;
    
    const loadingText = window.i18n ? window.i18n.t('common.loading') : 'Loading...';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">${loadingText}</td></tr>`;
    
    try {
        // Get all plans first
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const plansResponse = await apiRequest(`/installment-payments${queryParams}`);
        const plans = Array.isArray(plansResponse) ? plansResponse : [];
        
        // Get payments for each plan
        const paymentPromises = plans.map(plan => 
            apiRequest(`/installment-payments/${plan.id}/payments`).catch(() => [])
        );
        const paymentsArrays = await Promise.all(paymentPromises);
        
        // Flatten and enrich with plan data
        allPayments = [];
        paymentsArrays.forEach((payments, index) => {
            const plan = plans[index];
            payments.forEach(payment => {
                allPayments.push({
                    ...payment,
                    plan_id: plan.id,
                    customer_id: plan.customer_id,
                    item_id: plan.item_id,
                    plan_total_price: plan.total_price
                });
            });
        });
        
        // Sort by date (newest first)
        allPayments.sort((a, b) => {
            const dateA = new Date(a.payment_date || a.created_at);
            const dateB = new Date(b.payment_date || b.created_at);
            return dateB - dateA;
        });
        
        renderAllPaymentsTable(allPayments);
    } catch (error) {
        console.error('Error loading payments:', error);
        const errorText = window.i18n ? window.i18n.t('messages.errorLoading', { item: window.i18n.t('common.amount') }) : 'Error loading payment history';
        tbody.innerHTML = `<tr><td colspan="8" class="text-center">${errorText}</td></tr>`;
    }
}

// Render all payments table
function renderAllPaymentsTable(payments) {
    const tbody = document.getElementById('allPaymentsTableBody');
    if (!tbody) return;
    
    if (payments.length === 0) {
        const noPayments = window.i18n ? window.i18n.t('messages.noPayments') : 'No payments found';
        tbody.innerHTML = `<tr><td colspan="8" class="text-center">${noPayments}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = payments.map(payment => {
        const customer = customers.find(c => c.id === payment.customer_id);
        const product = items.find(i => i.id === payment.item_id);
        const paymentType = payment.payment_type || 'full_contract';
        const isPartial = payment.is_partial_payment === 1 || payment.is_partial_payment === true;
        
        let typeBadge = paymentType === 'per_visit' 
            ? '<span class="badge badge-info">Per-Visit</span>' 
            : '<span class="badge badge-secondary">Full Contract</span>';
        
        let statusBadge = '';
        if (isPartial) {
            statusBadge = '<span class="badge badge-warning">Partial</span>';
        }
        
        return `
            <tr>
                <td>${formatDateTime(payment.payment_date || payment.created_at)}</td>
                <td><strong>${escapeHtml(customer?.name || 'Unknown')}</strong></td>
                <td>${escapeHtml(product?.name || 'Unknown')}</td>
                <td>${typeBadge}</td>
                <td class="text-right"><strong>${formatCurrency(payment.payment_amount)}</strong></td>
                <td>${escapeHtml(payment.payment_method || '-')}</td>
                <td><small>${escapeHtml(payment.receipt_number || payment.transaction_reference || '-')}</small></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// Load analytics data
async function loadAnalytics() {
    const content = document.getElementById('analyticsContent');
    if (!content) return;
    
    const loadingText = window.i18n ? window.i18n.t('common.loading') : 'Loading analytics...';
    content.innerHTML = `<div class="text-center" style="padding: 3rem;"><div class="loading-spinner"></div><p>${loadingText}</p></div>`;
    
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const plans = await apiRequest(`/installment-payments${queryParams}`);
        
        // Calculate statistics
        const totalPlans = plans.length;
        const activePlans = plans.filter(p => p.status === 'active').length;
        const completedPlans = plans.filter(p => p.status === 'completed').length;
        const cancelledPlans = plans.filter(p => p.status === 'cancelled').length;
        
        const totalValue = plans.reduce((sum, p) => sum + parseFloat(p.total_price || 0), 0);
        const totalPaid = plans.reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0);
        const totalRemaining = totalValue - totalPaid;
        const completionRate = totalValue > 0 ? ((totalPaid / totalValue) * 100).toFixed(1) : 0;
        
        // Get payment statistics
        const paymentPromises = plans.map(plan => 
            apiRequest(`/installment-payments/${plan.id}/payments`).catch(() => [])
        );
        const paymentsArrays = await Promise.all(paymentPromises);
        const allPaymentsFlat = paymentsArrays.flat();
        const totalPayments = allPaymentsFlat.length;
        const perVisitPayments = allPaymentsFlat.filter(p => p.payment_type === 'per_visit').length;
        const totalPaymentAmount = allPaymentsFlat.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0);
        
        content.innerHTML = `
            <div class="analytics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Total Plans</h3>
                    <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color); margin: 0;">${totalPlans}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Active Plans</h3>
                    <p style="font-size: 2rem; font-weight: bold; color: var(--info-color); margin: 0;">${activePlans}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Completed Plans</h3>
                    <p style="font-size: 2rem; font-weight: bold; color: var(--success-color); margin: 0;">${completedPlans}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Total Value</h3>
                    <p style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color); margin: 0;">${formatCurrency(totalValue)}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Total Paid</h3>
                    <p style="font-size: 1.5rem; font-weight: bold; color: var(--success-color); margin: 0;">${formatCurrency(totalPaid)}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Remaining</h3>
                    <p style="font-size: 1.5rem; font-weight: bold; color: var(--danger-color); margin: 0;">${formatCurrency(totalRemaining)}</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Completion Rate</h3>
                    <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color); margin: 0;">${completionRate}%</p>
                </div>
                <div style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">Total Payments</h3>
                    <p style="font-size: 2rem; font-weight: bold; color: var(--info-color); margin: 0;">${totalPayments}</p>
                </div>
            </div>
            <div class="payment-breakdown" style="padding: 1.5rem; background: var(--bg-color); border-radius: 0;">
                <h3 style="margin-bottom: 1rem;">Payment Breakdown</h3>
                <div class="payment-breakdown-items" style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 0;">
                        <p style="margin: 0;"><strong>Per-Visit Payments:</strong> ${perVisitPayments} (${totalPayments > 0 ? ((perVisitPayments / totalPayments) * 100).toFixed(1) : 0}%)</p>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <p style="margin: 0;"><strong>Full Contract Payments:</strong> ${totalPayments - perVisitPayments} (${totalPayments > 0 ? (((totalPayments - perVisitPayments) / totalPayments) * 100).toFixed(1) : 0}%)</p>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <p style="margin: 0;"><strong>Total Payment Amount:</strong> ${formatCurrency(totalPaymentAmount)}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading analytics:', error);
        const errorText = window.i18n ? window.i18n.t('messages.errorLoading', { item: window.i18n.t('reports.title') }) : 'Error loading analytics';
        content.innerHTML = `<div class="text-center" style="padding: 3rem;"><p style="color: var(--danger-color);">${errorText}</p></div>`;
    }
}

// Filter content based on search
function filterInstallmentContent(searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    
    // Filter based on current component
    if (currentComponent === 'plans') {
        // Use existing filter logic
        applyFilters();
    } else if (currentComponent === 'payments') {
        // Filter payments table
        const rows = document.querySelectorAll('#allPaymentsTableBody tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchLower)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
    }
}

// Export functions for reports
async function exportPlansReport() {
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        const plans = await apiRequest(`/installment-payments${queryParams}`);
        
        const csv = [
            ['Customer', 'Product', 'Total Price', 'Paid Amount', 'Remaining', 'Status', 'Created Date'].join(','),
            ...plans.map(plan => {
                const customer = customers.find(c => c.id === plan.customer_id);
                const product = items.find(i => i.id === plan.item_id);
                const remaining = parseFloat(plan.total_price || 0) - parseFloat(plan.paid_amount || 0);
                return [
                    `"${(customer?.name || 'Unknown').replace(/"/g, '""')}"`,
                    `"${(product?.name || 'Unknown').replace(/"/g, '""')}"`,
                    plan.total_price || 0,
                    plan.paid_amount || 0,
                    remaining,
                    plan.status || 'active',
                    plan.created_at || ''
                ].join(',');
            })
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `installment-plans-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification(window.i18n ? window.i18n.t('messages.reportExported', { type: window.i18n.t('nav.installmentPayments') }) : 'Plans report exported successfully', 'success');
    } catch (error) {
        showNotification('Error exporting report: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function exportPaymentsReport() {
    try {
        await loadAllPayments();
        
        const csv = [
            ['Date', 'Customer', 'Product', 'Type', 'Amount', 'Method', 'Receipt Number', 'Status'].join(','),
            ...allPayments.map(payment => {
                const customer = customers.find(c => c.id === payment.customer_id);
                const product = items.find(i => i.id === payment.item_id);
                const paymentType = payment.payment_type || 'full_contract';
                const isPartial = payment.is_partial_payment === 1 ? 'Partial' : 'Full';
                return [
                    payment.payment_date || payment.created_at || '',
                    `"${(customer?.name || 'Unknown').replace(/"/g, '""')}"`,
                    `"${(product?.name || 'Unknown').replace(/"/g, '""')}"`,
                    paymentType,
                    payment.payment_amount || 0,
                    payment.payment_method || '',
                    payment.receipt_number || '',
                    isPartial
                ].join(',');
            })
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `installment-payments-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification(window.i18n ? window.i18n.t('messages.reportExported', { type: window.i18n.t('common.amount') }) : 'Payments report exported successfully', 'success');
    } catch (error) {
        showNotification('Error exporting report: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function generateSummaryReport() {
    showNotification(window.i18n ? window.i18n.t('messages.summaryReportComingSoon') : 'Summary report generation coming soon', 'info');
}

// Expose functions to global scope
window.switchComponent = switchComponent;
window.filterInstallmentContent = filterInstallmentContent;
window.exportPlansReport = exportPlansReport;
window.exportPaymentsReport = exportPaymentsReport;
window.generateSummaryReport = generateSummaryReport;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomersAndProducts();
    setupComponentNavigation();
    setupEventListeners();
    
    // Initialize debounced function
    if (window.debounce) {
        debouncedApplyFilters = window.debounce(applyFilters, 300);
    }
    
    // Add debounced search input listener
    const searchInput = document.getElementById('searchPlans');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedApplyFilters);
    }
    
    // Add immediate filter listener for status
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    
    // Load default component (plans)
    await loadComponentData('plans');
});

