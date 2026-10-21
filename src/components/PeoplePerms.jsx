// HỒ SƠ QUYỀN TẬP TRUNG (21/10/2026) — mỗi người 1 hồ sơ, 3 phần rõ ràng:
//   A. Module được dùng trong app (Không / Xem / Sửa; Đầu tư Coin chọn từng tab)
//   B. Phạm vi dự án: Tất cả, hoặc chỉ các khách / thương hiệu được giao → áp cho Khách & Dự án, Tài nguyên, Quảng cáo, Website, Fanpage, Văn phòng AI
//   C. Vai trò ở Văn phòng AI (chọn đúng 1): Không dùng · Nhân viên dự án · Dùng vị trí AI · Điều hành toàn văn phòng
// A + B lưu trong dữ liệu workspace (members[]); C ghi bảng office_members / office_staff của Văn phòng AI (máy chủ chặn theo vai trò + thương hiệu).
import { useEffect, useMemo, useState } from "react";
import { Users2, UserPlus, Trash2, ShieldCheck, Building2, FolderKanban, LayoutGrid, Loader2, ChevronDown } from "lucide-react";
import { Card, SectionTitle } from "./ui.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import { ask } from "./ConfirmDialog.jsx";
import { FEATURES, FEATURE_HINT, COIN_SUBS, memberAccess, memberScope, SCOPE_BLOCKED, normBrand } from "../lib/permissions.js";
import { OFFICE_AGENTS, OFFICE_URL, STAFF_FLAGS, loadOfficeMembers, saveOfficeMember, deleteOfficeMember, loadOfficeStaff, saveOfficeStaff, deleteOfficeStaff, loadOfficeBrandsLite } from "../lib/office.js";

const OPTS = [["none", "Không", "bg-slate-200 text-slate-600"], ["view", "Xem", "bg-sky-500 text-white"], ["edit", "Sửa", "bg-emerald-500 text-white"]];
const accBadge = (v) => (v === "edit" ? "bg-emerald-500 text-white" : v === "view" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-400");
export const allAccess = (val) => ({ ...Object.fromEntries(FEATURES.map(([k]) => [k, val])), ...Object.fromEntries(COIN_SUBS.map(([k, , , opts]) => [k, opts.includes(val) ? val : val === "none" ? "none" : "view"])) });
const ROLES = [
  ["none", "Không dùng", "Không vào được Văn phòng AI"],
  ["staff", "Nhân viên dự án", "Chỉ checklist, kế hoạch, chỉ tiêu của dự án trong phạm vi (phần B). Không giao việc cho AI, không thấy chi phí"],
  ["agents", "Dùng vị trí AI", "Chỉ giao việc cho các vị trí AI được chọn, chỉ trong dự án ở phần B, chỉ thấy việc mình giao"],
  ["lead", "Điều hành toàn văn phòng", "Ra lệnh cho Trưởng phòng điều phối cả văn phòng, giao mọi vị trí, duyệt đề xuất, thấy mọi việc (mọi dự án)"],
];
const TP = "00-truong-phong";
const AI_AGENTS = OFFICE_AGENTS.filter((a) => a.id !== TP);
const roleOf = (om, os) => (om ? om.perms?.role || (om.perms?.see_all && om.perms?.approve ? "lead" : "agents") : os ? "staff" : "none");
const Seg = ({ value, opts, onChange }) => (
  <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
    {opts.map(([v, t, on]) => <button key={v} type="button" onClick={() => onChange(v)} className={`min-w-[44px] rounded-md px-2 py-1.5 text-[11px] font-bold ${value === v ? on : "text-slate-400"}`}>{t}</button>)}
  </div>
);

// A. Module được dùng
export function AccessGrid({ access, onSet, scoped }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
      {FEATURES.map(([k, l]) => k === "coin" ? (
        <div key={k} className="px-3 py-2">
          <div className="text-[13px] font-bold text-slate-700">{l}</div>
          <div className="text-[11px] leading-snug text-slate-400">Chọn riêng từng tab · tab Tổng quan Coin và mọi nút điều khiển bot chỉ chủ dùng</div>
          <div className="mt-1.5 space-y-1 border-l-2 border-amber-200 pl-2.5">
            {COIN_SUBS.map(([sk, sl, sh, allow]) => (
              <div key={sk} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-bold text-slate-700">{sl}</div><div className="text-[10.5px] leading-snug text-slate-400">{sh}</div></div>
                <Seg value={access[sk] || "none"} opts={OPTS.filter(([v]) => allow.includes(v))} onChange={(v) => onSet(sk, v)} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div key={k} className={`flex items-center gap-2 px-3 py-2 ${scoped && SCOPE_BLOCKED.includes(k) ? "opacity-50" : ""}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-slate-700">{l}</div>
            <div className="text-[11px] leading-snug text-slate-400">{scoped && SCOPE_BLOCKED.includes(k) ? "Không cấp được khi đã giới hạn phạm vi dự án (sổ thu chi toàn công ty)" : FEATURE_HINT[k]}</div>
          </div>
          {scoped && SCOPE_BLOCKED.includes(k) ? <span className="text-[11px] font-bold text-slate-400">Không</span> : <Seg value={access[k] || "none"} opts={OPTS} onChange={(v) => onSet(k, v)} />}
        </div>
      ))}
    </div>
  );
}

// Khớp khách QWS ↔ thương hiệu Văn phòng AI theo tên (không phân biệt hoa thường / dấu; cho phép tên này chứa tên kia)
function mapBrands(customers, officeBrands) {
  const ids = [], miss = [];
  for (const c of customers) {
    const k = normBrand(c.name);
    const b = officeBrands.find((x) => x.qws_customer_id && x.qws_customer_id === c.id) || officeBrands.find((x) => normBrand(x.name) === k) || officeBrands.find((x) => { const n = normBrand(x.name); return n && k && (n.includes(k) || k.includes(n)); });
    if (b) { if (!ids.includes(b.id)) ids.push(b.id); } else miss.push(c.name);
  }
  return { ids, miss };
}

function PersonCard({ p, customers, office, ownerId, onOfficeSaved, onRemove }) {
  const { addMember, updateMember } = useData();
  const [open, setOpen] = useState(false);
  const q = p.q || { email: p.email, name: p.name, access: allAccess("none"), scope: { all: true } };
  const access = memberAccess(q);
  const scope = memberScope(q); // null = tất cả
  const ensureQ = (patch) => (p.q ? updateMember(p.email, patch) : addMember({ email: p.email, name: p.name || "", access: allAccess("none"), ...patch }));
  const setAccess = (k, v) => ensureQ({ access: { ...access, [k]: v } });
  const setScope = (sc) => ensureQ({ scope: sc });
  const scopeCusts = scope ? customers.filter((c) => scope.includes(c.id)) : customers;

  // C. Văn phòng AI — nháp (bấm Lưu mới ghi 2 bảng)
  const initRole = roleOf(p.om, p.os);
  const [role, setRole] = useState(initRole);
  const [agents, setAgents] = useState(() => (p.om?.perms?.agents?.length ? p.om.perms.agents.filter((a) => a !== TP) : AI_AGENTS.map((a) => a.id)));
  const [flags, setFlags] = useState(() => ({ chat: p.om?.perms?.chat !== false, view_costs: !!p.om?.perms?.view_costs }));
  const [sflags, setSflags] = useState(() => Object.fromEntries(STAFF_FLAGS.map((f) => [f.k, p.os?.perms?.[f.k] ?? f.def])));
  const [staffView, setStaffView] = useState(() => !!(p.os && !p.os.brands?.length && p.os.view_brands?.length));
  const [title, setTitle] = useState(p.os?.title || "");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  useEffect(() => { setRole(roleOf(p.om, p.os)); }, [p.om, p.os]);
  const mapped = useMemo(() => (scope ? mapBrands(scopeCusts, office.brands) : { ids: office.brands.map((b) => b.id), miss: [] }), [scope, scopeCusts, office.brands]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOffice = async () => {
    setBusy(true); setMsg(null);
    try {
      const name = q.name || p.name || p.email;
      if (role === "none") {
        if (p.om) await deleteOfficeMember(ownerId, p.om.email);
        if (p.os) await deleteOfficeStaff(ownerId, p.os.email);
      } else if (role === "staff") {
        if (p.om) await deleteOfficeMember(ownerId, p.om.email);
        if (!mapped.ids.length) throw new Error("Phạm vi chưa khớp thương hiệu nào bên Văn phòng AI — kiểm tra tên khách / thương hiệu");
        await saveOfficeStaff(ownerId, { email: p.email, name, title, brands: staffView ? [] : mapped.ids, view_brands: staffView ? mapped.ids : [], perms: sflags, active: true });
      } else {
        if (p.os) await deleteOfficeStaff(ownerId, p.os.email);
        const lead = role === "lead";
        await saveOfficeMember(ownerId, { email: p.email, name, active: true, perms: lead
          ? { role: "lead", agents: [], approve: true, see_all: true, chat: true, view_costs: flags.view_costs, brands: [] }
          : { role: "agents", agents: agents.length ? agents : [AI_AGENTS[0].id], approve: false, see_all: false, chat: flags.chat, view_costs: flags.view_costs, brands: scope ? mapped.ids : [] } });
      }
      setMsg({ ok: true, t: "✓ Đã lưu quyền Văn phòng AI" });
      onOfficeSaved();
    } catch (e) { setMsg({ ok: false, t: e.message || String(e) }); }
    setBusy(false);
  };

  const roleL = ROLES.find((r) => r[0] === initRole)?.[1];
  return (
    <div className="rounded-xl border border-slate-100">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 p-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-800">{q.name || p.name || p.email}</div>
          <div className="truncate text-[11px] text-slate-400">{p.email}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {FEATURES.filter(([k]) => k !== "coin" && access[k] !== "none" && !(scope && SCOPE_BLOCKED.includes(k))).map(([k, l]) => <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${accBadge(access[k])}`}>{l}{access[k] === "edit" ? " ✎" : ""}</span>)}
            {COIN_SUBS.filter(([k]) => access[k] !== "none").map(([k, l]) => <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${accBadge(access[k])}`}>Coin · {l.split(" — ")[0]}</span>)}
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700">{scope ? `Dự án: ${scopeCusts.map((c) => c.name).join(", ") || "chưa chọn"}` : "Mọi dự án"}</span>
            {initRole !== "none" && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">VP AI: {roleL}</span>}
          </div>
        </div>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input defaultValue={q.name || p.name || ""} placeholder="Tên hiển thị" onBlur={(e) => e.target.value !== (q.name || "") && ensureQ({ name: e.target.value.trim() })} className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold" />
            <button onClick={() => onRemove(p)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={14} /> Gỡ toàn bộ quyền</button>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"><LayoutGrid size={13} /> A · Module được dùng trong app</div>
            <AccessGrid access={access} onSet={setAccess} scoped={!!scope} />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"><FolderKanban size={13} /> B · Phạm vi dự án</div>
            <div className="rounded-xl border border-slate-100 p-2.5">
              <Seg value={scope ? "pick" : "all"} opts={[["all", "Tất cả dự án", "bg-indigo-600 text-white"], ["pick", "Chỉ dự án được chọn", "bg-amber-500 text-white"]]} onChange={(v) => setScope(v === "all" ? { all: true } : { all: false, customers: scope || [] })} />
              {scope && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customers.map((c) => { const on = scope.includes(c.id); return <button key={c.id} type="button" onClick={() => setScope({ all: false, customers: on ? scope.filter((x) => x !== c.id) : [...scope, c.id] })} className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${on ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}>{c.name}</button>; })}
                </div>
              )}
              <div className="mt-1.5 text-[11px] leading-snug text-slate-400">{scope ? "Chỉ thấy các khách trên (và dự án, tài nguyên, quảng cáo, web, fanpage, việc Văn phòng AI của họ). Không cấp được Kế toán." : "Thấy mọi khách / dự án trong các module được cấp."}</div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"><Building2 size={13} /> C · Vai trò ở Văn phòng AI</div>
            {office.err ? <div className="rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-700">Chưa đọc được Văn phòng AI: {office.err}</div> : (
              <div className="space-y-2 rounded-xl border border-slate-100 p-2.5">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ROLES.map(([k, l, h]) => (
                    <label key={k} className={`flex cursor-pointer gap-2 rounded-lg border p-2 ${role === k ? "border-violet-300 bg-violet-50/60" : "border-slate-100"}`}>
                      <input type="radio" name={`role-${p.email}`} checked={role === k} onChange={() => setRole(k)} className="mt-0.5 accent-violet-600" />
                      <span><span className="block text-[12.5px] font-bold text-slate-800">{l}</span><span className="block text-[11px] leading-snug text-slate-500">{h}</span></span>
                    </label>
                  ))}
                </div>
                {role === "agents" && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-500">Được giao việc cho các vị trí ({agents.length}/{AI_AGENTS.length}) · <span className="font-normal">Trưởng phòng chỉ dành cho vai trò Điều hành</span></div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {AI_AGENTS.map((a) => { const on = agents.includes(a.id); return <button key={a.id} type="button" onClick={() => setAgents(on ? agents.filter((x) => x !== a.id) : [...agents, a.id])} className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400 line-through"}`}>{a.emoji} {a.name}</button>; })}
                    </div>
                  </div>
                )}
                {(role === "agents" || role === "lead") && (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {role === "agents" && <label className="flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" checked={flags.chat} onChange={(e) => setFlags({ ...flags, chat: e.target.checked })} className="accent-violet-600" /> Nhắn tin riêng với vị trí AI được giao</label>}
                    <label className="flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" checked={flags.view_costs} onChange={(e) => setFlags({ ...flags, view_costs: e.target.checked })} className="accent-violet-600" /> Xem trang Hiệu suất & chi phí</label>
                  </div>
                )}
                {role === "staff" && (
                  <div className="space-y-1.5">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chức danh (vd Content, Ads…)" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm sm:w-64" />
                    <label className="flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" checked={staffView} onChange={(e) => setStaffView(e.target.checked)} className="accent-violet-600" /> Chỉ XEM dự án (không tick / ghi việc)</label>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {STAFF_FLAGS.map((f) => <label key={f.k} className="flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" checked={!!sflags[f.k]} onChange={(e) => setSflags({ ...sflags, [f.k]: e.target.checked })} className="accent-violet-600" /> {f.label}</label>)}
                    </div>
                  </div>
                )}
                {(role === "staff" || role === "agents") && (
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                    Dự án bên Văn phòng AI (theo phần B): {scope ? (mapped.ids.length ? office.brands.filter((b) => mapped.ids.includes(b.id)).map((b) => b.name).join(", ") : "chưa khớp thương hiệu nào") : role === "staff" ? "mọi thương hiệu" : "mọi thương hiệu"}
                    {mapped.miss.length > 0 && <span className="text-amber-600"> · chưa có bên Văn phòng AI: {mapped.miss.join(", ")}</span>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={busy} onClick={saveOffice} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Lưu vai trò Văn phòng AI</button>
                  {role !== initRole && <span className="text-[11px] font-bold text-amber-600">Chưa lưu</span>}
                  {msg && <span className={`text-[11.5px] font-bold ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.t}</span>}
                  {role !== "none" && <span className="text-[11px] text-slate-400">Người này vào {OFFICE_URL.replace("https://", "")} bằng chính email trên.</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PeoplePerms() {
  const { members = [], customerList = [], addMember, removeMember } = useData();
  const { user } = useAuth();
  const ownerId = user?.id;
  const [office, setOffice] = useState({ members: [], staff: [], brands: [], err: "", ready: false });
  const [tick, setTick] = useState(0);
  const [email, setEmail] = useState(""), [name, setName] = useState("");
  useEffect(() => {
    let on = true;
    Promise.all([loadOfficeMembers(), loadOfficeStaff(), loadOfficeBrandsLite()])
      .then(([m, s, b]) => on && setOffice({ members: m, staff: s, brands: b, err: "", ready: true }))
      .catch((e) => on && setOffice((o) => ({ ...o, err: e.message || String(e), ready: true })));
    return () => { on = false; };
  }, [tick]);
  const customers = useMemo(() => [...customerList].sort((a, b) => (b.active !== false) - (a.active !== false) || String(a.name).localeCompare(String(b.name), "vi")), [customerList]);
  // Danh sách người = hợp của thành viên app + tài khoản phụ Văn phòng AI + nhân viên dự án
  const people = useMemo(() => {
    const map = new Map();
    const get = (e) => { const k = String(e || "").trim().toLowerCase(); if (!k) return null; if (!map.has(k)) map.set(k, { email: k, name: "", q: null, om: null, os: null }); return map.get(k); };
    for (const m of members) { const x = get(m.email); if (x) { x.q = m; x.name ||= m.name; } }
    for (const m of office.members) { const x = get(m.email); if (x) { x.om = m; x.name ||= m.name; } }
    for (const s of office.staff) { const x = get(s.email); if (x) { x.os = s; x.name ||= s.name; } }
    return [...map.values()];
  }, [members, office.members, office.staff]);

  const add = () => {
    const e = email.trim().toLowerCase(); if (!e) return;
    if (!people.some((x) => x.email === e)) addMember({ email: e, name: name.trim(), access: allAccess("none"), scope: { all: true } });
    setEmail(""); setName("");
  };
  const remove = async (p) => {
    if (!(await ask(`Gỡ TOÀN BỘ quyền của ${p.email}?\nGỡ khỏi app và khỏi Văn phòng AI (tài khoản phụ / nhân viên dự án). Tài khoản đăng nhập vẫn còn nhưng không thấy dữ liệu gì.`, { ok: "Gỡ hết quyền", danger: true }))) return;
    try {
      if (p.om) await deleteOfficeMember(ownerId, p.om.email);
      if (p.os) await deleteOfficeStaff(ownerId, p.os.email);
    } catch { /* bảng Văn phòng AI lỗi → vẫn gỡ quyền app */ }
    if (p.q) removeMember(p.email);
    setTick((t) => t + 1);
  };

  return (
    <Card>
      <SectionTitle action={<Users2 size={18} className="text-indigo-500" />}>Người dùng & phân quyền</SectionTitle>
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <span>Mỗi người <b>1 hồ sơ quyền</b>: <b>A</b> module được dùng · <b>B</b> phạm vi dự án (tất cả / chỉ khách được giao) · <b>C</b> vai trò ở Văn phòng AI. <b>Chỉ chủ</b>: Tài khoản &amp; Thẻ, kết nối/token, sao lưu, quản lý người dùng, điều khiển bot. Người được thêm tự <b>đăng ký đúng email</b> rồi đăng nhập.</span>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Email người mới *" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên (tuỳ chọn)" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-48" />
        <button onClick={add} disabled={!email.trim()} className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><UserPlus size={15} /> Thêm</button>
      </div>
      <div className="mt-1 text-[11px] text-slate-400">Người mới chưa có quyền gì — bấm vào tên để cấp từng phần.</div>
      <div className="mt-3 space-y-2">
        {!office.ready && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải quyền Văn phòng AI…</div>}
        {office.ready && people.length === 0 && <div className="py-4 text-center text-xs text-slate-400">Chưa có ai. Chỉ mình bạn dùng app.</div>}
        {people.map((p) => <PersonCard key={p.email} p={p} customers={customers} office={office} ownerId={ownerId} onOfficeSaved={() => setTick((t) => t + 1)} onRemove={remove} />)}
      </div>
    </Card>
  );
}
