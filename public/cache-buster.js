/**
 * Cache Busting Utility
 * Automatically appends version/timestamp to CSS and JS files to force browser refresh
 */

(function() {
    'use strict';
    
    // Get version from version.json or use timestamp
    let version = Date.now();
    
    // Try to load version from version.json
    fetch('/version.json')
        .then(response => response.json())
        .then(data => {
            version = data.build || data.version || Date.now();
            applyCacheBusting(version);
        })
        .catch(() => {
            // If version.json doesn't exist, use timestamp
            applyCacheBusting(version);
        });
    
    function applyCacheBusting(version) {
        // Update all CSS links
        const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
        cssLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.includes('?v=') && !href.includes('?version=')) {
                const separator = href.includes('?') ? '&' : '?';
                link.setAttribute('href', href + separator + 'v=' + version);
            }
        });
        
        // Update all JS scripts (except this one and external scripts)
        const scripts = document.querySelectorAll('script[src]');
        scripts.forEach(script => {
            const src = script.getAttribute('src');
            // Skip external scripts (CDN) and this script
            if (src && 
                !src.startsWith('http') && 
                !src.startsWith('//') &&
                !src.includes('cache-buster.js') &&
                !src.includes('?v=') && 
                !src.includes('?version=')) {
                const separator = src.includes('?') ? '&' : '?';
                script.setAttribute('src', src + separator + 'v=' + version);
            }
        });
    }
})();

