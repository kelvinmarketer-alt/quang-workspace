import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Pencil, TrendingUp, TrendingDown, RefreshCw, Coins, AlertTriangle, Wallet, CandlestickChart, Loader2 } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const n = (v) => Number(String(v ?? "").replace(/[^\d.\-]/g, "")) || 0;
const fmtUSD = (v) => (v == null ? "—" : (Math.abs(v) >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toPrecision(4)) + " $");
const fmtVND = (v) => (Math.round(Number(v) || 0)).toLocaleString("vi-VN") + "đ";
const pair = (s) => (s || "").toUpperCase().replace(/USDT$/, "") + "USDT";
const qtyFmt = (q) => Number(q || 0).toLocaleString("en-US", { maximumFractionDigits: 6 });

function CoinModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial.id ? "Sửa coin" : "Thêm coin thủ công"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Mã coin *</span><input value={f.symbol} onChange={set("symbol")} autoFocus className={`${inputCls} uppercase`} placeholder="BTC, ETH, SOL…" /></label>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số lượng</span><input value={f.qty} onChange={set("qty")} inputMode="decimal" className={inputCls} placeholder="0.5" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Giá vốn ($/coin)</span><input value={f.buyPrice} onChange={set("buyPrice")} inputMode="decimal" className={inputCls} placeholder="60000" /></label>
        </div>
        <button onClick={() => { if ((f.symbol || "").trim()) { onSave({ ...f, symbol: f.symbol.trim().toUpperCase(), qty: n(f.qty), buyPrice: n(f.buyPrice) }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/30">Lưu</button>
      </div>
    </div>
  );
}

// Tab "Thị trường" (biểu đồ + AI) tải lười — không làm nặng tab Đầu tư
const CoinMarket = lazy(() => import("./CoinMarket.jsx"));

export default function Coin() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("qws_coin_tab") || "invest"; } catch { return "invest"; } });
  const pick = (t) => { setTab(t); try { localStorage.setItem("qws_coin_tab", t); } catch {} };
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/70 p-1 shadow-sm">
        {[["invest", "Đầu tư", Wallet], ["market", "Thị trường", CandlestickChart]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => pick(k)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-extrabold transition ${tab === k ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      {tab === "invest" ? <CoinInvest /> : (
        <Suspense fallback={<div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải biểu đồ…</div>}>
          <CoinMarket />
        </Suspense>
      )}
    </div>
  );
}

function CoinInvest() {
  const { coins = [], addCoin, updateCoin, deleteCoin, canEdit, isOwner } = useData();
  const canW = canEdit ? canEdit("coin") : true;
  const [prices, setPrices] = useState({});
  const [wallet, setWallet] = useState(null);
  const [deposited, setDeposited] = useState(null);
  const [wErr, setWErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [modal, setModal] = useState(null);
  const [vnd, setVnd] = useState(26000);

  const px = (asset) => { const a = (asset || "").toUpperCase(); return a === "USDT" ? 1 : prices[a]?.price; };

  // Tỉ giá USD→VND tự động
  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD").then((r) => r.json()).then((d) => { if (d?.rates?.VND) setVnd(d.rates.VND); }).catch(() => {});
  }, []);

  // Giá coin realtime (poll 15s) cho mọi symbol của ví + thủ công
  const walletAssets = (wallet || []).map((b) => b.asset);
  const symKey = [...coins.map((c) => c.symbol), ...walletAssets].join(",");
  const loadPrices = async () => {
    const syms = [...new Set([...coins.map((c) => (c.symbol || "").toUpperCase()), ...walletAssets.map((a) => (a || "").toUpperCase())].filter((s) => s && s !== "USDT"))];
    if (!syms.length) return;
    try {
      const url = "https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent(JSON.stringify(syms.map(pair)));
      const r = await fetch(url); if (!r.ok) throw new Error();
      const data = await r.json();
      const map = {};
      for (const d of Array.isArray(data) ? data : [data]) map[d.symbol.replace(/USDT$/, "")] = { price: Number(d.lastPrice), chg: Number(d.priceChangePercent) };
      setPrices(map);
    } catch { /* giữ giá cũ */ }
  };
  useEffect(() => { loadPrices(); const t = setInterval(() => { if (!document.hidden) loadPrices(); }, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [symKey]);

  // Đồng bộ ví Binance (số dư + giá vốn TB + đã nạp) — nặng hơn nên GIÃN 5 phút (số dư/giá vốn đổi chậm);
  // giá thị trường vẫn realtime 15s ở trên. Tạm dừng khi tab ẩn để đỡ tốn request.
  const syncBinance = async (silent) => {
    if (!silent) setSyncing(true); setWErr("");
    try {
      const { data, error } = await supabase.functions.invoke("qws-binance");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWallet(data.balances || []);
      setDeposited(data.deposited || null);
    } catch (e) { if (!silent) setWErr("Đồng bộ lỗi: " + (e.message || String(e))); }
    if (!silent) setSyncing(false);
  };
  useEffect(() => {
    if (!isOwner) return;
    syncBinance();
    const t = setInterval(() => { if (!document.hidden) syncBinance(true); }, 300000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [isOwner]);

  // Gộp ví + thủ công thành danh mục
  const rows = useMemo(() => {
    const out = [];
    for (const b of wallet || []) {
      const price = px(b.asset);
      const value = price != null ? b.qty * price : null;
      const invested = b.invested != null ? b.invested : (b.avgCost != null ? b.qty * b.avgCost : null);
      const pnl = value != null && invested != null ? value - invested : null;
      out.push({ key: "w" + b.asset, src: "Ví", symbol: b.asset, qty: b.qty, avgCost: b.avgCost, invested, price, value, pnl, chg: prices[b.asset]?.chg });
    }
    for (const c of coins) {
      const price = px(c.symbol);
      const value = price != null ? c.qty * price : null;
      const invested = c.qty * c.buyPrice;
      out.push({ key: c.id, id: c.id, src: "Tay", symbol: c.symbol, qty: c.qty, avgCost: c.buyPrice, invested, price, value, pnl: value != null ? value - invested : null, chg: prices[(c.symbol || "").toUpperCase()]?.chg, manual: true });
    }
    return out.sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [wallet, coins, prices]);

  const tot = useMemo(() => {
    let value = 0, invested = 0, valueWithCost = 0;
    for (const r of rows) { value += r.value || 0; if (r.invested != null) { invested += r.invested; valueWithCost += r.value || 0; } }
    return { value, invested, pnl: valueWithCost - invested };
  }, [rows]);
  const totPct = tot.invested > 0 ? (tot.pnl / tot.invested) * 100 : 0;
  // "Đã nạp" thật bằng VND (P2P + fiat từ Binance) — ưu tiên so sánh theo VND
  const valueVnd = tot.value * vnd;
  const depVnd = deposited?.vnd || 0;
  const pnlVnd = depVnd > 0 ? valueVnd - depVnd : null;
  const pnlVndPct = depVnd > 0 ? (pnlVnd / depVnd) * 100 : 0;
  const up = (pnlVnd != null ? pnlVnd : tot.pnl) >= 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Tổng quan danh mục */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-amber-900/80 p-4 text-white shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-200"><Coins size={14} /> Danh mục coin · Binance</div>
            <div className="mt-1 text-3xl font-extrabold sm:text-4xl">{fmtUSD(tot.value)}</div>
            <div className="mt-0.5 text-xs text-amber-100/80">≈ {fmtVND(tot.value * vnd)}</div>
            <div className={`mt-2 flex flex-wrap items-center gap-x-2 text-sm font-bold ${up ? "text-emerald-300" : "text-rose-300"}`}>
              {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {depVnd > 0 ? (
                <>{pnlVnd >= 0 ? "+" : ""}{fmtUSD(pnlVnd / vnd)} · {pnlVnd >= 0 ? "+" : ""}{fmtVND(pnlVnd)} ({pnlVndPct >= 0 ? "+" : ""}{pnlVndPct.toFixed(1)}%)<span className="font-medium text-amber-100/70">· đã nạp {fmtUSD(depVnd / vnd)} · {fmtVND(depVnd)}</span></>
              ) : (
                <>{tot.pnl >= 0 ? "+" : ""}{fmtUSD(tot.pnl)} ({totPct >= 0 ? "+" : ""}{totPct.toFixed(1)}%)<span className="font-medium text-amber-100/70">· vốn {fmtUSD(tot.invested)}</span></>
              )}
            </div>
          </div>
          <button onClick={() => { syncBinance(); loadPrices(); }} disabled={syncing} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/30 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "…" : "Làm mới"}</button>
        </div>
        <div className="mt-3 text-[11px] text-amber-100/70">Tự cập nhật giá mỗi 15s · ví mỗi 5 phút · tỉ giá {Math.round(vnd).toLocaleString("vi-VN")}đ/$ (tự động)</div>
      </div>

      {wErr && <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700"><AlertTriangle size={15} className="shrink-0" /> {wErr}</div>}

      {/* Danh sách coin */}
      {rows.length === 0 ? (
        <Card><div className="py-12 text-center"><Coins size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">{isOwner ? "Đang tải ví Binance…" : "Chưa có coin"}</div><div className="mt-1 text-xs text-slate-400">{isOwner ? "Số dư & giá vốn tự đồng bộ từ Binance." : "Bạn chỉ có quyền xem."}</div></div></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.key} className="!p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-[13px] font-extrabold text-white">{(r.symbol || "?").slice(0, 4)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-800">{r.symbol}</span>
                    {r.manual && <Badge tone="slate">tay</Badge>}
                    {r.chg != null && <Badge tone={r.chg >= 0 ? "emerald" : "rose"}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(1)}%</Badge>}
                    {r.manual && canW && (
                      <span className="ml-auto flex gap-0.5">
                        <button onClick={() => setModal(r)} className="rounded p-1 text-slate-300 hover:text-indigo-600"><Pencil size={13} /></button>
                        <button onClick={() => { if (confirm(`Xoá ${r.symbol}?`)) deleteCoin(r.id); }} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">SL {qtyFmt(r.qty)}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">TB {r.avgCost != null ? fmtUSD(r.avgCost) : "—"}</span>
                    <span className={`rounded-md px-1.5 py-0.5 font-bold ${r.price == null ? "bg-slate-100 text-slate-500" : r.avgCost != null && r.price < r.avgCost ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>Giá {r.price != null ? fmtUSD(r.price) : "…"}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-extrabold text-slate-800">{r.value != null ? fmtUSD(r.value) : "…"}</div>
                  {r.pnl != null && <div className={`text-[11px] font-bold ${r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{r.pnl >= 0 ? "+" : ""}{fmtUSD(r.pnl)}{r.invested > 0 ? ` (${r.pnl >= 0 ? "+" : ""}${((r.pnl / r.invested) * 100).toFixed(1)}%)` : ""}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canW && (
        <button onClick={() => setModal({ symbol: "", qty: "", buyPrice: "" })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:border-amber-300 hover:text-amber-600"><Plus size={15} /> Thêm coin thủ công (ngoài Binance)</button>
      )}
      <div className="text-center text-[11px] text-slate-400">Giá & tỉ giá realtime từ Binance/thị trường. Ví thật đồng bộ qua API key read-only (bảo mật server-side, chỉ chủ).</div>

      {modal && <CoinModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateCoin(modal.id, data) : addCoin(data))} />}
    </div>
  );
}
