// SEO Utilities
// Provides structured data, meta tag management, and SEO enhancements

const SEOUtils = {
    // Initialize SEO features
    init() {
        this.addStructuredData();
        this.enhanceMetaTags();
        this.setupCanonicalLinks();
    },
    
    // Add structured data (JSON-LD)
    addStructuredData() {
        // Remove existing structured data
        const existing = document.querySelectorAll('script[type="application/ld+json"]');
        existing.forEach(script => {
            if (script.id !== 'seo-structured-data') {
                script.remove();
            }
        });
        
        const pageType = this.detectPageType();
        const structuredData = this.generateStructuredData(pageType);
        
        if (structuredData) {
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.id = 'seo-structured-data';
            script.textContent = JSON.stringify(structuredData);
            document.head.appendChild(script);
        }
    },
    
    // Detect page type
    detectPageType() {
        const path = window.location.pathname;
        const title = document.title.toLowerCase();
        
        if (path === '/' || path.includes('index.html') || path.includes('login')) {
            return 'login';
        } else if (path.includes('dashboard')) {
            return 'dashboard';
        } else if (path.includes('inventory')) {
            return 'inventory';
        } else if (path.includes('sales')) {
            return 'sales';
        } else if (path.includes('purchases')) {
            return 'purchases';
        } else if (path.includes('reports')) {
            return 'reports';
        } else if (path.includes('settings')) {
            return 'settings';
        } else {
            return 'webpage';
        }
    },
    
    // Generate structured data based on page type
    generateStructuredData(pageType) {
        const baseUrl = window.location.origin;
        const currentUrl = window.location.href;
        const title = document.title;
        const description = document.querySelector('meta[name="description"]')?.content || 
                          'Inventory Management System for tracking stock, sales, and purchases';
        
        const baseData = {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            'name': 'Inventory Management System',
            'alternateName': 'IMS',
            'url': baseUrl,
            'description': description,
            'applicationCategory': 'BusinessApplication',
            'operatingSystem': 'Web',
            'offers': {
                '@type': 'Offer',
                'price': '0',
                'priceCurrency': 'TZS'
            },
            'featureList': [
                'Inventory Management',
                'Sales Tracking',
                'Purchase Management',
                'Stock Management',
                'Reporting and Analytics',
                'Multi-shop Support',
                'Barcode Scanning',
                'Invoice Generation'
            ]
        };
        
        switch (pageType) {
            case 'login':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    'name': title,
                    'description': description,
                    'url': currentUrl
                };
            
            case 'dashboard':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'Dashboard',
                    'name': title,
                    'description': description,
                    'url': currentUrl,
                    'isPartOf': baseData
                };
            
            case 'inventory':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    'name': 'Inventory Management',
                    'description': 'Manage and track inventory items, stock levels, and product information',
                    'url': currentUrl,
                    'applicationCategory': 'BusinessApplication',
                    'operatingSystem': 'Web',
                    'isPartOf': baseData
                };
            
            case 'sales':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    'name': 'Sales Management',
                    'description': 'Process sales transactions, generate receipts, and track revenue',
                    'url': currentUrl,
                    'applicationCategory': 'BusinessApplication',
                    'operatingSystem': 'Web',
                    'isPartOf': baseData
                };
            
            default:
                return {
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    'name': title,
                    'description': description,
                    'url': currentUrl,
                    'isPartOf': baseData
                };
        }
    },
    
    // Enhance meta tags
    enhanceMetaTags() {
        // Ensure Open Graph tags
        if (!document.querySelector('meta[property="og:url"]')) {
            this.addMetaTag('property', 'og:url', window.location.href);
        }
        
        if (!document.querySelector('meta[property="og:image"]')) {
            // Add default OG image
            const ogImage = `${window.location.origin}/og-image.png`;
            this.addMetaTag('property', 'og:image', ogImage);
        }
        
        // Ensure Twitter Card tags
        if (!document.querySelector('meta[name="twitter:url"]')) {
            this.addMetaTag('name', 'twitter:url', window.location.href);
        }
        
        // Add viewport if missing
        if (!document.querySelector('meta[name="viewport"]')) {
            this.addMetaTag('name', 'viewport', 'width=device-width, initial-scale=1.0');
        }
        
        // Add language
        if (!document.querySelector('meta[http-equiv="content-language"]')) {
            const lang = document.documentElement.lang || 'en';
            this.addMetaTag('http-equiv', 'content-language', lang);
        }
    },
    
    // Add meta tag helper
    addMetaTag(attribute, value, content) {
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, value);
        meta.content = content;
        document.head.appendChild(meta);
    },
    
    // Setup canonical links
    setupCanonicalLinks() {
        // Remove existing canonical if any
        const existing = document.querySelector('link[rel="canonical"]');
        if (existing) {
            existing.remove();
        }
        
        // Add canonical link
        const canonical = document.createElement('link');
        canonical.rel = 'canonical';
        canonical.href = window.location.href.split('?')[0]; // Remove query params
        document.head.appendChild(canonical);
    },
    
    // Update page title and meta description
    updatePageMeta(title, description) {
        if (title) {
            document.title = title;
            this.updateMetaTag('property', 'og:title', title);
            this.updateMetaTag('name', 'twitter:title', title);
        }
        
        if (description) {
            this.updateMetaTag('name', 'description', description);
            this.updateMetaTag('property', 'og:description', description);
            this.updateMetaTag('name', 'twitter:description', description);
        }
    },
    
    // Update meta tag helper
    updateMetaTag(attribute, value, content) {
        let meta = document.querySelector(`meta[${attribute}="${value}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute(attribute, value);
            document.head.appendChild(meta);
        }
        meta.content = content;
    },
    
    // Generate breadcrumb structured data
    generateBreadcrumbs(items) {
        const breadcrumbList = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': items.map((item, index) => ({
                '@type': 'ListItem',
                'position': index + 1,
                'name': item.name,
                'item': item.url
            }))
        };
        
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'breadcrumb-structured-data';
        script.textContent = JSON.stringify(breadcrumbList);
        document.head.appendChild(script);
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SEOUtils.init());
} else {
    SEOUtils.init();
}

// Expose to global scope
window.SEOUtils = SEOUtils;

