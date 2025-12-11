let templates = [];
let currentTemplateId = null;
let currentViewingTemplateId = null;

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function truncateText(text, maxLength = 100) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

async function loadTemplates() {
    const tbody = document.getElementById('templatesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    // Show loading state
    if (tableContainer) {
        hideTableSkeleton(tableContainer);
        showTableSkeleton(tableContainer, 5, 5);
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    
    try {
        const shopFilter = window.getShopFilterForRequest ? window.getShopFilterForRequest() : {};
        const queryParams = shopFilter.shop_id ? `?shop_id=${shopFilter.shop_id}` : '';
        templates = await apiRequest(`/terms-and-service${queryParams}`);
        
        if (tableContainer) hideTableSkeleton(tableContainer);
        renderTemplatesTable(templates);
    } catch (error) {
        if (tableContainer) hideTableSkeleton(tableContainer);
        showNotification('Error loading templates', 'error');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading templates</td></tr>';
        }
        if (templates.length === 0 && tableContainer) {
            showEmptyState(tableContainer, EmptyStates.templates || {
                icon: '<i class="fas fa-file-contract fa-icon-success" style="font-size: 4rem;"></i>',
                title: 'No Templates',
                message: 'No Terms and Service templates have been created yet.',
                actionLabel: 'Create Template',
                actionCallback: () => openTemplateModal()
            });
        }
    }
}

function renderTemplatesTable(templatesList) {
    const tbody = document.getElementById('templatesTableBody');
    const tableContainer = document.querySelector('.table-container');
    
    if (!tbody) return;
    
    if (templatesList.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) showEmptyState(tableContainer, EmptyStates.templates || {
            icon: '<i class="fas fa-file-contract fa-icon-success" style="font-size: 4rem;"></i>',
            title: 'No Templates',
            message: 'No Terms and Service templates have been created yet.',
            actionLabel: 'Create Template',
            actionCallback: () => openTemplateModal()
        });
        return;
    }

    if (tableContainer) hideEmptyState(tableContainer);
    tbody.innerHTML = templatesList.map(template => {
        const typeBadge = template.type === 'invoice' ? 'badge-info' : 
                         template.type === 'receipt' ? 'badge-success' : 
                         template.type === 'purchase' ? 'badge-warning' : 'badge-secondary';
        const typeText = template.type.charAt(0).toUpperCase() + template.type.slice(1);
        
        return `
            <tr>
                <td data-label="Name"><strong>${escapeHtml(template.name || '-')}</strong></td>
                <td data-label="Type"><span class="badge ${typeBadge}">${typeText}</span></td>
                <td data-label="Content Preview">${escapeHtml(truncateText(template.content, 80))}</td>
                <td data-label="Created">${formatDate(template.created_at)}</td>
                <td data-label="Actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewTemplate(${template.id})" aria-label="View template ${template.name}">
                        <i class="fas fa-eye"></i> <span class="btn-text-mobile">View</span>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="editTemplate(${template.id})" aria-label="Edit template ${template.name}">
                        <i class="fas fa-edit"></i> <span class="btn-text-mobile">Edit</span>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTemplate(${template.id})" aria-label="Delete template ${template.name}">
                        <i class="fas fa-trash"></i> <span class="btn-text-mobile">Delete</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function setupEventListeners() {
    const templateForm = document.getElementById('templateForm');
    
    if (templateForm) {
        templateForm.addEventListener('submit', handleTemplateSubmit);
    }
}

async function openTemplateModal(templateId = null) {
    const modal = document.getElementById('templateModal');
    const form = document.getElementById('templateForm');
    const title = document.getElementById('templateModalTitle');
    
    if (!modal || !form || !title) {
        console.error('Required modal elements not found');
        return;
    }
    
    if (templateId) {
        title.textContent = 'Edit Template';
        currentTemplateId = templateId;
        const template = templates.find(t => t.id === templateId);
        if (template) {
            populateTemplateForm(template);
        }
    } else {
        title.textContent = 'Create Template';
        currentTemplateId = null;
        form.reset();
    }
    
    const firstInput = document.getElementById('templateName');
    openModal('templateModal', firstInput);
}

function populateTemplateForm(template) {
    const templateIdEl = document.getElementById('templateId');
    const templateNameEl = document.getElementById('templateName');
    const templateTypeEl = document.getElementById('templateType');
    const templateContentEl = document.getElementById('templateContent');
    const templateDescriptionEl = document.getElementById('templateDescription');
    
    if (templateIdEl) templateIdEl.value = template.id;
    if (templateNameEl) templateNameEl.value = template.name || '';
    if (templateTypeEl) templateTypeEl.value = template.type || '';
    if (templateContentEl) templateContentEl.value = template.content || '';
    if (templateDescriptionEl) templateDescriptionEl.value = template.description || '';
}

function closeTemplateModal() {
    closeModal('templateModal');
    const form = document.getElementById('templateForm');
    const templateIdEl = document.getElementById('templateId');
    
    if (form) form.reset();
    if (templateIdEl) templateIdEl.value = '';
    currentTemplateId = null;
}

async function handleTemplateSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const templateIdEl = document.getElementById('templateId');
    const templateNameEl = document.getElementById('templateName');
    const templateTypeEl = document.getElementById('templateType');
    const templateContentEl = document.getElementById('templateContent');
    const templateDescriptionEl = document.getElementById('templateDescription');
    
    if (!templateIdEl || !templateNameEl || !templateTypeEl || !templateContentEl) {
        showNotification('Form elements not found', 'error');
        return;
    }
    
    // Validate form
    const validationRules = {
        templateName: { required: true },
        templateType: { required: true },
        templateContent: { required: true }
    };
    
    if (!validateForm(form, validationRules)) {
        return;
    }
    
    // Show loading state
    showFormLoading(form);
    
    const templateData = {
        name: templateNameEl.value.trim(),
        type: templateTypeEl.value,
        content: templateContentEl.value.trim(),
        description: templateDescriptionEl.value.trim() || null
    };
    
    try {
        if (templateIdEl.value) {
            await apiRequest(`/terms-and-service/${templateIdEl.value}`, {
                method: 'PUT',
                body: templateData
            });
            showNotification('Template updated successfully');
        } else {
            await apiRequest('/terms-and-service', {
                method: 'POST',
                body: templateData
            });
            showNotification('Template created successfully');
        }
        
        closeTemplateModal();
        await loadTemplates();
    } catch (error) {
        showNotification(error.message || 'Error saving template', 'error');
    } finally {
        hideFormLoading(form);
    }
}

function editTemplate(templateId) {
    openTemplateModal(templateId);
}

async function deleteTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) {
        showNotification('Template not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this template?\n\nTemplate: ${template.name}`)) {
        return;
    }
    
    try {
        await apiRequest(`/terms-and-service/${templateId}`, {
            method: 'DELETE'
        });
        showNotification('Template deleted successfully');
        await loadTemplates();
    } catch (error) {
        showNotification(error.message || 'Error deleting template', 'error');
    }
}

async function viewTemplate(templateId) {
    try {
        const template = await apiRequest(`/terms-and-service/${templateId}`);
        
        const modal = document.getElementById('viewTemplateModal');
        const title = document.getElementById('viewTemplateModalTitle');
        const content = document.getElementById('templateDetailsContent');
        
        if (!modal || !title || !content) return;
        
        title.textContent = `Template: ${escapeHtml(template.name)}`;
        currentViewingTemplateId = templateId;
        
        const typeBadge = template.type === 'invoice' ? 'badge-info' : 
                         template.type === 'receipt' ? 'badge-success' : 
                         template.type === 'purchase' ? 'badge-warning' : 'badge-secondary';
        const typeText = template.type.charAt(0).toUpperCase() + template.type.slice(1);
        
        content.innerHTML = `
            <div style="display: grid; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">Template Information</h3>
                        <p><strong>Name:</strong> ${escapeHtml(template.name)}</p>
                        <p><strong>Type:</strong> <span class="badge ${typeBadge}">${typeText}</span></p>
                        <p><strong>Created:</strong> ${formatDate(template.created_at)}</p>
                        ${template.updated_at ? `<p><strong>Updated:</strong> ${formatDate(template.updated_at)}</p>` : ''}
                    </div>
                    <div>
                        ${template.description ? `<h3 style="margin-bottom: 0.5rem;">Description</h3><p>${escapeHtml(template.description)}</p>` : ''}
                    </div>
                </div>
                
                <div>
                    <h3 style="margin-bottom: 0.5rem;">Content</h3>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto;">
                        ${escapeHtml(template.content)}
                    </div>
                </div>
            </div>
        `;
        
        openModal('viewTemplateModal');
    } catch (error) {
        showNotification('Error loading template details', 'error');
    }
}

function closeViewTemplateModal() {
    closeModal('viewTemplateModal');
    currentViewingTemplateId = null;
}

function editTemplateFromView() {
    if (currentViewingTemplateId) {
        closeViewTemplateModal();
        setTimeout(() => {
            editTemplate(currentViewingTemplateId);
        }, 300);
    }
}

function applyFilters() {
    const search = document.getElementById('searchTemplates')?.value.toLowerCase().trim() || '';
    const typeFilter = document.getElementById('templateTypeFilter')?.value || '';
    
    let filtered = [...templates];
    
    // Type filter
    if (typeFilter) {
        filtered = filtered.filter(t => t.type === typeFilter);
    }
    
    // Search filter
    if (search) {
        filtered = filtered.filter(t => {
            const name = (t.name || '').toLowerCase();
            const content = (t.content || '').toLowerCase();
            const description = (t.description || '').toLowerCase();
            return name.includes(search) || content.includes(search) || description.includes(search);
        });
    }
    
    renderTemplatesTable(filtered);
}

function clearFilters() {
    const search = document.getElementById('searchTemplates');
    const typeFilter = document.getElementById('templateTypeFilter');
    
    if (search) search.value = '';
    if (typeFilter) typeFilter.value = '';
    
    renderTemplatesTable(templates);
}

// Expose functions to global scope
window.openTemplateModal = openTemplateModal;
window.closeTemplateModal = closeTemplateModal;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.viewTemplate = viewTemplate;
window.closeViewTemplateModal = closeViewTemplateModal;
window.editTemplateFromView = editTemplateFromView;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

document.addEventListener('DOMContentLoaded', async () => {
    await loadTemplates();
    setupEventListeners();
});

