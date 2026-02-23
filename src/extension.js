// ===========================================================
// AG Auto Click & Scroll — VS Code Extension
// ===========================================================
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Tag markers để tìm và xoá script đã inject
const TAG_START = '<!-- AG-AUTO-CLICK-SCROLL-START -->';
const TAG_END = '<!-- AG-AUTO-CLICK-SCROLL-END -->';

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

    // Thay thế các placeholder bằng giá trị config thực
    script = script.replace(/\/\*\{\{PAUSE_SCROLL_MS\}\}\*\/\d+/, pauseMs.toString());
    script = script.replace(/\/\*\{\{SCROLL_INTERVAL_MS\}\}\*\/\d+/, scrollMs.toString());
    script = script.replace(/\/\*\{\{CLICK_INTERVAL_MS\}\}\*\/\d+/, clickMs.toString());
    script = script.replace(
        /\/\*\{\{CLICK_PATTERNS\}\}\*\/\[.*?\]/,
        JSON.stringify(patterns)
    );
    script = script.replace(/\/\*\{\{ENABLED\}\}\*\/\w+/, enabled.toString());

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
        const configData = JSON.stringify({ clickPatterns: activePatterns });
        const configPath = path.join(wbDir, 'ag-auto-config.json');
        fs.writeFileSync(configPath, configData, 'utf8');
        console.log('[AG Auto] Config JSON updated:', configData);
    } catch (e) {
        console.error('[AG Auto] Error writing config JSON:', e.message);
    }
}



/**
 * Kiểm tra xem script đã được inject chưa
 */
function isAlreadyInjected() {
    try {
        const wbPath = getWorkbenchPath();
        if (!wbPath) return false;
        const wbDir = path.dirname(wbPath);
        // Check workbench.js for our marker
        const jsFiles = fs.readdirSync(wbDir).filter(f => f.endsWith('.js'));
        for (const jsFile of jsFiles) {
            const content = fs.readFileSync(path.join(wbDir, jsFile), 'utf8');
            if (content.includes('AG-AUTO-CLICK-SCROLL-JS-START')) return true;
        }
        return false;
    } catch (e) {
        return false;
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

            fs.writeFileSync(jsPath, jsContent, 'utf8');
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
        fs.writeFileSync(destPath, scriptContent, 'utf8');
        const injection = `\n${TAG_START}\n<script src="ag-auto-script.js?v=${ts}"></script>\n${TAG_END}`;
        html = html.replace('</html>', injection + '\n</html>');

        fs.writeFileSync(wbPath, html, 'utf8');
        console.log('[AG Auto] ✅ Inject + cache bust vào workbench.html!');
    } catch (err) {
        console.error('[AG Auto] Lỗi inject vào HTML:', err.message);
    }

    return true;
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
        fs.writeFileSync(wbPath, html, 'utf8');

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
                fs.writeFileSync(p, js, 'utf8');
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

/**
 * Mở Webview Settings Panel
 */
function openSettingsPanel(context) {
    const panel = vscode.window.createWebviewPanel(
        'agAutoSettings',
        'AG Auto Click & Scroll - Settings',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const config = vscode.workspace.getConfiguration('ag-auto');

    panel.webview.html = getSettingsHtml({
        enabled: config.get('enabled', true),
        scrollPauseMs: config.get('scrollPauseMs', 7000),
        scrollIntervalMs: config.get('scrollIntervalMs', 500),
        clickIntervalMs: config.get('clickIntervalMs', 1000),
        clickPatterns: config.get('clickPatterns', ['Allow', 'Always Allow', 'Run', 'Keep Waiting']),
        disabledClickPatterns: context.globalState.get('disabledClickPatterns', []),
        language: config.get('language', 'vi')
    });

    // Nhận message từ Webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'changeLang') {
            // Chỉ đổi ngôn ngữ -> save + render lại HTML ngay không cần reload VS Code
            const cfg = vscode.workspace.getConfiguration('ag-auto');
            await cfg.update('language', msg.lang, vscode.ConfigurationTarget.Global);

            // Render lại panel với ngôn ngữ mới
            panel.webview.html = getSettingsHtml({
                enabled: cfg.get('enabled', true),
                scrollPauseMs: cfg.get('scrollPauseMs', 7000),
                scrollIntervalMs: cfg.get('scrollIntervalMs', 500),
                clickIntervalMs: cfg.get('clickIntervalMs', 1000),
                clickPatterns: cfg.get('clickPatterns', ['Run', 'Allow', 'Always Allow']),
                disabledClickPatterns: context.globalState.get('disabledClickPatterns', []),
                language: msg.lang
            });
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


            writeConfigJson(context);

            if (msg.data.enabled) {
                if (isAlreadyInjected()) {
                    // Script đã inject rồi → chỉ update config JSON, KHÔNG re-inject
                    console.log('[AG Auto] Script đã inject, chỉ update config JSON');
                    updateStatusBarItem();
                    const updatedLang = msg.data.language;
                    let savedMsg = '[AG Auto] ✅ Đã lưu! Cài đặt được áp dụng tự động.';
                    if (updatedLang === 'en') savedMsg = '[AG Auto] ✅ Saved! Settings applied automatically.';
                    if (updatedLang === 'zh') savedMsg = '[AG Auto] ✅ 已保存！设置已自动应用。';
                    vscode.window.showInformationMessage(savedMsg);
                    return; // KHÔNG reload
                }
                // Lần đầu: inject script
                installScript(context);
            } else {
                // Tắt: gỡ script khỏi workbench.html luôn
                uninstallScript();
            }

            updateStatusBarItem();

            // Lấy lại config để đảm bảo đã save
            const updatedLang = msg.data.language;

            // Tự động reload VS Code sau 1 giây để áp dụng ngay
            let reloadMsg = '[AG Auto] ✅ Đã lưu! VS Code sẽ tự reload trong 1 giây...';
            if (updatedLang === 'en') reloadMsg = '[AG Auto] ✅ Saved! VS Code will auto-reload in 1 second...';
            if (updatedLang === 'zh') reloadMsg = '[AG Auto] ✅ 已保存！VS Code 将在1秒后自动重载...';

            vscode.window.showInformationMessage(reloadMsg);

            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }, 1000);
        }
    }, undefined, context.subscriptions);
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
        color: #cdd6f4;
        padding: 24px;
        line-height: 1.6;
    }
    h1 {
        font-size: 1.6em;
        background: linear-gradient(135deg, #89b4fa, #a6e3a1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 8px;
    }
    .subtitle { color: #6c7086; margin-bottom: 24px; font-size: 0.9em; }
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
    label { color: #bac2de; font-size: 0.95em; }
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
    .toggle input:checked + .slider { background: #a6e3a1; }
    .toggle input:checked + .slider::before { transform: translateX(24px); }

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
    .hint { color: #a6adc8; font-size: 0.95em; display: block; margin-top: 6px; font-style: italic; opacity: 0.8; }
</style>
</head>
<body>
    <h1>⚡ AG Auto Click & Scroll</h1>
    <p class="subtitle">${strings.title}</p>

    <!-- Enable/Disable & Lang -->
    <div class="card">
        <div class="card-title">🔌 ${strings.status}</div>
        <div class="field">
            <label>${strings.enableAuto}</label>
            <label class="toggle">
                <input type="checkbox" id="chkEnabled" ${cfg.enabled ? 'checked' : ''}>
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
            h += '<span style="font-weight:600;color:#cdd6f4">' + p + '</span></div>';
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

    function changeLang() {
        const newLang = document.getElementById('selLang').value;
        vscode.postMessage({ command: 'changeLang', lang: newLang });
    }
</script>
</body>
</html>`;
}

// =============================================================
// STATUS BAR
// =============================================================
let statusBarItem;

function createStatusBarItem(context) {
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'ag-auto.openSettings';
    updateStatusBarItem();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

function updateStatusBarItem() {
    const config = vscode.workspace.getConfiguration('ag-auto');
    const enabled = config.get('enabled', true);
    if (enabled) {
        statusBarItem.text = '$(check) AG Auto Accept | Auto Scroll';
        statusBarItem.tooltip = 'AG Auto Click & Scroll — ✅ ON\nClick để mở Settings';
        statusBarItem.color = '#4EC9B0'; // green
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(circle-slash) AG Auto Accept | Auto Scroll';
        statusBarItem.tooltip = 'AG Auto Click & Scroll — ❌ OFF\nClick để mở Settings';
        statusBarItem.color = '#F44747'; // red
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

// =============================================================
// EXTENSION ACTIVATION
// =============================================================
function activate(context) {
    console.log('[AG Auto] Extension đang khởi động (v2.0.0)...');

    // ---- Auto inject script khi khởi động (cho auto-scroll) ----
    try {
        const config = vscode.workspace.getConfiguration('ag-auto');
        const enabled = config.get('enabled', true);
        if (enabled) {
            console.log('[AG Auto] Auto-inject đang bật, thử inject script...');
            const success = installScript(context);
            if (success) {
                console.log('[AG Auto] ✅ Auto-inject thành công khi khởi động!');
            } else {
                console.log('[AG Auto] ⚠️ Auto-inject thất bại khi khởi động');
            }
        } else {
            console.log('[AG Auto] Extension đang TẮT, bỏ qua inject.');
        }
    } catch (e) {
        console.error('[AG Auto] Lỗi auto-inject:', e.message);
    }

    // Auto-Accept via Commands API removed - workbench.js handles patterns

    // Write config JSON at startup for realtime reload
    writeConfigJson(context);

    // ---- Status Bar Button ----
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
