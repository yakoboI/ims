let expenses = [];
let expenseCategories = ['Utilities', 'Rent', 'Salaries', 'Marketing', 'Transportation', 'Supplies', 'Maintenance', 'Insurance', 'Other'];

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

async function loadExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
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
        expenses = await apiRequest(`/expenses${queryParams}`);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderExpensesTable(expenses);
        updateExpenseSummary();
        
        // Populate category filter
        populateCategoryFilter();
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading expenses', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading expenses</td></tr>';
        }
        if (expenses.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.expenses || {
                icon: '<i class="fas fa-receipt fa-icon-warning" style="font-size: 4rem;"></i>',
                title: 'No Expenses',
                message: 'No expenses have been recorded yet.',
                actionLabel: 'Add Expense',
                actionCallback: () => openExpenseModal()
            });
        }
    }
}

function renderExpensesTable(expensesList) {
    const tbody = document.getElementById('expensesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (expensesList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.expenses || {
            icon: '<i class="fas fa-receipt fa-icon-warning" style="font-size: 4rem;"></i>',
            title: 'No Expenses',
            message: 'No expenses have been recorded yet.',
            actionLabel: 'Add Expense',
            actionCallback: () => openExpenseModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = expensesList.map(expense => `
        <tr>
            <td data-label="Date">${formatDate(expense.expense_date)}</td>
            <td data-label="Category"><span class="badge badge-info">${escapeHtml(expense.category || '-')}</span></td>
            <td data-label="Description">${escapeHtml(expense.description || '-')}</td>
            <td data-label="Amount"><strong>${formatCurrency(expense.amount || 0)}</strong></td>
            <td data-label="Payment Method">${escapeHtml(expense.payment_method || '-')}</td>
            <td data-label="Created By">${escapeHtml(expense.created_by_name || '-')}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editExpense(${expense.id})" aria-label="Edit expense ${expense.id}">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" aria-label="Delete expense ${expense.id}">Delete</button>
            </td>
        </tr>
    `).join('');
}

function updateExpenseSummary() {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);
    
    const todayTotal = expenses
        .filter(e => e.expense_date && e.expense_date.startsWith(today))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const monthTotal = expenses
        .filter(e => e.expense_date && e.expense_date.startsWith(thisMonth))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const todayExpensesEl = document.getElementById('todayExpenses');
    const monthExpensesEl = document.getElementById('monthExpenses');
    const totalExpensesEl = document.getElementById('totalExpenses');
    
    if (todayExpensesEl) todayExpensesEl.textContent = formatCurrency(todayTotal);
    if (monthExpensesEl) monthExpensesEl.textContent = formatCurrency(monthTotal);
    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(total);
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById('expenseCategoryFilter');
    if (!categoryFilter) return;
    
    const currentValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        expenseCategories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    
    if (currentValue) {
        categoryFilter.value = currentValue;
    }
}

function setupEventListeners() {
    const expenseForm = document.getElementById('expenseForm');
    
    if (expenseForm) {
        expenseForm.addEventListener('submit', handleExpenseSubmit);
    }
}

async function openExpenseModal(expenseId = null) {
    const modal = document.getElementById('expenseModal');
    const form = document.getElementById('expenseForm');
    const title = document.getElementById('expenseModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (expenseId) {
        title.textContent = 'Edit Expense';
        const expense = expenses.find(e => e.id === expenseId);
        if (expense) {
            const expenseIdEl = document.getElementById('expenseId');
            const expenseDateEl = document.getElementById('expenseDate');
            const expenseCategoryEl = document.getElementById('expenseCategory');
            const expenseDescriptionEl = document.getElementById('expenseDescription');
            const expenseAmountEl = document.getElementById('expenseAmount');
            const expensePaymentMethodEl = document.getElementById('expensePaymentMethod');
            const expenseReceiptEl = document.getElementById('expenseReceipt');
            
            if (expenseIdEl) expenseIdEl.value = expense.id;
            if (expenseDateEl) expenseDateEl.value = expense.expense_date ? expense.expense_date.split('T')[0] : '';
            if (expenseCategoryEl) expenseCategoryEl.value = expense.category || '';
            if (expenseDescriptionEl) expenseDescriptionEl.value = expense.description || '';
            if (expenseAmountEl) expenseAmountEl.value = expense.amount || '';
            if (expensePaymentMethodEl) expensePaymentMethodEl.value = expense.payment_method || '';
            if (expenseReceiptEl) expenseReceiptEl.value = expense.receipt_number || '';
        }
    } else {
        title.textContent = 'Add Expense';
        form.reset();
        const expenseIdEl = document.getElementById('expenseId');
        if (expenseIdEl) expenseIdEl.value = '';
        
        // Set default date to today
        const expenseDateEl = document.getElementById('expenseDate');
        if (expenseDateEl) {
            expenseDateEl.value = new Date().toISOString().split('T')[0];
        }
    }
    
    const firstInput = document.getElementById('expenseDate');
    openModal('expenseModal', firstInput);
}

function closeExpenseModal() {
    closeModal('expenseModal');
    const form = document.getElementById('expenseForm');
    const expenseIdEl = document.getElementById('expenseId');
    
    if (form) form.reset();
    if (expenseIdEl) expenseIdEl.value = '';
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const expenseIdEl = document.getElementById('expenseId');
    const expenseDateEl = document.getElementById('expenseDate');
    const expenseCategoryEl = document.getElementById('expenseCategory');
    const expenseDescriptionEl = document.getElementById('expenseDescription');
    const expenseAmountEl = document.getElementById('expenseAmount');
    const expensePaymentMethodEl = document.getElementById('expensePaymentMethod');
    const expenseReceiptEl = document.getElementById('expenseReceipt');
    
    if (!expenseIdEl || !expenseDateEl || !expenseCategoryEl || !expenseDescriptionEl || !expenseAmountEl || !expensePaymentMethodEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const expenseId = expenseIdEl.value;
    
    // Validate form
    const validationRules = {
        expenseDate: { required: true },
        expenseCategory: { required: true },
        expenseDescription: { required: true, minLength: 3 },
        expenseAmount: { required: true, min: 0.01 },
        expensePaymentMethod: { required: true }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const expenseData = {
        expense_date: expenseDateEl.value,
        category: expenseCategoryEl.value,
        description: expenseDescriptionEl.value.trim(),
        amount: parseFloat(expenseAmountEl.value),
        payment_method: expensePaymentMethodEl.value,
        receipt_number: expenseReceiptEl ? expenseReceiptEl.value.trim() || null : null
    };
    
    try {
        if (expenseId) {
            await apiRequest(`/expenses/${expenseId}`, {
                method: 'PUT',
                body: expenseData
            });
            showNotification('Expense updated successfully');
        } else {
            await apiRequest('/expenses', {
                method: 'POST',
                body: expenseData
            });
            showNotification('Expense added successfully');
        }
        
        closeExpenseModal();
        await loadExpenses();
    } catch (error) {
        showNotification(error.message || 'Error saving expense', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editExpense(expenseId) {
    openExpenseModal(expenseId);
}

async function deleteExpense(expenseId) {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) {
        showNotification('Expense not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this expense?\n\nCategory: ${expense.category}\nAmount: ${formatCurrency(expense.amount)}`)) {
        return;
    }
    
    try {
        await apiRequest(`/expenses/${expenseId}`, {
            method: 'DELETE'
        });
        showNotification('Expense deleted successfully');
        await loadExpenses();
    } catch (error) {
        showNotification(error.message || 'Error deleting expense', 'error');
    }
}

function applyExpenseFilters() {
    const dateFrom = document.getElementById('expenseDateFrom')?.value;
    const dateTo = document.getElementById('expenseDateTo')?.value;
    const category = document.getElementById('expenseCategoryFilter')?.value;
    
    let filtered = [...expenses];
    
    if (dateFrom) {
        filtered = filtered.filter(e => e.expense_date >= dateFrom);
    }
    
    if (dateTo) {
        filtered = filtered.filter(e => e.expense_date <= dateTo);
    }
    
    if (category) {
        filtered = filtered.filter(e => e.category === category);
    }
    
    renderExpensesTable(filtered);
    
    // Update summary with filtered data
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);
    
    const todayTotal = filtered
        .filter(e => e.expense_date && e.expense_date.startsWith(today))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const monthTotal = filtered
        .filter(e => e.expense_date && e.expense_date.startsWith(thisMonth))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const total = filtered.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const todayExpensesEl = document.getElementById('todayExpenses');
    const monthExpensesEl = document.getElementById('monthExpenses');
    const totalExpensesEl = document.getElementById('totalExpenses');
    
    if (todayExpensesEl) todayExpensesEl.textContent = formatCurrency(todayTotal);
    if (monthExpensesEl) monthExpensesEl.textContent = formatCurrency(monthTotal);
    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(total);
}

function clearExpenseFilters() {
    const dateFrom = document.getElementById('expenseDateFrom');
    const dateTo = document.getElementById('expenseDateTo');
    const category = document.getElementById('expenseCategoryFilter');
    
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (category) category.value = '';
    
    renderExpensesTable(expenses);
    updateExpenseSummary();
}

// Expose functions to global scope
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.applyExpenseFilters = applyExpenseFilters;
window.clearExpenseFilters = clearExpenseFilters;

document.addEventListener('DOMContentLoaded', async () => {
    await loadExpenses();
    setupEventListeners();
});

