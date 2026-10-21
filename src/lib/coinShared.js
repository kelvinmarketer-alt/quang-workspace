// Dữ liệu dùng chung trong module Coin (tab Tổng quan + Đầu tư + Demo): ví Binance (hàm qws-binance), sổ nạp VND, giá 24h, kết quả Demo.
// Mỗi thứ chỉ tải 1 lần rồi chia sẻ → mở nhiều tab không gọi trùng.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { runSessionAsync } from "./botRunner.js";
import { finalize } from "./paperBot.js";

// ---------- Ví Binance: tải 1 lần, làm mới 5 phút/lần khi còn tab đang xem ----------
let W = { bn: null, err: "", syncing: false, at: 0 }, wP = null;
const wSubs = new Set();
const wEmit = () => wSubs.forEach((f) => f({ ...W }));
export async function syncBinance(silent) {
  if (wP) return wP;
  W = { ...W, syncing: !silent, err: silent ? W.err : "" }; wEmit();
  wP = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("qws-binance?debug=1");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      W = { ...W, bn: data || {}, err: "", at: Date.now() };
    } catch (e) { if (!silent || !W.bn) W = { ...W, err: "Đồng bộ lỗi: " + (e.message || String(e)) }; }
    W = { ...W, syncing: false }; wP = null; wEmit();
  })();
  return wP;
}
// enabled = chỉ chủ; active = tab đang xem (ẩn → ngừng làm mới)
export function useBinance(enabled, active = true) {
  const [s, setS] = useState(() => ({ ...W }));
  useEffect(() => { wSubs.add(setS); return () => wSubs.delete(setS); }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    if (!W.bn && !wP) syncBinance();
    if (!active) return undefined;
    const t = setInterval(() => { if (!document.hidden && Date.now() - W.at > 290000) syncBinance(true); }, 60000);
    return () => clearInterval(t);
  }, [enabled, active]);
  return { ...s, sync: syncBinance };
}

// ---------- Tỉ giá USD→VND (tự động, tải 1 lần) ----------
let VND = 26000, vP = null;
export function useUsdVnd() {
  const [v, setV] = useState(VND);
  useEffect(() => {
    vP ||= fetch("https://open.er-api.com/v6/latest/USD").then((r) => r.json()).then((d) => { if (d?.rates?.VND) VND = d.rates.VND; return VND; }).catch(() => VND);
    vP.then(setV);
  }, []);
  return v;
}

// ---------- Sổ nạp VND (settings.coinDeposits) ----------
export function depositInfo(settings, bn) {
  const ledger = settings?.coinDeposits || { items: {}, extraVnd: 0 };
  const allList = Object.values(ledger.items || {});
  const net = (l) => l.reduce((s, x) => s + (x.t === "SELL" ? -x.vnd : x.vnd), 0);
  const fromTs = ledger.fromDate ? new Date(ledger.fromDate + "T00:00:00+07:00").getTime() : 0;
  const ledgerList = allList.filter((x) => x.date >= fromTs);
  const ledgerVnd = net(ledgerList), allVnd = net(allList);
  const depVnd = (allList.length ? ledgerVnd : Number(bn?.deposited?.vnd) || 0) + (Number(ledger.extraVnd) || 0);
  return { ledger, allList, ledgerList, ledgerVnd, allVnd, fromTs, depVnd };
}

// ---------- Giá + biến động 24h (Binance Spot) ----------
export const STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI"]);
export async function fetchTickers(syms) {
  const list = [...new Set(syms.map((s) => String(s || "").toUpperCase()))].filter((s) => s && !STABLES.has(s));
  if (!list.length) return {};
  const out = {}, put = (d) => { if (d?.symbol) out[d.symbol.replace(/USDT$/, "")] = { price: Number(d.lastPrice), chg: Number(d.priceChangePercent) }; };
  const T = "https://api.binance.com/api/v3/ticker/24hr";
  try {
    const r = await fetch(`${T}?symbols=${encodeURIComponent(JSON.stringify(list.map((s) => s + "USDT")))}`);
    if (r.ok) { const d = await r.json(); (Array.isArray(d) ? d : [d]).forEach(put); return out; }
    (await Promise.all(list.map((s) => fetch(`${T}?symbol=${s}USDT`).then((x) => (x.ok ? x.json() : null)).catch(() => null)))).forEach(put);
  } catch { /* giữ trống */ }
  return out;
}

// ---------- Kết quả Demo (chạy lại phiên trong Web Worker), nhớ 5 phút theo phiên ----------
let D = { key: "", at: 0, fin: null, p: null };
export const demoKey = (s) => (s ? `${s.createdAt}|${s.stoppedAt || ""}|${JSON.stringify(s.cfg || {}).length}` : "");
export function demoResult(session) {
  const key = demoKey(session);
  if (!session) return Promise.resolve(null);
  if (D.key === key && D.fin && Date.now() - D.at < 300000) return Promise.resolve(D.fin);
  if (D.key === key && D.p) return D.p;
  const p = runSessionAsync(session).then((raw) => { demoCacheSet(session, raw); const fin = finalize(raw, null); if (D.p === p) D = { key, at: Date.now(), fin, p: null }; return fin; }, (e) => { if (D.p === p) D = { ...D, p: null }; throw e; });
  D = { key, at: D.at, fin: D.key === key ? D.fin : null, p };
  return p;
}

// ---------- Thống kê lệnh theo tháng (giờ VN) ----------
export const monthOf = (t) => new Date(Number(t) + 7 * 3600000).toISOString().slice(0, 7); // "2026-10"
export const monthLabel = (m) => { const [y, mo] = String(m).split("-"); return `Tháng ${Number(mo)}/${y}`; };
export const MONTH_TARGET = 10; // user chốt 21/10: tối thiểu 10 lệnh/tháng

// ---------- Khung / cặp đang yếu 30 ngày gần nhất (cảnh báo sớm, sếp tự quyết tắt hay không) ----------
// Lệnh ĐÃ ĐÓNG có r, vào trong 30 ngày; khung (gộp mọi cặp) cần ≥ 8 lệnh, cặp × khung cần ≥ 5 lệnh; âm = R TB < 0
export function weakStreams(trades, cfg, days = 30) {
  const since = Date.now() - days * 86400000, done = (trades || []).filter((t) => t.status === "done" && t.r != null && t.entryAt >= since);
  const off = new Set(cfg?.offStreams || []), avg = (L) => L.reduce((a, t) => a + t.r, 0) / L.length;
  const tfs = (cfg?.tfs || []).map((tf) => { const L = done.filter((t) => t.tf === tf); return { tf, n: L.length, avgR: L.length ? avg(L) : null }; }).filter((x) => x.n >= 8 && x.avgR < 0);
  const pairs = [];
  for (const c of cfg?.coins || []) for (const tf of cfg?.tfs || []) {
    if (off.has(`${c}|${tf}`)) continue;
    const L = done.filter((t) => t.coin === c && t.tf === tf);
    if (L.length >= 5 && avg(L) < 0) pairs.push({ coin: c, tf, n: L.length, avgR: avg(L) });
  }
  pairs.sort((a, b) => a.avgR - b.avgR);
  return { tfs, pairs, days };
}

// ---------- Bộ nhớ đệm kết quả Demo trong máy (IndexedDB) → mở tab hiện NGAY kết quả lần trước, tính lại ngầm ----------
const CDB = "qws-demo-cache";
const cdb = () => new Promise((ok, no) => { const r = indexedDB.open(CDB, 1); r.onupgradeneeded = () => r.result.createObjectStore("raw"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
export async function demoCacheGet(session) {
  try {
    const key = demoKey(session); if (!key) return null;
    const db = await cdb();
    const v = await new Promise((ok) => { const q = db.transaction("raw").objectStore("raw").get("last"); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
    return v && v.key === key ? v.raw : null; // chỉ dùng khi đúng phiên (cùng luật) — đổi luật thì bỏ
  } catch { return null; }
}
export async function demoCacheSet(session, raw) {
  try {
    const key = demoKey(session); if (!key || !raw) return;
    const db = await cdb();
    db.transaction("raw", "readwrite").objectStore("raw").put({ key, raw, at: Date.now() }, "last");
  } catch { /* chế độ riêng tư / hết chỗ → bỏ qua */ }
}
