import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import { Wallet, TrendingUp, AlertCircle, Users, CalendarDays, ArrowUpRight } from "lucide-react";
import { Card, StatCard, SectionTitle, Badge, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { projectsMonthly, projectYears, customerProjectSummary, totalDebt, allInstallments } from "../lib/selectors.js";
import { MONTHS_VI, fmtDateVI } from "../lib/format.js";
import { generateCalendarEvents } from "../lib/events.js";
import { lunarInfo } from "../lib/lunar.js";

const BARC = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#a855f7", "#14b8a6", "#ec4899"];
const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", Khác: "slate" };

export default function Dashboard() {
  const { tasks, family, projects, customerList } = useData();
  const debt = totalDebt(projects);
  const years = useMemo(() => { const ys = projectYears(projects); return ys.length ? ys : [new Date().getFullYear()]; }, [projects]);
  const [year, setYear] = useState(years[0]);

  const monthly = useMemo(() => projectsMonthly(projects, year), [projects, year]);
  const chartData = monthly.map((m) => ({ name: MONTHS_VI[m.month - 1], thu: m.revenue, ln: m.grossProfit }));
  const t = useMemo(() => monthly.reduce((a, m) => ({ revenue: a.revenue + m.revenue, profit: a.profit + m.grossProfit }), { revenue: 0, profit: 0 }), [monthly]);

  const topCust = useMemo(() => customerList
    .map((c) => ({ customer: c.name, received: customerProjectSummary(projects, c.id).revenue }))
    .filter((c) => c.received > 0).sort((a, b) => b.received - a.received).slice(0, 6), [customerList, projects]);

  const recent = useMemo(() => allInstallments(projects).slice(0, 6), [projects]);

  const upcoming = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 86400000);
    const ev = generateCalendarEvents(from, to, family).filter((e) => new Date(e.date) >= new Date(new Date().toDateString()));
    const taskEv = tasks.filter((tk) => tk.date && tk.status !== "done" && new Date(tk.date) >= new Date(new Date().toDateString())).map((tk) => ({ date: tk.date, title: tk.title, type: "task" }));
    return [...ev, ...taskEv].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  }, [tasks, family]);

  const li = lunarInfo(new Date());
  const TYPE_BADGE = { holiday: ["sky", "Lễ DL"], "lunar-holiday": ["amber", "Lễ ÂL"], "lunar-phase": ["indigo", "Âm lịch"], family: ["rose", "Gia đình"], task: ["emerald", "Việc"] };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 p-6 text-white sm:p-8">
        <div className="absolute -right-10 -top-10 h-48 w-48 animate-floaty rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-indigo-100">Xin chào Quang 👋</div>
            <div className="mt-1 text-2xl font-extrabold sm:text-3xl">Tổng quan năm {year}</div>
            <div className="mt-1 text-sm text-indigo-100">Hôm nay {fmtDateVI(new Date())} · Âm lịch {li.label} {li.special ? "· " + li.special : ""} · {li.canChiYear}</div>
          </div>
          <div className="flex gap-2">
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${y === year ? "bg-white text-indigo-700" : "bg-white/15 text-white hover:bg-white/25"}`}>{y}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Doanh thu" value={t.revenue} sub={`Năm ${year}`} tone="indigo" />
        <StatCard icon={TrendingUp} label="Lợi nhuận gộp" value={t.profit} sub={`${t.revenue ? ((t.profit / t.revenue) * 100).toFixed(0) : 0}% biên LN`} tone="emerald" />
        <StatCard icon={AlertCircle} label="Công nợ" value={debt} sub={debt > 0 ? "Chưa thu" : "Không có nợ"} tone="rose" />
        <StatCard icon={Users} label="Khách hàng" value={customerList.length} money={false} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle action={<Badge tone="indigo">Doanh thu / LN gộp</Badge>}>Doanh thu theo tháng</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gThu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gLn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v, n) => [formatVND(v), n === "thu" ? "Doanh thu" : "LN gộp"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} />
                <Area type="monotone" dataKey="thu" stroke="#6366f1" strokeWidth={2.5} fill="url(#gThu)" isAnimationActive={false} />
                <Area type="monotone" dataKey="ln" stroke="#10b981" strokeWidth={2.5} fill="url(#gLn)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle action={<CalendarDays size={18} className="text-slate-400" />}>Sắp tới (30 ngày)</SectionTitle>
          <div className="space-y-2.5">
            {upcoming.length === 0 && <div className="text-sm text-slate-400">Không có sự kiện.</div>}
            {upcoming.map((e, i) => {
              const [tone, label] = TYPE_BADGE[e.type] || ["slate", ""];
              const d = new Date(e.date);
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-50 text-center leading-none">
                    <div className="text-[10px] font-bold text-slate-400">{MONTHS_VI[d.getMonth()]}</div>
                    <div className="text-base font-extrabold text-slate-700">{d.getDate()}</div>
                  </div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{e.title}</div><div className="text-[11px] text-slate-400">{fmtDateVI(d)}</div></div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Top khách hàng</SectionTitle>
          {topCust.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">Chưa có dữ liệu.</div> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCust} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <XAxis type="number" tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="customer" width={104} interval={0} tickFormatter={(v) => (v && v.length > 15 ? v.slice(0, 14) + "…" : v)} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [formatVND(v), "Doanh thu"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} />
                  <Bar dataKey="received" radius={[0, 6, 6, 0]} isAnimationActive={false}>{topCust.map((_, i) => <Cell key={i} fill={BARC[i % BARC.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle action={<a className="flex items-center gap-1 text-xs font-bold text-indigo-600" href="/ke-toan">Tất cả <ArrowUpRight size={14} /></a>}>Phiếu thu gần đây</SectionTitle>
          {recent.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">Chưa có phiếu thu.</div> : (
            <div className="divide-y divide-slate-100">
              {recent.map((x) => (
                <div key={x.id} className="flex items-center gap-3 py-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600">{(x.customerName || "?").slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{x.projectName} · {x.label}</div>
                    <div className="text-[11px] text-slate-400">{x.customerName} · {x.date ? fmtDateVI(x.date) : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-800">{formatShort(x.revenue)}</div>
                    <div className="text-[11px] font-semibold text-emerald-600">LN +{formatShort(x.grossProfit)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
