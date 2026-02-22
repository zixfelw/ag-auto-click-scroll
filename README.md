# 🚀 AG Auto Click & Scroll

**Extension tự động nhấn nút Run, Allow, Accept all và cuộn khung chat Antigravity.**  
Thiết kế thông minh — chỉ click **nút approval** (có nút Reject bên cạnh), không click nhầm UI khác.

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 🎯 **Auto Click** | Tự động nhấn Run, Allow, Always Allow, Accept all, Keep Waiting... |
| 📜 **Auto Scroll** | Cuộn khung chat xuống cuối để không bỏ lỡ nội dung mới |
| ⏸ **Smart Pause** | Tạm dừng cuộn khi bạn cuộn chuột, tự tiếp tục sau X giây |
| ⚙️ **Settings UI** | Giao diện trực quan — bật/tắt từng nút, chỉnh tốc độ |
| 🔄 **Realtime Config** | Thay đổi apply ngay, không cần restart |
| 🛡 **Safe Click** | Chỉ click nút approval (có Reject bên cạnh), không phá UI |

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

### Kích hoạt
1. `Ctrl+Shift+P` → `AG Auto: Enable` → **Reload Window**  
2. Script sẽ tự chạy mỗi lần mở Antigravity

### Mở Settings
- Click **"AG Auto Accept | Auto Scroll"** trên Status Bar (góc dưới)
- Hoặc `Ctrl+Shift+P` → `AG Auto: Open Settings`

### Gỡ bỏ
`Ctrl+Shift+P` → `AG Auto: Disable` → **Reload Window**

---

## ⚡ Cơ chế hoạt động

```
Script inject vào workbench.js
        ↓
setInterval quét nút mỗi 1s (tuỳ chỉnh)
        ↓
Tìm button/span match pattern
        ↓
Kiểm tra có nút Reject/Deny bên cạnh?
   ├─ CÓ → Click ✅ (approval dialog)
   └─ KHÔNG → Bỏ qua ❌ (UI button)
```

> 🛡 **Safe Click**: Script chỉ click nút nằm trong approval dialog (có nút Reject/Deny/Cancel bên cạnh). Không bao giờ click nhầm nút navigation, sidebar, hay dialog tạo conversation mới.

---

## 📸 Giao diện Settings

![Settings UI](media/settings-screenshot.png)

Giao diện trực quan với:
- **Toggle ON/OFF** cho từng nút
- **Thêm nút tùy chỉnh** bằng text input
- **Chỉnh tốc độ** quét click và scroll
- **Chỉnh thời gian nghỉ** khi cuộn tay
- **Đa ngôn ngữ** (Tiếng Việt / English)

---

## 🔄 Changelog

### v3.9.0 (Latest)
- 🎯 **Accept all**: Hỗ trợ click nút "Accept all" (span element)
- 🛡 **Safe Click**: Chỉ click nút có Reject sibling
- 🔄 **Realtime Config**: Đổi settings → apply ngay không restart
- 🐛 Fix lỗi không tạo được conversation mới
- 🐛 Fix lỗi redirect về conversation cũ khi startup

### v3.6.0
- 🛡 Approval Pair Detection — chỉ click nút có reject sibling
- 🐛 Fix redirect khi tạo conversation mới

### v3.1.0
- 🔄 Dynamic config reload (poll mỗi 5s)
- 📝 Disabled patterns không bị click nữa

### v3.0.0
- ✨ UI badges ON/OFF thay emoji
- 🗑 Xóa auto-accept Commands API loop

---

## 📄 License

MIT © [Zixfel](https://github.com/zixfelw)
