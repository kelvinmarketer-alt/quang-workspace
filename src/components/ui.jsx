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

export function StatCard({ icon: Icon, label, value, sub, tone = "indigo", money = true }) {
  return (
    <div className="card fade-up p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[12px]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">
            {money ? (
              <>
                <span className="sm:hidden">{formatShort(value)}</span>
                <span className="hidden break-words sm:inline">{formatVND(value)}</span>
              </>
            ) : value}
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

export function EmptyState({ title, sub }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-12 text-center">
      <div className="text-sm font-bold text-slate-700">{title}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// Ô nhập tiền: hiển thị có dấu chấm (6.000.000), trả về chuỗi số thuần qua onChange(rawDigits)
export function MoneyInput({ value, onChange, className = "", placeholder, autoFocus }) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  const display = digits ? Number(digits).toLocaleString("vi-VN") : "";
  return (
    <input
      className={className}
      placeholder={placeholder}
      inputMode="numeric"
      autoFocus={autoFocus}
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
    />
  );
}

export { formatVND, formatShort };
