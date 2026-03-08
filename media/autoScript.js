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
    // Accept is handled SEPARATELY (chat-only) — never in CLICK_PATTERNS
    window._agAcceptChatOnly = false;

    // Live ON/OFF flag — exposed on window for all scopes + DevTools access
    window._agAutoEnabled = /*{{ENABLED}}*/true;
    window._agScrollEnabled = true; // separate scroll toggle

    // --- ON/OFF polling via HTTP server (dynamic port discovery) ---
    var AG_HTTP_PORT_START = 48787;
    var AG_HTTP_PORT_END = 48850;
    var AG_HTTP_PORT = 0; // Will be discovered dynamically
    var _agPollCount = 0;
    var _agPollErrors = 0;
    var _agPortScanning = false;
    // Track ONLY this session's clicks (delta since last send)
    var _agSessionStats = {};
    var _agSessionTotal = 0;

    // --- Port Discovery: scan range to find our server ---
    function _agDiscoverPort(callback) {
        if (_agPortScanning) return;
        _agPortScanning = true;
        var found = false;
        var pending = 0;
        var startPort = AG_HTTP_PORT_START;
        // Try ports in batches of 8 to avoid too many simultaneous XHRs
        function tryBatch(from) {
            if (from > AG_HTTP_PORT_END || found) {
                if (!found) {
                    _agPortScanning = false;
                    console.log('[AG Auto] Port scan: no server found in range ' + AG_HTTP_PORT_START + '-' + AG_HTTP_PORT_END);
                }
                return;
            }
            var batchEnd = Math.min(from + 7, AG_HTTP_PORT_END);
            pending = 0;
            for (var p = from; p <= batchEnd; p++) {
                (function (port) {
                    pending++;
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'http://127.0.0.1:' + port + '/ag-status?t=' + Date.now(), true);
                    xhr.timeout = 800;
                    xhr.onload = function () {
                        if (found) return;
                        if (xhr.status === 200) {
                            try {
                                var cfg = JSON.parse(xhr.responseText);
                                if (typeof cfg.enabled === 'boolean') {
                                    found = true;
                                    AG_HTTP_PORT = port;
                                    _agPortScanning = false;
                                    console.log('[AG Auto] ✅ Discovered server on port ' + port);
                                    if (callback) callback(port, cfg);
                                }
                            } catch (_e) { }
                        }
                        pending--;
                        if (pending <= 0 && !found) tryBatch(batchEnd + 1);
                    };
                    xhr.onerror = function () { pending--; if (pending <= 0 && !found) tryBatch(batchEnd + 1); };
                    xhr.ontimeout = function () { pending--; if (pending <= 0 && !found) tryBatch(batchEnd + 1); };
                    xhr.send();
                })(p);
            }
        }
        tryBatch(startPort);
    }

    function _agApplyConfig(cfg) {
        if (typeof cfg.enabled === 'boolean') {
            if (window._agAutoEnabled !== cfg.enabled) {
                console.log('[AG Auto] ' + (cfg.enabled ? '✅ BẬT' : '❌ TẮT') + ' (live toggle via HTTP)');
            }
            window._agAutoEnabled = cfg.enabled;
        }
        if (typeof cfg.scrollEnabled === 'boolean') window._agScrollEnabled = cfg.scrollEnabled;
        if (cfg.clickPatterns && Array.isArray(cfg.clickPatterns)) {
            CLICK_PATTERNS = cfg.clickPatterns.filter(function (p) { return p !== 'Accept'; });
        }
        if (typeof cfg.acceptInChatOnly === 'boolean') window._agAcceptChatOnly = cfg.acceptInChatOnly;
        if (cfg.pauseScrollMs) PAUSE_SCROLL_MS = cfg.pauseScrollMs;
        if (cfg.scrollIntervalMs) SCROLL_INTERVAL_MS = cfg.scrollIntervalMs;
        if (cfg.clickIntervalMs) CLICK_INTERVAL_MS = cfg.clickIntervalMs;
        if (cfg.clickStats) window._agClickStats = cfg.clickStats;
        if (typeof cfg.totalClicks === 'number') window._agTotalClicks = cfg.totalClicks;
        if (cfg.resetStats) {
            window._agClickStats = {};
            window._agTotalClicks = 0;
            _agSessionStats = {};
            _agSessionTotal = 0;
            console.log('[AG Auto] 🔄 Stats reset by user');
        }
    }

    // Initial port discovery
    _agDiscoverPort(function (port, cfg) {
        _agApplyConfig(cfg);
        _agPollErrors = 0;
    });

    var _agConfigReload = setInterval(function () {
        _agPollCount++;
        // If port not discovered yet, re-scan every 10 polls
        if (AG_HTTP_PORT === 0) {
            if (_agPollCount % 5 === 0) _agDiscoverPort(function (port, cfg) { _agApplyConfig(cfg); _agPollErrors = 0; });
            return;
        }
        // If too many errors, try to re-discover port (server may have restarted on new port)
        if (_agPollErrors > 3) {
            AG_HTTP_PORT = 0;
            _agPollErrors = 0;
            _agDiscoverPort(function (port, cfg) { _agApplyConfig(cfg); });
            return;
        }
        try {
            var xhr = new XMLHttpRequest();
            var statsParam = '';
            if (_agSessionTotal > 0) {
                statsParam = '&total=' + _agSessionTotal + '&stats=' + encodeURIComponent(JSON.stringify(_agSessionStats));
                _agSessionStats = {};
                _agSessionTotal = 0;
            }
            xhr.open('GET', 'http://127.0.0.1:' + AG_HTTP_PORT + '/ag-status?t=' + Date.now() + statsParam, true);
            xhr.timeout = 1500;
            xhr.onload = function () {
                if (xhr.status === 200) {
                    _agPollErrors = 0;
                    var cfg = JSON.parse(xhr.responseText);
                    _agApplyConfig(cfg);
                    if (_agPollCount <= 2) console.log('[AG Auto] HTTP Poll #' + _agPollCount + ' OK on port ' + AG_HTTP_PORT + ', enabled=' + window._agAutoEnabled + ', patterns=' + CLICK_PATTERNS.length);
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

            // Skip buttons inside diff/merge editor containers + view-zones (inline widgets)
            if (b.closest && (
                b.closest('.monaco-diff-editor') || b.closest('.merge-editor-view') ||
                b.closest('.inline-merge-region') || b.closest('.merged-editor') ||
                b.closest('.view-zones') || b.closest('.view-lines') ||
                b.closest('[id*="workbench.parts.editor"]')
            )) continue;

            // Skip diff hunk buttons (inline accept/reject in editor) — NEVER auto-click these
            if (b.classList && (b.classList.contains('diff-hunk-button') || b.classList.contains('accept') || b.classList.contains('revert'))) {
                // Only skip if also inside editor area (has 'editor' anywhere in ancestor classes/ids)
                var editorAncestor = b.closest && b.closest('[class*="editor"], [id*="editor"]');
                if (editorAncestor) continue;
            }

            var matchesPattern = false;
            for (var p = 0; p < CLICK_PATTERNS.length; p++) {
                var pat = CLICK_PATTERNS[p];
                if (text === pat || text.indexOf(pat) === 0) {
                    matchesPattern = true;
                    matchedPattern = pat;
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

        // --- SEPARATE Accept handling (chat-only, never via CLICK_PATTERNS) ---

        if (!targetBtn && window._agAcceptChatOnly) {
            for (var ai = 0; ai < clickables.length; ai++) {
                var ab = clickables[ai];
                if (ab.offsetParent === null) continue;
                if (_clicked.has(ab)) continue;
                var aText = (ab.innerText || ab.textContent || '').trim();

                // Must start with "Accept"
                if (aText.indexOf('Accept') !== 0) continue;

                // Block known editor/bulk accept patterns (case-insensitive)
                if (/^Accept\s+(all|changes|incoming|current|both|combination)/i.test(aText)) continue;

                // BLOCK: skip if inside editor area
                if (ab.closest && (
                    ab.closest('.editor-scrollable') ||
                    ab.closest('.monaco-diff-editor') ||
                    ab.closest('.view-zones') ||
                    ab.closest('.merge-editor-view')
                )) {
                    console.log('[AG Auto] ⛔ Accept BLOCKED (inside editor): [' + aText.substring(0, 20) + ']');
                    continue;
                }

                // Skip diff hunk buttons by CSS class
                if (ab.classList && (ab.classList.contains('diff-hunk-button') || ab.classList.contains('revert'))) {
                    console.log('[AG Auto] ⛔ Accept BLOCKED (diff-hunk class): [' + aText.substring(0, 20) + ']');
                    continue;
                }

                // PASSED all checks → click it
                targetBtn = ab;
                matchedPattern = 'Accept';
                console.log('[AG Auto] ✅ Accept clicked in chat: [' + aText.substring(0, 25) + ']');
                break;
            }
        }

        if (targetBtn) {
            // Log click before executing
            try {
                var _lx = new XMLHttpRequest();
                _lx.open('POST', 'http://127.0.0.1:' + AG_HTTP_PORT + '/api/click-log', true);
                _lx.setRequestHeader('Content-Type', 'application/json');
                _lx.timeout = 3000;
                _lx.send(JSON.stringify({ button: targetBtn.innerText.trim().substring(0, 100), pattern: matchedPattern }));
            } catch (_e) { }
            console.log("[AG Auto] 🎯 Click: [" + targetBtn.innerText.trim() + "]");
            _clicked.add(targetBtn);
            targetBtn.click();
            // Track click in session delta (server will accumulate)
            _agSessionTotal++;
            if (!_agSessionStats[matchedPattern]) _agSessionStats[matchedPattern] = 0;
            _agSessionStats[matchedPattern]++;
            // Also update window display stats immediately
            window._agTotalClicks++;
            if (!window._agClickStats[matchedPattern]) window._agClickStats[matchedPattern] = 0;
            window._agClickStats[matchedPattern]++;
        }
    }, CLICK_INTERVAL_MS);
    window._agToolIntervals.push(autoClick);

    // --- 2. SMART SCROLL: MutationObserver detects agent activity ---
    var _agLastContentChange = 0; // timestamp of last DOM change in chat panel
    var _agScrollObserver = null;

    // Start observing chat panel for DOM mutations
    function _agStartScrollObserver() {
        if (_agScrollObserver) return;
        function attachObserver() {
            var chatPanel = document.querySelector('.antigravity-agent-side-panel');
            if (!chatPanel) return false;
            _agScrollObserver = new MutationObserver(function (mutations) {
                // Filter: only count meaningful content changes from AGENT output
                // SKIP mutations inside chat input area (user typing)
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    var target = m.target;
                    // Skip if mutation is inside an input/textarea/contenteditable (user typing)
                    if (target) {
                        var node = target.nodeType === 3 ? target.parentElement : target;
                        if (node && (
                            node.tagName === 'TEXTAREA' || node.tagName === 'INPUT' ||
                            node.isContentEditable ||
                            (node.closest && (
                                node.closest('textarea') ||
                                node.closest('[contenteditable="true"]') ||
                                node.closest('[contenteditable="plaintext-only"]') ||
                                node.closest('.chat-input') ||
                                node.closest('.interactive-input-part') ||
                                node.closest('.interactive-input') ||
                                node.closest('.monaco-inputbox') ||
                                node.closest('.input-editor')
                            ))
                        )) continue;
                    }
                    if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
                        _agLastContentChange = Date.now();
                        return;
                    }
                    if (m.type === 'characterData') {
                        _agLastContentChange = Date.now();
                        return;
                    }
                }
            });
            _agScrollObserver.observe(chatPanel, {
                childList: true,
                subtree: true,
                characterData: true
            });
            console.log('[AG Auto] 📜 Smart scroll observer attached to chat panel');
            return true;
        }
        // Try to attach immediately, retry every 2s if chat panel not ready yet
        if (!attachObserver()) {
            var retryCount = 0;
            var retryTimer = setInterval(function () {
                if (attachObserver() || ++retryCount > 30) clearInterval(retryTimer);
            }, 2000);
        }
    }
    _agStartScrollObserver();

    // --- Manual scroll detection (still needed to pause during user scroll) ---
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

    // --- 3. AUTO SCROLL (smart: only when agent is generating) ---
    var _atBottom = new WeakSet(); // track elements already at bottom
    var autoScroll = setInterval(function () {
        if (!window._agAutoEnabled) return;
        if (!window._agScrollEnabled) return;

        var now = Date.now();
        // Pause if user manually scrolled recently
        if (now - lastManualScrollTime < PAUSE_SCROLL_MS) return;
        // SMART: only scroll if content changed recently (agent is generating)
        if (_agLastContentChange === 0 || (now - _agLastContentChange > PAUSE_SCROLL_MS)) return;

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
