/**
 * Empty States Utility
 * Provides enhanced empty state messages with illustrations and actions
 */

/**
 * Show empty state
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} options - Empty state options
 */
function showEmptyState(container, options = {}) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return null;

    const {
        icon = '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
        title = 'No items found',
        message = 'There are no items to display at this time.',
        actionLabel = null,
        actionCallback = null,
        className = 'empty-state'
    } = options;

    // Remove existing empty state
    hideEmptyState(container);

    const emptyStateEl = document.createElement('div');
    emptyStateEl.className = className;
    emptyStateEl.setAttribute('role', 'status');
    emptyStateEl.setAttribute('aria-live', 'polite');

    let actionHTML = '';
    if (actionLabel && actionCallback) {
        actionHTML = `<button class="btn btn-primary" onclick="${actionCallback}" aria-label="${actionLabel}">${actionLabel}</button>`;
    }

    emptyStateEl.innerHTML = `
        <div class="empty-state-content">
            <div class="empty-state-icon" aria-hidden="true">${icon}</div>
            <h3 class="empty-state-title">${title}</h3>
            <p class="empty-state-message">${message}</p>
            ${actionHTML}
        </div>
    `;

    containerEl.appendChild(emptyStateEl);
    return emptyStateEl;
}

/**
 * Hide empty state
 * @param {HTMLElement|string} container - Container element or selector
 */
function hideEmptyState(container) {
    const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerEl) return;

    // Remove both .empty-state and .empty-state-small elements
    const emptyStateEls = containerEl.querySelectorAll('.empty-state, .empty-state-small');
    emptyStateEls.forEach(el => el.remove());
}

/**
 * Predefined empty states
 */
const EmptyStates = {
    items: {
        icon: '<i class="fas fa-boxes fa-icon-info" style="font-size: 4rem;"></i>',
        title: 'No Items Found',
        message: 'Get started by adding your first inventory item.',
        actionLabel: 'Add Item',
        actionCallback: 'openItemModal()'
    },
    sales: {
        icon: '<i class="fas fa-dollar-sign fa-icon-success" style="font-size: 4rem;"></i>',
        title: 'No Sales Yet',
        message: 'Start recording sales to track your revenue.',
        actionLabel: 'New Sale',
        actionCallback: 'openNewSaleModal()'
    },
    purchases: {
        icon: '<i class="fas fa-shopping-cart fa-icon-success" style="font-size: 4rem;"></i>',
        title: 'No Purchases Yet',
        message: 'Record your first purchase to start tracking inventory.',
        actionLabel: 'New Purchase',
        actionCallback: 'openNewPurchaseModal()'
    },
    users: {
        icon: '<i class="fas fa-users fa-icon-primary" style="font-size: 4rem;"></i>',
        title: 'No Users Found',
        message: 'Add users to manage access to your system.',
        actionLabel: 'Add User',
        actionCallback: 'openUserModal()'
    },
    categories: {
        icon: '<i class="fas fa-folder fa-icon-info" style="font-size: 4rem;"></i>',
        title: 'No Categories',
        message: 'Create categories to organize your inventory items.',
        actionLabel: 'Add Category',
        actionCallback: 'openCategoryModal()'
    },
    suppliers: {
        icon: '<i class="fas fa-building fa-icon-info" style="font-size: 4rem;"></i>',
        title: 'No Suppliers',
        message: 'Add suppliers to track your purchase sources.',
        actionLabel: 'Add Supplier',
        actionCallback: 'openSupplierModal()'
    },
    search: {
        icon: '<i class="fas fa-search fa-icon-muted" style="font-size: 4rem;"></i>',
        title: 'No Results Found',
        message: 'Try adjusting your search criteria or filters.',
        actionLabel: null,
        actionCallback: null
    }
};

// Make functions globally available
window.showEmptyState = showEmptyState;
window.hideEmptyState = hideEmptyState;
window.EmptyStates = EmptyStates;

