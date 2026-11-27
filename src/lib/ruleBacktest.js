// Backtest theo LUẬT tự động (27/11, sếp: "làm cả hai" — kiểu 2): chọn điều kiện vào lệnh (tất cả phải đúng),
// cách cắt lỗ / chốt lời, chạy trên lịch sử nhiều mã → kết quả theo R, theo mã, theo tháng, đường vốn.
// Quy ước: tín hiệu xét ở nến ĐÃ ĐÓNG i → vào lệnh giá MỞ nến i+1 (không nhìn trước). Mỗi mã 1 lệnh một lúc.
// 1 nến chạm cả cắt lỗ lẫn chốt lời → tính cắt lỗ. Mở vượt qua mức (gap) → thoát giá mở. Phí trừ thẳng vào R.
// Thuần (không React) — có kiểm thử ở tests/ruleBacktest.test.js.
import { ema, rsi, macd, atr } from "./ta.js";

// Điều kiện: [khoá] → { tên, tham số mặc định, mô tả cho Mua, cho Bán }. Bán = gương của Mua.
export const CONDS = {
  ema_cross: { label: "EMA nhanh cắt EMA chậm", params: { fast: 20, slow: 50 }, buy: (p) => `EMA${p.fast} cắt lên EMA${p.slow}`, sell: (p) => `EMA${p.fast} cắt xuống EMA${p.slow}` },
  price_ema: { label: "Giá so với EMA (lọc xu hướng)", params: { n: 200 }, buy: (p) => `Giá đóng trên EMA${p.n}`, sell: (p) => `Giá đóng dưới EMA${p.n}` },
  breakout: { label: "Phá đỉnh / thủng đáy N nến", params: { n: 20 }, buy: (p) => `Đóng cửa vượt đỉnh ${p.n} nến trước`, sell: (p) => `Đóng cửa thủng đáy ${p.n} nến trước` },
  rsi: { label: "RSI quay lại từ vùng quá bán / quá mua", params: { n: 14, lo: 30, hi: 70 }, buy: (p) => `RSI${p.n} cắt lên ${p.lo}`, sell: (p) => `RSI${p.n} cắt xuống ${p.hi}` },
  macd: { label: "MACD cắt đường tín hiệu", params: {}, buy: () => "MACD cắt lên đường tín hiệu", sell: () => "MACD cắt xuống đường tín hiệu" },
  vol: { label: "Khối lượng lớn", params: { n: 20, k: 1.5 }, buy: (p) => `Khối lượng ≥ ${p.k}× TB ${p.n} nến`, sell: (p) => `Khối lượng ≥ ${p.k}× TB ${p.n} nến` },
};

export const DEF_RULES = {
  dir: "both", // "buy" | "sell" | "both"
  conds: [{ k: "breakout", p: { n: 20 } }, { k: "price_ema", p: { n: 200 } }, { k: "vol", p: { n: 20, k: 1.5 } }],
  slType: "atr", slAtr: 2, slPct: 2, // cắt lỗ: k × ATR14 hoặc % giá vào
  tpR: 2, // chốt lời = k × khoảng cắt lỗ (0 = không đặt)
  exitOpp: false, // có tín hiệu ngược → thoát ở giá đóng
  maxBars: 0, // giữ tối đa N nến (0 = không giới hạn)
  feePct: 0.04,
};

// Chuẩn bị chuỗi chỉ báo cần cho bộ điều kiện
function prep(c, conds) {
  const cl = c.map((x) => x.close), E = {}, S = { atr: atr(c, 14) };
  const e = (n) => (E[n] ||= ema(cl, n));
  for (const { k, p } of conds) {
    if (k === "ema_cross") { e(p.fast); e(p.slow); }
    if (k === "price_ema") e(p.n);
    if (k === "rsi") S[`rsi${p.n}`] ||= rsi(cl, p.n);
    if (k === "macd") S.macd ||= macd(cl);
  }
  return { E, S };
}
// Điều kiện đúng ở nến i (đã đóng) cho phía side (1 Mua, -1 Bán)? null = chưa đủ dữ liệu
function condAt(c, i, side, { k, p }, { E, S }) {
  const x = c[i];
  if (k === "ema_cross") { const f = E[p.fast], s = E[p.slow]; if (f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return null; return side === 1 ? f[i - 1] <= s[i - 1] && f[i] > s[i] : f[i - 1] >= s[i - 1] && f[i] < s[i]; }
  if (k === "price_ema") { const v = E[p.n][i]; if (v == null) return null; return side === 1 ? x.close > v : x.close < v; }
  if (k === "breakout") { if (i < p.n) return null; let hi = -Infinity, lo = Infinity; for (let j = i - p.n; j < i; j++) { hi = Math.max(hi, c[j].high); lo = Math.min(lo, c[j].low); } return side === 1 ? x.close > hi : x.close < lo; }
  if (k === "rsi") { const r = S[`rsi${p.n}`]; if (r[i] == null || r[i - 1] == null) return null; return side === 1 ? r[i - 1] < p.lo && r[i] >= p.lo : r[i - 1] > p.hi && r[i] <= p.hi; }
  if (k === "macd") { const { line, signal } = S.macd; if (line[i] == null || signal[i] == null || line[i - 1] == null || signal[i - 1] == null) return null; return side === 1 ? line[i - 1] <= signal[i - 1] && line[i] > signal[i] : line[i - 1] >= signal[i - 1] && line[i] < signal[i]; }
  if (k === "vol") { if (i < p.n) return null; let s = 0; for (let j = i - p.n; j < i; j++) s += c[j].volume || 0; return (x.volume || 0) >= p.k * (s / p.n); }
  return false;
}
export const signalAt = (c, i, side, rules, ind) => rules.conds.length > 0 && rules.conds.every((cd) => condAt(c, i, side, cd, ind) === true);

// Chạy 1 mã. Trả danh sách lệnh { side, entryTime, entry, sl, tp, exitTime, exit, r, reason, bars }
export function runBacktest(c, rules = DEF_RULES) {
  const ind = prep(c, rules.conds), A = ind.S.atr, trades = [];
  const sides = rules.dir === "buy" ? [1] : rules.dir === "sell" ? [-1] : [1, -1];
  let pos = null;
  const close = (j, exit, reason) => {
    const d = Math.abs(pos.entry - pos.sl), gross = ((exit - pos.entry) * pos.side) / d, fee = ((pos.entry + exit) * (rules.feePct / 100)) / d;
    trades.push({ side: pos.side, entryTime: c[pos.i].time, entry: pos.entry, sl: pos.sl, tp: pos.tp, exitTime: c[j].time, exit, r: gross - fee, reason, bars: j - pos.i });
    pos = null;
  };
  for (let i = 1; i < c.length; i++) {
    const x = c[i];
    if (pos) { // kiểm tra trên nến i (nến vào lệnh cũng tính, vì vào ở giá mở)
      const slHit = pos.side === 1 ? x.low <= pos.sl : x.high >= pos.sl;
      const tpHit = pos.tp != null && (pos.side === 1 ? x.high >= pos.tp : x.low <= pos.tp);
      const fresh = pos.i === i;
      if (slHit) close(i, !fresh && (pos.side === 1 ? x.open < pos.sl : x.open > pos.sl) ? x.open : pos.sl, "Cắt lỗ");
      else if (tpHit) close(i, !fresh && (pos.side === 1 ? x.open > pos.tp : x.open < pos.tp) ? x.open : pos.tp, "Chốt lời");
      else if (rules.exitOpp && signalAt(c, i, -pos.side, rules, ind)) close(i, x.close, "Tín hiệu ngược");
      else if (rules.maxBars > 0 && i - pos.i + 1 >= rules.maxBars) close(i, x.close, "Hết thời gian giữ");
    }
    if (!pos && i < c.length - 1) { // tín hiệu ở nến i đã đóng → vào giá mở nến i+1
      for (const side of sides) {
        if (!signalAt(c, i, side, rules, ind)) continue;
        const entry = c[i + 1].open, dist = rules.slType === "pct" ? entry * (rules.slPct / 100) : (A[i] || 0) * rules.slAtr;
        if (!(dist > 0)) break;
        pos = { side, i: i + 1, entry, sl: entry - side * dist, tp: rules.tpR > 0 ? entry + side * dist * rules.tpR : null };
        break;
      }
    }
  }
  return { trades, open: pos ? { side: pos.side, entry: pos.entry, sl: pos.sl, tp: pos.tp, entryTime: c[pos.i]?.time } : null };
}

// Gộp kết quả nhiều mã: rủi ro cố định riskPct % vốn ban đầu mỗi lệnh (không lãi kép) → dễ so sánh giữa các luật
export function aggregate(bySym, { balance0 = 1000, riskPct = 1 } = {}) {
  const all = Object.entries(bySym).flatMap(([sym, ts]) => ts.map((t) => ({ ...t, sym }))).sort((a, b) => a.exitTime - b.exitTime);
  const riskUsd = (balance0 * riskPct) / 100, n = all.length;
  let bal = balance0, peak = balance0, dd = 0;
  const curve = [{ t: all[0]?.entryTime ?? 0, v: balance0 }];
  for (const t of all) { bal += t.r * riskUsd; peak = Math.max(peak, bal); dd = Math.max(dd, peak ? ((peak - bal) / peak) * 100 : 0); curve.push({ t: t.exitTime, v: bal }); }
  const wins = all.filter((t) => t.r > 0), gw = wins.reduce((a, t) => a + t.r, 0), gl = -all.filter((t) => t.r <= 0).reduce((a, t) => a + t.r, 0);
  const sumR = all.reduce((a, t) => a + t.r, 0);
  const month = {};
  for (const t of all) { const d = new Date((t.exitTime + 7 * 3600) * 1000), k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; (month[k] ||= { n: 0, r: 0, win: 0 }); month[k].n++; month[k].r += t.r; if (t.r > 0) month[k].win++; }
  const sym = Object.fromEntries(Object.entries(bySym).map(([s, ts]) => { const r = ts.reduce((a, t) => a + t.r, 0), w = ts.filter((t) => t.r > 0).length; return [s, { n: ts.length, win: w, winRate: ts.length ? (w / ts.length) * 100 : 0, sumR: r, avgR: ts.length ? r / ts.length : 0 }]; }));
  return {
    n, win: wins.length, winRate: n ? (wins.length / n) * 100 : 0, sumR, avgR: n ? sumR / n : 0,
    pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0, maxDD: dd, pnl: bal - balance0, pnlPct: ((bal - balance0) / balance0) * 100,
    curve, month, sym, trades: all,
    posMonths: Object.values(month).filter((m) => m.r > 0).length, months: Object.keys(month).length,
  };
}
