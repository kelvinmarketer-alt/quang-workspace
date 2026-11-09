import { useMemo, useState } from "react";
import { Target, Pencil, Check, X } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { MoneyInput } from "./ui.jsx";
import { formatShort } from "../lib/format.js";
import { yearProgress, yearRevenueToDate } from "../lib/yearProgress.js";

// Thanh TIẾN ĐỘ NĂM trên Tổng quan: thời gian đã qua so với doanh thu đạt được so với mục tiêu cả năm (09/11/2026).
// Mục tiêu lưu ở settings.yearGoal[năm] (chỉ chủ sửa được). Chưa đặt mục tiêu: chủ thấy lời mời đặt, thành viên không thấy gì.
const STATE = {
  done: ["Đã đạt mục tiêu cả năm", "bg-emerald-100 text-emerald-700", "bg-emerald-500"],
  ahead: ["Nhanh hơn kế hoạch", "bg-emerald-100 text-emerald-700", "bg-emerald-500"],
  on: ["Đúng nhịp kế hoạch", "bg-indigo-100 text-indigo-700", "bg-indigo-500"],
  behind: ["Đang chậm hơn kế hoạch", "bg-amber-100 text-amber-700", "bg-amber-500"],
};

export default function YearProgress() {
  const { projects = [], settings = {}, isOwner, setSettings } = useData();
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const goals = settings.yearGoal || {};
  const target = Number(goals[year]) || 0;
  const revenue = useMemo(() => yearRevenueToDate(projects, now), [projects, now]);
  const p = yearProgress({ revenue, target, today: now });
  const [edit, setEdit] = useState(false), [val, setVal] = useState("");

  const save = () => {
    const n = Math.max(0, Math.round(Number(val) || 0));
    const next = { ...goals };
    if (n) next[year] = n; else delete next[year];
    setSettings({ yearGoal: next });
    setEdit(false);
  };
  const editor = (
    <div className="flex flex-wrap items-center gap-2">
      <MoneyInput value={val} onChange={setVal} autoFocus placeholder="vd: 1.000.000.000" className="w-56 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      <span className="text-[12px] text-slate-400">đồng, doanh thu cả năm {year}</span>
      <button type="button" onClick={save} className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-[13px] font-bold text-white"><Check size={14} /> Lưu</button>
      <button type="button" onClick={() => setEdit(false)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-500"><X size={14} /> Huỷ</button>
    </div>
  );

  if (!target) {
    if (!isOwner) return null;
    return (
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Target size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-slate-800">Tiến độ năm {year}</div>
          <div className="text-[12.5px] text-slate-500">Đặt mục tiêu doanh thu cả năm để biết mình đang nhanh hay chậm so với thời gian đã qua.</div>
        </div>
        {edit ? editor : <button type="button" onClick={() => { setVal(""); setEdit(true); }} className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700">Đặt mục tiêu</button>}
      </div>
    );
  }

  const [label, badge, bar] = STATE[p.state];
  const gapAbs = Math.abs(Math.round(p.gap));
  const msg = p.state === "done" ? label : p.state === "on" ? label : `${label} ${gapAbs} điểm phần trăm`;
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Target size={18} /></div>
        <h3 className="text-[15px] font-extrabold text-slate-800">Tiến độ năm {year}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${badge}`}>{msg}</span>
        {isOwner && !edit && <button type="button" onClick={() => { setVal(String(target)); setEdit(true); }} aria-label="Sửa mục tiêu năm" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={15} /></button>}
      </div>
      {edit && <div className="mt-3">{editor}</div>}

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[12px] font-semibold text-slate-500"><span>Thời gian đã qua</span><span>{p.dayOfYear}/{p.daysInYear} ngày · {Math.round(p.timePct)}%</span></div>
          <div role="progressbar" aria-label="Thời gian đã qua" aria-valuenow={Math.round(p.timePct)} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.min(100, p.timePct)}%` }} /></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[12px] font-semibold text-slate-500"><span>Doanh thu đạt được</span><span>{formatShort(p.revenue)} / {formatShort(p.target)} · {Math.round(p.revenuePct)}%</span></div>
          <div role="progressbar" aria-label="Doanh thu so với mục tiêu" aria-valuenow={Math.round(p.revenuePct)} aria-valuemin={0} aria-valuemax={100} className="relative h-2.5 rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, p.revenuePct)}%` }} />
            <div title="Mốc theo kế hoạch: doanh thu nên đạt bằng phần trăm thời gian đã qua" className="absolute -top-1 w-0.5 bg-slate-700" style={{ left: `${Math.min(100, p.timePct)}%`, height: 18 }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-500">
        {p.state !== "done" && p.needPerMonth != null && <span>Cần khoảng <b className="text-slate-800">{formatShort(p.needPerMonth)}</b> mỗi tháng trong {p.monthsLeft.toFixed(1).replace(".", ",")} tháng còn lại để kịp mục tiêu.</span>}
        {p.state !== "done" && p.forecast != null && <span>Giữ nhịp từ đầu năm đến nay, cả năm được khoảng <b className="text-slate-800">{formatShort(p.forecast)}</b>.</span>}
        {p.state !== "done" && p.needPerMonth == null && <span>Năm đã hết: đạt {Math.round(p.revenuePct)}% mục tiêu.</span>}
      </div>
    </div>
  );
}
