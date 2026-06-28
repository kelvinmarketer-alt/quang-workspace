import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Cake, Flame, Heart, Sparkles, Bell, Pencil, Download, BellRing, CheckSquare, Square, FolderDown, Check, CircleCheck, Undo2 } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { solarToLunar, canChiDay, canChiYear } from "../lib/lunar.js";
import { generateCalendarEvents, upcomingEvents, parseEventsCSV, normEvent } from "../lib/events.js";
import { MY_EVENTS } from "../data/myEvents.js";

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const KIND_COLOR = {
  holiday: "bg-sky-500", "lunar-holiday": "bg-amber-500", "lunar-phase": "bg-indigo-500",
  family: "bg-rose-500", birthday: "bg-pink-500", anniversary: "bg-violet-500", reminder: "bg-teal-500", task: "bg-emerald-500",
};
// loại sự kiện người dùng: nhãn + tone badge + icon
const CATS = {
  "giỗ": { label: "Giỗ", tone: "rose", icon: Flame },
  "sinh nhật": { label: "Sinh nhật", tone: "pink", icon: Cake },
  "kỷ niệm": { label: "Kỷ niệm", tone: "violet", icon: Heart },
  "lễ": { label: "Lễ / Tết", tone: "amber", icon: Sparkles },
  "khác": { label: "Nhắc việc", tone: "sky", icon: Bell },
};
const CAT_KEYS = ["giỗ", "sinh nhật", "kỷ niệm", "lễ", "khác"];
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function EventModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => {
    const base = { title: "", category: "giỗ", calendar: "am", day: "", month: "", repeat: "year", baseYear: "", remindBefore: "7,3,1,0", note: "" };
    if (!initial) return base;
    const e = normEvent(initial);
    return { ...base, ...e, baseYear: e.baseYear || "", remindBefore: (e.remindBefore || []).join(","), title: e.title || "" };
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const editing = !!initial?.id;
  const monthly = f.repeat === "month";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{editing ? "Sửa sự kiện" : "Thêm sự kiện"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên sự kiện *</span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus className={inputCls} placeholder="VD: Giỗ ông nội / Gia hạn hosting" /></label>

        <div className="mb-3">
          <span className="mb-1 block text-sm font-semibold text-slate-600">Loại</span>
          <div className="flex flex-wrap gap-1.5">
            {CAT_KEYS.map((k) => { const C = CATS[k]; const Ic = C.icon; const on = f.category === k; return (
              <button key={k} type="button" onClick={() => set("category", k)} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${on ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}><Ic size={13} /> {C.label}</button>
            ); })}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div><span className="mb-1 block text-sm font-semibold text-slate-600">Lịch</span>
            <div className="flex gap-1.5">
              {[["am", "Âm"], ["duong", "Dương"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set("calendar", v)} className={`flex-1 rounded-xl border py-2 text-sm font-bold ${f.calendar === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div><span className="mb-1 block text-sm font-semibold text-slate-600">Lặp</span>
            <select value={f.repeat} onChange={(e) => set("repeat", e.target.value)} className={inputCls}>
              <option value="year">Hằng năm</option><option value="month">Hằng tháng</option><option value="once">Một lần</option>
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <label className="text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <input type="number" min="1" max="31" value={f.day} onChange={(e) => set("day", e.target.value)} className={inputCls} /></label>
          <label className={`text-sm ${monthly ? "opacity-40" : ""}`}><span className="mb-1 block font-semibold text-slate-600">Tháng</span>
            <input type="number" min="1" max="12" value={f.month} onChange={(e) => set("month", e.target.value)} disabled={monthly} className={inputCls} placeholder={monthly ? "mọi tháng" : ""} /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold text-slate-600">Năm gốc</span>
            <input type="number" value={f.baseYear} onChange={(e) => set("baseYear", e.target.value)} className={inputCls} placeholder="vd 1992" /></label>
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Nhắc trước (số ngày, cách nhau dấu phẩy)</span>
          <input value={f.remindBefore} onChange={(e) => set("remindBefore", e.target.value)} className={inputCls} placeholder="7,3,1,0" /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} /></label>

        <button onClick={() => {
          if (!f.title.trim() || !Number(f.day)) return;
          onSave({
            title: f.title.trim(), category: f.category, calendar: f.calendar, repeat: f.repeat,
            day: Number(f.day), month: monthly ? 0 : Number(f.month) || 0,
            baseYear: Number(f.baseYear) || null,
            remindBefore: String(f.remindBefore).split(/[,;\s]+/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n)),
            note: f.note.trim(),
          });
          onClose();
        }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu sự kiện</button>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => { try { return parseEventsCSV(text); } catch { return []; } }, [text]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Nhập sự kiện từ Google Sheet</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-slate-400">Mở Sheet lịch âm → bôi đen các dòng (gồm cả tiêu đề) → copy → dán vào đây. Cột: Bật, Tên, Phân loại, Lặp, Ngày, Tháng, Âm/Dương, Năm gốc, Nhắc trước, Ghi chú.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${inputCls} font-mono text-xs`} placeholder={"TRUE\tGiỗ ông nội\tgiỗ\tHằng năm\t9\t4\tÂm\t1992\t7,3,1,0\t"} autoFocus />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">Nhận diện <span className="text-indigo-600">{parsed.length}</span> sự kiện</span>
          <button onClick={() => { if (parsed.length) { onImport(parsed); onClose(); } }} disabled={!parsed.length} className="rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Nhập {parsed.length || ""}</button>
        </div>
      </div>
    </div>
  );
}

const WINDOWS = [[30, "30 ngày"], [90, "3 tháng"], [180, "6 tháng"], [365, "1 năm"]];

export default function Calendar() {
  const { tasks, family, addFamily, updateFamily, deleteFamily, addFamilyMany, deleteFamilyMany } = useData();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(isoOf(today));
  const [modal, setModal] = useState(null); // null | {} | event
  const [importOpen, setImportOpen] = useState(false);
  const [win, setWin] = useState(90);
  const [catF, setCatF] = useState("all");
  const [picked, setPicked] = useState(() => new Set());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const events = useMemo(() => {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    const ev = generateCalendarEvents(from, to, family);
    const taskEv = tasks.filter((t) => t.date).map((t) => ({ date: t.date, title: t.title, type: "task" }));
    const map = {};
    for (const e of [...ev, ...taskEv]) (map[e.date] ||= []).push(e);
    return map;
  }, [year, month, family, tasks]);

  const report = useMemo(() => upcomingEvents(family, new Date(), win), [family, win]);
  const filtered = report.filter((r) => catF === "all" || r.category === catF);
  const remindNow = report.filter((r) => r.willRemind);
  const selectable = filtered.filter((r) => !r.builtin); // chỉ sự kiện riêng mới chọn/xoá được
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.has(r.id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.id)));
  const loadMine = () => { addFamilyMany(MY_EVENTS); };

  // grid (Mon-first)
  const first = new Date(year, month, 1);
  let startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const selDate = new Date(selected);
  const selLunar = solarToLunar(selDate.getDate(), selDate.getMonth() + 1, selDate.getFullYear());
  const selEvents = events[selected] || [];

  const myEvents = family.map(normEvent);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner cần nhắc hôm nay */}
      {remindNow.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-amber-700"><BellRing size={16} /> Cần nhắc hôm nay ({remindNow.length})</div>
          <div className="flex flex-wrap gap-2">
            {remindNow.map((r) => (
              <span key={r.id + r.date} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                <span className={`h-2 w-2 rounded-full ${KIND_COLOR[r.kind] || "bg-slate-400"}`} />
                {r.title} · <span className="text-amber-600">{r.daysUntil === 0 ? "hôm nay" : `còn ${r.daysUntil}n`}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Tháng {month + 1}, {year}</div>
              <div className="text-xs text-slate-400">Âm lịch năm {canChiYear(selLunar.year)}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronLeft size={18} /></button>
              <button onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(isoOf(n)); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Hôm nay</button>
              <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {DOW.map((d) => (<div key={d} className="py-1 text-center text-[11px] font-bold uppercase text-slate-400">{d}</div>))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = isoOf(d);
              const l = solarToLunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
              const isToday = k === isoOf(today);
              const isSel = k === selected;
              const evs = events[k] || [];
              const isFirstOfLunarMonth = l.day === 1;
              return (
                <button key={i} onClick={() => setSelected(k)} className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-center transition ${isSel ? "border-indigo-500 bg-indigo-50" : "border-transparent hover:bg-slate-50"} ${isToday && !isSel ? "bg-slate-100" : ""}`}>
                  <span className={`text-sm font-bold ${isToday ? "text-indigo-600" : "text-slate-700"}`}>{d.getDate()}</span>
                  <span className={`text-[10px] ${isFirstOfLunarMonth ? "font-bold text-rose-500" : "text-slate-400"}`}>{l.day === 1 ? `${l.day}/${l.month}` : l.day}</span>
                  {evs.length > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5">
                      {evs.slice(0, 3).map((e, j) => (<span key={j} className={`h-1.5 w-1.5 rounded-full ${KIND_COLOR[e.type] || "bg-slate-400"}`} />))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Mùng 1 / Rằm</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Lễ âm</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Lễ dương</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Giỗ</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" /> Sinh nhật</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-500" /> Nhắc việc</span>
          </div>
        </Card>

        <Card>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white">
            <div className="text-xs font-medium text-indigo-100">{DOW[(selDate.getDay() + 6) % 7]}, {selDate.getDate()}/{selDate.getMonth() + 1}/{selDate.getFullYear()}</div>
            <div className="mt-1 text-3xl font-extrabold">{selLunar.day}/{selLunar.month}{selLunar.leap ? " (nhuận)" : ""}</div>
            <div className="text-sm text-indigo-100">Ngày {canChiDay(selDate.getDate(), selDate.getMonth() + 1, selDate.getFullYear())} · Năm {canChiYear(selLunar.year)}</div>
          </div>
          <div className="mt-4 space-y-2">
            {selEvents.length === 0 && <div className="text-sm text-slate-400">Không có sự kiện trong ngày.</div>}
            {selEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <span className={`h-8 w-1.5 rounded-full ${KIND_COLOR[e.type] || "bg-slate-400"}`} />
                <div className="flex-1 text-sm font-semibold text-slate-700">{e.title}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* BÁO CÁO: Sự kiện sắp tới */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900">Sự kiện sắp tới <span className="text-slate-400">({filtered.filter((r) => !r.done).length}{filtered.some((r) => r.done) ? ` · ${filtered.filter((r) => r.done).length} đã xong` : ""})</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {WINDOWS.map(([v, l]) => (
                <button key={v} onClick={() => setWin(v)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${win === v ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>
              ))}
            </div>
            {selectable.length > 0 && (
              <button onClick={toggleAll} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">{allPicked ? <CheckSquare size={15} className="text-indigo-600" /> : <Square size={15} />} Chọn</button>
            )}
            <button onClick={loadMine} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-100"><FolderDown size={15} /> Nạp sự kiện của tôi</button>
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Download size={15} /> Nhập CSV</button>
            <button onClick={() => setModal({})} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30"><Plus size={15} /> Thêm</button>
          </div>
        </div>

        {picked.size > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-2.5">
            <span className="text-sm font-bold text-indigo-700">Đã chọn {picked.size} sự kiện</span>
            <div className="flex gap-2">
              <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-white">Bỏ chọn</button>
              <button onClick={() => { if (confirm(`Xoá ${picked.size} sự kiện đã chọn?`)) { deleteFamilyMany([...picked]); setPicked(new Set()); } }} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"><Trash2 size={14} /> Xoá đã chọn</button>
            </div>
          </div>
        )}

        {/* MOBILE: dropdown danh mục */}
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:hidden">
          {[["all", "Tất cả"], ...CAT_KEYS.map((k) => [k, CATS[k].label])].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {/* DESKTOP: chips danh mục */}
        <div className="mt-3 hidden flex-wrap gap-1 sm:flex">
          {[["all", "Tất cả"], ...CAT_KEYS.map((k) => [k, CATS[k].label])].map(([v, l]) => (
            <button key={v} onClick={() => setCatF(v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${catF === v ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>

        {/* MOBILE: danh sách thẻ */}
        <div className="mt-4 space-y-2 sm:hidden">
          {filtered.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Không có sự kiện trong khoảng này.</div>}
          {filtered.map((r) => {
            const C = CATS[r.category] || CATS["khác"];
            const fam = !r.builtin ? family.find((x) => x.id === r.id) : null;
            const isPicked = picked.has(r.id);
            return (
              <div key={r.id + r.date} className={`flex items-start gap-2.5 rounded-xl border p-3 ${r.done ? "opacity-60" : ""} ${isPicked ? "border-indigo-300 bg-indigo-50/60" : r.willRemind && !r.done ? "border-amber-200 bg-amber-50/50" : "border-slate-100"}`}>
                {fam && <button onClick={() => toggle(r.id)} className="mt-0.5 shrink-0 text-slate-300">{isPicked ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}</button>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_COLOR[r.kind] || "bg-slate-400"}`} />
                    <span className="truncate text-sm font-bold text-slate-800">{r.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
                    <Badge tone={C.tone}>{C.label}</Badge>
                    <span>{r.dow}, {r.solar} · ÂL {r.lunar}</span>
                    {r.years != null && <span className="text-slate-400">· {r.category === "sinh nhật" ? `${r.years} tuổi` : `${r.years} năm`}</span>}
                  </div>
                  {r.note && <div className="mt-0.5 text-[11px] text-slate-400">{r.note}</div>}
                </div>
                <div className="shrink-0 text-right">
                  {r.done ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-extrabold text-emerald-700"><CircleCheck size={11} /> Xong</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-extrabold ${r.daysUntil === 0 ? "bg-rose-100 text-rose-600" : r.willRemind ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{r.willRemind && <BellRing size={10} />}{r.daysUntil === 0 ? "Hôm nay" : `${r.daysUntil}n`}</span>
                  )}
                  {fam && (
                    <div className="mt-1.5 flex justify-end gap-2">
                      {r.manualDone ? (
                        <button onClick={() => updateFamily(fam.id, { done: false })} className="text-emerald-500"><Undo2 size={15} /></button>
                      ) : r.repeat === "once" && !r.done ? (
                        <button onClick={() => updateFamily(fam.id, { done: true })} className="text-slate-300 hover:text-emerald-600"><Check size={16} /></button>
                      ) : null}
                      <button onClick={() => setModal(fam)} className="text-slate-300 hover:text-indigo-600"><Pencil size={15} /></button>
                      <button onClick={() => { if (confirm("Xoá sự kiện này?")) deleteFamily(fam.id); }} className="text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* DESKTOP: bảng */}
        <div className="mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase text-slate-400">
                <th className="w-8 px-2 py-2">{selectable.length > 0 && <button onClick={toggleAll}>{allPicked ? <CheckSquare size={15} className="text-indigo-600" /> : <Square size={15} className="text-slate-300" />}</button>}</th>
                <th className="px-2 py-2">Còn</th><th className="px-2 py-2">Sự kiện</th><th className="px-2 py-2">Loại</th>
                <th className="px-2 py-2">Dương</th><th className="px-2 py-2">Âm</th><th className="px-2 py-2">Năm</th><th className="px-2 py-2">Ghi chú</th><th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (<tr><td colSpan={9} className="py-8 text-center text-sm text-slate-400">Không có sự kiện trong khoảng này.</td></tr>)}
              {filtered.map((r) => {
                const C = CATS[r.category] || CATS["khác"];
                const fam = !r.builtin ? family.find((x) => x.id === r.id) : null;
                const isPicked = picked.has(r.id);
                return (
                  <tr key={r.id + r.date} className={`group border-b border-slate-50 ${r.done ? "opacity-55" : ""} ${isPicked ? "bg-indigo-50/70" : r.willRemind && !r.done ? "bg-amber-50/60" : ""}`}>
                    <td className="px-2 py-2.5">{fam && (<button onClick={() => toggle(r.id)} className="text-slate-300 hover:text-indigo-600">{isPicked ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}</button>)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {r.done ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-extrabold text-emerald-700"><CircleCheck size={12} /> Hoàn thành</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold ${r.daysUntil === 0 ? "bg-rose-100 text-rose-600" : r.willRemind ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {r.willRemind && <BellRing size={11} />}{r.daysUntil === 0 ? "Hôm nay" : `${r.daysUntil} ngày`}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5"><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${KIND_COLOR[r.kind] || "bg-slate-400"}`} /><span className="font-semibold text-slate-800">{r.title}</span></div></td>
                    <td className="px-2 py-2.5"><Badge tone={C.tone}>{C.label}</Badge></td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{r.dow}, {r.solar}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-500">{r.lunar}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-500">{r.years != null ? (r.category === "sinh nhật" ? `${r.years} tuổi` : `${r.years} năm`) : "—"}</td>
                    <td className="px-2 py-2.5 text-[11px] text-slate-400">{r.note}</td>
                    <td className="px-2 py-2.5 text-right">
                      {fam && (
                        <span className="flex items-center justify-end gap-1">
                          {r.manualDone ? (
                            <button title="Mở lại" onClick={() => updateFamily(fam.id, { done: false })} className="rounded p-1 text-emerald-500 hover:text-emerald-700"><Undo2 size={14} /></button>
                          ) : r.repeat === "once" && !r.done ? (
                            <button title="Đánh dấu hoàn thành" onClick={() => updateFamily(fam.id, { done: true })} className="rounded p-1 text-slate-300 hover:text-emerald-600"><Check size={15} /></button>
                          ) : null}
                          <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                            <button onClick={() => setModal(fam)} className="rounded p-1 text-slate-300 hover:text-indigo-600"><Pencil size={13} /></button>
                            <button onClick={() => { if (confirm("Xoá sự kiện này?")) deleteFamily(fam.id); }} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Tổng đang quản lý: <b>{family.length}</b> sự kiện riêng (giỗ / sinh nhật / kỷ niệm / nhắc việc). Lễ &amp; Mùng 1 / Rằm tự sinh sẵn.</div>
      </Card>

      {modal && <EventModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateFamily(modal.id, data) : addFamily(data))} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={addFamilyMany} />}
    </div>
  );
}
