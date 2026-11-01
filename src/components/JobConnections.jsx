// Kết nối đo lường NGAY TRONG TỪNG JOB (01/11 sếp yêu cầu: "job nào thì quản trị kết nối job đó", không dồn hết về Cài đặt).
// Kênh vẫn thuộc THƯƠNG HIỆU (khách) để các job cùng khách dùng chung số: TKQC = cust trên máy chủ, web/fanpage = settings.reportLinks.
// Job ADS → tài khoản quảng cáo · Seo/Web/Landing → website · Lương/khác → mọi kênh. Chỉ chủ.
import { useEffect, useState } from "react";
import { Megaphone, Globe, ThumbsUp, Plus, X, Loader2, Search, Save, KeyRound, Gauge, ExternalLink, ChevronDown } from "lucide-react";
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
const KINDS = { ads: ["Quảng cáo", Megaphone], web: ["Website", Globe], page: ["Fanpage", ThumbsUp] };
export const kindsOfJob = (cat) => (cat === "ADS" ? ["ads"] : ["Seo", "Web", "Landing"].includes(cat) ? ["web"] : ["ads", "web", "page"]);
const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-xs";

let CACHE = null, LOADING = null;
async function loadLists(settings) {
  const [meta, gads, web, pages] = await Promise.all([
    call({ mode: "config_list" }).then((d) => (d.accounts || []).map((a) => ({ ...a, kind: "meta" }))).catch(() => []),
    call({ mode: "gads_list" }).then((d) => (d.accounts || []).map((a) => ({ ...a, kind: "gads", id: a.customer_id, cust: a.qws_customer_id || null, group: a.grp }))).catch(() => []),
    listGoogleProps().then(({ props, conn }) => buildSites(props, conn, { hidden: settings.webHidden || [], gaOverride: settings.webGa || {} }).sites.map((s) => s.domain)).catch(() => []),
    listPages().then(({ pages: l }) => (l || []).filter((p) => p.enabled !== false).map((p) => ({ id: p.page_id, name: p.name }))).catch(() => []),
  ]);
  return { ads: [...meta, ...gads], web, pages };
}

export default function JobConnections({ project }) {
  const { customerList = [], settings = {}, setSettings, setToast, isOwner } = useData();
  const [lists, setLists] = useState(CACHE);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(null); // kind đang mở ô "gắn thêm"
  const [busy, setBusy] = useState(null);
  const { skip, hide, unhide } = useMeasureSkip();
  const reload = async (force) => {
    if (!force && CACHE) return setLists(CACHE);
    LOADING = LOADING || loadLists(settings).finally(() => { LOADING = null; });
    CACHE = await LOADING; setLists({ ...CACHE });
  };
  useEffect(() => { if (isOwner) reload(false); }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOwner) return null;
  const cust = customerList.find((c) => c.id === project.customerId);
  if (!cust) return null;

  const links = settings.reportLinks || {};
  const owner = {
    ads: (a) => a.cust || guessCustomer(a.name, customerList),
    web: (d) => { const v = links.web?.[d]; return v === "none" ? null : v || guessCustomer(siteKey(d), customerList); },
    page: (p) => { const v = links.page?.[p.id]; return v === "none" ? null : v || guessCustomer(p.name, customerList); },
  };
  const need = kindsOfJob(project.category);
  const kinds = showAll ? ["ads", "web", "page"] : need;
  const nameOf = (id) => customerList.find((c) => c.id === id)?.name;
  const setLink = (kind, key, v) => { dropReportCache(); setSettings({ reportLinks: { ...links, [kind]: { ...(links[kind] || {}), [key]: v } } }); };
  const adsUpdate = async (a, patch) => {
    setBusy(a.id);
    try { await call(a.kind === "gads" ? { mode: "gads_update", cid: a.id, patch } : { mode: "config_update", id: a.id, patch }); dropReportCache(); await reload(true); }
    catch (e) { setToast?.({ text: "Không lưu được: " + (e.message || e) }); }
    setBusy(null);
  };
  const of = (kind) => (kind === "ads" ? lists?.ads || [] : kind === "web" ? lists?.web || [] : lists?.pages || []);
  const keyOf = (kind, x) => (kind === "web" ? x : x.id);
  const label = (kind, x) => (kind === "web" ? x : x.name);
  const mine = (kind) => of(kind).filter((x) => owner[kind](x) === cust.id);
  const link = (kind, x, on) => (kind === "ads" ? adsUpdate(x, { cust: on ? cust.id : null }) : setLink(kind, keyOf(kind, x), on ? cust.id : "none"));
  const required = ["ADS", "Seo", "Web", "Landing", "Lương"].includes(project.category);
  const missing = !lists || !required ? [] : need.length === 1 ? need.filter((k) => !mine(k).length) : need.every((k) => !mine(k).length) ? need : [];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Gauge size={15} className="text-indigo-500" />
        <span className="text-sm font-extrabold text-slate-800">Kết nối đo lường của job</span>
        <span className="text-[11px] text-slate-400">dùng chung cho mọi job của {cust.name}</span>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-auto text-[11.5px] font-bold text-indigo-600">{showAll ? "Chỉ kênh job cần" : "Mọi loại kênh"}</button>
      </div>
      {!lists ? <div className="flex items-center gap-1.5 py-2 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải kênh…</div> : (
        <div className="space-y-3">
          {missing.length > 0 && (skip[project.id]
            ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">Đã đánh dấu job này không cần đo — app không nhắc nữa.<button type="button" onClick={() => unhide(project.id)} className="font-bold text-indigo-600">Nhắc lại</button></div>
            : <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700"><span className="min-w-0 flex-1">Job này chưa có {missing.map((k) => KINDS[k][0].toLowerCase()).join(", ")} để đo. Gắn bên dưới nếu cần theo dõi.</span>
                <button type="button" onClick={() => hide({ id: project.id, job: project.name })} className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-bold text-slate-600 ring-1 ring-amber-200 hover:text-slate-900">Không cần đo</button></div>)}
          {kinds.map((kind) => {
            const [lb, I] = KINDS[kind], m = mine(kind), others = of(kind).filter((x) => owner[kind](x) !== cust.id);
            return (
              <div key={kind}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600"><I size={13} /> {lb} <span className="font-medium text-slate-400">· {m.length}</span></div>
                <div className="space-y-1.5">
                  {m.map((x) => kind === "ads" ? <AdsRow key={x.id} a={x} busy={busy === x.id} onPatch={(p) => adsUpdate(x, p)} onUnlink={() => link(kind, x, false)} />
                    : <div key={keyOf(kind, x)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px]"><I size={14} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{label(kind, x)}</span>
                        <button type="button" onClick={() => link(kind, x, false)} title="Bỏ gắn khỏi khách này" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-500"><X size={14} /></button></div>)}
                  {adding === kind ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {others.map((x) => { const o = owner[kind](x); return <button key={keyOf(kind, x)} type="button" disabled={busy === x.id} onClick={async () => { if (o && !(await ask(`"${label(kind, x)}" đang thuộc ${nameOf(o)}. Chuyển sang ${cust.name}?`))) return; link(kind, x, true); }}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600"><Plus size={11} /><span className="truncate">{label(kind, x)}</span>{o && <span className="shrink-0 font-medium text-slate-400">· {nameOf(o)}</span>}</button>; })}
                        {!others.length && <span className="text-[11.5px] text-slate-400">Không còn kênh nào khác.</span>}
                      </div>
                      {kind === "ads" ? <NewMetaAccount custId={cust.id} onDone={() => reload(true)} /> : (
                        <div className="mt-2 text-[11px] text-slate-400">Chưa có trong danh sách? {kind === "web" ? "Thêm email robot vào Search Console / GA4 của web" : "Gán page cho System User trong Business Manager"}, rồi bật ở <a href={OFFICE_URL} target="_blank" rel="noopener" className="font-bold text-indigo-600">Văn phòng AI → Kết nối <ExternalLink size={10} className="inline" /></a>.</div>
                      )}
                      <button type="button" onClick={() => setAdding(null)} className="mt-2 text-[11.5px] font-bold text-slate-400 hover:text-slate-600">Xong</button>
                    </div>
                  ) : <button type="button" onClick={() => setAdding(kind)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50"><Plus size={13} /> Gắn {lb.toLowerCase()}</button>}
                </div>
              </div>
            );
          })}
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
      <div className="flex flex-wrap items-center gap-2">
        <Megaphone size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">{a.name}</span>
        <Badge tone={google ? "emerald" : "sky"}>{google ? "Google" : "Meta"}</Badge>
        {!a.active && <Badge tone="slate">Tắt</Badge>}
        {busy && <Loader2 size={13} className="animate-spin text-slate-400" />}
        <button type="button" onClick={() => setOpen((v) => !v)} title="Tuỳ chỉnh" className="rounded-lg p-1 text-slate-400 hover:bg-white"><ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} /></button>
        <button type="button" onClick={onUnlink} title="Bỏ gắn khỏi khách này" className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-500"><X size={14} /></button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[12px]">
          <select value={a.group || "conv"} onChange={(e) => onPatch({ group: e.target.value })} className={inputCls}><option value="conv">Chuyển đổi</option><option value="brand">Thương hiệu</option></select>
          <label className="flex items-center gap-1 text-slate-500"><input type="checkbox" checked={!!a.active} onChange={(e) => onPatch({ active: e.target.checked })} />Đang dùng</label>
          <span className="text-[11px] text-slate-400">{google ? String(a.id).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : `ID ${a.id} · token ${a.tokenTail || "—"}`}</span>
          {!google && <span className="flex w-full items-center gap-1.5"><KeyRound size={12} className="text-slate-300" /><input type="password" autoComplete="off" value={tok} onChange={(e) => setTok(e.target.value)} placeholder="Đổi token (dán token mới)" className={`${inputCls} flex-1`} />
            {tok && <button type="button" onClick={() => { onPatch({ token: tok }); setTok(""); }} className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-bold text-white">Lưu token</button>}</span>}
        </div>
      )}
    </div>
  );
}

// Thêm TK Meta mới ngay trong job: dán token BM → chọn TK → lưu và gắn luôn cho khách của job
function NewMetaAccount({ custId, onDone }) {
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
      <div className="mb-1 text-[11.5px] font-bold text-slate-600">Kết nối tài khoản Meta mới cho job</div>
      <div className="flex gap-1.5">
        <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Dán token System User của BM (quyền ads_read)" className={`${inputCls} min-w-0 flex-1 bg-white`} />
        <button type="button" onClick={discover} disabled={busy || !token.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}Tìm TKQC</button>
      </div>
      {found?.length > 0 && (
        <div className="mt-2 space-y-1">
          {found.map((a) => <label key={a.id} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={!!a.pick} onChange={(e) => setFound((f) => f.map((x) => (x.id === a.id ? { ...x, pick: e.target.checked } : x)))} /><b className="text-slate-700">{a.name}</b><span className="text-slate-400">ID {a.id}{a.added ? " · đã có" : ""}</span></label>)}
          <button type="button" onClick={save} disabled={busy || !found.some((a) => a.pick)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Save size={12} />Lưu & gắn cho job</button>
        </div>
      )}
      {err && <div className="mt-1 text-[11.5px] text-rose-600">{err}</div>}
      <div className="mt-1 text-[10.5px] text-slate-400">Google Ads: số do script đẩy về (Cài đặt → Kết nối nâng cao). Tài khoản Google đã có thì bấm vào tên ở trên để gắn.</div>
    </div>
  );
}
