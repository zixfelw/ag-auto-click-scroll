# 🚀 AG Auto Click & Scroll v5.0

**Extension tự động nhấn nút Run, Allow, Accept all và cuộn khung chat Antigravity.**  
Thiết kế thông minh — chỉ click **nút approval** (có nút Reject bên cạnh), không click nhầm UI khác.

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
| ⚙️ **Settings UI** | Giao diện đẹp — bật/tắt từng nút, chỉnh tốc độ, đa ngôn ngữ |
| 📊 **Dual Status Bar** | Hiện Accept ON/OFF và Scroll ON/OFF riêng biệt, màu xanh/đỏ |

---

## 🆕 Tính năng mới v5.0

### ⚡ Instant Toggle (không cần Save/Reload)
- **Enable Auto Click & Scroll** — gạt switch → tức thì ON/OFF
- **Enable Auto Scroll** — toggle riêng cho scroll, instant
- Không cần nhấn Save & Apply cho việc bật/tắt


### 🔀 Tắt/Bật từng tính năng riêng
- **Accept** và **Scroll** có toggle riêng biệt
- Tắt Scroll nhưng vẫn giữ Accept hoạt động, và ngược lại

### 📊 Dual Status Bar
- Hai items riêng biệt trên status bar: `✓ Accept ON` `✓ Scroll ON`
- Mỗi cái có **màu riêng**: 🟢 xanh khi ON, 🔴 đỏ khi OFF
- Click vào bất kỳ item nào đều mở Settings

### 🎨 UI cải tiến
- Nút toggle xanh neon rực + glow effect khi ON
- Text sáng hơn, dễ đọc hơn
- Nút **Reload** cho phép reload thủ công
- Reload nằm bên trái, Save & Apply bên phải

### 📋 Live Pattern Updates
- Tắt/bật từng nút (Run, Allow...) → Save → apply trong 2 giây
- Không cần reload để thay đổi button patterns
- Click timing và scroll timing cũng update live

---

## 📋 Danh sách nút hỗ trợ

Mặc định **ON**: `Allow` · `Always Allow` · `Keep Waiting` · `Retry` · `Continue` · `Allow Once` · `Allow This Con`

Mặc định **OFF**: `Run` · `Accept all` (bật thủ công khi cần)

> 💡 Bạn có thể thêm nút tùy chỉnh hoặc bật/tắt từng nút trong Settings.

---

## 🔧 Cách sử dụng

### Cài đặt
1. Mở Antigravity / VS Code
2. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. Chọn file `.vsix` → Cài đặt → **Reload Window**
4. Extension tự inject script + **auto-reload** lần đầu

### Mở Settings
- Click **"Accept ON"** hoặc **"Scroll ON"** trên Status Bar (góc dưới phải)
- Hoặc `Ctrl+Shift+P` → `AG Auto: Open Settings`

### Sử dụng
- **Toggle ON/OFF**: Gạt switch → tức thì, không cần Save
- **Đổi settings**: Chỉnh thông số → nhấn **Save & Apply**
- **Reload thủ công**: Nhấn nút **🔄 Reload** khi cần

### Gỡ bỏ
`Ctrl+Shift+P` → `AG Auto: Disable` → **Reload Window**

---

> 🛡 **Safe Click**: Script chỉ click nút nằm trong approval dialog (có nút Reject/Deny/Cancel bên cạnh). Không bao giờ click nhầm nút navigation, sidebar, hay dialog tạo conversation mới.

---

## 📸 Giao diện Settings

![Settings UI](media/settings-screenshot.png)

Giao diện trực quan với:
- **Instant Toggle** ON/OFF cho Accept và Scroll riêng biệt
- **Toggle ON/OFF** cho từng nút click pattern
- **Thêm nút tùy chỉnh** bằng text input
- **Chỉnh tốc độ** quét click và scroll
- **Đa ngôn ngữ** (Tiếng Việt / English / 中文)
- **Reload button** cho reload thủ công

---

## 🔄 Changelog

### v5.0.0 (Latest) 🎉
- ⚡ **Instant Toggle** — ON/OFF tức thì, không cần Save hay Reload
- 🔀 **Scroll Toggle riêng** — tắt/bật Scroll độc lập với Accept
- 📡 **HTTP IPC** — micro-server cho live config sync
- 📊 **Dual Status Bar** — Accept và Scroll hiện màu xanh/đỏ riêng
- 🎨 **UI nâng cấp** — toggle xanh neon, text sáng, nút Reload
- 📋 **Live Pattern Updates** — đổi patterns apply trong 2s
- 🔄 **Auto-inject + Auto-reload** — cài xong tự inject, tự reload

### v4.x
- 🎯 Auto Click với Commands API bonus
- 📜 Auto Scroll với smart pause
- ⚙️ Settings UI đa ngôn ngữ
- 🛡 Safe Click — approval pair detection

### v3.x
- 🛡 Approval Pair Detection
- 🔄 Dynamic config reload
- ✨ UI badges ON/OFF

---

## 📄 License

MIT © [Zixfel](https://github.com/zixfelw)
