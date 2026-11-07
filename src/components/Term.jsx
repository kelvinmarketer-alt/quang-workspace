import { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import InfoTip from "./InfoTip.jsx";
import { GLOSSARY } from "../lib/glossary.js";

// Nhãn tiếng Việt + nút ⓘ giải thích (08/11). children: chữ hiện thay cho nhãn mặc định
export function Term({ k, children, align = "left", className = "" }) {
  const g = GLOSSARY[k]; if (!g) return children ?? k;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {children ?? g.vi}
      <InfoTip align={align} label={`Giải thích: ${g.vi}`}><b className="text-slate-800">{g.vi}</b>{g.en ? <span className="text-slate-400"> · {g.en}</span> : null}<br />{g.d}</InfoTip>
    </span>
  );
}
// Chỉ nút ⓘ (dùng trong nút bấm / chỗ chật)
export function TermTip({ k, align = "left" }) {
  const g = GLOSSARY[k]; if (!g) return null;
  return <InfoTip align={align} label={`Giải thích: ${g.vi}`}><b className="text-slate-800">{g.vi}</b>{g.en ? <span className="text-slate-400"> · {g.en}</span> : null}<br />{g.d}</InfoTip>;
}
// Nút "Từ điển ký hiệu": mở bảng giải thích tất cả (hoặc một nhóm) ký hiệu
export function GlossaryButton({ keys, label = "Giải thích ký hiệu", className = "" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return undefined; const esc = (e) => e.key === "Escape" && setOpen(false); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [open]);
  const list = (keys || Object.keys(GLOSSARY)).filter((k) => GLOSSARY[k]);
  return (<>
    <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-indigo-500 hover:bg-indigo-50 ${className}`}><BookOpen size={11} />{label}</button>
    {open && (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div role="dialog" aria-label="Từ điển ký hiệu" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-2 flex items-center gap-2"><BookOpen size={16} className="text-indigo-500" /><b className="text-[15px] text-slate-800">Từ điển ký hiệu</b><button onClick={() => setOpen(false)} aria-label="Đóng" className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
          <div className="divide-y divide-slate-100">{list.map((k) => { const g = GLOSSARY[k]; return (
            <div key={k} className="py-2 text-[12.5px] leading-snug"><b className="text-slate-800">{g.vi}</b>{g.en ? <span className="ml-1 text-[11px] font-semibold text-slate-400">{g.en}</span> : null}<div className="mt-0.5 text-slate-600">{g.d}</div></div>
          ); })}</div>
        </div>
      </div>
    )}
  </>);
}
