import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { findConflicts, suggestSlots, DEFAULT_DUR } from "../lib/schedule.js";

// Cảnh báo TRÙNG GIỜ + nút chọn nhanh giờ trống gần nhất (09/11/2026). Không hiện gì nếu không trùng.
// onPick(giờ "HH:MM") do nơi dùng quyết định (đổi giờ trong form, hoặc thêm luôn việc lúc giờ đó).
export default function ConflictNotice({ tasks, date, time, dur = DEFAULT_DUR, excludeId, onPick, pickLabel = "Dời sang", className = "" }) {
  const conflicts = useMemo(() => findConflicts(tasks, { date, time, dur, excludeId }), [tasks, date, time, dur, excludeId]);
  const slots = useMemo(() => (conflicts.length ? suggestSlots(tasks, { date, time, dur, excludeId }) : []), [conflicts, tasks, date, time, dur, excludeId]);
  if (!conflicts.length) return null;
  const first = conflicts[0];
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ${className}`}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <div>Trùng giờ với <b>{first.title}</b> ({first.label}){conflicts.length > 1 ? ` và ${conflicts.length - 1} việc khác` : ""}.</div>
        {slots.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-amber-700">Giờ trống gần nhất:</span>
            {slots.map((s) => <button key={s} type="button" onClick={() => onPick(s)} className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">{pickLabel} {s}</button>)}
          </div>
        ) : <div className="mt-1 text-amber-700">Hôm đó không còn khoảng trống đủ dài trong 08:00–21:00.</div>}
      </div>
    </div>
  );
}
