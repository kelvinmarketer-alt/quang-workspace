// GIAO DỊCH DEMO TỰ ĐỘNG (giả lập Futures Binance) theo BỘ KIẾN THỨC của Quang (lib/tradeKnowledge.js).
// Luật CỐ ĐỊNH (deterministic): chạy lại bao nhiêu lần cũng ra cùng kết quả → đo được tỉ lệ thắng thật của phương pháp.
// Chỉ dùng NẾN ĐÃ ĐÓNG, vào lệnh ở giá mở nến kế tiếp, SL & TP chạm cùng nến → tính THUA, có phí + trượt giá.
// Phiên chạy từ ngày bắt đầu (lùi 1–2 tháng) tới hiện tại và tiếp tục mỗi khi có nến mới, cho tới khi chủ bấm Dừng.
// TỰ TỐI ƯU (walk-forward, không nhìn trước tương lai): mỗi tín hiệu được mô phỏng "bóng" với 6 cấu hình (R:R × dời hoà vốn);
// lúc có tín hiệu mới, bộ tối ưu CHỈ xét các lệnh bóng ĐÃ ĐÓNG trước thời điểm đó → chọn cấu hình kỳ vọng cao nhất,
// kỳ vọng âm thì bỏ tín hiệu. Chạy song song "Luật gốc" để so sánh bộ tối ưu giúp hay hại.

export const TFS = { "5m": { label: "M5", ms: 300000, htf: "1h" }, "15m": { label: "M15", ms: 900000, htf: "4h" }, "1h": { label: "H1", ms: 3600000, htf: "4h" }, "4h": { label: "H4", ms: 14400000, htf: "1d" }, "1d": { label: "D1", ms: 86400000 }, "1w": { label: "W1", ms: 604800000 } };
export const SYMBOLS = { BTC: "BTCUSDT", ETH: "ETHUSDT", XAU: "XAUUSDT" }; // cặp mặc định; cặp do user thêm = <MÃ>USDT (Binance USDⓈ-M)
export const symOf = (c) => SYMBOLS[c] || `${String(c || "").toUpperCase()}USDT`;
export const MAX_COINS = 18; // 06/11: phương án D chạy 18 mã
export const SETUPS = {
  TREND: { label: "Thuận xu hướng (TREND_CONFIRM)", desc: "Giá trên/dưới EMA200 + EMA50 cùng hướng, ADX ≥ 20; hồi về EMA50 → nến tín hiệu (engulfing/nến lớn ≥0.8 ATR, volume > TB20) → nến xác nhận đóng vượt nến tín hiệu." },
  SFP: { label: "Quét thanh khoản (SFP)", desc: "Râu quét qua đỉnh/đáy swing (cao nhất/thấp nhất 20 nến) rồi đóng cửa quay lại, râu ≥40% thân nến, volume ≥ 1.5× TB20." },
  BREAKOUT: { label: "Breakout 2 nến (EA)", desc: "Nến thân dài (≥60% biên) + volume ≥1.5× TB20 đóng vượt đỉnh/đáy 20 nến, thuận EMA200; nến kế cùng màu đóng vượt nến phá vỡ mới vào." },
  SMC: { label: "Đảo chiều SMC (CHoCH → OB)", desc: "Cấu trúc đang giảm (tăng) bị phá bằng nến đóng vượt đỉnh (đáy) swing = CHoCH; chờ giá hồi về Order Block khởi nguồn + nến từ chối → vào." },
  SW3: { label: "Swing H4 phá vỡ 30 nến (SW3)", desc: "Nến H4 đóng vượt đỉnh/đáy 30 nến ≥ 0,3 ATR, volume ≥ 1,3× TB20, thuận EMA200 H4 của mã và EMA50 D1 của BTC, cú phá vỡ đầu tiên của nhịp. Cắt lỗ 2 ATR, chốt 1/3 ở +0,75R rồi hoà vốn, phần còn lại dời theo đáy/đỉnh 20 nến." },
};

// ---------------- PHƯƠNG PHÁP SW3 (sếp duyệt 06/11/2026, rủi ro 1%/lệnh) ----------------
// Chọn bằng walk-forward 2.880 cấu hình trên 8 năm (2018–11/2026, 8 mã): 2020–2026 kiểm ngoài mẫu 7/7 năm lãi.
// Báo cáo: ~/Desktop/Phuong-phap-coin-moi.html. Bộ máy khớp từng bước với bộ kiểm thử nghiên cứu (scratchpad bt10/eng.mjs):
// vào giá mở nến kế, phí lệnh thị trường 0,05% + trượt 0,02%, chốt 1/3 bằng lệnh giới hạn 0,02%, funding thật trên cả vị thế.
export const SW3_DEFAULT = {
  strategy: "sw3", cfgVer: 13, capital: 1000, riskPct: 1, maxOpen: 4, maxLev: 20, dailyStopPct: 0, feePct: 0.05, makerPct: 0.02, slipPct: 0.02,
  coins: ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "LTC", "DOGE"], tfs: ["4h"], setups: ["SW3"], adaptive: false, learnLoss: false, offStreams: [],
  sw: { brkN: 30, brkAtr: 0.3, volX: 1.3, volN: 20, emaH4: 200, btcEma: 50, stopAtr: 2, partR: 0.75, partFrac: 1 / 3, trailN: 20 },
};
export const isSW3 = (session) => session?.cfg?.strategy === "sw3";
// 5 tiêu chí vào lệnh + quản lý lệnh — dùng chung cho thẻ "Luật" trong app và nhãn từng lệnh
export const SW3_RULES = [
  { k: "brk", t: "Phá đỉnh/đáy 30 nến H4", d: "Nến H4 đóng cửa CAO hơn mọi đỉnh của 30 nến H4 trước (≈ 5 ngày) thì xét MUA; THẤP hơn mọi đáy 30 nến trước thì xét BÁN. Chỉ tính nến đã đóng." },
  { k: "str", t: "Cú phá vỡ đủ mạnh", d: "Giá đóng cửa vượt mức đỉnh/đáy cũ ít nhất 0,3 ATR(14) H4. Cú phá chỉ chạm nhẹ hay bị bỏ vì dễ là phá vỡ giả." },
  { k: "vol", t: "Có volume xác nhận", d: "Volume nến phá vỡ ≥ 1,3 lần trung bình 20 nến H4 trước đó." },
  { k: "trend", t: "Thuận xu hướng 2 khung", d: "MUA khi giá mã trên EMA200 H4 (≈ 33 ngày) VÀ giá đóng ngày của BTC trên EMA50 D1. BÁN khi cả hai cùng dưới. Lệch một trong hai thì bỏ." },
  { k: "first", t: "Cú phá vỡ đầu tiên của nhịp", d: "Mã vừa có một cú phá vỡ (kể cả cú không đạt lọc) mà nhịp đó chưa kết thúc theo luật thoát bên dưới thì bỏ qua cú phá vỡ mới. Mỗi mã chỉ 1 lệnh một lúc." },
];
export const SW3_MANAGE = [
  "Vào lệnh thị trường ngay khi nến tín hiệu đóng (giá mở nến H4 kế).",
  "Cắt lỗ cách giá vào 2 ATR(14) H4, đặt ngay trên sàn.",
  "Lời +0,75R: chốt 1/3 vị thế bằng lệnh giới hạn đặt sẵn, rồi dời cắt lỗ về giá vào (hoà vốn).",
  "Phần còn lại: sau mỗi nến H4 đóng, dời cắt lỗ lên đáy thấp nhất 20 nến H4 gần nhất (lệnh BÁN: đỉnh cao nhất), chỉ dời theo hướng có lợi, tới khi bị chạm.",
  "Rủi ro 1% vốn/lệnh, tối đa 4 lệnh mở, mỗi mã 1 lệnh. Không chốt lời cố định, không đóng theo thời gian.",
];
// ---------------- PHƯƠNG ÁN D (sếp duyệt 06/11/2026): SW3 + điểm vào lệnh chờ M15 + 18 mã ----------------
// Kiểm thử 2018–11/2026 (scratchpad bt10 sw.mjs/sw_final.py, báo cáo ~/Desktop/Kiem-thu-da-khung-M5-M15.html): ~18,5 lệnh/tháng,
// rủi ro 0,85%/0,45%: 48%/năm (2018–23), 69%/năm (2024–26), sụt lớn nhất 24%. Tín hiệu giữ nguyên 5 tiêu chí SW3; chỉ khác cách vào + danh sách mã.
export const SW3D_COINS2 = ["LINK", "AVAX", "DOT", "TRX", "ATOM", "ETC", "BCH", "NEAR", "XLM", "UNI"]; // 10 mã mới (chọn trước khi xem kết quả) — ½ rủi ro
export const SW3D_DEFAULT = {
  ...SW3_DEFAULT, variant: "D", cfgVer: 14, riskPct: 0.85, maxOpen: 10,
  coins: [...SW3_DEFAULT.coins, ...SW3D_COINS2], riskByCoin: Object.fromEntries(SW3D_COINS2.map((c) => [c, 0.45])),
  sw: { ...SW3_DEFAULT.sw, entry: "lim", limAtr: 0.25, limH: 4 }, // lệnh chờ cách giá đóng 0,25 ATR, chờ 4 giờ (16 nến M15), không khớp → vào thị trường
};
export const isSW3D = (session) => isSW3(session) && session?.cfg?.sw?.entry === "lim";
export const SW3D_MANAGE = [
  "Nến H4 đạt đủ 5 tiêu chí → đặt LỆNH CHỜ cách giá đóng nến 0,25 ATR theo hướng có lợi (MUA thấp hơn, BÁN cao hơn).",
  "Theo dõi nến M15: giá hồi chạm thì khớp (phí thấp). Hết 4 giờ (16 nến M15) chưa khớp → vào lệnh thị trường để không lỡ cú chạy.",
  "Cắt lỗ cách giá vào 2 ATR(14) H4, đặt ngay trên sàn.",
  "Lời +0,75R: chốt 1/3 vị thế bằng lệnh giới hạn đặt sẵn, rồi dời cắt lỗ về giá vào (hoà vốn).",
  "Phần còn lại: dời cắt lỗ theo đáy thấp nhất 20 nến H4 đã đóng (lệnh BÁN: đỉnh cao nhất), chỉ dời theo hướng có lợi.",
  "Rủi ro 0,85% vốn/lệnh cho 8 mã cũ, 0,45% cho 10 mã mới (LINK, AVAX, DOT, TRX, ATOM, ETC, BCH, NEAR, XLM, UNI); tối đa 10 lệnh mở, mỗi mã 1 lệnh.",
];
export const sw3Manage = (cfg) => (cfg?.sw?.entry === "lim" ? SW3D_MANAGE : SW3_MANAGE);

// Mặc định đề xuất cho vốn 1.000$ (bản 2 — đã kiểm tra walk-forward 30–150 ngày, xem ghi chú dưới)
export const DEFAULT_CFG = {
  cfgVer: 12,
  capital: 1000, riskPct: 2, maxOpen: 3, maxLev: 20, dailyStopPct: 6, // v7 (user chốt 20/10): rủi ro 2%/lệnh, dừng ngày -6% (= 3 lệnh thua)
  // v12 (sếp chốt 30/10): BREAKOUT + SFP (2 setup yếu, thất thường) rủi ro 1%, TREND/SMC giữ 2%. 6 kỳ 90 ngày (gồm kỳ kiểm chứng 450–360):
  // vốn 1291/1074/1082/1216/1427/1598 → 1271/1113/1097/1222/1511/1708$ (hơn 5/6), sụt vốn lớn nhất thấp hơn cả 6/6 (32/19/23/26/27/27 → 29/19/22/24/26/24%), số lệnh không đổi.
  // Cùng đợt (KHÔNG áp): tối đa 1 lệnh crypto cùng hướng (sụt vốn −⅓ nhưng ít lệnh, lãi hơn 3/6), thêm coin DOGE/APT (riêng lẻ dương, ghép danh mục kém), cắt theo thời gian 48/144 nến, chờ khớp 5 nến, 4 lệnh mở.
  riskBySetup: { BREAKOUT: 1, SFP: 1 }, // % rủi ro riêng theo setup (không vượt riskPct)
  streakN: 0, streakRiskPct: 1, // v10 (user chốt 21/10 "mọi vấn đề đều là xác suất, cứ để risk 2%"): TẮT giảm rủi ro sau chuỗi thua — rủi ro cố định. (v9 từng bật: thua 3 liền → 1%.) 270 ngày: vốn cả 3 kỳ cao hơn (1207/1385/1491 → 1231/1410/1553$), sụt vốn tối đa 13–15% → 11%
  // Thử 21/10 (mặc định TẮT, bot thật chưa hỗ trợ): thả TP trailAtR/trailAtr/trailLockR và cắt khi đảo chiều revExit/revMinR — thắng nhiều hơn nhưng R & lợi nhuận GIẢM ở cả 3 kỳ.
  // Dời SL về entry (beAtR) ở 0,5R / 0,75R / 1R: lợi nhuận cả 3 kỳ giảm mạnh (0,5R: R +0,38 → +0,11, vốn 1207/1385/1491 → 1098/1118/1056$) → giữ beAtR 0
  trailAtR: 0, revExit: 0,
  rr: 2, beAtR: 0, timeStopBars: 96, feePct: 0.05, makerPct: 0.02, slipPct: 0.02, maxFeeR: 0.35, // bỏ lệnh khi phí 2 chiều > 0.35R (SL quá sát)
  sigVol: false, noEngulf: true, d1Bias: true, // v6: bỏ vào ngay sau engulfing lớn · chỉ thuận D1 · v8: TẮT lọc volume nến tín hiệu (Key Volume vẫn xét volume)
  keyVolume: 1, // v5: chỉ vào khi giá vào nằm trong vùng nến volume LỚN NHẤT 100 nến (Key Volume) — 90 ngày: thắng 39%→47%, R −0.05→+0.19; 0 = tắt, 3 = top 3
  // v11 (sếp chốt 24/10): không đuổi giá nới 1,5 → 2,5 ATR. 3 kỳ 90 ngày (270–180 / 180–90 / 90 gần): vốn 1287/1112/1593 → 1390/1149/1510$,
  // sụt vốn lớn nhất 26/38/24% → 19/26/20,5%, lệnh 95/80/95 → 103/129/117. Cùng đợt thử (24/10, đều KHÔNG cải thiện → để tắt):
  // lọc cấu trúc sóng structure "break"/"swing" (± chỉ setup thuận), setup FTR tại Key Volume (± lọc cấu trúc) — lãi TB/kỳ 73–288$ so với 350$ gốc.
  maxExtAtr: 2.5, minSlAtr: 2, limitAt: "close", fillBars: 3, // v8: không đuổi giá siết 2 → 1,5 ATR // v3: không đuổi giá (≤2 ATR từ EMA50), SL ≥2 ATR (180 ngày: thắng 35%→44%, R −0.12→+0.13); lệnh chờ chờ 3 nến, không khớp → bỏ
  entryMode: "limit", // vào bằng LỆNH CHỜ ở giá đóng nến tín hiệu (phí maker, không trượt) — 180 ngày: R TB -0.23 → -0.11 so với vào giá thị trường
  partialAtR: 0, // chốt 50% ở +xR (0 = tắt)
  // Tự tối ưu: học thêm 90 ngày trước ngày bắt đầu; xét 60 lệnh gần nhất, cần ≥20 mẫu; điểm thận trọng = kỳ vọng − 1×sai số chuẩn ≥ 0 mới vào;
  // cổng khung giờ: cả khung đang âm thì nghỉ khung đó. Kiểm tra 30–150 ngày: vốn giữ 959–1.073$ trong khi luật gốc còn 530–813$.
  learnLoss: true, lessonN: 30, lessonMin: 15, verifyOpt: true, optVariants: false, // v4: tự kiểm chứng — bộ lọc chỉ được chặn khi tín hiệu nó chặn thật sự tệ hơn; giữ R:R cố định (chọn R:R theo kết quả gần đây làm giảm tỉ lệ thắng) // v4: rút kinh nghiệm từ lệnh thua (30 lệnh gần nhất có cùng đặc điểm, cần ≥15)
  adaptive: true, warmupDays: 0, lookback: 60, minSample: 20, minExp: -0.1, confK: 0, tfGate: true, // v3: luật vào đẹp đã lọc tín hiệu → tối ưu nhẹ tay (nghỉ khung đang lỗ + tắt ô âm rõ < -0.1R), thận trọng quá làm mất lệnh tốt
  htfFilter: false, // v8: TẮT lọc thuận H1/H4 — khung lớn chỉ để bias, bias = D1 (d1Bias). Bật lại: M5→H1, M15→H4 (EMA200)
  // v8 (user chốt 21/10, cần ≥10 lệnh/tháng): 270 ngày 3 kỳ: 7,7 → 14,6 lệnh/tháng, tháng ít nhất 3 → 12, thắng 55→50%, R +0,52→+0,38, lời +768$→+2.083$, sụt vốn tối đa 10→15%
  offStreams: [], // 21/10: tắt RIÊNG 1 khung của 1 cặp ("ARB|5m") — sếp bấm "Tắt khung" ở Demo → Thống kê; khung đó không quét / không vào lệnh (Demo + bot thật)
  coins: ["BTC", "ETH", "XAU"], tfs: ["5m", "15m"], setups: ["TREND", "SFP", "BREAKOUT", "SMC"], // v4: bỏ H4 mặc định (ít lệnh, 90 ngày hơi âm; bỏ H4 tốt hơn nhẹ)
};
// Cấu hình thực của 1 phiên: phiên tạo từ bản cũ (chưa có cfgVer 2) được nâng bộ tối ưu + cách vào lệnh lên bản mới, giữ vốn/rủi ro/cặp/khung/setup
const V12_KEYS = ["riskBySetup"];
const V11_KEYS = ["maxExtAtr"];
const V10_KEYS = ["streakN"];
const V9_KEYS = ["streakN", "streakRiskPct"];
const V8_KEYS = ["htfFilter", "sigVol", "maxExtAtr"];
const V7_KEYS = ["riskPct", "dailyStopPct", "d1Bias"];
const V6_KEYS = ["sigVol", "noEngulf", "d1Bias"];
const V5_KEYS = ["keyVolume"];
const V4_KEYS = ["learnLoss", "lessonN", "lessonMin", "verifyOpt", "optVariants", "warmupDays"];
const V3_KEYS = ["maxExtAtr", "minSlAtr", "limitAt", "fillBars", "entryMode", "minExp", "confK"];
const V2_KEYS = ["beAtR", "makerPct", "entryMode", "partialAtR", "warmupDays", "lookback", "minSample", "minExp", "confK", "tfGate", "maxFeeR", "cfgVer"];
export const MIN_RR = 1.5; // luật của Quang: R:R tối thiểu 1:1,5 — mọi mức chốt lời (kể cả chốt 1 nửa) không thấp hơn
const cleanCoins = (l, d) => { const c = [...new Set((l || []).map((x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean))].slice(0, MAX_COINS); return c.length ? c : [...d]; };
export function cfgOf(session) {
  if (isSW3(session)) { // SW3 có bộ cấu hình riêng — không đi qua các bước nâng phiên v2–v12 của bộ luật cũ
    const s = session.cfg, B = s.sw?.entry === "lim" ? SW3D_DEFAULT : SW3_DEFAULT; // phương án D = SW3 + lệnh chờ M15
    return { ...B, ...s, sw: { ...B.sw, ...(s.sw || {}) }, strategy: "sw3", cfgVer: B.cfgVer, tfs: ["4h"], setups: ["SW3"], adaptive: false, learnLoss: false, coins: cleanCoins(s.coins, B.coins) };
  }
  const c = { ...DEFAULT_CFG, ...(session?.cfg || {}) };
  const ver = session?.cfg?.cfgVer || 1;
  if (ver < 2) for (const k of V2_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 3) for (const k of V3_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 4) for (const k of V4_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 7) for (const k of V7_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 8) for (const k of V8_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 9) for (const k of V9_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 10) for (const k of V10_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 11) for (const k of V11_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 12) for (const k of V12_KEYS) c[k] = DEFAULT_CFG[k];
  if (ver < 6) { for (const k of V6_KEYS) c[k] = DEFAULT_CFG[k]; c.tfs = c.tfs.filter((x) => x === "5m" || x === "15m"); if (!c.tfs.length) c.tfs = DEFAULT_CFG.tfs; } // v6: chỉ vào lệnh M5/M15, khung lớn chỉ để xác định bias (user chốt 20/10)
  if (ver < 5) { for (const k of V5_KEYS) c[k] = DEFAULT_CFG[k]; c.tfs = c.tfs.filter((x) => x !== "4h"); if (!c.tfs.length) c.tfs = DEFAULT_CFG.tfs; } // v5: bỏ hẳn H4 (user chốt 20/10)
  c.coins = [...new Set((c.coins || []).map((x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean))].slice(0, MAX_COINS); if (!c.coins.length) c.coins = [...DEFAULT_CFG.coins]; // cặp do user chọn (thêm/sửa/xoá trong app)
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
// Bộ đệm nến TỰ LÀNH (21/10): mỗi lần tải luôn tải lại ~REFETCH nến gần nhất và GHI ĐÈ theo thời gian mở.
// Lý do: nến đã lưu trước đây không bao giờ được tải lại → máy có đồng hồ nhanh vài giây / Binance trả trễ có thể lưu 1 nến CHƯA ĐÓNG
// (thiếu giá/khối lượng) mãi mãi → Demo máy đó ra tín hiệu giả, khác máy khác và khác bot thật. "v2" = bỏ bộ đệm cũ, tải lại sạch 1 lần.
const KCACHE = "v2", REFETCH = 300;
async function loadKlines0(symbol, tf, fromTs) {
  const key = `${KCACHE}|${symbol}|${tf}`, step = TFS[tf].ms, now = Date.now();
  // 21/10: lần ĐẦU trong phiên chạy (tab / tiến trình bot) mới tải lại 300 nến để chữa bộ đệm trên đĩa; các lần sau nến trong RAM
  // đã được chính lần trước kiểm (chỉ nhận nến đóng ≥ 2 giây) → chỉ tải lại 20 nến cuối: nhanh hơn, nhẹ mạng, kết quả như nhau
  const warm = MEM.has(key), refetch = warm ? 20 : REFETCH;
  let rows = MEM.get(key) || (await idbGet(key)) || [];
  if (!rows.length || rows[0][0] > fromTs + step) rows = []; // cache bắt đầu muộn hơn mức cần → tải lại từ đầu
  else rows = rows.slice(0, Math.max(0, rows.length - refetch)); // bỏ ~300 nến cuối (lần đầu) / 20 nến (các lần sau) → tải lại bản chuẩn từ sàn
  let start = rows.length ? rows[rows.length - 1][0] + step : fromTs;
  for (let guard = 0; guard < 80 && start < now - step; guard++) {
    const limit = Math.min(1500, Math.max(2, Math.ceil((now - start) / step) + 1)); // phần mới ít → limit nhỏ (trọng số API thấp)
    const j = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${limit}&startTime=${start}`);
    pageHook?.(j.length);
    if (!j.length) break;
    for (const k of j) if (k[6] < now - 2000 && (!rows.length || k[0] > rows[rows.length - 1][0])) rows.push([k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]); // chỉ nến đã đóng ≥ 2 giây, không trùng
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
function findSignals(K, setups, opt = {}) {
  const n = K.length, O = K.map((k) => k[1]), H = K.map((k) => k[2]), L = K.map((k) => k[3]), C = K.map((k) => k[4]), V = K.map((k) => k[5]);
  const e200 = emaArr(C, 200), e50 = emaArr(C, 50), vma = smaArr(V, 20), { atr, adx } = atrAdx(H, L, C);
  const swHi = [], swLo = []; // swing (fractal 2-2) — xác nhận ở j+2
  const sig = [], on = (s) => setups.includes(s);
  const maxH = (a, b) => { let m = -Infinity; for (let k = Math.max(0, a); k <= b; k++) m = Math.max(m, H[k]); return m; };
  const minL = (a, b) => { let m = Infinity; for (let k = Math.max(0, a); k <= b; k++) m = Math.min(m, L[k]); return m; };
  let pendTrend = null, smc = null, ftr = null, w3 = null; const swept = new Set();
  // Cấu trúc sóng (24/10): ms[i] = hướng lần PHÁ cấu trúc gần nhất (đóng vượt swing high → 1, thủng swing low → -1; BOS hoặc CHoCH)
  // sw[i] = cấu trúc đỉnh/đáy: HH+HL → 1, LH+LL → -1, lẫn lộn → 0. Chỉ dùng swing ĐÃ xác nhận (không nhìn trước).
  const ms = new Array(n).fill(0), sw = new Array(n).fill(0); let msNow = 0;
  const lastSwing = (arr, i, ok) => { for (let q = arr.length - 1; q >= 0 && i - arr[q] <= 60; q--) if (ok(arr[q])) return arr[q]; return null; }; // swing gần nhất (≤60 nến) thoả điều kiện
  for (let i = 210; i < n; i++) {
    const j = i - 2; // nến j vừa được xác nhận là swing?
    if (H[j] > H[j - 1] && H[j] > H[j - 2] && H[j] >= H[j + 1] && H[j] >= H[j + 2]) swHi.push(j);
    if (L[j] < L[j - 1] && L[j] < L[j - 2] && L[j] <= L[j + 1] && L[j] <= L[j + 2]) swLo.push(j);
    const a = atr[i], body = Math.abs(C[i] - O[i]), rng = H[i] - L[i] || 1e-9, bull = C[i] > O[i], bear = C[i] < O[i];
    const hA = swHi[swHi.length - 1], hB = swHi[swHi.length - 2], lA = swLo[swLo.length - 1], lB = swLo[swLo.length - 2];
    const bosUp = hA != null && C[i] > H[hA] && C[i - 1] <= H[hA], bosDn = lA != null && C[i] < L[lA] && C[i - 1] >= L[lA];
    if (bosUp) msNow = 1; else if (bosDn) msNow = -1;
    ms[i] = msNow; sw[i] = hB != null && lB != null ? (H[hA] > H[hB] && L[lA] > L[lB] ? 1 : H[hA] < H[hB] && L[lA] < L[lB] ? -1 : 0) : 0;
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
    // Wyckoff (28/10 thử nghiệm, opt.sfpRangeAtr): SFP chỉ tính là Spring / UTAD khi 40 nến trước là VÙNG TÍCH LUỸ hẹp (biên < x ATR)
    const inRange = !opt.sfpRangeAtr || maxH(i - 40, i - 1) - minL(i - 40, i - 1) < opt.sfpRangeAtr * a;
    if (on("SFP") && inRange && V[i] >= 1.5 * vma[i]) {
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

    // 6) W3 — Elliott sóng 3 (28/10 thử nghiệm): CHoCH (sóng 1 đảo cấu trúc) → sóng 2 hồi 50–78,6% sóng 1, KHÔNG thủng đáy sóng 1
    //    → nến từ chối trong vùng hồi → vào đón sóng 3 thuận hướng mới. SL dưới đáy sóng 2.
    if (on("W3")) {
      const flipUp = bosUp && ms[i - 1] === -1, flipDn = bosDn && ms[i - 1] === 1;
      if (flipUp && lA != null) w3 = { side: 1, st: L[lA], ext: H[i], from: i, exp: i + 60, frozen: false };
      if (flipDn && hA != null) w3 = { side: -1, st: H[hA], ext: L[i], from: i, exp: i + 60, frozen: false };
      if (w3 && i > w3.from) {
        const sd = w3.side, len = Math.abs(w3.ext - w3.st) || 1e-9;
        if (!w3.frozen) w3.ext = sd === 1 ? Math.max(w3.ext, H[i]) : Math.min(w3.ext, L[i]);
        const rt = ((w3.ext - (sd === 1 ? L[i] : H[i])) * sd) / len;
        if (rt >= 0.382) w3.frozen = true;
        if (i > w3.exp || (sd === 1 ? L[i] < w3.st : H[i] > w3.st)) w3 = null;
        else if (w3.frozen && rt >= 0.5 && rt <= 0.786 && (sd === 1 ? bull : bear) && ((w3.ext - C[i]) * sd) / len < 0.5) {
          sig.push({ i, side: sd, sl: sd === 1 ? L[i] - 0.2 * a : H[i] + 0.2 * a, setup: "W3", note: `Elliott: CHoCH → sóng 2 hồi ${(rt * 100).toFixed(0)}% → đón sóng 3` }); w3 = null;
        }
      }
    }

    // 5) FTR (Fail To Return, 24/10 — thử nghiệm): nến xung lực (thân ≥ 1 ATR, ≥ 60% biên) PHÁ cấu trúc (BOS) → vùng = nến ngược màu cuối cùng
    //    trước xung lực (nền xuất phát). Giá quay lại vùng LẦN ĐẦU + nến từ chối đóng ra ngoài vùng → vào thuận hướng phá. Đóng xuyên qua vùng → huỷ.
    if (on("FTR")) {
      if ((bosUp || bosDn) && body >= a && body / rng >= 0.6 && (bosUp ? bull : bear)) {
        const sd = bosUp ? 1 : -1; let b = null;
        for (let k = i - 1; k >= i - 6; k--) if ((C[k] - O[k]) * sd < 0) { b = k; break; }
        if (b != null) ftr = { side: sd, hi: H[b], lo: L[b], from: i, exp: i + 40 };
      }
      if (ftr && i > ftr.from) {
        if (i > ftr.exp || (ftr.side === 1 && C[i] < ftr.lo) || (ftr.side === -1 && C[i] > ftr.hi)) ftr = null;
        else if (ftr.side === 1 && L[i] <= ftr.hi && bull && C[i] > ftr.hi) { sig.push({ i, side: 1, sl: Math.min(ftr.lo, L[i]) - 0.2 * a, setup: "FTR", note: "BOS tăng → về vùng FTR lần đầu → từ chối" }); ftr = null; }
        else if (ftr.side === -1 && H[i] >= ftr.lo && bear && C[i] < ftr.lo) { sig.push({ i, side: -1, sl: Math.max(ftr.hi, H[i]) + 0.2 * a, setup: "FTR", note: "BOS giảm → về vùng FTR lần đầu → từ chối" }); ftr = null; }
      }
    }
  }
  return { sig, atr, e50, adx, vma, V, H, L, C, O, ms, sw };
}

// Cấu trúc khung lớn (28/10): ms[i] = hướng lần phá cấu trúc gần nhất (BOS/CHoCH) tính bằng swing fractal 2-2 đã xác nhận
function structOf(K) {
  const n = K.length, H = K.map((k) => k[2]), L = K.map((k) => k[3]), C = K.map((k) => k[4]), ms = new Array(n).fill(0);
  let hA = null, lA = null, st = 0;
  for (let i = 4; i < n; i++) {
    const j = i - 2;
    if (H[j] > H[j - 1] && H[j] > H[j - 2] && H[j] >= H[j + 1] && H[j] >= H[j + 2]) hA = j;
    if (L[j] < L[j - 1] && L[j] < L[j - 2] && L[j] <= L[j + 1] && L[j] <= L[j + 2]) lA = j;
    if (hA != null && C[i] > H[hA] && C[i - 1] <= H[hA]) st = 1; else if (lA != null && C[i] < L[lA] && C[i - 1] >= L[lA]) st = -1;
    ms[i] = st;
  }
  return ms;
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
  // Thả TP (trailing): giá đạt +trailAtR → bỏ TP cố định, SL bám theo giá (đỉnh/đáy từ lúc vào − trailAtr×ATR), khoá lời tối thiểu trailLockR
  let trail = false, ext = entry; const trailAtR = cfg.trailAtR || 0;
  // Cắt khi đảo chiều: nến đóng có tín hiệu NGƯỢC chiều (bộ setup) — revExit 2: thêm nến engulfing ngược chiều thân ≥ 0,8 ATR
  const opp = cfg.revExit && f ? (f.oppAt ||= (() => { const m = new Map(); for (const x of f.sig) m.set(x.i, (m.get(x.i) || 0) | (x.side === 1 ? 1 : 2)); return m; })()) : null;
  const revEngulf = (k) => { const [, o, , , c] = K[k], [, po, , , pc] = K[k - 1], body = Math.abs(c - o); return body >= 0.8 * atr[k] && (side === 1 ? c < o && pc > po && c <= po && o >= pc : c > o && pc < po && c >= po && o <= pc); };
  for (let k = e; k <= endIdx; k++) {
    const [, , h, l, c] = K[k];
    const adv = side === 1 ? l : h, fav = side === 1 ? h : l, fillBar = limit && k === e;
    mae = Math.max(mae, Math.min(((entry - adv) * side) / risk, 1.2));
    if ((adv - sl) * side <= 0) { exit = sl * (1 - side * slip); reason = trail ? "Dời SL theo giá" : be ? (part ? "Chốt 1 nửa + hoà vốn" : "Hoà vốn") : "Cắt lỗ"; exitIdx = k; break; }
    if (fillBar) { maxR = Math.max(maxR, ((c - entry) * side) / risk); continue; } // nến khớp lệnh chờ: không tính chạm TP (không biết thứ tự)
    if (!trail && (fav - tp) * side >= 0) { exit = tp; reason = "Chốt lời"; exitIdx = k; maxR = cfg.rr; exitFee = maker; break; }
    maxR = Math.max(maxR, ((fav - entry) * side) / risk);
    if (opp && (cfg.revMinR == null || maxR >= cfg.revMinR) && ((opp.get(k) || 0) & (side === 1 ? 2 : 1) || (cfg.revExit >= 2 && revEngulf(k)))) { exit = c * (1 - side * slip); reason = "Đảo chiều"; exitIdx = k; break; } // đóng ở giá đóng nến (thị trường)
    if (trailAtR > 0) {
      ext = side === 1 ? Math.max(ext, fav) : Math.min(ext, fav);
      if (!trail && maxR >= trailAtR) trail = true;
      if (trail) { const t = Math.max((ext - side * (cfg.trailAtr || 2) * atr[k] - entry) * side, (cfg.trailLockR ?? 0) * risk); if ((entry + side * t - sl) * side > 0) sl = entry + side * t; }
    }
    if (pAt != null && !part && (fav - pAt) * side >= 0) { part = cfg.partialAtR; be = true; sl = entry + side * 0.05 * risk; } // chốt 50% + dời SL hoà vốn
    if (!be && cfg.beAtR > 0 && maxR >= cfg.beAtR) { be = true; sl = entry + side * 0.05 * risk; } // dời SL về hoà vốn (dương nhẹ) từ nến sau
    if (k - e >= cfg.timeStopBars) { exit = c; reason = "Hết thời gian"; exitIdx = k; break; }
  }
  const w = part ? 0.5 : 1; // khối lượng còn lại khi thoát
  const feeR = ((inFee + (part ? 0.5 * maker + 0.5 * exitFee : exitFee)) * entry) / risk;
  const r = exit == null ? null : (part ? 0.5 * part : 0) + (w * (exit - entry) * side) / risk - feeR;
  return { entryIdx: e, entry, sl: s.sl, curSl: sl, tp: trail ? null : tp, trail, risk, rr: cfg.rr, beAtR: cfg.beAtR, part, exitIdx, exit, reason, be, feeR, mfe: maxR, mae, open: exit == null, r };
}

// R của lệnh (đã chốt phần pf ở part R thì phần còn lại tính theo giá px) — bộ luật cũ chốt 1/2, SW3 chốt 1/3
const uRof = (part, entry, px, side, risk, feeR, pf = 0.5) => (part ? pf * part + ((1 - pf) * (px - entry) * side) / risk : ((px - entry) * side) / risk) - feeR;

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
  if (isSW3(session)) return runSW3(session, onProgress);
  const cfg = cfgOf(session);
  const until = session.stoppedAt || Date.now(), startAt = session.startAt;
  const learnFrom = cfg.adaptive ? startAt - cfg.warmupDays * 86400000 : startAt;
  const V = variantsOf(cfg), baseVi = V.findIndex((v) => v.rr === cfg.rr && v.beAtR === cfg.beAtR);
  const skipped = {}, streams = [], shadows = [], pending = [], skipLog = []; // skipLog: tín hiệu gần đây bị bỏ + lý do (giải thích 'vì sao chưa có lệnh')
  const bump = (k, n = 1) => { if (n) skipped[k] = (skipped[k] || 0) + n; };
  // tải song song mọi cặp × khung (kể cả khung lớn để lọc) — lần sau chỉ tải phần nến mới
  const need = new Map();
  const off = new Set(cfg.offStreams || []);
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    if (off.has(`${coin}|${tf}`)) continue;
    need.set(`${coin}|${tf}`, [symOf(coin), tf, learnFrom - 260 * TFS[tf].ms]);
    for (const h of ["1h", "4h", "1d"]) need.set(`${coin}|${h}`, [symOf(coin), h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - 260 * TFS[h].ms)]);
    for (const h of cfg.biasTfs || []) need.set(`${coin}|${h}`, [symOf(coin), h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - (h === "1w" ? 160 : 260) * TFS[h].ms)]);
    if (cfg.htfFilter) { const h = TFS[tf].htf; need.set(`${coin}|${h}`, [symOf(coin), h, Math.min(need.get(`${coin}|${h}`)?.[2] ?? Infinity, learnFrom - 260 * TFS[h].ms)]); }
  }
  onProgress(`Tải nến ${need.size} luồng…`);
  let done = 0, bars = 0;
  const say = () => onProgress(`Tải nến ${done}/${need.size} luồng${bars ? ` · đã tải ${bars.toLocaleString("vi-VN")} nến mới` : ""}…`);
  pageHook = (n) => { bars += n; say(); };
  const fund = {}, got = new Map(); // 22/10: giữ nến vừa tải song song → vòng tính dùng lại, không gọi Binance lần 2 tuần tự (trước đây ~4 giây chờ mạng)
  try {
    await Promise.all([
      ...[...need].map(([k, [sym, tf, from]]) => loadKlines(sym, tf, from).then((r) => { got.set(k, r); done++; say(); })),
      ...cfg.coins.map((c) => loadFunding(symOf(c), learnFrom - 86400000).then((r) => { fund[c] = fundingSum(r); }).catch(() => { fund[c] = () => 0; })), // lỗi tải funding → bỏ qua (không chặn bot)
    ]);
  }
  finally { pageHook = null; }
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    if (off.has(`${coin}|${tf}`)) { streams.push({ coin, tf, bars: 0, note: "đã tắt" }); continue; }
    const symbol = symOf(coin), step = TFS[tf].ms, key = `${coin}|${tf}`;
    const K = (got.get(key) || await loadKlines(symbol, tf, learnFrom - 260 * step)).filter((k) => k[0] + step <= until);
    if (K.length < 260) { streams.push({ coin, tf, bars: K.length, note: "thiếu dữ liệu" }); continue; }
    const found = findSignals(K, cfg.setups, cfg);
    const atr = found.atr; let sig = found.sig.filter((x) => K[x.i][0] >= learnFrom);
    if (cfg.htfFilter) {
      const htf = TFS[tf].htf, hs = TFS[htf].ms;
      const HK = (got.get(`${coin}|${htf}`) || await loadKlines(symbol, htf, learnFrom - 260 * hs)).filter((k) => k[0] + hs <= until);
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
      const hs = TFS[h].ms, HK = (got.get(`${coin}|${h}`) || await loadKlines(symbol, h, learnFrom - 260 * hs)).filter((k) => k[0] + hs <= until), he = emaArr(HK.map((k) => k[4]), 200);
      biasFns[h] = (t) => { let lo = 0, hi = HK.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (HK[m][0] + hs <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r < 200 ? 0 : HK[r][4] > he[r] ? 1 : HK[r][4] < he[r] ? -1 : 0; };
    }
    // Bias CẤU TRÚC khung lớn (28/10 thử nghiệm): cfg.biasTfs (vd H4, D1, W1) — hướng phá cấu trúc gần nhất của nến khung lớn ĐÃ ĐÓNG;
    // cfg.biasNeed "all" = mọi khung cùng hướng lệnh · "major" = quá nửa · số = ít nhất N khung
    const sBias = [];
    for (const h of cfg.biasTfs || []) {
      const hs = TFS[h].ms, HK = (got.get(`${coin}|${h}`) || await loadKlines(symbol, h, learnFrom - (h === "1w" ? 160 : 260) * hs)).filter((k) => k[0] + hs <= until), m = structOf(HK);
      sBias.push((t) => { let lo = 0, hi = HK.length - 1, r = -1; while (lo <= hi) { const md = (lo + hi) >> 1; if (HK[md][0] + hs <= t) { r = md; lo = md + 1; } else hi = md - 1; } return r < 0 ? 0 : m[r]; });
    }
    const biasOk = (s) => { if (!sBias.length || (cfg.biasSetups && !cfg.biasSetups.includes(s.setup))) return true; // biasSetups: chỉ áp cho các setup này (vd đảo chiều SMC/SFP)
      const t = K[s.i][0] + step, v = sBias.map((f) => f(t)), agree = v.filter((x) => x === s.side).length, need = cfg.biasNeed === "all" ? v.length : cfg.biasNeed === "major" ? Math.floor(v.length / 2) + 1 : Number(cfg.biasNeed) || v.length; return agree >= need; };
    const htfTags = (s) => { const t = K[s.i][0] + step, b = ["1h", "4h", "1d"].map((h) => biasFns[h](t)); return [b.every((x) => x === s.side) ? "htf:all" : "htf:mixed", b[2] === s.side ? "d1:with" : "d1:against"]; };
    const endIdx = K.length - 1, last = K[endIdx][4], lastBarAt = K[endIdx][0];
    for (const s of sig) {
      const tags = [...tagsOf(K, s.i, s.side, s.sl, found), ...htfTags(s)], live0 = K[s.i][0] >= startAt;
      // v6: tiêu chí bộ kiến thức trước đây bot bỏ qua (đã kiểm chứng 90 & 180 ngày, cả 2 nửa kỳ)
      const veto = cfg.sigVol && tags.includes("svol:lo") ? "nến tín hiệu volume thấp (VSA: thiếu xác nhận)"
        : cfg.noEngulf && tags.includes("pa:engulf") ? "vào ngay sau nến engulfing lớn (đuổi giá)"
        : cfg.d1Bias && tags.includes("d1:against") ? "ngược xu hướng D1"
        : !biasOk(s) ? `ngược cấu trúc khung lớn (${(cfg.biasTfs || []).map((h) => TFS[h].label).join("/")})`
        : cfg.paConfirm && !tags.includes("pa:pin") && !tags.includes("pa:engulf") ? "không có nến xác nhận Price Action (pin / engulfing)"
        // Cấu trúc sóng (24/10): "break" = lần phá cấu trúc gần nhất (BOS/CHoCH) phải cùng hướng lệnh · "swing" = đỉnh/đáy HH-HL / LH-LL cùng hướng
        // contOnly: chỉ áp cho setup thuận xu hướng (TREND, BREAKOUT, FTR) — SFP / SMC là đảo chiều nên không bắt theo cấu trúc cũ
        : cfg.structure && (!cfg.structContOnly || !["SFP", "SMC"].includes(s.setup)) && (cfg.structure === "swing" ? found.sw[s.i] : found.ms[s.i]) !== s.side
          ? (cfg.structure === "swing" ? "ngược cấu trúc đỉnh/đáy (HH-HL / LH-LL)" : "ngược hướng phá cấu trúc gần nhất (BOS/CHoCH)") : null;
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
    const a = lessIdx.get(k) || [], c = upTo(a, T), w = a.slice(Math.max(0, c - cfg.lessonN), c).filter((y) => !cfg.lessonDays || y.x >= T - cfg.lessonDays * 864e5), n = w.length; // lessonDays: chỉ xét lệnh trong N ngày gần (bài học cũ tự hết hạn)
    if (n < cfg.lessonMin) return null;
    const m = w.reduce((x, y) => x + y.r, 0) / n, sd = Math.sqrt(w.reduce((x, y) => x + (y.r - m) ** 2, 0) / (n - 1));
    return { n, exp: m, win: (w.filter((y) => y.r > 0.05).length / n) * 100, bad: m <= (cfg.lessonBad ?? -0.2) && m + sd / Math.sqrt(n) < 0 };
  };
  const lessonsAt = (sh, T) => { // lessonNeed: chỉ chặn khi có ≥ N đặc điểm xấu khác nhau (mặc định 1)
    const L = cfg.learnLoss ? lkeys(sh).map((k) => ({ k, ...lessonStat(k, T) })).filter((x) => x.bad) : [];
    return (cfg.lessonNeed || 1) > 1 && new Set(L.map((x) => x.k.split("|")[1])).size < cfg.lessonNeed ? [] : L;
  };
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

// ---------------- Chạy phiên SW3 ----------------
// Lý do thoát theo vị trí cắt lỗ lúc chạm: chưa chốt 1/3 → cắt lỗ (hoặc giảm lỗ nhờ dời SL); đã chốt → hoà vốn / khoá lời
function sw3Reason(t, stop) {
  const lock = ((stop - t.entry) * t.side) / t.risk;
  if (!t.part) return lock > -0.98 ? "Dời SL theo đáy/đỉnh 20 nến (giảm lỗ)" : "Cắt lỗ";
  return lock > 0.005 ? "Chốt 1/3 + dời SL khoá lời" : "Chốt 1/3 + hoà vốn";
}
const hiPrev = (H, n) => H.map((_, i) => { let m = -Infinity; for (let j = Math.max(0, i - n); j < i; j++) m = Math.max(m, H[j]); return m; }); // đỉnh n nến TRƯỚC nến i
const loPrev = (L, n) => L.map((_, i) => { let m = Infinity; for (let j = Math.max(0, i - n); j < i; j++) m = Math.min(m, L[j]); return m; });
async function runSW3(session, onProgress) {
  const cfg = cfgOf(session), P = cfg.sw, step = TFS["4h"].ms, D1 = TFS["1d"].ms;
  const until = session.stoppedAt || Date.now(), startAt = session.startAt;
  const taker = (cfg.feePct + cfg.slipPct) / 100, maker = cfg.makerPct / 100, PF = P.partFrac;
  const off = new Set(cfg.offStreams || []), coins = cfg.coins.filter((c) => !off.has(`${c}|4h`));
  const from = startAt - 700 * step; // ~117 ngày trước ngày bắt đầu: làm nóng EMA200 H4 + nối đúng chuỗi "nhịp phá vỡ" đang diễn ra
  onProgress(`Tải nến H4 ${coins.length} mã + BTC D1…`);
  const fund = {}, KH = {}, KM = {}, lim = P.entry === "lim"; // D: mô phỏng lệnh chờ trên nến M15
  let BD = [];
  await Promise.all([
    ...coins.map((c) => loadKlines(symOf(c), "4h", from).then((r) => { KH[c] = r; })),
    ...(lim ? coins.map((c) => loadKlines(symOf(c), "15m", startAt - D1).then((r) => { KM[c] = r; })) : []),
    loadKlines("BTCUSDT", "1d", startAt - 320 * D1).then((r) => { BD = r; }),
    ...coins.map((c) => loadFunding(symOf(c), from).then((r) => { fund[c] = fundingSum(r); }).catch(() => { fund[c] = () => 0; })),
  ]);
  onProgress("Tính tín hiệu SW3…");
  BD = BD.filter((k) => k[0] + D1 <= until);
  const BE = emaArr(BD.map((k) => k[4]), P.btcEma);
  const btcAt = (tClose) => { let lo = 0, hi = BD.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (BD[m][0] + D1 <= tClose) { r = m; lo = m + 1; } else hi = m - 1; } return r < P.btcEma ? 0 : BD[r][4] > BE[r] ? 1 : -1; }; // nến ngày BTC ĐÃ ĐÓNG gần nhất
  const trades = [], pending = [], skipLog = [], skipped = {}, streams = [], levels = {};
  const bump = (k) => { skipped[k] = (skipped[k] || 0) + 1; };
  const M15 = TFS["15m"].ms, wBars = Math.round(((P.limH || 4) * 3600000) / M15);
  for (const coin of coins) {
    const K = (KH[coin] || []).filter((k) => k[0] + step <= until), n = K.length;
    const KM15 = lim ? (KM[coin] || []).filter((k) => k[0] + M15 <= until) : [];
    if (n < 320) { streams.push({ coin, tf: "4h", bars: n, note: "thiếu dữ liệu" }); continue; }
    const O = K.map((k) => k[1]), H = K.map((k) => k[2]), L = K.map((k) => k[3]), C = K.map((k) => k[4]), V = K.map((k) => k[5]);
    const { atr } = atrAdx(H, L, C), E = emaArr(C, P.emaH4), VM = smaArr(V, P.volN), HH = hiPrev(H, P.brkN), LL = loPrev(L, P.brkN);
    const trailAt = (k, side) => { let m = side === 1 ? Infinity : -Infinity; for (let j = Math.max(0, k - P.trailN + 1); j <= k; j++) m = side === 1 ? Math.min(m, L[j]) : Math.max(m, H[j]); return m; }; // đáy/đỉnh 20 nến gần nhất tính tới nến k (đã đóng)
    levels[coin] = { barAt: K[n - 1][0], lo: trailAt(n - 1, 1), hi: trailAt(n - 1, -1) }; // bot thật dùng để dời SL sau mỗi nến H4
    // Mô phỏng 1 lệnh y như bộ kiểm thử nghiên cứu: SL chạm (giá mở nhảy qua SL → khớp giá mở) → chốt 1/3 → dời hoà vốn → dời theo 20 nến
    const sim = (i, side) => {
      const e = i + 1, en = O[e], risk = P.stopAtr * atr[i], feeIn = taker * en, p1 = en + side * P.partR * risk;
      let stop = en - side * risk, half = false, booked = 0, pFee = 0, mfe = 0, mae = 0;
      for (let k = e; k < n; k++) {
        if (side === 1 ? L[k] <= stop : H[k] >= stop) {
          const px0 = side === 1 ? Math.min(stop, O[k]) : Math.max(stop, O[k]), rem = half ? 1 - PF : 1;
          return { e, x: k, en, risk, p1, stop, half, px: px0, feeR: (feeIn + pFee + rem * taker * px0) / risk, gross: booked + rem * (((px0 - en) * side - taker * px0 - feeIn) / risk), mfe, mae };
        }
        mfe = Math.max(mfe, ((side === 1 ? H[k] : L[k]) - en) * side / risk); mae = Math.max(mae, Math.min(((en - (side === 1 ? L[k] : H[k])) * side) / risk, 1.2));
        if (!half && (side === 1 ? H[k] >= p1 : L[k] <= p1)) { booked = PF * (((p1 - en) * side - maker * p1 - feeIn) / risk); pFee = PF * maker * p1; half = true; if ((en - stop) * side > 0) stop = en; }
        const ns = trailAt(k, side); if ((ns - stop) * side > 0) stop = ns;
      }
      return { e, x: null, en, risk, p1, stop, half, feeR: (feeIn + pFee) / risk, mfe, mae, open: true };
    };
    // D: lệnh chờ cách giá đóng limAtr ATR, chờ wBars nến M15; không khớp → vào giá mở nến H4 kế (thị trường). Sau đó quản lý trên nến M15,
    // dời SL theo đáy/đỉnh 20 nến H4 đã đóng tính tới lúc đóng nến M15 đang xét (y như bộ kiểm thử bt10/sw.mjs).
    let hP = 0; const hAt = (t) => { while (hP + 1 < n && K[hP + 1][0] + step <= t) hP++; while (hP > 0 && K[hP][0] + step > t) hP--; return K[hP][0] + step <= t ? hP : -1; };
    const simLim = (i, side, onlyFill = false) => {
      const T = K[i][0] + step, A = atr[i], lp = C[i] - side * P.limAtr * A, risk = P.stopAtr * A;
      let k0 = 0; { let lo = 0, hi = KM15.length; while (lo < hi) { const m = (lo + hi) >> 1; if (KM15[m][0] < T) lo = m + 1; else hi = m; } k0 = lo; }
      let e = -1, en = 0, mk = false;
      for (let k = k0; k < Math.min(k0 + wBars, KM15.length); k++) { const b = KM15[k]; if (side === 1 ? b[3] <= lp : b[2] >= lp) { e = k; en = side === 1 ? Math.min(lp, b[1]) : Math.max(lp, b[1]); mk = true; break; } }
      if (e < 0 && onlyFill) return null; // nến tín hiệu vừa đóng, chưa chạm điểm vào → vẫn là lệnh chờ
      if (e < 0) { e = k0 + wBars; en = e < KM15.length ? KM15[e][1] : i + 2 < n ? O[i + 2] : C[Math.min(i + 1, n - 1)]; } // hết 4 giờ → vào thị trường
      const entryAt = e < KM15.length ? KM15[e][0] : T + wBars * M15, feeIn = (mk ? maker : taker) * en, p1 = en + side * P.partR * risk;
      let stop = en - side * risk, half = false, booked = 0, pFee = 0, mfe = 0, mae = 0;
      for (let k = e; k < KM15.length; k++) {
        const [, o, h, l] = KM15[k];
        if (side === 1 ? l <= stop : h >= stop) {
          const px0 = k === e ? stop : side === 1 ? Math.min(stop, o) : Math.max(stop, o), rem = half ? 1 - PF : 1;
          return { entryAt, exitAt: KM15[k][0] + M15, en, mk, risk, p1, stop, half, px: px0, feeR: (feeIn + pFee + rem * taker * px0) / risk, gross: booked + rem * (((px0 - en) * side - taker * px0 - feeIn) / risk), mfe, mae };
        }
        mfe = Math.max(mfe, ((side === 1 ? h : l) - en) * side / risk); mae = Math.max(mae, Math.min(((en - (side === 1 ? l : h)) * side) / risk, 1.2));
        if (!half && (side === 1 ? h >= p1 : l <= p1)) { booked = PF * (((p1 - en) * side - maker * p1 - feeIn) / risk); pFee = PF * maker * p1; half = true; if ((en - stop) * side > 0) stop = en; }
        const hj = hAt(KM15[k][0] + M15); if (hj >= 0) { const ns = trailAt(hj, side); if ((ns - stop) * side > 0) stop = ns; }
      }
      return { entryAt, exitAt: null, en, mk, risk, p1, stop, half, feeR: (feeIn + pFee) / risk, mfe, mae, open: true };
    };
    const limTrade = (base, why3, i, side, m) => { // lệnh D từ kết quả simLim (dùng cho cả nến cũ lẫn nến tín hiệu vừa đóng đã chạm điểm vào)
      const last = C[n - 1], fundR = (fund[coin] ? fund[coin](m.entryAt, m.open ? until : m.exitAt) : 0) * side * m.en / m.risk;
      const tr = { ...base, why3: `${why3} · ${m.mk ? "khớp lệnh chờ M15" : "không hồi → vào thị trường sau 4 giờ"}`, fill: m.mk ? "lim" : "mkt", entryAt: m.entryAt, entry: m.en, sl: m.en - side * m.risk, curSl: m.stop, tp: m.p1, risk: m.risk, rr: P.partR, beAtR: 0, part: m.half ? P.partR : 0, pf: PF, be: m.half,
        exitAt: m.exitAt, exit: m.open ? null : m.px, reason: m.open ? "Đang mở" : sw3Reason({ entry: m.en, side, risk: m.risk, part: m.half }, m.stop), r: m.open ? null : m.gross - fundR, fundR, feeR: m.feeR + fundR, mfe: m.mfe, mae: m.mae, last, lastBarAt: K[n - 1][0] };
      tr.uR = m.open ? uRof(tr.part, tr.entry, last, side, tr.risk, tr.feeR, PF) : null;
      return tr;
    };
    let occ = -1, nSig = 0, realTo = -Infinity; // realTo: lệnh thật (D) của mã đang mở tới lúc nào — mỗi mã 1 lệnh
    for (let i = 300; i < n; i++) {
      if (i <= occ) continue;
      const side = C[i] > HH[i] ? 1 : C[i] < LL[i] ? -1 : 0; if (!side) continue;
      const live = K[i][0] >= startAt, tc = K[i][0] + step;
      const brk = ((C[i] - (side === 1 ? HH[i] : LL[i])) * side) / atr[i], vx = V[i] / (VM[i - 1] || Infinity), h4 = C[i] > E[i] ? 1 : -1, btc = btcAt(tc);
      const tags = { brk: +brk.toFixed(2), vol: +vx.toFixed(2), ema: h4 * side, btc: btc * side };
      const why3 = `phá vượt ${fmt2(brk)} ATR · volume ${fmt2(vx)}× · ${h4 === 1 ? "trên" : "dưới"} EMA200 H4 · BTC ${btc === 1 ? "trên" : btc === -1 ? "dưới" : "chưa rõ"} EMA50 D1`;
      const fail = brk < P.brkAtr ? `phá vỡ yếu (${fmt2(brk)} < ${fmt2(P.brkAtr)} ATR)` : vx < P.volX ? `volume thấp (${fmt2(vx)}× < ${fmt2(P.volX)}×)` : h4 !== side ? `ngược EMA200 H4 của ${coin}` : btc !== side ? "ngược xu hướng BTC (EMA50 D1)" : null;
      const base = { id: `${coin}-4h-${K[i][0]}-SW3`, key: `${coin}|4h`, coin, tf: "4h", setup: "SW3", side, signalAt: K[i][0], tags, why3, cell: `${coin}|4h|SW3`, grp: "4h|SW3" };
      if (live) nSig++;
      if (i === n - 1) { // nến tín hiệu VỪA đóng → SW3: vào lệnh thị trường ở nến kế · D: lệnh chờ 0,25 ATR, hết 4 giờ thì vào thị trường (bot thật làm y vậy)
        const risk = P.stopAtr * atr[i];
        if (live && !fail && P.entry === "lim" && K[i][0] + step >= realTo) { // 09/11: giá đã chạm điểm vào (nến M15 sau khi đóng nến H4) → ghi lệnh Demo NGAY, không đợi nến H4 kế (trước đây testnet có lệnh còn Demo chỉ hiện "lệnh chờ" tới 4 giờ)
          const m = simLim(i, side, true);
          if (m) { realTo = m.open ? Infinity : m.exitAt; trades.push(limTrade(base, why3, i, side, m)); break; }
        }
        if (live && !fail && P.entry === "lim") { const lp = C[i] - side * P.limAtr * atr[i], fb = K[i][0] + step + (P.limH || 4) * 3600000; pending.push({ ...base, market: false, limEntry: true, lim: lp, risk, sl: lp - side * risk, tp: lp + side * P.partR * risk, partR: P.partR, partFrac: PF, fallbackAt: fb, until: fb + 3600000 }); }
        else if (live && !fail) pending.push({ ...base, market: true, lim: C[i], risk, sl: C[i] - side * risk, tp: C[i] + side * P.partR * risk, partR: P.partR, partFrac: PF, until: K[i][0] + 2 * step });
        else if (live) { bump(failKey(fail)); skipLog.push({ t: K[i][0], coin, tf: "4h", setup: "SW3", side, why: fail }); }
        break;
      }
      const t = sim(i, side); occ = t.open ? Infinity : t.x; // nhịp phá vỡ (kể cả cú bị loại) chiếm mã tới khi thoát theo luật
      if (!live) continue;
      if (fail) { bump(failKey(fail)); skipLog.push({ t: K[i][0], coin, tf: "4h", setup: "SW3", side, why: fail }); continue; }
      const last = C[n - 1];
      if (lim) { // D: lệnh thật vào bằng lệnh chờ M15 (khác lệnh bóng dùng để tính nhịp)
        if (K[i][0] + step < realTo) { bump("đang có lệnh mã này"); skipLog.push({ t: K[i][0], coin, tf: "4h", setup: "SW3", side, why: "đang có lệnh mã này" }); continue; }
        const m = simLim(i, side); realTo = m.open ? Infinity : m.exitAt;
        trades.push(limTrade(base, why3, i, side, m)); continue;
      }
      const toT = t.open ? until : K[t.x][0] + step, fundR = (fund[coin] ? fund[coin](K[t.e][0], toT) : 0) * side * t.en / t.risk;
      const r = t.open ? null : t.gross - fundR;
      const tr = { ...base, entryAt: K[t.e][0], entry: t.en, sl: t.en - side * t.risk, curSl: t.stop, tp: t.p1, risk: t.risk, rr: P.partR, beAtR: 0, part: t.half ? P.partR : 0, pf: PF, be: t.half,
        exitAt: t.open ? null : K[t.x][0] + step, exit: t.open ? null : t.px, reason: t.open ? "Đang mở" : sw3Reason({ entry: t.en, side, risk: t.risk, part: t.half }, t.stop), r, fundR, feeR: t.feeR + fundR, mfe: t.mfe, mae: t.mae, last, lastBarAt: K[n - 1][0] };
      tr.uR = t.open ? uRof(tr.part, tr.entry, last, side, tr.risk, tr.feeR, PF) : null;
      trades.push(tr);
    }
    streams.push({ coin, tf: "4h", bars: n, signals: nSig, lastBar: K[n - 1][0] });
  }
  trades.sort((a, b) => a.entryAt - b.entryAt);
  skipLog.sort((a, b) => b.t - a.t); skipLog.length = Math.min(skipLog.length, 400);
  return { cfg, startAt, until, stopped: !!session.stoppedAt, tfState: [], pending, skipLog, lessons: [], lessonsActive: [], metaNow: {}, metaEvents: [], trades, baseTrades: trades, rejected: [], optLog: [], optState: [], skipped, streams, learned: 0, sw3Levels: levels, at: Date.now() };
}
const failKey = (f) => f.replace(/ \(.*\)$/, "").replace(/ của [A-Z0-9]+$/, " của mã"); // gom lý do bỏ (bỏ số đo riêng từng lệnh) cho phễu tín hiệu
const fmt2 = (v) => (isFinite(v) ? Number(v).toFixed(2).replace(".", ",") : "—");

// Ghép nến đang chạy (WebSocket) vào lệnh đang mở: chạm SL/TP → đóng ngay; còn lại lãi/lỗ theo giá hiện tại.
// live: { "BTC|5m": {t, h, l, c} } · hits: Map id → lúc phát hiện chạm (giữ thời điểm ổn định giữa các nhịp)
function applyTick(t, bar, cfg, hits) {
  if (t.exitAt != null || !bar || bar.t <= t.lastBarAt) return t;
  const side = t.side, slip = cfg.slipPct / 100, sw3 = t.setup === "SW3";
  // SW3: TP chỉ là mức chốt 1/3 (không đóng cả lệnh) → chỉ cắt lỗ / dời SL mới đóng; phần chốt 1/3 cập nhật ở lần tính nến kế
  const hitSl = ((side === 1 ? bar.l : bar.h) - t.curSl) * side <= 0, hitTp = !sw3 && t.tp != null && ((side === 1 ? bar.h : bar.l) - t.tp) * side >= 0;
  if (hitSl || hitTp) { // cùng chạm trong 1 nến → tính THUA như luật chung
    const exit = hitSl ? (sw3 ? t.curSl : t.curSl * (1 - side * slip)) : t.tp; // SW3: trượt giá đã nằm trong phí
    if (!hits.has(t.id)) hits.set(t.id, Date.now());
    const exitFee = sw3 ? (1 - (t.part ? t.pf : 0)) * (cfg.feePct + cfg.slipPct) / 100 * exit / t.risk : 0;
    return { ...t, exit, exitAt: hits.get(t.id), reason: hitSl ? (sw3 ? sw3Reason(t, t.curSl) : t.be ? (t.part ? "Chốt 1 nửa + hoà vốn" : "Hoà vốn") : "Cắt lỗ") : "Chốt lời", r: uRof(t.part, t.entry, exit, side, t.risk, t.feeR + exitFee, t.pf), uR: null, last: bar.c, liveExit: true };
  }
  return { ...t, last: bar.c, uR: uRof(t.part, t.entry, bar.c, side, t.risk, t.feeR, t.pf), mfe: Math.max(t.mfe || 0, (((side === 1 ? bar.h : bar.l) - t.entry) * side) / t.risk) };
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
  let lossRun = 0; // số lệnh thua liên tiếp (theo thứ tự đóng) — streakN > 0: thua ≥ N lệnh liền thì rủi ro = streakRiskPct tới khi thắng lại
  const evs = [...trades].sort((a, b) => a.entryAt - b.entryAt);
  const settle = (t) => {
    open.sort((a, b) => (a.exitAt ?? Infinity) - (b.exitAt ?? Infinity));
    while (open.length && open[0].exitAt != null && open[0].exitAt <= t) {
      const p = open.shift(); eq += p.pnl; lossRun = p.pnl < 0 ? lossRun + 1 : p.pnl > 0 ? 0 : lossRun; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak); maxDDUsd = Math.max(maxDDUsd, peak - eq);
      const d = dayOf(p.exitAt); dayPnl[d] = (dayPnl[d] || 0) + p.pnl;
      curve.push({ t: p.exitAt, eq });
    }
  };
  for (const tr of evs) {
    settle(tr.entryAt);
    const day = dayOf(tr.entryAt);
    if (open.length >= cfg.maxOpen) { taken.push({ ...tr, status: "skip", why: `đủ ${cfg.maxOpen} lệnh mở` }); continue; }
    if (cfg.dailyStopPct > 0 && (dayPnl[day] || 0) <= -(cfg.dailyStopPct / 100) * eq) { taken.push({ ...tr, status: "skip", why: `chạm dừng ngày -${cfg.dailyStopPct}%` }); continue; }
    const reduced = cfg.streakN > 0 && lossRun >= cfg.streakN; // (dailyStopPct 0 = không dừng ngày — SW3)
    const rp0 = reduced ? cfg.streakRiskPct ?? cfg.riskPct / 2 : cfg.riskPct, riskUsd = eq * (Math.min(rp0, cfg.riskBySetup?.[tr.setup] ?? rp0, cfg.riskByCoin?.[tr.coin] ?? rp0) / 100); // v12: rủi ro riêng theo setup · D: rủi ro riêng theo mã (10 mã mới 0,45%)
    let qty = riskUsd / tr.risk; const maxQty = (cfg.maxLev * eq) / tr.entry;
    if (qty > maxQty) qty = maxQty;
    const lev = (qty * tr.entry) / eq;
    const R = tr.r ?? tr.uR ?? 0;
    const pnl = qty * tr.risk * R; // R đã trừ phí
    const fee = qty * tr.risk * tr.feeR;
    if (tr.exitAt != null) fees += fee;
    const row = { ...tr, status: tr.exitAt == null ? "open" : "done", qty, lev, riskUsd: qty * tr.risk, pnl, fee, notional: qty * tr.entry, ...(reduced ? { reducedRisk: true } : {}) };
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
