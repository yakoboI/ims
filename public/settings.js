let allSettings = {};
let currentCategory = 'general';
let hasUnsavedChanges = false;
let superadminMode = 'inspect'; // 'inspect' or 'configure'

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
    default_tax_rate: { type: 'number', label: 'Default Tax Rate (%)', min: 0, max: 100, step: 0.01, formatThousands: false },
    tax_calculation_method: { type: 'select', label: 'Tax Calculation Method', options: ['inclusive', 'exclusive'] },
    invoice_number_format: { type: 'text', label: 'Invoice Number Format', placeholder: 'INV-{YYYY}-{MM}-{####}' },
    receipt_number_format: { type: 'text', label: 'Receipt Number Format', placeholder: 'RCP-{YYYY}-{MM}-{####}' },
    system_timezone: { 
        type: 'select', 
        label: 'System Timezone', 
        options: [
            'UTC', 
            'Africa/Dar_es_Salaam', 
            'Africa/Nairobi', 
            'Africa/Kampala', 
            'Africa/Johannesburg',
            'Africa/Cairo',
            'Africa/Lagos',
            'America/New_York', 
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Asia/Dubai',
            'Asia/Singapore',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Kolkata',
            'Australia/Sydney'
        ],
        description: 'Select the timezone for your system. This affects how dates and times are displayed and stored.'
    },
    date_format: { 
        type: 'select', 
        label: 'Date Format', 
        options: [
            'YYYY-MM-DD', 
            'DD/MM/YYYY', 
            'MM/DD/YYYY', 
            'DD-MM-YYYY',
            'MM-DD-YYYY',
            'YYYY/MM/DD',
            'DD.MM.YYYY',
            'MM.DD.YYYY'
        ],
        description: 'Choose how dates are displayed throughout the system. Example formats: YYYY-MM-DD (2024-12-25), DD/MM/YYYY (25/12/2024), MM/DD/YYYY (12/25/2024).'
    },
    time_format: { 
        type: 'select', 
        label: 'Time Format', 
        options: ['12h', '24h'],
        description: 'Choose between 12-hour format (with AM/PM) or 24-hour format (military time). Example: 12h = 2:30 PM, 24h = 14:30.'
    },
    currency_code: { type: 'text', label: 'Currency Code', placeholder: 'TZS, USD, EUR, etc.' },
    currency_symbol: { type: 'text', label: 'Currency Symbol', placeholder: 'Tshs, $, €, etc.' },
    currency_position: { type: 'select', label: 'Currency Position', options: ['before', 'after'] },
    decimal_places: { type: 'number', label: 'Decimal Places', min: 0, max: 4 },
    items_per_page: { 
        type: 'number', 
        label: 'Items Per Page', 
        min: 10, 
        max: 100, 
        step: 5,
        placeholder: '25',
        description: 'Number of items displayed per page in tables. Recommended: 25-50 for optimal performance and readability.'
    },
    print_paper_size: { 
        type: 'select', 
        label: 'Print Paper Size', 
        options: ['A4', 'Letter', 'Legal', 'A3'],
        description: 'Default paper size for printing reports, invoices, and receipts. A4 is standard in most countries, Letter is standard in North America.'
    },
    print_margin: { 
        type: 'number', 
        label: 'Print Margin (mm)', 
        min: 0, 
        max: 50,
        placeholder: '10',
        description: 'Margin size in millimeters for printed documents. Recommended: 10-15mm for standard documents.'
    },
    session_timeout: { 
        type: 'number', 
        label: 'Session Timeout (minutes)', 
        min: 5, 
        max: 480,
        placeholder: '30',
        description: 'Users will be automatically logged out after this period of inactivity. Recommended: 30-60 minutes.'
    },
    password_min_length: { 
        type: 'number', 
        label: 'Minimum Password Length', 
        min: 6, 
        max: 32,
        placeholder: '8',
        description: 'Minimum number of characters required for user passwords. Recommended: 8-12 characters.'
    },
    require_strong_password: { 
        type: 'checkbox', 
        label: 'Require Strong Password',
        description: 'When enabled, passwords must contain uppercase, lowercase, numbers, and special characters.'
    },
    enable_two_factor: { 
        type: 'checkbox', 
        label: 'Enable Two-Factor Authentication (2FA)',
        description: 'Requires users to verify their identity using a second factor (e.g., SMS code, authenticator app). Note: Full 2FA implementation requires additional setup.'
    },
    max_login_attempts: { 
        type: 'number', 
        label: 'Max Login Attempts', 
        min: 3, 
        max: 10,
        placeholder: '5',
        description: 'Maximum number of failed login attempts before account is locked. Recommended: 5 attempts.'
    },
    lockout_duration: { 
        type: 'number', 
        label: 'Lockout Duration (minutes)', 
        min: 5, 
        max: 1440,
        placeholder: '15',
        description: 'How long an account remains locked after exceeding max login attempts. Recommended: 15-30 minutes.'
    },
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
    theme: { 
        type: 'select', 
        label: 'Application Theme', 
        options: ['light', 'dark', 'auto'],
        description: 'Choose the visual theme for the application. Light: bright interface, Dark: dark interface, Auto: follows your system preference.'
    },
    language: { 
        type: 'select', 
        label: 'Default Language', 
        options: [
            { value: 'en', label: 'English' },
            { value: 'sw', label: 'Swahili (Kiswahili)' },
            { value: 'fr', label: 'French (Français)' },
            { value: 'es', label: 'Spanish (Español)' },
            { value: 'hi', label: 'Hindi (हिन्दी)' },
            { value: 'ar', label: 'Arabic (العربية)' },
            { value: 'zh', label: 'Chinese (中文)' }
        ],
        description: 'Select the language for the application interface. Multiple languages are now available including English, Kiswahili, French, Spanish, Hindi, Arabic, and Chinese. Some pages may require a refresh to see all translations.'
    },
    enable_barcode_scanning: { 
        type: 'checkbox', 
        label: 'Enable Barcode Scanning',
        description: 'When enabled, allows users to scan barcodes using device camera for quick item lookup and entry.'
    },
    barcode_format: { 
        type: 'select', 
        label: 'Barcode Format', 
        options: ['CODE128', 'EAN13', 'EAN8', 'CODE39', 'ITF14'],
        description: 'Default barcode format for generating barcodes. CODE128 is the most versatile and commonly used format.'
    },

    // INVENTORY / ACCOUNTING SETTINGS (minor UI for existing backend keys)
    inventory_method: {
        type: 'select',
        label: 'Inventory Model',
        options: ['perpetual', 'periodic'],
        description: 'Perpetual: stock updates in real-time on every transaction. Periodic: stock is updated at period-end based on physical counts.'
    },
    valuation_method: {
        type: 'select',
        label: 'Inventory Valuation Method',
        options: ['FIFO', 'LIFO', 'WAC'],
        description: 'Select how Cost of Goods Sold (COGS) is calculated: FIFO (oldest cost first), LIFO (newest cost first), or WAC (Weighted Average Cost). Changing this may impact financial reports.'
    }
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
    
    // Security settings are always global, regardless of shop selection
    if (currentCategory === 'security') {
        shopContext = ' - Global Settings (Applies to All Shops)';
    } else if (currentUser.role === 'superadmin') {
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
    
    // Check if user is superadmin
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();
    
    // Use wizard for email and backup settings
    if (currentCategory === 'email') {
        renderEmailSettingsWizard();
        return;
    }
    
    if (currentCategory === 'backup') {
        renderBackupSettingsWizard();
        return;
    }
    
    if (currentCategory === 'notification') {
        renderNotificationSettingsWizard();
        return;
    }
    
    // Categories that should be view-only for non-superadmin users
    const isSecurityViewOnly = currentCategory === 'security' && !isSuperadmin;
    const isCurrencyViewOnly = currentCategory === 'currency' && !isSuperadmin;
    // In Inspect mode, superadmin cannot edit settings
    const isViewOnlyCategory = isSecurityViewOnly || isCurrencyViewOnly || isInspectMode;
    
    let category = allSettings[currentCategory] || [];
    
    // If category is empty, create default settings from fieldConfigs
    if (category.length === 0) {
        // Get all settings keys for this category from fieldConfigs
        const categoryKeys = Object.keys(fieldConfigs).filter(key => {
            // Map keys to categories
            if (currentCategory === 'general') {
                return ['system_name', 'shop_system_name', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_tax_id', 'default_tax_rate', 'tax_calculation_method', 'invoice_number_format', 'receipt_number_format'].includes(key);
            } else if (currentCategory === 'security') {
                return ['session_timeout', 'password_min_length', 'require_strong_password', 'enable_two_factor', 'max_login_attempts', 'lockout_duration'].includes(key);
            } else if (currentCategory === 'currency') {
                return ['currency_code', 'currency_symbol', 'currency_position', 'decimal_places'].includes(key);
            } else if (currentCategory === 'datetime') {
                return ['system_timezone', 'date_format', 'time_format'].includes(key);
            } else if (currentCategory === 'display') {
                return ['items_per_page', 'print_paper_size', 'print_margin', 'theme', 'language', 'enable_barcode_scanning', 'barcode_format'].includes(key);
            } else if (currentCategory === 'email') {
                return ['email_enabled', 'email_host', 'email_port', 'email_secure', 'email_username', 'email_password', 'email_from', 'email_from_name'].includes(key);
            } else if (currentCategory === 'backup') {
                return ['backup_auto_enabled', 'backup_frequency', 'backup_retention_days', 'backup_location'].includes(key);
            } else if (currentCategory === 'notification') {
                return ['low_stock_notification', 'low_stock_threshold', 'enable_audit_log', 'audit_log_retention_days', 'enable_api_rate_limit', 'api_rate_limit_per_minute'].includes(key);
            }
            return false;
        });
        
        // Create default settings objects
        category = categoryKeys.map(key => ({
            key: key,
            value: null,
            category: currentCategory,
            description: null,
            shop_id: null,
            is_encrypted: fieldConfigs[key]?.type === 'password' ? 1 : 0
        }));

        // Store these defaults back into allSettings so save functions
        // can detect and persist changes even when the DB has no rows yet.
        allSettings[currentCategory] = category;
    }
    
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
            const description = config.description || setting.description;
            const disabledAttr = isViewOnlyCategory ? 'disabled' : '';
            const cursorStyle = isViewOnlyCategory ? 'cursor: not-allowed;' : 'cursor: pointer;';
            
            // Properly handle checkbox value - can be boolean, string "true"/"false", "1"/"0", or null
            const isChecked = setting.value === true || 
                             setting.value === 1 || 
                             setting.value === '1' || 
                             (typeof setting.value === 'string' && setting.value.toLowerCase() === 'true');
            
            inputHTML = `
                <div class="form-group">
                    <label style="display: flex; align-items: flex-start; gap: 0.5rem; ${cursorStyle}">
                        <input type="checkbox" id="${fieldId}" ${isChecked ? 'checked' : ''} 
                               ${disabledAttr}
                               ${isViewOnlyCategory ? '' : 'onchange="markAsChanged(\'' + setting.key + '\')"'}
                               style="width: auto; margin: 0; margin-top: 0.25rem; flex-shrink: 0; ${isViewOnlyCategory ? 'opacity: 0.6;' : ''}">
                        <div style="flex: 1;">
                            <span style="font-weight: 500;">${config.label || setting.key}</span>
                            ${description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem; line-height: 1.4;">${description}</small>` : ''}
                        </div>
                    </label>
                </div>
            `;
        } else if (config.type === 'select') {
            const hasValue = setting.value !== null && setting.value !== undefined && setting.value !== '';
            // Handle options that might be objects with value/label
            const formatOption = (opt) => {
                if (typeof opt === 'object' && opt.value !== undefined) {
                    return `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label || opt.value)}</option>`;
                }
                return `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`;
            };
            const options = `<option value="">-- Select ${config.label || setting.key} --</option>` +
                (config.options || []).map(opt => {
                    const optValue = typeof opt === 'object' && opt.value !== undefined ? opt.value : opt;
                    const optLabel = typeof opt === 'object' && opt.label !== undefined ? opt.label : opt;
                    const optValueStr = escapeHtml(String(optValue));
                    const optLabelStr = escapeHtml(String(optLabel));
                    return `<option value="${optValueStr}" ${setting.value === optValue || (!hasValue && opt === config.options[0]) ? 'selected' : ''}>${optLabelStr}</option>`;
                }).join('');
            const disabledAttr = isViewOnlyCategory ? 'disabled' : '';
            const readonlyStyle = isViewOnlyCategory ? 'background-color: #f5f5f5; cursor: not-allowed; opacity: 0.7;' : '';
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <select id="${fieldId}" class="form-control" ${disabledAttr} ${isViewOnlyCategory ? '' : 'onchange="markAsChanged(\'' + setting.key + '\')"'} style="${readonlyStyle}">
                        ${options}
                    </select>
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else if (config.type === 'number') {
            const description = config.description || setting.description;
            const defaultValue = config.placeholder || '';
            // Check if this field should have thousand separator formatting
            // Apply to fields that might have large values (>= 1000) or currency-related fields
            const needsThousandSeparator = config.formatThousands !== false && 
                (config.formatThousands === true ||
                 (config.max === undefined || config.max >= 1000) || 
                 setting.key.includes('amount') || setting.key.includes('price') || 
                 setting.key.includes('value') || setting.key.includes('total') ||
                 setting.key.includes('rate') || setting.key.includes('tax') ||
                 setting.key.includes('cost') || setting.key.includes('fee') ||
                 setting.key.includes('threshold') || setting.key.includes('limit'));
            
            const inputType = needsThousandSeparator ? 'text' : 'number';
            const displayValue = needsThousandSeparator && setting.value !== null && setting.value !== undefined 
                ? formatNumberWithSeparator(setting.value) 
                : (setting.value !== null && setting.value !== undefined ? setting.value : defaultValue);
            
            const disabledAttr = isViewOnlyCategory ? 'disabled readonly' : '';
            const readonlyStyle = isViewOnlyCategory ? 'background-color: #f5f5f5; cursor: not-allowed; opacity: 0.7;' : '';
            const eventHandlers = isViewOnlyCategory ? '' : (needsThousandSeparator ? `oninput="handleNumberInputWithSeparator(this, '${setting.key}')"` : `onchange="markAsChanged('${setting.key}')"`);
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="${inputType}" id="${fieldId}" class="form-control ${needsThousandSeparator ? 'number-with-separator' : ''}" 
                           value="${displayValue}"
                           ${disabledAttr}
                           ${config.min !== undefined ? `min="${config.min}"` : ''}
                           ${config.max !== undefined ? `max="${config.max}"` : ''}
                           ${config.step !== undefined ? `step="${config.step}"` : ''}
                           data-original-type="number"
                           data-setting-key="${setting.key}"
                           ${eventHandlers}
                           style="${readonlyStyle}"
                           placeholder="${config.placeholder || ''}">
                    ${description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem; line-height: 1.4;">${description}</small>` : ''}
                    <div id="${fieldId}_validation" class="setting-validation" style="display: none; margin-top: 0.25rem;"></div>
                </div>
            `;
        } else if (config.type === 'password') {
            const disabledAttr = isViewOnlyCategory ? 'disabled readonly' : '';
            const readonlyStyle = isViewOnlyCategory ? 'background-color: #f5f5f5; cursor: not-allowed; opacity: 0.7;' : '';
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="password" id="${fieldId}" class="form-control" 
                           value="" 
                           ${disabledAttr}
                           ${isViewOnlyCategory ? '' : 'onchange="markAsChanged(\'' + setting.key + '\')"'}
                           style="${readonlyStyle}"
                           placeholder="${setting.is_encrypted ? '•••••••• (leave blank to keep current)' : config.placeholder || 'Enter password'}">
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        } else {
            const disabledAttr = isViewOnlyCategory ? 'disabled readonly' : '';
            const readonlyStyle = isViewOnlyCategory ? 'background-color: #f5f5f5; cursor: not-allowed; opacity: 0.7;' : '';
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="${config.type || 'text'}" id="${fieldId}" class="form-control" 
                           value="${setting.value !== null && setting.value !== undefined ? escapeHtml(String(setting.value)) : ''}"
                           ${disabledAttr}
                           ${isViewOnlyCategory ? '' : 'onchange="markAsChanged(\'' + setting.key + '\')"'}
                           style="${readonlyStyle}"
                           placeholder="${config.placeholder || ''}">
                    ${setting.description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem;">${setting.description}</small>` : ''}
                </div>
            `;
        }
        
        return inputHTML;
    }).join('');
    
    // Add per-category save button and test email button
    // Hide save button for security & currency settings if user is not superadmin, or if in Inspect mode
    const viewOnlyMessage = isInspectMode
        ? 'Inspect Mode: Settings are read-only. Switch to Configure Mode to make changes.'
        : (currentCategory === 'security'
            ? 'Security settings are view-only. Only superadmin can modify these settings.'
            : (currentCategory === 'currency'
                ? 'Currency settings are view-only. Only superadmin can modify these settings.'
                : ''));

    const saveButtonHTML = (isViewOnlyCategory && viewOnlyMessage)
        ? `<div style="padding: 0.75rem 1rem; background: ${isInspectMode ? 'var(--info-bg)' : '#fff3cd'}; border: 1px solid ${isInspectMode ? 'var(--info-color)' : '#ffc107'}; border-radius: 4px; color: ${isInspectMode ? 'var(--info-color)' : '#856404'};">
            <i class="fas ${isInspectMode ? 'fa-eye' : 'fa-lock'}"></i> ${viewOnlyMessage}
           </div>`
        : `<button type="button" class="btn btn-primary" onclick="saveCurrentCategory()">
            <i class="fas fa-save"></i> Save ${categoryConfig[currentCategory]?.label || currentCategory}
           </button>`;
    
    let categoryHeader = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0;">
                <i class="fas ${categoryConfig[currentCategory]?.icon || 'fa-cog'} fa-icon-primary"></i>
                ${categoryConfig[currentCategory]?.label || currentCategory}
            </h2>
            ${saveButtonHTML}
        </div>
    `;
    
    // Add security info section for security category
    const securityInfoSection = addSecurityInfoSection();
    
    // Add date/time preview section for datetime category
    const dateTimePreviewSection = addDateTimePreviewSection();
    
    // Add test email section for email category
    let testEmailSection = '';
    if (currentCategory === 'email') {
        testEmailSection = `
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 0;">
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
                ${securityInfoSection}
                ${dateTimePreviewSection}
                ${testEmailSection}
                <div class="settings-grid">
                    ${settingsHTML}
                </div>
            </div>
        </form>
    `;
    
    // Initialize validation for security settings
    if (currentCategory === 'security') {
        setTimeout(() => {
            ['password_min_length', 'session_timeout', 'max_login_attempts', 'lockout_duration'].forEach(key => {
                const input = document.getElementById(`setting_${key}`);
                if (input) {
                    validateSecuritySetting(key);
                }
            });
        }, 100);
    }
    
    // Initialize thousand separator formatting for numeric inputs
    setTimeout(() => {
        const formattedInputs = document.querySelectorAll('.number-with-separator');
        formattedInputs.forEach(input => {
            // Ensure data-numeric-value is set on load
            const currentValue = input.value;
            if (currentValue) {
                const numericValue = removeThousandSeparator(currentValue);
                input.setAttribute('data-numeric-value', numericValue);
            }
        });
    }, 100);
    
    // Initialize date/time format preview for datetime category
    if (currentCategory === 'datetime') {
        setTimeout(() => {
            setupDateTimePreview();
            // Update preview when settings change
            ['date_format', 'time_format', 'system_timezone'].forEach(key => {
                const input = document.getElementById(`setting_${key}`);
                if (input) {
                    input.addEventListener('change', () => {
                        markAsChanged(key);
                        updateDateTimePreview();
                    });
                }
            });
        }, 100);
    }
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.settings-tabs .tab-btn');
    tabs.forEach(tab => {
        // Remove existing click listeners by cloning and replacing
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        
        // Add click listener to new tab
        newTab.addEventListener('click', () => {
            const category = newTab.getAttribute('data-category');
            switchCategory(category);
        });
        
        // Update active state based on currentCategory
        const category = newTab.getAttribute('data-category');
        if (category === currentCategory) {
            newTab.classList.add('active');
            newTab.setAttribute('aria-selected', 'true');
        } else {
            newTab.classList.remove('active');
            newTab.setAttribute('aria-selected', 'false');
        }
    });
}

function switchCategory(category) {
    // Cleanup datetime preview interval if switching away from datetime category
    if (currentCategory === 'datetime' && window.datetimePreviewInterval) {
        clearInterval(window.datetimePreviewInterval);
        window.datetimePreviewInterval = null;
    }
    
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
    
    // Also mark category save button
    const categorySaveBtn = document.querySelector('button[onclick="saveCurrentCategory()"]');
    if (categorySaveBtn) {
        categorySaveBtn.classList.add('btn-warning');
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format number with thousand separator
function formatNumberWithSeparator(value) {
    if (value === null || value === undefined || value === '') return '';
    
    // Convert to string and remove any existing separators
    let numStr = String(value).replace(/,/g, '');
    
    // Handle decimal numbers
    const parts = numStr.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    
    // Add thousand separators to integer part
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Reconstruct with decimal part if exists
    return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

// Remove thousand separators and return numeric value
function removeThousandSeparator(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace(/,/g, '');
}

// Handle number input with thousand separator formatting
function handleNumberInputWithSeparator(input, settingKey) {
    const cursorPosition = input.selectionStart;
    const originalValue = input.value;
    
    // Remove all non-numeric characters except decimal point
    let cleanedValue = originalValue.replace(/[^\d.]/g, '');
    
    // Handle multiple decimal points (keep only the first one)
    const decimalIndex = cleanedValue.indexOf('.');
    if (decimalIndex !== -1) {
        cleanedValue = cleanedValue.substring(0, decimalIndex + 1) + 
                      cleanedValue.substring(decimalIndex + 1).replace(/\./g, '');
    }
    
    // Format with thousand separators
    const formattedValue = formatNumberWithSeparator(cleanedValue);
    
    // Calculate new cursor position
    // Count characters before cursor in original value (excluding commas)
    const beforeCursor = originalValue.substring(0, cursorPosition);
    const digitsBeforeCursor = beforeCursor.replace(/[^\d.]/g, '').length;
    
    // Find position in formatted value that matches the same number of digits
    let newPosition = 0;
    let digitsCounted = 0;
    for (let i = 0; i < formattedValue.length && digitsCounted < digitsBeforeCursor; i++) {
        if (formattedValue[i].match(/[\d.]/)) {
            digitsCounted++;
        }
        newPosition = i + 1;
    }
    
    // Update input value
    input.value = formattedValue;
    
    // Ensure cursor position is within bounds
    const safePosition = Math.min(Math.max(newPosition, 0), formattedValue.length);
    input.setSelectionRange(safePosition, safePosition);
    
    // Mark as changed and validate
    markAsChanged(settingKey);
    validateSecuritySetting(settingKey);
    
    // Store the numeric value (without separators) in a data attribute for form submission
    input.setAttribute('data-numeric-value', cleanedValue);
}

// Validate security settings with real-time feedback
function validateSecuritySetting(key) {
    const input = document.getElementById(`setting_${key}`);
    const validationDiv = document.getElementById(`${input?.id}_validation`);
    if (!input || !validationDiv) return;
    
    const value = input.value;
    const config = fieldConfigs[key];
    let isValid = true;
    let message = '';
    
    if (key === 'password_min_length') {
        const minLen = parseInt(value);
        if (isNaN(minLen) || minLen < 6) {
            isValid = false;
            message = 'Minimum password length must be at least 6 characters';
        } else if (minLen > 32) {
            isValid = false;
            message = 'Maximum password length is 32 characters';
        } else if (minLen < 8) {
            isValid = true;
            message = '⚠️ Recommended: Use at least 8 characters for better security';
        } else {
            isValid = true;
            message = '✓ Good password length';
        }
    } else if (key === 'session_timeout') {
        const timeout = parseInt(value);
        if (isNaN(timeout) || timeout < 5) {
            isValid = false;
            message = 'Session timeout must be at least 5 minutes';
        } else if (timeout > 480) {
            isValid = false;
            message = 'Session timeout cannot exceed 480 minutes (8 hours)';
        } else if (timeout < 15) {
            isValid = true;
            message = '⚠️ Very short timeout may inconvenience users';
        } else if (timeout > 120) {
            isValid = true;
            message = '⚠️ Long timeout reduces security';
        } else {
            isValid = true;
            message = '✓ Recommended timeout range';
        }
    } else if (key === 'max_login_attempts') {
        const attempts = parseInt(value);
        if (isNaN(attempts) || attempts < 3) {
            isValid = false;
            message = 'Minimum login attempts must be at least 3';
        } else if (attempts > 10) {
            isValid = false;
            message = 'Maximum login attempts cannot exceed 10';
        } else if (attempts < 5) {
            isValid = true;
            message = '⚠️ Fewer attempts provide better security but may lock out legitimate users';
        } else {
            isValid = true;
            message = '✓ Good balance between security and usability';
        }
    } else if (key === 'lockout_duration') {
        const duration = parseInt(value);
        if (isNaN(duration) || duration < 5) {
            isValid = false;
            message = 'Lockout duration must be at least 5 minutes';
        } else if (duration > 1440) {
            isValid = false;
            message = 'Lockout duration cannot exceed 1440 minutes (24 hours)';
        } else if (duration < 15) {
            isValid = true;
            message = '⚠️ Short lockout may not deter attackers';
        } else if (duration > 60) {
            isValid = true;
            message = '⚠️ Long lockout may inconvenience legitimate users';
        } else {
            isValid = true;
            message = '✓ Recommended lockout duration';
        }
    }
    
    if (message) {
        validationDiv.style.display = 'block';
        validationDiv.style.color = isValid ? 'var(--success-color)' : 'var(--danger-color)';
        validationDiv.style.fontSize = '0.875rem';
        validationDiv.innerHTML = message;
        input.style.borderColor = isValid ? 'var(--success-color)' : 'var(--danger-color)';
    } else {
        validationDiv.style.display = 'none';
        input.style.borderColor = '';
    }
}

// Add security info section for security category
function addSecurityInfoSection() {
    if (currentCategory !== 'security') return '';
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    
    return `
        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid var(--primary-color); margin-bottom: 1.5rem; border-radius: 0;">
            <h3 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1rem;">
                <i class="fas fa-info-circle"></i> Security Settings Information
            </h3>
            <ul style="margin: 0; padding-left: 1.5rem; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
                <li><strong>Global Settings:</strong> Security settings apply to <strong>all shops</strong> system-wide</li>
                <li>Use strong passwords (minimum 8 characters with mixed case, numbers, and symbols)</li>
                <li>Set session timeout to 30-60 minutes for balance between security and usability</li>
                <li>Limit login attempts to 5 to prevent brute force attacks</li>
                <li>Enable two-factor authentication for additional security</li>
                <li>Regularly review audit logs to monitor system access</li>
                ${isSuperadmin ? '<li style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-shield-alt"></i> As superadmin, your changes will apply to all shops in the system</li>' : ''}
            </ul>
        </div>
    `;
}

// Add date/time preview section for datetime category
function addDateTimePreviewSection() {
    if (currentCategory !== 'datetime') return '';
    
    return `
        <div id="datetimePreviewSection" style="padding: 1rem; background: #f0fdf4; border-left: 4px solid var(--success-color); margin-bottom: 1.5rem; border-radius: 0;">
            <h3 style="margin: 0 0 0.5rem 0; color: var(--success-color); font-size: 1rem;">
                <i class="fas fa-eye"></i> Format Preview
            </h3>
            <div style="color: var(--text-secondary); font-size: 0.875rem;">
                <p style="margin: 0.25rem 0;"><strong>Current Date:</strong> <span id="previewCurrentDate">-</span></p>
                <p style="margin: 0.25rem 0;"><strong>Current Time:</strong> <span id="previewCurrentTime">-</span></p>
                <p style="margin: 0.25rem 0;"><strong>Date & Time:</strong> <span id="previewDateTime">-</span></p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">
                    <i class="fas fa-info-circle"></i> This preview updates automatically as you change the settings above.
                </p>
            </div>
        </div>
    `;
}

// Setup date/time format preview
function setupDateTimePreview() {
    updateDateTimePreview();
    // Update preview every second to show live time
    if (window.datetimePreviewInterval) {
        clearInterval(window.datetimePreviewInterval);
    }
    window.datetimePreviewInterval = setInterval(updateDateTimePreview, 1000);
}

// Update date/time format preview
function updateDateTimePreview() {
    const dateFormatInput = document.getElementById('setting_date_format');
    const timeFormatInput = document.getElementById('setting_time_format');
    const timezoneInput = document.getElementById('setting_system_timezone');
    
    if (!dateFormatInput || !timeFormatInput) return;
    
    const dateFormat = dateFormatInput.value || 'YYYY-MM-DD';
    const timeFormat = timeFormatInput.value || '24h';
    const timezone = timezoneInput ? timezoneInput.value : 'UTC';
    
    const now = new Date();
    
    // Format date
    const formattedDate = formatDateByFormat(now, dateFormat);
    const previewDateEl = document.getElementById('previewCurrentDate');
    if (previewDateEl) {
        previewDateEl.textContent = formattedDate || '-';
    }
    
    // Format time
    const formattedTime = formatTimeByFormat(now, timeFormat, timezone);
    const previewTimeEl = document.getElementById('previewCurrentTime');
    if (previewTimeEl) {
        previewTimeEl.textContent = formattedTime || '-';
    }
    
    // Format date & time combined
    const formattedDateTime = `${formattedDate} ${formattedTime}`;
    const previewDateTimeEl = document.getElementById('previewDateTime');
    if (previewDateTimeEl) {
        previewDateTimeEl.textContent = formattedDateTime || '-';
    }
}

// Format date according to selected format
function formatDateByFormat(date, format) {
    if (!date || !format) return '';
    
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
}

// Format time according to selected format
function formatTimeByFormat(date, format, timezone = 'UTC') {
    if (!date || !format) return '';
    
    const d = new Date(date);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    if (format === '12h') {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    } else {
        return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }
}

async function saveAllSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) {
        showNotification('No settings form found', 'error');
        return;
    }
    
    const settingsToSave = [];
    const inputs = form.querySelectorAll('input, select');
    let hasValidationError = false;
    
    inputs.forEach(input => {
        const fieldId = input.id;
        if (fieldId.startsWith('setting_')) {
            const key = fieldId.replace('setting_', '');
            const config = fieldConfigs[key];
            let value = input.value;
            
            // Get original value for comparison
            const originalSetting = Object.values(allSettings).flat().find(s => s.key === key);
            const originalValue = originalSetting ? originalSetting.value : null;
            
            if (config && config.type === 'checkbox') {
                value = input.checked;
            } else if (input.classList.contains('number-with-separator')) {
                // Handle formatted numbers (with thousand separators)
                const numericValue = input.getAttribute('data-numeric-value') || removeThousandSeparator(value);
                value = numericValue !== '' ? parseFloat(numericValue) : null;
                if (value !== null && !isNaN(value)) {
                    if (config && config.min !== undefined && value < config.min) {
                        showNotification(`${config.label || key} must be at least ${config.min}`, 'error');
                        hasValidationError = true;
                        return;
                    }
                    if (config && config.max !== undefined && value > config.max) {
                        showNotification(`${config.label || key} must be at most ${config.max}`, 'error');
                        hasValidationError = true;
                        return;
                    }
                }
            } else if (config && config.type === 'number') {
                value = value !== '' ? parseFloat(value) : null;
                // Validate number ranges
                if (value !== null && !isNaN(value)) {
                    if (config.min !== undefined && value < config.min) {
                        showNotification(`${config.label || key} must be at least ${config.min}`, 'error');
                        hasValidationError = true;
                        return;
                    }
                    if (config.max !== undefined && value > config.max) {
                        showNotification(`${config.label || key} must be at most ${config.max}`, 'error');
                        hasValidationError = true;
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
                    hasValidationError = true;
                    return;
                }
            } else if (value === '') {
                value = null;
            }
            
            // Compare with original value - only save if changed
            let valueChanged = false;
            if (config && config.type === 'checkbox') {
                // Normalize both values for comparison
                const normalizedValue = value === true || value === 1 || value === '1' || (typeof value === 'string' && value.toLowerCase() === 'true');
                const normalizedOriginal = originalValue === true || originalValue === 1 || originalValue === '1' || (typeof originalValue === 'string' && originalValue.toLowerCase() === 'true');
                valueChanged = normalizedValue !== normalizedOriginal;
            } else if (value === null && originalValue === null) {
                valueChanged = false;
            } else if (value === null || originalValue === null) {
                valueChanged = true;
            } else {
                // Compare values (handle number comparison)
                const currentValue = typeof value === 'number' ? value : String(value);
                const origValue = typeof originalValue === 'number' ? originalValue : String(originalValue);
                valueChanged = currentValue !== origValue;
            }
            
            // Only add to save list if value has changed
            if (valueChanged) {
                settingsToSave.push({ key, value });
            }
        }
    });
    
    // If there was a validation error, don't proceed
    if (hasValidationError) {
        return;
    }
    
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
            saveBtn.style.opacity = '';
        }
        const categorySaveBtn = document.querySelector('button[onclick="saveCurrentCategory()"]');
        if (categorySaveBtn) {
            categorySaveBtn.classList.remove('btn-warning');
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
// Get form data with proper handling of formatted numbers
function getFormData() {
    const formData = {};
    const form = document.getElementById('settingsForm');
    if (!form) return formData;
    
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        const key = input.id.replace('setting_', '');
        let value = input.value;
        
        // Handle formatted numbers (with thousand separators)
        if (input.classList.contains('number-with-separator')) {
            // Use the numeric value stored in data attribute, or parse from formatted value
            value = input.getAttribute('data-numeric-value') || removeThousandSeparator(value);
            // Convert to number if it's a valid number
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                value = numValue;
            }
        } else if (input.type === 'number') {
            // Convert number inputs to actual numbers
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                value = numValue;
            }
        } else if (input.type === 'checkbox') {
            value = input.checked;
        }
        
        formData[key] = value;
    });
    
    return formData;
}

// Apply display settings throughout the application
async function applyDisplaySettings(settings) {
    for (const setting of settings) {
        switch (setting.key) {
            case 'theme':
                applyTheme(setting.value);
                break;
            case 'language':
                applyLanguage(setting.value);
                break;
            case 'items_per_page':
                applyItemsPerPage(setting.value);
                break;
            case 'print_paper_size':
            case 'print_margin':
                applyPrintSettings();
                break;
            case 'enable_barcode_scanning':
                applyBarcodeScanning(setting.value);
                break;
            case 'barcode_format':
                // Barcode format is applied when generating barcodes
                break;
        }
    }
}

// Apply theme setting
function applyTheme(theme) {
    const root = document.documentElement;
    const body = document.body;
    
    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
    
    if (theme === 'auto') {
        // Use system preference
        body.classList.add('theme-auto');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        body.classList.toggle('dark-mode', prefersDark);
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            body.classList.toggle('dark-mode', e.matches);
        });
    } else if (theme === 'dark') {
        body.classList.add('theme-dark', 'dark-mode');
    } else {
        body.classList.add('theme-light');
        body.classList.remove('dark-mode');
    }
    
    // Store in localStorage for persistence
    safeStorageSet('appTheme', theme);
    
    // Apply dark mode CSS variables if needed
    if (body.classList.contains('dark-mode')) {
        root.style.setProperty('--bg-color', '#0f172a');
        root.style.setProperty('--card-bg', '#1e293b');
        root.style.setProperty('--text-primary', '#f1f5f9');
        root.style.setProperty('--text-secondary', '#94a3b8');
        root.style.setProperty('--border-color', '#334155');
    } else {
        root.style.setProperty('--bg-color', '#f8fafc');
        root.style.setProperty('--card-bg', '#ffffff');
        root.style.setProperty('--text-primary', '#1e293b');
        root.style.setProperty('--text-secondary', '#64748b');
        root.style.setProperty('--border-color', '#e2e8f0');
    }
}

// Apply language setting
async function applyLanguage(language) {
    if (!language) {
        console.warn('No language provided to applyLanguage');
        return;
    }
    
    // Store language preference
    safeStorageSet('appLanguage', language);
    
    // Set HTML lang attribute (helps with accessibility and browser features)
    document.documentElement.lang = language;
    
    const langNames = {
        'en': 'English',
        'sw': 'Kiswahili',
        'fr': 'French',
        'es': 'Spanish',
        'hi': 'Hindi',
        'ar': 'Arabic',
        'zh': 'Chinese'
    };
    const langName = langNames[language] || language;
    
    // Apply translations using i18n system
    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        try {
            await window.i18n.setLanguage(language);
            console.log('Language changed to:', language);
            
            // Dispatch custom event to notify other components
            window.dispatchEvent(new CustomEvent('languageChanged', { 
                detail: { language: language } 
            }));
            
            // Show notification to user
            if (window.showNotification) {
                showNotification(`Language changed to ${langName}. Some elements may require a page refresh to fully translate.`, 'success');
            }
        } catch (error) {
            console.error('Error applying language:', error);
            if (window.showNotification) {
                showNotification(`Language preference saved: ${langName}. Please refresh the page to see changes.`, 'info');
            }
        }
    } else {
        // i18n.js not loaded yet, will be applied on next page load
        console.log('i18n.js not loaded. Language preference saved. Will apply on page reload.');
        
        // Show notification
        if (window.showNotification) {
            showNotification(`Language preference saved: ${langName}. Please refresh the page to see changes.`, 'info');
        }
    }
}

// Apply items per page setting
function applyItemsPerPage(itemsPerPage) {
    const value = itemsPerPage || 25;
    safeStorageSet('itemsPerPage', value);
    
    // Trigger custom event for pages to listen to
    window.dispatchEvent(new CustomEvent('itemsPerPageChanged', { detail: { value } }));
    
    // If pagination exists on current page, update it
    const paginationInfo = document.querySelector('.pagination-info');
    if (paginationInfo) {
        // Pagination will be updated when data is reloaded
        console.log('Items per page updated to:', value);
    }
}

// Apply print settings
function applyPrintSettings() {
    // Get current print settings
    const paperSize = safeStorageGet('printPaperSize') || 'A4';
    const margin = safeStorageGet('printMargin') || '10';
    
    // Create or update print style
    let printStyle = document.getElementById('printSettingsStyle');
    if (!printStyle) {
        printStyle = document.createElement('style');
        printStyle.id = 'printSettingsStyle';
        document.head.appendChild(printStyle);
    }
    
    // Paper size mapping
    const paperSizes = {
        'A4': { width: '210mm', height: '297mm' },
        'Letter': { width: '8.5in', height: '11in' },
        'Legal': { width: '8.5in', height: '14in' },
        'A3': { width: '297mm', height: '420mm' }
    };
    
    const size = paperSizes[paperSize] || paperSizes['A4'];
    
    printStyle.textContent = `
        @media print {
            @page {
                size: ${paperSize};
                margin: ${margin}mm;
            }
            body {
                width: ${size.width};
                min-height: ${size.height};
            }
        }
    `;
}

// Apply barcode scanning setting
function applyBarcodeScanning(enabled) {
    safeStorageSet('barcodeScanningEnabled', enabled ? 'true' : 'false');
    
    // Show/hide barcode scanning buttons
    const barcodeButtons = document.querySelectorAll('[data-barcode-scan]');
    barcodeButtons.forEach(btn => {
        btn.style.display = enabled ? '' : 'none';
    });
}

// Initialize display settings on page load
function initializeDisplaySettings() {
    // Load theme
    const theme = safeStorageGet('appTheme') || 'light';
    applyTheme(theme);
    
    // Load language
    const language = safeStorageGet('appLanguage') || 'en';
    applyLanguage(language);
    
    // Load items per page
    const itemsPerPage = safeStorageGet('itemsPerPage') || '25';
    applyItemsPerPage(parseInt(itemsPerPage));
    
    // Load print settings
    applyPrintSettings();
    
    // Load barcode scanning
    const barcodeEnabled = safeStorageGet('barcodeScanningEnabled') !== 'false';
    applyBarcodeScanning(barcodeEnabled);
}

// Load settings from API and apply display settings
async function loadAndApplyDisplaySettings() {
    try {
        const settingsResponse = await apiRequest('/settings');
        const displaySettingsMap = {};
        
        // Settings API returns an object with categories as keys: { general: [...], display: [...], etc. }
        // We need to flatten it to search for settings
        const allSettingsArray = [];
        if (settingsResponse && typeof settingsResponse === 'object') {
            Object.keys(settingsResponse).forEach(category => {
                if (Array.isArray(settingsResponse[category])) {
                    allSettingsArray.push(...settingsResponse[category]);
                }
            });
        }
        
        // Find display-related settings
        ['theme', 'language', 'items_per_page', 'print_paper_size', 'print_margin', 'enable_barcode_scanning', 'barcode_format'].forEach(key => {
            const setting = allSettingsArray.find(s => s.key === key);
            if (setting && setting.value !== null && setting.value !== undefined) {
                displaySettingsMap[key] = setting.value;
                
                // Store in localStorage for quick access
                if (key === 'theme') {
                    safeStorageSet('appTheme', setting.value);
                } else if (key === 'language') {
                    safeStorageSet('appLanguage', setting.value);
                } else if (key === 'items_per_page') {
                    safeStorageSet('itemsPerPage', setting.value);
                } else if (key === 'print_paper_size') {
                    safeStorageSet('printPaperSize', setting.value);
                } else if (key === 'print_margin') {
                    safeStorageSet('printMargin', setting.value);
                } else if (key === 'enable_barcode_scanning') {
                    safeStorageSet('barcodeScanningEnabled', setting.value ? 'true' : 'false');
                } else if (key === 'barcode_format') {
                    safeStorageSet('barcodeFormat', setting.value);
                }
            }
        });

        // Find date/time settings (per shop) and store for global usage
        ['date_format', 'time_format', 'system_timezone'].forEach(key => {
            const setting = allSettingsArray.find(s => s.key === key);
            if (setting && setting.value !== null && setting.value !== undefined) {
                if (key === 'date_format') {
                    safeStorageSet('dateFormat', setting.value);
                } else if (key === 'time_format') {
                    safeStorageSet('timeFormat', setting.value);
                } else if (key === 'system_timezone') {
                    safeStorageSet('systemTimezone', setting.value);
                }
            }
        });
        
        // Apply settings
        if (Object.keys(displaySettingsMap).length > 0) {
            await applyDisplaySettings(Object.entries(displaySettingsMap).map(([key, value]) => ({ key, value })));
        } else {
            // If no settings found, use defaults
            initializeDisplaySettings();
        }
    } catch (error) {
        console.error('Error loading display settings:', error);
        // Fallback to defaults
        initializeDisplaySettings();
    }
}

async function saveCurrentCategory() {
    const form = document.getElementById('settingsForm');
    if (!form) {
        showNotification('No settings form found', 'error');
        return;
    }
    
    // Prevent non-superadmin from saving security & currency settings
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();
    
    // Prevent saving in Inspect mode
    if (isInspectMode) {
        showNotification('Cannot save in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }
    
    if ((currentCategory === 'security' || currentCategory === 'currency') && !isSuperadmin) {
        showNotification('Access denied. Only superadmin can modify these settings.', 'error');
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
            } else if (input.classList.contains('number-with-separator')) {
                // Handle formatted numbers (with thousand separators)
                // Use the numeric value stored in data attribute, or parse from formatted value
                const numericValue = input.getAttribute('data-numeric-value') || removeThousandSeparator(value);
                value = numericValue !== '' ? parseFloat(numericValue) : null;
                if (value !== null && !isNaN(value)) {
                    if (config && config.min !== undefined && value < config.min) {
                        showNotification(`${config.label || key} must be at least ${config.min}`, 'error');
                        return;
                    }
                    if (config && config.max !== undefined && value > config.max) {
                        showNotification(`${config.label || key} must be at most ${config.max}`, 'error');
                        return;
                    }
                }
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
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        await apiRequest('/settings', {
            method: 'PUT',
            body: { 
                settings: settingsToSave,
                category: currentCategory,
                superadminMode: currentUser && currentUser.role === 'superadmin' ? superadminMode : null
            }
        });
        
        showNotification(`${categoryConfig[currentCategory]?.label || currentCategory} settings saved successfully`, 'success');
        hasUnsavedChanges = false;
        const indicator = document.getElementById('unsavedChangesIndicator');
        if (indicator) indicator.style.display = 'none';
        
        // Clear visual indicators
        const categorySaveBtn = document.querySelector('button[onclick="saveCurrentCategory()"]');
        if (categorySaveBtn) {
            categorySaveBtn.classList.remove('btn-warning');
        }
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
        
        // Apply display settings immediately if they were changed
        const displaySettings = settingsToSave.filter(s => 
            ['theme', 'language', 'items_per_page', 'print_paper_size', 'print_margin', 'enable_barcode_scanning', 'barcode_format'].includes(s.key)
        );
        
        if (displaySettings.length > 0) {
            await applyDisplaySettings(displaySettings);
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
        
        showNotification(`Test email sent successfully to ${testEmail}. Please check your inbox.`, 'success');
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

// Trigger search from button or Enter key
function triggerSearch() {
    const searchInput = document.getElementById('settingsSearch');
    if (searchInput) {
        filterSettings(searchInput.value);
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
window.triggerSearch = triggerSearch;
window.loadAndApplyDisplaySettings = loadAndApplyDisplaySettings;
window.applyDisplaySettings = applyDisplaySettings;
window.applyTheme = applyTheme;
window.applyLanguage = applyLanguage;
window.applyItemsPerPage = applyItemsPerPage;
window.applyPrintSettings = applyPrintSettings;
window.applyBarcodeScanning = applyBarcodeScanning;
window.initializeDisplaySettings = initializeDisplaySettings;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n first (if available)
    if (window.i18n && typeof window.i18n.initI18n === 'function') {
        await window.i18n.initI18n();
    }
    
    // Initialize display settings
    await loadAndApplyDisplaySettings();
    
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
    
    // Initialize superadmin mode toggle
    initSuperadminModeToggle();
    
    await loadSettings();
});

// Superadmin Mode Toggle Functions
function initSuperadminModeToggle() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const modeToggle = document.getElementById('superadminModeToggle');
    
    if (!modeToggle || !currentUser || currentUser.role !== 'superadmin') {
        return;
    }
    
    // Show mode toggle for superadmin
    modeToggle.style.display = 'block';
    
    // Load saved mode from localStorage (default to 'inspect' for safety)
    superadminMode = localStorage.getItem('superadminMode') || 'inspect';
    updateModeToggleUI();
}

function toggleSuperadminMode() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'superadmin') {
        return;
    }
    
    // Toggle between inspect and configure
    superadminMode = superadminMode === 'inspect' ? 'configure' : 'inspect';
    
    // Save to localStorage
    localStorage.setItem('superadminMode', superadminMode);
    
    // Update UI
    updateModeToggleUI();
    
    // Re-render settings to reflect read-only state
    renderSettings();
    
    // Show notification
    const modeText = superadminMode === 'inspect' ? 'Inspect Mode' : 'Configure Mode';
    const message = superadminMode === 'inspect' 
        ? 'Switched to Inspect Mode. Settings are read-only.' 
        : 'Switched to Configure Mode. You can now modify settings.';
    showNotification(message, superadminMode === 'configure' ? 'success' : 'info');
}

function updateModeToggleUI() {
    const toggleBtn = document.getElementById('modeToggleBtn');
    const toggleText = document.getElementById('modeToggleText');
    const modeIndicator = document.getElementById('modeIndicator');
    
    if (!toggleBtn || !toggleText || !modeIndicator) return;
    
    if (superadminMode === 'inspect') {
        toggleText.textContent = 'Inspect';
        toggleBtn.className = 'btn btn-sm btn-secondary';
        modeIndicator.className = 'badge badge-info';
        modeIndicator.innerHTML = '<i class="fas fa-eye"></i> View Only';
    } else {
        toggleText.textContent = 'Configure';
        toggleBtn.className = 'btn btn-sm btn-primary';
        modeIndicator.className = 'badge badge-success';
        modeIndicator.innerHTML = '<i class="fas fa-edit"></i> Edit Mode';
    }
}

function isSuperadminInspectMode() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'superadmin') {
        return false;
    }
    return superadminMode === 'inspect';
}

// Email Settings Wizard State
let emailWizardState = {
    currentStep: 1,
    data: {
        email_enabled: false,
        email_host: '',
        email_port: '',
        email_secure: false,
        email_username: '',
        email_password: '',
        email_from: '',
        email_from_name: '',
        reply_to: ''
    },
    testEmailSent: false,
    testEmailAddress: '',
    understandingAccepted: false
};

// Render Email Settings Wizard
function renderEmailSettingsWizard() {
    const content = document.getElementById('settingsContent');
    if (!content) return;
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();
    const isShopAdmin = currentUser && currentUser.role === 'admin' && !isSuperadmin;
    
    // Load existing email settings into wizard state
    if (allSettings.email && allSettings.email.length > 0) {
        allSettings.email.forEach(setting => {
            if (emailWizardState.data.hasOwnProperty(setting.key)) {
                emailWizardState.data[setting.key] = setting.value || '';
            }
        });
    }
    
    // Determine which fields shop admin can edit
    const editableFields = isSuperadmin 
        ? Object.keys(emailWizardState.data) // Superadmin can edit all
        : ['email_from_name', 'reply_to']; // Shop admin can only edit these
    
    let wizardHTML = '';
    
    // Step 1: Risk Warning and Understanding
    if (emailWizardState.currentStep === 1) {
        wizardHTML = renderEmailWizardStep1(isSuperadmin, isShopAdmin, isInspectMode);
    }
    // Step 2: Guided Input
    else if (emailWizardState.currentStep === 2) {
        wizardHTML = renderEmailWizardStep2(isSuperadmin, isShopAdmin, isInspectMode, editableFields);
    }
    // Step 3: Test Email
    else if (emailWizardState.currentStep === 3) {
        wizardHTML = renderEmailWizardStep3(isSuperadmin, isInspectMode);
    }
    // Step 4: Confirm and Summary
    else if (emailWizardState.currentStep === 4) {
        wizardHTML = renderEmailWizardStep4(isSuperadmin, isInspectMode);
    }
    
    content.innerHTML = wizardHTML;
    
    // Setup event listeners after rendering
    setTimeout(() => {
        setupEmailWizardListeners(isSuperadmin, isShopAdmin, editableFields);
    }, 100);
}

// Step 1: Risk Warning and Understanding
function renderEmailWizardStep1(isSuperadmin, isShopAdmin, isInspectMode) {
    const canProceed = !isInspectMode;
    
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-envelope"></i> Email Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step active">1</span>
                    <span class="step">2</span>
                    <span class="step">3</span>
                    <span class="step">4</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #dc2626;">
                        <i class="fas fa-exclamation-triangle"></i> Important: Email Configuration Risks
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #991b1b; line-height: 1.8;">
                        <li><strong>System Impact:</strong> Incorrect email settings can prevent all system emails from being sent</li>
                        <li><strong>Security Risk:</strong> Email credentials are sensitive and must be protected</li>
                        <li><strong>Testing Required:</strong> You must send a test email before saving to verify configuration</li>
                        <li><strong>Shop Impact:</strong> ${isSuperadmin ? 'These settings apply to all shops' : 'These settings apply to your shop'}</li>
                        ${isSuperadmin ? '<li><strong>SMTP Credentials:</strong> Only superadmin can configure SMTP server settings</li>' : ''}
                        ${isShopAdmin ? '<li><strong>Limited Access:</strong> You can only modify sender name and reply-to address</li>' : ''}
                    </ul>
                </div>
                
                <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #2563eb;">
                        <i class="fas fa-info-circle"></i> What You'll Configure
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #1e40af; line-height: 1.8;">
                        ${isSuperadmin ? `
                            <li>SMTP server host and port</li>
                            <li>Email authentication credentials</li>
                            <li>Security settings (TLS/SSL)</li>
                            <li>Sender email address and name</li>
                            <li>Reply-to address</li>
                        ` : `
                            <li>Sender name (display name for emails)</li>
                            <li>Reply-to address</li>
                            <li>SMTP settings are managed by superadmin</li>
                        `}
                    </ul>
                </div>
                
                <div style="background: #fff; border: 2px solid ${isInspectMode ? '#94a3b8' : '#3b82f6'}; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: ${canProceed ? 'pointer' : 'not-allowed'};">
                        <input type="checkbox" id="emailWizardUnderstanding" 
                               ${emailWizardState.understandingAccepted ? 'checked' : ''}
                               ${isInspectMode ? 'disabled' : ''}
                               style="width: auto; margin-top: 0.25rem; flex-shrink: 0;">
                        <div style="flex: 1;">
                            <strong style="display: block; margin-bottom: 0.5rem;">I understand the risks and requirements:</strong>
                            <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
                                <li>I have verified my SMTP server details are correct</li>
                                <li>I understand that incorrect settings will prevent emails from being sent</li>
                                <li>I will test the configuration before saving</li>
                                <li>I will keep email credentials secure</li>
                            </ul>
                        </div>
                    </label>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Email settings are read-only. Switch to Configure Mode to make changes.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="emailWizardNextStep()" id="emailWizardNextBtn" disabled>
                            Next: Configure Settings <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 2: Guided Input with Real-time Validation
function renderEmailWizardStep2(isSuperadmin, isShopAdmin, isInspectMode, editableFields) {
    const smtpFieldsReadOnly = isShopAdmin || isInspectMode;
    
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-envelope"></i> Email Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step active">2</span>
                    <span class="step">3</span>
                    <span class="step">4</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                ${isShopAdmin ? `
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 1rem; border-radius: 4px; margin-bottom: 1.5rem;">
                        <i class="fas fa-info-circle"></i> <strong>Limited Access:</strong> You can only modify sender name and reply-to address. SMTP settings are managed by superadmin.
                    </div>
                ` : ''}
                
                <form id="emailWizardForm" style="display: grid; gap: 1.5rem;">
                    ${isSuperadmin ? `
                        <!-- SMTP Server Configuration -->
                        <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                            <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-server"></i> SMTP Server Configuration</h3>
                            
                            <div class="form-group">
                                <label for="wizard_email_host">SMTP Host *</label>
                                <input type="text" id="wizard_email_host" value="${emailWizardState.data.email_host || ''}" 
                                       ${isInspectMode ? 'readonly' : ''}
                                       placeholder="smtp.gmail.com" 
                                       oninput="validateEmailWizardField('email_host', this.value)">
                                <div id="validation_email_host" class="validation-message"></div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label for="wizard_email_port">SMTP Port *</label>
                                    <input type="number" id="wizard_email_port" value="${emailWizardState.data.email_port || ''}" 
                                           ${isInspectMode ? 'readonly' : ''}
                                           min="1" max="65535" 
                                           placeholder="587" 
                                           oninput="validateEmailWizardField('email_port', this.value)">
                                    <div id="validation_email_port" class="validation-message"></div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="wizard_email_secure">Security</label>
                                    <select id="wizard_email_secure" ${isInspectMode ? 'disabled' : ''}>
                                        <option value="false" ${emailWizardState.data.email_secure === 'false' || !emailWizardState.data.email_secure ? 'selected' : ''}>STARTTLS (Port 587)</option>
                                        <option value="true" ${emailWizardState.data.email_secure === 'true' ? 'selected' : ''}>SSL/TLS (Port 465)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="wizard_email_username">SMTP Username *</label>
                                <input type="text" id="wizard_email_username" value="${emailWizardState.data.email_username || ''}" 
                                       ${isInspectMode ? 'readonly' : ''}
                                       placeholder="your-email@example.com" 
                                       oninput="validateEmailWizardField('email_username', this.value)">
                                <div id="validation_email_username" class="validation-message"></div>
                            </div>
                            
                            <div class="form-group">
                                <label for="wizard_email_password">SMTP Password ${emailWizardState.data.email_password ? '(leave blank to keep current)' : '*'}</label>
                                <input type="password" id="wizard_email_password" 
                                       ${isInspectMode ? 'readonly' : ''}
                                       placeholder="${emailWizardState.data.email_password ? 'Enter new password or leave blank' : 'Enter password'}" 
                                       oninput="validateEmailWizardField('email_password', this.value)">
                                <div id="validation_email_password" class="validation-message"></div>
                            </div>
                        </div>
                    ` : `
                        <div style="background: #f1f5f9; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                            <i class="fas fa-lock"></i> SMTP server settings are managed by superadmin and cannot be modified here.
                        </div>
                    `}
                    
                    <!-- Email Identity Configuration -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-user"></i> Email Identity</h3>
                        
                        ${isSuperadmin ? `
                            <div class="form-group">
                                <label for="wizard_email_from">From Email Address *</label>
                                <input type="email" id="wizard_email_from" value="${emailWizardState.data.email_from || ''}" 
                                       ${isInspectMode ? 'readonly' : ''}
                                       placeholder="noreply@example.com" 
                                       oninput="validateEmailWizardField('email_from', this.value)">
                                <div id="validation_email_from" class="validation-message"></div>
                            </div>
                        ` : ''}
                        
                        <div class="form-group">
                            <label for="wizard_email_from_name">From Name (Display Name) *</label>
                            <input type="text" id="wizard_email_from_name" value="${emailWizardState.data.email_from_name || ''}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   placeholder="Your Company Name" 
                                   oninput="validateEmailWizardField('email_from_name', this.value)">
                            <div id="validation_email_from_name" class="validation-message"></div>
                        </div>
                        
                        <div class="form-group">
                            <label for="wizard_reply_to">Reply-To Address</label>
                            <input type="email" id="wizard_reply_to" value="${emailWizardState.data.reply_to || ''}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   placeholder="support@example.com" 
                                   oninput="validateEmailWizardField('reply_to', this.value)">
                            <div id="validation_reply_to" class="validation-message"></div>
                            <small style="color: var(--text-secondary);">Optional: Where replies should be sent</small>
                        </div>
                    </div>
                    
                    <!-- Enable Email -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: ${isInspectMode ? 'not-allowed' : 'pointer'};">
                            <input type="checkbox" id="wizard_email_enabled" 
                                   ${emailWizardState.data.email_enabled === 'true' || emailWizardState.data.email_enabled === true ? 'checked' : ''}
                                   ${isInspectMode ? 'disabled' : ''}
                                   style="width: auto;">
                            <div>
                                <strong>Enable Email Sending</strong>
                                <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">
                                    When enabled, the system will send emails using the configured settings
                                </small>
                            </div>
                        </label>
                    </div>
                </form>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="emailWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="emailWizardNextStep()" id="emailWizardNextBtn">
                            Next: Test Configuration <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 3: Test Email (Mandatory)
function renderEmailWizardStep3(isSuperadmin, isInspectMode) {
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-envelope"></i> Email Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step completed">2</span>
                    <span class="step active">3</span>
                    <span class="step">4</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #d97706;">
                        <i class="fas fa-exclamation-circle"></i> Test Email Required
                    </h3>
                    <p style="margin: 0; color: #92400e; line-height: 1.6;">
                        Before saving your email configuration, you <strong>must</strong> send a test email to verify that your settings are correct. 
                        This helps prevent email delivery issues after saving.
                    </p>
                </div>
                
                <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-paper-plane"></i> Send Test Email</h3>
                    
                    <div class="form-group">
                        <label for="wizard_test_email">Test Email Address *</label>
                        <input type="email" id="wizard_test_email" 
                               value="${emailWizardState.testEmailAddress || ''}"
                               ${isInspectMode ? 'readonly' : ''}
                               placeholder="your-email@example.com" 
                               style="margin-bottom: 0.5rem;">
                        <button type="button" class="btn btn-primary" 
                                onclick="sendEmailWizardTestEmail()" 
                                id="wizardTestEmailBtn"
                                ${isInspectMode ? 'disabled' : ''}>
                            <i class="fas fa-paper-plane"></i> Send Test Email
                        </button>
                    </div>
                    
                    <div id="wizardTestEmailResult" style="margin-top: 1rem;"></div>
                </div>
                
                ${emailWizardState.testEmailSent ? `
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                        <i class="fas fa-check-circle"></i> <strong>Test email sent successfully!</strong> Please check your inbox (and spam folder) to confirm receipt.
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="emailWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" 
                                onclick="emailWizardNextStep()" 
                                id="emailWizardNextBtn"
                                ${emailWizardState.testEmailSent ? '' : 'disabled'}>
                            Next: Confirm & Save <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 4: Confirm and Summary
function renderEmailWizardStep4(isSuperadmin, isInspectMode) {
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-envelope"></i> Email Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step completed">2</span>
                    <span class="step completed">3</span>
                    <span class="step active">4</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #16a34a;">
                        <i class="fas fa-check-circle"></i> Configuration Summary
                    </h3>
                    <p style="margin: 0; color: #15803d;">
                        Review your email configuration below. Click "Save Configuration" to apply these settings.
                    </p>
                </div>
                
                <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0;">Settings Summary</h3>
                    <div style="display: grid; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Email Enabled:</strong>
                            <span>${emailWizardState.data.email_enabled === 'true' || emailWizardState.data.email_enabled === true ? 'Yes' : 'No'}</span>
                        </div>
                        ${isSuperadmin ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>SMTP Host:</strong>
                                <span>${emailWizardState.data.email_host || 'Not set'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>SMTP Port:</strong>
                                <span>${emailWizardState.data.email_port || 'Not set'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Security:</strong>
                                <span>${emailWizardState.data.email_secure === 'true' ? 'SSL/TLS' : 'STARTTLS'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>SMTP Username:</strong>
                                <span>${emailWizardState.data.email_username || 'Not set'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>From Email:</strong>
                                <span>${emailWizardState.data.email_from || 'Not set'}</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>From Name:</strong>
                            <span>${emailWizardState.data.email_from_name || 'Not set'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Reply-To:</strong>
                            <span>${emailWizardState.data.reply_to || 'Not set'}</span>
                        </div>
                        ${emailWizardState.testEmailSent ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f0fdf4; border-radius: 4px;">
                                <strong>Test Email:</strong>
                                <span style="color: #22c55e;"><i class="fas fa-check-circle"></i> Sent to ${emailWizardState.testEmailAddress}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="emailWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-success" onclick="saveEmailWizardSettings()" id="emailWizardSaveBtn">
                            <i class="fas fa-save"></i> Save Configuration
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// ==================== EMAIL WIZARD HELPERS ====================

function emailWizardNextStep() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot continue in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Basic validation per step before moving forward
    if (emailWizardState.currentStep === 1) {
        const understandingCheckbox = document.getElementById('emailWizardUnderstanding');
        if (!understandingCheckbox || !understandingCheckbox.checked) {
            showNotification('Please confirm that you understand the risks and requirements before continuing.', 'error');
            return;
        }
        emailWizardState.understandingAccepted = true;
    } else if (emailWizardState.currentStep === 2) {
        // Validate key fields in step 2 (only for superadmin)
        if (isSuperadmin) {
            const host = document.getElementById('wizard_email_host')?.value.trim();
            const port = document.getElementById('wizard_email_port')?.value.trim();
            const username = document.getElementById('wizard_email_username')?.value.trim();
            const fromEmail = document.getElementById('wizard_email_from')?.value?.trim();

            if (!host || !port || !username || !fromEmail) {
                showNotification('Please fill in all required SMTP and email fields before continuing.', 'error');
                return;
            }
        } else {
            const fromName = document.getElementById('wizard_email_from_name')?.value.trim();
            if (!fromName) {
                showNotification('Please provide a From Name before continuing.', 'error');
                return;
            }
        }
    } else if (emailWizardState.currentStep === 3) {
        if (!emailWizardState.testEmailSent) {
            showNotification('Please send a test email and confirm it succeeds before continuing.', 'error');
            return;
        }
    }

    // Move to next step
    if (emailWizardState.currentStep < 4) {
        emailWizardState.currentStep += 1;
        renderEmailSettingsWizard();
    }
}

function emailWizardPreviousStep() {
    if (emailWizardState.currentStep > 1) {
        emailWizardState.currentStep -= 1;
        renderEmailSettingsWizard();
    }
}

function setupEmailWizardListeners(isSuperadmin, isShopAdmin, editableFields) {
    // Step 1: understanding checkbox controls Next button
    const understandingCheckbox = document.getElementById('emailWizardUnderstanding');
    const nextBtn = document.getElementById('emailWizardNextBtn');
    if (understandingCheckbox && nextBtn && emailWizardState.currentStep === 1) {
        understandingCheckbox.addEventListener('change', () => {
            emailWizardState.understandingAccepted = understandingCheckbox.checked;
            nextBtn.disabled = !understandingCheckbox.checked;
        });
    }

    // Step 2: bind field changes into state
    if (emailWizardState.currentStep === 2) {
        const bindField = (id, key, isCheckbox = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                const value = isCheckbox ? el.checked : el.value;
                emailWizardState.data[key] = value;
            });
            if (isCheckbox) {
                el.addEventListener('change', () => {
                    emailWizardState.data[key] = el.checked;
                });
            }
        };

        if (isSuperadmin) {
            bindField('wizard_email_host', 'email_host');
            bindField('wizard_email_port', 'email_port');
            bindField('wizard_email_username', 'email_username');
            bindField('wizard_email_password', 'email_password');
            bindField('wizard_email_from', 'email_from');

            const secureSelect = document.getElementById('wizard_email_secure');
            if (secureSelect) {
                secureSelect.addEventListener('change', () => {
                    emailWizardState.data.email_secure = secureSelect.value === 'true';
                });
            }
        }

        bindField('wizard_email_from_name', 'email_from_name');
        bindField('wizard_reply_to', 'reply_to');

        const enabledCheckbox = document.getElementById('wizard_email_enabled');
        if (enabledCheckbox) {
            enabledCheckbox.addEventListener('change', () => {
                emailWizardState.data.email_enabled = enabledCheckbox.checked;
            });
        }
    }

    // Step 3: test email field
    if (emailWizardState.currentStep === 3) {
        const testInput = document.getElementById('wizard_test_email');
        if (testInput) {
            testInput.addEventListener('input', () => {
                emailWizardState.testEmailAddress = testInput.value.trim();
            });
        }
    }
}

function validateEmailWizardField(key, value) {
    let message = '';
    let isValid = true;

    if (key === 'email_host') {
        if (!value || value.trim().length < 3) {
            isValid = false;
            message = 'SMTP host is required.';
        }
    } else if (key === 'email_port') {
        const port = parseInt(value, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
            isValid = false;
            message = 'Port must be between 1 and 65535.';
        } else if (port === 25) {
            isValid = true;
            message = '⚠ Port 25 is often blocked by providers. Consider using 587 or 465.';
        }
    } else if (key === 'email_username') {
        if (!value || value.trim().length < 3) {
            isValid = false;
            message = 'SMTP username is required.';
        }
    } else if (key === 'email_password') {
        // Optional when editing existing config
        if (!emailWizardState.data.email_password && !value) {
            isValid = true;
            message = 'Leave blank to keep existing password.';
        }
    } else if (key === 'email_from') {
        if (!value || !value.includes('@')) {
            isValid = false;
            message = 'Valid From email address is required.';
        }
    } else if (key === 'email_from_name') {
        if (!value || value.trim().length < 2) {
            isValid = false;
            message = 'From Name is required.';
        }
    } else if (key === 'reply_to') {
        if (value && !value.includes('@')) {
            isValid = false;
            message = 'Reply-To must be a valid email address if provided.';
        }
    }

    const validationDiv = document.getElementById(`validation_${key}`);
    if (validationDiv) {
        if (message) {
            validationDiv.style.display = 'block';
            validationDiv.style.color = isValid ? 'var(--success-color)' : 'var(--danger-color)';
            validationDiv.style.fontSize = '0.875rem';
            validationDiv.innerHTML = message;
        } else {
            validationDiv.style.display = 'none';
            validationDiv.innerHTML = '';
        }
    }
}

async function sendEmailWizardTestEmail() {
    const testInput = document.getElementById('wizard_test_email');
    if (!testInput) {
        showNotification('Test email input not found', 'error');
        return;
    }

    const email = testInput.value.trim();
    if (!email || !email.includes('@')) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    const btn = document.getElementById('wizardTestEmailBtn');
    const resultDiv = document.getElementById('wizardTestEmailResult');
    const originalText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }

    try {
        await apiRequest('/settings/test-email', {
            method: 'POST',
            body: { test_email: email }
        });

        emailWizardState.testEmailSent = true;
        emailWizardState.testEmailAddress = email;

        if (resultDiv) {
            resultDiv.style.color = 'var(--success-color)';
            resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> Test email sent successfully to ${email}. Please check your inbox.`;
        }

        const nextBtn = document.getElementById('emailWizardNextBtn');
        if (nextBtn) {
            nextBtn.disabled = false;
        }

        showNotification(`Test email sent successfully to ${email}.`, 'success');
    } catch (error) {
        if (resultDiv) {
            resultDiv.style.color = 'var(--danger-color)';
            resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> Error sending test email: ${(error && error.message) || 'Unknown error'}`;
        }
        showNotification('Error testing email: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function saveEmailWizardSettings() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot save in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Build settings to save from wizard state
    const settingsToSave = [];

    // Shop admins can only update identity fields
    if (isSuperadmin) {
        settingsToSave.push(
            { key: 'email_host', value: emailWizardState.data.email_host, category: 'email' },
            { key: 'email_port', value: emailWizardState.data.email_port, category: 'email' },
            { key: 'email_secure', value: emailWizardState.data.email_secure ? 'true' : 'false', category: 'email' },
            { key: 'email_username', value: emailWizardState.data.email_username, category: 'email' },
            { key: 'email_from', value: emailWizardState.data.email_from, category: 'email' }
        );

        // Only include password if changed
        const passwordInput = document.getElementById('wizard_email_password');
        if (passwordInput && passwordInput.value) {
            settingsToSave.push({ key: 'email_password', value: passwordInput.value, category: 'email' });
        }
    }

    settingsToSave.push(
        { key: 'email_from_name', value: emailWizardState.data.email_from_name, category: 'email' },
        { key: 'reply_to', value: emailWizardState.data.reply_to, category: 'email' },
        { key: 'email_enabled', value: emailWizardState.data.email_enabled ? 'true' : 'false', category: 'email' }
    );

    const saveBtn = document.getElementById('emailWizardSaveBtn');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        await apiRequest('/settings', {
            method: 'PUT',
            body: {
                settings: settingsToSave,
                category: 'email',
                superadminMode: currentUser && currentUser.role === 'superadmin' ? superadminMode : null
            }
        });

        showNotification('Email settings saved successfully.', 'success');

        // Reset wizard state and reload settings
        emailWizardState.currentStep = 1;
        emailWizardState.testEmailSent = false;
        await loadSettings();
    } catch (error) {
        showNotification('Error saving email settings: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// ==================== BACKUP SETTINGS WIZARD ====================

// Backup Settings Wizard State
let backupWizardState = {
    currentStep: 1,
    data: {
        backup_auto_enabled: false,
        backup_frequency: 'daily',
        backup_retention_days: 30,
        backup_location: 'local'
    },
    testBackupCreated: false,
    understandingAccepted: false
};

// Render Backup Settings Wizard
function renderBackupSettingsWizard() {
    const content = document.getElementById('settingsContent');
    if (!content) return;
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();
    
    // Load existing backup settings into wizard state
    if (allSettings.backup && allSettings.backup.length > 0) {
        allSettings.backup.forEach(setting => {
            if (backupWizardState.data.hasOwnProperty(setting.key)) {
                if (setting.key === 'backup_auto_enabled') {
                    backupWizardState.data[setting.key] = setting.value === 'true' || setting.value === true || setting.value === 1 || setting.value === '1';
                } else if (setting.key === 'backup_retention_days') {
                    backupWizardState.data[setting.key] = parseInt(setting.value || '30', 10);
                } else {
                    backupWizardState.data[setting.key] = setting.value || '';
                }
            }
        });
    }
    
    let wizardHTML = '';
    
    // Step 1: Risk Warning and Understanding
    if (backupWizardState.currentStep === 1) {
        wizardHTML = renderBackupWizardStep1(isSuperadmin, isInspectMode);
    }
    // Step 2: Configuration
    else if (backupWizardState.currentStep === 2) {
        wizardHTML = renderBackupWizardStep2(isSuperadmin, isInspectMode);
    }
    // Step 3: Test Backup and Confirm
    else if (backupWizardState.currentStep === 3) {
        wizardHTML = renderBackupWizardStep3(isSuperadmin, isInspectMode);
    }
    
    content.innerHTML = wizardHTML;
    
    // Setup event listeners after rendering
    setTimeout(() => {
        setupBackupWizardListeners(isSuperadmin);
    }, 100);
}

// Step 1: Risk Warning and Understanding
function renderBackupWizardStep1(isSuperadmin, isInspectMode) {
    const canProceed = !isInspectMode;
    
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-database"></i> Backup Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step active">1</span>
                    <span class="step">2</span>
                    <span class="step">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #dc2626;">
                        <i class="fas fa-exclamation-triangle"></i> Important: Backup Configuration Risks
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #991b1b; line-height: 1.8;">
                        <li><strong>Data Protection:</strong> Incorrect backup settings can result in data loss</li>
                        <li><strong>Storage Impact:</strong> Backups consume disk space - configure retention carefully</li>
                        <li><strong>Testing Required:</strong> You must create a test backup before saving to verify configuration</li>
                        <li><strong>Shop Impact:</strong> ${isSuperadmin ? 'These settings apply per-shop' : 'These settings apply to your shop'}</li>
                        <li><strong>Automatic Backups:</strong> When enabled, backups run automatically based on frequency</li>
                    </ul>
                </div>
                
                <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #2563eb;">
                        <i class="fas fa-info-circle"></i> What You'll Configure
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #1e40af; line-height: 1.8;">
                        <li>Enable or disable automatic backups</li>
                        <li>Set backup frequency (daily, weekly, monthly)</li>
                        <li>Configure retention period (how long to keep backups)</li>
                        <li>Choose backup location (local storage or cloud - cloud coming soon)</li>
                    </ul>
                </div>
                
                <div style="background: #fff; border: 2px solid ${isInspectMode ? '#94a3b8' : '#3b82f6'}; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: ${canProceed ? 'pointer' : 'not-allowed'};">
                        <input type="checkbox" id="backupWizardUnderstanding" 
                               ${backupWizardState.understandingAccepted ? 'checked' : ''}
                               ${isInspectMode ? 'disabled' : ''}
                               style="width: auto; margin-top: 0.25rem; flex-shrink: 0;">
                        <div style="flex: 1;">
                            <strong style="display: block; margin-bottom: 0.5rem;">I understand the risks and requirements:</strong>
                            <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
                                <li>I understand that backups protect against data loss</li>
                                <li>I will configure appropriate retention periods to manage storage</li>
                                <li>I will test the backup configuration before saving</li>
                                <li>I understand that automatic backups run in the background</li>
                            </ul>
                        </div>
                    </label>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Backup settings are read-only. Switch to Configure Mode to make changes.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="backupWizardNextStep()" id="backupWizardNextBtn" disabled>
                            Next: Configure Settings <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 2: Configuration
function renderBackupWizardStep2(isSuperadmin, isInspectMode) {
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-database"></i> Backup Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step active">2</span>
                    <span class="step">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <form id="backupWizardForm" style="display: grid; gap: 1.5rem;">
                    <!-- Enable Automatic Backups -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: ${isInspectMode ? 'not-allowed' : 'pointer'};">
                            <input type="checkbox" id="wizard_backup_auto_enabled" 
                                   ${backupWizardState.data.backup_auto_enabled ? 'checked' : ''}
                                   ${isInspectMode ? 'disabled' : ''}
                                   style="width: auto;">
                            <div>
                                <strong>Enable Automatic Backups</strong>
                                <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">
                                    When enabled, the system will automatically create backups based on the frequency setting below
                                </small>
                            </div>
                        </label>
                    </div>
                    
                    <!-- Backup Frequency -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <div class="form-group">
                            <label for="wizard_backup_frequency">Backup Frequency *</label>
                            <select id="wizard_backup_frequency" ${isInspectMode ? 'disabled' : ''}>
                                <option value="daily" ${backupWizardState.data.backup_frequency === 'daily' ? 'selected' : ''}>Daily (Recommended for active systems)</option>
                                <option value="weekly" ${backupWizardState.data.backup_frequency === 'weekly' ? 'selected' : ''}>Weekly (Good for moderate activity)</option>
                                <option value="monthly" ${backupWizardState.data.backup_frequency === 'monthly' ? 'selected' : ''}>Monthly (For low-activity systems)</option>
                            </select>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> More frequent backups provide better protection but consume more storage space.
                            </small>
                        </div>
                    </div>
                    
                    <!-- Retention Days -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <div class="form-group">
                            <label for="wizard_backup_retention_days">Backup Retention (days) *</label>
                            <input type="number" id="wizard_backup_retention_days" 
                                   value="${backupWizardState.data.backup_retention_days || 30}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   min="7" max="365" 
                                   placeholder="30"
                                   oninput="validateBackupWizardField('backup_retention_days', this.value)">
                            <div id="validation_backup_retention_days" class="validation-message"></div>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Backups older than this will be automatically deleted. Recommended: 30-90 days.
                            </small>
                        </div>
                    </div>
                    
                    <!-- Backup Location -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <div class="form-group">
                            <label for="wizard_backup_location">Backup Location *</label>
                            <select id="wizard_backup_location" ${isInspectMode ? 'disabled' : ''}>
                                <option value="local" ${backupWizardState.data.backup_location === 'local' ? 'selected' : ''}>Local Storage (Server filesystem)</option>
                                <option value="cloud" ${backupWizardState.data.backup_location === 'cloud' ? 'selected' : ''} disabled>Cloud Storage (Coming Soon)</option>
                            </select>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Local backups are stored on the server. Cloud backups provide off-site protection (feature in development).
                            </small>
                        </div>
                    </div>
                </form>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="backupWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="backupWizardNextStep()" id="backupWizardNextBtn">
                            Next: Test Backup <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 3: Test Backup and Confirm
function renderBackupWizardStep3(isSuperadmin, isInspectMode) {
    const nextBackupTime = calculateNextBackupTime(backupWizardState.data.backup_frequency);
    
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-database"></i> Backup Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step completed">2</span>
                    <span class="step active">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #d97706;">
                        <i class="fas fa-exclamation-circle"></i> Test Backup Recommended
                    </h3>
                    <p style="margin: 0; color: #92400e; line-height: 1.6;">
                        Before saving your backup configuration, it's recommended to create a test backup to verify that the system can successfully create backups with your settings.
                    </p>
                </div>
                
                <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-database"></i> Create Test Backup</h3>
                    
                    <div class="form-group">
                        <button type="button" class="btn btn-primary" 
                                onclick="createBackupWizardTestBackup()" 
                                id="wizardTestBackupBtn"
                                ${isInspectMode ? 'disabled' : ''}>
                            <i class="fas fa-database"></i> Create Test Backup
                        </button>
                    </div>
                    
                    <div id="wizardTestBackupResult" style="margin-top: 1rem;"></div>
                </div>
                
                ${backupWizardState.testBackupCreated ? `
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                        <i class="fas fa-check-circle"></i> <strong>Test backup created successfully!</strong> Your backup configuration is working correctly.
                    </div>
                ` : ''}
                
                <!-- Configuration Summary -->
                <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0;">Configuration Summary</h3>
                    <div style="display: grid; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Automatic Backups:</strong>
                            <span>${backupWizardState.data.backup_auto_enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        ${backupWizardState.data.backup_auto_enabled ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Frequency:</strong>
                                <span>${backupWizardState.data.backup_frequency.charAt(0).toUpperCase() + backupWizardState.data.backup_frequency.slice(1)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Next Backup:</strong>
                                <span>${nextBackupTime}</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Retention Period:</strong>
                            <span>${backupWizardState.data.backup_retention_days} days</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Backup Location:</strong>
                            <span>${backupWizardState.data.backup_location.charAt(0).toUpperCase() + backupWizardState.data.backup_location.slice(1)}</span>
                        </div>
                        ${backupWizardState.testBackupCreated ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f0fdf4; border-radius: 4px;">
                                <strong>Test Backup:</strong>
                                <span style="color: #22c55e;"><i class="fas fa-check-circle"></i> Created successfully</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="backupWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-success" onclick="saveBackupWizardSettings()" id="backupWizardSaveBtn">
                            <i class="fas fa-save"></i> Save Configuration
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

function calculateNextBackupTime(frequency) {
    if (!frequency || frequency === '') return 'N/A';
    
    const now = new Date();
    const next = new Date(now);
    
    switch (frequency) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            next.setHours(2, 0, 0, 0);
            break;
        case 'weekly':
            const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
            next.setDate(next.getDate() + daysUntilMonday);
            next.setHours(2, 0, 0, 0);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1, 1);
            next.setHours(2, 0, 0, 0);
            break;
        default:
            return 'N/A';
    }
    
    return next.toLocaleString();
}

// ==================== BACKUP WIZARD HELPERS ====================

function backupWizardNextStep() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot continue in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Basic validation per step before moving forward
    if (backupWizardState.currentStep === 1) {
        const understandingCheckbox = document.getElementById('backupWizardUnderstanding');
        if (!understandingCheckbox || !understandingCheckbox.checked) {
            showNotification('Please confirm that you understand the risks and requirements before continuing.', 'error');
            return;
        }
        backupWizardState.understandingAccepted = true;
    } else if (backupWizardState.currentStep === 2) {
        // Validate retention days
        const retentionDays = parseInt(backupWizardState.data.backup_retention_days, 10);
        if (isNaN(retentionDays) || retentionDays < 7 || retentionDays > 365) {
            showNotification('Backup retention must be between 7 and 365 days.', 'error');
            return;
        }
    }

    // Move to next step
    if (backupWizardState.currentStep < 3) {
        backupWizardState.currentStep += 1;
        renderBackupSettingsWizard();
    }
}

function backupWizardPreviousStep() {
    if (backupWizardState.currentStep > 1) {
        backupWizardState.currentStep -= 1;
        renderBackupSettingsWizard();
    }
}

function setupBackupWizardListeners(isSuperadmin) {
    // Step 1: understanding checkbox controls Next button
    const understandingCheckbox = document.getElementById('backupWizardUnderstanding');
    const nextBtn = document.getElementById('backupWizardNextBtn');
    if (understandingCheckbox && nextBtn && backupWizardState.currentStep === 1) {
        understandingCheckbox.addEventListener('change', () => {
            backupWizardState.understandingAccepted = understandingCheckbox.checked;
            nextBtn.disabled = !understandingCheckbox.checked;
        });
    }

    // Step 2: bind field changes into state
    if (backupWizardState.currentStep === 2) {
        const enabledCheckbox = document.getElementById('wizard_backup_auto_enabled');
        if (enabledCheckbox) {
            enabledCheckbox.addEventListener('change', () => {
                backupWizardState.data.backup_auto_enabled = enabledCheckbox.checked;
            });
        }

        const frequencySelect = document.getElementById('wizard_backup_frequency');
        if (frequencySelect) {
            frequencySelect.addEventListener('change', () => {
                backupWizardState.data.backup_frequency = frequencySelect.value;
            });
        }

        const retentionInput = document.getElementById('wizard_backup_retention_days');
        if (retentionInput) {
            retentionInput.addEventListener('input', () => {
                backupWizardState.data.backup_retention_days = parseInt(retentionInput.value || '30', 10);
            });
        }

        const locationSelect = document.getElementById('wizard_backup_location');
        if (locationSelect) {
            locationSelect.addEventListener('change', () => {
                backupWizardState.data.backup_location = locationSelect.value;
            });
        }
    }
}

function validateBackupWizardField(key, value) {
    let message = '';
    let isValid = true;

    if (key === 'backup_retention_days') {
        const days = parseInt(value, 10);
        if (isNaN(days) || days < 7) {
            isValid = false;
            message = 'Retention must be at least 7 days.';
        } else if (days > 365) {
            isValid = false;
            message = 'Retention cannot exceed 365 days.';
        } else if (days < 30) {
            isValid = true;
            message = '⚠️ Short retention period may not provide enough backup history.';
        } else if (days > 90) {
            isValid = true;
            message = '⚠️ Long retention period will consume significant storage space.';
        } else {
            isValid = true;
            message = '✓ Good retention period for most use cases.';
        }
    }

    const validationDiv = document.getElementById(`validation_${key}`);
    if (validationDiv) {
        if (message) {
            validationDiv.style.display = 'block';
            validationDiv.style.color = isValid ? 'var(--success-color)' : 'var(--danger-color)';
            validationDiv.style.fontSize = '0.875rem';
            validationDiv.innerHTML = message;
        } else {
            validationDiv.style.display = 'none';
            validationDiv.innerHTML = '';
        }
    }
}

async function createBackupWizardTestBackup() {
    const btn = document.getElementById('wizardTestBackupBtn');
    const resultDiv = document.getElementById('wizardTestBackupResult');
    const originalText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Backup...';
    }

    try {
        const result = await apiRequest('/backup', {
            method: 'POST'
        });

        backupWizardState.testBackupCreated = true;

        if (resultDiv) {
            resultDiv.style.color = 'var(--success-color)';
            const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(2) : 'N/A';
            resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> Test backup created successfully!<br><small>Filename: ${result.filename || 'N/A'}, Size: ${sizeMB} MB</small>`;
        }

        showNotification(`Test backup created successfully: ${result.filename || 'backup'}`, 'success');
        
        // Re-render step 3 to show success message
        renderBackupSettingsWizard();
    } catch (error) {
        if (resultDiv) {
            resultDiv.style.color = 'var(--danger-color)';
            resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> Error creating test backup: ${(error && error.message) || 'Unknown error'}`;
        }
        showNotification('Error creating test backup: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function saveBackupWizardSettings() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot save in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Build settings to save from wizard state
    const settingsToSave = [
        { key: 'backup_auto_enabled', value: backupWizardState.data.backup_auto_enabled ? 'true' : 'false', category: 'backup' },
        { key: 'backup_frequency', value: backupWizardState.data.backup_frequency, category: 'backup' },
        { key: 'backup_retention_days', value: String(backupWizardState.data.backup_retention_days), category: 'backup' },
        { key: 'backup_location', value: backupWizardState.data.backup_location, category: 'backup' }
    ];

    const saveBtn = document.getElementById('backupWizardSaveBtn');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        await apiRequest('/settings', {
            method: 'PUT',
            body: {
                settings: settingsToSave,
                category: 'backup',
                superadminMode: currentUser && currentUser.role === 'superadmin' ? superadminMode : null
            }
        });

        showNotification('Backup settings saved successfully.', 'success');

        // Reset wizard state and reload settings
        backupWizardState.currentStep = 1;
        backupWizardState.testBackupCreated = false;
        backupWizardState.understandingAccepted = false;
        await loadSettings();
    } catch (error) {
        showNotification('Error saving backup settings: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// Expose backup wizard functions to global scope
window.backupWizardNextStep = backupWizardNextStep;
window.backupWizardPreviousStep = backupWizardPreviousStep;
window.validateBackupWizardField = validateBackupWizardField;
window.createBackupWizardTestBackup = createBackupWizardTestBackup;
window.saveBackupWizardSettings = saveBackupWizardSettings;

// ==================== NOTIFICATION SETTINGS WIZARD ====================

// Notification Settings Wizard State
let notificationWizardState = {
    currentStep: 1,
    data: {
        low_stock_notification: false,
        low_stock_threshold: 20,
        enable_audit_log: true,
        audit_log_retention_days: 90,
        enable_api_rate_limit: true,
        api_rate_limit_per_minute: 60
    },
    understandingAccepted: false
};

// Render Notification Settings Wizard
function renderNotificationSettingsWizard() {
    const content = document.getElementById('settingsContent');
    if (!content) return;
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();
    
    // Load existing notification settings into wizard state
    if (allSettings.notification && allSettings.notification.length > 0) {
        allSettings.notification.forEach(setting => {
            if (notificationWizardState.data.hasOwnProperty(setting.key)) {
                if (setting.key === 'low_stock_notification' || setting.key === 'enable_audit_log' || setting.key === 'enable_api_rate_limit') {
                    notificationWizardState.data[setting.key] = setting.value === 'true' || setting.value === true || setting.value === 1 || setting.value === '1';
                } else if (setting.key === 'low_stock_threshold' || setting.key === 'audit_log_retention_days' || setting.key === 'api_rate_limit_per_minute') {
                    notificationWizardState.data[setting.key] = parseInt(setting.value || '0', 10);
                } else {
                    notificationWizardState.data[setting.key] = setting.value || '';
                }
            }
        });
    }
    
    let wizardHTML = '';
    
    // Step 1: Risk Warning and Understanding
    if (notificationWizardState.currentStep === 1) {
        wizardHTML = renderNotificationWizardStep1(isSuperadmin, isInspectMode);
    }
    // Step 2: Configuration
    else if (notificationWizardState.currentStep === 2) {
        wizardHTML = renderNotificationWizardStep2(isSuperadmin, isInspectMode);
    }
    // Step 3: Confirm and Summary
    else if (notificationWizardState.currentStep === 3) {
        wizardHTML = renderNotificationWizardStep3(isSuperadmin, isInspectMode);
    }
    
    content.innerHTML = wizardHTML;
    
    // Setup event listeners after rendering
    setTimeout(() => {
        setupNotificationWizardListeners(isSuperadmin);
    }, 100);
}

// Step 1: Risk Warning and Understanding
function renderNotificationWizardStep1(isSuperadmin, isInspectMode) {
    const canProceed = !isInspectMode;
    
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-bell"></i> Notification Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step active">1</span>
                    <span class="step">2</span>
                    <span class="step">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #dc2626;">
                        <i class="fas fa-exclamation-triangle"></i> Important: Notification Configuration Impact
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #991b1b; line-height: 1.8;">
                        <li><strong>System Performance:</strong> Incorrect notification thresholds can generate excessive alerts</li>
                        <li><strong>Storage Impact:</strong> Audit logs consume database space - configure retention carefully</li>
                        <li><strong>Security Impact:</strong> API rate limits protect against abuse - set appropriately</li>
                        <li><strong>Shop Impact:</strong> ${isSuperadmin ? 'These settings apply per-shop' : 'These settings apply to your shop'}</li>
                        <li><strong>Low Stock Alerts:</strong> Threshold too low may cause alert fatigue, too high may miss critical shortages</li>
                    </ul>
                </div>
                
                <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #2563eb;">
                        <i class="fas fa-info-circle"></i> What You'll Configure
                    </h3>
                    <ul style="margin: 0; padding-left: 1.5rem; color: #1e40af; line-height: 1.8;">
                        <li><strong>Low Stock Notifications:</strong> Enable alerts when inventory falls below threshold</li>
                        <li><strong>Low Stock Threshold:</strong> Percentage of minimum stock level that triggers alerts</li>
                        <li><strong>Audit Logging:</strong> Track system activities and user actions</li>
                        <li><strong>Audit Log Retention:</strong> How long to keep audit log entries</li>
                        <li><strong>API Rate Limiting:</strong> Protect API endpoints from abuse</li>
                        <li><strong>Rate Limit Threshold:</strong> Maximum API requests per minute</li>
                    </ul>
                </div>
                
                <div style="background: #fff; border: 2px solid ${isInspectMode ? '#94a3b8' : '#3b82f6'}; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: ${canProceed ? 'pointer' : 'not-allowed'};">
                        <input type="checkbox" id="notificationWizardUnderstanding" 
                               ${notificationWizardState.understandingAccepted ? 'checked' : ''}
                               ${isInspectMode ? 'disabled' : ''}
                               style="width: auto; margin-top: 0.25rem; flex-shrink: 0;">
                        <div style="flex: 1;">
                            <strong style="display: block; margin-bottom: 0.5rem;">I understand the risks and requirements:</strong>
                            <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
                                <li>I understand that notification thresholds affect alert frequency</li>
                                <li>I will configure appropriate retention periods to manage storage</li>
                                <li>I understand that API rate limits protect system security</li>
                                <li>I will set thresholds that balance alerting and performance</li>
                            </ul>
                        </div>
                    </label>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Notification settings are read-only. Switch to Configure Mode to make changes.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="notificationWizardNextStep()" id="notificationWizardNextBtn" disabled>
                            Next: Configure Settings <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 2: Configuration
function renderNotificationWizardStep2(isSuperadmin, isInspectMode) {
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-bell"></i> Notification Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step active">2</span>
                    <span class="step">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <form id="notificationWizardForm" style="display: grid; gap: 1.5rem;">
                    <!-- Low Stock Notifications -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-box"></i> Low Stock Notifications</h3>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: ${isInspectMode ? 'not-allowed' : 'pointer'};">
                                <input type="checkbox" id="wizard_low_stock_notification" 
                                       ${notificationWizardState.data.low_stock_notification ? 'checked' : ''}
                                       ${isInspectMode ? 'disabled' : ''}
                                       style="width: auto;">
                                <div>
                                    <strong>Enable Low Stock Notifications</strong>
                                    <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">
                                        When enabled, system will send alerts when inventory falls below the threshold
                                    </small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="wizard_low_stock_threshold">Low Stock Threshold (%) *</label>
                            <input type="number" id="wizard_low_stock_threshold" 
                                   value="${notificationWizardState.data.low_stock_threshold || 20}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   min="1" max="50" 
                                   placeholder="20"
                                   oninput="validateNotificationWizardField('low_stock_threshold', this.value)">
                            <div id="validation_low_stock_threshold" class="validation-message"></div>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Alert triggers when stock falls below this percentage of minimum stock level. Recommended: 20-30%.
                            </small>
                        </div>
                    </div>
                    
                    <!-- Audit Logging -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-clipboard-list"></i> Audit Logging</h3>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: ${isInspectMode ? 'not-allowed' : 'pointer'};">
                                <input type="checkbox" id="wizard_enable_audit_log" 
                                       ${notificationWizardState.data.enable_audit_log ? 'checked' : ''}
                                       ${isInspectMode ? 'disabled' : ''}
                                       style="width: auto;">
                                <div>
                                    <strong>Enable Audit Logging</strong>
                                    <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">
                                        When enabled, system tracks all user actions and system events for security and compliance
                                    </small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="wizard_audit_log_retention_days">Audit Log Retention (days) *</label>
                            <input type="number" id="wizard_audit_log_retention_days" 
                                   value="${notificationWizardState.data.audit_log_retention_days || 90}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   min="7" max="365" 
                                   placeholder="90"
                                   oninput="validateNotificationWizardField('audit_log_retention_days', this.value)">
                            <div id="validation_audit_log_retention_days" class="validation-message"></div>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Audit logs older than this will be automatically deleted. Recommended: 90-180 days for compliance.
                            </small>
                        </div>
                    </div>
                    
                    <!-- API Rate Limiting -->
                    <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px;">
                        <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-shield-alt"></i> API Rate Limiting</h3>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: ${isInspectMode ? 'not-allowed' : 'pointer'};">
                                <input type="checkbox" id="wizard_enable_api_rate_limit" 
                                       ${notificationWizardState.data.enable_api_rate_limit ? 'checked' : ''}
                                       ${isInspectMode ? 'disabled' : ''}
                                       style="width: auto;">
                                <div>
                                    <strong>Enable API Rate Limiting</strong>
                                    <small style="display: block; color: var(--text-secondary); margin-top: 0.25rem;">
                                        When enabled, API requests are limited to prevent abuse and protect system resources
                                    </small>
                                </div>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="wizard_api_rate_limit_per_minute">API Requests Per Minute *</label>
                            <input type="number" id="wizard_api_rate_limit_per_minute" 
                                   value="${notificationWizardState.data.api_rate_limit_per_minute || 60}" 
                                   ${isInspectMode ? 'readonly' : ''}
                                   min="10" max="1000" 
                                   placeholder="60"
                                   oninput="validateNotificationWizardField('api_rate_limit_per_minute', this.value)">
                            <div id="validation_api_rate_limit_per_minute" class="validation-message"></div>
                            <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Maximum API requests allowed per minute per IP address. Recommended: 60-120 for normal use, higher for high-traffic systems.
                            </small>
                        </div>
                    </div>
                </form>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="notificationWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-primary" onclick="notificationWizardNextStep()" id="notificationWizardNextBtn">
                            Next: Confirm & Save <i class="fas fa-arrow-right"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Step 3: Confirm and Summary
function renderNotificationWizardStep3(isSuperadmin, isInspectMode) {
    return `
        <div class="section-card">
            <div class="wizard-header">
                <h2><i class="fas fa-bell"></i> Notification Settings Configuration</h2>
                <div class="wizard-steps">
                    <span class="step completed">1</span>
                    <span class="step completed">2</span>
                    <span class="step active">3</span>
                </div>
            </div>
            
            <div style="padding: 2rem;">
                <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #16a34a;">
                        <i class="fas fa-check-circle"></i> Configuration Summary
                    </h3>
                    <p style="margin: 0; color: #15803d;">
                        Review your notification configuration below. Click "Save Configuration" to apply these settings.
                    </p>
                </div>
                
                <div style="border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 4px; margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0;">Settings Summary</h3>
                    <div style="display: grid; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Low Stock Notifications:</strong>
                            <span>${notificationWizardState.data.low_stock_notification ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        ${notificationWizardState.data.low_stock_notification ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Low Stock Threshold:</strong>
                                <span>${notificationWizardState.data.low_stock_threshold}%</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Audit Logging:</strong>
                            <span>${notificationWizardState.data.enable_audit_log ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        ${notificationWizardState.data.enable_audit_log ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Audit Log Retention:</strong>
                                <span>${notificationWizardState.data.audit_log_retention_days} days</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>API Rate Limiting:</strong>
                            <span>${notificationWizardState.data.enable_api_rate_limit ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        ${notificationWizardState.data.enable_api_rate_limit ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                                <strong>Rate Limit:</strong>
                                <span>${notificationWizardState.data.api_rate_limit_per_minute} requests/minute</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
                    <button type="button" class="btn btn-secondary" onclick="notificationWizardPreviousStep()">
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    ${isInspectMode ? `
                        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; flex: 1;">
                            <i class="fas fa-eye"></i> <strong>Inspect Mode:</strong> Settings are read-only.
                        </div>
                    ` : `
                        <button type="button" class="btn btn-success" onclick="saveNotificationWizardSettings()" id="notificationWizardSaveBtn">
                            <i class="fas fa-save"></i> Save Configuration
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// ==================== NOTIFICATION WIZARD HELPERS ====================

function notificationWizardNextStep() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot continue in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Basic validation per step before moving forward
    if (notificationWizardState.currentStep === 1) {
        const understandingCheckbox = document.getElementById('notificationWizardUnderstanding');
        if (!understandingCheckbox || !understandingCheckbox.checked) {
            showNotification('Please confirm that you understand the risks and requirements before continuing.', 'error');
            return;
        }
        notificationWizardState.understandingAccepted = true;
    } else if (notificationWizardState.currentStep === 2) {
        // Validate thresholds and limits
        if (notificationWizardState.data.low_stock_notification) {
            const threshold = parseInt(notificationWizardState.data.low_stock_threshold, 10);
            if (isNaN(threshold) || threshold < 1 || threshold > 50) {
                showNotification('Low stock threshold must be between 1 and 50 percent.', 'error');
                return;
            }
        }
        
        if (notificationWizardState.data.enable_audit_log) {
            const retention = parseInt(notificationWizardState.data.audit_log_retention_days, 10);
            if (isNaN(retention) || retention < 7 || retention > 365) {
                showNotification('Audit log retention must be between 7 and 365 days.', 'error');
                return;
            }
        }
        
        if (notificationWizardState.data.enable_api_rate_limit) {
            const rateLimit = parseInt(notificationWizardState.data.api_rate_limit_per_minute, 10);
            if (isNaN(rateLimit) || rateLimit < 10 || rateLimit > 1000) {
                showNotification('API rate limit must be between 10 and 1000 requests per minute.', 'error');
                return;
            }
        }
    }

    // Move to next step
    if (notificationWizardState.currentStep < 3) {
        notificationWizardState.currentStep += 1;
        renderNotificationSettingsWizard();
    }
}

function notificationWizardPreviousStep() {
    if (notificationWizardState.currentStep > 1) {
        notificationWizardState.currentStep -= 1;
        renderNotificationSettingsWizard();
    }
}

function setupNotificationWizardListeners(isSuperadmin) {
    // Step 1: understanding checkbox controls Next button
    const understandingCheckbox = document.getElementById('notificationWizardUnderstanding');
    const nextBtn = document.getElementById('notificationWizardNextBtn');
    if (understandingCheckbox && nextBtn && notificationWizardState.currentStep === 1) {
        understandingCheckbox.addEventListener('change', () => {
            notificationWizardState.understandingAccepted = understandingCheckbox.checked;
            nextBtn.disabled = !understandingCheckbox.checked;
        });
    }

    // Step 2: bind field changes into state
    if (notificationWizardState.currentStep === 2) {
        const lowStockCheckbox = document.getElementById('wizard_low_stock_notification');
        if (lowStockCheckbox) {
            lowStockCheckbox.addEventListener('change', () => {
                notificationWizardState.data.low_stock_notification = lowStockCheckbox.checked;
            });
        }

        const thresholdInput = document.getElementById('wizard_low_stock_threshold');
        if (thresholdInput) {
            thresholdInput.addEventListener('input', () => {
                notificationWizardState.data.low_stock_threshold = parseInt(thresholdInput.value || '20', 10);
            });
        }

        const auditLogCheckbox = document.getElementById('wizard_enable_audit_log');
        if (auditLogCheckbox) {
            auditLogCheckbox.addEventListener('change', () => {
                notificationWizardState.data.enable_audit_log = auditLogCheckbox.checked;
            });
        }

        const retentionInput = document.getElementById('wizard_audit_log_retention_days');
        if (retentionInput) {
            retentionInput.addEventListener('input', () => {
                notificationWizardState.data.audit_log_retention_days = parseInt(retentionInput.value || '90', 10);
            });
        }

        const rateLimitCheckbox = document.getElementById('wizard_enable_api_rate_limit');
        if (rateLimitCheckbox) {
            rateLimitCheckbox.addEventListener('change', () => {
                notificationWizardState.data.enable_api_rate_limit = rateLimitCheckbox.checked;
            });
        }

        const rateLimitInput = document.getElementById('wizard_api_rate_limit_per_minute');
        if (rateLimitInput) {
            rateLimitInput.addEventListener('input', () => {
                notificationWizardState.data.api_rate_limit_per_minute = parseInt(rateLimitInput.value || '60', 10);
            });
        }
    }
}

function validateNotificationWizardField(key, value) {
    let message = '';
    let isValid = true;

    if (key === 'low_stock_threshold') {
        const threshold = parseInt(value, 10);
        if (isNaN(threshold) || threshold < 1) {
            isValid = false;
            message = 'Threshold must be at least 1%.';
        } else if (threshold > 50) {
            isValid = false;
            message = 'Threshold cannot exceed 50%.';
        } else if (threshold < 10) {
            isValid = true;
            message = '⚠️ Very low threshold may cause excessive alerts.';
        } else if (threshold > 40) {
            isValid = true;
            message = '⚠️ High threshold may miss critical stock shortages.';
        } else {
            isValid = true;
            message = '✓ Good threshold for most use cases.';
        }
    } else if (key === 'audit_log_retention_days') {
        const days = parseInt(value, 10);
        if (isNaN(days) || days < 7) {
            isValid = false;
            message = 'Retention must be at least 7 days.';
        } else if (days > 365) {
            isValid = false;
            message = 'Retention cannot exceed 365 days.';
        } else if (days < 30) {
            isValid = true;
            message = '⚠️ Short retention may not meet compliance requirements.';
        } else if (days > 180) {
            isValid = true;
            message = '⚠️ Long retention will consume significant storage space.';
        } else {
            isValid = true;
            message = '✓ Good retention period for compliance.';
        }
    } else if (key === 'api_rate_limit_per_minute') {
        const limit = parseInt(value, 10);
        if (isNaN(limit) || limit < 10) {
            isValid = false;
            message = 'Rate limit must be at least 10 requests/minute.';
        } else if (limit > 1000) {
            isValid = false;
            message = 'Rate limit cannot exceed 1000 requests/minute.';
        } else if (limit < 30) {
            isValid = true;
            message = '⚠️ Very low limit may block legitimate users.';
        } else if (limit > 500) {
            isValid = true;
            message = '⚠️ Very high limit may not protect against abuse.';
        } else {
            isValid = true;
            message = '✓ Good rate limit for most use cases.';
        }
    }

    const validationDiv = document.getElementById(`validation_${key}`);
    if (validationDiv) {
        if (message) {
            validationDiv.style.display = 'block';
            validationDiv.style.color = isValid ? 'var(--success-color)' : 'var(--danger-color)';
            validationDiv.style.fontSize = '0.875rem';
            validationDiv.innerHTML = message;
        } else {
            validationDiv.style.display = 'none';
            validationDiv.innerHTML = '';
        }
    }
}

async function saveNotificationWizardSettings() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isInspectMode = isSuperadminInspectMode();

    if (isInspectMode) {
        showNotification('Cannot save in Inspect Mode. Switch to Configure Mode to make changes.', 'error');
        return;
    }

    // Build settings to save from wizard state
    const settingsToSave = [
        { key: 'low_stock_notification', value: notificationWizardState.data.low_stock_notification ? 'true' : 'false', category: 'notification' },
        { key: 'low_stock_threshold', value: String(notificationWizardState.data.low_stock_threshold), category: 'notification' },
        { key: 'enable_audit_log', value: notificationWizardState.data.enable_audit_log ? 'true' : 'false', category: 'notification' },
        { key: 'audit_log_retention_days', value: String(notificationWizardState.data.audit_log_retention_days), category: 'notification' },
        { key: 'enable_api_rate_limit', value: notificationWizardState.data.enable_api_rate_limit ? 'true' : 'false', category: 'notification' },
        { key: 'api_rate_limit_per_minute', value: String(notificationWizardState.data.api_rate_limit_per_minute), category: 'notification' }
    ];

    const saveBtn = document.getElementById('notificationWizardSaveBtn');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        await apiRequest('/settings', {
            method: 'PUT',
            body: {
                settings: settingsToSave,
                category: 'notification',
                superadminMode: currentUser && currentUser.role === 'superadmin' ? superadminMode : null
            }
        });

        showNotification('Notification settings saved successfully.', 'success');

        // Reset wizard state and reload settings
        notificationWizardState.currentStep = 1;
        notificationWizardState.understandingAccepted = false;
        await loadSettings();
    } catch (error) {
        showNotification('Error saving notification settings: ' + (error && error.message ? error.message : 'Unknown error'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// Expose notification wizard functions to global scope
window.notificationWizardNextStep = notificationWizardNextStep;
window.notificationWizardPreviousStep = notificationWizardPreviousStep;
window.validateNotificationWizardField = validateNotificationWizardField;
window.saveNotificationWizardSettings = saveNotificationWizardSettings;

