## ✅ Antigravity vừa update? Không cần lo!

> Từ **v5.5.0**, extension tự động phát hiện khi Antigravity cập nhật phiên bản mới và **tự inject lại script** mà không cần bất kỳ thao tác thủ công nào. Chỉ cần cài extension một lần — mọi thứ tự động từ A đến Z! 🚀

> 💡 Nếu bạn đang dùng phiên bản cũ (< v5.5), hãy gỡ extension cũ → cài lại bản mới nhất từ file `.vsix` → Restart Antigravity.

---

# 🚀 AG Auto Click & Scroll v5.4

**Extension tự động nhấn nút Run, Allow, Accept all và cuộn khung chat Antigravity.**  
Thiết kế thông minh — chỉ click **nút approval** (có nút Reject bên cạnh), không click nhầm UI khác.

> 🖥 **Hỗ trợ Windows & Linux** — tự động xử lý quyền ghi file trên mọi hệ điều hành.

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 🎯 **Auto Click** | Tự động nhấn Run, Allow, Always Allow, Accept all, Keep Waiting... |
| 📜 **Auto Scroll** | Cuộn khung chat xuống cuối để không bỏ lỡ nội dung mới |
| ⚡ **Instant Toggle** | Gạt switch ON/OFF → áp dụng **tức thì**, không cần Save hay Reload |
| 🔀 **Tắt/Bật riêng** | Accept và Scroll có toggle riêng, hoạt động độc lập |
| 📡 **HTTP Live Sync** | Settings cập nhật realtime qua HTTP server nội bộ |
| 🛡 **Safe Click** | Chỉ click nút approval (có Reject bên cạnh), không phá UI |
| 🚫 **Diff Protection** | KHÔNG click Accept Changes/Accept All trong diff/merge editor |
| ⚙️ **Settings UI** | Giao diện đẹp — bật/tắt từng nút, chỉnh tốc độ, đa ngôn ngữ |
| 📊 **Dual Status Bar** | Hiện Accept ON/OFF và Scroll ON/OFF riêng biệt, màu xanh/đỏ |

---

## 🆕 Có gì mới trong v5.4

### 🐧 Hỗ trợ Linux & macOS
- Tự động xử lý quyền file khi inject vào thư mục hệ thống
- **Linux**: hiện hộp thoại nhập mật khẩu native (pkexec)
- **macOS**: hiện hộp thoại nhập mật khẩu native (osascript)
- **Windows**: hoạt động như trước, không ảnh hưởng gì

### 🚫 Diff/Merge Editor Protection
- KHÔNG click nút **Accept Changes**, **Accept All**, **Accept Incoming** trong diff editor
- Cho phép xem code diff bình thường mà không bị auto-accept
- Tắt pattern "Accept all" → commands loop ngầm cũng **dừng hoàn toàn**

### ⚡ Instant Toggle & Live Sync
- **Enable Auto Click & Scroll** — gạt switch → tức thì ON/OFF
- **Enable Auto Scroll** — toggle riêng cho scroll, instant
- Tắt/bật từng pattern → **Save & Apply** → cập nhật trong 2 giây

### 📊 Dual Status Bar
- Hai items liền kề trên status bar: `✓ Accept ON` `✓ Scroll ON`
- Mỗi cái có **màu riêng**: 🟢 xanh khi ON, 🔴 đỏ khi OFF
- Click vào bất kỳ item nào đều mở Settings

---

## 📋 Danh sách nút hỗ trợ

Mặc định **ON**: `Run` · `Allow` · `Always Allow` · `Keep Waiting` · `Retry` · `Continue` · `Allow Once` · `Allow This Con`

Mặc định **OFF**: `Accept all` (bật thủ công khi cần)

> 💡 Bạn có thể thêm nút tùy chỉnh hoặc bật/tắt từng nút trong Settings.

---

## 🔧 Cách sử dụng

### Cài đặt
1. Mở Antigravity / VS Code
2. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. Chọn file `.vsix` → Cài đặt → **Reload Window**
4. Extension tự inject script + **auto-reload** lần đầu

> 🐧 **Linux**: lần đầu inject sẽ hiện hộp thoại nhập mật khẩu — chỉ cần nhập 1 lần.

### Mở Settings
- Click **"Accept ON"** hoặc **"Scroll ON"** trên Status Bar (góc dưới phải)
- Hoặc `Ctrl+Shift+P` → `AG Auto: Open Settings`

### Sử dụng
- **Toggle ON/OFF**: Gạt switch → tức thì, không cần Save
- **Đổi patterns/settings**: Chỉnh thông số → nhấn **Save & Apply**
- **Reload thủ công**: Nhấn nút **🔄 Reload** khi cần

### Gỡ bỏ
`Ctrl+Shift+P` → `AG Auto: Disable` → **Reload Window**

---

> 🛡 **Safe Click**: Script chỉ click nút nằm trong approval dialog (có nút Reject/Deny/Cancel bên cạnh). Không click nhầm diff editor, navigation, sidebar, hay dialog khác.

---

## 📸 Giao diện Settings

![Settings UI](media/settings-screenshot.png)

---

## 🔄 Changelog

### v5.5.0 (Latest) 🎉
- 🔄 **Auto-fix sau update** — Tự phát hiện khi Antigravity update và tự inject lại script, không cần thao tác thủ công

### v5.4.0
- 📜 **Smart Auto Scroll** — Không cuộn nhầm lịch sử chat (sidebar/history), chỉ cuộn trong khung chat chính
- 🛑 **Jitter-free Scrolling** — Dừng cuộn ngay khi đã chạm đáy, loại bỏ hiện tượng giật màn hình

### v5.1.0
- 🐧 **Linux/macOS support** — auto-elevation, không cần `sudo` thủ công
- 🚫 **Diff Protection** — không click Accept Changes/Accept All trong diff editor
- 🧠 **Smart Commands Loop** — commands loop ngầm tôn trọng pattern settings
- 📊 **Status Bar Adjacent** — 2 items nằm sát nhau, không bị chen giữa

### v5.0.0
- ⚡ Instant Toggle — ON/OFF tức thì
- 🔀 Scroll Toggle riêng — tắt/bật độc lập
- 📡 HTTP IPC — micro-server cho live config sync
- 📊 Dual Status Bar — Accept/Scroll màu xanh/đỏ riêng
- 🎨 UI nâng cấp — toggle xanh neon, text sáng, nút Reload
- 🔄 Auto-inject + Auto-reload — cài xong tự inject, tự reload

### v4.x
- 🎯 Auto Click với Commands API
- 📜 Auto Scroll với smart pause
- ⚙️ Settings UI đa ngôn ngữ
- 🛡 Safe Click — approval pair detection

---

## 📄 License

MIT © [Zixfel](https://github.com/zixfelw)
