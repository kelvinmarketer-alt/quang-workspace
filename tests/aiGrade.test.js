import { describe, it, expect } from "vitest";
import { gradeBars, gradeSummary } from "../src/lib/aiGrade.js";

const b = (high, low, close = (high + low) / 2, time = 1) => ({ time, high, low, close });
const short = { side: "SHORT", entry: 100, sl: 105, tp: 90 };

describe("gradeBars — chỉ tính khi đã khớp entry (11/11)", () => {
  it("chạm TP trước khi về entry → Không khớp, không tính đúng", () => {
    const g = gradeBars(short, [b(98, 95), b(96, 89)]);
    expect(g.outcome).toBe("miss"); expect(g.via).toBe("tp");
  });
  it("khớp rồi mới chạm TP → đúng", () => {
    expect(gradeBars(short, [b(101, 97), b(96, 89)]).outcome).toBe("tp");
  });
  it("nến khớp đồng thời chạm TP → chưa tính TP ở nến đó", () => {
    expect(gradeBars(short, [b(101, 89)]).outcome).toBe("open");
  });
  it("nến khớp chạm luôn SL → sai", () => {
    expect(gradeBars(short, [b(106, 99)]).outcome).toBe("sl");
  });
  it("chưa khớp → không có R tạm", () => {
    const g = gradeBars(short, [b(98, 95)]);
    expect(g.outcome).toBe("open"); expect(g.r).toBe(null);
  });
  it("tổng hợp bỏ 'Không khớp' khỏi tỉ lệ đúng", () => {
    const recs = [{ id: 1, side: "SHORT" }, { id: 2, side: "SHORT" }];
    const s = gradeSummary(recs, { 1: { outcome: "miss" }, 2: { outcome: "tp", r: 2 } });
    expect(s).toMatchObject({ ok: 1, miss: 1, winRate: 100 });
  });
});
