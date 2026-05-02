/**
 * Extensive Manager - Ultimate Security Guard V4.2
 * CSRF Protection & Token Refresh Interceptors Enabled
 */

(function() {
    'use strict';

    console.log("%c 🛡️ SYSTEM SECURED: Anti-CSRF & Refresh Interceptors Active ", "background: #10B981; color: white; font-size: 14px; font-weight: bold; padding: 6px; border-radius: 6px;");

    // Global fetch override for CSRF and Automatic Token Refresh
    const originalFetch = window.fetch;
    let isRefreshing = false;
    let refreshQueue = [];

    window.fetch = async (...args) => {
        let [resource, config] = args;
        config = config || {};
        
        // 1. Attach CSRF Token for state-changing requests
        if (config.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method.toUpperCase())) {
            const xsrfMatch = document.cookie.match(new RegExp('(^| )xsrf-token=([^;]+)'));
            if (xsrfMatch) {
                config.headers = config.headers || {};
                if (config.headers instanceof Headers) {
                    config.headers.set('X-XSRF-TOKEN', decodeURIComponent(xsrfMatch[2]));
                } else {
                    config.headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[2]);
                }
            }
        }
        
        let response = await originalFetch(resource, config);
        
        // 2. Intercept 401 Unauthorized for Transparent Token Refresh
        if (response.status === 401 && typeof resource === 'string' && !resource.includes('/login') && !resource.includes('/api/auth/refresh')) {
            if (window.location.pathname.includes('scan')) {
                return response;
            }
            if (isRefreshing) {
                return new Promise((resolve) => {
                    refreshQueue.push(() => resolve(window.fetch(resource, config)));
                });
            }
            
            isRefreshing = true;
            try {
                // Prepare refresh request with CSRF
                const refreshConfig = { method: 'POST', headers: {} };
                const xsrfMatch = document.cookie.match(new RegExp('(^| )xsrf-token=([^;]+)'));
                if (xsrfMatch) {
                    refreshConfig.headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[2]);
                }

                const refreshRes = await originalFetch('/api/auth/refresh', refreshConfig);
                if (refreshRes.ok) {
                    // Refresh successful, retry original request and flush queue
                    refreshQueue.forEach(cb => cb());
                    refreshQueue = [];
                    // Note: CSRF token might have changed, but window.fetch recursion will grab the new one
                    response = await originalFetch(resource, config);
                } else {
                    // Refresh failed, force redirect to login
                    refreshQueue = [];
                    if (!window.location.pathname.includes('scan')) {
                        window.location.href = '/';
                    }
                }
            } catch (e) {
                refreshQueue = [];
            } finally {
                isRefreshing = false;
            }
        }
        
        return response;
    };
})();
