import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Pencil, TrendingUp, TrendingDown, RefreshCw, Coins, AlertTriangle } from "lucide-react";
import { Card, Badge, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const n = (v) => Number(String(v ?? "").replace(/[^\d.\-]/g, "")) || 0;
const fmtUSD = (v) => (v == null ? "—" : (v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toPrecision(4)) + " $");
const fmtVND = (v) => (Number(v) || 0).toLocaleString("vi-VN") + "đ";
const pair = (s) => { const x = (s || "").toUpperCase().replace(/USDT$/, ""); return x + "USDT"; };

function CoinModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial.id ? "Sửa khoản coin" : "Thêm coin"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Mã coin *</span><input value={f.symbol} onChange={set("symbol")} autoFocus className={`${inputCls} uppercase`} placeholder="BTC, ETH, SOL…" /></label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số lượng</span><input value={f.qty} onChange={set("qty")} inputMode="decimal" className={inputCls} placeholder="0.5" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Giá vốn (USD/coin)</span><input value={f.buyPrice} onChange={set("buyPrice")} inputMode="decimal" className={inputCls} placeholder="60000" /></label>
        </div>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span><input value={f.note} onChange={set("note")} className={inputCls} placeholder="Ví: ví lạnh, sàn…" /></label>
        <button onClick={() => { if ((f.symbol || "").trim()) { onSave({ ...f, symbol: f.symbol.trim().toUpperCase(), qty: n(f.qty), buyPrice: n(f.buyPrice) }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/30">Lưu</button>
      </div>
    </div>
  );
}

export default function Coin() {
  const { coins = [], addCoin, updateCoin, deleteCoin, canEdit, isOwner, settings, setSettings } = useData();
  const canW = canEdit ? canEdit("coin") : true;
  const [prices, setPrices] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const rate = Number(settings?.coinVndRate) || 26000;

  const symKey = coins.map((c) => c.symbol).join(",");
  const load = async () => {
    const syms = [...new Set(coins.map((c) => (c.symbol || "").toUpperCase()).filter(Boolean))];
    if (!syms.length) { setPrices({}); return; }
    setLoading(true);
    try {
      const pairs = syms.map(pair);
      const url = "https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent(JSON.stringify(pairs));
      const r = await fetch(url);
      if (!r.ok) throw new Error("binance " + r.status);
      const data = await r.json();
      const map = {};
      for (const d of Array.isArray(data) ? data : [data]) map[d.symbol.replace(/USDT$/, "")] = { price: Number(d.lastPrice), chg: Number(d.priceChangePercent) };
      setPrices(map); setErr("");
    } catch {
      setErr("Không lấy được giá từ Binance (mạng chậm, mã sai, hoặc bị chặn vùng). Kiểm tra lại mã coin.");
    }
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [symKey]);

  const rows = useMemo(() => coins.map((c) => {
    const p = prices[(c.symbol || "").toUpperCase().replace(/USDT$/, "")];
    const price = p?.price;
    const value = price != null ? c.qty * price : null;
    const cost = c.qty * c.buyPrice;
    const pnl = value != null ? value - cost : null;
    const pnlPct = value != null && cost > 0 ? (pnl / cost) * 100 : null;
    return { ...c, price, chg: p?.chg, value, cost, pnl, pnlPct };
  }), [coins, prices]);

  const tot = useMemo(() => rows.reduce((a, r) => ({ value: a.value + (r.value || 0), cost: a.cost + r.cost }), { value: 0, cost: 0 }), [rows]);
  const totPnl = tot.value - tot.cost;
  const totPct = tot.cost > 0 ? (totPnl / tot.cost) * 100 : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Tổng quan */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-amber-900/80 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-200"><Coins size={14} /> Danh mục coin · giá Binance</div>
            <div className="mt-1 text-3xl font-extrabold sm:text-4xl">{fmtUSD(tot.value)}</div>
            <div className="mt-0.5 text-xs text-amber-100/80">≈ {fmtVND(tot.value * rate)}</div>
            <div className={`mt-2 flex items-center gap-1.5 text-sm font-bold ${totPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {totPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {totPnl >= 0 ? "+" : ""}{fmtUSD(totPnl)} ({totPct >= 0 ? "+" : ""}{totPct.toFixed(1)}%)
              <span className="font-medium text-amber-100/70">· vốn {fmtUSD(tot.cost)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 rounded-xl border border-white/30 px-3 py-2 text-sm font-bold text-white hover:bg-white/10"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Làm mới</button>
            {canW && <button onClick={() => setModal({ symbol: "", qty: "", buyPrice: "", note: "" })} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow hover:bg-amber-50"><Plus size={16} /> Thêm coin</button>}
          </div>
        </div>
        {isOwner && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-100/80">
            Tỉ giá quy đổi VND:
            <input defaultValue={rate} onBlur={(e) => setSettings({ coinVndRate: Number(e.target.value.replace(/[^\d]/g, "")) || 26000 })} inputMode="numeric" className="w-24 rounded-lg bg-white/10 px-2 py-1 text-white outline-none" />
            <span>đ / 1 USDT</span>
          </div>
        )}
      </div>

      {err && <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700"><AlertTriangle size={15} className="shrink-0" /> {err}</div>}

      {/* Danh sách */}
      {rows.length === 0 ? (
        <Card><div className="py-12 text-center"><Coins size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có coin nào</div><div className="mt-1 text-xs text-slate-400">{canW ? 'Bấm "Thêm coin" để theo dõi danh mục (giá lấy realtime từ Binance).' : "Bạn chỉ có quyền xem."}</div></div></Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-extrabold text-white">{(r.symbol || "?").slice(0, 4)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-800">{r.symbol}</span>
                    {r.chg != null && <Badge tone={r.chg >= 0 ? "emerald" : "rose"}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(1)}% 24h</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-400">{r.qty} coin · vốn {fmtUSD(r.buyPrice)} · giá {r.price != null ? fmtUSD(r.price) : "…"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-extrabold text-slate-800">{r.value != null ? fmtUSD(r.value) : "…"}</div>
                  {r.pnl != null && <div className={`text-[11px] font-bold ${r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{r.pnl >= 0 ? "+" : ""}{fmtUSD(r.pnl)} ({r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%)</div>}
                </div>
                {canW && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button onClick={() => setModal(r)} className="rounded-lg p-1.5 text-slate-300 hover:text-indigo-600"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm(`Xoá ${r.symbol}?`)) deleteCoin(r.id); }} className="rounded-lg p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="text-center text-[11px] text-slate-400">Giá cập nhật mỗi 15 giây từ Binance (public). Đồng bộ ví Binance thật (số dư/lịch sử) sẽ thêm ở bản v2 qua API key read-only.</div>

      {modal && <CoinModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateCoin(modal.id, data) : addCoin(data))} />}
    </div>
  );
}
