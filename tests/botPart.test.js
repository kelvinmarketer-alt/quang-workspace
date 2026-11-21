import { describe, it, expect } from "vitest";
import { bookedPart, feeUsd } from "../src/lib/botPart.js";

// lệnh BÁN XRP: vào 0,9159 × 212 (phí 0,0388$), chốt 1/3 70,7 ở 0,8806 (lãi sàn 2,4957$, phí 0,0125$)
const a = { stage: "open", partDone: true, side: -1, lim: 0.9159, filledQty: 212 };
const fills = [
  { side: "SELL", qty: 212, price: 0.9159, pnl: 0, fee: 0.0388, feeAsset: "USDT" },
  { side: "BUY", qty: 70.7, price: 0.8806, pnl: 2.4957, fee: 0.0125, feeAsset: "USDT" },
];

describe("lãi 1/3 đã chốt — trừ phí sàn", () => {
  it("số sàn: phí đóng + 1/3 phí vào trừ vào phần đã chốt, 2/3 phí vào trừ vào phần còn lại", () => {
    const r = bookedPart(a, { fills, uPnl: 1.9 });
    const share = 70.7 / 212;
    expect(r.src).toBe("san");
    expect(r.part).toBeCloseTo(2.4957 - 0.0125 - 0.0388 * share, 6);
    expect(r.rest).toBeCloseTo(1.9 - 0.0388 * (1 - share), 6);
    expect(r.total).toBeCloseTo(2.4957 + 1.9 - 0.0388 - 0.0125, 6); // = cách bot ghi lịch sử (lãi sàn − toàn bộ phí)
  });
  it("phí trả bằng BNB đổi ra USD; thiếu giá BNB thì không dùng số sàn", () => {
    const b = fills.map((f) => ({ ...f, fee: f.fee / 600, feeAsset: "BNB" }));
    expect(bookedPart(a, { fills: b, bnbPx: 600, uPnl: 1.9 }).part).toBeCloseTo(bookedPart(a, { fills, uPnl: 1.9 }).part, 6);
    expect(feeUsd(b[0], null)).toBe(null);
    expect(bookedPart(a, { fills: b, uPnl: 1.9 }).src).toBe("cho");
  });
  it("không có số sàn → ước tính từ sự kiện chốt 1/3, phí 0,02% mỗi chiều", () => {
    const r = bookedPart(a, { uPnl: 1.9, ev: { qty: 70.7, price: 0.8806 } });
    expect(r.src).toBe("uoc");
    expect(r.part).toBeCloseTo((0.9159 - 0.8806) * 70.7 - (0.9159 + 0.8806) * 70.7 * 0.0002, 6);
    expect(r.part).toBeLessThan(2.4957);
  });
  it("mọi lệnh đã chốt 1/3 đều có kết quả (kể cả chưa có số / lệnh theo Demo); chưa chốt → null", () => {
    expect(bookedPart(a, { uPnl: 1 }).src).toBe("cho");
    expect(bookedPart({ ...a, adopt: true }, { uPnl: 1 }).src).toBe("demo");
    expect(bookedPart({ ...a, partDone: false }, { fills, uPnl: 1 })).toBe(null);
    expect(bookedPart({ ...a, stage: "entry" }, { fills })).toBe(null);
  });
});
