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

    // Live ON/OFF flag — exposed on window for all scopes + DevTools access
    window._agAutoEnabled = /*{{ENABLED}}*/true;

    // --- Config file path + fs module (captured in closure at startup) ---
    var _agConfigPath = '/*{{CONFIG_PATH}}*/';
    var _agFs = null;
    try { _agFs = require('fs'); } catch (e) { }
    if (!_agFs) try { _agFs = globalThis.__non_webpack_require__('fs'); } catch (e) { }

    console.log('[AG Auto] Config path:', _agConfigPath);
    console.log('[AG Auto] fs module:', _agFs ? 'loaded ✅' : 'NOT available ❌');

    // Test read at startup
    if (_agFs) {
        try {
            var _testRaw = _agFs.readFileSync(_agConfigPath, 'utf8');
            var _testCfg = JSON.parse(_testRaw);
            console.log('[AG Auto] Config test read: OK ✅, enabled=' + _testCfg.enabled);
            if (typeof _testCfg.enabled === 'boolean') window._agAutoEnabled = _testCfg.enabled;
        } catch (e) {
            console.log('[AG Auto] Config test read: FAILED ❌', e.message);
        }
    }

    // --- Config polling (reads file every 2s using captured _agFs) ---
    var _agPollCount = 0;
    var _agConfigReload = setInterval(function () {
        _agPollCount++;
        try {
            if (!_agFs) {
                if (_agPollCount <= 2) console.log('[AG Auto] Poll: fs unavailable');
                return;
            }
            var raw = _agFs.readFileSync(_agConfigPath, 'utf8');
            var cfg = JSON.parse(raw);
            if (!cfg) return;

            if (cfg.clickPatterns && Array.isArray(cfg.clickPatterns)) CLICK_PATTERNS = cfg.clickPatterns;
            if (cfg.pauseScrollMs) PAUSE_SCROLL_MS = cfg.pauseScrollMs;
            if (cfg.scrollIntervalMs) SCROLL_INTERVAL_MS = cfg.scrollIntervalMs;
            if (cfg.clickIntervalMs) CLICK_INTERVAL_MS = cfg.clickIntervalMs;

            if (typeof cfg.enabled === 'boolean') {
                if (window._agAutoEnabled !== cfg.enabled) {
                    console.log('[AG Auto] ' + (cfg.enabled ? '✅ BẬT' : '❌ TẮT') + ' (live toggle)');
                }
                window._agAutoEnabled = cfg.enabled;
            }

            if (_agPollCount <= 2) console.log('[AG Auto] Poll #' + _agPollCount + ' OK, enabled=' + window._agAutoEnabled);
        } catch (e) {
            if (_agPollCount <= 5) console.log('[AG Auto] Poll #' + _agPollCount + ' error:', e.message);
        }
    }, 2000);
    window._agToolIntervals.push(_agConfigReload);

    var lastManualScrollTime = 0;
    var isAutoScrolling = false;

    // =================================================================
    // Only click APPROVAL buttons (NOT random UI buttons)
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
    var autoClick = setInterval(function () {
        if (!window._agAutoEnabled) return;

        var clickables = Array.from(document.querySelectorAll('button, a.action-label, [role="button"], .monaco-button'));
        document.querySelectorAll('span.cursor-pointer').forEach(function (s) { clickables.push(s); });
        var targetBtn = null;
        for (var i = 0; i < clickables.length; i++) {
            var b = clickables[i];
            if (b.offsetParent === null) continue;
            if (_clicked.has(b)) continue;

            var text = (b.innerText || b.textContent || '').trim();
            if (!text || text.length > 40) continue;

            var matchesPattern = false;
            for (var p = 0; p < CLICK_PATTERNS.length; p++) {
                if (text === CLICK_PATTERNS[p] || text.indexOf(CLICK_PATTERNS[p]) === 0) {
                    matchesPattern = true;
                    break;
                }
            }
            if (!matchesPattern) continue;

            if (b.tagName === 'SPAN' && b.classList.contains('cursor-pointer')) {
                targetBtn = b;
                break;
            }
            if (isApprovalButton(b)) {
                targetBtn = b;
                break;
            }
        }

        if (targetBtn) {
            console.log("[AG Auto] 🎯 Click: [" + targetBtn.innerText.trim() + "]");
            _clicked.add(targetBtn);
            targetBtn.click();
        }
    }, CLICK_INTERVAL_MS);
    window._agToolIntervals.push(autoClick);

    // --- 2. THEO DÕI CUỘN TAY ---
    window._agScrollListener = function (e) {
        if (!isAutoScrolling && e.isTrusted) {
            var el = e.target;
            if (el && el.nodeType === 1) {
                if (!el.closest('.monaco-editor') && !el.closest('.part.editor')) {
                    lastManualScrollTime = Date.now();
                }
            }
        }
    };
    window.addEventListener('scroll', window._agScrollListener, true);

    // --- 3. AUTO SCROLL ---
    var autoScroll = setInterval(function () {
        if (!window._agAutoEnabled) return;

        var now = Date.now();
        if (now - lastManualScrollTime < PAUSE_SCROLL_MS) return;

        var scrollables = Array.from(document.querySelectorAll('*')).filter(function (el) {
            var style = window.getComputedStyle(el);
            var hasScrollbar = el.scrollHeight > el.clientHeight &&
                (style.overflowY === 'auto' || style.overflowY === 'scroll');
            if (!hasScrollbar) return false;
            if (el.closest('.monaco-editor') || el.closest('.part.editor')) return false;
            if (el.tagName === 'TEXTAREA') return false;
            return true;
        });

        if (scrollables.length > 0) {
            isAutoScrolling = true;
            scrollables.forEach(function (el) {
                if (el.scrollHeight - el.scrollTop - el.clientHeight > 5) {
                    el.scrollTop = el.scrollHeight;
                }
            });
            setTimeout(function () { isAutoScrolling = false; }, 50);
        }

    }, SCROLL_INTERVAL_MS);
    window._agToolIntervals.push(autoScroll);

    console.log("[AG Auto] 🚀 v4.12 | Live toggle via window._agAutoEnabled | Patterns:", JSON.stringify(CLICK_PATTERNS));
})();
