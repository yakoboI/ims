let allItems = [];
let saleItems = [];
let barcodeScanTimeout = null;
let lastBarcodeTime = 0;
let barcodeScanInProgress = false;
let itemsCache = new Map();
let cameraStream = null;
let cameraCodeReader = null;
let cameraScanning = false;

document.addEventListener('DOMContentLoaded', async () => {
    await loadItems();
    await loadSales();
    setupEventListeners();
});

async function loadItems() {
    try {
        allItems = await apiRequest('/items');
        
        // Update items cache
        itemsCache.clear();
        allItems.forEach(item => {
            if (item.sku) {
                itemsCache.set(item.sku.toLowerCase(), item);
                
                // Also update barcode scanner cache
                if (window.BarcodeScanner) {
                    window.BarcodeScanner.barcodeCache.set(item.sku.toLowerCase(), {
                        item: item,
                        timestamp: Date.now()
                    });
                }
            }
        });
        
        const select = document.getElementById('saleItemSelect');
        if (select) {
            select.innerHTML = '<option value="">Select Item</option>' + 
                allItems.map(item => 
                    `<option value="${item.id}" data-price="${item.unit_price}" data-stock="${item.stock_quantity}">
                        ${item.name} (Stock: ${item.stock_quantity} ${item.unit || 'pcs'})
                    </option>`
                ).join('');
        }
    } catch (error) {
        if (window.ErrorLogger) {
            window.ErrorLogger.log(error, { type: 'load_items_error', page: 'sales' });
        }
    }
}

async function loadSales() {
    const tbody = document.getElementById('salesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 6);
    }
    if (tbody) tbody.innerHTML = '';
    
    try {
        const sales = await apiRequest('/sales');
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderSalesTable(sales);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading sales', 'error');
        renderSalesTable([]);
    }
}

function renderSalesTable(sales) {
    const tbody = document.getElementById('salesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (sales.length === 0) {
        tbody.innerHTML = '';
        showEmptyState(tableContainer, EmptyStates.sales);
        return;
    }

    hideEmptyState(tableContainer);
    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td data-label="Sale ID">#${sale.id}</td>
            <td data-label="Date">${formatDate(sale.sale_date)}</td>
            <td data-label="Customer">${sale.customer_name || 'Walk-in'}</td>
            <td data-label="Total Amount" class="col-amount numeric"><strong>${formatCurrency(sale.total_amount)}</strong></td>
            <td data-label="Created By">${sale.created_by_name || '-'}</td>
            <td data-label="Actions">
                <button class="btn btn-sm btn-secondary" onclick="viewSale(${sale.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('newSaleForm').addEventListener('submit', handleSaleSubmit);
    
    // Camera scan button event listeners - set up immediately and also when modal opens
    setupCameraButtonListeners();
    
    // Use unified barcode scanner
    const barcodeInput = document.getElementById('saleBarcodeInput');
    if (barcodeInput && window.BarcodeScanner) {
        window.BarcodeScanner.init(
            barcodeInput,
            (item, barcode) => {
                // Success - item found
                handleBarcodeScanSuccess(item, barcode);
            },
            (error, barcode) => {
                // Error - item not found
                showNotification(error.message || `Item not found with barcode: ${barcode}`, 'error');
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
        );
    }
    
    // Listen for product updates
    if (window.ProductFlow) {
        window.ProductFlow.onProductUpdate((data) => {
            if (data.type === 'product_invalidated') {
                // Reload items if barcode was invalidated
                if (data.barcode) {
                    loadItems();
                }
            }
        });
    }
}

function setupCameraButtonListeners() {
    // Camera scan button event listeners
    const cameraScanBtn = document.getElementById('cameraScanBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');
    
    if (cameraScanBtn) {
        // Remove any existing listeners by cloning the button
        const newBtn = cameraScanBtn.cloneNode(true);
        cameraScanBtn.parentNode.replaceChild(newBtn, cameraScanBtn);
        
        // Get the new button reference
        const btn = document.getElementById('cameraScanBtn');
        
        // Add multiple event types for better mobile compatibility
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Camera button clicked');
            startCameraScan().catch(error => {
                console.error('Camera scan error:', error);
            });
        }, { passive: false });
        
        // Also add touchstart for mobile devices
        btn.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Camera button touched');
            startCameraScan().catch(error => {
                console.error('Camera scan error:', error);
            });
        }, { passive: false });
    }
    
    if (stopCameraBtn) {
        // Remove any existing listeners by cloning the button
        const newStopBtn = stopCameraBtn.cloneNode(true);
        stopCameraBtn.parentNode.replaceChild(newStopBtn, stopCameraBtn);
        
        // Get the new button reference
        const stopBtn = document.getElementById('stopCameraBtn');
        
        stopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            stopCameraScan();
        }, { passive: false });
        
        stopBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            stopCameraScan();
        }, { passive: false });
    }
}

function openNewSaleModal() {
    saleItems = [];
    document.getElementById('saleItemsList').innerHTML = '';
    document.getElementById('saleTotal').textContent = '0.00';
    document.getElementById('newSaleForm').reset();
    
    // Stop camera if running
    if (cameraScanning) {
        stopCameraScan();
    }
    
    // Re-setup camera button listeners in case modal was recreated
    // Use multiple timeouts to ensure modal is fully rendered on Samsung devices
    setTimeout(() => {
        setupCameraButtonListeners();
    }, 100);
    
    setTimeout(() => {
        setupCameraButtonListeners();
    }, 300);
    
    setTimeout(() => {
        setupCameraButtonListeners();
    }, 500);
    
    const barcodeInput = document.getElementById('saleBarcodeInput');
    openModal('newSaleModal', barcodeInput);
    
    // Also setup after modal is fully opened
    setTimeout(() => {
        setupCameraButtonListeners();
    }, 700);
}

// Camera Barcode Scanning Functions
// Expose functions globally for onclick handlers
async function startCameraScan() {
    console.log('startCameraScan called');
    
    if (cameraScanning) {
        console.log('Camera already scanning');
        return; // Already scanning
    }
    
    const cameraBtn = document.getElementById('cameraScanBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    const cameraPreview = document.getElementById('cameraPreview');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraStatus = document.getElementById('cameraStatus');
    
    // Check if elements exist
    if (!cameraBtn || !cameraVideo || !cameraStatus) {
        console.error('Camera elements not found:', { cameraBtn, cameraVideo, cameraStatus });
        showNotification('Camera elements not found. Please refresh the page.', 'error');
        return;
    }
    
    try {
        console.log('Starting camera scan...');
        cameraStatus.textContent = 'Starting camera...';
        cameraStatus.style.color = 'var(--text-secondary)';
        cameraBtn.disabled = true;
        
        // Check if ZXing is available
        if (typeof ZXing === 'undefined' || !ZXing.BrowserMultiFormatReader) {
            throw new Error('Barcode scanning library not loaded. Please refresh the page.');
        }
        
        // Detect mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                        (window.innerWidth <= 768);
        
        // Request camera permission first by trying to get user media
        // This ensures we have permission before trying to use ZXing
        let testStream = null;
        let videoConstraints = {};
        
        if (isMobile) {
            // Mobile-specific constraints
            videoConstraints = {
                facingMode: { ideal: 'environment' }, // Prefer back camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            };
        } else {
            // Desktop constraints
            videoConstraints = {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            };
        }
        
        try {
            testStream = await navigator.mediaDevices.getUserMedia({ 
                video: videoConstraints
            });
            // Permission granted, stop the test stream immediately
            testStream.getTracks().forEach(track => track.stop());
        } catch (permError) {
            if (permError.name === 'NotAllowedError' || permError.name === 'PermissionDeniedError') {
                const mobileMsg = isMobile 
                    ? 'Camera access denied. Please allow camera access in your device settings and browser permissions, then try again.'
                    : 'Camera access denied. Please click the camera icon in your browser\'s address bar and allow camera access, then try again.';
                throw new Error(mobileMsg);
            } else if (permError.name === 'NotFoundError' || permError.name === 'DevicesNotFoundError') {
                throw new Error('No camera found. Please connect a camera device.');
            } else if (permError.name === 'OverconstrainedError' || permError.name === 'ConstraintNotSatisfiedError') {
                // Try with simpler constraints if advanced constraints fail
                try {
                    testStream = await navigator.mediaDevices.getUserMedia({ 
                        video: isMobile ? { facingMode: 'environment' } : true
                    });
                    testStream.getTracks().forEach(track => track.stop());
                } catch (retryError) {
                    throw permError; // Throw original error
                }
            } else {
                throw permError;
            }
        }
        
        // Initialize code reader
        const codeReader = new ZXing.BrowserMultiFormatReader();
        cameraCodeReader = codeReader;
        
        // Get available video devices
        let videoInputDevices = [];
        try {
            videoInputDevices = await codeReader.listVideoInputDevices();
        } catch (listError) {
            console.warn('Error listing video devices:', listError);
            // Continue with default device
        }
        
        // Select camera device
        let selectedDeviceId = null;
        if (videoInputDevices.length > 0) {
            // On mobile, prefer back camera (environment facing)
            if (isMobile) {
                const backCamera = videoInputDevices.find(device => 
                    device.label.toLowerCase().includes('back') || 
                    device.label.toLowerCase().includes('rear') ||
                    device.label.toLowerCase().includes('environment')
                );
                selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;
            } else {
                selectedDeviceId = videoInputDevices[0].deviceId;
            }
        } else {
            // No devices listed, use undefined to let browser choose default
            selectedDeviceId = undefined;
        }
        
        // Set up video element for mobile compatibility
        cameraVideo.setAttribute('playsinline', 'true');
        cameraVideo.setAttribute('webkit-playsinline', 'true');
        cameraVideo.setAttribute('x5-playsinline', 'true');
        cameraVideo.style.width = '100%';
        cameraVideo.style.maxWidth = '100%';
        cameraVideo.style.objectFit = 'cover';
        
        // Start decoding from video device
        cameraStatus.textContent = 'Camera active - Point at barcode';
        cameraStatus.style.color = 'var(--success-color)';
        cameraPreview.style.display = 'block';
        cameraBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        cameraScanning = true;
        
        // Decode from video device - use undefined deviceId on mobile if needed
        codeReader.decodeFromVideoDevice(selectedDeviceId, cameraVideo, (result, err) => {
            if (result) {
                // Barcode detected!
                const barcode = result.getText();
                console.log('Barcode scanned:', barcode);
                
                // Show success feedback
                cameraStatus.textContent = 'Barcode detected! Processing...';
                cameraStatus.style.color = 'var(--success-color)';
                
                // Stop camera scanning
                stopCameraScan();
                
                // Process the scanned barcode
                handleBarcodeScan(barcode).then(() => {
                    cameraStatus.textContent = 'Item added successfully!';
                    setTimeout(() => {
                        cameraStatus.textContent = '';
                    }, 2000);
                }).catch(error => {
                    console.error('Error processing scanned barcode:', error);
                    cameraStatus.textContent = 'Error: ' + (error.message || 'Failed to process barcode');
                    cameraStatus.style.color = 'var(--danger-color)';
                    setTimeout(() => {
                        cameraStatus.textContent = '';
                        cameraStatus.style.color = '';
                    }, 3000);
                });
            }
            
            if (err) {
                // NotFound is normal when no barcode is visible - don't log it
                if (err.name !== 'NotFoundException' && err.name !== 'NoQRCodeFoundException') {
                    console.error('Camera scan error:', err);
                }
            }
        }).catch(permissionError => {
            // Handle permission errors specifically
            console.error('Camera permission error:', permissionError);
            stopCameraScan();
            
            let errorMessage = 'Camera access denied. ';
            if (permissionError.name === 'NotAllowedError' || permissionError.message?.includes('Permission')) {
                errorMessage += 'Please allow camera access in your browser settings and try again.';
            } else {
                errorMessage += permissionError.message || 'Please check your browser settings.';
            }
            
            cameraStatus.textContent = errorMessage;
            cameraStatus.style.color = 'var(--danger-color)';
            cameraBtn.disabled = false;
            
            showNotification(errorMessage, 'error');
            
            // Reset UI after delay
            setTimeout(() => {
                cameraStatus.textContent = '';
                cameraStatus.style.color = '';
            }, 8000);
        });
        
    } catch (error) {
        console.error('Camera scan error:', error);
        
        let errorMessage = 'Failed to start camera. ';
        if (error.name === 'NotAllowedError' || error.message?.includes('Permission')) {
            errorMessage += 'Camera access was denied. Please allow camera access in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.message?.includes('No camera')) {
            errorMessage += 'No camera found. Please connect a camera device.';
        } else {
            errorMessage += error.message || 'Please check permissions and try again.';
        }
        
        cameraStatus.textContent = errorMessage;
        cameraStatus.style.color = 'var(--danger-color)';
        cameraBtn.disabled = false;
        
        showNotification(errorMessage, 'error');
        
        // Reset UI
        setTimeout(() => {
            cameraStatus.textContent = '';
            cameraStatus.style.color = '';
        }, 8000);
    }
}

function stopCameraScan() {
    if (!cameraScanning && !cameraCodeReader) {
        return;
    }
    
    const cameraBtn = document.getElementById('cameraScanBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    const cameraPreview = document.getElementById('cameraPreview');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraStatus = document.getElementById('cameraStatus');
    
    try {
        // Stop code reader
        if (cameraCodeReader) {
            cameraCodeReader.reset();
            cameraCodeReader = null;
        }
        
        // Stop video stream
        if (cameraVideo && cameraVideo.srcObject) {
            const stream = cameraVideo.srcObject;
            stream.getTracks().forEach(track => track.stop());
            cameraVideo.srcObject = null;
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        
        // Reset UI
        cameraScanning = false;
        cameraPreview.style.display = 'none';
        cameraBtn.style.display = 'inline-flex';
        cameraBtn.disabled = false;
        stopBtn.style.display = 'none';
        cameraStatus.textContent = '';
        cameraStatus.style.color = '';
    } catch (error) {
        console.error('Error stopping camera:', error);
    }
}

// Explicitly expose functions to global scope for inline onclick handlers
window.startCameraScan = startCameraScan;
window.stopCameraScan = stopCameraScan;

function handleBarcodeInput(e) {
    if (barcodeScanInProgress) return;
    
    const barcode = e.target.value.trim();
    const currentTime = Date.now();
    const timeSinceLastChar = currentTime - lastBarcodeTime;
    const inputLength = barcode.length;
    
    if (barcodeScanTimeout) {
        clearTimeout(barcodeScanTimeout);
    }
    
    const isLikelyScanner = timeSinceLastChar < 50 && inputLength > 5;
    const isCompleteBarcode = inputLength >= 8 && inputLength <= 20;
    
    if (isLikelyScanner || isCompleteBarcode) {
        barcodeScanTimeout = setTimeout(() => {
            handleBarcodeScan(barcode);
        }, 20);
    } else if (inputLength >= 3) {
        barcodeScanTimeout = setTimeout(() => {
            if (e.target.value.trim() === barcode) {
                handleBarcodeScan(barcode);
            }
        }, 300);
    }
    
    lastBarcodeTime = currentTime;
}

async function handleBarcodeScan(barcode) {
    if (!barcode || barcode.length < 1 || barcodeScanInProgress) return;
    
    barcodeScanInProgress = true;
    const barcodeInput = document.getElementById('saleBarcodeInput');
    
    try {
        // Use unified barcode scanner
        const item = await window.BarcodeScanner.scanBarcode(
            barcode,
            (item, scannedBarcode) => {
                // Success callback - item found
                handleBarcodeScanSuccess(item, scannedBarcode);
            },
            (error, scannedBarcode) => {
                // Error callback
                barcodeScanInProgress = false;
                showNotification(error.message || `Item not found with barcode: ${scannedBarcode}`, 'error');
                if (barcodeInput) {
                    barcodeInput.value = '';
                    setTimeout(() => barcodeInput.focus(), 50);
                }
            }
        );
    } catch (error) {
        barcodeScanInProgress = false;
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
    }
}

function handleBarcodeScanSuccess(item, barcode) {
    const barcodeInput = document.getElementById('saleBarcodeInput');
    barcodeScanInProgress = false;
    
    if (!item) {
        showNotification(`Item not found with barcode: ${barcode}`, 'error');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
        return;
    }
    
    // Update items cache
    if (item.sku) {
        itemsCache.set(item.sku.toLowerCase(), item);
    }
    
    if (item.stock_quantity <= 0) {
        showNotification(`${item.name} is out of stock`, 'error');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => barcodeInput.focus(), 50);
        }
        return;
    }
    
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 1;
    const existingIndex = saleItems.findIndex(si => si.item_id === item.id);
    
    if (existingIndex >= 0) {
        const newQty = saleItems[existingIndex].quantity + quantity;
        if (newQty > item.stock_quantity) {
            barcodeScanInProgress = false;
            showNotification(`Insufficient stock. Available: ${item.stock_quantity}`, 'error');
            if (barcodeInput) {
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
            return;
        }
        saleItems[existingIndex].quantity = newQty;
        saleItems[existingIndex].total_price = newQty * item.unit_price;
    } else {
        if (quantity > item.stock_quantity) {
            barcodeScanInProgress = false;
            showNotification(`Insufficient stock. Available: ${item.stock_quantity}`, 'error');
            if (barcodeInput) {
                barcodeInput.value = '';
                setTimeout(() => barcodeInput.focus(), 50);
            }
            return;
        }
        
        saleItems.push({
            item_id: item.id,
            item_name: item.name,
            quantity: quantity,
            unit_price: item.unit_price,
            total_price: quantity * item.unit_price
        });
    }
    
    requestAnimationFrame(() => {
        renderSaleItems();
        const itemSelect = document.getElementById('saleItemSelect');
        if (itemSelect) {
            itemSelect.value = item.id;
        }
        if (barcodeInput) {
            barcodeInput.value = '';
            requestAnimationFrame(() => {
                barcodeInput.focus();
                barcodeScanInProgress = false;
            });
        } else {
            barcodeScanInProgress = false;
        }
    });
}

// Make function globally available
window.handleBarcodeScanSuccess = handleBarcodeScanSuccess;

function closeNewSaleModal() {
    // Stop camera if running
    if (cameraScanning) {
        stopCameraScan();
    }
    closeModal('newSaleModal');
    saleItems = [];
}

function addSaleItem() {
    const itemSelect = document.getElementById('saleItemSelect');
    const quantityInput = document.getElementById('saleQuantity');
    
    const itemId = parseInt(itemSelect.value);
    const quantity = parseInt(quantityInput.value);
    
    if (!itemId || !quantity || quantity <= 0) {
        showNotification('Please select an item and enter a valid quantity', 'error');
        return;
    }
    
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    const unitPrice = parseFloat(selectedOption.dataset.price);
    const stock = parseInt(selectedOption.dataset.stock);
    
    if (quantity > stock) {
        showNotification(`Insufficient stock. Available: ${stock}`, 'error');
        return;
    }
    
    const existingIndex = saleItems.findIndex(item => item.item_id === itemId);
    if (existingIndex >= 0) {
        const newQty = saleItems[existingIndex].quantity + quantity;
        if (newQty > stock) {
            showNotification(`Insufficient stock. Available: ${stock}`, 'error');
            return;
        }
        saleItems[existingIndex].quantity = newQty;
        saleItems[existingIndex].total_price = newQty * unitPrice;
    } else {
        const item = allItems.find(i => i.id === itemId);
        saleItems.push({
            item_id: itemId,
            item_name: item.name,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: quantity * unitPrice
        });
    }
    
    renderSaleItems();
    itemSelect.value = '';
    quantityInput.value = '';
}

function removeSaleItem(index) {
    saleItems.splice(index, 1);
    renderSaleItems();
}

function renderSaleItems() {
    const tbody = document.getElementById('saleItemsList');
    const total = saleItems.reduce((sum, item) => sum + item.total_price, 0);
    
    if (saleItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No items added</td></tr>';
        document.getElementById('saleTotal').textContent = '0.00';
        return;
    }
    
    tbody.innerHTML = saleItems.map((item, index) => `
        <tr>
            <td>${item.item_name}</td>
            <td class="col-quantity numeric">${item.quantity}</td>
            <td class="col-price numeric">${formatCurrency(item.unit_price)}</td>
            <td class="col-total numeric">${formatCurrency(item.total_price)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeSaleItem(${index})">Remove</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('saleTotal').textContent = formatCurrency(total);
}

async function handleSaleSubmit(e) {
    e.preventDefault();
    
    if (saleItems.length === 0) {
        showNotification('Please add at least one item', 'error');
        return;
    }
    
    const saleData = {
        items: saleItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.unit_price
        })),
        customer_name: document.getElementById('customerName').value || null,
        notes: document.getElementById('saleNotes').value || null
    };
    
    try {
        const response = await apiRequest('/sales', {
            method: 'POST',
            body: saleData
        });
        
        showNotification('Sale recorded successfully');
        closeNewSaleModal();
        
        // Notify product flow of sale (affects stock)
        if (window.ProductFlow) {
            saleData.items.forEach(item => {
                window.ProductFlow.invalidateProduct(item.item_id);
            });
        }
        
        await loadSales();
        
        if (confirm('Sale completed successfully! Would you like to print the receipt?')) {
            printReceipt(response.id);
        }
    } catch (error) {
        showNotification(error.message || 'Error recording sale', 'error');
    }
}

async function viewSale(saleId) {
    try {
        const sale = await apiRequest(`/sales/${saleId}`);
        const items = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || '[]');
        
        const details = `
            <div class="sale-detail-header">
                <div class="sale-detail-title-row">
                    <h3>Sale Details</h3>
                    <button class="btn btn-primary" onclick="printReceipt(${sale.id})">🖨️ Print Receipt</button>
                </div>
                <p><strong>Sale ID:</strong> #${sale.id}</p>
                <p><strong>Date:</strong> ${formatDate(sale.sale_date)}</p>
                <p><strong>Customer:</strong> ${sale.customer_name || 'Walk-in'}</p>
                <p><strong>Created By:</strong> ${sale.created_by_name || '-'}</p>
                ${sale.notes ? `<p><strong>Notes:</strong> ${sale.notes}</p>` : ''}
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => {
                            const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                            const barcodeId = `viewItemBarcode${sale.id}-${index}`;
                            return `
                            <tr>
                                <td>
                                    ${item.item_name}
                                    <div style="margin-top: 5px;">
                                        <canvas id="${barcodeId}" data-barcode="${barcodeValue}" style="max-width: 120px; height: 35px;"></canvas>
                                    </div>
                                </td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.unit_price)}</td>
                                <td>${formatCurrency(item.total_price)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" class="text-right"><strong>Total:</strong></td>
                            <td class="col-total numeric"><strong>${formatCurrency(sale.total_amount)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        document.getElementById('saleDetails').innerHTML = details;
        openModal('viewSaleModal');
        
        // Render barcodes in the modal after it opens
        setTimeout(() => {
            if (window.JsBarcode) {
                items.forEach((item, index) => {
                    const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                    const barcodeId = `viewItemBarcode${sale.id}-${index}`;
                    const canvas = document.getElementById(barcodeId);
                    if (canvas) {
                        try {
                            JsBarcode(canvas, barcodeValue, {
                                format: "CODE128",
                                width: 1.5,
                                height: 30,
                                displayValue: true,
                                fontSize: 10,
                                margin: 2
                            });
                        } catch (error) {
                            console.error('Error rendering barcode:', error);
                        }
                    }
                });
            }
        }, 300);
    } catch (error) {
        showNotification(error.message || 'Error loading sale details', 'error');
    }
}

async function printReceipt(saleId) {
    try {
        const sale = await apiRequest(`/sales/${saleId}`);
        const items = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || '[]');
        const currentDate = new Date();
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt #${sale.id}</title>
                <style>
                    @media print {
                        @page {
                            size: A4;
                            margin: 1cm;
                        }
                        body {
                            margin: 0;
                            padding: 0;
                        }
                        .no-print {
                            display: none;
                        }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        color: #000;
                    }
                    .receipt-header {
                        text-align: center;
                        border-bottom: 3px solid #000;
                        padding-bottom: 20px;
                        margin-bottom: 25px;
                    }
                    .receipt-header h1 {
                        margin: 0 0 10px 0;
                        font-size: 26px;
                        font-weight: bold;
                        letter-spacing: 1px;
                    }
                    .receipt-header p {
                        margin: 8px 0;
                        font-size: 16px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .receipt-info {
                        margin-bottom: 20px;
                        line-height: 1.8;
                    }
                    .receipt-info p {
                        margin: 6px 0;
                        font-size: 14px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .receipt-info p strong {
                        min-width: 100px;
                        font-weight: 600;
                    }
                    .receipt-info p span {
                        text-align: right;
                        flex: 1;
                    }
                    .receipt-items {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    .receipt-items th {
                        background: #f0f0f0;
                        padding: 12px 8px;
                        text-align: left;
                        border-bottom: 2px solid #000;
                        font-size: 14px;
                        font-weight: bold;
                    }
                    .receipt-items td {
                        padding: 10px 8px;
                        border-bottom: 1px solid #ddd;
                        font-size: 14px;
                        vertical-align: top;
                    }
                    .item-barcode {
                        margin-top: 5px;
                        text-align: center;
                    }
                    .item-barcode canvas {
                        max-width: 120px;
                        height: 35px;
                    }
                    .receipt-items tfoot td {
                        border-top: 2px solid #000;
                        font-weight: bold;
                        padding: 12px 8px;
                        font-size: 16px;
                    }
                    .receipt-items {
                        table-layout: fixed;
                    }
                    .receipt-items th.col-item {
                        width: 45%;
                    }
                    .receipt-items th.col-qty {
                        width: 15%;
                    }
                    .receipt-items th.col-price {
                        width: 20%;
                    }
                    .receipt-items th.col-total {
                        width: 20%;
                    }
                    .receipt-items .col-qty,
                    .receipt-items .col-price,
                    .receipt-items .col-total {
                        text-align: right;
                        font-variant-numeric: tabular-nums;
                    }
                    .receipt-items .col-item {
                        text-align: left;
                    }
                    .receipt-items tbody tr:last-child td {
                        border-bottom: 2px solid #ddd;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .text-left {
                        text-align: left;
                    }
                    .receipt-footer {
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 2px solid #ddd;
                        text-align: center;
                        font-size: 13px;
                        color: #666;
                        line-height: 1.8;
                    }
                    .receipt-footer p {
                        margin: 8px 0;
                    }
                    .sale-notes {
                        margin-top: 15px;
                        padding: 10px;
                        background: #f9f9f9;
                        border-left: 3px solid #2563eb;
                        font-size: 13px;
                        line-height: 1.6;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .no-print {
                        text-align: center;
                        margin-top: 20px;
                    }
                    .no-print button {
                        padding: 10px 20px;
                        font-size: 16px;
                        background: #2563eb;
                        color: white;
                        border: none;
                        border-radius: 0;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="receipt-header">
                    <h1>INVENTORY MANAGEMENT SYSTEM</h1>
                    <p>Sales Receipt</p>
                    <div style="margin-top: 15px;">
                        <canvas id="receiptBarcode" style="max-width: 200px; height: 50px;"></canvas>
                    </div>
                </div>
                
                <div class="receipt-info">
                    <p><strong>Receipt #:</strong> <span>#${sale.id}</span></p>
                    <p><strong>Date:</strong> <span>${formatDate(sale.sale_date)}</span></p>
                    <p><strong>Customer:</strong> <span>${sale.customer_name || 'Walk-in Customer'}</span></p>
                    <p><strong>Cashier:</strong> <span>${sale.created_by_name || 'System'}</span></p>
                </div>
                
                <table class="receipt-items">
                    <thead>
                        <tr>
                            <th class="col-item">Item</th>
                            <th class="col-qty text-right">Qty</th>
                            <th class="col-price text-right">Price</th>
                            <th class="col-total text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => {
                            const calculatedTotal = (item.quantity || 0) * (item.unit_price || 0);
                            const displayTotal = item.total_price || calculatedTotal;
                            const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                            
                            return `
                            <tr>
                                <td class="col-item">
                                    ${item.item_name || '-'}
                                    <div class="item-barcode">
                                        <canvas id="itemBarcode${index}" data-barcode="${barcodeValue}"></canvas>
                                    </div>
                                </td>
                                <td class="col-qty text-right">${item.quantity || 0}</td>
                                <td class="col-price text-right">${formatCurrency(item.unit_price || 0)}</td>
                                <td class="col-total text-right">${formatCurrency(displayTotal)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td class="col-item text-right"><strong>GRAND TOTAL:</strong></td>
                            <td class="col-qty text-right"></td>
                            <td class="col-price text-right"></td>
                            <td class="col-total text-right"><strong>${formatCurrency(sale.total_amount || 0)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
                
                ${sale.notes ? `<div class="sale-notes"><strong>Notes:</strong> ${sale.notes}</div>` : ''}
                
                <div class="receipt-footer">
                    <p>Thank you for your business!</p>
                    <p>Generated on ${currentDate.toLocaleString()}</p>
                </div>
                
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Print Receipt</button>
                    <button onclick="window.close()" class="btn receipt-close-btn">Close</button>
                </div>
                
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <script>
                    window.onload = function() {
                        // Generate barcodes for receipt and items
                        if (window.JsBarcode) {
                            // Receipt barcode
                            const receiptBarcode = document.getElementById('receiptBarcode');
                            if (receiptBarcode) {
                                JsBarcode(receiptBarcode, 'RECEIPT-${sale.id}', {
                                    format: "CODE128",
                                    width: 2,
                                    height: 40,
                                    displayValue: true,
                                    fontSize: 12,
                                    margin: 5
                                });
                            }
                            
                            // Item barcodes
                            ${items.map((item, index) => {
                                const barcodeValue = item.sku || `ITEM-${item.item_id}`;
                                return `
                                const itemBarcode${index} = document.getElementById('itemBarcode${index}');
                                if (itemBarcode${index}) {
                                    JsBarcode(itemBarcode${index}, '${barcodeValue}', {
                                        format: "CODE128",
                                        width: 1.5,
                                        height: 30,
                                        displayValue: true,
                                        fontSize: 10,
                                        margin: 2
                                    });
                                }`;
                            }).join('')}
                        }
                        
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    } catch (error) {
        showNotification(error.message || 'Error generating receipt', 'error');
    }
}

function closeViewSaleModal() {
    closeModal('viewSaleModal');
}

