/**
 * Browser Compatibility Polyfills and Feature Detection
 * Ensures compatibility with older browsers
 */

(function() {
    'use strict';

    // Polyfill for Array.includes (IE11)
    if (!Array.prototype.includes) {
        Array.prototype.includes = function(searchElement, fromIndex) {
            if (this == null) {
                throw new TypeError('"this" is null or not defined');
            }
            var o = Object(this);
            var len = parseInt(o.length) || 0;
            if (len === 0) {
                return false;
            }
            var n = parseInt(fromIndex) || 0;
            var k = n >= 0 ? n : Math.max(len + n, 0);
            function sameValueZero(x, y) {
                return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
            }
            for (; k < len; k++) {
                if (sameValueZero(o[k], searchElement)) {
                    return true;
                }
            }
            return false;
        };
    }

    // Polyfill for String.includes (IE11)
    if (!String.prototype.includes) {
        String.prototype.includes = function(search, start) {
            if (typeof start !== 'number') {
                start = 0;
            }
            if (start + search.length > this.length) {
                return false;
            } else {
                return this.indexOf(search, start) !== -1;
            }
        };
    }

    // Polyfill for Object.assign (IE11)
    if (typeof Object.assign !== 'function') {
        Object.assign = function(target) {
            if (target == null) {
                throw new TypeError('Cannot convert undefined or null to object');
            }
            var to = Object(target);
            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];
                if (nextSource != null) {
                    for (var nextKey in nextSource) {
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        };
    }

    // Polyfill for Promise (IE11)
    if (typeof Promise === 'undefined') {
        window.Promise = function(executor) {
            var self = this;
            self.state = 'pending';
            self.value = undefined;
            self.handlers = [];

            function resolve(result) {
                if (self.state === 'pending') {
                    self.state = 'fulfilled';
                    self.value = result;
                    self.handlers.forEach(handle);
                    self.handlers = null;
                }
            }

            function reject(error) {
                if (self.state === 'pending') {
                    self.state = 'rejected';
                    self.value = error;
                    self.handlers.forEach(handle);
                    self.handlers = null;
                }
            }

            function handle(handler) {
                if (self.state === 'pending') {
                    self.handlers.push(handler);
                } else {
                    if (self.state === 'fulfilled' && typeof handler.onFulfilled === 'function') {
                        handler.onFulfilled(self.value);
                    }
                    if (self.state === 'rejected' && typeof handler.onRejected === 'function') {
                        handler.onRejected(self.value);
                    }
                }
            }

            self.then = function(onFulfilled, onRejected) {
                return new Promise(function(resolve, reject) {
                    handle({
                        onFulfilled: function(result) {
                            try {
                                resolve(onFulfilled ? onFulfilled(result) : result);
                            } catch (ex) {
                                reject(ex);
                            }
                        },
                        onRejected: function(error) {
                            try {
                                resolve(onRejected ? onRejected(error) : reject(error));
                            } catch (ex) {
                                reject(ex);
                            }
                        }
                    });
                });
            };

            try {
                executor(resolve, reject);
            } catch (ex) {
                reject(ex);
            }
        };
    }

    // Polyfill for fetch API (IE11, older browsers)
    if (typeof window.fetch === 'undefined') {
        window.fetch = function(url, options) {
            return new Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open(options && options.method || 'GET', url);
                
                if (options && options.headers) {
                    Object.keys(options.headers).forEach(function(key) {
                        xhr.setRequestHeader(key, options.headers[key]);
                    });
                }

                xhr.onload = function() {
                    var response = {
                        ok: xhr.status >= 200 && xhr.status < 300,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        json: function() {
                            return Promise.resolve(JSON.parse(xhr.responseText));
                        },
                        text: function() {
                            return Promise.resolve(xhr.responseText);
                        },
                        headers: {
                            get: function(name) {
                                return xhr.getResponseHeader(name);
                            }
                        }
                    };
                    resolve(response);
                };

                xhr.onerror = function() {
                    reject(new Error('Network error'));
                };

                xhr.send(options && options.body || null);
            });
        };
    }

    // Feature detection and graceful degradation
    if (!document.querySelector) {
        console.warn('Browser does not support querySelector. Some features may not work.');
    }

    // CSS Custom Properties (CSS Variables) fallback for IE11
    if (!window.CSS || !CSS.supports || !CSS.supports('color', 'var(--fake-var)')) {
        // Add fallback styles for browsers that don't support CSS variables
        var style = document.createElement('style');
        style.textContent = `
            :root {
                --primary-color: #2563eb;
                --secondary-color: #64748b;
                --success-color: #10b981;
                --warning-color: #f59e0b;
                --danger-color: #ef4444;
            }
        `;
        document.head.appendChild(style);
    }

    // Console polyfill for older browsers
    if (!window.console) {
        window.console = {
            log: function() {},
            warn: function() {},
            error: function() {},
            info: function() {}
        };
    }

    // Add loading class for CSS animations
    document.documentElement.classList.add('js-enabled');

    // Browser detection for specific fixes
    var ua = navigator.userAgent.toLowerCase();
    var browser = {
        isIE: /msie|trident/.test(ua),
        isEdge: /edg/.test(ua) && !/edg[ea]/.test(ua), // Edge (not Edge Legacy)
        isChrome: /chrome/.test(ua) && !/edg/.test(ua) && !/opr/.test(ua) && !/brave/.test(ua) && !/samsungbrowser/.test(ua),
        isFirefox: /firefox/.test(ua),
        isSafari: /safari/.test(ua) && !/chrome/.test(ua) && !/edg/.test(ua) && !/opr/.test(ua),
        isOpera: /opera|opr/.test(ua),
        isBrave: /brave/.test(ua) || (typeof navigator.brave !== 'undefined'),
        isSamsungInternet: /samsungbrowser/.test(ua),
        isMobile: /mobile|android|iphone|ipad/.test(ua),
        isDesktop: !/mobile|android|iphone|ipad/.test(ua)
    };

    // Add browser class to html element for CSS targeting
    if (browser.isIE) {
        document.documentElement.classList.add('browser-ie');
    }
    if (browser.isEdge) {
        document.documentElement.classList.add('browser-edge');
    }
    if (browser.isChrome) {
        document.documentElement.classList.add('browser-chrome');
    }
    if (browser.isFirefox) {
        document.documentElement.classList.add('browser-firefox');
    }
    if (browser.isSafari) {
        document.documentElement.classList.add('browser-safari');
    }
    if (browser.isOpera) {
        document.documentElement.classList.add('browser-opera');
    }
    if (browser.isBrave) {
        document.documentElement.classList.add('browser-brave');
        // Brave is Chromium-based, so also add chrome class for compatibility
        document.documentElement.classList.add('browser-chrome');
    }
    if (browser.isSamsungInternet) {
        document.documentElement.classList.add('browser-samsung');
        // Samsung Internet is Chromium-based, so also add chrome class for compatibility
        document.documentElement.classList.add('browser-chrome');
    }
    if (browser.isMobile) {
        document.documentElement.classList.add('browser-mobile');
    }
    if (browser.isDesktop) {
        document.documentElement.classList.add('browser-desktop');
    }

    // Fix for CSS Grid in older browsers
    if (!CSS.supports('display', 'grid')) {
        // Add fallback for grid layouts
        var gridFallback = document.createElement('style');
        gridFallback.textContent = `
            .grid-fallback {
                display: -ms-grid;
                display: -webkit-box;
            }
        `;
        document.head.appendChild(gridFallback);
    }

    // Fix for Flexbox in older browsers
    if (!CSS.supports('display', 'flex')) {
        var flexFallback = document.createElement('style');
        flexFallback.textContent = `
            .flex-fallback {
                display: -webkit-box;
                display: -ms-flexbox;
            }
        `;
        document.head.appendChild(flexFallback);
    }

    // Fix for CSS Variables in IE11
    if (browser.isIE && !CSS.supports('color', 'var(--test)')) {
        // Polyfill for CSS variables would go here if needed
        // For now, we rely on fallback values in CSS
    }

    // Fix for viewport units in older browsers and mobile browsers
    // Samsung Internet and mobile browsers need this fix for proper viewport handling
    if (browser.isIE || browser.isMobile || browser.isSamsungInternet) {
        var viewportFix = document.createElement('script');
        viewportFix.textContent = `
            (function() {
                function setViewportHeight() {
                    var vh = window.innerHeight * 0.01;
                    document.documentElement.style.setProperty('--vh', vh + 'px');
                }
                setViewportHeight();
                window.addEventListener('resize', setViewportHeight);
                window.addEventListener('orientationchange', setViewportHeight);
            })();
        `;
        document.head.appendChild(viewportFix);
    }

    // Samsung Internet specific fixes
    if (browser.isSamsungInternet) {
        var samsungFix = document.createElement('style');
        samsungFix.textContent = `
            /* Samsung Internet specific fixes */
            .browser-samsung input[type="number"] {
                -webkit-appearance: textfield;
            }
            .browser-samsung input[type="number"]::-webkit-inner-spin-button,
            .browser-samsung input[type="number"]::-webkit-outer-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
        `;
        document.head.appendChild(samsungFix);
    }

    // Brave Browser specific fixes (if needed)
    if (browser.isBrave) {
        // Brave is Chromium-based, so most Chrome fixes apply
        // Add any Brave-specific fixes here if needed
    }

    // Fix for smooth scrolling in older browsers
    if (!CSS.supports('scroll-behavior', 'smooth')) {
        document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
            anchor.addEventListener('click', function(e) {
                var target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    // Export browser detection for use in other scripts
    window.browserInfo = browser;
})();

