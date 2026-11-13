import { describe, it, expect } from "vitest";
import { toLuongProject, projectMetrics, jobKind } from "../src/lib/selectors.js";

describe("13/11 mọi dự án → Lương, số tiền = LN gộp cũ", () => {
  it("ADS: bỏ tiền chạy, giữ đúng LN gộp, đã thu theo tỷ lệ", () => {
    const p = { id: "p1", category: "ADS", feeRate: 20, installments: [
      { id: "a", date: "2026-10-01", label: "T10", amount: 10_000_000, serviceFee: 2_000_000, spend: 7_500_000, ctv: 300_000, collected: 10_000_000 },
      { id: "b", date: "2026-11-01", label: "T11", amount: 10_000_000, serviceFee: 2_000_000, spend: 8_000_000, collected: 5_000_000 },
    ] };
    const before = projectMetrics(p);
    const q = toLuongProject(p);
    expect(q.category).toBe("Lương");
    expect(q.service).toBe("ADS");
    expect(jobKind(q)).toBe("ADS");
    expect(q.feeRate).toBeUndefined();
    expect(q.installments[0]).toMatchObject({ id: "a", amount: 2_200_000, collected: 2_200_000, spend: 0, ctv: 0, costs: [] });
    expect(q.installments[1]).toMatchObject({ id: "b", amount: 2_000_000, collected: 1_000_000 });
    const after = projectMetrics(q);
    expect(after.grossProfit).toBe(before.grossProfit);
    expect(after.revenue).toBe(before.grossProfit);
    expect(after.debt).toBe(1_000_000);
  });
  it("Web có CTV + chi phí; chạy lại không đổi; dự án Lương giữ nguyên", () => {
    const p = { id: "p2", category: "Web", installments: [{ id: "c", date: "2026-09-01", amount: 20_000_000, ctv: 5_000_000, costs: [{ label: "Hosting", amount: 1_000_000 }], collected: 0 }] };
    const q = toLuongProject(p);
    expect(q.installments[0]).toMatchObject({ amount: 14_000_000, collected: 0 });
    expect(toLuongProject(q)).toBe(q);
    const sal = { id: "p3", category: "Lương", installments: [{ id: "d", amount: 15_000_000, collected: 15_000_000 }] };
    expect(toLuongProject(sal)).toBe(sal);
  });
  it("đợt lỗ (LN âm) → không tạo công nợ", () => {
    const q = toLuongProject({ id: "p4", category: "Web", installments: [{ id: "e", amount: 1_000_000, ctv: 1_500_000, collected: 1_000_000 }] });
    expect(q.installments[0]).toMatchObject({ amount: -500_000, collected: -500_000 });
    expect(projectMetrics(q).debt).toBe(0);
  });
});
