// Phân quyền theo TÍNH NĂNG (trang). Chủ workspace = toàn quyền.
// Thành viên được cấp danh sách "feature key" nào thì thấy/vào trang đó.
export const FEATURES = [
  ["dashboard", "Tổng quan"],
  ["customers", "Khách & Dự án"],
  ["ketoan", "Kế toán & Chi phí"],
  ["tasks", "Công việc & Lịch"],
  ["coin", "Đầu tư Coin"],
];
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
  "/tai-nguyen": "customers",
};

export const featLabel = (k) => (FEATURES.find(([key]) => key === k) || [k, k])[1];

// Các method GHI của store theo từng tính năng — để CHẶN khi thành viên chỉ có quyền Xem.
export const FEATURE_WRITES = {
  customers: ["addCustomer", "addCustomers", "updateCustomer", "deleteCustomer", "deleteCustomers", "addProject", "updateProject", "deleteProject", "addInstallment", "updateInstallment", "deleteInstallment", "importParsed", "addResource", "addResources", "updateResource", "deleteResource", "deleteResources"],
  ketoan: ["addExpense", "addExpensesMany", "updateExpense", "deleteExpense", "deleteExpensesMany", "changeExpensePlan", "addFund", "updateFund", "deleteFund", "addFundTx", "addFundTxMany", "updateFundTx", "deleteFundTx", "categorizeFundTx", "addSpendCat", "updateSpendCat", "deleteSpendCat", "transferFund", "transferFundMany", "allocateFromCompany", "addFundSchedule", "updateFundSchedule", "deleteFundSchedule", "runFundSchedule", "skipFundSchedule"],
  tasks: ["addTask", "updateTask", "deleteTask", "toggleTask", "addFamily", "addFamilyMany", "updateFamily", "updateFamilyMany", "deleteFamily", "deleteFamilyMany"],
  coin: ["addCoin", "updateCoin", "deleteCoin"],
};
// Cài đặt DỮ LIỆU / BẢO MẬT — chỉ CHỦ (admin) được: quản lý user, đổi cấu hình, backup/restore/reset.
export const OWNER_ONLY_WRITES = ["addMember", "updateMember", "removeMember", "setSettings", "importData", "reset", "addVaultItem", "addVaultItems", "updateVaultItem", "deleteVaultItem"];

// Quyền của 1 thành viên theo tính năng: { feat: "none" | "view" | "edit" }. Tương thích ngược schema cũ (perms[]=edit).
export function memberAccess(member) {
  if (member && member.access) return member.access;
  const a = {};
  for (const [k] of FEATURES) a[k] = ((member && member.perms) || []).includes(k) ? "edit" : "none";
  return a;
}
