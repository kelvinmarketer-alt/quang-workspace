// Kênh của 1 khách (01/11 sếp duyệt): TK quảng cáo · website · fanpage gắn ngay trong Khách & Dự án — thay vì rải ở
// Cài đặt (TKQC) và Trung tâm báo cáo (web/fanpage). Cùng dữ liệu: TKQC = cust trên máy chủ, web/fanpage = settings.reportLinks.
// Chưa gắn tay thì app đoán theo tên (giống Trung tâm báo cáo). Chỉ chủ.
import { useEffect, useState } from "react";
import { Megaphone, Globe, ThumbsUp, Link2, Loader2, Check } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { loadChannelLists, setAdsCustomer, guessCustomer, siteKey, dropReportCache } from "../lib/reports.js";

let CACHE = null; // 1 lần tải / phiên mở app (danh sách kênh ít đổi)

export default function CustomerChannels({ customer }) {
  const { customerList = [], settings = {}, setSettings, setToast } = useData();
  const [lists, setLists] = useState(CACHE);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (CACHE) return;
    let alive = true;
    loadChannelLists(settings).then((v) => { CACHE = v; if (alive) setLists(v); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const links = settings.reportLinks || {};
  const nameOf = (id) => customerList.find((c) => c.id === id)?.name;
  const owner = {
    web: (d) => { const v = links.web?.[d]; return v === "none" ? null : v || guessCustomer(siteKey(d), customerList); },
    page: (p) => { const v = links.page?.[p.id]; return v === "none" ? null : v || guessCustomer(p.name, customerList); },
    ads: (a) => a.cust || guessCustomer(a.name, customerList),
  };
  if (!lists) return <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Đang tải kênh…</div>;

  const mine = {
    ads: lists.ads.filter((a) => owner.ads(a) === customer.id),
    web: lists.web.filter((d) => owner.web(d) === customer.id),
    page: lists.pages.filter((p) => owner.page(p) === customer.id),
  };
  const setLink = (kind, key, v) => { dropReportCache(); setSettings({ reportLinks: { ...links, [kind]: { ...(links[kind] || {}), [key]: v } } }); };
  const flipAds = async (a, on) => {
    setBusy(a.id);
    try { await setAdsCustomer(a, on ? customer.id : null); a.cust = on ? customer.id : null; setLists({ ...CACHE }); }
    catch (e) { setToast?.({ text: "Không gắn được tài khoản quảng cáo: " + (e.message || e) }); }
    setBusy(null);
  };
  const Pill = ({ on, label, sub, onClick, wait }) => (
    <button type="button" onClick={onClick} disabled={wait} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${on ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200"}`}>
      {wait ? <Loader2 size={11} className="animate-spin" /> : on && <Check size={11} />}<span className="truncate">{label}</span>{sub && <span className="shrink-0 font-medium text-slate-400">· {sub}</span>}
    </button>
  );
  const total = mine.ads.length + mine.web.length + mine.page.length;
  const groups = [
    ["ads", Megaphone, "Quảng cáo", lists.ads, (a) => a.id, (a) => a.name, (a) => owner.ads(a), (a, on) => flipAds(a, on)],
    ["web", Globe, "Website", lists.web, (d) => d, (d) => d, (d) => owner.web(d), (d, on) => setLink("web", d, on ? customer.id : "none")],
    ["page", ThumbsUp, "Fanpage", lists.pages, (p) => p.id, (p) => p.name, (p) => owner.page(p), (p, on) => setLink("page", p.id, on ? customer.id : "none")],
  ];

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400"><Link2 size={12} /> Kênh</span>
        {!total && !edit && <span className="text-[11.5px] text-slate-400">Chưa gắn kênh nào</span>}
        {!edit && groups.map(([k, I]) => mine[k].map((x) => <span key={k + String(x.id || x)} className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"><I size={11} className="shrink-0" /><span className="truncate">{x.name || x}</span></span>))}
        <button type="button" onClick={() => setEdit((v) => !v)} className="ml-auto rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50">{edit ? "Xong" : "Gắn kênh"}</button>
      </div>
      {edit && (
        <div className="mt-2 space-y-2.5">
          {groups.map(([k, I, label, list, idOf, nm, own, flip]) => (
            <div key={k}>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><I size={12} /> {label}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.length ? list.map((x) => { const o = own(x), on = o === customer.id; return <Pill key={idOf(x)} on={on} label={nm(x)} sub={!on && o ? nameOf(o) : null} wait={busy === idOf(x)} onClick={() => flip(x, !on)} />; })
                  : <span className="text-[11px] text-slate-400">Chưa kết nối kênh nào</span>}
              </div>
            </div>
          ))}
          <div className="text-[10.5px] text-slate-400">Bấm để gắn / bỏ gắn với {customer.name}. Kênh đang thuộc khách khác sẽ chuyển sang khách này. Chưa gắn thì app tự nhận theo tên.</div>
        </div>
      )}
    </div>
  );
}
