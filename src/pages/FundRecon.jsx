// 11/11: Đối soát cuối tháng — tóm tắt tiền vào / ra, số dư quỹ đầu & cuối tháng, cảnh báo lệch + checklist chốt sổ.
// Checklist lưu ở settings.monthClose[yyyy-mm] (đồng bộ cùng dữ liệu app, chỉ chủ tick được).
import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, CheckSquare, Square, ArrowDownToLine, ArrowUpFromLine, Sparkles } from "lucide-react";
import { Card, Badge, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { todayISO, fmtDateVI } from "../lib/format.js";
import { monthRecon, reconMonths, monthName, monthKeyOf, shiftMonth, CLOSE_CHECKS } from "../lib/ketoanMonthly.js";

const TONE_BG = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500", violet: "bg-violet-500", teal: "bg-teal-500", pink: "bg-pink-500" };
const LEVEL = {
  error: ["bg-rose-50 text-rose-700", AlertTriangle],
  warn: ["bg-amber-50 text-amber-700", AlertCircle],
  info: ["bg-slate-50 text-slate-600", Info],
};

export default function FundRecon() {
  const { projects, expenses, funds, fundTx, settings, setSettings, isOwner, setToast } = useData();
  const today = todayISO();
  const months = useMemo(() => reconMonths(projects, fundTx, today), [projects, fundTx, today]);
  // Mặc định: tháng TRƯỚC (đầu tháng mới thường chốt sổ tháng cũ); app mới chỉ có tháng này thì lấy tháng này
  const [month, setMonth] = useState(() => { const prev = shiftMonth(monthKeyOf(today), -1); return months.includes(prev) ? prev : months[0]; });
  const r = useMemo(() => monthRecon({ projects, expenses, funds: funds || [], fundTx: fundTx || [], month, today }), [projects, expenses, funds, fundTx, month, today]);

  const close = (settings?.monthClose || {})[month] || {};
  const done = close.done || {};
  const doneN = CLOSE_CHECKS.filter(([k]) => done[k]).length;
  const allDone = doneN === CLOSE_CHECKS.length;
  const canTick = !!isOwner && typeof setSettings === "function";
  const tick = (k) => {
    if (!canTick) { setToast?.({ text: "Chỉ chủ tài khoản tick chốt sổ được", at: Date.now() }); return; }
    const nextDone = { ...done, [k]: !done[k] };
    const full = CLOSE_CHECKS.every(([x]) => nextDone[x]);
    setSettings({ monthClose: { ...(settings?.monthClose || {}), [month]: { done: nextDone, at: full ? new Date().toISOString() : null } } });
    if (full) setToast?.({ text: `Đã chốt sổ ${monthName(month)}`, at: Date.now() });
  };
  const errors = r.issues.filter((x) => x.level === "error").length;
  const warns = r.issues.filter((x) => x.level === "warn").length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            {months.map((m) => <option key={m} value={m}>Tháng {monthName(m).slice(1)}{(settings?.monthClose || {})[m]?.at ? " ✓" : ""}</option>)}
          </select>
          <div className="min-w-0 text-xs text-slate-400">{fmtDateVI(r.from)} → {fmtDateVI(r.to)}</div>
          <span className="ml-auto">{allDone ? <Badge tone="emerald">Đã chốt sổ</Badge> : <Badge tone="slate">{doneN}/{CLOSE_CHECKS.length} việc</Badge>}</span>
        </div>
        <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-bold ${errors ? "bg-rose-50 text-rose-700" : warns ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {errors ? `Có ${errors} chỗ lệch cần sửa` : warns ? `Có ${warns} điểm cần xem lại` : "Số liệu khớp — không thấy lệch"}
        </div>
      </Card>

      {/* Tiền vào / ra */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="card min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-emerald-600"><ArrowDownToLine size={13} /> Tiền vào</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 sm:text-2xl">{formatShort(r.moneyIn.total)}</div>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
            <div className="flex justify-between gap-2"><span>Thu nhập (lương)</span><b className="text-slate-600">{formatShort(r.moneyIn.grossProfit)}</b></div>
            <div className="flex justify-between gap-2"><span>Nạp tay vào quỹ</span><b className="text-slate-600">{formatShort(r.moneyIn.manualIn)}</b></div>
          </div>
        </div>
        <div className="card min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-rose-600"><ArrowUpFromLine size={13} /> Tiền ra</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 sm:text-2xl">{formatShort(r.moneyOut.total)}</div>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
            <div className="flex justify-between gap-2"><span>Chi vận hành</span><b className="text-slate-600">{formatShort(r.moneyOut.opex)}</b></div>
            <div className="flex justify-between gap-2"><span>Chi từ quỹ</span><b className="text-slate-600">{formatShort(r.moneyOut.spends)}</b></div>
          </div>
        </div>
      </div>
      <div className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:p-5">
        {[["Công nợ cuối tháng", r.debt, r.debt > 0 ? "text-rose-600" : "text-slate-800"], ["Lãi tháng (sau CP)", r.net, r.net < 0 ? "text-rose-600" : "text-emerald-600"], ["Đã chia ra quỹ", r.allocated, "text-slate-800"], ["Thu nợ trong tháng", r.collectedPays, "text-sky-600"]].map(([l, v, c]) => (
          <div key={l} className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase text-slate-400">{l}</div>
            <div className={`break-words text-base font-extrabold ${c}`}>{formatShort(v)}</div>
          </div>
        ))}
      </div>

      {/* Số dư quỹ đầu / cuối tháng */}
      {r.funds.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="p-4 pb-2 sm:p-5 sm:pb-2">
            <h2 className="text-base font-extrabold text-slate-900">Số dư quỹ</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Đầu tháng → cuối tháng{r.to !== r.from && r.to === today ? " (tới hôm nay)" : ""}</p>
          </div>
          <div className="divide-y divide-slate-50">
            {r.funds.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 px-4 py-2.5 sm:px-5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.role === "company" ? "bg-slate-800" : TONE_BG[f.color] || "bg-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-700">{f.name}{f.role === "company" ? " (công ty)" : ""}</div>
                  <div className="text-[11px] text-slate-400">{formatShort(f.start)} → <b className={f.end < 0 ? "text-rose-600" : "text-slate-600"}>{formatShort(f.end)}</b></div>
                </div>
                <span className={`shrink-0 text-sm font-extrabold tabular-nums ${f.change > 0 ? "text-emerald-600" : f.change < 0 ? "text-rose-600" : "text-slate-300"}`}>{f.change > 0 ? "+" : f.change < 0 ? "−" : ""}{formatShort(Math.abs(f.change))}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 sm:px-5">Quỹ công ty = thu nhập (lương) − chi vận hành − phần đã chia/chi (không trừ công nợ chưa thu).</div>
        </Card>
      )}

      {/* Cảnh báo */}
      <Card>
        <h2 className="mb-2 text-base font-extrabold text-slate-900">Cảnh báo</h2>
        {r.issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Không có gì cần xử lý</div>
        ) : (
          <div className="space-y-1.5">
            {r.issues.map((x) => { const [cls, Ic] = LEVEL[x.level] || LEVEL.info; return (
              <div key={x.key} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${cls}`}><Ic size={15} className="mt-0.5 shrink-0" /><span className="min-w-0">{x.text}</span></div>
            ); })}
          </div>
        )}
      </Card>

      {/* Checklist chốt sổ */}
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-slate-900">Việc chốt sổ {monthName(month)}</h2>
          {close.at && <span className="text-[11px] text-slate-400">chốt {fmtDateVI(close.at.slice(0, 10))}</span>}
        </div>
        <div className="space-y-1">
          {CLOSE_CHECKS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => tick(k)} disabled={!canTick} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default">
              {done[k] ? <CheckSquare size={19} className="shrink-0 text-emerald-600" /> : <Square size={19} className="shrink-0 text-slate-300" />}
              <span className={`text-sm font-semibold ${done[k] ? "text-slate-400 line-through" : "text-slate-700"}`}>{label}</span>
            </button>
          ))}
        </div>
        {!canTick && <div className="mt-2 text-[11px] text-slate-400">Chỉ chủ tài khoản tick được.</div>}
        {allDone && <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700"><Sparkles size={14} /> Đã chốt xong {monthName(month)}</div>}
      </Card>

      <div className="px-3 text-[11px] leading-relaxed text-slate-400 sm:px-0">Tiền vào = thu nhập (lương) của các đợt trong tháng + nạp tay vào quỹ. Tiền ra = chi vận hành + chi thật từ quỹ. Chuyển và phân bổ giữa các quỹ là tiền nội bộ nên không tính vào/ra.</div>
    </div>
  );
}
