// Phân quyền theo TÍNH NĂNG (trang). Chủ workspace = toàn quyền.
// Thành viên được cấp danh sách "feature key" nào thì thấy/vào trang đó.
export const FEATURES = [
  ["dashboard", "Tổng quan"],
  ["customers", "Khách & Dự án"],
  ["resources", "Tài nguyên"],
  ["ads", "Quảng cáo"],
  ["web", "Hiệu quả Website"],
  ["fanpage", "Hiệu quả Fanpage"],
  ["ketoan", "Kế toán & Chi phí"],
  ["coin", "Đầu tư Coin"],
  ["tasks", "Công việc & Lịch"],
];
// Mô tả ngắn từng quyền (hiện ở Cài đặt → Người dùng & phân quyền)
export const FEATURE_HINT = {
  dashboard: "Bảng Hôm nay, doanh thu/lợi nhuận tổng",
  customers: "Khách hàng, dự án, đợt thu, công nợ",
  resources: "Link tài liệu + tài khoản đăng nhập của từng khách",
  ads: "Số liệu Meta/Google Ads, chấm điểm, AI. Sửa = nhập khách chốt/doanh thu",
  web: "Search Console + GA4 các web đang bật bên Văn phòng AI (chỉ xem)",
  fanpage: "Tiếp cận, tương tác, bài đăng các page đang bật bên Văn phòng AI (chỉ xem)",
  ketoan: "Doanh thu, công nợ, chi phí vận hành, quỹ & dòng tiền",
  coin: "Chọn riêng từng tab bên dưới",
  tasks: "Công việc, lịch âm/dương, giỗ, sinh nhật",
};
// Quyền TỪNG TAB của Đầu tư Coin (21/10): chủ chọn ai được xem danh mục & vốn, ai chỉ xem Demo / Bot thật.
// [key, nhãn, mô tả, các mức cho phép]. Demo + Bot thật CHỈ XEM (điều khiển bot luôn chỉ chủ).
export const COIN_SUBS = [
  ["coinInvest", "Đầu tư — danh mục & vốn", "Ví Binance (Spot/Earn/Futures), tiền đã nạp, lãi/lỗ, coin nhập tay. Sửa = thêm/sửa coin nhập tay", ["none", "view", "edit"]],
  ["coinMarket", "Thị trường & AI", "Biểu đồ, chỉ báo, phân tích AI", ["none", "view"]],
  ["coinDemo", "Demo tự động", "Kết quả, lịch sử lệnh demo (chỉ xem — không dừng/sửa được)", ["none", "view"]],
  ["coinLive", "Bot thật", "Trạng thái, lệnh, lịch sử bot thật (chỉ xem — không dừng/đóng lệnh/sửa cài đặt)", ["none", "view"]],
];
export const COIN_SUB_KEYS = COIN_SUBS.map(([k]) => k);
// Chỉ CHỦ, không cấp được: Tài khoản & Thẻ (dữ liệu nhạy cảm), Cài đặt dữ liệu/bảo mật, tab Tổng quan Coin.
export const ALL_FEATURES = FEATURES.map(([k]) => k);
export const ALL_KEYS = [...ALL_FEATURES, ...COIN_SUB_KEYS]; // dùng cho perms (chủ = có hết)

// map route path → feature key (để lọc menu + chặn route). Trang không có key = ai cũng vào (VD Cài đặt).
export const ROUTE_FEATURE = {
  "/": "dashboard",
  "/khach-hang": "customers",
  "/du-an": "customers",
  "/don-hang": "customers",
  "/ke-toan": "ketoan",
  "/chi-phi": "ketoan",
  "/cong-viec": "tasks",
  "/lich": "tasks",
  "/coin": "coin",
  "/quang-cao": "ads",
  "/tai-nguyen": "resources",
  "/website": "web",
  "/fanpage": "fanpage",
  "/quy": "ketoan",
  "/quy-thong-ke": "ketoan",
};

export const featLabel = (k) => (FEATURES.find(([key]) => key === k) || [k, k])[1];

// ⚠️ 22/10: máy chủ lọc dữ liệu cho tài khoản phụ theo DANH SÁCH CHO PHÉP (supabase/SETUP-MEMBER-SCOPE.sql → qws_member_view / qws_member_save).
// Thêm khoá dữ liệu mới (state.xxx / settings.xxx) mà tài khoản phụ cần thấy / sửa → khai báo thêm ở 2 hàm đó, không thì họ không thấy.
// Các method GHI của store theo từng tính năng — để CHẶN khi thành viên chỉ có quyền Xem.
export const FEATURE_WRITES = {
  customers: ["addCustomer", "addCustomers", "updateCustomer", "deleteCustomer", "deleteCustomers", "addProject", "updateProject", "deleteProject", "addInstallment", "updateInstallment", "deleteInstallment", "importParsed"],
  resources: ["addResource", "addResources", "updateResource", "deleteResource", "deleteResources"],
  ketoan: ["addExpense", "addExpensesMany", "updateExpense", "deleteExpense", "deleteExpensesMany", "changeExpensePlan", "addFund", "updateFund", "deleteFund", "addFundTx", "addFundTxMany", "updateFundTx", "deleteFundTx", "categorizeFundTx", "addSpendCat", "updateSpendCat", "deleteSpendCat", "transferFund", "transferFundMany", "allocateFromCompany", "addFundSchedule", "updateFundSchedule", "deleteFundSchedule", "runFundSchedule", "skipFundSchedule"],
  tasks: ["addTask", "updateTask", "deleteTask", "toggleTask", "addFamily", "addFamilyMany", "updateFamily", "updateFamilyMany", "deleteFamily", "deleteFamilyMany"],
  coin: ["addCoin", "updateCoin", "deleteCoin"],
  ads: ["addAdsResult", "deleteAdsResult"],
};
// Cài đặt DỮ LIỆU / BẢO MẬT — chỉ CHỦ (admin) được: quản lý user, đổi cấu hình, backup/restore/reset.
export const OWNER_ONLY_WRITES = ["addMember", "updateMember", "removeMember", "setSettings", "importData", "reset", "addVaultItem", "addVaultItems", "updateVaultItem", "deleteVaultItem", "setVaultPin", "removeVaultPin", "unlockVault", "lockVault"];

// Quyền của 1 thành viên theo tính năng: { feat: "none" | "view" | "edit" }. Tương thích ngược schema cũ (perms[]=edit).
export function memberAccess(member) {
  let a;
  if (member && member.access) a = { ...member.access };
  else { a = {}; for (const [k] of FEATURES) a[k] = ((member && member.perms) || []).includes(k) ? "edit" : "none"; }
  // Quyền mới tách ra sau: chưa đặt thì kế thừa từ quyền cũ tương ứng (Tài nguyên ← Khách & Dự án); Website/Fanpage mặc định không
  if (a.resources == null) a.resources = a.customers || "none";
  for (const [k] of FEATURES) if (a[k] == null) a[k] = "none";
  // Tab Coin chưa đặt riêng → kế thừa quyền cũ: Thị trường + Demo theo "coin"; danh mục & vốn, Bot thật mặc định KHÔNG (trước đây chỉ chủ)
  if (a.coinInvest == null) a.coinInvest = "none";
  if (a.coinMarket == null) a.coinMarket = a.coin !== "none" ? "view" : "none";
  if (a.coinDemo == null) a.coinDemo = a.coin !== "none" ? "view" : "none";
  if (a.coinLive == null) a.coinLive = "none";
  // Module Coin hiện khi có ít nhất 1 tab; Sửa (coin nhập tay) khi "danh mục & vốn" = Sửa
  a.coin = a.coinInvest === "edit" ? "edit" : COIN_SUB_KEYS.some((k) => a[k] !== "none") ? "view" : "none";
  return a;
}

// ===== PHẠM VI DỰ ÁN (21/10) — mỗi nhân viên chỉ thấy các khách / thương hiệu được giao =====
// member.scope = { all: true } (mặc định) | { customers: [customerId, …] }
// Áp cho: Khách & Dự án, Tài nguyên, Tổng quan (chỉ số của dự án được giao), Quảng cáo / Website / Fanpage (khớp theo tên thương hiệu),
// và Văn phòng AI (thương hiệu cùng tên). Bị giới hạn phạm vi thì KHÔNG cấp được Kế toán (sổ thu chi toàn công ty).
export function memberScope(member) {
  const sc = member && member.scope;
  if (!sc || sc.all !== false || !Array.isArray(sc.customers)) return null;
  return sc.customers.filter(Boolean);
}
export const SCOPE_BLOCKED = ["ketoan"]; // không cấp được khi đã giới hạn phạm vi
// So khớp tên thương hiệu không phân biệt hoa thường / dấu: "Nông sản Tuấn Tú" ~ "NÔNG SẢN TUẤN TÚ HÀ NỘI"
export const normBrand = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function brandMatch(text, names) {
  if (!names) return true; // không giới hạn
  const t = normBrand(text);
  return names.some((n) => { const k = normBrand(n); return k && (t.includes(k) || (t && k.includes(t))); });
}
