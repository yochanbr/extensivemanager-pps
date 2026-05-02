
        let selectedEmployeeId;
        let selectedDate;
        let selectedIsHistory = false;
        let selectedIsShiftSummary = false;

        window.showModal = function(employeeId) {
            selectedEmployeeId = employeeId;
            const modal = document.getElementById('date-modal');
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
            
            // Reset to daily view on open
            document.getElementById('report-range-type').value = 'daily';
            toggleReportInputs();
        }

        window.toggleReportInputs = function() {
            const type = document.getElementById('report-range-type').value;
            document.querySelectorAll('.report-input-group').forEach(group => group.style.display = 'none');
            if (type === 'daily') document.getElementById('daily-input-group').style.display = 'block';
            else if (type === 'monthly') document.getElementById('monthly-input-group').style.display = 'block';
            else if (type === 'custom') document.getElementById('custom-input-group').style.display = 'block';
            else if (type === 'all') document.getElementById('all-info-group').style.display = 'block';
        }

        function closeModal() {
            const modal = document.getElementById('date-modal');
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }

        async function fetchEmployee(employeeId) {
            const response = await fetch(`/api/employees/${employeeId}`);
            if (response.ok) {
                return response.json();
            }
            return null;
        }

        document.getElementById('date-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const type = document.getElementById('report-range-type').value;
            let params = {};

            if (type === 'daily') {
                const date = document.getElementById('report-date').value;
                if (!date) return await nammaModalSystem.alert('Please select a date.');
                params.date = date;
                selectedDate = date;
            } else if (type === 'monthly') {
                const month = document.getElementById('report-month').value;
                if (!month) return await nammaModalSystem.alert('Please select a month.');
                params.month = month;
                selectedDate = month;
            } else if (type === 'custom') {
                const start = document.getElementById('report-start-date').value;
                const end = document.getElementById('report-end-date').value;
                if (!start || !end) return await nammaModalSystem.alert('Please select both start and end dates.');
                params.startDate = start;
                params.endDate = end;
                selectedDate = `${start} to ${end}`;
            } else {
                // All-time
                selectedDate = 'All-Time';
            }

            await fetchReport(selectedEmployeeId, params);
            closeModal();
        });

        // Helper function to format date/time for counter_data
        function formatDateTime(timestamp) {
            if (!timestamp) return '';
            const dt = new Date(timestamp);
            if (isNaN(dt.getTime())) return '';
            return dt.toLocaleString('en-US', { hour12: true });
        }



        async function fetchReport(employeeId, params = {}) {
            const employee = await fetchEmployee(employeeId);
            if (!employee) {
                await nammaModalSystem.alert('Error fetching employee details.');
                return;
            }

            const fetchTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit', 'counter_data', 'audit_history'];
            const queryParts = [`employeeId=${employeeId}`];
            
            if (params.date) queryParts.push(`date=${params.date}`);
            if (params.month) queryParts.push(`month=${params.month}`);
            if (params.startDate) queryParts.push(`startDate=${params.startDate}`);
            if (params.endDate) queryParts.push(`endDate=${params.endDate}`);

            // Find shift bounds ONLY for daily view if exists
            if (params.date && employee.counter_selections) {
                const todaysShift = employee.counter_selections.find(s => s.shiftStartTime && s.shiftStartTime.startsWith(params.date));
                if (todaysShift) {
                    queryParts.push(`shiftStartTime=${encodeURIComponent(todaysShift.shiftStartTime)}`);
                    queryParts.push(`shiftEndTime=${encodeURIComponent(todaysShift.shiftEndTime)}`);
                }
            }

            const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

            const promises = fetchTypes.map(type =>
                fetch(`/api/${type}${query}`).then(res => res.json())
            );

            try {
                const results = await Promise.all(promises);
                const allData = [];
                fetchTypes.forEach((type, idx) => {
                    if (Array.isArray(results[idx])) {
                        results[idx].forEach(item => {
                            allData.push({ ...item, type, employeeId: employee.id });
                        });
                    }
                });

                try {
                    const historyRes = await fetch(`/api/history${query}`);
                    if (historyRes.ok) {
                        const history = await historyRes.json();
                        if (Array.isArray(history)) {
                            history.forEach(item => {
                                if (item.action === 'delete') {
                                    allData.push({ ...item.originalData, type: 'deleted', historyId: item.id });
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.error('Error fetching history:', err);
                }

                if (!allData.length) {
                    await nammaModalSystem.alert(selectedDate ? `No data found for ${selectedDate}.` : 'No data found for this employee.');
                } else {
                    displayReport(allData, selectedDate, employee);
                }
            } catch (err) {
                console.error('Error fetching report:', err);
                await nammaModalSystem.alert('Error fetching report.');
            }
        }

        function displayReport(data, reportRange, employee) {
            const reportDivExisting = document.getElementById('report-display');
            if (reportDivExisting) reportDivExisting.remove();

            const reportOverlay = document.createElement('div');
            reportOverlay.id = 'report-display';
            reportOverlay.className = 'modal-overlay';
            reportOverlay.style.display = 'flex';
            reportOverlay.style.alignItems = 'flex-start';
            reportOverlay.style.paddingTop = '5vh';

            const modalContent = document.createElement('div');
            modalContent.className = 'modern-modal large-modal';
            modalContent.style.position = 'relative';
            modalContent.style.maxHeight = '90vh';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';

            const header = document.createElement('div');
            header.className = 'modern-modal-header';
            header.style.cursor = 'move';
            
            const title = document.createElement('h3');
            title.textContent = `Activity Report: ${employee.name} (${reportRange})`;
            header.appendChild(title);

            const closeBtn = document.createElement('span');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.fontSize = '24px';
            closeBtn.style.color = '#64748B';
            closeBtn.onclick = () => {
                reportOverlay.classList.remove('show');
                setTimeout(() => reportOverlay.remove(), 300);
            };
            header.appendChild(closeBtn);
            modalContent.appendChild(header);

            const body = document.createElement('div');
            body.className = 'modern-modal-body';
            body.style.overflowY = 'auto';
            body.style.flex = 1;
            body.style.padding = '32px';

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'employee-buttons';
            buttonContainer.style.display = 'grid';
            buttonContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            buttonContainer.style.gap = '12px';
            buttonContainer.style.marginBottom = '24px';

            const types = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit', 'counter_data', 'audit_history'];
            types.forEach(type => {
                const button = document.createElement('button');
                button.className = 'modern-btn secondary';
                button.style.textAlign = 'left';
                button.style.padding = '16px';
                
                if(type === 'counter_data') {
                    button.innerHTML = `<i class="fas fa-calculator" style="margin-right:10px; color:#F95A2C;"></i> counter Data`;
                } else if(type === 'audit_history') {
                    button.innerHTML = `<i class="fas fa-history" style="margin-right:10px; color:#10B981;"></i> Audit History`;
                } else {
                    const icons = {
                        extra: 'fa-plus-circle',
                        delivery: 'fa-truck',
                        bill_paid: 'fa-receipt',
                        issue: 'fa-exclamation-circle',
                        retail_credit: 'fa-credit-card'
                    };
                    button.innerHTML = `<i class="fas ${icons[type] || 'fa-file'}" style="margin-right:10px; color:#3B82F6;"></i> View ${type.replace('_', ' ')}`;
                }

                button.addEventListener('click', async () => {
                    const typeData = data.filter(item => item.type === type);
                    if (typeData.length > 0) {
                        displayDataTable(type, typeData);
                    } else {
                        await nammaModalSystem.alert(`No data found for ${type}.`);
                    }
                });
                buttonContainer.appendChild(button);
            });

            body.appendChild(buttonContainer);

            const dataTableContainer = document.createElement('div');
            dataTableContainer.id = 'data-table';
            dataTableContainer.style.display = 'none';
            dataTableContainer.style.marginTop = '32px';
            body.appendChild(dataTableContainer);

            modalContent.appendChild(body);
            reportOverlay.appendChild(modalContent);
            document.body.appendChild(reportOverlay);

            // Trigger animation
            setTimeout(() => reportOverlay.classList.add('show'), 10);
            
            // Init draggable behavior
            if (typeof makeDraggable === 'function') {
                makeDraggable(modalContent);
            }
        }

        function displayDataTable(title, data) {
            const dataTableContainer = document.getElementById('data-table');
            dataTableContainer.innerHTML = ''; // Clear previous table

            const headerActions = document.createElement('div');
            headerActions.style.display = 'flex';
            headerActions.style.justifyContent = 'space-between';
            headerActions.style.alignItems = 'center';
            headerActions.style.marginBottom = '24px';

            const tableTitle = document.createElement('h3');
            tableTitle.textContent = title === 'counter_data' ? 'Counter Data' : title.replace('_', ' ').toUpperCase();
            tableTitle.style.margin = '0';
            tableTitle.style.fontSize = '18px';
            headerActions.appendChild(tableTitle);

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i> Close Table';
            closeBtn.className = 'modern-btn secondary';
            closeBtn.addEventListener('click', () => {
                dataTableContainer.style.display = 'none';
            });
            headerActions.appendChild(closeBtn);
            dataTableContainer.appendChild(headerActions);

            let filteredData = [...data]; // Copy of data for filtering

            if (title === 'audit_history') {
                const table = document.createElement('table');
                table.className = 'modern-table';

                const headers = ['Timestamp', 'Action', 'Type', 'Reason', 'Admin Actions'];
                const headerRow = document.createElement('tr');
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    headerRow.appendChild(th);
                });
                table.appendChild(headerRow);

                filteredData.forEach(item => {
                    const tr = document.createElement('tr');

                    // Timestamp
                    const tsTd = document.createElement('td');
                    tsTd.textContent = formatDateTime(item.timestamp);
                    tr.appendChild(tsTd);

                    // Action
                    const actTd = document.createElement('td');
                    const badge = document.createElement('span');
                    badge.className = `pill ${item.action === 'delete' ? 'absent' : 'working'}`;
                    badge.style.padding = '4px 8px';
                    badge.style.borderRadius = '6px';
                    badge.style.color = '#fff';
                    badge.style.fontWeight = 'bold';
                    badge.style.backgroundColor = item.action === 'delete' ? '#EF4444' : '#10B981';
                    badge.textContent = item.action.toUpperCase();
                    actTd.appendChild(badge);
                    tr.appendChild(actTd);

                    // Type
                    const typeTd = document.createElement('td');
                    typeTd.textContent = (item.type || '').replace('_', ' ').toUpperCase();
                    tr.appendChild(typeTd);

                    // Reason
                    const reasonTd = document.createElement('td');
                    reasonTd.textContent = item.reason || '-';
                    tr.appendChild(reasonTd);

                    // Actions
                    const actionsTd = document.createElement('td');

                    // 0. View Details button
                    const viewDetailsBtn = document.createElement('button');
                    viewDetailsBtn.innerHTML = '<i class="fas fa-eye"></i> View Details';
                    viewDetailsBtn.className = 'modern-btn secondary';
                    viewDetailsBtn.style.padding = '6px 10px';
                    viewDetailsBtn.style.fontSize = '12px';
                    viewDetailsBtn.style.marginRight = '8px';
                    viewDetailsBtn.addEventListener('click', async () => {
                        let detailsHtml = '<div style="text-align: left; line-height: 1.6; padding: 8px;">';
                        
                        // What was before
                        if (item.originalRecord) {
                            detailsHtml += `<h4 style="margin: 0 0 8px; color: #1E293B;"><i class="fas fa-history" style="color:#64748B;"></i> Original Data (Before)</h4>`;
                            detailsHtml += `<pre style="background: #F8FAFC; padding: 12px; border-radius: 8px; border: 1px solid #E2E8F0; overflow-x: auto; margin: 0 0 16px; font-size: 13px;">${JSON.stringify(item.originalRecord, null, 2)}</pre>`;
                        } else {
                            detailsHtml += `<p style="color: #64748B;">No before data recorded.</p>`;
                        }

                        // What changed
                        if (item.action === 'edit' && item.newRecord) {
                            detailsHtml += `<h4 style="margin: 0 0 8px; color: #1E293B;"><i class="fas fa-edit" style="color:#10B981;"></i> Changed/Updated Values</h4>`;
                            detailsHtml += `<pre style="background: #F8FAFC; padding: 12px; border-radius: 8px; border: 1px solid #E2E8F0; overflow-x: auto; margin: 0; font-size: 13px;">${JSON.stringify(item.newRecord, null, 2)}</pre>`;
                        } else if (item.action === 'delete') {
                            detailsHtml += `<h4 style="margin: 0 0 8px; color: #EF4444;"><i class="fas fa-trash-alt"></i> Action Details</h4>`;
                            detailsHtml += `<p style="margin: 0; padding: 12px; background: #FEF2F2; color: #991B1B; border: 1px solid #FEE2E2; border-radius: 8px;">This record was completely deleted.</p>`;
                        } else {
                            detailsHtml += `<p style="color: #64748B;">No modified data recorded.</p>`;
                        }

                        detailsHtml += '</div>';

                        await nammaModalSystem.alert(detailsHtml);
                    });
                    actionsTd.appendChild(viewDetailsBtn);

                    // 1. Revert/Restore button
                    if (item.action === 'edit' || item.action === 'delete') {
                        const revertBtn = document.createElement('button');
                        revertBtn.innerHTML = `<i class="fas fa-undo"></i> ${item.action === 'delete' ? 'Restore' : 'Revert'}`;
                        revertBtn.className = 'modern-btn secondary';
                        revertBtn.style.padding = '6px 10px';
                        revertBtn.style.fontSize = '12px';
                        revertBtn.style.marginRight = '8px';
                        revertBtn.addEventListener('click', async () => {
                            const confirmed = await nammaModalSystem.confirm(`Are you sure you want to ${item.action === 'delete' ? 'restore this deleted record' : 'revert these changes'}?`);
                            if (!confirmed) return;

                            const url = item.action === 'delete' ? `/api/restore/${item.id}` : `/api/revert-edit/${item.id}`;
                            const res = await fetch(url, { method: 'POST' });
                            if (res.ok) {
                                await nammaModalSystem.alert(`Successfully ${item.action === 'delete' ? 'restored' : 'reverted'}!`);
                                tr.remove();
                            } else {
                                await nammaModalSystem.alert(`Failed to ${item.action === 'delete' ? 'restore' : 'revert'}.`);
                            }
                        });
                        actionsTd.appendChild(revertBtn);
                    }

                    // 2. Edit reason / details button
                    const editBtn = document.createElement('button');
                    editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Reason';
                    editBtn.className = 'modern-btn secondary';
                    editBtn.style.padding = '6px 10px';
                    editBtn.style.fontSize = '12px';
                    editBtn.style.marginRight = '8px';
                    editBtn.addEventListener('click', async () => {
                        const currentReason = item.reason || '';
                        const newReason = prompt('Enter the new audit reason:', currentReason);
                        if (newReason === null) return;
                        
                        const res = await fetch(`/api/audit_history/edit/${item.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: newReason })
                        });
                        if (res.ok) {
                            await nammaModalSystem.alert('Reason updated successfully!');
                            reasonTd.textContent = newReason;
                        } else {
                            await nammaModalSystem.alert('Failed to update reason.');
                        }
                    });
                    actionsTd.appendChild(editBtn);

                    // 3. Delete Permanently button
                    const dltBtn = document.createElement('button');
                    dltBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Permanent';
                    dltBtn.className = 'modern-btn accent';
                    dltBtn.style.padding = '6px 10px';
                    dltBtn.style.fontSize = '12px';
                    dltBtn.addEventListener('click', async () => {
                        const confirmed = await nammaModalSystem.confirm('Are you sure you want to PERMANENTLY delete this audit log? This action cannot be undone.');
                        if (!confirmed) return;

                        const res = await fetch(`/api/audit_history/${item.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            await nammaModalSystem.alert('Deleted permanently!');
                            tr.remove();
                        } else {
                            await nammaModalSystem.alert('Failed to delete permanently.');
                        }
                    });
                    actionsTd.appendChild(dltBtn);

                    tr.appendChild(actionsTd);
                    table.appendChild(tr);
                });

                dataTableContainer.appendChild(table);
                dataTableContainer.style.display = 'block';
                return;
            }

            // Remove duplicate inner function formatDateTime inside counter_data block since global exists
            if (title === 'counter_data') {
                const table = document.createElement('table');
                table.className = 'modern-table';
                

                const headers = ['Shift Start Timestamp', 'Counter', 'Pine Lab Value', 'Shift End Timestamp', 'Actions'];
                const headerRow = document.createElement('tr');
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    
                    
                    
                    headerRow.appendChild(th);
                });
                table.appendChild(headerRow);

                filteredData.forEach(item => {
                    const tr = document.createElement('tr');

                    // Shift Start Timestamp
                    const startTd = document.createElement('td');
                    startTd.textContent = formatDateTime(item.shiftStartTime || item.shiftStartTimestamp || item.shift_start_timestamp || item.startTimestamp || item.start_time || item.start);
                    
                    
                    tr.appendChild(startTd);

                    // Counter
                    const counterTd = document.createElement('td');
                    counterTd.textContent = item.counter || item.counterId || item.counter_id || '';
                    
                    
                    tr.appendChild(counterTd);

                    // Pine Lab Value for counter 1 only
                    const pineLabTd = document.createElement('td');
                    if (counterTd.textContent.trim().toLowerCase() === 'counter 1' || counterTd.textContent.trim() === '1') {
                        pineLabTd.textContent = item.pineLabValue || item.pine_lab_value || '';
                    } else {
                        pineLabTd.textContent = '';
                    }
                    
                    
                    tr.appendChild(pineLabTd);

                    // Shift End Timestamp
                    const endTd = document.createElement('td');
                    endTd.textContent = formatDateTime(item.shiftEndTimestamp || item.shift_end_timestamp || item.endTimestamp || item.end_time || item.end);
                    
                    
                    tr.appendChild(endTd);

                    // Actions column with Edit and Delete buttons
                    const actionsTd = document.createElement('td');
                    
                    

                    const editBtn = document.createElement('button');
                    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
                    editBtn.className = 'modern-btn secondary';
                    editBtn.style.padding = '8px 12px';
                    editBtn.style.marginRight = '8px';
                    editBtn.title = 'Edit';
                    editBtn.addEventListener('click', () => editCounterData(item));
                    actionsTd.appendChild(editBtn);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    deleteBtn.className = 'modern-btn accent';
                    deleteBtn.style.padding = '8px 12px';
                    deleteBtn.title = 'Delete';
                    deleteBtn.addEventListener('click', () => deleteCounterData(item));
                    actionsTd.appendChild(deleteBtn);

                    tr.appendChild(actionsTd);

                    table.appendChild(tr);
                });

                dataTableContainer.appendChild(table);

                dataTableContainer.style.display = 'block';

                // No filters needed for this custom table as per user request
                return;
            }

            // Existing advanced filter form for other types

            // Add advanced filter form for all other data types
            const filterForm = document.createElement('div');
            filterForm.className = 'modern-form-group';
            filterForm.style.background = '#F8FAFC';
            filterForm.style.padding = '24px';
            filterForm.style.borderRadius = '16px';
            filterForm.style.marginBottom = '24px';
            filterForm.style.border = '1px solid #F1F5F9';

            const filterTitle = document.createElement('h4');
            filterTitle.textContent = 'Advanced Filters';
            filterTitle.style.fontSize = '14px';
            filterTitle.style.marginBottom = '20px';
            filterTitle.style.color = '#1E293B';
            filterForm.appendChild(filterTitle);

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
            grid.style.gap = '16px';
            filterForm.appendChild(grid);

            // Date range filter (common for all types)
            const startDateDiv = document.createElement('div');
            startDateDiv.className = 'modern-form-group';
            startDateDiv.style.marginBottom = '0';
            const startDateLabel = document.createElement('label');
            startDateLabel.textContent = 'Start Date';
            const startDateInput = document.createElement('input');
            startDateInput.type = 'date';
            startDateInput.className = 'modern-input';
            startDateInput.id = `start-date-filter-${title}`;
            startDateDiv.appendChild(startDateLabel);
            startDateDiv.appendChild(startDateInput);
            grid.appendChild(startDateDiv);

            const endDateDiv = document.createElement('div');
            endDateDiv.className = 'modern-form-group';
            endDateDiv.style.marginBottom = '0';
            const endDateLabel = document.createElement('label');
            endDateLabel.textContent = 'End Date';
            const endDateInput = document.createElement('input');
            endDateInput.type = 'date';
            endDateInput.className = 'modern-input';
            endDateInput.id = `end-date-filter-${title}`;
            endDateDiv.appendChild(endDateLabel);
            endDateDiv.appendChild(endDateInput);
            grid.appendChild(endDateDiv);

            if (title === 'extra') {
                // Item Name filter
                const itemNameDiv = document.createElement('div');
                itemNameDiv.className = 'filter-group';
                const itemNameLabel = document.createElement('label');
                itemNameLabel.textContent = 'Item Name';
                const itemNameInput = document.createElement('input');
                itemNameInput.type = 'text';
                itemNameInput.id = `item-name-filter-${title}`;
                itemNameInput.placeholder = 'Enter item name';
                itemNameDiv.appendChild(itemNameLabel);
                itemNameDiv.appendChild(itemNameInput);
                filterForm.appendChild(itemNameDiv);

                // Bill Number filter
                const billNumberDiv = document.createElement('div');
                billNumberDiv.className = 'filter-group';
                const billNumberLabel = document.createElement('label');
                billNumberLabel.textContent = 'Bill Number';
                const billNumberInput = document.createElement('input');
                billNumberInput.type = 'text';
                billNumberInput.id = `bill-number-filter-${title}`;
                billNumberInput.placeholder = 'Enter bill number';
                billNumberDiv.appendChild(billNumberLabel);
                billNumberDiv.appendChild(billNumberInput);
                filterForm.appendChild(billNumberDiv);

                // Mode of Pay filter
                const modeOfPayDiv = document.createElement('div');
                modeOfPayDiv.className = 'filter-group';
                const modeOfPayLabel = document.createElement('label');
                modeOfPayLabel.textContent = 'Mode of Pay';
                const modeOfPaySelect = document.createElement('select');
                modeOfPaySelect.id = `mode-of-pay-filter-${title}`;
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'All';
                modeOfPaySelect.appendChild(defaultOption);
                const payModes = ['Cash', 'Card', 'UPI', 'Other'];
                payModes.forEach(mode => {
                    const option = document.createElement('option');
                    option.value = mode;
                    option.textContent = mode;
                    modeOfPaySelect.appendChild(option);
                });
                modeOfPayDiv.appendChild(modeOfPayLabel);
                modeOfPayDiv.appendChild(modeOfPaySelect);
                filterForm.appendChild(modeOfPayDiv);

                // Amount range filter
                const amountRangeDiv = document.createElement('div');
                amountRangeDiv.className = 'filter-group';
                const minAmountLabel = document.createElement('label');
                minAmountLabel.textContent = 'Min Amount';
                const minAmountInput = document.createElement('input');
                minAmountInput.type = 'number';
                minAmountInput.id = `min-amount-filter-${title}`;
                minAmountInput.placeholder = '0';
                amountRangeDiv.appendChild(minAmountLabel);
                amountRangeDiv.appendChild(minAmountInput);
                filterForm.appendChild(amountRangeDiv);

                const maxAmountDiv = document.createElement('div');
                maxAmountDiv.className = 'filter-group';
                const maxAmountLabel = document.createElement('label');
                maxAmountLabel.textContent = 'Max Amount';
                const maxAmountInput = document.createElement('input');
                maxAmountInput.type = 'number';
                maxAmountInput.id = `max-amount-filter-${title}`;
                maxAmountInput.placeholder = '10000';
                maxAmountDiv.appendChild(maxAmountLabel);
                maxAmountDiv.appendChild(maxAmountInput);
                filterForm.appendChild(maxAmountDiv);

            } else if (title === 'delivery') {
                // Bill Number filter
                const billNumberDiv = document.createElement('div');
                billNumberDiv.className = 'filter-group';
                const billNumberLabel = document.createElement('label');
                billNumberLabel.textContent = 'Bill Number';
                const billNumberInput = document.createElement('input');
                billNumberInput.type = 'text';
                billNumberInput.id = `bill-number-filter-${title}`;
                billNumberInput.placeholder = 'Enter bill number';
                billNumberDiv.appendChild(billNumberLabel);
                billNumberDiv.appendChild(billNumberInput);
                filterForm.appendChild(billNumberDiv);

                // Mode of Pay filter
                const modeOfPayDiv = document.createElement('div');
                modeOfPayDiv.className = 'filter-group';
                const modeOfPayLabel = document.createElement('label');
                modeOfPayLabel.textContent = 'Mode of Pay';
                const modeOfPaySelect = document.createElement('select');
                modeOfPaySelect.id = `mode-of-pay-filter-${title}`;
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'All';
                modeOfPaySelect.appendChild(defaultOption);
                ['Cash', 'Card', 'UPI', 'Other'].forEach(mode => {
                    const option = document.createElement('option');
                    option.value = mode;
                    option.textContent = mode;
                    modeOfPaySelect.appendChild(option);
                });
                modeOfPayDiv.appendChild(modeOfPayLabel);
                modeOfPayDiv.appendChild(modeOfPaySelect);
                filterForm.appendChild(modeOfPayDiv);

                // Amount range filter
                const amountRangeDiv = document.createElement('div');
                amountRangeDiv.className = 'filter-group';
                const minAmountLabel = document.createElement('label');
                minAmountLabel.textContent = 'Min Amount';
                const minAmountInput = document.createElement('input');
                minAmountInput.type = 'number';
                minAmountInput.id = `min-amount-filter-${title}`;
                minAmountInput.placeholder = '0';
                amountRangeDiv.appendChild(minAmountLabel);
                amountRangeDiv.appendChild(minAmountInput);
                filterForm.appendChild(amountRangeDiv);

                const maxAmountDiv = document.createElement('div');
                maxAmountDiv.className = 'filter-group';
                const maxAmountLabel = document.createElement('label');
                maxAmountLabel.textContent = 'Max Amount';
                const maxAmountInput = document.createElement('input');
                maxAmountInput.type = 'number';
                maxAmountInput.id = `max-amount-filter-${title}`;
                maxAmountInput.placeholder = '10000';
                maxAmountDiv.appendChild(maxAmountLabel);
                maxAmountDiv.appendChild(maxAmountInput);
                filterForm.appendChild(maxAmountDiv);

            } else if (title === 'bill_paid') {
                // Vendor/Supplier filter
                const vendorDiv = document.createElement('div');
                vendorDiv.className = 'filter-group';
                const vendorLabel = document.createElement('label');
                vendorLabel.textContent = 'Vendor/Supplier';
                const vendorInput = document.createElement('input');
                vendorInput.type = 'text';
                vendorInput.id = `vendor-filter-${title}`;
                vendorInput.placeholder = 'Enter vendor/supplier';
                vendorDiv.appendChild(vendorLabel);
                vendorDiv.appendChild(vendorInput);
                filterForm.appendChild(vendorDiv);

                // Amount Paid range filter
                const amountRangeDiv = document.createElement('div');
                amountRangeDiv.className = 'filter-group';
                const minAmountLabel = document.createElement('label');
                minAmountLabel.textContent = 'Min Amount Paid';
                const minAmountInput = document.createElement('input');
                minAmountInput.type = 'number';
                minAmountInput.id = `min-amount-filter-${title}`;
                minAmountInput.placeholder = '0';
                amountRangeDiv.appendChild(minAmountLabel);
                amountRangeDiv.appendChild(minAmountInput);
                filterForm.appendChild(amountRangeDiv);

                const maxAmountDiv = document.createElement('div');
                maxAmountDiv.className = 'filter-group';
                const maxAmountLabel = document.createElement('label');
                maxAmountLabel.textContent = 'Max Amount Paid';
                const maxAmountInput = document.createElement('input');
                maxAmountInput.type = 'number';
                maxAmountInput.id = `max-amount-filter-${title}`;
                maxAmountInput.placeholder = '10000';
                maxAmountDiv.appendChild(maxAmountLabel);
                maxAmountDiv.appendChild(maxAmountInput);
                filterForm.appendChild(maxAmountDiv);

            } else if (title === 'issue') {
                // Bill Number filter
                const billNumberDiv = document.createElement('div');
                billNumberDiv.className = 'filter-group';
                const billNumberLabel = document.createElement('label');
                billNumberLabel.textContent = 'Bill Number';
                const billNumberInput = document.createElement('input');
                billNumberInput.type = 'text';
                billNumberInput.id = `bill-number-filter-${title}`;
                billNumberInput.placeholder = 'Enter bill number';
                billNumberDiv.appendChild(billNumberLabel);
                billNumberDiv.appendChild(billNumberInput);
                filterForm.appendChild(billNumberDiv);

                // Issue Description filter
                const issueDescDiv = document.createElement('div');
                issueDescDiv.className = 'filter-group';
                const issueDescLabel = document.createElement('label');
                issueDescLabel.textContent = 'Issue Description';
                const issueDescInput = document.createElement('input');
                issueDescInput.type = 'text';
                issueDescInput.id = `issue-desc-filter-${title}`;
                issueDescInput.placeholder = 'Enter issue description';
                issueDescDiv.appendChild(issueDescLabel);
                issueDescDiv.appendChild(issueDescInput);
                filterForm.appendChild(issueDescDiv);

            } else if (title === 'retail_credit') {
                // Phone Number filter
                const phoneDiv = document.createElement('div');
                phoneDiv.className = 'filter-group';
                const phoneLabel = document.createElement('label');
                phoneLabel.textContent = 'Phone Number';
                const phoneInput = document.createElement('input');
                phoneInput.type = 'text';
                phoneInput.id = `phone-filter-${title}`;
                phoneInput.placeholder = 'Enter phone number';
                phoneDiv.appendChild(phoneLabel);
                phoneDiv.appendChild(phoneInput);
                filterForm.appendChild(phoneDiv);

                // Mode of Pay filter
                const modeOfPayDiv = document.createElement('div');
                modeOfPayDiv.className = 'filter-group';
                const modeOfPayLabel = document.createElement('label');
                modeOfPayLabel.textContent = 'Mode of Pay';
                const modeOfPaySelect = document.createElement('select');
                modeOfPaySelect.id = `mode-of-pay-filter-${title}`;
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'All';
                modeOfPaySelect.appendChild(defaultOption);
                const payModes = ['Cash', 'Card', 'UPI', 'Other'];
                payModes.forEach(mode => {
                    const option = document.createElement('option');
                    option.value = mode;
                    option.textContent = mode;
                    modeOfPaySelect.appendChild(option);
                });
                modeOfPayDiv.appendChild(modeOfPayLabel);
                modeOfPayDiv.appendChild(modeOfPaySelect);
                filterForm.appendChild(modeOfPayDiv);

                // Amount range filter
                const amountRangeDiv = document.createElement('div');
                amountRangeDiv.className = 'filter-group';
                const minAmountLabel = document.createElement('label');
                minAmountLabel.textContent = 'Min Amount';
                const minAmountInput = document.createElement('input');
                minAmountInput.type = 'number';
                minAmountInput.id = `min-amount-filter-${title}`;
                minAmountInput.placeholder = '0';
                amountRangeDiv.appendChild(minAmountLabel);
                amountRangeDiv.appendChild(minAmountInput);
                filterForm.appendChild(amountRangeDiv);

                const maxAmountDiv = document.createElement('div');
                maxAmountDiv.className = 'filter-group';
                const maxAmountLabel = document.createElement('label');
                maxAmountLabel.textContent = 'Max Amount';
                const maxAmountInput = document.createElement('input');
                maxAmountInput.type = 'number';
                maxAmountInput.id = `max-amount-filter-${title}`;
                maxAmountInput.placeholder = '10000';
                maxAmountDiv.appendChild(maxAmountLabel);
                maxAmountDiv.appendChild(maxAmountInput);
                filterForm.appendChild(maxAmountDiv);
            }

            // Filter buttons
            const filterButtonsDiv = document.createElement('div');
            filterButtonsDiv.className = 'filter-buttons';
            const applyBtn = document.createElement('button');
            applyBtn.className = 'apply-btn';
            applyBtn.textContent = 'Apply Filters';
            applyBtn.addEventListener('click', () => {
                applyFilters(data);
            });
            const clearBtn = document.createElement('button');
            clearBtn.className = 'clear-btn';
            clearBtn.textContent = 'Clear Filters';
            clearBtn.addEventListener('click', () => {
                clearFilters();
                applyFilters(data);
            });
            filterButtonsDiv.appendChild(applyBtn);
            filterButtonsDiv.appendChild(clearBtn);
            filterForm.appendChild(filterButtonsDiv);

            dataTableContainer.appendChild(filterForm);

            function applyFilters(originalData) {
                const getVal = id => {
                    const el = document.getElementById(id);
                    return el ? el.value : '';
                };

                const startDate = getVal(`start-date-filter-${title}`);
                const endDate = getVal(`end-date-filter-${title}`);

                // Pre-read type-specific filters to avoid repeated DOM lookups
                const filters = {};
                if (title === 'extra') {
                    filters.itemName = getVal(`item-name-filter-${title}`).toLowerCase();
                    filters.billNumber = getVal(`bill-number-filter-${title}`).toLowerCase();
                    filters.modeOfPay = getVal(`mode-of-pay-filter-${title}`);
                    filters.minAmount = parseFloat(getVal(`min-amount-filter-${title}`)) || 0;
                    filters.maxAmount = parseFloat(getVal(`max-amount-filter-${title}`)) || Infinity;
                } else if (title === 'delivery') {
                    filters.billNumber = getVal(`bill-number-filter-${title}`).toLowerCase();
                    filters.modeOfPay = getVal(`mode-of-pay-filter-${title}`);
                    filters.minAmount = parseFloat(getVal(`min-amount-filter-${title}`)) || 0;
                    filters.maxAmount = parseFloat(getVal(`max-amount-filter-${title}`)) || Infinity;
                } else if (title === 'bill_paid') {
                    filters.vendor = getVal(`vendor-filter-${title}`).toLowerCase();
                    filters.minAmount = parseFloat(getVal(`min-amount-filter-${title}`)) || 0;
                    filters.maxAmount = parseFloat(getVal(`max-amount-filter-${title}`)) || Infinity;
                } else if (title === 'issue') {
                    filters.billNumber = getVal(`bill-number-filter-${title}`).toLowerCase();
                    filters.issueDesc = getVal(`issue-desc-filter-${title}`).toLowerCase();
                } else if (title === 'retail_credit') {
                    filters.phone = getVal(`phone-filter-${title}`).toLowerCase();
                    filters.modeOfPay = getVal(`mode-of-pay-filter-${title}`);
                    filters.minAmount = parseFloat(getVal(`min-amount-filter-${title}`)) || 0;
                    filters.maxAmount = parseFloat(getVal(`max-amount-filter-${title}`)) || Infinity;
                }

                filteredData = originalData.filter(item => {
                    // Date filter (common)
                    if (startDate || endDate) {
                        const ts = item.timestamp || itemTimestampFromItem(item);
                        if (!ts) return false;
                        const itemDate = new Date(ts);
                        if (isNaN(itemDate.getTime())) return false;
                        const iso = itemDate.toISOString().split('T')[0];
                        if (startDate && iso < startDate) return false;
                        if (endDate && iso > endDate) return false;
                    }

                    // Type-specific filters
                    try {
                        if (title === 'extra') {
                            if (filters.itemName && !(String(item.itemName||'').toLowerCase().includes(filters.itemName))) return false;
                            if (filters.billNumber && !(String(item.billNumber||'').toLowerCase().includes(filters.billNumber))) return false;
                            if (filters.modeOfPay && String(item.modeOfPay||'') !== filters.modeOfPay) return false;
                            const amount = parseFloat(item.extraAmount) || 0;
                            if (amount < filters.minAmount || amount > filters.maxAmount) return false;
                        } else if (title === 'delivery') {
                            if (filters.billNumber && !(String(item.billNumber||'').toLowerCase().includes(filters.billNumber))) return false;
                            if (filters.modeOfPay && String(item.modeOfPay||'') !== filters.modeOfPay) return false;
                            const amount = parseFloat(item.amount) || 0;
                            if (amount < filters.minAmount || amount > filters.maxAmount) return false;
                        } else if (title === 'bill_paid') {
                            if (filters.vendor && !(String(item.vendorSupplier||'').toLowerCase().includes(filters.vendor))) return false;
                            const amount = parseFloat(item.amountPaid) || 0;
                            if (amount < filters.minAmount || amount > filters.maxAmount) return false;
                        } else if (title === 'issue') {
                            if (filters.billNumber && !(String(item.billNumber||'').toLowerCase().includes(filters.billNumber))) return false;
                            if (filters.issueDesc && !(String(item.issueDescription||'').toLowerCase().includes(filters.issueDesc))) return false;
                        } else if (title === 'retail_credit') {
                            if (filters.phone && !(String(item.phoneNumber||'').toLowerCase().includes(filters.phone))) return false;
                            if (filters.modeOfPay && String(item.modeOfPay||'') !== filters.modeOfPay) return false;
                            const amount = parseFloat(item.amount) || 0;
                            if (amount < filters.minAmount || amount > filters.maxAmount) return false;
                        }
                    } catch (err) {
                        // If any property access fails, skip this item
                        return false;
                    }

                    return true;
                });

                renderTable(filteredData);
            }

            function clearFilters() {
                const setVal = id => { const el = document.getElementById(id); if (el) el.value = ''; };
                setVal(`start-date-filter-${title}`);
                setVal(`end-date-filter-${title}`);

                if (title === 'extra') {
                    setVal(`item-name-filter-${title}`);
                    setVal(`bill-number-filter-${title}`);
                    setVal(`mode-of-pay-filter-${title}`);
                    setVal(`min-amount-filter-${title}`);
                    setVal(`max-amount-filter-${title}`);
                } else if (title === 'delivery') {
                    setVal(`bill-number-filter-${title}`);
                    setVal(`mode-of-pay-filter-${title}`);
                    setVal(`min-amount-filter-${title}`);
                    setVal(`max-amount-filter-${title}`);
                } else if (title === 'bill_paid') {
                    setVal(`vendor-filter-${title}`);
                    setVal(`min-amount-filter-${title}`);
                    setVal(`max-amount-filter-${title}`);
                } else if (title === 'issue') {
                    setVal(`bill-number-filter-${title}`);
                    setVal(`issue-desc-filter-${title}`);
                } else if (title === 'retail_credit') {
                    setVal(`phone-filter-${title}`);
                    setVal(`mode-of-pay-filter-${title}`);
                    setVal(`min-amount-filter-${title}`);
                    setVal(`max-amount-filter-${title}`);
                }
            }

            // Helper to get timestamp when items may use different keys
            function itemTimestampFromItem(item) {
                return item.timestamp || item.time || item.date || null;
            }

            // Return the local YYYY-MM-DD string for a timestamp
            function itemLocalDateString(ts) {
                if (!ts) return null;
                const d = new Date(ts);
                if (isNaN(d.getTime())) return null;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${dd}`;
            }

            function renderTable(dataToRender) {
                // Remove existing table if present
                const existingTable = dataTableContainer.querySelector('table');
                if (existingTable) existingTable.remove();

                // Remove any previously-added export buttons to avoid duplicates
                const prevExports = dataTableContainer.querySelectorAll('button.export-btn');
                prevExports.forEach(b => b.remove());

                const table = document.createElement('table');
                table.className = 'status-table';
                

                // For well-known types, use predefined column order for readability
                let headers = [];
                if (title === 'extra') headers = ['timestamp','itemName','billNumber','extraAmount','modeOfPay'];
                else if (title === 'delivery') headers = ['timestamp','billNumber','amount','extraAmount','totalAmount','modeOfPay'];
                else if (title === 'bill_paid') headers = ['timestamp','vendorSupplier','amountPaid'];
                else if (title === 'issue') headers = ['timestamp','billNumber','issueDescription'];
                else if (title === 'retail_credit') headers = ['timestamp','phoneNumber','amount','modeOfPay'];
                else {
                    const allKeys = new Set();
                    dataToRender.forEach(item => Object.keys(item).forEach(k => { if (k !== 'id' && k !== 'type') allKeys.add(k); }));
                    headers = Array.from(allKeys);
                }

                const headerRow = document.createElement('tr');
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    
                    
                    
                    headerRow.appendChild(th);
                });
                table.appendChild(headerRow);

                dataToRender.forEach(item => {
                    const tr = document.createElement('tr');
                    headers.forEach(header => {
                        const td = document.createElement('td');
                        let value = (item[header] !== undefined && item[header] !== null) ? item[header] : '';
                        if ((header === 'timestamp' || header === 'time' || header === 'date') && value) {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) value = date.toLocaleString('en-US', { hour12: true });
                        }
                        td.textContent = value;
                        
                        
                        tr.appendChild(td);
                    });
                    table.appendChild(tr);
                });

                dataTableContainer.appendChild(table);

                const exportBtn = document.createElement('button');
                exportBtn.className = 'export-btn';
                exportBtn.textContent = 'Export to Excel';
                exportBtn.style.marginTop = '10px';
                exportBtn.addEventListener('click', () => exportToExcel(dataToRender));
                dataTableContainer.appendChild(exportBtn);
            }

            renderTable(filteredData);

            dataTableContainer.style.display = 'block';
        }

        function displayShiftSummary(data) {
            const dataTableContainer = document.getElementById('data-table');
            dataTableContainer.innerHTML = '';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'action-btn secondary';
            closeBtn.textContent = 'Close Summary';
            closeBtn.style.marginBottom = '15px';
            closeBtn.addEventListener('click', () => {
                dataTableContainer.style.display = 'none';
            });
            dataTableContainer.appendChild(closeBtn);

            const tableTitle = document.createElement('h3');
            tableTitle.textContent = 'Shift Summary';
            dataTableContainer.appendChild(tableTitle);

            const table = document.createElement('table');
            table.className = 'status-table';
            

            const headers = ['Counter', 'Number of Entries', 'Total Pine Lab Value'];
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                
                
                
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            // Group data by counter
            const summary = {};
            data.forEach(item => {
                const counter = item.counter || 'Unknown';
                if (!summary[counter]) {
                    summary[counter] = { count: 0, totalPine: 0 };
                }
                summary[counter].count++;
                if (counter.toLowerCase() === 'counter 1') {
                    const pine = parseFloat(item.pineLabValue || 0);
                    summary[counter].totalPine += pine;
                }
            });

            Object.keys(summary).forEach(counter => {
                const tr = document.createElement('tr');

                const counterTd = document.createElement('td');
                counterTd.textContent = counter;
                
                
                tr.appendChild(counterTd);

                const countTd = document.createElement('td');
                countTd.textContent = summary[counter].count;
                
                
                tr.appendChild(countTd);

                const pineTd = document.createElement('td');
                if (counter.toLowerCase() === 'counter 1') {
                    pineTd.textContent = summary[counter].totalPine.toFixed(2);
                } else {
                    pineTd.textContent = 'N/A';
                }
                
                
                tr.appendChild(pineTd);

                table.appendChild(tr);
            });

            dataTableContainer.appendChild(table);

            dataTableContainer.style.display = 'block';
        }

        async function fetchHistory(employeeId, date) {
            const reportDivExisting = document.getElementById('report-display');
            if (reportDivExisting) reportDivExisting.remove();

            const reportOverlay = document.createElement('div');
            reportOverlay.id = 'report-display';
            reportOverlay.className = 'modal';
            reportOverlay.style.display = 'flex';
            reportOverlay.style.alignItems = 'flex-start';
            reportOverlay.style.paddingTop = '5vh';

            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content large-modal';
            modalContent.style.position = 'relative';
            modalContent.style.maxHeight = '85vh';
            modalContent.style.overflowY = 'auto';

            const closeSpan = document.createElement('span');
            closeSpan.className = 'close';
            closeSpan.innerHTML = '&times;';
            closeSpan.onclick = () => {
                reportOverlay.remove();
            };
            modalContent.appendChild(closeSpan);

            const title = document.createElement('h2');
            title.textContent = `Report Actions (${selectedDate})`;
            // Style title as a window drag handle
            title.style.padding = '16px 24px';
            title.style.margin = '-24px -24px 20px -24px';
            title.style.backgroundColor = '#F8F9FA';
            title.style.borderBottom = '1px solid #EAEAEA';
            title.style.borderRadius = '12px 12px 0 0';
            title.style.fontSize = '16px';
            title.style.display = 'flex';
            title.style.justifyContent = 'space-between';
            title.style.alignItems = 'center';
            modalContent.appendChild(title);
            
            // Move close button inside the title bar for true OS window feel
            closeSpan.style.position = 'static';
            closeSpan.style.float = 'none';
            closeSpan.style.lineHeight = '1';
            title.appendChild(closeSpan);

            // Init draggable behavior on the entire modal
            makeDraggable(modalContent);

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'employee-buttons';

            const historyTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
            historyTypes.forEach(type => {
                const button = document.createElement('button');
                button.className = 'employee-btn';
                button.textContent = `View ${type.replace('_', ' ')} history`;
                button.addEventListener('click', () => {
                    fetchHistoryByType(type, employeeId, date);
                });
                buttonContainer.appendChild(button);
            });

            // Add button to view all history
            const allHistoryButton = document.createElement('button');
            allHistoryButton.className = 'employee-btn';
            allHistoryButton.textContent = 'View All History';
            allHistoryButton.addEventListener('click', () => {
                fetchAllHistory();
            });
            buttonContainer.appendChild(allHistoryButton);

            modalContent.appendChild(buttonContainer);

            const dataTableContainer = document.createElement('div');
            dataTableContainer.id = 'data-table';
            dataTableContainer.style.display = 'none';
            dataTableContainer.style.marginTop = '20px';
            modalContent.appendChild(dataTableContainer);

            reportOverlay.appendChild(modalContent);
            document.body.appendChild(reportOverlay);
        }

        async function fetchAllHistory() {
            try {
                const employeesResponse = await fetch('/api/employees');
                if (!employeesResponse.ok) {
                    await nammaModalSystem.alert('Error fetching employees.');
                    return;
                }
                const employees = await employeesResponse.json();

                const allHistoryPromises = employees.map(employee =>
                    fetch(`/api/history?employeeId=${employee.id}`).then(res => res.json())
                );

                const allHistoryResults = await Promise.all(allHistoryPromises);
                const allHistory = allHistoryResults.flat().map(item => ({
                    ...item,
                    employeeName: employees.find(emp => emp.id === item.employeeId)?.name || 'Unknown'
                }));

                displayAllHistory(allHistory);
            } catch (error) {
                console.error('Error fetching all history:', error);
                await nammaModalSystem.alert('Error fetching all history.');
            }
        }

        function displayAllHistory(data) {
            const dataTableContainer = document.getElementById('data-table');
            dataTableContainer.innerHTML = ''; // Clear previous table

            const closeBtn = document.createElement('button');
            closeBtn.className = 'action-btn secondary';
            closeBtn.textContent = 'Close Table';
            closeBtn.style.marginBottom = '15px';
            closeBtn.addEventListener('click', () => {
                dataTableContainer.style.display = 'none';
            });
            dataTableContainer.appendChild(closeBtn);

            const tableTitle = document.createElement('h3');
            tableTitle.textContent = 'All History';
            dataTableContainer.appendChild(tableTitle);

            let filteredData = [...data]; // Copy of data for filtering

            // Add advanced filter form for all history
            const filterForm = document.createElement('div');
            filterForm.className = 'filter-form';

            const filterTitle = document.createElement('h4');
            filterTitle.textContent = 'Advanced Filters';
            filterForm.appendChild(filterTitle);

            // Date range filter
            const dateRangeDiv = document.createElement('div');
            dateRangeDiv.className = 'filter-group';
            const startDateLabel = document.createElement('label');
            startDateLabel.textContent = 'Start Date';
            const startDateInput = document.createElement('input');
            startDateInput.type = 'date';
            startDateInput.id = 'start-date-filter-history';
            dateRangeDiv.appendChild(startDateLabel);
            dateRangeDiv.appendChild(startDateInput);
            filterForm.appendChild(dateRangeDiv);

            const endDateDiv = document.createElement('div');
            endDateDiv.className = 'filter-group';
            const endDateLabel = document.createElement('label');
            endDateLabel.textContent = 'End Date';
            const endDateInput = document.createElement('input');
            endDateInput.type = 'date';
            endDateInput.id = 'end-date-filter-history';
            endDateDiv.appendChild(endDateLabel);
            endDateDiv.appendChild(endDateInput);
            filterForm.appendChild(endDateDiv);

            // Type filter
            const typeDiv = document.createElement('div');
            typeDiv.className = 'filter-group';
            const typeLabel = document.createElement('label');
            typeLabel.textContent = 'Type';
            const typeSelect = document.createElement('select');
            typeSelect.id = 'type-filter-history';
            const defaultTypeOption = document.createElement('option');
            defaultTypeOption.value = '';
            defaultTypeOption.textContent = 'All';
            typeSelect.appendChild(defaultTypeOption);
            const types = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
            types.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type.replace('_', ' ');
                typeSelect.appendChild(option);
            });
            typeDiv.appendChild(typeLabel);
            typeDiv.appendChild(typeSelect);
            filterForm.appendChild(typeDiv);

            // Action filter
            const actionDiv = document.createElement('div');
            actionDiv.className = 'filter-group';
            const actionLabel = document.createElement('label');
            actionLabel.textContent = 'Action';
            const actionSelect = document.createElement('select');
            actionSelect.id = 'action-filter-history';
            const defaultActionOption = document.createElement('option');
            defaultActionOption.value = '';
            defaultActionOption.textContent = 'All';
            actionSelect.appendChild(defaultActionOption);
            const actions = ['edit', 'delete'];
            actions.forEach(action => {
                const option = document.createElement('option');
                option.value = action;
                option.textContent = action;
                actionSelect.appendChild(option);
            });
            actionDiv.appendChild(actionLabel);
            actionDiv.appendChild(actionSelect);
            filterForm.appendChild(actionDiv);

            // Employee filter
            const employeeDiv = document.createElement('div');
            employeeDiv.className = 'filter-group';
            const employeeLabel = document.createElement('label');
            employeeLabel.textContent = 'Employee';
            const employeeSelect = document.createElement('select');
            employeeSelect.id = 'employee-filter-history';
            const defaultEmployeeOption = document.createElement('option');
            defaultEmployeeOption.value = '';
            defaultEmployeeOption.textContent = 'All';
            employeeSelect.appendChild(defaultEmployeeOption);
            // Populate employee options dynamically
            fetch('/api/employees').then(res => res.json()).then(employees => {
                employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.id;
                    option.textContent = employee.name;
                    employeeSelect.appendChild(option);
                });
            });
            employeeDiv.appendChild(employeeLabel);
            employeeDiv.appendChild(employeeSelect);
            filterForm.appendChild(employeeDiv);

            // Sort options
            const sortDiv = document.createElement('div');
            sortDiv.className = 'filter-group';
            const sortLabel = document.createElement('label');
            sortLabel.textContent = 'Sort By';
            const sortSelect = document.createElement('select');
            sortSelect.id = 'sort-filter-history';
            const sortOptions = [
                { value: 'timestamp-desc', text: 'Timestamp (Newest First)' },
                { value: 'timestamp-asc', text: 'Timestamp (Oldest First)' },
                { value: 'type-asc', text: 'Type (A-Z)' },
                { value: 'action-asc', text: 'Action (A-Z)' },
                { value: 'employee-asc', text: 'Employee (A-Z)' }
            ];
            sortOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                sortSelect.appendChild(option);
            });
            sortDiv.appendChild(sortLabel);
            sortDiv.appendChild(sortSelect);
            filterForm.appendChild(sortDiv);

            // Filter buttons
            const filterButtonsDiv = document.createElement('div');
            filterButtonsDiv.className = 'filter-buttons';
            const applyBtn = document.createElement('button');
            applyBtn.className = 'apply-btn';
            applyBtn.textContent = 'Apply Filters';
            applyBtn.addEventListener('click', () => {
                applyHistoryFilters(data);
            });
            const clearBtn = document.createElement('button');
            clearBtn.className = 'clear-btn';
            clearBtn.textContent = 'Clear Filters';
            clearBtn.addEventListener('click', () => {
                clearHistoryFilters();
                applyHistoryFilters(data);
            });
            filterButtonsDiv.appendChild(applyBtn);
            filterButtonsDiv.appendChild(clearBtn);
            filterForm.appendChild(filterButtonsDiv);

            dataTableContainer.appendChild(filterForm);

            function applyHistoryFilters(originalData) {
                const startDate = document.getElementById('start-date-filter-history').value;
                const endDate = document.getElementById('end-date-filter-history').value;
                const type = document.getElementById('type-filter-history').value;
                const action = document.getElementById('action-filter-history').value;
                const employeeId = document.getElementById('employee-filter-history').value;
                const sortBy = document.getElementById('sort-filter-history').value;

                filteredData = originalData.filter(item => {
                    if (startDate || endDate) {
                        const ts = item.timestamp;
                        if (!ts) return false;
                        const itemDate = new Date(ts);
                        if (isNaN(itemDate.getTime())) return false;
                        const iso = itemDate.toISOString().split('T')[0];
                        if (startDate && iso < startDate) return false;
                        if (endDate && iso > endDate) return false;
                    }
                    if (type && item.type !== type) return false;
                    if (action && item.action !== action) return false;
                    if (employeeId && item.employeeId !== employeeId) return false;
                    return true;
                });

                // Apply sorting
                if (sortBy) {
                    const [field, order] = sortBy.split('-');
                    filteredData.sort((a, b) => {
                        let aVal, bVal;
                        if (field === 'timestamp') {
                            aVal = new Date(a.timestamp);
                            bVal = new Date(b.timestamp);
                        } else if (field === 'employee') {
                            aVal = a.employeeName.toLowerCase();
                            bVal = b.employeeName.toLowerCase();
                        } else {
                            aVal = (a[field] || '').toLowerCase();
                            bVal = (b[field] || '').toLowerCase();
                        }
                        if (order === 'asc') {
                            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                        } else {
                            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                        }
                    });
                }

                renderHistoryTable(filteredData);
            }

            function clearHistoryFilters() {
                document.getElementById('start-date-filter-history').value = '';
                document.getElementById('end-date-filter-history').value = '';
                document.getElementById('type-filter-history').value = '';
                document.getElementById('action-filter-history').value = '';
                document.getElementById('employee-filter-history').value = '';
                document.getElementById('sort-filter-history').value = 'timestamp-desc';
            }

            function renderHistoryTable(dataToRender) {
                // Remove existing table if present
                const existingTable = dataTableContainer.querySelector('table');
                if (existingTable) existingTable.remove();

                const table = document.createElement('table');
                table.className = 'status-table';
                

                const headers = ['Timestamp', 'Employee', 'Action', 'Type', 'Item ID', 'Reason', 'Actions'];
                const headerRow = document.createElement('tr');
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    
                    
                    
                    headerRow.appendChild(th);
                });
                table.appendChild(headerRow);

                dataToRender.forEach(item => {
                    const tr = document.createElement('tr');

                    // Timestamp
                    const timestampTd = document.createElement('td');
                    let timestampValue = item.timestamp || '';
                    if (timestampValue) {
                        const date = new Date(timestampValue);
                        timestampValue = date.toLocaleString('en-US', { hour12: true });
                    }
                    timestampTd.textContent = timestampValue;
                    
                    
                    tr.appendChild(timestampTd);

                    // Employee
                    const employeeTd = document.createElement('td');
                    employeeTd.textContent = item.employeeName || '';
                    
                    
                    tr.appendChild(employeeTd);

                    // Action
                    const actionTd = document.createElement('td');
                    actionTd.textContent = item.action || '';
                    
                    
                    tr.appendChild(actionTd);

                    // Type
                    const typeTd = document.createElement('td');
                    typeTd.textContent = item.type || '';
                    
                    
                    tr.appendChild(typeTd);

                    // Item ID
                    const itemIdTd = document.createElement('td');
                    itemIdTd.textContent = item.itemId || '';
                    
                    
                    tr.appendChild(itemIdTd);

                    // Reason
                    const reasonTd = document.createElement('td');
                    reasonTd.textContent = item.reason || '';
                    
                    
                    tr.appendChild(reasonTd);

                // Actions
                const actionsTd = document.createElement('td');
                
                

                if (item.action === 'delete') {
                    const restoreBtn = document.createElement('button');
                    restoreBtn.textContent = 'Restore'; restoreBtn.className = 'action-btn secondary';
                    restoreBtn.addEventListener('click', () => restoreItem(item));
                    actionsTd.appendChild(restoreBtn);
                }

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Permanently Delete'; deleteBtn.className = 'action-btn danger';
                deleteBtn.style.marginLeft = '5px';
                
                
                deleteBtn.addEventListener('click', () => permanentlyDeleteHistory(item));
                actionsTd.appendChild(deleteBtn);

                tr.appendChild(actionsTd);
                    table.appendChild(tr);
                });

                dataTableContainer.appendChild(table);

                dataTableContainer.style.display = 'block';
            }

            renderHistoryTable(filteredData);
        }

        async function fetchHistoryByType(type, employeeId, date) {
            const displayType = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
            try {
                const response = await fetch(`/api/history?employeeId=${employeeId}&type=${type}`);
                const data = await response.json();
                if (data.length > 0) {
                    displayHistoryTableByType(type, data);
                } else {
                    await nammaModalSystem.alert(`No ${displayType} data found.`);
                }
            } catch (error) {
                console.error(`Error fetching ${type} data:`, error);
                await nammaModalSystem.alert(`Error fetching ${displayType} data.`);
            }
        }

        function getFieldsForType(type) {
            switch (type) {
                case 'extra': return ['timestamp', 'itemName', 'billNumber', 'extraAmount', 'modeOfPay'];
                case 'delivery': return ['timestamp', 'billNumber', 'amount', 'modeOfPay'];
                case 'bill_paid': return ['timestamp', 'vendorSupplier', 'amountPaid'];
                case 'issue': return ['timestamp', 'billNumber', 'issueDescription'];
                case 'retail_credit': return ['timestamp', 'phoneNumber', 'amount', 'modeOfPay'];
                default: return [];
            }
        }

        function displayHistoryTable(data) {
            const dataTableContainer = document.getElementById('data-table');
            dataTableContainer.innerHTML = ''; // Clear previous table

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close Table'; closeBtn.className = 'action-btn secondary'; closeBtn.style.marginBottom = '15px';
            closeBtn.addEventListener('click', () => {
                dataTableContainer.style.display = 'none';
            });
            dataTableContainer.appendChild(closeBtn);

            const tableTitle = document.createElement('h3');
            tableTitle.textContent = 'History';
            dataTableContainer.appendChild(tableTitle);

            const table = document.createElement('table');
            table.className = 'status-table';
            

            // Collect all unique data keys
            const allDataKeys = new Set();
            data.forEach(item => {
                let itemData;
                if (item.action === 'delete') {
                    itemData = item.originalData || item.originaldata || {};
                } else if (item.action === 'edit') {
                    itemData = item.modifiedData || item.modifieddata || {};
                } else {
                    itemData = item;
                }
                Object.keys(itemData).forEach(key => {
                    if (key !== 'id' && key !== 'type' && key !== 'timestamp') {
                        allDataKeys.add(key);
                    }
                });
            });

            const headers = ['Timestamp', 'Action', 'Data Type', 'Item ID', 'Reason', ...Array.from(allDataKeys), 'Actions'];
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                
                
                
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            data.forEach(item => {
                const tr = document.createElement('tr');

                // Timestamp
                const timestampTd = document.createElement('td');
                let timestampValue = item.timestamp || '';
                if (timestampValue) {
                    const date = new Date(timestampValue);
                    timestampValue = date.toLocaleString('en-US', { hour12: true });
                }
                timestampTd.textContent = timestampValue;
                
                
                tr.appendChild(timestampTd);

                // Action
                const actionTd = document.createElement('td');
                actionTd.textContent = item.action || '';
                
                
                tr.appendChild(actionTd);

                // Type
                const typeTd = document.createElement('td');
                typeTd.textContent = item.type || '';
                
                
                tr.appendChild(typeTd);

                // Item ID
                const itemIdTd = document.createElement('td');
                itemIdTd.textContent = item.itemid || '';
                
                
                tr.appendChild(itemIdTd);

                // Reason
                const reasonTd = document.createElement('td');
                reasonTd.textContent = item.reason || '';
                
                
                tr.appendChild(reasonTd);

                // Data fields
                let itemData;
                if (item.action === 'delete') {
                    itemData = item.originalData || item.originaldata || {};
                } else if (item.action === 'edit') {
                    itemData = item.modifiedData || item.modifieddata || {};
                } else {
                    itemData = item;
                }
                Array.from(allDataKeys).forEach(key => {
                    const td = document.createElement('td');
                    let value = itemData[key] || '';
                    if (key === 'timestamp' && value) {
                        const date = new Date(value);
                        value = date.toLocaleString('en-US', { hour12: true });
                    }
                    td.textContent = value;
                    
                    
                    tr.appendChild(td);
                });

                // Actions
                const actionsTd = document.createElement('td');
                
                

                if (item.action === 'edit') {
                    const viewBtn = document.createElement('button');
                    viewBtn.textContent = 'View Changes'; viewBtn.className = 'action-btn secondary';
                    viewBtn.addEventListener('click', () => showEditComparison(item));
                    actionsTd.appendChild(viewBtn);
                } else if (item.action === 'delete') {
                    const restoreBtn = document.createElement('button');
                    restoreBtn.textContent = 'Restore'; restoreBtn.className = 'action-btn secondary';
                    restoreBtn.addEventListener('click', () => restoreItem(item));
                    actionsTd.appendChild(restoreBtn);
                }

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Permanently Delete'; deleteBtn.className = 'action-btn danger';
                deleteBtn.style.marginLeft = '5px';
                
                
                deleteBtn.addEventListener('click', () => permanentlyDeleteHistory(item));
                actionsTd.appendChild(deleteBtn);

                tr.appendChild(actionsTd);
                table.appendChild(tr);
            });

            dataTableContainer.appendChild(table);

            dataTableContainer.style.display = 'block';
        }

        function displayHistoryTableByType(type, data) {
            const dataTableContainer = document.getElementById('data-table');
            dataTableContainer.innerHTML = ''; // Clear previous table

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close Table'; closeBtn.className = 'action-btn secondary'; closeBtn.style.marginBottom = '15px';
            closeBtn.addEventListener('click', () => {
                dataTableContainer.style.display = 'none';
            });
            dataTableContainer.appendChild(closeBtn);

            const tableTitle = document.createElement('h3');
            tableTitle.textContent = `${type.replace('_', ' ')} History`;
            dataTableContainer.appendChild(tableTitle);

            const table = document.createElement('table');
            table.className = 'status-table';
            

            const fields = getFieldsForType(type);
            // Specific column orders per type, with an Action Details column summarizing changes
            let headers;
            if (type === 'extra') {
                headers = ['Timestamp', 'Item Name', 'Bill Number', 'Extra Amount', 'Mode of Pay', 'Action Details', 'Reason', 'Actions'];
            } else if (type === 'delivery') {
                headers = ['Timestamp', 'Bill Number', 'Amount', 'Extra Amount', 'Total Amount', 'Mode of Pay', 'Action Details', 'Reason', 'Actions'];
            } else if (type === 'bill_paid') {
                headers = ['Timestamp', 'Vendor/Supplier', 'Amount Paid', 'Action Details', 'Reason', 'Actions'];
            } else if (type === 'issue') {
                headers = ['Timestamp', 'Bill Number', 'Issue Description', 'Action Details', 'Reason', 'Actions'];
            } else if (type === 'retail_credit') {
                headers = ['Timestamp', 'Phone Number', 'Amount', 'Mode of Pay', 'Action Details', 'Reason', 'Actions'];
            } else {
                headers = ['Timestamp', 'Action', 'Data Type', 'Item ID', 'Reason', ...fields.slice(1), 'Actions']; // Exclude timestamp from fields
            }
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                
                
                
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            data.forEach(item => {
                const tr = document.createElement('tr');

                // Timestamp (first column)
                const timestampTd = document.createElement('td');
                let timestampValue = item.timestamp || '';
                if (timestampValue) {
                    const date = new Date(timestampValue);
                    timestampValue = date.toLocaleString('en-US', { hour12: true });
                }
                timestampTd.textContent = timestampValue;
                
                
                tr.appendChild(timestampTd);

                if (type === 'extra') {
                    // For extra type show itemName, billNumber, extraAmount, modeOfPay, action details, reason
                    const itemNameTd = document.createElement('td');
                    const billNumTd = document.createElement('td');
                    const extraAmtTd = document.createElement('td');
                    const modeTd = document.createElement('td');

                    // Determine source of data depending on action
                    let sourceData = {};
                    if (item.action === 'delete') sourceData = item.originalData || item.originaldata || {};
                    else if (item.action === 'edit') sourceData = item.modifiedData || item.modifieddata || {};
                    else sourceData = item;

                    itemNameTd.textContent = sourceData.itemName || '';
                    billNumTd.textContent = sourceData.billNumber || '';
                    extraAmtTd.textContent = sourceData.extraAmount || '';
                    modeTd.textContent = sourceData.modeOfPay || '';

                    [itemNameTd, billNumTd, extraAmtTd, modeTd].forEach(td => {
                        
                        
                        tr.appendChild(td);
                    });

                    // Action Details: human-readable changes for edits
                    const actionDetailsTd = document.createElement('td');
                    
                    
                    let details = '';
                    if (item.action === 'edit') {
                        const orig = item.originalData || item.originaldata || {};
                        const mod = item.modifiedData || item.modifieddata || {};
                        const watchedKeys = ['itemName', 'billNumber', 'extraAmount', 'modeOfPay'];
                        const parts = [];
                        watchedKeys.forEach(k => {
                            const o = (orig[k] !== undefined && orig[k] !== null) ? String(orig[k]) : '';
                            const m = (mod[k] !== undefined && mod[k] !== null) ? String(mod[k]) : '';
                            if (o !== m) {
                                parts.push(`${k} changed from "${o}" to "${m}"`);
                            }
                        });
                        details = parts.join('; ');
                        if (!details) details = 'No visible changes';
                    } else if (item.action === 'delete') {
                        details = 'Record deleted';
                    } else if (item.action === 'create' || item.action === 'add') {
                        details = 'Record created';
                    } else {
                        details = item.action || '';
                    }
                    actionDetailsTd.textContent = details;
                    tr.appendChild(actionDetailsTd);

                    // Reason
                    const reasonTd = document.createElement('td');
                    reasonTd.textContent = item.reason || '';
                    
                    
                    tr.appendChild(reasonTd);

                } else if (type === 'delivery') {
                    // For delivery show billNumber, amount, extraAmount, totalAmount, modeOfPay
                    const billNumTd = document.createElement('td');
                    const amountTd = document.createElement('td');
                    const extraAmtTd = document.createElement('td');
                    const totalAmtTd = document.createElement('td');
                    const modeTd = document.createElement('td');

                    let sourceData = {};
                    if (item.action === 'delete') sourceData = item.originalData || item.originaldata || {};
                    else if (item.action === 'edit') sourceData = item.modifiedData || item.modifieddata || {};
                    else sourceData = item;

                    billNumTd.textContent = sourceData.billNumber || '';
                    amountTd.textContent = sourceData.amount || '';
                    extraAmtTd.textContent = sourceData.extraAmount || '';
                    totalAmtTd.textContent = sourceData.totalAmount || '';
                    modeTd.textContent = sourceData.modeOfPay || '';

                    [billNumTd, amountTd, extraAmtTd, totalAmtTd, modeTd].forEach(td => {
                        
                        
                        tr.appendChild(td);
                    });

                    // Action Details for delivery
                    const actionDetailsTd = document.createElement('td');
                    
                    
                    let details = '';
                    if (item.action === 'edit') {
                        const orig = item.originalData || item.originaldata || {};
                        const mod = item.modifiedData || item.modifieddata || {};
                        const watchedKeys = ['billNumber', 'amount', 'extraAmount', 'totalAmount', 'modeOfPay'];
                        const parts = [];
                        watchedKeys.forEach(k => {
                            const o = (orig[k] !== undefined && orig[k] !== null) ? String(orig[k]) : '';
                            const m = (mod[k] !== undefined && mod[k] !== null) ? String(mod[k]) : '';
                            if (o !== m) parts.push(`${k} changed from "${o}" to "${m}"`);
                        });
                        details = parts.join('; ');
                        if (!details) details = 'No visible changes';
                    } else if (item.action === 'delete') {
                        details = 'Record deleted';
                    } else if (item.action === 'create' || item.action === 'add') {
                        details = 'Record created';
                    } else {
                        details = item.action || '';
                    }
                    actionDetailsTd.textContent = details;
                    tr.appendChild(actionDetailsTd);

                    // Reason
                    const reasonTd = document.createElement('td');
                    reasonTd.textContent = item.reason || '';
                    
                    
                    tr.appendChild(reasonTd);

                } else if (type === 'bill_paid') {
                    const vendorTd = document.createElement('td');
                    const amtTd = document.createElement('td');
                    let sourceData = {};
                    if (item.action === 'delete') sourceData = item.originalData || item.originaldata || {};
                    else if (item.action === 'edit') sourceData = item.modifiedData || item.modifieddata || {};
                    else sourceData = item;
                    vendorTd.textContent = sourceData.vendorSupplier || '';
                    amtTd.textContent = sourceData.amountPaid || '';
                    [vendorTd, amtTd].forEach(td => {   tr.appendChild(td); });

                    const actionDetailsTd = document.createElement('td');
                     
                    if (item.action === 'edit') {
                        const orig = item.originalData || item.originaldata || {};
                        const mod = item.modifiedData || item.modifieddata || {};
                        const parts = [];
                        if ((orig.amountPaid||'') !== (mod.amountPaid||'')) parts.push(`amountPaid changed from "${orig.amountPaid||''}" to "${mod.amountPaid||''}"`);
                        actionDetailsTd.textContent = parts.join('; ') || 'No visible changes';
                    } else {
                        actionDetailsTd.textContent = item.action === 'delete' ? 'Record deleted' : (item.action || '');
                    }
                    tr.appendChild(actionDetailsTd);

                    const reasonTd = document.createElement('td'); reasonTd.textContent = item.reason || '';   tr.appendChild(reasonTd);

                } else if (type === 'issue') {
                    const billTd = document.createElement('td');
                    const descTd = document.createElement('td');
                    let sourceData = {};
                    if (item.action === 'delete') sourceData = item.originalData || item.originaldata || {};
                    else if (item.action === 'edit') sourceData = item.modifiedData || item.modifieddata || {};
                    else sourceData = item;
                    billTd.textContent = sourceData.billNumber || '';
                    descTd.textContent = sourceData.issueDescription || '';
                    [billTd, descTd].forEach(td => {   tr.appendChild(td); });

                    const actionDetailsTd = document.createElement('td');  
                    if (item.action === 'edit') {
                        const orig = item.originalData || item.originaldata || {};
                        const mod = item.modifiedData || item.modifieddata || {};
                        const parts = [];
                        if ((orig.issueDescription||'') !== (mod.issueDescription||'')) parts.push(`issueDescription changed from "${orig.issueDescription||''}" to "${mod.issueDescription||''}"`);
                        actionDetailsTd.textContent = parts.join('; ') || 'No visible changes';
                    } else { actionDetailsTd.textContent = item.action === 'delete' ? 'Record deleted' : (item.action || ''); }
                    tr.appendChild(actionDetailsTd);

                    const reasonTd = document.createElement('td'); reasonTd.textContent = item.reason || '';   tr.appendChild(reasonTd);

                } else if (type === 'retail_credit') {
                    const phoneTd = document.createElement('td');
                    const amtTd = document.createElement('td');
                    const modeTd = document.createElement('td');
                    let sourceData = {};
                    if (item.action === 'delete') sourceData = item.originalData || item.originaldata || {};
                    else if (item.action === 'edit') sourceData = item.modifiedData || item.modifieddata || {};
                    else sourceData = item;
                    phoneTd.textContent = sourceData.phoneNumber || '';
                    amtTd.textContent = sourceData.amount || '';
                    modeTd.textContent = sourceData.modeOfPay || '';
                    [phoneTd, amtTd, modeTd].forEach(td => {   tr.appendChild(td); });

                    const actionDetailsTd = document.createElement('td');  
                    if (item.action === 'edit') {
                        const orig = item.originalData || item.originaldata || {};
                        const mod = item.modifiedData || item.modifieddata || {};
                        const parts = [];
                        ['phoneNumber','amount','modeOfPay'].forEach(k => {
                            if ((orig[k]||'') !== (mod[k]||'')) parts.push(`${k} changed from "${orig[k]||''}" to "${mod[k]||''}"`);
                        });
                        actionDetailsTd.textContent = parts.join('; ') || 'No visible changes';
                    } else { actionDetailsTd.textContent = item.action === 'delete' ? 'Record deleted' : (item.action || ''); }
                    tr.appendChild(actionDetailsTd);

                    const reasonTd = document.createElement('td'); reasonTd.textContent = item.reason || '';   tr.appendChild(reasonTd);

                } else {
                    // Action
                    const actionTd = document.createElement('td');
                    actionTd.textContent = item.action || '';
                    
                    
                    tr.appendChild(actionTd);

                    // Type
                    const typeTd = document.createElement('td');
                    typeTd.textContent = item.type || '';
                    
                    
                    tr.appendChild(typeTd);

                    // Item ID
                    const itemIdTd = document.createElement('td');
                    itemIdTd.textContent = item.itemid || '';
                    
                    
                    tr.appendChild(itemIdTd);

                    // Reason
                    const reasonTd = document.createElement('td');
                    reasonTd.textContent = item.reason || '';
                    
                    
                    tr.appendChild(reasonTd);

                    // Data fields based on type
                    let itemData;
                    if (item.action === 'delete') {
                        itemData = item.originalData || item.originaldata || {};
                    } else if (item.action === 'edit') {
                        itemData = item.modifiedData || item.modifieddata || {};
                    } else {
                        itemData = item;
                    }
                    fields.slice(1).forEach(key => { // Skip timestamp
                        const td = document.createElement('td');
                        let value = itemData[key] || '';
                        if (key === 'timestamp' && value) {
                            const date = new Date(value);
                            value = date.toLocaleString('en-US', { hour12: true });
                        }
                        td.textContent = value;
                        
                        
                        tr.appendChild(td);
                    });
                }

                // Actions
                const actionsTd = document.createElement('td');
                
                

                if (item.action === 'edit') {
                    const viewBtn = document.createElement('button');
                    viewBtn.textContent = 'View Changes'; viewBtn.className = 'action-btn secondary';
                    viewBtn.addEventListener('click', () => showEditComparison(item));
                    actionsTd.appendChild(viewBtn);
                } else if (item.action === 'delete') {
                    const restoreBtn = document.createElement('button');
                    restoreBtn.textContent = 'Restore'; restoreBtn.className = 'action-btn secondary';
                    restoreBtn.addEventListener('click', () => restoreItem(item));
                    actionsTd.appendChild(restoreBtn);
                }

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Permanently Delete'; deleteBtn.className = 'action-btn danger';
                deleteBtn.style.marginLeft = '5px';
                
                
                deleteBtn.addEventListener('click', () => permanentlyDeleteHistory(item));
                actionsTd.appendChild(deleteBtn);

                tr.appendChild(actionsTd);
                table.appendChild(tr);
            });

            dataTableContainer.appendChild(table);

            dataTableContainer.style.display = 'block';
        }

        async function restoreItem(item) {
            if (await nammaModalSystem.confirm('Are you sure you want to restore this item to its original state?')) {
                try {
                    const response = await fetch(`/api/restore/${item.id}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ originalData: item.originalData || item.originaldata })
                    });
                    if (response.ok) {
                        await nammaModalSystem.alert('Item restored successfully.');
                        // Refresh the history view
                        fetchHistory(selectedEmployeeId, selectedDate);
                    } else {
                        await nammaModalSystem.alert('Error restoring item.');
                    }
                } catch (error) {
                    console.error('Error restoring item:', error);
                    await nammaModalSystem.alert('Error restoring item.');
                }
            }
        }

        function showEditComparison(item) {
            const modal = document.getElementById('edit-comparison-modal');
            const content = document.getElementById('comparison-content');
            content.innerHTML = '';

            const originalData = item.originalData || item.originaldata || {};
            const modifiedData = item.modifiedData || item.modifieddata || {};

            const allKeys = new Set([...Object.keys(originalData), ...Object.keys(modifiedData)]);
            allKeys.delete('id');
            allKeys.delete('timestamp');

            const table = document.createElement('table');
            table.className = 'status-table modern-table';
            
            const headers = ['Field', 'Original Value', 'Modified Value'];
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            Array.from(allKeys).forEach(key => {
                const tr = document.createElement('tr');

                const fieldTd = document.createElement('td');
                fieldTd.innerHTML = `<strong>${key}</strong>`;
                tr.appendChild(fieldTd);

                const originalTd = document.createElement('td');
                let originalValue = originalData[key] || '';
                if (key === 'timestamp' && originalValue) {
                    const date = new Date(originalValue);
                    originalValue = date.toLocaleString('en-US', { hour12: true });
                }
                originalTd.textContent = originalValue;
                originalTd.style.color = '#EF4444';
                tr.appendChild(originalTd);

                const modifiedTd = document.createElement('td');
                let modifiedValue = modifiedData[key] || '';
                if (key === 'timestamp' && modifiedValue) {
                    const date = new Date(modifiedValue);
                    modifiedValue = date.toLocaleString('en-US', { hour12: true });
                }
                modifiedTd.textContent = modifiedValue;
                modifiedTd.style.color = '#10B981';
                modifiedTd.style.fontWeight = '600';
                tr.appendChild(modifiedTd);

                table.appendChild(tr);
            });

            content.appendChild(table);

            const footer = document.createElement('div');
            footer.style.textAlign = 'right';
            footer.style.marginTop = '24px';
            
            const revertBtn = document.createElement('button');
            revertBtn.textContent = 'Revert to Original';
            revertBtn.className = 'modern-btn accent';
            revertBtn.addEventListener('click', () => revertEdit(item));
            footer.appendChild(revertBtn);
            content.appendChild(footer);

            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }

        function closeEditComparisonModal() {
            const modal = document.getElementById('edit-comparison-modal');
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }

        async function revertEdit(item) {
            if (await nammaModalSystem.confirm('Are you sure you want to revert this edit to the original values?')) {
                try {
                    const response = await fetch(`/api/revert-edit/${item.id}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ originalData: item.originaldata })
                    });
                    if (response.ok) {
                        await nammaModalSystem.alert('Edit reverted successfully.');
                        closeEditComparisonModal();
                        // Refresh the history view
                        fetchHistory(selectedEmployeeId, selectedDate);
                    } else {
                        await nammaModalSystem.alert('Error reverting edit.');
                    }
                } catch (error) {
                    console.error('Error reverting edit:', error);
                    await nammaModalSystem.alert('Error reverting edit.');
                }
            }
        }

        async function permanentlyDeleteHistory(item) {
            if (await nammaModalSystem.confirm('Are you sure you want to permanently delete this history entry? This action cannot be undone.', { theme: 'danger' })) {
                try {
                    const response = await fetch(`/api/permanently-delete-history/${item.id}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        await nammaModalSystem.alert('History entry deleted permanently.');
                        // Refresh the history view
                        fetchHistory(selectedEmployeeId, selectedDate);
                    } else {
                        await nammaModalSystem.alert('Error deleting history entry.');
                    }
                } catch (error) {
                    console.error('Error deleting history entry:', error);
                    await nammaModalSystem.alert('Error deleting history entry.');
                }
            }
        }

        function showDataDetails(item) {
            const modal = document.getElementById('data-details-modal');
            const content = document.getElementById('data-details-content');
            content.innerHTML = '';

            let dataToShow;
            if (item.action === 'delete') {
                dataToShow = item.originaldata || {};
            } else if (item.action === 'edit') {
                dataToShow = item.modifieddata || {};
            } else {
                dataToShow = item;
            }

            const allKeys = Object.keys(dataToShow).filter(key => key !== 'id' && key !== 'type' && key !== 'timestamp');

            const table = document.createElement('table');
            table.className = 'status-table modern-table';
            
            const headers = ['Field', 'Value'];
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            allKeys.forEach(key => {
                const tr = document.createElement('tr');

                const fieldTd = document.createElement('td');
                fieldTd.innerHTML = `<strong>${key}</strong>`;
                tr.appendChild(fieldTd);

                const valueTd = document.createElement('td');
                let value = dataToShow[key] || '';
                if (key === 'timestamp' && value) {
                    const date = new Date(value);
                    value = date.toLocaleString('en-US', { hour12: true });
                }
                valueTd.textContent = value;
                tr.appendChild(valueTd);

                table.appendChild(tr);
            });

            content.appendChild(table);

            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }

        function exportToExcel(data) {
            // Get all unique keys from the data
            const allKeys = new Set();
            data.forEach(item => {
                Object.keys(item).forEach(key => {
                    if (key !== 'id') { // Exclude id field
                        allKeys.add(key);
                    }
                });
            });

            // Create a worksheet with custom headers
            const headers = Array.from(allKeys);
            const sheetData = [headers];

            // Add data rows
            data.forEach(item => {
                const row = headers.map(header => item[header] || '');
                sheetData.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            
            // Protect sheet from edits (Read-Only)
            ws['!protect'] = {
                password: "nammamartadmin",
                selectLockedCells: true,
                selectUnlockedCells: true
            };

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, 'report.xlsx');
        }
        // Legacy fetch('/api/employees') removed here because it's handled by admin.js natively.

        // New modal form event handlers for edit and delete actions

        // Open edit modal with pre-filled data
        function openEditModal(item) {
            selectedEmployeeId = item.employeeId || selectedEmployeeId;
            document.getElementById('edit-id').value = item.id || item._id;
            // Convert ISO string to local datetime for input value
            function toLocalDateTime(isoString) {
                if (!isoString) return '';
                const d = new Date(isoString);
                if (isNaN(d.getTime())) return '';
                const off = d.getTimezoneOffset();
                const localDate = new Date(d.getTime() - off * 60 * 1000);
                return localDate.toISOString().slice(0,16);
            }
            document.getElementById('edit-shift-start').value = toLocalDateTime(item.shiftStartTime || '');
            document.getElementById('edit-shift-end').value = toLocalDateTime(item.shiftEndTime || '');
            const counterSelect = document.getElementById('edit-counter');
            counterSelect.value = item.counter || item.counterId || item.counter_id || 'counter 1';
            const pineLabValueInput = document.getElementById('edit-pineLabValue');
            pineLabValueInput.value = item.pineLabValue || item.pine_lab_value || '';
            document.getElementById('edit-reason').value = '';
            
            const modal = document.getElementById('edit-modal');
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);

            // Enable or disable pineLabValue input based on counter selection
            function updatePineLabInput() {
                if (counterSelect.value === 'counter 2') {
                    pineLabValueInput.disabled = true;
                    pineLabValueInput.style.opacity = '0.5';
                    pineLabValueInput.value = '';
                } else {
                    pineLabValueInput.disabled = false;
                    pineLabValueInput.style.opacity = '1';
                }
            }

            counterSelect.removeEventListener('change', updatePineLabInput);
            counterSelect.addEventListener('change', updatePineLabInput);
            updatePineLabInput();
        }

        function closeEditModal() {
            const modal = document.getElementById('edit-modal');
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }

        function openDeleteModal(item) {
            selectedEmployeeId = item.employeeId || selectedEmployeeId;
            document.getElementById('delete-id').value = item.id || item._id;
            document.getElementById('delete-reason-text').value = '';
            
            const modal = document.getElementById('delete-reason-modal');
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }

        function closeDeleteModal() {
            const modal = document.getElementById('delete-reason-modal');
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }

        // Override old edit and delete functions to open modals
        function editCounterData(item) {
            openEditModal(item);
        }

        function deleteCounterData(item) {
            openDeleteModal(item);
        }

        // Handle submission of edit form
        const editForm = document.getElementById('edit-form');
        if (editForm) {
            editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const id = document.getElementById('edit-id').value;
            const employeeId = selectedEmployeeId;
            const shiftStart = document.getElementById('edit-shift-start').value;
            const shiftEnd = document.getElementById('edit-shift-end').value;
            const counter = document.getElementById('edit-counter').value.trim();
            const pineLabValue = document.getElementById('edit-pineLabValue').value.trim();
            const editReason = document.getElementById('edit-reason').value.trim();

            if (!editReason) {
                await nammaModalSystem.alert('Please provide a reason for editing.');
                return;
            }

            try {
                const payload = {
                    shiftStartTimestamp: shiftStart,
                    shiftEndTimestamp: shiftEnd,
                    counter,
                    pineLabValue,
                    editReason
                };
                const response = await fetch(`/api/counter_data/${id}?employeeId=${employeeId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    await nammaModalSystem.alert('Record updated successfully.');
                    closeEditModal();
                    fetchReport(selectedEmployeeId, selectedDate);
                }
            } catch (error) {
                console.error('Error updating record:', error);
                await nammaModalSystem.alert('Error updating record.');
            }
        });
    }

        // Handle submission of delete form
        const deleteReasonForm = document.getElementById('delete-reason-form');
        if (deleteReasonForm) {
            deleteReasonForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const id = document.getElementById('delete-id').value;
            const employeeId = selectedEmployeeId;
            const reason = document.getElementById('delete-reason-text').value.trim();

            if (!reason) {
                await nammaModalSystem.alert('Please provide a reason for deletion.');
                return;
            }

            if (!(await nammaModalSystem.confirm('Are you sure you want to delete this record?', { theme: 'danger' }))) {
                return;
            }

            try {
                const response = await fetch(`/api/counter_data/${id}?employeeId=${employeeId}&reason=${encodeURIComponent(reason)}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    await nammaModalSystem.alert('Record deleted successfully.');
                    closeDeleteModal();
                    fetchReport(selectedEmployeeId, selectedDate);
                }
            } catch (error) {
                console.error('Error deleting record:', error);
                await nammaModalSystem.alert('Error deleting record.');
            }
        });
    }

    // Native Drag and Drop Window Utility
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            
            // Allow native interactions with forms, buttons, dropdowns, links, or table headers
            const tag = e.target.tagName.toLowerCase();
            if(['button', 'span', 'input', 'select', 'textarea', 'label', 'a', 'th'].includes(tag)) return;
            // Allow dragging scrollbar natively
            if (e.offsetX > e.target.clientWidth || e.offsetY > e.target.clientHeight) return;
            
            // Allow text selection
            if (window.getSelection() && window.getSelection().toString() !== '') return;

            e.preventDefault();
            
            const rect = element.getBoundingClientRect();
            
            // Unbind layout constraints instantly for free positioning
            element.style.margin = '0';
            element.style.transform = 'none';
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
            element.style.position = 'fixed';
            element.style.transition = 'none';

            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
    window.makeDraggable = makeDraggable;
        