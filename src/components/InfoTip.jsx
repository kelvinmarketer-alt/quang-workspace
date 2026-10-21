import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// Nút ⓘ: bấm (hoặc chạm trên điện thoại) mới hiện phần giải thích — thay cho đoạn chữ dài luôn hiện.
// align: "left" | "right" | "center" — phía mở của khung so với nút.
export default function InfoTip({ children, align = "left", label = "Giải thích" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const pos = align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";
  return (
    <span ref={ref} className="relative inline-flex align-middle normal-case tracking-normal">
      <button type="button" aria-label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className={`grid h-5 w-5 place-items-center rounded-full transition ${open ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}>
        <Info size={13} />
      </button>
      {open && (
        <span role="tooltip" className={`absolute top-6 z-40 w-[min(300px,80vw)] rounded-xl border border-slate-200 bg-white p-2.5 text-left text-[12px] font-normal leading-snug text-slate-600 shadow-xl ${pos}`}>
          {children}
        </span>
      )}
    </span>
  );
}
