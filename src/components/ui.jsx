import { useLayoutEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatVND, formatShort } from "../lib/format.js";

export function Card({ className = "", children }) {
  return <div className={`card p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-extrabold tracking-tight text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  indigo: "from-indigo-500 to-violet-500 shadow-indigo-500/30",
  sky: "from-sky-500 to-cyan-500 shadow-sky-500/30",
  emerald: "from-emerald-500 to-teal-500 shadow-emerald-500/30",
  amber: "from-amber-500 to-orange-500 shadow-amber-500/30",
  rose: "from-rose-500 to-pink-500 shadow-rose-500/30",
};

// Số tiền tự vừa ô: đủ chỗ thì hiện đầy đủ "886.003.879 đ", hẹp (điện thoại, iPad, laptop nhỏ) thì tự rút gọn "886 tr" —
// KHÔNG BAO GIỜ ngắt dòng giữa con số. Rê chuột / giữ ngón tay để xem số đầy đủ.
export function FitMoney({ value, className = "" }) {
  const box = useRef(null), full = useRef(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const b = box.current, f = full.current; if (!b || !f) return undefined;
    const check = () => setShort(f.offsetWidth > b.clientWidth + 1); // f là inline-block → đo được bề rộng thật của số đầy đủ
    check();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(check); ro.observe(b); return () => ro.disconnect();
  }, [value]);
  return (
    <span ref={box} className={`relative block min-w-0 overflow-hidden whitespace-nowrap ${className}`} title={formatVND(value)}>
      <span ref={full} className={`inline-block ${short ? "invisible absolute left-0 top-0" : ""}`} aria-hidden={short}>{formatVND(value)}</span>
      {short && <span>{formatShort(value)}</span>}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = "indigo", money = true }) {
  return (
    <div className="card fade-up p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[12px]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">
            {money ? <FitMoney value={value} /> : value}
          </div>
          {sub && <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400 sm:mt-1 sm:text-[12px]">{sub}</div>}
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg sm:h-11 sm:w-11 ${TONES[tone]}`}>
          <Icon size={16} className="sm:hidden" /><Icon size={20} className="hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const map = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
    pink: "bg-pink-100 text-pink-700",
    teal: "bg-teal-100 text-teal-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${map[tone]}`}>
      {children}
    </span>
  );
}

// Ô nhập tiền: hiển thị có dấu chấm (6.000.000), trả về chuỗi số thuần qua onChange(rawDigits)
// Ô chọn NGÀY gọn: hiển thị "dd/mm/yy", bấm mở lịch native. value/onChange dùng ISO yyyy-mm-dd.
export function DateField({ value, onChange, className = "", placeholder = "Chọn ngày" }) {
  const short = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? (() => { const [y, m, d] = value.split("-"); return `${d}/${m}/${y.slice(2)}`; })()
    : placeholder;
  const ref = useRef(null);
  // Bấm BẤT KỲ đâu trong ô → mở lịch (Chrome/Edge desktop mặc định chỉ mở khi bấm trúng icon lịch)
  const open = (e) => { try { ref.current?.showPicker?.(); e?.preventDefault?.(); } catch { /* trình duyệt cũ: để mặc định */ } };
  return (
    <div className={`relative flex cursor-pointer items-center justify-between gap-2 ${className}`}>
      <span className={value ? "" : "text-slate-400"}>{short}</span>
      <CalendarDays size={14} className="shrink-0 text-slate-400" />
      <input ref={ref} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Chọn ngày" />
    </div>
  );
}

// Hậu tố tiền gõ tắt: 500k · 5tr · 1,5tr · 2 tỷ · 3m · 1b
const MONEY_SUFFIX = { k: 1e3, nghin: 1e3, ngan: 1e3, tr: 1e6, trieu: 1e6, m: 1e6, ty: 1e9, ti: 1e9, b: 1e9 };
const plainVi = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
// "1,5tr" → { done: 1500000 } · "1,5t" (đang gõ dở hậu tố) → { partial: true } · không có hậu tố → null
function parseMoneyExpr(raw) {
  const m = String(raw).match(/^\s*([\d.,\s]*\d[\d.,\s]*?)\s*([^\d\s.,]+)\s*$/u);
  if (!m) return null;
  const suf = plainVi(m[2]);
  if (MONEY_SUFFIX[suf] == null) return Object.keys(MONEY_SUFFIX).some((k) => k.startsWith(suf)) ? { partial: true } : null;
  let num = m[1].replace(/\s/g, "");
  // phẩy = thập phân; chấm + đúng 3 số = phân cách nghìn, chấm còn lại = thập phân ("1.5tr")
  if (num.includes(",")) num = num.replace(/\./g, "").replace(",", ".").replace(/,/g, "");
  else if (/\.\d{3}(?!\d)/.test(num) && !/\.\d{1,2}$/.test(num)) num = num.replace(/\./g, "");
  const x = parseFloat(num);
  return Number.isFinite(x) ? { done: Math.round(x * MONEY_SUFFIX[suf]) } : null;
}
const digitsBefore = (str, pos) => (str.slice(0, pos).match(/\d/g) || []).length;

// Giữ nguyên API: value = chuỗi/số, onChange(chuỗi số thuần). Giữ vị trí con trỏ khi tự thêm dấu chấm,
// hiểu hậu tố k/tr/triệu/m/tỷ/b (kể cả "1,5tr"); xoá trúng dấu chấm → xoá luôn chữ số cạnh nó.
export function MoneyInput({ value, onChange, className = "", placeholder, autoFocus }) {
  const ref = useRef(null), caret = useRef(null);
  const [draft, setDraft] = useState(null); // {text, emit}: đang gõ dở "1,5" / "2 t" → hiện nguyên văn
  const [, bump] = useState(0);
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  const fmt = (d) => (d ? Number(d).toLocaleString("vi-VN") : "");
  const display = draft && draft.emit === digits ? draft.text : fmt(digits);
  useLayoutEffect(() => {
    const el = ref.current, want = caret.current;
    caret.current = null;
    if (!el || want == null || document.activeElement !== el) return;
    let pos = 0, seen = 0;
    if (want === "end") pos = el.value.length;
    else while (pos < el.value.length && seen < want) { if (/\d/.test(el.value[pos])) seen++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch { /* input không hỗ trợ selection */ }
  });
  const emit = (d) => { onChange(d); bump((x) => x + 1); };
  const handle = (e) => {
    const raw = e.target.value, sel = e.target.selectionStart ?? raw.length;
    const ex = parseMoneyExpr(raw);
    if (ex?.done != null) { setDraft(null); caret.current = "end"; return emit(String(ex.done)); }
    let d = raw.replace(/[^\d]/g, "");
    // Gõ dở: hậu tố chưa đủ chữ ("2 t"), hoặc vừa gõ phẩy/chấm thập phân ("1," "1,5" "1.") → giữ nguyên văn
    if (ex?.partial || /,/.test(raw) || /\.$/.test(raw) || (draft && /\.\d{0,2}$/.test(raw) && !/[^\d.,\s]/.test(raw))) {
      setDraft({ text: raw, emit: d }); caret.current = null; return emit(d); // tạm lưu số thuần cho tới khi đủ hậu tố
    }
    setDraft(null);
    let keep = digitsBefore(raw, sel);
    // Xoá trúng dấu chấm phân cách (số không đổi) → xoá chữ số liền kề
    if (d === digits && raw.length < display.length) {
      const t = e.nativeEvent?.inputType;
      if (t === "deleteContentBackward" && keep > 0) { d = d.slice(0, keep - 1) + d.slice(keep); keep -= 1; }
      else if (t === "deleteContentForward") d = d.slice(0, keep) + d.slice(keep + 1);
    }
    const lead = d.length - String(Number(d || 0)).length; // số 0 đầu bị bỏ khi định dạng
    caret.current = Math.max(0, keep - (d && lead > 0 ? lead : 0));
    emit(d);
  };
  return (
    <input
      ref={ref}
      className={className}
      placeholder={placeholder}
      inputMode="numeric"
      autoFocus={autoFocus}
      value={display}
      onChange={handle}
      onBlur={() => setDraft(null)}
    />
  );
}

export { formatVND, formatShort };
