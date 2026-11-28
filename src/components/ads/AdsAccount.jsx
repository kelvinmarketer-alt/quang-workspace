// Tách từ pages/Ads.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, KeyRound, Loader2, PlayCircle } from "lucide-react";
import { AnswerCard, Leaderboard } from "../ReportKit.jsx";
import { Badge, Card } from "../ui.jsx";
import { BalanceBox, CONV_CAT, KpiBox, RealResults, VBadge, balTone, vCol } from "./AdsPanels.jsx";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Delta, GOAL_COLS, Metric, RANK, Table, V_RANK, Warn, colsOf, dec, dm, int, lsSet, pct, vnd } from "./adsUtil.jsx";
import { GOALS, judgeGoal } from "../../lib/adsGoals.js";
import { agoVI, openSettingsSection } from "../../lib/adsTokenHealth.js";
import { baselineOf, judge } from "../../lib/adsDiagnose.js";
import { fmtNum, fmtShort } from "../../lib/format.js";
import { loadAccountAds, statusOf } from "../../lib/fbAds.js";
import { useData } from "../../lib/store.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const ADS_CACHE = new Map();
export function LiveAds({ a, since, until, goalBase }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("running");
  const [sort, setSort] = useState("spend");
  const [open, setOpen] = useState(null);
  const [retry, setRetry] = useState(0);
  const key = `${a.id}|${since}|${until}`;
  useEffect(() => {
    let alive = true; setErr("");
    const c = ADS_CACHE.get(key);
    if (c && Date.now() - c.at < 300000) { setList(c.v); return; }
    setList(null);
    // lỗi lấy chi tiêu (spentError) → không cache, để bấm Thử lại là gọi lại Facebook
    loadAccountAds(a.id, since, until).then((v) => { if (!v.spentError) ADS_CACHE.set(key, { at: Date.now(), v }); alive && setList(v); }).catch((e) => alive && setErr(e.message || String(e)));
    return () => { alive = false; };
  }, [key, retry]);
  const reload = () => { ADS_CACHE.delete(key); setRetry((n) => n + 1); };
  if (err) return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-600">
      <span className="min-w-0 flex-1">{err}</span>
      <button onClick={reload} className="shrink-0 rounded-md bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Thử lại</button>
    </div>
  );
  if (!list) return <div className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Đang lấy quảng cáo từ Facebook…</div>;
  const running = list.filter((x) => x.running), spent = list.filter((x) => x.spend > 0);
  // Xếp "rẻ nhất" theo tỉ lệ so với mốc CỦA ĐÚNG MỤC TIÊU từng QC (QC tiếp cận không so với QC tin nhắn)
  const ratioOf = (x) => { const b = goalBase?.[x.goal]; return x.goalCost != null && b ? x.goalCost / b.value : 1e9; };
  const shown = (mode === "running" ? running : spent).slice().sort((x, y) => (sort === "cpr" ? ratioOf(x) - ratioOf(y) : sort === "results" ? (y.msgs || 0) - (x.msgs || 0) : y.spend - x.spend));
  const chip = (on) => `min-h-8 rounded-lg px-3 py-1.5 text-[11.5px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`; // cao ~32px cho dễ bấm
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setMode("running")} className={chip(mode === "running")}>Đang chạy ({running.length})</button>
        <button onClick={() => setMode("spent")} className={chip(mode === "spent")}>Có chi tiêu trong kỳ ({spent.length})</button>
        <span className="ml-auto text-[11px] text-slate-400">Xếp:</span>
        {[["spend", "Chi tiêu"], ["cpr", "Hiệu quả nhất"], ["results", "Nhiều tin nhắn"]].map(([k, l]) => <button key={k} onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>)}
      </div>
      {list.spentError && <div className="mb-2"><Warn onRetry={reload}>Không lấy được chi tiêu trong kỳ từ Facebook — mục "Có chi tiêu trong kỳ" có thể thiếu quảng cáo đã dừng ({list.spentError})</Warn></div>}
      {shown.length === 0 && <div className="py-4 text-center text-xs text-slate-400">{mode === "running" ? "Không có quảng cáo nào đang chạy." : "Không có quảng cáo nào tiêu tiền trong kỳ."}</div>}
      <div className="space-y-2">
        {shown.map((x) => {
          const [st, tone] = statusOf(x.status);
          const v = x.spend > 0 && goalBase ? judgeGoal(x, goalBase[x.goal]) : null;
          const G = GOALS[x.goal] || GOALS.msg;
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
                    <VBadge v={v} />
                    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700">🎯 {x.goalLabel}</span>
                    {x.objective && <span className="text-[10.5px] font-semibold text-slate-400">{x.objective}{x.optimize ? " · tối ưu " + x.optimize : ""}</span>}
                  </div>
                  <button onClick={() => setOpen(open === x.id ? null : x.id)} className={`mt-0.5 w-full text-left text-[12.5px] leading-snug text-slate-700 ${open === x.id ? "block whitespace-pre-line" : "line-clamp-2"}`} title={open === x.id ? "" : "Bấm để xem đủ nội dung"}>{x.body || x.title || x.name}</button>
                  <div className="mt-0.5 truncate text-[10.5px] text-slate-400" title={`${x.campaign} › ${x.adset} › ${x.name}`}>{x.campaign} › {x.adset}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
                <M l="Chi tiêu" val={vnd(x.spend)} />
                <M l={`KQ · ${G.label}`} val={x.goal === "reach" ? `${int(x.reach)} người` : `${int(x.goalResults)} ${G.unit}`} />
                <M l={G.costLabel} val={vnd(x.goalCost)} hi={v ? { emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" }[v.tone] : undefined} />
                <M l="Chi phí/tin nhắn" val={x.msgs ? `${vnd(x.costMsg)} (${int(x.msgs)})` : "0 tin"} />
                <M l="CTR" val={pct(x.ctr)} hi={x.impressions >= 1000 && x.ctr < 0.8 ? "text-rose-600" : undefined} />
                <M l={x.goal === "reach" ? "Tần suất" : x.dailyBudget ? "NS/ngày" : "Tiếp cận"} val={x.goal === "reach" ? dec(x.frequency) : x.dailyBudget ? vnd(x.dailyBudget) : int(x.reach)} hi={x.goal === "reach" && x.frequency > 3 ? "text-rose-600" : undefined} />
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

export function AccountCard({ a, since, until, onChanged, goalBase, goalErr, onRetryGoals }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(a.platform === "google" ? "convs" : "live");
  const { settings = {}, setSettings, isOwner } = useData();
  const kpi = (settings.adsTargets || {})[a.id];
  const bl = a.group === "conv" ? baselineOf(a, kpi) : null;
  // dòng con: KPI nếu có, không thì TB tài khoản kỳ này (xếp hạng trong tài khoản) — giống adsDiagnose
  const itemTarget = kpi?.cpr > 0 ? kpi.cpr : a.totals?.results >= 3 && a.totals.cpr ? a.totals.cpr : bl?.value;
  const kpiBase = kpi?.cpr > 0 ? { value: kpi.cpr, label: "KPI bạn đặt" } : null;
  // Meta: mỗi dòng chấm theo MỤC TIÊU của nó (tiếp cận so với tiếp cận, tin nhắn so với tin nhắn…)
  const vrows = (list) => (list || []).map((x) => ({ ...x, _v: x.goal && goalBase ? judgeGoal(x, (x.goal === "msg" || x.goal === "lead") && kpiBase ? kpiBase : goalBase[x.goal]) : itemTarget ? judge(x, itemTarget) : null }));
  const goalCols = a.platform !== "google" && a.goalsLoaded ? [...GOAL_COLS, vCol] : null;
  const goalInfo = (x, extra = []) => [x.goal && `🎯 ${x.goalLabel}${x.goal === "reach" ? " (chi phí/1.000 người)" : ""}`, ...extra].filter(Boolean).join(" · ");
  const isG = a.platform === "google";
  const cols = a.group === "conv" ? [...colsOf(a), vCol] : colsOf(a);
  const csv = (n) => `${a.name}-${n}-${since}_${until}`;
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
        {a.bal && <Badge tone={balTone(a.bal)}>Số dư {fmtShort(a.bal.balance)}{a.bal.daysLeft != null ? ` · ~${fmtNum(a.bal.daysLeft, 1)} ngày` : ""}</Badge>}
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
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={fmtShort} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} tickFormatter={fmtShort} />
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
          {goalErr && <Warn onRetry={onRetryGoals}>Không lấy được mục tiêu chiến dịch từ Facebook — bảng đang tạm tính theo {a.group === "conv" ? "tin nhắn" : "tiếp cận"} ({goalErr})</Warn>}
          <div className="flex gap-1.5 overflow-x-auto">
            {(isG ? [["convs", "Loại chuyển đổi"], ["campaigns", "Chiến dịch"], ["keywords", "Từ khoá"]] : [["live", "Quảng cáo đang chạy"], a.services && ["services", "Theo dịch vụ"], ["campaigns", "Chiến dịch"], a.adsets?.length > 0 && ["adsets", "Nhóm QC"], ["ads", a.group === "conv" ? "QC rẻ / đắt" : "Top quảng cáo"], a.byAgeGender?.length > 0 && ["age", "Tuổi / giới"], a.byPlacement?.length > 0 && ["place", "Vị trí"]]).filter(Boolean).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${tab === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {tab === "services" && <Table rows={vrows(a.services).map((x) => ({ ...x, info: goalInfo(x) }))} cols={goalCols || cols.filter(([k]) => !["reach", "frequency"].includes(k))} sub="info" csvName={csv("dich-vu")} />}
          {tab === "campaigns" && <Table rows={vrows(a.campaigns.filter((c) => c.spend > 0 || c.idle)).map((c) => ({ ...c, info: goalInfo(c, [c.status && c.status !== "ACTIVE" ? c.status : null, c.dailyBudget ? "NS " + fmtShort(c.dailyBudget) + "/ngày" : null, c.idle ? "đang bật nhưng không tiêu" : null]) }))} cols={goalCols || cols} sub="info" csvName={csv("chien-dich")} />}
          {tab === "adsets" && <Table rows={vrows(a.adsets).map((x) => ({ ...x, info: goalInfo(x, [x.campaign]) }))} cols={goalCols || cols} sub="info" csvName={csv("nhom-qc")} />}
          {tab === "live" && <LiveAds a={a} since={since} until={until} goalBase={goalBase} />}
          {tab === "ads" && <Table rows={vrows(topAds).map((x) => ({ ...x, info: [x.goal && `🎯 ${x.goalLabel}`, x.campaign, x.quality && x.quality !== "UNKNOWN" ? "chất lượng " + RANK[x.quality] : null, x.convRank && x.convRank !== "UNKNOWN" ? "chuyển đổi " + RANK[x.convRank] : null].filter(Boolean).join(" · ") }))} cols={goalCols || cols} sub="info" csvName={csv("quang-cao")} />}
          {tab === "age" && <Table rows={vrows(a.byAgeGender).map((x) => ({ ...x, name: (x.gender === "female" ? "Nữ" : x.gender === "male" ? "Nam" : "?") + " " + x.age }))} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} csvName={csv("tuoi-gioi")} />}
          {tab === "place" && <Table rows={vrows(a.byPlacement).map((x) => ({ ...x, name: x.platform + " · " + x.position }))} cols={cols.filter(([k]) => !["reach", "frequency"].includes(k))} csvName={csv("vi-tri")} />}
          {tab === "convs" && (
            <Table rows={(a.convActions || []).map((c) => ({ ...c, label: (CONV_CAT[c.category] || c.category || "") + (c.counted === false ? " · không tính vào cột Chuyển đổi" : "") }))} sub="label" csvName={csv("loai-chuyen-doi")}
              cols={[["conversions", "Chuyển đổi", dec], ["allConversions", "Tất cả CĐ", dec], ["cpa", "CP/CĐ loại này", vnd], ["value", "Giá trị", vnd]]} />
          )}
          {tab === "keywords" && <Table rows={vrows(a.keywords)} cols={cols.filter(([k]) => k !== "budgetLostIS")} sub="campaign" csvName={csv("tu-khoa")} />}
        </div>
      )}
    </Card>
  );
}

// ---------- tầng 1 + 2 (01/11): câu trả lời, xếp hạng giá/kết quả có vạch mốc, 3 việc nên làm ----------
export const V_TONE = { great: "g", good: "g", ok: "g", warn: "w", fatigue: "w", thin: "n", bad: "b", burn: "b", off: "n" };
export function AdsAnswer({ diag, tot, group, live }) {
  const rows = (diag?.accounts || []).filter((x) => x.spend > 0);
  if (!diag) return <AnswerCard eyebrow="Quảng cáo" title="Đang lấy số quảng cáo…" />;
  const bad = rows.filter((x) => ["bad", "burn"].includes(x.verdict?.key)), good = rows.filter((x) => ["great", "good", "ok"].includes(x.verdict?.key));
  const title = group === "conv"
    ? `Chi ${fmtShort(tot.spend)} cho ${int(tot.results)} kết quả, ${bad.length ? `${bad.length} tài khoản vượt mốc giá` : "không tài khoản nào vượt mốc"}`
    : `Chi ${fmtShort(tot.spend)}, tiếp cận ${fmtShort(tot.reach)} người`;
  const desc = [bad.slice(0, 2).map((x) => `${x.name}${x.verdict.reason ? `: ${x.verdict.reason}` : ""}`).join(" · "), good.length ? `${good.length} tài khoản trong mốc` : null].filter(Boolean).join(" — ");
  return <AnswerCard eyebrow={`Quảng cáo · nhóm ${group === "conv" ? "Chuyển đổi" : "Thương hiệu"}`} title={title} desc={desc} live={live ? "Tự làm mới 5 phút/lần" : null} />;
}
export function AdsTodo({ diag, onPick, who = "" }) {
  const items = [];
  for (const x of diag?.accounts || []) {
    for (const c of x.cut || []) items.push({ w: (c.spend || 0) + 1e6, id: x.id, t: `${x.name}: giảm/tắt ${c.name}`, s: `${c.results ? vnd(c.cpr) + "/KQ" : "0 kết quả"} · đã tiêu ${vnd(c.spend)}`, tone: "bg-rose-50 text-rose-600" });
    for (const c of x.scale || []) items.push({ w: c.spend || 0, id: x.id, t: `${x.name}: dồn ngân sách ${c.name}`, s: `${vnd(c.cpr)}/KQ · ${dec(c.results)} kết quả`, tone: "bg-emerald-50 text-emerald-700" });
    if (["bad", "burn"].includes(x.verdict?.key) && !(x.cut || []).length) items.push({ w: x.spend, id: x.id, t: `${x.name}: xem lại`, s: x.verdict.reason || x.verdict.label, tone: "bg-amber-50 text-amber-700" });
  }
  const top = items.sort((a, b) => b.w - a.w).slice(0, 3);
  // 11/11: ghi lại để Tổng quan hiện chung trong "Việc của hôm nay" (không phải tải lại số Meta ở Tổng quan)
  const sig = top.map((x) => x.t + x.s).join("|");
  useEffect(() => { if (diag) lsSet("qws_ads_todo", JSON.stringify({ u: who, at: Date.now(), items: top.map((x) => ({ t: x.t, s: x.s })) })); /* eslint-disable-next-line */ }, [sig, !!diag, who]);
  if (!top.length) return null;
  return (
    <Card className="!p-4">
      <div className="mb-2 flex items-baseline justify-between"><h3 className="text-[15px] font-extrabold text-slate-800">Chiến dịch cần xử lý</h3><span className="hidden text-[11.5px] text-slate-400 sm:inline">từ bảng chấm điểm</span></div>
      <div className="grid gap-2 md:grid-cols-3">{top.map((x, i) => (
        <button key={i} type="button" onClick={() => onPick(x.id)} className="flex gap-2.5 rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold ${x.tone}`}>{i + 1}</span>
          <span className="min-w-0"><span className="block text-[13px] font-bold text-slate-800">{x.t}</span><span className="block truncate text-[11.5px] text-slate-400">{x.s}</span></span>
        </button>))}</div>
    </Card>
  );
}
export function AdsRank({ diag, group, onPick }) {
  if (!diag) return <Leaderboard title="Giá / kết quả theo tài khoản" rows={[]} loading />;
  const rows = (diag?.accounts || []).filter((x) => x.spend > 0);
  const conv = group === "conv";
  const val = (x) => (conv ? x.cpr : x.brand?.costPer1kReach) || 0;
  const max = Math.max(...rows.map((x) => Math.max(val(x), conv ? x.baseline?.value || 0 : 0)), 1) * 1.05;
  const list = rows.map((x) => ({ key: x.id, name: x.name, sub: [x.platform === "google" ? "Google" : "Meta", x.verdict?.label, conv ? `${dec(x.results)} KQ · chi ${fmtShort(x.spend)}` : `${int(x.brand?.reach)} tiếp cận`].filter(Boolean).join(" · "),
    value: val(x), text: val(x) ? fmtShort(val(x)) : "—", tone: V_TONE[x.verdict?.key] || "a", delta: conv ? x.deltas?.cpr : x.deltas?.cpm, deltaGood: (conv ? x.deltas?.cpr : x.deltas?.cpm) <= 0,
    mark: conv && x.baseline?.value ? x.baseline.value / max : null, rank: V_RANK[x.verdict?.key] ?? 8 }))
    .sort((a, b) => b.rank - a.rank || b.value - a.value);
  return <Leaderboard title={conv ? "Giá / kết quả theo tài khoản" : "Giá / 1.000 người tiếp cận"} hint={conv ? "vạch dọc = mốc giá · xấu nhất lên đầu · bấm để xem chiến dịch" : "bấm để xem chiến dịch"} rows={list} max={max} onPick={(r) => onPick(r.key)} empty="Không tài khoản nào chạy trong kỳ" />;
}

export function sumGroup(list) {
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

// 11/11: cảnh báo token TKQC Meta lỗi / hết hạn → dán token mới ở Cài đặt.
// App không biết trước ngày hết hạn (token chỉ nằm ở máy chủ) → báo khi Facebook trả lỗi token, kèm lần cuối tải được số.
export function TokenBanner({ warns, officeErr, isOwner }) {
  const nav = useNavigate();
  if (!warns.length && !officeErr.length) return null;
  const tok = warns.filter((w) => w.kind === "token");
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-800">
      <div className="flex flex-wrap items-start gap-2">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1 space-y-1.5">
          {warns.map((w) => (
            <div key={w.id}>
              <b>{w.kind === "token" ? `Token TKQC ${w.name} đã hết hạn / bị lỗi` : w.kind === "perm" ? `Token TKQC ${w.name} mất quyền xem tài khoản` : `TKQC ${w.name} tải lỗi ${agoVI(w.since) ? "từ " + agoVI(w.since) : ""}`}</b>
              {" — "}{isOwner ? (w.kind === "other" ? "nếu lỗi kéo dài, vào Cài đặt dán token mới." : "vào Cài đặt dán token mới.") : "báo chủ dán token mới."}
              <div className="mt-0.5 text-[11px] text-rose-600/80">
                {w.expiredOn && <>Hết hạn ngày {w.expiredOn} · </>}
                {w.lastOk ? `Lần cuối tải được số: ${agoVI(w.lastOk)}` : "Máy này chưa tải được số lần nào"}
                <span className="block truncate" title={w.err}>Facebook báo: {w.err}</span>
              </div>
            </div>
          ))}
          {officeErr.map((o) => (
            <div key={o.id}><b>Kết nối Facebook của Văn phòng AI lỗi token ({o.name})</b> — danh sách quảng cáo &amp; mục tiêu chiến dịch không tải được. {isOwner ? "Vào Cài đặt → Văn phòng AI để kết nối lại." : "Báo chủ kết nối lại."}</div>
          ))}
        </div>
        {isOwner && (
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:flex-col">
            {(warns.length > 0) && <button type="button" onClick={() => openSettingsSection(nav, "connect")} className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-rose-700">{tok.length ? "Dán token mới" : "Mở Cài đặt"}</button>}
            {officeErr.length > 0 && <button type="button" onClick={() => openSettingsSection(nav, "office")} className="flex-1 rounded-xl border border-rose-300 bg-white px-3 py-2 text-[12px] font-bold text-rose-700">Văn phòng AI</button>}
          </div>
        )}
      </div>
      {isOwner && warns.length > 0 && <div className="mt-1.5 pl-6 text-[11px] text-rose-600/80">Cài đặt → Kết nối &amp; AI → Tất cả tài khoản quảng cáo → ô "Đổi token" ở đúng tài khoản. Lưu ý: app không biết trước ngày hết hạn, chỉ báo khi Facebook đã từ chối token.</div>}
    </div>
  );
}

// Cache báo cáo chính trong bộ nhớ theo kỳ + so sánh: quay lại kỳ đã xem là hiện ngay; quá 5 phút thì hiện số cũ + tải lại ngầm
