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
            { value: 'ar', label: 'Arabic (العربية)' }
        ],
        description: 'Select the language for the application interface. Multiple languages are now available including English, Kiswahili, French, Spanish, Hindi, and Arabic. Some pages may require a refresh to see all translations.'
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
        
        // Translate page after rendering settings
        if (window.i18n && typeof window.i18n.translatePage === 'function') {
            setTimeout(() => {
                window.i18n.translatePage();
            }, 100);
        }
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
            inputHTML = `
                <div class="form-group">
                    <label style="display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="${fieldId}" ${setting.value ? 'checked' : ''} 
                               onchange="markAsChanged('${setting.key}')" 
                               style="width: auto; margin: 0; margin-top: 0.25rem; flex-shrink: 0;">
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
            
            inputHTML = `
                <div class="form-group">
                    <label for="${fieldId}">${config.label || setting.key}</label>
                    <input type="${inputType}" id="${fieldId}" class="form-control ${needsThousandSeparator ? 'number-with-separator' : ''}" 
                           value="${displayValue}"
                           ${config.min !== undefined ? `min="${config.min}"` : ''}
                           ${config.max !== undefined ? `max="${config.max}"` : ''}
                           ${config.step !== undefined ? `step="${config.step}"` : ''}
                           data-original-type="number"
                           data-setting-key="${setting.key}"
                           ${needsThousandSeparator ? `oninput="handleNumberInputWithSeparator(this, '${setting.key}')"` : `onchange="markAsChanged('${setting.key}')"`}
                           placeholder="${config.placeholder || ''}">
                    ${description ? `<small style="color: var(--text-secondary); display: block; margin-top: 0.25rem; line-height: 1.4;">${description}</small>` : ''}
                    <div id="${fieldId}_validation" class="setting-validation" style="display: none; margin-top: 0.25rem;"></div>
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
        tab.addEventListener('click', () => {
            const category = tab.getAttribute('data-category');
            switchCategory(category);
        });
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
    
    return `
        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid var(--primary-color); margin-bottom: 1.5rem; border-radius: 0;">
            <h3 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1rem;">
                <i class="fas fa-info-circle"></i> Security Best Practices
            </h3>
            <ul style="margin: 0; padding-left: 1.5rem; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
                <li>Use strong passwords (minimum 8 characters with mixed case, numbers, and symbols)</li>
                <li>Set session timeout to 30-60 minutes for balance between security and usability</li>
                <li>Limit login attempts to 5 to prevent brute force attacks</li>
                <li>Enable two-factor authentication for additional security</li>
                <li>Regularly review audit logs to monitor system access</li>
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
    // Store language preference
    safeStorageSet('appLanguage', language);
    
    // Set HTML lang attribute (helps with accessibility and browser features)
    document.documentElement.lang = language;
    
    // Apply translations using i18n system
    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        try {
            await window.i18n.setLanguage(language);
            console.log('Language changed to:', language);
            // Ensure page is translated after language change
            if (window.i18n && typeof window.i18n.translatePage === 'function') {
                setTimeout(() => {
                    window.i18n.translatePage();
                }, 100);
            }
        } catch (error) {
            console.error('Error applying language:', error);
        }
    } else {
        // i18n.js not loaded yet - wait a bit and try again, or initialize it
        console.log('i18n not ready, waiting...');
        let attempts = 0;
        const maxAttempts = 10;
        const checkI18n = setInterval(() => {
            attempts++;
            if (window.i18n && typeof window.i18n.setLanguage === 'function') {
                clearInterval(checkI18n);
                window.i18n.setLanguage(language).then(() => {
                    setTimeout(() => {
                        if (window.i18n && typeof window.i18n.translatePage === 'function') {
                            window.i18n.translatePage();
                        }
                    }, 100);
                });
            } else if (attempts >= maxAttempts) {
                clearInterval(checkI18n);
                console.log('Language preference saved. Will apply on page reload.');
            }
        }, 100);
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
    
    const settingsToSave = [];
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        const fieldId = input.id;
        if (fieldId.startsWith('setting_')) {
            const key = fieldId.replace('setting_', '');
            // Check if this setting belongs to the current category
            // First check if it exists in allSettings, if not, check fieldConfigs to determine category
            const existingSetting = (allSettings[currentCategory] || []).find(s => s.key === key);
            const config = fieldConfigs[key];
            
            // If setting doesn't exist in current category, check if it should belong to current category
            if (!existingSetting && config) {
                // Determine category from key patterns (same logic as server)
                let shouldBeInCategory = false;
                if (currentCategory === 'general') {
                    shouldBeInCategory = ['system_name', 'shop_system_name', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_tax_id', 'default_tax_rate', 'tax_calculation_method', 'invoice_number_format', 'receipt_number_format'].includes(key);
                } else if (currentCategory === 'security') {
                    shouldBeInCategory = ['session_timeout', 'password_min_length', 'require_strong_password', 'enable_two_factor', 'max_login_attempts', 'lockout_duration'].includes(key);
                } else if (currentCategory === 'currency') {
                    shouldBeInCategory = ['currency_code', 'currency_symbol', 'currency_position', 'decimal_places'].includes(key);
                } else if (currentCategory === 'datetime') {
                    shouldBeInCategory = ['system_timezone', 'date_format', 'time_format'].includes(key);
                } else if (currentCategory === 'display') {
                    shouldBeInCategory = ['items_per_page', 'print_paper_size', 'print_margin', 'theme', 'language', 'enable_barcode_scanning', 'barcode_format'].includes(key);
                } else if (currentCategory === 'email') {
                    shouldBeInCategory = key.startsWith('email_');
                } else if (currentCategory === 'backup') {
                    shouldBeInCategory = key.startsWith('backup_');
                } else if (currentCategory === 'notification') {
                    shouldBeInCategory = ['low_stock_notification', 'low_stock_threshold', 'enable_audit_log', 'audit_log_retention_days', 'enable_api_rate_limit', 'api_rate_limit_per_minute'].includes(key);
                }
                
                // If this setting doesn't belong to current category, skip it
                if (!shouldBeInCategory) return;
            } else if (!existingSetting && !config) {
                // No config and no existing setting - skip it
                return;
            }
            
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
        await apiRequest('/settings', {
            method: 'PUT',
            body: { settings: settingsToSave }
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
            // If language was changed, ensure page is translated after reload
            const languageSetting = displaySettings.find(s => s.key === 'language');
            if (languageSetting && window.i18n && typeof window.i18n.translatePage === 'function') {
                // Wait a bit for DOM to update, then translate
                setTimeout(() => {
                    window.i18n.translatePage();
                }, 200);
            }
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
    
    await loadSettings();
});

