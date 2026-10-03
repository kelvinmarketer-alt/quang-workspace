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

// Mẫu nến price action ở 3 nến cuối
export function candlePatterns(c) {
  const out = []; const L = c.length;
  for (let i = Math.max(1, L - 3); i < L; i++) {
    const x = c[i], p = c[i - 1], body = Math.abs(x.close - x.open), range = x.high - x.low || 1e-12;
    const up = x.high - Math.max(x.open, x.close), dn = Math.min(x.open, x.close) - x.low, ago = L - 1 - i;
    if (x.close > x.open && p.close < p.open && x.close >= p.open && x.open <= p.close) out.push({ ago, name: "Bullish engulfing" });
    if (x.close < x.open && p.close > p.open && x.close <= p.open && x.open >= p.close) out.push({ ago, name: "Bearish engulfing" });
    if (dn > body * 2 && up < body * 0.6 && body / range < 0.4) out.push({ ago, name: "Pin bar đuôi dưới (từ chối giá thấp)" });
    if (up > body * 2 && dn < body * 0.6 && body / range < 0.4) out.push({ ago, name: "Pin bar đuôi trên (từ chối giá cao)" });
    if (body / range < 0.1) out.push({ ago, name: "Doji (lưỡng lự)" });
    if (x.high < p.high && x.low > p.low) out.push({ ago, name: "Inside bar (nén giá)" });
  }
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
  };

  return {
    summary,
    series: {
      e20: c.map((x, i) => (e20[i] != null ? { time: x.time, value: e20[i] } : null)).filter(Boolean),
      e50: c.map((x, i) => (e50[i] != null ? { time: x.time, value: e50[i] } : null)).filter(Boolean),
      events: st.events.slice(-6),
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
