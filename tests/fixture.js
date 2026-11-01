// Dữ liệu MẪU (không phải số thật) cho kiểm thử: 2 khách, 3 job (Web / ADS / Lương), đợt thu quá khứ + tương lai, chi phí định kỳ
export const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

export const customers = [
  { id: "c1", name: "Thương hiệu A", active: true },
  { id: "c2", name: "Thương hiệu B", active: true },
];
export const projects = [
  { id: "p1", name: "Web A", customerId: "c1", customerName: "Thương hiệu A", category: "Web", status: "doing",
    installments: [{ id: "i1", label: "Đợt 1", date: addDays(-40), amount: 10000000, collected: 10000000, costs: [] },
      { id: "i2", label: "Đợt 2", date: addDays(30), amount: 5000000, collected: 0, costs: [] }] },
  { id: "p2", name: "ADS B", customerId: "c2", customerName: "Thương hiệu B", category: "ADS", status: "doing", feeRate: 12.5,
    installments: [{ id: "i3", label: "Tháng", date: addDays(-10), amount: 20000000, serviceFee: 2500000, spend: 15000000, collected: 15000000, costs: [] }] },
  { id: "p3", name: "Lương B", customerId: "c2", customerName: "Thương hiệu B", category: "Lương", status: "doing", monthlySalary: 8000000,
    installments: [{ id: "i4", label: "Th", date: addDays(-5), amount: 8000000, collected: 8000000, costs: [] }] },
];
export const expenses = [
  { id: "e1", name: "Phần mềm", category: "AI", amount: 500000, date: "2026-01-31", recurring: "monthly", active: true },
  { id: "e2", name: "Tên miền", category: "Khác", amount: 1200000, date: "2026-03-01", recurring: "yearly", active: true },
  { id: "e3", name: "Gói đã hết", category: "App", amount: 300000, date: "2026-01-01", endDate: "2026-02-01", recurring: "monthly", active: true },
];
export const tasks = [{ id: "t1", title: "Gửi báo cáo", date: addDays(0), status: "todo" }, { id: "t2", title: "Việc trễ", date: addDays(-3), status: "todo" }];
export const funds = [{ id: "fc", name: "Quỹ công ty", role: "company" }, { id: "f1", name: "Đầu tư", pct: 50 }];

const DATA = {
  tasks, family: [], customerList: customers, projects, expenses, funds, fundTx: [], fundSchedules: [], spendCats: [],
  vault: [], resources: [], coins: [], adsResults: [], members: [], settings: { reportLinks: {}, measureSkip: {} },
};
const ACT = /^(add|update|delete|set|remove|run|skip|allocate|transfer|import|export|reset|undo|unlock|lock|change|toggle|save|mark|hide|unhide|setToast)/;
export function makeData(over = {}) {
  const base = { ...DATA, isOwner: true, ownerId: "u1", myEmail: "chu@example.com", perms: ["dashboard", "customers", "resources", "ads", "web", "fanpage", "ketoan", "coin", "tasks", "coinInvest", "coinMarket", "coinDemo", "coinLive"], editable: [], canEdit: () => true, syncStatus: "idle", vaultPrivate: true, vaultHasPin: false, vaultLocked: false, ...over };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === "string" && ACT.test(k) ? () => {} : undefined) });
}
