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

function toggleMobileMenu() {
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const body = document.body;
    
    if (navbar) {
        navbar.classList.toggle('mobile-open');
        const isOpen = navbar.classList.contains('mobile-open');
        
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
        if (isOpen) {
            let overlay = document.getElementById('sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'sidebar-overlay';
                overlay.className = 'show';
                document.body.appendChild(overlay);
            } else {
                overlay.classList.add('show');
            }
        } else {
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) {
                overlay.classList.remove('show');
                setTimeout(() => {
                    if (overlay && !overlay.classList.contains('show')) {
                        overlay.remove();
                    }
                }, 300);
            }
        }
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (navbar && navbar.classList.contains('mobile-open')) {
        if (overlay && e.target === overlay) {
            toggleMobileMenu();
        } else if (menuToggle && !navbar.contains(e.target) && !menuToggle.contains(e.target)) {
            toggleMobileMenu();
        }
    }
});

// Close mobile menu on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const navbar = document.querySelector('.navbar');
        if (navbar && navbar.classList.contains('mobile-open')) {
            toggleMobileMenu();
        }
    }
});

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
