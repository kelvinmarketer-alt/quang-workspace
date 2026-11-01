// Kết nối đo lường THEO THƯƠNG HIỆU (01/11 sếp chốt: "kết nối theo từng thương hiệu / khách, không tách ra từng dự án").
// Quản trị đầy đủ ở thẻ khách (Khách & Dự án): TK quảng cáo · website · fanpage + job nào của thương hiệu đang thiếu đo.
// Trong job chỉ còn tóm tắt kênh job dùng + nút sang quản trị của thương hiệu. Dữ liệu: TKQC = cust trên máy chủ,
// web/fanpage = settings.reportLinks. Job ADS → TK quảng cáo · Seo/Web/Landing → website · Lương/khác → mọi kênh. Chỉ chủ.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, Globe, ThumbsUp, Plus, X, Loader2, Search, Save, KeyRound, Gauge, ExternalLink, ChevronDown, ArrowRight, Check, EyeOff } from "lucide-react";
import { Badge } from "./ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { guessCustomer, siteKey, dropReportCache } from "../lib/reports.js";
import { listGoogleProps } from "../lib/google.js";
import { buildSites } from "../lib/webData.js";
import { listPages } from "../lib/fbPages.js";
import { OFFICE_URL } from "../lib/office.js";
import { ask } from "./ConfirmDialog.jsx";
import { useMeasureSkip } from "./MeasureAlerts.jsx";

const call = async (body) => { const { data, error } = await supabase.functions.invoke("qws-meta-ads", { body }); if (error || data?.error) throw new Error(error?.message || data.error); return data; };
// [tên nhóm, icon, đơn vị đếm]
const KINDS = { ads: ["Quảng cáo", Megaphone, "TK quảng cáo"], web: ["Website", Globe, "website"], page: ["Fanpage", ThumbsUp, "fanpage"] };
const ORDER = ["ads", "web", "page"];
export const kindsOfJob = (cat) => (cat === "ADS" ? ["ads"] : ["Seo", "Web", "Landing"].includes(cat) ? ["web"] : ORDER);
const REQUIRED = ["ADS", "Seo", "Web", "Landing", "Lương"];
const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-xs";
const keyOf = (kind, x) => (kind === "web" ? x : x.id);
const label = (kind, x) => (kind === "web" ? x : x.name);

let CACHE = null, LOADING = null; // 1 lần tải / phiên mở app, dùng chung thẻ khách + job
async function loadLists(settings) {
  const [meta, gads, web, pages] = await Promise.all([
    call({ mode: "config_list" }).then((d) => (d.accounts || []).map((a) => ({ ...a, kind: "meta" }))).catch(() => []),
    call({ mode: "gads_list" }).then((d) => (d.accounts || []).map((a) => ({ ...a, kind: "gads", id: a.customer_id, cust: a.qws_customer_id || null, group: a.grp }))).catch(() => []),
    listGoogleProps().then(({ props, conn }) => buildSites(props, conn, { hidden: settings.webHidden || [], gaOverride: settings.webGa || {} }).sites.map((s) => s.domain)).catch(() => []),
    listPages().then(({ pages: l }) => (l || []).filter((p) => p.enabled !== false && !(settings.fbHidden || []).includes(p.page_id)).map((p) => ({ id: p.page_id, name: p.name }))).catch(() => []),
  ]);
  return { ads: [...meta, ...gads], web, pages };
}

function useChannels() {
  const { customerList = [], settings = {}, isOwner } = useData();
  const [lists, setLists] = useState(CACHE);
  const reload = async (force) => {
    if (!force && CACHE) return setLists(CACHE);
    LOADING = LOADING || loadLists(settings).finally(() => { LOADING = null; });
    CACHE = await LOADING; setLists({ ...CACHE });
  };
  useEffect(() => { if (isOwner) reload(false); }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = settings.reportLinks || {};
  const owner = {
    ads: (a) => a.cust || guessCustomer(a.name, customerList),
    web: (d) => { const v = links.web?.[d]; return v === "none" ? null : v || guessCustomer(siteKey(d), customerList); },
    page: (p) => { const v = links.page?.[p.id]; return v === "none" ? null : v || guessCustomer(p.name, customerList); },
  };
  const of = (kind) => (kind === "ads" ? lists?.ads || [] : kind === "web" ? lists?.web || [] : lists?.pages || []);
  const mine = (kind, custId) => of(kind).filter((x) => owner[kind](x) === custId);
  return { lists, reload, owner, of, mine, links };
}

// Đo của 1 job: null = không bắt buộc · [] = đủ · [kind…] = còn thiếu
const jobGap = (p, mine, custId) => {
  if (!REQUIRED.includes(p.category)) return null;
  const need = kindsOfJob(p.category);
  return need.length === 1 ? need.filter((k) => !mine(k, custId).length) : need.every((k) => !mine(k, custId).length) ? need : [];
};
const gapText = (g) => (g.length > 1 ? "kênh đo nào" : KINDS[g[0]][2]);
const usedText = (p, mine, custId) => { const need = kindsOfJob(p.category), n = need.reduce((s, k) => s + mine(k, custId).length, 0); return `${n} ${need.length === 1 ? KINDS[need[0]][2] : "kênh"}`; };

function Chip({ kind, x }) {
  const I = KINDS[kind][1];
  return <span className="inline-flex max-w-[15rem] items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"><I size={11} className="shrink-0" /><span className="truncate">{label(kind, x)}</span>{kind === "ads" && !x.active && <span className="font-medium text-slate-400">· tắt</span>}</span>;
}

// ===== Thẻ khách: quản trị kết nối của cả thương hiệu =====
export default function BrandConnections({ customer, startOpen = 0 }) {
  const { customerList = [], projects = [], setSettings, setToast, isOwner } = useData();
  const { lists, reload, owner, of, mine, links } = useChannels();
  const [edit, setEdit] = useState(!!startOpen);
  useEffect(() => { if (startOpen) setEdit(true); }, [startOpen]);
  const [adding, setAdding] = useState(null); // nhóm kênh đang mở ô "gắn thêm"
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const { skip, hide, unhide } = useMeasureSkip();
  if (!isOwner) return null;

  const cid = customer.id;
  const nameOf = (id) => customerList.find((c) => c.id === id)?.name;
  const setLink = (kind, key, v) => { dropReportCache(); setSettings({ reportLinks: { ...links, [kind]: { ...(links[kind] || {}), [key]: v } } }); };
  const adsUpdate = async (a, patch) => {
    setBusy(a.id);
    try { await call(a.kind === "gads" ? { mode: "gads_update", cid: a.id, patch } : { mode: "config_update", id: a.id, patch }); dropReportCache(); await reload(true); }
    catch (e) { setToast?.({ text: "Không lưu được: " + (e.message || e) }); }
    setBusy(null);
  };
  const link = (kind, x, on) => (kind === "ads" ? adsUpdate(x, { cust: on ? cid : null }) : setLink(kind, keyOf(kind, x), on ? cid : "none"));
  const jobs = projects.filter((p) => p.customerId === cid && (!p.status || p.status === "doing"));
  const gaps = lists ? jobs.map((p) => ({ p, g: jobGap(p, mine, cid) })) : [];
  const missing = gaps.filter((x) => x.g?.length && !skip[x.p.id]);
  const linked = lists ? ORDER.flatMap((k) => mine(k, cid).map((x) => [k, x])) : [];
  const openAdd = (kind) => { setAdding(adding === kind ? null : kind); setQ(""); };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400"><Gauge size={12} /> Kết nối đo lường</span>
        {!lists ? <span className="flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Đang tải kênh…</span>
          : edit ? <span className="text-[11.5px] text-slate-400">dùng chung cho {jobs.length} job đang chạy của {customer.name}</span>
          : linked.length ? <>{linked.slice(0, 8).map(([k, x]) => <Chip key={k + keyOf(k, x)} kind={k} x={x} />)}{linked.length > 8 && <span className="text-[11px] font-bold text-slate-400">+{linked.length - 8}</span>}</>
          : <span className="text-[11.5px] text-slate-400">Chưa gắn kênh nào</span>}
        <button type="button" onClick={() => { setEdit((v) => !v); setAdding(null); }} className={`ml-auto rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold ${edit ? "text-slate-500 ring-1 ring-slate-200 hover:text-slate-800" : "text-indigo-600 hover:bg-indigo-50"}`}>{edit ? "Xong" : "Quản lý"}</button>
      </div>

      {/* Thu gọn: chỉ báo job đang thiếu đo */}
      {!edit && missing.length > 0 && (
        <div className="mt-2 space-y-1">
          {missing.map(({ p, g }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-700">
              <span className="min-w-0 flex-1"><b>{p.name}</b> chưa có {gapText(g)} để đo</span>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => { setEdit(true); setAdding(g.length === 1 ? g[0] : null); }} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-indigo-600 ring-1 ring-amber-200">Gắn ngay</button>
                <button type="button" onClick={() => hide({ id: p.id, job: p.name })} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-white">Không cần đo</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {edit && lists && (
        <div className="mt-3 space-y-3">
          {/* Job của thương hiệu đang đo bằng gì */}
          {jobs.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-2">
              <div className="mb-1 px-1 text-[11px] font-bold text-slate-500">Job đang chạy</div>
              <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {gaps.map(({ p, g }) => (
                  <div key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px]">
                    <Badge tone="slate">{p.category}</Badge>
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.name}</span>
                    {g === null ? <span className="text-[11px] text-slate-400">không bắt buộc đo</span>
                      : !g.length ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Check size={12} />{usedText(p, mine, cid)}</span>
                      : skip[p.id] ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><EyeOff size={11} />không cần đo <button type="button" onClick={() => unhide(p.id)} className="font-bold text-indigo-600">Nhắc lại</button></span>
                      : <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600">thiếu {gapText(g)}<button type="button" onClick={() => hide({ id: p.id, job: p.name })} className="rounded-md px-1.5 py-0.5 font-bold text-slate-500 ring-1 ring-slate-200 hover:text-slate-800">Không cần đo</button></span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 nhóm kênh: máy tính 3 cột, điện thoại xếp dọc */}
          <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
            {ORDER.map((kind) => {
              const [lb, I] = KINDS[kind], m = mine(kind, cid);
              const others = of(kind).filter((x) => owner[kind](x) !== cid);
              const shown = q ? others.filter((x) => label(kind, x).toLowerCase().includes(q.toLowerCase())) : others;
              return (
                <div key={kind} className="min-w-0 rounded-xl border border-slate-100 p-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
                    <I size={13} /> {lb} <span className="font-medium text-slate-400">· {m.length}</span>
                    <button type="button" onClick={() => openAdd(kind)} className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold ${adding === kind ? "bg-indigo-50 text-indigo-700" : "text-indigo-600 hover:bg-indigo-50"}`}><Plus size={13} /> Gắn</button>
                  </div>
                  <div className="space-y-1.5">
                    {!m.length && adding !== kind && <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11.5px] text-slate-400">Chưa gắn {KINDS[kind][2]}</div>}
                    {m.map((x) => kind === "ads" ? <AdsRow key={x.id} a={x} busy={busy === x.id} onPatch={(p) => adsUpdate(x, p)} onUnlink={() => link(kind, x, false)} />
                      : <div key={keyOf(kind, x)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px]"><I size={14} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{label(kind, x)}</span>
                          <button type="button" onClick={() => link(kind, x, false)} title={`Bỏ gắn khỏi ${customer.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-500"><X size={14} /></button></div>)}
                    {adding === kind && (
                      <div className="rounded-xl border border-dashed border-indigo-200 p-2">
                        {others.length > 8 && <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-slate-200 px-2"><Search size={12} className="text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm ${KINDS[kind][2]}…`} className="w-full bg-transparent py-1.5 text-[12px] outline-none" /></div>}
                        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                          {shown.map((x) => { const o = owner[kind](x); return <button key={keyOf(kind, x)} type="button" disabled={busy === x.id} onClick={async () => { if (o && !(await ask(`"${label(kind, x)}" đang thuộc ${nameOf(o)}. Chuyển sang ${customer.name}?`))) return; link(kind, x, true); }}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 sm:px-2.5 sm:py-1 sm:text-[11.5px]"><Plus size={11} /><span className="truncate">{label(kind, x)}</span>{o && <span className="shrink-0 font-medium text-slate-400">· {nameOf(o)}</span>}</button>; })}
                          {!shown.length && <span className="text-[11.5px] text-slate-400">{q ? "Không thấy kênh khớp." : "Không còn kênh nào khác."}</span>}
                        </div>
                        {kind === "ads" ? <NewMetaAccount custId={cid} custName={customer.name} onDone={() => reload(true)} /> : (
                          <div className="mt-2 text-[11px] text-slate-400">Chưa có trong danh sách? {kind === "web" ? "Thêm email robot vào Search Console / GA4 của web" : "Gán page cho System User trong Business Manager"}, rồi bật ở <a href={OFFICE_URL} target="_blank" rel="noopener" className="font-bold text-indigo-600">Văn phòng AI → Kết nối <ExternalLink size={10} className="inline" /></a>.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10.5px] text-slate-400">Kênh gắn ở đây dùng cho mọi job của {customer.name}. Chưa gắn tay thì app tự nhận theo tên.</div>
        </div>
      )}
    </div>
  );
}

// ===== Trong job: tóm tắt kênh job dùng (lấy từ thương hiệu) + sang quản trị =====
export function JobMeasure({ project }) {
  const { customerList = [], isOwner } = useData();
  const { lists, mine } = useChannels();
  const { skip, hide, unhide } = useMeasureSkip();
  if (!isOwner) return null;
  const cust = customerList.find((c) => c.id === project.customerId);
  if (!cust) return null;
  const used = lists ? kindsOfJob(project.category).flatMap((k) => mine(k, cust.id).map((x) => [k, x])) : [];
  const g = lists ? jobGap(project, mine, cust.id) : null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge size={15} className="text-indigo-500" />
        <span className="text-sm font-extrabold text-slate-800">Đo lường</span>
        <span className="order-last w-full text-[11px] text-slate-400 sm:order-none sm:w-auto">dùng kênh của thương hiệu {cust.name}</span>
        <Link to={`/khach-hang?id=${encodeURIComponent(cust.id)}&kenh=1`} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">Quản lý kết nối <ArrowRight size={13} /></Link>
      </div>
      {!lists ? <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải kênh…</div> : (
        <div className="mt-2 space-y-2">
          {used.length > 0 && <div className="flex flex-wrap gap-1.5">{used.map(([k, x]) => <Chip key={k + keyOf(k, x)} kind={k} x={x} />)}</div>}
          {g?.length > 0 && (skip[project.id]
            ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">Đã đánh dấu job này không cần đo — app không nhắc nữa.<button type="button" onClick={() => unhide(project.id)} className="font-bold text-indigo-600">Nhắc lại</button></div>
            : <div className="flex flex-col items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700 sm:flex-row sm:items-center"><span className="min-w-0 sm:flex-1">{cust.name} chưa có {gapText(g)} để đo job này. Bấm "Quản lý kết nối" để gắn.</span>
                <button type="button" onClick={() => hide({ id: project.id, job: project.name })} className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-bold text-slate-600 ring-1 ring-amber-200 hover:text-slate-900">Không cần đo</button></div>)}
          {!used.length && !g?.length && <div className="text-[12px] text-slate-400">Thương hiệu chưa gắn kênh nào — job này không bắt buộc đo.</div>}
        </div>
      )}
    </div>
  );
}

// 1 tài khoản quảng cáo đã gắn: nhóm, đang dùng, đổi token (Meta), bỏ gắn
function AdsRow({ a, busy, onPatch, onUnlink }) {
  const [open, setOpen] = useState(false);
  const [tok, setTok] = useState("");
  const google = a.kind === "gads";
  return (
    <div className={`rounded-xl border px-3 py-2 ${a.active ? "border-slate-100 bg-slate-50" : "border-dashed border-slate-200 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <Megaphone size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700" title={a.name}>{a.name}</span>
        <Badge tone={google ? "emerald" : "sky"}>{google ? "Google" : "Meta"}</Badge>
        {!a.active && <Badge tone="slate">Tắt</Badge>}
        {busy && <Loader2 size={13} className="animate-spin text-slate-400" />}
        <button type="button" onClick={() => setOpen((v) => !v)} title="Tuỳ chỉnh" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white"><ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} /></button>
        <button type="button" onClick={onUnlink} title="Bỏ gắn khỏi thương hiệu này" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-500"><X size={14} /></button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[12px]">
          <select value={a.group || "conv"} onChange={(e) => onPatch({ group: e.target.value })} className={inputCls}><option value="conv">Chuyển đổi</option><option value="brand">Thương hiệu</option></select>
          <label className="flex items-center gap-1 text-slate-500"><input type="checkbox" checked={!!a.active} onChange={(e) => onPatch({ active: e.target.checked })} />Đang dùng</label>
          <span className="text-[11px] text-slate-400">{google ? String(a.id).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : `ID ${a.id} · token ${a.tokenTail || "—"}`}</span>
          {!google && <span className="flex w-full items-center gap-1.5"><KeyRound size={12} className="shrink-0 text-slate-300" /><input type="password" autoComplete="off" value={tok} onChange={(e) => setTok(e.target.value)} placeholder="Đổi token (dán token mới)" className={`${inputCls} min-w-0 flex-1`} />
            {tok && <button type="button" onClick={() => { onPatch({ token: tok }); setTok(""); }} className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 font-bold text-white">Lưu token</button>}</span>}
        </div>
      )}
    </div>
  );
}

// Thêm TK Meta mới cho thương hiệu: dán token BM → chọn TK → lưu và gắn luôn
function NewMetaAccount({ custId, custName, onDone }) {
  const [token, setToken] = useState("");
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const discover = async () => {
    setBusy(true); setErr(""); setFound(null);
    try { const d = await call({ mode: "config_discover", token: token.trim() }); setFound((d.accounts || []).map((a) => ({ ...a, pick: !a.added && a.status === 1 }))); if (!(d.accounts || []).length) setErr("Token hợp lệ nhưng chưa được gán tài khoản quảng cáo nào."); }
    catch (e) { setErr("Token lỗi: " + (e.message || e)); }
    setBusy(false);
  };
  const save = async () => {
    const picked = (found || []).filter((a) => a.pick); if (!picked.length) return;
    setBusy(true); setErr("");
    try {
      await call({ mode: "config_save", token: token.trim(), accounts: picked });
      for (const a of picked) await call({ mode: "config_update", id: a.id, patch: { cust: custId } });
      dropReportCache(); setToken(""); setFound(null); onDone?.();
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2">
      <div className="mb-1 text-[11.5px] font-bold text-slate-600">Kết nối tài khoản Meta mới cho {custName}</div>
      <div className="flex flex-wrap gap-1.5">
        <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Dán token System User của BM (quyền ads_read)" className={`${inputCls} min-w-0 flex-1 basis-48 bg-white`} />
        <button type="button" onClick={discover} disabled={busy || !token.trim()} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50 max-sm:w-full sm:py-1.5">{busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}Tìm TKQC</button>
      </div>
      {found?.length > 0 && (
        <div className="mt-2 space-y-1">
          {found.map((a) => <label key={a.id} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={!!a.pick} onChange={(e) => setFound((f) => f.map((x) => (x.id === a.id ? { ...x, pick: e.target.checked } : x)))} /><b className="min-w-0 truncate text-slate-700">{a.name}</b><span className="shrink-0 text-slate-400">ID {a.id}{a.added ? " · đã có" : ""}</span></label>)}
          <button type="button" onClick={save} disabled={busy || !found.some((a) => a.pick)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Save size={12} />Lưu & gắn cho {custName}</button>
        </div>
      )}
      {err && <div className="mt-1 text-[11.5px] text-rose-600">{err}</div>}
      <div className="mt-1 text-[10.5px] text-slate-400">Google Ads: số do script đẩy về (Cài đặt → Kết nối nâng cao). Tài khoản Google đã có thì bấm vào tên ở trên để gắn.</div>
    </div>
  );
}
