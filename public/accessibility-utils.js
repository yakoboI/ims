// Accessibility Utilities
// Provides ARIA enhancements, keyboard navigation, screen reader support, and accessibility features

const AccessibilityUtils = {
    // Initialize accessibility features
    init() {
        this.setupSkipLinks();
        this.setupKeyboardNavigation();
        this.setupFocusManagement();
        this.setupAriaLiveRegions();
        this.setupReducedMotion();
        this.setupHighContrast();
        this.announcePageLoad();
    },
    
    // Setup skip links for keyboard navigation
    setupSkipLinks() {
        // Skip link already exists in HTML, enhance it
        const skipLink = document.querySelector('.skip-link');
        if (skipLink) {
            skipLink.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(skipLink.getAttribute('href'));
                if (target) {
                    target.setAttribute('tabindex', '-1');
                    target.focus();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Remove tabindex after focus to prevent tabbing issues
                    setTimeout(() => target.removeAttribute('tabindex'), 1000);
                }
            });
        }
    },
    
    // Setup keyboard navigation enhancements
    setupKeyboardNavigation() {
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Alt + M: Focus main content
            if (e.altKey && e.key === 'm') {
                e.preventDefault();
                const main = document.querySelector('main, [role="main"]');
                if (main) {
                    main.focus();
                    main.scrollIntoView({ behavior: 'smooth' });
                }
            }
            
            // Alt + N: Focus navigation
            if (e.altKey && e.key === 'n') {
                e.preventDefault();
                const nav = document.querySelector('nav, [role="navigation"]');
                if (nav) {
                    const firstLink = nav.querySelector('a');
                    if (firstLink) firstLink.focus();
                }
            }
            
            // Alt + S: Focus search
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                const search = document.querySelector('input[type="search"], input[placeholder*="Search" i]');
                if (search) search.focus();
            }
        });
        
        // Enhance modal keyboard navigation
        this.enhanceModalAccessibility();
    },
    
    // Enhance modal accessibility
    enhanceModalAccessibility() {
        // This will be called when modals are opened
        document.addEventListener('modalOpened', (e) => {
            const modal = e.detail?.modal;
            if (modal) {
                this.trapFocus(modal);
            }
        });
    },
    
    // Focus trap for modals
    trapFocus(container) {
        const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // Focus first element
        firstElement.focus();
        
        // Trap focus
        container.addEventListener('keydown', function trapHandler(e) {
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
                const closeBtn = container.querySelector('.close, [aria-label*="close" i]');
                if (closeBtn) {
                    closeBtn.click();
                }
            }
        });
    },
    
    // Setup focus management
    setupFocusManagement() {
        // Add visible focus indicators
        const style = document.createElement('style');
        style.textContent = `
            *:focus-visible {
                outline: 3px solid var(--primary-color, #2563eb);
                outline-offset: 2px;
            }
            
            button:focus-visible,
            a:focus-visible,
            input:focus-visible,
            select:focus-visible,
            textarea:focus-visible {
                outline: 3px solid var(--primary-color, #2563eb);
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(style);
        
        // Announce focus changes for screen readers
        let lastFocusedElement = null;
        document.addEventListener('focusin', (e) => {
            const element = e.target;
            if (element !== lastFocusedElement) {
                // Add aria-label if missing for interactive elements
                if ((element.tagName === 'BUTTON' || element.tagName === 'A') && !element.getAttribute('aria-label') && !element.textContent.trim()) {
                    const icon = element.querySelector('i');
                    if (icon) {
                        const iconClass = icon.className;
                        let label = 'Button';
                        if (iconClass.includes('fa-save')) label = 'Save';
                        else if (iconClass.includes('fa-edit')) label = 'Edit';
                        else if (iconClass.includes('fa-trash')) label = 'Delete';
                        else if (iconClass.includes('fa-plus')) label = 'Add';
                        else if (iconClass.includes('fa-search')) label = 'Search';
                        else if (iconClass.includes('fa-filter')) label = 'Filter';
                        element.setAttribute('aria-label', label);
                    }
                }
                lastFocusedElement = element;
            }
        });
    },
    
    // Setup ARIA live regions for announcements
    setupAriaLiveRegions() {
        // Create polite live region
        let politeRegion = document.getElementById('aria-live-polite');
        if (!politeRegion) {
            politeRegion = document.createElement('div');
            politeRegion.id = 'aria-live-polite';
            politeRegion.setAttribute('role', 'status');
            politeRegion.setAttribute('aria-live', 'polite');
            politeRegion.setAttribute('aria-atomic', 'true');
            politeRegion.className = 'sr-only';
            document.body.appendChild(politeRegion);
        }
        
        // Create assertive live region
        let assertiveRegion = document.getElementById('aria-live-assertive');
        if (!assertiveRegion) {
            assertiveRegion = document.createElement('div');
            assertiveRegion.id = 'aria-live-assertive';
            assertiveRegion.setAttribute('role', 'alert');
            assertiveRegion.setAttribute('aria-live', 'assertive');
            assertiveRegion.setAttribute('aria-atomic', 'true');
            assertiveRegion.className = 'sr-only';
            document.body.appendChild(assertiveRegion);
        }
    },
    
    // Announce to screen readers
    announce(message, priority = 'polite') {
        const region = document.getElementById(`aria-live-${priority}`);
        if (region) {
            region.textContent = '';
            setTimeout(() => {
                region.textContent = message;
            }, 100);
        }
    },
    
    // Setup reduced motion support
    setupReducedMotion() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.documentElement.style.setProperty('--animation-duration', '0s');
            document.documentElement.style.setProperty('--transition-duration', '0s');
            
            // Disable animations
            const style = document.createElement('style');
            style.textContent = `
                *, *::before, *::after {
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-duration: 0s !important;
                    transition-delay: 0s !important;
                    scroll-behavior: auto !important;
                }
            `;
            document.head.appendChild(style);
        }
    },
    
    // Setup high contrast mode support
    setupHighContrast() {
        if (window.matchMedia('(prefers-contrast: high)').matches) {
            document.documentElement.classList.add('high-contrast');
            
            const style = document.createElement('style');
            style.textContent = `
                .high-contrast * {
                    border-width: 2px !important;
                }
                .high-contrast button,
                .high-contrast a {
                    border: 2px solid currentColor !important;
                }
            `;
            document.head.appendChild(style);
        }
    },
    
    // Announce page load
    announcePageLoad() {
        const pageTitle = document.title || 'Page';
        const mainHeading = document.querySelector('h1');
        const headingText = mainHeading ? mainHeading.textContent : '';
        
        setTimeout(() => {
            this.announce(`${pageTitle} loaded. ${headingText ? `Main heading: ${headingText}` : ''}`, 'polite');
        }, 500);
    },
    
    // Enhance table accessibility
    enhanceTable(table) {
        if (!table) return;
        
        // Add role if missing
        if (!table.getAttribute('role')) {
            table.setAttribute('role', 'table');
        }
        
        // Add aria-label if missing
        if (!table.getAttribute('aria-label') && !table.querySelector('caption')) {
            const heading = table.closest('section')?.querySelector('h1, h2, h3');
            if (heading) {
                table.setAttribute('aria-label', `${heading.textContent} table`);
            }
        }
        
        // Enhance headers
        const headers = table.querySelectorAll('th');
        headers.forEach((th, index) => {
            if (!th.getAttribute('scope')) {
                th.setAttribute('scope', 'col');
            }
            if (!th.id) {
                th.id = `header-${index}`;
            }
        });
        
        // Link cells to headers
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                const header = headers[index];
                if (header && !cell.getAttribute('headers')) {
                    cell.setAttribute('headers', header.id);
                }
            });
        });
    },
    
    // Enhance form accessibility
    enhanceForm(form) {
        if (!form) return;
        
        // Add aria-label if missing
        if (!form.getAttribute('aria-label') && !form.getAttribute('name')) {
            const heading = form.querySelector('h1, h2, h3') || 
                           form.closest('section')?.querySelector('h1, h2, h3');
            if (heading) {
                form.setAttribute('aria-label', `${heading.textContent} form`);
            }
        }
        
        // Enhance required fields
        const requiredFields = form.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (!field.getAttribute('aria-required')) {
                field.setAttribute('aria-required', 'true');
            }
        });
        
        // Add error announcements
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('invalid', () => {
                const errorMsg = input.validationMessage;
                if (errorMsg) {
                    this.announce(`Error: ${errorMsg}`, 'assertive');
                }
            });
        });
    },
    
    // Add loading announcement
    announceLoading(message = 'Loading content') {
        this.announce(message, 'polite');
    },
    
    // Add success announcement
    announceSuccess(message) {
        this.announce(`Success: ${message}`, 'polite');
    },
    
    // Add error announcement
    announceError(message) {
        this.announce(`Error: ${message}`, 'assertive');
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AccessibilityUtils.init());
} else {
    AccessibilityUtils.init();
}

// Enhance existing elements
document.addEventListener('DOMContentLoaded', () => {
    // Enhance all tables
    document.querySelectorAll('table').forEach(table => {
        AccessibilityUtils.enhanceTable(table);
    });
    
    // Enhance all forms
    document.querySelectorAll('form').forEach(form => {
        AccessibilityUtils.enhanceForm(form);
    });
});

// Expose to global scope
window.AccessibilityUtils = AccessibilityUtils;

// Override showNotification to use accessibility announcements
if (window.showNotification) {
    const originalShowNotification = window.showNotification;
    window.showNotification = function(message, type = 'info') {
        originalShowNotification(message, type);
        
        // Announce to screen readers
        if (type === 'error') {
            AccessibilityUtils.announceError(message);
        } else if (type === 'success') {
            AccessibilityUtils.announceSuccess(message);
        } else {
            AccessibilityUtils.announce(message, 'polite');
        }
    };
}

