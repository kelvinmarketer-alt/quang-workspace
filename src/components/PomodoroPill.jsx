// Đồng hồ Pomodoro nổi góc phải (mọi trang) — vòng tròn đếm ngược, Dừng, mở Công việc. Hết 25' → +1 🍅 cho việc, nghỉ 5'.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { usePomo, stopPomo, startBreak, bumpDay, chime, pomoState } from "../lib/pomodoro.js";

export default function PomodoroPill() {
  const st = usePomo();
  const { tasks = [], updateTask, setToast } = useData();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!st) return undefined;
    const t = setInterval(() => {
      const cur = pomoState();
      if (cur && Date.now() >= cur.endsAt) {
        if (cur.phase === "work") {
          // 01/11: mở app ở 2 tab → chỉ tab đầu tiên ghi 🍅 (đánh dấu theo mốc kết thúc của phiên)
          try { if (localStorage.getItem("qws_pomo_done") === String(cur.endsAt)) { tick((n) => n + 1); return; } localStorage.setItem("qws_pomo_done", String(cur.endsAt)); } catch { /* bỏ qua */ }
          const task = tasks.find((x) => x.id === cur.taskId);
          if (task) updateTask(task.id, { pomos: (task.pomos || 0) + 1 });
          bumpDay(); chime(); startBreak();
          setToast?.({ text: `Xong 1 🍅 "${cur.title}" — nghỉ 5 phút` });
          try { if (Notification.permission === "granted") new Notification("Xong 1 phiên 25 phút 🍅", { body: cur.title }); } catch { /* không hỗ trợ */ }
        } else { chime(); stopPomo(); setToast?.({ text: "Hết giờ nghỉ — bấm ▶ ở việc tiếp theo" }); }
      }
      tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [st?.endsAt, tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return null;
  const left = Math.max(0, Math.round((st.endsAt - Date.now()) / 1000));
  const pct = 100 - (left / st.total) * 100;
  const work = st.phase === "work";
  return (
    <div className="no-print qws-pomo fixed bottom-[88px] right-3 z-40 flex max-w-[calc(100vw-24px)] items-center gap-3 rounded-2xl border border-slate-200 bg-white py-2 pl-2 pr-2.5 shadow-2xl lg:bottom-5 lg:right-5">
      <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-slate-100" />
        <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pct} className={work ? "stroke-rose-500" : "stroke-emerald-500"} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <Link to="/cong-viec" className="min-w-0">
        <span aria-hidden="true" className="block font-mono text-[18px] font-bold leading-tight text-slate-900">{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>
        <span aria-live="polite" className="block max-w-[180px] truncate text-[11px] text-slate-400">{work ? `🍅 ${st.title}` : "☕ Nghỉ 5 phút"}</span>
      </Link>
      <button type="button" onClick={stopPomo} title="Dừng" aria-label="Dừng hẹn giờ" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
    </div>
  );
}
