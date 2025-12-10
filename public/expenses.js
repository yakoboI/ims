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
        
        const response = await apiRequest(`/expenses${queryParams}`);
        
        // Ensure expenses is an array
        expenses = Array.isArray(response) ? response : [];
        
        // Aggressively remove skeleton and ensure table is visible
        if (tableContainer) {
            hideTableSkeleton(tableContainer);
            // Remove any skeleton elements that might still be there
            const skeletons = tableContainer.querySelectorAll('.table-skeleton, .skeleton-table, .skeleton-row');
            skeletons.forEach(s => s.remove());
            // Ensure table is visible
            const table = tableContainer.querySelector('.data-table');
            if (table) {
                table.style.display = 'table';
                table.style.visibility = 'visible';
                table.style.opacity = '1';
            }
        }
        
        if (expenses.length === 0) {
            tbody.innerHTML = '';
            if (tableContainer) {
                showEmptyState(tableContainer, EmptyStates.expenses || {
                    icon: '<i class="fas fa-receipt fa-icon-warning" style="font-size: 4rem;"></i>',
                    title: 'No Expenses',
                    message: 'No expenses have been recorded yet.',
                    actionLabel: 'Add Expense',
                    actionCallback: () => openExpenseModal()
                });
            }
        } else {
            renderExpensesTable(expenses);
        }
        
        updateExpenseSummary();
        
        // Populate category filter
        populateCategoryFilter();
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading expenses: ' + (error.message || 'Unknown error'), 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading expenses: ' + escapeHtml(error.message || 'Unknown error') + '</td></tr>';
        }
        expenses = [];
        if (tableContainer) {
            showEmptyState(tableContainer, EmptyStates.expenses || {
                icon: '<i class="fas fa-receipt fa-icon-warning" style="font-size: 4rem;"></i>',
                title: 'Error Loading Expenses',
                message: error.message || 'Failed to load expenses. Please try again.',
                actionLabel: 'Retry',
                actionCallback: () => loadExpenses()
            });
        }
    }
}

function renderExpensesTable(expensesList) {
    const tbody = document.getElementById('expensesTableBody');
    const tableContainer = document.querySelector('.table-container') || document.querySelector('.section-card');
    
    if (!tbody) {
        return;
    }
    
    // Ensure expensesList is an array
    if (!Array.isArray(expensesList)) {
        console.error('expensesList is not an array:', expensesList);
        expensesList = [];
    }
    
    if (expensesList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) {
            showEmptyState(tableContainer, EmptyStates.expenses || {
                icon: '<i class="fas fa-receipt fa-icon-warning" style="font-size: 4rem;"></i>',
                title: 'No Expenses',
                message: 'No expenses have been recorded yet.',
                actionLabel: 'Add Expense',
                actionCallback: () => openExpenseModal()
            });
        }
        return;
    }

    // Hide empty state and ensure table is visible
    if (tableContainer) {
        hideEmptyState(tableContainer);
        // Also remove any empty-state-small elements
        const emptyStates = tableContainer.querySelectorAll('.empty-state, .empty-state-small');
        emptyStates.forEach(el => el.remove());
        
        // Remove any skeleton loaders
        const skeletons = tableContainer.querySelectorAll('.table-skeleton, .skeleton-table, .skeleton-row');
        skeletons.forEach(s => s.remove());
        
        // Ensure table container is visible
        const sectionCard = tableContainer.closest('.section-card');
        if (sectionCard) {
            sectionCard.style.display = 'block';
            sectionCard.style.visibility = 'visible';
            sectionCard.style.opacity = '1';
        }
        tableContainer.style.display = 'block';
        tableContainer.style.visibility = 'visible';
        tableContainer.style.opacity = '1';
        const table = tableContainer.querySelector('.data-table');
        if (table) {
            table.style.display = 'table';
            table.style.visibility = 'visible';
            table.style.opacity = '1';
            table.style.position = 'relative';
            table.style.zIndex = '1';
        }
    }
    
    // Sort expenses by date (newest first)
    const sortedExpenses = [...expensesList].sort((a, b) => {
        const dateA = new Date(a.expense_date || 0);
        const dateB = new Date(b.expense_date || 0);
        return dateB - dateA; // Descending order (newest first)
    });
    
    // Check if formatCurrency exists, if not define a simple one
    const formatCurrencyFunc = typeof formatCurrency === 'function' ? formatCurrency : (amount) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };
    
    const html = sortedExpenses.map(expense => {
        return `
        <tr>
            <td data-label="Date">${formatDate(expense.expense_date)}</td>
            <td data-label="Category"><span class="badge badge-info">${escapeHtml(expense.category || '-')}</span></td>
            <td data-label="Description">${escapeHtml(expense.description || '-')}</td>
            <td data-label="Amount"><strong>${formatCurrencyFunc(expense.amount || 0)}</strong></td>
            <td data-label="Payment Method">${escapeHtml(expense.payment_method || '-')}</td>
            <td data-label="Created By">${escapeHtml(expense.created_by_name || expense.created_by || '-')}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editExpense(${expense.id})" aria-label="Edit expense ${expense.id}">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" aria-label="Delete expense ${expense.id}">Delete</button>
            </td>
        </tr>
    `;
    }).join('');
    
    tbody.innerHTML = html;
    
    // Force visibility and proper styling
    tbody.style.display = '';
    const table = tbody.closest('table');
    if (table) {
        table.style.display = 'table';
        table.style.visibility = 'visible';
        table.style.height = 'auto';
        table.style.minHeight = 'auto';
        table.style.maxHeight = 'none';
        // Ensure table has proper width
        table.style.width = '100%';
        table.style.tableLayout = 'auto';
    }
    
    // Ensure table container is properly sized
    const containerEl = tbody.closest('.table-container');
    if (containerEl) {
        containerEl.style.height = 'auto';
        containerEl.style.minHeight = 'auto';
        containerEl.style.maxHeight = 'none';
        containerEl.style.overflowX = 'auto';
        containerEl.style.overflowY = 'visible';
    }
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row) => {
        row.style.display = '';
        row.style.visibility = 'visible';
        // Force normal row height
        row.style.height = 'auto';
        row.style.minHeight = 'auto';
        row.style.maxHeight = 'none';
        
        // Fix excessive cell heights if needed
        const cells = row.querySelectorAll('td');
        cells.forEach((cell) => {
            cell.style.height = 'auto';
            cell.style.minHeight = 'auto';
            cell.style.maxHeight = 'none';
            cell.style.overflow = 'visible';
        });
    });
    
    // Scroll table into view if it exists
    setTimeout(() => {
        const finalTable = document.querySelector('#expensesTableBody')?.closest('table');
        const sectionCard = document.querySelector('.section-card');
        
        if (finalTable) {
            // First, try scrolling the section card into view
            if (sectionCard) {
                sectionCard.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
            }
            // Then scroll the table
            setTimeout(() => {
                finalTable.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
            }, 100);
        }
    }, 100);
}

function updateExpenseSummary() {
    if (!expenses || expenses.length === 0) {
        expenses = [];
    }
    
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);
    
    const todayTotal = expenses
        .filter(e => e.expense_date && e.expense_date.startsWith(today))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const monthTotal = expenses
        .filter(e => e.expense_date && e.expense_date.startsWith(thisMonth))
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    // Check if formatCurrency exists, if not define a simple one
    const formatCurrencyFunc = typeof formatCurrency === 'function' ? formatCurrency : (amount) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };
    
    const todayExpensesEl = document.getElementById('todayExpenses');
    const monthExpensesEl = document.getElementById('monthExpenses');
    const totalExpensesEl = document.getElementById('totalExpenses');
    
    if (todayExpensesEl) todayExpensesEl.textContent = formatCurrencyFunc(todayTotal);
    if (monthExpensesEl) monthExpensesEl.textContent = formatCurrencyFunc(monthTotal);
    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrencyFunc(total);
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
    
    // Basic validation
    if (!expenseDateEl.value) {
        showNotification('Date is required', 'error');
        return;
    }
    if (!expenseCategoryEl.value) {
        showNotification('Category is required', 'error');
        return;
    }
    if (!expenseDescriptionEl.value || expenseDescriptionEl.value.trim().length < 3) {
        showNotification('Description is required and must be at least 3 characters', 'error');
        return;
    }
    if (!expenseAmountEl.value || parseFloat(expenseAmountEl.value) <= 0) {
        showNotification('Amount is required and must be greater than 0', 'error');
        return;
    }
    if (!expensePaymentMethodEl.value) {
        showNotification('Payment method is required', 'error');
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const expenseData = {
        expense_date: expenseDateEl.value,
        category: expenseCategoryEl.value,
        description: expenseDescriptionEl.value.trim(),
        amount: parseFloat(expenseAmountEl.value),
        payment_method: expensePaymentMethodEl.value
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
        // Clear any filters before reloading
        const dateFrom = document.getElementById('expenseDateFrom');
        const dateTo = document.getElementById('expenseDateTo');
        const category = document.getElementById('expenseCategoryFilter');
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';
        if (category) category.value = '';
        
        // Force clear the expenses array to ensure fresh data
        expenses = [];
        
        // Small delay to ensure API has processed the request
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload expenses to show the new one
        try {
            await loadExpenses();
        } catch (error) {
            console.error('Error reloading expenses:', error);
            showNotification('Expense added but failed to refresh list. Please refresh the page.', 'warning');
        }
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
    
    // Ensure button click handler works
    const addExpenseBtn = document.querySelector('button[onclick="openExpenseModal()"]');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openExpenseModal === 'function') {
                openExpenseModal();
            }
        });
    }
});

