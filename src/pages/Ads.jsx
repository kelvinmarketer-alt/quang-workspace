import { Card, StatCard } from "../components/ui.jsx";
import { Eye, Loader2, Megaphone, MessageCircle, RefreshCw, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import { RangePicker, makePeriod, usePeriod } from "./Web.jsx";
import { SideDrawer, ViewToggle, loadView, saveView } from "../components/ReportKit.jsx";
import { aiAdsAnalysis } from "../lib/ai.js";
import { classifyAdsError, loadHealth, saveHealth, tokenWarnings, updateHealth } from "../lib/adsTokenHealth.js";
import { diagnose } from "../lib/adsDiagnose.js";
import { goalBaselines } from "../lib/adsGoals.js";
import { loadCampaignGoals } from "../lib/fbAds.js";
import { todayISO } from "../lib/format.js";
import { useData } from "../lib/store.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccountCard, AdsAnswer, AdsRank, AdsTodo, TokenBanner, sumGroup } from "../components/ads/AdsAccount.jsx";
import { AiReport, AlertsPanel, Scorecard, invoke } from "../components/ads/AdsPanels.jsx";
import { dec, dm, enrichGoals, int, lsGet, lsSet, vnd } from "../components/ads/adsUtil.jsx";

// ---------- định dạng (kiểu Việt: dấu phẩy thập phân, giống Website / Fanpage) ----------
const REPORT_CACHE = new Map();
// 10/11: nhớ bộ số quảng cáo gần nhất trên máy → mở trang là thấy số cũ ngay (mờ + "Đang tải…"), số mới về thì thay. Trước phải chờ Meta 6–10 giây mới có gì để xem.
const LS_ADS = "qws_ads_last";
const adsSaved = (u) => { try { const o = JSON.parse(lsGet(LS_ADS) || "null"); return o && o.key && o.v && o.u === u ? o : null; } catch { return null; } }; // u = email đang đăng nhập: không hiện số của tài khoản khác trên cùng máy

export default function Ads() {
  const { isOwner, ownerId, perms = [], settings = {}, adsResults = [], myEmail = "" } = useData();
  const canView = isOwner || (!!ownerId && perms.includes("ads")); // tài khoản phụ có quyền Quảng cáo: xem số liệu (máy chủ chỉ cho chế độ đọc)
  const [period, setPeriod] = usePeriod("today"); // nhớ chung với Website / Fanpage; chưa chọn bao giờ → Hôm nay
  const [compare, setCompare] = useState(true);
  const [group, setGroupS] = useState(() => (lsGet("qws-ads-group") === "brand" ? "brand" : "conv"));
  const setGroup = (g) => { setGroupS(g); lsSet("qws-ads-group", g); };
  const { since, until } = period;
  const rKey = `${since}|${until}|${compare}`;
  const [data, setData] = useState(() => { const o = adsSaved(myEmail); if (o && o.key === rKey && !REPORT_CACHE.has(rKey)) REPORT_CACHE.set(rKey, { at: o.at || 0, v: o.v }); return REPORT_CACHE.get(rKey)?.v || o?.v || null; });
  const [dataKey, setDataKey] = useState(() => (REPORT_CACHE.get(rKey) ? rKey : adsSaved(myEmail)?.key || "")); // kỳ của số đang hiện
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false); // tải ngầm
  const [err, setErr] = useState("");
  const [aiState, setAiState] = useState({}); // kết quả AI theo "nhóm|từ|đến" → mỗi kỳ hiện đúng phân tích của nó
  const [view, setView] = useState(() => loadView("qws_ads_view"));
  const [openAcc, setOpenAcc] = useState(null); // tài khoản mở trong ngăn chi tiết
  const live = until >= todayISO();
  const stale = !!data && dataKey !== rKey; // số đang hiện là của kỳ khác (đang chờ kỳ mới)
  const reqRef = useRef(0);

  // force = bỏ qua cache (Làm mới) · silent = tải ngầm, không che màn hình, không báo lỗi
  const load = async ({ force = false, silent = false } = {}) => {
    const key = rKey, c = REPORT_CACHE.get(key), id = ++reqRef.current;
    if (!force && c) {
      setData(c.v); setDataKey(key); setErr("");
      if (Date.now() - c.at < 300000) { setLoading(false); setSyncing(false); return; }
      silent = true;
    }
    setLoading(!silent); setSyncing(silent);
    if (!silent) setErr("");
    try {
      const d = await invoke({ since, until, compare });
      REPORT_CACHE.set(key, { at: Date.now(), v: d });
      lsSet(LS_ADS, JSON.stringify({ key, u: myEmail, at: Date.now(), v: d }));
      if (id === reqRef.current) { setData(d); setDataKey(key); setErr(""); }
    } catch (e) { if (id === reqRef.current && !silent) setErr(e.message || String(e)); }
    if (id === reqRef.current) { setLoading(false); setSyncing(false); }
  };
  useEffect(() => { if (canView) load(); /* eslint-disable-next-line */ }, [rKey, canView]);
  // Kỳ có HÔM NAY → tự làm mới 5 phút/lần khi tab đang mở (Meta trễ ~15-30 phút so với thực tế)
  useEffect(() => {
    if (!canView || !live) return;
    const t = setInterval(() => { if (!document.hidden) load({ force: true, silent: true }); }, 300000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [rKey, canView, live]);

  // Mục tiêu từng chiến dịch Meta (lấy 1 lần/30 phút/TK) → gắn kết quả + chi phí theo mục tiêu. Lỗi → báo + Thử lại
  const [goals, setGoals] = useState({});
  const [goalErr, setGoalErr] = useState({});
  const goalReq = useRef(new Set());
  const fetchGoals = (id) => {
    if (goalReq.current.has(id)) return;
    goalReq.current.add(id);
    setGoalErr((o) => { if (!o[id]) return o; const n = { ...o }; delete n[id]; return n; });
    loadCampaignGoals(id).then((v) => setGoals((o) => ({ ...o, [id]: v })))
      .catch((e) => setGoalErr((o) => ({ ...o, [id]: e.message || String(e) })))
      .finally(() => goalReq.current.delete(id));
  };
  useEffect(() => {
    for (const a of data?.accounts || []) if (a.platform !== "google" && !a.error && !goals[a.id] && !goalErr[a.id]) fetchGoals(a.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const allAccs = useMemo(() => (data?.accounts || []).map((a) => enrichGoals(a, goals[a.id])), [data, goals]);
  const goalBase = useMemo(() => goalBaselines(allAccs.flatMap((a) => (a.platform === "google" || !a.goalsLoaded ? [] : a.campaigns || []))), [allAccs]);
  const accounts = allAccs.filter((a) => a.group === group);
  const tot = useMemo(() => sumGroup(accounts), [data, group]);
  const prevTot = useMemo(() => {
    if (!data?.prev) return null;
    const ok = accounts.filter((a) => !a.error && a.prev);
    const s = { spend: 0, results: 0, impressions: 0, reach: 0 };
    for (const a of ok) for (const k of Object.keys(s)) s[k] += a.prev[k] || 0;
    s.cpr = s.results ? s.spend / s.results : null; s.cpm = s.impressions ? (s.spend / s.impressions) * 1000 : null;
    return s;
  }, [data, group]);

  // 11/11: sổ sức khoẻ token (nhớ trên máy) — cập nhật mỗi lần có số MỚI của đúng kỳ
  const [health, setHealth] = useState(loadHealth);
  useEffect(() => {
    if (!data?.accounts || stale) return;
    setHealth((h) => { const n = updateHealth(h, data.accounts); saveHealth(n); return n; });
  }, [data, stale]);
  const tokenWarns = useMemo(() => (data?.accounts && !stale ? tokenWarnings(health, data.accounts) : []), [health, data, stale]);
  const officeTokErr = useMemo(() => Object.entries(goalErr).filter(([, m]) => classifyAdsError(m) === "token").map(([id]) => ({ id, name: (data?.accounts || []).find((a) => a.id === id)?.name || id })), [goalErr, data]);

  const diag = useMemo(() => (data ? diagnose(accounts, { targets: settings.adsTargets || {}, adsResults, since, until, goalBase }) : null), [allAccs, goalBase, group, settings.adsTargets, adsResults, since, until]);

  const aiKey = `${group}|${since}|${until}`;
  const ai = aiState[aiKey] || {};
  const runAi = async () => {
    const key = aiKey;
    setAiState((s) => ({ ...s, [key]: { busy: true } }));
    try {
      const text = await aiAdsAnalysis({ diagnosis: diag, group, apiKey: settings.openaiKey });
      setAiState((s) => ({ ...s, [key]: { text } }));
    } catch (e) { setAiState((s) => ({ ...s, [key]: { err: e.message || String(e) } })); }
  };
  if (!canView) return <Card><div className="text-sm text-slate-500">Bạn chưa được cấp quyền xem Quảng cáo.</div></Card>;

  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={period} onChange={setPeriod} />
          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />So với kỳ trước</label>
          <button onClick={() => load({ force: true })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={13} className={loading || syncing ? "animate-spin" : ""} />Làm mới</button>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          {dm(since)}{since !== until && " → " + dm(until)}
          {data?.updatedAt && !stale && ` · cập nhật ${new Date(data.updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
          {live && " · số hôm nay Meta trễ ~15-30 phút, tự làm mới 5 phút/lần"}
          {data?.prev && !stale && ` · kỳ trước ${dm(data.prev.since)} → ${dm(data.prev.until)}`}
        </div>
        {err && <div className="mt-2 rounded-xl bg-rose-50 p-2 text-xs text-rose-700">Lỗi tải số liệu: {err}</div>}
      </Card>

      <TokenBanner warns={tokenWarns} officeErr={officeTokErr} isOwner={isOwner} />
      <AdsAnswer diag={diag} tot={tot} group={group} live={live} />
      <AlertsPanel tick={data?.updatedAt} />

      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-0">
        {[["conv", "Chuyển đổi", Target], ["brand", "Thương hiệu", Megaphone]].map(([k, l, I]) => (
          <button key={k} onClick={() => setGroup(k)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${group === k ? "bg-white text-slate-900 shadow ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60"}`}><I size={15} />{l}</button>
        ))}
        <span className="ml-auto"><ViewToggle value={view} onChange={(v) => { setView(v); saveView("qws_ads_view", v); }} /></span>
        {stale && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{loading ? <><Loader2 size={12} className="animate-spin" /> Đang tải…</> : "Đang hiện số của kỳ khác"}</span>}
      </div>

      {/* Đang tải kỳ mới → làm mờ số cũ để không nhầm là số của kỳ vừa chọn */}
      <div className={`space-y-4 transition-opacity ${stale ? "opacity-50" : ""}`}>
        {!data ? (!err && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[74px] animate-pulse sm:h-[104px]" />)}</div>
        )) : (
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
        )}

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} className="text-violet-500" />
            <span className="text-sm font-extrabold">AI phân tích nhóm {group === "conv" ? "Chuyển đổi" : "Thương hiệu"}</span>
            <button onClick={runAi} disabled={ai.busy || !data || stale} className="ml-auto rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{ai.busy ? "Đang phân tích…" : ai.text ? "Phân tích lại" : "Phân tích"}</button>
          </div>
          {ai.err && <div className="mt-2 text-xs text-rose-600">{ai.err}</div>}
          {!ai.text && !ai.busy && !ai.err && <div className="mt-2 text-xs text-slate-400">AI đọc bảng chấm điểm bên dưới (số đã tính sẵn, không tự đoán) và đưa ra việc cần làm cụ thể cho từng chiến dịch.</div>}
          <AiReport r={ai.text} />
        </Card>

        <AdsTodo who={myEmail} diag={diag} onPick={setOpenAcc} />
        {view === "rank" ? <AdsRank diag={diag} group={group} onPick={setOpenAcc} /> : <Scorecard diag={diag} onWeek={() => setPeriod(makePeriod("7d"))} />}

        {loading && !data && <Card><div className="text-sm text-slate-400">Đang tải số liệu từ Meta…</div></Card>}
        {data && !data.accounts?.length && <Card><div className="text-sm text-slate-500">Chưa có tài khoản quảng cáo nào. Vào <b>Cài đặt → Quảng cáo — tài khoản Meta & Google</b> để dán token và chọn tài khoản.</div></Card>}
        {view === "cards" && accounts.map((a) => <AccountCard key={a.id} a={a} since={since} until={until} goalBase={goalBase} goalErr={goalErr[a.id]} onRetryGoals={() => fetchGoals(a.id)} onChanged={() => load({ force: true, silent: true })} />)}
      </div>
      {openAcc && (() => { const a = accounts.find((x) => x.id === openAcc); const sc = diag?.accounts?.find((x) => x.id === openAcc); if (!a) return null;
        return (
          <SideDrawer onClose={() => setOpenAcc(null)} label={a.name}>
            {sc && <Scorecard diag={{ ...diag, accounts: [sc] }} onWeek={() => setPeriod(makePeriod("7d"))} />}
            <AccountCard a={a} since={since} until={until} goalBase={goalBase} goalErr={goalErr[a.id]} onRetryGoals={() => fetchGoals(a.id)} onChanged={() => load({ force: true, silent: true })} />
          </SideDrawer>
        ); })()}
    </div>
  );
}
