import { Fragment, lazy, Suspense, useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Wallet, TrendingUp, HandCoins, Receipt, ArrowUp, ArrowDown, Calendar, BarChart3, CreditCard, PiggyBank, ChevronDown, Check, Search, Trash2, History } from "lucide-react";
import { Card, SectionTitle, Badge, MoneyInput, DateField, FitMoney, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { installmentsInRange, sumInstallments, monthlySeriesInRange, expensesInRange, allInstallments } from "../lib/selectors.js";
import { fmtDateVI, todayISO } from "../lib/format.js";
import Expenses from "./Expenses.jsx";
import { AnswerCard } from "../components/ReportKit.jsx";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";

const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (v) => Number(v) || 0;

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
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[12px]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">
            <FitMoney value={value} />
          </div>
          {/* 01/11: kỳ trước chưa có số (app bắt đầu ghi từ 2026) → ghi rõ, không hiện "mới · kỳ trước 0" */}
          {compare && (prev ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"><Delta cur={value} prev={prev} /><span className="text-[11px] text-slate-400">kỳ trước {formatShort(prev)}</span></div>
            : <div className="mt-1 text-[11px] text-slate-400">kỳ trước chưa có số</div>)}
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg sm:h-11 sm:w-11 ${TONES[tone]}`}><Icon size={16} className="sm:hidden" /><Icon size={20} className="hidden sm:block" /></div>
      </div>
    </div>
  );
}

function Waterfall({ rev, gp, op, opN, net, prevNet }) {
  const max = Math.max(rev, 1);
  const rows = [
    { l: "Doanh thu", v: rev, left: 0, w: rev, c: "from-indigo-400 to-indigo-600", t: "text-slate-800" },
    { l: "− Chi phí job (tiền chạy QC, CTV…)", v: -(rev - gp), left: gp, w: rev - gp, c: "from-amber-300 to-amber-500", t: "text-amber-600" },
    { l: "= Lợi nhuận gộp", v: gp, left: 0, w: gp, c: "from-emerald-300 to-emerald-500", t: "text-emerald-600" },
    { l: `− Chi vận hành (${opN} khoản)`, v: -op, left: Math.max(0, net), w: op, c: "from-rose-300 to-rose-500", t: "text-rose-500" },
    { l: "= Lợi nhuận ròng", v: net, left: 0, w: Math.max(0, net), c: "from-sky-400 to-indigo-500", t: "text-indigo-600", end: true },
  ];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-extrabold text-slate-800">Từ doanh thu đến lãi ròng</h3>{prevNet ? <span className="text-[12px] text-slate-400">lãi ròng kỳ trước {formatShort(prevNet)}</span> : null}</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.l} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7.5rem]">
            <span className={`truncate text-[13px] ${r.end ? "font-extrabold" : "font-semibold"} text-slate-700`}>{r.l}</span>
            <span className="relative col-span-2 row-start-2 h-3.5 rounded-full bg-slate-100 sm:col-span-1 sm:col-start-2 sm:row-start-1"><span className={`bar-x absolute inset-y-0 rounded-full bg-gradient-to-r ${r.c}`} style={{ left: `${(r.left / max) * 100}%`, width: `${Math.max(0.8, (r.w / max) * 100)}%` }} /></span>
            <span className={`text-right text-[13.5px] font-extrabold tabular-nums ${r.t}`}>{r.v < 0 ? "−" + formatShort(-r.v) : formatShort(r.v)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KetoanReport() {
  const { projects, expenses } = useData();
  const now = new Date();
  // Kỳ báo cáo — nhớ localStorage. Mặc định GIỮ "Năm nay": báo cáo này dạng năm (biểu đồ + nhóm theo tháng)
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem("qws_kt_period") || "{}") || {}; } catch { return {}; } }, []);
  const [preset, setPreset0] = useState(() => (PRESETS.some(([k]) => k === saved.preset) ? saved.preset : "thisYear"));
  const [cf, setCf0] = useState(saved.cf || iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [ct, setCt0] = useState(saved.ct || iso(now));
  const persist = (patch) => { try { localStorage.setItem("qws_kt_period", JSON.stringify({ preset, cf, ct, ...patch })); } catch {} };
  const setPreset = (v) => { setPreset0(v); persist({ preset: v }); };
  const setCf = (v) => { setCf0(v); persist({ cf: v }); };
  const setCt = (v) => { setCt0(v); persist({ ct: v }); };
  const [compare, setCompare] = useState(true);

  const { from, to: to0 } = periodFor(preset, cf, ct);
  // 01/11: kỳ chứa hôm nay chỉ tính TỚI HÔM NAY (doanh thu khớp chi phí — đợt nhập trước ngày tương lai không làm lãi ảo);
  // kỳ so sánh cắt cùng số ngày cho công bằng
  const today = todayISO(), to = to0 > today && from <= today ? today : to0;
  const prev0 = prevPeriod(preset, from, to0);
  const prev = to === to0 ? prev0 : { from: prev0.from, to: (() => { const d = new Date(prev0.from + "T00:00:00"); d.setDate(d.getDate() + Math.round((Date.parse(to) - Date.parse(from)) / 86400000)); const x = iso(d); return x < prev0.to ? x : prev0.to; })() };
  const future = useMemo(() => (to === to0 ? [] : installmentsInRange(projects, iso(new Date(Date.parse(today + "T00:00:00") + 86400000)), to0)), [projects, to, to0, today]);

  const list = useMemo(() => installmentsInRange(projects, from, to), [projects, from, to]);
  const cur = useMemo(() => sumInstallments(list), [list]);
  // Gom phiếu thu theo THÁNG (mới → cũ) để hiển thị dạng xổ
  const monthLbl = (m) => { const [y, mo] = m.split("-"); return mo ? `Tháng ${Number(mo)}/${y}` : m; };
  const byMonth = useMemo(() => {
    const map = new Map();
    for (const x of list) { const m = (x.date || "").slice(0, 7) || "—"; if (!map.has(m)) map.set(m, []); map.get(m).push(x); }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, items, count: items.length, revenue: items.reduce((a, x) => a + x.revenue, 0), grossProfit: items.reduce((a, x) => a + x.grossProfit, 0), debt: items.reduce((a, x) => a + x.debt, 0) }));
  }, [list]);
  const [openMonths, setOpenMonths] = useState(() => new Set()); // mặc định ĐÓNG hết, bấm tháng để xổ
  const toggleMonth = (m) => setOpenMonths((prev) => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
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
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* MOBILE: dropdown kỳ */}
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 sm:hidden">
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {/* DESKTOP: chips kỳ */}
          <div className="hidden flex-wrap gap-1 rounded-full bg-slate-100 p-1 sm:flex">
            {PRESETS.map(([v, l]) => (
              <button key={v} onClick={() => setPreset(v)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${preset === v ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <DateField value={cf} onChange={setCf} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:flex-none" />
              <span className="text-slate-400">→</span>
              <DateField value={ct} onChange={setCt} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:flex-none" />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 sm:ml-auto">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 rounded accent-indigo-600" />
            So sánh kỳ trước
          </label>
        </div>
        {/* MOBILE: 2 dòng gọn (kỳ này / so với); DESKTOP: 1 dòng */}
        <div className="mt-2 flex flex-col gap-0.5 text-xs text-slate-400 sm:flex-row sm:items-center sm:gap-2">
          <span className="flex items-center gap-2 whitespace-nowrap"><Calendar size={13} className="shrink-0" /> {fmtDateVI(from)} → {fmtDateVI(to)}</span>
          {compare && <span className="whitespace-nowrap pl-[21px] sm:pl-0"><span className="hidden sm:inline">· </span>so với {fmtDateVI(prev.from)} → {fmtDateVI(prev.to)}</span>}
          {future.length > 0 && <span className="pl-[21px] text-amber-600 sm:pl-0"><span className="hidden sm:inline">· </span>chưa tính {future.length} đợt ghi ngày sau hôm nay ({formatShort(sumInstallments(future).revenue)})</span>}
        </div>
      </Card>

      <AnswerCard eyebrow={`Kế toán · ${fmtDateVI(from)} → ${fmtDateVI(to)}`}
        title={cur.revenue ? `Lãi ròng ${formatShort(netProfit)} trên ${formatShort(cur.revenue)} doanh thu` : "Chưa có phiếu thu trong kỳ này"}
        desc={cur.revenue ? [`Mỗi 100 đồng doanh thu giữ lại ${Math.round((netProfit / cur.revenue) * 100)} đồng`, compare && prevNet ? `lãi ròng ${netProfit >= prevNet ? "tăng" : "giảm"} ${Math.abs(Math.round(((netProfit - prevNet) / Math.abs(prevNet)) * 100))}% so kỳ trước` : null, cur.debt > 0 ? `còn ${formatShort(cur.debt)} chưa thu` : "đã thu đủ"].filter(Boolean).join(" · ") : null}
        live={`${list.length} đợt thu`} />

      {/* Thẻ chỉ số chính (có so sánh) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <CompareCard icon={Wallet} label="Doanh thu" value={cur.revenue} prev={prevSum.revenue} tone="indigo" compare={compare} />
        <CompareCard icon={TrendingUp} label="Lợi nhuận gộp" value={cur.grossProfit} prev={prevSum.grossProfit} tone="emerald" compare={compare} />
        <CompareCard icon={HandCoins} label="Đã thu" value={cur.collected} prev={prevSum.collected} tone="sky" compare={compare} />
        <CompareCard icon={Receipt} label="Công nợ" value={cur.debt} prev={prevSum.debt} tone="rose" compare={compare} />
      </div>

      {/* Thác lợi nhuận: Doanh thu → chi phí job → LN gộp → chi vận hành → LN ròng (thanh mọc theo thứ tự) */}
      <Waterfall rev={cur.revenue} gp={cur.grossProfit} op={opCost.total} opN={opCost.items.length} net={netProfit} prevNet={compare ? prevNet : null} />

      {/* Chỉ số phụ */}
      <div className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:p-5">
        {[["Số tiền nhận", cur.received], ["Chiết khấu nền tảng", cur.discount], ["Phí chạy (ADS)", cur.serviceFee], ["Tiền chạy thực tế", cur.spend]].map(([l, v]) => (
          <div key={l} className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase text-slate-400">{l}</div>
            <div className="break-words text-base font-extrabold text-slate-800">{formatVND(v)}</div>
          </div>
        ))}
      </div>

      {/* Biểu đồ theo tháng trong kỳ */}
      {series.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">Doanh thu / LN gộp theo tháng</span>}>Diễn biến trong kỳ</SectionTitle>
          {/* 01/11: điện thoại — biểu đồ vừa khung (trước phải kéo ngang mới thấy hết tháng) */}
          <div>
           <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: 0, right: 4, top: 8 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="name" tickFormatter={(v) => String(v).replace(/^Th0?/, "T")} interval="preserveStartEnd" minTickGap={2} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatShort(v).replace(" tr", "tr")} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, k) => [formatVND(v), k === "dt" ? "Doanh thu" : "LN gộp"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "rgba(148,163,184,.14)" }} />
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
        <div className="flex items-center justify-between p-4 pb-3 sm:p-5 sm:pb-3">
          <h2 className="text-base font-extrabold text-slate-900">Chi tiết phiếu thu</h2>
          <Badge tone="slate">{cur.count} đợt</Badge>
        </div>
        {/* MOBILE: nhóm theo tháng */}
        <div className="space-y-3 px-4 pb-4 sm:hidden">
          {list.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Chưa có phiếu thu nào trong kỳ này.</div>}
          {byMonth.map((g) => {
            const open = openMonths.has(g.month);
            return (
              <div key={g.month} className="overflow-hidden rounded-xl border border-slate-100">
                <button onClick={() => toggleMonth(g.month)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50 ${open ? "bg-slate-50/60" : ""}`}>
                  <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                  <span className="whitespace-nowrap text-sm font-extrabold text-slate-700">{monthLbl(g.month).replace("Tháng ", "Th ")}</span>
                  <Badge tone="slate">{g.count}</Badge>
                  <span className="ml-auto text-right text-xs font-bold leading-tight"><span className="block text-indigo-600">{formatShort(g.revenue)}</span><span className="block text-emerald-600">LN {formatShort(g.grossProfit)}</span></span>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-slate-100 p-2">
                    {g.items.map((x) => (
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
                  </div>
                )}
              </div>
            );
          })}
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
              {byMonth.map((g) => {
                const open = openMonths.has(g.month);
                return (
                  <Fragment key={g.month}>
                    <tr className="cursor-pointer border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50" onClick={() => toggleMonth(g.month)}>
                      <td colSpan={8} className="px-5 py-2">
                        <div className="flex items-center gap-2.5">
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                          <span className="text-sm font-extrabold text-slate-700">{monthLbl(g.month)}</span>
                          <Badge tone="slate">{g.count} đợt</Badge>
                          <span className="ml-auto flex gap-4 text-xs font-bold"><span className="text-indigo-600">DT {formatShort(g.revenue)}</span><span className="text-emerald-600">LN {formatShort(g.grossProfit)}</span>{g.debt > 0 && <span className="text-rose-600">nợ {formatShort(g.debt)}</span>}</span>
                        </div>
                      </td>
                    </tr>
                    {open && g.items.map((x) => (
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
                  </Fragment>
                );
              })}
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

// ===== THU HỒI CÔNG NỢ =====
// Mỗi lần thu lưu vào đợt: payments [{id, date, amount, note}]; "collected" (Đã thu) vẫn giữ tổng để tương thích.
// Đợt cũ chưa có payments / Đã thu bị sửa tay lệch tổng → hiện 1 dòng "đã thu trước" = phần chênh.
const paySum = (ps) => ps.reduce((a, p) => a + num(p.amount), 0);
const storedPays = (x) => (Array.isArray(x.payments) ? x.payments.filter((p) => p && num(p.amount)) : []);
function paymentsOf(x) {
  const ps = storedPays(x).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const diff = num(x.collected) - paySum(ps);
  return diff ? [...ps, { id: "_legacy", date: "", amount: diff, note: diff > 0 ? "Đã thu trước đây (chưa ghi ngày)" : "Điều chỉnh giảm (sửa tay)", legacy: true }] : ps;
}
const payId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function PayHistory({ item, onDelete }) {
  const ps = paymentsOf(item);
  if (!ps.length) return <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center text-[12px] text-slate-400">Chưa có lần thu nào.</div>;
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
      {ps.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-slate-700">{p.date ? fmtDateVI(p.date) : "Trước đây"}</div>
            {p.note && <div className="truncate text-[11px] text-slate-400">{p.note}</div>}
          </div>
          <span className={`shrink-0 text-[13px] font-extrabold tabular-nums ${p.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>{p.amount < 0 ? "−" : "+"}{formatVND(Math.abs(p.amount))}</span>
          <button onClick={() => onDelete(item, p)} className="shrink-0 rounded-lg p-2.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Xoá lần thu này"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function CollectModal({ item, onClose, onSave, onDelete }) {
  const remain = num(item.debt);
  const [amt, setAmt] = useState(String(remain));
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const val = Math.min(remain, Math.max(0, num(amt)));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={guardClose(onClose)} onInputCapture={markDirty}>
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-extrabold text-slate-900">Thu hồi công nợ</div>
        <div className="mt-0.5 truncate text-sm text-slate-500">{item.customerName} · {item.projectName} · {item.label}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Phải trả</div><div className="text-sm font-extrabold text-slate-700">{formatShort(item.contractValue)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Đã thu</div><div className="text-sm font-extrabold text-sky-600">{formatShort(item.collected)}</div></div>
          <div className="rounded-xl bg-rose-50 p-2"><div className="text-[10px] font-bold uppercase text-rose-400">Còn nợ</div><div className="text-sm font-extrabold text-rose-600">{formatShort(item.debt)}</div></div>
        </div>
        <label className="mt-4 block text-sm font-semibold text-slate-600">Số tiền thu lần này</label>
        {remain > 0 ? (
          <>
            <MoneyInput value={amt} onChange={setAmt} autoFocus className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-bold outline-none focus:border-indigo-400" placeholder="0" />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <button type="button" onClick={() => setAmt(String(remain))} className="font-bold text-indigo-600">Thu đủ ({formatShort(remain)})</button>
              <span className="text-slate-400">Còn nợ sau thu: <b className="text-slate-600">{formatShort(remain - val)}</b></span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <DateField value={date} onChange={(v) => setDate(v || todayISO())} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (CK, tiền mặt…)" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </>
        ) : <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-sm font-bold text-emerald-700">Đợt này đã thu đủ.</div>}
        <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400"><History size={13} /> Lịch sử thu</div>
        <div className="max-h-48 overflow-y-auto"><PayHistory item={item} onDelete={onDelete} /></div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50">{remain > 0 ? "Huỷ" : "Đóng"}</button>
          {remain > 0 && <button disabled={val <= 0} onClick={() => onSave(val, date, note.trim())} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-40">Ghi nhận thu</button>}
        </div>
      </div>
    </div>
  );
}

function DebtPanel() {
  const { projects, updateInstallment, canEdit } = useData();
  const canW = canEdit ? canEdit("ketoan") : true; // chỉ xem → ẩn nút Thu
  const [collect, setCollect] = useState(null);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState(() => new Set());

  const outstanding = useMemo(
    () => allInstallments(projects).filter((x) => num(x.debt) > 0).sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [projects]
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return outstanding;
    return outstanding.filter((x) => (x.customerName || "").toLowerCase().includes(s) || (x.projectName || "").toLowerCase().includes(s));
  }, [outstanding, q]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const x of filtered) {
      const k = x.customerId || x.customerName || "—";
      if (!map.has(k)) map.set(k, { key: String(k), name: x.customerName || "Khách lẻ", items: [], debt: 0 });
      const g = map.get(k); g.items.push(x); g.debt += num(x.debt);
    }
    return [...map.values()].sort((a, b) => b.debt - a.debt);
  }, [filtered]);
  // 01/11: "Công nợ" toàn app = đợt TỚI HẠN (ngày ≤ hôm nay); đợt ghi ngày tương lai tách riêng "chưa tới hạn"
  const todayK = todayISO();
  const totalDebt = outstanding.filter((x) => !x.date || x.date <= todayK).reduce((a, x) => a + num(x.debt), 0);
  const notDue = outstanding.filter((x) => x.date > todayK).reduce((a, x) => a + num(x.debt), 0);
  const toggle = (k) => setClosed((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const allInst = useMemo(() => allInstallments(projects), [projects]);
  // Đợt đang mở popup — lấy bản MỚI NHẤT từ store để lịch sử cập nhật ngay khi xoá/thu
  const live = collect ? allInst.find((x) => x.id === collect.id && x.projectId === collect.projectId) || collect : null;
  const addPay = (it, val, date, note) => {
    const amount = Math.min(num(it.debt), val);
    if (amount <= 0) return;
    updateInstallment(it.projectId, it.id, { payments: [...storedPays(it), { id: payId(), date: date || todayISO(), amount, note: note || "" }], collected: num(it.collected) + amount });
  };
  const doCollect = (val, date, note) => { addPay(live, val, date, note); setCollect(null); };
  const collectFull = (it) => addPay(it, num(it.debt), todayISO(), "Thu đủ");
  const delPay = async (it, p) => {
    if (!(await ask(`Xoá lần thu ${formatVND(Math.abs(p.amount))}${p.date ? ` ngày ${fmtDateVI(p.date)}` : ""}?\nĐã thu của đợt sẽ tính lại, công nợ tăng tương ứng.`))) return;
    if (p.legacy) updateInstallment(it.projectId, it.id, { collected: paySum(storedPays(it)) }); // bỏ phần "đã thu trước đây"
    else { const rest = storedPays(it).filter((q) => q.id !== p.id); updateInstallment(it.projectId, it.id, { payments: rest, collected: Math.max(0, num(it.collected) - num(p.amount)) }); }
  };
  // Các lần thu gần đây (mọi đợt, kể cả đã thu đủ) để xem/xoá nhầm
  const [moreHist, setMoreHist] = useState(false);
  const recentPays = useMemo(() => allInst.flatMap((x) => storedPays(x).map((p) => ({ p, x }))).sort((a, b) => (b.p.date || "").localeCompare(a.p.date || "")), [allInst]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* 01/11 điện thoại: nhãn xuống dòng thay vì bị cắt "CÔNG NỢ TỚI ..."; ô chính cùng kiểu thẻ (bỏ khối hồng chói) */}
        <div className="card min-w-0 p-3 ring-1 ring-rose-200 sm:p-4">
          <div className="text-[11px] font-bold uppercase leading-tight tracking-wide text-rose-600">Nợ tới hạn</div>
          <div className="mt-1 text-lg font-extrabold text-rose-600 sm:text-2xl"><span className="sm:hidden">{formatShort(totalDebt)}</span><span className="hidden sm:inline">{formatVND(totalDebt)}</span></div>
          {notDue > 0 && <div className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-400">+ {formatShort(notDue)} chưa tới hạn</div>}
        </div>
        <div className="card min-w-0 p-3 sm:p-4"><div className="text-[11px] font-bold uppercase leading-tight text-slate-400">Khách nợ</div><div className="mt-1 text-lg font-extrabold text-slate-800 sm:text-2xl">{groups.length}</div></div>
        <div className="card min-w-0 p-3 sm:p-4"><div className="text-[11px] font-bold uppercase leading-tight text-slate-400">Đợt chưa thu</div><div className="mt-1 text-lg font-extrabold text-slate-800 sm:text-2xl">{outstanding.length}</div></div>
      </div>

      <div className="mx-3 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-[12px] text-indigo-700 sm:mx-0">💡 Thu nợ chỉ cập nhật <b>Đã thu</b> / giảm <b>công nợ</b>. Quỹ công ty không đổi vì lợi nhuận đã được ghi nhận từ khi có job.</div>

      {outstanding.length === 0 ? (
        <Card><div className="py-12 text-center"><div className="text-3xl">🎉</div><div className="mt-2 text-sm font-bold text-slate-500">Không còn công nợ nào — tất cả đã thu đủ!</div></div></Card>
      ) : (
        <>
          <div className="relative mx-3 sm:mx-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách / dự án…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="space-y-3">
            {groups.map((g) => {
              const open = !closed.has(g.key);
              return (
                <div key={g.key} className="overflow-hidden rounded-none border-y border-slate-100 bg-white shadow-sm sm:rounded-2xl sm:border">
                  <button onClick={() => toggle(g.key)} className={`flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 ${open ? "bg-slate-50/60" : ""}`}>
                    <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                    <span className="truncate text-sm font-extrabold text-slate-800">{g.name}</span>
                    <Badge tone="slate">{g.items.length}</Badge>
                    <span className="ml-auto shrink-0 text-sm font-extrabold text-rose-600">{formatShort(g.debt)}</span>
                  </button>
                  {open && (
                    <div className="divide-y divide-slate-50 border-t border-slate-100">
                      {g.items.map((x) => (
                        <div key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5"><Badge tone={CAT_TONE[x.category] || "slate"}>{x.category}</Badge><span className="truncate text-sm font-semibold text-slate-700">{x.projectName}</span></div>
                            <div className="text-[11px] text-slate-400 sm:truncate">{x.label} · {fmtDateVI(x.date)} · đã thu {formatShort(x.collected)}/{formatShort(x.contractValue)}{storedPays(x).length > 0 && <button onClick={() => setCollect(x)} className="ml-1 font-bold text-indigo-500 hover:underline">· {storedPays(x).length} lần thu</button>}</div>
                          </div>
                          <div className="contents sm:block sm:shrink-0 sm:text-right">
                            <div className="shrink-0 text-sm font-extrabold text-rose-600">{formatShort(x.debt)}</div>
                            {/* điện thoại: 2 nút xuống dòng riêng, chữ thông tin không bị cắt */}
                            {canW && <div className="flex w-full justify-end gap-1.5 sm:mt-1 sm:w-auto">
                              <button onClick={async () => { if (await ask(`Thu đủ ${formatVND(x.debt)} của ${x.customerName}?`)) collectFull(x); }} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-2 text-[11px] font-bold sm:py-1 text-emerald-600 hover:bg-emerald-100"><Check size={12} /> Thu đủ</button>
                              <button onClick={() => setCollect(x)} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold sm:py-1 text-white hover:bg-indigo-700">Thu một phần…</button>
                            </div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {recentPays.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 pb-2 pt-3.5 text-sm font-extrabold text-slate-800"><History size={15} className="text-indigo-500" /> Lịch sử thu nợ <Badge tone="slate">{recentPays.length}</Badge></div>
          <div className="divide-y divide-slate-50">
            {(moreHist ? recentPays : recentPays.slice(0, 10)).map(({ p, x }) => (
              <div key={x.id + p.id} className="flex items-center gap-2 py-1.5 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-slate-700">{x.customerName || "Khách lẻ"} <span className="font-semibold text-slate-400">· {x.projectName}</span></div>
                  <div className="truncate text-[11px] text-slate-400">{fmtDateVI(p.date)} · {x.label}{p.note ? ` · ${p.note}` : ""}</div>
                </div>
                <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-emerald-600">+{formatVND(p.amount)}</span>
                <button onClick={() => delPay(x, p)} className="shrink-0 rounded-lg p-2.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Xoá lần thu này"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {recentPays.length > 10 && <button onClick={() => setMoreHist((v) => !v)} className="w-full border-t border-slate-100 py-2.5 text-xs font-bold text-indigo-600 hover:bg-slate-50">{moreHist ? "Thu gọn" : `Xem tất cả ${recentPays.length} lần thu`}</button>}
        </Card>
      )}
      {live && <CollectModal item={live} onClose={() => setCollect(null)} onSave={doCollect} onDelete={delPay} />}
    </div>
  );
}

// 01/11: thêm "Dòng tiền" = trang Quỹ cũ (đã ẩn khỏi menu) — /quy, /quy-thong-ke mở thẳng tab này
const TABS = [["report", "Doanh thu", BarChart3], ["debt", "Công nợ", HandCoins], ["expenses", "Chi phí", CreditCard], ["cash", "Dòng tiền", PiggyBank]];
const Funds = lazy(() => import("./Funds.jsx"));

const ktTabLS = () => { try { const v = localStorage.getItem("qws_kt_tab"); return TABS.some(([k]) => k === v) ? v : "report"; } catch { return "report"; } };
export default function Ketoan({ initialTab, fundsTab }) {
  // Route chỉ định tab (vd /chi-phi) → theo route; /ke-toan → mở lại tab đã xem lần trước (nhớ localStorage)
  const [tab, setTab0] = useState(() => initialTab || ktTabLS());
  const setTab = (v) => { setTab0(v); try { localStorage.setItem("qws_kt_tab", v); } catch {} };
  // Mở từ link khác (vd /ke-toan → /chi-phi) khi trang đang mở sẵn → chuyển đúng tab
  useEffect(() => { setTab0(initialTab || ktTabLS()); }, [initialTab]);
  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className="flex">
        <div className="grid w-full grid-cols-4 gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-100 sm:inline-flex sm:w-auto">
          {TABS.map(([v, l, Ic]) => (
            <button key={v} onClick={() => setTab(v)} className={`flex items-center justify-center gap-1.5 rounded-full px-1 py-2 text-[12.5px] font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${tab === v ? "tab-active bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              <Ic size={16} className="hidden shrink-0 sm:block" /> <span className="whitespace-nowrap">{l}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === "report" ? <KetoanReport /> : tab === "debt" ? <DebtPanel /> : tab === "cash" ? <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">Đang tải…</div>}><Funds initialTab={fundsTab} /></Suspense> : <Expenses />}
    </div>
  );
}
