// Hộp "Tuỳ chỉnh Tổng quan": bật/tắt từng ô + mũi tên lên/xuống đổi thứ tự (11/11)
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, X, Eye, EyeOff, RotateCcw } from "lucide-react";
import { DASH_BLOCKS, normalizeLayout, moveBlock, toggleBlock, isDefaultLayout, PHONE_FIRST } from "../lib/dashLayout.js";

export default function DashLayoutDialog({ layout, avail, labels = {}, onSave, onClose }) {
  const [l, setL] = useState(() => normalizeLayout(layout));
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const list = l.order.filter((id) => avail.includes(id)).map((id) => ({ ...DASH_BLOCKS.find((b) => b.id === id), ...(labels[id] || {}) }));
  let shownIdx = 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Tuỳ chỉnh Tổng quan">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
          <div className="min-w-0"><div className="text-[15px] font-extrabold text-slate-800">Tuỳ chỉnh Tổng quan</div>
            <div className="mt-0.5 text-[12px] text-slate-500">Tắt ô không cần, đưa ô hay xem lên đầu. Điện thoại hiện ngay {PHONE_FIRST} ô đầu.</div></div>
          <button onClick={onClose} aria-label="Đóng" className="-m-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {list.map((b, i) => {
            const off = l.hidden.includes(b.id);
            const pos = off ? null : ++shownIdx;
            return (
              <div key={b.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ring-1 ${off ? "bg-slate-50 ring-slate-100" : "bg-white ring-slate-200"}`}>
                <button onClick={() => setL((x) => toggleBlock(x, b.id))} role="switch" aria-checked={!off} aria-label={`${off ? "Hiện" : "Ẩn"} ${b.label}`}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${off ? "bg-slate-100 text-slate-400" : "bg-indigo-50 text-indigo-600"}`}>{off ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-bold ${off ? "text-slate-400 line-through" : "text-slate-800"}`}>{b.label}</div>
                  <div className="truncate text-[11px] text-slate-400">{off ? "Đang ẩn" : pos > PHONE_FIRST ? `${b.hint} · điện thoại: trong "Xem thêm"` : b.hint}</div>
                </div>
                <button disabled={i === 0} onClick={() => setL((x) => moveBlock(x, b.id, -1, avail))} aria-label={`Đưa ${b.label} lên`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                <button disabled={i === list.length - 1} onClick={() => setL((x) => moveBlock(x, b.id, 1, avail))} aria-label={`Đưa ${b.label} xuống`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
          <button disabled={isDefaultLayout(l)} onClick={() => setL(normalizeLayout(null))} className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-[13px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"><RotateCcw size={14} /> Mặc định</button>
          <div className="flex flex-1 gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Huỷ</button>
            <button onClick={() => onSave(l)} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white">Lưu</button>
          </div>
        </div>
      </div>
    </div>
  );
}
