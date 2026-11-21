// Bot thật — lãi 1/3 đã chốt của 1 vị thế SW3, ĐÃ TRỪ PHÍ (21/11/2026, sếp: "trừ luôn phí vào lãi đã chốt với sàn").
// Nguồn ưu tiên: khớp lệnh thật trên sàn (hàm qws-binance action "botFills" → /fapi/v1/userTrades): lãi sàn ghi + phí sàn thu.
//   • phí lệnh ĐÓNG (chốt 1/3) tính hết cho phần đã chốt; phí lệnh VÀO chia theo tỷ lệ khối lượng (1/3 đã chốt ↔ 2/3 còn lại)
//   • 2/3 còn lại = lãi/lỗ đang chạy − phần phí vào lệnh của nó → tổng lệnh = đúng con số bot sẽ ghi vào lịch sử (trừ phí đóng 2/3)
// Không lấy được số sàn (thành viên chỉ xem / hàm lỗi) → ước tính từ sự kiện "Chốt 1/3" của bot với phí lệnh chờ 0,02% mỗi chiều.
export const EST_FEE = 0.0002;
const STABLE = new Set(["USDT", "USDC", "FDUSD", "BUSD"]);

export function feeUsd(f, bnbPx) {
  if (!f.fee) return 0;
  if (!f.feeAsset || STABLE.has(f.feeAsset)) return f.fee;
  if (f.feeAsset === "BNB") return bnbPx ? f.fee * bnbPx : null;
  return null; // đồng phí lạ → không đoán
}

// a: vị thế trong status.active · fills: [{side,qty,price,pnl,fee,feeAsset}] · uPnl: lãi/lỗ đang chạy · ev: sự kiện partial (dự phòng)
// → null (chưa chốt 1/3) | { part, rest, total, fees, src: "san"|"uoc"|"demo"|"cho" }
export function bookedPart(a, { fills, bnbPx, uPnl, ev } = {}) {
  if (!a?.partDone || a.stage !== "open") return null;
  const u = Number.isFinite(uPnl) ? uPnl : null;
  if (Array.isArray(fills) && fills.length) {
    const inSide = a.side === 1 ? "BUY" : "SELL";
    let inQty = 0, inFee = 0, outQty = 0, outFee = 0, real = 0, bad = false;
    for (const f of fills) {
      const fu = feeUsd(f, bnbPx); if (fu == null) bad = true;
      if (f.side === inSide) { inQty += f.qty; inFee += fu || 0; } else { outQty += f.qty; outFee += fu || 0; }
      real += f.pnl || 0;
    }
    if (!bad && outQty > 0 && inQty > 0) {
      const share = Math.min(1, outQty / inQty), fees = outFee + inFee * share;
      const part = real - fees, rest = u == null ? null : u - inFee * (1 - share);
      return { part, rest, total: rest == null ? null : part + rest, fees, src: "san" };
    }
  }
  if (a.adopt) return { part: 0, rest: u, total: u, fees: 0, src: "demo" }; // Demo chốt trước khi bot vào → bot không có phần chốt
  if (ev?.qty > 0 && ev?.price > 0) {
    const entry = Number(a.entry ?? a.lim), q = Number(a.filledQty || a.qty || 0);
    const fees = (entry + ev.price) * ev.qty * EST_FEE;
    const part = (ev.price - entry) * ev.qty * a.side - fees;
    const rest = u == null ? null : u - entry * Math.max(0, q - ev.qty) * EST_FEE;
    return { part, rest, total: rest == null ? null : part + rest, fees, src: "uoc" };
  }
  return { part: null, rest: u, total: null, fees: null, src: "cho" }; // đã chốt nhưng chưa có số → vẫn hiện "đã chốt 1/3"
}
