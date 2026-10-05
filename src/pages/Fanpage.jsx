import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ArrowLeft, Sparkles, Loader2, AlertTriangle, EyeOff, Eye, ExternalLink, Users, MessageCircle, Heart, PlayCircle, ThumbsUp, Clock } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { listPages, loadPageSummary, loadPagePosts, fbRanges, pageVerdict } from "../lib/fbPages.js";
import { aiPageAnalysis } from "../lib/ai.js";
import { int, k, pct1, dm, Delta, Spark, Table, AiBox, PRESETS } from "./Web.jsx";

const pctChange = (c, p) => (c == null || p == null || !p ? null : ((c - p) / Math.abs(p)) * 100);
const CACHE = new Map();
const cached = async (key, fn) => {
  const c = CACHE.get(key);
  if (c && Date.now() - c.at < 600000) return c.v;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  return v;
};
const avatar = (id) => `https://graph.facebook.com/${id}/picture?type=square&width=64&height=64`;
const when = (s) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function PageCard({ p, sum, onOpen }) {
  const c = sum?.cur, v = sum?.prev;
  const M = ({ label, val, d }) => (
    <div className="min-w-0"><div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="flex items-baseline gap-1"><span className="text-[15px] font-extrabold tabular-nums text-slate-800">{val}</span>{d}</div></div>
  );
  return (
    <button onClick={onOpen} className="card block w-full p-3 text-left transition hover:bg-indigo-50/30">
      <div className="flex items-center gap-2">
        <img src={avatar(p.page_id)} alt="" className="h-8 w-8 shrink-0 rounded-full bg-slate-100" />
        <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-extrabold text-slate-800">{p.name}</div><div className="truncate text-[10.5px] text-slate-400">{p.category} · {int(c?.followers ?? p.fans)} theo dõi</div></div>
        {sum?.verdict && <span className="shrink-0"><Badge tone={sum.verdict.tone}>{sum.verdict.label}</Badge></span>}
      </div>
      {!sum ? <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" /> : sum.errors.length ? (
        <div className="mt-2 text-[11px] font-semibold text-amber-600">⚠ {sum.errors[0]}</div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
            <M label="Tiếp cận" val={k(c.reach)} d={<Delta cur={c.reach} prev={v.reach} />} />
            <M label="Lượt xem" val={k(c.views)} d={<Delta cur={c.views} prev={v.views} />} />
            <M label="Tương tác" val={k(c.engagement)} d={<Delta cur={c.engagement} prev={v.engagement} />} />
            <M label="Tin nhắn mới" val={k(c.messages)} d={<Delta cur={c.messages} prev={v.messages} />} />
            <M label="Theo dõi ròng" val={(c.netFollows > 0 ? "+" : "") + int(c.netFollows)} d={null} />
            <M label="Xem video" val={k(c.videoViews)} d={<Delta cur={c.videoViews} prev={v.videoViews} />} />
          </div>
          <div className="mt-2"><Spark data={sum.daily} field="views" /></div>
        </>
      )}
    </button>
  );
}

function aiPayload(p, sum, det, R) {
  const c = sum.cur, v = sum.prev, d = (a, b) => { const x = pctChange(a, b); return x == null ? null : Math.round(x); };
  const post = (x) => ({ ngay: x.at.slice(0, 16), loai: x.type, noi_dung: x.text.slice(0, 160), tiep_can: x.reach, xem: x.views, click: x.clicks, cam_xuc: x.reactions, binh_luan: x.comments, chia_se: x.shares, er: x.er != null ? +x.er.toFixed(1) : null });
  return {
    page: p.name, linh_vuc: p.category, so_ngay: R.days, ky: R.cur,
    nguoi_theo_doi: c.followers, theo_doi_moi: c.follows, bo_theo_doi: c.unfollows,
    tiep_can: c.reach, d_tiep_can: d(c.reach, v.reach), luot_xem: c.views, d_luot_xem: d(c.views, v.views),
    tuong_tac: c.engagement, d_tuong_tac: d(c.engagement, v.engagement), cam_xuc: c.reactions,
    tin_nhan_moi: c.messages, d_tin_nhan: d(c.messages, v.messages), vao_trang: c.pageViews, xem_video: c.videoViews,
    bai_trong_ky: det?.posts.length || 0, bai_moi_tuan: det ? +det.perWeek.toFixed(1) : null,
    theo_loai: det?.byType.map((x) => ({ loai: x.label, so_bai: x.n, tiep_can_tb: Math.round(x.reach), tuong_tac_tb: +x.eng.toFixed(1), er_tb: +x.er.toFixed(1) })),
    theo_gio: det?.bySlot.map((x) => ({ khung: x.label, so_bai: x.n, tiep_can_tb: Math.round(x.reach), tuong_tac_tb: +x.eng.toFixed(1) })),
    theo_thu: det?.byDow.map((x) => ({ thu: x.label, so_bai: x.n, tiep_can_tb: Math.round(x.reach) })),
    bai_top: det?.posts.slice(0, 6).map(post),
    bai_kem: det?.posts.length > 8 ? det.posts.slice(-4).map(post) : [],
  };
}

function Detail({ p, sum, R, onBack, onHide, aiState, setAiState, apiKey, aiReady }) {
  const [det, setDet] = useState(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState("reach");
  useEffect(() => {
    let alive = true; setDet(null); setErr("");
    cached(`posts|${p.page_id}|${R.days}`, () => loadPagePosts(p, R)).then((v) => alive && setDet(v)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [p.page_id, R.days]);
  const c = sum?.cur, v = sum?.prev;
  const key = `${p.page_id}|${R.days}`, ai = aiState[key];
  const runAi = async () => {
    setAiState((s) => ({ ...s, [key]: { busy: true } }));
    try { const r = await aiPageAnalysis({ data: aiPayload(p, sum, det, R), apiKey }); setAiState((s) => ({ ...s, [key]: { r } })); }
    catch (e) { setAiState((s) => ({ ...s, [key]: { err: e.message || String(e) } })); }
  };
  const posts = useMemo(() => [...(det?.posts || [])].sort((a, b) => (sort === "at" ? b.at.localeCompare(a.at) : (b[sort] || 0) - (a[sort] || 0))), [det, sort]);
  const KPI = ({ label, val, d, icon: I }) => (
    <div className="bg-white px-3 py-2"><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{I && <I size={11} />}{label}</div><div className="flex items-baseline gap-1.5"><span className="text-lg font-extrabold tabular-nums text-slate-900">{val}</span>{d}</div></div>
  );
  const best = (l) => (l?.length ? [...l].filter((x) => x.n >= 2).sort((a, b) => b.reach - a.reach)[0] : null);

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-200"><ArrowLeft size={14} /> Tất cả page</button>
          <img src={avatar(p.page_id)} alt="" className="h-8 w-8 rounded-full bg-slate-100" />
          <a href={`https://facebook.com/${p.page_id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-lg font-extrabold text-slate-900 hover:text-indigo-600"><span className="truncate">{p.name}</span> <ExternalLink size={14} className="shrink-0 text-slate-300" /></a>
          {sum?.verdict && <Badge tone={sum.verdict.tone}>{sum.verdict.label}</Badge>}
          <button onClick={onHide} className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-bold text-slate-500 hover:text-rose-600"><EyeOff size={13} /> Ẩn page</button>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">{dm(R.cur[0])} → {dm(R.cur[1])} · so với {R.days} ngày liền trước · "Tiếp cận" = số người xem nội dung cộng theo ngày (chỉ số mới của Facebook)</div>
      </Card>

      {c && (
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <KPI icon={Users} label="Người theo dõi" val={k(c.followers)} d={<span className={`text-[10.5px] font-bold ${c.netFollows >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{c.netFollows >= 0 ? "+" : ""}{int(c.netFollows)}</span>} />
          <KPI label="Tiếp cận" val={k(c.reach)} d={<Delta cur={c.reach} prev={v.reach} />} />
          <KPI label="Lượt xem" val={k(c.views)} d={<Delta cur={c.views} prev={v.views} />} />
          <KPI icon={Heart} label="Tương tác" val={k(c.engagement)} d={<Delta cur={c.engagement} prev={v.engagement} />} />
          <KPI label="Tỉ lệ tương tác" val={c.er != null ? pct1(c.er) : "—"} d={<Delta cur={c.er} prev={v.er} />} />
          <KPI icon={MessageCircle} label="Tin nhắn mới" val={k(c.messages)} d={<Delta cur={c.messages} prev={v.messages} />} />
          <KPI label="Lượt vào trang" val={k(c.pageViews)} d={<Delta cur={c.pageViews} prev={v.pageViews} />} />
          <KPI icon={PlayCircle} label="Xem video" val={k(c.videoViews)} d={<Delta cur={c.videoViews} prev={v.videoViews} />} />
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="!p-3 xl:col-span-2">
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Theo ngày</div>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={(sum?.daily || []).map((x) => ({ ...x, day: dm(x.date) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar yAxisId="l" dataKey="reach" name="Tiếp cận" fill="#818cf8" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="engagement" name="Tương tác" stroke="#ec4899" strokeWidth={2} dot={false} />
                <Line yAxisId="r" dataKey="messages" name="Tin nhắn mới" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-500" /><span className="text-[14px] font-extrabold">AI phân tích</span>
            <button onClick={runAi} disabled={!det || !c || ai?.busy || !aiReady} className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
              {ai?.busy ? <><Loader2 size={13} className="animate-spin" /> Đang phân tích…</> : ai?.r ? "Phân tích lại" : "Phân tích"}
            </button>
          </div>
          {!aiReady && <div className="mt-2 text-[12px] font-semibold text-amber-600">Chưa có API key OpenAI — vào Cài đặt.</div>}
          {ai?.err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{ai.err}</div>}
          {det && (
            <div className="mt-3 space-y-1 text-[12px]">
              <div className="flex justify-between"><span className="text-slate-500">Bài đăng trong kỳ</span><b>{det.posts.length} <span className="font-semibold text-slate-400">({det.perWeek.toFixed(1).replace(".", ",")}/tuần)</span></b></div>
              <div className="flex justify-between"><span className="text-slate-500">Tiếp cận TB / bài</span><b>{int(det.avgReach)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Tương tác TB / bài</span><b>{det.avgEng.toFixed(1).replace(".", ",")}</b></div>
              {best(det.byType) && <div className="flex justify-between"><span className="text-slate-500">Loại bài tốt nhất</span><b className="text-emerald-600">{best(det.byType).label}</b></div>}
              {best(det.bySlot) && <div className="flex justify-between"><span className="text-slate-500">Khung giờ tốt nhất</span><b className="text-emerald-600">{best(det.bySlot).label}</b></div>}
            </div>
          )}
          {!ai?.r && !ai?.busy && <div className="mt-2 text-[12px] leading-snug text-slate-500">AI đọc tiếp cận, tương tác, tin nhắn và từng bài đăng (loại bài, giờ đăng) rồi chỉ ra nên đăng gì, giờ nào, bao nhiêu bài/tuần.</div>}
        </Card>
      </div>

      {ai?.r && <Card className="!p-3"><AiBox r={ai.r} titles={["Nội dung", "Lịch đăng", "Tin nhắn & bán hàng"]} /></Card>}

      <Card className="!p-3">
        {err && <div className="mb-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
        {!det ? <div className="h-40 animate-pulse rounded-lg bg-slate-50" /> : (<>
          <div className="grid gap-4 md:grid-cols-3">
            {[["Theo loại bài", det.byType], ["Theo khung giờ đăng", det.bySlot], ["Theo thứ trong tuần", det.byDow]].map(([t, l]) => (
              <div key={t}>
                <div className="mb-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{t === "Theo khung giờ đăng" && <Clock size={11} />}{t}</div>
                <Table rows={l} empty="Chưa có bài" cols={[{ h: "", v: (x) => <b className="text-slate-700">{x.label}</b> }, { h: "Bài", right: true, v: (x) => x.n }, { h: "Tiếp cận TB", right: true, v: (x) => int(x.reach) }, { h: "Tương tác TB", right: true, v: (x) => x.eng.toFixed(1).replace(".", ",") }]} />
              </div>
            ))}
          </div>
          <div className="mb-2 mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Bài đăng ({posts.length})</span>
            <span className="ml-auto text-[11px] text-slate-400">Xếp theo:</span>
            {[["reach", "Tiếp cận"], ["eng", "Tương tác"], ["clicks", "Click"], ["er", "Tỉ lệ TT"], ["at", "Mới nhất"]].map(([kk, l]) => (
              <button key={kk} onClick={() => setSort(kk)} className={`rounded-md px-2 py-1 text-[11px] font-bold ${sort === kk ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
            ))}
          </div>
          <Table rows={posts} empty="Không có bài đăng trong kỳ." cols={[
            { h: "Bài", wide: true, v: (x) => (
              <a href={x.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-start gap-2 hover:text-indigo-600">
                {x.img ? <img src={x.img} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" /> : <div className="h-10 w-10 shrink-0 rounded-md bg-slate-100" />}
                <div className="min-w-0"><div className="line-clamp-2 text-[12px] font-semibold text-slate-700">{x.text || "(không có chữ)"}</div><div className="text-[10.5px] text-slate-400">{x.type} · {when(x.at)}</div></div>
              </a>
            ) },
            { h: "Tiếp cận", right: true, v: (x) => <span className={x.reach >= (det.avgReach || 0) * 1.5 ? "font-bold text-emerald-600" : ""}>{int(x.reach)}</span> },
            { h: "Lượt xem", right: true, v: (x) => int(x.views) },
            { h: "Click", right: true, v: (x) => int(x.clicks) },
            { h: <ThumbsUp size={11} className="ml-auto" />, right: true, v: (x) => int(x.reactions) },
            { h: "Bình luận", right: true, v: (x) => int(x.comments) },
            { h: "Chia sẻ", right: true, v: (x) => int(x.shares) },
            { h: "Tỉ lệ TT", right: true, v: (x) => (x.er != null ? pct1(x.er) : "—") },
          ]} />
        </>)}
      </Card>
    </div>
  );
}

export default function Fanpage() {
  const { isOwner, settings = {}, setSettings } = useData();
  const [days, setDays] = useState(28);
  const [pages, setPages] = useState(null);
  const [meta, setMeta] = useState({});
  const [sums, setSums] = useState({});
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [tick, setTick] = useState(0);
  const [aiState, setAiState] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const hidden = settings.fbHidden || [];
  const R = useMemo(() => fbRanges(days), [days]);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true; setErr("");
    listPages().then((r) => { if (!alive) return; setPages(r.pages); setMeta(r); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [isOwner, tick]);
  const shown = (pages || []).filter((p) => !hidden.includes(p.page_id));
  const hid = (pages || []).filter((p) => hidden.includes(p.page_id));

  useEffect(() => {
    if (!pages) return;
    let alive = true; setSums({});
    shown.forEach((p) => cached(`sum|${p.page_id}|${days}|${tick}`, () => loadPageSummary(p, R)).then((v) => alive && setSums((o) => ({ ...o, [p.page_id]: v }))));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, days, tick, hidden.join(",")]);

  const tot = useMemo(() => {
    const t = { reach: 0, pReach: 0, eng: 0, pEng: 0, msg: 0, pMsg: 0 };
    for (const s of Object.values(sums)) if (s.cur) { t.reach += s.cur.reach; t.pReach += s.prev.reach; t.eng += s.cur.engagement; t.pEng += s.prev.engagement; t.msg += s.cur.messages; t.pMsg += s.prev.messages; }
    return t;
  }, [sums]);

  if (!isOwner) return <Card><div className="text-sm text-slate-500">Chỉ chủ workspace xem được hiệu quả fanpage.</div></Card>;
  const page = sel && pages?.find((p) => p.page_id === sel);
  const setHidden = (l) => setSettings({ fbHidden: l });

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(([d, l]) => <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${days === d ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}</button>)}
          <span className="text-[11px] text-slate-400">so với {days} ngày liền trước</span>
          <button onClick={() => { CACHE.clear(); setTick((t) => t + 1); }} className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white"><RefreshCw size={13} /> Làm mới</button>
        </div>
        <div className="mt-1.5 text-[11px] text-slate-400">Dùng kết nối Facebook của Văn phòng AI ({meta.conns || 0} token BM). Chỉ hiện page đang <b>bật</b> bên Văn phòng AI{meta.offCount ? ` (${meta.offCount} page đang tắt)` : ""}. <b>Thêm page mới:</b> gán page cho System User trong Business Manager → Văn phòng AI → Kết nối → Facebook → Làm mới → bật công tắc.</div>
        {err && <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle size={14} /> {err}</div>}
      </Card>

      {page ? (
        <Detail p={page} sum={sums[page.page_id]} R={R} apiKey={settings.openaiKey} aiReady={settings.aiReady ?? !!settings.openaiKey}
          onBack={() => setSel(null)} onHide={() => { setHidden([...hidden, page.page_id]); setSel(null); }} aiState={aiState} setAiState={setAiState} />
      ) : (<>
        <div className="grid grid-cols-3 gap-px bg-slate-100">
          {[["Tiếp cận · tất cả page", tot.reach, tot.pReach, Users], ["Tương tác", tot.eng, tot.pEng, Heart], ["Tin nhắn mới", tot.msg, tot.pMsg, MessageCircle]].map(([l, c, p, I]) => (
            <div key={l} className="bg-white px-3 py-2.5"><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><I size={11} /> {l}</div><div className="flex items-baseline gap-1.5"><span className="text-xl font-extrabold tabular-nums text-slate-900">{k(c)}</span><Delta cur={c} prev={p} /></div></div>
          ))}
        </div>
        {!pages ? <Card><div className="h-24 animate-pulse rounded-lg bg-slate-50" /></Card> : shown.length === 0 ? (
          <Card><div className="py-8 text-center text-sm text-slate-500">{meta.offCount ? <>Có {meta.offCount} page nhưng đang <b>tắt</b> bên Văn phòng AI. Vào <b>Văn phòng AI → Kết nối → Facebook</b> bật công tắc page cần theo dõi.</> : <>Chưa có page nào. Vào <b>Văn phòng AI → Kết nối → Facebook</b> để thêm token Business Manager.</>}</div></Card>
        ) : (
          <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => <PageCard key={p.page_id} p={p} sum={sums[p.page_id]} onOpen={() => setSel(p.page_id)} />)}
          </div>
        )}
        {hid.length > 0 && (
          <div className="px-3 text-[11px] text-slate-400">
            <button onClick={() => setShowHidden((v) => !v)} className="font-bold hover:text-slate-600">{showHidden ? "▾" : "▸"} {hid.length} page đã ẩn</button>
            {showHidden && <div className="mt-1 flex flex-wrap gap-1">{hid.map((p) => <button key={p.page_id} onClick={() => setHidden(hidden.filter((h) => h !== p.page_id))} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-slate-500 ring-1 ring-slate-200 hover:text-indigo-600"><Eye size={11} /> {p.name}</button>)}</div>}
          </div>
        )}
      </>)}
    </div>
  );
}
