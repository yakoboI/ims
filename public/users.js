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

function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const title = document.getElementById('userModalTitle');
    const passwordGroup = document.getElementById('passwordGroup');
    const statusGroup = document.getElementById('statusGroup');
    
    if (userId) {
        title.textContent = 'Edit User';
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
        }
    } else {
        title.textContent = 'Add User';
        passwordGroup.style.display = 'block';
        passwordGroup.querySelector('input').setAttribute('required', 'required');
        statusGroup.style.display = 'none';
        form.reset();
        document.getElementById('userId').value = '';
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
        showNotification('Passwords do not match', 'error');
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
        
        showNotification('Password changed successfully');
        closeChangePasswordModal();
    } catch (error) {
        showNotification(error.message || 'Error changing password', 'error');
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
        showNotification('Backup list refreshed', 'success');
    } catch (error) {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Error loading backups: ' + (error.message || 'Unknown error') + '</td></tr>';
        }
        showNotification('Error loading backups: ' + (error.message || 'Unknown error'), 'error');
    }
}

function renderBackupsTable(backups) {
    const tbody = document.getElementById('backupsTableBody');
    
    if (!tbody) return;
    
    if (backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No backups found</td></tr>';
        return;
    }

    tbody.innerHTML = backups.map(backup => `
        <tr>
            <td data-label="Filename"><strong>${backup.filename}</strong></td>
            <td data-label="Size">${formatFileSize(backup.size)}</td>
            <td data-label="Created At">${formatDate(backup.created_at)}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-primary" onclick="restoreBackup('${backup.filename}')">Restore</button>
                <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.filename}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function createBackup() {
    const messageDiv = document.getElementById('backupMessage');
    messageDiv.style.display = 'block';
    messageDiv.className = 'success-message';
    messageDiv.textContent = 'Creating backup...';
    
    try {
        const result = await apiRequest('/backup', {
            method: 'POST'
        });
        
        messageDiv.className = 'success-message show';
        messageDiv.textContent = `Backup created successfully: ${result.filename} (${formatFileSize(result.size)})`;
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
        
        await loadBackups();
    } catch (error) {
        messageDiv.className = 'error-message show';
        messageDiv.textContent = error.message || 'Error creating backup';
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
        
        showNotification(`Database restored successfully from ${filename}. ${result.warning ? result.warning : ''}`, 'success');
        await loadBackups();
        
        setTimeout(() => {
            if (confirm('Database restored. Would you like to reload the page to see the restored data?')) {
                window.location.reload();
            }
        }, 2000);
    } catch (error) {
        showNotification(error.message || 'Error restoring backup', 'error');
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
        
        showNotification('Backup deleted successfully');
        await loadBackups();
    } catch (error) {
        showNotification(error.message || 'Error deleting backup', 'error');
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

document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadBackups();
    await loadRolePermissions();
    setupEventListeners();
});

