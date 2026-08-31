
const API_BASE = window.location.origin;
let appState = {
    employee: null,
    dashboard: null,
    finance: null,
    leaves: null
};

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('emp_auth_token');
    if (token) {
        switchView('dashboard');
        bootstrapApp();
    }
});

function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + (type==='error'?'error':'success');
    t.innerHTML = '<i class="fas fa-'+(type==='error'?'exclamation':'check')+'-circle"></i> <span>'+msg+'</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = 0; setTimeout(()=>t.remove(), 300); }, 3000);
}

function switchView(view) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
    
    if (view === 'login') {
        document.getElementById('view-login').classList.add('active');
        document.getElementById('app-bottom-nav').style.display = 'none';
    } else {
        document.getElementById('view-'+view).classList.add('active');
        document.getElementById('app-bottom-nav').style.display = 'flex';
        document.querySelector('.nav-item[data-target="'+view+'"]').classList.add('active');
    }
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-target')));
});

document.getElementById('employee-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(API_BASE+'/api/employee/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p})
        });
        const data = await res.json();
        if(data.success) {
            localStorage.setItem('emp_auth_token', data.token);
            switchView('dashboard');
            bootstrapApp();
        } else {
            showToast(data.message, 'error');
        }
    } catch(err) { showToast('Network Error', 'error'); }
    btn.innerHTML = 'Log In <i class="fas fa-arrow-right"></i>';
});

function logout() {
    localStorage.removeItem('emp_auth_token');
    appState = {};
    switchView('login');
}

async function bootstrapApp() {
    const cacheKey = 'emp_bootstrap_v1';
    document.getElementById('app-loader').style.display = 'flex';

    // If we have cached bootstrap data, render immediately for instant UX
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            appState = parsed;
            renderAllViews();
        } catch (e) { /* ignore parse errors */ }

        // Background revalidation: fetch fresh data and update if changed
        (async () => {
            try {
                const res = await fetch(API_BASE + '/api/employee/bootstrap', {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('emp_auth_token') }
                });
                if (res.status === 401) return logout();
                const json = await res.json();
                if (json.success) {
                    const newDataStr = JSON.stringify(json.data);
                    if (newDataStr !== cached) {
                        sessionStorage.setItem(cacheKey, newDataStr);
                        appState = json.data;
                        renderAllViews();
                        showToast('App updated', 'info');
                    }
                }
            } catch (err) { console.log('Background revalidate failed', err); }
            document.getElementById('app-loader').style.display = 'none';
        })();

        return;
    }

    // No cache: fetch and persist
    try {
        const res = await fetch(API_BASE + '/api/employee/bootstrap', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('emp_auth_token') }
        });
        console.log('[bootstrap] response status', res.status);
        if (res.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            return logout();
        }
        const json = await res.json();
        console.log('[bootstrap] payload', json);
        if (json && json.success) {
            appState = json.data;
            try { sessionStorage.setItem(cacheKey, JSON.stringify(appState)); } catch (e) {}
            renderAllViews();
        } else {
            const msg = (json && json.message) ? json.message : 'Failed to load app data';
            showToast(msg, 'error');
            console.warn('[bootstrap] non-success payload', json);
        }
    } catch (e) {
        showToast('Failed to sync app data', 'error');
    }
    document.getElementById('app-loader').style.display = 'none';
}

function renderAllViews() {
    // 1. Dashboard
    const hour = new Date().getHours();
    document.getElementById('greeting-time').innerText = hour < 12 ? 'Good Morning,' : (hour < 17 ? 'Good Afternoon,' : 'Good Evening,');
    document.getElementById('nav-employee-name').innerText = appState.employee.name;
    document.getElementById('nav-avatar').src = 'https://ui-avatars.com/api/?name='+encodeURIComponent(appState.employee.name)+'&background=000&color=fff';
    
    document.getElementById('db-worked-days').innerText = appState.dashboard.workedDays;
    document.getElementById('db-leave-balance').innerText = appState.employee.leaveBalance;
    
    if (appState.dashboard.todayShift) {
        document.getElementById('db-shift-status').innerText = 'Clocked In';
    }
    
    const rList = document.getElementById('db-reports-list');
    rList.innerHTML = appState.dashboard.recentReports.map(r => 
        '<div class="list-item" onclick="viewReport(\''+r.id+'\')"><div class="item-icon blue"><i class="fas fa-file-invoice"></i></div><div class="item-info"><h4 class="item-title">'+r.date+'</h4><p class="item-sub">Shift Report</p></div><div class="item-right"><span class="item-badge badge-success">Verified</span></div></div>'
    ).join('') || '<p style="text-align:center; color: #64748B; margin-top:20px;">No reports yet.</p>';
    
    // 2. Finance
    document.getElementById('fin-live-salary').innerText = appState.finance.liveSalary.toLocaleString('en-IN');
    const pList = document.getElementById('fin-payslips-list');
    pList.innerHTML = appState.finance.payslips.map((p, i) => {
        const isNewFormat = !!p.earnings;
        const netPay = isNewFormat ? (p.earnings.basic + (p.earnings.allowances?.hra||0) + (p.earnings.allowances?.overtime||0) + (p.earnings.allowances?.other||0) - (p.deductions?.lop||0) - (p.deductions?.esi||0) - (p.deductions?.other||0)) : (p.netPay || 0);
        const dateObj = new Date(p.month + '-01');
        const monthName = dateObj.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        return '<div class="list-item" onclick="viewPayslip('+i+')"><div class="item-icon green"><i class="fas fa-money-check-alt"></i></div><div class="item-info"><h4 class="item-title">'+monthName+'</h4><p class="item-sub">Payslip</p></div><div class="item-right"><h4 class="item-title">₹'+netPay.toLocaleString('en-IN')+'</h4></div></div>';
    }).join('') || '<p style="text-align:center; color: #64748B; margin-top:20px;">No payslips generated.</p>';
    
    // 3. Leaves
    const lList = document.getElementById('leaves-history-list');
    lList.innerHTML = appState.leaves.requests.map(r => {
        const title = r.isSwap ? 'Shift Swap' : (r.type === 'sick' ? 'Sick Leave' : 'Casual Leave');
        let badgeClass = r.status === 'approved' ? 'badge-success' : (r.status === 'rejected' ? 'badge-error' : 'badge-pending');
        return '<div class="list-item"><div class="item-icon '+(r.isSwap?'orange':'blue')+'"><i class="fas fa-'+(r.isSwap?'exchange-alt':'calendar-minus')+'"></i></div><div class="item-info"><h4 class="item-title">'+title+'</h4><p class="item-sub">'+(r.date||r.startDate)+'</p></div><div class="item-right"><span class="item-badge '+badgeClass+'" style="text-transform:capitalize;">'+(r.status||'Pending')+'</span></div></div>';
    }).join('') || '<p style="text-align:center; color: #64748B; margin-top:20px;">No requests found.</p>';
}

function openSheet(id) { document.getElementById(id).classList.add('show'); }
function closeSheet(id) { document.getElementById(id).classList.remove('show'); }

function viewPayslip(idx) {
    const p = appState.finance.payslips[idx];
    const isNewFormat = !!p.earnings;
    const basic = isNewFormat ? p.earnings.basic : (p.basicSalary || 0);
    const gross = isNewFormat ? basic + (p.earnings.allowances?.hra||0) + (p.earnings.allowances?.overtime||0) + (p.earnings.allowances?.other||0) : basic;
    const totalDed = isNewFormat ? (p.deductions?.lop||0) + (p.deductions?.esi||0) + (p.deductions?.other||0) : (p.lopAmount||0);
    const net = gross - totalDed;
    
    const dateObj = new Date(p.month + '-01');
    document.getElementById('ps-modal-month').innerText = dateObj.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    
    document.getElementById('ps-modal-content').innerHTML = 
        '<div style="background: #F1F5F9; border-radius: 16px; padding: 16px; margin-bottom: 20px;"><div style="display:flex; justify-content:space-between; margin-bottom:12px;"><span style="color:#64748B;">Gross Pay</span><span style="font-weight:600;">₹'+gross.toLocaleString()+'</span></div><div style="display:flex; justify-content:space-between; margin-bottom:12px;"><span style="color:#64748B;">Deductions</span><span style="font-weight:600; color:var(--danger)">-₹'+totalDed.toLocaleString()+'</span></div><div style="display:flex; justify-content:space-between; padding-top:12px; border-top:1px dashed #CBD5E1;"><span style="font-weight:600; font-size:16px;">Net Pay</span><span style="font-weight:800; font-size:20px; color:var(--success);">₹'+net.toLocaleString()+'</span></div></div>';
        
    openSheet('payslip-sheet');
}

function viewReport(id) {
    const r = appState.dashboard.recentReports.find(x => x.id === id);
    if(r) {
        document.getElementById('rep-modal-date').innerText = r.date;
        document.getElementById('rep-modal-sales').innerText = '₹' + (r.totalSales || 0).toLocaleString();
        openSheet('report-sheet');
    }
}

async function submitLeave() {
    showToast('Leave request sent!', 'success');
    closeSheet('leave-sheet');
}
async function submitSwap() {
    showToast('Swap request sent!', 'success');
    closeSheet('swap-sheet');
}
