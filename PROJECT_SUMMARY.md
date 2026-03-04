# AG Auto Click & Scroll — Project Summary (Chi tiết)

> Tài liệu tóm tắt toàn bộ dự án. Đọc file này đầu tiên khi bắt đầu chat mới.
> Cập nhật: 2026-02-25 | Version: **v5.4.0** | Publisher: **zixfel**

---

## 📁 Cấu trúc dự án

```
C:\Users\Admin\Downloads\lightearth web 2\Auto Click\vxis auto click\
├── package.json              # Metadata, version, commands, config schema (99 dòng)
├── readme.md                 # README cho Open VSX marketplace
├── LICENSE.txt               # MIT License
├── .gitignore                # Git ignore rules
├── .vscodeignore             # VSIX packaging ignore rules
├── PROJECT_SUMMARY.md        # File này
├── src/
│   └── extension.js          # Extension Host — toàn bộ logic backend (1053 dòng)
└── media/
    ├── autoScript.js          # Script inject vào workbench renderer (200 dòng)
    ├── icon.png               # Extension icon 128x128
    └── settings-screenshot.png # Screenshot cho marketplace README
```

---

## 🏗 Kiến trúc tổng quan

Extension hoạt động trên 2 process riêng biệt, giao tiếp qua HTTP:

```
┌───────────────────────────────────┐      HTTP poll (2s)     ┌──────────────────────────────┐
│  extension.js                     │  ◄─────────────────────  │  autoScript.js               │
│  (Extension Host — Node.js)       │      GET /ag-status      │  (Renderer — DOM access)     │
│                                   │  ─────────────────────►  │                              │
│  Chạy trong Extension Host        │      JSON response       │  Inject vào workbench.js     │
│  process, KHÔNG truy cập DOM     │                          │  Truy cập DOM trực tiếp      │
│                                   │                          │                              │
│  Responsibilities:                │                          │  Responsibilities:           │
│  • HTTP micro-server (port 48787) │                          │  • Quét DOM tìm buttons      │
│  • Commands loop (VS Code API)    │                          │  • Pattern matching          │
│  • Settings webview panel (HTML)  │                          │  • isApprovalButton check    │
│  • Status bar items               │                          │  • Diff editor protection    │
│  • Config read/write              │                          │  • Auto scroll chat          │
│  • File inject/uninstall          │                          │  • Manual scroll detection   │
│  • Linux/macOS elevation          │                          │  • HTTP config polling       │
└───────────────────────────────────┘                          └──────────────────────────────┘
```

### Tại sao cần 2 process?
- **Extension Host** (Node.js) có VS Code API (settings, commands, status bar) nhưng KHÔNG truy cập được DOM
- **Renderer** (Chromium) có DOM nhưng KHÔNG có VS Code API
- Giải pháp: inject `autoScript.js` vào `workbench.js` → chạy trong renderer → poll HTTP server để nhận config từ Extension Host

---

## 🔄 Lifecycle — Cách extension hoạt động

### Lần đầu cài đặt (First Run)
```
1. User install VSIX → extension activates
2. activate() kiểm tra INJECT_KEY trong globalState
3. INJECT_KEY chưa có → gọi installScript()
4. installScript() inject code vào workbench.js + workbench.html
5. Set INJECT_KEY = true trong globalState
6. Auto reload window sau 1 giây
7. Extension restart → INJECT_KEY đã có → bắt đầu services
```

### Các lần sau (Normal Run)
```
1. Extension activates → INJECT_KEY đã tồn tại
2. Start HTTP server (port 48787)
3. Start Commands loop (background accept)
4. Write config JSON file
5. Create Status Bar items
6. Register commands (enable, disable, openSettings)
```

### Upgrade version
```
- INJECT_KEY thay đổi mỗi version (ví dụ: 'ag-auto-injected-v5.1')
- Khi cài VSIX mới, INJECT_KEY mới chưa có → force re-inject
- Điều này đảm bảo autoScript.js mới nhất được inject
- ⚠️ PHẢI update INJECT_KEY mỗi khi sửa autoScript.js!
```

---

## 📂 Chi tiết extension.js (1053 dòng)

### Imports & Constants (dòng 1-12)
```javascript
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const http = require('http');  // dòng 868

const TAG_START = '<!-- AG-AUTO-CLICK-SCROLL-START -->';
const TAG_END = '<!-- AG-AUTO-CLICK-SCROLL-END -->';
```

### Bảng tất cả hàm với số dòng chính xác

| Hàm | Dòng | Mô tả chi tiết |
|-----|------|-----------------|
| `writeFileElevated(filePath, content)` | 20-52 | Ghi file, nếu EACCES thì auto-elevate: Linux→pkexec, macOS→osascript, Windows→throw. Ghi vào tmp trước rồi copy elevated. |
| `getWorkbenchPath()` | 57-79 | Tìm workbench.html qua 5 candidates cố định + findFileRecursive fallback (depth 6) |
| `findFileRecursive(dir, filename, maxDepth)` | 84-98 | Tìm file đệ quy có giới hạn depth |
| `buildScriptContent(context)` | 103-133 | Đọc media/autoScript.js → replace placeholders `/*{{...}}*/` bằng config thực |
| `writeConfigJson(context)` | 138-161 | Ghi ag-auto-config.json vào thư mục workbench (dùng writeFileElevated) |
| `installScript(context)` | 167-261 | **QUAN TRỌNG** — Inject script bằng 2 cách song song |
| `uninstallScript()` | 266-302 | Gỡ inject từ workbench.html + workbench.js |
| `escapeRegex(str)` | 304-306 | Escape regex special chars |
| `openSettingsPanel(context)` | 311-409 | Tạo Webview panel, xử lý messages từ UI |
| `getSettingsHtml(cfg)` | 414-821 | Generate toàn bộ HTML/CSS/JS cho Settings UI (~400 dòng) |
| `createStatusBarItem(context)` | 829-843 | Tạo 2 status bar items: Accept (priority -10000) + Scroll (priority -10001) |
| `updateStatusBarItem()` | 845-861 | Cập nhật text/color/tooltip cho status bar |
| `startHttpServer()` | 876-915 | HTTP server `127.0.0.1:48787`, fallback port 48788 |
| `startCommandsLoop()` | 929-949 | Background loop gọi ACCEPT_COMMANDS, có check patterns |
| `activate(context)` | 954-1043 | **ENTRY POINT** — inject lần đầu hoặc start services |
| `deactivate()` | 1045-1050 | Cleanup status bar items |

### installScript() chi tiết (dòng 167-261)
Extension inject bằng **2 cách song song** để tương thích mọi VS Code version:

**Cách 1 — Inject vào JS file (bypass CSP):**
1. Đọc workbench.html → tìm tất cả `<script src="*.js">` 
2. Tìm các file JS tương ứng trong filesystem
3. Fallback: tìm `workbench.desktop.main.js` hoặc `workbench.js`
4. Xóa inject cũ (dùng JS_TAG markers)
5. Append code vào cuối JS file, wrapped trong IIFE + try/catch

**Cách 2 — Modify workbench.html (fallback):**
1. Cache bust: thêm `?v=timestamp` vào `workbench.js` src
2. Ghi `ag-auto-script.js` vào thư mục workbench
3. Thêm `<script src="ag-auto-script.js">` trước `</html>`

### openSettingsPanel() — Message handling (dòng 332-408)
Webview gửi messages qua `vscode.postMessage()`, extension xử lý:

| Message Command | Hành vi | Cần Save? |
|-----------------|---------|-----------|
| `toggle` | Bật/tắt Accept → update `_autoAcceptEnabled` + config + status bar | ❌ Instant |
| `scrollToggle` | Bật/tắt Scroll → update `_httpScrollEnabled` + config + status bar | ❌ Instant |
| `changeLang` | Đổi ngôn ngữ → save config + re-render HTML | ❌ Instant |
| `save` | Lưu tất cả settings → update config + HTTP server state + status bar | ✅ Cần bấm Save |
| `reload` | Reload window | N/A |

### ⚠️ Quan trọng về Save vs Instant:
- **Accept ON/OFF switch** → instant, gửi `toggle` → apply ngay
- **Scroll ON/OFF switch** → instant, gửi `scrollToggle` → apply ngay
- **Pattern toggles** (tick/bỏ tick từng nút) → **PHẢI bấm Save & Apply** → gửi `save`
- **Timing settings** (ms) → **PHẢI bấm Save & Apply**

### startCommandsLoop() — Background Accept (dòng 929-949)
Chạy song song với DOM click, gọi trực tiếp VS Code commands API:
```javascript
const ACCEPT_COMMANDS = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.command.accept',
    'antigravity.prioritized.agentAcceptAllInFile',
    'antigravity.prioritized.agentAcceptFocusedHunk',
    'antigravity.prioritized.supercompleteAccept',
    'antigravity.terminalCommand.accept',
    'antigravity.acceptCompletion'
];
```
**Guard:** Chỉ chạy nếu `_autoAcceptEnabled === true` VÀ `_httpClickPatterns` có chứa chữ "accept" (case-insensitive). Nếu user tắt "Accept all" → loop ngầm dừng hoàn toàn.

---

## 📂 Chi tiết autoScript.js (200 dòng)

### Guard & Cleanup (dòng 1-11)
- `window._agAutoLoaded` — chặn double execution (vì inject cả trong JS lẫn HTML)
- Clear tất cả intervals cũ + remove scroll listener

### Placeholder Variables (dòng 13-20)
```javascript
var PAUSE_SCROLL_MS = /*{{PAUSE_SCROLL_MS}}*/7000;
var CLICK_INTERVAL_MS = /*{{CLICK_INTERVAL_MS}}*/1000;
var SCROLL_INTERVAL_MS = /*{{SCROLL_INTERVAL_MS}}*/500;
var CLICK_PATTERNS = /*{{CLICK_PATTERNS}}*/["Allow","Always Allow","Run","Keep Waiting","Accept all"];
window._agAutoEnabled = /*{{ENABLED}}*/true;
window._agScrollEnabled = true;
```
Khi `buildScriptContent()` chạy, nó replace `/*{{...}}*/value` bằng giá trị thực từ config.

### HTTP Polling (dòng 22-66)
- Poll `http://127.0.0.1:48787/ag-status` (sync XHR) mỗi **2 giây**
- Parse JSON response → update: `_agAutoEnabled`, `_agScrollEnabled`, `CLICK_PATTERNS`, timing
- Fallback port 48788 nếu 48787 fail
- Chỉ log 2-3 lần đầu để tránh spam console

### isApprovalButton(btn) (dòng 76-95)
Logic xác định button có phải approval dialog không:
1. Lấy parent element
2. Tìm tất cả sibling buttons (3 cấp parent)
3. Kiểm tra sibling text có match REJECT_WORDS không
4. REJECT_WORDS: `['Reject', 'Deny', 'Cancel', 'Dismiss', "Don't Allow", 'Decline']`
5. Nếu tìm thấy sibling Reject → button này là approval → return true

### EDITOR_SKIP_WORDS (dòng 97-98)
Blacklist cứng, KHÔNG BAO GIỜ click:
```javascript
['Accept Changes', 'Accept All', 'Accept Incoming', 'Accept Current', 'Accept Both', 'Accept Combination']
```

### Auto Click Loop (dòng 102-152)
Chạy mỗi `CLICK_INTERVAL_MS`:
1. Skip nếu `_agAutoEnabled === false`
2. Query tất cả: `button, a.action-label, [role="button"], .monaco-button, span.cursor-pointer`
3. Bỏ qua: hidden (`offsetParent === null`), đã click (`_clicked WeakSet`), text trống/dài >40
4. **EDITOR_SKIP_WORDS check** → skip nếu text startsWith blacklist
5. **Container check** → skip nếu nằm trong `.monaco-diff-editor`, `.merge-editor-view`, `.inline-merge-region`, `.merged-editor`
6. **Pattern matching** → text === pattern HOẶC text.startsWith(pattern)
7. Nếu `span.cursor-pointer` → click luôn (không cần isApprovalButton)
8. Nếu button khác → kiểm tra `isApprovalButton()` trước khi click
9. Click + add vào `_clicked` WeakSet (tránh click lặp)

### Manual Scroll Detection (dòng 154-165)
- Listen `scroll` event (capture phase)
- Chỉ detect `e.isTrusted` (user thật, không phải script)
- Bỏ qua scroll trong `.monaco-editor` và `.part.editor`
- Ghi `lastManualScrollTime = Date.now()`

### Auto Scroll Loop (dòng 167-196)
Chạy mỗi `SCROLL_INTERVAL_MS`:
1. Skip nếu `_agAutoEnabled === false` hoặc `_agScrollEnabled === false`
2. Skip nếu `Date.now() - lastManualScrollTime < PAUSE_SCROLL_MS`
3. Tìm tất cả elements có scrollbar (`scrollHeight > clientHeight` + `overflow-y: auto/scroll`)
4. Bỏ qua: `.monaco-editor`, `.part.editor`, `textarea`
5. Scroll xuống cuối: `el.scrollTop = el.scrollHeight`
6. Set `isAutoScrolling = true` trong 50ms (để scroll listener không nhầm là manual)

---

## ⚙️ Config Schema (package.json)

| Key | Type | Default | Lưu ở | Mô tả |
|-----|------|---------|-------|-------|
| `ag-auto.enabled` | boolean | `true` | VS Code settings | Bật/tắt toàn bộ extension |
| `ag-auto.scrollEnabled` | boolean | `true` | VS Code settings | Bật/tắt scroll riêng |
| `ag-auto.scrollPauseMs` | number | `7000` | VS Code settings | Thời gian pause khi user scroll manual |
| `ag-auto.scrollIntervalMs` | number | `500` | VS Code settings | Tốc độ quét scroll |
| `ag-auto.clickIntervalMs` | number | `1000` | VS Code settings | Tốc độ quét click |
| `ag-auto.clickPatterns` | string[] | `["Allow","Always Allow","Run","Keep Waiting"]` | VS Code settings | Danh sách patterns enabled |
| `ag-auto.language` | string | `"vi"` | VS Code settings | Ngôn ngữ UI (vi/en/zh) |
| `disabledClickPatterns` | string[] | `[]` | **globalState** | Patterns bị disabled (KHÔNG ở config!) |

### ⚠️ Lưu ý quan trọng:
- `clickPatterns` trong config chỉ chứa patterns **enabled** (active)
- `disabledClickPatterns` lưu trong `context.globalState` (KHÔNG phải `vscode.workspace.getConfiguration`)
- Khi save, Webview gửi cả 2 list: `clickPatterns` (enabled) + `disabledClickPatterns` (disabled)
- HTTP server chỉ gửi `_httpClickPatterns` = patterns **active** (đã filter)

### Default Patterns trong UI:
```javascript
const DEFAULT_PATTERNS = ['Run', 'Allow', 'Always Allow', 'Keep Waiting', 'Retry', 'Continue', 'Allow Once', 'Allow This Con', 'Accept all'];
const DEFAULT_DISABLED = ['Accept all']; // Mặc định OFF
```

---

## 🌐 HTTP Server IPC

### Endpoint
```
GET http://127.0.0.1:48787/ag-status
```

### Response JSON
```json
{
    "enabled": true,
    "scrollEnabled": true,
    "clickPatterns": ["Allow", "Always Allow", "Run", "Keep Waiting"],
    "pauseScrollMs": 7000,
    "scrollIntervalMs": 500,
    "clickIntervalMs": 1000
}
```

### In-memory state variables (Extension Host)
```javascript
let _autoAcceptEnabled = true;       // Toggle Accept ON/OFF
let _httpScrollEnabled = true;       // Toggle Scroll ON/OFF
let _httpClickPatterns = [];         // Active click patterns
let _httpScrollConfig = {            // Timing config
    pauseScrollMs: 5000,
    scrollIntervalMs: 500,
    clickIntervalMs: 2000
};
```
Các biến này được update ngay khi user toggle (instant) hoặc save settings.

---

## 📊 Status Bar

- **Accept item**: priority `-10000`, alignment `Right`
- **Scroll item**: priority `-10001`, alignment `Right`
- Priority cực thấp → nằm sát nhau ở **góc phải cùng** status bar
- Click vào mở Settings panel
- Màu: 🟢 `#4EC9B0` ON, 🔴 `#F44747` OFF
- OFF có nền đỏ: `statusBarItem.errorBackground`

---

## 📡 Publishing & Deployment

| Platform | Publisher | Namespace | URL |
|----------|-----------|-----------|-----|
| Open VSX | `zixfel` | `zixfel` | https://open-vsx.org/extension/zixfel/ag-auto-click-scroll |
| GitHub | `zixfelw` | N/A | https://github.com/zixfelw/ag-auto-click-scroll |

### Token Open VSX
```
<YOUR_OVSX_TOKEN>  # Lưu token ở nơi an toàn, KHÔNG commit vào repo
```

### Commands
```bash
# Build VSIX (KHÔNG push)
npx -y @vscode/vsce package --allow-missing-repository --skip-license

# Push GitHub
git add -A; git commit -m "message"; git push

# Publish Open VSX (SAU KHI user cho phép)
npx -y ovsx publish -p <YOUR_OVSX_TOKEN>
```

### ⚠️ Quy tắc publish:
- **KHÔNG tự ý bump version** nếu user chưa cho phép
- **KHÔNG tự ý push GitHub** nếu user chưa cho phép
- **KHÔNG tự ý publish Open VSX** nếu user chưa cho phép
- Luôn hỏi trước khi làm các action trên

---

## 🐛 Các bug đã fix & nguyên nhân gốc

### 1. Diff Editor auto-click (v5.0.4 → v5.0.5)
- **Triệu chứng**: Tắt "Accept all" nhưng vẫn bị click "Accept Changes" trong diff view
- **Nguyên nhân 1**: `isApprovalButton()` tìm thấy nút "Reject" bên cạnh → nghĩ đây là approval dialog
- **Nguyên nhân 2**: Commands loop (`startCommandsLoop`) gọi `agentAcceptAllInFile` bỏ qua hoàn toàn patterns
- **Fix 1**: Thêm `EDITOR_SKIP_WORDS` blacklist + `.closest()` container check trong autoScript.js
- **Fix 2**: Commands loop kiểm tra `_httpClickPatterns` có chữ "accept" không trước khi chạy

### 2. Status bar items xa nhau (v5.0.1 → v5.0.2)
- **Triệu chứng**: 2 items Accept/Scroll bị các items VS Code khác chen giữa
- **Nguyên nhân**: Priority 101/100 bị conflict với items VS Code built-in
- **Fix**: Đổi priority thành `-10000/-10001` → nằm sát nhau ở góc phải cùng

### 3. INJECT_KEY cũ — script không update (v5.0.4 → v5.0.5)
- **Triệu chứng**: Cài VSIX mới nhưng autoScript.js vẫn là bản cũ
- **Nguyên nhân**: INJECT_KEY = `v4.22` → extension nghĩ đã inject rồi → skip
- **Fix**: Update INJECT_KEY mỗi version (hiện tại: `ag-auto-injected-v5.1`)

### 4. Linux permission denied (v5.0.3)
- **Triệu chứng**: EACCES khi ghi vào `/opt/` hoặc `/usr/share/`
- **Nguyên nhân**: VS Code trên Linux cài ở thư mục system, user không có quyền ghi
- **Fix**: `writeFileElevated()` — ghi tmp → pkexec cp (native password dialog)

### 5. scrollEnabled không persist (v4.31)
- **Triệu chứng**: Toggle scroll OFF → restart → scroll ON lại
- **Nguyên nhân**: `scrollEnabled` chưa đăng ký trong package.json `contributes.configuration`
- **Fix**: Thêm `ag-auto.scrollEnabled` vào package.json

---

## 📝 Checklist khi sửa code

### Khi sửa autoScript.js:
- [ ] Update `INJECT_KEY` trong extension.js (tăng version)
- [ ] Build VSIX để test
- [ ] Khi cài VSIX mới, extension sẽ auto re-inject + reload

### Khi thêm config mới:
- [ ] Thêm vào `package.json` → `contributes.configuration.properties`
- [ ] Thêm vào `startHttpServer()` initialize
- [ ] Thêm vào HTTP response JSON
- [ ] Thêm vào `openSettingsPanel()` message handler (save command)
- [ ] Thêm vào `getSettingsHtml()` UI
- [ ] Thêm vào autoScript.js HTTP poll parser

### Khi sửa Settings UI:
- [ ] Sửa HTML trong `getSettingsHtml()` (dòng 414-821)
- [ ] Sửa translations trong object `t` (vi/en/zh)
- [ ] Nếu thêm field mới: thêm vào `saveSettings()` JS trong webview

---

## 🗺 Settings UI Layout (Webview HTML structure)

```
┌──────────────────────────────────────┐
│ ⚡ AG Auto Click & Scroll            │
│ [subtitle]                           │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🔌 Status                        │ │
│ │ Enable Auto Click & Scroll  [ON] │ │
│ │ Language  [Tiếng Việt ▼]         │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 📜 Auto Scroll                   │ │
│ │ Enable Auto Scroll       [ON]    │ │
│ │ Pause time (ms)          [7000]  │ │
│ │ Scroll speed (ms)        [500]   │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🎯 Auto Click                   │ │
│ │ Click speed (ms)         [1000]  │ │
│ │ BUTTON TEMPLATES:                │ │
│ │ ☑ Run ON    ☑ Allow ON          │ │
│ │ ☑ Always Allow ON               │ │
│ │ ☑ Keep Waiting ON               │ │
│ │ ☑ Retry ON                      │ │
│ │ ☑ Continue ON                   │ │
│ │ ☐ Accept all OFF                │ │
│ │ [Enter new button...] [+ Add]   │ │
│ └──────────────────────────────────┘ │
│                                      │
│            [🔄 Reload] [💾 Save]    │
└──────────────────────────────────────┘
```

---

## 🧪 Debug Tips

### Xem logs extension:
- `Ctrl+Shift+P` → `Developer: Toggle Developer Tools` → Console tab
- Tìm `[AG Auto]` prefix

### Xem logs injected script:
- Cùng Developer Tools Console
- Tìm `[AG Auto] 🎯 Click:` hoặc `[AG Auto] HTTP Poll`

### Kiểm tra HTTP server:
```bash
curl http://127.0.0.1:48787/ag-status
```

### Kiểm tra inject đã thành công:
1. Tìm file `workbench.js` hoặc `workbench.desktop.main.js`
2. Tìm `AG-AUTO-CLICK-SCROLL-JS-START` trong file
3. Nếu có → inject OK

### Force re-inject:
1. Mở Developer Tools Console
2. Gõ: `// Xóa inject key để force re-inject lần sau`
3. Hoặc: `Ctrl+Shift+P` → `AG Auto: Enable (Inject Script)` → Reload

---

## 📌 Lưu ý thiết kế quan trọng

1. **autoScript.js dùng ES5 syntax** — không dùng arrow functions, const/let, template literals. Vì nó inject vào workbench.js ở environment có thể không support ES6 đầy đủ.

2. **HTTP XHR là synchronous** (`xhr.open('GET', url, false)`) — thiết kế có chủ ý. Async XHR trong context inject có thể bị race condition. Sync đảm bảo config được đọc trước khi click loop chạy.

3. **WeakSet cho _clicked** — tránh memory leak. Khi button bị remove khỏi DOM, WeakSet tự giải phóng reference.

4. **Dual inject (JS + HTML)** — để tương thích cả Antigravity lẫn VS Code, vì mỗi bản load workbench.js khác nhau.

5. **Cache bust `?v=timestamp`** — ép Chromium load lại workbench.js từ đĩa thay vì dùng V8 code cache cũ.
