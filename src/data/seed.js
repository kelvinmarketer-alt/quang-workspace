// Dữ liệu seed cho Quang Workspace.
// NGUỒN DUY NHẤT: customerList + projects (mỗi project gồm nhiều ĐỢT). Mọi module đọc từ đây.

// Danh mục dịch vụ
export const PROJECT_CATEGORIES = ["Web", "App", "ADS", "Coaching", "Seo", "Landing", "Lương", "Khác"];

// Khách hàng — user tự tạo / nhập hàng loạt.
export const SEED_CUSTOMERS = [];

// Dự án / đơn hàng. Mỗi dự án gồm nhiều ĐỢT (installments) — mỗi đợt là 1 phiếu thu / chu kỳ.
// Đợt thường: { id, label, date, amount, ctv, otherCost, collected }
// Đợt ADS:   { id, label, date, amount(=số tiền nhận), serviceFee(=phí chạy), spend(=tiền chạy thực tế), ctv, otherCost, collected }
//   chiết khấu nền tảng = amount − serviceFee − spend (tự tính)
// project: { id, customerId, customerName, name, category, status, note, installments[] }
export const SEED_PROJECTS = [];

// Công việc — KHÔNG seed mặc định (tránh tự hồi sau khi user xoá)
export const SEED_TASKS = [];
export const SEED_FAMILY = [];
export const SEED_TRANSACTIONS = [];

// Chi phí vận hành công ty (overhead) — KHÁC chi phí gắn vào job (CTV/chi phí đợt).
// expense: { id, name, category, amount, date(bắt đầu), recurring: "monthly"|"yearly"|"once", note, active }
export const EXPENSE_CATEGORIES = ["AI", "App", "Khác"];
export const SEED_EXPENSES = [];

// Cấu hình app (đồng bộ cùng dữ liệu khi deploy DB online). Gồm key OpenAI.
export const SEED_SETTINGS = { openaiKey: "", openaiModel: "gpt-4o-mini" };
