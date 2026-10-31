import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, X, Trash2, Check, Flag, Clock, ListChecks, CalendarDays } from "lucide-react";
import { Card, Badge, DateField } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { todayISO, fmtDateVI } from "../lib/format.js";
import Calendar from "./Calendar.jsx";
import { guardClose, markDirty } from "../components/ConfirmDialog.jsx";

const PRIO = { high: ["rose", "Cao"], med: ["amber", "TB"], low: ["sky", "Thấp"] };
const PRIO_ORDER = { high: 0, med: 1, low: 2 };

// initial = task cũ → form SỬA (điền sẵn); không có → form THÊM
function TaskModal({ initial, onClose, onSave }) {
  const editing = !!initial?.id;
  const { customerList = [] } = useData();
  const custs = [...customerList].filter((c) => c.active !== false || c.id === initial?.customerId).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const [f, setF] = useState(() => ({ title: "", date: todayISO(), time: "", priority: "med", note: "", ...(initial ? { title: initial.title || "", date: initial.date || "", time: initial.time || "", priority: initial.priority || "med", note: initial.note || "", customerId: initial.customerId || "" } : {}) }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{editing ? "Sửa công việc" : "Thêm công việc"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Tên việc</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="VD: Gửi báo cáo ads" autoFocus={!editing} />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <DateField value={f.date} onChange={(v) => setF({ ...f, date: v })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            {/* Giờ chỉ để hiển thị — bot chỉ gửi 1 tin tổng hợp lúc 7h sáng, không nhắc đúng giờ */}
            <span className="mb-1 block font-semibold text-slate-600">Giờ <span className="text-[11px] font-medium text-slate-400">(hiển thị — bot nhắc lúc 7h sáng)</span></span>
            <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
        </div>
        <div className="mb-3 flex gap-2">
          {Object.entries(PRIO).map(([v, [tone, l]]) => (
            <button key={v} onClick={() => setF({ ...f, priority: v })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${f.priority === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {/* 31/10: gắn việc với khách → Trung tâm báo cáo đếm "việc trễ" đúng thương hiệu */}
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Thuộc khách / dự án <span className="text-[11px] font-medium text-slate-400">(tuỳ chọn)</span></span>
          <select value={f.customerId || ""} onChange={(e) => setF({ ...f, customerId: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="">Việc chung / cá nhân</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Chi tiết (tuỳ chọn)" />
        </label>
        <button onClick={() => { if (f.title.trim()) { onSave({ ...f, title: f.title.trim(), customerId: f.customerId || null }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">{editing ? "Lưu thay đổi" : "Lưu việc"}</button>
      </div>
    </div>
  );
}

function TaskBoard() {
  const { tasks, addTask, updateTask, toggleTask, deleteTask, canEdit, customerList = [] } = useData();
  const custName = (id) => customerList.find((c) => c.id === id)?.name;
  const canW = canEdit ? canEdit("tasks") : true; // tài khoản phụ chỉ có quyền Xem → ẩn nút ghi
  const [modal, setModal] = useState(null); // null | {} (thêm) | task (sửa)
  const [filter, setFilter] = useState("all");
  const [hi, setHi] = useState(null); // việc đang được làm nổi (mở từ ô tìm kiếm)
  const [sp, setSp] = useSearchParams();

  const today = todayISO();
  const isDone = (t) => t.status === "done";
  const isOverdue = (t) => !isDone(t) && t.date && t.date < today;
  const filtered = useMemo(() => {
    let list = [...tasks];
    // Hôm nay = việc hôm nay + việc QUÁ HẠN chưa xong (không bị lọt khỏi mọi tab)
    if (filter === "today") list = list.filter((t) => t.date === today || isOverdue(t));
    if (filter === "upcoming") list = list.filter((t) => t.date >= today && !isDone(t));
    if (filter === "done") list = list.filter(isDone);
    if (filter === "all") list = list.filter((t) => !isDone(t)); // việc xong xem ở tab "Đã xong"
    // Đã xong: mới nhất trước. Còn lại: chưa xong trước → ngày tăng dần (quá hạn/hôm nay lên đầu, không ngày cuối) → giờ → ưu tiên
    if (filter === "done") return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list.sort((a, b) => (isDone(a) - isDone(b)) || (a.date || "9").localeCompare(b.date || "9") || (a.time || "99").localeCompare(b.time || "99") || (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, today]);

  const done = tasks.filter(isDone).length;
  const todayCount = tasks.filter((t) => (t.date === today && !isDone(t)) || isOverdue(t)).length;

  // Mở từ ô tìm kiếm: /cong-viec?id=<taskId> → mở form sửa (chỉ xem → làm nổi dòng)
  const openId = sp.get("id");
  useEffect(() => {
    if (!openId) return;
    const t = tasks.find((x) => x.id === openId);
    if (!t) return; // dữ liệu chưa tải xong → chờ
    setFilter(isDone(t) ? "done" : "all");
    if (canW) setModal(t);
    setHi(t.id);
    setTimeout(() => document.getElementById("task-" + t.id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    setTimeout(() => setHi(null), 2500);
    const n = new URLSearchParams(sp); n.delete("id"); setSp(n, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, tasks]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full gap-1 rounded-full bg-slate-100 p-1 sm:w-auto">
            {[["all", "Tất cả"], ["today", "Hôm nay"], ["upcoming", "Sắp tới"], ["done", "Đã xong"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-bold sm:flex-none sm:px-3 sm:text-sm ${filter === v ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}{v === "today" && todayCount > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{todayCount}</span>}</button>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-400">{done}/{tasks.length} hoàn thành</div>
          {canW ? (
            <button onClick={() => setModal({})} className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
              <Plus size={16} /> Thêm việc
            </button>
          ) : (
            <span className="ml-auto shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-600">Chỉ xem</span>
          )}
        </div>
      </Card>

      <div className="space-y-2.5">
        {filtered.length === 0 && (
          <Card><div className="py-6 text-center">
            <div className="text-2xl">{filter === "done" ? "📋" : "🎉"}</div>
            <div className="mt-2 text-sm font-bold text-slate-600">{filter === "done" ? "Chưa có việc nào hoàn thành" : filter === "today" ? "Hôm nay không có việc nào" : filter === "upcoming" ? "Không có việc sắp tới" : "Chưa có công việc nào"}</div>
            <div className="mt-1 text-xs text-slate-400">Ghi lại việc cần làm, đặt ngày để được nhắc trong khung Hôm nay và thông báo đẩy.</div>
            {canW && filter !== "done" && <button onClick={() => setModal({})} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow"><Plus size={15} /> Thêm việc</button>}
          </div></Card>
        )}
        {filtered.map((t) => {
          const [tone, pl] = PRIO[t.priority] || PRIO.med;
          const done = isDone(t);
          const overdue = isOverdue(t);
          return (
            <div key={t.id} id={"task-" + t.id} className={`card group flex items-center gap-2 p-2.5 transition sm:gap-3 sm:p-3 ${hi === t.id ? "ring-2 ring-amber-400" : ""}`}>
              {/* Ô tick: vùng chạm 40px cho điện thoại */}
              <button onClick={() => canW && toggleTask(t.id)} disabled={!canW} title={done ? "Bỏ đánh dấu xong" : "Đánh dấu xong"} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:cursor-default">
                <span className={`grid h-6 w-6 place-items-center rounded-lg border-2 transition ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 group-hover:border-indigo-400"}`}>{done && <Check size={14} />}</span>
              </button>
              {/* Chạm vào dòng → mở form sửa */}
              <button onClick={() => canW && setModal(t)} disabled={!canW} className="min-w-0 flex-1 py-1 text-left disabled:cursor-default">
                <div className={`text-sm font-bold ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                  {overdue && <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-extrabold text-rose-600">Quá hạn</span>}
                  {t.customerId && custName(t.customerId) && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-600">{custName(t.customerId)}</span>}
                  {t.date && <span className={`flex items-center gap-1 ${overdue ? "font-bold text-rose-500" : ""}`}><Clock size={12} /> {fmtDateVI(t.date)}{t.time ? " · " + t.time : ""}</span>}
                  {t.note && <span className="min-w-0 truncate">· {t.note}</span>}
                </div>
              </button>
              <Badge tone={tone}><Flag size={10} className="mr-1 inline" />{pl}</Badge>
              {/* Xoá: điện thoại luôn hiện (màu nhạt); máy có chuột thì hiện khi rê */}
              {canW && <button onClick={() => deleteTask(t.id)} title="Xoá" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"><Trash2 size={16} /></button>}
            </div>
          );
        })}
      </div>

      {modal && <TaskModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateTask(modal.id, data) : addTask(data))} />}
    </div>
  );
}

const TABS = [["tasks", "Công việc", ListChecks], ["calendar", "Lịch & Âm lịch", CalendarDays]];

export default function Tasks({ initialTab = "tasks" }) {
  const [tab, setTab] = useState(initialTab);
  // Mở từ link khác (vd /ke-toan → /chi-phi) khi trang đang mở sẵn → chuyển đúng tab
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  // Mở 1 việc từ ô tìm kiếm (?id=) khi đang ở tab Lịch → chuyển về tab Công việc
  const [sp] = useSearchParams();
  const hasId = !!sp.get("id");
  useEffect(() => { if (hasId) setTab("tasks"); }, [hasId]);
  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className="flex">
        <div className="grid w-full grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-100 sm:inline-flex sm:w-auto">
          {TABS.map(([v, l, Ic]) => (
            <button key={v} onClick={() => setTab(v)} className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${tab === v ? "tab-active bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              <Ic size={16} /> {l}
            </button>
          ))}
        </div>
      </div>
      {tab === "tasks" ? <TaskBoard /> : <Calendar />}
    </div>
  );
}
