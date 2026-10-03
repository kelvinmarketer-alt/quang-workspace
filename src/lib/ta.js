// Phân tích kỹ thuật chạy NGAY TRONG APP (không tốn tiền AI):
// nến Binance → EMA/RSI/MACD/ATR, khối lượng (delta mua/bán), cấu trúc SMC (swing HH/HL, BOS/CHoCH,
// order block, FVG, thanh khoản), premium/discount, mẫu nến price action. Kết quả gọn để gửi AI.

export const TF = { "1h": { api: "1h", htf: "4h", label: "1H" }, "4h": { api: "4h", htf: "1d", label: "4H" }, "1d": { api: "1d", htf: "1w", label: "1D" }, "1w": { api: "1w", htf: "1M", label: "1W" } };

const rp = (x) => (x == null || !isFinite(x) ? null : Number(Number(x).toPrecision(6)));

// Nến Binance: [openTime, open, high, low, close, volume, closeTime, quoteVol, trades, takerBuyBase, ...]
export async function fetchKlines(symbol, interval, limit = 300) {
  const pair = (symbol || "").toUpperCase().replace(/USDT$/, "") + "USDT";
  const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
  if (!r.ok) throw new Error(r.status === 400 ? `Không tìm thấy cặp ${pair} trên Binance` : `Binance lỗi ${r.status}`);
  const data = await r.json();
  return data.map((k) => {
    const volume = +k[5], buy = +k[9];
    return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume, buy, sell: Math.max(0, volume - buy) };
  });
}

export function ema(vals, p) {
  const out = new Array(vals.length).fill(null); const k = 2 / (p + 1); let prev = null;
  for (let i = 0; i < vals.length; i++) {
    if (i < p - 1) continue;
    if (prev == null) { prev = vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p; out[i] = prev; continue; }
    prev = vals[i] * k + prev * (1 - k); out[i] = prev;
  }
  return out;
}

export function rsi(closes, p = 14) {
  const out = new Array(closes.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= p) { g += up; l += dn; if (i === p) { g /= p; l /= p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null));
  const start = line.findIndex((v) => v != null);
  const sig = new Array(closes.length).fill(null);
  if (start >= 0) { const s = ema(line.slice(start), 9); s.forEach((v, j) => (sig[start + j] = v)); }
  return { line, signal: sig, hist: line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null)) };
}

export function atr(c, p = 14) {
  const out = new Array(c.length).fill(null); let prev = null;
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < p) continue;
    if (prev == null) { let s = 0; for (let j = i - p + 1; j <= i; j++) s += Math.max(c[j].high - c[j].low, Math.abs(c[j].high - c[j - 1].close), Math.abs(c[j].low - c[j - 1].close)); prev = s / p; }
    else prev = (prev * (p - 1) + tr) / p;
    out[i] = prev;
  }
  return out;
}

// Đỉnh/đáy swing (fractal N nến mỗi bên)
export function swings(c, n = 3) {
  const out = [];
  for (let i = n; i < c.length - n; i++) {
    let isH = true, isL = true;
    for (let j = i - n; j <= i + n; j++) { if (j === i) continue; if (c[j].high >= c[i].high) isH = false; if (c[j].low <= c[i].low) isL = false; }
    if (isH) out.push({ i, time: c[i].time, type: "H", price: c[i].high });
    if (isL) out.push({ i, time: c[i].time, type: "L", price: c[i].low });
  }
  return out;
}

// Cấu trúc thị trường: gắn nhãn HH/HL/LH/LL + sự kiện BOS/CHoCH (nến ĐÓNG CỬA phá swing đã xác nhận)
export function structure(c, sw, n = 3) {
  let lastH = null, lastL = null;
  for (const s of sw) {
    if (s.type === "H") { s.label = lastH ? (s.price > lastH.price ? "HH" : "LH") : "H"; lastH = s; }
    else { s.label = lastL ? (s.price > lastL.price ? "HL" : "LL") : "L"; lastL = s; }
  }
  let trend = 0, si = 0, refH = null, refL = null; const events = [];
  for (let i = 0; i < c.length; i++) {
    while (si < sw.length && sw[si].i + n <= i) { const s = sw[si++]; if (s.type === "H") refH = { ...s }; else refL = { ...s }; }
    if (refH && !refH.broken && c[i].close > refH.price) { refH.broken = true; events.push({ i, time: c[i].time, dir: "up", kind: trend === -1 ? "CHoCH" : "BOS", level: refH.price }); trend = 1; }
    if (refL && !refL.broken && c[i].close < refL.price) { refL.broken = true; events.push({ i, time: c[i].time, dir: "down", kind: trend === 1 ? "CHoCH" : "BOS", level: refL.price }); trend = -1; }
  }
  return { trend, events };
}

// Order block: nến NGƯỢC màu cuối cùng trước cú phá cấu trúc. Bỏ OB đã bị đóng cửa xuyên qua.
export function orderBlocks(c, events) {
  const out = [];
  for (const ev of events) {
    for (let j = ev.i - 1; j >= Math.max(0, ev.i - 25); j--) {
      const bear = c[j].close < c[j].open, bull = c[j].close > c[j].open;
      if ((ev.dir === "up" && bear) || (ev.dir === "down" && bull)) {
        const ob = { i: j, time: c[j].time, dir: ev.dir === "up" ? "bull" : "bear", top: c[j].high, bottom: c[j].low, from: ev.kind };
        let broken = false, tested = false;
        for (let k = ev.i + 1; k < c.length; k++) {
          if (ob.dir === "bull") { if (c[k].close < ob.bottom) { broken = true; break; } if (c[k].low <= ob.top) tested = true; }
          else { if (c[k].close > ob.top) { broken = true; break; } if (c[k].high >= ob.bottom) tested = true; }
        }
        if (!broken) out.push({ ...ob, status: tested ? "đã test" : "mới" });
        break;
      }
    }
  }
  return out;
}

// Fair value gap (khoảng trống 3 nến). Bỏ FVG đã lấp kín.
export function fvgs(c) {
  const out = [];
  for (let i = 2; i < c.length; i++) {
    let g = null;
    if (c[i - 2].high < c[i].low) g = { i, time: c[i].time, dir: "bull", bottom: c[i - 2].high, top: c[i].low };
    if (c[i - 2].low > c[i].high) g = { i, time: c[i].time, dir: "bear", top: c[i - 2].low, bottom: c[i].high };
    if (!g) continue;
    let filled = false, partial = false;
    for (let k = i + 1; k < c.length; k++) {
      if (g.dir === "bull") { if (c[k].low <= g.bottom) { filled = true; break; } if (c[k].low < g.top) partial = true; }
      else { if (c[k].high >= g.top) { filled = true; break; } if (c[k].high > g.bottom) partial = true; }
    }
    if (!filled) out.push({ ...g, status: partial ? "lấp 1 phần" : "chưa lấp" });
  }
  return out;
}

// Mẫu nến price action — CHỈ xét nến ĐÃ ĐÓNG (tài liệu EA: "chỉ khi đóng nến mới xác nhận tín hiệu")
export function candlePatterns(c) {
  const out = []; const L = c.length, lastClosed = L - 2;
  for (let i = Math.max(2, lastClosed - 2); i <= lastClosed; i++) {
    const x = c[i], p = c[i - 1], pp = c[i - 2], body = Math.abs(x.close - x.open), range = x.high - x.low || 1e-12;
    const up = x.high - Math.max(x.open, x.close), dn = Math.min(x.open, x.close) - x.low, ago = L - 1 - i;
    const volUp = x.volume > p.volume;
    if (x.close > x.open && p.close < p.open && x.close >= p.open && x.open <= p.close) out.push({ ago, name: `Bullish engulfing${volUp ? " + volume lớn hơn nến trước (chuẩn EA)" : " (volume chưa xác nhận)"}` });
    if (x.close < x.open && p.close > p.open && x.close <= p.open && x.open >= p.close) out.push({ ago, name: `Bearish engulfing${volUp ? " + volume lớn hơn nến trước (chuẩn EA)" : " (volume chưa xác nhận)"}` });
    if (dn > body * 2 && up < body * 0.6 && body / range < 0.4) out.push({ ago, name: "Pin bar đuôi dưới (từ chối giá thấp)" });
    if (up > body * 2 && dn < body * 0.6 && body / range < 0.4) out.push({ ago, name: "Pin bar đuôi trên (từ chối giá cao)" });
    if (body / range < 0.1) out.push({ ago, name: "Doji (lưỡng lự)" });
    if (body / range > 0.85) out.push({ ago, name: `Marubozu ${x.close > x.open ? "tăng" : "giảm"} (thân dài râu ngắn — nến xác nhận mạnh)` });
    if (x.high < p.high && x.low > p.low) out.push({ ago, name: "Inside bar (nén giá)" });
    // 3-Bar Reversal: nến 2 quét râu qua nến 1, nến 3 đóng vượt cả nến 1 & 2
    if (p.low < pp.low && x.close > Math.max(pp.high, p.high)) out.push({ ago, name: "3-Bar Reversal TĂNG (quét đáy rồi đóng vượt đỉnh 2 nến trước)" });
    if (p.high > pp.high && x.close < Math.min(pp.low, p.low)) out.push({ ago, name: "3-Bar Reversal GIẢM (quét đỉnh rồi đóng thủng đáy 2 nến trước)" });
    // Mother bar breakout: nến mẹ pp, nến con p nằm trong, nến x phá
    if (p.high <= pp.high && p.low >= pp.low) {
      if (pp.close < pp.open && x.close > pp.open) out.push({ ago, name: "Mother Bar Breakout TĂNG (đóng trên giá mở nến mẹ)" });
      if (pp.close > pp.open && x.close < pp.open) out.push({ ago, name: "Mother Bar Breakout GIẢM (đóng dưới giá mở nến mẹ)" });
    }
  }
  return out;
}

// ADX (Wilder) — sức mạnh xu hướng (tài liệu EA v17: ADX > 20 mới giao dịch)
export function adx(c, p = 14) {
  const L = c.length, out = new Array(L).fill(null);
  if (L < p * 2 + 2) return out;
  let trS = 0, pS = 0, mS = 0, a = null; const dx = [];
  for (let i = 1; i < L; i++) {
    const upM = c[i].high - c[i - 1].high, dnM = c[i - 1].low - c[i].low;
    const pdm = upM > dnM && upM > 0 ? upM : 0, mdm = dnM > upM && dnM > 0 ? dnM : 0;
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i <= p) { trS += tr; pS += pdm; mS += mdm; if (i < p) continue; }
    else { trS = trS - trS / p + tr; pS = pS - pS / p + pdm; mS = mS - mS / p + mdm; }
    const pdi = trS ? (100 * pS) / trS : 0, mdi = trS ? (100 * mS) / trS : 0;
    dx.push({ i, d: pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0, pdi, mdi });
  }
  for (let k = p - 1; k < dx.length; k++) {
    a = a == null ? dx.slice(0, p).reduce((s, x) => s + x.d, 0) / p : (a * (p - 1) + dx[k].d) / p;
    out[dx[k].i] = { adx: a, pdi: dx[k].pdi, mdi: dx[k].mdi };
  }
  return out;
}

// Pivot trái/phải khác nhau (Major pivot của EA: left 20, right 5)
function pivots(c, left, right) {
  const out = [];
  for (let i = left; i < c.length - right; i++) {
    let H = true, Lo = true;
    for (let j = i - left; j <= i + right; j++) { if (j === i) continue; if (c[j].high >= c[i].high) H = false; if (c[j].low <= c[i].low) Lo = false; }
    if (H) out.push({ i, type: "H", price: c[i].high });
    if (Lo) out.push({ i, type: "L", price: c[i].low });
  }
  return out;
}

// Protected High/Low: đáy tạo ra đỉnh cao nhất mới (uptrend) / đỉnh tạo ra đáy thấp nhất mới (downtrend). Thủng = xu hướng có thể kết thúc.
export function protectedLevels(c) {
  const pv = pivots(c, 20, 5);
  const lastH = [...pv].reverse().find((s) => s.type === "H"), lastL = [...pv].reverse().find((s) => s.type === "L");
  const pLow = lastH ? [...pv].reverse().find((s) => s.type === "L" && s.i < lastH.i) : null;
  const pHigh = lastL ? [...pv].reverse().find((s) => s.type === "H" && s.i < lastL.i) : null;
  return { protectedLow: pLow ? { price: pLow.price, i: pLow.i } : null, protectedHigh: pHigh ? { price: pHigh.price, i: pHigh.i } : null, majorHigh: lastH, majorLow: lastL };
}

// Key Volume ("dấu chân cá mập"): nến volume lớn nhất 100 nến + các nến volume > 2.5× TB100; xem đã retest / được BẢO VỆ (retest kèm volume lớn, đóng ngược lại) chưa
export function keyVolume(c) {
  const L = c.length, end = L - 1, start = Math.max(0, end - 100); // bỏ nến đang chạy
  const win = c.slice(start, end), avg = win.reduce((s, x) => s + x.volume, 0) / Math.max(1, win.length);
  const mk = (i) => {
    const x = c[i], dir = x.close >= x.open ? "tăng" : "giảm", top = x.high, bottom = x.low;
    let retest = 0, defended = false;
    for (let k = i + 2; k < end; k++) {
      if (c[k].low <= top && c[k].high >= bottom) {
        retest++;
        if (c[k].volume > avg * 1.5 && ((dir === "tăng" && c[k].close > (top + bottom) / 2) || (dir === "giảm" && c[k].close < (top + bottom) / 2))) defended = true;
      }
    }
    return { i, dir, top, bottom, bodyTop: Math.max(x.open, x.close), bodyBottom: Math.min(x.open, x.close), volX: x.volume / (avg || 1), retest, defended };
  };
  let maxI = start; for (let i = start; i < end; i++) if (c[i].volume > c[maxI].volume) maxI = i;
  const spikes = []; for (let i = start; i < end; i++) if (c[i].volume > avg * 2.5) spikes.push(i);
  return { max: L > 10 ? mk(maxI) : null, spikes: spikes.slice(-5).map(mk), avg100: avg };
}

// SFP (Swing Failure Pattern): râu chọc qua đỉnh/đáy swing cũ nhưng ĐÓNG CỬA quay lại bên trong (quét thanh khoản)
export function sfpSignals(c, sw, n = 3) {
  const out = [], L = c.length;
  for (let k = Math.max(1, L - 4); k <= L - 2; k++) {
    const prior = sw.filter((s) => s.i + n < k);
    const h = [...prior].reverse().find((s) => s.type === "H"), l = [...prior].reverse().find((s) => s.type === "L");
    const pv = c.slice(Math.max(0, k - 20), k), avgV = pv.reduce((s2, y) => s2 + y.volume, 0) / (pv.length || 1), volRel = c[k].volume / (avgV || 1);
    const valid = volRel >= 1.5 ? "HỢP LỆ (volume cao – SM tham gia)" : "YẾU (volume thấp – VSA: chưa coi là stop hunt)";
    if (h && c[k].high > h.price && c[k].close < h.price) out.push({ dir: "giảm (bearish SFP – quét đỉnh)", level: rp(h.price), barsAgo: L - 1 - k, wick: rp(c[k].high), volRel: rp(volRel), valid });
    if (l && c[k].low < l.price && c[k].close > l.price) out.push({ dir: "tăng (bullish SFP – quét đáy)", level: rp(l.price), barsAgo: L - 1 - k, wick: rp(c[k].low), volRel: rp(volRel), valid });
  }
  return out;
}

// Vùng nén / sideway (Darvas box 20 nến, biên độ < 2.5 ATR) + fakeout khỏi hộp
export function compression(c, atrNow) {
  const L = c.length, box = c.slice(Math.max(0, L - 21), L - 1);
  const hi = Math.max(...box.map((x) => x.high)), lo = Math.min(...box.map((x) => x.low));
  const sideway = hi - lo < atrNow * 2.5;
  const last = c[L - 2]; let fakeout = null;
  const prev = c.slice(Math.max(0, L - 22), L - 2), ph = Math.max(...prev.map((x) => x.high)), pl = Math.min(...prev.map((x) => x.low));
  if (last && last.low < pl && last.close > pl) fakeout = "quét đáy hộp rồi đóng lại vào trong (tín hiệu BUY theo EA)";
  if (last && last.high > ph && last.close < ph) fakeout = "quét đỉnh hộp rồi đóng lại vào trong (tín hiệu SELL theo EA)";
  return { sideway, boxHigh: hi, boxLow: lo, widthAtr: (hi - lo) / (atrNow || 1), fakeout };
}

// Volume Profile 100 nến × 50 ngăn: POC, HVN (>1.5×TB, vùng thanh khoản dày), LVN (<0.5×TB, giá trượt nhanh)
export function volumeProfile(c, lookback = 100, bins = 50) {
  const win = c.slice(Math.max(0, c.length - 1 - lookback), c.length - 1); if (win.length < 20) return null;
  const mx = Math.max(...win.map((x) => x.high)), mn = Math.min(...win.map((x) => x.low)), size = (mx - mn) / bins || 1e-12;
  const v = new Array(bins).fill(0);
  for (const x of win) {
    const a = Math.max(0, Math.floor((x.low - mn) / size)), b = Math.min(bins - 1, Math.floor((x.high - mn) / size)), share = x.volume / (b - a + 1);
    for (let k = a; k <= b; k++) v[k] += share;
  }
  const avg = v.reduce((s, x) => s + x, 0) / bins;
  const zones = (test) => { const z = []; let cur = null; v.forEach((val, k) => { if (test(val)) { if (!cur) cur = { from: k, to: k }; else cur.to = k; } else if (cur) { z.push(cur); cur = null; } }); if (cur) z.push(cur); return z.map((q) => ({ bottom: mn + q.from * size, top: mn + (q.to + 1) * size })); };
  const poc = v.indexOf(Math.max(...v));
  return { poc: mn + (poc + 0.5) * size, hvn: zones((x) => x > avg * 1.5), lvn: zones((x) => x < avg * 0.5) };
}

// VSA: phân loại 5 nến ĐÃ ĐÓNG gần nhất theo 4 yếu tố (Volume, Spread, Close, Bối cảnh)
export function vsaBars(c, e20, e50) {
  const L = c.length, out = [];
  for (let k = Math.max(12, L - 6); k <= L - 2; k++) {
    const x = c[k], prev = c.slice(Math.max(0, k - 20), k);
    const avgV = prev.reduce((s, y) => s + y.volume, 0) / (prev.length || 1), avgS = prev.reduce((s, y) => s + (y.high - y.low), 0) / (prev.length || 1);
    const range = x.high - x.low || 1e-12, volRel = x.volume / (avgV || 1), spreadRel = range / (avgS || 1e-12), closePos = (x.close - x.low) / range;
    const upBar = x.close > c[k - 1].close, upper = x.high - Math.max(x.open, x.close), lower = Math.min(x.open, x.close) - x.low;
    const trendUp = e20[k - 1] != null && e50[k - 1] != null && c[k - 1].close > e50[k - 1] && e20[k - 1] > (e20[k - 11] ?? e20[k - 1]);
    const trendDn = e20[k - 1] != null && e50[k - 1] != null && c[k - 1].close < e50[k - 1] && e20[k - 1] < (e20[k - 11] ?? e20[k - 1]);
    const hi10 = Math.max(...c.slice(k - 10, k).map((y) => y.high)), lo10 = Math.min(...c.slice(k - 10, k).map((y) => y.low));
    const lowerVolThan2 = x.volume < c[k - 1].volume && x.volume < c[k - 2].volume;
    const tags = [];
    if (trendUp && volRel >= 2 && (upper >= range * 0.45 || spreadRel < 0.8) && closePos < 0.6) tags.push("BUYING CLIMAX (cao trào mua – SM có thể đang bán)");
    if (trendDn && volRel >= 2 && (lower >= range * 0.45 || spreadRel < 0.8) && closePos > 0.4) tags.push("SELLING CLIMAX (cao trào bán – SM có thể đang gom)");
    if (x.high > hi10 && closePos < 0.35 && volRel >= 1.2) tags.push("UPTHRUST (phá đỉnh rồi đóng thấp – bẫy mua)");
    if (x.low < lo10 && closePos > 0.65 && volRel >= 1.2) tags.push("DOWNTHRUST / SPRING (phá đáy rồi đóng cao – bẫy bán)");
    if (upBar && spreadRel < 0.8 && lowerVolThan2) tags.push("NO DEMAND (tăng yếu, volume thấp – không có cầu)");
    if (!upBar && spreadRel < 0.8 && lowerVolThan2) tags.push("NO SUPPLY (giảm yếu, volume thấp – cung cạn)");
    if (volRel >= 1.8 && spreadRel < 0.8) tags.push("PHÂN KỲ: NỖ LỰC KHÔNG KẾT QUẢ (volume cao, biên độ hẹp – SM chặn đà/hấp thụ)");
    if (spreadRel > 1.3 && volRel < 0.8) tags.push("PHÂN KỲ: biên độ rộng nhưng volume thấp (thiếu thanh khoản – di chuyển không bền)");
    // Stopping volume dạng phân phối: 3 nến cùng chiều, volume tăng dần, biên độ ngắn dần (≈ nêm)
    const b1 = c[k - 2], b2 = c[k - 1], s = (y) => y.high - y.low;
    if (b1.volume < b2.volume && b2.volume < x.volume && s(b1) > s(b2) && s(b2) > s(x)) tags.push(upBar ? "STOPPING VOLUME khi tăng (vol tăng dần, biên độ ngắn dần – cảnh báo phân phối)" : "STOPPING VOLUME khi giảm (vol tăng dần, biên độ ngắn dần – cảnh báo gom hàng)");
    if (trendDn && !upBar && volRel >= 2 && closePos > 0.5) tags.push("STOPPING VOLUME (đỡ giá khi giảm)");
    if (upBar && spreadRel > 1.3 && closePos > 0.7 && volRel >= 1.5) tags.push("SOS – dấu hiệu sức mạnh (tăng rộng, close đỉnh, vol cao)");
    if (!upBar && spreadRel > 1.3 && closePos < 0.3 && volRel >= 1.5) tags.push("SOW – dấu hiệu yếu (giảm rộng, close đáy, vol cao)");
    if (!upBar && x.low < c[k - 1].low && closePos > 0.6 && volRel < 0.8) tags.push("TEST cung (thử đáy, volume thấp – tốt)");
    out.push({ barsAgo: L - 1 - k, dir: x.close >= x.open ? "tăng" : "giảm", volRel: rp(volRel), spreadRel: rp(spreadRel), close: closePos > 0.66 ? "đóng gần đỉnh" : closePos < 0.33 ? "đóng gần đáy" : "đóng giữa nến", tags });
  }
  return out;
}

// Phân kỳ VOLUME tại 2 đỉnh/đáy swing gần nhất (VSA: giá đỉnh cao hơn nhưng volume thấp hơn = lực mua yếu)
function volumeDivergence(c, sw) {
  const v = (i) => Math.max(c[i - 1]?.volume || 0, c[i].volume, c[i + 1]?.volume || 0);
  const hs = sw.filter((s) => s.type === "H").slice(-2), ls = sw.filter((s) => s.type === "L").slice(-2), out = [];
  if (hs.length === 2 && hs[1].price > hs[0].price && v(hs[1].i) < v(hs[0].i) * 0.85) out.push("Phân kỳ volume ÂM: đỉnh sau cao hơn nhưng volume thấp hơn → lực mua suy yếu, cẩn trọng breakout giả");
  if (ls.length === 2 && ls[1].price < ls[0].price && v(ls[1].i) < v(ls[0].i) * 0.85) out.push("Phân kỳ volume DƯƠNG: đáy sau thấp hơn nhưng volume thấp hơn → lực bán cạn dần");
  return out;
}

// Phân kỳ RSI giữa 2 đỉnh/đáy swing gần nhất
function divergence(sw, r) {
  const hs = sw.filter((s) => s.type === "H").slice(-2), ls = sw.filter((s) => s.type === "L").slice(-2);
  const out = [];
  if (hs.length === 2 && r[hs[0].i] != null && r[hs[1].i] != null && hs[1].price > hs[0].price && r[hs[1].i] < r[hs[0].i]) out.push("Phân kỳ âm RSI (giá đỉnh cao hơn, RSI thấp hơn)");
  if (ls.length === 2 && r[ls[0].i] != null && r[ls[1].i] != null && ls[1].price < ls[0].price && r[ls[1].i] > r[ls[0].i]) out.push("Phân kỳ dương RSI (giá đáy thấp hơn, RSI cao hơn)");
  return out;
}

// Tính tất cả → series cho biểu đồ + bản tóm tắt gọn cho AI
export function analyze(c) {
  const closes = c.map((x) => x.close), L = c.length, last = c[L - 1], price = last.close;
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes), m = macd(closes), a = atr(c);
  const sw = swings(c), st = structure(c, sw), obs = orderBlocks(c, st.events), gaps = fvgs(c);
  const atrNow = a[L - 1] || (last.high - last.low);
  // Bộ phát hiện theo tài liệu EA + VSA
  const e89 = ema(closes, 89), dmi = adx(c), prot = protectedLevels(c), kv = keyVolume(c), sfp = sfpSignals(c, sw), comp = compression(c, atrNow), vp = volumeProfile(c), vsa = vsaBars(c, e20, e50), volDiv = volumeDivergence(c, sw);
  const slope89 = e89[L - 2] && e89[L - 7] ? ((e89[L - 2] - e89[L - 7]) / e89[L - 7]) * 10000 : null;
  const adxNow = dmi[L - 2]?.adx;
  const nearZones = (arr, n = 3) => [...arr].sort((x, y) => Math.abs((x.top + x.bottom) / 2 - price) - Math.abs((y.top + y.bottom) / 2 - price)).slice(0, n).map((z) => ({ top: rp(z.top), bottom: rp(z.bottom), vsPrice: z.bottom > price ? "phía trên giá" : z.top < price ? "phía dưới giá" : "giá đang nằm trong" }));
  const kvOut = (k) => (k ? { dir: `nến ${k.dir}`, top: rp(k.top), bottom: rp(k.bottom), bodyTop: rp(k.bodyTop), bodyBottom: rp(k.bodyBottom), volX: rp(k.volX), barsAgo: ago(k.i), retests: k.retest, defended: k.defended } : null);
  const ago = (i) => L - 1 - i;

  // Khối lượng & delta mua/bán (taker buy)
  // Nến cuối của Binance là nến ĐANG CHẠY → so khối lượng trên nến đã đóng gần nhất (L-2)
  const vols = c.map((x) => x.volume), closed = c[L - 2] || last;
  const avg20 = vols.slice(-22, -2).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(20, L - 2));
  const last20 = c.slice(-20), buy20 = last20.reduce((s, x) => s + x.buy, 0), vol20 = last20.reduce((s, x) => s + x.volume, 0);
  const prev10 = vols.slice(-20, -10).reduce((s, v) => s + v, 0), recent10 = vols.slice(-10).reduce((s, v) => s + v, 0);
  const upVol = last20.filter((x) => x.close >= x.open).reduce((s, x) => s + x.volume, 0);
  const lastEv = st.events[st.events.length - 1];

  // Vùng giá: premium/discount theo biên 100 nến
  const win = c.slice(-100), hi = Math.max(...win.map((x) => x.high)), lo = Math.min(...win.map((x) => x.low));
  const pos = hi > lo ? (price - lo) / (hi - lo) : 0.5;

  // Thanh khoản: đỉnh/đáy bằng nhau chưa bị quét + đỉnh/đáy swing gần nhất phía trên/dưới
  const tol = atrNow * 0.15, recentSw = sw.slice(-14);
  const eqHighs = [], eqLows = [];
  for (let x = 0; x < recentSw.length; x++) for (let y = x + 1; y < recentSw.length; y++) {
    const s1 = recentSw[x], s2 = recentSw[y];
    if (s1.type !== s2.type || Math.abs(s1.price - s2.price) > tol) continue;
    const lvl = s1.type === "H" ? Math.max(s1.price, s2.price) : Math.min(s1.price, s2.price);
    const swept = c.slice(s2.i + 1).some((k) => (s1.type === "H" ? k.high > lvl : k.low < lvl));
    if (!swept) (s1.type === "H" ? eqHighs : eqLows).push(rp(lvl));
  }
  const highsAbove = sw.filter((s) => s.type === "H" && s.price > price && !c.slice(s.i + 1).some((k) => k.high > s.price)).map((s) => s.price).sort((x, y) => x - y);
  const lowsBelow = sw.filter((s) => s.type === "L" && s.price < price && !c.slice(s.i + 1).some((k) => k.low < s.price)).map((s) => s.price).sort((x, y) => y - x);

  const near = (arr) => arr.sort((x, y) => Math.abs((x.top + x.bottom) / 2 - price) - Math.abs((y.top + y.bottom) / 2 - price)).slice(0, 4);
  const crossAgo = (() => { for (let i = L - 1; i > L - 8 && i > 0; i--) { const h = m.hist[i], hp = m.hist[i - 1]; if (h != null && hp != null && Math.sign(h) !== Math.sign(hp)) return { ago: ago(i), dir: h > 0 ? "cắt lên" : "cắt xuống" }; } return null; })();

  const summary = {
    price: rp(price),
    candlesUsed: L,
    change20: rp(((price - c[Math.max(0, L - 21)].close) / c[Math.max(0, L - 21)].close) * 100),
    ema: { e20: rp(e20[L - 1]), e50: rp(e50[L - 1]), e200: rp(e200[L - 1]), stack: e20[L - 1] && e50[L - 1] ? (e20[L - 1] > e50[L - 1] && (!e200[L - 1] || e50[L - 1] > e200[L - 1]) ? "tăng (EMA20>50>200)" : e20[L - 1] < e50[L - 1] && (!e200[L - 1] || e50[L - 1] < e200[L - 1]) ? "giảm (EMA20<50<200)" : "đan xen") : "chưa đủ dữ liệu" },
    momentum: { rsi: rp(r[L - 1]), rsi5ago: rp(r[L - 6]), macdHist: rp(m.hist[L - 1]), macdHistPrev: rp(m.hist[L - 2]), macdCross: crossAgo, divergence: divergence(sw, r) },
    volatility: { atr: rp(atrNow), atrPct: rp((atrNow / price) * 100) },
    volume: { note: "nến cuối đang chạy; số liệu theo nến ĐÃ ĐÓNG gần nhất", lastClosed: rp(closed.volume), avg20: rp(avg20), relVolLastClosed: rp(closed.volume / (avg20 || 1)), trend10vs10: rp(recent10 / (prev10 || 1)), buyRatio20: rp(buy20 / (vol20 || 1)), upCandleVolShare20: rp(upVol / (vol20 || 1)), deltaLastClosed: rp(closed.buy - closed.sell), climax: closed.volume > avg20 * 2.5 },
    structure: {
      trend: st.trend === 1 ? "tăng" : st.trend === -1 ? "giảm" : "chưa rõ",
      lastEvent: lastEv ? { kind: lastEv.kind, dir: lastEv.dir === "up" ? "phá lên" : "phá xuống", level: rp(lastEv.level), barsAgo: ago(lastEv.i), relVolAtBreak: rp(c[lastEv.i].volume / (avg20 || 1)) } : null,
      recentEvents: st.events.slice(-4).map((e) => ({ kind: e.kind, dir: e.dir === "up" ? "lên" : "xuống", level: rp(e.level), barsAgo: ago(e.i) })),
      swings: sw.slice(-8).map((s) => ({ label: s.label, price: rp(s.price), barsAgo: ago(s.i) })),
    },
    orderBlocks: near(obs).map((o) => ({ dir: o.dir === "bull" ? "OB tăng (demand)" : "OB giảm (supply)", top: rp(o.top), bottom: rp(o.bottom), status: o.status, barsAgo: ago(o.i) })),
    fvg: near(gaps).map((g) => ({ dir: g.dir === "bull" ? "FVG tăng" : "FVG giảm", top: rp(g.top), bottom: rp(g.bottom), status: g.status, barsAgo: ago(g.i) })),
    liquidity: { equalHighs: eqHighs.slice(0, 3), equalLows: eqLows.slice(0, 3), nearestHighsAbove: highsAbove.slice(0, 3).map(rp), nearestLowsBelow: lowsBelow.slice(0, 3).map(rp) },
    range100: { high: rp(hi), low: rp(lo), equilibrium: rp((hi + lo) / 2), position: `${Math.round(pos * 100)}% (${pos > 0.55 ? "vùng premium – đắt" : pos < 0.45 ? "vùng discount – rẻ" : "quanh cân bằng"})` },
    patterns: candlePatterns(c),
    trendFilter: {
      ema200: rp(e200[L - 1]), priceVsEma200: e200[L - 1] ? (price > e200[L - 1] ? "trên EMA200 (chỉ ưu tiên BUY)" : "dưới EMA200 (chỉ ưu tiên SELL)") : "chưa đủ 200 nến",
      ema89SlopeBps: rp(slope89), ema89Flat: slope89 != null && Math.abs(slope89) <= 2,
      adx: rp(adxNow), adxOk: adxNow != null && adxNow > 20, diPlus: rp(dmi[L - 2]?.pdi), diMinus: rp(dmi[L - 2]?.mdi),
    },
    protected: {
      protectedLow: prot.protectedLow ? { price: rp(prot.protectedLow.price), barsAgo: ago(prot.protectedLow.i), broken: price < prot.protectedLow.price } : null,
      protectedHigh: prot.protectedHigh ? { price: rp(prot.protectedHigh.price), barsAgo: ago(prot.protectedHigh.i), broken: price > prot.protectedHigh.price } : null,
    },
    keyVolume: { maxVolume100: kvOut(kv.max), spikes: kv.spikes.map(kvOut) },
    sfp,
    sideway: { isSideway: comp.sideway || (adxNow != null && adxNow <= 20) || (slope89 != null && Math.abs(slope89) <= 2), boxHigh: rp(comp.boxHigh), boxLow: rp(comp.boxLow), widthAtr: rp(comp.widthAtr), fakeout: comp.fakeout },
    volumeProfile: vp ? { poc: rp(vp.poc), hvn: nearZones(vp.hvn), lvn: nearZones(vp.lvn) } : null,
    vsa: vsa.filter((b) => b.tags.length || b.barsAgo <= 2),
    volumeDivergence: volDiv,
  };

  return {
    summary,
    series: {
      e20: c.map((x, i) => (e20[i] != null ? { time: x.time, value: e20[i] } : null)).filter(Boolean),
      e50: c.map((x, i) => (e50[i] != null ? { time: x.time, value: e50[i] } : null)).filter(Boolean),
      events: st.events.slice(-6),
      levels: [
        kv.max && { price: kv.max.top, title: "KeyVol↑", color: "#eab308" }, kv.max && { price: kv.max.bottom, title: "KeyVol↓", color: "#eab308" },
        prot.protectedHigh && { price: prot.protectedHigh.price, title: "Protected H", color: "#fb7185" },
        prot.protectedLow && { price: prot.protectedLow.price, title: "Protected L", color: "#34d399" },
        vp && { price: vp.poc, title: "POC", color: "#94a3b8" },
      ].filter(Boolean),
    },
    rsiNow: r[L - 1],
  };
}

// Tóm tắt khung lớn (HTF) ngắn gọn để AI có bối cảnh đa khung
export function htfContext(c) {
  if (!c || c.length < 30) return null;
  const { summary } = analyze(c);
  return { price: summary.price, trend: summary.structure.trend, lastEvent: summary.structure.lastEvent, ema: summary.ema.stack, rsi: summary.momentum.rsi, range: summary.range100, orderBlocks: summary.orderBlocks.slice(0, 2), fvg: summary.fvg.slice(0, 2), liquidity: summary.liquidity };
}

// Nến gần nhất dạng gọn [o,h,l,c,v,buy%] để AI đọc price action
export function compactCandles(c, n = 40) {
  return c.slice(-n).map((x) => [rp(x.open), rp(x.high), rp(x.low), rp(x.close), rp(x.volume), x.volume ? Math.round((x.buy / x.volume) * 100) : null]);
}
