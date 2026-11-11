// 11/11: Lãi theo tháng của 1 khách + Đối soát cuối tháng (Dòng tiền).
// CHỈ ĐỌC số — dùng lại công thức trong selectors.js để khớp Kế toán. Không đổi cách tính quỹ.
import { installmentMetrics, projectMetrics, grossProfitToDate, expensesInRange, fundSpends } from "./selectors.js";

const n = (v) => Number(v) || 0;
const pad = (x) => String(x).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "yyyy-mm" → { from, to } (ngày đầu / cuối tháng)
export function monthBounds(key) {
  const [y, m] = key.split("-").map(Number);
  return { from: `${y}-${pad(m)}-01`, to: isoOf(new Date(y, m, 0)) };
}
// Lùi k tháng từ "yyyy-mm"
export function shiftMonth(key, k) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const monthKeyOf = (iso) => (iso || "").slice(0, 7);
export const monthName = (key) => { const [y, m] = (key || "").split("-"); return m ? `T${Number(m)}/${y}` : key; };

/**
 * Lãi/lỗ theo tháng của 1 khách (theo NGÀY của từng đợt, giống Kế toán).
 * Đợt ghi ngày sau hôm nay KHÔNG tính (Kế toán cũng chặn ở hôm nay).
 * Trả { rows: [{key, revenue, cost, grossProfit, count}] mới → cũ, đủ `months` tháng; sum: cộng các tháng; all: projectMetrics cộng mọi lúc }
 */
export function customerMonthly(projects, customerId, { months = 12, today } = {}) {
  const t = today || isoOf(new Date());
  const end = monthKeyOf(t);
  const start = shiftMonth(end, -(months - 1));
  const map = new Map();
  for (let i = 0; i < months; i++) { const k = shiftMonth(end, -i); map.set(k, { key: k, revenue: 0, cost: 0, grossProfit: 0, count: 0 }); }
  const all = { revenue: 0, cost: 0, grossProfit: 0, debt: 0 };
  for (const p of projects || []) {
    if (p.customerId !== customerId) continue;
    const pm = projectMetrics(p);
    all.revenue += pm.revenue; all.cost += pm.cost; all.grossProfit += pm.grossProfit; all.debt += pm.debt;
    const isAds = p.category === "ADS";
    for (const inst of p.installments || []) {
      if (!inst.date || inst.date > t) continue;
      const k = monthKeyOf(inst.date);
      if (k < start || k > end) continue;
      const m = installmentMetrics(inst, isAds);
      const r = map.get(k);
      r.revenue += m.revenue; r.cost += m.cost; r.grossProfit += m.grossProfit; r.count += 1;
    }
  }
  const rows = [...map.values()];
  const sum = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, grossProfit: a.grossProfit + r.grossProfit, count: a.count + r.count }), { revenue: 0, cost: 0, grossProfit: 0, count: 0 });
  return { rows, sum, all };
}

// Số dư 1 quỹ tính TỚI hết ngày `date` (phiếu không có ngày coi như đã có từ trước)
export function fundBalanceAt(fundTx, fundId, date) {
  return (fundTx || []).reduce((a, t) => {
    if (t.fundId !== fundId) return a;
    if (t.date && date && t.date.slice(0, 10) > date) return a;
    return a + (t.type === "out" ? -n(t.amount) : n(t.amount));
  }, 0);
}
// Quỹ công ty tới ngày `date` = LN gộp − chi vận hành + phiếu quỹ (KHÔNG trừ công nợ chưa thu — giống trang Quỹ)
export function companyBalanceAt({ projects, expenses, fundTx, companyId }, date) {
  return grossProfitToDate(projects, date) - expensesInRange(expenses, "2000-01-01", date).total + fundBalanceAt(fundTx, companyId, date);
}

export const CLOSE_CHECKS = [
  ["receipts", "Đã nhập đủ phiếu thu của tháng"],
  ["bank", "Đã đối chiếu tiền về tài khoản ngân hàng"],
  ["opex", "Đã nhập đủ chi phí vận hành"],
  ["spends", "Đã ghi đủ khoản chi từ các quỹ"],
  ["alloc", "Đã phân bổ lãi ra các quỹ"],
  ["debt", "Đã nhắc khách còn nợ"],
  ["issues", "Đã xử lý hết cảnh báo bên dưới"],
];

/**
 * Đối soát 1 tháng ("yyyy-mm"). Chỉ tổng hợp, không ghi gì.
 * moneyIn = LN gộp tháng (nguồn quỹ công ty) + nạp tay vào quỹ; moneyOut = chi vận hành + chi thật từ quỹ.
 * Chuyển / phân bổ giữa quỹ là tiền NỘI BỘ → không tính vào vào/ra, chỉ hiện riêng "Đã phân bổ".
 */
export function monthRecon({ projects = [], expenses = [], funds = [], fundTx = [], month, today }) {
  const t = today || isoOf(new Date());
  const { from, to: to0 } = monthBounds(month);
  const to = to0 > t && from <= t ? t : to0; // tháng đang chạy: tính tới hôm nay
  const dayBefore = isoOf(new Date(new Date(from + "T00:00:00").getTime() - 86400000));
  const inMonth = (d) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const fundIds = new Set(funds.map((f) => f.id));
  const company = funds.find((f) => f.role === "company");
  const companyId = company?.id;

  // Doanh thu / LN gộp theo ngày đợt trong tháng
  let revenue = 0, grossProfit = 0, debt = 0, debtCount = 0, instCount = 0, collectedPays = 0;
  for (const p of projects) {
    const isAds = p.category === "ADS";
    for (const inst of p.installments || []) {
      for (const pay of Array.isArray(inst.payments) ? inst.payments : []) if (pay && inMonth(pay.date)) collectedPays += n(pay.amount);
      if (!inMonth(inst.date)) continue;
      const m = installmentMetrics(inst, isAds);
      revenue += m.revenue; grossProfit += m.grossProfit; instCount += 1;
      if (m.debt > 0) { debt += m.debt; debtCount += 1; }
    }
  }
  const opex = expensesInRange(expenses, from, to).total;

  const txs = (fundTx || []).filter((x) => inMonth(x.date));
  const outFundByXfer = {};
  for (const x of fundTx || []) if (x.xferId && x.type === "out") outFundByXfer[x.xferId] = x.fundId;
  const manualIn = txs.filter((x) => x.type !== "out" && !x.xferId && !x.alloc).reduce((a, x) => a + n(x.amount), 0);
  const spends = fundSpends(txs).reduce((a, x) => a + x.amount, 0);
  const allocated = txs.filter((x) => x.type !== "out" && x.fundId !== companyId && (x.alloc === true || (x.xferId && outFundByXfer[x.xferId] === companyId))).reduce((a, x) => a + n(x.amount), 0);

  const ctx = { projects, expenses, fundTx, companyId };
  const fundRows = funds.map((f) => {
    const start = f.role === "company" ? companyBalanceAt(ctx, dayBefore) : fundBalanceAt(fundTx, f.id, dayBefore);
    const end = f.role === "company" ? companyBalanceAt(ctx, to) : fundBalanceAt(fundTx, f.id, to);
    return { id: f.id, name: f.name, color: f.color, role: f.role, start, end, change: end - start };
  }).sort((a, b) => (a.role === "company" ? -1 : b.role === "company" ? 1 : 0));

  const net = grossProfit - opex;
  const issues = [];
  const cRow = fundRows.find((r) => r.role === "company");
  if (cRow && cRow.end < 0) issues.push({ level: "error", key: "companyNeg", text: `Quỹ công ty âm ${Math.round(-cRow.end).toLocaleString("vi-VN")} đ — đã chia / chi vượt lợi nhuận` });
  for (const r of fundRows) if (r.role !== "company" && r.end < 0) issues.push({ level: "error", key: "neg_" + r.id, text: `Quỹ "${r.name}" âm ${Math.round(-r.end).toLocaleString("vi-VN")} đ` });
  const orphan = txs.filter((x) => !x.fundId || !fundIds.has(x.fundId));
  if (orphan.length) issues.push({ level: "error", key: "orphan", text: `${orphan.length} giao dịch không thuộc quỹ nào (${orphan.reduce((a, x) => a + n(x.amount), 0).toLocaleString("vi-VN")} đ)` });
  const xferCount = {};
  for (const x of fundTx || []) if (x.xferId) xferCount[x.xferId] = (xferCount[x.xferId] || 0) + 1;
  const broken = txs.filter((x) => x.xferId && xferCount[x.xferId] < 2);
  if (broken.length) issues.push({ level: "warn", key: "xfer", text: `${broken.length} phiếu chuyển quỹ chỉ còn 1 chiều` });
  if (cRow && cRow.end >= 0 && allocated > 0 && allocated > net) issues.push({ level: "warn", key: "overAlloc", text: `Chia ra quỹ ${Math.round(allocated).toLocaleString("vi-VN")} đ, nhiều hơn lãi tháng (dùng tiền tồn tháng trước)` });
  const noCat = fundSpends(txs).filter((x) => !x.cat);
  if (noCat.length) issues.push({ level: "info", key: "noCat", text: `${noCat.length} khoản chi từ quỹ chưa có danh mục` });
  if (debtCount) issues.push({ level: "info", key: "debt", text: `${debtCount} đợt của tháng còn nợ ${Math.round(debt).toLocaleString("vi-VN")} đ` });
  if (net > allocated && net - allocated > 0) issues.push({ level: "info", key: "unalloc", text: `Còn ${Math.round(net - allocated).toLocaleString("vi-VN")} đ lãi tháng chưa chia ra quỹ` });

  return {
    month, from, to, revenue, grossProfit, opex, net, debt, debtCount, instCount, collectedPays,
    moneyIn: { grossProfit, manualIn, total: grossProfit + manualIn },
    moneyOut: { opex, spends, total: opex + spends },
    allocated, funds: fundRows, issues,
  };
}

// Danh sách tháng có thể đối soát (mới → cũ): từ tháng có dữ liệu sớm nhất tới tháng này, tối đa 24
export function reconMonths(projects, fundTx, today) {
  const end = monthKeyOf(today || isoOf(new Date()));
  let first = end;
  for (const p of projects || []) for (const i of p.installments || []) if (i.date && monthKeyOf(i.date) < first) first = monthKeyOf(i.date);
  for (const x of fundTx || []) if (x.date && monthKeyOf(x.date) < first) first = monthKeyOf(x.date);
  const out = [];
  for (let k = end; k >= first && out.length < 24; k = shiftMonth(k, -1)) out.push(k);
  return out;
}
