import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Megaphone, Target, Eye, Wallet, MessageCircle, ChevronDown, ChevronRight, AlertTriangle, Sparkles, Plus, Trash2, TrendingUp, TrendingDown, Bell, CheckCircle2, XCircle, Lightbulb, ArrowUpRight, ArrowDownRight, Info, ExternalLink, PlayCircle, Image as ImageIcon, Loader2 } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, StatCard, Badge, DateField, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { aiAdsAnalysis } from "../lib/ai.js";
import { diagnose, judge, baselineOf } from "../lib/adsDiagnose.js";
import { loadAccountAds, statusOf, setAdsProxy } from "../lib/fbAds.js";
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
const RANK = { ABOVE_AVERAGE: "trên TB", AVERAGE: "TB", BELOW_AVERAGE_35: "dưới TB (top 35% thấp)", BELOW_AVERAGE_20: "dưới TB (top 20% thấp)", BELOW_AVERAGE_10: "dưới TB (top 10% thấp)" };
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

const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke("qws-meta-ads", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};
const CONV_CAT = {
  PHONE_CALL_LEAD: "Gọi điện", CONTACT: "Liên hệ", SUBMIT_LEAD_FORM: "Gửi form", LEAD: "Khách tiềm năng", PURCHASE: "Mua hàng",
  PAGE_VIEW: "Xem trang", SIGNUP: "Đăng ký", BOOK_APPOINTMENT: "Đặt lịch", GET_DIRECTIONS: "Chỉ đường", ENGAGEMENT: "Tương tác",
  OUTBOUND_CLICK: "Click ra ngoài", QUALIFIED_LEAD: "KH đủ điều kiện", REQUEST_QUOTE: "Yêu cầu báo giá", DEFAULT: "Khác",
};

// Số dư tiền quảng cáo: Google account budget (tự động) hoặc sổ nạp tiền (nhập tay số dư + các lần nạp)
function balTone(b) { return !b ? "slate" : b.balance <= 0 ? "rose" : b.daysLeft != null && b.daysLeft < 2 ? "rose" : b.daysLeft != null && b.daysLeft < 5 ? "amber" : "emerald"; }
function BalanceBox({ a, onChanged }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ kind: "anchor", amount: "" });
  const [err, setErr] = useState("");
  const load = async () => { try { setRows((await invoke({ mode: "balance_list", accountId: a.id })).rows || []); } catch (e) { setErr(e.message || String(e)); } };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [a.id]);
  const add = async () => {
    if (!f.amount) return; setErr("");
    try { await invoke({ mode: "balance_add", accountId: a.id, kind: f.kind, amount: Number(f.amount) }); setF({ ...f, amount: "" }); await load(); onChanged?.(); }
    catch (e) { setErr(e.message || String(e)); }
  };
  const del = async (id) => { try { await invoke({ mode: "balance_delete", id }); await load(); onChanged?.(); } catch (e) { setErr(e.message || String(e)); } };
  const b = a.bal;
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-extrabold text-sky-800">Số dư quảng cáo</span>
        {b ? <>
          <span>Còn: <b className={b.balance <= 0 ? "text-rose-600" : ""}>{vnd(b.balance)}</b></span>
          <span>TB chi 7 ngày: <b>{vnd(b.avgDaily)}</b>/ngày</span>
          <span>Đủ chạy: <b className={balTone(b) === "rose" ? "text-rose-600" : ""}>{b.daysLeft != null ? "~" + b.daysLeft.toFixed(1) + " ngày" : "—"}</b></span>
          <span className="text-slate-400">{b.source === "google_budget" ? "theo ngân sách tài khoản Google" : "ước tính từ sổ nạp tiền"}</span>
        </> : <span className="text-slate-500">Chưa có — nhập <b>số dư hiện tại</b> đang thấy trên {a.platform === "google" ? "Google Ads (Thanh toán → Tóm tắt)" : "Meta (Thanh toán)"} để app tự trừ chi phí & cảnh báo khi sắp hết.</span>}
        {a.owed > 0 && <span>Đang nợ (chưa trừ thẻ): <b>{vnd(a.owed)}</b></span>}
      </div>
      {b?.source !== "google_budget" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <option value="anchor">Số dư hiện tại</option><option value="topup">Vừa nạp thêm</option>
          </select>
          <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} placeholder="Số tiền" className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5" />
          <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 font-bold text-white"><Plus size={13} />Lưu</button>
        </div>
      )}
      {rows?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{rows.slice(0, 10).map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-sky-100">
            {new Date(r.at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {r.kind === "anchor" ? "số dư" : "nạp"} {formatShort(r.amount)}
            <button onClick={() => del(r.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={11} /></button>
          </span>
        ))}</div>
      )}
      {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
    </div>
  );
}

function AlertsPanel({ tick }) {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => { invoke({ mode: "alerts_list" }).then((d) => setList(d.alerts || [])).catch(() => setList([])); }, [tick]);
  if (!list?.length) return null;
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2"><Bell size={16} className="text-rose-500" /><span className="text-sm font-extrabold">Cảnh báo 48 giờ qua</span><span className="hidden text-[11px] text-slate-400 sm:inline">(đã đẩy thông báo về app)</span><span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{list.length}</span></div>
      <div className="space-y-1">{(all ? list : list.slice(0, 3)).map((x) => (
        <div key={x.key} className="flex gap-2 text-xs"><span className="shrink-0 text-slate-400">{new Date(x.sent_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><span className="text-slate-700">{x.text}</span></div>
      ))}</div>
      {list.length > 3 && <button onClick={() => setAll((v) => !v)} className="mt-1.5 text-[12px] font-bold text-indigo-600">{all ? "Thu gọn" : `Xem thêm ${list.length - 3} cảnh báo`}</button>}
    </Card>
  );
}

// ---------- Chấm điểm ----------
const VBadge = ({ v }) => (v ? <span title={v.reason || ""}><Badge tone={v.tone}>{v.label}{v.lowSample ? "*" : ""}</Badge></span> : null);
const vCol = ["_v", "Đánh giá", (v) => <VBadge v={v} />];

function KpiBox({ a, kpi, onSave }) {
  const [f, setF] = useState({ cpr: kpi?.cpr ? String(kpi.cpr) : "", cpa: kpi?.cpa ? String(kpi.cpa) : "" });
  const [ok, setOk] = useState(false);
  const bl = baselineOf(a, kpi);
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5 font-bold text-indigo-700"><Target size={14} /> KPI để chấm hiệu quả</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">Giá/kết quả mục tiêu <MoneyInput value={f.cpr} onChange={(v) => setF({ ...f, cpr: v })} placeholder="VD 50.000" className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5" /></label>
        <label className="flex items-center gap-1.5">Giá/khách chốt mục tiêu <MoneyInput value={f.cpa} onChange={(v) => setF({ ...f, cpa: v })} placeholder="VD 300.000" className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5" /></label>
        <button onClick={() => { onSave({ cpr: Number(f.cpr) || 0, cpa: Number(f.cpa) || 0 }); setOk(true); setTimeout(() => setOk(false), 1500); }} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white">{ok ? "✓ Đã lưu" : "Lưu KPI"}</button>
      </div>
      <div className="mt-1.5 text-[11px] text-slate-500">{kpi?.cpr ? "Đang chấm theo KPI của bạn." : bl ? `Chưa đặt KPI → tạm so với ${bl.label} (${vnd(bl.value)}).` : "Chưa đặt KPI và chưa đủ dữ liệu để có mốc so sánh."} Dưới 80% mốc = Rất tốt · ≤110% = Đạt · ≤150% = Hơi đắt · cao hơn = Đắt · tiêu ≥1,5× mốc mà 0 kết quả = Đốt tiền.</div>
    </div>
  );
}

function Scorecard({ diag, onWeek }) {
  if (!diag?.accounts?.length) return null;
  const rows = diag.accounts.filter((x) => x.spend > 0);
  const off = diag.accounts.filter((x) => !x.spend);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 size={16} className="text-emerald-500" />
        <span className="text-sm font-extrabold">Chấm điểm hiệu quả</span>
        <span className="text-[11px] text-slate-400">tính tự động theo KPI / kỳ trước — rê chuột vào nhãn để xem lý do</span>
      </div>
      {diag.days < 3 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          <Info size={14} /> Kỳ {diag.days} ngày quá ngắn để kết luận (số ít, dễ nhiễu).
          <button onClick={onWeek} className="rounded-lg bg-amber-500 px-2.5 py-1 font-bold text-white">Xem 7 ngày</button>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {rows.map((x) => (
          <div key={x.id} className="rounded-xl border border-slate-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-slate-800">{x.name}</span>
              <Badge tone={x.platform === "google" ? "emerald" : "sky"}>{x.platform === "google" ? "Google" : "Meta"}</Badge>
              <VBadge v={x.verdict} />
              <span className="ml-auto text-xs font-bold text-slate-700">{vnd(x.spend)}{x.deltas?.spend != null && <span className="ml-1 font-semibold text-slate-400">({x.deltas.spend > 0 ? "+" : ""}{x.deltas.spend}%)</span>}</span>
            </div>
            {x.group === "brand" ? (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Tiếp cận <b className="text-slate-700">{int(x.brand.reach)}</b></span>
                <span>Giá/1.000 người <b className="text-slate-700">{vnd(x.brand.costPer1kReach)}</b></span>
                <span>CPM <b className="text-slate-700">{vnd(x.brand.cpm)}</b>{x.deltas?.cpm != null && ` (${x.deltas.cpm > 0 ? "+" : ""}${x.deltas.cpm}%)`}</span>
                <span>Tần suất <b className="text-slate-700">{dec(x.brand.frequency)}</b></span>
                {x.verdict.reason && <span className="text-amber-600">{x.verdict.reason}</span>}
              </div>
            ) : (<>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Kết quả <b className="text-slate-700">{dec(x.results)}</b>{x.deltas?.results != null && ` (${x.deltas.results > 0 ? "+" : ""}${x.deltas.results}%)`}</span>
                <span>Giá/KQ <b className="text-slate-700">{vnd(x.cpr)}</b>{x.deltas?.cpr != null && <span className={x.deltas.cpr > 0 ? "text-rose-600" : "text-emerald-600"}> ({x.deltas.cpr > 0 ? "+" : ""}{x.deltas.cpr}%)</span>}</span>
                <span>Mốc <b className="text-slate-700">{x.baseline ? vnd(x.baseline.value) : "—"}</b>{x.baseline && <span className="text-slate-400"> · {x.baseline.label}</span>}</span>
                {x.real?.costPerCustomer != null && <span>Giá/khách chốt <b className="text-slate-700">{vnd(x.real.costPerCustomer)}</b></span>}
                {x.real?.roas != null && <span>ROAS <b className="text-slate-700">{x.real.roas}</b></span>}
              </div>
              {(x.scale.length > 0 || x.cut.length > 0) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {x.scale.length > 0 && (
                    <div className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-800">
                      <div className="mb-1 flex items-center gap-1 font-bold"><ArrowUpRight size={13} /> Đang hiệu quả — nên dồn ngân sách</div>
                      {x.scale.map((c) => <div key={c.name} className="truncate">• {c.name} — {vnd(c.cpr)}/KQ · {dec(c.results)} KQ</div>)}
                    </div>
                  )}
                  {x.cut.length > 0 && (
                    <div className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800">
                      <div className="mb-1 flex items-center gap-1 font-bold"><ArrowDownRight size={13} /> Kém — nên giảm/tắt{x.wasted > 0 ? ` (đã đốt ${vnd(x.wasted)})` : ""}</div>
                      {x.cut.map((c) => <div key={c.name} className="truncate">• {c.name} — {c.results ? vnd(c.cpr) + "/KQ" : "0 KQ"} · tiêu {vnd(c.spend)}</div>)}
                    </div>
                  )}
                </div>
              )}
            </>)}
            {x.notes?.length > 0 && <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">{x.notes.map((n) => <div key={n}>• {n}</div>)}</div>}
          </div>
        ))}
        {off.length > 0 && <div className="text-[11px] text-slate-400">Không chạy trong kỳ: {off.map((x) => x.name).join(", ")}</div>}
      </div>
    </Card>
  );
}

function AiReport({ r }) {
  if (!r) return null;
  if (typeof r === "string") return <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.replace(/\*\*/g, "")}</div>;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {r.overview && <div className="rounded-xl bg-violet-50 p-3 font-semibold leading-relaxed text-violet-900">{r.overview}</div>}
      {r.priorities?.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Việc cần làm ngay</div>
          <ol className="space-y-1.5">
            {r.priorities.map((p, i) => (
              <li key={i} className="flex gap-2 rounded-xl border border-slate-100 p-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
                <div className="min-w-0"><div className="font-bold text-slate-800">{p.what}</div>{p.how && <div className="text-xs text-slate-600">{p.how}</div>}{p.impact && <div className="mt-0.5 text-xs font-semibold text-emerald-700">→ {p.impact}</div>}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {r.accounts?.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-2">
          {r.accounts.map((a) => (
            <div key={a.name} className="rounded-xl border border-slate-100 p-3">
              <div className="font-extrabold text-slate-800">{a.name}</div>
              {a.summary && <div className="mt-0.5 text-xs text-slate-600">{a.summary}</div>}
              {a.good.map((t) => <div key={t} className="mt-1 flex gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={13} className="mt-0.5 shrink-0" />{t}</div>)}
              {a.issues.map((t) => <div key={t} className="mt-1 flex gap-1.5 text-xs text-rose-700"><XCircle size={13} className="mt-0.5 shrink-0" />{t}</div>)}
              {a.actions.map((t) => <div key={t} className="mt-1 flex gap-1.5 text-xs font-semibold text-indigo-700"><Lightbulb size={13} className="mt-0.5 shrink-0" />{t}</div>)}
            </div>
          ))}
        </div>
      )}
      {r.needData?.length > 0 && <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500"><b>Để đánh giá chuẩn hơn:</b> {r.needData.join(" · ")}</div>}
    </div>
  );
}

// ---------- Quảng cáo (bài) trong tài khoản: đang chạy + có chi tiêu trong kỳ ----------
const ADS_CACHE = new Map();
function LiveAds({ a, since, until, target }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("running");
  const [sort, setSort] = useState("spend");
  const [open, setOpen] = useState(null);
  const key = `${a.id}|${since}|${until}`;
  useEffect(() => {
    let alive = true; setErr("");
    const c = ADS_CACHE.get(key);
    if (c && Date.now() - c.at < 300000) { setList(c.v); return; }
    setList(null);
    loadAccountAds(a.id, since, until).then((v) => { ADS_CACHE.set(key, { at: Date.now(), v }); alive && setList(v); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [key]);
  if (err) return <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-600">{err}</div>;
  if (!list) return <div className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Đang lấy quảng cáo từ Facebook…</div>;
  const running = list.filter((x) => x.running), spent = list.filter((x) => x.spend > 0);
  const shown = (mode === "running" ? running : spent).slice().sort((x, y) => (sort === "cpr" ? (x.cpr ?? 1e15) - (y.cpr ?? 1e15) : sort === "results" ? y.results - x.results : y.spend - x.spend));
  const conv = a.group === "conv";
  const chip = (on) => `rounded-lg px-2.5 py-1 text-[11px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setMode("running")} className={chip(mode === "running")}>Đang chạy ({running.length})</button>
        <button onClick={() => setMode("spent")} className={chip(mode === "spent")}>Có chi tiêu trong kỳ ({spent.length})</button>
        <span className="ml-auto text-[11px] text-slate-400">Xếp:</span>
        {[["spend", "Chi tiêu"], conv && ["results", "Kết quả"], conv && ["cpr", "Giá/KQ rẻ"]].filter(Boolean).map(([k, l]) => <button key={k} onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>)}
      </div>
      {shown.length === 0 && <div className="py-4 text-center text-xs text-slate-400">{mode === "running" ? "Không có quảng cáo nào đang chạy." : "Không có quảng cáo nào tiêu tiền trong kỳ."}</div>}
      <div className="space-y-2">
        {shown.map((x) => {
          const [st, tone] = statusOf(x.status);
          const v = conv && x.spend > 0 && target ? judge(x, target) : null;
          const M = ({ l, val, hi }) => <div className="min-w-0"><div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{l}</div><div className={`truncate text-[12.5px] font-extrabold tabular-nums ${hi || "text-slate-800"}`}>{val}</div></div>;
          return (
            <div key={x.id} className="rounded-xl border border-slate-100 p-2.5">
              <div className="flex gap-2.5">
                <a href={x.postUrl || undefined} target="_blank" rel="noreferrer" className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {x.img ? <img src={x.img} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon size={18} className="m-auto mt-5 text-slate-300" />}
                  {x.type === "VIDEO" && <PlayCircle size={18} className="absolute bottom-1 right-1 rounded-full bg-black/40 text-white" />}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={tone}>{st}</Badge>
                    {v && <span title={v.reason || ""}><Badge tone={v.tone}>{v.label}{v.lowSample ? "*" : ""}</Badge></span>}
                    {x.objective && <span className="text-[10.5px] font-semibold text-slate-400">{x.objective}{x.optimize ? " · tối ưu " + x.optimize : ""}</span>}
                  </div>
                  <button onClick={() => setOpen(open === x.id ? null : x.id)} className={`mt-0.5 block w-full text-left text-[12.5px] leading-snug text-slate-700 ${open === x.id ? "whitespace-pre-line" : "line-clamp-2"}`}>{x.body || x.title || x.name}</button>
                  <div className="mt-0.5 truncate text-[10.5px] text-slate-400" title={`${x.campaign} › ${x.adset} › ${x.name}`}>{x.campaign} › {x.adset}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
                <M l="Chi tiêu" val={vnd(x.spend)} />
                {conv ? <M l="Kết quả" val={`${int(x.results)}${x.leads ? ` (${x.leads} lead)` : ""}`} /> : <M l="Tiếp cận" val={int(x.reach)} />}
                {conv ? <M l="Giá/KQ" val={vnd(x.cpr)} hi={v ? { emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" }[v.tone] : undefined} /> : <M l="CPM" val={vnd(x.cpm)} />}
                {conv ? <M l="Tiếp cận" val={int(x.reach)} /> : <M l="Tần suất" val={dec(x.frequency)} hi={x.frequency > 3 ? "text-rose-600" : undefined} />}
                <M l="CTR" val={pct(x.ctr)} hi={x.impressions >= 1000 && x.ctr < 0.8 ? "text-rose-600" : undefined} />
                <M l={x.dailyBudget ? "NS/ngày" : "Tương tác"} val={x.dailyBudget ? vnd(x.dailyBudget) : int(x.engagement)} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-400">
                {x.cta && <span>Nút: <b className="text-slate-500">{x.cta}</b></span>}
                {x.thruplay > 0 && <span>ThruPlay <b className="text-slate-500">{int(x.thruplay)}</b></span>}
                <span>Tạo {x.created ? new Date(x.created).toLocaleDateString("vi-VN") : "—"}</span>
                {x.postUrl && <a href={x.postUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 font-bold text-indigo-600">Xem bài <ExternalLink size={11} /></a>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountCard({ a, since, until, onChanged }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(a.platform === "google" ? "convs" : "live");
  const { settings = {}, setSettings, isOwner } = useData();
  const kpi = (settings.adsTargets || {})[a.id];
  const bl = a.group === "conv" ? baselineOf(a, kpi) : null;
  // dòng con: KPI nếu có, không thì TB tài khoản kỳ này (xếp hạng trong tài khoản) — giống adsDiagnose
  const itemTarget = kpi?.cpr > 0 ? kpi.cpr : a.totals?.results >= 3 && a.totals.cpr ? a.totals.cpr : bl?.value;
  const vrows = (list) => (list || []).map((x) => ({ ...x, _v: itemTarget ? judge(x, itemTarget) : null }));
  const isG = a.platform === "google";
  const cols = a.group === "conv" ? [...colsOf(a), vCol] : colsOf(a);
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
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left">
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        <span className="text-base font-extrabold">{a.name}</span>
        <Badge tone={isG ? "emerald" : "sky"}>{isG ? "Google" : "Meta"}</Badge>
        <Badge tone={a.group === "conv" ? "indigo" : "amber"}>{a.group === "conv" ? "Chuyển đổi" : "Thương hiệu"}</Badge>
        {isG && a.lastSync && <span className="text-[11px] text-slate-400">số đến {new Date(a.lastSync).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}
        {a.status && a.status !== 1 && <Badge tone="rose">Tài khoản không hoạt động</Badge>}
        {a.issues?.length > 0 && <Badge tone="rose">{a.issues.length} QC bị từ chối</Badge>}
        {a.group === "brand" && t.frequency > 3 && <Badge tone="rose">Tần suất cao</Badge>}
        {a.currency && a.currency !== "VND" && <Badge tone="slate">{a.currency}</Badge>}
        {isG && a.status && a.status !== "ENABLED" && <Badge tone="rose">Google: {a.status}</Badge>}
        {a.group === "conv" && t.spend > 0 && (bl && bl.source !== "avg" ? <VBadge v={judge(t, bl.value)} /> : <Badge tone="slate">Chưa có KPI</Badge>)}
        {a.bal && <Badge tone={balTone(a.bal)}>Số dư {formatShort(a.bal.balance)}{a.bal.daysLeft != null ? ` · ~${a.bal.daysLeft.toFixed(1)} ngày` : ""}</Badge>}
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
          {isOwner && a.group === "conv" && <KpiBox a={a} kpi={kpi} onSave={(v) => setSettings({ adsTargets: { ...(settings.adsTargets || {}), [a.id]: v } })} />}
          {isOwner && <BalanceBox a={a} onChanged={onChanged} />}
          {a.group === "conv" && <RealResults acc={a} since={since} until={until} spend={t.spend} />}
          {a.issues?.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
              <b>Quảng cáo có vấn đề:</b> {a.issues.map((x) => (x.status === "POLICY" ? x.name : `${x.name} (${x.status === "DISAPPROVED" ? "bị từ chối" : "có vấn đề"})`)).join(" · ")}
            </div>
          )}
          <div className="flex gap-1.5">
            {(isG ? [["convs", "Loại chuyển đổi"], ["campaigns", "Chiến dịch"], ["keywords", "Từ khoá"]] : [["live", "Quảng cáo đang chạy"], a.services && ["services", "Theo dịch vụ"], ["campaigns", "Chiến dịch"], a.adsets?.length > 0 && ["adsets", "Nhóm QC"], ["ads", a.group === "conv" ? "QC rẻ / đắt" : "Top quảng cáo"], a.byAgeGender?.length > 0 && ["age", "Tuổi / giới"], a.byPlacement?.length > 0 && ["place", "Vị trí"]]).filter(Boolean).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {tab === "services" && <Table rows={vrows(a.services)} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} />}
          {tab === "campaigns" && <Table rows={vrows(a.campaigns.filter((c) => c.spend > 0 || c.idle)).map((c) => ({ ...c, info: [c.status && c.status !== "ACTIVE" ? c.status : null, c.dailyBudget ? "NS " + formatShort(c.dailyBudget) + "/ngày" : null, c.idle ? "đang bật nhưng không tiêu" : null].filter(Boolean).join(" · ") }))} cols={cols} sub="info" />}
          {tab === "adsets" && <Table rows={vrows(a.adsets)} cols={cols} sub="campaign" />}
          {tab === "live" && <LiveAds a={a} since={since} until={until} target={a.group === "conv" ? itemTarget : null} />}
          {tab === "ads" && <Table rows={vrows(topAds).map((x) => ({ ...x, info: [x.campaign, x.quality && x.quality !== "UNKNOWN" ? "chất lượng " + RANK[x.quality] : null, x.convRank && x.convRank !== "UNKNOWN" ? "chuyển đổi " + RANK[x.convRank] : null].filter(Boolean).join(" · ") }))} cols={cols} sub="info" />}
          {tab === "age" && <Table rows={vrows(a.byAgeGender).map((x) => ({ ...x, name: (x.gender === "female" ? "Nữ" : x.gender === "male" ? "Nam" : "?") + " " + x.age }))} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} />}
          {tab === "place" && <Table rows={vrows(a.byPlacement).map((x) => ({ ...x, name: x.platform + " · " + x.position }))} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} />}
          {tab === "convs" && (
            <Table rows={(a.convActions || []).map((c) => ({ ...c, label: (CONV_CAT[c.category] || c.category || "") + (c.counted === false ? " · không tính vào cột Chuyển đổi" : "") }))} sub="label"
              cols={[["conversions", "Chuyển đổi", dec], ["allConversions", "Tất cả CĐ", dec], ["cpa", "CP/CĐ loại này", vnd], ["value", "Giá trị", vnd]]} />
          )}
          {tab === "keywords" && <Table rows={vrows(a.keywords)} cols={cols.filter(([k]) => k !== "budgetLostIS")} sub="campaign" />}
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
  const { isOwner, ownerId, perms = [], settings = {}, adsResults = [] } = useData();
  const canView = isOwner || (!!ownerId && perms.includes("ads")); // tài khoản phụ có quyền Quảng cáo: xem số liệu (máy chủ chỉ cho chế độ đọc)
  setAdsProxy(!!ownerId && !isOwner);
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
  useEffect(() => { if (canView) load(); /* eslint-disable-next-line */ }, [since, until, compare, canView]);
  // Kỳ có HÔM NAY → tự làm mới 5 phút/lần khi tab đang mở (Meta trễ ~15-30 phút so với thực tế)
  useEffect(() => {
    if (!canView || !live) return;
    const t = setInterval(() => { if (!document.hidden) load(true); }, 300000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [since, until, compare, canView, live]);

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

  const diag = useMemo(() => (data ? diagnose(accounts, { targets: settings.adsTargets || {}, adsResults, since, until }) : null), [data, group, settings.adsTargets, adsResults, since, until]);

  const runAi = async () => {
    setAi({ busy: true, text: "", err: "" });
    try {
      const text = await aiAdsAnalysis({ diagnosis: diag, group, apiKey: settings.openaiKey });
      setAi({ busy: false, text, err: "" });
    } catch (e) { setAi({ busy: false, text: "", err: e.message || String(e) }); }
  };
  if (!canView) return <Card><div className="text-sm text-slate-500">Bạn chưa được cấp quyền xem Quảng cáo.</div></Card>;

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

      <AlertsPanel tick={data?.updatedAt} />

      <div className="flex gap-2 px-3 sm:px-0">
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
        {!ai.text && !ai.busy && !ai.err && <div className="mt-2 text-xs text-slate-400">AI đọc bảng chấm điểm bên dưới (số đã tính sẵn, không tự đoán) và đưa ra việc cần làm cụ thể cho từng chiến dịch.</div>}
        <AiReport r={ai.text} />
      </Card>

      <Scorecard diag={diag} onWeek={() => { setPreset("7d"); setRange(presetRange("7d")); }} />

      {loading && !data && <Card><div className="text-sm text-slate-400">Đang tải số liệu từ Meta…</div></Card>}
      {data && !data.accounts?.length && <Card><div className="text-sm text-slate-500">Chưa có tài khoản quảng cáo nào. Vào <b>Cài đặt → Quảng cáo — tài khoản Meta & Google</b> để dán token và chọn tài khoản.</div></Card>}
      {accounts.map((a) => <AccountCard key={a.id} a={a} since={since} until={until} onChanged={() => load(true)} />)}
    </div>
  );
}
