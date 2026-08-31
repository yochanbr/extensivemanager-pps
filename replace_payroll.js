const fs = require('fs');

let adminHtml = fs.readFileSync('public/html/admin.html', 'utf8');
let adminJs = fs.readFileSync('public/js/admin.js', 'utf8');

// We need to replace the entire <section id="view-payroll"> ... </section>
const payrollSectionRegex = /<section id="view-payroll" class="admin-view rq-view">[\s\S]*?<\/section>/;
const newPayrollSection = \
        <section id="view-payroll" class="admin-view rq-view">
            <!-- Page Header -->
            <header class="rq-header" style="border-bottom: 1px solid #E2E8F0; padding-bottom: 24px; margin-bottom: 24px;">
                <div class="rq-header-left">
                    <div class="rq-header-icon" style="background: linear-gradient(135deg, #F95A2C 0%, #D9381E 100%); color: white; box-shadow: 0 4px 12px rgba(249, 90, 44, 0.25);"><i class="fas fa-file-invoice-dollar"></i></div>
                    <div class="rq-header-text">
                        <h2 class="rq-title" style="font-size: 24px; letter-spacing: -0.02em;">Payroll & Compensation</h2>
                        <p class="rq-subtitle" style="font-size: 14px; color: #64748B;">Manage employee salaries, payslips and monthly payroll</p>
                    </div>
                </div>
                <div class="rq-header-actions" style="display: flex; gap: 12px; align-items: center;">
                    <div style="display: flex; align-items: center; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC; padding: 4px; gap: 8px; font-weight: 600; font-size: 14px;">
                        <button onclick="window.changePayrollMonth(-1)" style="border:none; background:transparent; cursor:pointer; color:#64748B; padding:4px 8px; border-radius:4px;"><i class="fas fa-chevron-left"></i></button>
                        <span id="payroll-current-month-display" style="min-width: 120px; text-align: center; color: #0F172A;">August 2026</span>
                        <input type="month" id="payroll-month-selector" style="display:none;" onchange="window.setPayrollMonth(this.value)">
                        <button onclick="document.getElementById('payroll-month-selector').showPicker()" style="border:none; background:transparent; cursor:pointer; color:#64748B; padding:4px 8px; border-radius:4px;"><i class="fas fa-caret-down"></i></button>
                        <button onclick="window.changePayrollMonth(1)" style="border:none; background:transparent; cursor:pointer; color:#64748B; padding:4px 8px; border-radius:4px;"><i class="fas fa-chevron-right"></i></button>
                    </div>
                    
                    <button class="req-action-btn" onclick="window.openPayslipConfig()" style="background: #090B10; color: white; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <i class="fas fa-plus"></i> Generate Payslip
                    </button>
                </div>
            </header>

            <!-- Stats -->
            <div class="req-stats-row" style="grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 32px;">
                <!-- Card 1 -->
                <div class="req-stat-card" style="background: white; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; grid-column: span 2;">
                    <div class="req-stat-label" style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 4px;">Total Payroll</div>
                    <div class="req-stat-value" id="payroll-stat-total" style="font-size: 24px; font-weight: 800; color: #0F172A;">₹0</div>
                    <div class="req-stat-label" style="font-size: 12px; color: #94A3B8; margin-top: 4px;" id="payroll-stat-total-label">For selected month</div>
                </div>
                <!-- Card 2 -->
                <div class="req-stat-card" style="background: white; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; grid-column: span 1;">
                    <div class="req-stat-label" style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 4px;">Employees Paid</div>
                    <div class="req-stat-value" id="payroll-stat-paid" style="font-size: 24px; font-weight: 800; color: #0F172A;">0 / 0</div>
                </div>
                <!-- Card 3 -->
                <div class="req-stat-card" style="background: white; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; grid-column: span 1;">
                    <div class="req-stat-label" style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 4px;">Payslips</div>
                    <div class="req-stat-value" id="payroll-stat-slips" style="font-size: 24px; font-weight: 800; color: #0F172A;">0</div>
                </div>
                <!-- Card 4 -->
                <div class="req-stat-card" style="background: white; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; grid-column: span 1;">
                    <div class="req-stat-label" style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 4px;">Average Net</div>
                    <div class="req-stat-value" id="payroll-stat-avg" style="font-size: 24px; font-weight: 800; color: #0F172A;">₹0</div>
                </div>
                <!-- Card 5 -->
                <div class="req-stat-card" style="background: white; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; grid-column: span 1;">
                    <div class="req-stat-label" style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 4px;">Payroll Status</div>
                    <div class="req-stat-value" id="payroll-stat-status" style="font-size: 20px; font-weight: 700; color: #059669; display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <i class="fas fa-circle" style="font-size: 10px;"></i> Ready
                    </div>
                </div>
            </div>

            <!-- Ledger -->
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #E2E8F0; background: #FAFAFA; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #0F172A;">Payroll Ledger</h3>
                    <div style="display: flex; gap: 12px;">
                        <div style="position: relative;">
                            <i class="fas fa-search" style="position: absolute; left: 12px; top: 10px; color: #94A3B8;"></i>
                            <input type="text" id="payroll-search-input" oninput="window.filterAdminPayroll()" placeholder="Search employee or ID..." style="padding: 8px 12px 8px 36px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; width: 240px; outline: none;">
                        </div>
                        <select id="payroll-status-filter" onchange="window.filterAdminPayroll()" style="padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; background: white; outline: none; cursor: pointer;">
                            <option value="all">All Status</option>
                            <option value="published">Published</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table class="premium-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Employee</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Basic</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Allowances</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Deductions</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">LOP</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Net Pay</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                                <th style="padding: 16px 24px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-payslip-history-list">
                            <!-- Items will be injected here -->
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Off-canvas drawer for Payslip Detail -->
            <div id="payslip-drawer-overlay" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.4); z-index:9998; backdrop-filter:blur(2px);" onclick="window.closePayslipDrawer()"></div>
            <div id="payslip-detail-drawer" style="position:fixed; top:0; right:-500px; width:400px; max-width:100%; height:100%; background:white; z-index:9999; box-shadow:-5px 0 25px rgba(0,0,0,0.1); transition: right 0.3s ease; display:flex; flex-direction:column;">
                <div style="padding: 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0; font-size: 18px; font-weight: 700; color: #0F172A;">Payslip Details</h3>
                    <button onclick="window.closePayslipDrawer()" style="background:transparent; border:none; font-size: 20px; color: #64748B; cursor: pointer;">&times;</button>
                </div>
                <div id="payslip-drawer-content" style="padding: 24px; overflow-y: auto; flex: 1;">
                    <!-- Content injected via JS -->
                </div>
            </div>
        </section>\

adminHtml = adminHtml.replace(payrollSectionRegex, newPayrollSection);

// We also need to redesign the payslip-config-modal.
const oldModalRegex = /<div class="modal-overlay" id="payslip-config-modal">[\s\S]*?<\/div>\s*<!-- PAYSLIP PREVIEW MODAL -->/;
const newWizardModal = \
    <div class="modal-overlay" id="payslip-config-modal" style="display: none; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);">
        <div class="modern-modal" style="width: 500px; max-width: 95%; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
            <div class="modern-modal-header" style="background: #F8FAFC; padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #0F172A;"><i class="fas fa-magic" style="color: #F95A2C; margin-right: 8px;"></i> Payslip Wizard</h2>
                <button onclick="window.closePayslipConfig()" style="background: transparent; border: none; font-size: 24px; color: #64748B; cursor: pointer;">&times;</button>
            </div>
            
            <div style="display: flex; background: #F1F5F9; padding: 12px 24px; font-size: 12px; font-weight: 600; color: #64748B; gap: 8px; justify-content: space-between;">
                <span id="pw-step-1" style="color: #F95A2C;">1. Employee</span> <i class="fas fa-chevron-right" style="font-size:10px; margin-top:2px;"></i>
                <span id="pw-step-2">2. Earnings</span> <i class="fas fa-chevron-right" style="font-size:10px; margin-top:2px;"></i>
                <span id="pw-step-3">3. Deductions</span> <i class="fas fa-chevron-right" style="font-size:10px; margin-top:2px;"></i>
                <span id="pw-step-4">4. Review</span>
            </div>

            <div class="modern-modal-body" style="padding: 24px; max-height: 70vh; overflow-y: auto;">
                <form id="payslip-config-form">
                    
                    <!-- STEP 1: Employee & Period -->
                    <div id="payslip-step-1-ui">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Select Employee</label>
                            <select id="payslip-employee-select" class="modern-input" style="height: 50px; font-size: 15px; width: 100%; border: 1px solid #CBD5E1; border-radius: 8px;" required>
                                <option value="">Loading employees...</option>
                            </select>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Payroll Period</label>
                            <input type="month" id="payslip-month-input" class="modern-input" style="height: 50px; font-size: 15px; width: 100%; border: 1px solid #CBD5E1; border-radius: 8px;" required>
                        </div>
                        <button type="button" class="modern-btn accent" onclick="window.wizardGoToStep(2)" style="width: 100%; height: 50px; font-size: 16px; font-weight: 700; background: #0F172A; color: white; border: none; border-radius: 8px;">Next: Earnings <i class="fas fa-arrow-right" style="margin-left: 8px;"></i></button>
                    </div>

                    <!-- STEP 2: Earnings -->
                    <div id="payslip-step-2-ui" style="display: none;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Basic Pay (₹)</label>
                                <input type="number" id="payslip-basic-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0" required>
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Allowances (₹)</label>
                                <input type="number" id="payslip-allowance-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Overtime (₹)</label>
                                <input type="number" id="payslip-ot-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Other Earnings (₹)</label>
                                <input type="number" id="payslip-other-earn-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="button" class="modern-btn" onclick="window.wizardGoToStep(1)" style="flex: 1; height: 50px; background: white; border: 1px solid #CBD5E1; border-radius: 8px; color: #475569; font-weight: 600;">Back</button>
                            <button type="button" class="modern-btn accent" onclick="window.wizardGoToStep(3)" style="flex: 2; height: 50px; background: #0F172A; color: white; border: none; border-radius: 8px; font-weight: 700;">Next: Deductions <i class="fas fa-arrow-right" style="margin-left: 8px;"></i></button>
                        </div>
                    </div>

                    <!-- STEP 3: Deductions -->
                    <div id="payslip-step-3-ui" style="display: none;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">LOP / Shortage (₹)</label>
                                <input type="number" id="payslip-lop-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">ESI (₹)</label>
                                <input type="number" id="payslip-esi-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Other Deductions (₹)</label>
                                <input type="number" id="payslip-other-deduct-input" class="modern-input" style="height: 50px; width:100%; border-radius:8px;" value="0">
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="button" class="modern-btn" onclick="window.wizardGoToStep(2)" style="flex: 1; height: 50px; background: white; border: 1px solid #CBD5E1; border-radius: 8px; color: #475569; font-weight: 600;">Back</button>
                            <button type="button" class="modern-btn accent" onclick="window.wizardGoToStep(4)" style="flex: 2; height: 50px; background: #0F172A; color: white; border: none; border-radius: 8px; font-weight: 700;">Review <i class="fas fa-eye" style="margin-left: 8px;"></i></button>
                        </div>
                    </div>

                    <!-- STEP 4: Review -->
                    <div id="payslip-step-4-ui" style="display: none;">
                        <div id="payslip-review-content" style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px; font-family: monospace; font-size: 13px; color: #0F172A;">
                            <!-- Injected by JS -->
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="button" class="modern-btn" onclick="window.wizardGoToStep(3)" style="flex: 1; height: 50px; background: white; border: 1px solid #CBD5E1; border-radius: 8px; color: #475569; font-weight: 600;">Back</button>
                            <button type="button" class="modern-btn accent" onclick="window.publishPayslipToApp()" style="flex: 2; height: 50px; background: linear-gradient(135deg, #F95A2C 0%, #D9381E 100%); color: white; border: none; border-radius: 8px; font-weight: 700;"><i class="fas fa-paper-plane" style="margin-right: 8px;"></i> Publish Payslip</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <!-- PAYSLIP PREVIEW MODAL -->
\
adminHtml = adminHtml.replace(oldModalRegex, newWizardModal + '\\n');

fs.writeFileSync('public/html/admin.html', adminHtml);
