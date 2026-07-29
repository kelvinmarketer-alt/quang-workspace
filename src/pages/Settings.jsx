import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Database, ShieldCheck, AlertTriangle, Cloud, LogOut, UserCircle, Bell, BellRing, Send } from "lucide-react";
import { Card, SectionTitle } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import AiImport from "../components/AiImport.jsx";
import { pushSupported, permission, isSubscribed, enablePush, disablePush, sendTest } from "../lib/push.js";

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
  const { tasks, family, customerList, projects, exportData, importData, reset } = useData();
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

  const counts = [
    ["Khách hàng", customerList.length],
    ["Dự án", projects.length],
    ["Đợt thu / phiếu", totalInstallments],
    ["Công việc", tasks.length],
    ["Giỗ / Sinh nhật", family.length],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white"><UserCircle size={22} /></div>
            <div>
              <div className="text-sm font-bold text-slate-800">{user?.email || "—"}</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Cloud size={12} /> Đã đồng bộ đám mây (Supabase)</div>
            </div>
          </div>
          <button onClick={() => { if (confirm("Đăng xuất khỏi máy này?")) signOut(); }} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600"><LogOut size={15} /> Đăng xuất</button>
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

      <PushCard userId={user?.id} />

      <AiImport />

      <Card>
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
      </Card>

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

      <Card>
        <SectionTitle action={<RotateCcw size={18} className="text-rose-500" />}>Khôi phục mặc định</SectionTitle>
        <p className="text-sm text-slate-500">Đặt lại toàn bộ về dữ liệu gốc từ sheet. Mọi thay đổi & giao dịch bạn nhập thêm sẽ mất.</p>
        <button
          onClick={() => { if (confirm("Đặt lại toàn bộ dữ liệu về mặc định? Hành động này không hoàn tác được.")) { reset(); setMsg("✓ Đã đặt lại dữ liệu gốc."); } }}
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100">
          Đặt lại dữ liệu gốc
        </button>
      </Card>
    </div>
  );
}
