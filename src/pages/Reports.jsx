// Trung tâm báo cáo (/bao-cao) + Thương hiệu 360 (/bao-cao/:id) — 31/10, sếp duyệt bản demo "QWS Bento".
// Số kênh lấy từ lib/reports.js (Quảng cáo, Website Google, Fanpage) + Kế toán (đợt thu) + Công việc + Tài nguyên.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { RefreshCw, Printer, Sparkles, Loader2, ChevronDown, ArrowLeft, Check, Copy, Link2, ExternalLink, AlertTriangle, Columns3 } from "lucide-react";
import { Badge, FitMoney, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useReportData, buildBrandRows, linkChannels, monthKey, squash, missingMeasure, reportCompleteness, completenessText } from "../lib/reports.js";
import { MeasurePanel } from "../components/MeasureAlerts.jsx";
import { ask } from "../components/ConfirmDialog.jsx";
import { AnswerCard, BrandAvatar } from "../components/ReportKit.jsx";
export { BrandAvatar };
import { allInstallments } from "../lib/selectors.js";
import { aiBrandReport } from "../lib/ai.js";
import { fmtDateVI, todayISO } from "../lib/format.js";

const TONE = { g: "bg-emerald-50 text-emerald-700", w: "bg-amber-50 text-amber-700", b: "bg-rose-50 text-rose-700", n: "bg-slate-100 text-slate-400" };
const DOT = { g: "bg-emerald-500", w: "bg-amber-400", b: "bg-rose-500", n: "bg-slate-200" };
const STATE = { g: ["emerald", "Đạt chỉ tiêu"], w: ["amber", "Cần theo dõi"], b: ["rose", "Cần chú ý"] };
const CAT = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const PJ = { doing: ["amber", "Đang làm"], done: ["emerald", "Hoàn thành"], paused: ["sky", "Tạm dừng"], cancel: ["rose", "Đã huỷ"] };
const pct = (d) => (d == null ? "" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))}%`);


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

// ---------- Kiểm đủ số trước khi gửi (11/11) ----------
const CST = { ok: ["bg-emerald-500", "text-emerald-700"], partial: ["bg-amber-400", "text-amber-700"], missing: ["bg-rose-500", "text-rose-600"] };
const badLine = (c) => c.bad.map((x) => `${x.label}${x.note ? ` (${x.note})` : ""}`).join(" · ");
// Hỏi lại trước khi gửi / chép / xuất khi còn thiếu số — trả true = vẫn làm
async function confirmComplete(comp, what) {
  if (!comp?.bad?.length) return true;
  return !!(await ask(`${completenessText(comp)}\n${badLine(comp)}\nKhách có thể hiểu nhầm là kênh bị giảm. Vẫn ${what}?`, { title: "Báo cáo chưa đủ số", ok: `Vẫn ${what}`, danger: false }));
}
// Chỉ báo độ đủ số trên trang thương hiệu: "Đủ số 5/5" hoặc "Thiếu số 2/5" + từng kênh
function CompletenessBar({ comp, loading }) {
  if (!comp.total) return null;
  const good = !comp.bad.length;
  return (
    <div className={`card flex flex-wrap items-center gap-x-3 gap-y-1.5 !px-4 !py-3 ${good ? "" : "ring-1 ring-amber-200"}`}>
      <span className={`inline-flex items-center gap-1.5 text-[13px] font-extrabold ${loading ? "text-slate-400" : good ? "text-emerald-700" : "text-amber-700"}`}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : good ? <Check size={14} /> : <AlertTriangle size={14} />}
        {loading ? "Đang kiểm số…" : good ? `Đủ số ${comp.ok}/${comp.total}` : `${completenessText(comp)} · ${comp.ok}/${comp.total} đủ`}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {comp.items.map((x) => (
          <span key={x.key} title={x.note || "Đủ số cả kỳ"} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11.5px] font-bold text-slate-600">
            <i className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-slate-300" : CST[x.status][0]}`} />{x.label}{!loading && x.note && <span className={`font-semibold ${CST[x.status][1]}`}>· {x.note}</span>}
          </span>
        ))}
      </span>
    </div>
  );
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
// Cột bảng tổng — sếp bật/tắt được (lưu settings.reportHide = các cột đang ẩn, cột mới mặc định hiện)
const COLS = [["rev", "Doanh thu tháng"], ["ads", "Quảng cáo"], ["web", "Website Google"], ["fp", "Fanpage"], ["seo", "SEO (hiển thị)"], ["late", "Việc trễ"], ["rep", "Báo cáo"]];

function ReportMatrix() {
  const { rows, rep } = useRows();
  const { settings = {}, setSettings, projects = [] } = useData();
  const miss = missingMeasure(rows, rep.data, settings.measureSkip || {});
  const nav = useNavigate();
  const [f, setF] = useState("att");
  const [pick, setPick] = useState(false);
  const loading = rep.loading && !rep.data?.at;
  const hide = settings.reportHide || [];
  const cols = COLS.filter(([k]) => !hide.includes(k));
  const flip = (k) => setSettings({ reportHide: hide.includes(k) ? hide.filter((x) => x !== k) : [...hide, k] });
  const list = useMemo(() => {
    const L = rows.filter((r) => r.jobs.length || r.ads.length || r.webs.length || r.pages.length || r.revenue);
    return [...L].sort(f === "att" ? (a, b) => b.score - a.score || b.revenue - a.revenue : (a, b) => b.revenue - a.revenue);
  }, [rows, f]);
  const active = rows.filter((r) => r.jobs.length);
  const sent = rows.filter((r) => r.rep.t === "g").length;
  const comps = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, reportCompleteness(r, rep.data, rep.period)])), [rows, rep.data, rep.period]);
  const lacking = loading ? [] : list.filter((r) => comps[r.id]?.bad.length);
  const printPdf = async () => {
    if (lacking.length && !(await ask(`${lacking.length} thương hiệu thiếu số\n${lacking.slice(0, 5).map((r) => `${r.name}: ${comps[r.id].bad.map((x) => x.label).join(", ")}`).join("\n")}${lacking.length > 5 ? `\n… và ${lacking.length - 5} thương hiệu khác` : ""}\nVẫn xuất PDF?`, { title: "Báo cáo chưa đủ số", ok: "Vẫn xuất PDF", danger: false }))) return;
    window.print();
  };
  const miniComp = (r) => { const c = comps[r.id]; return !loading && c?.bad.length ? <span title={c.bad.map((x) => `${x.label}${x.note ? ` (${x.note})` : ""}`).join(" · ")} className="mt-0.5 block whitespace-nowrap text-[11px] font-bold text-amber-600">thiếu {c.bad.length}/{c.total} số</span> : null; };
  const chips = [["att", "Cần chú ý trước"], ["all", "Theo doanh thu"]];
  const cell = {
    rev: (r) => <td key="rev" className="whitespace-nowrap px-3 py-2.5 tabular-nums"><div className="font-bold text-slate-800">{r.revenue ? formatShort(r.revenue) : "—"}</div>{r.prevRevenue > 0 && <div className="text-[11px] text-slate-400">T trước {formatShort(r.prevRevenue)}</div>}{r.debt > 0 && <div className="text-[11px] font-bold text-rose-500">nợ {formatShort(r.debt)}</div>}</td>,
    ads: (r) => <td key="ads" className="px-3 py-2.5"><CellPill x={r.cells.ads} loading={loading} /></td>,
    web: (r) => <td key="web" className="px-3 py-2.5"><CellPill x={r.cells.web} loading={loading} /></td>,
    fp: (r) => <td key="fp" className="px-3 py-2.5"><CellPill x={r.cells.fp} loading={loading} /></td>,
    seo: (r) => <td key="seo" className="px-3 py-2.5"><CellPill x={r.cells.seo} loading={loading} /></td>,
    late: (r) => <td key="late" className="px-3 py-2.5 tabular-nums">{r.late ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-700">{r.late}</span> : <span className="text-slate-300">0</span>}</td>,
    rep: (r) => <td key="rep" className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${TONE[r.rep.t]}`}>{r.rep.v}</span>{miniComp(r)}</td>,
  };
  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Trung tâm báo cáo</h2>
          <p className="text-[13px] text-slate-500">Mọi thương hiệu và job trên 1 bảng · kênh: 30 ngày {fmtDateVI(rep.period.since)} – {fmtDateVI(rep.period.until)} so với 30 ngày trước · doanh thu: tháng này</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={rep.reload} disabled={rep.loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60"><RefreshCw size={14} className={rep.loading ? "animate-spin" : ""} /> {rep.loading ? "Đang lấy số…" : "Làm mới"}</button>
          <button onClick={printPdf} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700"><Printer size={14} /> Xuất PDF</button>
        </div>
      </div>

      <MatrixAnswer list={list} loading={loading} miss={miss} errors={rep.data?.errors || []} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Thương hiệu · job đang chạy" value={`${active.length} · ${active.reduce((a, r) => a + r.jobs.length, 0)}`} sub={`${rows.length} khách đang hoạt động`} />
        <Tile label="Đạt chỉ tiêu" value={list.filter((r) => r.state === "g").length} sub="không kênh nào dưới chỉ tiêu" tone="text-emerald-600" />
        <Tile label="Cần chú ý" value={list.filter((r) => r.state === "b").length} sub="có kênh đi xuống / đắt" tone="text-rose-600" />
        <Tile label={`Báo cáo tháng ${Number(monthKey().slice(5))} đã gửi`} value={`${sent}/${active.length || rows.length}`} sub="bấm thương hiệu để soạn & đánh dấu" />
      </div>

      <TodoCard list={list} miss={miss} loading={loading} />
      {rep.data?.errors?.length > 0 && <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Một số kênh chưa lấy được số: {rep.data.errors.join(" · ")}</span></div>}

      <div className="card overflow-hidden p-0">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {chips.map(([k, l]) => <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${f === k ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>)}
          <button onClick={() => setPick((v) => !v)} aria-expanded={pick} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold ${pick ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><Columns3 size={14} /> Cột {hide.length > 0 && <span className="opacity-70">{cols.length}/{COLS.length}</span>}</button>
          <span className="ml-auto hidden text-[11.5px] text-slate-400 sm:inline">Màu: <i className="mx-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />đạt <i className="mx-1 inline-block h-2 w-2 rounded-full bg-amber-400" />theo dõi <i className="mx-1 inline-block h-2 w-2 rounded-full bg-rose-500" />dưới chỉ tiêu</span>
          {pick && <div className="flex w-full flex-wrap gap-1.5 pt-1">
            {COLS.map(([k, l]) => { const on = !hide.includes(k); return <button key={k} onClick={() => flip(k)} aria-pressed={on} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-bold ${on ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-400 line-through"}`}>{on && <Check size={12} />}{l}</button>; })}
          </div>}
        </div>
        {/* Điện thoại: mỗi thương hiệu 1 thẻ (bảng ngang phải vuốt khó đọc) */}
        <div className="divide-y divide-slate-100 sm:hidden">
          {list.map((r) => (
            <button key={r.id} onClick={() => nav(`/bao-cao/${r.id}`)} className="grid w-full gap-2 p-3 text-left active:bg-slate-50">
              <span className="flex items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} /><BrandAvatar r={r} />
                <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-800">{r.name}</span><span className="block truncate text-[11.5px] text-slate-400">{r.jobs.length ? [...new Set(r.jobs.map((j) => j.category || j.name))].join(", ") : "không job đang chạy"}</span></span>
                {cols.some(([k]) => k === "rep") && <span className="shrink-0 text-right"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${TONE[r.rep.t]}`}>{r.rep.v}</span>{miniComp(r)}</span>}
              </span>
              <span className="grid grid-cols-2 gap-x-3 gap-y-1.5 pl-4">
                {cols.filter(([k]) => k !== "rep" && (k === "rev" ? r.revenue || r.debt : k === "late" ? r.late : r.cells[k]?.v != null || loading)).map(([k, h]) => (
                  <span key={k} className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</span>
                    {k === "rev" ? <span className="text-[13px] font-bold tabular-nums text-slate-800">{r.revenue ? formatShort(r.revenue) : "—"}{r.debt > 0 && <span className="ml-1 text-[11px] text-rose-500">nợ {formatShort(r.debt)}</span>}</span>
                      : k === "late" ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-700">{r.late} việc</span>
                      : <CellPill x={r.cells[k]} loading={loading} />}
                  </span>))}
              </span>
            </button>
          ))}
          {!list.length && <div className="p-8 text-center text-slate-400">Chưa có thương hiệu nào đang chạy.</div>}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-[13px]" style={{ minWidth: 260 + cols.length * 110 }}>
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {["Thương hiệu · job", ...cols.map(([, h]) => h)].map((h) => <th key={h} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => nav(`/bao-cao/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/bao-cao/${r.id}`)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70">
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} /><BrandAvatar r={r} />
                    <div className="min-w-0"><div className="font-bold text-slate-800">{r.name}</div><div className="max-w-[230px] truncate text-[11.5px] text-slate-400">{r.jobs.length ? [...new Set(r.jobs.map((j) => j.category || j.name))].join(", ") : "không job đang chạy"}</div></div>
                  </div></td>
                  {cols.map(([k]) => cell[k](r))}
                </tr>
              ))}
              {!list.length && <tr><td colSpan={cols.length + 1} className="p-8 text-center text-slate-400">Chưa có thương hiệu nào đang chạy.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <MeasurePanel items={miss} projects={projects} />
      <LinkEditor data={rep.data} />
    </div>
  );
}

// Câu trả lời đầu trang + "Việc nên làm hôm nay" (tự rút từ ô đỏ / việc trễ / thiếu đo lường — không gọi AI)
const CH = { ads: "quảng cáo", web: "website", fp: "fanpage", seo: "SEO" };
function MatrixAnswer({ list, loading, miss, errors = [] }) {
  if (loading) return <AnswerCard eyebrow="Trung tâm báo cáo" title="Đang lấy số các kênh…" />;
  // 01/11: kênh lỗi → nói rõ, KHÔNG báo "mọi thứ đạt" (trước mất mạng là ra "Cả 10 thương hiệu không có kênh nào dưới chỉ tiêu")
  const failed = errors.map((e) => String(e).split(":")[0]).filter(Boolean);
  if (failed.length) return <AnswerCard eyebrow="Trung tâm báo cáo · 30 ngày" title={`Chưa lấy được số ${failed.join(", ").toLowerCase()} — bấm Làm mới`} desc="Kênh lỗi đang để trống, đừng đọc là 'đạt chỉ tiêu'. Thường do mạng chập chờn hoặc trang tải lại giữa chừng." />;
  const bad = list.filter((r) => r.state === "b"), good = list.filter((r) => r.state === "g");
  const why = (r) => Object.entries(r.cells).filter(([, x]) => x.t === "b").map(([k]) => CH[k]).join(", ");
  const desc = [bad.slice(0, 2).map((r) => `${r.name} tụt ${why(r) || "nhiều việc trễ"}`).join(" · "), miss.length ? `${miss.length} job chưa gắn đo lường` : null].filter(Boolean).join(" · ");
  return <AnswerCard eyebrow="Trung tâm báo cáo · 30 ngày" title={bad.length ? `${bad.length} thương hiệu cần xử lý, ${good.length} đang đạt chỉ tiêu` : `Cả ${list.length} thương hiệu không có kênh nào dưới chỉ tiêu`} desc={desc} live="Số các kênh nhớ 20 phút" />;
}
function TodoCard({ list, miss, loading }) {
  const nav = useNavigate();
  if (loading) return null;
  const items = [];
  for (const r of list) {
    for (const [k, x] of Object.entries(r.cells)) if (x.t === "b") items.push({ w: 3 + (x.d != null ? Math.min(3, Math.abs(x.d) / 20) : 0), id: r.id, t: `${r.name}: xem lại ${CH[k]}`, s: `${x.v || ""}${x.d != null ? ` · ${x.d >= 0 ? "+" : "−"}${Math.abs(Math.round(x.d))}% so kỳ trước` : ""}${x.sub ? ` · ${x.sub}` : ""}`, tone: "rose" });
    if (r.late) items.push({ w: 2 + r.late, id: r.id, t: `${r.name}: ${r.late} việc trễ hạn`, s: "Mở thương hiệu để xem việc trễ", tone: "amber" });
  }
  if (miss.length) items.push({ w: 2.5, to: "#do-luong", t: `Gắn đo lường cho ${miss.length} job`, s: miss.slice(0, 3).map((x) => x.job).join(" · "), tone: "indigo" });
  const top = items.sort((a, b) => b.w - a.w).slice(0, 3);
  if (!top.length) return null;
  const TONE_I = { rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-700", indigo: "bg-indigo-50 text-indigo-600" };
  return (
    <div className="card !p-4">
      <div className="mb-2 flex items-baseline justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Kênh cần xem lại</h3><span className="hidden text-[11.5px] text-slate-400 sm:inline">rút từ ô đỏ, việc trễ, thiếu đo lường</span></div>
      <div className="grid gap-2 md:grid-cols-3">
        {top.map((x, i) => (
          <button key={i} type="button" onClick={() => (x.id ? nav(`/bao-cao/${x.id}`) : document.getElementById("do-luong")?.scrollIntoView({ behavior: "smooth", block: "center" }))} className="flex gap-2.5 rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold ${TONE_I[x.tone]}`}>{i + 1}</span>
            <span className="min-w-0"><span className="block text-[13px] font-bold text-slate-800">{x.t}</span><span className="block text-[11.5px] text-slate-400">{x.s}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums sm:text-2xl ${tone}`}>{value}</div>
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
  const unl = (data?.web || []).filter((s) => !L.web[s.domain] && links.web?.[s.domain] !== "none").length + (data?.pages || []).filter((p) => !L.page[p.id] && links.page?.[p.id] !== "none").length; // "Không thuộc khách nào" = đã xử lý
  return (
    <div className="card no-print p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-4 text-left">
        <Link2 size={16} className="text-indigo-500" /><span className="text-sm font-extrabold text-slate-800">Gắn website & fanpage với khách</span>
        {unl > 0 && <span className="shrink-0 whitespace-nowrap"><Badge tone="amber">{unl} chưa gắn</Badge></span>}
        <span className="ml-auto hidden text-[12px] text-slate-400 sm:inline">tài khoản quảng cáo gắn ở <Link onClick={(e) => e.stopPropagation()} to="/cai-dat" className="font-bold text-indigo-600">Cài đặt</Link></span>
        <ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition sm:ml-0 ${open ? "rotate-180" : ""}`} />
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
  const comp = reportCompleteness(r, rep.data, rep.period);
  const markSent = async () => {
    if (!sent && !(await confirmComplete(comp, "đánh dấu đã gửi"))) return;
    const log = settings.reportLog || {}; setSettings({ reportLog: { ...log, [id]: { ...(log[id] || {}), [mk]: sent ? undefined : today } } }); setToast?.({ text: sent ? "Đã bỏ đánh dấu gửi báo cáo" : "Đã đánh dấu gửi báo cáo tháng này" });
  };
  const runAi = async () => {
    setBusy(true); setErr("");
    try {
      const data = { thuong_hieu: r.name, loai: r.type, ky_kenh: `${rep.period.since} → ${rep.period.until}`,
        job: r.jobs.map((j) => ({ ten: j.name, loai: j.category })),
        quang_cao: r.ads.map((a) => ({ ten: a.name, nen_tang: a.platform, chi: Math.round(a.spend), ket_qua: a.results, gia_kq: a.results ? Math.round(a.spend / a.results) : null, chi_ky_truoc: a.prevSpend, kq_ky_truoc: a.prevResults, danh_gia: a.verdict?.label })),
        website: r.webs.map((s) => ({ ten: s.domain, click: s.clicks, d_click: s.prevClicks ? Math.round(((s.clicks - s.prevClicks) / s.prevClicks) * 100) : null, hien_thi: s.impressions, vi_tri_tb: s.position, nguoi_dung: s.users, chuyen_doi: s.conv })),
        fanpage: r.pages.map((p) => ({ ten: p.name, tiep_can: p.reach, tin_nhan: p.messages, tin_nhan_ky_truoc: p.prevMessages, tuong_tac: p.engagement })),
        viec_tre: r.late,
        // Kênh thiếu số / chưa phủ hết kỳ → AI không được kết luận là giảm
        so_lieu_thieu: comp.bad.map((x) => `${x.label}${x.note ? `: ${x.note}` : ""}`) };
      setAi(await aiBrandReport({ data, apiKey: settings.openaiKey }));
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const tile = (label, cell, main, sub) => (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      {loading && cell?.v == null ? <div className="mt-2 h-7 w-24 animate-pulse rounded-lg bg-slate-100" /> : <>
        <div className={`mt-1 text-xl font-extrabold tabular-nums sm:text-2xl ${cell && cell.v == null ? "text-slate-300" : "text-slate-900"}`}>{main}</div>
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
            <div className="text-[13px] text-slate-500">{r.jobs.length} job đang chạy · {r.ads.length} TK quảng cáo · {r.webs.length} website · {r.pages.length} fanpage</div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <Badge tone={stTone}>{stLabel}</Badge>
            <button onClick={markSent} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold ${sent ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}><Check size={14} /> {sent ? `Đã gửi BC T${Number(mk.slice(5))}` : `Đánh dấu đã gửi BC T${Number(mk.slice(5))}`}</button>
            <button onClick={runAi} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Soạn báo cáo tháng (AI)</button>
          </div>
        </div>
      </div>

      <CompletenessBar comp={comp} loading={loading} />

      {(ai || err) && <AiReport ai={ai} err={err} beforeCopy={() => confirmComplete(comp, "chép gửi khách")} onClose={() => { setAi(null); setErr(""); }} />}

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

function AiReport({ ai, err, onClose, beforeCopy }) {
  const [copied, setCopied] = useState(false);
  if (err) return <div className="card flex items-start gap-2 p-4 text-[13px] text-rose-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{err}</span><button onClick={onClose} className="font-bold text-slate-500">Đóng</button></div>;
  const copy = async () => { if (beforeCopy && !(await beforeCopy())) return; try { await navigator.clipboard.writeText(ai.client); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* trình duyệt chặn */ } };
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
