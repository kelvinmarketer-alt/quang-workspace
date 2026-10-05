import { useMemo, useRef, useState } from "react";
import { Search, X, Plus, MessageCircle, Trash2, Pencil, Users, CheckSquare, Square, ListPlus, Power, ChevronDown, Repeat, Sparkles, FolderPlus, ImagePlus, Mail, MapPin } from "lucide-react";
import { Card, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { projectMetrics, customerLastIncome, daysSince } from "../lib/selectors.js";
import { ProjectDrawer, ProjectModal } from "./Projects.jsx";
import { AiImportModal } from "../components/AiImport.jsx";
import { imageToDataUrl } from "../lib/ai.js";
import { usePasteImages } from "../lib/paste.js";

const AVA = ["from-indigo-500 to-violet-500", "from-sky-500 to-cyan-500", "from-emerald-500 to-teal-500", "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-fuchsia-500 to-purple-500"];
const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const STATUS = { doing: ["amber", "Đang làm"], done: ["emerald", "Hoàn thành"], paused: ["sky", "Tạm dừng"], cancel: ["rose", "Đã huỷ"] };
const STATUS_ORDER = { doing: 0, paused: 1, done: 2, cancel: 3 };
const TYPES = { fulltime: ["indigo", "Full-time"], remote: ["sky", "Remote"], le: ["slate", "Khách lẻ"] };
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2";
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

function zaloLink(phone, zalo) {
  const n = String(zalo || phone || "").replace(/[^\d]/g, "");
  return n ? `https://zalo.me/${n}` : null;
}

function CustomerModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const logoRef = useRef(null);
  const handleLogo = async (files) => { const file = files && files[0]; if (!file || !file.type?.startsWith("image/")) return; try { const logo = await imageToDataUrl(file, 256, 0.85); setF((p) => ({ ...p, logo })); } catch {} };
  const pickLogo = async (e) => { await handleLogo(e.target.files); e.target.value = ""; };
  usePasteImages(handleLogo);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial.id ? "Sửa khách hàng" : "Thêm khách hàng"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {/* Logo */}
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => logoRef.current?.click()} className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-300">
            {f.logo ? <img src={f.logo} alt="logo" className="h-full w-full object-cover" /> : <ImagePlus size={22} />}
          </button>
          <div className="text-sm">
            <button type="button" onClick={() => logoRef.current?.click()} className="font-bold text-indigo-600">{f.logo ? "Đổi logo" : "Thêm logo"}</button>
            {f.logo && <button type="button" onClick={() => setF({ ...f, logo: "" })} className="ml-3 font-semibold text-rose-500">Xoá</button>}
            <div className="text-[11px] text-slate-400">Ảnh đại diện · có thể <b>dán ảnh (Ctrl/Cmd+V)</b></div>
          </div>
          <input ref={logoRef} type="file" accept="image/*" onChange={pickLogo} className="hidden" />
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên khách hàng *</span><input value={f.name} onChange={set("name")} autoFocus className={inputCls} placeholder="VD: Anh Nam" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số điện thoại</span><input value={f.phone} onChange={set("phone")} inputMode="tel" className={inputCls} placeholder="0901234567" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Email</span><input value={f.email || ""} onChange={set("email")} inputMode="email" className={inputCls} placeholder="email@congty.com" /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Địa chỉ</span><input value={f.address || ""} onChange={set("address")} className={inputCls} placeholder="Số nhà, đường, quận, tỉnh…" /></label>

        <button type="button" onClick={() => setF({ ...f, active: !(f.active ?? true) })} className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${(f.active ?? true) ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-rose-200 bg-rose-50 text-rose-600"}`}>
          <Power size={15} /> {(f.active ?? true) ? "Đang hợp tác (bấm để OFF)" : "Đã OFF (bấm để bật lại)"}
        </button>

        <button onClick={() => { if (f.name.trim()) { onSave({ ...f, name: f.name.trim(), type: f.type || "remote", feeRate: Number(f.feeRate) || 20, monthlySalary: Number(f.monthlySalary) || 0, active: f.active ?? true }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu</button>
      </div>
    </div>
  );
}

function BulkAddModal({ onClose, onSave }) {
  const [text, setText] = useState("");
  const parsed = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/[,\t;|]/).map((x) => x.trim());
    return { name: parts[0] || "", phone: parts[1] || "", zalo: parts[2] || "", note: "" };
  }).filter((c) => c.name);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Thêm khách hàng số lượng lớn</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-slate-400">Mỗi dòng 1 khách, theo định dạng <b>Tên, SĐT, Zalo</b> (SĐT/Zalo tuỳ chọn). Dán từ Excel cũng được.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${inputCls} font-mono text-sm`} placeholder={"Anh Nam, 0901234567\nChị Hoa, 0912345678\nVua Đóng Gói"} autoFocus />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">Sẽ thêm <span className="text-indigo-600">{parsed.length}</span> khách</span>
          <button onClick={() => { if (parsed.length) { onSave(parsed); onClose(); } }} disabled={!parsed.length} className="rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Thêm {parsed.length || ""}</button>
        </div>
      </div>
    </div>
  );
}

// 1 dự án (dòng gọn trong phần xổ của khách)
function ProjectRow({ p, onOpen }) {
  const m = projectMetrics(p);
  const [stone, slabel] = STATUS[p.status] || STATUS.doing;
  const cnt = (p.installments || []).length;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 text-left transition hover:border-indigo-200 hover:bg-indigo-50/30">
      <Badge tone={CAT_TONE[p.category] || "slate"}>{p.category}</Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-slate-700">{p.name}</div>
        <div className="text-[11px] text-slate-400">DT {formatShort(m.revenue)} · LN {formatShort(m.grossProfit)}{m.debt > 0 ? <> · <span className="text-rose-500">nợ {formatShort(m.debt)}</span></> : ""} · <Repeat size={9} className="inline" /> {cnt}</div>
      </div>
      <Badge tone={stone}>{slabel}</Badge>
    </button>
  );
}

export default function Customers() {
  const {
    customerList, projects, addCustomer, addCustomers, updateCustomer, deleteCustomer, deleteCustomers,
    addProject, updateProject, deleteProject, addInstallment, updateInstallment, deleteInstallment, canEdit,
  } = useData();
  const canW = canEdit ? canEdit("customers") : true; // quyền Sửa module Khách & Dự án
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);       // customer add/edit
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [typeF, setTypeF] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [projModal, setProjModal] = useState(null);   // project add/edit
  const [projDrawerId, setProjDrawerId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);

  // Gom dự án theo khách (sort: đang làm trước → hoạt động gần nhất)
  const projByCust = useMemo(() => {
    const lastDate = (p) => (p.installments || []).reduce((mx, i) => (i.date && i.date > mx ? i.date : mx), "");
    const m = new Map();
    for (const p of projects) { if (!m.has(p.customerId)) m.set(p.customerId, []); m.get(p.customerId).push(p); }
    for (const arr of m.values()) arr.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || lastDate(b).localeCompare(lastDate(a)));
    return m;
  }, [projects]);

  const rows = useMemo(() => {
    return customerList.map((c) => {
      const cps = projByCust.get(c.id) || [];
      let debt = 0, revenue = 0;
      for (const p of cps) { const mm = projectMetrics(p); debt += mm.debt; revenue += mm.revenue; }
      const lastIncome = customerLastIncome(projects, c.id);
      return { ...c, type: c.type || "remote", active: c.active ?? true, debt, revenue, projects: cps, projectCount: cps.length, lastIncome };
    }).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q))
      // Mặc định chỉ khách đang hoạt động; OFF chỉ hiện khi chọn bộ lọc "Off"
      .filter((c) => (typeF === "off" ? !c.active : c.active && (typeF === "all" || typeF === c.type)))
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || (b.lastIncome || "").localeCompare(a.lastIncome || "") || b.revenue - a.revenue);
  }, [customerList, projByCust, projects, q, typeF]);

  const counts = useMemo(() => {
    const r = { active: 0, fulltime: 0, remote: 0, le: 0, off: 0 };
    for (const c of customerList) {
      if (!(c.active ?? true)) { r.off++; continue; }
      r.active++; r[c.type || "remote"]++;
    }
    return r;
  }, [customerList]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((c) => picked.has(c.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((c) => c.id)));
  const toggleExp = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const drawerProject = projDrawerId ? projects.find((p) => p.id === projDrawerId) : null;
  const drawerCust = drawerProject ? customerList.find((c) => c.id === drawerProject.customerId) : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        {/* MOBILE: dòng 1 = tiêu đề; dòng 2 = 1 hàng nút gọn; dòng 3 = ô tìm full width. DESKTOP giữ bố cục cũ. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full min-w-0 sm:mr-auto sm:w-auto">
            <div className="text-sm font-bold text-slate-800">{counts.active} khách · {projects.length} dự án</div>
            <div className="truncate text-xs text-slate-400">Bấm vào khách để xổ danh sách dự án</div>
          </div>
          {canW && <button onClick={() => setAiOpen(true)} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100 sm:px-3 sm:text-sm"><Sparkles size={16} /> AI</button>}
          {canW && <button onClick={() => setModal({ name: "", phone: "", email: "", address: "", logo: "", type: "remote", feeRate: 20, monthlySalary: 0, active: true })} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-2.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 sm:px-3.5 sm:text-sm"><Plus size={16} /> Thêm<span className="hidden sm:inline"> khách</span></button>}
          {/* MOBILE: Chọn + Hàng loạt nằm cùng hàng nút */}
          {canW && rows.length > 0 && (
            <button onClick={toggleAll} className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 sm:hidden">
              {allPicked ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />} Chọn
            </button>
          )}
          {canW && <button onClick={() => setBulk(true)} className={`${rows.length > 0 ? "" : "ml-auto "}flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 sm:hidden`}><ListPlus size={16} /> Hàng loạt</button>}
          {!canW && <span className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-600">Chỉ xem</span>}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:min-w-[150px]">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / SĐT…" className="w-full min-w-0 text-sm outline-none" />
          </div>
          {canW && rows.length > 0 && (
            <button onClick={toggleAll} className="hidden items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex">
              {allPicked ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />} Chọn
            </button>
          )}
          {canW && <button onClick={() => setBulk(true)} className="hidden items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex"><ListPlus size={16} /> Hàng loạt</button>}
        </div>
        {/* MOBILE: dropdown lọc */}
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="mt-2.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:hidden">
          {[["all", "Tất cả", counts.active], ["fulltime", "Full-time", counts.fulltime], ["remote", "Remote", counts.remote], ["le", "Khách lẻ", counts.le], ["off", "Off", counts.off]].map(([v, l, n]) => (
            <option key={v} value={v}>{l}{n > 0 ? ` (${n})` : ""}</option>
          ))}
        </select>
        {/* DESKTOP: chips lọc */}
        <div className="mt-3 hidden flex-wrap gap-1 sm:flex">
          {[["all", "Tất cả", counts.active], ["fulltime", "Full-time", counts.fulltime], ["remote", "Remote", counts.remote], ["le", "Khách lẻ", counts.le], ["off", "Off", counts.off]].map(([v, l, n]) => (
            <button key={v} onClick={() => setTypeF(v)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${typeF === v ? (v === "off" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white") : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l} {n > 0 && <span className="opacity-70">{n}</span>}</button>
          ))}
        </div>
        {picked.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 sm:px-4">
            <span className="text-sm font-bold text-indigo-700">Đã chọn {picked.size} khách</span>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-white">Bỏ chọn</button>
              <button onClick={() => { if (confirm(`Xoá ${picked.size} khách đã chọn? Toàn bộ dự án của các khách này cũng bị xoá theo.`)) { deleteCustomers([...picked]); setPicked(new Set()); } }} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"><Trash2 size={14} /> Xoá đã chọn</button>
            </div>
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card><div className="py-12 text-center"><Users size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có khách hàng</div><div className="mt-1 text-xs text-slate-400">Bấm "Thêm khách" hoặc "Hàng loạt" để nhập danh sách.</div></div></Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((c, i) => {
            const isPicked = picked.has(c.id);
            const open = expanded.has(c.id);
            const zl = zaloLink(c.phone, c.zalo);
            return (
              <div key={c.id} className={`card overflow-hidden !p-0 ${isPicked ? "ring-2 ring-indigo-400" : ""} ${!c.active ? "opacity-70" : ""}`}>
                {/* DÒNG KHÁCH */}
                <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-3.5">
                  {canW && (
                    <button onClick={() => toggle(c.id)} className="-m-1.5 shrink-0 p-1.5 text-slate-300 hover:text-indigo-600 sm:m-0 sm:p-0">
                      {isPicked ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                    </button>
                  )}
                  <button onClick={() => toggleExp(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left sm:gap-3">
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                    {c.logo ? (
                      <img src={c.logo} alt="" className={`h-10 w-10 shrink-0 rounded-2xl object-cover ${!c.active ? "grayscale" : ""}`} />
                    ) : (
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${!c.active ? "from-slate-400 to-slate-500" : AVA[i % AVA.length]} text-sm font-extrabold text-white`}>{c.name.slice(0, 2).toUpperCase()}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-extrabold text-slate-800">{c.name}</span>
                        {/* DESKTOP: badge cạnh tên */}
                        <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
                          <Badge tone={(TYPES[c.type] || TYPES.remote)[0]}>{(TYPES[c.type] || TYPES.remote)[1]}</Badge>
                          {!c.active && <Badge tone="rose">OFF</Badge>}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 sm:mt-0">
                        {/* MOBILE: badge xuống dòng 2 để tên đủ chỗ */}
                        <span className="inline-flex shrink-0 items-center gap-1 sm:hidden">
                          <Badge tone={(TYPES[c.type] || TYPES.remote)[0]}>{(TYPES[c.type] || TYPES.remote)[1]}</Badge>
                          {!c.active && <Badge tone="rose">OFF</Badge>}
                        </span>
                        <span className="truncate">{c.projectCount} dự án</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-extrabold text-slate-800">{formatShort(c.revenue)}</div>
                      <div className={`text-[11px] font-bold ${c.debt > 0 ? "text-rose-600" : "text-emerald-500"}`}>{c.debt > 0 ? `nợ ${formatShort(c.debt)}` : "đủ"}</div>
                    </div>
                  </button>
                </div>

                {/* XỔ: dự án của khách */}
                {open && (
                  <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canW && <button onClick={() => setModal(c)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] sm:py-1.5 font-bold text-slate-600 hover:text-indigo-600"><Pencil size={12} /> Sửa khách</button>}
                      {zl && <a href={zl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-[#0068FF]/10 px-2.5 py-2 text-[11px] sm:py-1.5 font-bold text-[#0068FF] hover:bg-[#0068FF]/20"><MessageCircle size={12} /> Zalo</a>}
                      {canW && <button onClick={() => { const nP = c.projectCount; if (confirm(nP ? `Xoá khách "${c.name}" và ${nP} dự án của khách này?` : "Xoá khách hàng này?")) deleteCustomer(c.id); }} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] sm:py-1.5 font-bold text-slate-600 hover:text-rose-600"><Trash2 size={12} /> Xoá</button>}
                      {canW && <button onClick={() => setProjModal({ name: "", customerId: c.id, category: "Web", status: "doing", note: "" })} className="ml-auto flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-[11px] sm:py-1.5 font-bold text-white"><FolderPlus size={13} /> Thêm dự án</button>}
                    </div>
                    {c.projects.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white py-4 text-center text-xs text-slate-400">Chưa có dự án. Bấm "Thêm dự án".</div>
                    ) : (
                      c.projects.map((p) => <ProjectRow key={p.id} p={p} onOpen={() => setProjDrawerId(p.id)} />)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && <CustomerModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateCustomer(modal.id, data) : addCustomer(data))} />}
      {bulk && <BulkAddModal onClose={() => setBulk(false)} onSave={addCustomers} />}
      {aiOpen && <AiImportModal mode="project" onClose={() => setAiOpen(false)} />}
      {projModal && (
        <ProjectModal
          initial={projModal} customers={customerList}
          onClose={() => setProjModal(null)}
          onSave={(data) => (projModal.id ? updateProject(projModal.id, data) : addProject(data))}
        />
      )}
      {drawerProject && (
        <ProjectDrawer
          project={drawerProject}
          custFeeRate={num(drawerCust?.feeRate) || 20}
          custSalary={num(drawerCust?.monthlySalary)}
          onClose={() => setProjDrawerId(null)}
          onEdit={() => { setProjModal(drawerProject); setProjDrawerId(null); }}
          onDelete={() => deleteProject(drawerProject.id)}
          addInstallment={addInstallment} updateInstallment={updateInstallment} deleteInstallment={deleteInstallment}
        />
      )}
    </div>
  );
}
