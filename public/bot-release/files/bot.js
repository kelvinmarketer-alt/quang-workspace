// Điểm khởi động (giữ thật ngắn, ít khi đổi): bảo vệ tự cập nhật → nạp bot chính (lib/main.js).
// Bản cập nhật mới khởi động lỗi 3 lần liên tiếp → updater tự quay về bản cũ.
import { bootGuard } from "./lib/updater.js";
bootGuard();
try { await import("./lib/main.js"); } catch (e) { console.error("Lỗi khởi động bot:", e?.stack || e); process.exit(1); }
