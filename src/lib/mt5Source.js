// Nguồn dữ liệu thị trường FOREX / CFD từ MT5 (09/11/2026) — thay Binance cho tab "Thị trường Forex".
// Trình duyệt không đọc được MT5 → cầu nối chạy cạnh MT5 trên máy bàn (bridge/mt5_market.py) ghi lên Supabase, bảng qws_mt5_bot
// (cùng bảng với EA, chỉ chủ đọc được — không cần tạo bảng mới):
//   mk|<MÃ>|<khung>   400 nến [t(giây UTC), open, high, low, close, tickVolume], cập nhật khi nến vừa đóng (+ lúc khởi động)
//   mkq               ~6 giây/lần: giá mua/bán + nến ĐANG CHẠY của mọi khung; ok[] = mã cầu nối có; missing[] = mã sàn không có
//   command.watch     danh sách mã THÊM của app → cầu nối tự theo dõi thêm (ngoài danh sách mặc định)
// Khối lượng = tick volume (số lần giá nhảy), KHÔNG phải khối lượng khớp thật; không có mua/bán chủ động → nf = true.
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { fmtNum } from "./format.js";

const T = "qws_mt5_bot";
export const FX_DEFAULT = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD", "US500", "JP225", "US2000"]; // = 6 mã của EA + 3 cặp chính; bridge/mt5_market.py giữ cùng danh sách

const rowId = (sym, tf) => `mk|${sym}|${tf}`;
const errNo = (msg, extra) => Object.assign(new Error(msg), extra);

// nến [t,o,h,l,c,v] → định dạng của app (nf: không có mua/bán chủ động → delta/CVD bị tắt, volume chia đôi cho khỏi lệch phép tính)
export const barOf = (a) => ({ time: a[0], open: a[1], high: a[2], low: a[3], close: a[4], volume: a[5], buy: a[5] / 2, sell: a[5] / 2, nf: true });

// ---- Bộ đọc giá chung (mkq): 1 vòng 6 giây cho mọi ô/khung đang mở ----
const subs = new Set();
let last = null, timer = null, lastErr = null, busy = false;
async function pollQuotes() {
  if (busy) return; busy = true;
  try {
    const { data, error } = await supabase.from(T).select("data,updated_at").eq("id", "mkq").maybeSingle();
    if (error) lastErr = error.message; else { lastErr = null; if (data) last = { ...data.data, _at: Date.now(), _row: data.updated_at }; }
  } catch (e) { lastErr = e.message || String(e); }
  busy = false;
  subs.forEach((f) => f(last));
}
export function subscribeQuotes(cb) {
  subs.add(cb);
  if (!timer) { pollQuotes(); timer = setInterval(() => { if (!document.hidden) pollQuotes(); }, 6000); }
  else if (last) cb(last);
  return () => { subs.delete(cb); if (!subs.size) { clearInterval(timer); timer = null; } };
}
export const quotesNow = () => last;
export const fxDigits = (sym) => (last?.q?.[sym]?.digits ?? null); // số chữ số thập phân của sàn (EURUSD 5, USDJPY 3, XAUUSD 2)
async function freshQuotes(maxAge = 8000) {
  if (!last || Date.now() - last._at > maxAge) await pollQuotes();
  return last;
}

// Trạng thái nguồn MT5 cho giao diện: online = cầu nối gửi giá trong 3 phút gần nhất (chợ đóng cuối tuần vẫn gửi giá cuối)
export function useMt5Feed(active) {
  const [q, setQ] = useState(last), [err, setErr] = useState(null), [loaded, setLoaded] = useState(!!last);
  useEffect(() => {
    if (!active) return undefined;
    return subscribeQuotes((x) => { setQ(x); setErr(lastErr); setLoaded(true); });
  }, [active]);
  const ts = q?.ts || null;
  return { q, err, loaded, ts, online: !!ts && Date.now() - ts < 180000, ok: q?.ok || [], missing: q?.missing || [] };
}

// ---- Nến ----
export async function mt5Klines(sym, tf, limit = 300, opts = {}) {
  const q = await freshQuotes();
  if (q?.missing?.includes(sym)) throw errNo(`Sàn MT5 (IC Markets) không có mã ${sym}`, { badSymbol: true });
  const { data, error } = await supabase.from(T).select("data").eq("id", rowId(sym, tf)).maybeSingle();
  if (error) throw new Error(/qws_mt5_bot|relation|does not exist|schema cache/i.test(error.message) ? "Chưa tạo bảng qws_mt5_bot (chạy supabase/SETUP-MT5-BOT.sql)" : error.message);
  if (!data?.data?.bars?.length) {
    if (!q) throw new Error("Cầu nối MT5 chưa chạy trên máy bàn — chưa có giá Forex (xem hướng dẫn cài ở tab Trade Forex).");
    throw new Error(q.ok?.includes(sym) ? `Cầu nối đang tải nến ${sym} ${tf} — thử lại sau ít giây` : `Chưa có nến ${sym} ${tf} (mã mới, chờ cầu nối ≤ 1 phút)`);
  }
  let bars = data.data.bars.map(barOf);
  // ghép nến đang chạy (mkq) nếu mới hơn hàng đã lưu
  const f = q?.q?.[sym]?.f?.[tf];
  if (f && f[0] >= bars[bars.length - 1].time) { const b = barOf(f); bars = f[0] === bars[bars.length - 1].time ? [...bars.slice(0, -1), b] : [...bars, b]; }
  if (opts.startTime != null) bars = bars.filter((b) => b.time * 1000 >= opts.startTime);
  if (opts.endTime != null) bars = bars.filter((b) => b.time * 1000 <= opts.endTime);
  return opts.startTime != null ? bars.slice(0, limit) : bars.slice(-limit);
}

// Giá + % thay đổi trong ngày (so với giá mở nến D1 đang chạy)
export async function mt5Ticker(sym) {
  const q = await freshQuotes();
  const x = q?.q?.[sym];
  if (!x) return null;
  const price = x.bid, d1 = x.f?.["1d"]?.[1];
  return { price, chg: d1 ? ((price - d1) / d1) * 100 : 0, vol: 0, spread: x.spread ?? null, ask: x.ask };
}

// Mã có trên sàn MT5 không: có trong ok[] → true; trong missing[] → false; chưa biết → ghi vào command.watch, chờ cầu nối trả lời (≤ 45 giây)
export async function mt5Exists(sym) {
  let q = await freshQuotes(0);
  if (q?.ok?.includes(sym)) return true;
  if (q?.missing?.includes(sym)) return false;
  const cur = await supabase.from(T).select("data").eq("id", "command").maybeSingle();
  const watch = Array.isArray(cur.data?.data?.watch) ? cur.data.data.watch : [];
  if (!watch.includes(sym) && !FX_DEFAULT.includes(sym)) {
    const row = { id: "command", data: { ...(cur.data?.data || {}), watch: [...watch, sym].slice(-30) }, updated_at: new Date().toISOString() };
    const w = await supabase.from(T).upsert(row);
    if (w.error) throw new Error(w.error.message);
  }
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    q = await freshQuotes(0);
    if (q?.ok?.includes(sym)) return true;
    if (q?.missing?.includes(sym)) return false;
  }
  throw new Error("Cầu nối MT5 chưa trả lời (máy bàn / MT5 đang tắt?)");
}

// Hook nến realtime cho useLiveKline (market = "mt5"): lấy nến đang chạy của đúng mã+khung từ mkq
export function useMt5Live(sym, interval, enabled, onBar, every = 1000) {
  const cb = useRef(onBar); cb.current = onBar;
  useEffect(() => {
    if (!enabled || !sym || !interval) return undefined;
    let timer = null, pend = null, prevT = 0;
    const flush = () => { timer = null; if (pend) { const b = pend; pend = null; cb.current(b); } };
    const off = subscribeQuotes((q) => {
      const f = q?.q?.[sym]?.f?.[interval];
      if (!f) return;
      pend = barOf(f);
      if (f[0] !== prevT) { prevT = f[0]; clearTimeout(timer); flush(); } else if (!timer) timer = setTimeout(flush, every);
    });
    return () => { off(); clearTimeout(timer); };
  }, [sym, interval, enabled, every]);
}

// ---- Lệnh của EA QWS_Gop để vẽ lên biểu đồ Forex (hàng 'status' = vị thế/lệnh chờ, 'history' = lệnh đã đóng; cùng bảng, chỉ chủ đọc) ----
export function useEaTrades(active) {
  const [d, setD] = useState({ st: null, hist: null, loaded: false });
  useEffect(() => {
    if (!active) return undefined;
    let off = false;
    const go = async () => {
      try {
        const { data, error } = await supabase.from(T).select("id,data").in("id", ["status", "history"]);
        if (error) throw error;
        if (off) return;
        const r = (id) => (data || []).find((x) => x.id === id)?.data || null;
        setD({ st: r("status"), hist: r("history"), loaded: true });
      } catch { if (!off) setD((x) => ({ ...x, loaded: true })); }
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 30000);
    return () => { off = true; clearInterval(t); };
  }, [active]);
  return d;
}
// Mã của EA có thể kèm hậu tố sàn (XAUUSDm) → khớp theo tiền tố ngắn
export const eaMatch = (eaSym, sym) => { const s = String(eaSym || "").toUpperCase(); return s === sym || (s.startsWith(sym) && s.length <= sym.length + 3); };
const rTxt = (r) => (r == null || !isFinite(r) ? "" : `${r >= 0 ? "+" : ""}${fmtNum(r, 1, 1)}R`);
// d = { st, hist } · stepSec = độ dài 1 nến (giây). Trả { marks, lines, stat } cho đúng 1 mã
export function eaOverlay(d, sym, stepSec) {
  const marks = [], lines = [], snap = (ms) => Math.floor(ms / 1000 / stepSec) * stepSec;
  const done = (d?.hist?.trades || []).filter((t) => t && t.closed && eaMatch(t.sym, sym));
  const open = (d?.st?.positions || []).filter((p) => p && eaMatch(p.sym, sym));
  const pend = (d?.st?.orders || []).filter((o) => o && eaMatch(o.sym, sym));
  const col = (side) => (side === 1 ? "#10b981" : "#f43f5e"), word = (side) => (side === 1 ? "MUA" : "BÁN");
  for (const t of done) {
    if (t.t_in) marks.push({ time: snap(t.t_in), position: t.side === 1 ? "belowBar" : "aboveBar", color: col(t.side), shape: t.side === 1 ? "arrowUp" : "arrowDown", text: t.side === 1 ? "L" : "S" });
    const r = t.R ?? (t.risk ? t.pnl / t.risk : null);
    if (t.t_out) marks.push({ time: snap(t.t_out - 1), position: t.side === 1 ? "aboveBar" : "belowBar", color: (r ?? t.pnl ?? 0) >= 0 ? "#059669" : "#e11d48", shape: "circle", text: rTxt(r) });
  }
  for (const p of open) {
    if (p.t) marks.push({ time: snap(p.t), position: p.side === 1 ? "belowBar" : "aboveBar", color: col(p.side), shape: p.side === 1 ? "arrowUp" : "arrowDown", text: p.side === 1 ? "L" : "S" });
    lines.push({ price: p.open, color: "#8b5cf6", title: `EA ${word(p.side)}`, style: 0, width: 2 });
    if (p.sl) lines.push({ price: p.sl, color: "#e11d48", title: "EA SL", style: 2 });
    if (p.tp) lines.push({ price: p.tp, color: "#059669", title: "EA TP", style: 2 });
  }
  for (const o of pend) {
    lines.push({ price: o.price, color: "#f59e0b", title: `EA chờ ${word(o.side)}`, style: 2, width: 2 });
    if (o.sl) lines.push({ price: o.sl, color: "#fb7185", title: "EA chờ · SL", style: 3 });
  }
  const rs = done.map((t) => t.R ?? (t.risk ? t.pnl / t.risk : null)).filter((r) => r != null && isFinite(r));
  const stat = { n: done.length + open.length, win: done.filter((t) => (t.R ?? t.pnl) > 0).length, loss: done.filter((t) => (t.R ?? t.pnl) < 0).length, open: open.length, pend: pend.length, sumR: rs.reduce((a, r) => a + r, 0) };
  return { marks, lines, stat };
}
