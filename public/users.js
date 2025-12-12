let users = [];


async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    hideTableSkeleton(tableContainer);
    showTableSkeleton(tableContainer, 5, 6);
    tbody.innerHTML = '';
    
    try {
        users = await apiRequest('/users');
        hideTableSkeleton(tableContainer);
        renderUsersTable(users);
    } catch (error) {
        hideTableSkeleton(tableContainer);
        showNotification('Error loading users', 'error');
        if (users.length === 0) {
            showEmptyState(tableContainer, EmptyStates.users);
        }
    }
}

function renderUsersTable(usersList) {
    const tbody = document.getElementById('usersTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (usersList.length === 0) {
        tbody.innerHTML = '';
        showEmptyState(tableContainer, EmptyStates.users);
        return;
    }

    hideEmptyState(tableContainer);
    tbody.innerHTML = usersList.map(user => `
        <tr>
            <td data-label="Username"><strong>${user.username}</strong></td>
            <td data-label="Email">${user.email}</td>
            <td data-label="Full Name">${user.full_name || '-'}</td>
            <td data-label="Role"><span class="badge badge-info">${user.role}</span></td>
            <td data-label="Status">
                ${user.is_active 
                    ? '<span class="badge badge-success">Active</span>' 
                    : '<span class="badge badge-danger">Inactive</span>'}
            </td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="editUser(${user.id})" aria-label="Edit user ${user.username}">Edit</button>
                <button class="btn btn-sm btn-warning" onclick="openChangePasswordModal(${user.id})" aria-label="Change password for ${user.username}">🔑 Change Password</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePasswordSubmit);
}

async function loadShopsForUserForm() {
    const shopSelect = document.getElementById('userShop');
    const shopDisplay = document.getElementById('shopDisplay');
    const shopDisplayText = document.getElementById('shopDisplayText');
    
    if (!shopSelect || !shopDisplay || !shopDisplayText) return;
    
    try {
        shopDisplayText.textContent = 'Loading shop information...';
        const shops = await apiRequest('/shops');
        
        // Clear existing options except the first one
        shopSelect.innerHTML = '<option value="">-- Select Shop --</option>';
        
        // Add shop options
        shops.forEach(shop => {
            const option = document.createElement('option');
            option.value = shop.id;
            option.textContent = `${shop.shop_name} (${shop.shop_code})`;
            shopSelect.appendChild(option);
        });
        
        // Update display text
        if (shops.length === 0) {
            shopDisplayText.textContent = 'No shops available';
        } else {
            shopDisplayText.textContent = `${shops.length} shop(s) available`;
        }
    } catch (error) {
        console.error('Error loading shops:', error);
        shopDisplayText.textContent = 'Error loading shops';
        shopDisplayText.style.color = 'var(--danger-color)';
    }
}

function handleRoleChange() {
    const role = document.getElementById('userRole').value;
    const shopGroup = document.getElementById('shopGroup');
    const shopSelect = document.getElementById('userShop');
    const shopDisplay = document.getElementById('shopDisplay');
    
    if (!shopGroup || !shopSelect || !shopDisplay) return;
    
    // Show shop selection for non-superadmin roles
    if (role && role !== 'superadmin') {
        shopSelect.style.display = 'block';
        shopDisplay.style.display = 'none';
    } else {
        shopSelect.style.display = 'none';
        shopDisplay.style.display = 'block';
    }
}

async function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const title = document.getElementById('userModalTitle');
    const passwordGroup = document.getElementById('passwordGroup');
    const statusGroup = document.getElementById('statusGroup');
    
    // Load shops when modal opens
    await loadShopsForUserForm();
    
    if (userId) {
        title.textContent = window.i18n ? window.i18n.t('users.editUser') : 'Edit User';
        passwordGroup.style.display = 'none';
        passwordGroup.querySelector('input').removeAttribute('required');
        statusGroup.style.display = 'block';
        
        const user = users.find(u => u.id === userId);
        if (user) {
            document.getElementById('userId').value = user.id;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userFullName').value = user.full_name || '';
            document.getElementById('userRole').value = user.role;
            document.getElementById('userStatus').value = user.is_active ? '1' : '0';
            
            // Set shop if user has one
            if (user.shop_id) {
                document.getElementById('userShop').value = user.shop_id;
            }
            
            // Handle role change to show/hide shop selection
            handleRoleChange();
        }
    } else {
        title.textContent = window.i18n ? window.i18n.t('users.addUser') : 'Add User';
        passwordGroup.style.display = 'block';
        passwordGroup.querySelector('input').setAttribute('required', 'required');
        statusGroup.style.display = 'none';
        form.reset();
        document.getElementById('userId').value = '';
        document.getElementById('userShop').value = '';
        
        // Handle role change to show/hide shop selection
        handleRoleChange();
    }
    
    const firstInput = document.getElementById('userUsername');
    openModal('userModal', firstInput);
}

function closeUserModal() {
    closeModal('userModal');
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('passwordGroup').querySelector('input').setAttribute('required', 'required');
    document.getElementById('statusGroup').style.display = 'none';
}

async function handleUserSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const userId = document.getElementById('userId').value;
    
    // Validate form
    const validationRules = {
        userUsername: ValidationRules.username,
        userEmail: ValidationRules.email
    };
    
    if (!userId) {
        validationRules.userPassword = ValidationRules.password;
    }
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const userData = {
        username: document.getElementById('userUsername').value,
        email: document.getElementById('userEmail').value,
        full_name: document.getElementById('userFullName').value || null,
        role: document.getElementById('userRole').value
    };
    
    // Add shop_id if selected and role is not superadmin
    const shopId = document.getElementById('userShop').value;
    if (shopId && userData.role !== 'superadmin') {
        userData.shop_id = parseInt(shopId);
    } else if (userData.role !== 'superadmin') {
        // For non-superadmin roles, shop_id is required
        showNotification('Please select a shop for this user', 'error');
        hideFormLoading(form);
        return;
    }
    
    if (userId) {
        userData.is_active = parseInt(document.getElementById('userStatus').value);
        
        try {
            await apiRequest(`/users/${userId}`, {
                method: 'PUT',
                body: userData
            });
            
            showNotification('User updated successfully');
            closeUserModal();
            await loadUsers();
        } catch (error) {
            showNotification(error.message || 'Error updating user', 'error');
        } finally {
            hideFormLoading(form);
        }
    } else {
        userData.password = document.getElementById('userPassword').value;
        
        try {
            await apiRequest('/users', {
                method: 'POST',
                body: userData
            });
            
            showNotification('User created successfully');
            closeUserModal();
            await loadUsers();
        } catch (error) {
            showNotification(error.message || 'Error creating user', 'error');
        } finally {
            hideFormLoading(form);
        }
    }
}

function editUser(userId) {
    openUserModal(userId);
}

function openChangePasswordModal(userId) {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        showNotification('User not found', 'error');
        return;
    }
    
    document.getElementById('changePasswordUserId').value = user.id;
    document.getElementById('changePasswordUsername').value = user.username;
    form.reset();
    document.getElementById('changePasswordUserId').value = user.id;
    document.getElementById('changePasswordUsername').value = user.username;
    
    const firstInput = document.getElementById('changePasswordNew');
    openModal('changePasswordModal', firstInput);
}

function closeChangePasswordModal() {
    closeModal('changePasswordModal');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordUserId').value = '';
    document.getElementById('changePasswordUsername').value = '';
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const userId = document.getElementById('changePasswordUserId').value;
    const newPassword = document.getElementById('changePasswordNew').value;
    const confirmPassword = document.getElementById('changePasswordConfirm').value;
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showNotification(window.i18n ? window.i18n.t('messages.passwordsDoNotMatch') : 'Passwords do not match', 'error');
        return;
    }
    
    // Validate password strength
    const validationRules = {
        changePasswordNew: ValidationRules.password
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    try {
        await apiRequest(`/users/${userId}/change-password`, {
            method: 'POST',
            body: { newPassword }
        });
        
        showNotification(window.i18n ? window.i18n.t('messages.passwordChanged') : 'Password changed successfully');
        closeChangePasswordModal();
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorChangingPassword') : 'Error changing password');
        showNotification(errorMsg, 'error');
    } finally {
        hideFormLoading(form);
    }
}

async function loadBackups() {
    const tbody = document.getElementById('backupsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
    }
    
    try {
        const backups = await apiRequest('/backups');
        renderBackupsTable(backups);
        showNotification(window.i18n ? window.i18n.t('messages.backupListRefreshed') : 'Backup list refreshed', 'success');
    } catch (error) {
        if (tbody) {
            const errorText = window.i18n ? window.i18n.t('messages.errorLoadingBackups') : 'Error loading backups';
            const unknownError = window.i18n ? window.i18n.t('messages.unknownError') : 'Unknown error';
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">' + errorText + ': ' + (error.message || unknownError) + '</td></tr>';
        }
        const errorMsg = (window.i18n ? window.i18n.t('messages.errorLoadingBackups') : 'Error loading backups') + ': ' + (error.message || (window.i18n ? window.i18n.t('messages.unknownError') : 'Unknown error'));
        showNotification(errorMsg, 'error');
    }
}

function renderBackupsTable(backups) {
    const tbody = document.getElementById('backupsTableBody');
    
    if (!tbody) return;
    
    if (backups.length === 0) {
        const noBackups = window.i18n ? window.i18n.t('messages.noBackupsFound') : 'No backups found';
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">' + noBackups + '</td></tr>';
        return;
    }

    tbody.innerHTML = backups.map(backup => `
        <tr>
            <td data-label="Filename"><strong>${backup.filename}</strong></td>
            <td data-label="Size">${formatFileSize(backup.size)}</td>
            <td data-label="Created At">${formatDate(backup.created_at)}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-primary" onclick="restoreBackup('${backup.filename}')">${window.i18n ? window.i18n.t('messages.restore') : 'Restore'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.filename}')">${window.i18n ? window.i18n.t('common.delete') : 'Delete'}</button>
            </td>
        </tr>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes === 0) return window.i18n ? window.i18n.t('messages.zeroBytes') : '0 Bytes';
    const k = 1024;
    const sizes = window.i18n ? [
        window.i18n.t('messages.bytes'),
        window.i18n.t('messages.kb'),
        window.i18n.t('messages.mb'),
        window.i18n.t('messages.gb')
    ] : ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function createBackup() {
    const messageDiv = document.getElementById('backupMessage');
    messageDiv.style.display = 'block';
    messageDiv.className = 'success-message';
    messageDiv.textContent = window.i18n ? window.i18n.t('messages.creatingBackup') : 'Creating backup...';
    
    try {
        const result = await apiRequest('/backup', {
            method: 'POST'
        });
        
        messageDiv.className = 'success-message show';
        const successMsg = window.i18n ? window.i18n.t('messages.backupCreated') : 'Backup created successfully';
        messageDiv.textContent = `${successMsg}: ${result.filename} (${formatFileSize(result.size)})`;
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
        
        await loadBackups();
    } catch (error) {
        messageDiv.className = 'error-message show';
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorCreatingBackup') : 'Error creating backup');
        messageDiv.textContent = errorMsg;
    }
}

async function restoreBackup(filename) {
    if (!confirm(`Are you sure you want to restore from backup "${filename}"?\n\nThis will replace the current database. A backup of the current database will be created automatically.\n\nNote: You may need to restart the server after restore.`)) {
        return;
    }
    
    if (!confirm('This action cannot be undone. Are you absolutely sure?')) {
        return;
    }
    
    try {
        const result = await apiRequest('/restore', {
            method: 'POST',
            body: { filename }
        });
        
        const restoreMsg = window.i18n ? window.i18n.t('messages.backupRestored') : 'Database restored successfully';
        showNotification(`${restoreMsg} from ${filename}. ${result.warning ? result.warning : ''}`, 'success');
        await loadBackups();
        
        setTimeout(() => {
            if (confirm('Database restored. Would you like to reload the page to see the restored data?')) {
                window.location.reload();
            }
        }, 2000);
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorRestoringBackup') : 'Error restoring backup');
        showNotification(errorMsg, 'error');
    }
}

async function deleteBackup(filename) {
    if (!confirm(`Are you sure you want to delete backup "${filename}"?`)) {
        return;
    }
    
    try {
        await apiRequest(`/backups/${filename}`, {
            method: 'DELETE'
        });
        
        showNotification(window.i18n ? window.i18n.t('messages.backupDeleted') : 'Backup deleted successfully');
        await loadBackups();
    } catch (error) {
        const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.errorDeletingBackup') : 'Error deleting backup');
        showNotification(errorMsg, 'error');
    }
}

let rolePermissions = {};
const pages = ['dashboard', 'inventory', 'purchases', 'sales', 'reports', 'users'];
const roles = ['admin', 'storekeeper', 'sales', 'manager'];
const pageLabels = {
    'dashboard': 'Dashboard',
    'inventory': 'Inventory',
    'purchases': 'Purchases',
    'sales': 'Sales',
    'reports': 'Reports',
    'users': 'User Management'
};

async function loadRolePermissions() {
    try {
        const permissions = await apiRequest('/role-permissions');
        
        rolePermissions = {};
        roles.forEach(role => {
            rolePermissions[role] = {};
            pages.forEach(page => {
                const perm = permissions.find(p => p.role === role && p.page === page);
                rolePermissions[role][page] = perm ? perm.can_access === 1 : false;
            });
        });
        
        renderRolePermissions();
    } catch (error) {
        showNotification('Error loading role permissions', 'error');
    }
}

function renderRolePermissions() {
    const container = document.getElementById('rolePermissionsContainer');
    if (!container) return;
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Role</th>
                    ${pages.map(page => `<th>${pageLabels[page]}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${roles.map(role => `
                    <tr>
                        <td><strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong></td>
                        ${pages.map(page => `
                            <td class="text-center">
                                <input type="checkbox" 
                                       id="perm-${role}-${page}" 
                                       ${rolePermissions[role] && rolePermissions[role][page] ? 'checked' : ''}
                                       ${role === 'admin' ? 'disabled' : ''}
                                       onchange="updatePermission('${role}', '${page}', this.checked)">
                            </td>
                        `).join('')}
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="saveRolePermissions('${role}')">Save</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div style="margin-top: 1.5rem;">
            <button class="btn btn-primary" onclick="saveAllPermissions()">💾 Save All Changes</button>
        </div>
    `;
}

function updatePermission(role, page, canAccess) {
    if (!rolePermissions[role]) {
        rolePermissions[role] = {};
    }
    rolePermissions[role][page] = canAccess;
}

async function saveRolePermissions(role) {
    try {
        const permissions = pages.map(page => ({
            role: role,
            page: page,
            can_access: rolePermissions[role][page] || false
        }));
        
        await apiRequest('/role-permissions/bulk', {
            method: 'PUT',
            body: { permissions }
        });
        
        showNotification(`Permissions for ${role} saved successfully`);
    } catch (error) {
        showNotification(error.message || 'Error saving permissions', 'error');
    }
}

async function saveAllPermissions() {
    try {
        const allPermissions = [];
        roles.forEach(role => {
            pages.forEach(page => {
                allPermissions.push({
                    role: role,
                    page: page,
                    can_access: rolePermissions[role] && rolePermissions[role][page] || false
                });
            });
        });
        
        await apiRequest('/role-permissions/bulk', {
            method: 'PUT',
            body: { permissions: allPermissions }
        });
        
        showNotification('All permissions saved successfully');
    } catch (error) {
        showNotification(error.message || 'Error saving permissions', 'error');
    }
}

// Expose functions to global scope for onclick handlers
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.editUser = editUser;
window.handleRoleChange = handleRoleChange;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.deleteBackup = deleteBackup;
window.loadBackups = loadBackups;
window.loadRolePermissions = loadRolePermissions;
window.saveRolePermissions = saveRolePermissions;
window.saveAllPermissions = saveAllPermissions;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadBackups();
    await loadRolePermissions();
    setupEventListeners();
});

