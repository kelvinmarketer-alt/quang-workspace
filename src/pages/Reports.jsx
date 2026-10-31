// Trung tâm báo cáo (/bao-cao) + Thương hiệu 360 (/bao-cao/:id) — 31/10, sếp duyệt bản demo "QWS Bento".
// Số kênh lấy từ lib/reports.js (Quảng cáo, Website Google, Fanpage) + Kế toán (đợt thu) + Công việc + Tài nguyên.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { RefreshCw, Printer, Sparkles, Loader2, ChevronDown, ArrowLeft, Check, Copy, Link2, ExternalLink, AlertTriangle } from "lucide-react";
import { Badge, FitMoney, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useReportData, buildBrandRows, linkChannels, monthKey, squash } from "../lib/reports.js";
import { allInstallments } from "../lib/selectors.js";
import { aiBrandReport } from "../lib/ai.js";
import { fmtDateVI, todayISO } from "../lib/format.js";

const TONE = { g: "bg-emerald-50 text-emerald-700", w: "bg-amber-50 text-amber-700", b: "bg-rose-50 text-rose-700", n: "bg-slate-100 text-slate-400" };
const DOT = { g: "bg-emerald-500", w: "bg-amber-400", b: "bg-rose-500", n: "bg-slate-200" };
const STATE = { g: ["emerald", "Đạt chỉ tiêu"], w: ["amber", "Cần theo dõi"], b: ["rose", "Cần chú ý"] };
const CAT = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const PJ = { doing: ["amber", "Đang làm"], done: ["emerald", "Hoàn thành"], paused: ["sky", "Tạm dừng"], cancel: ["rose", "Đã huỷ"] };
const AV = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#e11d48", "#7c3aed", "#0d9488", "#db2777"];
const pct = (d) => (d == null ? "" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))}%`);

export function BrandAvatar({ r, size = 32 }) {
  const col = AV[[...String(r.name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];
  return r.logo
    ? <img src={r.logo} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-100" />
    : <span style={{ width: size, height: size, background: col }} className="grid shrink-0 place-items-center rounded-xl text-[11px] font-extrabold text-white">{String(r.name).slice(0, 2).toUpperCase()}</span>;
}

function CellPill({ x, loading }) {
  if (loading && x.v == null) return <span className="inline-block h-5 w-16 animate-pulse rounded-full bg-slate-100" />;
  if (x.v == null) return <span className="text-slate-300">—</span>;
  return (
    <div className="grid gap-0.5">
      <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${TONE[x.t]}`}>{x.v}</span>
      {(x.sub || x.d != null) && <span className="whitespace-nowrap text-[11px] text-slate-400">{x.sub}{x.sub && x.d != null ? " · " : ""}{x.d != null && <b className={x.d >= 0 ? "text-emerald-600" : "text-rose-500"}>{pct(x.d)}</b>}</span>}
    </div>
  );
}

function useRows() {
  const { customerList = [], projects = [], tasks = [], settings = {} } = useData();
  const rep = useReportData(30);
  const rows = useMemo(() => buildBrandRows({ customers: customerList, projects, tasks, data: rep.data, links: settings.reportLinks || {}, reportLog: settings.reportLog || {} }),
    [customerList, projects, tasks, rep.data, settings.reportLinks, settings.reportLog]);
  return { rows, rep };
}

function OwnerOnly() {
  return <div className="card m-3 p-8 text-center text-sm text-slate-500 sm:m-5">Trung tâm báo cáo hiện chỉ dành cho chủ workspace.</div>;
}

export default function Reports() {
  const { id } = useParams();
  const { isOwner } = useData();
  if (!isOwner) return <OwnerOnly />;
  return id ? <Brand360 id={id} /> : <ReportMatrix />;
}

// ---------------- Bảng tổng ----------------
function ReportMatrix() {
  const { rows, rep } = useRows();
  const nav = useNavigate();
  const [f, setF] = useState("att");
  const loading = rep.loading && !rep.data?.at;
  const list = useMemo(() => {
    let L = rows.filter((r) => r.jobs.length || r.ads.length || r.webs.length || r.pages.length || r.revenue);
    if (f === "fulltime" || f === "remote") L = L.filter((r) => r.type === f);
    return [...L].sort(f === "att" ? (a, b) => b.score - a.score || b.revenue - a.revenue : (a, b) => b.revenue - a.revenue);
  }, [rows, f]);
  const active = rows.filter((r) => r.jobs.length);
  const sent = rows.filter((r) => r.rep.t === "g").length;
  const chips = [["att", "Cần chú ý trước"], ["all", "Theo doanh thu"], ["fulltime", "Full-time"], ["remote", "Remote"]];
  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Trung tâm báo cáo</h2>
          <p className="text-[13px] text-slate-500">Mọi thương hiệu và job trên 1 bảng · kênh: 30 ngày {fmtDateVI(rep.period.since)} – {fmtDateVI(rep.period.until)} so với 30 ngày trước · doanh thu: tháng này</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={rep.reload} disabled={rep.loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60"><RefreshCw size={14} className={rep.loading ? "animate-spin" : ""} /> {rep.loading ? "Đang lấy số…" : "Làm mới"}</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700"><Printer size={14} /> Xuất PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Thương hiệu · job đang chạy" value={`${active.length} · ${active.reduce((a, r) => a + r.jobs.length, 0)}`} sub={`${rows.length} khách đang hoạt động`} />
        <Tile label="Đạt chỉ tiêu" value={list.filter((r) => r.state === "g").length} sub="không kênh nào dưới chỉ tiêu" tone="text-emerald-600" />
        <Tile label="Cần chú ý" value={list.filter((r) => r.state === "b").length} sub="có kênh đi xuống / đắt" tone="text-rose-600" />
        <Tile label={`Báo cáo tháng ${Number(monthKey().slice(5))} đã gửi`} value={`${sent}/${active.length || rows.length}`} sub="bấm thương hiệu để soạn & đánh dấu" />
      </div>

      {rep.data?.errors?.length > 0 && <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Một số kênh chưa lấy được số: {rep.data.errors.join(" · ")}</span></div>}

      <div className="card overflow-hidden p-0">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {chips.map(([k, l]) => <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${f === k ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>)}
          <span className="ml-auto text-[11.5px] text-slate-400">Màu: <i className="mx-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />đạt <i className="mx-1 inline-block h-2 w-2 rounded-full bg-amber-400" />theo dõi <i className="mx-1 inline-block h-2 w-2 rounded-full bg-rose-500" />dưới chỉ tiêu</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {["Thương hiệu · job", "Doanh thu tháng", "Quảng cáo", "Website Google", "Fanpage", "SEO (hiển thị)", "Việc trễ", "Báo cáo"].map((h) => <th key={h} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => nav(`/bao-cao/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/bao-cao/${r.id}`)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70">
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} /><BrandAvatar r={r} />
                    <div className="min-w-0"><div className="font-bold text-slate-800">{r.name}</div><div className="max-w-[230px] truncate text-[11.5px] text-slate-400">{r.type === "fulltime" ? "Full-time" : r.type === "le" ? "Khách lẻ" : "Remote"} · {r.jobs.length ? r.jobs.map((j) => j.category || j.name).join(", ") : "không job đang chạy"}</div></div>
                  </div></td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums"><div className="font-bold text-slate-800">{r.revenue ? formatShort(r.revenue) : "—"}</div>{r.prevRevenue > 0 && <div className="text-[11px] text-slate-400">T trước {formatShort(r.prevRevenue)}</div>}{r.debt > 0 && <div className="text-[11px] font-bold text-rose-500">nợ {formatShort(r.debt)}</div>}</td>
                  <td className="px-3 py-2.5"><CellPill x={r.cells.ads} loading={loading} /></td>
                  <td className="px-3 py-2.5"><CellPill x={r.cells.web} loading={loading} /></td>
                  <td className="px-3 py-2.5"><CellPill x={r.cells.fp} loading={loading} /></td>
                  <td className="px-3 py-2.5"><CellPill x={r.cells.seo} loading={loading} /></td>
                  <td className="px-3 py-2.5 tabular-nums">{r.late ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-700">{r.late}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${TONE[r.rep.t]}`}>{r.rep.v}</span></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400">Chưa có thương hiệu nào đang chạy.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <LinkEditor data={rep.data} />
    </div>
  );
}

function Tile({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-400">{sub}</div>}
    </div>
  );
}

// Gắn website / fanpage ↔ khách (tài khoản quảng cáo gắn ở Cài đặt → Quảng cáo). Chưa gắn tay thì app đoán theo tên.
function LinkEditor({ data }) {
  const { customerList = [], settings = {}, setSettings } = useData();
  const [open, setOpen] = useState(false);
  const links = settings.reportLinks || {};
  const L = linkChannels(data, customerList, links);
  const custs = [...customerList].filter((c) => c.active !== false).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const set = (kind, key, v) => setSettings({ reportLinks: { ...links, [kind]: { ...(links[kind] || {}), [key]: v || undefined } } });
  const Sel = ({ kind, k, cur, manual }) => (
    <select value={manual || cur || ""} onChange={(e) => set(kind, k, e.target.value)} className={`max-w-[12rem] rounded-lg border px-2 py-1 text-[12.5px] ${manual ? "border-indigo-200 bg-indigo-50 font-bold text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}>
      <option value="">{cur ? "Tự đoán theo tên" : "Chưa gắn"}</option>
      <option value="none">Không thuộc khách nào</option>
      {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
  const unl = (data?.web || []).filter((s) => !L.web[s.domain]).length + (data?.pages || []).filter((p) => !L.page[p.id]).length;
  return (
    <div className="card no-print p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-4 text-left">
        <Link2 size={16} className="text-indigo-500" /><span className="text-sm font-extrabold text-slate-800">Gắn website & fanpage với khách</span>
        {unl > 0 && <Badge tone="amber">{unl} chưa gắn</Badge>}
        <span className="ml-auto text-[12px] text-slate-400">tài khoản quảng cáo gắn ở <Link onClick={(e) => e.stopPropagation()} to="/cai-dat" className="font-bold text-indigo-600">Cài đặt</Link></span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
          <div><div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Website</div>
            <div className="space-y-1.5">{(data?.web || []).map((s) => <div key={s.domain} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate font-semibold text-slate-700">{s.domain}</span><Sel kind="web" k={s.domain} cur={L.web[s.domain]} manual={links.web?.[s.domain]} /></div>)}
              {!data?.web?.length && <div className="text-[12.5px] text-slate-400">Chưa có số website (bấm Làm mới).</div>}</div></div>
          <div><div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Fanpage</div>
            <div className="space-y-1.5">{(data?.pages || []).map((p) => <div key={p.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate font-semibold text-slate-700">{p.name}</span><Sel kind="page" k={p.id} cur={L.page[p.id]} manual={links.page?.[p.id]} /></div>)}
              {!data?.pages?.length && <div className="text-[12.5px] text-slate-400">Chưa có số fanpage (bấm Làm mới).</div>}</div></div>
        </div>
      )}
    </div>
  );
}

// ---------------- Thương hiệu 360 ----------------
function Brand360({ id }) {
  const { rows, rep } = useRows();
  const { projects = [], tasks = [], resources = [], settings = {}, setSettings, setToast } = useData();
  const r = rows.find((x) => x.id === id);
  const [ai, setAi] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const today = todayISO(), mk = monthKey();
  const recent = useMemo(() => allInstallments(projects).filter((x) => x.customerId === id).slice(0, 5), [projects, id]);
  const daily = useMemo(() => {
    const m = new Map(); for (const s of r?.webs || []) for (const [d, c] of s.daily || []) m.set(d, (m.get(d) || 0) + c);
    return [...m.entries()].sort().map(([d, c]) => ({ d: `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`, c }));
  }, [r]);
  if (!r) return <div className="card m-3 p-8 text-center text-sm text-slate-500 sm:m-5">Không tìm thấy khách này. <Link to="/bao-cao" className="font-bold text-indigo-600">Về Trung tâm báo cáo</Link></div>;
  const loading = rep.loading && !rep.data?.at;
  const res = resources.filter((x) => x.customerId === id).slice(0, 6);
  const nm = squash(r.name), late = tasks.filter((t) => t.status !== "done" && t.date && t.date < today && (t.customerId === id || (nm.length >= 4 && squash(t.title).includes(nm)))).slice(0, 3);
  const sent = (settings.reportLog || {})[id]?.[mk];
  const [stTone, stLabel] = STATE[r.state];
  const markSent = () => { const log = settings.reportLog || {}; setSettings({ reportLog: { ...log, [id]: { ...(log[id] || {}), [mk]: sent ? undefined : today } } }); setToast?.({ text: sent ? "Đã bỏ đánh dấu gửi báo cáo" : "Đã đánh dấu gửi báo cáo tháng này" }); };
  const runAi = async () => {
    setBusy(true); setErr("");
    try {
      const data = { thuong_hieu: r.name, loai: r.type, ky_kenh: `${rep.period.since} → ${rep.period.until}`,
        job: r.jobs.map((j) => ({ ten: j.name, loai: j.category })),
        noi_bo: { doanh_thu_thang: r.revenue, doanh_thu_thang_truoc: r.prevRevenue, cong_no: r.debt },
        quang_cao: r.ads.map((a) => ({ ten: a.name, nen_tang: a.platform, chi: Math.round(a.spend), ket_qua: a.results, gia_kq: a.results ? Math.round(a.spend / a.results) : null, chi_ky_truoc: a.prevSpend, kq_ky_truoc: a.prevResults, danh_gia: a.verdict?.label })),
        website: r.webs.map((s) => ({ ten: s.domain, click: s.clicks, d_click: s.prevClicks ? Math.round(((s.clicks - s.prevClicks) / s.prevClicks) * 100) : null, hien_thi: s.impressions, vi_tri_tb: s.position, nguoi_dung: s.users, chuyen_doi: s.conv })),
        fanpage: r.pages.map((p) => ({ ten: p.name, tiep_can: p.reach, tin_nhan: p.messages, tin_nhan_ky_truoc: p.prevMessages, tuong_tac: p.engagement })),
        viec_tre: r.late };
      setAi(await aiBrandReport({ data, apiKey: settings.openaiKey }));
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const tile = (label, cell, main, sub) => (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      {loading && cell?.v == null ? <div className="mt-2 h-7 w-24 animate-pulse rounded-lg bg-slate-100" /> : <>
        <div className={`mt-1 text-2xl font-extrabold tabular-nums ${cell && cell.v == null ? "text-slate-300" : "text-slate-900"}`}>{main}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400">{cell && cell.v != null && <span className={`h-2 w-2 rounded-full ${DOT[cell.t]}`} />}{sub}</div>
      </>}
    </div>
  );
  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <Link to="/bao-cao" className="no-print inline-flex items-center gap-1 text-[13px] font-bold text-slate-500 hover:text-indigo-600"><ArrowLeft size={15} /> Trung tâm báo cáo</Link>
      <div className="card overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-r from-indigo-100 via-violet-100 to-pink-100 sm:h-28" />
        <div className="-mt-9 flex flex-wrap items-end gap-3 px-4 pb-4 sm:px-5">
          <div className="rounded-2xl bg-white p-1"><BrandAvatar r={r} size={68} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{r.name}</h2>
            <div className="text-[13px] text-slate-500">{r.type === "fulltime" ? "Full-time" : r.type === "le" ? "Khách lẻ" : "Remote"} · {r.jobs.length} job đang chạy · {r.ads.length} TK quảng cáo · {r.webs.length} website · {r.pages.length} fanpage</div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <Badge tone={stTone}>{stLabel}</Badge>
            <button onClick={markSent} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold ${sent ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}><Check size={14} /> {sent ? `Đã gửi BC T${Number(mk.slice(5))}` : `Đánh dấu đã gửi BC T${Number(mk.slice(5))}`}</button>
            <button onClick={runAi} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Soạn báo cáo tháng (AI)</button>
          </div>
        </div>
      </div>

      {(ai || err) && <AiReport ai={ai} err={err} onClose={() => { setAi(null); setErr(""); }} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile("Doanh thu tháng này", null, <FitMoney value={r.revenue} />, <>{r.prevRevenue ? `tháng trước ${formatShort(r.prevRevenue)}` : "chưa có đợt thu tháng trước"}{r.debt > 0 && <b className="text-rose-500">· nợ {formatShort(r.debt)}</b>}</>)}
        {tile("Quảng cáo · 30 ngày", r.cells.ads, r.cells.ads.v ?? "Chưa gắn", r.spend ? `chi ${formatShort(r.spend)} · ${r.results.toLocaleString("vi-VN")} kết quả` : "chưa có tài khoản / không chạy")}
        {tile("Website · click Google", r.cells.web, r.cells.web.v ?? "Chưa gắn", r.cells.web.v ? <>{pct(r.cells.web.d) || "chưa so được"} so 30 ngày trước</> : "gắn website ở Trung tâm báo cáo")}
        {tile("Fanpage · tin nhắn mới", r.cells.fp, r.cells.fp.v ?? "Chưa gắn", r.cells.fp.v ? <>{r.cells.fp.sub} {pct(r.cells.fp.d)}</> : "gắn fanpage ở Trung tâm báo cáo")}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="card p-4 lg:col-span-7">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Click Google theo ngày</h3><span className="text-[12px] text-slate-400">{r.cells.seo.v ? `${r.cells.seo.v} · ${r.cells.seo.sub}` : ""}</span></div>
          {daily.length ? <div className="h-52"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ left: -18, right: 6, top: 6 }}>
              <defs><linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, "Click"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} />
              <Area type="monotone" dataKey="c" stroke="#6366f1" strokeWidth={2.5} fill="url(#gB)" isAnimationActive={false} />
            </AreaChart></ResponsiveContainer></div>
            : <div className="grid h-52 place-items-center rounded-xl bg-slate-50 text-[13px] text-slate-400">{loading ? "Đang lấy số Google…" : "Chưa có website Google gắn với khách này."}</div>}
        </div>
        <div className="card p-4 lg:col-span-5">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Job</h3><Badge tone="indigo">{r.cps.length} job</Badge></div>
          <div className="space-y-2">{[...r.cps].sort((a, b) => (a.status === "doing" ? -1 : 1) - (b.status === "doing" ? -1 : 1)).slice(0, 6).map((p) => { const [t, l] = PJ[p.status] || PJ.doing; return (
            <div key={p.id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
              <Badge tone={CAT[p.category] || "slate"}>{p.category || "Khác"}</Badge>
              <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{p.name}</div>
              <Badge tone={t}>{l}</Badge>
            </div>); })}
            {!r.cps.length && <div className="text-[13px] text-slate-400">Chưa có job.</div>}</div>
        </div>
        <div className="card p-4 lg:col-span-4">
          <h3 className="mb-2 text-[15px] font-extrabold text-slate-800">Kênh chi tiết · 30 ngày</h3>
          <div className="space-y-2">
            {r.ads.map((a) => <Row key={a.id} t={a.name} s={`${a.platform === "google" ? "Google" : "Meta"} · chi ${formatShort(a.spend)} · ${a.results} KQ`} b={a.verdict && <Badge tone={a.verdict.tone}>{a.verdict.label}</Badge>} />)}
            {r.webs.map((s) => <Row key={s.domain} t={s.domain} s={`${s.clicks ?? "—"} click · ${s.users ?? "—"} người · ${s.conv ?? "—"} chuyển đổi`} />)}
            {r.pages.map((p) => <Row key={p.id} t={p.name} s={`${formatShort(p.reach || 0)} tiếp cận · ${p.messages ?? "—"} tin nhắn`} />)}
            {!r.ads.length && !r.webs.length && !r.pages.length && <div className="text-[13px] text-slate-400">{loading ? "Đang lấy số…" : "Chưa gắn kênh nào."}</div>}
          </div>
        </div>
        <div className="card p-4 lg:col-span-4">
          <h3 className="mb-2 text-[15px] font-extrabold text-slate-800">Hoạt động gần đây</h3>
          <div className="space-y-2 text-[13px]">
            {late.map((t) => <div key={t.id} className="flex gap-2"><span className="w-14 shrink-0 text-[12px] font-bold text-rose-500">{t.date.slice(8)}/{t.date.slice(5, 7)}</span><span className="text-slate-700">Việc trễ: {t.title}</span></div>)}
            {recent.map((x) => <div key={x.projectId + x.id} className="flex gap-2"><span className="w-14 shrink-0 text-[12px] text-slate-400">{x.date ? `${x.date.slice(8)}/${x.date.slice(5, 7)}` : ""}</span><span className="text-slate-700">Thu {x.projectName}{x.label ? ` · ${x.label}` : ""} · <b>{formatShort(x.revenue)}</b>{x.debt > 0 ? <span className="text-rose-500"> (còn nợ {formatShort(x.debt)})</span> : ""}</span></div>)}
            {!recent.length && !late.length && <div className="text-slate-400">Chưa có hoạt động.</div>}
          </div>
        </div>
        <div className="card p-4 lg:col-span-4">
          <h3 className="mb-2 text-[15px] font-extrabold text-slate-800">Tài nguyên</h3>
          <div className="space-y-1.5">{res.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[13px] font-semibold text-slate-700 hover:text-indigo-600"><span className="min-w-0 flex-1 truncate">{x.title || x.url}</span><ExternalLink size={13} className="shrink-0 opacity-50" /></a>)}
            {!res.length && <div className="text-[13px] text-slate-400">Chưa có tài nguyên.</div>}
            <Link to="/tai-nguyen" className="block pt-1 text-[12px] font-bold text-indigo-600">Mở Tài nguyên →</Link></div>
        </div>
      </div>
    </div>
  );
}

function Row({ t, s, b }) {
  return <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5"><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-slate-800">{t}</div><div className="truncate text-[11.5px] text-slate-400">{s}</div></div>{b}</div>;
}

function AiReport({ ai, err, onClose }) {
  const [copied, setCopied] = useState(false);
  if (err) return <div className="card flex items-start gap-2 p-4 text-[13px] text-rose-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{err}</span><button onClick={onClose} className="font-bold text-slate-500">Đóng</button></div>;
  const copy = async () => { try { await navigator.clipboard.writeText(ai.client); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* trình duyệt chặn */ } };
  return (
    <div className="card grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-2 text-[13px] text-slate-700">
        <div className="flex items-center gap-2"><Sparkles size={15} className="text-indigo-500" /><b className="text-slate-900">Nhận định nội bộ</b></div>
        <p>{ai.overview}</p>
        {ai.results.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{ai.results.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {ai.next.length > 0 && <><b className="block pt-1 text-slate-900">Việc tháng tới</b><ul className="list-disc space-y-0.5 pl-5">{ai.next.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      </div>
      <div className="rounded-2xl bg-slate-50 p-3 text-[13px]">
        <div className="mb-1.5 flex items-center gap-2"><b className="text-slate-900">Bản gửi khách</b><span className="text-[11.5px] text-slate-400">không có số tiền nội bộ</span>
          <button onClick={copy} className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-indigo-600 ring-1 ring-slate-200">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Đã chép" : "Chép"}</button></div>
        <div className="whitespace-pre-line text-slate-700">{ai.client}</div>
        <button onClick={onClose} className="no-print mt-2 text-[12px] font-bold text-slate-400 hover:text-slate-700">Đóng</button>
      </div>
    </div>
  );
}
