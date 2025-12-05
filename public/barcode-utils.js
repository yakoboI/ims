/**
 * Unified Barcode Utility
 * Centralized barcode scanning logic for all pages
 */

const BarcodeScanner = {
    // Configuration
    config: {
        minBarcodeLength: 3,
        maxBarcodeLength: 50,
        scannerTypingSpeed: 50, // milliseconds between characters
        manualInputDelay: 300, // milliseconds delay for manual input
        apiTimeout: 2000, // milliseconds
        enableSound: true, // Play sound on successful scan
        enableVibration: true // Vibrate on successful scan (mobile)
    },

    // Cache for barcode lookups
    barcodeCache: new Map(),
    cacheExpiry: 5 * 60 * 1000, // 5 minutes

    /**
     * Initialize barcode scanner on an input field
     * @param {HTMLInputElement} input - Input element for barcode scanning
     * @param {Function} onScanSuccess - Callback when barcode is successfully scanned
     * @param {Function} onScanError - Callback when barcode scan fails
     */
    init(input, onScanSuccess, onScanError) {
        if (!input) return;

        // Prevent duplicate initialization
        if (input.dataset.barcodeScannerInitialized === 'true') {
            return; // Already initialized
        }

        let lastBarcodeTime = 0;
        let scanTimeout = null;
        let scanInProgress = false;

        // Store handlers for cleanup if needed
        const focusHandler = () => {
            input.select();
        };

        // Handle barcode input
        const inputHandler = (e) => {
            if (scanInProgress) return;

            const barcode = e.target.value.trim();
            const currentTime = Date.now();
            const timeSinceLastChar = currentTime - lastBarcodeTime;
            const inputLength = barcode.length;

            // Clear previous timeout
            if (scanTimeout) {
                clearTimeout(scanTimeout);
            }

            // Detect barcode scanner (fast typing) vs manual input
            const isLikelyScanner = timeSinceLastChar < this.config.scannerTypingSpeed && inputLength > 5;
            const isCompleteBarcode = inputLength >= this.config.minBarcodeLength && 
                                     inputLength <= this.config.maxBarcodeLength;

            if (isLikelyScanner || isCompleteBarcode) {
                // Barcode scanner detected - process immediately
                scanTimeout = setTimeout(() => {
                    scanInProgress = true;
                    this.scanBarcode(barcode, onScanSuccess, onScanError).finally(() => {
                        scanInProgress = false;
                    });
                }, 20);
            } else if (inputLength >= this.config.minBarcodeLength) {
                // Manual input - wait for user to finish typing
                scanTimeout = setTimeout(() => {
                    if (e.target.value.trim() === barcode && !scanInProgress) {
                        scanInProgress = true;
                        this.scanBarcode(barcode, onScanSuccess, onScanError).finally(() => {
                            scanInProgress = false;
                        });
                    }
                }, this.config.manualInputDelay);
            }

            lastBarcodeTime = currentTime;
        };

        // Handle Enter key
        const keypressHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const barcode = e.target.value.trim();
                if (barcode.length >= this.config.minBarcodeLength && !scanInProgress) {
                    if (scanTimeout) clearTimeout(scanTimeout);
                    scanInProgress = true;
                    this.scanBarcode(barcode, onScanSuccess, onScanError).finally(() => {
                        scanInProgress = false;
                    });
                }
            }
        };

        // Attach event listeners
        input.addEventListener('focus', focusHandler);
        input.addEventListener('input', inputHandler);
        input.addEventListener('keypress', keypressHandler);

        // Mark as initialized
        input.dataset.barcodeScannerInitialized = 'true';
        
        // Store handlers on the input element for potential cleanup
        input._barcodeScannerHandlers = {
            focus: focusHandler,
            input: inputHandler,
            keypress: keypressHandler
        };
    },

    /**
     * Scan barcode and find item
     * @param {string} barcode - Barcode/SKU to scan
     * @param {Function} onSuccess - Success callback
     * @param {Function} onError - Error callback
     * @returns {Promise} - Promise that resolves with item or rejects with error
     */
    async scanBarcode(barcode, onSuccess, onError) {
        if (!barcode || barcode.length < this.config.minBarcodeLength) {
            const error = new Error('Barcode too short');
            if (onError) onError(error, barcode);
            return Promise.reject(error);
        }

        const barcodeLower = barcode.toLowerCase().trim();

        // Check cache first
        const cached = this.barcodeCache.get(barcodeLower);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            this.playSuccessFeedback();
            if (onSuccess) onSuccess(cached.item, barcode);
            return Promise.resolve(cached.item);
        }

        try {
            // Try with retry logic
            const item = await window.apiRequestWithRetry(
                `/items/barcode/${encodeURIComponent(barcode)}`,
                {},
                {
                    maxRetries: 2,
                    initialDelay: 500,
                    retryableErrors: ['NetworkError', 'TimeoutError', 'Failed to fetch']
                }
            );

            if (item && item.sku) {
                // Cache the result
                this.barcodeCache.set(barcodeLower, {
                    item: item,
                    timestamp: Date.now()
                });

                this.playSuccessFeedback();
                if (onSuccess) onSuccess(item, barcode);
                return item;
            } else {
                throw new Error('Item not found');
            }
        } catch (error) {
            // Log error
            if (window.ErrorLogger) {
                window.ErrorLogger.log(error, {
                    type: 'barcode_scan_error',
                    barcode: barcode
                });
            }

            if (onError) onError(error, barcode);
            throw error;
        }
    },

    /**
     * Play success feedback (sound/vibration)
     */
    playSuccessFeedback() {
        // Play beep sound
        if (this.config.enableSound) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.1);
            } catch (e) {
                // Silently fail if audio not supported
            }
        }

        // Vibrate on mobile
        if (this.config.enableVibration && navigator.vibrate) {
            navigator.vibrate(50);
        }
    },

    /**
     * Clear barcode cache
     */
    clearCache() {
        this.barcodeCache.clear();
    },

    /**
     * Invalidate cache for a specific barcode
     * @param {string} barcode - Barcode to invalidate
     */
    invalidateBarcode(barcode) {
        if (barcode) {
            this.barcodeCache.delete(barcode.toLowerCase().trim());
        }
    },

    /**
     * Get item from cache without API call
     * @param {string} barcode - Barcode to lookup
     * @returns {Object|null} - Cached item or null
     */
    getCachedItem(barcode) {
        const cached = this.barcodeCache.get(barcode.toLowerCase().trim());
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.item;
        }
        return null;
    }
};

// Make globally available
window.BarcodeScanner = BarcodeScanner;

