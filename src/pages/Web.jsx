import { Fragment, useEffect, useMemo, useState } from "react";
import { Globe, RefreshCw, ArrowLeft, Sparkles, Loader2, AlertTriangle, TrendingUp, TrendingDown, EyeOff, Eye, ExternalLink, CheckCircle2, Lightbulb, Search, MousePointerClick, Users, Target, Info } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, Badge, DateField } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { loadSites, loadSiteSummary, loadSiteDetail, rangesOf, pctChange, expectedCtr } from "../lib/webData.js";
import { setGoogleProxy } from "../lib/google.js";
import { Star, Bot } from "lucide-react";
import { aiWebAnalysis } from "../lib/ai.js";

// ---------- định dạng ----------
export const int = (v) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));
export const k = (v) => (v == null ? "—" : v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(".", ",") + "k" : Math.round(v).toLocaleString("vi-VN"));
export const pct1 = (v) => (v == null ? "—" : Number(v).toFixed(1).replace(".", ",") + "%");
const pos1 = (v) => (v == null ? "—" : Number(v).toFixed(1).replace(".", ","));
const dur = (s) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}p${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)}s`);
export const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
export const PRESETS = [[7, "7 ngày"], [28, "28 ngày"], [90, "3 tháng"]];

// Chọn kỳ: 7 / 28 / 90 ngày hoặc Tuỳ chọn (từ ngày → đến ngày). value = số ngày | { since, until }
export function RangePicker({ value, onChange, maxDate }) {
  const custom = value && typeof value === "object";
  const yIso = maxDate || todayIso();
  const [draft, setDraft] = useState(custom ? value : { since: shiftIso(yIso, -27), until: yIso });
  const today = new Date();
  const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
  const quick = [
    ["Tháng này", { since: ym(today.getFullYear(), today.getMonth()) + "-01", until: yIso }],
    ["Tháng trước", (() => { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); return { since: ym(d.getFullYear(), d.getMonth()) + "-01", until: ym(d.getFullYear(), d.getMonth()) + "-" + lastDay(d.getFullYear(), d.getMonth()) }; })()],
    ["Năm nay", { since: today.getFullYear() + "-01-01", until: yIso }],
  ];
  const btn = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`;
  const [open, setOpen] = useState(custom);
  return (
    <>
      {PRESETS.map(([d, l]) => <button key={d} onClick={() => { setOpen(false); onChange(d); }} className={btn(!custom && !open && value === d)}>{l}</button>)}
      <button onClick={() => setOpen(true)} className={btn(custom || open)}>Tuỳ chọn</button>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <DateField value={draft.since} onChange={(v) => setDraft((d) => ({ since: v, until: d.until < v ? v : d.until }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <span className="text-slate-400">→</span>
          <DateField value={draft.until} onChange={(v) => setDraft((d) => ({ since: d.since > v ? v : d.since, until: v }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <button onClick={() => onChange({ ...draft })} className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white">Xem</button>
          {quick.map(([l, r]) => <button key={l} onClick={() => { setDraft(r); onChange(r); }} className="rounded-md px-2 py-1 font-semibold text-indigo-600 hover:bg-indigo-50">{l}</button>)}
        </div>
      )}
    </>
  );
}
const shiftIso = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Mũi tên % thay đổi. lowerBetter: vị trí (giảm = tốt). abs: so chênh lệch tuyệt đối (vị trí).
export function Delta({ cur, prev, lowerBetter, abs }) {
  if (cur == null || prev == null || (!abs && !prev)) return null;
  const d = abs ? cur - prev : pctChange(cur, prev);
  if (d == null || !isFinite(d) || Math.abs(d) < (abs ? 0.05 : 0.5)) return <span className="text-[10.5px] font-bold text-slate-400">0</span>;
  const up = d > 0, good = lowerBetter ? !up : up;
  const I = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[10.5px] font-bold ${good ? "text-emerald-600" : "text-rose-600"}`}><I size={11} />{abs ? Math.abs(d).toFixed(1).replace(".", ",") : Math.abs(d).toFixed(0) + "%"}</span>;
}

export function Spark({ data, field = "clicks" }) {
  if (!data?.length || data.length < 3) return null;
  const v = data.map((d) => d[field] || 0), max = Math.max(...v, 1), W = 120, H = 28;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * W},${H - (x / max) * (H - 2) - 1}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

// ---------- cache trong phiên (10 phút) ----------
const CACHE = new Map();
const cached = async (key, fn) => {
  const c = CACHE.get(key);
  if (c && Date.now() - c.at < 600000) return c.v;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  return v;
};

// Thanh tỉ lệ nguồn truy cập (theo phiên) + chú thích
function SourceBar({ groups, max = 5, big }) {
  if (!groups?.length) return null;
  const ai = groups.find((g) => g.key === "ai");
  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${big ? "h-3" : "h-2"}`}>
        {groups.filter((g) => g.share >= 0.5).map((g) => <div key={g.key} title={`${g.label}: ${int(g.cur.sessions)} phiên (${pct1(g.share)})`} style={{ width: g.share + "%", background: g.color }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px] text-slate-500">
        {groups.slice(0, max).map((g) => <span key={g.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label.replace(/ \(.*\)/, "")} <b className="text-slate-700">{pct1(g.share)}</b></span>)}
        {ai && groups.indexOf(ai) >= max && <span className="flex items-center gap-1 font-bold text-violet-600"><Bot size={11} />AI {pct1(ai.share)}</span>}
      </div>
    </div>
  );
}

function SiteCard({ site, sum, onOpen }) {
  const g = sum?.gsc, a = sum?.ga;
  const M = ({ label, v, d }) => (
    <div className="min-w-0"><div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="flex items-baseline gap-1"><span className="text-[15px] font-extrabold tabular-nums text-slate-800">{v}</span>{d}</div></div>
  );
  return (
    <button onClick={onOpen} className="card block w-full p-3 text-left transition hover:bg-indigo-50/30">
      <div className="flex items-center gap-2">
        <Globe size={15} className="shrink-0 text-indigo-500" />
        <span className="truncate text-[14px] font-extrabold text-slate-800">{site.domain}</span>
        {sum?.verdict && <span className="ml-auto shrink-0"><Badge tone={sum.verdict.tone}>{sum.verdict.label}</Badge></span>}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] font-bold">
        <span className={site.gsc ? "text-emerald-600" : "text-slate-300"}>● Search Console</span>
        <span className={site.ga ? "text-emerald-600" : "text-slate-300"}>● GA4</span>
      </div>
      {!sum ? <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" /> : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
            <M label="Click Google" v={k(g?.cur.clicks)} d={g && <Delta cur={g.cur.clicks} prev={g.prev.clicks} />} />
            <M label="Hiển thị" v={k(g?.cur.impressions)} d={g && <Delta cur={g.cur.impressions} prev={g.prev.impressions} />} />
            <M label="Vị trí TB" v={pos1(g?.cur.position)} d={g && <Delta cur={g.cur.position} prev={g.prev.position} lowerBetter abs />} />
            <M label="Người dùng" v={k(a?.cur.activeUsers)} d={a && <Delta cur={a.cur.activeUsers} prev={a.prev.activeUsers} />} />
            <M label="Tương tác" v={a?.cur.engagementRate != null ? pct1(a.cur.engagementRate * 100) : "—"} d={a && <Delta cur={a.cur.engagementRate} prev={a.prev.engagementRate} />} />
            <M label="Chuyển đổi" v={k(a?.cur.keyEvents)} d={a && <Delta cur={a.cur.keyEvents} prev={a.prev.keyEvents} />} />
          </div>
          {g?.daily && <div className="mt-2"><Spark data={g.daily} /></div>}
          {sum.sources?.length > 0 && <div className="mt-2 border-t border-slate-100 pt-2"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Nguồn truy cập</div><SourceBar groups={sum.sources} max={4} /></div>}
          {sum.errors.length > 0 && <div className="mt-1 truncate text-[10.5px] font-semibold text-amber-600" title={sum.errors.join("\n")}>⚠ {sum.errors[0]}</div>}
        </>
      )}
    </button>
  );
}

export function Table({ rows, cols, empty = "Không có dữ liệu trong kỳ" }) {
  if (!rows?.length) return <div className="py-4 text-center text-xs text-slate-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] sm:min-w-[620px]">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">{cols.map((c, i) => <th key={i} className={`py-2 pr-3 ${c.right ? "text-right" : ""} ${c.sm ? "hidden sm:table-cell" : ""}`}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-50 align-top">{cols.map((c, i) => <td key={i} className={`py-1.5 pr-3 ${c.right ? "text-right tabular-nums" : ""} ${c.wide ? "max-w-[180px] sm:max-w-[360px]" : ""} ${c.sm ? "hidden sm:table-cell" : ""}`}>{c.v(r)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
const short = (u) => { try { const x = new URL(u); return decodeURIComponent(x.pathname + x.search) || "/"; } catch { return u; } };
const Name = ({ t, href }) => (
  <div className="flex min-w-0 items-center gap-1"><span className="truncate font-semibold text-slate-700" title={t}>{t}</span>{href && <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-slate-300 hover:text-indigo-600"><ExternalLink size={11} /></a>}</div>
);

export function AiBox({ r, titles = ["SEO & thứ hạng", "Ý tưởng nội dung", "Nguồn khách & chuyển đổi"] }) {
  if (!r) return null;
  const List = ({ title, items, icon: I, tone }) => items?.length ? (
    <div><div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>{items.map((t) => <div key={t} className={`mt-1 flex gap-1.5 text-[12.5px] leading-snug ${tone}`}><I size={13} className="mt-0.5 shrink-0" />{t}</div>)}</div>
  ) : null;
  return (
    <div className="mt-3 space-y-3">
      {r.overview && <div className="rounded-xl bg-violet-50 p-3 text-[13px] font-semibold leading-relaxed text-violet-900">{r.overview}</div>}
      {r.priorities?.length > 0 && (
        <ol className="space-y-1.5">
          {r.priorities.map((p, i) => (
            <li key={i} className="flex gap-2 rounded-xl border border-slate-100 p-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 text-[12.5px]"><div className="font-bold text-slate-800">{p.what}</div>{p.how && <div className="text-slate-600">{p.how}</div>}{p.impact && <div className="mt-0.5 font-semibold text-emerald-700">→ {p.impact}</div>}</div>
            </li>
          ))}
        </ol>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <List title={titles[0]} items={r.seo} icon={Search} tone="text-slate-700" />
        <List title={titles[1]} items={r.content} icon={Lightbulb} tone="text-indigo-700" />
        <List title={titles[2]} items={r.conversion} icon={Target} tone="text-slate-700" />
      </div>
      {r.needData?.length > 0 && <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500"><b>Để đánh giá chuẩn hơn:</b> {r.needData.join(" · ")}</div>}
    </div>
  );
}

// Gói số liệu gọn gửi AI (đã tính sẵn % thay đổi)
function aiPayload(site, sum, det, R) {
  const g = sum.gsc, a = sum.ga, d = (c, p) => { const x = pctChange(c, p); return x == null ? null : Math.round(x); };
  return {
    web: site.domain, so_ngay: R.days, ky_gsc: R.gsc.cur, ky_ga: R.ga.cur,
    gsc: g && { clicks: g.cur.clicks, d_clicks: d(g.cur.clicks, g.prev.clicks), impressions: g.cur.impressions, d_impressions: d(g.cur.impressions, g.prev.impressions), ctr: +g.cur.ctr.toFixed(2), position: g.cur.position && +g.cur.position.toFixed(1), position_truoc: g.prev.position && +g.prev.position.toFixed(1) },
    ga4: a && { users: a.cur.activeUsers, d_users: d(a.cur.activeUsers, a.prev.activeUsers), new_users: a.cur.newUsers, sessions: a.cur.sessions, d_sessions: d(a.cur.sessions, a.prev.sessions), engagement_rate: a.cur.engagementRate && +(a.cur.engagementRate * 100).toFixed(1), avg_time_s: Math.round(a.cur.averageSessionDuration || 0), key_events: a.cur.keyEvents, d_key_events: d(a.cur.keyEvents, a.prev.keyEvents) },
    top_tu_khoa: det.queries?.slice(0, 20).map((q) => ({ q: q.name, clicks: q.clicks, d_clicks: q.prev ? d(q.clicks, q.prev.clicks) : "mới", impr: q.impressions, pos: +q.position.toFixed(1), pos_truoc: q.prev ? +q.prev.position.toFixed(1) : null })),
    co_hoi: det.opportunities && { near: det.opportunities.near.slice(0, 10).map((q) => ({ q: q.name, pos: +q.position.toFixed(1), impr: q.impressions, ctr: +q.ctr.toFixed(1), gain: q.gain })), lowCtr: det.opportunities.lowCtr.slice(0, 6).map((q) => ({ q: q.name, pos: +q.position.toFixed(1), impr: q.impressions, ctr: +q.ctr.toFixed(1), ctr_ky_vong: expectedCtr(q.position), gain: q.gain })) },
    trang_top: det.pages?.slice(0, 10).map((p) => ({ url: short(p.name), clicks: p.clicks, d_clicks: p.prev ? d(p.clicks, p.prev.clicks) : "mới", pos: +p.position.toFixed(1) })),
    trang_tut: det.losingPages?.slice(0, 8).map((p) => ({ url: short(p.name), clicks: p.clicks, clicks_truoc: p.prev.clicks, pos: +p.position.toFixed(1), pos_truoc: +p.prev.position.toFixed(1) })),
    kenh: det.channels?.slice(0, 8).map((c) => ({ kenh: c.name, sessions: c.cur.sessions || 0, d_sessions: d(c.cur.sessions, c.prev.sessions), engagement: c.cur.engagementRate != null ? +(c.cur.engagementRate * 100).toFixed(0) : null, key_events: c.cur.keyEvents || 0 })),
    trang_dich: det.landing?.slice(0, 10).map((l) => ({ url: l.landingPagePlusQueryString, sessions: l.sessions, engagement: +(l.engagementRate * 100).toFixed(0), key_events: l.keyEvents })),
    chuyen_doi: det.conversions?.map((c) => ({ su_kien: c.name, ky_nay: c.cur.keyEvents || 0, ky_truoc: c.prev.keyEvents || 0 })),
    nguon: det.sources?.map((g) => ({ nguon: g.label, phien: g.cur.sessions, ty_trong: +g.share.toFixed(1), d_phien: d(g.cur.sessions, g.prev.sessions), tuong_tac: g.cur.engagementRate != null ? +(g.cur.engagementRate * 100).toFixed(0) : null, chuyen_doi: g.cur.keyEvents, chi_tiet: g.items.slice(0, 4).map((i) => `${i.src}/${i.med}=${i.cur.sessions || 0}`) })),
    su_kien: det.events?.filter((e) => !e.auto).slice(0, 25).map((e) => ({ su_kien: e.name, ten: e.label || null, la_chuyen_doi: e.key, so_lan: e.cur.eventCount || 0, so_nguoi: e.cur.totalUsers || 0, ky_truoc: e.prev.eventCount || 0 })),
    thiet_bi: det.gaDevices?.map((x) => ({ thiet_bi: x.deviceCategory, sessions: x.sessions, engagement: +(x.engagementRate * 100).toFixed(0), key_events: x.keyEvents })),
  };
}

function Detail({ owner, site, sum, R, gaProps, gaOverride, onGa, onHide, onBack, aiState, setAiState, apiKey, aiReady }) {
  const [det, setDet] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(site.ga ? "sources" : "opp");
  const [openSrc, setOpenSrc] = useState(null);
  const [showAuto, setShowAuto] = useState(false);
  useEffect(() => {
    let alive = true; setDet(null); setErr("");
    cached(`d|${site.domain}|${site.gsc}|${site.ga}|${R.key}`, () => loadSiteDetail(site, R)).then((v) => alive && setDet(v)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [site.domain, site.gsc, site.ga, R.key]);
  const g = sum?.gsc, a = sum?.ga;
  const chart = useMemo(() => {
    const m = new Map();
    for (const x of g?.daily || []) m.set(x.date, { date: x.date, clicks: x.clicks, impressions: x.impressions });
    for (const x of det?.gaDaily || []) m.set(x.date, { ...(m.get(x.date) || { date: x.date }), users: x.activeUsers, keyEvents: x.keyEvents });
    return [...m.values()].sort((x, y) => x.date.localeCompare(y.date)).map((x) => ({ ...x, day: dm(x.date) }));
  }, [g, det]);
  const ai = aiState[`${site.domain}|${R.key}`];
  const runAi = async () => {
    const key = `${site.domain}|${R.key}`;
    setAiState((s) => ({ ...s, [key]: { busy: true } }));
    try { const r = await aiWebAnalysis({ data: aiPayload(site, sum, det, R), apiKey }); setAiState((s) => ({ ...s, [key]: { r } })); }
    catch (e) { setAiState((s) => ({ ...s, [key]: { err: e.message || String(e) } })); }
  };

  const KPI = ({ label, v, d, icon: I }) => (
    <div className="bg-white px-3 py-2"><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{I && <I size={11} />}{label}</div><div className="flex items-baseline gap-1.5"><span className="text-lg font-extrabold tabular-nums text-slate-900">{v}</span>{d}</div></div>
  );
  const TABS = [
    site.ga && ["sources", "Nguồn truy cập"], site.ga && ["events", "Sự kiện"],
    site.gsc && ["opp", "Cơ hội SEO"], site.gsc && ["queries", "Từ khoá"], site.gsc && ["pages", "Trang (Google)"], site.ga && ["channels", "Nhóm kênh GA4"], site.ga && ["landing", "Trang đích"], ["device", "Thiết bị & khu vực"],
  ].filter(Boolean);
  const qCols = [
    { h: "Từ khoá", v: (q) => <Name t={q.name} />, wide: true },
    { h: "Click", right: true, v: (q) => <span>{int(q.clicks)} {q.prev ? <Delta cur={q.clicks} prev={q.prev.clicks} /> : <Badge tone="indigo">mới</Badge>}</span> },
    { h: "Hiển thị", right: true, sm: true, v: (q) => int(q.impressions) },
    { h: "CTR", right: true, sm: true, v: (q) => pct1(q.ctr) },
    { h: "Vị trí", right: true, v: (q) => <span>{pos1(q.position)} {q.prev && <Delta cur={q.position} prev={q.prev.position} lowerBetter abs />}</span> },
  ];

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-200"><ArrowLeft size={14} /> Tất cả web</button>
          <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-lg font-extrabold text-slate-900 hover:text-indigo-600">{site.domain} <ExternalLink size={14} className="text-slate-300" /></a>
          {sum?.verdict && <Badge tone={sum.verdict.tone}>{sum.verdict.label}</Badge>}
          {owner && <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-slate-400">GA4:</span>
            <select value={gaOverride[site.domain] || site.ga || ""} onChange={(e) => onGa(e.target.value)} className="max-w-[170px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px]">
              <option value="">— không ghép —</option>
              {gaProps.map((p) => <option key={p.prop_id} value={p.prop_id}>{p.name}</option>)}
            </select>
            <button onClick={onHide} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-500 hover:text-rose-600"><EyeOff size={13} /> Ẩn web</button>
          </div>}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">Search Console {dm(R.gsc.cur[0])}→{dm(R.gsc.cur[1])} (Google trễ ~2-3 ngày) · GA4 {dm(R.ga.cur[0])}→{dm(R.ga.cur[1])} · so với {R.days} ngày liền trước</div>
      </Card>

      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
        <KPI icon={MousePointerClick} label="Click Google" v={k(g?.cur.clicks)} d={g && <Delta cur={g.cur.clicks} prev={g.prev.clicks} />} />
        <KPI label="Hiển thị" v={k(g?.cur.impressions)} d={g && <Delta cur={g.cur.impressions} prev={g.prev.impressions} />} />
        <KPI label="CTR" v={g ? pct1(g.cur.ctr) : "—"} d={g && <Delta cur={g.cur.ctr} prev={g.prev.ctr} />} />
        <KPI label="Vị trí TB" v={pos1(g?.cur.position)} d={g && <Delta cur={g.cur.position} prev={g.prev.position} lowerBetter abs />} />
        <KPI icon={Users} label="Người dùng" v={k(a?.cur.activeUsers)} d={a && <Delta cur={a.cur.activeUsers} prev={a.prev.activeUsers} />} />
        <KPI label="Phiên" v={k(a?.cur.sessions)} d={a && <Delta cur={a.cur.sessions} prev={a.prev.sessions} />} />
        <KPI label="Tỉ lệ tương tác" v={a?.cur.engagementRate != null ? pct1(a.cur.engagementRate * 100) : "—"} d={a && <Delta cur={a.cur.engagementRate} prev={a.prev.engagementRate} />} />
        <KPI icon={Target} label="Chuyển đổi" v={k(a?.cur.keyEvents)} d={a && <Delta cur={a.cur.keyEvents} prev={a.prev.keyEvents} />} />
      </div>

      {(det?.sources || sum?.sources) && (
        <Card className="!p-3">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Khách đến từ đâu <span className="hidden font-semibold normal-case tracking-normal sm:inline">· theo phiên truy cập GA4</span>
            <button onClick={() => setTab("sources")} className="ml-auto font-bold normal-case tracking-normal text-indigo-600">Xem chi tiết →</button>
          </div>
          <SourceBar groups={det?.sources || sum.sources} max={10} big />
        </Card>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="!p-3 xl:col-span-2">
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Theo ngày</div>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                {site.gsc && <Bar yAxisId="l" dataKey="clicks" name="Click Google" fill="#818cf8" radius={[3, 3, 0, 0]} />}
                {site.ga && <Line yAxisId="r" dataKey="users" name="Người dùng (GA4)" stroke="#10b981" strokeWidth={2} dot={false} />}
                {site.ga && <Line yAxisId="l" dataKey="keyEvents" name="Chuyển đổi" stroke="#f59e0b" strokeWidth={2} dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-500" /><span className="text-[14px] font-extrabold">AI phân tích</span>
            <button onClick={runAi} disabled={!det || !sum || ai?.busy || !aiReady} className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
              {ai?.busy ? <><Loader2 size={13} className="animate-spin" /> Đang phân tích…</> : ai?.r ? "Phân tích lại" : "Phân tích"}
            </button>
          </div>
          {!aiReady && <div className="mt-2 text-[12px] font-semibold text-amber-600">Chưa có API key OpenAI — vào Cài đặt.</div>}
          {ai?.err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{ai.err}</div>}
          {!ai?.r && !ai?.busy && <div className="mt-2 text-[12px] leading-snug text-slate-500">AI đọc từ khoá, cơ hội lên top, trang bị tụt, nguồn khách và chuyển đổi (số đã tính sẵn) rồi đưa ra việc cần làm cụ thể cho web này. Kết quả hiện bên dưới.</div>}
          {det && site.gsc && det.opportunities && (
            <div className="mt-3 space-y-1 text-[12px]">
              <div className="flex justify-between"><span className="text-slate-500">Từ khoá vị trí 4–20 đáng đẩy</span><b>{det.opportunities.near.length}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Top 3 nhưng CTR thấp</span><b>{det.opportunities.lowCtr.length}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Trang mất click so kỳ trước</span><b className={det.losingPages?.length ? "text-rose-600" : ""}>{det.losingPages?.length || 0}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Click có thể thêm nếu lên top 3</span><b className="text-emerald-600">+{int(det.opportunities.near.reduce((s, q) => s + q.gain, 0))}</b></div>
            </div>
          )}
        </Card>
      </div>

      {ai?.r && <Card className="!p-3"><AiBox r={ai.r} /></Card>}

      <Card className="!p-3">
        {err && <div className="mb-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
        {det?.errors?.length > 0 && <div className="mb-2 text-[11px] text-amber-600">⚠ {det.errors.join(" · ")}</div>}
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {TABS.map(([kk, l]) => <button key={kk} onClick={() => setTab(kk)} className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold ${tab === kk ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
        </div>
        {!det ? <div className="h-40 animate-pulse rounded-lg bg-slate-50" /> : (<>
          {tab === "opp" && (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[12px] font-extrabold text-slate-700"><TrendingUp size={14} className="text-emerald-500" /> Đẩy lên top 3 (đang vị trí 4–20, nhiều người tìm)</div>
                <Table rows={det.opportunities?.near} empty="Chưa có từ khoá nào ở vị trí 4–20 đủ hiển thị." cols={[...qCols.slice(0, 1), { h: "Hiển thị", right: true, v: (q) => int(q.impressions) }, { h: "Vị trí", right: true, v: (q) => pos1(q.position) }, { h: "CTR", right: true, v: (q) => pct1(q.ctr) }, { h: "Thêm nếu top 3", right: true, v: (q) => <b className="text-emerald-600">+{int(q.gain)} click</b> }]} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 text-[12px] font-extrabold text-slate-700"><Info size={14} className="text-amber-500" /> Top 3 nhưng ít người bấm → sửa tiêu đề / mô tả</div>
                <Table rows={det.opportunities?.lowCtr} empty="Không có từ khoá top 3 bị CTR thấp." cols={[...qCols.slice(0, 1), { h: "Vị trí", right: true, v: (q) => pos1(q.position) }, { h: "CTR", right: true, v: (q) => <span className="text-rose-600">{pct1(q.ctr)}</span> }, { h: "CTR thường gặp", right: true, v: (q) => pct1(expectedCtr(q.position)) }, { h: "Thêm nếu đạt", right: true, v: (q) => <b className="text-emerald-600">+{int(q.gain)} click</b> }]} />
              </div>
              {det.losingPages?.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[12px] font-extrabold text-slate-700"><TrendingDown size={14} className="text-rose-500" /> Trang đang tụt click</div>
                  <Table rows={det.losingPages} cols={[{ h: "Trang", wide: true, v: (p) => <Name t={short(p.name)} href={p.name} /> }, { h: "Click", right: true, v: (p) => <span>{int(p.clicks)} <span className="text-slate-400">/ trước {int(p.prev.clicks)}</span></span> }, { h: "Vị trí", right: true, v: (p) => <span>{pos1(p.position)} <Delta cur={p.position} prev={p.prev.position} lowerBetter abs /></span> }]} />
                </div>
              )}
            </div>
          )}
          {tab === "queries" && <Table rows={det.queries?.slice(0, 100)} cols={qCols} />}
          {tab === "pages" && <Table rows={det.pages?.slice(0, 100)} cols={[{ h: "Trang", wide: true, v: (p) => <Name t={short(p.name)} href={p.name} /> }, ...qCols.slice(1)]} />}
          {tab === "channels" && <Table rows={det.channels} cols={[{ h: "Kênh", v: (c) => <b className="text-slate-700">{c.name}</b> }, { h: "Phiên", right: true, v: (c) => <span>{int(c.cur.sessions)} <Delta cur={c.cur.sessions} prev={c.prev.sessions} /></span> }, { h: "Người dùng", right: true, sm: true, v: (c) => int(c.cur.activeUsers) }, { h: "Tương tác", right: true, v: (c) => (c.cur.engagementRate != null ? pct1(c.cur.engagementRate * 100) : "—") }, { h: "Chuyển đổi", right: true, v: (c) => <span>{int(c.cur.keyEvents)} <Delta cur={c.cur.keyEvents} prev={c.prev.keyEvents} /></span> }]} />}
          {tab === "landing" && <Table rows={det.landing} cols={[{ h: "Trang đích", wide: true, v: (l) => <Name t={l.landingPagePlusQueryString} href={`https://${site.domain}${l.landingPagePlusQueryString}`} /> }, { h: "Phiên", right: true, v: (l) => int(l.sessions) }, { h: "Tương tác", right: true, v: (l) => <span className={l.engagementRate < 0.4 ? "font-bold text-rose-600" : ""}>{pct1(l.engagementRate * 100)}</span> }, { h: "TG TB", right: true, sm: true, v: (l) => dur(l.averageSessionDuration) }, { h: "Chuyển đổi", right: true, v: (l) => int(l.keyEvents) }]} />}
          {tab === "sources" && (
            <div>
              <div className="mb-2 text-[11px] text-slate-400">Bấm 1 dòng để xem nguồn gốc chi tiết (nguồn / phương tiện GA4). Tương tác thấp (&lt;40%) = khách vào rồi thoát nhanh.</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] sm:min-w-[640px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Nguồn</th><th className="py-2 pr-3 text-right">Phiên</th><th className="hidden py-2 pr-3 text-right sm:table-cell">Tỉ trọng</th><th className="hidden py-2 pr-3 text-right sm:table-cell">Người dùng</th><th className="py-2 pr-3 text-right">Tương tác</th><th className="py-2 pr-3 text-right">Chuyển đổi</th></tr></thead>
                  <tbody>{(det.sources || []).map((g) => (<Fragment key={g.key}>
                    <tr onClick={() => setOpenSrc(openSrc === g.key ? null : g.key)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 pr-3"><span className="flex items-center gap-1.5 font-bold text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.label}<span className="text-[10px] font-semibold text-slate-400">{openSrc === g.key ? "▾" : "▸"} {g.items.length}</span></span></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{int(g.cur.sessions)} <Delta cur={g.cur.sessions} prev={g.prev.sessions} /></td>
                      <td className="hidden py-1.5 pr-3 text-right tabular-nums sm:table-cell">{pct1(g.share)}</td>
                      <td className="hidden py-1.5 pr-3 text-right tabular-nums sm:table-cell">{int(g.cur.activeUsers)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${g.cur.engagementRate != null && g.cur.engagementRate < 0.4 ? "font-bold text-rose-600" : ""}`}>{g.cur.engagementRate != null ? pct1(g.cur.engagementRate * 100) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{int(g.cur.keyEvents)} <Delta cur={g.cur.keyEvents} prev={g.prev.keyEvents} /></td>
                    </tr>
                    {openSrc === g.key && g.items.slice(0, 30).map((it) => (
                      <tr key={g.key + it.src + it.med} className="border-b border-slate-50 bg-slate-50/60 text-slate-500">
                        <td className="break-all py-1 pl-6 pr-3">{it.src} <span className="text-slate-400">/ {it.med}</span></td>
                        <td className="py-1 pr-3 text-right tabular-nums">{int(it.cur.sessions)}</td><td className="hidden sm:table-cell" />
                        <td className="hidden py-1 pr-3 text-right tabular-nums sm:table-cell">{int(it.cur.activeUsers)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{it.cur.engagementRate != null ? pct1(it.cur.engagementRate * 100) : "—"}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{int(it.cur.keyEvents)}</td>
                      </tr>
                    ))}
                  </Fragment>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "events" && (() => {
            const ev = (det.events || []).filter((e) => showAuto || !e.auto);
            return (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span><Star size={11} className="inline text-amber-500" /> = sự kiện chính (GA4 tính là chuyển đổi)</span>
                  <label className="ml-auto flex items-center gap-1 font-semibold text-slate-500"><input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> Hiện cả sự kiện tự động (xem trang, cuộn…)</label>
                </div>
                <Table rows={ev} empty="Chưa có sự kiện hành động nào (ngoài xem trang). Nên cài đo: bấm gọi, bấm Zalo, gửi form, đặt hàng…" cols={[
                  { h: "Sự kiện", wide: true, v: (e) => <div className="min-w-0"><div className="flex items-center gap-1 font-bold text-slate-700">{e.key && <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" />}{e.label || e.name}{e.auto && <span className="text-[10px] font-semibold text-slate-400">tự động</span>}</div>{e.label && <div className="text-[10.5px] text-slate-400">{e.name}</div>}</div> },
                  { h: "Số lần", right: true, v: (e) => <span>{int(e.cur.eventCount)} <Delta cur={e.cur.eventCount} prev={e.prev.eventCount} /></span> },
                  { h: "Số người", right: true, v: (e) => int(e.cur.totalUsers) },
                  { h: "Lần/người", right: true, sm: true, v: (e) => (e.cur.totalUsers ? (e.cur.eventCount / e.cur.totalUsers).toFixed(1).replace(".", ",") : "—") },
                  { h: "Kỳ trước", right: true, sm: true, v: (e) => int(e.prev.eventCount) },
                ]} />
                {(det.events || []).some((e) => e.name === "form_submit" && e.key && (e.cur.eventCount || 0) > (e.cur.totalUsers || 0) * 2) && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[11.5px] text-amber-800">⚠ "Gửi form" đang là sự kiện chính nhưng mỗi người gửi trung bình nhiều lần → có thể GA4 đếm cả ô tìm kiếm/form phụ. Nên kiểm tra lại cấu hình sự kiện chính.</div>}
              </div>
            );
          })()}
          {tab === "device" && (
            <div className="grid gap-4 md:grid-cols-3">
              {det.gscDevices && <div><div className="mb-1 text-[11px] font-extrabold uppercase text-slate-400">Google theo thiết bị</div><Table rows={det.gscDevices} cols={[{ h: "Thiết bị", v: (r) => r.keys[0] }, { h: "Click", right: true, v: (r) => int(r.clicks) }, { h: "Vị trí", right: true, v: (r) => pos1(r.position) }]} /></div>}
              {det.gaDevices && <div><div className="mb-1 text-[11px] font-extrabold uppercase text-slate-400">GA4 theo thiết bị</div><Table rows={det.gaDevices} cols={[{ h: "Thiết bị", v: (r) => r.deviceCategory }, { h: "Phiên", right: true, v: (r) => int(r.sessions) }, { h: "Tương tác", right: true, v: (r) => pct1(r.engagementRate * 100) }, { h: "CĐ", right: true, v: (r) => int(r.keyEvents) }]} /></div>}
              {det.cities && <div><div className="mb-1 text-[11px] font-extrabold uppercase text-slate-400">Khu vực</div><Table rows={det.cities} cols={[{ h: "Thành phố", v: (r) => r.city }, { h: "Người dùng", right: true, v: (r) => int(r.activeUsers) }, { h: "CĐ", right: true, v: (r) => int(r.keyEvents) }]} /></div>}
            </div>
          )}
        </>)}
      </Card>
    </div>
  );
}

export default function Web() {
  const { isOwner, ownerId, perms = [], settings = {}, setSettings } = useData();
  const member = !!ownerId && !isOwner; // tài khoản phụ → dữ liệu đi qua máy chủ (không lộ khoá)
  const canView = isOwner || perms.includes("web");
  const [days, setDays] = useState(28); // số ngày hoặc { since, until }
  const [sites, setSites] = useState(null);
  const [meta, setMeta] = useState({ hiddenSites: [], gaProps: [], conn: null });
  const [sums, setSums] = useState({});
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [tick, setTick] = useState(0);
  const [aiState, setAiState] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const hidden = settings.webHidden || [];
  const gaOverride = settings.webGa || {};
  const R = useMemo(() => rangesOf(days), [days]);

  useEffect(() => {
    if (!canView || !ownerId) return;
    setGoogleProxy(member); CACHE.clear();
    let alive = true; setErr("");
    loadSites({ hidden, gaOverride }).then((r) => { if (!alive) return; setSites(r.sites); setMeta(r); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, member, ownerId, tick, JSON.stringify(hidden), JSON.stringify(gaOverride)]);

  useEffect(() => {
    if (!sites) return;
    let alive = true; setSums({});
    sites.forEach((s) => cached(`s|${s.domain}|${s.gsc}|${s.ga}|${R.key}|${tick}`, () => loadSiteSummary(s, R)).then((v) => alive && setSums((o) => ({ ...o, [s.domain]: v }))));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, R.key, tick]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [sel]);

  const tot = useMemo(() => {
    const t = { clicks: 0, pClicks: 0, users: 0, pUsers: 0, conv: 0, pConv: 0 };
    for (const v of Object.values(sums)) {
      t.clicks += v.gsc?.cur.clicks || 0; t.pClicks += v.gsc?.prev.clicks || 0;
      t.users += v.ga?.cur.activeUsers || 0; t.pUsers += v.ga?.prev.activeUsers || 0;
      t.conv += v.ga?.cur.keyEvents || 0; t.pConv += v.ga?.prev.keyEvents || 0;
    }
    return t;
  }, [sums]);

  if (!canView) return <Card><div className="text-sm text-slate-500">Bạn chưa được cấp quyền xem Hiệu quả Website.</div></Card>;
  const site = sel && sites?.find((s) => s.domain === sel);
  const setHidden = (list) => setSettings({ webHidden: list });

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={days} onChange={setDays} />
          <span className="text-[11px] text-slate-400">{R.custom ? `${dm(R.ga.cur[0])}/${R.ga.cur[0].slice(2, 4)} → ${dm(R.ga.cur[1])}/${R.ga.cur[1].slice(2, 4)} · ` : ""}so với {R.days} ngày liền trước</span>
          <button onClick={() => { CACHE.clear(); setTick((t) => t + 1); }} className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white"><RefreshCw size={13} /> Làm mới</button>
        </div>
        {meta.conn && <div className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">Dùng kết nối Google của Văn phòng AI · đồng bộ danh sách web lúc {meta.conn.last_sync_at ? new Date(meta.conn.last_sync_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—"}{meta.conn.last_error ? ` · lỗi: ${meta.conn.last_error}` : ""}. Chỉ hiện web/property đang <b>bật</b> bên Văn phòng AI. <b>Thêm web mới:</b> thêm email robot vào Search Console/GA4 của web đó → Văn phòng AI → Kết nối → Google → Làm mới → bật công tắc.</div>}
        {err && <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle size={14} /> {err}</div>}
      </Card>

      {site ? (
        <Detail owner={isOwner} site={site} sum={sums[site.domain]} R={R} gaProps={meta.gaProps} gaOverride={gaOverride} apiKey={settings.openaiKey} aiReady={settings.aiReady ?? !!settings.openaiKey}
          onGa={(v) => { setSettings({ webGa: { ...gaOverride, [site.domain]: v } }); CACHE.clear(); }}
          onHide={() => { setHidden([...hidden, site.domain]); setSel(null); }} onBack={() => setSel(null)} aiState={aiState} setAiState={setAiState} />
      ) : (<>
        <div className="grid grid-cols-3 gap-px bg-slate-100">
          {[["Click Google", tot.clicks, tot.pClicks, MousePointerClick], ["Người dùng", tot.users, tot.pUsers, Users], ["Chuyển đổi", tot.conv, tot.pConv, Target]].map(([l, c, p, I]) => (
            <div key={l} className="bg-white px-3 py-2.5"><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><I size={11} /> {l} · tất cả web</div><div className="flex items-baseline gap-1.5"><span className="text-xl font-extrabold tabular-nums text-slate-900">{k(c)}</span><Delta cur={c} prev={p} /></div></div>
          ))}
        </div>
        {!sites ? <Card><div className="h-24 animate-pulse rounded-lg bg-slate-50" /></Card> : sites.length === 0 ? (
          <Card><div className="py-8 text-center text-sm text-slate-500">Chưa có web nào. Vào <b>Văn phòng AI → Kết nối → Google</b>, thêm email robot vào Search Console / GA4 của web rồi bấm Làm mới.</div></Card>
        ) : (
          <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((s) => <SiteCard key={s.domain} site={s} sum={sums[s.domain]} onOpen={() => setSel(s.domain)} />)}
          </div>
        )}
        {meta.hiddenSites?.length > 0 && (
          <div className="px-3 text-[11px] text-slate-400">
            <button onClick={() => setShowHidden((v) => !v)} className="font-bold hover:text-slate-600">{showHidden ? "▾" : "▸"} {meta.hiddenSites.length} web đã ẩn</button>
            {showHidden && <div className="mt-1 flex flex-wrap gap-1">{meta.hiddenSites.map((s) => <button key={s.domain} onClick={() => setHidden(hidden.filter((h) => h !== s.domain))} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-slate-500 ring-1 ring-slate-200 hover:text-indigo-600"><Eye size={11} /> {s.domain}</button>)}</div>}
          </div>
        )}
      </>)}
    </div>
  );
}
