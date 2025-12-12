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

// Feature labels mapping
const featureLabels = {
    'inventory_management': 'Inventory Management',
    'sales': 'Sales Management',
    'purchases': 'Purchase Management',
    'reports': 'Basic Reports',
    'basic_reports': 'Basic Reports',
    'advanced_reports': 'Advanced Reports',
    'analytics': 'Analytics Dashboard',
    'multi_user': 'Multi-User Support',
    'api_access': 'API Access',
    'custom_branding': 'Custom Branding',
    'priority_support': 'Priority Support',
    'expenses': 'Expense Tracking',
    'invoices': 'Invoice Management',
    'receipts': 'Receipt Management',
    'installment_payments': 'Installment Payments'
};

let availablePlans = [];
let currentShopSubscription = null;

async function loadSubscriptionPlans() {
    const container = document.getElementById('subscriptionPlansContainer');
    if (!container) return;
    
    // Check if user is superadmin
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'superadmin') {
        container.innerHTML = `
            <div class="text-center" style="padding: 2rem;">
                <i class="fas fa-lock fa-icon-danger" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3>Access Denied</h3>
                <p style="color: var(--text-secondary);">Only superadmin can access subscription plans.</p>
            </div>
        `;
        return;
    }
    
    try {
        // Load available plans
        availablePlans = await apiRequest('/subscription-plans');
        
        // Get all shops with their subscription information
        const shops = await apiRequest('/shops/subscriptions');
        
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
                            <th scope="col">Plan Tier</th>
                            <th scope="col">Status</th>
                            <th scope="col">Expires At</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="subscriptionPlansBody" role="rowgroup" aria-live="polite">
                        ${shops.map(shop => {
                            const plan = shop.subscription_plan || 'basic';
                            const expiresAt = shop.subscription_expires_at ? new Date(shop.subscription_expires_at) : null;
                            const isExpired = expiresAt && expiresAt < new Date();
                            const expiresSoon = expiresAt && expiresAt > new Date() && expiresAt < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                            const statusClass = isExpired ? 'badge-danger' : expiresSoon ? 'badge-warning' : 'badge-success';
                            const statusText = isExpired ? 'Expired' : expiresSoon ? 'Expires Soon' : expiresAt ? 'Active' : 'No Plan';
                            const planBadgeClass = plan === 'premium' ? 'badge-success' : plan === 'standard' ? 'badge-warning' : 'badge-info';
                            
                            return `
                                <tr>
                                    <td data-label="Shop Name"><strong>${escapeHtml(shop.shop_name || 'N/A')}</strong></td>
                                    <td data-label="Shop Code">${escapeHtml(shop.shop_code || '-')}</td>
                                    <td data-label="Plan Tier">
                                        <span class="badge ${planBadgeClass}">${escapeHtml(plan.charAt(0).toUpperCase() + plan.slice(1))}</span>
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

async function editSubscriptionPlan(shopId) {
    try {
        // Load shop subscription details
        currentShopSubscription = await apiRequest(`/shops/${shopId}/subscription`);
        
        // Set form values
        document.getElementById('subscriptionShopId').value = shopId;
        document.getElementById('subscriptionPlanTier').value = currentShopSubscription.subscription_plan || 'basic';
        
        // Set expires date
        if (currentShopSubscription.subscription_expires_at) {
            const expiresDate = new Date(currentShopSubscription.subscription_expires_at);
            const localDateTime = new Date(expiresDate.getTime() - expiresDate.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            document.getElementById('subscriptionExpiresAt').value = localDateTime;
        } else {
            // Default: 30 days from now
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 30);
            const localDateTime = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            document.getElementById('subscriptionExpiresAt').value = localDateTime;
        }
        
        // Update plan features display
        updatePlanFeatures();
        
        // Open modal
        if (typeof openModal === 'function') {
            openModal('subscriptionPlanModal');
        } else {
            document.getElementById('subscriptionPlanModal').style.display = 'block';
            document.getElementById('subscriptionPlanModal').setAttribute('aria-hidden', 'false');
        }
    } catch (error) {
        console.error('Error loading shop subscription:', error);
        if (typeof showNotification === 'function') {
            showNotification('Error loading subscription details: ' + (error.message || 'Unknown error'), 'error');
        }
    }
}

function updatePlanFeatures() {
    const planTier = document.getElementById('subscriptionPlanTier').value;
    const planFeaturesList = document.getElementById('planFeaturesList');
    const enabledFeaturesList = document.getElementById('enabledFeaturesList');
    
    if (!planTier) {
        planFeaturesList.innerHTML = '<p style="color: var(--text-secondary);">Select a plan tier to see available features</p>';
        enabledFeaturesList.innerHTML = '<p style="color: var(--text-secondary);">Select features to enable for this shop</p>';
        return;
    }
    
    // Find the plan
    const plan = availablePlans.find(p => p.plan_tier === planTier);
    if (!plan) {
        planFeaturesList.innerHTML = '<p style="color: var(--danger-color);">Plan not found</p>';
        return;
    }
    
    // Display available features
    const features = plan.features || [];
    planFeaturesList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem;">
            ${features.map(feature => `
                <div style="padding: 0.5rem; background: white; border: 1px solid var(--border-color); border-radius: 0;">
                    <i class="fas fa-check-circle fa-icon-success"></i> ${escapeHtml(featureLabels[feature] || feature)}
                </div>
            `).join('')}
        </div>
    `;
    
    // Display enabled features checkboxes
    const enabledFeatures = currentShopSubscription?.enabled_features || [];
    enabledFeaturesList.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${features.map(feature => {
                const isEnabled = enabledFeatures.includes(feature);
                return `
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: white; border-radius: 0;">
                        <input type="checkbox" 
                               name="enabled_features" 
                               value="${escapeHtml(feature)}" 
                               ${isEnabled ? 'checked' : ''}
                               style="width: auto; margin: 0;">
                        <span>${escapeHtml(featureLabels[feature] || feature)}</span>
                    </label>
                `;
            }).join('')}
        </div>
        ${features.length === 0 ? '<p style="color: var(--text-secondary);">No features available for this plan</p>' : ''}
    `;
}

async function handleSubscriptionPlanSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const shopId = parseInt(document.getElementById('subscriptionShopId').value);
    const planTier = document.getElementById('subscriptionPlanTier').value;
    const expiresAt = document.getElementById('subscriptionExpiresAt').value;
    
    // Get enabled features
    const enabledFeatures = Array.from(form.querySelectorAll('input[name="enabled_features"]:checked'))
        .map(checkbox => checkbox.value);
    
    // Show loading
    if (typeof showFormLoading === 'function') {
        showFormLoading(form);
    }
    
    try {
        await apiRequest(`/shops/${shopId}/subscription`, {
            method: 'PUT',
            body: {
                plan_tier: planTier,
                expires_at: expiresAt,
                enabled_features: enabledFeatures
            }
        });
        
        if (typeof showNotification === 'function') {
            showNotification('Subscription plan updated successfully', 'success');
        }
        
        closeSubscriptionPlanModal();
        await loadSubscriptionPlans();
    } catch (error) {
        console.error('Error updating subscription plan:', error);
        if (typeof showNotification === 'function') {
            showNotification('Error updating subscription plan: ' + (error.message || 'Unknown error'), 'error');
        }
    } finally {
        if (typeof hideFormLoading === 'function') {
            hideFormLoading(form);
        }
    }
}

function closeSubscriptionPlanModal() {
    if (typeof closeModal === 'function') {
        closeModal('subscriptionPlanModal');
    } else {
        document.getElementById('subscriptionPlanModal').style.display = 'none';
        document.getElementById('subscriptionPlanModal').setAttribute('aria-hidden', 'true');
    }
    
    // Reset form
    document.getElementById('subscriptionPlanForm').reset();
    document.getElementById('subscriptionShopId').value = '';
    currentShopSubscription = null;
}

// Expose functions to global scope
window.refreshSubscriptionPlans = refreshSubscriptionPlans;
window.editSubscriptionPlan = editSubscriptionPlan;
window.updatePlanFeatures = updatePlanFeatures;
window.handleSubscriptionPlanSubmit = handleSubscriptionPlanSubmit;
window.closeSubscriptionPlanModal = closeSubscriptionPlanModal;

// Load subscription plans on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is superadmin
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'superadmin') {
        if (typeof showNotification === 'function') {
            showNotification('Access denied. Only superadmin can access subscription plans.', 'error');
        }
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 2000);
        return;
    }
    
    await loadSubscriptionPlans();
});
