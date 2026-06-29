import { useMemo, useState } from "react";
import { Plus, X, Trash2, Check, Flag, Clock, ListChecks, CalendarDays } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { todayISO, fmtDateVI } from "../lib/format.js";
import Calendar from "./Calendar.jsx";

const PRIO = { high: ["rose", "Cao"], med: ["amber", "TB"], low: ["sky", "Thấp"] };

function TaskModal({ onClose, onSave }) {
  const [f, setF] = useState({ title: "", date: todayISO(), time: "", priority: "med", note: "" });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Thêm công việc</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Tên việc</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="VD: Gửi báo cáo ads" autoFocus />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Giờ</span>
            <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
        </div>
        <div className="mb-3 flex gap-2">
          {Object.entries(PRIO).map(([v, [tone, l]]) => (
            <button key={v} onClick={() => setF({ ...f, priority: v })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${f.priority === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
          ))}
        </div>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Chi tiết (tuỳ chọn)" />
        </label>
        <button onClick={() => { if (f.title) { onSave(f); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu việc</button>
      </div>
    </div>
  );
}

function TaskBoard() {
  const { tasks, addTask, toggleTask, deleteTask } = useData();
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("all");

  const today = todayISO();
  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === "today") list = list.filter((t) => t.date === today);
    if (filter === "upcoming") list = list.filter((t) => t.date >= today && t.status !== "done");
    if (filter === "done") list = list.filter((t) => t.status === "done");
    return list.sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || (a.time || "").localeCompare(b.time || ""));
  }, [tasks, filter, today]);

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[["all", "Tất cả"], ["today", "Hôm nay"], ["upcoming", "Sắp tới"], ["done", "Đã xong"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${filter === v ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-400">{done}/{tasks.length} hoàn thành</div>
          <button onClick={() => setModal(true)} className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            <Plus size={16} /> Thêm việc
          </button>
        </div>
      </Card>

      <div className="space-y-2.5">
        {filtered.length === 0 && (
          <Card><div className="py-8 text-center text-sm text-slate-400">Không có công việc.</div></Card>
        )}
        {filtered.map((t) => {
          const [tone, pl] = PRIO[t.priority] || PRIO.med;
          const done = t.status === "done";
          const overdue = !done && t.date && t.date < today;
          return (
            <div key={t.id} className="card group flex items-center gap-4 p-4">
              <button onClick={() => toggleTask(t.id)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-indigo-500"}`}>
                {done && <Check size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-bold ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  {t.date && <span className={`flex items-center gap-1 ${overdue ? "font-bold text-rose-500" : ""}`}><Clock size={12} /> {fmtDateVI(t.date)}{t.time ? " · " + t.time : ""}</span>}
                  {t.note && <span className="truncate">· {t.note}</span>}
                </div>
              </div>
              <Badge tone={tone}><Flag size={10} className="mr-1 inline" />{pl}</Badge>
              <button onClick={() => deleteTask(t.id)} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </div>

      {modal && <TaskModal onClose={() => setModal(false)} onSave={addTask} />}
    </div>
  );
}

const TABS = [["tasks", "Công việc", ListChecks], ["calendar", "Lịch & Âm lịch", CalendarDays]];

export default function Tasks({ initialTab = "tasks" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="!p-2">
        <div className="grid grid-cols-2 gap-1">
          {TABS.map(([v, l, Ic]) => (
            <button key={v} onClick={() => setTab(v)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${tab === v ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25" : "text-slate-500 hover:bg-slate-50"}`}>
              <Ic size={16} /> {l}
            </button>
          ))}
        </div>
      </Card>
      {tab === "tasks" ? <TaskBoard /> : <Calendar />}
    </div>
  );
}
