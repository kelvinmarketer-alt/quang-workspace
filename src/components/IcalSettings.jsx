import { useEffect, useState } from "react";
import { CalendarDays, Copy, Check, RefreshCw, Trash2, KeyRound, Smartphone, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, SectionTitle } from "./ui.jsx";
import { ask } from "./ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import ConnHint from "./ConnHint.jsx";
import { ICAL_DEFAULTS, ICAL_GROUPS, buildIcs, newToken, icalUrl, icalWebcalUrl, icalGet, icalCreate, icalSave, icalDelete } from "../lib/ical.js";

// Cài đặt (chỉ chủ): bật / tắt link lịch đăng ký, chọn nhóm hiện trên lịch, copy link, đổi link khi lỡ lộ.
const isMissing = (e) => !!e && (/PGRST20[0-9]|42P01/.test(String(e.code || "")) || /does not exist|schema cache|Could not find the table/i.test(String(e.message || "")));
const fmtTime = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function IcalSettings() {
  const { tasks, family, projects, customerList } = useData();
  const { user } = useAuth();
  const uid = user?.id;
  const [state, setState] = useState("loading"); // loading | none | on | setup | error
  const [feed, setFeed] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [counts, setCounts] = useState(null);

  const make = (opts) => buildIcs({ tasks, family, projects, customers: customerList, opts });
  const refreshOthers = () => { try { window.dispatchEvent(new Event("qws-ical-refresh")); } catch { /* bỏ qua */ } };

  useEffect(() => {
    let alive = true;
    icalGet().then((r) => {
      if (!alive) return;
      if (r.error) { setErr(r.error.message || ""); setState(isMissing(r.error) ? "setup" : "error"); return; }
      if (r.data) { setFeed(r.data); setCounts(make(r.data.options).counts); setState("on"); } else setState("none");
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = async () => {
    setBusy(true); setErr("");
    const opts = { ...ICAL_DEFAULTS }, b = make(opts);
    const r = await icalCreate(uid, newToken(), opts, b.ics);
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    setFeed(r.data); setCounts(b.counts); setState("on"); refreshOthers();
  };
  const setOpt = async (k, v) => {
    const options = { ...ICAL_DEFAULTS, ...(feed.options || {}), [k]: v }, b = make(options);
    setFeed({ ...feed, options }); setCounts(b.counts);
    const r = await icalSave(uid, { options, ics: b.ics });
    if (r.error) setErr(r.error.message); else { setFeed(r.data); refreshOthers(); }
  };
  const updateNow = async () => {
    setBusy(true); setErr("");
    const b = make(feed.options), r = await icalSave(uid, { ics: b.ics });
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    setFeed(r.data); setCounts(b.counts);
  };
  const rotate = async () => {
    if (!(await ask("Đổi link lịch?\nLink cũ ngừng hoạt động ngay. Bạn phải đăng ký lại link mới trên điện thoại (và xoá lịch đăng ký cũ).", { ok: "Đổi link", danger: true }))) return;
    setBusy(true); setErr("");
    const r = await icalSave(uid, { token: newToken() });
    setBusy(false);
    if (r.error) setErr(r.error.message); else setFeed(r.data);
  };
  const disable = async () => {
    if (!(await ask("Tắt và xoá link lịch?\nĐiện thoại đang đăng ký sẽ không cập nhật nữa. Dữ liệu trong app không bị ảnh hưởng.", { ok: "Xoá link", danger: true }))) return;
    setBusy(true);
    const r = await icalDelete(uid);
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    setFeed(null); setCounts(null); setState("none"); refreshOthers();
  };
  const copy = async () => {
    const url = icalUrl(feed.token);
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch { /* bỏ qua */ } ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const opts = { ...ICAL_DEFAULTS, ...(feed?.options || {}) };
  return (
    <Card>
      <SectionTitle action={<CalendarDays size={18} className="text-indigo-500" />}>Lịch trên điện thoại (iPhone / Google)</SectionTitle>
      <ConnHint k="ical" className="-mt-3 mb-3" />
      {state === "loading" && <div className="grid place-items-center py-6"><Loader2 className="animate-spin text-indigo-500" /></div>}

      {state === "setup" && (
        <div className="flex gap-3 text-[13px] text-slate-600">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>Chưa cài đặt: mở Supabase → SQL Editor → chạy file <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">supabase/SETUP-ICAL.sql</code>, rồi cài hàm <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">qws-ical</code> (tắt Verify JWT).</div>
        </div>
      )}
      {state === "error" && <div className="text-[13px] text-rose-600">Không tải được: {err}</div>}

      {state === "none" && (
        <div className="space-y-3 text-[13px] leading-relaxed text-slate-600">
          <p>Đưa <b>việc cần làm, giỗ / Rằm / lễ, hạn thu tiền</b> sang <b>Lịch của iPhone hoặc Google Calendar</b> bằng một đường link. Từ đó bạn xem và nhận chuông nhắc ngay trong Lịch điện thoại, kể cả khi không mở app.</p>
          <p className="text-slate-500">Chỉ một chiều: từ app ra điện thoại. Sửa bên Lịch điện thoại không quay về app. Ai có link thì xem được lịch của bạn, nên đừng gửi link cho người lạ.</p>
          <button type="button" disabled={busy} onClick={enable} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />} Bật link lịch</button>
        </div>
      )}

      {state === "on" && feed && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[12px] font-bold text-slate-500">Link lịch của bạn (giữ kín)</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={icalUrl(feed.token)} aria-label="Link lịch" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-600" />
              <button type="button" onClick={copy} className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold ${copied ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-indigo-600 hover:bg-indigo-50"}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Đã copy" : "Copy link"}</button>
              <a href={icalWebcalUrl(feed.token)} className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700"><Smartphone size={14} /> Mở trên iPhone</a>
            </div>
            <div className="mt-1.5 text-[11.5px] text-slate-400">
              {counts ? `Hiện có ${counts.family + counts.holidays + counts.tasks + counts.receivables} mục trên lịch (${counts.tasks} việc, ${counts.receivables} hạn thu, ${counts.family} sự kiện riêng, ${counts.holidays} lễ / Mùng 1 / Rằm). ` : ""}
              Cập nhật lần cuối {fmtTime(feed.updated_at)}. App tự gửi bản mới mỗi khi bạn sửa dữ liệu (cần mở app).
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[12px] font-bold text-slate-500">Hiện những gì trên lịch</div>
            {ICAL_GROUPS.map(([k, label, hint]) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={!!opts[k]} onChange={(e) => setOpt(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                <span className="min-w-0"><span className="block text-[13px] font-bold text-slate-700">{label}</span><span className="block text-[11.5px] text-slate-400">{hint}</span></span>
              </label>
            ))}
          </div>

          <details className="rounded-xl bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-600">
            <summary className="cursor-pointer font-bold text-slate-700">Cách thêm vào điện thoại</summary>
            <div className="mt-2 space-y-2">
              <div><b>iPhone:</b> bấm nút "Mở trên iPhone" bằng Safari trên iPhone, chọn <i>Đăng ký</i>. Hoặc: Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm lịch đăng ký → dán link.</div>
              <div><b>Google Calendar:</b> máy tính → bên trái, mục "Lịch khác" bấm dấu + → "Từ URL" → dán link. Google cập nhật chậm hơn (có thể vài giờ).</div>
              <div className="flex items-center gap-1 text-slate-400"><ExternalLink size={12} /> Chuông nhắc: việc có giờ nhắc trước 15 phút; việc cả ngày, hạn thu và giỗ / sinh nhật nhắc lúc 9 giờ sáng (giỗ / sinh nhật nhắc thêm 9 giờ sáng hôm trước).</div>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={updateNow} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Cập nhật ngay</button>
            <button type="button" disabled={busy} onClick={rotate} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><KeyRound size={14} /> Đổi link (khi lỡ lộ)</button>
            <button type="button" disabled={busy} onClick={disable} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"><Trash2 size={14} /> Tắt và xoá link</button>
          </div>
        </div>
      )}
      {err && state !== "error" && state !== "setup" && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
    </Card>
  );
}
