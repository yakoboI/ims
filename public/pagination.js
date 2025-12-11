/**
 * Pagination Utility
 * Provides pagination functionality for tables and lists
 */

/**
 * Create pagination controls
 * @param {HTMLElement} container - Container element for pagination
 * @param {number} currentPage - Current page number (1-based)
 * @param {number} totalPages - Total number of pages
 * @param {Function} onPageChange - Callback function when page changes
 */
function createPagination(container, currentPage, totalPages, onPageChange) {
    if (!container || totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }

    const pagination = document.createElement('div');
    pagination.className = 'pagination';
    pagination.setAttribute('role', 'navigation');
    pagination.setAttribute('aria-label', 'Pagination navigation');

    let html = '';

    // Previous button
    html += `<button 
        class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" 
        ${currentPage === 1 ? 'disabled' : ''}
        onclick="changePage(${currentPage - 1})"
        aria-label="Go to previous page"
        ${currentPage === 1 ? 'aria-disabled="true"' : ''}
    >‹ Previous</button>`;

    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button class="pagination-btn" onclick="changePage(1)" aria-label="Go to page 1">1</button>`;
        if (startPage > 2) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button 
            class="pagination-btn ${i === currentPage ? 'active' : ''}" 
            onclick="changePage(${i})"
            aria-label="Go to page ${i}"
            ${i === currentPage ? 'aria-current="page"' : ''}
        >${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
        html += `<button class="pagination-btn" onclick="changePage(${totalPages})" aria-label="Go to page ${totalPages}">${totalPages}</button>`;
    }

    // Next button
    html += `<button 
        class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" 
        ${currentPage === totalPages ? 'disabled' : ''}
        onclick="changePage(${currentPage + 1})"
        aria-label="Go to next page"
        ${currentPage === totalPages ? 'aria-disabled="true"' : ''}
    >Next ›</button>`;

    // Page info
    html += `<span class="pagination-info" aria-live="polite">Page ${currentPage} of ${totalPages}</span>`;

    pagination.innerHTML = html;

    // Store callback in container for access
    container._paginationCallback = onPageChange;
    container._currentPage = currentPage;
    container._totalPages = totalPages;

    // Global function for page change
    window.changePage = function(page) {
        if (page < 1 || page > totalPages || page === currentPage) return;
        if (onPageChange) {
            onPageChange(page);
        }
    };

    container.innerHTML = '';
    container.appendChild(pagination);
}

/**
 * Paginate an array of items
 * @param {Array} items - Array of items to paginate
 * @param {number} page - Current page (1-based)
 * @param {number} itemsPerPage - Number of items per page
 * @returns {Object} - { items, totalPages, currentPage, totalItems }
 */
function paginateArray(items, page = 1, itemsPerPage = 10) {
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex);

    return {
        items: paginatedItems,
        totalPages,
        currentPage,
        totalItems,
        itemsPerPage,
        startIndex: startIndex + 1,
        endIndex: Math.min(endIndex, totalItems)
    };
}

// Make functions globally available
window.createPagination = createPagination;
window.paginateArray = paginateArray;

