// ===========================================================
// AG Auto Click & Scroll — VS Code Extension
// ===========================================================
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Tag markers để tìm và xoá script đã inject
const TAG_START = '<!-- AG-AUTO-CLICK-SCROLL-START -->';
const TAG_END = '<!-- AG-AUTO-CLICK-SCROLL-END -->';

/**
 * Ghi file với auto-elevation trên Linux/macOS khi gặp EACCES
 * - Linux: dùng pkexec (native password dialog)
 * - macOS: dùng osascript (native password dialog)
 * - Windows: throw lại lỗi (user cần Run as Admin)
 */
function writeFileElevated(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
    } catch (err) {
        if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;

        const tmpPath = path.join(os.tmpdir(), 'ag-auto-' + Date.now() + '.tmp');
        fs.writeFileSync(tmpPath, content, 'utf8');

        try {
            if (process.platform === 'linux') {
                // pkexec shows native Linux password dialog
                execSync(`pkexec bash -c "cp '${tmpPath}' '${filePath}' && chmod 644 '${filePath}'"`, { timeout: 30000 });
                console.log('[AG Auto] ✅ Elevated write (pkexec) →', path.basename(filePath));
            } else if (process.platform === 'darwin') {
                // macOS: osascript shows native password dialog
                const cmd = `cp '${tmpPath}' '${filePath}' && chmod 644 '${filePath}'`;
                execSync(`osascript -e 'do shell script "${cmd}" with administrator privileges'`, { timeout: 30000 });
                console.log('[AG Auto] ✅ Elevated write (osascript) →', path.basename(filePath));
            } else {
                // Windows: throw original error
                throw err;
            }
        } catch (elevErr) {
            try { fs.unlinkSync(tmpPath); } catch (_) { }
            if (elevErr === err) throw err;
            console.error('[AG Auto] Elevation failed:', elevErr.message);
            throw new Error(`Permission denied. Trên Linux, hãy thử: sudo chmod -R a+w "${path.dirname(filePath)}"`);
        }

        try { fs.unlinkSync(tmpPath); } catch (_) { }
    }
}

/**
 * Tìm file workbench.html của VS Code
 */
function getWorkbenchPath() {
    const appRoot = vscode.env.appRoot;
    console.log('[AG Auto] appRoot:', appRoot);

    // Thử nhiều đường dẫn phổ biến (VS Code + Antigravity)
    const candidates = [
        path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
        path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
        path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.html'),
        path.join(appRoot, 'out', 'vs', 'code', 'browser', 'workbench', 'workbench.html'),
        path.join(appRoot, 'out', 'vs', 'code', 'electron-main', 'workbench', 'workbench.html'),
    ];
    for (const p of candidates) {
        console.log('[AG Auto] Thử:', p, '->', fs.existsSync(p) ? 'TÌM THẤY!' : 'không có');
        if (fs.existsSync(p)) return p;
    }
    // Fallback: tìm bằng đệ quy với depth lớn hơn
    console.log('[AG Auto] Không tìm thấy trong candidates, thử tìm đệ quy...');
    const outDir = path.join(appRoot, 'out');
    const found = findFileRecursive(outDir, 'workbench.html', 6);
    console.log('[AG Auto] Kết quả tìm đệ quy:', found || 'KHÔNG TÌM THẤY');
    return found;
}

/**
 * Tìm file đệ quy với giới hạn depth
 */
function findFileRecursive(dir, filename, maxDepth) {
    if (maxDepth <= 0) return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === filename) return fullPath;
            if (entry.isDirectory()) {
                const result = findFileRecursive(fullPath, filename, maxDepth - 1);
                if (result) return result;
            }
        }
    } catch (_) { }
    return null;
}

/**
 * Đọc config từ VS Code settings và tạo nội dung script
 */
function buildScriptContent(context) {
    const config = vscode.workspace.getConfiguration('ag-auto');
    const pauseMs = config.get('scrollPauseMs', 7000);
    const scrollMs = config.get('scrollIntervalMs', 500);
    const clickMs = config.get('clickIntervalMs', 1000);
    const allPatterns = config.get('clickPatterns', ['Allow', 'Always Allow', 'Run', 'Keep Waiting', 'Accept all']);
    const disabledPats = context.globalState.get('disabledClickPatterns', []);
    const patterns = allPatterns.filter(p => !disabledPats.includes(p));
    const enabled = config.get('enabled', true);

    // Đọc template script
    const templatePath = path.join(context.extensionPath, 'media', 'autoScript.js');
    let script = fs.readFileSync(templatePath, 'utf8');

    // Config path for live reload (dùng forward slashes cho Electron)
    const wbPath = getWorkbenchPath();
    const configFilePath = wbPath ? path.join(path.dirname(wbPath), 'ag-auto-config.json').replace(/\\/g, '/') : '';

    // Thay thế các placeholder bằng giá trị config thực
    script = script.replace(/\/\*\{\{PAUSE_SCROLL_MS\}\}\*\/\d+/, pauseMs.toString());
    script = script.replace(/\/\*\{\{SCROLL_INTERVAL_MS\}\}\*\/\d+/, scrollMs.toString());
    script = script.replace(/\/\*\{\{CLICK_INTERVAL_MS\}\}\*\/\d+/, clickMs.toString());
    script = script.replace(
        /\/\*\{\{CLICK_PATTERNS\}\}\*\/\[.*?\]/,
        JSON.stringify(patterns)
    );
    script = script.replace(/\/\*\{\{ENABLED\}\}\*\/\w+/, enabled.toString());
    script = script.replace(/\/\*\{\{CONFIG_PATH\}\}\*\//, configFilePath);

    return script;
}

/**
 * Ghi config JSON ra file Ä‘á»ƒ script inject reload realtime (khÃ´ng cáº§n restart)
 */
function writeConfigJson(context) {
    try {
        const wbPath = getWorkbenchPath();
        if (!wbPath) return;
        const wbDir = path.dirname(wbPath);
        const config = vscode.workspace.getConfiguration('ag-auto');
        const allPatterns = config.get('clickPatterns', ['Allow', 'Always Allow', 'Run', 'Keep Waiting']);
        const disabledPats = context.globalState.get('disabledClickPatterns', []);
        const activePatterns = allPatterns.filter(p => !disabledPats.includes(p));
        const enabled = config.get('enabled', true);
        const configData = JSON.stringify({
            enabled: enabled,
            clickPatterns: activePatterns,
            pauseScrollMs: config.get('scrollPauseMs', 7000),
            scrollIntervalMs: config.get('scrollIntervalMs', 500),
            clickIntervalMs: config.get('clickIntervalMs', 1000)
        });
        const configPath = path.join(wbDir, 'ag-auto-config.json');
        writeFileElevated(configPath, configData);
        console.log('[AG Auto] Config JSON updated:', configData);
    } catch (e) {
        console.error('[AG Auto] Error writing config JSON:', e.message);
    }
}


/**
 * Inject script vào workbench — thử nhiều cách để tương thích mọi phiên bản
 */
function installScript(context) {
    console.log('[AG Auto] installScript() đang chạy...');
    const wbPath = getWorkbenchPath();
    if (!wbPath) {
        console.error('[AG Auto] KHÔNG TÌM THẤY workbench.html!');
        vscode.window.showErrorMessage('[AG Auto] Không tìm thấy workbench.html! Hãy kiểm tra cài đặt VS Code.');
        return false;
    }
    console.log('[AG Auto] Tìm thấy workbench.html tại:', wbPath);

    const wbDir = path.dirname(wbPath);
    const scriptContent = buildScriptContent(context);

    // ===== Cách 1: Tìm và ghi vào file JS THẬT SỰ được load (bypass CSP hoàn toàn) =====
    const JS_TAG_START = '/* AG-AUTO-CLICK-SCROLL-JS-START */';
    const JS_TAG_END = '/* AG-AUTO-CLICK-SCROLL-JS-END */';

    try {
        // Đọc HTML để tìm các file JS thực sự được load
        const htmlContent = fs.readFileSync(wbPath, 'utf8');
        const scriptMatches = htmlContent.match(/src="([^"]*\.js)"/g) || [];
        const jsFiles = new Set();

        for (const match of scriptMatches) {
            const srcMatch = match.match(/src="([^"]*\.js)"/);
            if (srcMatch) {
                const jsName = path.basename(srcMatch[1].split('?')[0]);
                // Tìm file trong cùng thư mục và thư mục cha
                const sameDirPath = path.join(wbDir, jsName);
                if (fs.existsSync(sameDirPath)) {
                    jsFiles.add(sameDirPath);
                }
                // Tìm trong thư mục cha (2 cấp)
                const parent1 = path.join(wbDir, '..', jsName);
                if (fs.existsSync(parent1)) jsFiles.add(path.resolve(parent1));
                const parent2 = path.join(wbDir, '..', '..', jsName);
                if (fs.existsSync(parent2)) jsFiles.add(path.resolve(parent2));
            }
        }

        // Fallback: tìm workbench.desktop.main.js nếu chưa có
        if (jsFiles.size === 0) {
            const fallbackNames = ['workbench.desktop.main.js', 'workbench.js'];
            for (const name of fallbackNames) {
                // Tìm rộng hơn
                const found = findFileRecursive(path.join(wbDir, '..'), name, 3);
                if (found) { jsFiles.add(found); break; }
            }
        }

        console.log('[AG Auto] Tìm thấy', jsFiles.size, 'file JS để inject');

        for (const jsPath of jsFiles) {
            let jsContent = fs.readFileSync(jsPath, 'utf8');

            // Xóa inject cũ
            const jsRegex = new RegExp(`${escapeRegex(JS_TAG_START)}[\\s\\S]*?${escapeRegex(JS_TAG_END)}`, 'g');
            jsContent = jsContent.replace(jsRegex, '');

            // Thêm code vào cuối
            const jsInjection = `\n${JS_TAG_START}\n;(function(){try{${scriptContent}}catch(e){console.error('[AG Auto] Lỗi:',e);}})();\n${JS_TAG_END}`;
            jsContent += jsInjection;

            writeFileElevated(jsPath, jsContent);
            console.log('[AG Auto] ✅ Inject vào', path.basename(jsPath), '(bypass CSP)!');
        }
    } catch (err) {
        console.error('[AG Auto] Lỗi inject vào JS:', err.message);
    }

    // ===== Cách 2: Modify workbench.html — cache bust workbench.js + fallback script =====
    try {
        let html = fs.readFileSync(wbPath, 'utf8');
        const htmlRegex = new RegExp(`${escapeRegex(TAG_START)}[\\s\\S]*?${escapeRegex(TAG_END)}`, 'g');
        html = html.replace(htmlRegex, '');

        // Cache bust workbench.js để ép Chromium load lại từ đĩa (bypass V8 code cache)
        const ts = Date.now();
        html = html.replace(/src="workbench\.js(\?[^"]*)?"/g, `src="workbench.js?v=${ts}"`);
        console.log('[AG Auto] Cache bust workbench.js?v=' + ts);

        // Fallback: thêm ag-auto-script.js cho các bản cũ
        const destPath = path.join(wbDir, 'ag-auto-script.js');
        writeFileElevated(destPath, scriptContent);
        const injection = `\n${TAG_START}\n<script src="ag-auto-script.js?v=${ts}"></script>\n${TAG_END}`;
        html = html.replace('</html>', injection + '\n</html>');

        writeFileElevated(wbPath, html);
        console.log('[AG Auto] ✅ Inject + cache bust vào workbench.html!');
    } catch (err) {
        console.error('[AG Auto] Lỗi inject vào HTML:', err.message);
    }

    return true;
}

/**
 * Cập nhật checksums trong product.json sau khi inject/uninstall
 * để tránh lỗi "Your Antigravity installation appears to be corrupt"
 */
function updateProductChecksums() {
    try {
        // Tìm product.json qua nhiều cách
        let productJsonPath = null;

        // Cách 1: process.resourcesPath (nhanh nhất)
        if (process.resourcesPath) {
            const candidate = path.join(process.resourcesPath, 'app', 'product.json');
            if (fs.existsSync(candidate)) productJsonPath = candidate;
        }

        // Cách 2: Từ workbench path đi lên
        if (!productJsonPath) {
            const wbPath = getWorkbenchPath();
            if (!wbPath) return;
            let searchDir = path.dirname(wbPath);
            for (let i = 0; i < 8; i++) {
                const candidate = path.join(searchDir, 'product.json');
                if (fs.existsSync(candidate)) {
                    productJsonPath = candidate;
                    break;
                }
                searchDir = path.dirname(searchDir);
            }
        }

        if (!productJsonPath) {
            console.log('[AG Auto] product.json không tìm thấy, bỏ qua checksum update');
            return;
        }

        console.log('[AG Auto] Tìm thấy product.json:', productJsonPath);
        const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));

        if (!productJson.checksums) {
            console.log('[AG Auto] product.json không có trường checksums, bỏ qua');
            return;
        }
        // product.json ở resources/app/ nhưng files ở resources/app/out/
        const appRoot = path.dirname(productJsonPath);
        const outDir = path.join(appRoot, 'out');
        let updated = false;

        // Recalculate checksums cho tất cả files trong product.json
        for (const relativePath in productJson.checksums) {
            // relativePath dùng forward slashes (e.g. "vs/workbench/workbench.desktop.main.js")
            // Trên Windows cần convert thành native path separator
            const nativePath = relativePath.split('/').join(path.sep);
            // Thử tìm file ở out/ trước, nếu ko có thì thử appRoot trực tiếp
            let filePath = path.join(outDir, nativePath);
            if (!fs.existsSync(filePath)) filePath = path.join(appRoot, nativePath);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath);
                const hash = crypto.createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
                const oldHash = productJson.checksums[relativePath];
                if (oldHash !== hash) {
                    productJson.checksums[relativePath] = hash;
                    updated = true;
                    console.log('[AG Auto] Checksum updated:', relativePath, '(old:', oldHash.substring(0, 10) + '...', 'new:', hash.substring(0, 10) + '...)');
                }
            }
        }

        if (updated) {
            writeFileElevated(productJsonPath, JSON.stringify(productJson, null, '\t'));
            console.log('[AG Auto] ✅ product.json checksums đã cập nhật!');
        } else {
            console.log('[AG Auto] Checksums đã đúng, không cần update');
        }
        return updated;
    } catch (e) {
        console.error('[AG Auto] Lỗi update checksums:', e.message);
        return false;
    }
}

/**
 * Gỡ script khỏi workbench.html
 */
function uninstallScript() {
    const wbPath = getWorkbenchPath();
    if (!wbPath) return false;

    const wbDir = path.dirname(wbPath);
    const JS_TAG_START = '/* AG-AUTO-CLICK-SCROLL-JS-START */';
    const JS_TAG_END = '/* AG-AUTO-CLICK-SCROLL-JS-END */';

    try {
        // Xoá từ workbench.html
        let html = fs.readFileSync(wbPath, 'utf8');
        const htmlRegex = new RegExp(`${escapeRegex(TAG_START)}[\\s\\S]*?${escapeRegex(TAG_END)}`, 'g');
        html = html.replace(htmlRegex, '');
        writeFileElevated(wbPath, html);

        // Xoá file script
        const scriptPath = path.join(wbDir, 'ag-auto-script.js');
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

        // Xoá từ workbench.desktop.main.js
        const mainJsCandidates = ['workbench.desktop.main.js', 'workbench.js'];
        for (const name of mainJsCandidates) {
            const p = path.join(wbDir, name);
            if (fs.existsSync(p)) {
                let js = fs.readFileSync(p, 'utf8');
                const jsRegex = new RegExp(`${escapeRegex(JS_TAG_START)}[\\s\\S]*?${escapeRegex(JS_TAG_END)}`, 'g');
                js = js.replace(jsRegex, '');
                writeFileElevated(p, js);
            }
        }

        return true;
    } catch (err) {
        vscode.window.showErrorMessage(`[AG Auto] Không thể gỡ bỏ cấu hình do thiếu quyền Administrator. Vui lòng mở lại VS Code dưới quyền Admin! Chi tiết: ${err.message}`);
        return false;
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let _settingsPanel = null;

/**
 * Mở Webview Settings Panel
 */
function openSettingsPanel(context) {
    // Toggle: if panel is already open, close it
    if (_settingsPanel) {
        _settingsPanel.dispose();
        _settingsPanel = null;
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'agAutoSettings',
        'AG Auto Click & Scroll - Settings',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    _settingsPanel = panel;

    // Clear reference when panel is closed
    panel.onDidDispose(() => {
        _settingsPanel = null;
    });

    const config = vscode.workspace.getConfiguration('ag-auto');

    panel.webview.html = getSettingsHtml({
        enabled: config.get('enabled', true),
        scrollEnabled: config.get('scrollEnabled', true),
        scrollPauseMs: config.get('scrollPauseMs', 7000),
        scrollIntervalMs: config.get('scrollIntervalMs', 500),
        clickIntervalMs: config.get('clickIntervalMs', 1000),
        clickPatterns: config.get('clickPatterns', ['Allow', 'Always Allow', 'Run', 'Keep Waiting']),
        disabledClickPatterns: context.globalState.get('disabledClickPatterns', []),
        language: config.get('language', 'vi'),
        clickStats: _clickStats,
        totalClicks: _totalClicks
    });

    // Nhận message từ Webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'changeLang') {
            const cfg = vscode.workspace.getConfiguration('ag-auto');
            await cfg.update('language', msg.lang, vscode.ConfigurationTarget.Global);
            panel.webview.html = getSettingsHtml({
                enabled: cfg.get('enabled', true),
                scrollEnabled: cfg.get('scrollEnabled', true),
                scrollPauseMs: cfg.get('scrollPauseMs', 7000),
                scrollIntervalMs: cfg.get('scrollIntervalMs', 500),
                clickIntervalMs: cfg.get('clickIntervalMs', 1000),
                clickPatterns: cfg.get('clickPatterns', ['Run', 'Allow', 'Always Allow']),
                disabledClickPatterns: context.globalState.get('disabledClickPatterns', []),
                language: msg.lang,
                clickStats: _clickStats,
                totalClicks: _totalClicks
            });
            return;
        }
        if (msg.command === 'toggle') {
            _autoAcceptEnabled = msg.enabled;
            const cfg = vscode.workspace.getConfiguration('ag-auto');
            await cfg.update('enabled', msg.enabled, vscode.ConfigurationTarget.Global);
            writeConfigJson(context);
            updateStatusBarItem();
            console.log('[AG Auto] INSTANT toggle: ' + (_autoAcceptEnabled ? 'ON ✅' : 'OFF 🛑'));
            return;
        }
        if (msg.command === 'scrollToggle') {
            _httpScrollEnabled = msg.enabled;
            const cfg = vscode.workspace.getConfiguration('ag-auto');
            await cfg.update('scrollEnabled', msg.enabled, vscode.ConfigurationTarget.Global);
            updateStatusBarItem();
            console.log('[AG Auto] INSTANT scroll toggle: ' + (_httpScrollEnabled ? 'ON ✅' : 'OFF 🛑'));
            return;
        }
        if (msg.command === 'save') {
            console.log('[AG Auto] Nhận lệnh SAVE từ Webview, data:', JSON.stringify(msg.data));
            const cfg = vscode.workspace.getConfiguration('ag-auto');
            await cfg.update('enabled', msg.data.enabled, vscode.ConfigurationTarget.Global);
            await cfg.update('scrollPauseMs', msg.data.scrollPauseMs, vscode.ConfigurationTarget.Global);
            await cfg.update('scrollIntervalMs', msg.data.scrollIntervalMs, vscode.ConfigurationTarget.Global);
            await cfg.update('clickIntervalMs', msg.data.clickIntervalMs, vscode.ConfigurationTarget.Global);
            await cfg.update('clickPatterns', msg.data.clickPatterns, vscode.ConfigurationTarget.Global);
            await context.globalState.update('disabledClickPatterns', msg.data.disabledClickPatterns);
            try {
                await cfg.update('language', msg.data.language, vscode.ConfigurationTarget.Global);
            } catch (e) {
                console.log('[AG Auto] Language config update failed, storing in globalState:', e.message);
                await context.globalState.update('language', msg.data.language);
            }

            _autoAcceptEnabled = msg.data.enabled;
            _httpClickPatterns = msg.data.clickPatterns.filter(p => !msg.data.disabledClickPatterns.includes(p));
            _httpScrollConfig = {
                pauseScrollMs: msg.data.scrollPauseMs || 5000,
                scrollIntervalMs: msg.data.scrollIntervalMs || 500,
                clickIntervalMs: msg.data.clickIntervalMs || 2000
            };
            console.log('[AG Auto] HTTP state updated — patterns:', _httpClickPatterns.length, 'scroll:', JSON.stringify(_httpScrollConfig));

            writeConfigJson(context);
            updateStatusBarItem();

            const updatedLang = msg.data.language;
            let savedMsg = '$(check) [AG Auto] ✅ Đã lưu!';
            if (updatedLang === 'en') savedMsg = '$(check) [AG Auto] ✅ Saved!';
            if (updatedLang === 'zh') savedMsg = '$(check) [AG Auto] ✅ 已保存！';
            vscode.window.setStatusBarMessage(savedMsg, 3000);
        }
        if (msg.command === 'reload') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
        if (msg.command === 'resetStats') {
            _clickStats = {};
            _totalClicks = 0;
            _resetStatsRequested = true;
            // Clear persisted stats
            context.globalState.update('clickStats', {});
            context.globalState.update('totalClicks', 0);
            panel.webview.postMessage({ command: 'statsUpdated', clickStats: {}, totalClicks: 0 });
        }
        if (msg.command === 'getStats') {
            panel.webview.postMessage({ command: 'statsUpdated', clickStats: _clickStats, totalClicks: _totalClicks });
        }
    }, undefined, context.subscriptions);

    // Auto-refresh stats every 2s while panel is open
    const statsTimer = setInterval(() => {
        try {
            panel.webview.postMessage({ command: 'statsUpdated', clickStats: _clickStats, totalClicks: _totalClicks });
        } catch (e) { clearInterval(statsTimer); }
    }, 2000);
    panel.onDidDispose(() => clearInterval(statsTimer));
}

/**
 * Tạo HTML cho Settings Webview
 */
function getSettingsHtml(cfg) {
    const patternsJson = JSON.stringify(cfg.clickPatterns);
    const disabledPatternsJson = JSON.stringify(cfg.disabledClickPatterns);

    // Ngôn ngữ
    const lang = cfg.language || 'vi';
    const t = {
        vi: {
            title: "Cấu hình tự động nhấn nút và cuộn khung chat Antigravity",
            status: "Trạng thái",
            enableAuto: "Bật Auto Click & Scroll",
            autoScroll: "Auto Scroll",
            pauseMsTitle: "Thời gian nghỉ khi cuộn tay (ms)",
            pauseMsHint: "Khi bạn cuộn chuột, script sẽ nghỉ bấy nhiêu ms để bạn đọc",
            scrollMsTitle: "Tốc độ quét cuộn (ms)",
            scrollMsHint: "Thấp hơn = cuộn mượt hơn, tốn CPU hơn",
            autoClick: "Auto Click",
            clickMsTitle: "Tốc độ quét nút click (ms)",
            patternsTitle: "Danh sách text nút tự động click:",
            inputPlaceholder: "Nhập text nút mới...",
            btnAdd: "+ Thêm",
            btnSave: "💾 Lưu & Áp Dụng",
            zoomTitle: "Thu phóng",
            langTitle: "Ngôn ngữ / Language",
            clickOff: "Click để Tắt",
            clickOn: "Click để Bật",
            removeHover: "Xoá hẳn"
        },
        en: {
            title: "Configure automatic button clicking and Antigravity chat auto-scrolling",
            status: "Status",
            enableAuto: "Enable Auto Click & Scroll",
            autoScroll: "Auto Scroll",
            pauseMsTitle: "Manual Scroll Pause Time (ms)",
            pauseMsHint: "Script will pause for this duration when you manually scroll to read",
            scrollMsTitle: "Scroll Scan Speed (ms)",
            scrollMsHint: "Lower = smoother scrolling, higher CPU usage",
            autoClick: "Auto Click",
            clickMsTitle: "Click Scan Speed (ms)",
            patternsTitle: "List of button texts to auto-click:",
            inputPlaceholder: "Enter new button text...",
            btnAdd: "+ Add",
            btnSave: "💾 Save & Apply",
            zoomTitle: "Zoom",
            langTitle: "Ngôn ngữ / Language",
            clickOff: "Click to Disable",
            clickOn: "Click to Enable",
            removeHover: "Delete completely"
        },
        zh: {
            title: "配置自动点击按钮和 Antigravity 聊天框自动滚动",
            status: "状态",
            enableAuto: "启用 Auto Click & Scroll",
            autoScroll: "自动滚动",
            pauseMsTitle: "手动滚动暂停时间 (ms)",
            pauseMsHint: "手动滚动时，脚本将暂停此时间以便阅读",
            scrollMsTitle: "滚动扫描速度 (ms)",
            scrollMsHint: "越低 = 滚动越流畅，占用 CPU 越高",
            autoClick: "自动点击",
            clickMsTitle: "点击扫描速度 (ms)",
            patternsTitle: "自动点击按钮文本列表:",
            inputPlaceholder: "输入新按钮文本...",
            btnAdd: "+ 添加",
            btnSave: "💾 保存并应用",
            zoomTitle: "缩放",
            langTitle: "Ngôn ngữ / Language",
            clickOff: "点击禁用",
            clickOn: "点击启用",
            removeHover: "彻底删除"
        }
    };

    const strings = t[lang] || t['vi'];

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AG Auto Settings</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Segoe UI', system-ui, sans-serif;
        background: #1e1e2e;
        color: #e8ecf4;
        padding: 24px;
        line-height: 1.6;
    }
    .zoom-bar { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:20px; }
    .zoom-bar span { font-size:0.85em; color:#9098b0; }
    .zoom-bar button { width:32px; height:32px; border-radius:8px; border:1px solid #45475a; background:#313244; color:#e8ecf4; font-size:1.1em; cursor:pointer; transition:all 0.2s; }
    .zoom-bar button:hover { background:#45475a; border-color:#89b4fa; }
    .zoom-level { font-size:0.88em; color:#89b4fa; font-weight:600; min-width:44px; text-align:center; }
    h1 {
        font-size: 1.6em;
        background: linear-gradient(135deg, #89b4fa, #a6e3a1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 8px;
    }
    .subtitle { color: #9098b0; margin-bottom: 24px; font-size: 0.9em; }
    .title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
    .click-badge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #45475a, #313244); border: 1px solid #585b70; border-radius: 20px; padding: 4px 12px; font-size: 0.8em; color: #a6e3a1; font-weight: 600; }
    .click-badge .count { color: #f9e2af; font-size: 1.1em; }
    .btn-reset-stats { background: none; border: 1px solid #585b70; border-radius: 12px; color: #f38ba8; font-size: 0.7em; padding: 2px 10px; cursor: pointer; transition: all 0.2s; }
    .btn-reset-stats:hover { background: #f38ba8; color: #1e1e2e; }
    .stats-card { background: #313244; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #45475a; }
    .stats-card-title { font-size: 0.9em; color: #89b4fa; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .stats-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .stats-label { min-width: 100px; font-size: 0.8em; color: #cdd6f4; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stats-bar-bg { flex: 1; height: 18px; background: #1e1e2e; border-radius: 9px; overflow: hidden; position: relative; }
    .stats-bar { height: 100%; border-radius: 9px; transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); min-width: 0; position: relative; }
    .stats-bar.bar-1 { background: linear-gradient(90deg, #89b4fa, #74c7ec); }
    .stats-bar.bar-2 { background: linear-gradient(90deg, #a6e3a1, #94e2d5); }
    .stats-bar.bar-3 { background: linear-gradient(90deg, #f9e2af, #fab387); }
    .stats-bar.bar-4 { background: linear-gradient(90deg, #f38ba8, #eba0ac); }
    .stats-bar.bar-5 { background: linear-gradient(90deg, #cba6f7, #b4befe); }
    .stats-bar.bar-6 { background: linear-gradient(90deg, #94e2d5, #89dceb); }
    .stats-bar.bar-7 { background: linear-gradient(90deg, #fab387, #f9e2af); }
    .stats-bar.bar-8 { background: linear-gradient(90deg, #74c7ec, #89b4fa); }
    .stats-bar.bar-9 { background: linear-gradient(90deg, #eba0ac, #cba6f7); }
    .stats-count { min-width: 36px; font-size: 0.8em; color: #bac2de; font-weight: 600; text-align: left; }
    .stats-crown { font-size: 0.9em; }
    .stats-empty { color: #6c7086; font-size: 0.8em; font-style: italic; text-align: center; padding: 8px; }
    .card {
        background: #313244;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
        border: 1px solid #45475a;
        transition: border-color 0.2s;
    }
    .card:hover { border-color: #89b4fa; }
    .card-title {
        font-size: 1.1em;
        font-weight: 600;
        color: #89b4fa;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .field {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }
    .field:last-child { margin-bottom: 0; }
    label { color: #d4daf0; font-size: 0.95em; }
    input[type="number"], select {
        width: 140px;
        padding: 8px 12px;
        border: 1px solid #45475a;
        border-radius: 8px;
        background: #1e1e2e;
        color: #cdd6f4;
        font-size: 0.95em;
        outline: none;
        transition: border-color 0.2s;
    }
    input[type="number"]:focus, select:focus { border-color: #89b4fa; }
    .toggle {
        position: relative;
        width: 50px; height: 26px;
        cursor: pointer;
    }
    .toggle input { display: none; }
    .toggle .slider {
        position: absolute; inset: 0;
        background: #45475a;
        border-radius: 26px;
        transition: 0.3s;
    }
    .toggle .slider::before {
        content: '';
        position: absolute;
        left: 3px; top: 3px;
        width: 20px; height: 20px;
        background: #cdd6f4;
        border-radius: 50%;
        transition: 0.3s;
    }
    .toggle input:checked + .slider { background: #00d26a; box-shadow: 0 0 12px rgba(0,210,106,0.5); }
    .toggle input:checked + .slider::before { transform: translateX(24px); background: #fff; }

    /* Patterns */
    .pattern-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .pattern-tag {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #1e1e2e;
        border: 1px solid #585b70;
        border-radius: 20px;
        padding: 4px 12px 4px 10px;
        font-size: 0.9em;
        color: #a6e3a1;
        transition: border-color 0.2s, opacity 0.2s;
        cursor: pointer;
        user-select: none;
    }
    .pattern-tag.disabled {
        background: #313244;
        color: #6c7086;
        border-style: dashed;
        border-color: #45475a;
    }
    .pattern-tag:hover { border-color: #cdd6f4; }
    .pattern-tag .status-icon {
        font-size: 1em;
        line-height: 1;
        opacity: 0.8;
    }
    .pattern-tag.disabled .status-icon {
        opacity: 0.5;
    }
    .pattern-tag .remove {
        cursor: pointer;
        color: #f38ba8;
        font-weight: bold;
        font-size: 1.1em;
        line-height: 1;
        margin-left: 4px;
        padding: 0 4px;
    }
    .pattern-tag .remove:hover { color: #eba0ac; text-shadow: 0 0 5px rgba(235,160,172,0.5); }
    .add-pattern {
        display: flex;
        gap: 8px;
        margin-top: 12px;
    }
    .add-pattern input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #45475a;
        border-radius: 8px;
        background: #1e1e2e;
        color: #cdd6f4;
        outline: none;
    }
    .add-pattern input:focus { border-color: #89b4fa; }

    /* Buttons */
    .btn {
        padding: 10px 24px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.95em;
        font-weight: 600;
        transition: all 0.2s;
    }
    .btn-primary {
        background: linear-gradient(135deg, #89b4fa, #74c7ec);
        color: #1e1e2e;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(137,180,250,0.4); }
    .btn-add {
        background: #45475a;
        color: #a6e3a1;
        padding: 8px 16px;
        font-size: 0.9em;
    }
    .btn-add:hover { background: #585b70; }
    .actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 24px;
        gap: 12px;
    }
    .hint { color: #b8c0d8; font-size: 0.95em; display: block; margin-top: 6px; font-style: italic; opacity: 0.9; }
</style>
</head>
<body>
    <div class="title-row">
        <h1>⚡ AG Auto Click & Scroll</h1>
        <span class="click-badge" id="totalBadge">
            🎯 <span class="count" id="totalCount">${cfg.totalClicks || 0}</span> clicks
        </span>
    </div>
    <div class="stats-card" id="statsCard">
        <div class="stats-card-title">📊 Click Stats <button class="btn-reset-stats" onclick="resetStats()" title="Reset counter">↺ Reset</button></div>
        <div id="statsBars"></div>
    </div>
    <p class="subtitle">${strings.title}</p>

    <div class="zoom-bar">
        <span>${strings.zoomTitle}</span>
        <button onclick="zoomOut()">−</button>
        <span class="zoom-level" id="zoomDisplay">100%</span>
        <button onclick="zoomIn()">+</button>
        <button onclick="zoomReset()" style="font-size:0.75em;width:auto;padding:0 10px;">Reset</button>
    </div>

    <!-- Enable/Disable & Lang -->
    <div class="card">
        <div class="card-title">🔌 ${strings.status}</div>
        <div class="field">
            <label>${strings.enableAuto}</label>
            <label class="toggle">
                <input type="checkbox" id="chkEnabled" ${cfg.enabled ? 'checked' : ''} onchange="instantToggle()">
                <span class="slider"></span>
            </label>
        </div>
        <div class="field" style="margin-top: 12px;">
            <label>${strings.langTitle}</label>
            <select id="selLang" onchange="changeLang()">
                <option value="vi" ${lang === 'vi' ? 'selected' : ''}>Tiếng Việt</option>
                <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                <option value="zh" ${lang === 'zh' ? 'selected' : ''}>中文</option>
            </select>
        </div>
    </div>

    <!-- Scroll Settings -->
    <div class="card">
        <div class="card-title">📜 ${strings.autoScroll}</div>
        <div class="field">
            <label>Enable Auto Scroll</label>
            <label class="toggle">
                <input type="checkbox" id="chkScrollEnabled" ${cfg.scrollEnabled !== false ? 'checked' : ''} onchange="scrollToggle()">
                <span class="slider"></span>
            </label>
        </div>
        <div class="field" style="margin-top:12px;">
            <label>${strings.pauseMsTitle}</label>
            <input type="number" id="txtPauseMs" value="${cfg.scrollPauseMs}" min="1000" max="60000" step="500">
        </div>
        <p class="hint">${strings.pauseMsHint}</p>
        <br>
        <div class="field">
            <label>${strings.scrollMsTitle}</label>
            <input type="number" id="txtScrollMs" value="${cfg.scrollIntervalMs}" min="100" max="5000" step="100">
        </div>
        <p class="hint">${strings.scrollMsHint}</p>
    </div>

    <!-- Click Settings -->
    <div class="card">
        <div class="card-title">🎯 ${strings.autoClick}</div>
        <div class="field">
            <label>${strings.clickMsTitle}</label>
            <input type="number" id="txtClickMs" value="${cfg.clickIntervalMs}" min="200" max="5000" step="100">
        </div>

        <div style="margin-top: 16px;">
            <label>BUTTON TEMPLATES</label>
            <div class="pattern-list" id="templateList"></div>
            <div class="add-pattern">
                <input type="text" id="txtNewPattern" placeholder="${strings.inputPlaceholder}" onkeydown="if(event.key==='Enter')addPattern()">
                <button class="btn btn-add" onclick="addPattern()">${strings.btnAdd}</button>
            </div>
        </div>
    </div>

    <div class="actions">
        <button class="btn" style="background:#45475a;color:#e8ecf4;" onclick="vscode.postMessage({command:'reload'})">🔄 Reload</button>
        <button class="btn btn-primary" onclick="saveSettings()">${strings.btnSave}</button>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    const DEFAULT_PATTERNS = ['Run', 'Allow', 'Always Allow', 'Keep Waiting', 'Retry', 'Continue', 'Allow Once', 'Allow This Con', 'Accept all'];
    const DEFAULT_DISABLED = ['Accept all']; // These start OFF by default
    let patterns = ${patternsJson};
    let disabledPatterns = ${disabledPatternsJson};
    DEFAULT_PATTERNS.forEach(function(p) {
        if (patterns.indexOf(p) === -1 && disabledPatterns.indexOf(p) === -1) {
            if (DEFAULT_DISABLED.indexOf(p) !== -1) { disabledPatterns.push(p); }
            else { patterns.push(p); }
        }
    });
    // Cleanup: remove 'Allow This Conversion' (redundant with 'Allow This Con' default)
    patterns = patterns.filter(function(p) { return p !== 'Allow This Conversion'; });
    disabledPatterns = disabledPatterns.filter(function(p) { return p !== 'Allow This Conversion'; });

    // Display name overrides (pattern → display text)
    var DISPLAY_NAMES = { 'Allow This Con': 'Allow This Conversion' };
    function displayName(p) { return DISPLAY_NAMES[p] || p; }

    function renderPatterns() {
        var list = document.getElementById('templateList');
        var allP = [], seen = {};
        DEFAULT_PATTERNS.concat(patterns).concat(disabledPatterns).forEach(function(p) {
            if (!seen[p]) { seen[p] = true; allP.push(p); }
        });
        var h = '';
        allP.forEach(function(p) {
            var isOn = patterns.indexOf(p) !== -1;
            var isDef = DEFAULT_PATTERNS.indexOf(p) !== -1;
            var bg = isOn ? '#1e1e2e' : '#2a2a3a';
            var brd = isOn ? '#585b70' : '#45475a';
            var opa = isOn ? '1' : '0.5';
            var stIcon = isOn ? 'ON' : 'OFF';
            var stColor = isOn ? '#a6e3a1' : '#f38ba8';
            h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:' + bg + ';border:1px solid ' + brd + ';border-radius:8px;margin-bottom:6px;opacity:' + opa + '">';
            h += '<div style="display:flex;align-items:center;gap:10px">';
            h += '<input type="checkbox" ' + (isOn ? 'checked' : '') + ' onchange="togPat(&quot;' + p + '&quot;)" style="width:16px;height:16px;cursor:pointer;accent-color:#a6e3a1">';
            h += '<span style="font-weight:600;color:#cdd6f4">' + displayName(p) + '</span></div>';
            h += '<div style="display:flex;align-items:center;gap:8px">';
            if (!isDef) h += '<span onclick="delPat(&quot;' + p + '&quot;)" style="cursor:pointer;color:#f38ba8;margin-right:8px;font-size:0.85em">&#10006;</span>';
            h += '<span style="font-size:0.75em;padding:2px 8px;border-radius:4px;background:' + (isOn ? '#1a3a1a' : '#3a1a1a') + ';color:' + stColor + ';font-weight:600">' + stIcon + '</span>';
            h += '</div></div>';
        });
        list.innerHTML = h;
    }
    function togPat(v) {
        if (patterns.indexOf(v)!==-1) { patterns=patterns.filter(function(x){return x!==v}); if(disabledPatterns.indexOf(v)===-1) disabledPatterns.push(v); }
        else { disabledPatterns=disabledPatterns.filter(function(x){return x!==v}); if(patterns.indexOf(v)===-1) patterns.push(v); }
        renderPatterns();
    }
    function delPat(v) {
        if (DEFAULT_PATTERNS.indexOf(v)!==-1) return;
        patterns=patterns.filter(function(x){return x!==v});
        disabledPatterns=disabledPatterns.filter(function(x){return x!==v});
        renderPatterns();
    }
    function addPattern() {
        var input = document.getElementById('txtNewPattern');
        var val = input.value.trim();
        if (val && patterns.indexOf(val)===-1 && disabledPatterns.indexOf(val)===-1) {
            patterns.push(val); renderPatterns(); input.value = '';
        }
    }

    function saveSettings() {
        console.log('[AG Auto Webview] saveSettings() được gọi!');
        vscode.postMessage({
            command: 'save',
            data: {
                enabled:         document.getElementById('chkEnabled').checked,
                scrollPauseMs:   parseInt(document.getElementById('txtPauseMs').value) || 7000,
                scrollIntervalMs: parseInt(document.getElementById('txtScrollMs').value) || 500,
                clickIntervalMs: parseInt(document.getElementById('txtClickMs').value) || 1000,
                clickPatterns:   patterns,
                disabledClickPatterns: disabledPatterns,
                language:        document.getElementById('selLang').value
            }
        });
    }

    renderPatterns();

    function instantToggle() {
        var enabled = document.getElementById('chkEnabled').checked;
        vscode.postMessage({ command: 'toggle', enabled: enabled });
    }

    function scrollToggle() {
        var enabled = document.getElementById('chkScrollEnabled').checked;
        vscode.postMessage({ command: 'scrollToggle', enabled: enabled });
    }

    function changeLang() {
        const newLang = document.getElementById('selLang').value;
        vscode.postMessage({ command: 'changeLang', lang: newLang });
    }

    // Zoom
    var _zoomLevel = 100;
    try { var saved = localStorage.getItem('ag-zoom'); if(saved) _zoomLevel = parseInt(saved); } catch(e){}
    function applyZoom() {
        document.body.style.zoom = (_zoomLevel/100);
        document.getElementById('zoomDisplay').textContent = _zoomLevel + '%';
        try { localStorage.setItem('ag-zoom', _zoomLevel); } catch(e){}
    }
    function zoomIn() { if(_zoomLevel<150) { _zoomLevel+=10; applyZoom(); } }
    function zoomOut() { if(_zoomLevel>50) { _zoomLevel-=10; applyZoom(); } }
    function zoomReset() { _zoomLevel=100; applyZoom(); }
    if(_zoomLevel!==100) applyZoom();

    // Click Stats
    function resetStats() {
        vscode.postMessage({ command: 'resetStats' });
        document.getElementById('totalCount').textContent = '0';
        renderStatsBars({}, []);
    }

    // Stats chart uses DEFAULT_PATTERNS order
    var allPatterns = DEFAULT_PATTERNS.slice();

    // Display name overrides already defined above

    function renderStatsBars(stats, pats) {
        var container = document.getElementById('statsBars');
        if (!pats || pats.length === 0) { pats = allPatterns; }
        var maxCount = 0;
        for (var i = 0; i < pats.length; i++) {
            var c = (stats[pats[i]] || 0);
            if (c > maxCount) maxCount = c;
        }
        var html = '';
        for (var i = 0; i < pats.length; i++) {
            var name = pats[i];
            var count = stats[name] || 0;
            var pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            var barClass = 'bar-' + ((i % 9) + 1);
            var crown = (count > 0 && count === maxCount) ? ' <span class="stats-crown">\uD83D\uDC51</span>' : '';
            html += '<div class="stats-row">';
            html += '  <span class="stats-label">' + displayName(name) + '</span>';
            html += '  <div class="stats-bar-bg"><div class="stats-bar ' + barClass + '" style="width:' + pct + '%"></div></div>';
            html += '  <span class="stats-count">' + count + crown + '</span>';
            html += '</div>';
        }
        if (pats.length === 0) html = '<div class="stats-empty">No patterns configured</div>';
        container.innerHTML = html;
    }

    // Listen for stats updates from extension
    window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.command === 'statsUpdated') {
            document.getElementById('totalCount').textContent = msg.totalClicks || 0;
            renderStatsBars(msg.clickStats || {}, allPatterns);
        }
    });

    // Request initial stats
    vscode.postMessage({ command: 'getStats' });
    // Also render with initial data
    renderStatsBars(${JSON.stringify(cfg.clickStats || {})}, allPatterns);
</script>
</body>
</html>`;
}

// =============================================================
// STATUS BAR
// =============================================================
let statusBarItem;
let statusBarScroll;

function createStatusBarItem(context) {
    // Accept item (far right, higher priority = more left)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -10000);
    statusBarItem.command = 'ag-auto.openSettings';
    context.subscriptions.push(statusBarItem);

    // Scroll item (far right, next to Accept)
    statusBarScroll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -10001);
    statusBarScroll.command = 'ag-auto.openSettings';
    context.subscriptions.push(statusBarScroll);

    updateStatusBarItem();
    statusBarItem.show();
    statusBarScroll.show();
}

function updateStatusBarItem() {
    // Use in-memory vars (instant) instead of config (may lag)
    const acceptOn = _autoAcceptEnabled;
    const scrollOn = _httpScrollEnabled;

    // Accept item
    statusBarItem.text = acceptOn ? '$(check) Accept ON' : '$(circle-slash) Accept OFF';
    statusBarItem.color = acceptOn ? '#4EC9B0' : '#F44747';
    statusBarItem.backgroundColor = acceptOn ? undefined : new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = 'Auto Accept: ' + (acceptOn ? '✅ ON' : '❌ OFF') + '\nClick để mở Settings';

    // Scroll item
    statusBarScroll.text = scrollOn ? '$(check) Scroll ON' : '$(circle-slash) Scroll OFF';
    statusBarScroll.color = scrollOn ? '#4EC9B0' : '#F44747';
    statusBarScroll.backgroundColor = scrollOn ? undefined : new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarScroll.tooltip = 'Auto Scroll: ' + (scrollOn ? '✅ ON' : '❌ OFF') + '\nClick để mở Settings';
}

// =============================================================
// HTTP MICRO-SERVER for IPC with injected workbench script
// The injected script polls http://127.0.0.1:48787/ag-status
// Extension Host controls _autoAcceptEnabled, server returns it
// =============================================================
const http = require('http');
let _autoAcceptEnabled = true;
let _httpScrollEnabled = true;
let _httpClickPatterns = [];
let _httpScrollConfig = { pauseScrollMs: 5000, scrollIntervalMs: 500, clickIntervalMs: 2000 };
let _clickStats = {};
let _totalClicks = 0;
let _resetStatsRequested = false;
let _extensionContext = null;
let _httpServer = null;
const AG_HTTP_PORT = 48787;

function startHttpServer() {
    if (_httpServer) return;
    // Initialize from config
    const cfg = vscode.workspace.getConfiguration('ag-auto');
    _httpClickPatterns = cfg.get('clickPatterns', ['Allow', 'Always Allow', 'Run', 'Keep Waiting']);
    _httpScrollEnabled = cfg.get('scrollEnabled', true);
    _httpScrollConfig = {
        pauseScrollMs: cfg.get('scrollPauseMs', 5000),
        scrollIntervalMs: cfg.get('scrollIntervalMs', 500),
        clickIntervalMs: cfg.get('clickIntervalMs', 2000)
    };
    try {
        const url = require('url');
        _httpServer = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
            res.setHeader('Content-Type', 'application/json');

            const parsed = url.parse(req.url, true);

            // Receive click stats DELTA from autoScript via query params
            if (parsed.query && parsed.query.stats) {
                try {
                    const incoming = JSON.parse(decodeURIComponent(parsed.query.stats));
                    // ADD deltas to persisted stats (not replace!)
                    for (const key in incoming) {
                        if (!_clickStats[key]) _clickStats[key] = 0;
                        _clickStats[key] += incoming[key];
                    }
                    // Recalculate total from all stats
                    let total = 0;
                    for (const key in _clickStats) { total += _clickStats[key]; }
                    _totalClicks = total;
                    // Persist to globalState
                    if (_extensionContext) {
                        _extensionContext.globalState.update('clickStats', _clickStats);
                        _extensionContext.globalState.update('totalClicks', _totalClicks);
                    }
                } catch (e) { /* ignore parse errors */ }
            }

            // Reset stats endpoint
            if (parsed.pathname === '/ag-reset-stats') {
                _clickStats = {};
                _totalClicks = 0;
                res.writeHead(200);
                res.end(JSON.stringify({ reset: true }));
                return;
            }

            res.writeHead(200);
            const response = {
                enabled: _autoAcceptEnabled,
                scrollEnabled: _httpScrollEnabled,
                clickPatterns: _httpClickPatterns,
                pauseScrollMs: _httpScrollConfig.pauseScrollMs,
                scrollIntervalMs: _httpScrollConfig.scrollIntervalMs,
                clickIntervalMs: _httpScrollConfig.clickIntervalMs,
                clickStats: _clickStats,
                totalClicks: _totalClicks
            };
            if (_resetStatsRequested) {
                response.resetStats = true;
                _resetStatsRequested = false;
            }
            res.end(JSON.stringify(response));
        });
        _httpServer.listen(AG_HTTP_PORT, '127.0.0.1', () => {
            console.log('[AG Auto] ✅ HTTP server started on port ' + AG_HTTP_PORT);
        });
        _httpServer.on('error', (e) => {
            console.log('[AG Auto] ⚠️ HTTP server error (port ' + AG_HTTP_PORT + '):', e.message);
            // Try alternate port
            _httpServer.listen(AG_HTTP_PORT + 1, '127.0.0.1', () => {
                console.log('[AG Auto] ✅ HTTP server started on port ' + (AG_HTTP_PORT + 1));
            });
        });
    } catch (e) {
        console.log('[AG Auto] HTTP server failed:', e.message);
    }
}

// Keep Commands API as bonus (silent accept in background)
let _autoAcceptInterval = null;
const ACCEPT_COMMANDS = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.command.accept',
    'antigravity.prioritized.agentAcceptAllInFile',
    'antigravity.prioritized.agentAcceptFocusedHunk',
    'antigravity.prioritized.supercompleteAccept',
    'antigravity.terminalCommand.accept',
    'antigravity.acceptCompletion'
];

function startCommandsLoop() {
    const config = vscode.workspace.getConfiguration('ag-auto');
    _autoAcceptEnabled = config.get('enabled', true);
    const clickMs = config.get('clickIntervalMs', 2000);

    if (_autoAcceptInterval) clearInterval(_autoAcceptInterval);

    _autoAcceptInterval = setInterval(() => {
        if (!_autoAcceptEnabled) return;

        // ONLY run Accept commands if user has an "Accept" pattern enabled
        const wantsAccept = _httpClickPatterns.some(p => p.toLowerCase().includes('accept'));
        if (!wantsAccept) return;

        Promise.allSettled(
            ACCEPT_COMMANDS.map(cmd => vscode.commands.executeCommand(cmd))
        ).catch(() => { });
    }, clickMs);

    console.log('[AG Auto] Commands loop started (interval: ' + clickMs + 'ms, enabled: ' + _autoAcceptEnabled + ')');
}

// =============================================================
// CHECK IF SCRIPT IS ACTUALLY INJECTED
// =============================================================
/**
 * Check if the inject markers actually exist in workbench.html
 * Returns false if Antigravity updated and overwrote the files
 */
function isScriptInjected() {
    try {
        const wbPath = getWorkbenchPath();
        if (!wbPath) return false;
        const html = fs.readFileSync(wbPath, 'utf8');
        return html.includes(TAG_START);
    } catch (e) {
        console.log('[AG Auto] Cannot check inject status:', e.message);
        return false;
    }
}

// =============================================================
// EXTENSION ACTIVATION
// =============================================================
function activate(context) {
    console.log('[AG Auto] Extension đang khởi động (v6.9.0)...');
    _extensionContext = context;

    // Restore persisted click stats
    _clickStats = context.globalState.get('clickStats', {});
    _totalClicks = context.globalState.get('totalClicks', 0);

    // Background "Keep Waiting" dialog clicker (Win32 native dialog)
    if (process.platform === 'win32') {
        const { execFile } = require('child_process');
        const keepWaitingScript = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class AgWin32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr w, IntPtr l);
}
"@
$global:clicked = $false
[AgWin32]::EnumWindows({
    param($hWnd, $lp)
    if (-not [AgWin32]::IsWindowVisible($hWnd)) { return $true }
    if ($global:clicked) { return $false }
    [AgWin32]::EnumChildWindows($hWnd, {
        param($ch, $lp2)
        $cls = New-Object System.Text.StringBuilder 64
        [AgWin32]::GetClassName($ch, $cls, 64) | Out-Null
        if ($cls.ToString() -eq 'Button') {
            $txt = New-Object System.Text.StringBuilder 256
            [AgWin32]::GetWindowText($ch, $txt, 256) | Out-Null
            $t = $txt.ToString()
            if ($t -match 'Keep Waiting') {
                [AgWin32]::PostMessage($ch, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
                $global:clicked = $true
            }
        }
        return $true
    }, [IntPtr]::Zero) | Out-Null
    if ($global:clicked) { return $false }
    return $true
}, [IntPtr]::Zero) | Out-Null
if ($global:clicked) { Write-Output 'CLICKED' }
`.trim();

        const keepWaitingInterval = setInterval(() => {
            if (!_autoAcceptEnabled) return;
            if (!_httpClickPatterns.includes('Keep Waiting')) return;

            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', keepWaitingScript], { timeout: 5000 }, (err, stdout) => {
                if (stdout && stdout.trim() === 'CLICKED') {
                    console.log('[AG Auto] 🎯 Native dialog: Keep Waiting clicked via Win32');
                    _totalClicks++;
                    if (!_clickStats['Keep Waiting']) _clickStats['Keep Waiting'] = 0;
                    _clickStats['Keep Waiting']++;
                    if (_extensionContext) {
                        _extensionContext.globalState.update('clickStats', _clickStats);
                        _extensionContext.globalState.update('totalClicks', _totalClicks);
                    }
                }
            });
        }, 3000);
        context.subscriptions.push({ dispose: () => clearInterval(keepWaitingInterval) });
        console.log('[AG Auto] 🛡️ Win32 Keep Waiting watcher started');
    }

    // extensionKind: ["ui"] ensures this always runs locally — safe to inject
    {

        // Check if script is ACTUALLY present in workbench files (not just a stored key)
        // This handles Antigravity updates that overwrite workbench files
        const needsInject = !isScriptInjected();

        // Detect extension upgrade → force re-inject to update autoScript
        const currentVersion = context.extension?.packageJSON?.version || '0';
        const lastVersion = context.globalState.get('ag-injected-version', '0');
        const versionChanged = currentVersion !== lastVersion;
        const shouldInject = needsInject || versionChanged;

        if (shouldInject) {
            const reason = needsInject ? 'Script not found' : `Version changed (${lastVersion} → ${currentVersion})`;
            console.log(`[AG Auto] ${reason} — injecting...`);
            try {
                installScript(context);
                context.globalState.update('ag-injected-version', currentVersion);
                console.log('[AG Auto] ✅ Injected! Auto-reload in 1s...');
                vscode.window.showInformationMessage('[AG Auto] ✅ Script injected! Reloading...');
                setTimeout(() => {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }, 1000);
                // Don't return — let commands register below before reload
            } catch (e) {
                console.error('[AG Auto] Inject error:', e.message);
            }
        }

        // Always update checksums to suppress "corrupt installation" warning
        const checksumsUpdated = updateProductChecksums();
        if (checksumsUpdated && !shouldInject) {
            // Checksums vừa update → reload để integrity check pass ở lần boot tiếp
            // Dùng flag để tránh reload loop
            const reloadKey = 'ag-checksum-reload-done';
            const alreadyReloaded = context.globalState.get(reloadKey, false);
            if (!alreadyReloaded) {
                context.globalState.update(reloadKey, true);
                console.log('[AG Auto] Checksums updated, reloading to apply...');
                vscode.window.showInformationMessage('[AG Auto] Đã cập nhật checksums. Reloading...');
                setTimeout(() => {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }, 1500);
            } else {
                // Reset flag cho lần update tiếp theo
                context.globalState.update(reloadKey, false);
            }
        } else if (!checksumsUpdated) {
            // Checksums đã đúng → reset flag
            context.globalState.update('ag-checksum-reload-done', false);
        }

        // SECOND RUN (after reload): workbench.js has our injected code running
        console.log('[AG Auto] ✅ Script already injected, starting services...');

        // 1. HTTP server for IPC (injected script polls this for ON/OFF)
        startHttpServer();

        // 2. Commands API as bonus background accept
        startCommandsLoop();

        // 3. Write config JSON
        writeConfigJson(context);
    } // end of else (non-remote context)

    // ---- Always register commands & status bar (even during first inject/remote) ----
    createStatusBarItem(context);

    // Lắng nghe khi settings thay đổi -> cập nhật status bar icon
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ag-auto')) {
                updateStatusBarItem();
            }
        })
    );

    // Command: Enable
    context.subscriptions.push(
        vscode.commands.registerCommand('ag-auto.enable', async () => {
            const success = installScript(context);
            if (success) {
                updateStatusBarItem();
                const choice = await vscode.window.showInformationMessage(
                    '[AG Auto] ✅ Đã inject script! Reload VS Code để kích hoạt.',
                    'Reload Now'
                );
                if (choice === 'Reload Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        })
    );

    // Command: Disable
    context.subscriptions.push(
        vscode.commands.registerCommand('ag-auto.disable', async () => {
            const success = uninstallScript();
            if (success) {
                updateStatusBarItem();
                const choice = await vscode.window.showInformationMessage(
                    '[AG Auto] 🗑️ Đã gỡ script! Reload VS Code để hoàn tất.',
                    'Reload Now'
                );
                if (choice === 'Reload Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } else {
                vscode.window.showErrorMessage('[AG Auto] Không tìm thấy workbench.html!');
            }
        })
    );

    // Command: Open Settings
    context.subscriptions.push(
        vscode.commands.registerCommand('ag-auto.openSettings', () => {
            openSettingsPanel(context);
        })
    );
}

function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

module.exports = { activate, deactivate };
