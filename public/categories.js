let categories = [];

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

async function loadCategories() {
    const tbody = document.getElementById('categoriesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 4);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
    
    try {
        // Get shop filter if superadmin has selected a shop
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        categories = await apiRequest(`/categories${queryParams}`);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderCategoriesTable(categories);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading categories', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Error loading categories</td></tr>';
        }
        if (categories.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.categories || {
                icon: '<i class="fas fa-tags fa-icon-info" style="font-size: 4rem;"></i>',
                title: 'No Categories',
                message: 'No categories have been created yet.',
                actionLabel: 'Add Category',
                actionCallback: () => openCategoryModal()
            });
        }
    }
}

function renderCategoriesTable(categoriesList) {
    const tbody = document.getElementById('categoriesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (categoriesList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.categories || {
            icon: '<i class="fas fa-tags fa-icon-info" style="font-size: 4rem;"></i>',
            title: 'No Categories',
            message: 'No categories have been created yet.',
            actionLabel: 'Add Category',
            actionCallback: () => openCategoryModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = categoriesList.map(category => `
        <tr>
            <td data-label="Name"><strong>${escapeHtml(category.name || '-')}</strong></td>
            <td data-label="Description">${escapeHtml(category.description || '-')}</td>
            <td data-label="Created At">${formatDate(category.created_at)}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editCategory(${category.id})" aria-label="Edit category ${escapeHtml(category.name || category.id)}">
                    <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCategory(${category.id})" aria-label="Delete category ${escapeHtml(category.name || category.id)}">
                    <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    const categoryForm = document.getElementById('categoryForm');
    
    if (categoryForm) {
        categoryForm.addEventListener('submit', handleCategorySubmit);
    }
}

async function openCategoryModal(categoryId = null) {
    const modal = document.getElementById('categoryModal');
    const form = document.getElementById('categoryForm');
    const title = document.getElementById('categoryModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (categoryId) {
        title.textContent = 'Edit Category';
        const category = categories.find(c => c.id === categoryId);
        if (category) {
            const categoryIdEl = document.getElementById('categoryId');
            const categoryNameEl = document.getElementById('categoryName');
            const categoryDescriptionEl = document.getElementById('categoryDescription');
            
            if (categoryIdEl) categoryIdEl.value = category.id;
            if (categoryNameEl) categoryNameEl.value = category.name || '';
            if (categoryDescriptionEl) categoryDescriptionEl.value = category.description || '';
        }
    } else {
        title.textContent = 'Add Category';
        form.reset();
        const categoryIdEl = document.getElementById('categoryId');
        if (categoryIdEl) categoryIdEl.value = '';
    }
    
    const firstInput = document.getElementById('categoryName');
    openModal('categoryModal', firstInput);
}

function closeCategoryModal() {
    closeModal('categoryModal');
    const form = document.getElementById('categoryForm');
    const categoryIdEl = document.getElementById('categoryId');
    
    if (form) form.reset();
    if (categoryIdEl) categoryIdEl.value = '';
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const categoryIdEl = document.getElementById('categoryId');
    const categoryNameEl = document.getElementById('categoryName');
    const categoryDescriptionEl = document.getElementById('categoryDescription');
    
    if (!categoryIdEl || !categoryNameEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    const categoryId = categoryIdEl.value;
    
    // Validate form
    const validationRules = {
        categoryName: { required: true, minLength: 2 }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    // Get shop_id - for superadmin use selected shop, for others use current user's shop
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    let shopId = null;
    
    if (currentUser && currentUser.role === 'superadmin') {
        // For superadmin, get shop_id from shop selector
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        shopId = shopFilter.shop_id || null;
        
        // If no shop selected, try to get from currentUser (fallback)
        if (!shopId && currentUser.shop_id) {
            shopId = currentUser.shop_id;
        }
    } else if (currentUser && currentUser.shop_id) {
        // For non-superadmin, use their shop_id
        shopId = currentUser.shop_id;
    }
    
    const categoryData = {
        name: categoryNameEl.value.trim(),
        description: categoryDescriptionEl ? categoryDescriptionEl.value.trim() || null : null
    };
    
    // Include shop_id if available (required for superadmin, optional for others but helps)
    if (shopId) {
        categoryData.shop_id = shopId;
    }
    
    try {
        if (categoryId) {
            await apiRequest(`/categories/${categoryId}`, {
                method: 'PUT',
                body: categoryData
            });
            showNotification('Category updated successfully');
        } else {
            await apiRequest('/categories', {
                method: 'POST',
                body: categoryData
            });
            showNotification('Category added successfully');
        }
        
        closeCategoryModal();
        await loadCategories();
    } catch (error) {
        showNotification(error.message || 'Error saving category', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editCategory(categoryId) {
    openCategoryModal(categoryId);
}

async function deleteCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
        showNotification('Category not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this category?\n\nName: ${category.name}`)) {
        return;
    }
    
    try {
        await apiRequest(`/categories/${categoryId}`, {
            method: 'DELETE'
        });
        showNotification('Category deleted successfully');
        await loadCategories();
    } catch (error) {
        showNotification(error.message || 'Error deleting category', 'error');
    }
}

// Expose functions to global scope
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    setupEventListeners();
});

