(function () {
    // --- Guard: prevent double execution (workbench.js + HTML script tag) ---
    if (window._agAutoLoaded) return;
    window._agAutoLoaded = true;

    // --- Dọn dẹp bản cũ ---
    if (window._agToolIntervals) {
        window._agToolIntervals.forEach(clearInterval);
        window.removeEventListener('scroll', window._agScrollListener, true);
    }
    window._agToolIntervals = [];

    var PAUSE_SCROLL_MS = /*{{PAUSE_SCROLL_MS}}*/7000;
    var CLICK_INTERVAL_MS = /*{{CLICK_INTERVAL_MS}}*/1000;
    var SCROLL_INTERVAL_MS = /*{{SCROLL_INTERVAL_MS}}*/500;
    var CLICK_PATTERNS = /*{{CLICK_PATTERNS}}*/["Allow", "Always Allow", "Run", "Keep Waiting", "Accept all"];

    // Live ON/OFF flag — controlled via config file polling, no reload needed
    var _agEnabled = /*{{ENABLED}}*/true;

    // --- Dynamic config reload (multiple fallback methods) ---
    var _agConfigPath = '/*{{CONFIG_PATH}}*/';

    // Try to get Node.js fs module (multiple methods for different Electron configs)
    var _agFs = null;
    try { _agFs = require('fs'); } catch (e) { }
    if (!_agFs) try { _agFs = globalThis.__non_webpack_require__('fs'); } catch (e) { }
    if (!_agFs) try { _agFs = globalThis.nodeRequire('fs'); } catch (e) { }

    console.log('[AG Auto] Config path:', _agConfigPath);
    console.log('[AG Auto] fs module:', _agFs ? 'loaded ✅' : 'not available, using XHR');

    function _agReadConfig() {
        // Method 1: Node.js fs (fastest, most reliable if available)
        if (_agFs) {
            try {
                return JSON.parse(_agFs.readFileSync(_agConfigPath, 'utf8'));
            } catch (e) { }
        }
        // Method 2: Synchronous XMLHttpRequest to file:// (works in Electron)
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'file:///' + _agConfigPath.replace(/\\/g, '/'), false);
            xhr.send();
            if (xhr.status === 0 || xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
        } catch (e) { }
        return null;
    }

    // Test config read immediately
    var _agTestCfg = _agReadConfig();
    console.log('[AG Auto] Config test read:', _agTestCfg ? 'OK ✅' : 'FAILED ❌');

    var _agConfigReload = setInterval(function () {
        if (!_agConfigPath) return;
        var cfg = _agReadConfig();
        if (cfg) {
            if (cfg.clickPatterns && Array.isArray(cfg.clickPatterns)) CLICK_PATTERNS = cfg.clickPatterns;
            if (cfg.pauseScrollMs) PAUSE_SCROLL_MS = cfg.pauseScrollMs;
            if (cfg.scrollIntervalMs) SCROLL_INTERVAL_MS = cfg.scrollIntervalMs;
            if (cfg.clickIntervalMs) CLICK_INTERVAL_MS = cfg.clickIntervalMs;
            // Live ON/OFF toggle
            if (typeof cfg.enabled === 'boolean') {
                if (_agEnabled !== cfg.enabled) {
                    console.log('[AG Auto] ' + (cfg.enabled ? '✅ BẬT' : '❌ TẮT') + ' (live toggle, no reload)');
                }
                _agEnabled = cfg.enabled;
            }
        }
    }, 2000);
    window._agToolIntervals.push(_agConfigReload);

    let lastManualScrollTime = 0;
    let isAutoScrolling = false;

    // =================================================================
    // CORE FIX: Only click APPROVAL buttons (NOT random UI buttons)
    // =================================================================
    var REJECT_WORDS = ['Reject', 'Deny', 'Cancel', 'Dismiss', 'Don\'t Allow', 'Decline'];

    function isApprovalButton(btn) {
        var parent = btn.parentElement;
        if (!parent) return false;
        for (var level = 0; level < 3; level++) {
            if (!parent) break;
            var siblingBtns = parent.querySelectorAll('button, a.action-label, [role="button"], .monaco-button, span.bg-ide-button-background');
            for (var i = 0; i < siblingBtns.length; i++) {
                var sib = siblingBtns[i];
                if (sib === btn) continue;
                var sibText = (sib.innerText || '').trim();
                for (var j = 0; j < REJECT_WORDS.length; j++) {
                    if (sibText === REJECT_WORDS[j] || sibText.startsWith(REJECT_WORDS[j])) {
                        return true;
                    }
                }
            }
            parent = parent.parentElement;
        }
        return false;
    }

    var _clicked = new WeakSet();

    // --- 1. AUTO CLICK ---
    let autoClick = setInterval(() => {
        if (!_agEnabled) return; // Live OFF check

        let clickables = Array.from(document.querySelectorAll('button, a.action-label, [role="button"], .monaco-button'));
        document.querySelectorAll('span.cursor-pointer').forEach(s => clickables.push(s));
        let targetBtn = clickables.find(b => {
            if (b.offsetParent === null) return false;
            if (_clicked.has(b)) return false;

            let text = (b.innerText || b.textContent || '').trim();
            if (!text || text.length > 40) return false;

            let matchesPattern = CLICK_PATTERNS.some(p =>
                text === p || text.startsWith(p)
            );
            if (!matchesPattern) return false;

            if (b.tagName === 'SPAN' && b.classList.contains('cursor-pointer')) return true;
            return isApprovalButton(b);
        });

        if (targetBtn) {
            console.log("[AG Auto] 🎯 Approval-Click: [" + targetBtn.innerText.trim() + "]");
            _clicked.add(targetBtn);
            targetBtn.click();
        }
    }, CLICK_INTERVAL_MS);
    window._agToolIntervals.push(autoClick);

    // --- 2. THEO DÕI CUỘN TAY ---
    window._agScrollListener = function (e) {
        if (!isAutoScrolling && e.isTrusted) {
            let el = e.target;
            if (el && el.nodeType === 1) {
                if (!el.closest('.monaco-editor') && !el.closest('.part.editor')) {
                    lastManualScrollTime = Date.now();
                }
            }
        }
    };
    window.addEventListener('scroll', window._agScrollListener, true);

    // --- 3. AUTO SCROLL ---
    let autoScroll = setInterval(() => {
        if (!_agEnabled) return; // Live OFF check

        let now = Date.now();
        if (now - lastManualScrollTime < PAUSE_SCROLL_MS) return;

        let scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
            let style = window.getComputedStyle(el);
            let hasScrollbar = el.scrollHeight > el.clientHeight &&
                (style.overflowY === 'auto' || style.overflowY === 'scroll');
            if (!hasScrollbar) return false;
            if (el.closest('.monaco-editor') || el.closest('.part.editor')) return false;
            if (el.tagName === 'TEXTAREA') return false;
            return true;
        });

        if (scrollables.length > 0) {
            isAutoScrolling = true;
            scrollables.forEach(el => {
                if (el.scrollHeight - el.scrollTop - el.clientHeight > 5) {
                    el.scrollTop = el.scrollHeight;
                }
            });
            setTimeout(() => { isAutoScrolling = false; }, 50);
        }

    }, SCROLL_INTERVAL_MS);
    window._agToolIntervals.push(autoScroll);

    console.log("[AG Auto] 🚀 v4.8.0 | Live ON/OFF toggle | Patterns:", JSON.stringify(CLICK_PATTERNS));
})();
