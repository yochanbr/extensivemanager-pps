// --- NAMMA MART CUSTOM SAAS MODAL SYSTEM --- //
const nammaModalSystem = (() => {
    if (!document.getElementById('namma-modal-styles')) {
        const style = document.createElement('style'); style.id = 'namma-modal-styles';
        style.innerHTML = `
            #namma-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(10, 10, 10, 0.6); backdrop-filter: blur(8px); z-index: 9999999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease; }
            #namma-modal-box { background: #FFFFFF; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); width: 100%; max-width: 400px; padding: 40px; text-align: center; font-family: 'Inter', sans-serif; transform: translateY(30px) scale(0.95); transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-sizing: border-box; border: 1px solid rgba(255,255,255,0.1); }
            #namma-modal-icon { width: 64px; height: 64px; background: #FFF5F2; color: #F95A2C; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 24px; box-shadow: 0 10px 20px rgba(249, 90, 44, 0.1); }
            #namma-modal-icon.confirm { background: #EFF6FF; color: #3B82F6; }
            #namma-modal-icon.danger { background: #FEF2F2; color: #EF4444; }
            #namma-modal-message { font-size: 17px; color: #1E293B; font-weight: 600; margin-bottom: 32px; line-height: 1.6; }
            #namma-modal-buttons { display: flex; gap: 12px; justify-content: center; }
            .namma-btn { padding: 14px 24px; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s ease; flex: 1; outline: none; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .namma-btn-cancel { background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0; }
            .namma-btn-cancel:hover { background: #E2E8F0; color: #1E293B; }
            .namma-btn-confirm { background: #0F172A; color: #FFFFFF; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15); }
            .namma-btn-confirm:hover { background: #000000; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.2); }
            .namma-btn-danger { background: #EF4444; color: #FFFFFF; }
            .namma-btn-danger:hover { background: #DC2626; transform: translateY(-2px); }
        `;
        document.head.appendChild(style);
    }

    function showModal(type, message, options = {}) {
        return new Promise((resolve) => {
            const existing = document.getElementById('namma-modal-overlay');
            if (existing) existing.remove();

            let iconHTML = '<i class="fas fa-info-circle"></i>';
            let iconClass = '';
            if (type === 'confirm') { 
                iconHTML = '<i class="fas fa-question-circle"></i>'; 
                iconClass = 'confirm';
            } else if (options.theme === 'danger') {
                iconHTML = '<i class="fas fa-exclamation-triangle"></i>';
                iconClass = 'danger';
            }

            const html = `
                <div id="namma-modal-overlay" style="opacity: 0;">
                    <div id="namma-modal-box">
                        <div id="namma-modal-icon" class="${iconClass}">${iconHTML}</div>
                        <div id="namma-modal-message">${message}</div>
                        ${type === 'prompt' ? `<input type="password" id="namma-modal-input" placeholder="${options.placeholder || ''}" style="width: 100%; padding: 14px 16px; border: 1px solid #E2E8F0; border-radius: 12px; background: #F8FAFC; margin-bottom: 24px; outline: none; font-size: 16px; text-align: center;">` : ''}
                        <div id="namma-modal-buttons">
                            ${(type === 'confirm' || type === 'prompt') ? `<button class="namma-btn namma-btn-cancel" id="namma-modal-cancel">Cancel</button>` : ''}
                            <button class="namma-btn ${options.theme === 'danger' ? 'namma-btn-danger' : 'namma-btn-confirm'}" id="namma-modal-confirm">
                                ${options.confirmText || (type === 'confirm' ? 'Confirm' : type === 'prompt' ? 'Submit' : 'OK')}
                            </button>
                        </div>
                    </div>
                </div>`;

            document.body.insertAdjacentHTML('beforeend', html);
            const overlay = document.getElementById('namma-modal-overlay');
            const box = document.getElementById('namma-modal-box');
            const btnConfirm = document.getElementById('namma-modal-confirm');
            const btnCancel = document.getElementById('namma-modal-cancel');
            const input = document.getElementById('namma-modal-input');

            // Force reflow
            void overlay.offsetWidth;
            overlay.style.opacity = '1';
            box.style.transform = 'translateY(0) scale(1)';
            if (input) setTimeout(() => input.focus(), 100);

            const close = (result) => {
                overlay.style.opacity = '0';
                box.style.transform = 'translateY(30px) scale(0.95)';
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            btnConfirm.addEventListener('click', () => close(type === 'prompt' ? input.value : true));
            if (btnCancel) btnCancel.addEventListener('click', () => close(type === 'prompt' ? null : false));
            
            // Handle Escape key
            const handleKey = (e) => {
                if (e.key === 'Escape') {
                    if (btnCancel) btnCancel.click();
                    else btnConfirm.click();
                    document.removeEventListener('keydown', handleKey);
                }
                if (e.key === 'Enter') {
                    btnConfirm.click();
                    document.removeEventListener('keydown', handleKey);
                }
            };
            document.addEventListener('keydown', handleKey);
        });
    }

    return {
        alert: async (msg, options) => await showModal('alert', msg, options),
        confirm: async (msg, options) => await showModal('confirm', msg, options),
        prompt: async (msg, options) => await showModal('prompt', msg, options)
    };
})();

// Bridge global alert/confirm for pure functional parity (Legacy support)
window.alert = (msg) => { nammaModalSystem.alert(msg); };
window.confirm = (msg) => { 
    console.warn("Native confirm() is disabled. Please use await nammaModalSystem.confirm(). Returning false as fallback.");
    return false;
};
window.prompt = (msg) => {
    console.warn("Native prompt() is disabled. Please use await nammaModalSystem.prompt(). Returning null as fallback.");
    return null;
}
// --- END CUSTOM MODAL SYSTEM --- //
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
                                await nammaModalSystem.alert('Invalid OTP. Please try again.');
                            }
                        } catch (error) {
                            console.error('Error verifying OTP:', error);
                            await nammaModalSystem.alert('An error occurred. Please try again later.');
                        }
                    });
                } else {
                    await nammaModalSystem.alert('Login failed. Please try again.');
                }
            } catch (error) {
                console.error('Error during login:', error);
                await nammaModalSystem.alert('An error occurred. Please try again later.');
            }
        });
    }
});