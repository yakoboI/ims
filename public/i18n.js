// Internationalization (i18n) System
// Simple translation system for the IMS application

let currentLanguage = 'en';
let translations = {};
let translationCache = {};

// Load translation file
async function loadTranslations(lang = 'en') {
    try {
        // Check cache first
        if (translationCache[lang]) {
            translations = translationCache[lang];
            currentLanguage = lang;
            return translations;
        }
        
        // Load translation file
        const response = await fetch(`/locales/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Translation file not found for language: ${lang}`);
        }
        
        const data = await response.json();
        translations = data;
        translationCache[lang] = data;
        currentLanguage = lang;
        
        return translations;
    } catch (error) {
        console.error('Error loading translations:', error);
        // Fallback to English if translation file not found
        if (lang !== 'en') {
            console.warn(`Falling back to English. Translation file for ${lang} not found.`);
            return await loadTranslations('en');
        }
        // Return empty object if even English fails
        return {};
    }
}

// Translate a key (supports nested keys like "nav.dashboard")
function t(key, params = {}) {
    if (!key) return '';
    
    const keys = key.split('.');
    let value = translations;
    
    // Navigate through nested object
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Key not found - check if translations are loaded
            // Only warn if translations are loaded but key is missing
            if (Object.keys(translations).length > 0) {
                console.warn(`Translation key not found: ${key}`);
            }
            // Return the key itself (will be used as fallback)
            return key;
        }
    }
    
    // If value is a string, replace parameters
    if (typeof value === 'string') {
        // Replace {param} placeholders
        return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
            return params[paramKey] !== undefined ? params[paramKey] : match;
        });
    }
    
    return value || key;
}

// Get current language
function getCurrentLanguage() {
    return currentLanguage;
}

// Set language and reload translations
async function setLanguage(lang) {
    if (lang === currentLanguage && Object.keys(translations).length > 0) {
        return; // Already loaded
    }
    
    await loadTranslations(lang);
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
    
    // Dispatch event for components to react to language change
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    
    // Trigger page translation
    translatePage();
}

// Translate the entire page
function translatePage() {
    // Translate elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translated = t(key);
        
        if (element.tagName === 'INPUT' && (element.type === 'submit' || element.type === 'button')) {
            element.value = translated;
        } else if (element.tagName === 'BUTTON' || element.tagName === 'A') {
            // Preserve icon if it exists
            const icon = element.querySelector('i');
            if (icon) {
                element.innerHTML = icon.outerHTML + ' ' + translated;
            } else {
                element.textContent = translated;
            }
        } else if (element.tagName === 'INPUT' && element.type !== 'submit' && element.type !== 'button') {
            element.placeholder = translated;
        } else if (element.tagName === 'LABEL') {
            element.textContent = translated;
        } else {
            element.textContent = translated;
        }
    });
    
    // Translate elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = t(key);
    });
    
    // Translate elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = t(key);
    });
    
    // Translate navigation links automatically
    translateNavigation();
    
    // Translate common UI elements
    translateCommonElements();
}

// Translate navigation menu
function translateNavigation() {
    const navMap = {
        'dashboard.html': 'nav.dashboard',
        'inventory-items.html': 'nav.inventoryItems',
        'stock-manage.html': 'nav.stockManage',
        'inventory-operations.html': 'nav.inventoryOperations',
        'goods-prices.html': 'nav.goodsPrices',
        'goods-barcodes.html': 'nav.goodsBarcodes',
        'purchases.html': 'nav.purchases',
        'sales.html': 'nav.sales',
        'invoices.html': 'nav.invoices',
        'receipts.html': 'nav.receipts',
        'expenses.html': 'nav.expenses',
        'reports.html': 'nav.reports',
        'categories.html': 'nav.categories',
        'suppliers.html': 'nav.suppliers',
        'customers.html': 'nav.customers',
        'installment-payments.html': 'nav.installmentPayments',
        'settings.html': 'nav.settings',
        'users.html': 'nav.users',
        'shops.html': 'nav.shops',
        'shop-statistics.html': 'nav.shopStatistics',
        'subscription-plans.html': 'nav.subscriptionPlans'
    };
    
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const fileName = href.split('/').pop();
            const key = navMap[fileName];
            if (key) {
                const translated = t(key);
                const icon = link.querySelector('i');
                if (icon) {
                    link.innerHTML = icon.outerHTML + ' ' + translated;
                } else {
                    link.textContent = translated;
                }
            }
        }
    });
    
    // Translate logout button
    const logoutBtn = document.querySelector('button[onclick*="logout"]');
    if (logoutBtn && !logoutBtn.hasAttribute('data-i18n')) {
        const translated = t('nav.logout');
        const icon = logoutBtn.querySelector('i');
        if (icon) {
            logoutBtn.innerHTML = icon.outerHTML + ' ' + translated;
        } else {
            logoutBtn.textContent = translated;
        }
    }
}

// Translate common UI elements
function translateCommonElements() {
    // Translate page titles
    document.querySelectorAll('h1').forEach(h1 => {
        const text = h1.textContent.trim();
        const titleMap = {
            'Dashboard': 'dashboard.title',
            'Inventory Management': 'inventory.title',
            'Sales': 'sales.title',
            'Purchases': 'purchases.title',
            'Customers': 'customers.title',
            'Suppliers': 'suppliers.title',
            'Categories': 'categories.title',
            'Reports & Analytics': 'reports.title',
            'Expenses': 'expenses.title',
            'Receipts': 'receipts.title',
            'Invoices': 'invoices.title',
            'Users': 'users.title',
            'Settings': 'settings.title'
        };
        
        if (titleMap[text] && !h1.hasAttribute('data-i18n')) {
            h1.setAttribute('data-i18n', titleMap[text]);
            h1.textContent = t(titleMap[text]);
        }
    });
    
    // Translate buttons with common text
    document.querySelectorAll('button, .btn').forEach(btn => {
        const text = btn.textContent.trim();
        const btnMap = {
            'Save': 'common.save',
            'Cancel': 'common.cancel',
            'Delete': 'common.delete',
            'Edit': 'common.edit',
            'Add': 'common.add',
            'Search': 'common.search',
            'Filter': 'common.filter',
            'Clear': 'common.clear',
            'Close': 'common.close',
            'View': 'common.view',
            'Print': 'common.print',
            'Export': 'common.export',
            'Import': 'common.import',
            'Refresh': 'common.refresh',
            'Submit': 'common.submit',
            'Reset': 'common.reset',
            'Confirm': 'common.confirm',
            'Yes': 'common.yes',
            'No': 'common.no',
            'Login': 'login.login',
            'Logout': 'nav.logout'
        };
        
        if (btnMap[text] && !btn.hasAttribute('data-i18n') && btn.textContent.trim() === text) {
            btn.setAttribute('data-i18n', btnMap[text]);
            const icon = btn.querySelector('i');
            if (icon) {
                btn.innerHTML = icon.outerHTML + ' ' + t(btnMap[text]);
            } else {
                btn.textContent = t(btnMap[text]);
            }
        }
    });
    
    // Translate labels
    document.querySelectorAll('label').forEach(label => {
        const text = label.textContent.trim();
        const labelMap = {
            'Username': 'login.username',
            'Password': 'login.password',
            'Name': 'common.name',
            'Email': 'common.email',
            'Phone': 'common.phone',
            'Address': 'common.address',
            'Date': 'common.date',
            'Status': 'common.status',
            'Total': 'common.total',
            'Quantity': 'common.quantity',
            'Price': 'common.price',
            'Amount': 'common.amount'
        };
        
        if (labelMap[text] && !label.hasAttribute('data-i18n')) {
            label.setAttribute('data-i18n', labelMap[text]);
            label.textContent = t(labelMap[text]);
        }
    });
}

// Initialize i18n system
async function initI18n() {
    // Get language from localStorage or default to English
    const savedLanguage = localStorage.getItem('appLanguage') || 'en';
    await setLanguage(savedLanguage);
    
    // Listen for language changes
    window.addEventListener('languageChanged', () => {
        translatePage();
    });
}

// Expose to global scope
window.i18n = {
    t,
    setLanguage,
    getCurrentLanguage,
    loadTranslations,
    translatePage,
    initI18n
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
} else {
    initI18n();
}

