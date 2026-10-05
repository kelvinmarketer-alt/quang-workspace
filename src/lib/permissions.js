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
  coin: "Coin nhập tay + tab Thị trường/AI (ví Binance chỉ chủ xem)",
  tasks: "Công việc, lịch âm/dương, giỗ, sinh nhật",
};
// Chỉ CHỦ, không cấp được: Tài khoản & Thẻ (dữ liệu nhạy cảm), Cài đặt dữ liệu/bảo mật, ví Binance.
export const ALL_FEATURES = FEATURES.map(([k]) => k);

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
  return a;
}
