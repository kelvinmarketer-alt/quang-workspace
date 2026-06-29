const n = (v) => Number(v) || 0;

/**
 * Tài chính 1 ĐỢT (installment) theo loại dịch vụ.
 * - ADS: doanh thu = ngân sách đợt − tiền chạy thật. chiết khấu = ngân sách − phí DV − tiền chạy.
 * - Khác: doanh thu = số tiền đợt (phí).
 * - Khách phải trả đợt = amount. Công nợ đợt = amount − đã thu.
 * - Lợi nhuận gộp = doanh thu − CTV − chi phí khác.
 */
export function installmentMetrics(inst, isAds) {
  const amount = n(inst.amount);
  const serviceFee = n(inst.serviceFee);
  const spend = n(inst.spend);
  const refund = n(inst.refund); // hoàn lại khách
  const carry = n(inst.carry);   // chuyển sang đợt sau (giữ tiền khách)
  const ctv = n(inst.ctv);
  const other = Array.isArray(inst.costs) ? inst.costs.reduce((a, c) => a + n(c.amount), 0) : n(inst.otherCost);
  const collected = n(inst.collected);

  const contractValue = amount;
  const platformDiscount = isAds ? Math.max(0, amount - serviceFee - spend - refund - carry) : 0;
  // Doanh thu = số tiền nhận (trừ phần hoàn khách / chuyển đợt sau)
  const revenue = amount - refund - carry;
  const cost = ctv + other;
  // Lợi nhuận: ADS = chiết khấu nền tảng + phí chạy − chi phí ; khác = doanh thu − chi phí
  const grossProfit = (isAds ? serviceFee + platformDiscount : revenue) - cost;
  const debt = Math.max(0, amount - collected);
  const cashIn = inst.carried ? 0 : collected; // đợt nối (carried) không phải tiền mới
  return { contractValue, collected, cashIn, debt, platformDiscount, revenue, cost, grossProfit, spend, refund, carry, ctv, other };
}

/** Tổng hợp 1 dự án = cộng các đợt. */
export function projectMetrics(p) {
  const isAds = p.category === "ADS";
  return (p.installments || []).reduce(
    (a, inst) => {
      const m = installmentMetrics(inst, isAds);
      a.contractValue += m.contractValue;
      a.collected += m.collected;
      a.debt += m.debt;
      a.platformDiscount += m.platformDiscount;
      a.revenue += m.revenue;
      a.cost += m.cost;
      a.grossProfit += m.grossProfit;
      return a;
    },
    { contractValue: 0, collected: 0, debt: 0, platformDiscount: 0, revenue: 0, cost: 0, grossProfit: 0 }
  );
}

export function projectsSummary(projects) {
  return projects.reduce(
    (a, p) => {
      const m = projectMetrics(p);
      a.contractValue += m.contractValue;
      a.collected += m.collected;
      a.revenue += m.revenue;
      a.discount += m.platformDiscount;
      a.grossProfit += m.grossProfit;
      a.debt += m.debt;
      return a;
    },
    { contractValue: 0, collected: 0, revenue: 0, discount: 0, grossProfit: 0, debt: 0 }
  );
}

// Tổng hợp theo tháng trong 1 năm — tính theo NGÀY của từng đợt (revenue ghi nhận theo đợt).
export function projectsMonthly(projects, year) {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, discount: 0, grossProfit: 0, debt: 0, count: 0 }));
  for (const p of projects) {
    const isAds = p.category === "ADS";
    for (const inst of p.installments || []) {
      const d = inst.date ? new Date(inst.date) : null;
      if (!d || d.getFullYear() !== year) continue;
      const m = out[d.getMonth()];
      const x = installmentMetrics(inst, isAds);
      m.revenue += x.revenue;
      m.discount += x.platformDiscount;
      m.grossProfit += x.grossProfit;
      m.debt += x.debt;
      m.count += 1;
    }
  }
  return out;
}

// Các năm có dữ liệu đợt
export function projectYears(projects) {
  const ys = new Set();
  for (const p of projects) for (const inst of p.installments || []) if (inst.date) ys.add(new Date(inst.date).getFullYear());
  return [...ys].sort((a, b) => b - a);
}

// Công nợ 1 khách
export function customerDebt(projects, customerId) {
  return projects.filter((p) => p.customerId === customerId).reduce((a, p) => a + projectMetrics(p).debt, 0);
}

// Tổng hợp dự án theo khách
export function customerProjectSummary(projects, customerId) {
  const list = projects.filter((p) => p.customerId === customerId);
  const s = projectsSummary(list);
  return { count: list.length, debt: s.debt, revenue: s.revenue, grossProfit: s.grossProfit, list };
}

// Tổng công nợ toàn bộ
export function totalDebt(projects) {
  return projects.reduce((a, p) => a + projectMetrics(p).debt, 0);
}

export const fmtMoney = (v) => (Number(v) || 0).toLocaleString("vi-VN") + " đ";

// Ngày thu tiền gần nhất của 1 khách (đợt có collected > 0). Trả ISO yyyy-mm-dd hoặc null.
export function customerLastIncome(projects, customerId) {
  let last = null;
  for (const p of projects) {
    if (p.customerId !== customerId) continue;
    for (const inst of p.installments || []) {
      if (n(inst.collected) > 0 && inst.date && (!last || inst.date > last)) last = inst.date;
    }
  }
  return last;
}

// Số ngày từ 1 ngày ISO đến hôm nay
export function daysSince(isoDate) {
  if (!isoDate) return null;
  const a = new Date(new Date(isoDate).toDateString());
  const b = new Date(new Date().toDateString());
  return Math.max(0, Math.round((b - a) / 86400000));
}

// ===== KẾ TOÁN: làm phẳng tất cả ĐỢT thành "giao dịch" có ngữ cảnh =====
export function allInstallments(projects) {
  const out = [];
  for (const p of projects) {
    const isAds = p.category === "ADS";
    for (const inst of p.installments || []) {
      out.push({
        ...inst, isAds,
        projectId: p.id, projectName: p.name, customerId: p.customerId, customerName: p.customerName, category: p.category,
        ...installmentMetrics(inst, isAds), // contractValue, revenue, platformDiscount, cost, grossProfit, debt, collected, spend
        serviceFee: isAds ? n(inst.serviceFee) : 0,
      });
    }
  }
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// Lọc đợt theo khoảng [from, to] (ISO yyyy-mm-dd, bao gồm 2 đầu)
export function installmentsInRange(projects, from, to) {
  return allInstallments(projects).filter((x) => x.date && (!from || x.date >= from) && (!to || x.date <= to));
}

// Cộng dồn 1 danh sách đợt
export function sumInstallments(list) {
  return list.reduce(
    (a, x) => {
      a.received += x.contractValue;
      a.revenue += x.revenue;
      a.discount += x.platformDiscount;
      a.serviceFee += x.serviceFee || 0;
      a.spend += n(x.spend);
      a.refund += n(x.refund);
      a.carry += n(x.carry);
      a.grossProfit += x.grossProfit;
      a.collected += x.collected;
      a.cashIn += x.cashIn;
      a.debt += x.debt;
      a.count += 1;
      return a;
    },
    { received: 0, revenue: 0, discount: 0, serviceFee: 0, spend: 0, refund: 0, carry: 0, grossProfit: 0, collected: 0, cashIn: 0, debt: 0, count: 0 }
  );
}

// Chuỗi theo tháng giữa from..to (cho biểu đồ)
export function monthlySeriesInRange(projects, from, to) {
  const list = installmentsInRange(projects, from, to);
  const map = new Map();
  for (const x of list) {
    const key = x.date.slice(0, 7); // yyyy-mm
    if (!map.has(key)) map.set(key, { key, revenue: 0, grossProfit: 0, collected: 0, debt: 0 });
    const m = map.get(key);
    m.revenue += x.revenue; m.grossProfit += x.grossProfit; m.collected += x.collected; m.debt += x.debt;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ===== CHI PHÍ VẬN HÀNH CÔNG TY =====
function expenseCharges(ex, from, to) {
  if (ex.active === false) return [];
  if (!ex.date) return [];
  const start = new Date(ex.date + "T00:00:00");
  const out = [];
  const ok = (d) => d >= from && d <= to && d >= start;
  const rec = ex.recurring || "monthly";
  if (rec === "once") {
    if (ok(start)) out.push(start);
  } else if (rec === "yearly") {
    for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
      const d = new Date(y, start.getMonth(), start.getDate());
      if (ok(d)) out.push(d);
    }
  } else { // monthly
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (d < from) d = new Date(d.getFullYear(), d.getMonth() + 1, start.getDate());
    while (d <= to) { if (d >= start) out.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, start.getDate()); }
  }
  return out;
}

// Tổng chi phí THỰC phát sinh trong kỳ [from,to] (ISO) + chi tiết từng khoản.
// CHẶN ở hôm nay: không tính kỳ chi TƯƠNG LAI (chưa thực chi) → khớp doanh thu thực.
export function expensesInRange(expenses, from, to) {
  const f = new Date(from + "T00:00:00");
  const t = new Date(Math.min(new Date(to + "T23:59:59").getTime(), Date.now()));
  let total = 0; const items = [];
  for (const ex of expenses || []) {
    const charges = expenseCharges(ex, f, t);
    if (charges.length) {
      const amt = n(ex.amount) * charges.length;
      total += amt;
      items.push({ ...ex, count: charges.length, total: amt, lastCharge: charges[charges.length - 1] });
    }
  }
  return { total, items: items.sort((a, b) => b.total - a.total) };
}

// ===== QUỸ / PHÂN BỔ DÒNG TIỀN =====
// Số dư 1 quỹ = tổng nạp − tổng rút (toàn thời gian).
export function fundBalance(fundTx, fundId) {
  return (fundTx || []).reduce((a, t) => a + (t.fundId === fundId ? (t.type === "out" ? -n(t.amount) : n(t.amount)) : 0), 0);
}

// Thu nhập THỰC (tiền vào) theo 12 tháng của 1 năm — dùng cashIn của các đợt.
export function monthlyCashIn(projects, year) {
  const out = Array.from({ length: 12 }, () => 0);
  for (const x of allInstallments(projects)) {
    if (!x.date) continue;
    const d = new Date(x.date);
    if (d.getFullYear() === year) out[d.getMonth()] += n(x.cashIn);
  }
  return out;
}

// Tiền NẠP vào từng quỹ theo 12 tháng của 1 năm. Trả { byFund: {fundId: number[12]}, total: number[12] }
// Bỏ qua giao dịch CHUYỂN QUỸ (xferId) vì đó là di chuyển nội bộ, không phải phân bổ thu nhập mới.
export function monthlyFundInflow(fundTx, year) {
  const byFund = {}; const total = Array.from({ length: 12 }, () => 0);
  for (const t of fundTx || []) {
    if (!t.date || t.type === "out" || t.xferId) continue;
    const d = new Date(t.date);
    if (d.getFullYear() !== year) continue;
    (byFund[t.fundId] ||= Array.from({ length: 12 }, () => 0))[d.getMonth()] += n(t.amount);
    total[d.getMonth()] += n(t.amount);
  }
  return { byFund, total };
}

// Tổng tiền nạp quỹ trong khoảng [from,to] (ISO). Dùng để biết "đã phân bổ" kỳ này.
// Bỏ qua chuyển quỹ nội bộ (xferId).
export function fundInflowInRange(fundTx, from, to) {
  return (fundTx || []).reduce((a, t) => (t.type !== "out" && !t.xferId && t.date && t.date >= from && t.date <= to ? a + n(t.amount) : a), 0);
}

// "Burn rate" — chi phí cố định quy ra mỗi tháng (monthly=amount, yearly=amount/12, once bỏ qua)
export function monthlyOperatingCost(expenses) {
  return (expenses || []).filter((e) => e.active !== false).reduce((a, e) => {
    const amt = n(e.amount);
    if ((e.recurring || "monthly") === "monthly") return a + amt;
    if (e.recurring === "yearly") return a + amt / 12;
    return a;
  }, 0);
}
