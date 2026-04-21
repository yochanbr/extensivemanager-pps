// --- SECURITY GUARD --- //
if (localStorage.getItem('adminLoggedIn') !== 'true') {
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
    // --- INACTIVITY MONITOR (1 MINUTE) --- //
    let inactivityTimer;
    const INACTIVITY_LIMIT = 60 * 1000; // 1 minute

    const logoutSession = () => {
        console.log("🔐 Inactivity timeout triggered. Logging out...");
        localStorage.removeItem('adminLoggedIn');
        window.location.href = '/';
    };

    const resetTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logoutSession, INACTIVITY_LIMIT);
    };

    // Initialize the timer
    resetTimer();

    // Reset timer on any significant user activity
    ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        window.addEventListener(event, resetTimer, { passive: true });
    });

    const viewReportBtn = document.querySelector('.view-report-btn');
    const viewEsrJpgsBtn = document.querySelector('.view-esr-jpgs-btn');
    const manageEmployeesBtn = document.querySelector('.manage-employees-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    const settingsBtn = document.querySelector('.update-btn');
    const dashboardBtn = document.querySelector('.dashboard-btn');
    const attendanceBtn = document.querySelector('.attendance-btn');
    const endShiftBtn = document.querySelector('.end-shift-btn') || document.createElement('button');
    const startShiftBtn = document.querySelector('.start-shift-btn') || document.createElement('button');
    const helpBtn = null;
    const updateContainer = document.querySelector('.sidebar') || document.body; // Use sidebar as container for update-available class


    // Function to check for updates
    const checkForUpdates = () => {
        fetch('/api/check-update')
            .then(response => response.json())
            .then(data => {
                if (data.updateAvailable) {
                    updateContainer.classList.add('update-available');
                } else {
                    updateContainer.classList.remove('update-available');
                }
            })
            .catch(error => {
                console.error('Error checking for updates:', error);
            });
    };

    // Check for updates on page load
    checkForUpdates();

    // Check for updates every 5 minutes
    setInterval(checkForUpdates, 5 * 60 * 1000);

    // Settings / Update button click handler is now handled by switchSpaView

    // Function to show update details modal
    const showUpdateDetailsModal = () => {
        const modal = document.getElementById('update-details-modal');
        const content = document.getElementById('update-details-content');
        const proceedBtn = document.getElementById('proceed-update-btn');

        // Show modal and fetch update details
        modal.style.display = 'block';
        content.innerHTML = '<p>Loading update details...</p>';

        fetch('/api/update-details')
            .then(response => response.json())
            .then(data => {
                if (data.details) {
                    const detailsLines = data.details.split('\n').filter(line => line.trim() !== '');
                    const latestUpdate = detailsLines[0] || 'No update details available.';
                    content.innerHTML = `<h3>Latest Update:</h3><p>${latestUpdate}</p>`;
                } else {
                    content.innerHTML = '<p>Unable to fetch update details. Proceed with update anyway?</p>';
                }
            })
            .catch(error => {
                console.error('Error fetching update details:', error);
                content.innerHTML = '<p>Error loading update details. Proceed with update anyway?</p>';
            });

        // Handle proceed button
        proceedBtn.onclick = () => {
            modal.style.display = 'none';
            showUpdateProgressModal();
        };
    };

    // Close update details modal
    const updateDetailsClose = document.getElementById('update-details-close');
    if (updateDetailsClose) {
        updateDetailsClose.addEventListener('click', () => {
            const modal = document.getElementById('update-details-modal');
            modal.style.display = 'none';
        });
    }

    // Close update warning modal
    const updateWarningClose = document.getElementById('update-warning-close');
    if (updateWarningClose) {
        updateWarningClose.addEventListener('click', () => {
            const modal = document.getElementById('update-warning-modal');
            modal.style.display = 'none';
        });
    }

    // Developer Profile Dropdown Toggle
    const profileToggle = document.getElementById('user-profile-toggle');
    const profileDropdown = document.getElementById('profile-dropdown');

    if (profileToggle && profileDropdown) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) {
                profileDropdown.classList.remove('show');
            }
        });
    }



    // Check store status on page load
    fetch('/api/store-status')
        .then(response => response.json())
        .then(data => {
            const statusBadge = document.getElementById('store-status-badge');
            if (data.closed) {
                if (statusBadge) statusBadge.style.display = 'none';
            } else {
                if (statusBadge) statusBadge.style.display = 'flex';
            }
        })
        .catch(error => {
            console.error('Error fetching store status:', error);
        });

    /* viewReportBtn is now SPA routed */

    /* viewEsrJpgsBtn is now SPA routed */

    /* manageEmployeesBtn is now SPA routed */

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('adminLoggedIn');
        window.location.href = '/';
    });




    // Close modal when clicking the close button
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // No auto-oc-modal to close
        });
    }

    // Close employee selection modal
    const employeeSelectionClose = document.getElementById('employee-selection-close');
    if (employeeSelectionClose) {
        employeeSelectionClose.addEventListener('click', () => {
            const modal = document.getElementById('employee-selection-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }
        });
    }

    // Close ESR JPG employee selection modal
    const esrJpgEmployeeSelectionClose = document.getElementById('esr-jpg-employee-selection-close');
    if (esrJpgEmployeeSelectionClose) {
        esrJpgEmployeeSelectionClose.addEventListener('click', () => {
            const modal = document.getElementById('esr-jpg-employee-selection-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }
        });
    }

    // Close ESR JPGs modal
    const esrJpgsClose = document.getElementById('esr-jpgs-close');
    if (esrJpgsClose) {
        esrJpgsClose.addEventListener('click', () => {
            const modal = document.getElementById('esr-jpgs-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }
        });
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('auto-oc-modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
        const employeeModal = document.getElementById('employee-selection-modal');
        if (event.target === employeeModal) {
            employeeModal.style.display = 'none';
        }
        const esrJpgEmployeeModal = document.getElementById('esr-jpg-employee-selection-modal');
        if (event.target === esrJpgEmployeeModal) {
            esrJpgEmployeeModal.style.display = 'none';
        }
        const esrJpgsModal = document.getElementById('esr-jpgs-modal');
        if (event.target === esrJpgsModal) {
            esrJpgsModal.style.display = 'none';
        }
    });



    // Handle employee selection form submission
    const employeeSelectionForm = document.getElementById('employee-selection-form');
    if (employeeSelectionForm) {
        employeeSelectionForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const selectedEmployeeId = document.getElementById('employee-select').value;
            const selectedDate = document.getElementById('shift-summary-date').value;
            if (!selectedEmployeeId) {
                await nammaModalSystem.alert('Please select an employee.');
                return;
            }
            if (!selectedDate) {
                await nammaModalSystem.alert('Please select a date.');
                return;
            }

            // Modernized opening: Use the internal modal to show JPG snapshots
            const modal = document.getElementById('employee-selection-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }

            const reportModal = document.getElementById('shift-summary-report-modal');
            const container = document.getElementById('shift-report-images-container');
            if (reportModal && container) {
                // Show modal first
                reportModal.style.display = 'flex';
                setTimeout(() => reportModal.classList.add('show'), 10);

                // Update modal subtitle
                const subtitle = document.getElementById('shift-report-modal-subtitle');
                if (subtitle) subtitle.textContent = `Report for ${selectedDate}`;

                // Fetch snapshots
                container.innerHTML = `
                    <div class="loading-state" style="padding: 40px; text-align: center; color: #64748B;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i>
                        <p>Fetching snapshots for ${selectedDate}...</p>
                    </div>
                `;

                fetch(`/api/esr-jpgs?employeeId=${selectedEmployeeId}&date=${selectedDate}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.jpgs && data.jpgs.length > 0) {
                            container.innerHTML = '';
                            data.jpgs.forEach(jpg => {
                                const imgCard = document.createElement('div');
                                imgCard.style.width = '100%';
                                imgCard.style.maxWidth = '800px';
                                imgCard.style.boxShadow = '0 10px 30px rgba(0,0,0,0.1)';
                                imgCard.style.borderRadius = '20px';
                                imgCard.style.overflow = 'hidden';
                                imgCard.style.background = 'white';
                                imgCard.style.border = '1px solid #E2E8F0';

                                imgCard.innerHTML = `
                                    <div style="padding: 16px 24px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-weight: 700; color: #1E293B;">Shift ID: ${jpg.shift_id}</span>
                                        <button class="modern-btn secondary" style="padding: 6px 12px; font-size: 12px;" onclick="window.showEsrFullscreen('data:image/jpeg;base64,${jpg.jpgData}')">
                                            <i class="fas fa-expand"></i> Enlarge
                                        </button>
                                    </div>
                                    <img src="data:image/jpeg;base64,${jpg.jpgData}" style="width: 100%; display: block; cursor: zoom-in;" onclick="window.showEsrFullscreen(this.src)">
                                `;
                                container.appendChild(imgCard);
                            });
                        } else {
                            container.innerHTML = `
                                <div style="padding: 60px 40px; text-align: center; color: #64748B;">
                                    <div style="font-size: 48px; color: #1E293B; margin-bottom: 20px;"><i class="fas fa-image-slash"></i></div>
                                    <h3 style="color: #1E293B; margin-bottom: 8px;">No Snapshot Found</h3>
                                    <p>No shift reports were captured for this employee on this date.</p>
                                    <button class="modern-btn primary" style="margin-top: 24px;" onclick="window.openModernShiftSummary('${selectedEmployeeId}', 'Selected Employee')">Try Another Date</button>
                                </div>
                            `;
                        }
                    })
                    .catch(err => {
                        console.error('Error fetching shift reports:', err);
                        container.innerHTML = '<p style="color:red; padding: 40px; text-align: center;">Error loading shift data. Please try again.</p>';
                    });
            }
        });
    }

    let currentEmployeeId = null;

    // Function to fetch and display ESR JPGs
    const fetchAndDisplayEsrJpgs = async (employeeId, date = null) => {
        let url = `/api/esr-jpgs?employeeId=${employeeId}`;
        if (date) {
            url += `&date=${date}`;
        }

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.success) {
                const grid = document.getElementById('esr-jpgs-grid');
                grid.innerHTML = '';

                if (data.jpgs && data.jpgs.length > 0) {
                    data.jpgs.forEach(jpg => {
                        const imageUrl = `data:image/jpeg;base64,${jpg.jpgData}`;
                        const item = document.createElement('div');
                        item.className = 'jpg-item';
                        item.innerHTML = `
                            <img src="${imageUrl}" alt="ESR JPG" onclick="window.open('${imageUrl}', '_blank')">
                            <div class="date">${jpg.date}</div>
                        `;
                        grid.appendChild(item);
                    });
                } else {
                    grid.innerHTML = '<p>No ESR JPGs found for this employee.</p>';
                }

                // Show the JPGs modal
                const jpgsModal = document.getElementById('esr-jpgs-modal');
                jpgsModal.style.display = 'block';
            } else {
                await nammaModalSystem.alert('Error loading ESR JPGs: ' + data.message);
            }
        } catch (error) {
            console.error('Error fetching ESR JPGs:', error);
            await nammaModalSystem.alert('Error loading ESR JPGs.');
        }
    };

    // Handle ESR JPG employee select change to populate dates
    const esrJpgEmployeeSelect = document.getElementById('esr-jpg-employee-select');
    if (esrJpgEmployeeSelect) {
        esrJpgEmployeeSelect.addEventListener('change', async () => {
            const selectedEmployeeId = esrJpgEmployeeSelect.value;
            if (!selectedEmployeeId) {
                document.getElementById('esr-jpg-date-select').innerHTML = '<option value="">Select employee first</option>';
                document.getElementById('esr-jpg-shift-id-select').innerHTML = '<option value="">Select date first</option>';
                return;
            }

            // Fetch ESR JPGs for the selected employee to get available dates
            try {
                const response = await fetch(`/api/esr-jpgs?employeeId=${selectedEmployeeId}`);
                const data = await response.json();
                if (data.success && data.jpgs && data.jpgs.length > 0) {
                    const dateSelect = document.getElementById('esr-jpg-date-select');
                    dateSelect.innerHTML = '<option value="">Select a date</option>';
                    const uniqueDates = [...new Set(data.jpgs.map(jpg => jpg.date))].sort();
                    uniqueDates.forEach(date => {
                        const option = document.createElement('option');
                        option.value = date;
                        option.textContent = date;
                        dateSelect.appendChild(option);
                    });
                } else {
                    document.getElementById('esr-jpg-date-select').innerHTML = '<option value="">No dates available</option>';
                }
                document.getElementById('esr-jpg-shift-id-select').innerHTML = '<option value="">Select date first</option>';
            } catch (error) {
                console.error('Error fetching ESR JPGs for dates:', error);
                await nammaModalSystem.alert('Error loading dates.');
            }
        });
    }

    // Handle ESR JPG date select change to populate shift IDs
    const esrJpgDateSelect = document.getElementById('esr-jpg-date-select');
    if (esrJpgDateSelect) {
        esrJpgDateSelect.addEventListener('change', async () => {
            const selectedEmployeeId = document.getElementById('esr-jpg-employee-select').value;
            const selectedDate = esrJpgDateSelect.value;
            if (!selectedEmployeeId || !selectedDate) {
                document.getElementById('esr-jpg-shift-id-select').innerHTML = '<option value="">Select date first</option>';
                return;
            }

            // Fetch ESR JPGs for the selected employee and date to get available shift IDs
            try {
                const response = await fetch(`/api/esr-jpgs?employeeId=${selectedEmployeeId}&date=${selectedDate}`);
                const data = await response.json();
                if (data.success && data.jpgs && data.jpgs.length > 0) {
                    const shiftIdSelect = document.getElementById('esr-jpg-shift-id-select');
                    shiftIdSelect.innerHTML = '<option value="">Select a shift ID</option>';
                    data.jpgs.forEach(jpg => {
                        const option = document.createElement('option');
                        option.value = jpg.id;
                        option.textContent = jpg.shift_id || 'N/A';
                        shiftIdSelect.appendChild(option);
                    });
                } else {
                    document.getElementById('esr-jpg-shift-id-select').innerHTML = '<option value="">No shift IDs available</option>';
                }
            } catch (error) {
                console.error('Error fetching ESR JPGs for shift IDs:', error);
                await nammaModalSystem.alert('Error loading shift IDs.');
            }
        });
    }

    // Handle ESR JPG employee selection form submission
    const esrJpgEmployeeSelectionForm = document.getElementById('esr-jpg-employee-selection-form');
    if (esrJpgEmployeeSelectionForm) {
        esrJpgEmployeeSelectionForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const selectedEmployeeId = document.getElementById('esr-jpg-employee-select').value;
            const selectedDate = document.getElementById('esr-jpg-date-select').value;
            const selectedShiftId = document.getElementById('esr-jpg-shift-id-select').value;
            if (!selectedEmployeeId) {
                await nammaModalSystem.alert('Please select an employee.');
                return;
            }
            if (!selectedDate) {
                await nammaModalSystem.alert('Please select a date.');
                return;
            }
            if (!selectedShiftId) {
                await nammaModalSystem.alert('Please select a shift ID.');
                return;
            }

            // Fetch and display the specific ESR JPG
            try {
                const response = await fetch(`/api/esr-jpgs?employeeId=${selectedEmployeeId}&date=${selectedDate}`);
                const data = await response.json();
                if (data.success && data.jpgs && data.jpgs.length > 0) {
                    const jpg = data.jpgs.find(j => j.id == selectedShiftId);
                    if (jpg) {
                        const grid = document.getElementById('esr-jpgs-grid');
                        grid.innerHTML = '';
                        const imageUrl = `data:image/jpeg;base64,${jpg.jpgData}`;
                        const item = document.createElement('div');
                        item.className = 'jpg-item';
                        item.innerHTML = `
                            <img src="${imageUrl}" alt="ESR JPG" onclick="window.open('${imageUrl}', '_blank')">
                            <div class="date">${jpg.date} - Shift ID: ${jpg.shift_id}</div>
                        `;
                        grid.appendChild(item);

                        // Show the JPGs modal
                        const jpgsModal = document.getElementById('esr-jpgs-modal');
                        jpgsModal.style.display = 'block';
                    } else {
                        await nammaModalSystem.alert('Selected shift ID not found.');
                    }
                } else {
                    await nammaModalSystem.alert('No ESR JPG found for the selected criteria.');
                }
            } catch (error) {
                console.error('Error fetching ESR JPG:', error);
                await nammaModalSystem.alert('Error loading ESR JPG.');
            }

            // Close the employee selection modal
            const modal = document.getElementById('esr-jpg-employee-selection-modal');
            modal.style.display = 'none';
        });
    }

    // Handle apply date filter
    const applyDateFilterBtn = document.getElementById('apply-date-filter-btn');
    if (applyDateFilterBtn) {
        applyDateFilterBtn.addEventListener('click', async () => {
            if (!currentEmployeeId) {
                await nammaModalSystem.alert('Please select an employee first.');
                return;
            }

            const dateFilter = document.getElementById('esr-jpg-date-filter').value;
            fetchAndDisplayEsrJpgs(currentEmployeeId, dateFilter);
        });
    }

    // Handle clear date filter
    const clearDateFilterBtn = document.getElementById('clear-date-filter-btn');
    if (clearDateFilterBtn) {
        clearDateFilterBtn.addEventListener('click', async () => {
            if (!currentEmployeeId) {
                await nammaModalSystem.alert('Please select an employee first.');
                return;
            }

            document.getElementById('esr-jpg-date-filter').value = '';
            fetchAndDisplayEsrJpgs(currentEmployeeId);
        });
    }

    // Function to show update progress modal
    const showUpdateProgressModal = async () => {
        const modal = document.getElementById('update-progress-modal');
        const progressFill = document.getElementById('progress-fill');
        const progressPercentage = document.getElementById('progress-percentage');
        const remainingTime = document.getElementById('remaining-time');

        modal.style.display = 'block';
        progressFill.style.width = '0%';
        progressPercentage.textContent = '0%';
        remainingTime.textContent = 'Time remaining: Calculating...';

        // Start the update
        try {
            const response = await fetch('/api/update-app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (!data.success) {
                await nammaModalSystem.alert('Update failed: ' + data.message);
                modal.style.display = 'none';
                return;
            }

            // Poll for update status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/update-status');
                    const status = await statusRes.json();
                    if (!status.updateInProgress) {
                        clearInterval(pollInterval);
                        modal.style.display = 'none';
                        await nammaModalSystem.alert('Update completed successfully!');
                        window.location.reload();
                        return;
                    }

                    // Calculate progress (assume 2 minutes total)
                    const startTime = new Date(status.updateStartTime);
                    const now = new Date();
                    const elapsed = (now - startTime) / 1000; // seconds
                    const totalTime = 120; // 2 minutes
                    const progress = (elapsed / totalTime) * 100;

                    progressFill.style.width = Math.min(progress, 100) + '%';
                    progressPercentage.textContent = Math.round(Math.min(progress, 100)) + '%';

                    if (progress >= 100) {
                        remainingTime.textContent = 'Update in progress...';
                    } else {
                        const remaining = Math.max(totalTime - elapsed, 0);
                        const minutes = Math.floor(remaining / 60);
                        const seconds = Math.floor(remaining % 60);
                        remainingTime.textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
                    }
                } catch (error) {
                    console.error('Error polling update status:', error);
                }
            }, 1000); // Poll every second
        } catch (error) {
            console.error('Error starting update:', error);
            await nammaModalSystem.alert('Error starting update.');
            modal.style.display = 'none';
        }
    };
    // Sidebar and View Management

    const dashboardView = document.getElementById('dashboard-view');
    const employeesView = document.getElementById('employees-view');
    const reportsView = document.getElementById('reports-view');
    const shiftSummaryView = document.getElementById('shift-summary-view');
    const attendanceView = document.getElementById('attendance-view');
    const settingsView = document.getElementById('settings-view');

    function switchSpaView(targetView, activeBtn) {
        const views = [dashboardView, employeesView, reportsView, shiftSummaryView, attendanceView, settingsView];
        const buttons = [dashboardBtn, manageEmployeesBtn, viewReportBtn, viewEsrJpgsBtn, attendanceBtn, settingsBtn];

        views.forEach(v => { if (v) v.style.display = 'none'; });
        buttons.forEach(b => { if (b) b.classList.remove('active'); });

        if (targetView) targetView.style.display = 'block';
        if (activeBtn) activeBtn.classList.add('active');

        // Update Topbar Title
        const viewTitle = document.getElementById('view-title');
        if (viewTitle && activeBtn) {
            viewTitle.textContent = activeBtn.innerText.trim();
        }

        // Refresh data based on view
        if (targetView === dashboardView) loadDashboardData();
        if (targetView === employeesView) fetchEmployeesForSPA();
        if (targetView === shiftSummaryView) fetchEmployeesForShiftSummary();
        if (targetView === reportsView) fetchEmployeesForReports();

        if (targetView === attendanceView) {
            window.refreshAttendanceLogs();
        }
        if (targetView === settingsView) {
            if (typeof refreshSystemStatus === 'function') refreshSystemStatus();
            if (typeof fetchSettings === 'function') fetchSettings();
        }
    }

    if (dashboardBtn) dashboardBtn.addEventListener('click', () => switchSpaView(dashboardView, dashboardBtn));
    if (manageEmployeesBtn) manageEmployeesBtn.addEventListener('click', () => switchSpaView(employeesView, manageEmployeesBtn));
    if (viewReportBtn) viewReportBtn.addEventListener('click', () => switchSpaView(reportsView, viewReportBtn));
    if (viewEsrJpgsBtn) viewEsrJpgsBtn.addEventListener('click', () => switchSpaView(shiftSummaryView, viewEsrJpgsBtn));
    if (attendanceBtn) attendanceBtn.addEventListener('click', () => {
        switchSpaView(attendanceView, attendanceBtn);
        // Default to Sessions view (not Raw Logs) on every navigation
        setTimeout(() => window.switchAttendanceView && window.switchAttendanceView('sessions'), 100);
    });
    if (settingsBtn) settingsBtn.addEventListener('click', () => switchSpaView(settingsView, settingsBtn));

    // Dynamic greeting based on time of day
    const dynamicGreeting = document.getElementById('dynamic-greeting');
    if (dynamicGreeting) {
        const hour = new Date().getHours();
        if (hour < 12) dynamicGreeting.textContent = 'Good Morning !';
        else if (hour < 17) dynamicGreeting.textContent = 'Good Afternoon !';
        else dynamicGreeting.textContent = 'Good Evening !';
    }

    // Emergency Master Switch
    const estToggle = document.getElementById('emergency-store-toggle');
    const estIndicator = document.getElementById('est-indicator');
    const estText = document.getElementById('est-text');
    if (estToggle) {
        estToggle.addEventListener('click', async () => {
            // Toggle logic can fall back on startShift/endShift buttons
            await nammaModalSystem.alert('Use Start Shift / End Shift buttons to officially open/close the store.');
        });
    }

    window.staffData = [];
    window.loadDashboardData = async function () {
        try {
            const dateInput = document.getElementById('mainDateFilter');
            const dateStr = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];
            const [empRes, logsRes] = await Promise.all([
                fetch('/api/employees'),
                fetch(`/api/daily-sessions?date=${dateStr}`)
            ]);
            const employees = await empRes.json();
            const logsData = await logsRes.json();
            const sessions = logsData.success ? logsData.sessions : [];

            let active = 0, checkins = 0, breakCount = 0, checkouts = 0, leaveWorked = 0;
            let totalWorkMs = 0, totalBreakMs = 0;
            const filterDropdown = document.getElementById('live-status-filter');
            const filterValue = filterDropdown ? filterDropdown.value : 'all';

            const d = new Date(dateStr);
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const targetDayName = dayNames[d.getDay()];

            // Calculate KPIs and aggregate staffData
            window.staffData = employees.map(emp => {
                const session = sessions.find(s => s.employeeId == emp.id);
                let status = 'absent';
                let statusText = 'Absent';
                let statusColor = '#EF4444'; // Red
                let bg = '#FEE2E2';

                if (session) {
                    checkins++;
                    totalBreakMs += (session.totalBreakDuration || 0);

                    if (session.checkOutTime) {
                        status = 'checkout';
                        statusText = 'Checked Out';
                        statusColor = '#64748b';
                        bg = '#f1f5f9';
                        checkouts++;
                        totalWorkMs += (new Date(session.checkOutTime) - new Date(session.checkInTime)) - (session.totalBreakDuration || 0);
                    } else if (session.isOnBreak) {
                        status = 'break';
                        statusText = 'On Break';
                        statusColor = '#f59e0b';
                        bg = 'rgba(245, 158, 11, 0.1)';
                        breakCount++;
                        totalWorkMs += (new Date() - new Date(session.checkInTime)) - (session.totalBreakDuration || 0);
                    } else {
                        status = 'working';
                        statusText = 'Working';
                        statusColor = '#10b981';
                        bg = 'rgba(16, 185, 129, 0.1)';
                        active++;
                        totalWorkMs += (new Date() - new Date(session.checkInTime)) - (session.totalBreakDuration || 0);
                    }

                    if (emp.workingDays && !emp.workingDays.split(',').includes(targetDayName)) leaveWorked++;
                }

                return { ...emp, status, statusText, statusColor, bg, session };
            });

            // Update UI KPIs
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setVal('dash-checkins', checkins);
            setVal('dash-working', active);
            setVal('dash-break', breakCount);

            // --- ALERT HUB ENGINE ---
            const alerts = [];
            const SHIFT_START_HOUR = 9;
            employees.forEach(emp => {
                const session = sessions.find(s => s.employeeId == emp.id);
                if (session && session.checkInTime) {
                    const checkInDate = new Date(session.checkInTime);
                    const shiftStart = new Date(checkInDate);
                    shiftStart.setHours(SHIFT_START_HOUR, 0, 0, 0);
                    const lateMin = Math.floor((checkInDate - shiftStart) / 60000);
                    if (lateMin > 10) {
                        alerts.push({
                            type: 'late',
                            title: 'Late Arrival',
                            user: emp.name,
                            desc: `Checked in ${lateMin}m late`,
                            color: '#EF4444'
                        });
                    }
                }
            });
            if (window.renderAlertHub) window.renderAlertHub(alerts);

            // Build Table
            const tbody = document.getElementById('live-status-tbody');
            if (tbody) {
                let rowsHtml = '';

                // Active sessions first
                window.staffData.filter(s => s.session).sort((a, b) => new Date(b.session.checkInTime) - new Date(a.session.checkInTime)).forEach(s => {
                    if (filterValue === 'working' && s.status !== 'working') return;
                    if (filterValue === 'break' && s.status !== 'break') return;
                    if (filterValue === 'absent') return;

                    let progressPct = 100;
                    if (s.status !== 'checkout') {
                        const elapsedMs = new Date() - new Date(s.session.checkInTime);
                        progressPct = Math.min((elapsedMs / (9 * 60 * 60 * 1000)) * 100, 100);
                    }

                    const role = s.fullTime === 'yes' ? 'Full Time' : 'Part Time';
                    const timeStr = new Date(s.session.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                    rowsHtml += `
                        <tr>
                            <td><div style="display:flex; align-items:center; gap:10px;"><div style="width:32px; height:32px; border-radius:50%; background:#f1f5f9; color:#64748b; display:flex; justify-content:center; align-items:center; font-weight:600;">${s.name.charAt(0).toUpperCase()}</div><div style="font-weight: 500;">${s.name}</div></div></td>
                            <td><span style="padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:#f1f5f9; color:#475569;">${role}</span></td>
                            <td style="color:#64748b;">${timeStr}</td>
                            <td><span style="padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:${s.bg}; color:${s.statusColor};">${s.statusText}</span></td>
                        </tr>
                    `;
                });

                // Absent staff
                window.staffData.filter(s => !s.session && s.isActive !== false).forEach(s => {
                    if (filterValue === 'working' || filterValue === 'break') return;

                    const role = s.fullTime === 'yes' ? 'Full Time' : 'Part Time';
                    rowsHtml += `
                        <tr>
                            <td><div style="display:flex; align-items:center; gap:10px;"><div style="width:32px; height:32px; border-radius:50%; background:#f1f5f9; color:#64748b; display:flex; justify-content:center; align-items:center; font-weight:600;">${s.name.charAt(0).toUpperCase()}</div><div style="font-weight: 500; color: #94A3B8;">${s.name}</div></div></td>
                            <td><span style="padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:#f1f5f9; color:#475569;">${role}</span></td>
                            <td style="color:#94A3B8;">--:--</td>
                            <td><span style="padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:#FEE2E2; color:#EF4444;">Absent</span></td>
                        </tr>
                    `;
                });

                if (rowsHtml === '') rowsHtml = `<tr><td colspan="4" style="text-align:center; color:#64748B; padding: 20px;">No staff matches your filter.</td></tr>`;
                tbody.innerHTML = rowsHtml;
            }

        } catch (err) {
            console.error("Dashboard Load Error:", err);
        }
    };

    function fetchDashboardStats() { window.loadDashboardData(); }
    function fetchLiveStatus() { window.loadDashboardData(); }

    if (document.getElementById('live-status-filter')) {
        document.getElementById('live-status-filter').addEventListener('change', window.loadDashboardData);
    }

    function initCharts() {
        fetch('/api/bill_paid')
            .then(res => res.json())
            .then(bills => {
                const ctx1 = document.getElementById('revenueBarChart');
                const ctx2 = document.getElementById('revenuePieChart');
                if (!ctx1 || !ctx2 || !window.Chart) return;

                new Chart(ctx1, {
                    type: 'line',
                    data: {
                        labels: ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm'],
                        datasets: [{
                            label: 'Revenue',
                            data: [1200, 1900, 3000, 5000, 2000, 3000, 4500],
                            borderColor: '#3B82F6',
                            tension: 0.4,
                            borderWidth: 3,
                            pointBackgroundColor: '#fff',
                            pointBorderColor: '#3B82F6',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } } }
                });

                new Chart(ctx2, {
                    type: 'doughnut',
                    data: {
                        labels: ['UPI', 'Cash', 'Card'],
                        datasets: [{
                            data: [55, 30, 15],
                            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
                            borderWidth: 0,
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
                });
            });
    }

    // Broadcast logic
    const bInput = document.getElementById('broadcast-message-input');
    const sendBBtn = document.getElementById('send-broadcast-btn');
    const clearBBtn = document.getElementById('clear-broadcast-btn');
    if (sendBBtn && bInput) {
        sendBBtn.addEventListener('click', async () => {
            if (bInput.value.trim()) {
                try {
                    await fetch('/api/broadcast-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: bInput.value.trim() })
                    });
                    await nammaModalSystem.alert('Broadcast emitted!');
                } catch (error) {
                    console.error('Broadcast failed:', error);
                }
            }
        });
    }
    if (clearBBtn && bInput) {
        clearBBtn.addEventListener('click', () => bInput.value = '');
    }

    if (dashboardView) {
        fetchDashboardStats();
        fetchLiveStatus();
        initCharts();
        setInterval(fetchDashboardStats, 60000);


        setInterval(fetchLiveStatus, 60000);
    }


    // SPA Employee Management Logic
    function fetchEmployeesForSPA() {
        fetch('/api/employees')
            .then(res => res.json())
            .then(employees => {
                const container = document.getElementById('spa-employee-list');
                if (!container) return;

                let tableHTML = `
                <div class="table-wrapper">
                    <table class="status-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                if (employees.length === 0) {
                    tableHTML += `<tr><td colspan="3" style="text-align: center;">No employees found.</td></tr>`;
                } else {
                    employees.forEach(emp => {
                        tableHTML += `
                            <tr>
                                <td>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <div style="width:32px; height:32px; border-radius:50%; background:#f1f5f9; color:#64748b; display:flex; justify-content:center; align-items:center; font-weight:600;">
                                            ${(emp.name ? emp.name.charAt(0).toUpperCase() : '?')}
                                        </div>
                                        <div style="font-weight: 500;">${emp.name}</div>
                                    </div>
                                </td>
                                <td><span style="padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:${emp.isActive === false ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color:${emp.isActive === false ? '#ef4444' : '#10b981'};">${emp.isActive === false ? 'Deactivated' : 'Active'}</span></td>
                                <td>
                                    <button class="action-btn secondary" style="padding: 6px 10px; font-size: 12px; border-radius: 8px;" onclick="spaToggleEmployeeStatus('${emp.id}', ${emp.isActive !== false})"><i class="fas fa-${emp.isActive === false ? 'check' : 'ban'}"></i> ${emp.isActive === false ? 'Activate' : 'Deactivate'}</button>
                                    <button class="action-btn secondary" style="padding: 6px 10px; font-size: 12px; margin-left: 5px; border-radius: 8px;" onclick="window.openFaceRegistration('${emp.id}')"><i class="fas fa-camera"></i> Face</button>
                                    <button class="action-btn secondary" style="padding: 6px 10px; font-size: 12px; margin-left: 5px; border-radius: 8px;" onclick="window.spaEditEmployee('${emp.id}')"><i class="fas fa-edit"></i> Edit</button>
                                    <button class="action-btn danger" style="padding: 6px 10px; font-size: 12px; margin-left: 5px; background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px;" onclick="spaDeleteEmployee('${emp.id}')"><i class="fas fa-trash"></i> Delete</button>
                                </td>
                            </tr>
                        `;
                    });
                }

                tableHTML += `
                        </tbody>
                    </table>
                </div>
                `;
                container.innerHTML = tableHTML;
            })
            .catch(err => {
                console.error('Error fetching employees:', err);
                const container = document.getElementById('spa-employee-list');
                if (container) container.innerHTML = '<p style="color:red; padding: 20px;">Failed to load employees.</p>';
            });
    }

    // Attach to "+ Add New Employee" button if it exists
    const spaAddEmployeeBtn = document.getElementById('spa-add-employee-btn');
    if (spaAddEmployeeBtn) {
        spaAddEmployeeBtn.addEventListener('click', () => {
            window.location.href = '/add_employee';
        });
    }

    // Global action: Toggle Employee Status
    window.spaToggleEmployeeStatus = async function (id, isCurrentlyActive) {
        const action = isCurrentlyActive ? 'deactivate' : 'activate';
        if (await nammaModalSystem.confirm(`Are you sure you want to ${action} this employee?`)) {
            fetch('/api/employees/' + id)
                .then(res => res.json())
                .then(emp => {
                    emp.isActive = !isCurrentlyActive;
                    return fetch('/api/employees/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(emp)
                    });
                })
                .then(res => res.json())
                .then(async result => {
                    if (result.success) {
                        fetchEmployeesForSPA();
                    } else {
                        await nammaModalSystem.alert('Failed to update status: ' + result.message);
                    }
                })
                .catch(err => console.error(err));
        }
    };

    // Global action: Delete Employee
    window.spaDeleteEmployee = async function (id) {
        if (await nammaModalSystem.confirm('Are you sure you want to delete this employee?', { theme: 'danger' })) {
            fetch('/api/employees/' + id, { method: 'DELETE' })
                .then(async res => {
                    if (res.ok) fetchEmployeesForSPA();
                    else await nammaModalSystem.alert('Failed to delete employee.');
                })
                .catch(err => console.error(err));
        }
    };

    // SPA Reports Section Logic
    function fetchEmployeesForReports() {
        const container = document.getElementById('reports-employee-list');
        if (!container) return;

        container.innerHTML = '<p style="padding: 40px; text-align: center; color: #64748b;">Loading directory...</p>';

        fetch('/api/employees')
            .then(res => res.json())
            .then(employees => {
                let html = '<div class="reports-grid">';

                if (employees.length === 0) {
                    html = '<p style="padding: 40px; text-align: center; color: #64748b;">No employees found in the directory.</p>';
                } else {
                    employees.forEach(emp => {
                        const initial = emp.name ? emp.name.charAt(0).toUpperCase() : '?';
                        html += `
                            <div class="employee-card">
                                <div class="employee-avatar-large">${initial}</div>
                                <h4>${emp.name}</h4>
                                <div class="employee-id">ID: ${emp.employeeId || 'N/A'}</div>
                                <button class="view-reports-btn" onclick="showModal('${emp.id}')">
                                    <i class="fas fa-file-invoice" style="margin-right: 8px;"></i> View Reports
                                </button>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                container.innerHTML = html;
            })
            .catch(err => {
                console.error('Error fetching employees for reports:', err);
                container.innerHTML = '<p style="color:red; padding: 40px; text-align: center;">Failed to load employee directory.</p>';
            });
    }

    function fetchEmployeesForShiftSummary() {
        const container = document.getElementById('shift-summary-employee-list');
        if (!container) return;

        container.innerHTML = '<p style="padding: 40px; text-align: center; color: #64748b;">Loading directory...</p>';

        fetch('/api/employees')
            .then(res => res.json())
            .then(employees => {
                let html = '<div class="reports-grid">';

                if (employees.length === 0) {
                    html = '<p style="padding: 40px; text-align: center; color: #64748b;">No employees found in the directory.</p>';
                } else {
                    employees.forEach(emp => {
                        const initial = emp.name ? emp.name.charAt(0).toUpperCase() : '?';
                        html += `
                            <div class="employee-card">
                                <div class="employee-avatar-large" style="background: #FEE2E2; color: #EF4444;">${initial}</div>
                                <h4>${emp.name}</h4>
                                <div class="employee-id">ID: ${emp.employeeId || 'N/A'}</div>
                                <div style="display: flex; gap: 8px; margin-top: 10px; width: 100%;">
                                    <button class="view-reports-btn" onclick="openModernShiftSummary('${emp.id}', '${emp.name}')" style="flex: 1;">
                                        <i class="fas fa-flag-checkered" style="margin-right: 8px;"></i> Shift Report
                                    </button>
                                    <button class="view-reports-btn secondary" onclick="openEsrJpgsView('${emp.id}', '${emp.name}')" style="flex: 1; background: #F8FAFC; color: #64748B;">
                                        <i class="fas fa-images"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                container.innerHTML = html;
            })
            .catch(err => {
                console.error('Error fetching employees for shift summary:', err);
                container.innerHTML = '<p style="color:red; padding: 40px; text-align: center;">Failed to load employee directory.</p>';
            });
    }

    // Global action: Open Modern Shift Summary (Modal based)
    window.openModernShiftSummary = function (employeeId, employeeName) {
        // We reuse the existing window.showModal from admin_reports.js 
        // to pick a date, or we can just trigger the employee-selection-modal
        // But the user wants no new tab.

        // Let's set the global variables for the form
        const empSelect = document.getElementById('employee-select');
        if (empSelect) {
            empSelect.value = employeeId;
        }

        const modal = document.getElementById('employee-selection-modal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);

            // Update title
            const title = modal.querySelector('h2');
            if (title) title.textContent = `Shift Summary: ${employeeName}`;
        }
    };

    // Global action: Open ESR JPGs View (Modernized)
    window.openEsrJpgsView = function (employeeId, employeeName) {
        currentEmployeeId = employeeId;
        const modal = document.getElementById('shift-summary-report-modal');
        if (modal) {
            const subtitle = document.getElementById('shift-report-modal-subtitle');
            if (subtitle) subtitle.textContent = `${employeeName}'s Snapshots`;

            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);

            // Load the JPGs
            fetchAndDisplayEsrJpgsInModal(employeeId);
        }
    };

    // Global Modal Closers
    window.closeShiftReportModal = function () {
        const modal = document.getElementById('shift-summary-report-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                const container = document.getElementById('shift-report-images-container');
                if (container) container.innerHTML = '';
            }, 300);
        }
    };

    window.closeEsrListModal = function () {
        const modal = document.getElementById('shift-summary-report-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };

    function fetchAndDisplayEsrJpgsInModal(employeeId) {
        const grid = document.getElementById('shift-report-images-container');
        if (!grid) return;

        grid.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">Loading snapshots...</p>';

        fetch(`/api/esr-jpgs?employeeId=${employeeId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.jpgs && data.jpgs.length > 0) {
                    grid.innerHTML = '';
                    data.jpgs.forEach(jpg => {
                        const imageUrl = `data:image/jpeg;base64,${jpg.jpgData}`;
                        const item = document.createElement('div');
                        item.className = 'jpg-item';
                        item.innerHTML = `
                            <img src="${imageUrl}" alt="ESR" onclick="window.showEsrFullscreen('${imageUrl}')">
                            <div class="jpg-info">
                                <span>${jpg.date}</span>
                                <span>Shift: ${jpg.shift_id}</span>
                            </div>
                        `;
                        grid.appendChild(item);
                    });
                } else {
                    grid.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">No snapshots found for this employee.</p>';
                }
            })
            .catch(err => {
                console.error('Error fetching ESR JPGs:', err);
                grid.innerHTML = '<p style="color:red; text-align: center;">Error loading snapshots.</p>';
            });
    }

    window.showEsrFullscreen = function (src) {
        // Auto-close parent modals to focus on the image
        closeShiftReportModal();
        closeEsrListModal();

        const fsModal = document.getElementById('esr-fullscreen-modal');
        const fsImg = document.getElementById('esr-fullscreen-img');
        if (fsModal && fsImg) {
            fsImg.src = src;
            fsModal.style.display = 'flex';
            setTimeout(() => fsModal.classList.add('show'), 10);
        }
    };

    // Implement Download and Share for ESR snapshots
    document.addEventListener('click', async (e) => {
        const downloadBtn = e.target.closest('#esr-download-btn');
        const shareBtn = e.target.closest('#esr-share-btn');
        const fsImg = document.getElementById('esr-fullscreen-img');

        if (downloadBtn && fsImg && fsImg.src) {
            const link = document.createElement('a');
            link.href = fsImg.src;
            link.download = `NammaMart_ShiftReport_${new Date().toISOString().split('T')[0]}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        if (shareBtn && fsImg && fsImg.src) {
            if (navigator.share) {
                try {
                    // For data URLs, we usually need to convert to a Blob for sharing files
                    const response = await fetch(fsImg.src);
                    const blob = await response.blob();
                    const file = new File([blob], 'ShiftReport.jpg', { type: 'image/jpeg' });

                    await navigator.share({
                        title: 'Extensive Manager Shift Report',
                        text: 'Sharing shift report snapshot.',
                        files: [file]
                    });
                } catch (err) {
                    console.error('Sharing failed:', err);
                    // Fallback: Just share text if files fail
                    navigator.share({
                        title: 'Shift Report',
                        text: 'Check out this shift report snapshot from Extensive Manager.'
                    }).catch(e => console.log('Share failed again:', e));
                }
            } else {
                await nammaModalSystem.alert('Sharing is not supported on this browser. Please download and share manually.');
            }
        }
    });

    // Global action: Edit Employee
    window.spaEditEmployee = function (id) {
        fetch('/api/employees/' + id)
            .then(res => res.json())
            .then(emp => {
                // Populate modal fields safely
                const setVal = (vid, val) => { const el = document.getElementById(vid); if (el) el.value = val !== undefined ? val : ''; };

                setVal('spa-edit-id', emp.id || emp._id);
                setVal('spa-edit-name', emp.name);
                setVal('spa-edit-employee-id', emp.employeeId);
                setVal('spa-edit-address', emp.address);
                setVal('spa-edit-blood-group', emp.bloodGroup);
                setVal('spa-edit-phone', emp.phone);
                setVal('spa-edit-guardian-name', emp.guardianName);
                setVal('spa-edit-relationship', emp.relationship);
                setVal('spa-edit-guardian-phone', emp.guardianPhone);
                setVal('spa-edit-aadhar-number', emp.aadharNumber);

                if (emp.dob && document.getElementById('spa-edit-dob')) {
                    document.getElementById('spa-edit-dob').value = new Date(emp.dob).toISOString().split('T')[0];
                } else {
                    setVal('spa-edit-dob', '');
                }

                setVal('spa-edit-gender', emp.gender);
                setVal('spa-edit-marital-status', emp.maritalStatus);
                setVal('spa-edit-email', emp.email);

                setVal('spa-edit-bank-name', emp.bankName);
                setVal('spa-edit-bank-branch', emp.bankBranch);
                setVal('spa-edit-ifsc-code', emp.ifscCode);
                setVal('spa-edit-account-number', emp.accountNumber);
                setVal('spa-edit-account-holder-name', emp.accountHolderName);
                setVal('spa-edit-pan-number', emp.panNumber);

                const fullTimeEl = document.getElementById('spa-edit-full-time');
                if (fullTimeEl) {
                    fullTimeEl.value = emp.fullTime || '';
                    fullTimeEl.dispatchEvent(new Event('change'));
                }
                setVal('spa-edit-start-time', emp.startTime);
                setVal('spa-edit-end-time', emp.endTime);
                setVal('spa-edit-break-time', emp.breakTime);

                // Checkboxes
                const days = emp.workingDays ? (Array.isArray(emp.workingDays) ? emp.workingDays : emp.workingDays.split(',')) : [];
                document.querySelectorAll('input[name="working-days"]').forEach(cb => {
                    cb.checked = days.includes(cb.value);
                });

                setVal('spa-edit-username', emp.username);
                setVal('spa-edit-password', emp.password);

                const modal = document.getElementById('spa-edit-employee-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    setTimeout(() => modal.classList.add('show'), 10);
                }
            })
            .catch(err => console.error('Error fetching employee:', err));
    };

    // Make edit modal closer workable
    document.querySelectorAll('.close-spa-edit, .close-spa-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('spa-edit-employee-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            }
        });
    });

    // Handle Edit form submission
    const spaEditSaveBtn = document.getElementById('spa-edit-save-btn');
    if (spaEditSaveBtn) {
        spaEditSaveBtn.addEventListener('click', () => {
            const form = document.getElementById('spa-edit-employee-form');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const id = document.getElementById('spa-edit-id').value;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            // Handling checkboxes intentionally
            data['working-days'] = formData.getAll('working-days').join(',');

            // Transform data structure equivalent to edit handling:
            const mappedData = {
                name: data.name,
                employeeId: data['employee-id'],
                address: data.address,
                bloodGroup: data['blood-group'],
                phone: data.phone,
                guardianName: data['guardian-name'],
                relationship: data.relationship,
                guardianPhone: data['guardian-phone'],
                aadharNumber: data['aadhar-number'],
                dob: data.dob,
                gender: data.gender,
                maritalStatus: data['marital-status'],
                email: data.email,
                bankName: data['bank-name'],
                bankBranch: data['bank-branch'],
                ifscCode: data['ifsc-code'],
                accountNumber: data['account-number'],
                accountHolderName: data['account-holder-name'],
                panNumber: data['pan-number'],
                fullTime: data['full-time'],
                startTime: data['start-time'],
                endTime: data['end-time'],
                breakTime: data['break-time'],
                workingDays: data['working-days'],
                username: data.username,
                password: data.password
            };

            fetch('/api/employees/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappedData)
            })
                .then(res => res.json())
                .then(async (result) => {
                    if (result.success) {
                        await nammaModalSystem.alert('Employee details updated successfully!');
                        const modal = document.getElementById('spa-edit-employee-modal');
                        modal.classList.remove('show');
                        setTimeout(() => modal.style.display = 'none', 300);
                        fetchEmployeesForSPA();
                    } else {
                        await nammaModalSystem.alert('Error updating employee: ' + result.message);
                    }
                })
                .catch(async (err) => {
                    console.error(err);
                    await nammaModalSystem.alert('Failed to connect to server.');
                });
        });
    }

    // Toggle full-time specific fields in Edit Modal
    const spaEditFullTimeSelect = document.getElementById('spa-edit-full-time');
    if (spaEditFullTimeSelect) {
        spaEditFullTimeSelect.addEventListener('change', (e) => {
            const timeGroups = document.querySelectorAll('.spa-edit-time-group');
            if (e.target.value === 'yes') {
                timeGroups.forEach(group => group.style.display = 'block');
            } else {
                timeGroups.forEach(group => group.style.display = 'none');
            }
        });
    }

    // Make SPA edit modal draggable
    const spaEditModalParams = document.getElementById('spa-edit-employee-modal');
    const spaEditModalTitleBar = document.querySelector('.modal-title-bar');
    if (spaEditModalParams && spaEditModalTitleBar && window.makeDraggable) {
        window.makeDraggable(spaEditModalParams);
        // Fix initial position for dragging logic if not set
        spaEditModalParams.style.transform = 'translate(-50%, -50%)';
    }

    // --- DASHBOARD REDESIGN LOGIC END ---

    // --- NATIVE ATTENDANCE LOGS LOGIC ---

    // Init dates
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const mainFilter = document.getElementById('mainDateFilter');
    const reportFilter = document.getElementById('reportDateFilter');
    if (mainFilter) mainFilter.value = todayStr;
    if (reportFilter) reportFilter.value = todayStr;

    // Duplicate UI generation code removed to avoid conflicts
    // const settingsView = document.getElementById('settings-view'); // REMOVED TO FIX DUPLICATE


    // --- ADVANCED SETTINGS COMMAND CENTER LOGIC ---
    async function refreshSystemStatus() {
        try {
            const res = await fetch('/api/system/status');
            const data = await res.json();
            if (data.success) {
                const uptimeEl = document.getElementById('system-uptime');
                const storageTotalEl = document.getElementById('system-storage-total');
                const storageEsrEl = document.getElementById('system-storage-esr');

                if (uptimeEl) {
                    const hrs = Math.floor(data.data.uptimeSeconds / 3600);
                    const mins = Math.floor((data.data.uptimeSeconds % 3600) / 60);
                    uptimeEl.textContent = `${hrs}h ${mins}m Active`;
                }
                if (storageTotalEl) storageTotalEl.textContent = data.data.databaseSize;
                if (storageEsrEl) storageEsrEl.textContent = data.data.snapshotsSize;
            }
        } catch (err) {
            console.error('Failed to fetch system status:', err);
        }
    }

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success && data.data) {
                const s = data.data;
                // Apply accent color to document if present in database
                if (s.accentColor) document.documentElement.style.setProperty('--accent-primary', s.accentColor);
                
                // Populate contact info if present
                const emailInput = document.getElementById('admin-contact-email');
                const phoneInput = document.getElementById('admin-contact-phone');
                if (emailInput && s.adminEmail) emailInput.value = s.adminEmail;
                if (phoneInput && s.adminPhone) phoneInput.value = s.adminPhone;
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    }


    const securityForm = document.getElementById('security-hub-form');
    if (securityForm) {
        securityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const current = document.getElementById('current-admin-password').value;
            const nextPass = document.getElementById('new-admin-password').value;
            const nextUser = document.getElementById('new-admin-username').value;
            const nextEmail = document.getElementById('admin-contact-email').value;
            const nextPhone = document.getElementById('admin-contact-phone').value;

            if (!current) return await nammaModalSystem.alert('Current password is required to save changes.');
            if (nextPass && nextPass.length < 6) return await nammaModalSystem.alert('New password must be at least 6 characters');

            try {
                const res = await fetch('/api/settings/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        currentPassword: current, 
                        newPassword: nextPass || null, 
                        newUsername: nextUser || null,
                        newEmail: nextEmail || null,
                        newPhone: nextPhone || null
                    })
                });
                const result = await res.json();
                if (result.success) {
                    await nammaModalSystem.alert('Credentials updated successfully! Kicking off session for security...');
                    // FORCE LOGOUT
                    localStorage.removeItem('adminLoggedIn');
                    window.location.href = '/'; 
                } else {
                    await nammaModalSystem.alert(result.message || 'Verification failed');
                }
            } catch (err) { 
                console.error('Security Update Error:', err);
                await nammaModalSystem.alert('Server error during credential change'); 
            }
        });
    }


    const syncCloudBtn = document.getElementById('sync-cloud-btn');
    if (syncCloudBtn) {
        syncCloudBtn.addEventListener('click', async () => {
            if (!(await nammaModalSystem.confirm('This will export your data and push it to your private GitHub Cloud backup repository. Proceed?'))) return;
            
            const originalContent = syncCloudBtn.innerHTML;
            syncCloudBtn.disabled = true;
            syncCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
            
            try {
                const res = await fetch('/api/system/backup');
                const result = await res.json();
                
                if (result.success) {
                    await nammaModalSystem.alert(`✅ Cloud Sync Complete!\n${result.message}\nTimestamp: ${result.timestamp || 'Just now'}`);
                } else {
                    await nammaModalSystem.alert('❌ Sync Failed: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                console.error('Cloud Sync Error:', err);
                await nammaModalSystem.alert('❌ Network error during sync. Check server logs.');
            } finally {
                syncCloudBtn.disabled = false;
                syncCloudBtn.innerHTML = originalContent;
            }
        });
    }

    const resetBtn = document.getElementById('reset-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!(await nammaModalSystem.confirm('Are you sure you want to reset all settings to factory defaults? This will reset your accent color, theme, and admin password.', { theme: 'danger' }))) return;
            try {
                const res = await fetch('/api/settings/reset', { method: 'POST' });
                const result = await res.json();
                if (result.success) {
                    await nammaModalSystem.alert('Settings restored to defaults! Logging out for security...');
                    window.location.href = '/logout';
                }
            } catch (err) { await nammaModalSystem.alert('Failed to reset settings'); }
        });
    }

    // Initial Dashboard Load
    if (dashboardView) loadDashboardData();

    // Polling Dashboard Data
    setInterval(() => {
        if (dashboardView && dashboardView.style.display !== 'none') {
            loadDashboardData();
        }
    }, 10000);

    // Polling System Health
    setInterval(() => {
        if (settingsView && settingsView.style.display === 'block') {
            refreshSystemStatus();
        }
    }, 5000);

    window.refreshSystemStatus = refreshSystemStatus;
    window.fetchSettings = fetchSettings;

    window.exportExcel = async function () {
        // ... (Existing exportExcel logic)
        if (!window.staffData || window.staffData.length === 0) return await nammaModalSystem.alert('No data to export!');
        const exportData = window.staffData.map(s => {
            const checkInStr = s.session && s.session.checkInTime ? new Date(s.session.checkInTime).toLocaleString() : '-';
            const checkOutStr = s.session && s.session.checkOutTime ? new Date(s.session.checkOutTime).toLocaleString() : '-';
            const totalWorkMs = s.session ? (s.session.checkOutTime ? new Date(s.session.checkOutTime) : new Date()) - new Date(s.session.checkInTime) - (s.session.totalBreakDuration || 0) : 0;

            let workHoursStr = '0h 0m';
            let extraTimeStr = '0h 0m';
            let breakTimeStr = '0h 0m';

            const breakMins = Math.floor((s.session?.totalBreakDuration || 0) / 60000);
            if (breakMins > 0) {
                breakTimeStr = Math.floor(breakMins / 60) + 'h ' + (breakMins % 60) + 'm';
            }

            if (totalWorkMs > 0) {
                const totalMins = Math.floor(totalWorkMs / 60000);
                workHoursStr = Math.floor(totalMins / 60) + 'h ' + (totalMins % 60) + 'm';

                // Assume 8 hour standard shift (480 minutes)
                const standardShiftMins = 480;
                if (totalMins > standardShiftMins) {
                    const extraMins = totalMins - standardShiftMins;
                    extraTimeStr = Math.floor(extraMins / 60) + 'h ' + (extraMins % 60) + 'm';
                }
            }

            // Calculate early arrival / late penalty text for analysis
            let scheduleStatus = "Standard";
            if (s.session && s.session.checkInTime) {
                const checkInDate = new Date(s.session.checkInTime);
                if (checkInDate.getHours() < 9) scheduleStatus = "Early Arrival";
                else if (checkInDate.getHours() > 10) scheduleStatus = "Late Arrival";
            }

            return {
                'Employee Name': s.name,
                'Employee ID': s.id,
                'Role': s.fullTime === 'yes' ? 'Full Time' : 'Part Time',
                'Status': s.statusText,
                'Check-In': checkInStr,
                'Check-Out': checkOutStr,
                'Schedule Status': scheduleStatus,
                'Break Taken': breakTimeStr,
                'Total Work Duration': workHoursStr,
                'Extra Time (Overtime)': extraTimeStr
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "AttendanceLogs");
        XLSX.writeFile(wb, "Face_Attendance_Logs_" + document.getElementById('mainDateFilter').value + ".xlsx");
    };

    // --- ATTENDANCE COMMAND CENTER (LOCAL DB REALTIME ENGINE) ---
    let __logsInterval = null;
    let __currentLogs = [];
    window.selectedLogIds = new Set();

    // Core Polling Loop
    window.fetchLogsRealtime = function () {
        if (__logsInterval) clearInterval(__logsInterval);

        const fetchEngine = async () => {
            const dateFilter = document.getElementById('log-date-filter')?.value || 'today';
            const searchQuery = document.getElementById('log-search-input')?.value.toLowerCase() || '';
            const tbody = document.getElementById('attendance-logs-tbody');

            try {
                // Fetch raw logs from DB (since logs collection tracks EVERYTHING)
                const res = await fetch('/api/attendance/logs/raw?filter=' + dateFilter);
                const data = await res.json();

                if (data.success) {
                    __currentLogs = data.logs;

                    // Filter locally by search
                    let filteredLogs = __currentLogs;
                    if (searchQuery) {
                        filteredLogs = filteredLogs.filter(l => l.employeeName.toLowerCase().includes(searchQuery));
                    }

                    window.renderLogsTable(filteredLogs, tbody);
                    window.calculateAdminSummary(__currentLogs); // Calculate metrics against the full log dataset
                }
            } catch (err) {
                console.error("Realtime sync failed:", err); tbody.innerHTML = "<tr><td>Error: " + err.message + " " + err.stack + "</td></tr>";
            }
        };

        fetchEngine(); // Initial rapid load
        __logsInterval = setInterval(fetchEngine, 3000); // 3-second realtime loop
    };

    window.refreshAttendanceLogs = function () {
        if (!__logsInterval) window.fetchLogsRealtime();
    };

    // --- VIEW TOGGLE CONTROLLER ---
    let __currentAttendanceView = 'sessions'; // default
    let __sessionsInterval = null;

    window.switchAttendanceView = function (view) {
        __currentAttendanceView = view;
        const sessionsWrap = document.getElementById('sessions-view-wrapper');
        const rawWrap = document.getElementById('raw-logs-view-wrapper');
        const sessionBtn = document.getElementById('toggle-sessions-btn');
        const rawBtn = document.getElementById('toggle-raw-btn');

        if (view === 'sessions') {
            if (sessionsWrap) sessionsWrap.style.display = 'block';
            if (rawWrap) rawWrap.style.display = 'none';
            if (sessionBtn) { sessionBtn.style.background = '#6366F1'; sessionBtn.style.color = 'white'; sessionBtn.style.border = 'none'; }
            if (rawBtn) { rawBtn.style.background = '#F8FAFC'; rawBtn.style.color = '#64748B'; rawBtn.style.border = '1px solid #E2E8F0'; }
            // Stop raw-log polling, start sessions polling
            if (__logsInterval) { clearInterval(__logsInterval); __logsInterval = null; }
            window.fetchDailySessions();
        } else {
            if (sessionsWrap) sessionsWrap.style.display = 'none';
            if (rawWrap) rawWrap.style.display = 'block';
            if (rawBtn) { rawBtn.style.background = '#6366F1'; rawBtn.style.color = 'white'; rawBtn.style.border = 'none'; }
            if (sessionBtn) { sessionBtn.style.background = '#F8FAFC'; sessionBtn.style.color = '#64748B'; sessionBtn.style.border = '1px solid #E2E8F0'; }
            // Stop sessions polling, start raw logs polling
            if (__sessionsInterval) { clearInterval(__sessionsInterval); __sessionsInterval = null; }
            window.fetchLogsRealtime();
        }
    };

    // --- DAILY SESSIONS FETCH + RENDER ENGINE ---
    let __currentSessions = [];

    window.fetchDailySessions = function () {
        if (__sessionsInterval) clearInterval(__sessionsInterval);

        const sessionsEngine = async () => {
            const dateFilter = document.getElementById('log-date-filter')?.value || 'today';
            const searchQuery = document.getElementById('log-search-input')?.value.toLowerCase() || '';
            const tbody = document.getElementById('attendance-sessions-tbody');
            if (!tbody) return;

            try {
                // Fetch raw logs and reconstruct sessions client-side
                const res = await fetch('/api/attendance/logs/raw?filter=' + dateFilter);
                const data = await res.json();
                if (!data.success) return;

                const logs = data.logs || [];
                window.calculateAdminSummary(logs); // Update KPI cards

                // Build sessions map per employee per day
                const sessionsMap = {};
                // Sort ascending for correct chronological reconstruction
                const sorted = [...logs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                sorted.forEach(log => {
                    const empId = log.employeeId;
                    const empName = log.employeeName || 'Unknown';
                    if (!sessionsMap[empId]) {
                        sessionsMap[empId] = {
                            empId, empName,
                            checkInTs: null,
                            checkOutTs: null,
                            totalBreakMs: 0,
                            currentBreakStart: null,
                            lastEventTs: null
                        };
                    }
                    const m = sessionsMap[empId];
                    const t = new Date(log.timestamp).getTime() || Date.now();
                    const action = (log.action || log.type || '').toUpperCase();

                    if (action === 'CLOCK_IN' || action === 'CHECK_IN' || action === 'IN') {
                        if (m.checkInTs === null) m.checkInTs = t; // only first check-in
                    } else if (action === 'BREAK_START') {
                        m.currentBreakStart = t;
                    } else if (action === 'BREAK_END' && m.currentBreakStart) {
                        m.totalBreakMs += (t - m.currentBreakStart);
                        m.currentBreakStart = null;
                    } else if (action === 'CLOCK_OUT' || action === 'CHECK_OUT' || action === 'OUT') {
                        m.checkOutTs = t; // always update to latest checkout
                    }
                    m.lastEventTs = t;
                });

                // Convert map to renderable rows — use !== null to avoid falsy-0 bug
                const sessionRows = Object.values(sessionsMap).filter(m => m.checkInTs !== null);

                // Apply search filter
                const filtered = searchQuery
                    ? sessionRows.filter(s => s.empName.toLowerCase().includes(searchQuery))
                    : sessionRows;

                window.renderSessionsTable(filtered, tbody);
            } catch (err) {
                console.error('Sessions fetch error:', err);
                if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:40px;">Sessions load error: ' + err.message + '</td></tr>';
            }
        };

        sessionsEngine();
        __sessionsInterval = setInterval(sessionsEngine, 3000);
    };

    window.renderSessionsTable = function (sessions, tbody) {
        const REQUIRED_MINUTES = 8 * 60; // 8 hours = 480 minutes
        const SHIFT_START_HOUR = 9; // 9:00 AM standard shift start

        if (!sessions || sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:60px;color:#64748B;">No sessions found for selected date.</td></tr>';
            return;
        }

        const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '–';
        const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '–';
        const toMin = (ms) => Math.floor((ms || 0) / 60000);

        let html = '';
        sessions.forEach(s => {
            const now = Date.now();
            const endTs = s.checkOutTs || now; // if still working, use current time
            const isActive = !s.checkOutTs;

            // Break: account for ongoing break
            let totalBreakMs = s.totalBreakMs;
            if (s.currentBreakStart) totalBreakMs += (now - s.currentBreakStart);

            const totalElapsedMs = s.checkInTs ? (endTs - s.checkInTs) : 0;
            const netWorkMs = Math.max(0, totalElapsedMs - totalBreakMs);
            const netWorkMin = toMin(netWorkMs);

            // Extra work if net work > 8h
            const extraMin = Math.max(0, netWorkMin - REQUIRED_MINUTES);
            // Required work hours (standard minus net)
            const workHrMin = Math.min(netWorkMin, REQUIRED_MINUTES);

            // Late time: minutes after 9 AM the employee checked in
            let lateMin = 0;
            if (s.checkInTs) {
                const checkInDate = new Date(s.checkInTs);
                const shiftStart = new Date(checkInDate);
                shiftStart.setHours(SHIFT_START_HOUR, 0, 0, 0);
                lateMin = Math.max(0, toMin(checkInDate - shiftStart));
            }

            // Remarks
            let remarks = [];
            if (isActive) remarks.push('<span style="color:#F59E0B;font-weight:700;">⏳ Active</span>');
            if (s.currentBreakStart) remarks.push('<span style="color:#F59E0B;">On Break</span>');
            if (!s.checkOutTs && !isActive) remarks.push('<span style="color:#EF4444;">No Checkout</span>');
            if (extraMin > 0) remarks.push('<span style="color:#10B981;">+' + extraMin + 'm OT</span>');
            if (lateMin > 10) remarks.push('<span style="color:#EF4444;">Late ' + lateMin + 'm</span>');
            if (lateMin <= 10 && netWorkMin >= REQUIRED_MINUTES) remarks.push('<span style="color:#10B981;">✓ On Time</span>');
            const remarksHtml = remarks.length ? remarks.join(', ') : '–';

            const eInit = s.empName.charAt(0).toUpperCase();
            const rowBg = isActive ? 'background: rgba(16,185,129,0.04);' : '';

            html += `
                <tr style="border-bottom: 1px solid #E2E8F0; ${rowBg}">
                    <td style="font-size:12px;color:#64748B;">${fmtDate(s.checkInTs)}</td>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="width:28px;height:28px;border-radius:50%;background:#6366F115;color:#6366F1;display:flex;justify-content:center;align-items:center;font-size:11px;font-weight:700;">${eInit}</div>
                            <span style="font-weight:600;color:#1E293B;">${s.empName}</span>
                        </div>
                    </td>
                    <td style="font-weight:600;color:#1E293B;">${fmtTime(s.checkInTs)}</td>
                    <td style="color:#F59E0B;font-weight:600;">${toMin(totalBreakMs)} m</td>
                    <td style="font-weight:700;color:#1E293B;">${workHrMin} m</td>
                    <td style="color:${extraMin > 0 ? '#10B981' : '#94A3B8'};font-weight:${extraMin > 0 ? '700' : '400'};">${extraMin > 0 ? '+' + extraMin + ' m' : '—'}</td>
                    <td style="color:${lateMin > 10 ? '#EF4444' : '#94A3B8'};font-weight:${lateMin > 10 ? '700' : '400'};">${lateMin > 0 ? lateMin + ' m' : '—'}</td>
                    <td style="font-size:12px;">${remarksHtml}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    window.renderLogsTable = function (logs, tbody) {
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 60px; color: #64748B;">No attendance activity found matching filters.</td></tr>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const time = new Date(log.timestamp).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            let typeLabel = log.action || log.type || 'Unknown';
            let typeColor = '#64748B'; // Gray fallback
            let statusBadge = log.statusAfter || 'Processing';
            let statusClass = 'idle';

            if (typeLabel === 'CLOCK_IN' || typeLabel === 'IN') { typeColor = '#10B981'; typeLabel = 'Check In'; statusClass = 'working'; }
            else if (typeLabel === 'CLOCK_OUT' || typeLabel === 'OUT') { typeColor = '#EF4444'; typeLabel = 'Check Out'; statusClass = 'idle'; }
            else if (typeLabel === 'BREAK_START') { typeColor = '#F59E0B'; typeLabel = 'Break Start'; statusClass = 'on_break'; }
            else if (typeLabel === 'BREAK_END') { typeColor = '#3B82F6'; typeLabel = 'Break End'; statusClass = 'working'; }

            const checked = window.selectedLogIds.has(log.id) ? 'checked' : '';

            const eName = log.employeeName || 'System Sync';
            const eInit = eName !== 'System Sync' ? eName.charAt(0).toUpperCase() : '?';

            html += `
                <tr style="border-bottom: 1px solid #E2E8F0; transition: background 0.2s;">
                    <td style="text-align: center;"><input type="checkbox" class="log-checkbox" value="${log.id}" ${checked} onchange="window.handleRowSelection()"></td>
                    <td style="font-weight: 500; color: #1E293B; font-size: 13px;">${time}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:28px; height:28px; border-radius:50%; background:#F1F5F9; color:#1E293B; display:flex; justify-content:center; align-items:center; font-size:11px; font-weight:700;">
                                ${eInit}
                            </div>
                            <span style="font-weight:600; color: #1E293B;">${eName}</span>
                        </div>
                    </td>
                    <td><span style="color: ${typeColor}; font-weight: 700; font-size: 12px; border: 1px solid ${typeColor}40; padding: 2px 8px; border-radius: 6px; background: ${typeColor}15;">${typeLabel}</span></td>
                    <td><span class="state-badge ${statusClass}" style="margin: 0;">${statusBadge}</span></td>
                    <td style="text-align: right;">
                        <button class="action-btn secondary" style="padding: 4px 8px; font-size: 11px; background: #EFF6FF; color: #3B82F6; border: none;" onclick="window.editSingleLog('${log.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        window.handleRowSelection(); // Ensure toolbar state matches
    };

    window.toggleAllLogs = function (sourceCheckbox) {
        const checkboxes = document.querySelectorAll('.log-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = sourceCheckbox.checked;
            if (cb.checked) window.selectedLogIds.add(cb.value);
            else window.selectedLogIds.delete(cb.value);
        });
        window.handleRowSelection();
    };

    window.handleRowSelection = function () {
        const checkboxes = document.querySelectorAll('.log-checkbox');
        let selectedCount = 0;
        checkboxes.forEach(cb => {
            if (cb.checked) {
                window.selectedLogIds.add(cb.value);
                cb.closest('tr').style.background = 'rgba(59, 130, 246, 0.15)';
            } else {
                window.selectedLogIds.delete(cb.value);
                if (cb.closest('tr')) cb.closest('tr').style.background = 'transparent';
            }
        });

        selectedCount = window.selectedLogIds.size;
        const toolbar = document.getElementById('bulk-action-toolbar');
        document.getElementById('bulk-count').textContent = selectedCount;

        if (selectedCount > 0) toolbar.style.display = 'flex';
        else toolbar.style.display = 'none';

        const selectAll = document.getElementById('selectAllLogs');
        if (selectAll && checkboxes.length > 0) {
            selectAll.checked = Array.from(checkboxes).every(c => c.checked);
        }
    };

    window.calculateAdminSummary = function (logs) {
        if (!logs) return;
        const empSet = new Set();
        let currentlyWorking = new Set();
        let onBreak = new Set();

        // This simulates reconstructing the daily sessions to find accurate total hours
        const sessionsMap = {};

        logs.forEach(log => {
            empSet.add(log.employeeId);
            const empId = log.employeeId;

            // Latest status tracking
            if (log.statusAfter === 'WORKING') {
                currentlyWorking.add(empId);
                onBreak.delete(empId);
            } else if (log.statusAfter === 'ON_BREAK') {
                onBreak.add(empId);
                currentlyWorking.delete(empId);
            } else if (log.statusAfter === 'IDLE') {
                currentlyWorking.delete(empId);
                onBreak.delete(empId);
            }

            // Session reconstruction engine (Local simulation of server rebuilding)
            if (!sessionsMap[empId]) sessionsMap[empId] = { totalWorkMs: 0, currentCheckIn: null, currentBreakStart: null, totalBreakMs: 0 };
            const m = sessionsMap[empId];
            const t = new Date(log.timestamp).getTime();

            if (log.action === 'CLOCK_IN') m.currentCheckIn = t;
            else if (log.action === 'BREAK_START') m.currentBreakStart = t;
            else if (log.action === 'BREAK_END' && m.currentBreakStart) {
                m.totalBreakMs += (t - m.currentBreakStart);
                m.currentBreakStart = null;
            }
            else if (log.action === 'CLOCK_OUT' && m.currentCheckIn) {
                let sessionWork = (t - m.currentCheckIn);
                // Assume breaks inside this session are captured globally for simplicity here
                m.totalWorkMs += sessionWork;
                m.currentCheckIn = null;
            }
        });

        // Add currently active incomplete sessions
        const nowMs = Date.now();
        Object.values(sessionsMap).forEach(m => {
            if (m.currentBreakStart) m.totalBreakMs += (nowMs - m.currentBreakStart);
            if (m.currentCheckIn) m.totalWorkMs += (nowMs - m.currentCheckIn);
        });

        let totalWorkMsGlobal = 0;
        let totalOvertimeMsGlobal = 0;
        let totalLessTimeMsGlobal = 0;
        const requiredMs = 8 * 60 * 60 * 1000; // 8 hours

        Object.values(sessionsMap).forEach(m => {
            const actualWork = Math.max(0, m.totalWorkMs - m.totalBreakMs);
            totalWorkMsGlobal += actualWork;
            if (actualWork > requiredMs) totalOvertimeMsGlobal += (actualWork - requiredMs);
            if (actualWork > 0 && actualWork < requiredMs) totalLessTimeMsGlobal += (requiredMs - actualWork);
        });

        const fmtHrs = (ms) => Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';

        // --- DASHboard KPI Sync ---
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        setTxt('kpi-total-emps', empSet.size);
        setTxt('kpi-working', currentlyWorking.size);
        setTxt('kpi-break', onBreak.size);
        setTxt('kpi-total-hrs', fmtHrs(totalWorkMsGlobal));
        setTxt('kpi-total-ot', fmtHrs(totalOvertimeMsGlobal));
        setTxt('kpi-total-lt', fmtHrs(totalLessTimeMsGlobal));

        // Dashboard specific cards
        setTxt('dash-working', currentlyWorking.size);
        setTxt('dash-break', onBreak.size);
        setTxt('dash-checkins', logs.filter(l => (l.action || l.type || '').toUpperCase().includes('IN')).length);

        // --- ALERT HUB LOGIC ---
        const alerts = [];
        const SHIFT_START_HOUR = 9;
        const now = new Date();
        const isToday = logs.length > 0 && new Date(logs[0].timestamp).toDateString() === now.toDateString();

        // 1. Missing Check-outs (Only if it's "Today" or we're looking at live data)
        if (isToday) {
            Object.keys(sessionsMap).forEach(empId => {
                const s = sessionsMap[empId];
                if (s.currentCheckIn && !currentlyWorking.has(empId) && !onBreak.has(empId)) {
                    // This case shouldn't really happen with current logic, but a safety check
                }
            });
        }

        // 2. Late Arrivals (>10 mins)
        Object.keys(sessionsMap).forEach(empId => {
            const s = sessionsMap[empId];
            if (s.currentCheckIn) {
                const checkInDate = new Date(s.currentCheckIn);
                const shiftStart = new Date(checkInDate);
                shiftStart.setHours(SHIFT_START_HOUR, 0, 0, 0);
                const lateMin = Math.floor((checkInDate - shiftStart) / 60000);
                if (lateMin > 10) {
                    alerts.push({
                        type: 'late',
                        title: 'Late Arrival',
                        user: logs.find(l => l.employeeId === empId)?.employeeName || 'Staff',
                        desc: `Checked in ${lateMin}m late`,
                        color: '#EF4444'
                    });
                }
            }
        });

        // 3. System Alerts (e.g. No activity yet today)
        if (isToday && logs.length === 0) {
            alerts.push({ type: 'info', title: 'Zero Activity', user: 'System', desc: 'No check-ins recorded today yet.', color: '#3B82F6' });
        }

        renderAlertHub(alerts);
    };

    window.renderAlertHub = function (alerts) {
        const section = document.getElementById('alert-hub-section');
        const container = document.getElementById('alert-list-container');
        const badge = document.getElementById('alert-count-badge');
        if (!section || !container) return;

        if (alerts.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        badge.textContent = `${alerts.length} Issue${alerts.length > 1 ? 's' : ''}`;

        container.innerHTML = alerts.map(a => `
            <div style="background: white; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 12px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: ${a.color}15; color: ${a.color}; display: flex; align-items: center; justify-content: center; font-size: 14px;">
                    <i class="fas fa-${a.type === 'late' ? 'clock' : 'info-circle'}"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 13px; color: #1E293B;">${a.user}</div>
                    <div style="font-size: 11px; color: #64748B;">${a.desc}</div>
                </div>
                <div style="font-size: 10px; font-weight: 700; color: ${a.color}; text-transform: uppercase; letter-spacing: 0.05em;">${a.title}</div>
            </div>
        `).join('');
    };

    // Bulk APIs placeholder hooking
    window.bulkDeleteLogs = async function () {
        if (!(await nammaModalSystem.confirm('Are you sure you want to completely erase the selected raw logs? This will recalculate sessions.', { theme: 'danger' }))) return;
        const ids = Array.from(window.selectedLogIds);
        try {
            const res = await fetch('/api/attendance/logs', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logIds: ids })
            });
            const data = await res.json();
            if (data.success) {
                window.selectedLogIds.clear();
                window.fetchLogsRealtime();
                await nammaModalSystem.alert('Logs deleted and sessions recalculated!');
            }
        } catch (e) { await nammaModalSystem.alert('Deletion failed'); }
    }

    window.bulkChangeAction = async function () {
        const newAction = await nammaModalSystem.prompt('Enter new action (CLOCK_IN, BREAK_START, BREAK_END, CLOCK_OUT):', { placeholder: 'e.g. CLOCK_IN' });
        if (!newAction) return;
        const ids = Array.from(window.selectedLogIds);
        try {
            const res = await fetch('/api/attendance/logs/bulk-edit', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logIds: ids, newAction: newAction.toUpperCase() })
            });
            if ((await res.json()).success) {
                window.selectedLogIds.clear();
                window.fetchLogsRealtime();
            }
        } catch (e) { await nammaModalSystem.alert('Edit failed'); }
    }

    window.rebuildSessions = async function () {
        // Triggers the hard reconstruction algorithm on the backend manually
        try {
            const res = await fetch('/api/attendance/sessions/recalculate', { method: 'POST' });
            if ((await res.json()).success) await nammaModalSystem.alert('Success! Sessions meticulously rebuilt based on raw logs.');
        } catch (e) { await nammaModalSystem.alert('Rebuild failed'); }
    }

    // Attach search/filter listeners
    setTimeout(() => {
        const s = document.getElementById('log-search-input');
        if (s) s.addEventListener('keyup', () => window.fetchLogsRealtime());
        const d = document.getElementById('log-date-filter');
        if (d) d.addEventListener('change', () => window.fetchLogsRealtime());
    }, 1000);

    // --- FACE REGISTRATION LOGIC ---
    let faceMatcher = null;
    let modelsLoaded = false;
    let detectionActive = false;
    let currentRegId = null;

    async function loadModels() {
        if (modelsLoaded) return;
        const status = document.getElementById('face-reg-status');
        if (status) status.textContent = 'Loading AI models...';
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
                faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                faceapi.nets.faceRecognitionNet.loadFromUri('/models')
            ]);
            modelsLoaded = true;
            if (status) status.textContent = 'Models ready. Initializing camera...';
        } catch (err) {
            if (status) status.textContent = 'Failed to load AI models.';
            console.error(err);
        }
    }

    window.openFaceRegistration = async function (employeeId) {
        currentRegId = employeeId;
        const modal = document.getElementById('face-register-modal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }

        await loadModels();
        startCamera();
    };

    window.closeFaceRegistration = function () {
        const modal = document.getElementById('face-register-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }
        stopCamera();
    };

    async function startCamera() {
        const video = document.getElementById('face-reg-video');
        const status = document.getElementById('face-reg-status');
        if (!video) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                detectionActive = true;
                const scannerLine = document.getElementById('face-reg-scanner-line');
                if (scannerLine) scannerLine.style.display = 'block';
                startDetectionLoop();
            };
        } catch (err) {
            if (status) status.textContent = 'Camera access denied.';
            console.error(err);
        }
    }

    function stopCamera() {
        detectionActive = false;
        const video = document.getElementById('face-reg-video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
        }
    }

    async function startDetectionLoop() {
        const video = document.getElementById('face-reg-video');
        const canvas = document.getElementById('face-reg-overlay');
        const status = document.getElementById('face-reg-status');
        const captureBtn = document.getElementById('capture-face-btn');

        if (!video || !canvas || !detectionActive) return;

        const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
        faceapi.matchDimensions(canvas, displaySize);

        const detect = async () => {
            if (!detectionActive) return;
            const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (detections) {
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                faceapi.draw.drawDetections(canvas, resizedDetections);
                if (status) {
                    status.textContent = 'Face detected. Hold steady...';
                    status.style.color = '#10B981';
                }
                if (captureBtn) captureBtn.disabled = false;
                window.lastDescriptor = detections.descriptor;
            } else {
                if (status) {
                    status.textContent = 'Position your face in the center';
                    status.style.color = '#64748B';
                }
                if (captureBtn) captureBtn.disabled = true;
            }
            if (detectionActive) requestAnimationFrame(detect);
        };
        detect();
    }

    if (document.getElementById('capture-face-btn')) {
        document.getElementById('capture-face-btn').addEventListener('click', async () => {
            if (!window.lastDescriptor || !currentRegId) return;

            const btn = document.getElementById('capture-face-btn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/employees/' + currentRegId + '/face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ descriptor: Array.from(window.lastDescriptor) })
                });
                const data = await res.json();
                if (data.success) {
                    await nammaModalSystem.alert('Biometric registration successful!');
                    window.closeFaceRegistration();
                } else {
                    await nammaModalSystem.alert('Failed to register: ' + data.message);
                }
            } catch (err) {
                await nammaModalSystem.alert('Cloud synchronization failed.');
                console.error(err);
            } finally {
                btn.innerHTML = '<i class="fas fa-camera"></i> Capture & Register';
                btn.disabled = false;
            }
        });
    }



window.editSingleLog = async function (logId) {
    window.selectedLogIds.clear();
    window.selectedLogIds.add(logId);
    window.bulkChangeAction(); // Automatically hooks into the robust bulk API but passing single ID
};
});

window.addEventListener('error', function (e) {
    const tbody = document.getElementById('attendance-logs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan=6 style="color:red; padding:40px;">GLOBAL ERROR: ' + e.message + '<br>' + e.filename + ':' + e.lineno + '</td></tr>';
});
window.addEventListener('unhandledrejection', function (e) {
    const tbody = document.getElementById('attendance-logs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan=6 style="color:red; padding:40px;">PROMISE ERROR: ' + e.reason + '</td></tr>';
});
