// Tách từ pages/Ads.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { ArrowDownRight, ArrowUpRight, Bell, CheckCircle2, Info, Lightbulb, Plus, Target, Trash2, XCircle } from "lucide-react";
import { Badge, Card, DateField, MoneyInput } from "../ui.jsx";
import { Warn, dec, dm, int, vnd } from "./adsUtil.jsx";
import { ask } from "../ConfirmDialog.jsx";
import { baselineOf } from "../../lib/adsDiagnose.js";
import { fmtNum, fmtShort, todayISO } from "../../lib/format.js";
import { supabase } from "../../lib/supabase.js";
import { useData } from "../../lib/store.jsx";
import { useEffect, useMemo, useState } from "react";

export function RealResults({ acc, since, until, spend }) {
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
        <span>ROAS: <b>{spend > 0 && rev ? fmtNum(rev / spend, 2) + "x" : "—"}</b></span>
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
            {dm(r.date)} · {r.customers} khách · {fmtShort(r.revenue)}
            {canW && <button onClick={() => deleteAdsResult(r.id)} aria-label="Xoá kết quả" className="-m-1.5 p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>}
          </span>
        ))}</div>
      )}
    </div>
  );
}

export const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke("qws-meta-ads", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};
export const CONV_CAT = {
  PHONE_CALL_LEAD: "Gọi điện", CONTACT: "Liên hệ", SUBMIT_LEAD_FORM: "Gửi form", LEAD: "Khách tiềm năng", PURCHASE: "Mua hàng",
  PAGE_VIEW: "Xem trang", SIGNUP: "Đăng ký", BOOK_APPOINTMENT: "Đặt lịch", GET_DIRECTIONS: "Chỉ đường", ENGAGEMENT: "Tương tác",
  OUTBOUND_CLICK: "Click ra ngoài", QUALIFIED_LEAD: "KH đủ điều kiện", REQUEST_QUOTE: "Yêu cầu báo giá", DEFAULT: "Khác",
};

// Số dư tiền quảng cáo: Google account budget (tự động) hoặc sổ nạp tiền (nhập tay số dư + các lần nạp)
export function balTone(b) { return !b ? "slate" : b.balance <= 0 ? "rose" : b.daysLeft != null && b.daysLeft < 2 ? "rose" : b.daysLeft != null && b.daysLeft < 5 ? "amber" : "emerald"; }
export function BalanceBox({ a, onChanged }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ kind: "anchor", amount: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false); // 01/11: chặn bấm đôi "Lưu" (trước bấm 2 lần = nạp 2 lần)
  const load = async () => { try { setRows((await invoke({ mode: "balance_list", accountId: a.id })).rows || []); } catch (e) { setErr(e.message || String(e)); } };
  useEffect(() => { load();   }, [a.id]);
  const add = async () => {
    if (!f.amount || saving) return; setErr(""); setSaving(true);
    try { await invoke({ mode: "balance_add", accountId: a.id, kind: f.kind, amount: Number(f.amount) }); setF({ ...f, amount: "" }); await load(); onChanged?.(); }
    catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
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
          <span>Đủ chạy: <b className={balTone(b) === "rose" ? "text-rose-600" : ""}>{b.daysLeft != null ? "~" + fmtNum(b.daysLeft, 1) + " ngày" : "—"}</b></span>
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
          <button onClick={add} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 font-bold text-white disabled:opacity-50"><Plus size={13} />{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      )}
      {rows?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{rows.slice(0, 10).map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-sky-100">
            {new Date(r.at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {r.kind === "anchor" ? "số dư" : "nạp"} {fmtShort(r.amount)}
            <button onClick={async () => { if (await ask(`Xoá lần ${r.kind === "anchor" ? "ghi số dư" : "nạp tiền"} ${fmtShort(r.amount)}?`, { ok: "Xoá", danger: true })) del(r.id); }} aria-label="Xoá" className="-m-1.5 p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
          </span>
        ))}</div>
      )}
      {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
    </div>
  );
}

export function AlertsPanel({ tick }) {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  const [openG, setOpenG] = useState(null);
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { setErr(""); invoke({ mode: "alerts_list" }).then((d) => setList(d?.alerts || [])).catch((e) => setErr(e.message || String(e))); }, [tick, retry]);
  // 10/11: gom theo tài khoản / thương hiệu (trước liệt kê rời 30+ dòng). Loại nặng (hết / sắp hết tiền, bị từ chối, lỗi) lên đầu.
  const groups = useMemo(() => {
    const m = new Map();
    for (const x of list || []) {
      const t = String(x.text || ""), i = t.indexOf(":");
      const name = (i > 0 ? t.slice(0, i) : "Khác").replace(/^[^\p{L}\p{N}]+/u, "").trim() || "Khác";
      const body = i > 0 ? t.slice(i + 1).trim() : t;
      const hot = /giới hạn chi tiêu|hết tiền|hết ngân sách|từ chối|bị khoá|bị khóa|vô hiệu|lỗi thanh toán/i.test(t);
      if (!m.has(name)) m.set(name, { name, items: [], hot: false });
      const g = m.get(name); g.items.push({ ...x, body, hot }); g.hot = g.hot || hot;
    }
    return [...m.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at))) }))
      .sort((a, b) => (b.hot - a.hot) || String(b.items[0].sent_at).localeCompare(String(a.items[0].sent_at)));
  }, [list]);
  if (err && !list?.length) return <div className="px-3 sm:px-0"><Warn onRetry={() => setRetry((n) => n + 1)}>Không tải được cảnh báo 48 giờ qua: {err}</Warn></div>;
  if (!list?.length) return null;
  const tm = (x) => new Date(x.sent_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const nHot = groups.filter((g) => g.hot).length;
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2"><Bell size={16} className="text-rose-500" /><span className="whitespace-nowrap text-sm font-extrabold">Cảnh báo 48 giờ qua</span><span className="hidden text-[11px] text-slate-400 sm:inline">(đã đẩy thông báo về app)</span><span className="ml-auto whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{groups.length} <span className="sm:hidden">TK</span><span className="hidden sm:inline">tài khoản · {list.length} lần</span>{nHot ? ` · ${nHot} cần xử lý` : ""}</span></div>
      <div className="space-y-1">{(all ? groups : groups.slice(0, 4)).map((g) => { const open = openG === g.name, x = g.items[0]; return (
        <div key={g.name} className={`rounded-xl px-2.5 py-1.5 ${g.hot ? "bg-rose-50/70" : "bg-slate-50"}`}>
          <button type="button" onClick={() => setOpenG(open ? null : g.name)} disabled={g.items.length < 2} className="flex w-full items-start gap-2 text-left text-xs">
            <span className="min-w-0 flex-1"><b className={g.hot ? "text-rose-700" : "text-slate-800"}>{g.name}</b> <span className="text-slate-600">{x.body}</span></span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">{tm(x)}{g.items.length > 1 ? ` · +${g.items.length - 1}` : ""}</span>
          </button>
          {open && <div className="mt-1 space-y-0.5 border-t border-slate-200/70 pt-1">{g.items.slice(1).map((y) => <div key={y.key} className="flex gap-2 text-[11.5px]"><span className="shrink-0 text-slate-400">{tm(y)}</span><span className="text-slate-600">{y.body}</span></div>)}</div>}
        </div>
      ); })}</div>
      {groups.length > 4 && <button onClick={() => setAll((v) => !v)} className="mt-1.5 text-[12px] font-bold text-indigo-600">{all ? "Thu gọn" : `Xem thêm ${groups.length - 4} tài khoản`}</button>}
      {err && <div className="mt-2"><Warn onRetry={() => setRetry((n) => n + 1)}>Không cập nhật được cảnh báo (đang hiện danh sách cũ): {err}</Warn></div>}
    </Card>
  );
}

// ---------- Chấm điểm ----------
// Nhãn chấm điểm: rê chuột (máy tính) hoặc CHẠM (điện thoại) để hiện lý do ngay dưới nhãn
export function VBadge({ v, cell }) {
  const [open, setOpen] = useState(false);
  if (!v) return null;
  const b = <Badge tone={v.tone}>{v.label}{v.lowSample ? "*" : ""}</Badge>;
  if (!v.reason) return b;
  const tap = (e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); };
  return (<>
    <span role="button" tabIndex={0} title={v.reason} onClick={tap} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tap(e)} className="cursor-pointer">{b}</span>
    {open && <span className={`mt-0.5 block w-full text-[10.5px] font-medium normal-case leading-snug tracking-normal text-slate-500 ${cell ? "ml-auto min-w-[150px] max-w-[240px] whitespace-normal" : ""}`}>{v.reason}</span>}
  </>);
}
export const vCol = ["_v", "Đánh giá", (v) => <VBadge v={v} cell />];

export function KpiBox({ a, kpi, onSave }) {
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

export function Scorecard({ diag, onWeek }) {
  if (!diag?.accounts?.length) return null;
  const rows = diag.accounts.filter((x) => x.spend > 0);
  const off = diag.accounts.filter((x) => !x.spend);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 size={16} className="text-emerald-500" />
        <span className="text-sm font-extrabold">Chấm điểm hiệu quả</span>
        <span className="text-[11px] text-slate-400">tính tự động theo KPI / kỳ trước — chạm/rê vào nhãn để xem lý do</span>
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
                <span>Chi phí/tin nhắn+lead <b className="text-slate-700">{vnd(x.cpr)}</b>{x.deltas?.cpr != null && <span className={x.deltas.cpr > 0 ? "text-rose-600" : "text-emerald-600"}> ({x.deltas.cpr > 0 ? "+" : ""}{x.deltas.cpr}%)</span>}</span>
                <span>Mốc <b className="text-slate-700">{x.baseline ? vnd(x.baseline.value) : "—"}</b>{x.baseline && <span className="text-slate-400"> · {x.baseline.label}</span>}</span>
                {x.real?.costPerCustomer != null && <span>Giá/khách chốt <b className="text-slate-700">{vnd(x.real.costPerCustomer)}</b></span>}
                {x.real?.roas != null && <span>ROAS <b className="text-slate-700">{fmtNum(x.real.roas, 1)}</b></span>}
              </div>
              {(x.scale.length > 0 || x.cut.length > 0) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {x.scale.length > 0 && (
                    <div className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-800">
                      <div className="mb-1 flex items-center gap-1 font-bold"><ArrowUpRight size={13} /> Đang hiệu quả — nên dồn ngân sách</div>
                      {x.scale.map((c) => <div key={c.name} className="truncate">• {c.name} — {c.muc_tieu ? `🎯 ${c.muc_tieu} · ${vnd(c.chi_phi_ket_qua)}/KQ · ${dec(c.ket_qua_theo_muc_tieu)} KQ` : `${vnd(c.cpr)}/KQ · ${dec(c.results)} KQ`}</div>)}
                    </div>
                  )}
                  {x.cut.length > 0 && (
                    <div className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800">
                      <div className="mb-1 flex items-center gap-1 font-bold"><ArrowDownRight size={13} /> Kém — nên giảm/tắt{x.wasted > 0 ? ` (đã đốt ${vnd(x.wasted)})` : ""}</div>
                      {x.cut.map((c) => <div key={c.name} className="truncate">• {c.name} — {c.muc_tieu ? `🎯 ${c.muc_tieu} · ${c.ket_qua_theo_muc_tieu ? vnd(c.chi_phi_ket_qua) + "/KQ" : "0 KQ"}` : c.results ? vnd(c.cpr) + "/KQ" : "0 KQ"} · tiêu {vnd(c.spend)}</div>)}
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

export function AiReport({ r }) {
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
