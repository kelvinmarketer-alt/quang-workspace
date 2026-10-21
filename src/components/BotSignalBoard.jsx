// Bảng tín hiệu bot (tab Demo, 21/10 — tham khảo bảng "Entry Prime" của viaitrading): mỗi cặp × khung của bot 1 dòng,
// trạng thái ĐÃ KHỚP (lệnh đang mở) / CHỜ KHỚP (lệnh chờ đặt ở giá) / CHỜ TÍN HIỆU, giá vào · SL · TP, lực mua/bán 20 nến.
// Dữ liệu = đúng kết quả Demo (cùng luật bot thật), chỉ thêm lực mua/bán lấy từ nến Binance Futures.
import { useEffect, useState } from "react";
import { Radar, Zap, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "./ui.jsx";
import { TFS, SETUPS, symOf } from "../lib/paperBot.js";
import { fmtPx, fmtNum } from "../lib/format.js";

const setupName = (k) => SETUPS[k]?.label.split(" (")[0] || k;
const pad = (n) => String(n).padStart(2, "0");
const dt = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m}p` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 2)}R`);

// Lực mua chủ động (taker buy / volume) 20 nến đã đóng, nhớ 5 phút
const PRESS = new Map();
async function pressure(coin, tf) {
  const key = `${coin}|${tf}`, c = PRESS.get(key);
  if (c && Date.now() - c.at < 300000) return c.v;
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symOf(coin)}&interval=${tf}&limit=21`);
    const j = r.ok ? await r.json() : [];
    const rows = j.slice(0, -1), vol = rows.reduce((s, k) => s + +k[5], 0), buy = rows.reduce((s, k) => s + +k[9], 0);
    const v = vol > 0 ? Math.round((buy / vol) * 100) : null;
    PRESS.set(key, { at: Date.now(), v });
    return v;
  } catch { return c?.v ?? null; }
}

const STATUS = {
  open: ["ĐÃ KHỚP", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  pend: ["CHỜ KHỚP", "border-amber-300 bg-amber-50 text-amber-700"],
  block: ["BỊ LỌC", "border-slate-200 bg-slate-100 text-slate-500"],
  wait: ["CHỜ TÍN HIỆU", "border-slate-200 bg-slate-50 text-slate-500"],
  stop: ["ĐÃ DỪNG", "border-slate-200 bg-slate-100 text-slate-500"],
};

export default function BotSignalBoard({ cfg, trades, pending = [], live, ver, active, stopped, onPick, sel }) {
  const streams = cfg.coins.flatMap((c) => cfg.tfs.map((t) => [c, t]));
  const [press, setPress] = useState({});
  const sig = streams.map(([c, t]) => c + t).join(",");
  useEffect(() => {
    if (!active) return undefined;
    let off = false;
    const go = async () => {
      const out = {};
      await Promise.all(streams.map(async ([c, t]) => { out[`${c}|${t}`] = await pressure(c, t); }));
      if (!off) setPress(out);
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 300000);
    return () => { off = true; clearInterval(t); };
  }, [sig, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = streams.map(([coin, tf]) => {
    const mine = trades.filter((x) => x.coin === coin && x.tf === tf && x.status !== "skip");
    const open = mine.filter((x) => x.status === "open").sort((a, b) => b.entryAt - a.entryAt)[0];
    const pend = pending.filter((p) => p.coin === coin && p.tf === tf).sort((a, b) => b.signalAt - a.signalAt)[0];
    const last = mine.filter((x) => x.status === "done").sort((a, b) => b.exitAt - a.exitAt)[0];
    const st = stopped ? "stop" : open ? "open" : pend ? (pend.blocked ? "block" : "pend") : "wait";
    return { coin, tf, open, pend, last, st, n: mine.length, price: live?.current?.[`px|${coin}`] };
  });
  const order = { open: 0, pend: 1, block: 2, wait: 3, stop: 4 };
  // Gộp theo coin (21/10): 1 dòng / coin, các khung xếp trong dòng; coin có lệnh đang mở / chờ lên đầu
  const groups = cfg.coins.map((coin) => {
    const items = rows.filter((r) => r.coin === coin);
    return { coin, items, best: Math.min(...items.map((r) => order[r.st])), price: items[0]?.price };
  }).sort((a, b) => a.best - b.best);
  const planOf = (r) => (r.open ? { side: r.open.side, entry: r.open.entry, sl: r.open.curSl ?? r.open.sl, tp: r.open.tp, setup: r.open.setup, rr: r.open.uR, at: r.open.entryAt }
    : r.pend ? { side: r.pend.side, entry: r.pend.lim, sl: r.pend.sl, tp: r.pend.lim + r.pend.side * (r.pend.rr ?? cfg.rr) * Math.abs(r.pend.lim - r.pend.sl), setup: r.pend.setup, at: r.pend.signalAt, until: r.pend.until } : null);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Radar size={15} className="text-cyan-500" />
        <span className="text-[13px] font-extrabold uppercase tracking-wide text-slate-800">Bảng tín hiệu bot</span>
        <span className="text-[11px] text-slate-400">{rows.filter((r) => r.st === "open").length} đã khớp · {rows.filter((r) => r.st === "pend").length} chờ khớp · bấm khung để xem biểu đồ</span>
      </div>
      <div className="hidden grid-cols-[130px_1fr_150px] gap-3 border-b border-slate-100 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 md:grid">
        <span>Cặp</span><span>Lệnh theo luật bot (từng khung)</span><span className="text-right">Lực mua / bán 20 nến</span>
      </div>
      <div className="divide-y divide-slate-100">
        {groups.map((g) => {
          const [gLabel, gCls] = STATUS[Object.keys(order).find((k) => order[k] === g.best)];
          return (
            <div key={g.coin} className="grid gap-2 px-3 py-2.5 md:grid-cols-[130px_1fr_150px] md:gap-3">
              <div className="flex items-center gap-2 md:block">
                <b className="text-[14px] text-slate-800">{g.coin}/USDT</b>
                <div className="md:mt-1"><span className={`rounded border px-1.5 text-[10px] font-extrabold ${gCls}`}>{gLabel}</span></div>
                {g.price != null && <div className="ml-auto text-[12px] font-bold tabular-nums text-slate-600 md:ml-0 md:mt-1">{fmtPx(g.price)}</div>}
              </div>
              <div className="space-y-1.5">
                {g.items.map((r) => {
                  const [label, cls] = STATUS[r.st], plan = planOf(r), on = sel && sel.coin === r.coin && sel.tf === r.tf, t = r.open, q = r.pend;
                  const box = !plan ? "border-slate-200" : plan.side === 1 ? "border-emerald-300/70" : "border-rose-300/70";
                  return (
                    <button key={r.tf} onClick={() => onPick?.(r.coin, r.tf)} className={`block w-full rounded-xl border bg-slate-50/50 px-2.5 py-1.5 text-left transition hover:bg-slate-100 ${box} ${on ? "ring-2 ring-cyan-400/50" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
                        <span className="rounded border border-slate-200 px-1 text-[10px] font-bold text-slate-500">{TFS[r.tf].label}</span>
                        {plan ? <>
                          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-extrabold ${plan.side === 1 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}><Zap size={11} />{plan.side === 1 ? "LONG" : "SHORT"}</span>
                          <span className={`rounded border px-1.5 text-[10px] font-extrabold ${cls}`}>{label}</span>
                          <span className="text-slate-500">{setupName(plan.setup)} · {ago(plan.at)}{q?.blocked && !t ? ` · không đặt: ${q.blocked}` : ""}</span>
                          <span className="ml-auto flex flex-wrap gap-x-3 tabular-nums">
                            <span>{t ? "vào" : "chờ"} <b className="text-amber-500">{fmtPx(plan.entry)}</b></span>
                            <span className="text-rose-600">SL <b>{fmtPx(plan.sl)}</b></span>
                            <span className="text-emerald-600">TP <b>{fmtPx(plan.tp)}</b></span>
                            {t ? <b className={plan.rr >= 0 ? "text-emerald-600" : "text-rose-600"}>{rr(plan.rr)}</b> : plan.until ? <span className="text-slate-400">huỷ {dt(plan.until).slice(6)}</span> : null}
                          </span>
                        </> : <>
                          <Clock size={12} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate text-slate-500">{r.last ? <>Gần nhất {dt(r.last.entryAt)} · {r.last.side === 1 ? "LONG" : "SHORT"} · <b className={r.last.r >= 0 ? "text-emerald-600" : "text-rose-600"}>{r.last.reason} {rr(r.last.r)}</b></> : "Chưa có lệnh"}</span>
                          <span className="shrink-0 text-[10.5px] text-slate-400">{r.n} lệnh</span>
                        </>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col justify-center gap-1">
                {g.items.map((r) => { const p = press[`${r.coin}|${r.tf}`]; return (
                  <div key={r.tf}>
                    {p == null ? <div className="text-right text-[11px] text-slate-400">…</div> : <>
                      <div className="flex justify-between text-[10.5px] font-bold tabular-nums"><span className="text-emerald-600">{TFS[r.tf].label} · {p}% Mua</span><span className="text-rose-600">{100 - p}%</span></div>
                      <div className="mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="bg-emerald-500" style={{ width: `${p}%` }} /><div className="bg-rose-500" style={{ width: `${100 - p}%` }} /></div>
                    </>}
                  </div>
                ); })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-[10.5px] text-slate-400"><CheckCircle2 size={11} /> Cùng luật với bot thật (v{cfg.cfgVer}). Lực mua/bán = khối lượng khớp chủ động 20 nến gần nhất trên Binance Futures.</div>
    </Card>
  );
}
