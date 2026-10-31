import AdsAccounts from "../components/AdsAccounts.jsx";
import OfficeSettings from "../components/OfficeSettings.jsx";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Database, ShieldCheck, AlertTriangle, Cloud, LogOut, UserCircle, Bell, BellRing, Send, Users2, UserPlus, Trash2, Building2, Plug } from "lucide-react";
import { Card, SectionTitle } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import AiImport from "../components/AiImport.jsx";
import CloudBackups from "../components/CloudBackups.jsx";
import AiUsage from "../components/AiUsage.jsx";
import { pushSupported, permission, isSubscribed, enablePush, disablePush, sendTest } from "../lib/push.js";
import { ask } from "../components/ConfirmDialog.jsx";
import PeoplePerms from "../components/PeoplePerms.jsx";

// Phân quyền người dùng: src/components/PeoplePerms.jsx (hồ sơ quyền tập trung — module · phạm vi dự án · vai trò Văn phòng AI)

function PushCard({ userId }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const supported = pushSupported();
  useEffect(() => { if (supported) isSubscribed().then(setOn); }, [supported]);

  const toggle = async () => {
    setBusy(true); setMsg(null);
    try {
      if (on) { await disablePush(); setOn(false); setMsg({ t: "ok", m: "Đã tắt thông báo trên thiết bị này." }); }
      else { await enablePush(userId); setOn(true); setMsg({ t: "ok", m: "✓ Đã bật! Thiết bị này sẽ nhận thông báo nền." }); }
    } catch (e) { setMsg({ t: "err", m: e.message || String(e) }); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try { const r = await sendTest(userId); setMsg({ t: "ok", m: `Đã gửi thử tới ${r?.sent ?? "?"} thiết bị. Chờ vài giây…` }); }
    catch (e) { setMsg({ t: "err", m: "Gửi thử lỗi: " + (e.message || String(e)) }); }
    setBusy(false);
  };

  return (
    <Card>
      <SectionTitle action={<BellRing size={18} className="text-amber-500" />}>Thông báo đẩy (nền)</SectionTitle>
      {!supported ? (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          Thiết bị/trình duyệt này chưa hỗ trợ thông báo đẩy. Trên <b>iPhone/iPad</b> cần <b>“Thêm vào MH chính”</b> (cài như app) rồi mở từ icon đó mới bật được.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-xl ${on ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"}`}><Bell size={20} /></div>
              <div>
                <div className="text-sm font-bold text-slate-800">{on ? "Đang bật trên thiết bị này" : "Đang tắt"}</div>
                <div className="text-[11px] text-slate-400">Nhắc quỹ đến hạn, việc, công nợ… kể cả khi đóng app.</div>
              </div>
            </div>
            <button onClick={toggle} disabled={busy} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${on ? "bg-slate-500 hover:bg-slate-600" : "bg-amber-500 hover:bg-amber-600"}`}>{busy ? "…" : on ? "Tắt" : "Bật"}</button>
          </div>
          {on && (
            <button onClick={test} disabled={busy} className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"><Send size={15} /> Gửi thử tới máy tôi</button>
          )}
          {permission() === "denied" && <div className="mt-2 text-[11px] font-semibold text-rose-500">⚠ Quyền thông báo đang bị chặn — mở cài đặt trình duyệt để cho phép lại.</div>}
        </>
      )}
      {msg && <div className={`mt-2 text-xs font-semibold ${msg.t === "err" ? "text-rose-600" : "text-emerald-600"}`}>{msg.m}</div>}
    </Card>
  );
}

export default function Settings() {
  const { tasks, family, customerList, projects, exportData, importData, reset, isOwner } = useData();
  const { user, signOut, changePassword } = useAuth();
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState(null);
  const doChangePw = async () => {
    if (newPw.length < 6) { setPwMsg({ t: "err", m: "Mật khẩu tối thiểu 6 ký tự" }); return; }
    const { error } = await changePassword(newPw);
    setPwMsg(error ? { t: "err", m: error.message } : { t: "ok", m: "✓ Đã đổi mật khẩu" });
    if (!error) setNewPw("");
  };
  const totalInstallments = projects.reduce((a, p) => a + (p.installments || []).length, 0);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `quang-workspace-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("✓ Đã tải file sao lưu.");
  };

  const doImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importData(reader.result);
      setMsg(ok ? "✓ Khôi phục dữ liệu thành công." : "✗ File không hợp lệ.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Chia trang thành các mục (nhớ mục đang mở trên máy này) — trước đây 1 trang cuộn rất dài
  const SECS = [["account", "Tài khoản", UserCircle], ["notify", "Thông báo", Bell], ...(isOwner ? [["office", "Văn phòng AI", Building2], ["members", "Phân quyền", Users2], ["connect", "Kết nối & AI", Plug], ["data", "Dữ liệu & sao lưu", ShieldCheck]] : [])];
  const [sec, setSec0] = useState(() => { try { return localStorage.getItem("qws_settings_sec") || "account"; } catch { return "account"; } });
  const cur = SECS.some(([k]) => k === sec) ? sec : "account";
  const setSec = (k) => { setSec0(k); try { localStorage.setItem("qws_settings_sec", k); } catch { /* bỏ qua */ } };
  const [resetTxt, setResetTxt] = useState("");
  const resetOk = resetTxt.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Đ/g, "D") === "DAT LAI";

  const counts = [
    ["Khách hàng", customerList.length],
    ["Dự án", projects.length],
    ["Đợt thu / phiếu", totalInstallments],
    ["Công việc", tasks.length],
    ["Giỗ / Sinh nhật", family.length],
  ];

  return (
    <div className="bento space-y-4 p-3 sm:p-5">
      <div className={`grid gap-1 rounded-2xl bg-white/70 p-1 shadow-sm sm:flex ${SECS.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>{/* 23/10: điện thoại = lưới thấy đủ mọi mục (trước cuộn ngang, mục đang mở bị che) */}
        {SECS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setSec(k)} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center text-[11.5px] font-extrabold leading-tight transition sm:shrink-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-[13px] ${cur === k ? "nav-active bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "text-slate-500 hover:bg-white hover:text-slate-800"}`}>
            <Icon size={15} className="shrink-0" /> {label}
          </button>
        ))}
      </div>

      {cur === "account" && <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white"><UserCircle size={22} /></div>
            <div>
              <div className="text-sm font-bold text-slate-800">{user?.email || "—"}</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Cloud size={12} /> Đã đồng bộ đám mây (Supabase)</div>
            </div>
          </div>
          <button onClick={async () => { if (await ask("Đăng xuất khỏi máy này?")) signOut(); }} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600"><LogOut size={15} /> Đăng xuất</button>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-1 text-xs font-bold uppercase text-slate-400">Đổi mật khẩu</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Mật khẩu mới (≥6 ký tự)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={doChangePw} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900">Đổi</button>
          </div>
          {pwMsg && <div className={`mt-2 text-xs font-semibold ${pwMsg.t === "err" ? "text-rose-600" : "text-emerald-600"}`}>{pwMsg.m}</div>}
        </div>
      </Card>
      </>}

      {cur === "notify" && <PushCard userId={user?.id} />}

      {cur === "office" && isOwner && <OfficeSettings />}

      {cur === "members" && isOwner && <PeoplePerms />}

      {cur === "connect" && isOwner && <>
        <AiImport />
        <AiUsage />
        <AdsAccounts />
      </>}

      {cur === "account" && <Card>
        <SectionTitle action={<Database size={18} className="text-slate-400" />}>Dữ liệu hiện có</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {counts.map(([l, n]) => (
            <div key={l} className="rounded-xl bg-slate-50 p-3">
              <div className="text-2xl font-extrabold text-slate-800">{n}</div>
              <div className="text-[11px] font-semibold text-slate-400">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
          <Cloud size={16} className="mt-0.5 shrink-0" />
          <span>Dữ liệu <b>tự đồng bộ lên đám mây (Supabase)</b> theo tài khoản của bạn — đăng nhập máy nào cũng thấy. Vẫn nên <b>tải sao lưu</b> định kỳ cho chắc.</span>
        </div>
      </Card>}

      {cur === "data" && isOwner && (<>
      <Card>
        <SectionTitle action={<ShieldCheck size={18} className="text-emerald-500" />}>Sao lưu & Khôi phục</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={doExport} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600"><Download size={20} /></div>
            <div>
              <div className="text-sm font-bold text-slate-800">Tải file sao lưu</div>
              <div className="text-[11px] text-slate-400">Xuất toàn bộ ra file .json</div>
            </div>
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-sky-300 hover:bg-sky-50/40">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-sky-600"><Upload size={20} /></div>
            <div>
              <div className="text-sm font-bold text-slate-800">Khôi phục từ file</div>
              <div className="text-[11px] text-slate-400">Nhập lại từ file .json đã lưu</div>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="application/json" onChange={doImport} className="hidden" />
        </div>
        {msg && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{msg}</div>}
      </Card>

      <CloudBackups />

      {/* VÙNG NGUY HIỂM: thu gọn sẵn, phải gõ "ĐẶT LẠI" mới bấm được */}
      <details className="card overflow-hidden border border-rose-100">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-extrabold text-rose-700 sm:px-5"><AlertTriangle size={16} /> Vùng nguy hiểm</summary>
        <div className="border-t border-rose-100 px-4 pb-4 pt-3 sm:px-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><RotateCcw size={15} className="text-rose-500" /> Đặt lại dữ liệu gốc</div>
          <p className="mt-1 text-[12.5px] text-slate-500">Đưa toàn bộ về dữ liệu gốc từ sheet — <b className="text-rose-600">mọi thay đổi & giao dịch bạn nhập thêm sẽ mất</b>. Nên tải file sao lưu trước. Gõ <b>ĐẶT LẠI</b> để mở nút.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={resetTxt} onChange={(e) => setResetTxt(e.target.value)} placeholder='Gõ "ĐẶT LẠI"' className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm sm:max-w-xs" />
            <button disabled={!resetOk}
              onClick={async () => { if (await ask("Đặt lại toàn bộ dữ liệu về mặc định? Hành động này không hoàn tác được.", { ok: "Đặt lại", danger: true })) { reset(); setResetTxt(""); setMsg("✓ Đã đặt lại dữ liệu gốc."); } }}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40">
              Đặt lại dữ liệu gốc
            </button>
          </div>
        </div>
      </details>
      </>)}
    </div>
  );
}
