// TIẾN ĐỘ NĂM (09/11/2026): so "đã qua bao nhiêu % thời gian" với "đạt bao nhiêu % mục tiêu doanh thu".
// Doanh thu tính đúng như ô KPI "Doanh thu T1–Tn" trên Tổng quan (theo ngày của đợt thu, các tháng chưa tới không cộng).
import { projectsMonthly } from "./selectors.js";

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function yearRevenueToDate(projects, today = new Date()) {
  const y = today.getFullYear(), m = today.getMonth() + 1;
  return projectsMonthly(projects, y).filter((x) => x.month <= m).reduce((a, x) => a + x.revenue, 0);
}

/**
 * @param {number} revenue  doanh thu từ đầu năm đến nay
 * @param {number} target   mục tiêu doanh thu cả năm (đồng)
 * @returns kết quả để vẽ thanh tiến độ + lời nhận xét
 */
export function yearProgress({ revenue = 0, target = 0, today = new Date() }) {
  const t = startOfDay(today), y = t.getFullYear();
  const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1);
  const daysInYear = Math.round((end - start) / DAY);
  const dayOfYear = Math.round((t - start) / DAY) + 1;
  const daysLeft = daysInYear - dayOfYear;
  const timePct = (dayOfYear / daysInYear) * 100;
  const out = { year: y, dayOfYear, daysInYear, daysLeft, timePct, revenue, target, hasTarget: target > 0 };
  if (!(target > 0)) return out;
  const revenuePct = (revenue / target) * 100;
  const gap = revenuePct - timePct; // điểm phần trăm: dương = nhanh hơn kế hoạch
  const monthsLeft = daysLeft / (daysInYear / 12);
  const remaining = Math.max(0, target - revenue);
  return {
    ...out, revenuePct, gap, remaining, monthsLeft,
    state: revenuePct >= 100 ? "done" : gap >= 3 ? "ahead" : gap <= -3 ? "behind" : "on",
    needPerMonth: monthsLeft > 0.05 ? remaining / monthsLeft : null, // cần đạt mỗi tháng còn lại để kịp
    forecast: timePct > 0 ? (revenue / timePct) * 100 : null, // giữ nhịp từ đầu năm đến nay thì cuối năm được khoảng này
  };
}
