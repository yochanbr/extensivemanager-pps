// --- NAMMA MART CUSTOM SAAS MODAL SYSTEM --- //
const nammaModalSystem = (() => {
    if (!document.getElementById('namma-modal-styles')) {
        const style = document.createElement('style'); style.id = 'namma-modal-styles';
        style.innerHTML = `#namma-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(10, 10, 10, 0.6); backdrop-filter: blur(4px); z-index: 999999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease; } #namma-modal-box { background: #FFFFFF; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); width: 100%; max-width: 420px; padding: 32px; text-align: center; font-family: 'Inter', sans-serif; transform: translateY(20px) scale(0.95); transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-sizing: border-box; } #namma-modal-icon { font-size: 36px; color: #F95A2C; margin-bottom: 20px; } #namma-modal-message { font-size: 16px; color: #1A1A1A; font-weight: 500; margin-bottom: 24px; line-height: 1.5; } #namma-modal-input { width: 100%; padding: 14px 16px; border: 1px solid #E2E8F0; border-radius: 10px; background: #F8FAFC; font-size: 16px; color: #1A1A1A; margin-bottom: 24px; outline: none; transition: all 0.2s ease; box-sizing: border-box; } #namma-modal-input:focus { border-color: #0A0A0A; background: #FFFFFF; box-shadow: 0 0 0 4px rgba(10,10,10,0.05); } #namma-modal-buttons { display: flex; gap: 12px; justify-content: center; } .namma-btn { padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s ease; flex: 1; } .namma-btn-cancel { background: #F1F5F9; color: #64748B; } .namma-btn-cancel:hover { background: #E2E8F0; color: #1A1A1A; } .namma-btn-confirm { background: #0A0A0A; color: #FFFFFF; } .namma-btn-confirm:hover { background: #F95A2C; transform: translateY(-1px); }`;
        document.head.appendChild(style);
    }
    function showModal(type, message, defaultValue = '') {
        return new Promise((resolve) => {
            const existing = document.getElementById('namma-modal-overlay'); if (existing) existing.remove();
            const iconSVG = type === 'alert' ? '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' : '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            document.body.insertAdjacentHTML('beforeend', `<div id="namma-modal-overlay"><div id="namma-modal-box"><div id="namma-modal-icon">${iconSVG}</div><div id="namma-modal-message">${message}</div>${type === 'prompt' ? `<input type="text" id="namma-modal-input" value="${defaultValue}" autocomplete="off">` : ''}<div id="namma-modal-buttons">${type === 'prompt' ? `<button class="namma-btn namma-btn-cancel" id="namma-modal-cancel">Cancel</button>` : ''}<button class="namma-btn namma-btn-confirm" id="namma-modal-confirm">OK</button></div></div></div>`);
            const overlay = document.getElementById('namma-modal-overlay'); const box = document.getElementById('namma-modal-box'); const btnConfirm = document.getElementById('namma-modal-confirm'); const btnCancel = document.getElementById('namma-modal-cancel'); const input = document.getElementById('namma-modal-input');
            void overlay.offsetWidth; overlay.style.opacity = '1'; box.style.transform = 'translateY(0) scale(1)'; if (input) setTimeout(() => input.focus(), 50);
            const close = (result) => { overlay.style.opacity = '0'; box.style.transform = 'translateY(20px) scale(0.95)'; setTimeout(() => { overlay.remove(); resolve(result); }, 200); };
            btnConfirm.addEventListener('click', () => close(type === 'prompt' ? (input ? input.value : '') : true)); if (btnCancel) btnCancel.addEventListener('click', () => close(null));
            if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btnConfirm.click(); } if (e.key === 'Escape' && btnCancel) { e.preventDefault(); btnCancel.click(); } });
        });
    }
    return { alert: (msg) => showModal('alert', msg), prompt: (msg, def) => showModal('prompt', msg, def) };
})();
window.alert = nammaModalSystem.alert;
// --- END CUSTOM MODAL SYSTEM --- //

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('namma-mart-login-form') || document.querySelector('form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent the form from submitting the traditional way

            const username = event.target.username.value;
            const password = event.target.password.value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                const data = await response.json();

                if (data.success) {
                    if (data.redirectUrl) {
                        localStorage.setItem('username', username);
                        // Set the guard flag for admin access
                        if (data.redirectUrl === '/admin') {
                            localStorage.setItem('adminLoggedIn', 'true');
                        }
                        if (data.employeeId) {
                            localStorage.setItem('employeeId', data.employeeId);
                        } else {
                            // Fallback: Fetch employee ID and store it
                            fetch('/api/employees')
                                .then(res => res.json())
                                .then(employees => {
                                    const employee = employees.find(emp => emp.username === username);
                                    if (employee) {
                                        localStorage.setItem('employeeId', employee.id);
                                    }
                                    window.location.href = data.redirectUrl;
                                })
                                .catch(error => {
                                    console.error('Error fetching employee ID:', error);
                                    window.location.href = data.redirectUrl;
                                });
                        }
                        window.location.href = data.redirectUrl;
                    }
                } else if (data.requiresAdminApproval) {
                    // Show OTP input for admin approval
                    const loginContainer = document.querySelector('.login-container');
                    loginContainer.innerHTML = `
                        <h2>ADMIN APPROVAL REQUIRED</h2>
                        <p>${data.message}</p>
                        <form id="otp-form">
                            <div class="input-group">
                                <input type="text" id="otp" name="otp" required>
                                <label for="otp">ENTER OTP</label>
                            </div>
                            <button type="submit">VERIFY OTP</button>
                        </form>
                    `;

                    const otpForm = document.getElementById('otp-form');
                    otpForm.addEventListener('submit', async (event) => {
                        event.preventDefault();
                        const otp = event.target.otp.value;

                        try {
                            const otpResponse = await fetch('/api/verify-admin-approval-otp', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ otp, employeeId: data.employeeId }),
                            });

                            const otpData = await otpResponse.json();

                            if (otpData.success) {
                                localStorage.setItem('username', username);
                                localStorage.setItem('employeeId', data.employeeId);
                                window.location.href = otpData.redirectUrl;
                            } else {
                                alert('Invalid OTP. Please try again.');
                            }
                        } catch (error) {
                            console.error('Error verifying OTP:', error);
                            alert('An error occurred. Please try again later.');
                        }
                    });
                } else {
                    alert('Login failed. Please try again.');
                }
            } catch (error) {
                console.error('Error during login:', error);
                alert('An error occurred. Please try again later.');
            }
        });
    }
});