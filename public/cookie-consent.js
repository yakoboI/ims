// Cookie Consent and Management System
// Provides GDPR-compliant cookie consent and management

const CookieConsent = {
    // Cookie categories
    categories: {
        necessary: {
            name: 'Necessary Cookies',
            description: 'Essential cookies required for the website to function properly. These cannot be disabled.',
            required: true,
            cookies: ['authToken', 'currentUser', 'refreshToken', 'selectedShopId']
        },
        analytics: {
            name: 'Analytics Cookies',
            description: 'Help us understand how visitors interact with our website by collecting and reporting information anonymously.',
            required: false,
            cookies: ['analytics_session', 'analytics_user_id']
        },
        preferences: {
            name: 'Preference Cookies',
            description: 'Remember your preferences and settings to provide a personalized experience.',
            required: false,
            cookies: ['theme', 'language', 'items_per_page', 'print_paper_size']
        },
        marketing: {
            name: 'Marketing Cookies',
            description: 'Used to track visitors across websites for marketing purposes.',
            required: false,
            cookies: []
        }
    },
    
    // Initialize cookie consent
    init() {
        // Check if consent has been given
        const consent = this.getConsent();
        
        if (!consent) {
            this.showConsentBanner();
        } else {
            this.applyConsent(consent);
        }
        
        // Add cookie settings button to footer if consent exists
        if (consent) {
            this.addSettingsButton();
        }
    },
    
    // Show consent banner
    showConsentBanner() {
        // Remove existing banner if any
        const existingBanner = document.getElementById('cookieConsentBanner');
        if (existingBanner) {
            existingBanner.remove();
        }
        
        const banner = document.createElement('div');
        banner.id = 'cookieConsentBanner';
        banner.className = 'cookie-consent-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-labelledby', 'cookieConsentTitle');
        banner.setAttribute('aria-modal', 'true');
        
        banner.innerHTML = `
            <div class="cookie-consent-content">
                <div class="cookie-consent-header">
                    <h3 id="cookieConsentTitle">Cookie Consent</h3>
                    <p>We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. By clicking "Accept All", you consent to our use of cookies.</p>
                </div>
                <div class="cookie-consent-actions">
                    <button class="btn btn-secondary" onclick="CookieConsent.showSettings()" aria-label="Customize cookie preferences">
                        <i class="fas fa-cog"></i> Customize
                    </button>
                    <button class="btn btn-primary" onclick="CookieConsent.acceptAll()" aria-label="Accept all cookies">
                        Accept All
                    </button>
                    <button class="btn btn-danger" onclick="CookieConsent.rejectOptional()" aria-label="Reject optional cookies">
                        Reject Optional
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Focus management for accessibility
        const firstButton = banner.querySelector('button');
        if (firstButton) {
            setTimeout(() => firstButton.focus(), 100);
        }
        
        // Prevent body scroll when banner is visible
        document.body.style.overflow = 'hidden';
    },
    
    // Show cookie settings modal
    showSettings() {
        const existingModal = document.getElementById('cookieSettingsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const consent = this.getConsent();
        
        const modal = document.createElement('div');
        modal.id = 'cookieSettingsModal';
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'cookieSettingsTitle');
        modal.setAttribute('aria-modal', 'true');
        
        let categoriesHTML = '';
        for (const [key, category] of Object.entries(this.categories)) {
            categoriesHTML += `
                <div class="cookie-category">
                    <div class="cookie-category-header">
                        <label class="cookie-category-label">
                            <input type="checkbox" 
                                   id="cookie_${key}" 
                                   ${category.required ? 'checked disabled' : (consent && consent[key] ? 'checked' : '')}
                                   ${category.required ? 'aria-label="Required cookie category"' : ''}
                                   onchange="CookieConsent.updateCategory('${key}', this.checked)">
                            <span class="cookie-category-name">${category.name}</span>
                            ${category.required ? '<span class="badge badge-info">Required</span>' : ''}
                        </label>
                    </div>
                    <p class="cookie-category-description">${category.description}</p>
                    ${category.cookies.length > 0 ? `
                        <details class="cookie-details">
                            <summary>View cookies in this category</summary>
                            <ul class="cookie-list">
                                ${category.cookies.map(cookie => `<li>${cookie}</li>`).join('')}
                            </ul>
                        </details>
                    ` : ''}
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 id="cookieSettingsTitle">Cookie Settings</h2>
                    <button class="close" onclick="CookieConsent.closeSettings()" aria-label="Close cookie settings">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Manage your cookie preferences. You can enable or disable different types of cookies below.</p>
                    <div class="cookie-categories">
                        ${categoriesHTML}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="CookieConsent.rejectOptional()">
                        Reject Optional
                    </button>
                    <button class="btn btn-primary" onclick="CookieConsent.saveSettings()">
                        Save Preferences
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.openModal(modal);
        
        // Focus first focusable element
        const firstInput = modal.querySelector('input[type="checkbox"]:not([disabled])');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    },
    
    // Update category preference
    updateCategory(key, enabled) {
        // Cannot disable required categories
        if (this.categories[key].required) {
            return;
        }
        
        const consent = this.getConsent() || {};
        consent[key] = enabled;
        this.saveConsent(consent);
    },
    
    // Accept all cookies
    acceptAll() {
        const consent = {};
        for (const key in this.categories) {
            consent[key] = true;
        }
        this.saveConsent(consent);
        this.applyConsent(consent);
        this.hideBanner();
        this.addSettingsButton();
    },
    
    // Reject optional cookies
    rejectOptional() {
        const consent = {};
        for (const key in this.categories) {
            consent[key] = this.categories[key].required;
        }
        this.saveConsent(consent);
        this.applyConsent(consent);
        this.hideBanner();
        this.closeSettings();
        this.addSettingsButton();
    },
    
    // Save settings from modal
    saveSettings() {
        const consent = {};
        for (const key in this.categories) {
            const checkbox = document.getElementById(`cookie_${key}`);
            consent[key] = checkbox ? checkbox.checked : this.categories[key].required;
        }
        this.saveConsent(consent);
        this.applyConsent(consent);
        this.closeSettings();
        this.hideBanner();
        this.addSettingsButton();
        showNotification('Cookie preferences saved', 'success');
    },
    
    // Close settings modal
    closeSettings() {
        const modal = document.getElementById('cookieSettingsModal');
        if (modal) {
            this.closeModal(modal);
            modal.remove();
        }
    },
    
    // Hide consent banner
    hideBanner() {
        const banner = document.getElementById('cookieConsentBanner');
        if (banner) {
            banner.remove();
        }
        document.body.style.overflow = '';
    },
    
    // Apply consent preferences
    applyConsent(consent) {
        // Enable/disable analytics based on consent
        if (!consent.analytics) {
            this.disableAnalytics();
        } else {
            this.enableAnalytics();
        }
        
        // Enable/disable marketing based on consent
        if (!consent.marketing) {
            this.disableMarketing();
        } else {
            this.enableMarketing();
        }
    },
    
    // Get consent from storage
    getConsent() {
        try {
            const consent = localStorage.getItem('cookieConsent');
            return consent ? JSON.parse(consent) : null;
        } catch (e) {
            return null;
        }
    },
    
    // Save consent to storage
    saveConsent(consent) {
        try {
            localStorage.setItem('cookieConsent', JSON.stringify(consent));
            localStorage.setItem('cookieConsentDate', new Date().toISOString());
        } catch (e) {
            console.error('Error saving cookie consent:', e);
        }
    },
    
    // Add settings button to page
    addSettingsButton() {
        // Remove existing button if any
        const existing = document.getElementById('cookieSettingsButton');
        if (existing) {
            existing.remove();
        }
        
        const button = document.createElement('button');
        button.id = 'cookieSettingsButton';
        button.className = 'cookie-settings-button';
        button.setAttribute('aria-label', 'Open cookie settings');
        button.innerHTML = '<i class="fas fa-cookie-bite"></i>';
        button.onclick = () => this.showSettings();
        
        document.body.appendChild(button);
    },
    
    // Enable analytics
    enableAnalytics() {
        // Initialize analytics if needed
        if (window.gtag) {
            window.gtag('consent', 'update', {
                'analytics_storage': 'granted'
            });
        }
    },
    
    // Disable analytics
    disableAnalytics() {
        // Disable analytics tracking
        if (window.gtag) {
            window.gtag('consent', 'update', {
                'analytics_storage': 'denied'
            });
        }
    },
    
    // Enable marketing
    enableMarketing() {
        if (window.gtag) {
            window.gtag('consent', 'update', {
                'ad_storage': 'granted'
            });
        }
    },
    
    // Disable marketing
    disableMarketing() {
        if (window.gtag) {
            window.gtag('consent', 'update', {
                'ad_storage': 'denied'
            });
        }
    },
    
    // Open modal helper
    openModal(modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus trap
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        modal.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
            if (e.key === 'Escape') {
                CookieConsent.closeSettings();
            }
        });
        
        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                CookieConsent.closeSettings();
            }
        });
    },
    
    // Close modal helper
    closeModal(modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    },
    
    // Get cookie information for privacy policy
    getCookieInfo() {
        return {
            categories: this.categories,
            consent: this.getConsent(),
            consentDate: localStorage.getItem('cookieConsentDate')
        };
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CookieConsent.init());
} else {
    CookieConsent.init();
}

// Expose to global scope
window.CookieConsent = CookieConsent;

