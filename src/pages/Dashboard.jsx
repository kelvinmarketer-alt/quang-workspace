// Tổng quan dạng ô (bento) — 31/10, sếp duyệt bản demo "QWS Bento": gọn 1 màn hình, việc hôm nay lên đầu,
// cột phải = lịch tuần (âm lịch) + sắp tới + thông báo, lưới Sức khoẻ dự án (từ Trung tâm báo cáo).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ArrowUpRight, ChevronDown, HandCoins, ListChecks, Repeat, Activity, Coins, Loader2 } from "lucide-react";
import { Badge, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { projectsMonthly, projectYears, customerProjectSummary, totalDebt, allInstallments } from "../lib/selectors.js";
import { MONTHS_VI, fmtDateVI, todayISO } from "../lib/format.js";
import { generateCalendarEvents } from "../lib/events.js";
import { lunarInfo } from "../lib/lunar.js";
import { useReportData, buildBrandRows } from "../lib/reports.js";
import TodayPanel, { useToday } from "../components/today/TodayPanel.jsx";
import { BrandAvatar } from "./Reports.jsx";

const DOT = { g: "bg-emerald-500", w: "bg-amber-400", b: "bg-rose-500", n: "bg-slate-200" };
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const TYPE_BADGE = { holiday: ["sky", "Lễ DL"], "lunar-holiday": ["amber", "Lễ ÂL"], "lunar-phase": ["indigo", "Âm lịch"], family: ["rose", "Gia đình"], task: ["emerald", "Việc"] };
const pctOf = (c, p) => (p ? ((c - p) / Math.abs(p)) * 100 : null);

function Spark({ data, color = "#6366f1" }) {
  const v = data.filter((x) => x != null);
  if (v.length < 2) return <div className="h-8" />;
  const W = 120, H = 32, mn = Math.min(...v), mx = Math.max(...v);
  const p = v.map((y, i) => [(i * W) / (v.length - 1), H - 3 - ((y - mn) / (mx - mn || 1)) * (H - 8)]);
  const d = "M" + p.map((q) => q.map((n) => n.toFixed(1)).join(",")).join("L");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill={color} fillOpacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={p.at(-1)[0] - 2} cy={p.at(-1)[1]} r="2.5" fill={color} />
    </svg>
  );
}

function Kpi({ label, value, delta, deltaGood = true, sub, spark, color }) {
  const up = delta != null && delta >= 0, good = delta == null ? null : up === deltaGood;
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4 lg:col-span-2">
      <div className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-xl font-extrabold tabular-nums text-slate-900 xl:text-2xl" title={typeof value === "number" ? formatVND(value) : undefined}>{typeof value === "number" ? formatShort(value) : value}</div>
      <div className={`truncate text-[12px] font-bold ${good == null ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-500"}`}>{delta != null ? `${up ? "▲" : "▼"} ${Math.abs(Math.round(delta))}% ` : ""}<span className="font-medium text-slate-400">{sub}</span></div>
      {spark && <Spark data={spark} color={color} />}
    </div>
  );
}

export default function Dashboard() {
  const { tasks, family, projects, customerList, isOwner, perms = [], settings = {} } = useData();
  const nav = useNavigate();
  const T = useToday();
  const [more, setMore] = useState(false);
  const today = todayISO(), now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
  const years = useMemo(() => { const ys = projectYears(projects); return ys.length ? ys : [curY]; }, [projects, curY]);
  const [year, setYear] = useState(years[0]);
  const monthly = useMemo(() => projectsMonthly(projects, year), [projects, year]);
  const lastYear = useMemo(() => projectsMonthly(projects, year - 1), [projects, year]);
  const upto = year === curY ? curM : 12; // không vẽ / không cộng tháng chưa tới
  const shown = monthly.filter((m) => m.month <= upto);
  const tot = shown.reduce((a, m) => ({ rev: a.rev + m.revenue, gp: a.gp + m.grossProfit }), { rev: 0, gp: 0 });
  const prevTot = lastYear.filter((m) => m.month <= upto).reduce((a, m) => ({ rev: a.rev + m.revenue, gp: a.gp + m.grossProfit }), { rev: 0, gp: 0 });
  const chartData = shown.map((m) => ({ name: MONTHS_VI[m.month - 1], thu: m.revenue, ln: m.grossProfit }));
  const debt = totalDebt(projects);

  // Trung tâm báo cáo (chỉ chủ): sức khoẻ từng thương hiệu + chi quảng cáo 30 ngày
  const rep = useReportData(30);
  const rows = useMemo(() => (isOwner ? buildBrandRows({ customers: customerList, projects, tasks, data: rep.data, links: settings.reportLinks || {}, reportLog: settings.reportLog || {} }) : []),
    [isOwner, customerList, projects, tasks, rep.data, settings.reportLinks, settings.reportLog]);
  const health = rows.filter((r) => r.jobs.length || r.ads.length || r.webs.length || r.pages.length).sort((a, b) => b.score - a.score || b.revenue - a.revenue);
  const attention = health.filter((r) => r.state === "b");
  const adsSpend = rep.data?.ads ? rep.data.ads.reduce((a, x) => a + x.spend, 0) : null;
  const adsPrev = rep.data?.ads ? rep.data.ads.reduce((a, x) => a + (x.prevSpend || 0), 0) : null;

  const topCust = useMemo(() => customerList.map((c) => ({ c, v: customerProjectSummary(projects, c.id).revenue })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6), [customerList, projects]);
  const recent = useMemo(() => allInstallments(projects).slice(0, 5), [projects]);
  const upcoming = useMemo(() => {
    const to = new Date(now.getTime() + 30 * 86400000);
    const ev = generateCalendarEvents(now, to, family).filter((e) => e.date >= today);
    const tk = tasks.filter((t) => t.date && t.status !== "done" && t.date >= today).map((t) => ({ date: t.date, title: t.title, type: "task" }));
    return [...ev, ...tk].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  }, [tasks, family, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = useMemo(() => { const d = new Date(now); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const li = lunarInfo(now);

  const recvN = T.has("customers") ? T.receivables.length : 0, taskN = T.has("tasks") ? T.dueTasks.length : 0, renewN = T.has("ketoan") ? T.renewals.length : 0;
  const headline = [isOwner && attention.length ? `${attention.length} dự án cần chú ý` : null, recvN ? `${recvN} khoản cần thu` : null, taskN ? `${taskN} việc ${T.overdueCount ? `(${T.overdueCount} quá hạn)` : "hôm nay"}` : null].filter(Boolean).join(", ") || "Hôm nay không có gì gấp";
  const urgent = [
    ...(T.has("tasks") ? T.dueTasks.slice(0, 2).map((t) => ({ k: "t" + t.id, to: "/cong-viec", tone: t.date < today ? "bg-rose-500" : "bg-emerald-500", title: t.title, sub: t.date < today ? `Quá hạn · ${fmtDateVI(t.date)}` : "Việc hôm nay" })) : []),
    ...(T.has("customers") ? T.receivables.slice(0, 2).map((x) => ({ k: "r" + x.projectId + x.id, to: "/khach-hang", tone: "bg-rose-500", title: `Thu ${x.customerName || "khách lẻ"} · ${formatShort(x.debt)}`, sub: `${x.projectName} · hạn ${fmtDateVI(x.date)}` })) : []),
    ...(isOwner ? attention.slice(0, 2).map((r) => ({ k: "b" + r.id, to: `/bao-cao/${r.id}`, tone: "bg-amber-400", title: `${r.name}: ${["ads", "web", "fp", "seo"].filter((k) => r.cells[k].t === "b").map((k) => ({ ads: "quảng cáo", web: "website", fp: "fanpage", seo: "SEO" })[k]).join(", ") || "nhiều việc trễ"} dưới chỉ tiêu`, sub: "Mở báo cáo thương hiệu" })) : []),
  ].slice(0, 4);
  const coinOk = perms.includes("coinDemo") && !!settings.paperBot;

  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Chào anh Quang</h1>
        <span className="text-[13px] font-medium text-slate-500">{fmtDateVI(now)} · âm lịch {li.label}{li.special ? ` · ${li.special}` : ""} · {li.canChiYear}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Việc của hôm nay */}
        <div className="card relative overflow-hidden p-4 sm:p-5 lg:col-span-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-transparent to-transparent" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Việc của hôm nay</span>
              <button onClick={() => setMore((v) => !v)} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-slate-700">{more ? "Thu gọn" : "Xem chi tiết hôm nay"} <ChevronDown size={14} className={more ? "rotate-180" : ""} /></button>
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-[22px]">{headline}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <MiniTile to="/khach-hang" icon={HandCoins} label="Cần thu" value={recvN ? formatShort(T.receivableTotal) : "0"} sub={recvN ? `${recvN} khoản` : "không có nợ tới hạn"} tone={recvN ? "text-rose-600" : "text-emerald-600"} />
              <MiniTile to="/cong-viec" icon={ListChecks} label="Việc" value={taskN} sub={T.overdueCount ? `${T.overdueCount} quá hạn` : "hôm nay"} tone={T.overdueCount ? "text-rose-600" : "text-slate-900"} />
              <MiniTile to="/chi-phi" icon={Repeat} label="Sắp gia hạn" value={renewN} sub="7 ngày tới" />
              {isOwner
                ? <MiniTile to="/bao-cao" icon={Activity} label="Dự án cần chú ý" value={rep.loading && !rep.data?.at ? "…" : attention.length} sub={`${health.length} thương hiệu đang chạy`} tone={attention.length ? "text-rose-600" : "text-emerald-600"} />
                : <MiniTile to="/khach-hang" icon={Activity} label="Khách hàng" value={customerList.length} sub="đang quản lý" />}
            </div>
            {urgent.length > 0 && <div className="mt-3 grid gap-1.5 sm:grid-cols-2">{urgent.map((u) => (
              <Link key={u.k} to={u.to} className="flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-slate-100 hover:ring-indigo-200">
                <span className={`h-2 w-2 shrink-0 rounded-full ${u.tone}`} /><div className="min-w-0"><div className="truncate text-[13px] font-semibold text-slate-800">{u.title}</div><div className="truncate text-[11.5px] text-slate-400">{u.sub}</div></div>
              </Link>))}</div>}
          </div>
        </div>

        {/* Cột phải: lịch tuần + sắp tới + thông báo */}
        <div className="card p-4 lg:col-span-4 lg:row-span-3">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Tuần này</h3><Link to="/lich" className="text-[12px] font-bold text-indigo-600">Lịch →</Link></div>
          <div className="mb-4 grid grid-cols-7 gap-1 text-center">{week.map((d) => { const on = d.toDateString() === now.toDateString(), l = lunarInfo(d); return (
            <div key={d.toISOString()} className={`rounded-xl py-1.5 ${on ? "bg-slate-900 text-white" : "text-slate-500"}`}>
              <div className="text-[10.5px] font-semibold">{DOW[d.getDay()]}</div>
              <div className={`text-base font-extrabold tabular-nums ${on ? "text-white" : "text-slate-800"}`}>{d.getDate()}</div>
              <div className={`text-[9.5px] ${l.special ? "font-bold text-amber-500" : on ? "text-slate-300" : "text-slate-400"}`}>{l.day}/{l.month}</div>
            </div>); })}</div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Sắp tới</div>
          <div className="space-y-1.5">{upcoming.map((e, i) => { const [tone, label] = TYPE_BADGE[e.type] || ["slate", ""]; const d = new Date(e.date); return (
            <div key={i} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
              <div className="w-9 shrink-0 text-center leading-none"><div className="text-[9.5px] font-bold text-slate-400">{MONTHS_VI[d.getMonth()]}</div><div className="text-[15px] font-extrabold text-slate-700">{d.getDate()}</div></div>
              <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{e.title}</div>
              {label && <Badge tone={tone}>{label}</Badge>}
            </div>); })}
            {!upcoming.length && <div className="text-[13px] text-slate-400">Không có sự kiện 30 ngày tới.</div>}</div>
          <Feed rows={health} recent={recent} isOwner={isOwner} />
        </div>

        {/* 4 số chính */}
        <Kpi label={`Doanh thu ${year === curY ? `T1–T${curM}` : year}`} value={tot.rev} delta={pctOf(tot.rev, prevTot.rev)} sub={`so ${year - 1}`} spark={shown.map((m) => m.revenue)} color="#6366f1" />
        <Kpi label="Lợi nhuận gộp" value={tot.gp} delta={pctOf(tot.gp, prevTot.gp)} sub={`${tot.rev ? Math.round((tot.gp / tot.rev) * 100) : 0}% biên`} spark={shown.map((m) => m.grossProfit)} color="#10b981" />
        <Kpi label="Công nợ" value={debt} sub={debt > 0 ? "chưa thu" : "không có nợ"} />
        {isOwner
          ? <Kpi label="Chi quảng cáo 30 ngày" value={adsSpend == null ? "…" : adsSpend} delta={adsSpend != null ? pctOf(adsSpend, adsPrev) : null} deltaGood={false} sub="so 30 ngày trước" />
          : <Kpi label="Khách hàng" value={String(customerList.length)} sub="đang quản lý" />}

        {/* Sức khoẻ dự án (chủ) / Top khách (tài khoản phụ) */}
        <div className="card p-4 lg:col-span-8">
          {isOwner ? <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[15px] font-extrabold text-slate-800">Sức khoẻ dự án</h3>
              <Link to="/bao-cao" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-200">Trung tâm báo cáo <ArrowUpRight size={14} /></Link></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{health.slice(0, 10).map((r) => (
              <button key={r.id} onClick={() => nav(`/bao-cao/${r.id}`)} className="grid gap-2 rounded-2xl bg-slate-50 p-2.5 text-left ring-1 ring-transparent hover:ring-indigo-200">
                <span className="flex min-w-0 items-center gap-2"><BrandAvatar r={r} size={24} /><span className="truncate text-[13px] font-bold text-slate-800">{r.name}</span></span>
                <span className="flex gap-1">{["ads", "web", "fp", "seo"].map((k) => <i key={k} className={`h-1.5 flex-1 rounded-full ${rep.loading && !rep.data?.at ? "animate-pulse bg-slate-200" : DOT[r.cells[k].t]}`} />)}</span>
                <span className="truncate text-[11px] text-slate-400">{r.jobs.map((j) => j.category).filter(Boolean).join(" · ") || "—"}</span>
              </button>))}
              {!health.length && <div className="col-span-full text-[13px] text-slate-400">{rep.loading ? "Đang lấy số các kênh…" : "Chưa có thương hiệu đang chạy."}</div>}</div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400"><span>4 vạch = Quảng cáo · Website · Fanpage · SEO</span><span><i className="mr-1 inline-block h-1.5 w-2.5 rounded-full bg-emerald-500" />đạt</span><span><i className="mr-1 inline-block h-1.5 w-2.5 rounded-full bg-amber-400" />theo dõi</span><span><i className="mr-1 inline-block h-1.5 w-2.5 rounded-full bg-rose-500" />dưới chỉ tiêu</span><span><i className="mr-1 inline-block h-1.5 w-2.5 rounded-full bg-slate-200" />không chạy kênh này</span></div>
          </> : <>
            <h3 className="mb-3 text-[15px] font-extrabold text-slate-800">Top khách hàng</h3>
            <div className="space-y-2">{topCust.map(({ c, v }) => (
              <div key={c.id} className="flex items-center gap-2.5"><span className="w-32 shrink-0 truncate text-[13px] font-semibold text-slate-700">{c.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-indigo-500" style={{ width: `${(v / topCust[0].v) * 100}%` }} /></div>
                <b className="w-16 shrink-0 text-right text-[12.5px] tabular-nums text-slate-700">{formatShort(v)}</b></div>))}</div>
          </>}
        </div>
      </div>

      {more && <TodayPanel />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`card p-4 ${coinOk ? "lg:col-span-5" : "lg:col-span-8"}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[15px] font-extrabold text-slate-800">Doanh thu & lợi nhuận {year}</h3>
            <div className="flex gap-1">{years.slice(0, 3).map((y) => <button key={y} onClick={() => setYear(y)} className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${y === year ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{y}</button>)}</div></div>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -12, right: 6, top: 8 }}>
              <defs>
                <linearGradient id="gThu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                <linearGradient id="gLn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v, n) => [formatVND(v), n === "thu" ? "Doanh thu" : "LN gộp"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} />
              <Area type="monotone" dataKey="thu" stroke="#6366f1" strokeWidth={2.5} fill="url(#gThu)" isAnimationActive={false} />
              <Area type="monotone" dataKey="ln" stroke="#10b981" strokeWidth={2.5} fill="url(#gLn)" isAnimationActive={false} />
            </AreaChart></ResponsiveContainer></div>
          {year === curY && curM < 12 && <div className="text-[11px] text-slate-400">Chỉ vẽ tới tháng {curM} (tháng chưa tới không tính là 0).</div>}
        </div>
        {coinOk && <CoinTile session={settings.paperBot} />}
        <div className="card p-4 lg:col-span-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Phiếu thu gần đây</h3><Link className="text-[12px] font-bold text-indigo-600" to="/ke-toan">Tất cả →</Link></div>
          <div className="space-y-1.5">{recent.map((x) => (
            <div key={x.projectId + x.id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600">{(x.customerName || "?").slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-slate-800">{x.projectName}{x.label ? ` · ${x.label}` : ""}</div><div className="truncate text-[11px] text-slate-400">{x.customerName} · {x.date ? fmtDateVI(x.date) : ""}</div></div>
              <b className="shrink-0 text-[13px] tabular-nums text-slate-800">{formatShort(x.revenue)}</b>
            </div>))}
            {!recent.length && <div className="text-[13px] text-slate-400">Chưa có phiếu thu.</div>}</div>
        </div>
      </div>
    </div>
  );
}

function MiniTile({ to, icon: Icon, label, value, sub, tone = "text-slate-900" }) {
  return (
    <Link to={to} className="grid gap-0.5 rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-indigo-200">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon size={13} />{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</span>
      <span className="truncate text-[11.5px] text-slate-400">{sub}</span>
    </Link>
  );
}

// Thông báo: Cảnh báo (quảng cáo 48 giờ + kênh đi xuống) · Thu tiền gần đây
function Feed({ rows, recent, isOwner }) {
  const [tab, setTab] = useState(isOwner ? "warn" : "money");
  const [alerts, setAlerts] = useState(null);
  useEffect(() => {
    if (!isOwner) return;
    supabase.functions.invoke("qws-meta-ads", { body: { mode: "alerts_list" } }).then(({ data }) => setAlerts(data?.alerts || [])).catch(() => setAlerts([]));
  }, [isOwner]);
  const down = rows.flatMap((r) => [["web", "Website"], ["fp", "Fanpage"], ["ads", "Quảng cáo"]].filter(([k]) => r.cells[k].t === "b").map(([k, l]) => ({ key: r.id + k, id: r.id, text: `${r.name}: ${l} ${r.cells[k].v || ""}${r.cells[k].d != null ? ` (${Math.round(r.cells[k].d)}%)` : ""}` })));
  const tabs = [...(isOwner ? [["warn", "Cảnh báo"]] : []), ["money", "Thu tiền"]];
  return (
    <div className="mt-4">
      <div className="mb-2 flex gap-4 border-b border-slate-100">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-1.5 text-[12.5px] font-bold ${tab === k ? "border-indigo-500 text-slate-900" : "border-transparent text-slate-400"}`}>{l}</button>)}</div>
      {tab === "warn" ? (
        <div className="space-y-1.5">
          {down.slice(0, 3).map((x) => <Link key={x.key} to={`/bao-cao/${x.id}`} className="flex gap-2 rounded-xl bg-rose-50/60 px-2.5 py-2 text-[12.5px] text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />{x.text}</Link>)}
          {alerts == null ? <div className="flex items-center gap-2 py-2 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải cảnh báo…</div>
            : alerts.slice(0, 4).map((x) => <Link key={x.key} to="/quang-cao" className="flex gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[12.5px] text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" /><span className="min-w-0"><span className="line-clamp-2">{x.text}</span><span className="text-[11px] text-slate-400">{new Date(x.sent_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></span></Link>)}
          {alerts && !alerts.length && !down.length && <div className="py-2 text-[12.5px] text-emerald-600">Không có cảnh báo 48 giờ qua.</div>}
        </div>
      ) : (
        <div className="space-y-1.5">{recent.slice(0, 4).map((x) => <div key={x.projectId + x.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[12.5px]"><span className="min-w-0 flex-1 truncate text-slate-700">{x.customerName} · {x.projectName}</span><b className="tabular-nums">{formatShort(x.revenue)}</b></div>)}</div>
      )}
    </div>
  );
}

// Ô Coin: kết quả Demo (tính ngầm, nhớ 5 phút) — chỉ khi có quyền xem Demo và đang có phiên
function CoinTile({ session }) {
  const [fin, setFin] = useState(null);
  useEffect(() => { let on = true; import("../lib/coinShared.js").then((m) => m.demoResult(session)).then((f) => on && setFin(f)).catch(() => {}); return () => { on = false; }; }, [session]);
  const P = fin?.portfolio, cap = session?.cfg?.capital || 1000;
  const curve = P?.curve?.map((x) => x.eq) || [];
  const step = Math.max(1, Math.floor(curve.length / 40));
  return (
    <Link to="/coin" className="card flex flex-col gap-1 p-4 transition hover:-translate-y-0.5 lg:col-span-3">
      <div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-[15px] font-extrabold text-slate-800"><Coins size={15} className="text-amber-500" /> Đầu tư Coin</h3><Badge tone="emerald">Demo</Badge></div>
      {!P ? <div className="flex items-center gap-2 py-6 text-[12.5px] text-slate-400"><Loader2 size={14} className="animate-spin" /> Đang tính Demo…</div> : <>
        <div className={`text-2xl font-extrabold tabular-nums ${P.equity >= cap ? "text-emerald-600" : "text-rose-600"}`}>{P.equity >= cap ? "+" : ""}{(((P.equity - cap) / cap) * 100).toFixed(1).replace(".", ",")}%</div>
        <div className="text-[12px] text-slate-400">{Math.round(P.equity).toLocaleString("vi-VN")}$ · sụt vốn lớn nhất {Math.round(P.maxDD)}%</div>
        <Spark data={curve.filter((_, i) => i % step === 0 || i === curve.length - 1)} color="#10b981" />
      </>}
    </Link>
  );
}
