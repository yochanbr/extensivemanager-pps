/**
 * Employee Mobile App - Frontend Logic
 */

const API_BASE = window.location.origin;

// State Management
let currentEmployee = null;
let authToken = null;

// UI Elements
const viewLogin = document.getElementById('view-login');
const viewDashboard = document.getElementById('view-dashboard');
const loginForm = document.getElementById('employee-login-form');
const loginBtn = document.getElementById('login-submit-btn');
const togglePwdBtn = document.getElementById('toggle-pwd-btn');
const pwdInput = document.getElementById('login-password');
const toastContainer = document.getElementById('toast-container');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing session
    const savedToken = localStorage.getItem('emp_auth_token');
    const savedEmp = localStorage.getItem('emp_data');
    if (savedToken && savedEmp) {
        authToken = savedToken;
        currentEmployee = JSON.parse(savedEmp);
        switchView('dashboard');
        loadDashboardData();
    }
});

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'success') icon = 'fa-check-circle';

    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// View Switching
function switchView(viewName) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(v => v.classList.remove('active'));
    
    if (viewName === 'login') {
        viewLogin.classList.add('active');
        document.getElementById('app-bottom-nav').style.display = 'none';
    } else {
        document.getElementById('app-bottom-nav').style.display = 'flex';
        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) targetView.classList.add('active');
        
        const navBtn = document.querySelector(`.bottom-nav .nav-item[data-target="${viewName}"]`);
        if (navBtn) navBtn.classList.add('active');
        
        if (viewName === 'finance') loadFinanceData();
        if (viewName === 'leaves') loadLeavesData();
    }
}

// Bottom Nav Listeners
document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        switchView(target);
    });
});

// Toggle Password Visibility
togglePwdBtn.addEventListener('click', () => {
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        togglePwdBtn.classList.replace('fa-eye-slash', 'fa-eye');
    } else {
        pwdInput.type = 'password';
        togglePwdBtn.classList.replace('fa-eye', 'fa-eye-slash');
    }
});

// Login Submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = pwdInput.value;

    if (!username || !password) return showToast('Please enter credentials', 'error');

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const response = await fetch(`${API_BASE}/api/employee/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        if (result.success) {
            authToken = result.token;
            currentEmployee = result.employee;
            localStorage.setItem('emp_auth_token', authToken);
            localStorage.setItem('emp_data', JSON.stringify(currentEmployee));
            
            showToast('Login successful!', 'success');
            switchView('dashboard');
            loadDashboardData();
        } else {
            showToast(result.message || 'Invalid credentials', 'error');
        }
    } catch (err) {
        showToast('Network error, please try again.', 'error');
        console.error(err);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Log In</span><i class="fas fa-arrow-right"></i>';
    }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('emp_auth_token');
    localStorage.removeItem('emp_data');
    authToken = null;
    currentEmployee = null;
    loginForm.reset();
    switchView('login');
});

// Load Dashboard Data
async function loadDashboardData() {
    // Set static user details
    const hour = new Date().getHours();
    let greeting = 'Good Evening,';
    if (hour < 12) greeting = 'Good Morning,';
    else if (hour < 17) greeting = 'Good Afternoon,';
    
    document.getElementById('greeting-time').innerText = greeting;
    document.getElementById('nav-employee-name').innerText = currentEmployee.name || currentEmployee.username;
    document.getElementById('nav-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentEmployee.name || currentEmployee.username)}&background=5B21B6&color=fff`;

    // Fetch dynamic stats from backend
    try {
        const response = await fetch(`${API_BASE}/api/employee/dashboard`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.status === 401) {
            // Token expired
            document.getElementById('btn-logout').click();
            return showToast('Session expired, please log in again', 'error');
        }

        const data = await response.json();
        if (data.success) {
            document.getElementById('stat-worked-days').innerText = data.workedDays || '0';
            document.getElementById('stat-leave-balance').innerText = data.leaveBalance || '0';
            
            // Shift Status
            if (data.todayShift) {
                const shiftStart = currentEmployee['start-time'] || '09:00';
                const shiftEnd = currentEmployee['end-time'] || '18:00';
                document.getElementById('shift-expected-time').innerText = `${shiftStart} to ${shiftEnd}`;
                
                const badge = document.getElementById('shift-badge');
                if (data.todayShift.status === 'completed') {
                    badge.innerText = 'Completed';
                    badge.style.background = 'rgba(255,255,255,0.3)';
                } else if (data.todayShift.checkIn) {
                    badge.innerText = 'Clocked In';
                    badge.style.background = 'var(--success)';
                }
            }

            // Reports
            const reportsList = document.getElementById('recent-reports-list');
            if (data.reports && data.reports.length > 0) {
                reportsList.innerHTML = data.reports.map(r => `
                    <div class="report-item">
                        <div class="report-info">
                            <h4>${r.date}</h4>
                            <p>Shift Report</p>
                        </div>
                        <div class="report-status ${r.verified ? 'verified' : 'pending'}">
                            ${r.verified ? 'Verified' : 'Pending'}
                        </div>
                    </div>
                `).join('');
            } else {
                reportsList.innerHTML = '<div class="empty-state">No recent reports found.</div>';
            }
        }
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        showToast('Failed to load latest data', 'error');
    }
}

// ==========================================
// PHASE 2 LOGIC (FINANCE & LEAVES)
// ==========================================

async function loadFinanceData() {
    try {
        const response = await fetch(`${API_BASE}/api/employee/finance`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('finance-live-salary').innerText = data.liveSalary || '0';
            
            // Render Ledger
            const ledgerList = document.getElementById('finance-ledger-list');
            if (data.ledger && data.ledger.length > 0) {
                ledgerList.innerHTML = data.ledger.map(l => `
                    <div class="report-item">
                        <div class="report-info">
                            <h4>${l.date}</h4>
                            <p>${l.description}</p>
                        </div>
                        <h4 style="color: var(--danger)">-₹${l.amount}</h4>
                    </div>
                `).join('');
            } else {
                ledgerList.innerHTML = '<div class="empty-state">No pending deductions!</div>';
            }
            
            // Render Payslips (Placeholder for now until PDFs are piped)
            document.getElementById('finance-payslips-list').innerHTML = '<div class="empty-state">No payslips generated yet.</div>';
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadLeavesData() {
    try {
        const response = await fetch(`${API_BASE}/api/employee/leaves`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('leaves-balance-display').innerText = data.leaveBalance || '0';
            
            const historyList = document.getElementById('leaves-history-list');
            if (data.requests && data.requests.length > 0) {
                historyList.innerHTML = data.requests.map(r => `
                    <div class="report-item">
                        <div class="report-info">
                            <h4>${r.date}</h4>
                            <p>${r.type.toUpperCase()}</p>
                        </div>
                        <div class="report-status ${r.status === 'approved' ? 'verified' : r.status === 'rejected' ? 'danger' : 'pending'}">
                            ${r.status}
                        </div>
                    </div>
                `).join('');
            } else {
                historyList.innerHTML = '<div class="empty-state">No leave requests found.</div>';
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// Leave Request UI Logic
const btnRequestLeave = document.getElementById('btn-request-leave');
const formContainer = document.getElementById('leave-request-form-container');
const btnCancelLeave = document.getElementById('btn-cancel-leave');
const btnSubmitLeave = document.getElementById('btn-submit-leave');

btnRequestLeave.addEventListener('click', () => {
    formContainer.style.display = 'block';
    btnRequestLeave.style.display = 'none';
});

btnCancelLeave.addEventListener('click', () => {
    formContainer.style.display = 'none';
    btnRequestLeave.style.display = 'block';
});

btnSubmitLeave.addEventListener('click', async () => {
    const date = document.getElementById('leave-date').value;
    const type = document.getElementById('leave-type').value;
    const reason = document.getElementById('leave-reason').value;

    if (!date) return showToast('Please select a date', 'error');

    btnSubmitLeave.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/api/employee/leave-request`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ date, type, reason })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Leave request submitted!', 'success');
            formContainer.style.display = 'none';
            btnRequestLeave.style.display = 'block';
            loadLeavesData(); // Refresh list
        } else {
            showToast(data.message || 'Failed to submit', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    } finally {
        btnSubmitLeave.disabled = false;
    }
});
