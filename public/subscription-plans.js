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

async function loadSubscriptionPlans() {
    const container = document.getElementById('subscriptionPlansContainer');
    if (!container) return;
    
    try {
        // Get all shops with their subscription information
        const shops = await apiRequest('/shops');
        
        if (shops.length === 0) {
            if (typeof showEmptyState === 'function') {
                showEmptyState(container, {
                    icon: '<i class="fas fa-store fa-icon-info" style="font-size: 4rem;"></i>',
                    title: 'No Shops Found',
                    message: 'No shops are registered in the system.',
                    className: 'empty-state-small'
                });
            } else {
                container.innerHTML = `
                    <div class="text-center" style="padding: 2rem;">
                        <i class="fas fa-store fa-icon-info" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                        <p style="color: var(--text-secondary);">No shops found</p>
                    </div>
                `;
            }
            return;
        }
        
        // Render subscription plans table
        container.innerHTML = `
            <div class="table-container">
                <table class="data-table" role="table" aria-label="Subscription plans">
                    <thead>
                        <tr>
                            <th scope="col">Shop Name</th>
                            <th scope="col">Shop Code</th>
                            <th scope="col">Plan</th>
                            <th scope="col">Status</th>
                            <th scope="col">Expires At</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="subscriptionPlansBody" role="rowgroup" aria-live="polite">
                        ${shops.map(shop => {
                            const plan = shop.subscription_plan || 'Free';
                            const expiresAt = shop.subscription_expires_at ? new Date(shop.subscription_expires_at) : null;
                            const isExpired = expiresAt && expiresAt < new Date();
                            const expiresSoon = expiresAt && expiresAt > new Date() && expiresAt < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                            const statusClass = isExpired ? 'badge-danger' : expiresSoon ? 'badge-warning' : 'badge-success';
                            const statusText = isExpired ? 'Expired' : expiresSoon ? 'Expires Soon' : expiresAt ? 'Active' : 'No Plan';
                            
                            return `
                                <tr>
                                    <td data-label="Shop Name"><strong>${escapeHtml(shop.shop_name || 'N/A')}</strong></td>
                                    <td data-label="Shop Code">${escapeHtml(shop.shop_code || '-')}</td>
                                    <td data-label="Plan">
                                        <span class="badge badge-info">${escapeHtml(plan)}</span>
                                    </td>
                                    <td data-label="Status">
                                        <span class="badge ${statusClass}">${statusText}</span>
                                    </td>
                                    <td data-label="Expires At">
                                        ${expiresAt ? formatDate(expiresAt.toISOString()) : '-'}
                                    </td>
                                    <td data-label="Actions">
                                        <button class="btn btn-sm btn-secondary" onclick="editSubscriptionPlan(${shop.id})" aria-label="Edit subscription plan for ${escapeHtml(shop.shop_name)}">
                                            <i class="fas fa-edit"></i> Edit Plan
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading subscription plans:', error);
        container.innerHTML = `
            <div class="text-center" style="padding: 2rem;">
                <p style="color: var(--danger-color);">Error loading subscription plans: ${escapeHtml(error.message || 'Unknown error')}</p>
            </div>
        `;
    }
}

async function refreshSubscriptionPlans() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn && typeof showButtonLoading === 'function') {
        showButtonLoading(refreshBtn, 'Refreshing...');
    }
    
    try {
        await loadSubscriptionPlans();
        if (typeof showNotification === 'function') {
            showNotification('Subscription plans refreshed successfully');
        }
    } catch (error) {
        if (typeof showNotification === 'function') {
            showNotification('Error refreshing subscription plans', 'error');
        }
    } finally {
        if (refreshBtn && typeof hideButtonLoading === 'function') {
            hideButtonLoading(refreshBtn);
        }
    }
}

function editSubscriptionPlan(shopId) {
    // Placeholder function - can be implemented later to open a modal for editing subscription plans
    if (typeof showNotification === 'function') {
        showNotification('Subscription plan editing feature coming soon', 'info');
    }
}

// Expose functions to global scope
window.refreshSubscriptionPlans = refreshSubscriptionPlans;
window.editSubscriptionPlan = editSubscriptionPlan;

// Load subscription plans on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadSubscriptionPlans();
});

