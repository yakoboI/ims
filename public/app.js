const API_BASE_URL = window.location.origin + '/api';

let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let refreshToken = localStorage.getItem('refreshToken');

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
        localStorage.setItem('authToken', authToken);
        
        if (data.user) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
        
        return authToken;
    } catch (error) {
        // Refresh failed - clear tokens and redirect to login
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('refreshToken');
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
    const url = API_BASE_URL + endpoint;
    const config = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
            ...(options.headers || {})
        }
    };

    // Handle body - stringify if it's an object, use as-is if it's already a string
    if (options.body !== undefined && options.body !== null) {
        if (typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        } else {
            config.body = options.body;
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
                    localStorage.setItem('refreshToken', refreshToken);
                }
                localStorage.setItem('authToken', authToken);
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                window.location.href = '/dashboard.html';
            } catch (error) {
                errorDiv.textContent = error.message || 'Login failed';
                errorDiv.classList.add('show');
            }
        });
    }

    if (currentUser) {
        const navUser = document.getElementById('navUser');
        if (navUser) {
            navUser.textContent = `${currentUser.full_name || currentUser.username} (${currentUser.role})`;
        }
        loadAndApplyRolePermissions(currentUser.role);
    }
});

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
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

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#d1fae5' : '#fee2e2'};
        color: ${type === 'success' ? '#065f46' : '#991b1b'};
        border-radius: 0;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Track last touch time to prevent double-firing
let lastTouchTime = 0;
const TOUCH_DELAY = 350;

// Track when menu was just toggled to prevent immediate close
let menuJustToggled = false;
let menuToggleTimeout = null;

function toggleMobileMenu(e) {
    console.log('toggleMobileMenu called');
    
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
    
    console.log('Navbar found, current classes:', navbar.className);
    
    navbar.classList.toggle('mobile-open');
    const isOpen = navbar.classList.contains('mobile-open');
    
    console.log('Menu toggled, isOpen:', isOpen, 'Navbar classes:', navbar.className);
    
    // Force the transform with inline style to ensure it works
    if (isOpen) {
        navbar.style.transform = 'translateX(0)';
        navbar.style.zIndex = '1001';
        console.log('Forcing navbar to show - transform set to translateX(0)');
    } else {
        navbar.style.transform = 'translateX(-100%)';
        console.log('Forcing navbar to hide - transform set to translateX(-100%)');
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
            console.log('Overlay created');
        }
        overlay.classList.add('show');
        overlay.style.zIndex = '1000';
        console.log('Overlay shown');
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
    
    // Log computed styles for debugging
    setTimeout(() => {
        const computedStyle = window.getComputedStyle(navbar);
        console.log('Navbar computed transform:', computedStyle.transform);
        console.log('Navbar computed z-index:', computedStyle.zIndex);
        console.log('Navbar computed display:', computedStyle.display);
    }, 50);
}

// Track when menu was just toggled to prevent immediate close
let menuJustToggled = false;
let menuToggleTimeout = null;

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

// Global function for mobile menu toggle (can be called from HTML onclick)
window.toggleMobileMenuHandler = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    toggleMobileMenu(e);
    return false;
};

// Setup mobile menu toggle event listeners
function setupMobileMenuToggle() {
    const menuToggles = document.querySelectorAll('.mobile-menu-toggle');
    
    if (menuToggles.length === 0) {
        console.warn('Mobile menu toggle button not found');
        return;
    }
    
    console.log('Setting up mobile menu toggle, found', menuToggles.length, 'button(s)');
    
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
        
        console.log('Event listeners added to menu toggle');
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

async function loadAndApplyRolePermissions(userRole) {
    try {
        const permissions = await apiRequest(`/role-permissions/${userRole}`);
        const pageLinks = {
            'dashboard': document.querySelector('a[href="dashboard.html"]'),
            'inventory': document.querySelector('a[href="inventory.html"]'),
            'purchases': document.querySelector('a[href="purchases.html"]'),
            'sales': document.querySelector('a[href="sales.html"]'),
            'reports': document.querySelector('a[href="reports.html"]'),
            'users': document.getElementById('usersLink')
        };
        
        Object.keys(pageLinks).forEach(page => {
            const link = pageLinks[page];
            if (link) {
                if (permissions[page]) {
                    link.style.display = 'inline-block';
                } else {
                    link.style.display = 'none';
                }
            }
        });
        
        const currentPage = getCurrentPageName();
        if (currentPage && !permissions[currentPage] && currentPage !== 'index') {
            showNotification('You do not have permission to access this page', 'error');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);
        }
    } catch (error) {
        const usersLink = document.getElementById('usersLink');
        if (usersLink && userRole === 'admin') {
            usersLink.style.display = 'inline-block';
        }
    }
}

function getCurrentPageName() {
    const path = window.location.pathname;
    if (path.includes('dashboard.html')) return 'dashboard';
    if (path.includes('inventory.html')) return 'inventory';
    if (path.includes('purchases.html')) return 'purchases';
    if (path.includes('sales.html')) return 'sales';
    if (path.includes('reports.html')) return 'reports';
    if (path.includes('users.html')) return 'users';
    if (path.includes('index.html') || path === '/') return 'index';
    return null;
}
