import { describe, it, expect } from "vitest";
import { newSession, placeOrder, step, closeNow, stats, checkOrder, moveStops, summary } from "../src/lib/replay.js";

const bar = (time, open, high, low, close) => ({ time, open, high, low, close, volume: 1 });
const mk = (bars) => newSession({ all: bars, idx: 0, sym: "BTC", tf: "1h", market: "futures", balance: 1000, riskPct: 1, feePct: 0 });

describe("tua lại nến + tự trade (27/11)", () => {
  it("kiểm tra lệnh: cắt lỗ / chốt lời sai phía bị chặn", () => {
    expect(checkOrder({ side: 1, entry: 100, sl: 101 })).toMatch(/thấp hơn/);
    expect(checkOrder({ side: -1, entry: 100, sl: 99 })).toMatch(/cao hơn/);
    expect(checkOrder({ side: 1, entry: 100, sl: 95, tp: 99 })).toMatch(/chốt lời/);
    expect(checkOrder({ side: 1, entry: 100, sl: 95, tp: 110 })).toBe("");
  });
  it("Mua thị trường → chạm chốt lời 2R: lãi đúng 2% số dư", () => {
    let s = mk([bar(0, 100, 100, 100, 100), bar(1, 100, 104, 99, 103), bar(2, 103, 111, 102, 110)]);
    s = placeOrder(s, { kind: "market", side: 1, sl: 95, tp: 110 }).s;
    expect(s.pos.qty).toBeCloseTo(2, 9); // rủi ro 10$ / khoảng 5
    s = step(s); expect(s.pos).not.toBeNull();
    s = step(s);
    expect(s.pos).toBeNull();
    expect(s.trades[0].reason).toBe("Chốt lời");
    expect(s.trades[0].r).toBeCloseTo(2, 9);
    expect(s.balance).toBeCloseTo(1020, 9);
  });
  it("1 nến chạm cả cắt lỗ lẫn chốt lời → tính cắt lỗ (thận trọng)", () => {
    let s = mk([bar(0, 100, 100, 100, 100), bar(1, 100, 112, 94, 100)]);
    s = step(placeOrder(s, { kind: "market", side: 1, sl: 95, tp: 110 }).s);
    expect(s.trades[0].reason).toBe("Cắt lỗ");
    expect(s.trades[0].r).toBeCloseTo(-1, 9);
  });
  it("giá mở vượt qua cắt lỗ (gap) → thoát ở giá mở, lỗ hơn 1R", () => {
    let s = mk([bar(0, 100, 100, 100, 100), bar(1, 92, 93, 90, 91)]);
    s = step(placeOrder(s, { kind: "market", side: 1, sl: 95 }).s);
    expect(s.trades[0].exit).toBe(92);
    expect(s.trades[0].r).toBeCloseTo(-1.6, 9);
  });
  it("lệnh Bán chờ: khớp khi giá chạm, rồi chốt lời", () => {
    let s = mk([bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 106, 100, 105), bar(3, 105, 105, 94, 95)]);
    s = placeOrder(s, { kind: "limit", side: -1, entry: 105, sl: 110, tp: 95 }).s;
    s = step(s); expect(s.pending).not.toBeNull();
    s = step(s); expect(s.pos?.entry).toBe(105);
    s = step(s);
    expect(s.trades[0].r).toBeCloseTo(2, 9);
  });
  it("đóng tay + dời cắt lỗ + thống kê / bản lưu gọn", () => {
    let s = mk([bar(0, 100, 100, 100, 100), bar(1, 100, 103, 100, 102)]);
    s = placeOrder(s, { kind: "market", side: 1, sl: 95 }).s;
    s = step(s);
    expect(moveStops(s, { sl: 103 }).err).toMatch(/bên kia/);
    s = moveStops(s, { sl: 100 }).s; expect(s.pos.sl).toBe(100);
    s = closeNow(s);
    expect(s.trades[0].r).toBeCloseTo(0.4, 9);
    const st = stats([{ pnl: 20, r: 2 }, { pnl: -10, r: -1 }, { pnl: -10, r: -1 }], 1000);
    expect([st.n, st.win, Math.round(st.winRate), st.sumR, st.pf]).toEqual([3, 1, 33, 0, 1]);
    expect(st.maxDD).toBeCloseTo((20 / 1020) * 100, 6);
    const sm = summary(s);
    expect([sm.n, sm.trades.length, sm.bars]).toEqual([1, 1, 1]);
  });
});
