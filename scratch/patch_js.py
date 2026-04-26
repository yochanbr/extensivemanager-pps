
import os

js_path = r'c:\Users\yocha\Downloads\NAMMA MART\DO NOT DELETE THIS ( YOCHAN)\DO NOT DELETE THIS ( YOCHAN)\public\js\admin.js'

with open(js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new blocks
new_edit_logic = """
    // --- EDIT EMPLOYEE SPA SLIDE-OVER LOGIC ---
    window.openEditEmployeePanel = function() {
        const panel = document.getElementById('edit-employee-panel');
        const overlay = document.getElementById('edit-employee-overlay');
        if (panel && overlay) {
            overlay.classList.add('show');
            panel.classList.add('show');
        }
    };

    window.closeEditEmployeePanel = function() {
        const panel = document.getElementById('edit-employee-panel');
        const overlay = document.getElementById('edit-employee-overlay');
        if (panel && overlay) {
            overlay.classList.remove('show');
            panel.classList.remove('show');
        }
    };

    window.spaEditEmployee = function (id) {
        fetch('/api/employees/' + id)
            .then(res => res.json())
            .then(emp => {
                const setVal = (vid, val) => {
                    const el = document.getElementById(vid);
                    if (!el) return;
                    if (el.tagName === 'SELECT') {
                        el.value = val || '';
                    } else {
                        el.value = val !== undefined && val !== null ? val : '';
                    }
                };

                setVal('spa-edit-id', emp.id || emp._id);
                setVal('spa-edit-name', emp.name);
                setVal('spa-edit-employee-id', emp.employeeId);
                setVal('spa-edit-phone', emp.phone);
                setVal('spa-edit-aadhar-number', emp.aadharNumber);
                setVal('spa-edit-email', emp.email);
                setVal('spa-edit-address', emp.address);
                setVal('spa-edit-username', emp.username);
                setVal('spa-edit-password', emp.password);
                setVal('spa-edit-break-time', emp.breakTime || 30);
                setVal('spa-edit-guardian-name', emp.guardianName);
                setVal('spa-edit-guardian-phone', emp.guardianPhone);
                setVal('spa-edit-guardian-relationship', emp.guardianRelationship || emp.relationship);
                setVal('spa-edit-bank-name', emp.bankName);
                setVal('spa-edit-bank-branch', emp.bankBranch);
                setVal('spa-edit-account-number', emp.accountNumber);
                setVal('spa-edit-account-holder-name', emp.accountHolderName);
                setVal('spa-edit-ifsc-code', emp.ifscCode);
                setVal('spa-edit-pan-number', emp.panNumber);
                setVal('spa-edit-basic-salary', emp.basicSalary);
                setVal('spa-edit-esi', emp.esi);

                setVal('spa-edit-gender', emp.gender);
                setVal('spa-edit-marital-status', emp.maritalStatus);
                setVal('spa-edit-full-time', emp.fullTime);

                const dobEl = document.getElementById('spa-edit-dob');
                if (dobEl) {
                    try { dobEl.value = emp.dob ? new Date(emp.dob).toISOString().split('T')[0] : ''; }
                    catch (e) { dobEl.value = ''; }
                }

                const days = (emp.workingDays || '').split(',');
                document.querySelectorAll('#spa-edit-employee-form input[name="working-days"]').forEach(cb => {
                    cb.checked = days.includes(cb.value);
                });

                const convertTo12h = (timeStr, prefix) => {
                    if(!timeStr) return;
                    try {
                        const [h24, m] = timeStr.split(':');
                        let hour = parseInt(h24);
                        let period = 'AM';
                        if(hour >= 12) {
                            period = 'PM';
                            if(hour > 12) hour -= 12;
                        } else if(hour === 0) {
                            hour = 12;
                        }
                        setVal(`spa-edit-${prefix}-hour`, String(hour).padStart(2, '0'));
                        setVal(`spa-edit-${prefix}-min`, m);
                        setVal(`spa-edit-${prefix}-period`, period);
                    } catch(e) {}
                };

                convertTo12h(emp.startTime, 'start');
                convertTo12h(emp.endTime, 'end');

                window.openEditEmployeePanel();
            })
            .catch(err => console.error('Error fetching employee:', err));
    };
"""

# Find the start and end of the old block
start_marker = "window.spaEditEmployee = function (id) {"
end_marker = "};"

start_idx = content.find(start_marker)
# Find the end of the block (from line 1800 to 1895 approx)
# We know the block ends with the event listener for closers which also needs to go.
closer_marker = "document.querySelectorAll('.close-spa-edit, .close-spa-edit-btn')"
end_idx = content.find(closer_marker)

# Find the CLOSING brace of the closers block (Line 1894)
if end_idx != -1:
    next_closer = content.find("});", end_idx) # This is the end of forEach
    if next_closer != -1:
        next_closer = content.find("});", next_closer + 3) # This might be the next one
        # Let's just find the end of line 1894 correctly
        end_idx = content.find("    // Handle Edit form submission")

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_edit_logic + content[end_idx:]
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully patched admin.js")
else:
    print(f"Failed to find markers: start={start_idx}, end={end_idx}")
