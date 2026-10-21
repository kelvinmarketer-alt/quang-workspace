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

// Mặc định đề xuất cho vốn 1.000$ (bản 2 — đã kiểm tra walk-forward 30–150 ngày, xem ghi chú dưới)
export const DEFAULT_CFG = {
  cfgVer: 7,
  capital: 1000, riskPct: 2, maxOpen: 3, maxLev: 20, dailyStopPct: 6, // v7 (user chốt 20/10): rủi ro 2%/lệnh, dừng ngày -6% (= 3 lệnh thua)
  rr: 2, beAtR: 0, timeStopBars: 96, feePct: 0.05, makerPct: 0.02, slipPct: 0.02, maxFeeR: 0.35, // bỏ lệnh khi phí 2 chiều > 0.35R (SL quá sát)
  sigVol: true, noEngulf: true, d1Bias: true, // v6: nến tín hiệu volume > TB20 · bỏ vào ngay sau engulfing lớn · (tuỳ chọn) chỉ thuận D1
  keyVolume: 1, // v5: chỉ vào khi giá vào nằm trong vùng nến volume LỚN NHẤT 100 nến (Key Volume) — 90 ngày: thắng 39%→47%, R −0.05→+0.19; 0 = tắt, 3 = top 3
  maxExtAtr: 2, minSlAtr: 2, limitAt: "close", fillBars: 3, // v3: không đuổi giá (≤2 ATR từ EMA50), SL ≥2 ATR (180 ngày: thắng 35%→44%, R −0.12→+0.13); lệnh chờ chờ 3 nến, không khớp → bỏ
  entryMode: "limit", // vào bằng LỆNH CHỜ ở giá đóng nến tín hiệu (phí maker, không trượt) — 180 ngày: R TB -0.23 → -0.11 so với vào giá thị trường
  partialAtR: 0, // chốt 50% ở +xR (0 = tắt)
  // Tự tối ưu: học thêm 90 ngày trước ngày bắt đầu; xét 60 lệnh gần nhất, cần ≥20 mẫu; điểm thận trọng = kỳ vọng − 1×sai số chuẩn ≥ 0 mới vào;
  // cổng khung giờ: cả khung đang âm thì nghỉ khung đó. Kiểm tra 30–150 ngày: vốn giữ 959–1.073$ trong khi luật gốc còn 530–813$.
  learnLoss: true, lessonN: 30, lessonMin: 15, verifyOpt: true, optVariants: false, // v4: tự kiểm chứng — bộ lọc chỉ được chặn khi tín hiệu nó chặn thật sự tệ hơn; giữ R:R cố định (chọn R:R theo kết quả gần đây làm giảm tỉ lệ thắng) // v4: rút kinh nghiệm từ lệnh thua (30 lệnh gần nhất có cùng đặc điểm, cần ≥15)
  adaptive: true, warmupDays: 0, lookback: 60, minSample: 20, minExp: -0.1, confK: 0, tfGate: true, // v3: luật vào đẹp đã lọc tín hiệu → tối ưu nhẹ tay (nghỉ khung đang lỗ + tắt ô âm rõ < -0.1R), thận trọng quá làm mất lệnh tốt
  htfFilter: true, // Đa khung (luật cốt lõi): chỉ đánh THUẬN xu hướng khung lớn (giá so EMA200 khung lớn: M5→H1, M15/H1→H4, H4→D1)
  coins: ["BTC", "ETH", "XAU"], tfs: ["5m", "15m"], setups: ["TREND", "SFP", "BREAKOUT", "SMC"], // v4: bỏ H4 mặc định (ít lệnh, 90 ngày hơi âm; bỏ H4 tốt hơn nhẹ)
};
// Cấu hình thực của 1 phiên: phiên tạo từ bản cũ (chưa có cfgVer 2) được nâng bộ tối ưu + cách vào lệnh lên bản mới, giữ vốn/rủi ro/cặp/khung/setup
const V7_KEYS = ["riskPct", "dailyStopPct", "d1Bias"];
const V6_KEYS = ["sigVol", "noEngulf", "d1Bias"];
const V5_KEYS = ["keyVolume"];
const V4_KEYS = ["learnLoss", "lessonN", "lessonMin", "verifyOpt", "optVariants", "warmupDays"];
const V3_KEYS = ["maxExtAtr", "minSlAtr", "limitAt", "fillBars", "entryMode", "minExp", "confK"];
const V2_KEYS = ["beAtR", "makerPct", "entryMode", "partialAtR", "warmupDays", "lookback", "minSample", "minExp", "confK", "tfGate", "maxFeeR", "cfgVer"];
export const MIN_RR = 1.5; // luật của Quang: R:R tối thiểu 1:1,5 — mọi mức chốt lời (kể cả chốt 1 nửa) không thấp hơn
export function cfgOf(session) {
  const c = { ...DEFAULT_CFG, ...(session?.cfg || {}) };
  const ver = session?.cfg?.cfgVer || 1;
  if (ver < 2) for (const k of V2_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 3) for (const k of V3_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 4) for (const k of V4_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 7) for (const k of V7_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 6) { for (const k of V6_KEYS) c[k] = DEFAULT_CFG[k]; c.tfs = c.tfs.filter((x) => x === "5m" || x === "15m"); if (!c.tfs.length) c.tfs = DEFAULT_CFG.tfs; } // v6: chỉ vào lệnh M5/M15, khung lớn chỉ để xác định bias (user chốt 20/10)
  if (ver < 5) { for (const k of V5_KEYS) c[k] = DEFAULT_CFG[k]; c.tfs = c.tfs.filter((x) => x !== "4h"); if (!c.tfs.length) c.tfs = DEFAULT_CFG.tfs; } // v5: bỏ hẳn H4 (user chốt 20/10)
  c.entryMode = "limit"; c.cfgVer = DEFAULT_CFG.cfgVer; // luật của Quang: CHỈ vào lệnh chờ (limit), giá không về điểm đẹp thì bỏ
  c.rr = Math.max(MIN_RR, Number(c.rr) || MIN_RR);
  if (c.partialAtR > 0 && c.partialAtR < MIN_RR) c.partialAtR = MIN_RR;
  return c;
}

// ---------------- Dữ liệu nến Futures (cache IndexedDB, chỉ tải phần mới) ----------------
const DB = "qws-paperbot", STORE = "klines";
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function idbGet(k) { try { const d = await idb(); return await new Promise((ok) => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); } catch { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise((ok) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch { /* bỏ qua */ } }

// mảng nến: [openTime, open, high, low, close, volume] — chỉ nến ĐÃ ĐÓNG
const MEM = new Map();
async function getJson(url, tries = 4) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(30000) }); } catch (e) { // mạng chập chờn / treo quá 30 giây → thử lại
    if (tries <= 1) throw new Error("Không tải được dữ liệu Binance (mạng): " + (e.message || e));
    await new Promise((ok) => setTimeout(ok, 2000)); return getJson(url, tries - 1);
  }
  if (r.status === 429 || r.status === 418) { // Binance giới hạn tần suất → chờ rồi thử lại
    if (tries <= 1) throw new Error("Binance đang giới hạn tần suất, thử lại sau 1 phút");
    await new Promise((ok) => setTimeout(ok, (Number(r.headers.get("retry-after")) || 5) * 1000));
    return getJson(url, tries - 1);
  }
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  return r.json();
}
let pageHook = null; // runSession đếm số trang nến đang tải để báo tiến độ
const INFLIGHT = new Map();
// Lịch sử FUNDING thật của Binance (BTC/ETH mỗi 8h, XAU mỗi 4h) — [[fundingTime, rate]], cache như nến
const FMEM = new Map();
export async function loadFunding(symbol, fromTs) {
  const key = `fund|${symbol}`, now = Date.now();
  let rows = FMEM.get(key) || (await idbGet(key)) || [];
  if (!rows.length || rows[0][0] > fromTs + 8 * 3600000) rows = [];
  let start = rows.length ? rows[rows.length - 1][0] + 1 : fromTs;
  for (let guard = 0; guard < 20 && start < now; guard++) {
    const j = await getJson(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${start}&limit=1000`);
    if (!Array.isArray(j) || !j.length) break;
    for (const f of j) rows.push([f.fundingTime, Number(f.fundingRate)]);
    start = j[j.length - 1].fundingTime + 1;
    if (j.length < 1000) break;
  }
  FMEM.set(key, rows); await idbSet(key, rows);
  return rows;
}
// Tổng tỉ lệ funding trong khoảng (from, to] — giữ vị thế qua mốc funding nào thì tính mốc đó
function fundingSum(rows) {
  const t = rows.map((r) => r[0]), ps = [0]; for (const r of rows) ps.push(ps[ps.length - 1] + r[1]);
  const upTo = (x) => { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m + 1; else hi = m; } return lo; };
  return (from, to) => ps[upTo(to)] - ps[upTo(from)];
}

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
    pageHook?.(j.length);
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
  return { sig, atr, e50, adx, vma, V, H, L, C, O };
}

// ---------------- Mô phỏng 1 lệnh (theo R) ----------------
function simTrade(K, s, cfg, atr, endIdx, e50, f) {
  const e0 = s.i + 1; if (e0 > endIdx && cfg.entryMode !== "limit") return null; // chưa có nến để vào (lệnh chờ thì vẫn đặt ngay khi nến tín hiệu đóng)
  const slip = cfg.slipPct / 100, side = s.side, a = atr[s.i];
  const limit = cfg.entryMode === "limit", maker = (cfg.makerPct ?? 0.02) / 100, taker = cfg.feePct / 100;
  // Vào lệnh: thị trường ở giá mở nến kế (trả phí taker + trượt) · hoặc LỆNH CHỜ ở giá đóng nến tín hiệu, chờ tối đa 3 nến (phí maker, không trượt)
  let e = e0, entry = e0 <= endIdx ? K[e0][1] * (1 + side * slip) : null;
  if (limit) {
    // Điểm vào đẹp: "close" = giá đóng nến tín hiệu · "mid" = hồi 50% thân nến tín hiệu (giá tốt hơn, khó khớp hơn)
    const [, so, , , sc] = K[s.i], lim = cfg.limitAt === "mid" ? (so + sc) / 2 : sc, win = Math.max(1, cfg.fillBars || 3); e = -1;
    // Luật vào đẹp (biết trước khi đặt lệnh): không đuổi giá xa EMA50, SL không quá sát vùng nhiễu
    if (cfg.maxExtAtr > 0 && e50 && Math.abs(lim - e50[s.i]) / a > cfg.maxExtAtr) return { skip: `đuổi giá (xa EMA50 > ${cfg.maxExtAtr} ATR)` };
    if (cfg.minSlAtr > 0 && ((lim - s.sl) * side) / a < cfg.minSlAtr && ((lim - s.sl) * side) > 0) return { skip: `SL sát < ${cfg.minSlAtr} ATR` };
    if (cfg.keyVolume > 0 && f && !atKeyVolume(f, s.i, cfg.keyVolume, lim)) return { skip: cfg.keyVolume === 1 ? "không ở vùng nến volume lớn nhất 100 nến" : `không ở vùng Key Volume (top ${cfg.keyVolume})` }; // bộ kiến thức: chỉ vào TẠI vùng có lý do
    for (let k = e0; k <= Math.min(endIdx, e0 + win - 1); k++) if ((side === 1 ? K[k][3] < lim : K[k][2] > lim)) { e = k; break; } // giá phải xuyên qua (không chỉ chạm) mới tính khớp — thận trọng về hàng chờ
    if (e < 0) {
      if (e0 + win - 1 <= endIdx) return { skip: "giá không về điểm vào" };
      // CHỜ KHỚP (cửa sổ còn mở) → lệnh chờ đặt lên sàn ngay; kiểm tra rủi ro như khi khớp
      const r0 = (lim - s.sl) * side, step = K[s.i][0] - K[s.i - 1][0];
      if (!(r0 > 0) || r0 > 4 * a) return { skip: r0 > 0 ? "SL xa > 4 ATR" : "giá vào đã qua SL" };
      if (cfg.maxFeeR > 0 && (2 * taker * lim) / r0 > cfg.maxFeeR) return { skip: "SL quá sát (phí > " + cfg.maxFeeR + "R)" };
      return { pending: { side, lim, sl: s.sl, until: K[s.i][0] + (1 + win) * step } };
    }
    entry = lim;
  }
  const risk = (entry - s.sl) * side;
  if (!(risk > 0) || risk > 4 * a) return { skip: risk > 0 ? "SL xa > 4 ATR" : "giá vào đã qua SL" }; // luật EA: huỷ lệnh đuổi giá
  if (cfg.maxFeeR > 0 && (2 * taker * entry) / risk > cfg.maxFeeR) return { skip: "SL quá sát (phí > " + cfg.maxFeeR + "R)" }; // phí ăn quá nhiều so với rủi ro
  const tp = entry + side * cfg.rr * risk, pAt = cfg.partialAtR > 0 ? entry + side * cfg.partialAtR * risk : null;
  const inFee = limit ? maker : taker;
  let sl = s.sl, be = false, exit = null, reason = null, exitIdx = null, maxR = 0, mae = 0, part = 0, exitFee = taker; // part: R đã chốt 1 nửa
  for (let k = e; k <= endIdx; k++) {
    const [, , h, l, c] = K[k];
    const adv = side === 1 ? l : h, fav = side === 1 ? h : l, fillBar = limit && k === e;
    mae = Math.max(mae, Math.min(((entry - adv) * side) / risk, 1.2));
    if ((adv - sl) * side <= 0) { exit = sl * (1 - side * slip); reason = be ? (part ? "Chốt 1 nửa + hoà vốn" : "Hoà vốn") : "Cắt lỗ"; exitIdx = k; break; }
    if (fillBar) { maxR = Math.max(maxR, ((c - entry) * side) / risk); continue; } // nến khớp lệnh chờ: không tính chạm TP (không biết thứ tự)
    if ((fav - tp) * side >= 0) { exit = tp; reason = "Chốt lời"; exitIdx = k; maxR = cfg.rr; exitFee = maker; break; }
    maxR = Math.max(maxR, ((fav - entry) * side) / risk);
    if (pAt != null && !part && (fav - pAt) * side >= 0) { part = cfg.partialAtR; be = true; sl = entry + side * 0.05 * risk; } // chốt 50% + dời SL hoà vốn
    if (!be && cfg.beAtR > 0 && maxR >= cfg.beAtR) { be = true; sl = entry + side * 0.05 * risk; } // dời SL về hoà vốn (dương nhẹ) từ nến sau
    if (k - e >= cfg.timeStopBars) { exit = c; reason = "Hết thời gian"; exitIdx = k; break; }
  }
  const w = part ? 0.5 : 1; // khối lượng còn lại khi thoát
  const feeR = ((inFee + (part ? 0.5 * maker + 0.5 * exitFee : exitFee)) * entry) / risk;
  const r = exit == null ? null : (part ? 0.5 * part : 0) + (w * (exit - entry) * side) / risk - feeR;
  return { entryIdx: e, entry, sl: s.sl, curSl: sl, tp, risk, rr: cfg.rr, beAtR: cfg.beAtR, part, exitIdx, exit, reason, be, feeR, mfe: maxR, mae, open: exit == null, r };
}

// R của lệnh (đã chốt 1 nửa ở part R thì nửa còn lại tính theo giá px)
const uRof = (part, entry, px, side, risk, feeR) => (part ? 0.5 * part + (0.5 * (px - entry) * side) / risk : ((px - entry) * side) / risk) - feeR;

// Các cấu hình bộ tối ưu được thử (R:R × dời hoà vốn) — luôn gồm cấu hình gốc của phiên
function variantsOf(cfg) {
  const v = cfg.optVariants === false ? [] : [[1.5, 0], [1.5, 1], [2, 0], [2, 1], [3, 0], [3, 1]];
  if (!v.some(([r, b]) => r === cfg.rr && b === cfg.beAtR)) v.push([cfg.rr, cfg.beAtR]);
  return v.filter(([rr]) => rr >= MIN_RR).map(([rr, beAtR]) => ({ rr, beAtR, label: `R:R ${rr}${beAtR ? ` · hoà vốn ${beAtR}R` : ""}` }));
}
// ---------------- Rút kinh nghiệm từ lệnh thua ----------------
// Mỗi tín hiệu được gắn "đặc điểm" lúc ra tín hiệu (không nhìn tương lai). Sau mỗi lệnh thua, hệ thống xem các đặc điểm của lệnh đó:
// đặc điểm nào trong N lệnh gần nhất (đã đóng) thua rõ rệt (kỳ vọng ≤ -0.2R và vẫn âm khi cộng 1 sai số chuẩn) → thành BÀI HỌC,
// các tín hiệu sau có đặc điểm đó bị bỏ. Tín hiệu bị bỏ vẫn được theo dõi "bóng": khi đặc điểm hết xấu, bài học tự gỡ.
export const TAGS = {
  "adx:<20": "thị trường đi ngang (ADX < 20)", "adx:20-30": "xu hướng vừa (ADX 20–30)", "adx:>30": "xu hướng mạnh (ADX > 30)",
  "vol:low": "biến động thấp", "vol:mid": "biến động trung bình", "vol:high": "biến động cao",
  "ext:0-1": "giá sát EMA50 (< 1 ATR)", "ext:1-2": "giá cách EMA50 1–2 ATR",
  "sl:2-3": "SL 2–3 ATR", "sl:>3": "SL rộng > 3 ATR",
  "ses:A": "phiên Á (7h–14h VN)", "ses:EU": "phiên Âu (14h–19h VN)", "ses:US": "phiên Mỹ (19h–7h VN)",
  "side:L": "lệnh LONG", "side:S": "lệnh SHORT",
  "slope:with": "EMA50 dốc cùng hướng lệnh", "slope:against": "EMA50 dốc NGƯỢC hướng lệnh",
  "body:weak": "nến tín hiệu thân yếu (< 40% biên độ)", "body:strong": "nến tín hiệu thân mạnh",
  "kv:yes": "tại vùng Key Volume (top 3 volume 100 nến)", "kv:top1": "tại nến volume lớn nhất 100 nến", "kv:no": "KHÔNG ở vùng Key Volume (lơ lửng)",
  "pull:low": "nhịp hồi volume thấp (test cạn cung/cầu)", "pull:high": "nhịp hồi volume cao (chưa cạn)",
  "sig:climax": "nến tín hiệu volume siêu cao + râu ngược (climax ngược hướng)",
  "box:mid": "giữa hộp sideway (biên 20 nến < 2.5 ATR)", "box:edge": "rìa hộp sideway", "box:no": "không sideway",
  "room:low": "sát cản đối diện (< 2R tới đỉnh/đáy 50 nến)", "room:ok": "đủ chỗ chạy ≥ 2R",
  "sweep:yes": "SM đã quét thanh khoản trước đó (20 nến)", "sweep:no": "chưa có cú quét thanh khoản",
  "svol:hi": "nến tín hiệu volume > TB20", "svol:lo": "nến tín hiệu volume thấp",
  "fvg:yes": "có FVG cùng hướng (10 nến)", "fvg:no": "không có FVG",
  "pa:engulf": "nến xác nhận Engulfing", "pa:pin": "nến xác nhận Pin bar", "pa:none": "không có mẫu nến xác nhận",
  "kv:react": "tại Key Volume + volume kích lại + từ chối giá",
  "htf:all": "H1 + H4 + D1 cùng hướng", "htf:mixed": "khung lớn không đồng thuận", "d1:with": "D1 cùng hướng", "d1:against": "D1 ngược hướng",
};
// Key Volume (bộ kiến thức): nến volume đột biến — mạnh nhất là nến volume LỚN NHẤT 100 nến ("dấu chân cá mập"); SM vào đâu sẽ bảo vệ ở đó.
// Lấy `top` nến volume lớn nhất trong 100 nến trước (≥ 2.5× TB20); true nếu GIÁ VÀO (đóng nến tín hiệu) nằm trong vùng [low, high] của nến đó (đệm 0.1 ATR).
export function atKeyVolume(f, i, top = 3, px = null) {
  const a = f.atr[i], p = px ?? f.C[i], idx = [];
  for (let k = Math.max(1, i - 100); k <= i - 3; k++) if (f.V[k] >= 2.5 * f.vma[k]) idx.push(k);
  idx.sort((x, y) => f.V[y] - f.V[x]);
  return idx.slice(0, top).some((k) => p >= f.L[k] - 0.1 * a && p <= f.H[k] + 0.1 * a);
}
function tagsOf(K, i, side, sl, f) {
  const a = f.atr[i], [, o, h, l, c] = K[i], t = [];
  const adx = f.adx[i]; t.push(adx < 20 ? "adx:<20" : adx <= 30 ? "adx:20-30" : "adx:>30");
  const w = f.atr.slice(Math.max(0, i - 100), i).sort((x, y) => x - y), pc = w.length ? w.filter((x) => x < a).length / w.length : 0.5;
  t.push(pc < 0.33 ? "vol:low" : pc > 0.67 ? "vol:high" : "vol:mid");
  const ext = Math.abs(c - f.e50[i]) / a; t.push(ext < 1 ? "ext:0-1" : "ext:1-2");
  const sa = Math.abs(c - sl) / a; t.push(sa <= 3 ? "sl:2-3" : "sl:>3");
  const hr = new Date(K[i][0] + (K[1][0] - K[0][0])).getUTCHours(); t.push(hr < 7 ? "ses:A" : hr < 12 ? "ses:EU" : "ses:US");
  t.push(side === 1 ? "side:L" : "side:S");
  t.push((f.e50[i] - f.e50[Math.max(0, i - 10)]) * side >= 0 ? "slope:with" : "slope:against");
  t.push(Math.abs(c - o) / (h - l || 1e-9) < 0.4 ? "body:weak" : "body:strong");
  t.push(atKeyVolume(f, i, 3) ? "kv:yes" : "kv:no");
  if (atKeyVolume(f, i, 1)) t.push("kv:top1");
  t.push((f.V[i - 1] + f.V[i - 2] + f.V[i - 3]) / 3 < 0.8 * f.vma[i] ? "pull:low" : "pull:high");
  const wickAgainst = side === 1 ? h - Math.max(o, c) : Math.min(o, c) - l;
  if (f.V[i] >= 3 * f.vma[i] && wickAgainst / (h - l || 1e-9) >= 0.5) t.push("sig:climax");
  // Sideway: biên 20 nến < 2.5 ATR → chỉ đánh ở rìa (30% trên/dưới), giữa hộp = đứng ngoài
  let bh = -Infinity, bl = Infinity; for (let k = i - 19; k <= i; k++) { bh = Math.max(bh, f.H[k]); bl = Math.min(bl, f.L[k]); }
  if (bh - bl < 2.5 * a) { const pos = (c - bl) / (bh - bl || 1e-9); t.push(pos > 0.3 && pos < 0.7 ? "box:mid" : "box:edge"); } else t.push("box:no");
  // Chỗ chạy tới cản đối diện (đỉnh/đáy 50 nến trước) tính theo R
  const risk = Math.abs(c - sl) || 1e-9; let opp = side === 1 ? -Infinity : Infinity;
  for (let k = i - 50; k <= i - 2; k++) opp = side === 1 ? Math.max(opp, f.H[k]) : Math.min(opp, f.L[k]);
  const room = ((opp - c) * side) / risk; t.push(room > 0 && room < 2 ? "room:low" : "room:ok");
  // SM đã quét thanh khoản (râu thủng đáy/đỉnh 20 nến rồi đóng lại) trong 20 nến trước, cùng phía với lệnh
  let swept = false;
  for (let k = i - 20; k <= i && !swept; k++) { let m = side === 1 ? Infinity : -Infinity; for (let q = k - 20; q < k; q++) m = side === 1 ? Math.min(m, f.L[q]) : Math.max(m, f.H[q]); if (side === 1 ? f.L[k] < m && f.C[k] > m : f.H[k] > m && f.C[k] < m) swept = true; }
  t.push(swept ? "sweep:yes" : "sweep:no");
  t.push(f.V[i] > f.vma[i] ? "svol:hi" : "svol:lo");
  let fvg = false; for (let k = i - 9; k < i; k++) if (side === 1 ? f.L[k + 1] > f.H[k - 1] : f.H[k + 1] < f.L[k - 1]) fvg = true;
  t.push(fvg ? "fvg:yes" : "fvg:no");
  const pb = f.C[i - 1] - f.O[i - 1], engulf = (c - o) * side > 0 && pb * side < 0 && Math.abs(c - o) >= Math.abs(pb) && (side === 1 ? c >= f.O[i - 1] : c <= f.O[i - 1]);
  const rejWick = side === 1 ? Math.min(o, c) - l : h - Math.max(o, c);
  t.push(engulf ? "pa:engulf" : rejWick / (h - l || 1e-9) >= 0.5 ? "pa:pin" : "pa:none");
  if (atKeyVolume(f, i, 1) && f.V[i] >= 1.5 * f.vma[i] && rejWick / (h - l || 1e-9) >= 0.3) t.push("kv:react");
  return t;
}

export const LEVELS = ["cặp + khung + setup", "khung + setup (mọi cặp)", "setup (mọi cặp, khung)", "cả khung giờ đang âm"];

// ---------------- Chạy cả phiên ----------------
// session: { startAt, stoppedAt?, cfg } · onProgress(text)
// Trả về dữ liệu THÔ (lệnh theo R); finalize() ghép giá realtime + tính danh mục.
export async function runSession(session, onProgress = () => {}) {
  const cfg = cfgOf(session);
  const until = session.stoppedAt || Date.now(), startAt = session.startAt;
  const learnFrom = cfg.adaptive ? startAt - cfg.warmupDays * 86400000 : startAt;
  const V = variantsOf(cfg), baseVi = V.findIndex((v) => v.rr === cfg.rr && v.beAtR === cfg.beAtR);
  const skipped = {}, streams = [], shadows = [], pending = [], skipLog = []; // skipLog: tín hiệu gần đây bị bỏ + lý do (giải thích 'vì sao chưa có lệnh')
  const bump = (k, n = 1) => { if (n) skipped[k] = (skipped[k] || 0) + n; };
  // tải song song mọi cặp × khung (kể cả khung lớn để lọc) — lần sau chỉ tải phần nến mới
  const need = new Map();
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    need.set(`${coin}|${tf}`, [SYMBOLS[coin], tf, learnFrom - 260 * TFS[tf].ms]);
    for (const h of ["1h", "4h", "1d"]) need.set(`${coin}|${h}`, [SYMBOLS[coin], h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - 260 * TFS[h].ms)]);
    if (cfg.htfFilter) { const h = TFS[tf].htf; need.set(`${coin}|${h}`, [SYMBOLS[coin], h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - 260 * TFS[h].ms)]); }
  }
  onProgress(`Tải nến ${need.size} luồng…`);
  let done = 0, bars = 0;
  const say = () => onProgress(`Tải nến ${done}/${need.size} luồng${bars ? ` · đã tải ${bars.toLocaleString("vi-VN")} nến mới` : ""}…`);
  pageHook = (n) => { bars += n; say(); };
  const fund = {};
  try {
    await Promise.all([
      ...[...need.values()].map(([sym, tf, from]) => loadKlines(sym, tf, from).then(() => { done++; say(); })),
      ...cfg.coins.map((c) => loadFunding(SYMBOLS[c], learnFrom - 86400000).then((r) => { fund[c] = fundingSum(r); }).catch(() => { fund[c] = () => 0; })), // lỗi tải funding → bỏ qua (không chặn bot)
    ]);
  }
  finally { pageHook = null; }
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
      const kept = new Set(keep); for (const x of sig) if (!kept.has(x) && K[x.i][0] >= startAt) skipLog.push({ t: K[x.i][0], coin, tf, setup: x.setup, side: x.side, why: "ngược xu hướng khung lớn" });
      sig = keep;
    }
    // Bias các khung lớn (H1, H4, D1) tại lúc nến tín hiệu đóng — chỉ để xác định xu hướng
    const biasFns = {};
    for (const h of ["1h", "4h", "1d"]) {
      const hs = TFS[h].ms, HK = (await loadKlines(symbol, h, learnFrom - 260 * hs)).filter((k) => k[0] + hs <= until), he = emaArr(HK.map((k) => k[4]), 200);
      biasFns[h] = (t) => { let lo = 0, hi = HK.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (HK[m][0] + hs <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r < 200 ? 0 : HK[r][4] > he[r] ? 1 : HK[r][4] < he[r] ? -1 : 0; };
    }
    const htfTags = (s) => { const t = K[s.i][0] + step, b = ["1h", "4h", "1d"].map((h) => biasFns[h](t)); return [b.every((x) => x === s.side) ? "htf:all" : "htf:mixed", b[2] === s.side ? "d1:with" : "d1:against"]; };
    const endIdx = K.length - 1, last = K[endIdx][4], lastBarAt = K[endIdx][0];
    for (const s of sig) {
      const tags = [...tagsOf(K, s.i, s.side, s.sl, found), ...htfTags(s)], live0 = K[s.i][0] >= startAt;
      // v6: tiêu chí bộ kiến thức trước đây bot bỏ qua (đã kiểm chứng 90 & 180 ngày, cả 2 nửa kỳ)
      const veto = cfg.sigVol && tags.includes("svol:lo") ? "nến tín hiệu volume thấp (VSA: thiếu xác nhận)"
        : cfg.noEngulf && tags.includes("pa:engulf") ? "vào ngay sau nến engulfing lớn (đuổi giá)"
        : cfg.d1Bias && tags.includes("d1:against") ? "ngược xu hướng D1" : null;
      if (veto) { if (live0) { bump(veto); skipLog.push({ t: K[s.i][0], coin, tf, setup: s.setup, side: s.side, why: veto }); } continue; }
      const sims = V.map((v) => simTrade(K, s, { ...cfg, rr: v.rr, beAtR: v.beAtR }, atr, endIdx, found.e50, found));
      if (!sims[0]) continue;
      if (sims[0].pending) { if (K[s.i][0] >= startAt) pending.push({ id: `${coin}-${tf}-${K[s.i][0]}-${s.setup}`, key, coin, tf, setup: s.setup, note: s.note, signalAt: K[s.i][0], tags, cell: `${coin}|${tf}|${s.setup}`, grp: `${tf}|${s.setup}`, ...sims[0].pending }); continue; }
      if (sims[0].skip) { if (K[s.i][0] >= startAt) { bump(sims[0].skip); skipLog.push({ t: K[s.i][0], coin, tf, setup: s.setup, side: s.side, why: sims[0].skip }); } continue; }
      // PHÍ FUNDING: giữ lệnh qua mốc funding → LONG trả khi tỉ lệ dương (SHORT nhận), tính theo R; cộng vào tổng phí
      for (const t of sims) {
        if (!t || t.skip) continue;
        const from = K[t.entryIdx][0], to = t.open ? until : K[t.exitIdx][0] + step;
        const fR = (fund[coin] ? fund[coin](from, to) : 0) * s.side * t.entry / t.risk;
        t.fundR = fR; t.feeR += fR; if (t.r != null) t.r -= fR;
      }
      const entryAt = K[sims[0].entryIdx][0];
      const build = (vi, extra) => {
        const t = sims[vi];
        return {
          id: `${coin}-${tf}-${K[s.i][0]}-${s.setup}`, key, coin, tf, setup: s.setup, side: s.side, note: s.note,
          signalAt: K[s.i][0], entryAt, entry: t.entry, sl: t.sl, curSl: t.curSl, tp: t.tp, risk: t.risk, rr: t.rr, beAtR: t.beAtR,
          exitAt: t.open ? null : K[t.exitIdx][0] + step, exit: t.open ? null : t.exit, reason: t.open ? "Đang mở" : t.reason, be: t.be,
          r: t.r, part: t.part, fundR: t.fundR || 0, uR: t.open ? uRof(t.part, t.entry, last, s.side, t.risk, t.feeR) : null, last, lastBarAt, feeR: t.feeR, mfe: t.mfe, mae: t.mae, ...extra,
        };
      };
      shadows.push({ tags, key, cell: `${coin}|${tf}|${s.setup}`, grp: `${tf}|${s.setup}`, setup: s.setup, coin, tf, entryAt, live: entryAt >= startAt, build, x: sims.map((t) => (t.open ? Infinity : K[t.exitIdx][0] + step)), r: sims.map((t) => t.r) });
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
  // Cổng theo KHUNG GIỜ: kỳ vọng gần đây của cả khung (mọi cặp, setup; cấu hình gốc) âm → tạm nghỉ khung đó
  const tfIdx = new Map();
  for (const sh of shadows) { if (sh.r[baseVi] == null) continue; let a = tfIdx.get(sh.tf); if (!a) tfIdx.set(sh.tf, (a = [])); a.push({ x: sh.x[baseVi], r: sh.r[baseVi] }); }
  for (const a of tfIdx.values()) a.sort((p, q) => p.x - q.x);
  const tfExp = (tf, T) => { const a = tfIdx.get(tf) || [], c = upTo(a, T), w = a.slice(Math.max(0, c - cfg.lookback * 3), c); return w.length >= cfg.minSample * 2 ? { exp: w.reduce((s, x) => s + x.r, 0) / w.length, n: w.length } : null; };
  // Điểm 1 cấu hình = kỳ vọng − confK × sai số chuẩn (thận trọng: mẫu ít / dao động lớn → điểm thấp)
  const scoreOf = (w) => { const n = w.length, m = w.reduce((s, x) => s + x.r, 0) / n; if (!cfg.confK || n < 2) return { m, sc: m }; const sd = Math.sqrt(w.reduce((s, x) => s + (x.r - m) ** 2, 0) / (n - 1)); return { m, sc: m - (cfg.confK * sd) / Math.sqrt(n) }; };
  // Quyết định tại thời điểm T: chỉ dùng lệnh bóng đã ĐÓNG trước T (walk-forward)
  const decide = (keys, T, tf) => {
    if (cfg.tfGate) { const g = tfExp(tf, T); if (g && g.exp < 0) return { level: 3, vi: baseVi, exp: g.exp, n: g.n, win: null, take: false, why: "khung" }; }
    for (let l = 0; l < 3; l++) {
      const m = idx[l].get(keys[l]); if (!m) continue;
      const ev = m.map((a, vi) => { const c = upTo(a, T), w = a.slice(Math.max(0, c - cfg.lookback), c); if (!w.length) return { vi, n: 0 }; const { m: mean, sc } = scoreOf(w); return { vi, n: w.length, exp: mean, sc, win: w.filter((x) => x.r > 0.05).length / w.length }; }).filter((e) => e.n >= cfg.minSample);
      if (!ev.length) continue;
      const best = ev.sort((a, b) => b.sc - a.sc)[0];
      return { level: l, vi: best.vi, exp: best.exp, n: best.n, win: best.win * 100, take: best.sc >= cfg.minExp };
    }
    return { level: -1, vi: baseVi, exp: null, n: 0, win: null, take: true };
  };

  // Chỉ mục bài học: (phạm vi = tất cả | setup) × đặc điểm → [{x: lúc đóng, r}] theo cấu hình gốc
  const lessIdx = new Map(), lkeys = (sh) => sh.tags.flatMap((g) => [`*|${g}`, `${sh.setup}|${g}`]);
  for (const sh of shadows) { if (sh.r[baseVi] == null) continue; for (const k of lkeys(sh)) { let a = lessIdx.get(k); if (!a) lessIdx.set(k, (a = [])); a.push({ x: sh.x[baseVi], r: sh.r[baseVi] }); } }
  for (const a of lessIdx.values()) a.sort((p, q) => p.x - q.x);
  const lessonStat = (k, T) => {
    const a = lessIdx.get(k) || [], c = upTo(a, T), w = a.slice(Math.max(0, c - cfg.lessonN), c), n = w.length;
    if (n < cfg.lessonMin) return null;
    const m = w.reduce((x, y) => x + y.r, 0) / n, sd = Math.sqrt(w.reduce((x, y) => x + (y.r - m) ** 2, 0) / (n - 1));
    return { n, exp: m, win: (w.filter((y) => y.r > 0.05).length / n) * 100, bad: m <= -0.2 && m + sd / Math.sqrt(n) < 0 };
  };
  const lessonsAt = (sh, T) => (cfg.learnLoss ? lkeys(sh).map((k) => ({ k, ...lessonStat(k, T) })).filter((x) => x.bad) : []);
  const lessonLabel = (k) => { const [sc, g] = k.split("|"); return `${TAGS[g] || g}${sc === "*" ? "" : ` · ${SETUPS[sc]?.label.split(" (")[0] || sc}`}`; };
  const lessonOn = new Map(), lessons = [];
  // Tự kiểm chứng bài học: so kết quả (bóng) của tín hiệu BỊ bài học chặn với tín hiệu không bị chặn — chỉ ÁP DỤNG khi chặn thật sự giúp
  // Áp dụng chung cho BỘ TỐI ƯU (tắt ô / nghỉ khung): bộ lọc nào chặn mà tín hiệu bị chặn lại thắng hơn → tự tắt bộ lọc đó.
  const metaLog = []; // {x: lúc đóng, r, lesson: bị bài học chặn?, opt: bị bộ tối ưu chặn?}
  const works = (kind, T) => {
    const done = metaLog.filter((m) => m.x <= T), b = done.filter((m) => m[kind]).slice(-cfg.lessonN), k = done.filter((m) => !m[kind]).slice(-cfg.lessonN);
    if (b.length < cfg.lessonMin || k.length < cfg.lessonMin) return { ok: false, b: b.length, why: "đang thu thập" };
    const mb = b.reduce((x, y) => x + y.r, 0) / b.length, mk = k.reduce((x, y) => x + y.r, 0) / k.length;
    return { ok: mb < mk - 0.15, mb, mk, b: b.length };
  };
  const metaOn = { lesson: null, opt: null }, metaEvents = [];
  for (const sh of shadows) if (!sh.live && sh.r[baseVi] != null) metaLog.push({ x: sh.x[baseVi], r: sh.r[baseVi], lesson: lessonsAt(sh, sh.entryAt).length > 0, opt: !decide(keysOf(sh), sh.entryAt, sh.tf).take }); // tín hiệu trước ngày bắt đầu cũng được dùng để kiểm chứng
  const trades = [], baseTrades = [], rejected = [], optLog = [], cellState = new Map(), busyA = {}, busyB = {};
  for (const sh of shadows) {
    if (!sh.live) continue;
    if (!(sh.entryAt < (busyB[sh.key] ?? -1))) { const t = sh.build(baseVi); baseTrades.push(t); busyB[sh.key] = t.exitAt ?? Infinity; }
    if (!cfg.adaptive || sh.entryAt < (busyA[sh.key] ?? -1)) continue;
    const L = lessonsAt(sh, sh.entryAt);
    for (const x of L) if (!lessonOn.get(x.k)) { // bài học mới: gắn với lệnh thua gần nhất có đặc điểm này
      const lost = [...trades].reverse().find((t) => t.r != null && t.r < 0 && t.exitAt <= sh.entryAt && lkeys({ tags: t.tags, setup: t.setup }).includes(x.k));
      lessons.push({ t: sh.entryAt, k: x.k, label: lessonLabel(x.k), exp: x.exp, n: x.n, win: x.win, on: true, from: lost ? `${lost.coin} ${TFS[lost.tf].label} ${lost.side === 1 ? "LONG" : "SHORT"} ${(lost.r).toFixed(2)}R lúc ${new Date(lost.exitAt + 7 * 3600000).toISOString().slice(5, 16).replace("T", " ")}` : null });
      lessonOn.set(x.k, true);
    }
    for (const [k, on] of lessonOn) if (on && sh.tags && lkeys(sh).includes(k) && !L.some((x) => x.k === k)) { const st = lessonStat(k, sh.entryAt); lessons.push({ t: sh.entryAt, k, label: lessonLabel(k), exp: st?.exp, n: st?.n, win: st?.win, on: false }); lessonOn.set(k, false); }
    const d = decide(keysOf(sh), sh.entryAt, sh.tf);
    if (sh.r[baseVi] != null) metaLog.push({ x: sh.x[baseVi], r: sh.r[baseVi], lesson: L.length > 0, opt: !d.take });
    const mw = { lesson: cfg.learnLoss ? works("lesson", sh.entryAt) : { ok: false }, opt: cfg.verifyOpt ? works("opt", sh.entryAt) : { ok: true } };
    for (const kind of ["lesson", "opt"]) if (mw[kind].ok !== metaOn[kind]) { if (metaOn[kind] != null || mw[kind].ok) metaEvents.push({ t: sh.entryAt, kind, on: mw[kind].ok, ...mw[kind] }); metaOn[kind] = mw[kind].ok; }
    if (L.length && mw.lesson.ok) { rejected.push(sh.build(baseVi, { tags: sh.tags, status: "reject", why: `bài học: ${L.map((x) => lessonLabel(x.k)).join("; ")}` })); continue; }
    if (!d.take && !mw.opt.ok) { d.take = true; d.vi = baseVi; d.overruled = true; } // bộ tối ưu muốn bỏ nhưng chưa chứng minh được là đúng → vẫn vào theo luật gốc
    const prev = cellState.get(sh.cell), cur = d.take ? `on:${d.vi}` : "off";
    if (prev !== cur) {
      optLog.push({ t: sh.entryAt, cell: sh.cell, coin: sh.coin, tf: sh.tf, setup: sh.setup, take: d.take, variant: V[d.vi].label, exp: d.exp, n: d.n, level: d.level, first: prev == null, prevOn: prev ? prev !== "off" : null });
      cellState.set(sh.cell, cur);
    }
    const score = { exp: d.exp, n: d.n, level: d.level, variant: V[d.vi].label, overruled: d.overruled };
    if (d.take) { const t = sh.build(d.vi, { score, tags: sh.tags }); trades.push(t); busyA[sh.key] = t.exitAt ?? Infinity; }
    else rejected.push(sh.build(baseVi, { score, tags: sh.tags, status: "reject", why: d.why === "khung" ? `khung ${sh.tf} đang âm ${d.exp.toFixed(2)}R` : `kỳ vọng ${d.exp.toFixed(2)}R / ${d.n} lệnh gần nhất` }));
  }

  // Trạng thái bộ tối ưu tại hiện tại cho từng ô đã có tín hiệu
  const seen = new Map(); for (const sh of shadows) seen.set(sh.cell, sh);
  const optState = [...seen.values()].map((sh) => { const d = decide(keysOf(sh), until, sh.tf); return { cell: sh.cell, coin: sh.coin, tf: sh.tf, setup: sh.setup, ...d, variant: V[d.vi].label }; })
    .sort((a, b) => (b.take - a.take) || ((b.exp ?? -9) - (a.exp ?? -9)));

  // Rút kinh nghiệm từng lệnh thua: đặc điểm nào của lệnh có lịch sử tệ nhất tại lúc đóng lệnh
  for (const t of trades) if (t.r != null && t.r < -0.05) {
    const st = lkeys({ tags: t.tags || [], setup: t.setup }).map((k) => ({ k, ...lessonStat(k, t.exitAt) })).filter((x) => x.n).sort((p, q) => p.exp - q.exp)[0];
    if (st) t.lesson = `${lessonLabel(st.k)}: ${st.n} lệnh gần nhất thắng ${st.win.toFixed(0)}%, TB ${st.exp >= 0 ? "+" : ""}${st.exp.toFixed(2)}R${st.bad ? " → đã thành bài học, sẽ tránh" : st.exp < 0 ? " → đang theo dõi" : " → chưa đủ xấu, có thể do ngẫu nhiên"}`;
  }
  const metaNow = { lesson: cfg.learnLoss ? works("lesson", until) : null, opt: cfg.verifyOpt ? works("opt", until) : null };
  // Lệnh chờ đang mở (bot thật đặt lên sàn) đi qua ĐÚNG bộ quyết định như demo: bài học + bộ tối ưu (khi đã được kiểm chứng) + R:R chọn
  if (cfg.adaptive) for (const p of pending) {
    const sh = { tags: p.tags, setup: p.setup, cell: p.cell, grp: p.grp }, L = lessonsAt(sh, p.signalAt), d = decide(keysOf(sh), p.signalAt, p.tf);
    if (L.length && metaNow.lesson?.ok) { p.blocked = `bài học: ${L.map((x) => lessonLabel(x.k)).join("; ")}`; continue; }
    if (!d.take && (!cfg.verifyOpt || metaNow.opt?.ok)) { p.blocked = d.why === "khung" ? `khung ${p.tf} đang âm` : `bộ tối ưu: kỳ vọng ${d.exp?.toFixed(2)}R`; continue; }
    p.rr = d.take && d.level >= 0 ? V[d.vi].rr : cfg.rr;
  }
  const lessonsActive = [...lessonOn].filter(([, on]) => on).map(([k]) => ({ k, label: lessonLabel(k), ...lessonStat(k, until) }));
  const tfState = cfg.tfs.map((tf) => ({ tf, ...(tfExp(tf, until) || { exp: null, n: 0 }), pause: cfg.tfGate && (tfExp(tf, until)?.exp ?? 0) < 0 }));
  for (const r of rejected) skipLog.push({ t: r.signalAt, coin: r.coin, tf: r.tf, setup: r.setup, side: r.side, why: r.why || "bộ tối ưu loại" });
  skipLog.sort((a, b) => b.t - a.t); skipLog.length = Math.min(skipLog.length, 400);
  return { cfg, startAt, until, stopped: !!session.stoppedAt, tfState, pending, skipLog, lessons, lessonsActive, metaNow, metaEvents, trades: cfg.adaptive ? trades : baseTrades, baseTrades, rejected, optLog, optState, skipped, streams, learned: shadows.filter((s) => !s.live).length, at: Date.now() };
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
    return { ...t, exit, exitAt: hits.get(t.id), reason: hitSl ? (t.be ? (t.part ? "Chốt 1 nửa + hoà vốn" : "Hoà vốn") : "Cắt lỗ") : "Chốt lời", r: uRof(t.part, t.entry, exit, side, t.risk, t.feeR), uR: null, last: bar.c, liveExit: true };
  }
  return { ...t, last: bar.c, uR: uRof(t.part, t.entry, bar.c, side, t.risk, t.feeR), mfe: Math.max(t.mfe || 0, (((side === 1 ? bar.h : bar.l) - t.entry) * side) / t.risk) };
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
    feeR: avg(done, (t) => t.feeR), fundR: avg(done, (t) => t.fundR || 0), reasons,
  };
}
