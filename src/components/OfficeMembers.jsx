import { useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { OFFICE_AGENTS, MEMBER_FLAGS, DEFAULT_MEMBER_PERMS, loadOfficeMembers, saveOfficeMember, deleteOfficeMember } from "../lib/office.js";

// Tài khoản phụ dùng Văn phòng AI + quyền riêng từng người (bảng office_members, RLS chỉ chủ sửa)
export default function OfficeMembers({ ownerId }) {
  const { members: qwsMembers } = useData();
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const reload = () => loadOfficeMembers().then(setRows).catch((e) => setMsg({ t: "err", m: e.message }));
  useEffect(() => { reload(); }, []);

  const save = async (m) => {
    setRows((rs) => rs.map((r) => (r.email === m.email ? m : r)));
    try { await saveOfficeMember(ownerId, m); setMsg({ t: "ok", m: `✓ Đã lưu quyền của ${m.name || m.email}` }); }
    catch (e) { setMsg({ t: "err", m: e.message }); reload(); }
  };
  const add = async (em, name) => {
    const e = (em || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setMsg({ t: "err", m: "Email không hợp lệ" });
    if ((rows || []).some((r) => r.email === e)) return setMsg({ t: "err", m: "Email này đã có trong danh sách" });
    try { await saveOfficeMember(ownerId, { email: e, name, perms: DEFAULT_MEMBER_PERMS, active: true }); setEmail(""); reload(); setMsg({ t: "ok", m: `✓ Đã thêm ${e}. Người đó đăng nhập office.2bkin.io.vn bằng đúng email này.` }); }
    catch (err) { setMsg({ t: "err", m: err.message }); }
  };
  const remove = async (m) => {
    if (!confirm(`Gỡ ${m.name || m.email} khỏi Văn phòng AI?`)) return;
    try { await deleteOfficeMember(ownerId, m.email); reload(); } catch (e) { setMsg({ t: "err", m: e.message }); }
  };
  const suggest = (qwsMembers || []).filter((x) => x.email && !(rows || []).some((r) => r.email === x.email.toLowerCase()));

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-1 text-sm font-extrabold text-slate-800">Thành viên dùng Văn phòng AI</div>
      <div className="mb-3 text-[11px] text-slate-400">Tài khoản phụ đăng nhập office.2bkin.io.vn bằng email được thêm. Mặc định: giao việc cho mọi NV, được nhắn tin, KHÔNG duyệt, KHÔNG xem chi phí, chỉ thấy việc mình giao.</div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email tài khoản phụ" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button onClick={() => add(email)} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"><UserPlus size={15} /> Thêm</button>
      </div>
      {suggest.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">Từ thành viên Workspace:</span>
          {suggest.map((x) => <button key={x.email} onClick={() => add(x.email, x.name)} className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">+ {x.name || x.email}</button>)}
        </div>
      )}
      {msg && <div className={`mt-2 text-xs font-semibold ${msg.t === "err" ? "text-rose-600" : "text-emerald-600"}`}>{msg.m}</div>}

      <div className="mt-3 space-y-3">
        {rows === null ? <div className="text-sm text-slate-400">Đang tải…</div> : rows.length === 0 ? <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-400">Chưa có tài khoản phụ nào.</div> : rows.map((m) => {
          const p = { ...DEFAULT_MEMBER_PERMS, ...(m.perms || {}) };
          const all = !p.agents?.length;
          const setP = (patch) => save({ ...m, perms: { ...p, ...patch } });
          const toggleAgent = (id) => {
            const cur = all ? OFFICE_AGENTS.map((a) => a.id) : p.agents;
            const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
            setP({ agents: next.length === OFFICE_AGENTS.length ? [] : next.length ? next : cur });
          };
          return (
            <div key={m.email} className={`rounded-2xl border p-3 ${m.active === false ? "border-slate-200 bg-slate-50 opacity-70" : "border-indigo-100"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input defaultValue={m.name || ""} placeholder="Tên hiển thị" onBlur={(e) => e.target.value !== (m.name || "") && save({ ...m, name: e.target.value })} className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold" />
                <span className="text-xs text-slate-500">{m.email}</span>
                <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={m.active !== false} onChange={(e) => save({ ...m, active: e.target.checked })} className="h-4 w-4 accent-indigo-600" /> Đang hoạt động
                </label>
                <button onClick={() => remove(m)} title="Gỡ" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Được giao việc cho {all ? "(tất cả)" : `(${p.agents.length})`}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button onClick={() => setP({ agents: [] })} className={`rounded-full px-2.5 py-1 text-xs font-bold ${all ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>Tất cả</button>
                {OFFICE_AGENTS.map((a) => {
                  const on = all || p.agents.includes(a.id);
                  return <button key={a.id} onClick={() => toggleAgent(a.id)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-400 line-through"}`}>{a.emoji} {a.name}</button>;
                })}
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {MEMBER_FLAGS.map((f) => (
                  <label key={f.k} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={!!p[f.k]} onChange={(e) => setP({ [f.k]: e.target.checked })} className="h-4 w-4 accent-indigo-600" /> {f.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
