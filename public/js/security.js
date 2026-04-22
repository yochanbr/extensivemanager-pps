/**
 * Extensive Manager - Ultimate Security Guard V4.1
 * 🛡️ Designed to protect source code from casual inspection and automated scrapers.
 * (C) 2026 Pinpoint Startups. 
 */

(function () {
    'use strict';

    // 1. Disable Right-Click and Context Menu
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // 2. Disable Common Inspector Shortcuts
    document.addEventListener('keydown', (e) => {
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I (Chrome/Edge/Brave)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+J (Chrome/Edge/Brave)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+C (Inspect)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
        // Ctrl+S (Save Page)
        if (e.ctrlKey && e.keyCode === 83) {
            e.preventDefault();
            return false;
        }
    });

    // 3. The "Debugger Trap" (Self-Defending Loop)
    const debuggerTrap = function () {
        try {
            (function detect(i) {
                if ((typeof i === 'string' ? i : '' + (i / i)).length !== 1 || i % 20 === 0) {
                    (function () { }).constructor('debugger')();
                } else {
                    (function () { }).constructor('debugger')();
                }
                detect(++i);
            })(0);
        } catch (e) {
            setTimeout(debuggerTrap, 100);
        }
    };

    setInterval(debuggerTrap, 1000);

    // 4. Console Hygiene
    if (window.console) {
        const suppress = () => {
            console.log = function () { };
            console.info = function () { };
            console.warn = function () { };
            console.error = function () { };
            console.clear();
        };
        setInterval(console.clear, 500);
        suppress();
    }

    // 5. Detect and Redirect on DevTools opening
    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function () {
            window.location.href = 'about:blank';
        }
    });

    setInterval(() => {
        console.log(element);
    }, 1000);

    // 6. Anti-Framing
    if (window.self !== window.top) {
        window.top.location.href = window.self.location.href;
    }

    console.log("%c SECURITY ACTIVE ", "background: red; color: white; font-size: x-large; font-weight: bold;");
})();
