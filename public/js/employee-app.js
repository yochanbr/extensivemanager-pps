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
    if (viewName === 'login') viewLogin.classList.add('active');
    if (viewName === 'dashboard') viewDashboard.classList.add('active');
}

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
                reportsList.innerHTML = data.reports.slice(0, 5).map(r => `
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
