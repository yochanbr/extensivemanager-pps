import re

with open('public/html/admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Define the new content
new_content = '''        <div class="side-panel-body">
            <!-- Progress Stepper -->
            <div class="stepper-minimal" id="edit-stepper">
                <div class="step-dot active" data-step="1"></div>
                <div class="step-line"></div>
                <div class="step-dot" data-step="2"></div>
                <div class="step-line"></div>
                <div class="step-dot" data-step="3"></div>
            </div>

            <form id="spa-edit-employee-form">
                <input type="hidden" id="spa-edit-id" name="id">
                
                <!-- STEP 1: Personal Info -->
                <div class="spa-step active" data-step="1">
                    <div class="form-section-title">Personal Information</div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>Employee Full name *</label>
                            <input type="text" id="spa-edit-name" name="name" required>
                        </div>
                        <div class="input-group">
                            <label>Employee ID *</label>
                            <input type="text" id="spa-edit-employee-id" name="employee-id" required>
                        </div>
                    </div>
                    
                    <div class="input-row">
                        <div class="input-group">
                            <label>Employee phone Numeber *</label>
                            <input type="text" id="spa-edit-phone" name="phone" required>
                        </div>
                        <div class="input-group">
                            <label>Adhar Number</label>
                            <input type="text" id="spa-edit-aadhar-number" name="aadhar-number">
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>Personal Email</label>
                            <input type="email" id="spa-edit-email" name="email">
                        </div>
                        <div class="input-group">
                            <label>Date of birth</label>
                            <input type="date" id="spa-edit-dob" name="dob">
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>gender</label>
                            <div class="custom-select-wrapper">
                                <select id="spa-edit-gender" name="gender">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                                <i class="fas fa-chevron-down select-icon"></i>
                            </div>
                        </div>
                        <div class="input-group">
                            <label>matrial status</label>
                            <div class="custom-select-wrapper">
                                <select id="spa-edit-marital-status" name="marital-status">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                </select>
                                <i class="fas fa-chevron-down select-icon"></i>
                            </div>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Full address</label>
                        <textarea id="spa-edit-address" name="address" style="height: 60px;"></textarea>
                    </div>
                </div>

                <!-- STEP 2: Access & Scheduling -->
                <div class="spa-step" data-step="2">
                    <div class="form-section-title">Access & Scheduling</div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>Login username *</label>
                            <input type="text" id="spa-edit-username" name="username" required>
                        </div>
                        <div class="input-group">
                            <label>Login Password *</label>
                            <input type="text" id="spa-edit-password" name="password" required>
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>Joining Date</label>
                            <input type="date" id="spa-edit-joining-date" name="joining-date">
                        </div>
                        <div class="input-group">
                            <label>Employee ment type</label>
                            <div class="custom-select-wrapper">
                                <select id="spa-edit-full-time" name="full-time">
                                    <option value="yes">Full Time</option>
                                    <option value="no">Part Time</option>
                                </select>
                                <i class="fas fa-chevron-down select-icon"></i>
                            </div>
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>Break in minutes</label>
                            <input type="number" id="spa-edit-break-time" name="break-time">
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>Legal Chekin Time (12h)</label>
                            <div class="time-12h-group">
                                <select id="spa-edit-start-hour" name="start-hour" class="t-hour">
                                    <option value="09">09</option><option value="10">10</option><option value="11">11</option><option value="12">12</option>
                                    <option value="01">01</option><option value="02">02</option><option value="03" selected>03</option><option value="04">04</option>
                                    <option value="05">05</option><option value="06">06</option><option value="07">07</option><option value="08">08</option>
                                </select><span class="t-sep">:</span>
                                <select id="spa-edit-start-min" name="start-min" class="t-min">
                                    <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                                </select>
                                <select id="spa-edit-start-period" name="start-period" class="t-period">
                                    <option value="AM">AM</option><option value="PM" selected>PM</option>
                                </select>
                            </div>
                        </div>
                        <div class="input-group">
                            <label>Legal Checkout Time (12h)</label>
                            <div class="time-12h-group">
                                <select id="spa-edit-end-hour" name="end-hour" class="t-hour">
                                    <option value="06" selected>06</option><option value="07">07</option><option value="08">08</option><option value="09">09</option>
                                    <option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="01">01</option>
                                    <option value="02">02</option><option value="03">03</option><option value="04">04</option><option value="05">05</option>
                                </select><span class="t-sep">:</span>
                                <select id="spa-edit-end-min" name="end-min" class="t-min">
                                    <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                                </select>
                                <select id="spa-edit-end-period" name="end-period" class="t-period">
                                    <option value="AM">AM</option><option value="PM" selected>PM</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="input-group">
                        <label>Working Days</label>
                        <div class="mini-days-selector">
                            <label><input type="checkbox" id="edit-day-Monday" name="working-days" value="Monday"> M</label>
                            <label><input type="checkbox" id="edit-day-Tuesday" name="working-days" value="Tuesday"> T</label>
                            <label><input type="checkbox" id="edit-day-Wednesday" name="working-days" value="Wednesday"> W</label>
                            <label><input type="checkbox" id="edit-day-Thursday" name="working-days" value="Thursday"> T</label>
                            <label><input type="checkbox" id="edit-day-Friday" name="working-days" value="Friday"> F</label>
                            <label><input type="checkbox" id="edit-day-Saturday" name="working-days" value="Saturday"> S</label>
                            <label><input type="checkbox" id="edit-day-Sunday" name="working-days" value="Sunday"> S</label>
                        </div>
                    </div>
                </div>

                <!-- STEP 3: Payroll & Emergency -->
                <div class="spa-step" data-step="3">
                    <div class="form-section-title">Payroll & Compliance</div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>LOP Per Day (₹) *</label>
                            <input type="number" id="spa-edit-lop-per-day" name="lopPerDay" placeholder="e.g. 500">
                        </div>
                        <div class="input-group">
                            <label>LOP Per Hour (₹) *</label>
                            <input type="number" id="spa-edit-lop-per-hour" name="lopPerHour" placeholder="e.g. 70">
                        </div>
                    </div>
                    
                    <div class="input-row">
                        <div class="input-group">
                            <label>Monthly Basic salary</label>
                            <input type="number" id="spa-edit-basic-salary" name="basicSalary">
                        </div>
                        <div class="input-group">
                            <label>Esi/benefit Code</label>
                            <input type="text" id="spa-edit-esi" name="esi">
                        </div>
                    </div>
                    
                    <div class="input-row">
                        <div class="input-group">
                            <label>PF Number</label>
                            <input type="text" id="spa-edit-pf-number" name="pf-number" placeholder="KN/SUL/...">
                        </div>
                        <div class="input-group">
                            <label>PF UAN Number</label>
                            <input type="text" id="spa-edit-uan-number" name="uan-number" placeholder="12-digit UAN">
                        </div>
                    </div>
                    
                    <div class="input-group">
                        <label>Work Location</label>
                        <input type="text" id="spa-edit-location" name="location" placeholder="e.g. Sullia, Karnataka">
                    </div>

                    <div class="form-section-title">Emergency & Banking</div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>Guardian Name</label>
                            <input type="text" id="spa-edit-guardian-name" name="guardian-name">
                        </div>
                        <div class="input-group">
                            <label>Guardian relation ship</label>
                            <div class="custom-select-wrapper">
                                <select id="spa-edit-guardian-relationship" name="guardian-relationship">
                                    <option value="Father">Father</option><option value="Mother">Mother</option><option value="Spouse">Spouse</option>
                                    <option value="Brother">Brother</option><option value="Sister">Sister</option><option value="Son">Son</option>
                                    <option value="Daughter">Daughter</option><option value="Uncle">Uncle</option><option value="Aunt">Aunt</option>
                                    <option value="Cousin">Cousin</option><option value="Grandfather">Grandfather</option><option value="Grandmother">Grandmother</option>
                                    <option value="Other">Other</option>
                                </select>
                                <i class="fas fa-chevron-down select-icon"></i>
                            </div>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Gurdain Number</label>
                        <input type="text" id="spa-edit-guardian-phone" name="guardian-phone">
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label>Bank Name</label>
                            <input type="text" id="spa-edit-bank-name" name="bank-name">
                        </div>
                        <div class="input-group">
                            <label>Bank branch</label>
                            <input type="text" id="spa-edit-bank-branch" name="bank-branch">
                        </div>
                    </div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>Account Number</label>
                            <input type="text" id="spa-edit-account-number" name="account-number">
                        </div>
                        <div class="input-group">
                            <label>Acount holder Name</label>
                            <input type="text" id="spa-edit-account-holder-name" name="account-holder-name">
                        </div>
                    </div>
                    <div class="input-row">
                        <div class="input-group">
                            <label>Ifsc code</label>
                            <input type="text" id="spa-edit-ifsc-code" name="ifsc-code">
                        </div>
                        <div class="input-group">
                            <label>Pan card Number</label>
                            <input type="text" id="spa-edit-pan-number" name="pan-number">
                        </div>
                    </div>
                </div>
            </form>
        </div>
        
        <div class="side-panel-footer" style="display: flex; gap: 10px; justify-content: space-between;">
            <div>
                <button type="button" class="panel-btn-secondary" id="spa-edit-prev-btn" style="display: none;" onclick="window.prevEditStep()">Previous</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="panel-btn-secondary" onclick="window.downloadEmployeePDF()" title="Export to PDF">
                    <i class="fas fa-file-pdf"></i>
                </button>
                <button class="panel-btn-secondary" onclick="window.closeEditEmployeePanel()">Cancel</button>
                <button type="button" class="panel-btn-primary" id="spa-edit-next-btn" onclick="window.nextEditStep()">Next Step</button>
                <button class="panel-btn-primary" id="spa-edit-save-btn" style="display: none;">Update Record</button>
            </div>
        </div>'''

# Regex to match the body and footer of the edit panel
pattern = re.compile(r'<div class="side-panel-body">.*?<div class="side-panel-footer" .*?</div>', re.DOTALL)
html = pattern.sub(new_content, html, count=1)

with open('public/html/admin.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Replaced Edit Employee HTML")
