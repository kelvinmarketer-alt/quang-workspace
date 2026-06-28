import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

/**
 * Ô chọn có tìm kiếm + gợi ý.
 * options: [{value, label, sub?}]  value(selected) -> onChange(value)
 */
export default function Combobox({ options, value, onChange, placeholder = "Tìm & chọn…", emptyText = "Không tìm thấy" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    if (!lq) return options.slice(0, 50);
    return options.filter((o) => (o.label + " " + (o.sub || "")).toLowerCase().includes(lq)).slice(0, 50);
  }, [q, options]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm">
        <span className={selected ? "text-slate-800" : "text-slate-400"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-50 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ để tìm…" className="w-full text-sm outline-none" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-3 text-sm text-slate-400">{emptyText}</div>}
            {filtered.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-700">{o.label}</span>
                  {o.sub && <span className="block text-[11px] text-slate-400">{o.sub}</span>}
                </span>
                {o.value === value && <Check size={15} className="text-indigo-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
