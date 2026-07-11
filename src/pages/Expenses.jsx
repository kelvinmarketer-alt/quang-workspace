import { Fragment, useMemo, useState } from "react";
import { Plus, X, Trash2, Pencil, Repeat, Power, CheckSquare, Square, CreditCard, TrendingDown, Layers, CalendarClock, ChevronDown } from "lucide-react";
import { Card, StatCard, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { EXPENSE_CATEGORIES } from "../data/seed.js";
import { monthlyOperatingCost, expensesInRange } from "../lib/selectors.js";
import { todayISO, fmtDateVI } from "../lib/format.js";

const CAT_TONE = { "AI": "violet", "App": "indigo", "Khác": "slate" };
const REC = { monthly: ["Hằng tháng", "rose"], yearly: ["Hằng năm", "amber"], once: ["1 lần", "slate"] };
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

function ExpenseModal({ initial, onClose, onSave, onChangePlan }) {
  const [f, setF] = useState(initial || { name: "", category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), recurring: "monthly", note: "", active: true });
  const [plan, setPlan] = useState(null); // đổi gói: null | { date, amount }
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa chi phí" : "Thêm chi phí"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên khoản chi *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus className={inputCls} placeholder="VD: ChatGPT Plus, Canva Pro, Hosting…" /></label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Danh mục</span>
            <select value={f.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền</span>
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} className={inputCls} placeholder="500.000" /></label>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div><span className="mb-1 block text-sm font-semibold text-slate-600">Chu kỳ</span>
            <div className="flex gap-1">
              {Object.entries(REC).map(([v, [l]]) => (
                <button key={v} type="button" onClick={() => set("recurring", v)} className={`flex-1 rounded-xl border px-2 py-2 text-xs font-bold ${f.recurring === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">{f.recurring === "once" ? "Ngày chi" : "Bắt đầu từ"}</span>
            <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></label>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="VD: gói năm, dùng cho job VTY…" /></label>
        <button type="button" onClick={() => set("active", !(f.active ?? true))} className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${(f.active ?? true) ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
          <Power size={15} /> {(f.active ?? true) ? "Đang chi (bấm để tạm dừng)" : "Đã dừng (bấm để bật lại)"}
        </button>
        {f.recurring !== "once" && (
          <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Gia hạn đến <span className="font-normal text-slate-400">· để trống nếu còn dùng</span></span>
            <input type="date" value={f.endDate || ""} onChange={(e) => set("endDate", e.target.value)} className={inputCls} /></label>
        )}
        {initial?.id && f.recurring !== "once" && (
          <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            {!plan ? (
              <button type="button" onClick={() => setPlan({ date: todayISO(), amount: String(num(f.amount) || "") })} className="flex items-center gap-1.5 text-sm font-bold text-indigo-600"><Repeat size={14} /> Đổi gói gia hạn (ngày/phí mới)</button>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-indigo-700">Chốt gói cũ tới hôm nay (giữ nguyên kỳ đã tính), mở gói mới từ:</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs"><span className="mb-1 block font-semibold text-slate-600">Ngày gia hạn mới</span>
                    <input type="date" value={plan.date} onChange={(e) => setPlan((p) => ({ ...p, date: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label>
                  <label className="block text-xs"><span className="mb-1 block font-semibold text-slate-600">Phí mới</span>
                    <MoneyInput value={plan.amount} onChange={(v) => setPlan((p) => ({ ...p, amount: v }))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="500.000" /></label>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPlan(null)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-bold text-slate-500">Huỷ</button>
                  <button type="button" disabled={!plan.date || num(plan.amount) <= 0} onClick={() => { onChangePlan({ date: plan.date, amount: num(plan.amount) }); onClose(); }} className="flex-1 rounded-lg bg-indigo-500 py-1.5 text-xs font-bold text-white disabled:opacity-40">Xác nhận đổi gói</button>
                </div>
              </div>
            )}
          </div>
        )}
        <button onClick={() => { if (f.name.trim() && num(f.amount)) { onSave({ ...f, name: f.name.trim(), amount: num(f.amount) }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu chi phí</button>
      </div>
    </div>
  );
}

// Thêm NHIỀU chi phí cùng lúc (nhập 1 loạt → lưu 1 lần)
function ExpenseBatchModal({ onClose, onSave }) {
  const blank = () => ({ key: "e" + Math.random().toString(36).slice(2, 8), name: "", category: EXPENSE_CATEGORIES[0], amount: "", recurring: "monthly", date: todayISO() });
  const [rows, setRows] = useState([blank(), blank(), blank()]);
  const setRow = (key, patch) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((p) => [...p, blank()]);
  const delRow = (key) => setRows((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p));
  const valid = rows.filter((r) => r.name.trim() && num(r.amount) > 0);
  const save = () => { if (!valid.length) return; onSave(valid.map((r) => ({ name: r.name.trim(), category: r.category, amount: num(r.amount), recurring: r.recurring, date: r.date, active: true }))); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <div><h3 className="text-lg font-extrabold">Thêm nhiều chi phí</h3><p className="mt-0.5 text-xs text-slate-400">Nhập một loạt rồi lưu 1 lần</p></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-slate-100 p-2.5">
              <div className="flex items-center gap-2">
                <input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} autoFocus={i === 0} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold" placeholder="Tên khoản chi *" />
                <MoneyInput value={r.amount} onChange={(v) => setRow(r.key, { amount: v })} className="w-28 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm font-bold" placeholder="Số tiền *" />
                {rows.length > 1 && <button onClick={() => delRow(r.key)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                <select value={r.recurring} onChange={(e) => setRow(r.key, { recurring: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">{Object.entries(REC).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select>
                <input type="date" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </div>
            </div>
          ))}
          <button onClick={addRow} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"><Plus size={15} /> Thêm dòng</button>
        </div>
        <div className="border-t border-slate-100 p-4">
          <button onClick={save} disabled={!valid.length} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Lưu {valid.length || ""} chi phí</button>
        </div>
      </div>
    </div>
  );
}

const monthEquiv = (e) => (e.recurring === "monthly" ? num(e.amount) : e.recurring === "yearly" ? num(e.amount) / 12 : 0);

export default function Expenses() {
  const { expenses, addExpense, addExpensesMany, updateExpense, changeExpensePlan, deleteExpense, deleteExpensesMany } = useData();
  const [modal, setModal] = useState(null);
  const [batch, setBatch] = useState(false);
  const [catF, setCatF] = useState("all");
  const [picked, setPicked] = useState(() => new Set());

  const now = new Date();
  const mFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const mTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const burn = monthlyOperatingCost(expenses);
  const thisMonth = useMemo(() => expensesInRange(expenses, mFrom, mTo).total, [expenses, mFrom, mTo]);
  const activeCount = (expenses || []).filter((e) => e.active !== false).length;

  const rows = useMemo(() => (expenses || [])
    .filter((e) => catF === "all" || e.category === catF)
    .slice().sort((a, b) => (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0) || monthEquiv(b) - monthEquiv(a)), [expenses, catF]);

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  const counts = useMemo(() => { const c = {}; for (const e of expenses || []) c[e.category] = (c[e.category] || 0) + 1; return c; }, [expenses]);

  // Gom theo CHU KỲ (Hằng tháng → Hằng năm → 1 lần), mỗi nhóm có tổng burn/tháng
  const REC_ORDER = ["monthly", "yearly", "once"];
  const byRec = useMemo(() => {
    const map = new Map();
    for (const e of rows) { const k = e.recurring || "monthly"; if (!map.has(k)) map.set(k, []); map.get(k).push(e); }
    return REC_ORDER.filter((k) => map.has(k)).map((k) => { const items = map.get(k); return { rec: k, items, count: items.length, total: items.reduce((a, e) => a + num(e.amount), 0), burn: items.reduce((a, e) => a + monthEquiv(e), 0) }; });
  }, [rows]);
  const [openRec, setOpenRec] = useState(() => new Set(["monthly", "yearly", "once"]));
  const toggleRec = (k) => setOpenRec((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const renderCard = (e) => {
    const off = e.active === false, isPicked = picked.has(e.id);
    return (
      <div key={e.id} className={`flex items-center gap-2.5 p-3 ${isPicked ? "bg-indigo-50/60" : ""} ${off ? "opacity-50" : ""}`}>
        <button onClick={() => toggle(e.id)} className="shrink-0 text-slate-300">{isPicked ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-800">{e.name}{off && <span className="ml-1 text-[10px] font-bold text-slate-400">(dừng)</span>}</div>
          <div className="mt-0.5 flex items-center gap-1.5"><Badge tone={CAT_TONE[e.category] || "slate"}>{e.category}</Badge>{e.endDate && <span className="text-[10px] font-bold text-rose-400">đến {fmtDateVI(e.endDate)}</span>}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-extrabold text-slate-800">{formatShort(e.amount)}</div>
          {monthEquiv(e) > 0 && <div className="text-[10px] font-bold text-rose-600">~{formatShort(monthEquiv(e))}/th</div>}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => setModal(e)} className="text-slate-300 hover:text-indigo-600"><Pencil size={15} /></button>
            <button onClick={() => { if (confirm("Xoá khoản chi này?")) deleteExpense(e.id); }} className="text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>
        </div>
      </div>
    );
  };
  const renderDeskRow = (e) => {
    const off = e.active === false, isPicked = picked.has(e.id);
    return (
      <tr key={e.id} className={`group border-b border-slate-50 ${isPicked ? "bg-indigo-50/70" : ""} ${off ? "opacity-50" : ""}`}>
        <td className="px-2 py-2.5"><button onClick={() => toggle(e.id)} className="text-slate-300 hover:text-indigo-600">{isPicked ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}</button></td>
        <td className="px-2 py-2.5"><div className="font-semibold text-slate-800">{e.name}{off && <span className="ml-1.5 text-[10px] font-bold text-slate-400">(dừng)</span>}</div>{e.note && <div className="text-[11px] text-slate-400">{e.note}</div>}</td>
        <td className="px-2 py-2.5"><Badge tone={CAT_TONE[e.category] || "slate"}>{e.category}</Badge></td>
        <td className="px-2 py-2.5 text-right font-bold text-slate-800">{formatShort(e.amount)}</td>
        <td className="px-2 py-2.5 text-right font-bold text-rose-600">{monthEquiv(e) ? formatShort(monthEquiv(e)) : "—"}</td>
        <td className="px-2 py-2.5 whitespace-nowrap text-[11px] text-slate-400">{fmtDateVI(e.date)}{e.endDate && <span className="text-rose-400"> → {fmtDateVI(e.endDate)}</span>}</td>
        <td className="px-2 py-2.5 text-right"><span className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100"><button onClick={() => setModal(e)} className="rounded p-1 text-slate-300 hover:text-indigo-600"><Pencil size={13} /></button><button onClick={() => { if (confirm("Xoá khoản chi này?")) deleteExpense(e.id); }} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button></span></td>
      </tr>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Repeat} label="Chi phí cố định / tháng" value={burn} sub="Quy ra mỗi tháng" tone="rose" />
        <StatCard icon={TrendingDown} label="Chi thực tháng này" value={thisMonth} sub={`${fmtDateVI(mFrom)} → nay`} tone="amber" />
        <StatCard icon={Layers} label="Khoản đang chi" value={activeCount} tone="indigo" money={false} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900">Chi phí vận hành <span className="text-slate-400">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            {rows.length > 0 && <button onClick={toggleAll} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">{allPicked ? <CheckSquare size={15} className="text-indigo-600" /> : <Square size={15} />} Chọn</button>}
            <button onClick={() => setBatch(true)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30"><Plus size={16} /> Thêm chi phí</button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {[["all", "Tất cả", (expenses || []).length], ...EXPENSE_CATEGORIES.map((c) => [c, c, counts[c] || 0])].map(([v, l, n]) => (
            <button key={v} onClick={() => setCatF(v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${catF === v ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}{n > 0 && <span className="opacity-70"> {n}</span>}</button>
          ))}
        </div>

        {picked.size > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-2.5">
            <span className="text-sm font-bold text-indigo-700">Đã chọn {picked.size}</span>
            <div className="flex gap-2">
              <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-white">Bỏ chọn</button>
              <button onClick={() => { if (confirm(`Xoá ${picked.size} khoản chi?`)) { deleteExpensesMany([...picked]); setPicked(new Set()); } }} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"><Trash2 size={14} /> Xoá đã chọn</button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-12 text-center"><CreditCard size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có chi phí nào</div><div className="mt-1 text-xs text-slate-400">Thêm các khoản chi vận hành: phần mềm AI, tool, hosting, quảng cáo…</div></div>
        ) : (
          <>
            {/* MOBILE: nhóm theo chu kỳ */}
            <div className="mt-4 space-y-3 sm:hidden">
              {byRec.map((g) => {
                const open = openRec.has(g.rec);
                const [rl, rt] = REC[g.rec] || REC.monthly;
                return (
                  <div key={g.rec} className="overflow-hidden rounded-xl border border-slate-100">
                    <button onClick={() => toggleRec(g.rec)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50 ${open ? "bg-slate-50/60" : ""}`}>
                      <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                      <Badge tone={rt}>{rl}</Badge>
                      <span className="text-xs font-bold text-slate-400">{g.count} khoản</span>
                      <span className="ml-auto text-sm font-extrabold text-rose-600">{g.burn ? `~${formatShort(g.burn)}/th` : formatShort(g.total)}</span>
                    </button>
                    {open && <div className="divide-y divide-slate-50 border-t border-slate-100">{g.items.map((e) => renderCard(e))}</div>}
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: bảng nhóm theo chu kỳ */}
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase text-slate-400">
                    <th className="w-8 px-2 py-2"></th><th className="px-2 py-2">Khoản chi</th><th className="px-2 py-2">Danh mục</th>
                    <th className="px-2 py-2 text-right">Số tiền</th><th className="px-2 py-2 text-right">~ / tháng</th><th className="px-2 py-2">Từ</th><th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {byRec.map((g) => {
                    const open = openRec.has(g.rec);
                    const [rl, rt] = REC[g.rec] || REC.monthly;
                    return (
                      <Fragment key={g.rec}>
                        <tr className="cursor-pointer border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50" onClick={() => toggleRec(g.rec)}>
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                              <Badge tone={rt}>{rl}</Badge>
                              <span className="text-xs font-bold text-slate-400">{g.count} khoản</span>
                              <span className="ml-auto text-sm font-extrabold text-rose-600">{g.burn ? `~${formatShort(g.burn)}/th` : formatShort(g.total)}</span>
                            </div>
                          </td>
                        </tr>
                        {open && g.items.map((e) => renderDeskRow(e))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <span>Các chi phí này được <b>trừ vào lợi nhuận</b> ở mục <b>Kế toán</b> (Lợi nhuận ròng = Lợi nhuận gộp − Chi phí vận hành trong kỳ). Khoản "tạm dừng" không tính.</span>
        </div>
      </Card>

      {modal && <ExpenseModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateExpense(modal.id, data) : addExpense(data))} onChangePlan={(patch) => changeExpensePlan(modal.id, patch)} />}
      {batch && <ExpenseBatchModal onClose={() => setBatch(false)} onSave={addExpensesMany} />}
    </div>
  );
}
