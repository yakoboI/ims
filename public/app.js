const API_BASE_URL = window.location.origin + '/api';

// Safe storage access wrapper to handle tracking prevention
function safeStorageGet(key, defaultValue = null) {
    try {
        return localStorage.getItem(key) || defaultValue;
    } catch (error) {
        console.warn(`Storage access blocked for key: ${key}`, error);
        return defaultValue;
    }
}

function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`Storage write blocked for key: ${key}`, error);
        return false;
    }
}

function safeStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn(`Storage remove blocked for key: ${key}`, error);
        return false;
    }
}

let authToken = safeStorageGet('authToken');
let currentUser = JSON.parse(safeStorageGet('currentUser', 'null') || 'null');
let refreshToken = safeStorageGet('refreshToken');

if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
    if (!authToken) {
        window.location.href = '/index.html';
    }
}

// Function to refresh access token
async function refreshAccessToken() {
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }
    
    try {
        const response = await fetch(API_BASE_URL + '/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });
        
        if (!response.ok) {
            throw new Error('Token refresh failed');
        }
        
        const data = await response.json();
        authToken = data.token;
        safeStorageSet('authToken', authToken);
        
        if (data.user) {
            currentUser = data.user;
            safeStorageSet('currentUser', JSON.stringify(currentUser));
        }
        
        return authToken;
    } catch (error) {
        // Refresh failed - clear tokens and redirect to login
        safeStorageRemove('authToken');
        safeStorageRemove('currentUser');
        safeStorageRemove('refreshToken');
        authToken = null;
        currentUser = null;
        refreshToken = null;
        
        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
            window.location.href = '/index.html';
        }
        
        throw error;
    }
}

async function apiRequest(endpoint, options = {}) {
    // Skip caching for non-GET requests or if cache is disabled
    const useCache = (options.method === 'GET' || !options.method) && options.cache !== false;
    const cacheKey = useCache ? `${endpoint}_${JSON.stringify(options)}` : null;
    
    // Check cache first for GET requests
    if (useCache && cacheKey && window.getCachedRequest) {
        const cached = window.getCachedRequest(cacheKey);
        if (cached !== null) {
            return cached;
        }
    }
    
    // Check if superadmin has selected a shop and add shop_id filter
    const currentUser = JSON.parse(safeStorageGet('currentUser', 'null') || 'null');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    // Get shopId from window.selectedShopId first (most up-to-date), then localStorage, then null
    let shopId = null;
    if (isSuperadmin) {
        shopId = window.selectedShopId !== undefined && window.selectedShopId !== null 
            ? window.selectedShopId 
            : (safeStorageGet('selectedShopId') ? parseInt(safeStorageGet('selectedShopId')) : null);
    }
    
    let url = API_BASE_URL + endpoint;
    
    // Add shop_id to query params for GET requests if superadmin has selected a shop
    if (isSuperadmin && shopId && (options.method === 'GET' || !options.method)) {
        const separator = endpoint.includes('?') ? '&' : '?';
        url = `${API_BASE_URL}${endpoint}${separator}shop_id=${shopId}`;
    } else {
        url = API_BASE_URL + endpoint;
    }
    
    const config = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
            ...(options.headers || {})
        }
    };

    // Handle body - stringify if it's an object, use as-is if it's already a string
    // Add shop_id to body for POST/PUT requests if superadmin has selected a shop
    let body = options.body;
    if (isSuperadmin && shopId && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
        if (body !== undefined && body !== null) {
            if (typeof body === 'object' && !Array.isArray(body)) {
                body = { ...body, shop_id: parseInt(shopId) };
            }
        } else {
            body = { shop_id: parseInt(shopId) };
        }
    }
    
    if (body !== undefined && body !== null) {
        if (typeof body === 'object') {
            config.body = JSON.stringify(body);
        } else {
            config.body = body;
        }
    }

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type');
        let data;
        let errorText = '';
        
        // Try to parse response as JSON first
        try {
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                errorText = await response.text();
                // Try to parse as JSON even if content-type doesn't say so
                try {
                    data = JSON.parse(errorText);
                } catch {
                    // Not JSON, use as text
                    data = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
                }
            }
        } catch (parseError) {
            // If JSON parsing fails, try to get text
            try {
                errorText = await response.text();
                data = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
            } catch (textError) {
                data = { error: `HTTP ${response.status}: ${response.statusText}` };
            }
        }
        
        if (!response.ok) {
            // Log errors for debugging
            if (response.status >= 500) {
                console.error('Server Error - URL:', url, 'Method:', config.method, 'Status:', response.status);
                console.error('Response data:', data);
                console.error('Response text:', errorText);
            } else if (response.status === 404) {
                console.error('404 Error - URL:', url, 'Method:', config.method, 'Response:', data);
            }
            
            // Handle authentication errors - try to refresh token first
            if (response.status === 401 || response.status === 403) {
                // Try to refresh token if we have a refresh token and this is not a refresh request
                if (refreshToken && endpoint !== '/refresh' && !options._retrying) {
                    try {
                        await refreshAccessToken();
                        // Retry the original request with new token
                        options._retrying = true;
                        return apiRequest(endpoint, options);
                    } catch (refreshError) {
                        // Refresh failed - clear storage and redirect to login
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('currentUser');
                        localStorage.removeItem('refreshToken');
                        authToken = null;
                        currentUser = null;
                        refreshToken = null;
                        
                        // Only redirect if not already on login page
                        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
                            window.location.href = '/index.html';
                        }
                    }
                } else {
                    // No refresh token or refresh failed - clear storage and redirect to login
                    safeStorageRemove('authToken');
                    safeStorageRemove('currentUser');
                    safeStorageRemove('refreshToken');
                    authToken = null;
                    currentUser = null;
                    refreshToken = null;
                    
                    // Only redirect if not already on login page
                    if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
                        window.location.href = '/index.html';
                    }
                }
            }
            
            // Extract error message from response
            let errorMessage = 'Request failed';
            if (data) {
                if (data.error) {
                    errorMessage = data.error;
                } else if (data.message) {
                    errorMessage = data.message;
                } else if (typeof data === 'string') {
                    errorMessage = data;
                } else if (errorText) {
                    errorMessage = errorText;
                }
            }
            
            // For 500 errors, provide more helpful message
            if (response.status === 500) {
                if (errorMessage.includes('JWT_SECRET') || errorMessage.includes('configuration')) {
                    errorMessage = 'Server configuration error. Please contact administrator.';
                } else if (errorMessage.includes('Database') || errorMessage.includes('database')) {
                    errorMessage = 'Database error. Please try again in a moment.';
                } else if (!errorMessage || errorMessage === 'Request failed') {
                    errorMessage = 'Server error occurred. Please try again or contact support.';
                }
            }
            
            const error = new Error(errorMessage || `Request failed: ${response.status} ${response.statusText}`);
            error.status = response.status;
            error.data = data;
            
            // Log error
            if (window.ErrorLogger) {
                window.ErrorLogger.log(error, {
                    endpoint,
                    method: options.method || 'GET',
                    status: response.status
                });
            }
            
            throw error;
        }
        
        // Check if response data contains an error code (even if HTTP status is 200)
        if (data && typeof data === 'object' && (data.code === 403 || data.code === 401)) {
            const error = new Error(data.message || data.error || 'Permission denied');
            error.code = data.code;
            error.status = data.code;
            error.data = data;
            throw error;
        }
        
        // Cache successful GET responses
        if (useCache && cacheKey && window.setCachedRequest) {
            const cacheDuration = options.cacheDuration || 60000; // Default 1 minute
            window.setCachedRequest(cacheKey, data, cacheDuration);
        }
        
        return data;
    } catch (error) {
        // Log network errors
        if (window.ErrorLogger && (error.message.includes('fetch') || error.message.includes('network'))) {
            window.ErrorLogger.log(error, {
                endpoint,
                method: options.method || 'GET',
                type: 'network_error'
            });
        }
        
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('loginError');
            errorDiv.textContent = '';
            errorDiv.classList.remove('show');

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const response = await apiRequest('/login', {
                    method: 'POST',
                    body: { username, password }
                });

                authToken = response.token;
                currentUser = response.user;
                if (response.refreshToken) {
                    refreshToken = response.refreshToken;
                    safeStorageSet('refreshToken', refreshToken);
                }
                safeStorageSet('authToken', authToken);
                safeStorageSet('currentUser', JSON.stringify(currentUser));

                window.location.href = '/dashboard.html';
            } catch (error) {
                const errorMsg = error.message || (window.i18n ? window.i18n.t('messages.loginFailed') : 'Login failed');
                errorDiv.textContent = errorMsg;
                errorDiv.classList.add('show');
            }
        });
    }

    if (currentUser) {
        const navUser = document.getElementById('navUser');
        if (navUser) {
            navUser.textContent = `${currentUser.full_name || currentUser.username} (${currentUser.role})`;
        }
        // Update brand user ID
        const navBrandUserId = document.getElementById('navBrandUserId');
        if (navBrandUserId) {
            navBrandUserId.textContent = currentUser.username || currentUser.id || '-';
        }
        loadAndApplyRolePermissions(currentUser.role);
    }
});

function logout() {
    safeStorageRemove('authToken');
    safeStorageRemove('currentUser');
    authToken = null;
    currentUser = null;
    window.location.href = '/index.html';
}

function formatCurrency(amount) {
    // Format as Tanzanian Shillings (Tshs) with 2 decimal places
    return 'Tshs ' + new Intl.NumberFormat('en-TZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Initialize display settings on app load (if settings functions are available)
if (typeof loadAndApplyDisplaySettings === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        loadAndApplyDisplaySettings().catch(err => console.error('Error loading display settings:', err));
    });
} else {
    // Fallback: Initialize basic theme if settings.js not loaded
    document.addEventListener('DOMContentLoaded', () => {
        const theme = localStorage.getItem('appTheme') || 'light';
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        }
        
        // Initialize i18n if available
        if (window.i18n && typeof window.i18n.initI18n === 'function') {
            window.i18n.initI18n();
        }
    });
}

// Helper to get translation key from common messages
function getTranslationKey(message) {
    const messageMap = {
        'Saved successfully': 'messages.saved',
        'Deleted successfully': 'messages.deleted',
        'An error occurred': 'messages.error',
        'Error saving data': 'messages.saveError',
        'Error deleting data': 'messages.deleteError',
        'No data available': 'messages.noData',
        'Loading data...': 'messages.loading',
        'Updated successfully': 'messages.updateSuccess',
        'Created successfully': 'messages.createSuccess',
        'Operation completed successfully': 'messages.operationSuccess',
        'Operation failed': 'messages.operationError',
        'Please wait...': 'messages.pleaseWait',
        'Invalid input': 'messages.invalidInput',
        'This field is required': 'messages.requiredField',
        'Error loading customers': 'messages.errorLoadingCustomers',
        'Error loading suppliers': 'messages.errorLoadingSuppliers',
        'Error loading items': 'messages.errorLoadingItems',
        'Error loading installment plans': 'messages.errorLoadingPlans',
        'Error loading plan details': 'messages.errorLoadingPlanDetails',
        'Error loading backups': 'messages.errorLoadingBackups',
        'Error refreshing dashboard': 'messages.errorLoadingDashboard',
        'Form elements not found': 'messages.formElementsNotFound',
        'No changes to save': 'messages.noChangesToSave',
        'Settings saved successfully': 'messages.settingsSaved',
        'Settings reset to defaults successfully': 'messages.settingsReset',
        'Settings exported successfully': 'messages.settingsExported',
        'Settings imported successfully': 'messages.settingsImported',
        'No settings to reset': 'messages.noSettingsToReset',
        'Test email input not found': 'messages.testEmailInputNotFound',
        'Please enter a valid email address': 'messages.pleaseEnterValidEmail',
        'Access denied. Only administrators can access settings.': 'messages.accessDenied',
        'You do not have permission to access this page': 'messages.noPermission',
        'Redirecting to dashboard...': 'messages.redirectingToDashboard',
        'Passwords do not match': 'messages.passwordsDoNotMatch',
        'Password changed successfully': 'messages.passwordChanged',
        'Error changing password': 'messages.errorChangingPassword',
        'Backup list refreshed': 'messages.backupListRefreshed',
        'Creating backup...': 'messages.creatingBackup',
        'Backup created successfully': 'messages.backupCreated',
        'Error creating backup': 'messages.errorCreatingBackup',
        'Restoring backup...': 'messages.restoringBackup',
        'Backup restored successfully': 'messages.backupRestored',
        'Error restoring backup': 'messages.errorRestoringBackup',
        'Deleting backup...': 'messages.deletingBackup',
        'Backup deleted successfully': 'messages.backupDeleted',
        'Error deleting backup': 'messages.errorDeletingBackup',
        'No backups found': 'messages.noBackupsFound',
        'Customer created successfully': 'messages.customerCreated',
        'Customer updated successfully': 'messages.customerUpdated',
        'Customer deleted successfully': 'messages.customerDeleted',
        'Supplier created successfully': 'messages.supplierCreated',
        'Supplier updated successfully': 'messages.supplierUpdated',
        'Supplier deleted successfully': 'messages.supplierDeleted',
        'Item created successfully': 'messages.itemCreated',
        'Item updated successfully': 'messages.itemUpdated',
        'Item deleted successfully': 'messages.itemDeleted',
        'Category created successfully': 'messages.categoryCreated',
        'Category updated successfully': 'messages.categoryUpdated',
        'Category deleted successfully': 'messages.categoryDeleted',
        'Installment plan created successfully': 'messages.planCreated',
        'Installment plan updated successfully': 'messages.planUpdated',
        'Installment plan deleted successfully': 'messages.planDeleted',
        'Plan not found': 'messages.planNotFound',
        'Installment plan completed! Product can now be delivered.': 'messages.planCompleted',
        'Payment recorded successfully': 'messages.paymentRecorded',
        'Purchase order created successfully': 'messages.purchaseCreated',
        'Error creating purchase order': 'messages.errorCreating',
        'Please add at least one item': 'messages.pleaseAddAtLeastOneItem',
        'Please select a supplier': 'messages.pleaseSelectSupplier',
        'Down payment must be less than total price': 'messages.downPaymentMustBeLessThanTotal',
        'Expected amount is required for partial payments': 'messages.expectedAmountRequiredForPartial',
        'Partial payment amount must be less than expected amount': 'messages.partialPaymentMustBeLessThanExpected',
        'Payment amount cannot exceed remaining balance of': 'messages.paymentAmountCannotExceedBalance',
        'Payment amount must be greater than 0': 'messages.paymentAmountMustBeGreaterThanZero',
        'Error validating payment': 'messages.errorValidatingPayment',
        'Payment date cannot be in the future': 'messages.paymentDateCannotBeInFuture',
        'Service date cannot be in the future. Service must be delivered before payment is recorded.': 'messages.serviceDateCannotBeInFuture',
        'report exported successfully': 'messages.reportExported',
        'Summary report generation coming soon': 'messages.summaryReportComingSoon',
        'Chart function not available. Please refresh the page.': 'messages.chartFunctionNotAvailable',
        'Error loading revenue analysis chart': 'messages.errorLoadingChart',
        'Error loading category performance chart': 'messages.errorLoadingChart',
        'Login failed. Please check your credentials.': 'messages.loginFailed',
        'Invalid user data': 'messages.invalidUserData',
        'Please enter both username and password': 'messages.pleaseEnterBothUsernameAndPassword',
        'Error loading settings': 'messages.errorLoadingSettings',
        'Error saving settings': 'messages.errorSavingSettings',
        'Error resetting settings': 'messages.errorResettingSettings',
        'Error exporting settings': 'messages.errorExporting',
        'Error importing settings': 'messages.errorImporting',
        'Error testing email': 'messages.errorTesting',
        'Error loading chart': 'messages.errorLoadingChart',
        'Error loading report': 'messages.errorLoadingReport'
    };
    
    // Try exact match first
    if (messageMap[message]) {
        return messageMap[message];
    }
    
    // Try partial matches for dynamic messages
    if (message.includes('Error loading')) {
        if (message.includes('customers')) return 'messages.errorLoadingCustomers';
        if (message.includes('suppliers')) return 'messages.errorLoadingSuppliers';
        if (message.includes('items')) return 'messages.errorLoadingItems';
        if (message.includes('plans')) return 'messages.errorLoadingPlans';
        if (message.includes('backups')) return 'messages.errorLoadingBackups';
        if (message.includes('dashboard')) return 'messages.errorLoadingDashboard';
        if (message.includes('chart')) return 'messages.errorLoadingChart';
        if (message.includes('report')) return 'messages.errorLoadingReport';
        return 'messages.errorLoading';
    }
    
    if (message.includes('Error saving')) {
        if (message.includes('settings')) return 'messages.errorSavingSettings';
        return 'messages.errorSaving';
    }
    
    if (message.includes('Error deleting')) {
        return 'messages.errorDeleting';
    }
    
    if (message.includes('Error creating')) {
        return 'messages.errorCreating';
    }
    
    if (message.includes('Error exporting')) {
        return 'messages.errorExporting';
    }
    
    if (message.includes('Error importing')) {
        return 'messages.errorImporting';
    }
    
    if (message.includes('Error testing')) {
        return 'messages.errorTesting';
    }
    
    if (message.includes('must be at least')) {
        return 'messages.mustBeAtLeast';
    }
    
    if (message.includes('must be at most')) {
        return 'messages.mustBeAtMost';
    }
    
    if (message.includes('Invalid email format')) {
        return 'messages.invalidEmailFormat';
    }
    
    if (message.includes('Settings imported successfully')) {
        return 'messages.settingsImported';
    }
    
    if (message.includes('report exported successfully')) {
        return 'messages.reportExported';
    }
    
    if (message.includes('Payment recorded successfully')) {
        return 'messages.paymentRecorded';
    }
    
    if (message.includes('(Receipt:')) {
        return 'messages.paymentRecordedWithReceipt';
    }
    
    return null;
}

// Notification system with stacking support
let notificationStack = [];
const NOTIFICATION_DURATION = 5000; // 5 seconds
const NOTIFICATION_SPACING = 10; // Space between notifications

function showNotification(message, type = 'success', params = {}) {
    // Try to translate the message if it's a translation key
    let displayMessage = message;
    if (window.i18n && typeof window.i18n.t === 'function') {
        // Check if message is a translation key
        const translationKey = getTranslationKey(message);
        if (translationKey) {
            displayMessage = window.i18n.t(translationKey, params);
        } else if (message.includes('{')) {
            // Try to extract parameters from message and translate
            const baseKey = message.split('{')[0].trim();
            const key = getTranslationKey(baseKey);
            if (key) {
                // Extract params from message string
                const extractedParams = {};
                const paramMatches = message.match(/\{(\w+)\}/g);
                if (paramMatches) {
                    paramMatches.forEach(match => {
                        const paramName = match.replace(/[{}]/g, '');
                        const paramValue = message.match(new RegExp(`\\{${paramName}\\}:\\s*([^,}]+)`))?.[1] || 
                                         message.match(new RegExp(`\\{${paramName}\\}\\s*=\\s*([^,}]+)`))?.[1] ||
                                         params[paramName] || '';
                        extractedParams[paramName] = paramValue.trim();
                    });
                }
                displayMessage = window.i18n.t(key, { ...params, ...extractedParams });
            }
        }
    }
    
    // Create notification container if it doesn't exist
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            width: calc(100% - 40px);
            pointer-events: none;
        `;
        document.body.appendChild(notificationContainer);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
    notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    notification.setAttribute('aria-atomic', 'true');
    
    // Determine colors based on type
    let bgColor, textColor, borderColor;
    switch(type) {
        case 'success':
            bgColor = '#d1fae5';
            textColor = '#065f46';
            borderColor = '#10b981';
            break;
        case 'error':
            bgColor = '#fee2e2';
            textColor = '#991b1b';
            borderColor = '#ef4444';
            break;
        case 'warning':
            bgColor = '#fef3c7';
            textColor = '#92400e';
            borderColor = '#f59e0b';
            break;
        case 'info':
        default:
            bgColor = '#dbeafe';
            textColor = '#1e40af';
            borderColor = '#3b82f6';
            break;
    }
    
    notification.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <span style="flex-shrink: 0; font-size: 1.25rem;">
                ${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span style="flex: 1; word-wrap: break-word;">${escapeHtml(displayMessage)}</span>
            <button class="notification-close" aria-label="Close notification" style="
                background: none;
                border: none;
                color: ${textColor};
                cursor: pointer;
                font-size: 1.25rem;
                line-height: 1;
                padding: 0;
                opacity: 0.7;
                flex-shrink: 0;
            " onclick="this.parentElement.parentElement.remove(); updateNotificationPositions();">×</button>
        </div>
    `;
    
    notification.style.cssText = `
        padding: 1rem 1.5rem;
        background: ${bgColor};
        color: ${textColor};
        border-left: 4px solid ${borderColor};
        border-radius: 0;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        margin-bottom: ${NOTIFICATION_SPACING}px;
        animation: slideInRight 0.3s ease;
        pointer-events: auto;
        word-wrap: break-word;
        max-width: 100%;
    `;
    
    notificationContainer.appendChild(notification);
    notificationStack.push(notification);
    
    // Announce to screen readers
    if (window.AccessibilityUtils && typeof window.AccessibilityUtils.announce === 'function') {
        window.AccessibilityUtils.announce(displayMessage, type === 'error' ? 'assertive' : 'polite');
    }
    
    // Auto-dismiss after duration
    const dismissTimeout = setTimeout(() => {
        dismissNotification(notification);
    }, NOTIFICATION_DURATION);
    
    // Store timeout ID for manual dismissal
    notification.dataset.dismissTimeout = dismissTimeout;
    
    // Update positions
    updateNotificationPositions();
    
    return notification;
}

function dismissNotification(notification) {
    if (notification.dataset.dismissTimeout) {
        clearTimeout(parseInt(notification.dataset.dismissTimeout));
    }
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
        notification.remove();
        notificationStack = notificationStack.filter(n => n !== notification);
        updateNotificationPositions();
    }, 300);
}

function updateNotificationPositions() {
    // Notifications stack automatically with CSS, but we ensure proper spacing
    const notifications = document.querySelectorAll('#notification-container .notification');
    notifications.forEach((notif, index) => {
        // Position is handled by CSS margin-bottom, but we can add transitions
        notif.style.transition = 'margin-top 0.3s ease';
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enhanced notification styles
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    .notification-close:hover {
        opacity: 1 !important;
    }
    @media (max-width: 768px) {
        #notification-container {
            top: 10px !important;
            right: 10px !important;
            left: 10px !important;
            width: calc(100% - 20px) !important;
            max-width: none !important;
        }
    }
`;
document.head.appendChild(notificationStyle);

// Track last touch time to prevent double-firing
let lastTouchTime = 0;
const TOUCH_DELAY = 350;

// Track when menu was just toggled to prevent immediate close
let menuJustToggled = false;
let menuToggleTimeout = null;

// Global function for mobile menu toggle (can be called from HTML onclick)
// Defined at top level so it's available immediately
window.toggleMobileMenuHandler = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    toggleMobileMenu(e);
    return false;
};

function toggleMobileMenu(e) {
    // Prevent default and stop propagation
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    
    // Mark that we just toggled to prevent immediate close
    menuJustToggled = true;
    if (menuToggleTimeout) {
        clearTimeout(menuToggleTimeout);
    }
    menuToggleTimeout = setTimeout(() => {
        menuJustToggled = false;
    }, 100);
    
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const body = document.body;
    
    if (!navbar) {
        console.error('Navbar not found!');
        return;
    }
    
    navbar.classList.toggle('mobile-open');
    const isOpen = navbar.classList.contains('mobile-open');
    
    // Only apply mobile transforms on mobile screens (width <= 768px)
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Get the actual navbar width to calculate exact transform
        const navbarWidth = navbar.offsetWidth || navbar.getBoundingClientRect().width || 280;
        
        // Temporarily disable transition to prevent interference
        const originalTransition = window.getComputedStyle(navbar).transition;
        navbar.style.transition = 'none';
        
        // Set transform directly - inline styles should override CSS
        if (isOpen) {
            navbar.style.transform = 'translateX(0px)';
            navbar.style.zIndex = '1001';
        } else {
            navbar.style.transform = `translateX(-${navbarWidth}px)`;
        }
        
        // Force reflow to ensure style is applied
        void navbar.offsetHeight;
        
        // Re-enable transition after a brief delay for smooth closing animations
        setTimeout(() => {
            if (!isOpen && originalTransition && originalTransition !== 'none') {
                navbar.style.transition = originalTransition;
            } else if (!isOpen) {
                navbar.style.removeProperty('transition');
            }
        }, 50);
    } else {
        // On desktop, remove inline styles and let CSS handle it
        navbar.style.removeProperty('transform');
        navbar.style.removeProperty('z-index');
        navbar.style.removeProperty('transition');
    }
    
    if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', isOpen);
        menuToggle.innerHTML = isOpen ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    }
    
    // Prevent body scroll when menu is open
    if (isOpen) {
        body.classList.add('menu-open');
    } else {
        body.classList.remove('menu-open');
    }
    
    // Add/remove overlay
    let overlay = document.getElementById('sidebar-overlay');
    if (isOpen) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }
        overlay.classList.add('show');
        overlay.style.zIndex = '1000';
    } else {
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                const existingOverlay = document.getElementById('sidebar-overlay');
                if (existingOverlay && !existingOverlay.classList.contains('show')) {
                    existingOverlay.remove();
                }
            }, 300);
        }
    }
}

// Close mobile menu when clicking/touching outside
function handleOutsideClick(e) {
    // Don't process if menu was just toggled (prevent immediate close)
    if (menuJustToggled) {
        return;
    }
    
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    
    // Don't process if menu is closed
    if (!navbar || !navbar.classList.contains('mobile-open')) {
        return;
    }
    
    // Don't close if clicking/touching the toggle button itself
    if (menuToggle && (menuToggle.contains(e.target) || e.target.closest('.mobile-menu-toggle'))) {
        return;
    }
    
    // Close if clicking/touching the overlay or outside the navbar
    if ((overlay && e.target === overlay) || !navbar.contains(e.target)) {
        toggleMobileMenu();
    }
}

// Close mobile menu on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const navbar = document.querySelector('.navbar');
        if (navbar && navbar.classList.contains('mobile-open')) {
            toggleMobileMenu();
        }
    }
});

// Setup mobile menu toggle event listeners
function setupMobileMenuToggle() {
    // Check if navbar exists first (some pages like login don't have it)
    const navbar = document.querySelector('.navbar');
    if (!navbar) {
        // Silently return if navbar doesn't exist (expected on login page)
        return;
    }
    
    const menuToggles = document.querySelectorAll('.mobile-menu-toggle');
    
    if (menuToggles.length === 0) {
        // Only warn if navbar exists but toggle button doesn't (unexpected)
        console.warn('Mobile menu toggle button not found (navbar exists)');
        return;
    }
    
    menuToggles.forEach(toggle => {
        // Add onclick handler directly
        toggle.onclick = window.toggleMobileMenuHandler;
        
        // Add touch event handler
        toggle.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileMenu(e);
        }, { passive: false });
        
        // Add click event handler
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileMenu(e);
        }, { passive: false });
    });
    
    // Handle outside clicks - use setTimeout to avoid immediate close
    document.addEventListener('click', function(e) {
        setTimeout(function() {
            handleOutsideClick(e);
        }, 10);
    }, true);
    
    document.addEventListener('touchend', function(e) {
        setTimeout(function() {
            const overlay = document.getElementById('sidebar-overlay');
            const navbar = document.querySelector('.navbar');
            // Only close if touching the overlay specifically
            if (overlay && e.target === overlay && navbar && navbar.classList.contains('mobile-open')) {
                e.preventDefault();
                toggleMobileMenu();
            } else {
                handleOutsideClick(e);
            }
        }, 10);
    }, { passive: false });
}

// Setup on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMobileMenuToggle);
} else {
    setupMobileMenuToggle();
}

// ============================================================================
// Sidebar Management - Pure Implementation
// ============================================================================

/**
 * Sidebar state management utilities
 */
const SidebarState = {
    STORAGE_KEY: 'sidebarCollapsed',
    
    /**
     * Check if sidebar should be collapsed (desktop only)
     */
    isDesktopMode: () => window.innerWidth > 768,
    
    /**
     * Get current collapsed state from localStorage
     */
    getSavedState: () => localStorage.getItem(SidebarState.STORAGE_KEY) === 'true',
    
    /**
     * Save collapsed state to localStorage
     */
    saveState: (isCollapsed) => {
        localStorage.setItem(SidebarState.STORAGE_KEY, isCollapsed ? 'true' : 'false');
    },
    
    /**
     * Get current collapsed state from DOM
     */
    getCurrentState: () => {
        const navbar = document.querySelector('.navbar');
        return navbar?.classList.contains('collapsed') ?? false;
    }
};

/**
 * Update toggle icon based on collapsed state
 */
function updateSidebarToggleIcon(isCollapsed) {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const toggleIcon = sidebarToggle?.querySelector('i');
    
    if (!toggleIcon) return;
    
    // Remove both classes first to ensure clean state
    toggleIcon.classList.remove('fa-angle-left', 'fa-angle-right');
    
    // Add appropriate class
    toggleIcon.classList.add(isCollapsed ? 'fa-angle-right' : 'fa-angle-left');
}

/**
 * Update tooltips for nav links when sidebar is collapsed
 */
function updateNavLinkTooltips(isCollapsed) {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        if (isCollapsed) {
            // Get text content for tooltip
            const text = link.textContent.trim();
            const icon = link.querySelector('i');
            if (icon && text) {
                // Remove icon text from tooltip
                const tooltipText = text.replace(icon.outerHTML, '').trim();
                link.setAttribute('data-tooltip', tooltipText);
            } else {
                link.setAttribute('data-tooltip', text);
            }
        } else {
            link.removeAttribute('data-tooltip');
        }
    });
}

/**
 * Apply sidebar collapsed state to DOM (pure function)
 */
function applySidebarState(isCollapsed) {
    const navbar = document.querySelector('.navbar');
    const body = document.body;
    
    if (!navbar) return;
    
    // Update navbar class
    if (isCollapsed) {
        navbar.classList.add('collapsed');
        body.classList.add('sidebar-collapsed');
    } else {
        navbar.classList.remove('collapsed');
        body.classList.remove('sidebar-collapsed');
    }
    
    // Update toggle icon
    updateSidebarToggleIcon(isCollapsed);
    
    // Update tooltips
    updateNavLinkTooltips(isCollapsed);
}

/**
 * Toggle sidebar collapsed state (desktop only)
 */
function toggleSidebar() {
    const navbar = document.querySelector('.navbar');
    
    if (!navbar) return;
    
    // Only work on desktop (width > 768px)
    if (!SidebarState.isDesktopMode()) {
        return;
    }
    
    // Get current state and toggle it
    const currentState = SidebarState.getCurrentState();
    const newState = !currentState;
    
    // Apply new state to DOM
    applySidebarState(newState);
    
    // Save state to localStorage
    SidebarState.saveState(newState);
}

/**
 * Initialize sidebar state from localStorage (pure initialization)
 */
function initializeSidebarState() {
    const navbar = document.querySelector('.navbar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    
    if (!navbar || !sidebarToggle) return;
    
    // Only apply on desktop
    if (!SidebarState.isDesktopMode()) {
        // Ensure sidebar is expanded on mobile
        applySidebarState(false);
        return;
    }
    
    // Get saved state from localStorage
    const savedState = SidebarState.getSavedState();
    
    // Apply saved state to DOM
    applySidebarState(savedState);
}

/**
 * Handle window resize - restore sidebar state appropriately
 */
function handleSidebarResize() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    if (!SidebarState.isDesktopMode()) {
        // On mobile, ensure sidebar is always expanded (not collapsed)
        applySidebarState(false);
    } else {
        // On desktop, restore saved state
        initializeSidebarState();
    }
}

// Handle window resize - restore sidebar on mobile/desktop transitions
window.addEventListener('resize', handleSidebarResize);

// Initialize sidebar on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebarState);
} else {
    initializeSidebarState();
}

// Make toggleSidebar available globally
window.toggleSidebar = toggleSidebar;

async function loadAndApplyRolePermissions(userRole) {
    try {
        const permissions = await apiRequest(`/role-permissions/${userRole}`);
        
        // All available pages with their selectors - matching the actual architecture
        const pageLinks = {
            'dashboard': document.querySelector('a[href="dashboard.html"]'),
            'inventory-items': document.querySelector('a[href="inventory-items.html"]'),
            'inventory-operations': document.querySelector('a[href="inventory-operations.html"]'),
            'goods-prices': document.querySelector('a[href="goods-prices.html"]'),
            'stock-manage': document.querySelector('a[href="stock-manage.html"]'),
            'goods-barcodes': document.querySelector('a[href="goods-barcodes.html"]'),
            'purchases': document.querySelector('a[href="purchases.html"]'),
            'sales': document.querySelector('a[href="sales.html"]'),
            'reports': document.querySelector('a[href="reports.html"]'),
            'expenses': document.getElementById('expensesLink') || document.querySelector('a[href="expenses.html"]'),
            'receipts': document.getElementById('receiptsLink') || document.querySelector('a[href="receipts.html"]'),
            'invoices': document.getElementById('invoicesLink') || document.querySelector('a[href="invoices.html"]'),
            'suppliers': document.getElementById('suppliersLink') || document.querySelector('a[href="suppliers.html"]'),
            'categories': document.getElementById('categoriesLink') || document.querySelector('a[href="categories.html"]'),
            'customers': document.getElementById('customersLink') || document.querySelector('a[href="customers.html"]'),
            'installment-payments': document.getElementById('installmentPaymentsLink') || document.querySelector('a[href="installment-payments.html"]'),
            'users': document.getElementById('usersLink') || document.querySelector('a[href="users.html"]'),
            'shops': document.getElementById('shopsLink') || document.querySelector('a[href="shops.html"]'),
            'shop-statistics': document.getElementById('shopStatsLink') || document.querySelector('a[href="shop-statistics.html"]'),
            'subscription-plans': document.getElementById('subscriptionPlansLink') || document.querySelector('a[href="subscription-plans.html"]')
        };
        
        // For superadmin, show all pages regardless of permissions
        const isSuperadmin = userRole === 'superadmin';
        
        Object.keys(pageLinks).forEach(page => {
            const link = pageLinks[page];
            if (link) {
                // Subscription plans, shops, and shop-statistics are superadmin only
                if (page === 'subscription-plans' || page === 'shops' || page === 'shop-statistics') {
                    link.style.display = isSuperadmin ? 'inline-block' : 'none';
                } else if (isSuperadmin || permissions[page]) {
                    link.style.display = 'inline-block';
                } else {
                    link.style.display = 'none';
                }
            }
        });
        
        const currentPage = getCurrentPageName();
        if (currentPage && !isSuperadmin && !permissions[currentPage] && currentPage !== 'index') {
            showNotification('You do not have permission to access this page', 'error');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Error loading role permissions:', error);
        // Fallback: show all pages for superadmin
        const isSuperadmin = userRole === 'superadmin';
        if (isSuperadmin) {
            // Show all links for superadmin
            document.querySelectorAll('.nav-link').forEach(link => {
                link.style.display = 'inline-block';
            });
        } else {
            // Fallback: show basic pages for admin
            const usersLink = document.getElementById('usersLink') || document.querySelector('a[href="users.html"]');
            if (usersLink && userRole === 'admin') {
                usersLink.style.display = 'inline-block';
            }
        }
    }
}

function getCurrentPageName() {
    const path = window.location.pathname;
    if (path.includes('dashboard.html')) return 'dashboard';
    if (path.includes('inventory-items.html')) return 'inventory-items';
    if (path.includes('inventory-operations.html')) return 'inventory-operations';
    if (path.includes('goods-prices.html')) return 'goods-prices';
    if (path.includes('stock-manage.html')) return 'stock-manage';
    if (path.includes('goods-barcodes.html')) return 'goods-barcodes';
    if (path.includes('purchases.html')) return 'purchases';
    if (path.includes('sales.html')) return 'sales';
    if (path.includes('reports.html')) return 'reports';
    if (path.includes('expenses.html')) return 'expenses';
    if (path.includes('receipts.html')) return 'receipts';
    if (path.includes('invoices.html')) return 'invoices';
    if (path.includes('suppliers.html')) return 'suppliers';
    if (path.includes('categories.html')) return 'categories';
    if (path.includes('customers.html')) return 'customers';
    if (path.includes('installment-payments.html')) return 'installment-payments';
    if (path.includes('users.html')) return 'users';
    if (path.includes('shops.html')) return 'shops';
    if (path.includes('shop-statistics.html')) return 'shop-statistics';
    if (path.includes('subscription-plans.html')) return 'subscription-plans';
    if (path.includes('index.html') || path === '/') return 'index';
    return null;
}
