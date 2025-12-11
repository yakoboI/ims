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
})();

