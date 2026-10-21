// BOT GIAO DỊCH FUTURES theo đúng bộ luật tab "Demo tự động" của Quang Workspace (lib/paperBot.js chép từ app).
// - Tín hiệu tính trên GIÁ THẬT (fapi.binance.com), lệnh đặt lên MODE=testnet (tiền ảo) hoặc live (tiền thật).
// - Mỗi tín hiệu = LỆNH CHỜ (limit) ở giá đóng nến tín hiệu, hết hạn 3 nến chưa khớp → huỷ. Khớp → đặt SL (Stop-Market) + TP (Take-Profit-Market) đóng toàn bộ vị thế.
// - Quản lý rủi ro: % vốn/lệnh, tối đa N vị thế, 1 vị thế/cặp, đòn bẩy trần, dừng ngày khi lỗ X%, đóng khi giữ quá lâu (time stop).
// - Dừng khẩn: tạo file data/STOP (hoặc lệnh "Dừng" từ app) → huỷ lệnh chờ, không mở lệnh mới (vị thế đang mở giữ nguyên SL/TP).
// - "Đóng tất cả" từ app (command.closeAllAt): huỷ mọi lệnh + đóng vị thế các cặp của bot trong ví Futures (KHÔNG đụng Spot).
// - Báo về app: trạng thái (dòng 'status'), lịch sử lệnh đã đóng (dòng 'history'), thông báo đẩy về điện thoại (qws-send-push).
// Chạy: npm start · thử không đặt lệnh: npm run dry · 1 vòng: npm run once
import fs from "node:fs";
import crypto from "node:crypto";
import { makeClient, MAIN, sleep } from "./binance.js";
import { runSession, cfgOf, SYMBOLS, TFS, symOf, finalize, statsOf } from "./paperBot.js";
import { pushStatus, readCommand, readDemoSession, readRulesLog, readStatus, pushHistory, notify, lastPush_ } from "./report.js";
import { checkUpdate, markHealthy, updateInfo, rolledBack } from "./updater.js";

const DRY = process.argv.includes("--dry"), ONCE = process.argv.includes("--once");
const ENV = (k, d) => (process.env[k] && process.env[k].trim() !== "" ? Number(process.env[k]) : d);
const num = (v, d) => (v === undefined || v === null || v === "" || !isFinite(Number(v)) ? d : Number(v));
// Cài đặt chạy: ƯU TIÊN cài đặt trong app (Coin → Bot thật → Cài đặt), không có thì lấy .env
let MODE = (process.env.MODE || "testnet").trim(), RISK = ENV("RISK_PCT", 2), MAX_OPEN = ENV("MAX_OPEN", 3), DAILY_STOP = ENV("DAILY_STOP_PCT", 6), MAX_LEV = ENV("MAX_LEV", 20), CAP = ENV("CAPITAL_CAP", 0);
const STATE_F = "data/state.json", LOG_F = "data/trades.jsonl", STOP_F = "data/STOP", KEY_F = "data/bot-key.json";
const VN = 7 * 3600000;
const now = () => Date.now();
const stamp = (t = now()) => new Date(t + VN).toISOString().slice(0, 19).replace("T", " ");
const log = (...a) => console.log(`[${stamp()}]`, ...a);
fs.mkdirSync("data", { recursive: true });
// Định dạng số kiểu Việt Nam (1.234,56) cho thông báo
const vn = (v, d) => Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const px = (v) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 8 });
const sgn = (v, d) => `${v > 0 ? "+" : ""}${vn(v, d)}`;
const dur = (ms) => { const m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d} ngày ${h % 24} giờ` : h ? `${h} giờ ${m % 60} phút` : `${m} phút`; };
const dirStr = (s) => (s === 1 ? "LONG" : "SHORT");
const modeLbl = (m) => ((m || MODE) === "live" ? "Tiền thật" : "Testnet");
// Mã luật đang chạy (12 ký tự đầu sha256 của lib/paperBot.js) → app so với luật Demo hiện tại
const RULES_HASH = (() => { try { return crypto.createHash("sha256").update(fs.readFileSync(new URL("./paperBot.js", import.meta.url))).digest("hex").slice(0, 12); } catch { return null; } })();

// Cặp khoá mã hoá RIÊNG của máy này: app mã hoá khoá API bằng khoá CÔNG KHAI, chỉ máy này (khoá bí mật) giải được
function machineKeys() {
  try { return JSON.parse(fs.readFileSync(KEY_F, "utf8")); } catch { /* tạo mới */ }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const k = { pub: publicKey.export({ type: "spki", format: "der" }).toString("base64"), priv: privateKey.export({ type: "pkcs8", format: "pem" }) };
  fs.writeFileSync(KEY_F, JSON.stringify(k)); return k;
}
const MK = machineKeys(), PUB_FP = crypto.createHash("sha256").update(MK.pub).digest("hex").slice(0, 16);
const decrypt = (b64) => crypto.privateDecrypt({ key: MK.priv, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(b64, "base64")).toString("utf8");

// Thông báo đẩy về điện thoại: tắt được trong app (config.notify = false); chống gửi trùng theo tag; chế độ thử chỉ ghi log
const sentTags = new Set();
function note(title, body, tag, url) {
  if (appCfg.notify === false || (tag && sentTags.has(tag))) return;
  if (tag) { if (sentTags.size > 2000) sentTags.clear(); sentTags.add(tag); }
  if (DRY) { log(`🔔 [thử, không gửi] ${title} — ${body}`); return; }
  notify(title, body, tag, url).catch(() => {});
}

let ghToken = null, healthy = false, lastForce = 0;
let ex = DRY ? makeClient({ mode: MODE }) : null, curKey = "", waiting = null, keySrc = null, appCfg = {}, lastCmd = null;
// Đọc lệnh + cài đặt từ app → áp dụng; đổi chế độ testnet↔thật thì THOÁT để vòng chạy khởi động lại sạch
async function resolveRun(first) {
  const cmd = await readCommand().catch(() => null); lastCmd = cmd;
  const c = (appCfg = cmd?.config || {});
  const mode = c.mode === "live" || c.mode === "testnet" ? c.mode : (process.env.MODE || "testnet").trim();
  if (!first && mode !== MODE) { log(`🔁 App đổi chế độ ${MODE} → ${mode}: khởi động lại bot`); await pushStatus({ mode: MODE, at: now(), waiting: "Đang khởi động lại để đổi chế độ…", pubKey: MK.pub, pubFp: PUB_FP }, true).catch(() => {}); process.exit(0); }
  MODE = mode;
  riskFrom(c); CAP = num(c.capitalCap, ENV("CAPITAL_CAP", 0));
  // token GitHub (chỉ đọc) cho tự cập nhật: từ app (mã hoá) hoặc GITHUB_TOKEN trong .env
  ghToken = process.env.GITHUB_TOKEN?.trim() || null;
  const g = cmd?.keys?.github; if (g?.token && (!g.pubFp || g.pubFp === PUB_FP)) { try { ghToken = decrypt(g.token); } catch { /* bỏ qua */ } }
  if (DRY) { waiting = null; return cmd; }
  let key = null, secret = null, src = null; waiting = null;
  const k = cmd?.keys?.[MODE];
  if (k?.key && k?.secret) {
    if (k.pubFp && k.pubFp !== PUB_FP) waiting = "Khoá API trong app được mã hoá cho MÁY KHÁC (máy bot đã cài lại) — nhập lại khoá trong app";
    else { try { key = decrypt(k.key); secret = decrypt(k.secret); src = "app"; } catch { waiting = "Không giải mã được khoá API — nhập lại khoá trong app"; } }
  } else if (process.env.BINANCE_KEY && process.env.BINANCE_SECRET && (process.env.MODE || "testnet").trim() === MODE) { key = process.env.BINANCE_KEY.trim(); secret = process.env.BINANCE_SECRET.trim(); src = ".env"; }
  if (MODE === "live" && !(c.liveConfirmedAt || process.env.I_UNDERSTAND_REAL_MONEY)) waiting = "Chưa xác nhận chạy TIỀN THẬT trong app";
  if (!key && !waiting) waiting = `Chưa có khoá API ${MODE === "live" ? "THẬT" : "Testnet"} — nhập trong app: Coin → Bot thật → Cài đặt`;
  if (waiting) { if (ex) log(`⏸ ${waiting}`); ex = null; curKey = ""; return cmd; }
  if (key + secret !== curKey) { // khoá mới → kết nối + kiểm tra
    const cli = makeClient({ mode: MODE, key, secret });
    try {
      await cli.syncTime(); await cli.balance();
      const dual = await cli.positionMode();
      if (dual.dualSidePosition) { waiting = "Tài khoản đang ở chế độ Hedge (2 chiều) — vào Binance Futures → Cài đặt → Chế độ vị thế → Một chiều"; ex = null; curKey = ""; return cmd; }
      ex = cli; curKey = key + secret; keySrc = src;
      log(`🔑 Đã kết nối ${MODE === "live" ? "SÀN THẬT" : "Testnet"} bằng khoá từ ${src === "app" ? "app" : ".env"} (…${key.slice(-4)}) · vốn tính khối lượng ${(await equityUsd()).toFixed(2)} USDT`);
    } catch (e) { waiting = `Khoá API ${MODE === "live" ? "thật" : "Testnet"} không dùng được: ${e.message}`; ex = null; curKey = ""; }
  }
  return cmd;
}

// Trạng thái lưu đĩa: không mất khi khởi động lại máy
let S = { handled: {}, active: {} };
function initState() {
  try { S = JSON.parse(fs.readFileSync(STATE_F, "utf8")); } catch { S = { handled: {}, active: {}, startedAt: now() }; }
  // Đổi chế độ (testnet ↔ tiền thật) → cất trạng thái cũ, bắt đầu sạch (không đem lệnh testnet sang sàn thật)
  if (S.mode && S.mode !== MODE) { const old = S.mode; fs.renameSync(STATE_F, `data/state-${old}-${Date.now()}.json`); S = { handled: {}, active: {}, startedAt: Date.now() }; console.log(`Đổi chế độ ${old} → ${MODE}: đã cất trạng thái cũ, bắt đầu sạch`); }
  S.mode = MODE;
  // Lệnh "Đóng tất cả" đã có từ trước khi bot có trạng thái này (cài mới/đổi chế độ/bản cũ) mà đã quá 10 phút → coi như đã xử lý, không chạy lại
  if (S.closeAllHandled == null) { const c = Number(lastCmd?.closeAllAt) || 0; S.closeAllHandled = c && now() - c > 600000 ? c : 0; }
  if (S.testHandled == null) { const c = Number(lastCmd?.testTradeAt) || 0; S.testHandled = c && now() - c > 1800000 ? c : 0; } // lệnh thử cũ (>30 phút) → không chạy lại
}
const save = () => fs.writeFileSync(STATE_F, JSON.stringify(S, null, 2));
const journal = (o) => { const e = { at: stamp(), ...o }; fs.appendFileSync(LOG_F, JSON.stringify(e) + "\n"); S.events = [e, ...(S.events || [])].slice(0, 60); };

// Lịch sử lệnh ĐÃ ĐÓNG (mới nhất trước, tối đa 1000) → dòng 'history' trên Supabase. Khởi động: dựng lại từ data/trades.jsonl
const HIST_MAX = 1000;
let HIST = [], histDirty = true, histTry = 0;
const vnMs = (s) => { const t = Date.parse(`${String(s).replace(" ", "T")}Z`); return isFinite(t) ? t - VN : null; }; // "2026-10-20 23:58:01" (giờ VN) → ms
const r4 = (v, d = 4) => (v == null || !isFinite(Number(v)) ? null : Number(Number(v).toFixed(d)));
const histRow = (e, exitAt) => ({ id: e.id, coin: e.coin, tf: e.tf, setup: e.setup, side: e.side, lim: e.lim, exit: e.exit ?? null, sl: e.sl, tp: e.tp, qty: e.filledQty || e.qty, riskUsd: r4(e.riskUsd), openedAt: e.openedAt || null, exitAt, pnl: r4(e.pnl), R: r4(e.R, 3), reason: e.reason || null, mode: e.mode || null });
function loadHistory() {
  let txt = ""; try { txt = fs.readFileSync(LOG_F, "utf8"); } catch { return; }
  const out = [];
  for (const l of txt.split("\n")) {
    if (!l.includes('"ev":"close"')) continue;
    try { const e = JSON.parse(l); if (e.ev === "close") out.push(histRow(e, e.exitAt || vnMs(e.at))); } catch { /* dòng hỏng → bỏ */ }
  }
  HIST = out.sort((a, b) => (b.exitAt || 0) - (a.exitAt || 0)).slice(0, HIST_MAX);
}
const addHist = (row) => { HIST = [row, ...HIST].slice(0, HIST_MAX); histDirty = true; };
async function syncHistory() { // chỉ ghi khi có thay đổi; lỗi → thử lại sau ≥ 60 giây. Chế độ thử không ghi (tránh đè lịch sử thật)
  if (DRY || !histDirty || now() - histTry < 60000) return;
  histTry = now();
  if (await pushHistory(HIST)) { histDirty = false; histTry = 0; if (S.test?.closed && !S.test.doneAt) testStep("Đã ghi lệnh vào lịch sử trên app — lệnh thử XONG", true, true); }
}

// Luật = cấu hình phiên Demo trong app (đọc lại mỗi lần quét ≈5 phút); vốn/rủi ro/giới hạn lấy từ .env (an toàn tiền thật)
let cfg = { ...cfgOf({ cfg: {} }), riskPct: RISK, maxOpen: MAX_OPEN, dailyStopPct: DAILY_STOP, maxLev: MAX_LEV }, cfgAt = 0, cfgSrc = "mặc định";
// ĐỒNG BỘ VỚI DEMO: luật (bộ lọc, cặp, setup, khung) + mốc dữ liệu học (startAt phiên Demo) + rủi ro & giới hạn (khi app bật "theo Demo" — mặc định bật)
let demoCfg = null, demoStart = null, rulesLog = [];
const clamp = (v, lo, hi, d) => (isFinite(Number(v)) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, Number(v))) : d); // chặn giá trị lạ (an toàn tiền thật)
function riskFrom(c) {
  const f = c.followDemo !== false && demoCfg;
  RISK = clamp(f ? demoCfg.riskPct : num(c.riskPct, ENV("RISK_PCT", 2)), 0.1, 5, 2);
  MAX_OPEN = Math.round(clamp(f ? demoCfg.maxOpen : num(c.maxOpen, ENV("MAX_OPEN", 3)), 1, 5, 3));
  DAILY_STOP = clamp(f ? demoCfg.dailyStopPct : num(c.dailyStopPct, ENV("DAILY_STOP_PCT", 6)), 1, 20, 6);
  MAX_LEV = Math.round(clamp(f ? demoCfg.maxLev : num(c.maxLev, ENV("MAX_LEV", 20)), 1, 20, 20));
}
async function refreshCfg() {
  if (Date.now() - cfgAt < 240000) return; cfgAt = Date.now(); // đọc cấu hình Demo mỗi lần quét (≈5 phút)
  const demo = await readDemoSession().catch(() => null);
  rulesLog = await readRulesLog().catch(() => rulesLog);
  if (!demo) return;
  demoCfg = cfgOf(demo); demoStart = Number(demo.startAt) > 0 ? Number(demo.startAt) : null; riskFrom(appCfg);
  const next = { ...demoCfg, riskPct: RISK, maxOpen: MAX_OPEN, dailyStopPct: DAILY_STOP, maxLev: MAX_LEV };
  cfgSrc = "phiên Demo trong app"; // đọc được phiên Demo (kể cả khi trùng mặc định)
  if (JSON.stringify(next) !== JSON.stringify(cfg)) { cfg = next; console.log(`[cấu hình] Dùng luật theo phiên Demo trong app: ${cfg.coins.join("/")} ${cfg.tfs.map((t) => TFS[t].label).join(" ")} · Key Volume ${cfg.keyVolume} · thuận D1 ${cfg.d1Bias ? "bật" : "tắt"} · tối ưu ${cfg.adaptive ? "bật" : "tắt"}${cfg.offStreams?.length ? ` · tắt riêng ${cfg.offStreams.join(", ")}` : ""}`); }
}
const symCoin = (s) => Object.entries(SYMBOLS).find(([, v]) => v === s)?.[0] || String(s).replace(/USDT$/, "");
// Cặp của bot = cặp trong luật Demo (user thêm/sửa/xoá trong app) + cặp mặc định + cặp còn lệnh/vị thế bot đang giữ (vd cặp vừa bị xoá khỏi danh sách)
const botSymbols = () => [...new Set([...cfg.coins.map(symOf), ...Object.values(SYMBOLS), ...Object.keys(S.active)])];
const sideStr = (s) => (s === 1 ? "BUY" : "SELL"), closeSide = (s) => (s === 1 ? "SELL" : "BUY");
const cid = (p, kind) => `qws${kind}${Math.floor(p.signalAt / 1000).toString(36)}${p.coin}${p.tf}`.slice(0, 36);

async function equityUsd() {
  if (DRY) return CAP || 1000;
  const b = await ex.balance(); const u = b.find((x) => x.asset === "USDT") || {};
  const eq = Number(u.balance || 0) + Number(u.crossUnPnl || 0);
  return CAP > 0 ? Math.min(CAP, eq) : eq;
}
// Lãi/lỗ đã chốt hôm nay (giờ VN) — phục vụ "dừng ngày"
async function todayPnl() {
  if (DRY) return 0;
  const d = new Date(now() + VN); d.setUTCHours(0, 0, 0, 0); const from = d.getTime() - VN;
  const rows = await ex.income({ startTime: from, limit: 1000 });
  return rows.filter((r) => ["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"].includes(r.incomeType)).reduce((s, r) => s + Number(r.income), 0);
}

// ---------- 1) Quản lý lệnh đang chờ / vị thế đang mở ----------
async function manage(posMap) {
  for (const [symbol, a] of Object.entries(S.active)) {
    try {
      const amt = posMap[symbol] || 0;
      if (a.stage === "entry") {
        if (DRY) { if (now() > a.until) { log(`⌛ [thử] ${a.coin} ${a.tf} lệnh chờ hết hạn`); delete S.active[symbol]; } continue; }
        const o = await ex.order(symbol, a.entryCid).catch(() => null);
        const filled = Number(o?.executedQty || 0);
        if (o && o.status === "FILLED") await protect(symbol, a, Math.abs(amt) || filled, "khớp đủ");
        else if (o && ["CANCELED", "EXPIRED", "REJECTED"].includes(o.status)) { log(`✖ ${a.coin} ${a.tf} lệnh chờ ${o.status}`); delete S.active[symbol]; }
        else if (now() > a.until) {
          await ex.cancel(symbol, a.entryCid).catch(() => {});
          if (filled > 0) await protect(symbol, a, Math.abs(amt) || filled, "khớp một phần, huỷ phần còn lại");
          else { log(`⌛ ${a.coin} ${a.tf} giá không về điểm vào — huỷ lệnh chờ`); journal({ ev: "expired", ...a }); delete S.active[symbol]; if (a.test) testStep("Lệnh thử không khớp sau 10 phút — đã huỷ", false, true); }
        }
      } else if (a.stage === "open") {
        if (amt === 0) { await closed(symbol, a); continue; }
        // lệnh thử: giữ 1 phút rồi đóng theo giá thị trường (kiểm tra đường đóng lệnh)
        if (a.test && !a.closeWhy && now() - a.openedAt > 60000) {
          a.closeWhy = "Lệnh thử";
          await ex.marketClose({ symbol, side: closeSide(a.side), quantity: Math.abs(amt) });
          testStep(`Đóng vị thế thử theo giá thị trường`);
          continue;
        }
        // giữ lệnh quá lâu (time stop như demo) → đóng theo giá thị trường
        if (now() - a.openedAt > cfg.timeStopBars * TFS[a.tf].ms) {
          log(`⏱ ${a.coin} ${a.tf} giữ quá ${cfg.timeStopBars} nến → đóng thị trường`);
          a.closeWhy = "Hết giờ";
          await ex.marketClose({ symbol, side: closeSide(a.side), quantity: Math.abs(amt) });
          continue;
        }
        // bảo đảm luôn có SL (bị huỷ/thiếu → đặt lại)
        const oo = await ex.openOrders(symbol), algo = await ex.openAlgo(symbol);
        const hasSl = [...oo, ...algo].some((x) => /STOP/.test(x.type || x.orderType || "") && !/TAKE/.test(x.type || x.orderType || ""));
        if (!hasSl) { log(`⚠ ${a.coin} thiếu SL → đặt lại`); await placeProtection(symbol, a); }
      }
    } catch (e) { log(`Lỗi quản lý ${symbol}:`, e.message); }
  }
  save();
}
async function placeProtection(symbol, a) {
  const sl = await ex.conditional({ symbol, side: closeSide(a.side), type: "STOP_MARKET", stopPrice: a.sl, clientId: a.entryCid.replace("qwsE", "qwsS") });
  const tp = await ex.conditional({ symbol, side: closeSide(a.side), type: "TAKE_PROFIT_MARKET", stopPrice: a.tp, clientId: a.entryCid.replace("qwsE", "qwsT") });
  a.slRef = sl.algoId || sl.orderId; a.tpRef = tp.algoId || tp.orderId; a.protKind = sl.kind;
}
async function protect(symbol, a, qty, why) {
  a.stage = "open"; a.openedAt = now(); a.filledQty = qty;
  note(`✅ Khớp ${dirStr(a.side)} ${a.coin} ${TFS[a.tf].label} @ ${px(a.lim)} · SL ${px(a.sl)} · TP ${px(a.tp)}`, `KL ${px(qty)} · rủi ro ${vn(a.riskUsd, 2)}$ · ${why} · ${modeLbl(a.mode)}`, `qws-bot-fill-${a.id}`);
  if (a.test) testStep(`Lệnh khớp @ ${px(a.lim)} · KL ${px(qty)}`);
  try { await placeProtection(symbol, a); } catch (e) { note(`⚠ Lỗi đặt SL/TP ${a.coin} ${TFS[a.tf].label}`, `${e.message} — bot thử lại ở vòng sau`, `qws-bot-prot-${a.id}`); if (a.test) testStep(`Lỗi đặt SL/TP: ${e.message} (bot thử lại)`, false); throw e; }
  if (a.test) testStep(`Đã đặt SL ${px(a.sl)} + TP ${px(a.tp)} trên sàn (${a.protKind === "algo" ? "lệnh Algo" : "lệnh điều kiện"})`);
  log(`✅ ${a.coin} ${a.tf} ${a.side === 1 ? "LONG" : "SHORT"} ${why} @ ${a.lim} · KL ${qty} · SL ${a.sl} · TP ${a.tp}`);
  journal({ ev: "open", ...a });
}
async function closed(symbol, a, why = null) {
  // Vị thế đã đóng (chạm SL/TP/đóng tay) → dọn lệnh còn treo + ghi kết quả
  await ex.cancelAll(symbol).catch(() => {});
  for (const x of await ex.openAlgo(symbol)) await ex.cancelAlgo(x.algoId).catch(() => {});
  let pnl = 0, fee = 0, exit = null;
  try {
    const tr = await ex.userTrades(symbol, { startTime: a.openedAt - 60000 });
    for (const t of tr) { pnl += Number(t.realizedPnl); fee += Number(t.commission); }
    const last = tr.filter((t) => Number(t.realizedPnl) !== 0).pop(); exit = last ? Number(last.price) : null;
  } catch { /* bỏ qua */ }
  const net = pnl - fee, R = a.riskUsd ? net / a.riskUsd : null, exitAt = now(), d = Math.abs(a.lim - a.sl);
  // lý do đóng: biết trước (hết giờ / đóng tất cả) hoặc đoán theo giá thoát gần TP hay SL (±0,25R)
  const reason = why || a.closeWhy || (exit == null || !d ? null : Math.abs(exit - a.tp) <= 0.25 * d ? "TP" : Math.abs(exit - a.sl) <= 0.25 * d ? "SL" : "Khác");
  log(`🏁 ${a.coin} ${a.tf} đóng${exit ? ` @ ${exit}` : ""}${reason ? ` (${reason})` : ""} · lãi/lỗ ${net.toFixed(2)} USDT${R != null ? ` (${R.toFixed(2)}R)` : ""}`);
  journal({ ev: "close", ...a, exit, pnl: net, R, reason, exitAt });
  addHist(histRow({ ...a, exit, pnl: net, R, reason }, exitAt));
  const cT = `🏁 Đóng ${a.coin} ${TFS[a.tf].label} · ${sgn(net, 2)}$${R != null ? ` (${sgn(R, 1)}R)` : ""}`, cB = `${dirStr(a.side)} @ ${px(a.lim)}${exit ? ` → ${px(exit)}` : ""}${reason ? ` · ${reason}` : ""} · ${modeLbl(a.mode)}`;
  if (a.test) { // lệnh thử: gửi thông báo NGAY (kể cả khi tắt thông báo) và ghi kết quả gửi
    testStep(`Vị thế đã đóng · lãi/lỗ ${sgn(net, 2)}$ (đã trừ phí)`);
    const ok = DRY ? false : await notify(`🧪 ${cT}`, `Lệnh THỬ · ${cB}`, `qws-bot-test-${a.id}`);
    testStep(ok ? "Gửi thông báo về điện thoại: OK" : `Gửi thông báo về điện thoại LỖI (${lastPush_?.status ?? "?"}) — kiểm tra SUPABASE_SERVICE_KEY / hàm qws-send-push`, ok);
    if (S.test) S.test.closed = true;
  } else note(cT, cB, `qws-bot-close-${a.id}`);
  delete S.active[symbol];
}

// ---------- 2) Tìm tín hiệu mới + đặt lệnh chờ ----------
async function scan(posMap, halted) {
  const raw = await runSession({ startAt: demoStart || now() - 90 * 86400000, cfg }, () => {}); // cùng mốc học với phiên Demo → tối ưu + bài học giống Demo
  const fresh = (raw.pending || []).filter((p) => !S.handled[p.id] && now() < p.until);
  // THỬ QUY TRÌNH (chỉ testnet/thử): FAKE_SIGNAL=BTC → 1 lệnh LONG giả sát giá hiện tại để kiểm tra đặt lệnh → khớp → SL/TP → đóng
  const fc = (process.env.FAKE_SIGNAL || "").trim().toUpperCase();
  if (fc && MODE !== "live" && !S.fakeDone) {
    const m = await fetch(`${MAIN}/fapi/v1/premiumIndex?symbol=${symOf(fc)}`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    const px = Number(m.markPrice), lim = px * 0.9995;
    fresh.push({ id: `fake-${now()}`, coin: fc, tf: "5m", setup: "TEST", side: 1, lim, sl: lim * 0.995, signalAt: now(), until: now() + 15 * 60000 });
    S.fakeDone = true;
    log(`🧪 Tạo tín hiệu GIẢ để thử quy trình: ${fc} LONG @ ~${lim.toFixed(2)} (SL -0,5%)`);
  }
  for (const p of fresh) {
    S.handled[p.id] = now();
    const symbol = symOf(p.coin);
    if (p.blocked) { log(`· Bỏ tín hiệu ${p.coin} ${TFS[p.tf].label}: ${p.blocked} (giống Demo)`); journal({ ev: "skip", why: p.blocked, ...p, tags: undefined }); continue; }
    const why = halted || (S.active[symbol] || posMap[symbol] ? `đã có lệnh/vị thế ${p.coin}` : Object.keys(S.active).length >= MAX_OPEN ? `đủ ${MAX_OPEN} lệnh` : null);
    if (why) { log(`· Bỏ tín hiệu ${p.coin} ${TFS[p.tf].label} ${p.side === 1 ? "LONG" : "SHORT"}: ${why}`); journal({ ev: "skip", why, ...p, tags: undefined }); continue; }
    try { await place(p, symbol); } catch (e) { log(`Lỗi đặt lệnh ${p.coin}:`, e.message); journal({ ev: "error", msg: e.message, ...p }); note(`⚠ Lỗi đặt lệnh ${p.coin} ${TFS[p.tf].label} ${dirStr(p.side)}`, `${e.message} · ${modeLbl()}`, `qws-bot-err-${p.id}`); }
  }
  // dọn danh sách đã xử lý (> 2 ngày)
  for (const [k, t] of Object.entries(S.handled)) if (now() - t > 2 * 86400000) delete S.handled[k];
  save();
  return raw;
}
async function place(p, symbol) {
  const info = DRY ? { tick: 0.01, step: 0.001, minNotional: 5 } : await ex.symbolInfo(symbol);
  // Testnet giá lệch nhẹ với sàn thật → quy đổi theo tỉ lệ giá mark hiện tại (giữ đúng khoảng cách SL/TP)
  let k = 1;
  if (MODE === "testnet" && !DRY) {
    const [t, m] = await Promise.all([ex.markPrice(symbol), fetch(`${MAIN}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json())]);
    k = Number(t.markPrice) / Number(m.markPrice); if (!(k > 0.9 && k < 1.1)) k = 1;
  }
  const lim = ex.roundTo(p.lim * k, info.tick), sl = ex.roundTo(p.sl * k, info.tick);
  const risk = Math.abs(lim - sl), tp = ex.roundTo(lim + p.side * (p.rr || cfg.rr) * risk, info.tick);
  const rp = p.riskPct ?? riskNow(), eq = await equityUsd(), riskUsd = (eq * rp) / 100; // lệnh thử: rủi ro nhỏ riêng · chuỗi thua: rủi ro giảm
  let qty = riskUsd / risk; const maxQty = (MAX_LEV * eq) / lim; if (qty > maxQty) qty = maxQty;
  qty = ex.roundTo(qty, info.step, "floor");
  if (!(qty > 0) || qty * lim < info.minNotional) { log(`· Bỏ ${p.coin}: khối lượng ${qty} quá nhỏ (tối thiểu ${info.minNotional} USDT)`); journal({ ev: "skip", why: "khối lượng nhỏ", ...p }); return; }
  const a = { id: p.id, coin: p.coin, tf: p.tf, setup: p.setup, side: p.side, lim, sl, tp, qty, riskUsd: qty * risk, until: p.until, signalAt: p.signalAt, entryCid: cid(p, "E"), stage: "entry", placedAt: now(), mode: MODE, ...(p.test ? { test: true } : {}) };
  if (!DRY) {
    await ex.setMarginType(symbol, "ISOLATED").catch(() => {});
    await ex.setLeverage(symbol, MAX_LEV).catch(() => {});
    await ex.placeLimit({ symbol, side: sideStr(p.side), quantity: qty, price: lim, clientId: a.entryCid });
  }
  S.active[symbol] = a;
  if (rp < RISK && !p.test) log(`↓ Đang chuỗi thua ${lossRun()} lệnh → rủi ro lệnh này ${rp}% (thay vì ${RISK}%)`);
  log(`📌 ${DRY ? "[thử] " : ""}Lệnh chờ ${p.coin} ${TFS[p.tf].label} ${p.side === 1 ? "LONG" : "SHORT"} @ ${lim} · SL ${sl} · TP ${tp} · KL ${qty} · rủi ro ${(qty * risk).toFixed(2)}$ · huỷ lúc ${stamp(p.until)}`);
  journal({ ev: "placed", ...a });
  // Báo điện thoại khi ĐẶT lệnh chờ (21/10) — tắt riêng được bằng config.notifyPending = false; lệnh thử đã có báo riêng
  if (!p.test && appCfg.notifyPending !== false) note(`📌 Lệnh chờ ${dirStr(p.side)} ${p.coin} ${TFS[p.tf].label} @ ${px(lim)}`, `SL ${px(sl)} · TP ${px(tp)} · rủi ro ${vn(qty * risk, 2)}$ · huỷ lúc ${stamp(p.until)} · ${modeLbl()}`, `qws-bot-place-${p.id}`);
}

// ---------- Lệnh thử (chỉ Testnet) từ app (command.testTradeAt) ----------
// Kiểm tra trọn quy trình mà không cần ngồi trước máy: đặt lệnh chờ LONG sát giá (khớp ngay) → SL/TP → giữ 1 phút → đóng thị trường
// → ghi lịch sử → gửi thông báo về điện thoại. Rủi ro 0,1% vốn. Từng bước báo về app qua status.test.
function testStep(msg, ok = true, done = false) {
  if (!S.test) return;
  S.test.steps = [...(S.test.steps || []), { t: now(), msg, ok }].slice(-20);
  if (!ok) S.test.ok = false;
  if (done) { S.test.doneAt = now(); if (S.test.ok !== false) S.test.ok = ok; }
  log(`🧪 ${ok ? "" : "✖ "}${msg}`); save();
}
async function startTest(at, posMap, stop) {
  S.testHandled = at; S.test = { at, steps: [], ok: null, doneAt: null };
  const fail = (m) => testStep(m, false, true);
  if (now() - at > 30 * 60000) return fail("Lệnh thử gửi từ hơn 30 phút trước — bỏ qua, bấm lại trong app");
  if (MODE !== "testnet") return fail("Lệnh thử chỉ chạy ở Testnet");
  if (stop) return fail("Bot đang DỪNG — bấm “Chạy lại” rồi thử lại");
  if (Object.keys(S.active).length >= MAX_OPEN) return fail(`Đang đủ ${MAX_OPEN} lệnh — thử lại sau`);
  const coin = ["BTC", "ETH"].find((c) => !S.active[symOf(c)] && !posMap[symOf(c)]);
  if (!coin) return fail("BTC và ETH đều đang có lệnh — thử lại sau");
  try {
    const m = await fetch(`${MAIN}/fapi/v1/premiumIndex?symbol=${symOf(coin)}`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    const lim = Number(m.markPrice) * 1.001; // LONG cao hơn giá 0,1% → khớp ngay
    if (!(lim > 0)) return fail("Không lấy được giá");
    const p = { id: `test-${at}`, coin, tf: "5m", setup: "TEST", side: 1, lim, sl: lim * 0.996, rr: 1.5, riskPct: 0.1, test: true, signalAt: now(), until: now() + 10 * 60000 };
    Object.assign(S.test, { id: p.id, coin });
    testStep(`Bắt đầu: LONG ${coin} sát giá, rủi ro 0,1% vốn (Testnet)`);
    await place(p, symOf(coin));
    const a = S.active[symOf(coin)];
    if (a?.test) testStep(`Đã đặt lệnh chờ ${coin} @ ${px(a.lim)} · KL ${px(a.qty)} · SL ${px(a.sl)} · TP ${px(a.tp)}`);
    else fail("Không đặt được lệnh (khối lượng dưới mức tối thiểu của sàn)");
  } catch (e) { fail(`Lỗi đặt lệnh: ${e.message}`); }
}

// ---------- 3) "Đóng tất cả" từ app ----------
// CHỈ các cặp của bot (botSymbols: cặp trong luật + mặc định + cặp còn lệnh bot) trong ví Futures. Đóng vị thế bằng MARKET reduceOnly rồi huỷ mọi lệnh (thường + algo/điều kiện).
// Cặp nào đóng không được → giữ SL/TP + theo dõi tiếp, chỉ huỷ lệnh chờ vào; thử lại tối đa 5 vòng rồi báo lỗi.
const CA = { tries: 0, done: [] };
async function closeAll(at, posMap) {
  if (!CA.tries) log("🧹 Nhận lệnh ĐÓNG TẤT CẢ từ app — đóng vị thế + huỷ mọi lệnh của bot (các cặp của bot, ví Futures; không đụng Spot)");
  CA.tries++;
  const errs = [];
  if (!DRY) {
    const mine = botSymbols();
    for (const symbol of mine) {
      const amt = posMap[symbol] || 0, coin = symCoin(symbol);
      try {
        if (amt) { await ex.marketClose({ symbol, side: amt > 0 ? "SELL" : "BUY", quantity: Math.abs(amt) }); if (!CA.done.includes(coin)) CA.done.push(coin); }
        await ex.cancelAll(symbol);
        for (const x of await ex.openAlgo(symbol)) await ex.cancelAlgo(x.algoId);
      } catch (e) {
        errs.push(`${coin}: ${e.message}`);
        if (amt) for (const o of await ex.openOrders(symbol).catch(() => [])) if (!o.reduceOnly && !o.closePosition) await ex.cancel(symbol, o.clientOrderId).catch(() => {});
      }
    }
    if (CA.done.length) await sleep(1500); // chờ sàn chốt khớp lệnh đóng
    const left = {};
    for (const p of await ex.positions()) if (Number(p.positionAmt) !== 0 && mine.includes(p.symbol)) left[p.symbol] = Number(p.positionAmt);
    for (const [symbol, a] of Object.entries(S.active)) {
      if (left[symbol]) continue; // còn vị thế → giữ để bot tiếp tục bảo vệ SL/TP
      if (a.stage === "open" || posMap[symbol]) { if (!a.openedAt) a.openedAt = a.placedAt || now(); await closed(symbol, a, "Đóng tất cả").catch((e) => log(`Lỗi ghi kết quả ${symbol}:`, e.message)); }
      delete S.active[symbol];
    }
    for (const symbol of Object.keys(left)) if (!errs.some((e) => e.startsWith(`${symCoin(symbol)}:`))) errs.push(`${symCoin(symbol)}: vẫn còn vị thế ${left[symbol]}`);
  } else S.active = {};
  if (errs.length && CA.tries < 5) { log(`⚠ Đóng tất cả chưa xong (lần ${CA.tries}/5): ${errs.join("; ")} — thử lại vòng sau`); save(); return false; }
  S.closeAllHandled = at;
  journal({ ev: "closeAll", closed: CA.done, errors: errs, mode: MODE });
  if (errs.length) { log(`⚠ Đóng tất cả XONG MỘT PHẦN: ${errs.join("; ")} — kiểm tra trên Binance`); note("⚠ Đóng tất cả chưa xong", `${errs.join("; ")} — kiểm tra trên Binance · ${modeLbl()}`, `qws-bot-closeall-${at}`); }
  else { log(`🧹 Đã đóng tất cả${CA.done.length ? `: ${CA.done.join(", ")}` : " (không có vị thế mở)"} · đã huỷ mọi lệnh chờ/SL/TP`); note("🧹 Đã đóng tất cả lệnh của bot", `${CA.done.length ? `Đóng ${CA.done.join(", ")} theo giá thị trường` : "Không có vị thế mở"} · đã huỷ mọi lệnh chờ/SL/TP · ${modeLbl()}${lastCmd?.stop ? " · Bot đang DỪNG, bấm “Chạy lại” trong app để chạy tiếp" : ""}`, `qws-bot-closeall-${at}`); }
  CA.tries = 0; CA.done = [];
  save();
  return true;
}
const cfgSummary = () => { const { coins, tfs, setups, keyVolume, d1Bias, sigVol, noEngulf, maxExtAtr, minSlAtr, adaptive, learnLoss, rr, streakN, streakRiskPct, cfgVer } = cfg; return { coins, tfs, setups, keyVolume, d1Bias, sigVol, noEngulf, maxExtAtr, minSlAtr, adaptive, learnLoss, rr, streakN, streakRiskPct, cfgVer }; };
// Chuỗi thua (luật Demo v9): số lệnh THUA liền gần nhất của chế độ đang chạy (bỏ lệnh thử) → đủ streakN thì rủi ro = streakRiskPct (≤ rủi ro cài đặt) tới khi thắng lại
function lossRun() { let n = 0; for (const t of HIST) { if (t.setup === "TEST" || (t.mode && t.mode !== MODE)) continue; if (Number(t.pnl) < 0) n++; else if (Number(t.pnl) > 0) break; } return n; }
const riskNow = () => (cfg.streakN > 0 && lossRun() >= cfg.streakN ? Math.min(RISK, cfg.streakRiskPct ?? RISK / 2) : RISK);

// ---------- Báo cáo tuần (tối Chủ nhật ≥ 20:00 giờ VN; máy tắt lúc đó thì gửi bù trong 16 giờ sau) ----------
// Demo (chạy lại cùng luật/mốc học như tab Demo) + lệnh thật của bot trong 7 ngày, kèm tiến độ tháng so với mục tiêu 10 lệnh
let lastRaw = null;
// Cảnh báo cặp × khung đang âm 30 ngày (≥ 10 lệnh Demo, R TB < 0) — mỗi cặp × khung tối đa 1 lần / tuần; mở thẳng bảng "nên giữ hay tắt".
// CHỈ báo — không tự tắt (sếp quyết ở Demo → Thống kê). Tắt riêng: config.notifyWeak = false.
function weakAlert() {
  if (DRY || ONCE || !lastRaw || appCfg.notifyWeak === false) return;
  const since = now() - 30 * 86400000, off = new Set(cfg.offStreams || []), wk = Math.floor((now() + VN) / (7 * 86400000));
  const T = finalize(lastRaw, null).portfolio.trades.filter((t) => t.status === "done" && t.r != null && t.entryAt >= since);
  S.weakSent ||= {};
  for (const [k, t] of Object.entries(S.weakSent)) if (now() - t > 35 * 86400000) delete S.weakSent[k];
  for (const coin of cfg.coins) for (const tf of cfg.tfs) {
    if (off.has(`${coin}|${tf}`)) continue;
    const L = T.filter((t) => t.coin === coin && t.tf === tf);
    if (L.length < 10) continue;
    const avg = L.reduce((a, t) => a + t.r, 0) / L.length;
    if (avg >= 0) continue;
    const tag = `qws-bot-weak-${coin}-${tf}-${wk}`;
    if (S.weakSent[tag]) continue;
    S.weakSent[tag] = now(); save();
    const win = (L.filter((t) => t.r > 0.05).length / L.length) * 100;
    log(`⚠ ${coin} ${TFS[tf].label} âm 30 ngày: ${L.length} lệnh, TB ${avg.toFixed(2)}R`);
    note(`⚠ ${coin} ${TFS[tf].label} đang âm 30 ngày qua`, `${L.length} lệnh Demo · thắng ${vn(win, 0)}% · TB ${avg.toFixed(2).replace(".", ",")}R. Mở Demo → Thống kê để xem nên giữ hay "Tắt khung" (bot không tự tắt).`, tag, "/coin?tab=bot");
  }
}
function weeklyReport() {
  if (DRY || ONCE || !lastRaw) return;
  const vnNow = new Date(now() + VN), sun = new Date(vnNow); sun.setUTCHours(20, 0, 0, 0); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay()); // Chủ nhật gần nhất 20:00 (giờ VN, dạng UTC giả)
  if (sun > vnNow) sun.setUTCDate(sun.getUTCDate() - 7);
  const at = sun.getTime() - VN, key = sun.toISOString().slice(0, 10);
  if (now() - at > 16 * 3600000 || S.weeklySent === key) return;
  S.weeklySent = key; save();
  const from = at - 7 * 86400000, mon = new Date(vnNow).toISOString().slice(0, 7), inMon = (t) => new Date(Number(t) + VN).toISOString().slice(0, 7) === mon;
  const P = finalize(lastRaw, null).portfolio.trades.filter((t) => t.status === "done" || t.status === "open");
  const dW = P.filter((t) => t.entryAt >= from && t.entryAt < at), dWs = statsOf(dW.filter((t) => t.status === "done")), dPnl = dW.reduce((x, t) => x + (t.pnl || 0), 0);
  const L = HIST.filter((t) => t.setup !== "TEST" && (!t.mode || t.mode === MODE)), lW = L.filter((t) => t.exitAt >= from && t.exitAt < at), lPnl = lW.reduce((x, t) => x + (Number(t.pnl) || 0), 0);
  const d2 = (t) => new Date(t + VN).toISOString().slice(5, 10).split("-").reverse().join("/");
  const title = `📅 Tuần ${d2(from)}–${d2(at - 1)}: Demo ${dW.length} lệnh ${sgn(dPnl, 2)}$ · Bot ${lW.length} lệnh ${sgn(lPnl, 2)}$`;
  // Cặp × khung đang yếu 30 ngày (≥ 5 lệnh, R TB < 0) — giống cảnh báo trong app
  const d30 = P.filter((t) => t.status === "done" && t.r != null && t.entryAt >= at - 30 * 86400000), off = new Set(cfg.offStreams || []), weak = [];
  for (const c of cfg.coins) for (const tf of cfg.tfs) {
    if (off.has(`${c}|${tf}`)) continue;
    const X = d30.filter((t) => t.coin === c && t.tf === tf);
    if (X.length >= 5) { const a = X.reduce((x, t) => x + t.r, 0) / X.length; if (a < 0) weak.push({ k: `${c} ${TFS[tf].label}`, a, n: X.length }); }
  }
  weak.sort((x, y) => x.a - y.a);
  const r2 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}R`;
  // Thay đổi luật trong tuần + kết quả từ lúc đổi (lệnh Demo đã đóng)
  const chg = (rulesLog || []).filter((x) => x.at >= from && x.at < at).slice(0, 3).map((x) => {
    const A = P.filter((t) => t.status === "done" && t.entryAt >= x.at), a = A.length ? A.reduce((s, t) => s + t.r, 0) / A.length : null;
    return `${String(x.what || "").slice(0, 40)} (${d2(x.at)}) → ${A.length ? `${A.length} lệnh ${r2(a)}` : "chưa có lệnh"}`;
  });
  const body = `Demo: thắng ${dWs.n ? vn(dWs.winRate, 0) : "—"}% · tháng này ${P.filter((t) => inMon(t.entryAt)).length}/10 lệnh. Bot ${modeLbl()}: ${lW.filter((t) => Number(t.pnl) > 0).length} thắng · tháng này ${L.filter((t) => t.exitAt && inMon(t.exitAt)).length}/10 lệnh.`
    + (weak.length ? ` ⚠ Yếu 30 ngày: ${weak.slice(0, 3).map((w) => `${w.k} ${r2(w.a)} (${w.n})`).join(", ")}.` : " Không cặp nào âm 30 ngày.")
    + (chg.length ? ` Đổi luật tuần này: ${chg.join("; ")}.` : "") + " Không phải tư vấn đầu tư.";
  log(`📅 Báo cáo tuần: ${title}`);
  note(title, body, `qws-bot-week-${key}`);
}

// ---------- Vòng lặp ----------
async function cycle(state) {
  const cmd = await resolveRun(false);
  const stop = fs.existsSync(STOP_F) || cmd?.stop;
  const base = { mode: MODE, dry: DRY, at: now(), pubKey: MK.pub, pubFp: PUB_FP, keys: { testnet: !!cmd?.keys?.testnet, live: !!cmd?.keys?.live }, keySrc, settings: { riskPct: RISK, maxOpen: MAX_OPEN, dailyStopPct: DAILY_STOP, maxLev: MAX_LEV, capitalCap: CAP }, version: updateInfo(), github: !!ghToken, cfgSummary: cfgSummary(), rulesHash: RULES_HASH, closeAllHandled: S.closeAllHandled || 0, notify: appCfg.notify !== false, histCount: HIST.length };
  if (!DRY && !ex) { await pushStatus({ ...base, waiting, stopped: !!stop, risk: RISK, maxOpen: MAX_OPEN, dailyStop: DAILY_STOP, active: S.active, events: (S.events || []).slice(0, 40) }, true).catch(() => {}); await syncHistory(); await maybeUpdate(cmd); return; } // chờ khoá / cài đặt từ app
  let posMap = {};
  const readPos = async () => { posMap = {}; if (!DRY) for (const p of await ex.positions()) if (Number(p.positionAmt) !== 0) posMap[p.symbol] = Number(p.positionAmt); };
  await readPos();
  if (Number(cmd?.closeAllAt) > (S.closeAllHandled || 0)) { await closeAll(Number(cmd.closeAllAt), posMap); await readPos(); }
  if (stop && !state.stopped) { // dừng khẩn: huỷ lệnh CHỜ vào, giữ SL/TP của vị thế đang mở
    log("🛑 Nhận lệnh DỪNG — huỷ các lệnh chờ, không mở lệnh mới");
    for (const [symbol, a] of Object.entries(S.active)) if (a.stage === "entry") { if (!DRY) await ex.cancel(symbol, a.entryCid).catch(() => {}); delete S.active[symbol]; }
    save();
  }
  state.stopped = !!stop;
  if (!DRY && Number(cmd?.testTradeAt) > (S.testHandled || 0)) await startTest(Number(cmd.testTradeAt), posMap, stop);
  await manage(posMap);
  const closedBar = Math.floor(now() / 300000); // mỗi nến M5 đóng (+8s cho sàn chốt nến) → quét tín hiệu
  let raw = null;
  if (closedBar !== state.lastBar && (ONCE || now() % 300000 > 8000)) {
    state.lastBar = closedBar;
    const eq = await equityUsd(), pnl = await todayPnl();
    const dayHalt = pnl <= -(DAILY_STOP / 100) * eq ? `đã lỗ ${pnl.toFixed(2)}$ hôm nay (chạm dừng ngày -${DAILY_STOP}%)` : null;
    const day = stamp().slice(0, 10);
    if (dayHalt && S.dayStopNoted !== day) { S.dayStopNoted = day; save(); log(`⛔ Chạm dừng ngày: ${dayHalt} — không mở lệnh mới đến 0h (giờ VN)`); note(`⛔ Chạm dừng ngày -${DAILY_STOP}%`, `Đã lỗ ${vn(-pnl, 2)}$ hôm nay — bot không mở lệnh mới đến 0h (giờ VN) · ${modeLbl()}`, `qws-bot-daystop-${day}`); }
    const halted = stop ? "đang DỪNG" : dayHalt;
    await refreshCfg();
    raw = await scan(posMap, halted);
    state.lastScan = { at: now(), eq, pnl, halted, pending: (raw.pending || []).length };
    lastRaw = raw;
  }
  await pushStatus({ ...base, cfgSummary: cfgSummary(), closeAllHandled: S.closeAllHandled || 0, histCount: HIST.length, waiting: null, rules: cfgSrc, stopped: !!stop, risk: RISK, maxOpen: MAX_OPEN, dailyStop: DAILY_STOP, active: S.active, lastScan: state.lastScan || null, lossRun: lossRun(), riskNow: riskNow(), learnFrom: demoStart, followDemo: appCfg.followDemo !== false, positions: posMap, events: (S.events || []).slice(0, 40), test: S.test || null }).catch(() => {});
  await syncHistory();
  try { weeklyReport(); } catch (e) { log("Lỗi báo cáo tuần:", e.message); }
  try { weakAlert(); } catch (e) { log("Lỗi cảnh báo cặp yếu:", e.message); }
}

// Tự cập nhật: 5 phút/lần hoặc khi bấm "Cập nhật ngay" trong app; có bản mới → thoát để vòng chạy bật bản mới
async function maybeUpdate(cmd) {
  if (DRY || ONCE) return;
  if (!healthy) {
    healthy = true;
    const p = markHealthy(log);
    if (p) note(`⬆ Bot đã cập nhật bản ${p.sha.slice(0, 7)}`, `${p.msg || updateInfo().msg || ""} · tải từ ${p.source === "github" ? "GitHub" : "web"} · đang chạy tốt`, `qws-bot-update-${p.sha.slice(0, 7)}`);
    if (rolledBack) note(`⚠ Bản cập nhật ${rolledBack.sha.slice(0, 7)} lỗi — đã quay về bản cũ`, "Bản mới khởi động lỗi 3 lần liên tiếp nên bot tự dùng lại bản trước", `qws-bot-rollback-${rolledBack.sha.slice(0, 7)}`);
  }
  const force = (cmd?.updateNow || 0) > lastForce; if (force) lastForce = cmd.updateNow;
  if (await checkUpdate(ghToken, { force, log, intervalMs: 300000 })) { save(); await pushStatus({ mode: MODE, at: now(), waiting: "Đang cài bản cập nhật mới…", pubKey: MK.pub, pubFp: PUB_FP, version: updateInfo() }, true).catch(() => {}); process.exit(0); }
}

async function main() {
  await resolveRun(true);
  const prev = await readStatus(); // trạng thái lần trước → bot đã im lặng bao lâu
  initState();
  loadHistory();
  log(`Bot khởi động · chế độ ${DRY ? "THỬ (không đặt lệnh)" : MODE.toUpperCase()} · rủi ro ${RISK}%/lệnh · tối đa ${MAX_OPEN} lệnh · dừng ngày -${DAILY_STOP}% · đòn bẩy ≤ ${MAX_LEV}x · luật: ${cfg.coins.join("/")} ${cfg.tfs.map((t) => TFS[t].label).join(" ")}`);
  if (!DRY && !ex) log(`⏸ ${waiting}`);
  if (HIST.length) log(`Lịch sử: ${HIST.length} lệnh đã đóng (dựng lại từ ${LOG_F})`);
  if (prev?.at && now() - prev.at > 600000) note(`▶ Bot chạy lại sau ${dur(now() - prev.at)} im lặng`, `Máy chạy bot đã hoạt động trở lại · ${modeLbl()}${waiting && !DRY ? ` · ${waiting}` : ""}`, "qws-bot-start");
  const state = { lastBar: null };
  // Canh treo: 1 vòng chạy quá 10 phút (mạng/sàn treo) → thoát để run-bot.cmd khởi động lại sạch (vị thế vẫn có SL/TP trên sàn)
  let beat = now();
  if (!ONCE) setInterval(() => { if (now() - beat > 600000) { log("⚠ Vòng chạy treo quá 10 phút → khởi động lại bot"); process.exit(1); } }, 60000).unref();
  for (;;) {
    try { await cycle(state); await maybeUpdate(lastCmd); } catch (e) { log("Lỗi vòng lặp:", e.message); }
    beat = now();
    if (ONCE) { log("Xong 1 vòng (--once)."); break; }
    await sleep(15000);
  }
}
main();
