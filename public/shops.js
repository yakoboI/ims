// Shop Management JavaScript

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load shops
async function loadShops() {
    const tbody = document.getElementById('shopsTableBody');
    if (!tbody) return;

    try {
        const shops = await apiRequest('/shops');
        
        if (!shops || shops.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No shops found</td></tr>';
            return;
        }

        tbody.innerHTML = shops.map(shop => `
            <tr>
                <td data-label="Shop Name">${escapeHtml(shop.shop_name || '')}</td>
                <td data-label="Shop Code"><code>${escapeHtml(shop.shop_code || '')}</code></td>
                <td data-label="Contact">
                    ${shop.phone ? `<div><strong>Phone:</strong> ${escapeHtml(shop.phone)}</div>` : ''}
                    ${shop.email ? `<div><strong>Email:</strong> ${escapeHtml(shop.email)}</div>` : ''}
                    ${!shop.phone && !shop.email ? '-' : ''}
                </td>
                <td data-label="Status">
                    <span class="badge ${shop.status === 'active' ? 'badge-success' : shop.status === 'suspended' ? 'badge-danger' : 'badge-secondary'}">
                        ${escapeHtml(shop.status || 'active')}
                    </span>
                </td>
                <td data-label="Subscription">${escapeHtml(shop.subscription_plan || 'basic')}</td>
                <td data-label="Created">${shop.created_at ? new Date(shop.created_at).toLocaleDateString() : '-'}</td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-primary" onclick="editShop(${shop.id})" aria-label="Edit shop ${escapeHtml(shop.shop_name || '')}">
                        <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                    </button>
                    ${window.currentUser && window.currentUser.role === 'superadmin' ? `
                        <button class="btn btn-sm btn-danger" onclick="deleteShop(${shop.id})" aria-label="Delete shop ${escapeHtml(shop.shop_name || '')}">
                            <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading shops:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center error">Error loading shops</td></tr>';
    }
}

// Open shop modal
function openShopModal(shopId = null) {
    const modal = document.getElementById('shopModal');
    const form = document.getElementById('shopForm');
    const title = document.getElementById('shopModalTitle');
    
    if (!modal || !form || !title) return;

    if (shopId) {
        title.textContent = 'Edit Shop';
        loadShopData(shopId);
    } else {
        title.textContent = 'Add Shop';
        form.reset();
        document.getElementById('shopId').value = '';
        document.getElementById('shopStatus').value = 'active';
        document.getElementById('shopSubscriptionPlan').value = 'basic';
    }

    modal.style.display = 'block';
}

// Close shop modal
function closeShopModal() {
    const modal = document.getElementById('shopModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load shop data for editing
async function loadShopData(shopId) {
    try {
        const shop = await apiRequest(`/shops/${shopId}`);
        
        document.getElementById('shopId').value = shop.id || '';
        document.getElementById('shopName').value = shop.shop_name || '';
        document.getElementById('shopCode').value = shop.shop_code || '';
        document.getElementById('shopAddress').value = shop.address || '';
        document.getElementById('shopPhone').value = shop.phone || '';
        document.getElementById('shopEmail').value = shop.email || '';
        document.getElementById('shopContactPerson').value = shop.contact_person || '';
        document.getElementById('shopStatus').value = shop.status || 'active';
        document.getElementById('shopSubscriptionPlan').value = shop.subscription_plan || 'basic';
    } catch (error) {
        console.error('Error loading shop data:', error);
        showNotification('Error loading shop data', 'error');
    }
}

// Save shop
async function saveShop(event) {
    event.preventDefault();

    const shopId = document.getElementById('shopId').value;
    const shopData = {
        shop_name: document.getElementById('shopName').value.trim(),
        shop_code: document.getElementById('shopCode').value.trim().toUpperCase(),
        address: document.getElementById('shopAddress').value.trim(),
        phone: document.getElementById('shopPhone').value.trim(),
        email: document.getElementById('shopEmail').value.trim(),
        contact_person: document.getElementById('shopContactPerson').value.trim(),
        status: document.getElementById('shopStatus').value,
        subscription_plan: document.getElementById('shopSubscriptionPlan').value
    };

    try {
        if (shopId) {
            // Update
            await apiRequest(`/shops/${shopId}`, { method: 'PUT', body: shopData });
            showNotification('Shop updated successfully', 'success');
        } else {
            // Create
            await apiRequest('/shops', { method: 'POST', body: shopData });
            showNotification('Shop created successfully', 'success');
        }

        closeShopModal();
        loadShops();
    } catch (error) {
        console.error('Error saving shop:', error);
        showNotification(error.message || 'Error saving shop', 'error');
    }
}

// Edit shop
function editShop(shopId) {
    openShopModal(shopId);
}

// Delete shop
async function deleteShop(shopId) {
    if (!confirm('Are you sure you want to delete this shop? This action cannot be undone.')) {
        return;
    }

    try {
        await apiRequest(`/shops/${shopId}`, { method: 'DELETE' });
        showNotification('Shop deleted successfully', 'success');
        loadShops();
    } catch (error) {
        console.error('Error deleting shop:', error);
        showNotification(error.message || 'Error deleting shop', 'error');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('shopModal');
    if (event.target === modal) {
        closeShopModal();
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadShops();
    });
} else {
    loadShops();
}

// Expose functions to window for onclick handlers
window.openShopModal = openShopModal;
window.closeShopModal = closeShopModal;
window.editShop = editShop;
window.deleteShop = deleteShop;
window.saveShop = saveShop;
