// ==================== CLEAR DATA FUNCTIONS ====================

let currentClearDataRequestId = null;
let adminConfirmationCount = 0;
let managerConfirmationCount = 0;

// Helper function to download files with authentication
async function downloadFile(url, filename) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        showNotification('Error downloading file: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Admin: Open clear data modal
function initiateClearData() {
    const modal = document.getElementById('clearDataModal');
    if (!modal) {
        alert('Modal not found. Please refresh the page.');
        return;
    }
    
    // Always use manual display to ensure it works
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    // Focus on cancel button for accessibility
    const cancelBtn = modal.querySelector('.btn-secondary');
    if (cancelBtn) {
        setTimeout(() => cancelBtn.focus(), 100);
    }
}

// Close clear data modal
function closeClearDataModal() {
    const modal = document.getElementById('clearDataModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

// Confirm and initiate clear data process
async function confirmInitiateClearData() {
    closeClearDataModal();
    
    try {
        const response = await apiRequest('/clear-data/initiate', {
            method: 'POST'
        });

        currentClearDataRequestId = response.requestId;
        adminConfirmationCount = 0;

        showNotification('Clear data process initiated. PDF and backup generated.', 'success');
        await loadAdminClearDataStatus();
        await checkManagerPendingRequests();
    } catch (error) {
        showNotification('Error initiating clear data: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Admin: Load clear data status
async function loadAdminClearDataStatus() {
    if (getUserRole() !== 'admin') return;

    try {
        const requests = await apiRequest('/clear-data/requests');
        const statusContainer = document.getElementById('adminClearDataStatus');
        const filesContainer = document.getElementById('adminClearDataFiles');

        if (!statusContainer || !filesContainer) return;

        const pendingRequest = requests.find(r => r.status === 'pending');
        const completedRequest = requests.find(r => r.status === 'completed');

        if (pendingRequest) {
            currentClearDataRequestId = pendingRequest.id;
            adminConfirmationCount = pendingRequest.admin_confirmations || 0;

            // Show status and files containers
            statusContainer.style.display = 'block';
            filesContainer.style.display = 'block';
            // Hide the initiate button
            const initiateBtn = document.getElementById('initiateClearDataBtn');
            if (initiateBtn) initiateBtn.style.display = 'none';

            statusContainer.innerHTML = `
                <div style="padding: 1.5rem; background: #fef3c7; border: 3px solid #d97706; border-radius: 0; margin-bottom: 1.5rem; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);">
                    <h3 style="color: #92400e; margin-bottom: 1rem; font-size: 1.5rem; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.1);"><i class="fas fa-exclamation-triangle fa-icon-warning"></i> Clear Data Request Pending</h3>
                    <p style="color: #1e293b; margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 500;">Admin Confirmations: <strong style="color: #92400e; font-size: 1.3rem; font-weight: 800;">${adminConfirmationCount}/5</strong></p>
                    <p style="color: #1e293b; margin-bottom: 1rem; font-size: 1rem; font-weight: 500;">Status: <strong style="color: #78350f; font-size: 1.05rem;">Waiting for ${adminConfirmationCount < 5 ? 'admin confirmations' : 'manager approval'}</strong></p>
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem;">
                        ${adminConfirmationCount < 5 ? `
                            <button class="btn btn-warning" onclick="confirmClearData(${adminConfirmationCount + 1})" style="font-weight: 700; padding: 0.75rem 1.5rem; font-size: 1.05rem; border: 2px solid #92400e; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                <i class="fas fa-check fa-icon-white"></i> Confirm ${adminConfirmationCount + 1} of 5
                            </button>
                        ` : '<p style="color: #1e40af; font-weight: 700; font-size: 1.05rem; margin: 0;"><i class="fas fa-clock fa-icon-info"></i> Waiting for manager approval...</p>'}
                        <button class="btn btn-danger" onclick="cancelClearDataRequest()" style="font-weight: 700; padding: 0.75rem 1.5rem; font-size: 1.05rem; border: 2px solid #991b1b; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                            <i class="fas fa-times fa-icon-white"></i> Cancel Request
                        </button>
                    </div>
                </div>
            `;

            filesContainer.innerHTML = `
                <div style="padding: 1.5rem; background: #ffffff; border: 2px solid #2563eb; border-radius: 0; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2); margin-bottom: 1rem;">
                    <h4 style="margin-bottom: 1rem; color: #1e293b; font-size: 1.2rem; font-weight: 700;"><i class="fas fa-folder fa-icon-info"></i> Generated Files:</h4>
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/pdf/${pendingRequest.id}', 'system-report-${pendingRequest.id}.pdf')" style="font-weight: 700; padding: 0.625rem 1.25rem; font-size: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-file-pdf fa-icon-white"></i> Download PDF</button>
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/backup/${pendingRequest.id}', 'backup-${pendingRequest.id}.db')" style="font-weight: 700; padding: 0.625rem 1.25rem; font-size: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-database fa-icon-white"></i> Download Backup</button>
                    </div>
                </div>
            `;
        } else if (completedRequest) {
            // Show status and files containers
            statusContainer.style.display = 'block';
            filesContainer.style.display = 'block';
            // Hide the initiate button
            const initiateBtn = document.getElementById('initiateClearDataBtn');
            if (initiateBtn) initiateBtn.style.display = 'none';

            statusContainer.innerHTML = `
                <div style="padding: 1.5rem; background: #d1fae5; border: 3px solid #059669; border-radius: 0; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.4); margin-bottom: 1.5rem;">
                    <h3 style="color: #047857; font-size: 1.5rem; font-weight: 800; margin-bottom: 0.75rem; text-shadow: 0 1px 2px rgba(0,0,0,0.1);"><i class="fas fa-check-circle fa-icon-success"></i> Data Cleared Successfully</h3>
                    <p style="color: #1e293b; font-size: 1.1rem; font-weight: 500;">Completed: <strong style="color: #065f46; font-size: 1.15rem; font-weight: 700;">${formatDate(completedRequest.completed_at)}</strong></p>
                </div>
            `;

            filesContainer.innerHTML = `
                <div style="padding: 1.5rem; background: #ffffff; border: 2px solid #2563eb; border-radius: 0; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2); margin-bottom: 1rem;">
                    <h4 style="margin-bottom: 1rem; color: #1e293b; font-size: 1.2rem; font-weight: 700;"><i class="fas fa-folder fa-icon-info"></i> Backup Files:</h4>
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/pdf/${completedRequest.id}', 'system-report-${completedRequest.id}.pdf')" style="font-weight: 700; padding: 0.625rem 1.25rem; font-size: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-file-pdf fa-icon-white"></i> Download PDF</button>
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/backup/${completedRequest.id}', 'backup-${completedRequest.id}.db')" style="font-weight: 700; padding: 0.625rem 1.25rem; font-size: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-database fa-icon-white"></i> Download Backup</button>
                    </div>
                </div>
            `;
        } else {
            // Hide status and files, show initiate button
            statusContainer.style.display = 'none';
            filesContainer.style.display = 'none';
            const initiateBtn = document.getElementById('initiateClearDataBtn');
            if (initiateBtn) initiateBtn.style.display = 'inline-block';
        }
    } catch (error) {
        console.error('Error loading clear data status:', error);
    }
}

// Admin: Cancel clear data request
async function cancelClearDataRequest() {
    if (!currentClearDataRequestId) {
        showNotification('No active clear data request', 'error');
        return;
    }

    if (!confirm('Are you sure you want to cancel this clear data request? This action cannot be undone.')) {
        return;
    }

    // Use requestAnimationFrame to prevent blocking the UI thread
    requestAnimationFrame(async () => {
        try {
            const response = await apiRequest('/clear-data/cancel', {
                method: 'POST',
                body: {
                    requestId: currentClearDataRequestId
                }
            });

            showNotification('Clear data request cancelled successfully', 'success');
            currentClearDataRequestId = null;
            adminConfirmationCount = 0;
            await loadAdminClearDataStatus();
        } catch (error) {
            console.error('Cancel error:', error);
            const errorMsg = error.message || error.error || 'Unknown error';
            showNotification('Error cancelling request: ' + errorMsg, 'error');
        }
    });
}

// Admin: Confirm clear data
async function confirmClearData(confirmationNumber) {
    if (!currentClearDataRequestId) {
        showNotification('No active clear data request', 'error');
        return;
    }

    const requiresPassword = confirmationNumber === 5;
    let password = null;

    if (requiresPassword) {
        password = prompt('Enter your password to complete the final confirmation:');
        if (!password) {
            return;
        }
    } else {
        if (!confirm(`Confirm ${confirmationNumber} of 5?`)) {
            return;
        }
    }

    try {
        const response = await apiRequest('/clear-data/confirm', {
            method: 'POST',
            body: JSON.stringify({
                requestId: currentClearDataRequestId,
                password: password,
                confirmationNumber: confirmationNumber
            })
        });

        adminConfirmationCount = response.confirmationCount;
        showNotification(response.message, 'success');
        await loadAdminClearDataStatus();
        await checkManagerPendingRequests();
    } catch (error) {
        showNotification('Error confirming: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Manager: Check for pending requests
async function checkManagerPendingRequests() {
    if (getUserRole() !== 'manager') return;

    try {
        const requests = await apiRequest('/clear-data/pending');
        const section = document.getElementById('managerClearDataSection');
        const requestContainer = document.getElementById('managerClearDataRequest');

        if (!section || !requestContainer) return;

        if (requests.length > 0) {
            const request = requests[0];
            currentClearDataRequestId = request.id;
            managerConfirmationCount = request.manager_confirmations || 0;

            section.style.display = 'block';
            requestContainer.innerHTML = `
                <div style="padding: 1rem; background: #fff; border: 1px solid var(--border-color); border-radius: 0; margin-bottom: 1rem;">
                    <p><strong>Admin:</strong> ${request.admin_username}</p>
                    <p><strong>Requested:</strong> ${formatDate(request.created_at)}</p>
                    <p><strong>Manager Confirmations:</strong> ${managerConfirmationCount}/5</p>
                    <div style="margin-top: 1rem;">
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/pdf/${request.id}', 'system-report-${request.id}.pdf')" style="margin-right: 0.5rem;"><i class="fas fa-file-pdf fa-icon-white"></i> Download PDF</button>
                        <button class="btn btn-sm btn-primary" onclick="downloadFile('/api/clear-data/backup/${request.id}', 'backup-${request.id}.db')"><i class="fas fa-database fa-icon-white"></i> Download Backup</button>
                    </div>
                </div>
            `;
        } else {
            section.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking pending requests:', error);
    }
}

// Manager: Approve clear data request
async function approveClearDataRequest() {
    if (!currentClearDataRequestId) {
        showNotification('No active clear data request', 'error');
        return;
    }

    const newConfirmationCount = managerConfirmationCount + 1;
    const requiresPassword = newConfirmationCount === 5;

    if (requiresPassword) {
        const password = prompt('Enter your password to approve and complete the clear data process:');
        if (!password) {
            return;
        }

        if (!confirm('FINAL WARNING: This will permanently delete ALL data. Are you absolutely sure?')) {
            return;
        }

        try {
            const response = await apiRequest('/clear-data/manager-action', {
                method: 'POST',
                body: JSON.stringify({
                    requestId: currentClearDataRequestId,
                    action: 'approve',
                    password: password
                })
            });

            showNotification(response.message || 'Data cleared successfully', 'success');
            currentClearDataRequestId = null;
            managerConfirmationCount = 0;
            await checkManagerPendingRequests();
            
            // Reload page after clearing
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            showNotification('Error approving: ' + (error.message || 'Unknown error'), 'error');
        }
    } else {
        if (!confirm(`Approve confirmation ${newConfirmationCount} of 5?`)) {
            return;
        }

        try {
            const response = await apiRequest('/clear-data/manager-action', {
                method: 'POST',
                body: JSON.stringify({
                    requestId: currentClearDataRequestId,
                    action: 'approve'
                })
            });

            managerConfirmationCount = response.confirmationCount;
            showNotification(response.message, 'success');
            await checkManagerPendingRequests();
        } catch (error) {
            showNotification('Error approving: ' + (error.message || 'Unknown error'), 'error');
        }
    }
}

// Manager: Reject clear data request
async function rejectClearDataRequest() {
    if (!currentClearDataRequestId) {
        showNotification('No active clear data request', 'error');
        return;
    }

    if (!confirm('Are you sure you want to reject this clear data request?')) {
        return;
    }

    try {
        const response = await apiRequest('/clear-data/manager-action', {
            method: 'POST',
            body: JSON.stringify({
                requestId: currentClearDataRequestId,
                action: 'reject'
            })
        });

        showNotification(response.message || 'Request rejected', 'success');
        currentClearDataRequestId = null;
        managerConfirmationCount = 0;
        await checkManagerPendingRequests();
    } catch (error) {
        showNotification('Error rejecting: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Close modal on Escape key (if not using modal-utils)
if (typeof closeModal !== 'function') {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('clearDataModal');
            if (modal && modal.classList.contains('show')) {
                closeClearDataModal();
            }
        }
    });

    // Close modal when clicking outside
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('clearDataModal');
        if (modal && e.target === modal && modal.classList.contains('show')) {
            closeClearDataModal();
        }
    });
}

// Make functions globally available
window.initiateClearData = initiateClearData;
window.closeClearDataModal = closeClearDataModal;
window.confirmInitiateClearData = confirmInitiateClearData;
window.confirmClearData = confirmClearData;
window.cancelClearDataRequest = cancelClearDataRequest;
window.approveClearDataRequest = approveClearDataRequest;
window.rejectClearDataRequest = rejectClearDataRequest;
window.downloadFile = downloadFile;

