let allSettings = {};
let currentCategory = 'general';
let hasUnsavedChanges = false;

// Category display order and labels
const categoryConfig = {
    general: { label: 'General Settings', icon: 'fa-cog' },
    security: { label: 'Security Settings', icon: 'fa-shield-alt' },
    currency: { label: 'Currency Settings', icon: 'fa-dollar-sign' },
    datetime: { label: 'Date & Time Settings', icon: 'fa-clock' },
    display: { label: 'Display Settings', icon: 'fa-desktop' },
    email: { label: 'Email Settings', icon: 'fa-envelope' },
    backup: { label: 'Backup Settings', icon: 'fa-database' },
    notification: { label: 'Notification Settings', icon: 'fa-bell' }
};

// Field configurations for each setting
const fieldConfigs = {
    system_name: { type: 'text', label: 'System Name', placeholder: 'Enter system name' },
    shop_system_name: { type: 'text', label: 'Shop Sub-System Name', placeholder: 'Enter sub-system name for this shop (e.g., "Main Store", "Warehouse Branch")' },
    company_name: { type: 'text', label: 'Company Name', placeholder: 'Enter company name' },
    company_address: { type: 'text', label: 'Company Address', placeholder: 'Enter company address' },
    company_phone: { type: 'text', label: 'Company Phone', placeholder: 'Enter phone number' },
    company_email: { type: 'email', label: 'Company Email', placeholder: 'Enter email address' },
    company_tax_id: { type: 'text', label: 'Company Tax ID', placeholder: 'Enter tax ID/VAT number' },
    default_tax_rate: { type: 'number', label: 'Default Tax Rate (%)', min: 0, max: 100, step: 0.01 },
    tax_calculation_method: { type: 'select', label: 'Tax Calculation Method', options: ['inclusive', 'exclusive'] },
    invoice_number_format: { type: 'text', label: 'Invoice Number Format', placeholder: 'INV-{YYYY}-{MM}-{####}' },
    receipt_number_format: { type: 'text', label: 'Receipt Number Format', placeholder: 'RCP-{YYYY}-{MM}-{####}' },
    system_timezone: { type: 'select', label: 'System Timezone', options: ['UTC', 'Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'America/New_York', 'Europe/London', 'Asia/Dubai'] },
    date_format: { type: 'select', label: 'Date Format', options: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'] },
    time_format: { type: 'select', label: 'Time Format', options: ['12h', '24h'] },
    currency_code: { type: 'text', label: 'Currency Code', placeholder: 'TZS, USD, EUR, etc.' },
    currency_symbol: { type: 'text', label: 'Currency Symbol', placeholder: 'Tshs, $, €, etc.' },
    currency_position: { type: 'select', label: 'Currency Position', options: ['before', 'after'] },
    decimal_places: { type: 'number', label: 'Decimal Places', min: 0, max: 4 },
    items_per_page: { type: 'number', label: 'Items Per Page', min: 10, max: 100, step: 5 },
    print_paper_size: { type: 'select', label: 'Print Paper Size', options: ['A4', 'Letter', 'Legal', 'A3'] },
    print_margin: { type: 'number', label: 'Print Margin (mm)', min: 0, max: 50 },
    session_timeout: { type: 'number', label: 'Session Timeout (minutes)', min: 5, max: 480 },
    password_min_length: { type: 'number', label: 'Minimum Password Length', min: 6, max: 32 },
    require_strong_password: { type: 'checkbox', label: 'Require Strong Password' },
    enable_two_factor: { type: 'checkbox', label: 'Enable Two-Factor Authentication' },
    max_login_attempts: { type: 'number', label: 'Max Login Attempts', min: 3, max: 10 },
    lockout_duration: { type: 'number', label: 'Lockout Duration (minutes)', min: 5, max: 1440 },
    backup_auto_enabled: { type: 'checkbox', label: 'Enable Automatic Backups' },
    backup_frequency: { type: 'select', label: 'Backup Frequency', options: ['daily', 'weekly', 'monthly'] },
    backup_retention_days: { type: 'number', label: 'Backup Retention (days)', min: 7, max: 365 },
    backup_location: { type: 'select', label: 'Backup Location', options: ['local', 'cloud'] },
    email_enabled: { type: 'checkbox', label: 'Enable Email Notifications' },
    email_host: { type: 'text', label: 'SMTP Host', placeholder: 'smtp.example.com' },
    email_port: { type: 'number', label: 'SMTP Port', min: 1, max: 65535 },
    email_secure: { type: 'checkbox', label: 'Use Secure Connection (TLS)' },
    email_username: { type: 'text', label: 'SMTP Username', placeholder: 'your-email@example.com' },
    email_password: { type: 'password', label: 'SMTP Password', placeholder: 'Enter password' },
    email_from: { type: 'email', label: 'From Email Address', placeholder: 'noreply@example.com' },
    email_from_name: { type: 'text', label: 'From Name', placeholder: 'Company Name' },
    low_stock_notification: { type: 'checkbox', label: 'Enable Low Stock Notifications' },
    low_stock_threshold: { type: 'number', label: 'Low Stock Threshold (%)', min: 1, max: 50 },
    enable_audit_log: { type: 'checkbox', label: 'Enable Audit Logging' },
    audit_log_retention_days: { type: 'number', label: 'Audit Log Retention (days)', min: 7, max: 365 },
    enable_api_rate_limit: { type: 'checkbox', label: 'Enable API Rate Limiting' },
    api_rate_limit_per_minute: { type: 'number', label: 'API Requests Per Minute', min: 10, max: 1000 },
    theme: { type: 'select', label: 'Application Theme', options: ['light', 'dark', 'auto'] },
    language: { type: 'select', label: 'Default Language', options: ['en', 'sw', 'fr', 'es'] },
    enable_barcode_scanning: { type: 'checkbox', label: 'Enable Barcode Scanning' },
    barcode_format: { type: 'select', label: 'Barcode Format', options: ['CODE128', 'EAN13', 'EAN8', 'CODE39', 'ITF14'] }
};

async function loadSettings() {
    const content = document.getElementById('settingsContent');
    if (content) {
        content.innerHTML = '<div class="text-center" style="padding: 3rem;"><div class="loading-spinner"></div><p>Loading settings...</p></div>';
    }
    
    try {
        allSettings = await apiRequest('/settings');
        
        // Update shop context display
        updateShopContextDisplay();
        
        renderSettings();
        setupTabNavigation();
    } catch (error) {
        showNotification('Error loading settings: ' + (error.message || 'Unknown error'), 'error');
        if (content) {
            content.innerHTML = '<div class="text-center" style="padding: 3rem;"><p style="color: var(--danger-color);">Error loading settings. Please refresh the page.</p></div>';
        }
    }
}

// Update shop context display
function updateShopContextDisplay() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) return;
    
    const pageHeader = document.querySelector('.page-header h1');
    if (!pageHeader) return;
    
    let shopContext = '';
    
    if (currentUser.role === 'superadmin') {
        // Superadmin can select shop
        const shopId = window.selectedShopId || (localStorage.getItem('selectedShopId') ? parseInt(localStorage.getItem('selectedShopId')) : null);
        if (shopId) {
            // Try to get shop name from shop selector
            const shopSelector = document.getElementById('shopSelector');
            if (shopSelector && shopSelector.value) {
                const selectedOption = shopSelector.options[shopSelector.selectedIndex];
                shopContext = ` - ${selectedOption.text.split(' (')[0]}`;
            } else {
                shopContext = ` - Shop ID: ${shopId}`;
            }
        } else {
            shopContext = ' - Global Settings';
        }
    } else if (currentUser.role === 'admin' && currentUser.shop_id) {
        // Shop admin - show their shop
        shopContext = ` - Shop Settings`;
    } else {
        // Admin without shop_id
        shopContext = ' - Global Settings';
    }
    
    // Update header
    const originalText = pageHeader.textContent.replace(/ - .*$/, '');
    pageHeader.textContent = originalText + shopContext;
}

function renderSettings() {
    const content = document.getElementById('settingsContent');
    if (!content) return;
    
    const category = allSettings[currentCategory] || [];
    
    if (category.length === 0) {
        content.innerHTML = `
            <div class="section-card">
                <p class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                    No settings found for this category.
                </p>
            </div>
        `;
        return;
    }
    
    const settingsHTML = category.map(setting => {
        const config = fieldConfigs[setting.key] || { type: 'text', label: setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
        const fieldId = `setting_${setting.key}`;
        
        let inputHTML = '';
        
        if (config.type === 'checkbox') {
            inputHTML = `
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="${fieldId}" ${setting.value ? 'checked' : ''} 
                               onchange="markAsChanged('${setting.key}')" 
                               style="width: auto; margin: 0;">
                        <span>${config.label || setting.key}</span>
                    </label>
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem; margin-left: 1.75rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else if (config.type === 'select') {
            const options = (config.options || []).map(opt => 
                `<option value="${opt}" ${setting.value === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <select id="${fieldId}" class="form-control" onchange="markAsChanged('${setting.key}')">
                        ${options}
                    </select>
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else if (config.type === 'number') {
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="number" id="${fieldId}" class="form-control" 
                           value="${setting.value !== null && setting.value !== undefined ? setting.value : ''}"
                           ${config.min !== undefined ? `min="${config.min}"` : ''}
                           ${config.max !== undefined ? `max="${config.max}"` : ''}
                           ${config.step !== undefined ? `step="${config.step}"` : ''}
                           onchange="markAsChanged('${setting.key}')"
                           placeholder="${config.placeholder || ''}">
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else if (config.type === 'password') {
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="password" id="${fieldId}" class="form-control" 
                           value="" 
                           onchange="markAsChanged('${setting.key}')"
                           placeholder="${setting.is_encrypted ? '•••••••• (leave blank to keep current)' : config.placeholder || 'Enter password'}">
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else {
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="${config.type || 'text'}" id="${fieldId}" class="form-control" 
                           value="${setting.value !== null && setting.value !== undefined ? escapeHtml(String(setting.value)) : ''}"
                           onchange="markAsChanged('${setting.key}')"
                           placeholder="${config.placeholder || ''}">
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        }
        
        return inputHTML;
    }).join('');
    
    // Add per-category save button and test email button
    let categoryHeader = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0;">
                <i class="fas ${categoryConfig[currentCategory]?.icon || 'fa-cog'} fa-icon-primary"></i>
                ${categoryConfig[currentCategory]?.label || currentCategory}
            </h2>
            <button type="button" class="btn btn-primary" onclick="saveCurrentCategory()">
                <i class="fas fa-save"></i> Save ${categoryConfig[currentCategory]?.label || currentCategory}
            </button>
        </div>
    `;
    
    // Add test email section for email category
    let testEmailSection = '';
    if (currentCategory === 'email') {
        testEmailSection = `
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0;">
                <label for="testEmailInput" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Test Email Configuration:</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="email" id="testEmailInput" placeholder="Enter email address to test" 
                           style="flex: 1; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0;">
                    <button type="button" class="btn btn-secondary" onclick="testEmail()">
                        <i class="fas fa-paper-plane"></i> Send Test Email
                    </button>
                </div>
            </div>
        `;
    }
    
    content.innerHTML = `
        <form id="settingsForm" class="settings-form">
            <div class="section-card">
                ${categoryHeader}
                ${testEmailSection}
                <div class="settings-grid">
                    ${settingsHTML}
                </div>
            </div>
        </form>
    `;
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.settings-tabs .tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const category = tab.getAttribute('data-category');
            switchCategory(category);
        });
    });
}

function switchCategory(category) {
    if (hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Do you want to discard them and switch category?')) {
            return;
        }
        hasUnsavedChanges = false;
    }
    
    currentCategory = category;
    
    // Update tab states
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(tab => {
        if (tab.getAttribute('data-category') === category) {
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
        } else {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        }
    });
    
    renderSettings();
}

function markAsChanged(key) {
    hasUnsavedChanges = true;
    // Show unsaved changes indicator
    const indicator = document.getElementById('unsavedChangesIndicator');
    if (indicator) {
        indicator.style.display = 'flex';
    }
    // Add visual indicator to save button
    const saveBtn = document.querySelector('button[onclick="saveAllSettings()"]');
    if (saveBtn) {
        saveBtn.classList.add('btn-warning');
        saveBtn.style.opacity = '1';
    }
    // Mark the changed input
    const input = document.getElementById(`setting_${key}`);
    if (input) {
        input.style.borderColor = 'var(--warning-color)';
        input.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.2)';
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function saveAllSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) {
        showNotification('No settings form found', 'error');
        return;
    }
    
    const settingsToSave = [];
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        const fieldId = input.id;
        if (fieldId.startsWith('setting_')) {
            const key = fieldId.replace('setting_', '');
            const config = fieldConfigs[key];
            let value = input.value;
            
            if (config && config.type === 'checkbox') {
                value = input.checked;
            } else if (config && config.type === 'number') {
                value = value !== '' ? parseFloat(value) : null;
                // Validate number ranges
                if (value !== null && !isNaN(value)) {
                    if (config.min !== undefined && value < config.min) {
                        showNotification(`${config.label || key} must be at least ${config.min}`, 'error');
                        return;
                    }
                    if (config.max !== undefined && value > config.max) {
                        showNotification(`${config.label || key} must be at most ${config.max}`, 'error');
                        return;
                    }
                }
            } else if (config && config.type === 'password' && value === '') {
                // Skip password fields that are empty (don't update)
                return;
            } else if (config && config.type === 'email' && value) {
                // Validate email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    showNotification(`Invalid email format for ${config.label || key}`, 'error');
                    return;
                }
            } else if (value === '') {
                value = null;
            }
            
            settingsToSave.push({ key, value });
        }
    });
    
    if (settingsToSave.length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }
    
    // Show loading state
    const saveBtn = document.querySelector('button[onclick="saveAllSettings()"]');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        await apiRequest('/settings', {
            method: 'PUT',
            body: { settings: settingsToSave }
        });
        
        showNotification('Settings saved successfully', 'success');
        hasUnsavedChanges = false;
        
        // Hide unsaved changes indicator
        const indicator = document.getElementById('unsavedChangesIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
        
        // Reset visual indicators
        const saveBtn = document.querySelector('button[onclick="saveAllSettings()"]');
        if (saveBtn) {
            saveBtn.classList.remove('btn-warning');
        }
        document.querySelectorAll('#settingsForm input, #settingsForm select').forEach(input => {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        });
        
        // Clear settings cache
        if (window.clearSettingsCache) {
            window.clearSettingsCache();
        }
        
        // Reload settings to get updated values
        await loadSettings();
    } catch (error) {
        showNotification('Error saving settings: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

async function resetToDefaults() {
    if (!confirm('Are you sure you want to reset all settings to their default values? This action cannot be undone.')) {
        return;
    }
    
    const resetBtn = document.querySelector('button[onclick="resetToDefaults()"]');
    const originalText = resetBtn ? resetBtn.innerHTML : '';
    if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
    }
    
    try {
        // Delete all shop-specific settings to revert to global defaults
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const shopId = shopFilter.shop_id || null;
        
        if (shopId) {
            // Delete shop-specific settings
            await apiRequest('/settings/reset', {
                method: 'POST',
                body: { shop_id: shopId }
            });
            showNotification('Settings reset to defaults successfully', 'success');
        } else {
            // For global settings, we need to reset each one individually
            // Get all current settings and reset them
            const currentSettings = await apiRequest('/settings');
            const settingsToReset = [];
            
            // Collect all settings that need resetting
            Object.keys(currentSettings).forEach(category => {
                currentSettings[category].forEach(setting => {
                    if (setting.shop_id === null) {
                        // Get default value from field config or use empty
                        const config = fieldConfigs[setting.key];
                        let defaultValue = null;
                        if (config && config.type === 'checkbox') {
                            defaultValue = false;
                        } else if (config && config.type === 'number') {
                            defaultValue = config.min !== undefined ? config.min : 0;
                        } else if (config && config.options && config.options.length > 0) {
                            defaultValue = config.options[0];
                        }
                        settingsToReset.push({ key: setting.key, value: defaultValue });
                    }
                });
            });
            
            if (settingsToReset.length > 0) {
                await apiRequest('/settings', {
                    method: 'PUT',
                    body: { settings: settingsToReset }
                });
                showNotification('Settings reset to defaults successfully', 'success');
            } else {
                showNotification('No settings to reset', 'info');
            }
        }
        
        hasUnsavedChanges = false;
        await loadSettings();
    } catch (error) {
        showNotification('Error resetting settings: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (resetBtn) {
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalText;
        }
    }
}

// Check for unsaved changes before leaving page
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
    }
});

// Save current category only
async function saveCurrentCategory() {
    const form = document.getElementById('settingsForm');
    if (!form) {
        showNotification('No settings form found', 'error');
        return;
    }
    
    const settingsToSave = [];
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        const fieldId = input.id;
        if (fieldId.startsWith('setting_')) {
            const key = fieldId.replace('setting_', '');
            // Only save settings from current category
            const setting = (allSettings[currentCategory] || []).find(s => s.key === key);
            if (!setting) return;
            
            const config = fieldConfigs[key];
            let value = input.value;
            
            if (config && config.type === 'checkbox') {
                value = input.checked;
            } else if (config && config.type === 'number') {
                value = value !== '' ? parseFloat(value) : null;
                if (value !== null && !isNaN(value)) {
                    if (config.min !== undefined && value < config.min) {
                        showNotification(`${config.label || key} must be at least ${config.min}`, 'error');
                        return;
                    }
                    if (config.max !== undefined && value > config.max) {
                        showNotification(`${config.label || key} must be at most ${config.max}`, 'error');
                        return;
                    }
                }
            } else if (config && config.type === 'password' && value === '') {
                return; // Skip empty passwords
            } else if (config && config.type === 'email' && value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    showNotification(`Invalid email format for ${config.label || key}`, 'error');
                    return;
                }
            } else if (value === '') {
                value = null;
            }
            
            settingsToSave.push({ key, value });
        }
    });
    
    if (settingsToSave.length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }
    
    const saveBtn = event?.target?.closest('button') || document.querySelector('button[onclick="saveCurrentCategory()"]');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        await apiRequest('/settings', {
            method: 'PUT',
            body: { settings: settingsToSave }
        });
        
        showNotification(`${categoryConfig[currentCategory]?.label || currentCategory} settings saved successfully`, 'success');
        hasUnsavedChanges = false;
        const indicator = document.getElementById('unsavedChangesIndicator');
        if (indicator) indicator.style.display = 'none';
        
        // Clear visual indicators
        inputs.forEach(input => {
            if (input.id.startsWith('setting_')) {
                input.style.borderColor = '';
                input.style.boxShadow = '';
            }
        });
        
        // Clear settings cache
        if (window.clearSettingsCache) {
            window.clearSettingsCache();
        }
        
        await loadSettings();
    } catch (error) {
        showNotification('Error saving settings: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// Export settings
async function exportSettings() {
    try {
        const API_BASE_URL = window.location.origin + '/api';
        const response = await fetch(API_BASE_URL + '/settings/export', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to export settings');
        }
        
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `settings-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Settings exported successfully', 'success');
    } catch (error) {
        showNotification('Error exporting settings: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Import settings
async function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.settings || !Array.isArray(data.settings)) {
                throw new Error('Invalid settings file format');
            }
            
            if (!confirm(`Import ${data.settings.length} settings? This will overwrite existing settings.`)) {
                return;
            }
            
            const importBtn = document.querySelector('button[onclick="importSettings()"]');
            const originalText = importBtn ? importBtn.innerHTML : '';
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
            }
            
            const result = await apiRequest('/settings/import', {
                method: 'POST',
                body: { settings: data.settings }
            });
            
            showNotification(`Settings imported successfully. ${result.imported_count} settings imported.`, 'success');
            
            if (window.clearSettingsCache) {
                window.clearSettingsCache();
            }
            
            await loadSettings();
            
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = originalText;
            }
        } catch (error) {
            showNotification('Error importing settings: ' + (error.message || 'Unknown error'), 'error');
        }
    };
    
    input.click();
}

// Test email
async function testEmail() {
    const emailInput = document.getElementById('testEmailInput');
    if (!emailInput) {
        showNotification('Test email input not found', 'error');
        return;
    }
    
    const testEmail = emailInput.value.trim();
    if (!testEmail || !testEmail.includes('@')) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    const testBtn = event?.target?.closest('button') || document.querySelector('button[onclick="testEmail()"]');
    const originalText = testBtn ? testBtn.innerHTML : '';
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    }
    
    try {
        const result = await apiRequest('/settings/test-email', {
            method: 'POST',
            body: { test_email: testEmail }
        });
        
        showNotification(`Email configuration is valid. Test email would be sent to ${testEmail}. Note: Actual email sending requires email service configuration.`, 'success');
    } catch (error) {
        showNotification('Error testing email: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = originalText;
        }
    }
}

// Filter settings by search term
function filterSettings(searchTerm) {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    
    const searchLower = searchTerm.toLowerCase();
    const formGroups = form.querySelectorAll('.form-group');
    let visibleCount = 0;
    
    formGroups.forEach(group => {
        const label = group.querySelector('label');
        const input = group.querySelector('input, select');
        const small = group.querySelector('small');
        
        const labelText = label ? label.textContent.toLowerCase() : '';
        const inputValue = input ? input.value.toLowerCase() : '';
        const descText = small ? small.textContent.toLowerCase() : '';
        
        const matches = labelText.includes(searchLower) || 
                       inputValue.includes(searchLower) || 
                       descText.includes(searchLower);
        
        if (matches) {
            group.style.display = '';
            visibleCount++;
        } else {
            group.style.display = 'none';
        }
    });
    
    // Show message if no results
    const noResultsMsg = document.getElementById('noSearchResults');
    if (searchTerm && visibleCount === 0) {
        if (!noResultsMsg) {
            const msg = document.createElement('div');
            msg.id = 'noSearchResults';
            msg.className = 'text-center';
            msg.style.padding = '2rem';
            msg.innerHTML = `<p style="color: var(--text-secondary);">No settings match "${escapeHtml(searchTerm)}"</p>`;
            form.appendChild(msg);
        }
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// Expose functions to global scope
window.saveAllSettings = saveAllSettings;
window.saveCurrentCategory = saveCurrentCategory;
window.resetToDefaults = resetToDefaults;
window.markAsChanged = markAsChanged;
window.exportSettings = exportSettings;
window.importSettings = importSettings;
window.testEmail = testEmail;
window.filterSettings = filterSettings;

document.addEventListener('DOMContentLoaded', async () => {
    // Check user role - only admin and superadmin can access
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
        showNotification('Access denied. Only administrators can access settings.', 'error');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 2000);
        return;
    }
    
    // Initialize shop selector for superadmin
    // Note: shop-selector.js already handles shop change events and calls updateSystemNameDisplay
    if (currentUser.role === 'superadmin' && window.initShopSelector) {
        await window.initShopSelector();
    }
    
    await loadSettings();
});

