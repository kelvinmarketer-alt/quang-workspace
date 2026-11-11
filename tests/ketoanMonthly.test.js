// 11/11: Lãi theo tháng của khách + Đối soát cuối tháng
import { describe, it, expect } from "vitest";
import { customerMonthly, monthRecon, fundBalanceAt, shiftMonth, monthBounds, reconMonths } from "../src/lib/ketoanMonthly.js";
import { projectMetrics } from "../src/lib/selectors.js";

const projects = [
  { id: "p1", customerId: "c1", category: "Web", installments: [
    { id: "i1", date: "2026-09-10", amount: 10_000_000, collected: 10_000_000, ctv: 2_000_000 },
    { id: "i2", date: "2026-10-05", amount: 5_000_000, collected: 3_000_000, costs: [{ amount: 500_000 }], payments: [{ id: "a", date: "2026-10-20", amount: 3_000_000 }] },
    { id: "i3", date: "2026-12-01", amount: 9_000_000, collected: 0 }, // tương lai
  ] },
  { id: "p2", customerId: "c1", category: "ADS", installments: [
    { id: "i4", date: "2026-10-15", amount: 20_000_000, serviceFee: 2_000_000, spend: 17_000_000, collected: 20_000_000, ctv: 300_000 },
  ] },
  { id: "p3", customerId: "c2", category: "Web", installments: [{ id: "i5", date: "2026-10-01", amount: 1_000_000, collected: 1_000_000 }] },
];

describe("tháng", () => {
  it("lùi tháng qua năm + biên tháng", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("lãi theo tháng của khách", () => {
  it("khớp công thức Kế toán, không tính đợt tương lai", () => {
    const r = customerMonthly(projects, "c1", { months: 6, today: "2026-11-11" });
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0].key).toBe("2026-11");
    const oct = r.rows.find((x) => x.key === "2026-10");
    // Web: 5tr − 0,5tr = 4,5tr ; ADS: phí 2tr + chiết khấu (20−2−17=1tr) − 0,3tr = 2,7tr
    expect(oct.grossProfit).toBe(4_500_000 + 2_700_000);
    expect(oct.revenue).toBe(25_000_000);
    expect(oct.cost).toBe(800_000);
    expect(r.rows.find((x) => x.key === "2026-09").grossProfit).toBe(8_000_000);
    expect(r.sum.grossProfit).toBe(15_200_000);
    // "mọi lúc" = cộng projectMetrics (gồm cả đợt tương lai) — giống số ở dòng khách
    const all = projectMetrics(projects[0]).grossProfit + projectMetrics(projects[1]).grossProfit;
    expect(r.all.grossProfit).toBe(all);
  });
});

describe("đối soát cuối tháng", () => {
  const funds = [{ id: "co", role: "company", name: "Công ty" }, { id: "f1", name: "Đầu tư", color: "indigo" }, { id: "f2", name: "Du lịch", color: "sky" }];
  const fundTx = [
    { id: "t1", fundId: "co", type: "out", amount: 3_000_000, date: "2026-10-28", xferId: "x1" },
    { id: "t2", fundId: "f1", type: "in", amount: 3_000_000, date: "2026-10-28", xferId: "x1" },
    { id: "t3", fundId: "f2", type: "out", amount: 500_000, date: "2026-10-29" }, // chi làm quỹ âm, không danh mục
    { id: "t4", fundId: "zz", type: "in", amount: 100, date: "2026-10-30" }, // quỹ đã xoá
    { id: "t5", fundId: "f1", type: "in", amount: 1_000_000, date: "2026-09-01" },
  ];
  const r = monthRecon({ projects, expenses: [], funds, fundTx, month: "2026-10", today: "2026-11-11" });
  it("tiền vào / ra / phân bổ", () => {
    expect(r.grossProfit).toBe(7_200_000 + 1_000_000);
    expect(r.moneyIn.manualIn).toBe(100);
    expect(r.moneyOut.spends).toBe(500_000);
    expect(r.allocated).toBe(3_000_000);
    expect(r.collectedPays).toBe(3_000_000);
  });
  it("số dư đầu / cuối tháng — quỹ công ty KHÔNG trừ công nợ", () => {
    const co = r.funds.find((f) => f.id === "co");
    expect(co.start).toBe(8_000_000); // LN gộp tháng 9
    expect(co.end).toBe(8_000_000 + 8_200_000 - 3_000_000);
    const f1 = r.funds.find((f) => f.id === "f1");
    expect([f1.start, f1.end]).toEqual([1_000_000, 4_000_000]);
    expect(fundBalanceAt(fundTx, "f2", "2026-10-31")).toBe(-500_000);
  });
  it("báo lệch", () => {
    const keys = r.issues.map((x) => x.key);
    expect(keys).toContain("neg_f2");
    expect(keys).toContain("orphan");
    expect(keys).toContain("noCat");
    expect(keys).toContain("debt");
    expect(keys).not.toContain("companyNeg");
  });
  it("danh sách tháng", () => {
    const ms = reconMonths(projects, fundTx, "2026-11-11");
    expect(ms[0]).toBe("2026-11");
    expect(ms[ms.length - 1]).toBe("2026-09");
  });
});
