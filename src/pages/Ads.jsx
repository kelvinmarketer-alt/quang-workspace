import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Megaphone, Target, Eye, Wallet, MessageCircle, ChevronDown, ChevronRight, AlertTriangle, Sparkles, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, StatCard, Badge, DateField, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { aiAdsAnalysis } from "../lib/ai.js";
import { todayISO, formatShort } from "../lib/format.js";

// ---------- định dạng ----------
const vnd = (v) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN") + "đ");
const int = (v) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));
const pct = (v) => (v == null ? "—" : Number(v).toFixed(2) + "%");
const dec = (v) => (v == null ? "—" : Number(v).toFixed(2));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");

function presetRange(p) {
  const t = todayISO();
  const d = new Date(t + "T00:00:00");
  if (p === "today") return [t, t];
  if (p === "yesterday") return [addDays(t, -1), addDays(t, -1)];
  if (p === "7d") return [addDays(t, -6), t];
  if (p === "30d") return [addDays(t, -29), t];
  if (p === "month") return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), t];
  if (p === "lastmonth") return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
  return [t, t];
}
const PRESETS = [["today", "Hôm nay"], ["yesterday", "Hôm qua"], ["7d", "7 ngày"], ["30d", "30 ngày"], ["month", "Tháng này"], ["lastmonth", "Tháng trước"], ["custom", "Tùy chọn"]];

// Cột chỉ số theo nhóm. bad = tăng là XẤU (chi phí) → mũi tên đỏ khi tăng.
const COLS = {
  conv: [
    ["spend", "Chi phí", vnd], ["msgs", "Tin nhắn", int], ["leads", "Lead", int], ["cpr", "Giá/KQ", vnd, "bad"],
    ["cpm", "CPM", vnd, "bad"], ["ctr", "CTR", pct], ["cpc", "CPC", vnd, "bad"], ["impressions", "Hiển thị", int],
  ],
  brand: [
    ["spend", "Chi phí", vnd], ["reach", "Tiếp cận", int], ["impressions", "Hiển thị", int], ["frequency", "Tần suất", dec, "bad"],
    ["cpm", "CPM", vnd, "bad"], ["thruplay", "ThruPlay", int], ["video3s", "Video 3s", int], ["engagement", "Tương tác", int], ["pageLikes", "Theo dõi", int],
  ],
  // Google Ads (mọi TK Google xếp nhóm Chuyển đổi): kết quả = chuyển đổi, Giá/KQ = CPA
  gads: [
    ["spend", "Chi phí", vnd], ["results", "Chuyển đổi", dec], ["cpr", "CPA", vnd, "bad"], ["clicks", "Click", int],
    ["ctr", "CTR", pct], ["cpc", "CPC", vnd, "bad"], ["cpm", "CPM", vnd, "bad"], ["budgetLostIS", "Mất do NS", pct, "bad"],
  ],
};
const colsOf = (a) => (a.platform === "google" ? COLS.gads : COLS[a.group]);

function Delta({ cur, prev, bad }) {
  if (prev == null || cur == null || !prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(d) || Math.abs(d) < 0.5) return <span className="text-[10px] font-bold text-slate-400">0%</span>;
  const up = d > 0, good = bad ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${good ? "text-emerald-600" : "text-rose-600"}`}><Icon size={11} />{Math.abs(d).toFixed(0)}%</span>;
}

function Metric({ label, value, delta }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex items-baseline gap-1.5"><span className="text-sm font-extrabold text-slate-900">{value}</span>{delta}</div>
    </div>
  );
}

function Table({ rows, cols, nameKey = "name", sub }) {
  if (!rows?.length) return <div className="py-3 text-center text-xs text-slate-400">Không có dữ liệu trong kỳ</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-2">Tên</th>{cols.map(([k, l]) => <th key={k} className="py-2 pr-2 text-right">{l}</th>)}
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id || r.name || i} className="border-b border-slate-50">
            <td className="max-w-[260px] py-2 pr-2"><div className="truncate font-semibold text-slate-700" title={r[nameKey]}>{r[nameKey]}</div>{sub && r[sub] && <div className="truncate text-[10px] text-slate-400">{r[sub]}</div>}</td>
            {cols.map(([k, , f]) => <td key={k} className="py-2 pr-2 text-right tabular-nums text-slate-700">{f(r[k])}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function RealResults({ acc, since, until, spend }) {
  const { adsResults = [], addAdsResult, deleteAdsResult, canEdit } = useData();
  const canW = canEdit ? canEdit("ads") : true;
  const [f, setF] = useState({ date: todayISO(), customers: "", revenue: "" });
  const list = adsResults.filter((r) => r.accountId === acc.id && r.date >= since && r.date <= until).sort((a, b) => b.date.localeCompare(a.date));
  const cust = list.reduce((a, r) => a + r.customers, 0), rev = list.reduce((a, r) => a + r.revenue, 0);
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-extrabold text-emerald-800">Kết quả thật (nhập tay)</span>
        <span>Khách chốt: <b>{cust}</b></span>
        <span>Doanh thu: <b>{vnd(rev)}</b></span>
        <span>Giá/khách thật: <b>{cust ? vnd(spend / cust) : "—"}</b></span>
        <span>ROAS: <b>{spend > 0 && rev ? (rev / spend).toFixed(2) + "x" : "—"}</b></span>
      </div>
      {canW && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <DateField value={f.date} onChange={(v) => setF({ ...f, date: v })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <input value={f.customers} onChange={(e) => setF({ ...f, customers: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="Số khách chốt" className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <MoneyInput value={f.revenue} onChange={(v) => setF({ ...f, revenue: v })} placeholder="Doanh thu" className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <button onClick={() => { if (f.customers || f.revenue) { addAdsResult({ accountId: acc.id, ...f }); setF({ ...f, customers: "", revenue: "" }); } }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white"><Plus size={13} />Thêm</button>
        </div>
      )}
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{list.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-emerald-100">
            {dm(r.date)} · {r.customers} khách · {formatShort(r.revenue)}
            {canW && <button onClick={() => deleteAdsResult(r.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={11} /></button>}
          </span>
        ))}</div>
      )}
    </div>
  );
}

function AccountCard({ a, since, until }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(a.services ? "services" : "campaigns");
  const cols = colsOf(a);
  const isG = a.platform === "google";
  if (a.error) return (
    <Card><div className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-rose-500" /><b>{a.name}</b><span className="text-rose-600">{a.error}</span></div></Card>
  );
  const t = a.totals, p = a.prev;
  const ads = [...(a.ads || [])].filter((x) => x.spend > 0);
  const topAds = a.group === "conv"
    ? [...ads.filter((x) => x.results > 0).sort((x, y) => x.cpr - y.cpr).slice(0, 5), ...ads.filter((x) => x.results === 0).slice(0, 3)]
    : ads.sort((x, y) => y.spend - x.spend).slice(0, 8);
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        <span className="text-base font-extrabold">{a.name}</span>
        <Badge tone={isG ? "emerald" : "sky"}>{isG ? "Google" : "Meta"}</Badge>
        <Badge tone={a.group === "conv" ? "indigo" : "amber"}>{a.group === "conv" ? "Chuyển đổi" : "Thương hiệu"}</Badge>
        {isG && a.lastSync && <span className="text-[11px] text-slate-400">số đến {new Date(a.lastSync).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}
        {a.status && a.status !== 1 && <Badge tone="rose">Tài khoản không hoạt động</Badge>}
        {a.issues?.length > 0 && <Badge tone="rose">{a.issues.length} QC bị từ chối</Badge>}
        {a.group === "brand" && t.frequency > 3 && <Badge tone="rose">Tần suất cao</Badge>}
        {a.currency && a.currency !== "VND" && <Badge tone="slate">{a.currency}</Badge>}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {cols.map(([k, l, f, bad]) => <Metric key={k} label={l} value={f(t[k])} delta={p ? <Delta cur={t[k]} prev={p[k]} bad={bad} /> : null} />)}
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          {a.daily?.length > 1 && (
            <div className="h-56">
              <ResponsiveContainer>
                <ComposedChart data={a.daily.map((d) => ({ ...d, day: dm(d.date) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={formatShort} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} tickFormatter={formatShort} />
                  <Tooltip formatter={(v, n) => (n === "Chi phí" || n === "CPM" ? vnd(v) : int(v))} />
                  <Bar yAxisId="l" dataKey="spend" name="Chi phí" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  {a.group === "conv"
                    ? <Line yAxisId="r" dataKey="results" name={isG ? "Chuyển đổi" : "Kết quả"} stroke="#10b981" strokeWidth={2} dot={false} />
                    : <Line yAxisId="r" dataKey="reach" name="Tiếp cận" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {a.group === "conv" && <RealResults acc={a} since={since} until={until} spend={t.spend} />}
          {a.issues?.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
              <b>Quảng cáo có vấn đề:</b> {a.issues.map((x) => (x.status === "POLICY" ? x.name : `${x.name} (${x.status === "DISAPPROVED" ? "bị từ chối" : "có vấn đề"})`)).join(" · ")}
            </div>
          )}
          <div className="flex gap-1.5">
            {(isG ? [["campaigns", "Chiến dịch"], ["keywords", "Từ khoá"]] : [a.services && ["services", "Theo dịch vụ"], ["campaigns", "Chiến dịch"], ["ads", a.group === "conv" ? "QC rẻ / đắt" : "Top quảng cáo"]]).filter(Boolean).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {tab === "services" && <Table rows={a.services} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} />}
          {tab === "campaigns" && <Table rows={a.campaigns.filter((c) => c.spend > 0)} cols={cols} />}
          {tab === "ads" && <Table rows={topAds} cols={cols} sub="campaign" />}
          {tab === "keywords" && <Table rows={a.keywords} cols={cols.filter(([k]) => k !== "budgetLostIS")} sub="campaign" />}
        </div>
      )}
    </Card>
  );
}

function sumGroup(list) {
  const ok = list.filter((a) => !a.error && (!a.currency || a.currency === "VND"));
  const s = { spend: 0, results: 0, impressions: 0, reach: 0, msgs: 0, leads: 0, gconv: 0 };
  for (const a of ok) {
    for (const k of ["spend", "results", "impressions", "reach", "msgs", "leads"]) s[k] += a.totals[k] || 0;
    if (a.platform === "google") s.gconv += a.totals.results || 0;
  }
  s.cpr = s.results ? s.spend / s.results : null;
  s.cpm = s.impressions ? (s.spend / s.impressions) * 1000 : null;
  return s;
}

export default function Ads() {
  const { isOwner, settings = {}, adsResults = [] } = useData();
  const [preset, setPreset] = useState("today");
  const [range, setRange] = useState(presetRange("today"));
  const [compare, setCompare] = useState(true);
  const [group, setGroup] = useState("conv");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState({ busy: false, text: "", err: "" });
  const [since, until] = range;
  const live = until >= todayISO();

  const load = async (silent) => {
    if (!silent) setLoading(true); setErr("");
    try {
      const { data: d, error } = await supabase.functions.invoke("qws-meta-ads", { body: { since, until, compare } });
      if (error) throw error;
      if (d?.error) throw new Error(d.error);
      setData(d);
    } catch (e) { if (!silent) setErr(e.message || String(e)); }
    if (!silent) setLoading(false);
  };
  useEffect(() => { if (isOwner) load(); /* eslint-disable-next-line */ }, [since, until, compare, isOwner]);
  // Kỳ có HÔM NAY → tự làm mới 5 phút/lần khi tab đang mở (Meta trễ ~15-30 phút so với thực tế)
  useEffect(() => {
    if (!isOwner || !live) return;
    const t = setInterval(() => { if (!document.hidden) load(true); }, 300000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [since, until, compare, isOwner, live]);

  const accounts = (data?.accounts || []).filter((a) => a.group === group);
  const tot = useMemo(() => sumGroup(accounts), [data, group]);
  const prevTot = useMemo(() => {
    if (!data?.prev) return null;
    const ok = accounts.filter((a) => !a.error && a.prev);
    const s = { spend: 0, results: 0, impressions: 0, reach: 0 };
    for (const a of ok) for (const k of Object.keys(s)) s[k] += a.prev[k] || 0;
    s.cpr = s.results ? s.spend / s.results : null; s.cpm = s.impressions ? (s.spend / s.impressions) * 1000 : null;
    return s;
  }, [data, group]);

  const runAi = async () => {
    setAi({ busy: true, text: "", err: "" });
    try {
      const pick = (m) => m && Object.fromEntries(["spend", "results", "msgs", "leads", "cpr", "cpm", "ctr", "cpc", "reach", "impressions", "frequency", "thruplay", "engagement", "pageLikes", "budgetLostIS", "searchIS", "roas"].map((k) => [k, m[k] == null ? null : Math.round(m[k] * 100) / 100]));
      const summary = {
        period: { since, until, prev: data?.prev },
        accounts: accounts.filter((a) => !a.error).map((a) => {
          const real = adsResults.filter((r) => r.accountId === a.id && r.date >= since && r.date <= until);
          return {
            name: a.name, platform: a.platform, group: a.group, totals: pick(a.totals), prev: pick(a.prev),
            keywords: a.keywords?.slice(0, 15).map((x) => ({ name: x.name, ...pick(x) })),
            services: a.services?.map((s) => ({ name: s.name, ...pick(s) })),
            campaigns: a.campaigns.filter((c) => c.spend > 0).slice(0, 10).map((c) => ({ name: c.name, ...pick(c) })),
            ads: (a.ads || []).filter((x) => x.spend > 0).slice(0, 12).map((x) => ({ name: x.name, ...pick(x) })),
            issues: a.issues?.length || 0,
            real: real.length ? { customers: real.reduce((s, r) => s + r.customers, 0), revenue: real.reduce((s, r) => s + r.revenue, 0) } : null,
          };
        }),
      };
      const text = await aiAdsAnalysis({ summary, apiKey: settings.openaiKey, model: settings.openaiModel });
      setAi({ busy: false, text, err: "" });
    } catch (e) { setAi({ busy: false, text: "", err: e.message || String(e) }); }
  };

  if (!isOwner) return <Card><div className="text-sm text-slate-500">Chỉ chủ workspace xem được số liệu quảng cáo.</div></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(([k, l]) => (
            <button key={k} onClick={() => { setPreset(k); if (k !== "custom") setRange(presetRange(k)); }} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${preset === k ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}</button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 text-xs">
              <DateField value={since} onChange={(v) => setRange([v, until < v ? v : until])} className="rounded-lg border border-slate-200 px-2 py-1.5" />
              <span>→</span>
              <DateField value={until} onChange={(v) => setRange([since > v ? v : since, v])} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            </div>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />So với kỳ trước</label>
          <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Làm mới</button>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          {dm(since)}{since !== until && " → " + dm(until)}
          {data?.updatedAt && ` · cập nhật ${new Date(data.updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
          {live && " · số hôm nay Meta trễ ~15-30 phút, tự làm mới 5 phút/lần"}
          {data?.prev && ` · kỳ trước ${dm(data.prev.since)} → ${dm(data.prev.until)}`}
        </div>
        {err && <div className="mt-2 rounded-xl bg-rose-50 p-2 text-xs text-rose-700">Lỗi tải số liệu: {err}</div>}
      </Card>

      <div className="flex gap-2">
        {[["conv", "Chuyển đổi", Target], ["brand", "Thương hiệu", Megaphone]].map(([k, l, I]) => (
          <button key={k} onClick={() => { setGroup(k); setAi({ busy: false, text: "", err: "" }); }} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${group === k ? "bg-white text-slate-900 shadow ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60"}`}><I size={15} />{l}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Chi phí" value={tot.spend} sub={prevTot ? "Kỳ trước " + vnd(prevTot.spend) : null} tone="indigo" />
        {group === "conv" ? <>
          <StatCard icon={MessageCircle} label="Kết quả (tin + lead + CĐ)" value={int(tot.results)} money={false} sub={`${int(tot.msgs)} tin · ${int(tot.leads)} lead · ${dec(tot.gconv)} CĐ Google`} tone="emerald" />
          <StatCard icon={Target} label="Giá / kết quả" value={vnd(tot.cpr)} money={false} sub={prevTot ? "Kỳ trước " + vnd(prevTot.cpr) : null} tone="rose" />
        </> : <>
          <StatCard icon={Eye} label="Tiếp cận (cộng các TK)" value={int(tot.reach)} money={false} sub={`${int(tot.impressions)} lượt hiển thị`} tone="amber" />
          <StatCard icon={Megaphone} label="Hiển thị" value={int(tot.impressions)} money={false} sub={prevTot ? "Kỳ trước " + int(prevTot.impressions) : null} tone="sky" />
        </>}
        <StatCard icon={TrendingUp} label="CPM" value={vnd(tot.cpm)} money={false} sub={prevTot ? "Kỳ trước " + vnd(prevTot.cpm) : null} tone="sky" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <span className="text-sm font-extrabold">AI phân tích nhóm {group === "conv" ? "Chuyển đổi" : "Thương hiệu"}</span>
          <button onClick={runAi} disabled={ai.busy || !data} className="ml-auto rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{ai.busy ? "Đang phân tích…" : "Phân tích"}</button>
        </div>
        {ai.err && <div className="mt-2 text-xs text-rose-600">{ai.err}</div>}
        {ai.text && <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ai.text}</div>}
      </Card>

      {loading && !data && <Card><div className="text-sm text-slate-400">Đang tải số liệu từ Meta…</div></Card>}
      {data && !data.accounts?.length && <Card><div className="text-sm text-slate-500">Chưa có tài khoản quảng cáo nào. Vào <b>Cài đặt → Quảng cáo — tài khoản Meta & Google</b> để dán token và chọn tài khoản.</div></Card>}
      {accounts.map((a) => <AccountCard key={a.id} a={a} since={since} until={until} />)}
    </div>
  );
}
