import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card } from "./ui.jsx";
import { fmtNum, fmtUsdSigned } from "../lib/format.js";

// 13/11/2026 — "Lịch lãi/lỗ" kiểu Binance (sếp gửi ảnh Báo cáo tài sản): dùng chung cho Bot demo, Bot thật/Testnet, Forex MT5, Tài sản.
// items: [{ t?: ms | d?: "YYYY-MM-DD", v: số tiền (theo base), src: khoá nguồn, label?: mô tả lệnh }]
// sources: [{ k, l }] — các ô tách nguồn bên dưới. base: "USD" | "VND". rate: 1 USD = ? VND.
const dayKey = (t) => new Date(Number(t) + 7 * 3600000).toISOString().slice(0, 10); // ngày giờ VN
const todayKey = () => dayKey(Date.now());
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const RANGES = [[7, "7 ngày"], [30, "30 ngày"], [90, "90 ngày"], ["custom", "Tuỳ chỉnh"]];
const tone = (v) => (v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-slate-500");

function compact(v, cur) {
  const s = v > 0 ? "+" : v < 0 ? "-" : "", a = Math.abs(v);
  if (cur === "VND") {
    if (a >= 1e9) return `${s}${fmtNum(a / 1e9, 2)}tỷ`;
    if (a >= 1e6) return `${s}${fmtNum(a / 1e6, a >= 1e8 ? 0 : 2)}tr`;
    if (a >= 1e3) return `${s}${fmtNum(a / 1e3, 0)}K`;
    return `${s}${fmtNum(a, 0)}`;
  }
  if (a >= 1e3) return `${s}$${fmtNum(a / 1e3, 1)}K`;
  return `${s}$${fmtNum(a, a >= 100 ? 0 : 1)}`;
}
const full = (v, cur) => (cur === "VND" ? `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.round(Math.abs(v)).toLocaleString("vi-VN")} đ` : fmtUsdSigned(v));

export default function PnlCalendar({ title = "Lịch lãi/lỗ", items = [], sources = [], base = "USD", rate = 26000, unit = "lệnh", word = "Lãi/lỗ", note, empty = "Chưa có lệnh nào đóng." }) {
  const [range, setRange] = useState(30), [from, setFrom] = useState(() => addDays(todayKey(), -29)), [to, setTo] = useState(todayKey);
  const [cur, setCur] = useState(base), [month, setMonth] = useState(() => todayKey().slice(0, 7)), [pick, setPick] = useState(null);
  const conv = (v) => (cur === base ? v : cur === "VND" ? v * rate : v / rate);

  const rows = useMemo(() => items.filter((x) => x && isFinite(x.v)).map((x) => ({ ...x, d: x.d || dayKey(x.t) })), [items]);
  const byDay = useMemo(() => { const m = new Map(); for (const x of rows) { const y = m.get(x.d) || { v: 0, n: 0 }; y.v += x.v; y.n++; m.set(x.d, y); } return m; }, [rows]);
  const firstMonth = useMemo(() => rows.reduce((a, x) => (x.d < a ? x.d : a), todayKey()).slice(0, 7), [rows]);

  const [rFrom, rTo] = range === "custom" ? [from <= to ? from : to, from <= to ? to : from] : [addDays(todayKey(), -(range - 1)), todayKey()];
  const inRange = useMemo(() => rows.filter((x) => x.d >= rFrom && x.d <= rTo), [rows, rFrom, rTo]);
  const total = inRange.reduce((s, x) => s + x.v, 0);
  const bySrc = sources.map((s) => { const g = inRange.filter((x) => x.src === s.k); return { ...s, n: g.length, v: g.reduce((a, x) => a + x.v, 0) }; });

  // Lưới tháng: tuần bắt đầu thứ 2
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const monthSum = [...byDay.entries()].filter(([d]) => d.startsWith(month)).reduce((a, [, x]) => ({ v: a.v + x.v, n: a.n + x.n, up: a.up + (x.v > 0), down: a.down + (x.v < 0) }), { v: 0, n: 0, up: 0, down: 0 });
  const shift = (k) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); setMonth(d); setPick(null); };
  const today = todayKey();
  const picked = pick ? rows.filter((x) => x.d === pick).sort((a, b) => (b.t || 0) - (a.t || 0)) : [];
  const chip = (on) => `rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;

  return (
    <Card className="!p-3 sm:!p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><CalendarDays size={13} className="text-indigo-500" />{title}</span>
        <span className="ml-auto flex gap-0.5 rounded-lg bg-slate-100 p-0.5">{["USD", "VND"].map((c) => <button key={c} onClick={() => setCur(c)} className={`rounded-md px-2 py-1 text-[11px] font-bold ${cur === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{c === "USD" ? "$" : "VNĐ"}</button>)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{RANGES.map(([k, l]) => <button key={k} onClick={() => setRange(k)} className={chip(range === k)}>{l}</button>)}</div>
      {range === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
          <input type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-bold text-slate-700" />
          →
          <input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-bold text-slate-700" />
        </div>
      )}
      <div className="mt-3 text-[12.5px] text-slate-500">{word} {range === "custom" ? `${rFrom.slice(8)}/${rFrom.slice(5, 7)} → ${rTo.slice(8)}/${rTo.slice(5, 7)}` : `${range} ngày qua`} <span className="text-slate-400">· {inRange.length} {unit}</span></div>
      <div className={`break-words text-[26px] font-extrabold leading-tight tabular-nums sm:text-3xl ${tone(total)}`}>{full(conv(total), cur)}</div>

      {/* Lịch tháng */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <button onClick={() => shift(-1)} disabled={month <= firstMonth} aria-label="Tháng trước" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
        <div className="min-w-[7.5rem] text-center text-[14px] font-extrabold tabular-nums text-slate-900">Tháng {m}/{y}</div>
        <button onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Tháng sau" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>
      <div className="mt-1 text-center text-[11.5px] tabular-nums text-slate-400">
        Cả tháng <b className={tone(monthSum.v)}>{full(conv(monthSum.v), cur)}</b>{monthSum.n ? ` · ${monthSum.up} ngày lãi · ${monthSum.down} ngày lỗ` : ""}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {DOW.map((d) => <div key={d} className="py-1 text-[10.5px] font-bold text-slate-400">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const x = byDay.get(d), future = d > today;
          const bg = !x ? "" : x.v > 0 ? "bg-emerald-50" : x.v < 0 ? "bg-rose-50" : "bg-slate-50";
          return (
            <button key={d} disabled={!x} onClick={() => setPick(pick === d ? null : d)} className={`flex min-h-[3.1rem] min-w-0 flex-col items-center justify-center rounded-lg px-0.5 py-1 ${bg} ${pick === d ? "ring-2 ring-indigo-400" : ""} ${d === today ? "outline outline-1 outline-slate-300" : ""}`}>
              <span className={`text-[12.5px] font-bold ${future ? "text-slate-300" : "text-slate-700"}`}>{Number(d.slice(8))}</span>
              {x && <span className={`w-full truncate text-[9.5px] font-bold tabular-nums sm:text-[11px] ${tone(x.v)}`}>{compact(conv(x.v), cur)}</span>}
            </button>
          );
        })}
      </div>

      {pick && (
        <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
          <div className="mb-1 flex items-center text-[12px] font-bold text-slate-600">Ngày {pick.slice(8)}/{pick.slice(5, 7)}<span className={`ml-auto tabular-nums ${tone(byDay.get(pick)?.v)}`}>{full(conv(byDay.get(pick)?.v || 0), cur)}</span></div>
          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">{picked.map((x, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-slate-600">{x.label || sources.find((s) => s.k === x.src)?.l || "—"}</span>
              <span className={`shrink-0 font-extrabold tabular-nums ${tone(x.v)}`}>{full(conv(x.v), cur)}</span>
            </div>
          ))}</div>
        </div>
      )}

      {!rows.length && <div className="mt-2 text-center text-[12px] text-slate-400">{empty}</div>}

      {bySrc.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{bySrc.map((s) => (
          <div key={s.k} className="min-w-0 rounded-xl border border-slate-100 px-3 py-2.5">
            <div className="truncate text-[12.5px] font-bold text-slate-700">{s.l}</div>
            <div className="text-[11px] text-slate-400">{s.n} {unit}</div>
            <div className={`break-words text-[14px] font-extrabold tabular-nums ${tone(s.v)}`}>{full(conv(s.v), cur)}</div>
          </div>
        ))}</div>
      )}
      {note && <div className="mt-2 text-[11px] leading-snug text-slate-400">{note}</div>}
    </Card>
  );
}
