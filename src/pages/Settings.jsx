import AdsAccounts from "../components/AdsAccounts.jsx";
import OfficeSettings from "../components/OfficeSettings.jsx";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Database, ShieldCheck, AlertTriangle, Cloud, LogOut, UserCircle, Bell, BellRing, Send, Users2, UserPlus, Trash2 } from "lucide-react";
import { Card, SectionTitle } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import AiImport from "../components/AiImport.jsx";
import CloudBackups from "../components/CloudBackups.jsx";
import AiUsage from "../components/AiUsage.jsx";
import { pushSupported, permission, isSubscribed, enablePush, disablePush, sendTest } from "../lib/push.js";
import { FEATURES, memberAccess } from "../lib/permissions.js";

const accBadge = (v) => (v === "edit" ? "bg-emerald-500 text-white" : v === "view" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-400");
const accLbl = (v) => (v === "edit" ? "Sửa" : v === "view" ? "Xem" : "—");
const cycleAcc = (v) => (v === "none" || !v ? "view" : v === "view" ? "edit" : "none");
const allAccess = (val) => Object.fromEntries(FEATURES.map(([k]) => [k, val]));

function MembersCard() {
  const { members = [], addMember, updateMember, removeMember } = useData();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [access, setAccess] = useState(() => allAccess("view")); // mặc định: chỉ Xem tất cả
  const setNew = (k) => setAccess((a) => ({ ...a, [k]: cycleAcc(a[k]) }));
  const add = () => { const e = email.trim().toLowerCase(); if (!e) return; addMember({ email: e, name: name.trim(), access }); setEmail(""); setName(""); setAccess(allAccess("view")); };
  const setMember = (m, k) => { const cur = memberAccess(m); updateMember(m.email, { access: { ...cur, [k]: cycleAcc(cur[k]) } }); };
  return (
    <Card>
      <SectionTitle action={<Users2 size={18} className="text-indigo-500" />}>Người dùng & phân quyền</SectionTitle>
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <span>Bạn là <b>chủ (admin)</b> — toàn quyền + là người duy nhất sửa cài đặt dữ liệu/bảo mật. Thêm thành viên bằng <b>email</b>, mỗi tính năng bấm để chọn <b className="text-slate-500">—</b> (không) → <b className="text-sky-600">Xem</b> → <b className="text-emerald-600">Sửa</b>.</span>
      </div>

      {/* Thêm thành viên */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Email thành viên *" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên (tuỳ chọn)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FEATURES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setNew(k)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${accBadge(access[k])}`}>{l}: {accLbl(access[k])}</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          <button type="button" onClick={() => setAccess(allAccess("view"))} className="font-bold text-sky-600">Chỉ xem tất cả</button>
          <button type="button" onClick={() => setAccess(allAccess("edit"))} className="font-bold text-emerald-600">Toàn quyền sửa</button>
          <button type="button" onClick={() => setAccess(allAccess("none"))} className="font-bold text-slate-400">Bỏ hết</button>
        </div>
        <button onClick={add} disabled={!email.trim()} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2 text-sm font-bold text-white disabled:opacity-40"><UserPlus size={15} /> Thêm thành viên</button>
      </div>

      {/* Danh sách thành viên */}
      <div className="mt-3 space-y-2">
        {members.length === 0 && <div className="py-4 text-center text-xs text-slate-400">Chưa có thành viên nào. Chỉ mình bạn dùng app.</div>}
        {members.map((m) => {
          const a = memberAccess(m);
          return (
            <div key={m.email} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{m.name || m.email}</div>
                  <div className="truncate text-[11px] text-slate-400">{m.email}</div>
                </div>
                <button onClick={() => { if (confirm(`Gỡ quyền của ${m.email}?`)) removeMember(m.email); }} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FEATURES.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMember(m, k)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${accBadge(a[k])}`}>{l}: {accLbl(a[k])}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-700">
        ⚠️ Để thành viên thấy dữ liệu chung: đã bật <b>chia sẻ RLS</b> trên Supabase ✓. Thành viên chỉ cần tự <b>đăng ký tài khoản</b> đúng email này trên app rồi đăng nhập.
      </div>
    </Card>
  );
}

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

  const counts = [
    ["Khách hàng", customerList.length],
    ["Dự án", projects.length],
    ["Đợt thu / phiếu", totalInstallments],
    ["Công việc", tasks.length],
    ["Giỗ / Sinh nhật", family.length],
  ];

  return (
    <div className="space-y-3">
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

      {isOwner && <OfficeSettings />}

      {isOwner && <MembersCard />}

      {isOwner && <AiImport />}

      {isOwner && <AiUsage />}

      {isOwner && <AdsAccounts />}

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

      {isOwner && (<>
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

      <Card>
        <SectionTitle action={<RotateCcw size={18} className="text-rose-500" />}>Khôi phục mặc định</SectionTitle>
        <p className="text-sm text-slate-500">Đặt lại toàn bộ về dữ liệu gốc từ sheet. Mọi thay đổi & giao dịch bạn nhập thêm sẽ mất.</p>
        <button
          onClick={() => { if (confirm("Đặt lại toàn bộ dữ liệu về mặc định? Hành động này không hoàn tác được.")) { reset(); setMsg("✓ Đã đặt lại dữ liệu gốc."); } }}
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100">
          Đặt lại dữ liệu gốc
        </button>
      </Card>
      </>)}
    </div>
  );
}
