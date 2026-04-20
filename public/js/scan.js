// ─── Nothing Phone SFX Engine ─────────────────────────────────────────────
const SFX = (() => {
    let ctx = null;
    const getCtx = () => {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    };

    const play = (notes, type = 'sine') => {
        const c = getCtx();
        notes.forEach(([freq, start, dur, vol = 0.18]) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.connect(gain);
            gain.connect(c.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, c.currentTime + start);
            gain.gain.setValueAtTime(0, c.currentTime + start);
            gain.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
            osc.start(c.currentTime + start);
            osc.stop(c.currentTime + start + dur + 0.05);
        });
    };

    return {
        // Clean double-note triumph — Nothing Phone unlock sound feel
        success: () => play([
            [880, 0,    0.12, 0.16],
            [1318, 0.1, 0.22, 0.13]
        ], 'sine'),

        // Three-note ascending chime — face identified
        match: () => play([
            [660,  0,    0.09, 0.14],
            [880,  0.08, 0.09, 0.13],
            [1100, 0.16, 0.18, 0.12]
        ], 'sine'),

        // Soft low descending buzz — error / mismatch
        error: () => play([
            [280, 0,    0.1,  0.16],
            [210, 0.09, 0.16, 0.14]
        ], 'square'),

        // Ultra-soft click — button tap, crisp and minimal
        click: () => play([
            [1200, 0, 0.04, 0.09],
            [900,  0.03, 0.05, 0.05]
        ], 'sine'),

        // Gentle confirm — single mid tone for neutral actions
        confirm: () => play([
            [740, 0, 0.14, 0.13]
        ], 'sine'),

        // Double-tap feel — break / pause events
        tap: () => play([
            [600, 0,    0.05, 0.12],
            [600, 0.08, 0.05, 0.10]
        ], 'sine'),

        // Startup sweep — system ready
        boot: () => play([
            [330,  0,    0.08, 0.10],
            [660,  0.07, 0.08, 0.10],
            [1100, 0.14, 0.14, 0.09]
        ], 'sine')
    };
})();

let faceMatcher = null;
let labeledDescriptors = [];
let currentEmployee = null;
let detectionActive = false;
let scannerPaused = false;
window.manualScanRequested = false;
let scanTimeout = null;



// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    updateClock();
    setInterval(updateClock, 1000);
    await initScanner();

    // ─── Global Button Click SFX ──────────────────────────────────────────
    // Plays a crisp click for EVERY button press across the scan page
    document.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('button, [role="button"], .action-btn, .orb-btn, .scan-btn, label[for]');
        if (!btn) return;
        if (btn.disabled || btn.classList.contains('disabled')) return;
        SFX.click();
    });
});

function updateClock() {
    const now = new Date();
    const el = document.getElementById('live-clock');
    if (el) el.textContent = now.toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

async function initScanner() {
    const progress = document.getElementById('loader-progress');
    const statusText = document.getElementById('status-text');

    try {
        statusText.textContent = 'Loading AI models...';
        progress.style.width = '25%';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);

        statusText.textContent = 'Syncing biometric data...';
        progress.style.width = '60%';
        const res = await fetch('/api/employees');
        const employees = await res.json();

        labeledDescriptors = [];
        employees.forEach(emp => {
            if (emp.faceDescriptor && emp.faceDescriptor.length > 0) {
                const desc = new Float32Array(emp.faceDescriptor);
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(
                    emp.id.toString(), [desc]
                ));
            }
        });

        if (labeledDescriptors.length > 0) {
            // Lower threshold (0.5 or 0.55) makes it more strict/accurate. 
            // 0.6 is a good balance for slightly varied lighting.
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.58);
        } else {
            statusText.textContent = 'No face data registered';
        }

        statusText.textContent = 'Ready';
        progress.style.width = '100%';
        SFX.boot(); // System ready chime

        setTimeout(() => {
            const overlay = document.getElementById('status-overlay');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 500);
        }, 800);

    } catch (err) {
        console.error('Init failed:', err);
        document.getElementById('status-text').textContent = 'Initialization failed';
    }
}

// ─── Camera ───────────────────────────────────────────────────────────────
async function startCamera() {
    const video = document.getElementById('scan-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
        detectionActive = true;
        startDetectionLoop();
    } catch (err) {
        console.error('Camera failed:', err);
        SFX.error();
        showToast('Camera access required', 'error');
    }
}

function stopCamera() {
    detectionActive = false;
    const video = document.getElementById('scan-video');
    if (video && video.srcObject) {
        const stream = video.srcObject;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

// ─── Detection Loop ───────────────────────────────────────────────────────
async function startDetectionLoop() {
    const video  = document.getElementById('scan-video');
    const canvas = document.getElementById('scan-overlay');
    if (!video || !canvas || !detectionActive) return;

    const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
    faceapi.matchDimensions(canvas, displaySize);

    const detect = async () => {
        if (!detectionActive) return;

        if (!scannerPaused) {
            const detections = await faceapi
                .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (detections && window.manualScanRequested) {
                if (!faceMatcher) {
                    resetManualScanState();
                    stopCamera();
                    showToast('No faces registered. Contact admin to register your face.', 'error');
                } else {
                    const result = faceMatcher.findBestMatch(detections.descriptor);
                    if (result.label !== 'unknown' && result.distance < 0.58) {
                        handleMatchFound(result.label);
                    } else if (window.manualScanRequested) {
                        // Face detected but not matched during a requested scan
                        // We give it a few more frames or show a subtle hint
                    }
                }
            }

            // Ambient light check
            checkBrightness(video);
        }

        requestAnimationFrame(detect);
    };

    detect();
}

// ─── Match Handler ────────────────────────────────────────────────────────
async function handleMatchFound(employeeId) {
    if (scannerPaused) return;
    scannerPaused = true;

    try {
        const res = await fetch(`/api/employees/${employeeId}`);
        if (res.status === 403) {
            const errorData = await res.json();
            showToast(errorData.message || 'Access Denied', 'error');
            SFX.error();
            setTimeout(resetScanner, 3000);
            return;
        }
        
        const employee = await res.json();
        currentEmployee = employee;

        // Turn off camera for privacy
        stopCamera();

        // Stop scanning visuals
        resetManualScanState();
        document.getElementById('orb-container').classList.remove('scanning');
        document.getElementById('trigger-area').classList.add('hidden');

        // Update confirmation sheet
        document.getElementById('id-name').textContent = employee.name;
        document.getElementById('id-avatar').textContent = employee.name.charAt(0);
        document.getElementById('confirm-msg').textContent = 'Face Identified';

        // Show confirm actions
        document.getElementById('confirm-actions').classList.add('show');

        // Slide up confirm sheet
        SFX.match(); // Face identified — ascending chime
        document.getElementById('identity-badge').classList.add('show');

    } catch (err) {
        console.error('Match retrieval failed:', err);
        resetScanner();
    }
}

// ─── Confirm Identity ─────────────────────────────────────────────────────
window.confirmIdentity = async function () {
    if (!currentEmployee) return;

    // Hide confirm sheet
    document.getElementById('identity-badge').classList.remove('show');

    // Populate action panel
    document.getElementById('action-avatar').textContent = currentEmployee.name.charAt(0);
    document.getElementById('action-name').textContent = currentEmployee.name;
    
    const badge = document.getElementById('current-state-badge');
    badge.textContent = "Fetching state...";
    badge.className = "state-badge";

    // Slide up action panel
    setTimeout(() => {
        document.getElementById('action-panel').classList.add('visible');
    }, 200);

    try {
        const res = await fetch('/api/attendance/state/' + currentEmployee.id);
        const data = await res.json();
        
        if (res.status === 403) {
            showToast(data.message || 'Access Denied', 'error');
            SFX.error();
            setTimeout(resetScanner, 3000);
            return;
        }

        if (data.success) {
            window.currentEmployeeState = data.currentState;
            badge.textContent = "State: " + data.currentState.replace('_', ' ');
            badge.classList.add(data.currentState.toLowerCase());
            
            // Highlight sensible selections and disable impossible ones
            document.querySelectorAll('.action-btn').forEach(b => b.classList.add('disabled'));
            if (data.currentState === 'IDLE') {
                document.getElementById('btn-in').classList.remove('disabled');
            } else if (data.currentState === 'WORKING') {
                document.getElementById('btn-break_start').classList.remove('disabled');
                document.getElementById('btn-out').classList.remove('disabled');
            } else if (data.currentState === 'ON_BREAK') {
                document.getElementById('btn-break_end').classList.remove('disabled');
                document.getElementById('btn-out').classList.remove('disabled');
            }
        }
    } catch(err) {
        badge.textContent = "State fetch failed";
    }
};

// ─── Reset ────────────────────────────────────────────────────────────────
function resetScanner() {
    document.getElementById('identity-badge').classList.remove('show');
    document.getElementById('action-panel').classList.remove('visible');
    document.getElementById('smart-fix-modal').classList.remove('show');
    document.getElementById('trigger-area').classList.remove('hidden');
    document.getElementById('confirm-actions').classList.remove('show');
    document.getElementById('orb-container').classList.remove('scanning');
    currentEmployee = null;
    window.currentEmployeeState = null;
    scannerPaused = false;
    resetManualScanState();
    
    // Always keep camera off until manual scan requested
    stopCamera();
}

// ─── Manual Scan Trigger ──────────────────────────────────────────────────
window.requestManualScan = async function () {
    if (scannerPaused || window.manualScanRequested) return;

    window.manualScanRequested = true;
    SFX.click(); // Verify button pressed

    const btn = document.getElementById('scan-trigger-btn');
    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Identifying...</span>';

    // Start camera only on explicit request
    if (!detectionActive) {
        document.getElementById('scan-prompt').querySelector('.prompt-main').textContent = 'Starting camera...';
        await startCamera();
    }

    // Activate scan visuals
    document.getElementById('orb-container').classList.add('scanning');
    document.getElementById('scan-prompt').querySelector('.prompt-main').textContent = 'Scanning...';
    document.getElementById('scan-prompt').querySelector('.prompt-sub').textContent = 'Hold still for a moment';

    // 8-second timeout
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
        if (window.manualScanRequested) {
            resetManualScanState();
            stopCamera();
            document.getElementById('orb-container').classList.remove('scanning');
            document.getElementById('scan-prompt').querySelector('.prompt-main').textContent = 'Face Detection Ready';
            document.getElementById('scan-prompt').querySelector('.prompt-sub').textContent = 'Position your face within the circle';
            showToast('Identity could not be verified. Please try again.', 'error');
            SFX.error();
        }
    }, 8000);
};

function resetManualScanState() {
    window.manualScanRequested = false;
    if (scanTimeout) clearTimeout(scanTimeout);
    const btn = document.getElementById('scan-trigger-btn');
    if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fas fa-fingerprint"></i> <span>Verify Identity</span>';
    }
    const prompt = document.getElementById('scan-prompt');
    if (prompt) {
        prompt.querySelector('.prompt-main').textContent = 'Face Detection Ready';
        prompt.querySelector('.prompt-sub').textContent = 'Position your face within the circle';
    }
}

// ─── Custom Auto-Fix Application ──────────────────────────────────────────
async function applyAutoFix(sequences, employeeId) {
    document.getElementById('smart-fix-modal').classList.remove('show');
    try {
        const res = await fetch('/api/attendance/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId: employeeId, actionType: sequences })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Auto-fix applied successfully ✓', 'success');
            SFX.success();
            setTimeout(resetScanner, 2500);
        } else {
            showToast(data.message || 'Auto-fix failed', 'error');
            resetScanner();
        }
    } catch(err) {
        showToast('Network error during auto-fix', 'error');
    }
}

// ─── Submit Attendance ────────────────────────────────────────────────────
async function submitAttendance(actionType) {
    if (!currentEmployee) return;

    // Find the button reliably without global event dependency
    const btnId = `btn-${actionType}`;
    const btn = document.getElementById(btnId) || (window.event ? window.event.currentTarget : null);
    
    // Pre-validate locally to show smart-fix immediately without hitting network if possible
    const state = window.currentEmployeeState;
    if (state) {
        if (actionType === 'in' && state !== 'IDLE') {
            document.getElementById('smart-fix-message').textContent = 'You are already checked in to a session. Do you want to check out of it and start a brand new session?';
            document.getElementById('smart-fix-yes').onclick = () => applyAutoFix(['out', 'in'], currentEmployee.id);
            document.getElementById('smart-fix-modal').classList.add('show');
            return;
        }
        if (actionType === 'break_end' && state === 'IDLE') {
            document.getElementById('smart-fix-message').textContent = 'You are not checked in anywhere. Do you want to check in first?';
            document.getElementById('smart-fix-yes').onclick = () => applyAutoFix(['in'], currentEmployee.id);
            document.getElementById('smart-fix-modal').classList.add('show');
            return;
        }
        if (actionType === 'break_start' && state === 'ON_BREAK') {
            document.getElementById('smart-fix-message').textContent = 'You are already on break. Do you want to end your current break?';
            document.getElementById('smart-fix-yes').onclick = () => applyAutoFix(['break_end'], currentEmployee.id);
            document.getElementById('smart-fix-modal').classList.add('show');
            return;
        }
        if (actionType === 'out' && state === 'IDLE') {
            document.getElementById('smart-fix-message').textContent = 'You have no active session to check out of. Do you want to check in?';
            document.getElementById('smart-fix-yes').onclick = () => applyAutoFix(['in'], currentEmployee.id);
            document.getElementById('smart-fix-modal').classList.add('show');
            return;
        }
    }

    if (btn) {
        btn.style.opacity = '0.6';
        btn.style.pointerEvents = 'none';
    }

    try {
        const res = await fetch('/api/attendance/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId: currentEmployee.id, actionType: actionType })
        });

        const data = await res.json();
        
        if (res.status === 403) {
            showToast(data.message || 'Access Denied', 'error');
            SFX.error();
            setTimeout(resetScanner, 3000);
            return;
        }

        if (data.success) {
            // Play action-specific sound + voice
            if (actionType === 'in') { SFX.success(); }
            else if (actionType === 'out') { SFX.success(); }
            else if (actionType === 'break_start') { SFX.tap(); }
            else if (actionType === 'break_end') { SFX.tap(); }
            else { SFX.confirm(); }
            showToast(`${actionType.replace(/_/g, ' ')} recorded ✓`.toUpperCase(), 'success');
            setTimeout(resetScanner, 2500);
        } else {
            if (data.code === 'STATE_MISMATCH') {
                 SFX.confirm(); // Alert tone for smart-fix modal
                 document.getElementById('smart-fix-message').textContent = data.message + " Let the system try to auto-fix this?";
                 document.getElementById('smart-fix-yes').onclick = () => resetScanner(); // Fallback
                 document.getElementById('smart-fix-modal').classList.add('show');
            } else {
                 SFX.error();
                 showToast(data.message || 'Error recording action', 'error');
            }
            if (btn) {
                btn.style.opacity = '';
                btn.style.pointerEvents = '';
            }
        }
    } catch (err) {
        SFX.error();
        showToast('Network error. Try again.', 'error');
        if (btn) {
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
        }
    }
}

// ─── Toast ────────────────────────────────────────────────────────────────
function showToast(msg, status = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${status}`;
    setTimeout(() => toast.className = 'toast', 4000);
}

// ─── Ambient Light Sensor ─────────────────────────────────────────────────
const bCanvas = document.createElement('canvas');
const bCtx    = bCanvas.getContext('2d', { willReadFrequently: true });
bCanvas.width = bCanvas.height = 40;

function checkBrightness(video) {
    if (!video || video.paused || video.ended) return;
    bCtx.drawImage(video, 0, 0, 40, 40);
    const data = bCtx.getImageData(0, 0, 40, 40).data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
        total += (data[i] * 299 + data[i+1] * 587 + data[i+2] * 114) / 1000;
    }
    const badge = document.getElementById('low-light-badge');
    if (badge) badge.classList.toggle('show', total / 1600 < 45);
}

