import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Wallet, TrendingUp, HandCoins, Receipt, ArrowUp, ArrowDown, Calendar, BarChart3, CreditCard } from "lucide-react";
import { Card, StatCard, SectionTitle, Badge, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { installmentsInRange, sumInstallments, monthlySeriesInRange, expensesInRange } from "../lib/selectors.js";
import { fmtDateVI } from "../lib/format.js";
import Expenses from "./Expenses.jsx";

const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", Khác: "slate" };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PRESETS = [
  ["thisMonth", "Tháng này"], ["lastMonth", "Tháng trước"], ["thisQuarter", "Quý này"],
  ["thisYear", "Năm nay"], ["lastYear", "Năm trước"], ["custom", "Tùy chọn"],
];

function periodFor(preset, cf, ct) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "thisMonth": return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "lastMonth": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "thisQuarter": { const q = Math.floor(m / 3); return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }; }
    case "thisYear": return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "lastYear": return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case "custom": return { from: cf, to: ct };
    default: return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
}
function prevPeriod(preset, from, to) {
  const f = new Date(from), t = new Date(to);
  if (preset === "thisMonth" || preset === "lastMonth") return { from: iso(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: iso(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (preset === "thisQuarter") return { from: iso(new Date(f.getFullYear(), f.getMonth() - 3, 1)), to: iso(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (preset === "thisYear" || preset === "lastYear") return { from: iso(new Date(f.getFullYear() - 1, 0, 1)), to: iso(new Date(f.getFullYear() - 1, 11, 31)) };
  const days = Math.round((t - f) / 86400000) + 1;
  const pt = new Date(f.getTime() - 86400000), pf = new Date(pt.getTime() - (days - 1) * 86400000);
  return { from: iso(pf), to: iso(pt) };
}

function Delta({ cur, prev }) {
  if (prev === 0) return cur > 0 ? <span className="text-[11px] font-bold text-emerald-600">mới</span> : null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(pct)}%
    </span>
  );
}

function CompareCard({ icon: Icon, label, value, prev, tone, compare }) {
  const TONES = { indigo: "from-indigo-500 to-violet-500 shadow-indigo-500/30", emerald: "from-emerald-500 to-teal-500 shadow-emerald-500/30", sky: "from-sky-500 to-cyan-500 shadow-sky-500/30", rose: "from-rose-500 to-pink-500 shadow-rose-500/30" };
  return (
    <div className="card p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[12px]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">
            <span className="sm:hidden">{formatShort(value)}</span>
            <span className="hidden break-words sm:inline">{formatVND(value)}</span>
          </div>
          {compare && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"><Delta cur={value} prev={prev} /><span className="text-[11px] text-slate-400">kỳ trước {formatShort(prev)}</span></div>}
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg sm:h-11 sm:w-11 ${TONES[tone]}`}><Icon size={16} className="sm:hidden" /><Icon size={20} className="hidden sm:block" /></div>
      </div>
    </div>
  );
}

function KetoanReport() {
  const { projects, expenses } = useData();
  const [preset, setPreset] = useState("thisYear");
  const now = new Date();
  const [cf, setCf] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [ct, setCt] = useState(iso(now));
  const [compare, setCompare] = useState(true);

  const { from, to } = periodFor(preset, cf, ct);
  const prev = prevPeriod(preset, from, to);

  const list = useMemo(() => installmentsInRange(projects, from, to), [projects, from, to]);
  const cur = useMemo(() => sumInstallments(list), [list]);
  const prevSum = useMemo(() => sumInstallments(installmentsInRange(projects, prev.from, prev.to)), [projects, prev.from, prev.to]);
  const series = useMemo(() => monthlySeriesInRange(projects, from, to).map((m) => ({ name: "Th" + m.key.slice(5), dt: m.revenue, ln: m.grossProfit })), [projects, from, to]);
  const opCost = useMemo(() => expensesInRange(expenses, from, to), [expenses, from, to]);
  const prevOpCost = useMemo(() => expensesInRange(expenses, prev.from, prev.to).total, [expenses, prev.from, prev.to]);
  const netProfit = cur.grossProfit - opCost.total;
  const prevNet = prevSum.grossProfit - prevOpCost;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Bộ lọc kỳ */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* MOBILE: dropdown kỳ */}
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold sm:hidden">
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {/* DESKTOP: chips kỳ */}
          <div className="hidden flex-wrap gap-1 rounded-xl bg-slate-100 p-1 sm:flex">
            {PRESETS.map(([v, l]) => (
              <button key={v} onClick={() => setPreset(v)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${preset === v ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:flex-none" />
              <span className="text-slate-400">→</span>
              <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:flex-none" />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 sm:ml-auto">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 rounded accent-indigo-600" />
            So sánh kỳ trước
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <Calendar size={13} /> {fmtDateVI(from)} → {fmtDateVI(to)}
          {compare && <span>· so với {fmtDateVI(prev.from)} → {fmtDateVI(prev.to)}</span>}
        </div>
      </Card>

      {/* Thẻ chỉ số chính (có so sánh) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <CompareCard icon={Wallet} label="Doanh thu" value={cur.revenue} prev={prevSum.revenue} tone="indigo" compare={compare} />
        <CompareCard icon={TrendingUp} label="Lợi nhuận gộp" value={cur.grossProfit} prev={prevSum.grossProfit} tone="emerald" compare={compare} />
        <CompareCard icon={HandCoins} label="Đã thu" value={cur.collected} prev={prevSum.collected} tone="sky" compare={compare} />
        <CompareCard icon={Receipt} label="Công nợ" value={cur.debt} prev={prevSum.debt} tone="rose" compare={compare} />
      </div>

      {/* Lợi nhuận RÒNG = LN gộp − chi phí vận hành công ty */}
      <Card className="!p-0 overflow-hidden">
        {/* MOBILE: 3 dòng gọn */}
        <div className="divide-y divide-slate-100 sm:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase text-slate-400">Lợi nhuận gộp (job)</span>
            <span className="font-extrabold text-emerald-600">{formatShort(cur.grossProfit)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase text-slate-400">− Chi phí vận hành <span className="font-normal normal-case">({opCost.items.length})</span></span>
            <span className="font-extrabold text-rose-500">{formatShort(opCost.total)}</span>
          </div>
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-3 text-white">
            <span className="text-[11px] font-bold uppercase text-indigo-100">= Lợi nhuận ròng</span>
            <span className="flex items-center gap-2 text-lg font-extrabold">{compare && <Delta cur={netProfit} prev={prevNet} />}{formatShort(netProfit)}</span>
          </div>
        </div>
        {/* DESKTOP: ngang */}
        <div className="hidden items-stretch sm:grid sm:grid-cols-[1fr_auto_1fr_auto_1.2fr]">
          <div className="p-5">
            <div className="text-[11px] font-bold uppercase text-slate-400">Lợi nhuận gộp (từ job)</div>
            <div className="mt-1 text-xl font-extrabold text-emerald-600">{formatVND(cur.grossProfit)}</div>
          </div>
          <div className="grid place-items-center px-2 text-2xl font-bold text-slate-300">−</div>
          <div className="p-5">
            <div className="text-[11px] font-bold uppercase text-slate-400">Chi phí vận hành</div>
            <div className="mt-1 text-xl font-extrabold text-rose-500">{formatVND(opCost.total)}</div>
            <div className="text-[11px] text-slate-400">{opCost.items.length} khoản trong kỳ</div>
          </div>
          <div className="grid place-items-center px-2 text-2xl font-bold text-slate-300">=</div>
          <div className="bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white">
            <div className="text-[11px] font-bold uppercase text-indigo-100">Lợi nhuận ròng</div>
            <div className="mt-1 text-2xl font-extrabold">{formatVND(netProfit)}</div>
            {compare && <div className="mt-0.5"><Delta cur={netProfit} prev={prevNet} /></div>}
          </div>
        </div>
      </Card>

      {/* Chỉ số phụ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Số tiền nhận", cur.received], ["Chiết khấu nền tảng", cur.discount], ["Phí chạy (ADS)", cur.serviceFee], ["Tiền chạy thực tế", cur.spend]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-400">{l}</div>
            <div className="text-base font-extrabold text-slate-800">{formatVND(v)}</div>
          </div>
        ))}
      </div>

      {/* Biểu đồ theo tháng trong kỳ */}
      {series.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">Doanh thu / LN gộp theo tháng</span>}>Diễn biến trong kỳ</SectionTitle>
          <div className="overflow-x-auto">
           <div className="h-56 min-w-[560px] sm:min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, k) => [formatVND(v), k === "dt" ? "Doanh thu" : "LN gộp"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="dt" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="ln" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
           </div>
          </div>
        </Card>
      )}

      {/* Bảng chi tiết các phiếu thu trong kỳ */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-base font-extrabold text-slate-900">Chi tiết phiếu thu</h2>
          <Badge tone="slate">{cur.count} đợt</Badge>
        </div>
        {/* MOBILE: thẻ phiếu thu */}
        <div className="space-y-2 px-4 pb-4 sm:hidden">
          {list.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Chưa có phiếu thu nào trong kỳ này.</div>}
          {list.map((x) => (
            <div key={x.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><Badge tone={CAT_TONE[x.category] || "slate"}>{x.category}</Badge><span className="truncate text-sm font-bold text-slate-800">{x.customerName}</span></div>
                  <div className="truncate text-[11px] text-slate-400">{x.projectName} · {x.label}</div>
                  <div className="text-[11px] text-slate-400">{fmtDateVI(x.date)}{x.isAds && x.spend ? ` · chạy ${formatShort(x.spend)}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-extrabold text-indigo-600">{formatShort(x.revenue)}</div>
                  <div className="text-[11px] font-bold text-emerald-600">LN {formatShort(x.grossProfit)}</div>
                  <div className={`text-[11px] font-bold ${x.debt > 0 ? "text-rose-600" : "text-slate-300"}`}>{x.debt > 0 ? `nợ ${formatShort(x.debt)}` : "đủ"}</div>
                </div>
              </div>
            </div>
          ))}
          {list.length > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-extrabold text-slate-700">
              <span>Tổng {cur.count} đợt</span>
              <span>DT <span className="text-indigo-600">{formatShort(cur.revenue)}</span> · LN <span className="text-emerald-600">{formatShort(cur.grossProfit)}</span></span>
            </div>
          )}
        </div>

        {/* DESKTOP: bảng */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-bold">Ngày</th>
                <th className="px-3 py-2.5 font-bold">Khách / Dự án</th>
                <th className="px-3 py-2.5 text-right font-bold">Nhận</th>
                <th className="px-3 py-2.5 text-right font-bold">Tiền chạy</th>
                <th className="px-3 py-2.5 text-right font-bold">Chiết khấu</th>
                <th className="px-3 py-2.5 text-right font-bold">Doanh thu</th>
                <th className="px-3 py-2.5 text-right font-bold">LN gộp</th>
                <th className="px-3 py-2.5 text-right font-bold">Còn nợ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">Chưa có phiếu thu nào trong kỳ này.</td></tr>}
              {list.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{fmtDateVI(x.date)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2"><Badge tone={CAT_TONE[x.category] || "slate"}>{x.category}</Badge><span className="font-semibold text-slate-700">{x.customerName}</span></div>
                    <div className="text-[11px] text-slate-400">{x.projectName} · {x.label}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatShort(x.contractValue)}</td>
                  <td className="px-3 py-3 text-right text-slate-400">{x.isAds ? formatShort(x.spend) : "—"}</td>
                  <td className="px-3 py-3 text-right text-sky-600">{x.platformDiscount ? formatShort(x.platformDiscount) : "—"}</td>
                  <td className="px-3 py-3 text-right font-bold text-indigo-600">{formatShort(x.revenue)}</td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">{formatShort(x.grossProfit)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${x.debt > 0 ? "text-rose-600" : "text-slate-300"}`}>{x.debt > 0 ? formatShort(x.debt) : "0"}</td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-extrabold">
                  <td className="px-5 py-3" colSpan={2}>Tổng</td>
                  <td className="px-3 py-3 text-right text-slate-800">{formatShort(cur.received)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">{formatShort(cur.spend)}</td>
                  <td className="px-3 py-3 text-right text-sky-600">{formatShort(cur.discount)}</td>
                  <td className="px-3 py-3 text-right text-indigo-600">{formatShort(cur.revenue)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600">{formatShort(cur.grossProfit)}</td>
                  <td className="px-3 py-3 text-right text-rose-600">{formatShort(cur.debt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

const TABS = [["report", "Doanh thu & Lợi nhuận", BarChart3], ["expenses", "Chi phí vận hành", CreditCard]];

export default function Ketoan({ initialTab = "report" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="!p-2">
        <div className="grid grid-cols-2 gap-1">
          {TABS.map(([v, l, Ic]) => (
            <button key={v} onClick={() => setTab(v)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${tab === v ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25" : "text-slate-500 hover:bg-slate-50"}`}>
              <Ic size={16} /> <span className="truncate">{l}</span>
            </button>
          ))}
        </div>
      </Card>
      {tab === "report" ? <KetoanReport /> : <Expenses />}
    </div>
  );
}
