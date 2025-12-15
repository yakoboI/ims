// Performance optimization utilities

// Debounce function for search inputs and filters
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for scroll/resize events
function throttle(func, limit = 100) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// API Request Cache
const apiCache = new Map();
const CACHE_DURATION = 60000; // 1 minute default

function getCachedRequest(key) {
    const cached = apiCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < cached.duration) {
        return cached.data;
    }
    apiCache.delete(key);
    return null;
}

function setCachedRequest(key, data, duration = CACHE_DURATION) {
    apiCache.set(key, {
        data: data,
        timestamp: Date.now(),
        duration: duration
    });
}

function clearCache(pattern = null) {
    if (pattern) {
        for (const [key] of apiCache) {
            if (key.includes(pattern)) {
                apiCache.delete(key);
            }
        }
    } else {
        apiCache.clear();
    }
}

// Optimized table rendering with requestAnimationFrame
function renderTableOptimized(renderFn, container) {
    if (!container) return;
    
    // Cancel any pending render
    if (container._renderTimeout) {
        cancelAnimationFrame(container._renderTimeout);
    }
    
    container._renderTimeout = requestAnimationFrame(() => {
        renderFn();
        container._renderTimeout = null;
    });
}

// Batch DOM updates
function batchDOMUpdates(updates) {
    const fragment = document.createDocumentFragment();
    updates.forEach(update => {
        if (typeof update === 'function') {
            update(fragment);
        }
    });
    return fragment;
}

// Lazy load images
function lazyLoadImage(img, src) {
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    img.src = src;
                    img.classList.add('loaded');
                    observer.unobserve(img);
                }
            });
        });
        observer.observe(img);
    } else {
        img.src = src;
    }
}

// Parallel API requests
async function parallelRequests(requests) {
    return Promise.all(requests.map(req => 
        typeof req === 'function' ? req() : req
    ));
}

// Expose to global scope
window.debounce = debounce;
window.throttle = throttle;
window.getCachedRequest = getCachedRequest;
window.setCachedRequest = setCachedRequest;
window.clearCache = clearCache;
window.renderTableOptimized = renderTableOptimized;
window.batchDOMUpdates = batchDOMUpdates;
window.lazyLoadImage = lazyLoadImage;
window.parallelRequests = parallelRequests;

