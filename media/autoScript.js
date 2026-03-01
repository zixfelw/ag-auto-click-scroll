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

    // --- Auto-dismiss "corrupt installation" notification ---
    (function suppressCorruptBanner() {
        function dismissCorrupt() {
            var banners = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-list-item');
            banners.forEach(function (b) {
                var text = b.textContent || '';
                if (text.indexOf('corrupt') !== -1 || text.indexOf('reinstall') !== -1) {
                    var closeBtn = b.querySelector('.codicon-notifications-clear, .codicon-close, .action-label[aria-label*="Close"], .action-label[aria-label*="clear"], .clear-notification-action');
                    if (closeBtn) {
                        closeBtn.click();
                        console.log('[AG Auto] 🧹 Dismissed corrupt notification');
                    } else {
                        b.style.display = 'none';
                        console.log('[AG Auto] 🧹 Hidden corrupt notification');
                    }
                }
            });
        }
        // Check immediately and periodically for the first 30s
        dismissCorrupt();
        var attempts = 0;
        var timer = setInterval(function () {
            dismissCorrupt();
            if (++attempts > 30) clearInterval(timer);
        }, 1000);
        // Also watch DOM mutations
        try {
            var observer = new MutationObserver(function () { dismissCorrupt(); });
            var target = document.body || document.documentElement;
            observer.observe(target, { childList: true, subtree: true });
            setTimeout(function () { observer.disconnect(); }, 30000);
        } catch (e) { }
    })();

    var PAUSE_SCROLL_MS = /*{{PAUSE_SCROLL_MS}}*/7000;
    var CLICK_INTERVAL_MS = /*{{CLICK_INTERVAL_MS}}*/1000;
    var SCROLL_INTERVAL_MS = /*{{SCROLL_INTERVAL_MS}}*/500;
    var CLICK_PATTERNS = /*{{CLICK_PATTERNS}}*/["Allow", "Always Allow", "Run", "Keep Waiting", "Accept all"];

    // Live ON/OFF flag — exposed on window for all scopes + DevTools access
    window._agAutoEnabled = /*{{ENABLED}}*/true;
    window._agScrollEnabled = true; // separate scroll toggle

    // --- ON/OFF polling via HTTP server (Extension Host runs on port 48787) ---
    var AG_HTTP_PORT = 48787;
    var _agPollCount = 0;
    var _agPollErrors = 0;
    var _agConfigReload = setInterval(function () {
        _agPollCount++;
        // Stop polling after too many consecutive errors (e.g. remote/SSH context)
        if (_agPollErrors > 5) return;
        try {
            var xhr = new XMLHttpRequest();
            // Send click stats with each poll so the extension host can track them
            var statsParam = '';
            if (window._agTotalClicks > 0) {
                statsParam = '&total=' + window._agTotalClicks + '&stats=' + encodeURIComponent(JSON.stringify(window._agClickStats || {}));
            }
            xhr.open('GET', 'http://127.0.0.1:' + AG_HTTP_PORT + '/ag-status?t=' + Date.now() + statsParam, true); // ASYNC — won't block UI
            xhr.timeout = 1500; // 1.5s timeout to prevent hanging
            xhr.onload = function () {
                if (xhr.status === 200) {
                    _agPollErrors = 0; // reset error counter on success
                    var cfg = JSON.parse(xhr.responseText);
                    if (typeof cfg.enabled === 'boolean') {
                        if (window._agAutoEnabled !== cfg.enabled) {
                            console.log('[AG Auto] ' + (cfg.enabled ? '✅ BẬT' : '❌ TẮT') + ' (live toggle via HTTP)');
                        }
                        window._agAutoEnabled = cfg.enabled;
                    }
                    if (typeof cfg.scrollEnabled === 'boolean') window._agScrollEnabled = cfg.scrollEnabled;
                    if (cfg.clickPatterns && Array.isArray(cfg.clickPatterns)) CLICK_PATTERNS = cfg.clickPatterns;
                    if (cfg.pauseScrollMs) PAUSE_SCROLL_MS = cfg.pauseScrollMs;
                    if (cfg.scrollIntervalMs) SCROLL_INTERVAL_MS = cfg.scrollIntervalMs;
                    if (cfg.clickIntervalMs) CLICK_INTERVAL_MS = cfg.clickIntervalMs;
                    // Handle reset stats signal from extension
                    if (cfg.resetStats) {
                        window._agClickStats = {};
                        window._agTotalClicks = 0;
                        console.log('[AG Auto] 🔄 Stats reset by user');
                    }
                    if (_agPollCount <= 2) console.log('[AG Auto] HTTP Poll #' + _agPollCount + ' OK, enabled=' + window._agAutoEnabled + ', patterns=' + CLICK_PATTERNS.length);
                }
            };
            xhr.onerror = function () { _agPollErrors++; };
            xhr.ontimeout = function () { _agPollErrors++; };
            xhr.send();
        } catch (e) {
            _agPollErrors++;
            if (_agPollCount <= 3) console.log('[AG Auto] HTTP Poll #' + _agPollCount + ' error:', e.message);
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

    // Words in buttons that should NEVER be auto-clicked (editor/diff UI buttons)
    var EDITOR_SKIP_WORDS = ['Accept Changes', 'Accept All', 'Accept Incoming', 'Accept Current', 'Accept Both', 'Accept Combination'];

    var _clicked = new WeakSet();

    // --- Click Stats tracking ---
    if (!window._agClickStats) window._agClickStats = {};
    if (!window._agTotalClicks) window._agTotalClicks = 0;

    // --- 1. AUTO CLICK ---
    var autoClick = setInterval(function () {
        if (!window._agAutoEnabled) return;

        var clickables = Array.from(document.querySelectorAll('button, a.action-label, [role="button"], .monaco-button'));
        document.querySelectorAll('span.cursor-pointer').forEach(function (s) { clickables.push(s); });
        var targetBtn = null;
        var matchedPattern = '';
        for (var i = 0; i < clickables.length; i++) {
            var b = clickables[i];
            if (b.offsetParent === null) continue;
            if (_clicked.has(b)) continue;

            var text = (b.innerText || b.textContent || '').trim();
            if (!text || text.length > 40) continue;

            // Skip diff/merge editor buttons — NEVER click these
            var skipEditor = false;
            for (var se = 0; se < EDITOR_SKIP_WORDS.length; se++) {
                if (text.indexOf(EDITOR_SKIP_WORDS[se]) === 0) { skipEditor = true; break; }
            }
            if (skipEditor) continue;

            // Skip buttons inside diff/merge editor containers
            if (b.closest && (b.closest('.monaco-diff-editor') || b.closest('.merge-editor-view') || b.closest('.inline-merge-region') || b.closest('.merged-editor'))) continue;

            var matchesPattern = false;
            for (var p = 0; p < CLICK_PATTERNS.length; p++) {
                if (text === CLICK_PATTERNS[p] || text.indexOf(CLICK_PATTERNS[p]) === 0) {
                    matchesPattern = true;
                    matchedPattern = CLICK_PATTERNS[p];
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
            // Track click stats
            window._agTotalClicks++;
            if (!window._agClickStats[matchedPattern]) window._agClickStats[matchedPattern] = 0;
            window._agClickStats[matchedPattern]++;
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
    var _atBottom = new WeakSet(); // track elements already at bottom
    var autoScroll = setInterval(function () {
        if (!window._agAutoEnabled) return;
        if (!window._agScrollEnabled) return;

        var now = Date.now();
        if (now - lastManualScrollTime < PAUSE_SCROLL_MS) return;

        var scrollables = Array.from(document.querySelectorAll('*')).filter(function (el) {
            var style = window.getComputedStyle(el);
            var hasScrollbar = el.scrollHeight > el.clientHeight &&
                (style.overflowY === 'auto' || style.overflowY === 'scroll');
            if (!hasScrollbar) return false;
            // Skip code editor and text areas
            if (el.closest('.monaco-editor') || el.closest('.part.editor')) return false;
            if (el.tagName === 'TEXTAREA') return false;
            // ONLY scroll inside the Antigravity chat panel — skip history, sidebar, everything else
            if (!el.closest('.antigravity-agent-side-panel')) return false;
            return true;
        });

        if (scrollables.length > 0) {
            isAutoScrolling = true;
            scrollables.forEach(function (el) {
                var gap = el.scrollHeight - el.scrollTop - el.clientHeight;
                if (gap > 5) {
                    // Not at bottom yet — scroll down and clear "at bottom" flag
                    _atBottom.delete(el);
                    el.scrollTop = el.scrollHeight;
                } else {
                    // Already at bottom — mark it, do nothing (prevents jitter)
                    _atBottom.add(el);
                }
            });
            setTimeout(function () { isAutoScrolling = false; }, 50);
        }

    }, SCROLL_INTERVAL_MS);
    window._agToolIntervals.push(autoScroll);

    console.log("[AG Auto] 🚀 v4.12 | Live toggle via window._agAutoEnabled | Patterns:", JSON.stringify(CLICK_PATTERNS));
})();
