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
  const p = runSessionAsync(session).then((raw) => { const fin = finalize(raw, null); if (D.p === p) D = { key, at: Date.now(), fin, p: null }; return fin; }, (e) => { if (D.p === p) D = { ...D, p: null }; throw e; });
  D = { key, at: D.at, fin: D.key === key ? D.fin : null, p };
  return p;
}

// ---------- Thống kê lệnh theo tháng (giờ VN) ----------
export const monthOf = (t) => new Date(Number(t) + 7 * 3600000).toISOString().slice(0, 7); // "2026-10"
export const monthLabel = (m) => { const [y, mo] = String(m).split("-"); return `Tháng ${Number(mo)}/${y}`; };
export const MONTH_TARGET = 10; // user chốt 21/10: tối thiểu 10 lệnh/tháng
