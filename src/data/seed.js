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

// QUỸ phân bổ dòng tiền. Mỗi quỹ là 1 "túi tiền" với % phân bổ mặc định.
// fund: { id, name, color, percent, note }
export const FUND_COLORS = ["indigo", "emerald", "rose", "sky", "amber", "violet", "teal", "pink"];
export const SEED_FUNDS = [
  { id: "fund-invest", name: "Đầu tư", color: "indigo", percent: 30, note: "Forex / dự án góp vốn" },
  { id: "fund-personal", name: "Cá nhân", color: "emerald", percent: 30, note: "Chi tiêu hằng ngày" },
  { id: "fund-family", name: "Gia đình", color: "rose", percent: 20, note: "Biếu bố mẹ, việc nhà" },
  { id: "fund-travel", name: "Du lịch", color: "sky", percent: 10, note: "" },
  { id: "fund-reserve", name: "Dự phòng", color: "amber", percent: 10, note: "Quỹ khẩn cấp" },
];
// Giao dịch quỹ (nạp / rút). fundTx: { id, fundId, date, amount, type: "in"|"out", note }
export const SEED_FUND_TX = [];
// Lịch chuyển quỹ định kỳ. schedule: { id, fromId, toId, amount, every: "week"|"2week"|"month", startDate, note, active, lastDone }
// Chế độ "nhắc + xác nhận": đến hạn hiện banner, user bấm "Chuyển ngay" mới thực hiện. lastDone = ISO kỳ gần nhất đã xử lý.
export const SEED_FUND_SCHEDULES = [];

// Cấu hình app (đồng bộ cùng dữ liệu khi deploy DB online). Gồm key OpenAI.
export const SEED_SETTINGS = { openaiKey: "", openaiModel: "gpt-4o-mini" };
