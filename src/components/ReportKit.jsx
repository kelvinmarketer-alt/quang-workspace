// Bộ khung module báo cáo (01/11 sếp duyệt demo "QWS Báo cáo Pro"): mỗi module 3 tầng
// 1) AnswerCard: 1 câu kết luận · 2) Leaderboard: xếp hạng thanh ngang (thay lưới thẻ) · 3) SideDrawer: chi tiết trượt từ phải.
// Hiệu ứng (thanh mọc, hàng trượt vào, số chạy) do lib/motion.js + index.css lo — chỉ cần class bar-x / divide-y.
import { useEffect } from "react";
import { X, TrendingUp, TrendingDown, LayoutList, LayoutGrid } from "lucide-react";

const FILL = { g: "bg-gradient-to-r from-emerald-400/70 to-emerald-500", w: "bg-gradient-to-r from-amber-300/70 to-amber-400", b: "bg-gradient-to-r from-rose-400/70 to-rose-500", a: "bg-gradient-to-r from-sky-400 to-indigo-500", n: "bg-slate-300" };

export function AnswerCard({ eyebrow, title, desc, live, right }) {
  return (
    <div className="qws-answer card relative overflow-hidden !p-4 sm:!p-5">
      <div className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          {eyebrow && <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{eyebrow}</div>}
          <h2 className="mt-0.5 text-[18px] font-extrabold leading-snug tracking-tight text-slate-900 sm:text-[21px]" style={{ textWrap: "balance" }}>{title}</h2>
          {desc && <p className="mt-1 max-w-3xl text-[13px] text-slate-500">{desc}</p>}
        </div>
        {right}
        {live && <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-bold text-emerald-600"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>{live}</span>}
      </div>
    </div>
  );
}

export function DeltaChip({ d, good }) {
  if (d == null || !isFinite(d)) return <span className="w-14 shrink-0" />;
  if (Math.abs(d) < 0.5) return <span className="w-14 shrink-0 text-right text-[11px] font-bold text-slate-400">0%</span>;
  const up = d > 0, ok = good == null ? up : good;
  const I = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex w-14 shrink-0 items-center justify-end gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}><I size={11} />{Math.abs(d) >= 999 ? "999+" : Math.round(Math.abs(d))}%</span>;
}

// rows: [{ key, name, sub, value, text, tone: g|w|b|a|n, delta, deltaGood, icon, mark (0..1 mốc) }]
export function Leaderboard({ title, hint, rows, onPick, empty = "Chưa có số trong kỳ này", loading, max: maxIn }) {
  const max = maxIn || Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div className="card !p-3 sm:!p-4">
      {(title || hint) && <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1"><h3 className="text-[15px] font-extrabold text-slate-800">{title}</h3>{hint && <span className="text-[11.5px] text-slate-400">{hint}</span>}</div>}
      {loading && !rows.length ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-slate-50" />)}</div>
        : !rows.length ? <div className="px-1 py-4 text-[13px] text-slate-400">{empty}</div>
        : (
        <div className="divide-y divide-slate-50">
          {rows.map((r, i) => (
            <button key={r.key} type="button" onClick={() => onPick?.(r)} className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-xl px-1.5 py-2 text-left transition hover:bg-slate-50 sm:grid-cols-[22px_minmax(0,1.1fr)_minmax(0,1.6fr)_auto]">
              <span className="text-[12px] font-bold tabular-nums text-slate-400">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                {r.icon}
                <span className="min-w-0"><span className="block truncate text-[13px] font-bold text-slate-800">{r.name}</span>{r.sub && <span className="block truncate text-[11px] text-slate-400">{r.sub}</span>}</span>
              </span>
              <span className="relative col-span-2 col-start-2 row-start-2 h-2 rounded-full bg-slate-100 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <span className={`bar-x absolute inset-y-0 left-0 rounded-full ${FILL[r.tone] || FILL.a}`} style={{ width: `${Math.max(2, ((r.value || 0) / max) * 100)}%` }} />
                {r.mark != null && <span title="Mốc" className="absolute -inset-y-1 w-0.5 rounded bg-slate-500/60" style={{ left: `${Math.min(100, r.mark * 100)}%` }} />}
              </span>
              <span className="flex items-center justify-end gap-2"><span className="text-[13px] font-extrabold tabular-nums text-slate-800">{r.text}</span><DeltaChip d={r.delta} good={r.deltaGood} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ViewToggle({ value, onChange }) {
  const B = ({ v, I, l }) => <button type="button" onClick={() => onChange(v)} aria-pressed={value === v} title={l} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${value === v ? "tab-active bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><I size={13} />{l}</button>;
  return <span className="inline-flex gap-0.5 rounded-full bg-white p-0.5 ring-1 ring-slate-100"><B v="rank" I={LayoutList} l="Xếp hạng" /><B v="cards" I={LayoutGrid} l="Thẻ" /></span>;
}

// Ngăn chi tiết trượt từ phải — trang danh sách phía sau giữ nguyên vị trí cuộn
export function SideDrawer({ onClose, children, label = "Chi tiết" }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = o; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={label}>
      <div className="qws-scrim absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="qws-drawer bento absolute inset-y-0 right-0 flex w-full max-w-[min(920px,100%)] flex-col overflow-y-auto bg-slate-50 shadow-2xl" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-500 shadow ring-1 ring-slate-100 hover:text-slate-900" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}><X size={18} /></button>
        <div className="space-y-4 p-3 pt-14 sm:p-5 sm:pt-14">{children}</div>
      </div>
    </div>
  );
}

// Nhớ cách xem (xếp hạng / thẻ) theo máy
export const loadView = (k) => { try { return localStorage.getItem(k) || "rank"; } catch { return "rank"; } };
export const saveView = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };
