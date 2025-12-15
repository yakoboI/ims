document.addEventListener('DOMContentLoaded', async () => {
    await loadSerialNumbers();

    const filterBtn = document.getElementById('serialFilterBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loadSerialNumbers();
        });
    }

    const statusFilter = document.getElementById('serialStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            loadSerialNumbers();
        });
    }

    const searchInput = document.getElementById('serialSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                loadSerialNumbers();
            }
        });
    }
});

async function loadSerialNumbers() {
    const tbody = document.getElementById('serialNumbersBody');
    const tableSection = document.querySelector('.table-container');

    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
    }

    try {
        const serialSearch = document.getElementById('serialSearch')?.value || '';
        const status = document.getElementById('serialStatusFilter')?.value || '';

        let url = '/serial-numbers?';
        const params = [];
        if (serialSearch) {
            params.push(`serial_number=${encodeURIComponent(serialSearch)}`);
        }
        if (status) {
            params.push(`status=${encodeURIComponent(status)}`);
        }
        url += params.join('&');

        const serials = await apiRequest(url);

        if (!serials || serials.length === 0) {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No serial numbers found.</td></tr>';
            }
            if (tableSection && typeof showEmptyState === 'function') {
                showEmptyState(tableSection, {
                    icon: '🔍',
                    title: 'No Serial Numbers',
                    message: 'Try adjusting your filters or add serial numbers from purchases or item details.'
                });
            }
            return;
        }

        if (tableSection && typeof hideEmptyState === 'function') {
            hideEmptyState(tableSection);
        }

        if (tbody) {
            tbody.innerHTML = serials.map(sn => {
                const purchaseDate = sn.purchase_date ? new Date(sn.purchase_date).toLocaleDateString() : '-';
                const saleDate = sn.sale_date ? new Date(sn.sale_date).toLocaleDateString() : '-';
                let warranty = '-';
                if (sn.warranty_start_date || sn.warranty_end_date) {
                    const start = sn.warranty_start_date || '';
                    const end = sn.warranty_end_date || '';
                    warranty = `${start || '?'} → ${end || '?'}`;
                }

                const statusLabel = (sn.status || '').replace('_', ' ');

                return `
                    <tr>
                        <td data-label="Serial Number">${sn.serial_number}</td>
                        <td data-label="Item">${sn.item_name || '-'}</td>
                        <td data-label="SKU">${sn.sku || '-'}</td>
                        <td data-label="Status">${statusLabel}</td>
                        <td data-label="Purchase Date">${purchaseDate}</td>
                        <td data-label="Sale Date">${saleDate}</td>
                        <td data-label="Location">${sn.location || '-'}</td>
                        <td data-label="Warranty">${warranty}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading serial numbers:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="color: var(--danger-color);">Error loading serial numbers.</td></tr>';
        }
    }
}


