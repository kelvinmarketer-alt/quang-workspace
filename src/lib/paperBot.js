// GIAO DỊCH DEMO TỰ ĐỘNG (giả lập Futures Binance) theo BỘ KIẾN THỨC của Quang (lib/tradeKnowledge.js).
// Luật CỐ ĐỊNH (deterministic): chạy lại bao nhiêu lần cũng ra cùng kết quả → đo được tỉ lệ thắng thật của phương pháp.
// Chỉ dùng NẾN ĐÃ ĐÓNG, vào lệnh ở giá mở nến kế tiếp, SL & TP chạm cùng nến → tính THUA, có phí + trượt giá.
// Phiên chạy từ ngày bắt đầu (lùi 1–2 tháng) tới hiện tại và tiếp tục mỗi khi có nến mới, cho tới khi chủ bấm Dừng.
// TỰ TỐI ƯU (walk-forward, không nhìn trước tương lai): mỗi tín hiệu được mô phỏng "bóng" với 6 cấu hình (R:R × dời hoà vốn);
// lúc có tín hiệu mới, bộ tối ưu CHỈ xét các lệnh bóng ĐÃ ĐÓNG trước thời điểm đó → chọn cấu hình kỳ vọng cao nhất,
// kỳ vọng âm thì bỏ tín hiệu. Chạy song song "Luật gốc" để so sánh bộ tối ưu giúp hay hại.

export const TFS = { "5m": { label: "M5", ms: 300000, htf: "1h" }, "15m": { label: "M15", ms: 900000, htf: "4h" }, "1h": { label: "H1", ms: 3600000, htf: "4h" }, "4h": { label: "H4", ms: 14400000, htf: "1d" }, "1d": { label: "D1", ms: 86400000 } };
export const SYMBOLS = { BTC: "BTCUSDT", ETH: "ETHUSDT", XAU: "XAUUSDT" };
export const SETUPS = {
  TREND: { label: "Thuận xu hướng (TREND_CONFIRM)", desc: "Giá trên/dưới EMA200 + EMA50 cùng hướng, ADX ≥ 20; hồi về EMA50 → nến tín hiệu (engulfing/nến lớn ≥0.8 ATR, volume > TB20) → nến xác nhận đóng vượt nến tín hiệu." },
  SFP: { label: "Quét thanh khoản (SFP)", desc: "Râu quét qua đỉnh/đáy swing (cao nhất/thấp nhất 20 nến) rồi đóng cửa quay lại, râu ≥40% thân nến, volume ≥ 1.5× TB20." },
  BREAKOUT: { label: "Breakout 2 nến (EA)", desc: "Nến thân dài (≥60% biên) + volume ≥1.5× TB20 đóng vượt đỉnh/đáy 20 nến, thuận EMA200; nến kế cùng màu đóng vượt nến phá vỡ mới vào." },
  SMC: { label: "Đảo chiều SMC (CHoCH → OB)", desc: "Cấu trúc đang giảm (tăng) bị phá bằng nến đóng vượt đỉnh (đáy) swing = CHoCH; chờ giá hồi về Order Block khởi nguồn + nến từ chối → vào." },
};

// Mặc định đề xuất cho vốn 1.000$
export const DEFAULT_CFG = {
  capital: 1000, riskPct: 1, maxOpen: 3, maxLev: 20, dailyStopPct: 3,
  rr: 2, beAtR: 1, timeStopBars: 96, feePct: 0.05, slipPct: 0.02, maxFeeR: 0.35, // bỏ lệnh khi phí 2 chiều > 0.35R (SL quá sát — phí ăn hết lợi thế)
  adaptive: true, warmupDays: 30, lookback: 20, minSample: 8, minExp: 0.05, // tự tối ưu: học thêm 30 ngày trước ngày bắt đầu, xét 20 lệnh gần nhất, cần ≥8 mẫu, kỳ vọng ≥ +0.05R mới vào
  htfFilter: true, // Đa khung (luật cốt lõi): chỉ đánh THUẬN xu hướng khung lớn (giá so EMA200 khung lớn: M5→H1, M15/H1→H4, H4→D1)
  coins: ["BTC", "ETH", "XAU"], tfs: ["5m", "15m", "1h", "4h"], setups: ["TREND", "SFP", "BREAKOUT", "SMC"],
};

// ---------------- Dữ liệu nến Futures (cache IndexedDB, chỉ tải phần mới) ----------------
const DB = "qws-paperbot", STORE = "klines";
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function idbGet(k) { try { const d = await idb(); return await new Promise((ok) => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); } catch { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise((ok) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch { /* bỏ qua */ } }

// mảng nến: [openTime, open, high, low, close, volume] — chỉ nến ĐÃ ĐÓNG
const MEM = new Map();
async function getJson(url, tries = 4) {
  const r = await fetch(url);
  if (r.status === 429 || r.status === 418) { // Binance giới hạn tần suất → chờ rồi thử lại
    if (tries <= 1) throw new Error("Binance đang giới hạn tần suất, thử lại sau 1 phút");
    await new Promise((ok) => setTimeout(ok, (Number(r.headers.get("retry-after")) || 5) * 1000));
    return getJson(url, tries - 1);
  }
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  return r.json();
}
const INFLIGHT = new Map();
export function loadKlines(symbol, tf, fromTs) {
  const key = `${symbol}|${tf}|${fromTs}`;
  if (!INFLIGHT.has(key)) INFLIGHT.set(key, loadKlines0(symbol, tf, fromTs).finally(() => INFLIGHT.delete(key)));
  return INFLIGHT.get(key);
}
async function loadKlines0(symbol, tf, fromTs) {
  const key = `${symbol}|${tf}`, step = TFS[tf].ms, now = Date.now();
  let rows = MEM.get(key) || (await idbGet(key)) || [];
  if (!rows.length || rows[0][0] > fromTs + step) rows = []; // cache bắt đầu muộn hơn mức cần → tải lại từ đầu
  let start = rows.length ? rows[rows.length - 1][0] + step : fromTs;
  for (let guard = 0; guard < 80 && start < now - step; guard++) {
    const limit = Math.min(1500, Math.max(2, Math.ceil((now - start) / step) + 1)); // phần mới ít → limit nhỏ (trọng số API thấp)
    const j = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${limit}&startTime=${start}`);
    if (!j.length) break;
    for (const k of j) if (k[6] < now) rows.push([k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
    start = j[j.length - 1][0] + step;
    if (j.length < limit) break;
  }
  MEM.set(key, rows);
  await idbSet(key, rows);
  return rows.filter((k) => k[0] >= fromTs);
}

// ---------------- Chỉ báo ----------------
const emaArr = (v, n) => { const k = 2 / (n + 1), o = []; let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o.push(e); } return o; };
const smaArr = (v, n) => { const o = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : s / (i + 1)); } return o; };
function atrAdx(H, L, C, n = 14) {
  const atr = [], adx = []; let tr = 0, pdm = 0, ndm = 0, dx = 0;
  for (let i = 0; i < C.length; i++) {
    const t = i ? Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])) : H[i] - L[i];
    const up = i ? H[i] - H[i - 1] : 0, dn = i ? L[i - 1] - L[i] : 0;
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    tr = i < n ? tr + t : tr - tr / n + t; pdm = i < n ? pdm + p : pdm - pdm / n + p; ndm = i < n ? ndm + m : ndm - ndm / n + m;
    atr.push(i < n ? tr / (i + 1) : tr / n);
    const pdi = tr ? (100 * pdm) / tr : 0, ndi = tr ? (100 * ndm) / tr : 0, d = pdi + ndi ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0;
    dx = i < 2 * n ? (dx * i + d) / (i + 1) : (dx * (n - 1) + d) / n; adx.push(dx);
  }
  return { atr, adx };
}

// ---------------- Tìm tín hiệu trên 1 luồng (coin × khung) ----------------
// trả về danh sách tín hiệu {i: chỉ số nến tín hiệu đã đóng, side: 1|-1, sl, setup, note}; vào lệnh ở open[i+1]
function findSignals(K, setups) {
  const n = K.length, O = K.map((k) => k[1]), H = K.map((k) => k[2]), L = K.map((k) => k[3]), C = K.map((k) => k[4]), V = K.map((k) => k[5]);
  const e200 = emaArr(C, 200), e50 = emaArr(C, 50), vma = smaArr(V, 20), { atr, adx } = atrAdx(H, L, C);
  const swHi = [], swLo = []; // swing (fractal 2-2) — xác nhận ở j+2
  const sig = [], on = (s) => setups.includes(s);
  const maxH = (a, b) => { let m = -Infinity; for (let k = Math.max(0, a); k <= b; k++) m = Math.max(m, H[k]); return m; };
  const minL = (a, b) => { let m = Infinity; for (let k = Math.max(0, a); k <= b; k++) m = Math.min(m, L[k]); return m; };
  let pendTrend = null, smc = null; const swept = new Set();
  const lastSwing = (arr, i, ok) => { for (let q = arr.length - 1; q >= 0 && i - arr[q] <= 60; q--) if (ok(arr[q])) return arr[q]; return null; }; // swing gần nhất (≤60 nến) thoả điều kiện
  for (let i = 210; i < n; i++) {
    const j = i - 2; // nến j vừa được xác nhận là swing?
    if (H[j] > H[j - 1] && H[j] > H[j - 2] && H[j] >= H[j + 1] && H[j] >= H[j + 2]) swHi.push(j);
    if (L[j] < L[j - 1] && L[j] < L[j - 2] && L[j] <= L[j + 1] && L[j] <= L[j + 2]) swLo.push(j);
    const a = atr[i], body = Math.abs(C[i] - O[i]), rng = H[i] - L[i] || 1e-9, bull = C[i] > O[i], bear = C[i] < O[i];
    const up = C[i] > e200[i] && e50[i] > e200[i], dn = C[i] < e200[i] && e50[i] < e200[i], trending = adx[i] >= 20;

    // 1) TREND_CONFIRM: nến xác nhận (i) đóng vượt nến tín hiệu (i-1)
    if (on("TREND") && pendTrend && pendTrend.i === i - 1) {
      const p = pendTrend;
      if (p.side === 1 && C[i] > H[p.i]) sig.push({ i, side: 1, sl: minL(i - 10, i) - 0.2 * a, setup: "TREND", note: "hồi EMA50 + nến tín hiệu + xác nhận" });
      if (p.side === -1 && C[i] < L[p.i]) sig.push({ i, side: -1, sl: maxH(i - 10, i) + 0.2 * a, setup: "TREND", note: "hồi EMA50 + nến tín hiệu + xác nhận" });
      pendTrend = null;
    }
    if (on("TREND") && trending && V[i] > vma[i]) {
      const engB = bull && O[i - 1] > C[i - 1] && C[i] >= O[i - 1] && O[i] <= C[i - 1] && V[i] > V[i - 1];
      const engS = bear && O[i - 1] < C[i - 1] && C[i] <= O[i - 1] && O[i] >= C[i - 1] && V[i] > V[i - 1];
      if (up && minL(i - 5, i) <= e50[i] * 1.003 && (engB || (bull && body >= 0.8 * a))) pendTrend = { i, side: 1 };
      else if (dn && maxH(i - 5, i) >= e50[i] * 0.997 && (engS || (bear && body >= 0.8 * a))) pendTrend = { i, side: -1 };
    }

    // 2) SFP: quét đỉnh/đáy swing đáng kể (cực trị 20 nến) + đóng quay lại + volume cao
    if (on("SFP") && V[i] >= 1.5 * vma[i]) {
      const sh = lastSwing(swHi, i, (x) => !swept.has("h" + x) && H[x] >= maxH(x - 20, x - 1));
      if (sh != null && H[i] > H[sh] && C[i] < H[sh] && (H[i] - Math.max(O[i], C[i])) / rng >= 0.4 && maxH(sh + 1, i - 1) <= H[sh]) { swept.add("h" + sh); sig.push({ i, side: -1, sl: H[i] + 0.2 * a, setup: "SFP", note: "quét đỉnh swing + volume cao" }); }
      const sl0 = lastSwing(swLo, i, (x) => !swept.has("l" + x) && L[x] <= minL(x - 20, x - 1));
      if (sl0 != null && L[i] < L[sl0] && C[i] > L[sl0] && (Math.min(O[i], C[i]) - L[i]) / rng >= 0.4 && minL(sl0 + 1, i - 1) >= L[sl0]) { swept.add("l" + sl0); sig.push({ i, side: 1, sl: L[i] - 0.2 * a, setup: "SFP", note: "quét đáy swing + volume cao" }); }
    }

    // 3) BREAKOUT 2 nến (EA): nến i-1 phá vỡ mạnh, nến i cùng màu đóng vượt
    if (on("BREAKOUT") && trending) {
      const b = i - 1, bb = Math.abs(C[b] - O[b]), br = H[b] - L[b] || 1e-9;
      if (bb / br >= 0.6 && V[b] >= 1.5 * vma[b]) {
        if (C[b] > O[b] && C[b] > maxH(b - 20, b - 1) && C[b] > e200[b] && bull && C[i] > C[b]) sig.push({ i, side: 1, sl: L[b] - 0.2 * a, setup: "BREAKOUT", note: "phá đỉnh 20 nến + nến xác nhận" });
        if (C[b] < O[b] && C[b] < minL(b - 20, b - 1) && C[b] < e200[b] && bear && C[i] < C[b]) sig.push({ i, side: -1, sl: H[b] + 0.2 * a, setup: "BREAKOUT", note: "phá đáy 20 nến + nến xác nhận" });
      }
    }

    // 4) SMC_REVERSAL: CHoCH (đóng vượt swing ngược cấu trúc) → chờ hồi về OB khởi nguồn + nến từ chối
    if (on("SMC")) {
      const h1 = swHi[swHi.length - 1], h0 = swHi[swHi.length - 2], l1 = swLo[swLo.length - 1], l0 = swLo[swLo.length - 2];
      if (h1 != null && h0 != null && H[h1] < H[h0] && C[i] > H[h1] && C[i - 1] <= H[h1]) { // đang giảm (LH) bị phá → CHoCH tăng
        let ob = null; for (let k = i - 1; k >= Math.max(l1 ?? i - 15, i - 15); k--) if (C[k] < O[k]) { ob = k; break; }
        if (ob != null) smc = { side: 1, hi: H[ob], lo: L[ob], from: i, exp: i + 30 };
      }
      if (l1 != null && l0 != null && L[l1] > L[l0] && C[i] < L[l1] && C[i - 1] >= L[l1]) { // đang tăng (HL) bị phá → CHoCH giảm
        let ob = null; for (let k = i - 1; k >= Math.max(h1 ?? i - 15, i - 15); k--) if (C[k] > O[k]) { ob = k; break; }
        if (ob != null) smc = { side: -1, hi: H[ob], lo: L[ob], from: i, exp: i + 30 };
      }
      if (smc && i > smc.from) {
        if (i > smc.exp || (smc.side === 1 && C[i] < smc.lo) || (smc.side === -1 && C[i] > smc.hi)) smc = null;
        else if (smc.side === 1 && L[i] <= smc.hi && bull && C[i] > smc.hi) { sig.push({ i, side: 1, sl: Math.min(smc.lo, L[i]) - 0.2 * a, setup: "SMC", note: "CHoCH tăng → hồi OB → từ chối" }); smc = null; }
        else if (smc.side === -1 && H[i] >= smc.lo && bear && C[i] < smc.lo) { sig.push({ i, side: -1, sl: Math.max(smc.hi, H[i]) + 0.2 * a, setup: "SMC", note: "CHoCH giảm → hồi OB → từ chối" }); smc = null; }
      }
    }
  }
  return { sig, atr };
}

// ---------------- Mô phỏng 1 lệnh (theo R) ----------------
function simTrade(K, s, cfg, atr, endIdx) {
  const e = s.i + 1; if (e > endIdx) return null; // chưa có nến để vào
  const slip = cfg.slipPct / 100, side = s.side;
  const entry = K[e][1] * (1 + side * slip);
  const risk = (entry - s.sl) * side;
  const a = atr[s.i];
  if (!(risk > 0) || risk > 4 * a) return { skip: risk > 0 ? "SL xa > 4 ATR" : "giá vào đã qua SL" }; // luật EA: huỷ lệnh đuổi giá
  if (cfg.maxFeeR > 0 && (2 * (cfg.feePct / 100) * entry) / risk > cfg.maxFeeR) return { skip: "SL quá sát (phí > " + cfg.maxFeeR + "R)" }; // phí ăn quá nhiều so với rủi ro
  const tp = entry + side * cfg.rr * risk;
  let sl = s.sl, be = false, exit = null, reason = null, exitIdx = null, maxR = 0, mae = 0;
  for (let k = e; k <= endIdx; k++) {
    const [, , h, l, c] = K[k];
    const adv = side === 1 ? l : h, fav = side === 1 ? h : l;
    mae = Math.max(mae, Math.min(((entry - adv) * side) / risk, 1.2));
    if ((adv - sl) * side <= 0) { exit = sl * (1 - side * slip); reason = be ? "Hoà vốn" : "Cắt lỗ"; exitIdx = k; break; }
    if ((fav - tp) * side >= 0) { exit = tp; reason = "Chốt lời"; exitIdx = k; maxR = cfg.rr; break; }
    maxR = Math.max(maxR, ((fav - entry) * side) / risk);
    if (!be && cfg.beAtR > 0 && maxR >= cfg.beAtR) { be = true; sl = entry + side * 0.05 * risk; } // dời SL về hoà vốn (dương nhẹ) từ nến sau
    if (k - e >= cfg.timeStopBars) { exit = c; reason = "Hết thời gian"; exitIdx = k; break; }
  }
  const feeR = (2 * (cfg.feePct / 100) * entry) / risk;
  return { entryIdx: e, entry, sl: s.sl, curSl: sl, tp, risk, rr: cfg.rr, beAtR: cfg.beAtR, exitIdx, exit, reason, be, feeR, mfe: maxR, mae, open: exit == null, r: exit == null ? null : ((exit - entry) * side) / risk - feeR };
}

// Các cấu hình bộ tối ưu được thử (R:R × dời hoà vốn) — luôn gồm cấu hình gốc của phiên
function variantsOf(cfg) {
  const v = [[1.5, 0], [1.5, 1], [2, 0], [2, 1], [3, 0], [3, 1]];
  if (!v.some(([r, b]) => r === cfg.rr && b === cfg.beAtR)) v.push([cfg.rr, cfg.beAtR]);
  return v.map(([rr, beAtR]) => ({ rr, beAtR, label: `R:R ${rr}${beAtR ? ` · hoà vốn ${beAtR}R` : ""}` }));
}
export const LEVELS = ["cặp + khung + setup", "khung + setup (mọi cặp)", "setup (mọi cặp, khung)"];

// ---------------- Chạy cả phiên ----------------
// session: { startAt, stoppedAt?, cfg } · onProgress(text)
// Trả về dữ liệu THÔ (lệnh theo R); finalize() ghép giá realtime + tính danh mục.
export async function runSession(session, onProgress = () => {}) {
  const cfg = { ...DEFAULT_CFG, ...(session.cfg || {}) };
  const until = session.stoppedAt || Date.now(), startAt = session.startAt;
  const learnFrom = cfg.adaptive ? startAt - cfg.warmupDays * 86400000 : startAt;
  const V = variantsOf(cfg), baseVi = V.findIndex((v) => v.rr === cfg.rr && v.beAtR === cfg.beAtR);
  const skipped = {}, streams = [], shadows = [];
  const bump = (k, n = 1) => { if (n) skipped[k] = (skipped[k] || 0) + n; };
  // tải song song mọi cặp × khung (kể cả khung lớn để lọc) — lần sau chỉ tải phần nến mới
  const need = new Map();
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    need.set(`${coin}|${tf}`, [SYMBOLS[coin], tf, learnFrom - 260 * TFS[tf].ms]);
    if (cfg.htfFilter) { const h = TFS[tf].htf; need.set(`${coin}|${h}`, [SYMBOLS[coin], h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - 260 * TFS[h].ms)]); }
  }
  onProgress(`Tải nến ${need.size} luồng…`);
  let done = 0;
  await Promise.all([...need.values()].map(([sym, tf, from]) => loadKlines(sym, tf, from).then(() => onProgress(`Tải nến ${++done}/${need.size}…`))));
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    const symbol = SYMBOLS[coin], step = TFS[tf].ms, key = `${coin}|${tf}`;
    const K = (await loadKlines(symbol, tf, learnFrom - 260 * step)).filter((k) => k[0] + step <= until);
    if (K.length < 260) { streams.push({ coin, tf, bars: K.length, note: "thiếu dữ liệu" }); continue; }
    const found = findSignals(K, cfg.setups);
    const atr = found.atr; let sig = found.sig.filter((x) => K[x.i][0] >= learnFrom);
    if (cfg.htfFilter) {
      const htf = TFS[tf].htf, hs = TFS[htf].ms;
      const HK = (await loadKlines(symbol, htf, learnFrom - 260 * hs)).filter((k) => k[0] + hs <= until);
      const he = emaArr(HK.map((k) => k[4]), 200);
      // xu hướng khung lớn tại thời điểm nến LTF đóng = nến khung lớn ĐÃ ĐÓNG gần nhất
      const biasAt = (t) => { let lo = 0, hi = HK.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (HK[m][0] + hs <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r < 200 ? 0 : HK[r][4] > he[r] ? 1 : HK[r][4] < he[r] ? -1 : 0; };
      const keep = sig.filter((x) => biasAt(K[x.i][0] + step) === x.side);
      bump("Ngược xu hướng khung lớn", sig.filter((x) => K[x.i][0] >= startAt).length - keep.filter((x) => K[x.i][0] >= startAt).length);
      sig = keep;
    }
    const endIdx = K.length - 1, last = K[endIdx][4], lastBarAt = K[endIdx][0];
    for (const s of sig) {
      const sims = V.map((v) => simTrade(K, s, { ...cfg, rr: v.rr, beAtR: v.beAtR }, atr, endIdx));
      if (!sims[0]) continue;
      if (sims[0].skip) { if (K[s.i][0] >= startAt) bump(sims[0].skip); continue; }
      const entryAt = K[sims[0].entryIdx][0];
      const build = (vi, extra) => {
        const t = sims[vi];
        return {
          id: `${coin}-${tf}-${K[s.i][0]}-${s.setup}`, key, coin, tf, setup: s.setup, side: s.side, note: s.note,
          signalAt: K[s.i][0], entryAt, entry: t.entry, sl: t.sl, curSl: t.curSl, tp: t.tp, risk: t.risk, rr: t.rr, beAtR: t.beAtR,
          exitAt: t.open ? null : K[t.exitIdx][0] + step, exit: t.open ? null : t.exit, reason: t.open ? "Đang mở" : t.reason, be: t.be,
          r: t.r, uR: t.open ? ((last - t.entry) * s.side) / t.risk - t.feeR : null, last, lastBarAt, feeR: t.feeR, mfe: t.mfe, mae: t.mae, ...extra,
        };
      };
      shadows.push({ key, cell: `${coin}|${tf}|${s.setup}`, grp: `${tf}|${s.setup}`, setup: s.setup, coin, tf, entryAt, live: entryAt >= startAt, build, x: sims.map((t) => (t.open ? Infinity : K[t.exitIdx][0] + step)), r: sims.map((t) => t.r) });
    }
    streams.push({ coin, tf, bars: K.length, signals: sig.filter((x) => K[x.i][0] >= startAt).length, lastBar: lastBarAt });
  }
  onProgress("Tối ưu & tính danh mục…");
  shadows.sort((a, b) => a.entryAt - b.entryAt);

  // Chỉ mục học: cấp (ô / nhóm / setup) → khoá → theo cấu hình: [{x: lúc đóng, r}] sắp theo x
  const idx = [new Map(), new Map(), new Map()], keysOf = (sh) => [sh.cell, sh.grp, sh.setup];
  for (const sh of shadows) keysOf(sh).forEach((k, l) => {
    let m = idx[l].get(k); if (!m) idx[l].set(k, (m = V.map(() => [])));
    sh.r.forEach((r, vi) => { if (r != null) m[vi].push({ x: sh.x[vi], r }); });
  });
  for (const lv of idx) for (const m of lv.values()) for (const a of m) a.sort((p, q) => p.x - q.x);
  const upTo = (a, T) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].x <= T) lo = m + 1; else hi = m; } return lo; };
  // Quyết định tại thời điểm T: chỉ dùng lệnh bóng đã ĐÓNG trước T (walk-forward)
  const decide = (keys, T) => {
    for (let l = 0; l < 3; l++) {
      const m = idx[l].get(keys[l]); if (!m) continue;
      const ev = m.map((a, vi) => { const c = upTo(a, T), w = a.slice(Math.max(0, c - cfg.lookback), c); return { vi, n: w.length, exp: w.length ? w.reduce((s, x) => s + x.r, 0) / w.length : -Infinity, win: w.length ? w.filter((x) => x.r > 0.05).length / w.length : 0 }; }).filter((e) => e.n >= cfg.minSample);
      if (!ev.length) continue;
      const best = ev.sort((a, b) => b.exp - a.exp)[0];
      return { level: l, vi: best.vi, exp: best.exp, n: best.n, win: best.win * 100, take: best.exp >= cfg.minExp };
    }
    return { level: -1, vi: baseVi, exp: null, n: 0, win: null, take: true };
  };

  const trades = [], baseTrades = [], rejected = [], optLog = [], cellState = new Map(), busyA = {}, busyB = {};
  for (const sh of shadows) {
    if (!sh.live) continue;
    if (!(sh.entryAt < (busyB[sh.key] ?? -1))) { const t = sh.build(baseVi); baseTrades.push(t); busyB[sh.key] = t.exitAt ?? Infinity; }
    if (!cfg.adaptive || sh.entryAt < (busyA[sh.key] ?? -1)) continue;
    const d = decide(keysOf(sh), sh.entryAt);
    const prev = cellState.get(sh.cell), cur = d.take ? `on:${d.vi}` : "off";
    if (prev !== cur) {
      optLog.push({ t: sh.entryAt, cell: sh.cell, coin: sh.coin, tf: sh.tf, setup: sh.setup, take: d.take, variant: V[d.vi].label, exp: d.exp, n: d.n, level: d.level, first: prev == null, prevOn: prev ? prev !== "off" : null });
      cellState.set(sh.cell, cur);
    }
    const score = { exp: d.exp, n: d.n, level: d.level, variant: V[d.vi].label };
    if (d.take) { const t = sh.build(d.vi, { score }); trades.push(t); busyA[sh.key] = t.exitAt ?? Infinity; }
    else rejected.push(sh.build(baseVi, { score, status: "reject", why: `kỳ vọng ${d.exp.toFixed(2)}R / ${d.n} lệnh gần nhất` }));
  }

  // Trạng thái bộ tối ưu tại hiện tại cho từng ô đã có tín hiệu
  const seen = new Map(); for (const sh of shadows) seen.set(sh.cell, sh);
  const optState = [...seen.values()].map((sh) => { const d = decide(keysOf(sh), until); return { cell: sh.cell, coin: sh.coin, tf: sh.tf, setup: sh.setup, ...d, variant: V[d.vi].label }; })
    .sort((a, b) => (b.take - a.take) || ((b.exp ?? -9) - (a.exp ?? -9)));

  return { cfg, startAt, until, stopped: !!session.stoppedAt, trades: cfg.adaptive ? trades : baseTrades, baseTrades, rejected, optLog, optState, skipped, streams, learned: shadows.filter((s) => !s.live).length, at: Date.now() };
}

// Ghép nến đang chạy (WebSocket) vào lệnh đang mở: chạm SL/TP → đóng ngay; còn lại lãi/lỗ theo giá hiện tại.
// live: { "BTC|5m": {t, h, l, c} } · hits: Map id → lúc phát hiện chạm (giữ thời điểm ổn định giữa các nhịp)
function applyTick(t, bar, cfg, hits) {
  if (t.exitAt != null || !bar || bar.t <= t.lastBarAt) return t;
  const side = t.side, slip = cfg.slipPct / 100;
  const hitSl = ((side === 1 ? bar.l : bar.h) - t.curSl) * side <= 0, hitTp = ((side === 1 ? bar.h : bar.l) - t.tp) * side >= 0;
  if (hitSl || hitTp) { // cùng chạm trong 1 nến → tính THUA như luật chung
    const exit = hitSl ? t.curSl * (1 - side * slip) : t.tp;
    if (!hits.has(t.id)) hits.set(t.id, Date.now());
    return { ...t, exit, exitAt: hits.get(t.id), reason: hitSl ? (t.be ? "Hoà vốn" : "Cắt lỗ") : "Chốt lời", r: ((exit - t.entry) * side) / t.risk - t.feeR, uR: null, last: bar.c, liveExit: true };
  }
  return { ...t, last: bar.c, uR: ((bar.c - t.entry) * side) / t.risk - t.feeR, mfe: Math.max(t.mfe || 0, (((side === 1 ? bar.h : bar.l) - t.entry) * side) / t.risk) };
}
export function finalize(raw, live, hits = new Map()) {
  if (!raw) return null;
  const until = raw.stopped ? raw.until : Math.max(raw.until, Date.now());
  const adj = (list) => (live && !raw.stopped ? list.map((t) => applyTick(t, live[t.key], raw.cfg, hits)) : list);
  const trades = adj(raw.trades), baseTrades = adj(raw.baseTrades);
  return { ...raw, trades, baseTrades, portfolio: portfolio(trades, raw.cfg, raw.startAt, until), basePortfolio: portfolio(baseTrades, raw.cfg, raw.startAt, until) };
}

// Danh mục vốn thật: rủi ro % vốn/lệnh, tối đa N lệnh cùng lúc, đòn bẩy tối đa, dừng ngày khi lỗ X%
const dayOf = (t) => new Date(t + 7 * 3600000).toISOString().slice(0, 10); // ngày giờ VN
function portfolio(trades, cfg, startAt, until) {
  let eq = cfg.capital, peak = eq, maxDD = 0, maxDDUsd = 0, fees = 0;
  const curve = [{ t: startAt, eq }], open = [], taken = [], dayPnl = {};
  const evs = [...trades].sort((a, b) => a.entryAt - b.entryAt);
  const settle = (t) => {
    open.sort((a, b) => (a.exitAt ?? Infinity) - (b.exitAt ?? Infinity));
    while (open.length && open[0].exitAt != null && open[0].exitAt <= t) {
      const p = open.shift(); eq += p.pnl; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak); maxDDUsd = Math.max(maxDDUsd, peak - eq);
      const d = dayOf(p.exitAt); dayPnl[d] = (dayPnl[d] || 0) + p.pnl;
      curve.push({ t: p.exitAt, eq });
    }
  };
  for (const tr of evs) {
    settle(tr.entryAt);
    const day = dayOf(tr.entryAt);
    if (open.length >= cfg.maxOpen) { taken.push({ ...tr, status: "skip", why: `đủ ${cfg.maxOpen} lệnh mở` }); continue; }
    if ((dayPnl[day] || 0) <= -(cfg.dailyStopPct / 100) * eq) { taken.push({ ...tr, status: "skip", why: `chạm dừng ngày -${cfg.dailyStopPct}%` }); continue; }
    const riskUsd = eq * (cfg.riskPct / 100);
    let qty = riskUsd / tr.risk; const maxQty = (cfg.maxLev * eq) / tr.entry;
    if (qty > maxQty) qty = maxQty;
    const lev = (qty * tr.entry) / eq;
    const R = tr.r ?? tr.uR ?? 0;
    const pnl = qty * tr.risk * R; // R đã trừ phí
    const fee = qty * tr.risk * tr.feeR;
    if (tr.exitAt != null) fees += fee;
    const row = { ...tr, status: tr.exitAt == null ? "open" : "done", qty, lev, riskUsd: qty * tr.risk, pnl, fee, notional: qty * tr.entry };
    taken.push(row);
    open.push(row);
  }
  settle(until);
  const unreal = open.filter((p) => p.exitAt == null).reduce((s, p) => s + p.pnl, 0);
  curve.push({ t: until, eq: eq + unreal });
  const days = Object.entries(dayPnl).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ d, v }));
  return { equity: eq, unrealized: unreal, maxDD: maxDD * 100, maxDDUsd, fees, curve, trades: taken, days };
}

// Thống kê theo R (chất lượng phương pháp, không phụ thuộc vốn)
export function statsOf(list) {
  const done = list.filter((t) => t.r != null);
  const wins = done.filter((t) => t.r > 0.05), losses = done.filter((t) => t.r < -0.05), bes = done.length - wins.length - losses.length;
  const sumW = wins.reduce((s, t) => s + t.r, 0), sumL = -losses.reduce((s, t) => s + t.r, 0);
  let streak = 0, worst = 0, ws = 0, bestWs = 0;
  for (const t of [...done].sort((a, b) => a.exitAt - b.exitAt)) {
    if (t.r < -0.05) { streak++; worst = Math.max(worst, streak); ws = 0; } else if (t.r > 0.05) { streak = 0; ws++; bestWs = Math.max(bestWs, ws); }
  }
  const n = done.length, mean = n ? done.reduce((s, t) => s + t.r, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(done.reduce((s, t) => s + (t.r - mean) ** 2, 0) / (n - 1)) : null;
  const avg = (a, f) => (a.length ? a.reduce((s, t) => s + f(t), 0) / a.length : null);
  const reasons = {}; for (const t of done) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  return {
    n, open: list.length - n, wins: wins.length, losses: losses.length, bes,
    winRate: n ? (wins.length / n) * 100 : null,
    avgR: mean, totalR: done.reduce((s, t) => s + t.r, 0), pf: sumL ? sumW / sumL : sumW ? Infinity : null, worstStreak: worst, bestStreak: bestWs,
    avgWin: wins.length ? sumW / wins.length : null, avgLoss: losses.length ? -sumL / losses.length : null,
    payoff: wins.length && losses.length ? sumW / wins.length / (sumL / losses.length) : null,
    maxWin: n ? Math.max(...done.map((t) => t.r)) : null, maxLoss: n ? Math.min(...done.map((t) => t.r)) : null,
    sqn: sd ? (mean / sd) * Math.sqrt(Math.min(n, 100)) : null, // System Quality Number (Van Tharp): <1.6 kém · 1.6–2 trung bình · >2 tốt
    holdH: avg(done, (t) => (t.exitAt - t.entryAt) / 3600000),
    mfeLoss: avg(losses, (t) => t.mfe || 0), // lệnh thua từng lời được bao nhiêu R trước khi quay đầu
    maeWin: avg(wins, (t) => t.mae || 0), // lệnh thắng từng âm bao nhiêu R
    feeR: avg(done, (t) => t.feeR), reasons,
  };
}
