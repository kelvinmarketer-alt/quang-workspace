// Tách từ pages/Funds.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { AlertCircle, ArrowLeftRight, Camera, Check, Images, Loader2, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { EVERY, TONE_BG, inputCls, monthLabel, num } from "./fundUtil.js";
import { FUND_COLORS } from "../../data/seed.js";
import { MoneyInput, formatShort, formatVND } from "../ui.jsx";
import { aiReadExpense, imageToDataUrl } from "../../lib/ai.js";
import { ask, guardClose, markDirty } from "../ConfirmDialog.jsx";
import { todayISO } from "../../lib/format.js";
import { usePasteImages } from "../../lib/paste.js";
import { useState } from "react";

export function SpendCatPicker({ cats, value, onChange, onManage, label = "Danh mục" }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <button type="button" onClick={onManage} className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:underline"><Pencil size={11} /> Sửa danh mục</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(cats || []).map((c) => {
          const on = value === c.name;
          return (
            <button key={c.id} type="button" title={c.note || c.name} onClick={() => onChange(on ? "" : c.name)} className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${on ? `${TONE_BG[c.color] || "bg-slate-500"} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{c.name}</button>
          );
        })}
        {(!cats || cats.length === 0) && <button type="button" onClick={onManage} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">+ Thêm danh mục</button>}
      </div>
    </div>
  );
}

/* ---- Quản lý danh mục chi: thêm / sửa tên / đổi màu / xoá ---- */
export function SpendCatManager({ cats, onAdd, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState("amber");
  const next = (c) => FUND_COLORS[(FUND_COLORS.indexOf(c) + 1) % FUND_COLORS.length];
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <h3 className="text-lg font-extrabold">Danh mục chi tiêu</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {(cats || []).length === 0 && <div className="py-6 text-center text-sm text-slate-400">Chưa có danh mục. Thêm bên dưới.</div>}
          {(cats || []).map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-100 p-2">
              <div className="flex items-center gap-2">
                <button onClick={() => onUpdate(c.id, { color: next(c.color) })} title="Bấm để đổi màu" className={`h-6 w-6 shrink-0 rounded-full ${TONE_BG[c.color] || "bg-slate-400"}`} />
                <input value={c.name} onChange={(e) => onUpdate(c.id, { name: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold" />
                <button aria-label="Xoá" title="Xoá" onClick={async () => { if (await ask(`Xoá danh mục "${c.name}"?`)) onDelete(c.id); }} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
              <input value={c.note || ""} onChange={(e) => onUpdate(c.id, { note: e.target.value })} placeholder="Ghi chú: gồm những khoản gì…" className="mt-1.5 w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] text-slate-500" />
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setColor(next(color))} title="Bấm để đổi màu" className={`h-8 w-8 shrink-0 rounded-full ${TONE_BG[color]}`} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên danh mục mới…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd({ name: name.trim(), color, note: note.trim() }); setName(""); setNote(""); } }} />
            <button onClick={() => { if (name.trim()) { onAdd({ name: name.trim(), color, note: note.trim() }); setName(""); setNote(""); } }} className="flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-sm font-bold text-white"><Plus size={14} /> Thêm</button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn) — gồm những khoản gì…" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
          <p className="mt-2 text-[11px] text-slate-400">Sửa tên/ghi chú trực tiếp · bấm chấm màu để đổi màu.</p>
        </div>
      </div>
    </div>
  );
}

/* ---- Modal thêm/sửa quỹ ---- */
export function FundModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || { name: "", color: "indigo", percent: "", note: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa quỹ" : "Thêm quỹ"}</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên quỹ *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus className={inputCls} placeholder="VD: Đầu tư, Du lịch, Dự phòng…" /></label>
        <div className="mb-3"><span className="mb-1 block text-sm font-semibold text-slate-600">Màu</span>
          <div className="flex flex-wrap gap-2">
            {FUND_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set("color", c)} className={`h-8 w-8 rounded-full ${TONE_BG[c]} ${f.color === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`} />
            ))}
          </div>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">% phân bổ mặc định</span>
          <input type="number" min="0" max="100" value={f.percent} onChange={(e) => set("percent", e.target.value)} className={inputCls} placeholder="VD: 30" /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="Mục đích của quỹ" /></label>
        <button onClick={() => { if (f.name.trim()) { onSave({ ...f, name: f.name.trim(), percent: Number(f.percent) || 0 }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu quỹ</button>
      </div>
    </div>
  );
}

/* ---- Modal nạp / rút 1 quỹ ---- */
// Nạp / Chi — nhập NHIỀU khoản cùng lúc rồi lưu 1 lần
export function TxModal({ fund, type, cats, onManage, onClose, onSave }) {
  const isIn = type === "in";
  const blank = () => ({ key: "r" + Math.random().toString(36).slice(2, 8), amount: "", date: todayISO(), note: "", cat: "" });
  const [rows, setRows] = useState([blank()]);
  const setRow = (key, patch) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((p) => [...p, { ...blank(), date: p[p.length - 1]?.date || todayISO() }]);
  const delRow = (key) => setRows((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p));
  const valid = rows.filter((r) => num(r.amount) > 0);
  const total = valid.reduce((a, r) => a + num(r.amount), 0);
  const save = () => { if (!valid.length) return; onSave(valid.map((r) => ({ fundId: fund.id, amount: num(r.amount), date: r.date, type, note: r.note.trim() || (isIn ? "Nạp tiền" : "Khoản chi"), ...(isIn ? {} : { cat: r.cat || "" }) }))); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <h3 className="text-lg font-extrabold">{isIn ? "Nạp vào" : "Chi tiêu từ"} quỹ {fund.name}</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-slate-100 p-2.5">
              <div className="flex items-center gap-2">
                <MoneyInput value={r.amount} onChange={(v) => setRow(r.key, { amount: v })} autoFocus={i === 0} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold" placeholder="Số tiền *" />
                <input type="date" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} className="shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                {rows.length > 1 && <button aria-label="Xoá" title="Xoá" onClick={() => delRow(r.key)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" placeholder={isIn ? "Nguồn tiền…" : "Chi cho việc gì…"} />
                {!isIn && (
                  <select value={r.cat} onChange={(e) => setRow(r.key, { cat: e.target.value })} className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs">
                    <option value="">— DM —</option>
                    {(cats || []).map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
          <button onClick={addRow} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"><Plus size={15} /> Thêm dòng</button>
          {!isIn && <button type="button" onClick={onManage} className="mt-1 flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:underline"><Pencil size={11} /> Sửa danh mục</button>}
        </div>
        <div className="border-t border-slate-100 p-4">
          {valid.length > 0 && <div className="mb-2 text-center text-xs font-bold text-slate-500">{valid.length} khoản · tổng <span className={isIn ? "text-emerald-600" : "text-rose-600"}>{isIn ? "+" : "−"}{formatShort(total)}</span></div>}
          <button onClick={save} disabled={!valid.length} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-40 ${isIn ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" : "bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30"}`}>Lưu {valid.length || ""} khoản {isIn ? "nạp" : "chi"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Modal SỬA 1 giao dịch quỹ (nạp / chi / chuyển) ---- */
export function TxEditModal({ tx, fund, cats, onManage, onClose, onSave }) {
  const isXfer = !!tx.xferId;
  const [f, setF] = useState({ amount: String(tx.amount ?? ""), date: tx.date || todayISO(), note: tx.note || "", cat: tx.cat || "", type: tx.type === "out" ? "out" : "in" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const isIn = f.type === "in";
  const save = () => {
    if (num(f.amount) <= 0) return;
    const patch = { amount: num(f.amount), date: f.date, note: f.note.trim() };
    if (!isXfer) { patch.type = f.type; patch.cat = isIn ? "" : (f.cat || ""); }
    onSave(tx.id, patch);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Sửa giao dịch{fund ? ` · ${fund.name}` : ""}</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {isXfer ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs font-semibold text-indigo-700">
            <ArrowLeftRight size={15} className="mt-0.5 shrink-0" /> Phiếu chuyển quỹ 2 chiều — sửa số tiền/ngày sẽ áp cho CẢ 2 quỹ.
          </div>
        ) : (
          <div className="mb-3 flex overflow-hidden rounded-xl border border-slate-200 text-sm font-bold">
            <button type="button" onClick={() => set("type", "in")} className={`flex-1 py-2 ${isIn ? "bg-emerald-500 text-white" : "text-slate-500"}`}>Nạp</button>
            <button type="button" onClick={() => set("type", "out")} className={`flex-1 py-2 ${!isIn ? "bg-rose-500 text-white" : "text-slate-500"}`}>Chi</button>
          </div>
        )}
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền *</span>
          <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} autoFocus className={inputCls} placeholder="2.000.000" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="Nội dung giao dịch" /></label>
        {!isXfer && !isIn && <div className="mb-4"><SpendCatPicker cats={cats} value={f.cat} onChange={(v) => set("cat", v)} onManage={onManage} /></div>}
        <button onClick={save} disabled={num(f.amount) <= 0} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Lưu thay đổi</button>
      </div>
    </div>
  );
}

/* ---- Modal chuyển tiền giữa 2 quỹ ---- */
// Chuyển tiền: 1 quỹ NGUỒN → NHIỀU quỹ đích, nhiều dòng, chuyển 1 lần
export function TransferModal({ funds, initialFrom, onClose, onSave }) {
  const defFrom = initialFrom || funds[0]?.id || "";
  const otherThan = (fid) => (funds.find((f) => f.id !== fid) || {}).id || "";
  const blank = (fid) => ({ key: "r" + Math.random().toString(36).slice(2, 8), to: otherThan(fid), amount: "", note: "" });
  const [from, setFrom] = useState(defFrom);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([blank(defFrom)]);
  const setRow = (key, patch) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((p) => [...p, blank(from)]);
  const delRow = (key) => setRows((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p));
  const changeFrom = (nf) => { setFrom(nf); setRows((p) => p.map((r) => (r.to === nf ? { ...r, to: otherThan(nf) } : r))); };
  const fromFund = funds.find((f) => f.id === from);
  const dests = funds.filter((f) => f.id !== from);
  const valid = rows.filter((r) => r.to && r.to !== from && num(r.amount) > 0);
  const total = valid.reduce((a, r) => a + num(r.amount), 0);
  const balance = fromFund?.balance || 0;
  const over = total > balance;
  const save = () => { if (!valid.length) return; onSave(from, valid.map((r) => ({ toId: r.to, amount: num(r.amount), note: r.note.trim() })), date); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <h3 className="text-lg font-extrabold">Chuyển tiền giữa quỹ</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2 grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Từ quỹ</span>
              <select value={from} onChange={(e) => changeFrom(e.target.value)} className={inputCls}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
          </div>
          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">Số dư nguồn: <span className="text-slate-800">{formatVND(balance)}</span></div>
          <div className="mb-1 text-xs font-bold uppercase text-slate-400">Chuyển sang các quỹ</div>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center gap-2">
                  <select value={r.to} onChange={(e) => setRow(r.key, { to: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold">
                    {dests.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <MoneyInput value={r.amount} onChange={(v) => setRow(r.key, { amount: v })} className="w-32 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm font-bold" placeholder="Số tiền" />
                  {rows.length > 1 && <button aria-label="Xoá" title="Xoá" onClick={() => delRow(r.key)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>}
                </div>
                <input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" placeholder="Ghi chú (tuỳ chọn)" />
              </div>
            ))}
          </div>
          <button onClick={addRow} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"><Plus size={15} /> Thêm quỹ đích</button>
        </div>
        <div className="border-t border-slate-100 p-4">
          {valid.length > 0 && (
            <div className={`mb-2 flex items-center justify-between text-xs font-bold ${over ? "text-rose-600" : "text-slate-500"}`}>
              <span>{valid.length} khoản · tổng {formatShort(total)}</span>
              <span>{over ? `⚠ Vượt số dư ${formatShort(total - balance)}` : `Còn lại ${formatShort(balance - total)}`}</span>
            </div>
          )}
          <button disabled={!valid.length} onClick={save} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">
            <ArrowLeftRight size={16} /> Chuyển {valid.length || ""} khoản
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Modal lịch chuyển quỹ định kỳ ---- */
export function ScheduleModal({ initial, funds, onClose, onSave }) {
  const [f, setF] = useState(initial || { fromId: funds[0]?.id || "", toId: funds[1]?.id || funds[0]?.id || "", amount: "", every: "2week", startDate: todayISO(), note: "", active: true });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const bad = !f.fromId || !f.toId || f.fromId === f.toId || num(f.amount) <= 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa lịch chuyển" : "Lịch chuyển định kỳ"}</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Từ quỹ</span>
            <select value={f.fromId} onChange={(e) => set("fromId", e.target.value)} className={inputCls}>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Sang quỹ</span>
            <select value={f.toId} onChange={(e) => set("toId", e.target.value)} className={inputCls}>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền mỗi kỳ *</span>
          <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} className={inputCls} placeholder="2.000.000" /></label>
        <div className="mb-3"><span className="mb-1 block text-sm font-semibold text-slate-600">Tần suất</span>
          <div className="flex gap-1.5">
            {EVERY.map(([v, l]) => (
              <button key={v} type="button" onClick={() => set("every", v)} className={`flex-1 rounded-xl border py-2 text-sm font-bold ${f.every === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Bắt đầu từ</span>
          <input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="VD: trích đầu tư định kỳ" /></label>
        {f.fromId === f.toId && <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Chọn 2 quỹ khác nhau.</div>}
        <button disabled={bad} onClick={() => { if (!bad) { onSave({ ...f, amount: num(f.amount), note: f.note.trim() }); onClose(); } }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">
          <Repeat size={16} /> Lưu lịch
        </button>
      </div>
    </div>
  );
}

/* ---- Modal phân bổ từ Quỹ công ty vào các quỹ theo % ---- */
export function AllocateModal({ funds, defaultAmount, onClose, onSave }) {
  const cap = Math.max(0, defaultAmount || 0); // số dư quỹ công ty — không được chia vượt
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(String(cap || ""));
  // Chia theo %: các quỹ đầu làm tròn, quỹ CUỐI nhận phần dư → tổng luôn KHỚP total (hết lệch làm tròn)
  const splitByPct = (total) => {
    const out = {}; let acc = 0;
    funds.forEach((f, i) => {
      if (i === funds.length - 1) out[f.id] = Math.max(0, total - acc);
      else { const v = Math.round((total * (f.percent || 0)) / 100); out[f.id] = v; acc += v; }
    });
    return out;
  };
  const [rows, setRows] = useState(() => splitByPct(cap));
  const setTotal = (v) => { const t = num(v); setAmount(v); setRows(splitByPct(t)); };
  const allocated = Object.values(rows).reduce((a, b) => a + (Number(b) || 0), 0);
  const total = num(amount);
  const over = allocated > cap; // chia nhiều hơn số dư quỹ công ty
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Phân bổ từ Quỹ công ty</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Chia lợi nhuận gộp trong <b>Quỹ công ty</b> ra các quỹ. Quỹ công ty còn lại: <b className="text-indigo-600">{formatShort(defaultAmount || 0)}</b></p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tổng tiền chia</span>
            <MoneyInput value={amount} onChange={setTotal} className={inputCls} placeholder="10.000.000" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
        </div>
        <div className="mb-3 space-y-2">
          {funds.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
              <span className={`h-3 w-3 shrink-0 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-700">{f.name}</div><div className="text-[11px] text-slate-400">{f.percent || 0}%</div></div>
              <MoneyInput value={String(rows[f.id] ?? "")} onChange={(v) => setRows((p) => ({ ...p, [f.id]: num(v) }))} className="w-32 rounded-xl border border-slate-200 px-3 py-1.5 text-right text-sm" />
            </div>
          ))}
        </div>
        <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold ${over ? "bg-rose-50 text-rose-700" : allocated === total ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <span>Đã chia {formatShort(allocated)} / còn {formatShort(cap)}</span>
          <span>{over ? "Vượt quỹ công ty!" : allocated === total ? "Khớp ✓" : `Lệch ${formatShort(Math.abs(total - allocated))}`}</span>
        </div>
        <button disabled={over || allocated <= 0} onClick={() => { const entries = funds.map((f) => ({ fundId: f.id, amount: Number(rows[f.id]) || 0 })); if (!over && entries.some((e) => e.amount > 0)) { onSave(entries, date, `Phân bổ ${monthLabel(date)}`); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Phân bổ ra các quỹ</button>
      </div>
    </div>
  );
}

/* ---- Modal CHI TỪ ẢNH (nhiều ảnh biên lai) — OpenAI Vision đọc số tiền ---- */
export function ExpenseImageModal({ fund, apiKey, aiReady, model, cats, onManage, onClose, onSave }) {
  const [items, setItems] = useState([]); // {id, thumb, status, amount, note, date, cat, error}
  const [defaultCat, setDefaultCat] = useState("");
  const hasKey = aiReady ?? !!(apiKey || "").trim();

  // Đọc 1 ảnh → có thể ra NHIỀU giao dịch → thay dòng placeholder bằng N dòng
  const readOne = async (id, dataUrl, cat) => {
    try {
      const { transactions } = await aiReadExpense({ imageDataUrl: dataUrl, apiKey, model });
      setItems((p) => {
        const idx = p.findIndex((it) => it.id === id);
        if (idx < 0) return p;
        const src = transactions.length ? transactions : [{ amount: 0, date: todayISO(), note: "" }];
        const rows = src.map((t, i) => ({ id: id + "_" + i, thumb: dataUrl, status: t.amount > 0 ? "done" : "empty", amount: t.amount, type: t.type || "out", date: t.date, note: t.note, cat: cat || "" }));
        return [...p.slice(0, idx), ...rows, ...p.slice(idx + 1)];
      });
    } catch (e) {
      setItems((p) => p.map((it) => (it.id === id ? { ...it, status: "error", error: e.message } : it)));
    }
  };

  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type && f.type.startsWith("image/"));
    for (const f of files) {
      const id = "im" + Math.random().toString(36).slice(2, 8);
      let dataUrl;
      try { dataUrl = await imageToDataUrl(f); } catch { continue; }
      setItems((p) => [...p, { id, thumb: dataUrl, status: hasKey ? "reading" : "empty", amount: 0, type: "out", date: todayISO(), note: "", cat: defaultCat }]);
      if (hasKey) readOne(id, dataUrl, defaultCat);
    }
  };

  usePasteImages((files) => addFiles(files));
  const update = (id, patch) => setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id) => setItems((p) => p.filter((it) => it.id !== id));
  const reading = items.some((it) => it.status === "reading");
  const valid = items.filter((it) => num(it.amount) > 0 && it.status !== "reading");
  const inTotal = valid.filter((it) => it.type === "in").reduce((a, it) => a + num(it.amount), 0);
  const outTotal = valid.filter((it) => it.type !== "in").reduce((a, it) => a + num(it.amount), 0);
  const nIn = valid.filter((it) => it.type === "in").length;
  const nOut = valid.length - nIn;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-extrabold"><Camera size={18} className="text-indigo-500" /> Ghi giao dịch từ ảnh · {fund.name}</h3>
            <p className="mt-0.5 text-xs text-slate-400">AI tự đọc số tiền + phân biệt <b className="text-emerald-600">Nạp (+)</b> / <b className="text-rose-600">Chi (−)</b>. Bạn chỉnh lại rồi ghi 1 loạt.</p>
          </div>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {!hasKey && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> Chưa có OpenAI key (vào <b>Cài đặt</b> để bật tự đọc số tiền). Bạn vẫn thêm ảnh và <b>nhập tay</b> số tiền được.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-center hover:border-fuchsia-300 hover:bg-fuchsia-50/40">
              <Images size={22} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Bộ sưu tập</span>
              <span className="text-[11px] text-slate-400">chọn nhiều ảnh có sẵn</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-center hover:border-rose-300 hover:bg-rose-50/40">
              <Camera size={22} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Chụp ảnh</span>
              <span className="text-[11px] text-slate-400">mở camera điện thoại</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Có thể <b>dán ảnh (Ctrl/Cmd+V)</b> · ảnh chỉ dùng để đọc số tiền — KHÔNG lưu lên hệ thống</p>

          {items.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
              <SpendCatPicker cats={cats} value={defaultCat} label="Danh mục (áp cho tất cả)" onManage={onManage} onChange={(v) => { setDefaultCat(v); setItems((p) => p.map((it) => ({ ...it, cat: v }))); }} />
            </div>
          )}

          <div className="mt-3 space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2">
                <img src={it.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  {it.status === "reading" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-500"><Loader2 size={13} className="animate-spin" /> Đang đọc…</div>
                  ) : it.status === "error" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500" title={it.error}><AlertCircle size={13} /> Lỗi — nhập tay</div>
                  ) : it.status === "empty" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600"><AlertCircle size={13} /> Chưa đọc được số — nhập tay</div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600"><Check size={12} /> Đã đọc</div>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-[11px] font-bold">
                      <button type="button" onClick={() => update(it.id, { type: "in" })} className={`px-2 py-1 ${it.type === "in" ? "bg-emerald-500 text-white" : "text-slate-400"}`}>Nạp</button>
                      <button type="button" onClick={() => update(it.id, { type: "out" })} className={`px-2 py-1 ${it.type !== "in" ? "bg-rose-500 text-white" : "text-slate-400"}`}>Chi</button>
                    </div>
                    <MoneyInput value={String(it.amount ?? "")} onChange={(v) => update(it.id, { amount: num(v) })} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-bold" placeholder="0" />
                    <input value={it.date} onChange={(e) => update(it.id, { date: e.target.value })} type="date" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-1.5 py-1 text-xs" />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input value={it.note} onChange={(e) => update(it.id, { note: e.target.value })} placeholder={it.type === "in" ? "Nguồn tiền…" : "Chi cho việc gì…"} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                    {it.type !== "in" && (
                      <select value={it.cat || ""} onChange={(e) => update(it.id, { cat: e.target.value })} className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-1 text-[11px]">
                        <option value="">— DM —</option>
                        {(cats || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <button aria-label="Xoá" title="Xoá" onClick={() => remove(it.id)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          {valid.length > 0 && !reading && (
            <div className="mb-2 flex items-center justify-center gap-3 text-[11px] font-bold">
              {nIn > 0 && <span className="text-emerald-600">Nạp {nIn} · +{formatShort(inTotal)}</span>}
              {nOut > 0 && <span className="text-rose-600">Chi {nOut} · −{formatShort(outTotal)}</span>}
            </div>
          )}
          <button
            disabled={!valid.length || reading}
            onClick={() => { onSave(valid.map((it) => ({ fundId: fund.id, amount: num(it.amount), date: it.date, type: it.type === "in" ? "in" : "out", note: (it.note || "").trim() || (it.type === "in" ? "Nạp (từ ảnh)" : "Chi (từ ảnh)"), ...(it.type === "in" ? {} : { cat: it.cat || "" }) }))); onClose(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40"
          >
            {reading ? <><Loader2 size={16} className="animate-spin" /> Đang đọc ảnh…</> : <>Ghi {valid.length || ""} giao dịch</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Chi tiết 1 quỹ + lịch sử giao dịch riêng ---- */
