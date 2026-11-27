// Tua lại nến + tự trade (27/11, sếp: "công cụ backtest trade") — lõi tính toán thuần (không React), có kiểm thử.
// Phiên: nến lịch sử `all`, chỉ hiện tới chỉ số `idx`; mỗi bước lộ thêm 1 nến → khớp lệnh chờ, kiểm tra cắt lỗ / chốt lời.
// Quy ước thận trọng: 1 nến chạm cả cắt lỗ lẫn chốt lời → tính CẮT LỖ trước. Nến mở vượt qua mức (gap) → khớp ở giá mở.
// Rủi ro mỗi lệnh = riskPct % số dư lúc vào lệnh; khối lượng = rủi ro / khoảng cắt lỗ; phí mỗi chiều feePct % giá trị lệnh.

export const DEF = { balance: 1000, riskPct: 1, feePct: 0.04 };

export function newSession({ all, idx, sym, tf, market, balance = DEF.balance, riskPct = DEF.riskPct, feePct = DEF.feePct }) {
  return { id: `rp_${Date.now().toString(36)}`, sym, tf, market, all, idx, start: idx, balance0: balance, balance, riskPct, feePct, pos: null, pending: null, trades: [], at: Date.now() };
}

// Kiểm tra lệnh trước khi đặt: side 1 = Mua, -1 = Bán. Trả chuỗi lỗi hoặc ""
export function checkOrder({ side, entry, sl, tp }) {
  if (!(entry > 0) || !(sl > 0)) return "Thiếu giá vào hoặc giá cắt lỗ";
  if (side === 1 && sl >= entry) return "Lệnh Mua: cắt lỗ phải thấp hơn giá vào";
  if (side === -1 && sl <= entry) return "Lệnh Bán: cắt lỗ phải cao hơn giá vào";
  if (tp != null && tp > 0 && (side === 1 ? tp <= entry : tp >= entry)) return side === 1 ? "Lệnh Mua: chốt lời phải cao hơn giá vào" : "Lệnh Bán: chốt lời phải thấp hơn giá vào";
  return "";
}

const openPos = (s, { side, entry, sl, tp }, i) => {
  const riskUsd = (s.balance * s.riskPct) / 100, qty = riskUsd / Math.abs(entry - sl);
  return { side, entry, sl, tp: tp > 0 ? tp : null, riskUsd, qty, openIdx: i, openTime: s.all[i].time };
};

// Vào lệnh: kind "market" = khớp ngay giá đóng nến đang xem; "limit" = lệnh chờ ở giá entry
export function placeOrder(s, o) {
  if (s.pos || s.pending) return { s, err: "Đang có lệnh — đóng hoặc huỷ trước khi vào lệnh mới" };
  const c = s.all[s.idx];
  const entry = o.kind === "market" ? c.close : o.entry;
  const err = checkOrder({ ...o, entry });
  if (err) return { s, err };
  if (o.kind === "market") return { s: { ...s, pos: openPos(s, { ...o, entry }, s.idx) }, err: "" };
  return { s: { ...s, pending: { side: o.side, entry, sl: o.sl, tp: o.tp > 0 ? o.tp : null, at: s.idx } }, err: "" };
}

function closeTrade(s, exit, i, reason) {
  const p = s.pos, gross = (exit - p.entry) * p.side * p.qty, fee = (p.entry + exit) * p.qty * (s.feePct / 100);
  const pnl = gross - fee, r = p.riskUsd ? pnl / p.riskUsd : 0;
  const t = { side: p.side, entry: p.entry, sl: p.sl, tp: p.tp, exit, openTime: p.openTime, closeTime: s.all[i].time, bars: i - p.openIdx, pnl, r, reason, balAfter: s.balance + pnl };
  return { ...s, balance: s.balance + pnl, pos: null, trades: [...s.trades, t] };
}

// Đóng lệnh tay ở giá đóng nến đang xem
export const closeNow = (s) => (s.pos ? closeTrade(s, s.all[s.idx].close, s.idx, "Đóng tay") : s);
export const cancelPending = (s) => ({ ...s, pending: null });
// Sửa cắt lỗ / chốt lời lệnh đang mở (khối lượng giữ nguyên như lúc vào)
export function moveStops(s, { sl, tp }) {
  if (!s.pos) return { s, err: "" };
  const p = s.pos, nsl = sl > 0 ? sl : p.sl, ntp = tp === null ? null : tp > 0 ? tp : p.tp;
  const c = s.all[s.idx].close;
  if (p.side === 1 ? nsl >= c : nsl <= c) return { s, err: "Cắt lỗ đã nằm bên kia giá hiện tại" };
  if (ntp != null && (p.side === 1 ? ntp <= c : ntp >= c)) return { s, err: "Chốt lời đã nằm bên kia giá hiện tại" };
  return { s: { ...s, pos: { ...p, sl: nsl, tp: ntp } }, err: "" };
}

// Lộ thêm 1 nến: khớp lệnh chờ → kiểm tra cắt lỗ / chốt lời trên chính nến đó
export function step(s) {
  if (s.idx >= s.all.length - 1) return s;
  const i = s.idx + 1, c = s.all[i];
  let n = { ...s, idx: i };
  if (n.pending) {
    const p = n.pending, hit = p.side === 1 ? c.low <= p.entry : c.high >= p.entry;
    if (hit) {
      const fill = p.side === 1 ? Math.min(c.open, p.entry) : Math.max(c.open, p.entry); // mở vượt qua giá chờ → khớp giá mở (tốt hơn)
      n = { ...n, pending: null, pos: openPos(n, { ...p, entry: fill }, i) };
    }
  }
  if (n.pos) {
    const p = n.pos;
    const slHit = p.side === 1 ? c.low <= p.sl : c.high >= p.sl;
    const tpHit = p.tp != null && (p.side === 1 ? c.high >= p.tp : c.low <= p.tp);
    const fresh = p.openIdx === i; // vừa khớp trong nến này: chỉ xét phần sau khi khớp → không dùng giá mở để tính gap
    if (slHit) n = closeTrade(n, !fresh && (p.side === 1 ? c.open < p.sl : c.open > p.sl) ? c.open : p.sl, i, "Cắt lỗ");
    else if (tpHit) n = closeTrade(n, !fresh && (p.side === 1 ? c.open > p.tp : c.open < p.tp) ? c.open : p.tp, i, "Chốt lời");
  }
  return n;
}

// Lãi/lỗ tạm tính của lệnh đang mở theo giá đóng nến đang xem
export function openPnl(s) {
  if (!s.pos) return null;
  const p = s.pos, c = s.all[s.idx].close, pnl = (c - p.entry) * p.side * p.qty;
  return { pnl, r: p.riskUsd ? pnl / p.riskUsd : 0 };
}

// Thống kê phiên: số lệnh, tỉ lệ thắng, R trung bình/tổng, hệ số lợi nhuận, sụt vốn lớn nhất (%), đường vốn
export function stats(trades, balance0) {
  const n = trades.length, wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
  const gw = wins.reduce((a, t) => a + t.pnl, 0), gl = -losses.reduce((a, t) => a + t.pnl, 0);
  let peak = balance0, dd = 0, bal = balance0;
  const curve = [balance0];
  for (const t of trades) { bal += t.pnl; curve.push(bal); peak = Math.max(peak, bal); dd = Math.max(dd, peak ? ((peak - bal) / peak) * 100 : 0); }
  const sumR = trades.reduce((a, t) => a + t.r, 0);
  return {
    n, win: wins.length, loss: losses.length, winRate: n ? (wins.length / n) * 100 : 0,
    sumR, avgR: n ? sumR / n : 0, pnl: bal - balance0, pnlPct: balance0 ? ((bal - balance0) / balance0) * 100 : 0,
    pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0, maxDD: dd, curve,
    best: n ? Math.max(...trades.map((t) => t.r)) : 0, worst: n ? Math.min(...trades.map((t) => t.r)) : 0,
  };
}

// Bản gọn để lưu cloud (settings.replaySessions)
export function summary(s) {
  const st = stats(s.trades, s.balance0);
  return {
    id: s.id, sym: s.sym, tf: s.tf, market: s.market, from: s.all[s.start]?.time, to: s.all[s.idx]?.time, bars: s.idx - s.start,
    balance0: s.balance0, riskPct: s.riskPct, n: st.n, win: st.win, winRate: st.winRate, sumR: st.sumR, pnl: st.pnl, pnlPct: st.pnlPct, maxDD: st.maxDD, pf: isFinite(st.pf) ? st.pf : null,
    trades: s.trades.slice(-200).map((t) => ({ s: t.side, e: t.entry, x: t.exit, o: t.openTime, c: t.closeTime, r: Math.round(t.r * 100) / 100, why: t.reason })),
    at: Date.now(),
  };
}
