import { describe, it, expect } from "vitest";
import { runBacktest, aggregate, signalAt, DEF_RULES } from "../src/lib/ruleBacktest.js";

const bar = (i, o, h, l, c, v = 10) => ({ time: i * 3600, open: o, high: h, low: l, close: c, volume: v });
// 30 nến đi ngang 100±1, nến 30 phá đỉnh (đóng 105), sau đó tăng đều
const flat = Array.from({ length: 30 }, (_, i) => bar(i, 100, 101, 99, 100));
const rules = { ...DEF_RULES, dir: "buy", conds: [{ k: "breakout", p: { n: 20 } }], slType: "pct", slPct: 2, tpR: 2, feePct: 0 };

describe("backtest theo luật (27/11)", () => {
  it("tín hiệu ở nến đã đóng, vào giá mở nến sau, chốt lời 2R", () => {
    const c = [...flat, bar(30, 100, 106, 100, 105), bar(31, 106, 107, 105, 107), bar(32, 107, 115, 106, 114)];
    expect(signalAt(c, 30, 1, rules, { E: {}, S: {} })).toBe(true);
    const { trades } = runBacktest(c, rules);
    expect(trades.length).toBe(1);
    const t = trades[0];
    expect(t.entry).toBe(106); // giá mở nến 31
    expect(t.sl).toBeCloseTo(103.88, 6);
    expect(t.tp).toBeCloseTo(110.24, 6);
    expect(t.reason).toBe("Chốt lời");
    expect(t.r).toBeCloseTo(2, 9);
  });
  it("cắt lỗ trước khi 1 nến chạm cả hai + phí trừ vào R", () => {
    const c = [...flat, bar(30, 100, 106, 100, 105), bar(31, 106, 112, 100, 106)];
    const t0 = runBacktest(c, rules).trades[0];
    expect(t0.reason).toBe("Cắt lỗ");
    expect(t0.r).toBeCloseTo(-1, 9);
    const t1 = runBacktest(c, { ...rules, feePct: 0.1 }).trades[0];
    expect(t1.r).toBeLessThan(-1); // phí làm lỗ hơn 1R
  });
  it("chỉ Bán: không vào lệnh Mua; không có điều kiện → không có lệnh", () => {
    const c = [...flat, bar(30, 100, 106, 100, 105), bar(31, 106, 107, 105, 107)];
    expect(runBacktest(c, { ...rules, dir: "sell" }).trades.length).toBe(0);
    expect(runBacktest(c, { ...rules, conds: [] }).trades.length).toBe(0);
  });
  it("gộp nhiều mã: rủi ro cố định, sụt vốn, theo tháng / theo mã", () => {
    const T = (sym, r, t) => ({ r, entryTime: t - 1, exitTime: t });
    const ag = aggregate({ BTC: [T("BTC", 2, 100), T("BTC", -1, 300)], ETH: [T("ETH", -1, 200)] }, { balance0: 1000, riskPct: 1 });
    expect([ag.n, ag.win, Math.round(ag.winRate), ag.sumR]).toEqual([3, 1, 33, 0]);
    expect(ag.pnl).toBeCloseTo(0, 9);
    expect(ag.maxDD).toBeCloseTo((20 / 1020) * 100, 6);
    expect(ag.sym.BTC.sumR).toBe(1);
    expect(ag.months).toBe(1);
  });
});
