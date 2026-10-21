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
  rows.sort((a, b) => order[a.st] - order[b.st]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Radar size={15} className="text-cyan-500" />
        <span className="text-[13px] font-extrabold uppercase tracking-wide text-slate-800">Bảng tín hiệu bot</span>
        <span className="text-[11px] text-slate-400">{rows.filter((r) => r.st === "open").length} đã khớp · {rows.filter((r) => r.st === "pend").length} chờ khớp · bấm dòng để xem biểu đồ</span>
      </div>
      <div className="hidden grid-cols-[150px_1fr_160px] gap-3 border-b border-slate-100 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 md:grid">
        <span>Cặp · khung</span><span>Lệnh theo luật bot</span><span className="text-right">Lực mua / bán</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const [label, cls] = STATUS[r.st], p = press[`${r.coin}|${r.tf}`], on = sel && sel.coin === r.coin && sel.tf === r.tf;
          const t = r.open, q = r.pend;
          const plan = t ? { side: t.side, entry: t.entry, sl: t.curSl ?? t.sl, tp: t.tp, setup: t.setup, rr: t.uR, at: t.entryAt }
            : q ? { side: q.side, entry: q.lim, sl: q.sl, tp: q.lim + q.side * (q.rr ?? cfg.rr) * Math.abs(q.lim - q.sl), setup: q.setup, at: q.signalAt, until: q.until } : null;
          const box = !plan ? "border-slate-200" : plan.side === 1 ? "border-emerald-300/70 shadow-[0_0_0_1px_rgba(16,185,129,.08)]" : "border-rose-300/70 shadow-[0_0_0_1px_rgba(244,63,94,.08)]";
          return (
            <button key={r.coin + r.tf} onClick={() => onPick?.(r.coin, r.tf)} className={`grid w-full gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 md:grid-cols-[150px_1fr_160px] md:gap-3 ${on ? "bg-cyan-50/50" : ""}`}>
              <div className="flex items-center gap-2 md:block">
                <div className="flex items-center gap-1.5">
                  <b className="text-[14px] text-slate-800">{r.coin}/USDT</b>
                  <span className="rounded border border-slate-200 px-1 text-[10px] font-bold text-slate-500">{TFS[r.tf].label}</span>
                </div>
                <div className="flex items-center gap-1 md:mt-1">
                  <span className={`rounded border px-1.5 text-[10px] font-extrabold ${cls}`}>{label}</span>
                  {plan && <span className="text-[10.5px] tabular-nums text-slate-400">{ago(plan.at)}</span>}
                </div>
                {r.price != null && <div className="ml-auto text-[12px] font-bold tabular-nums text-slate-600 md:ml-0 md:mt-1">{fmtPx(r.price)}</div>}
              </div>

              <div className={`rounded-xl border bg-slate-50/50 px-2.5 py-2 ${box}`}>
                {plan ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
                      <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-extrabold ${plan.side === 1 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}><Zap size={11} />{plan.side === 1 ? "LONG" : "SHORT"}</span>
                      <span className="text-slate-500">{setupName(plan.setup)}{q?.blocked && !t ? ` · không đặt: ${q.blocked}` : ""}</span>
                      <span className="ml-auto text-[10.5px] font-bold text-cyan-600">R:R 1:{fmtNum(q?.rr ?? cfg.rr, 1, 0)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between text-[11px] text-slate-500"><span>{t ? "Đã vào" : "Chờ ở"}</span><b className="text-[15px] tabular-nums text-amber-500">{fmtPx(plan.entry)}</b></div>
                    <div className="mt-1 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-1 text-[11px] tabular-nums">
                      <div><div className="text-rose-500">SL</div><b className="text-rose-600">{fmtPx(plan.sl)}</b></div>
                      <div><div className="text-emerald-500">TP</div><b className="text-emerald-600">{fmtPx(plan.tp)}</b></div>
                      <div className="text-right">{t ? <><div className="text-slate-400">tạm tính</div><b className={plan.rr >= 0 ? "text-emerald-600" : "text-rose-600"}>{rr(plan.rr)}</b></> : <><div className="text-slate-400">huỷ lúc</div><b className="text-slate-600">{plan.until ? dt(plan.until).slice(6) : "—"}</b></>}</div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
                    <Clock size={13} className="shrink-0 text-slate-400" />
                    <span>{r.last ? <>Lệnh gần nhất {dt(r.last.entryAt)} · {r.last.side === 1 ? "LONG" : "SHORT"} · <b className={r.last.r >= 0 ? "text-emerald-600" : "text-rose-600"}>{r.last.reason} {rr(r.last.r)}</b></> : "Chưa có lệnh ở cặp/khung này"}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-slate-400">{r.n} lệnh</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center">
                {p == null ? <div className="text-right text-[11px] text-slate-400">…</div> : (
                  <>
                    <div className="flex justify-between text-[11px] font-bold tabular-nums"><span className="text-emerald-600">{p}% Mua</span><span className="text-rose-600">{100 - p}% Bán</span></div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-emerald-500" style={{ width: `${p}%` }} /><div className="bg-rose-500" style={{ width: `${100 - p}%` }} />
                    </div>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-[10.5px] text-slate-400"><CheckCircle2 size={11} /> Cùng luật với bot thật (v{cfg.cfgVer}). Lực mua/bán = khối lượng khớp chủ động 20 nến gần nhất trên Binance Futures.</div>
    </Card>
  );
}
