import { useMemo, useState } from "react";
import { Search, X, Phone, Plus, MessageCircle, Trash2, Pencil, Users, CheckSquare, Square, ListPlus, Briefcase, Power, Clock } from "lucide-react";
import { Card, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { projectMetrics, customerLastIncome, daysSince } from "../lib/selectors.js";

const AVA = ["from-indigo-500 to-violet-500", "from-sky-500 to-cyan-500", "from-emerald-500 to-teal-500", "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-fuchsia-500 to-purple-500"];
const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const TYPES = { fulltime: ["indigo", "Full-time"], remote: ["sky", "Remote"], le: ["slate", "Khách lẻ"] };
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2";

function zaloLink(phone, zalo) {
  const num = String(zalo || phone || "").replace(/[^\d]/g, "");
  return num ? `https://zalo.me/${num}` : null;
}

function CustomerModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial.id ? "Sửa khách hàng" : "Thêm khách hàng"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên khách hàng *</span><input value={f.name} onChange={set("name")} autoFocus className={inputCls} placeholder="VD: Anh Nam" /></label>

        <div className="mb-3">
          <span className="mb-1 block text-sm font-semibold text-slate-600">Kiểu hợp tác</span>
          <div className="flex gap-2">
            {Object.entries(TYPES).map(([v, [, l]]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, type: v })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${(f.type || "remote") === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số điện thoại</span><input value={f.phone} onChange={set("phone")} className={inputCls} placeholder="0901234567" /></label>
          {(f.type || "remote") === "fulltime" ? (
            <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Lương / tháng</span><MoneyInput value={f.monthlySalary} onChange={(v) => setF({ ...f, monthlySalary: v })} className={inputCls} placeholder="15.000.000" /></label>
          ) : (
            <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">% phí ADS</span><input value={f.feeRate ?? 20} onChange={set("feeRate")} inputMode="numeric" className={inputCls} placeholder="20" /></label>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số Zalo (nếu khác SĐT)</span><input value={f.zalo} onChange={set("zalo")} className={inputCls} placeholder="= SĐT" /></label>
          {(f.type || "remote") === "fulltime" && (
            <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">% phí ADS</span><input value={f.feeRate ?? 20} onChange={set("feeRate")} inputMode="numeric" className={inputCls} placeholder="20" /></label>
          )}
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span><textarea value={f.note} onChange={set("note")} rows={2} className={inputCls} /></label>

        <button type="button" onClick={() => setF({ ...f, active: !(f.active ?? true) })} className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${(f.active ?? true) ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-rose-200 bg-rose-50 text-rose-600"}`}>
          <Power size={15} /> {(f.active ?? true) ? "Đang hợp tác (bấm để OFF)" : "Đã OFF (bấm để bật lại)"}
        </button>

        <button onClick={() => { if (f.name.trim()) { onSave({ ...f, feeRate: Number(String(f.feeRate ?? 20).replace(/[^\d]/g, "")) || 20, monthlySalary: Number(String(f.monthlySalary ?? 0).replace(/[^\d]/g, "")) || 0, type: f.type || "remote", active: f.active ?? true }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu</button>
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
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

export default function Customers() {
  const { customerList, projects, addCustomer, addCustomers, updateCustomer, deleteCustomer, deleteCustomers } = useData();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [typeF, setTypeF] = useState("all");

  const rows = useMemo(() => {
    return customerList.map((c) => {
      const cps = projects.filter((p) => p.customerId === c.id);
      let debt = 0, revenue = 0;
      for (const p of cps) { const m = projectMetrics(p); debt += m.debt; revenue += m.revenue; }
      const lastIncome = customerLastIncome(projects, c.id);
      return { ...c, type: c.type || "remote", active: c.active ?? true, debt, revenue, projectCount: cps.length, lastIncome, offDays: daysSince(lastIncome) };
    }).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q))
      .filter((c) => typeF === "all" || (typeF === "off" ? !c.active : typeF === c.type))
      // Đang hợp tác lên đầu, OFF xuống cuối; cùng nhóm thì thu tiền gần đây nhất ("online") lên trên
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || (b.lastIncome || "").localeCompare(a.lastIncome || "") || b.revenue - a.revenue);
  }, [customerList, projects, q, typeF]);

  const counts = useMemo(() => {
    const r = { fulltime: 0, remote: 0, le: 0, off: 0 };
    for (const c of customerList) { if (!(c.active ?? true)) r.off++; r[c.type || "remote"]++; }
    return r;
  }, [customerList]);

  const selCust = sel ? rows.find((c) => c.id === sel) : null;
  const selProjects = sel ? projects.filter((p) => p.customerId === sel) : [];

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((c) => picked.has(c.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((c) => c.id)));

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <div className="mr-auto min-w-0">
            <div className="text-sm font-bold text-slate-800">{customerList.length} khách hàng</div>
            <div className="truncate text-xs text-slate-400">Mỗi khách có thể có nhiều dự án</div>
          </div>
          <button onClick={() => setModal({ name: "", phone: "", zalo: "", note: "", feeRate: 20, type: "remote", monthlySalary: 0, active: true })} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-3.5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30"><Plus size={16} /> Thêm khách</button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[150px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / SĐT…" className="w-full text-sm outline-none" />
          </div>
          {rows.length > 0 && (
            <button onClick={toggleAll} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              {allPicked ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />} Chọn
            </button>
          )}
          <button onClick={() => setBulk(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ListPlus size={16} /> Hàng loạt</button>
        </div>
        {/* MOBILE: dropdown lọc */}
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="mt-2.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:hidden">
          {[["all", "Tất cả", customerList.length], ["fulltime", "Full-time", counts.fulltime], ["remote", "Remote", counts.remote], ["le", "Khách lẻ", counts.le], ["off", "Off", counts.off]].map(([v, l, n]) => (
            <option key={v} value={v}>{l}{n > 0 ? ` (${n})` : ""}</option>
          ))}
        </select>
        {/* DESKTOP: chips lọc */}
        <div className="mt-3 hidden flex-wrap gap-1 sm:flex">
          {[["all", "Tất cả", customerList.length], ["fulltime", "Full-time", counts.fulltime], ["remote", "Remote", counts.remote], ["le", "Khách lẻ", counts.le], ["off", "Off", counts.off]].map(([v, l, n]) => (
            <button key={v} onClick={() => setTypeF(v)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${typeF === v ? (v === "off" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white") : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l} {n > 0 && <span className="opacity-70">{n}</span>}</button>
          ))}
        </div>
        {picked.size > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-2.5">
            <span className="text-sm font-bold text-indigo-700">Đã chọn {picked.size} khách</span>
            <div className="flex gap-2">
              <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-white">Bỏ chọn</button>
              <button onClick={() => { if (confirm(`Xoá ${picked.size} khách đã chọn?`)) { deleteCustomers([...picked]); setPicked(new Set()); } }} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"><Trash2 size={14} /> Xoá đã chọn</button>
            </div>
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card><div className="py-12 text-center"><Users size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có khách hàng</div><div className="mt-1 text-xs text-slate-400">Bấm "Thêm khách" hoặc "Hàng loạt" để nhập danh sách.</div></div></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c, i) => {
            const zl = zaloLink(c.phone, c.zalo);
            const isPicked = picked.has(c.id);
            return (
              <div key={c.id} className={`card fade-up p-5 ${isPicked ? "ring-2 ring-indigo-400" : ""} ${!c.active ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggle(c.id)} className="shrink-0 text-slate-300 hover:text-indigo-600">
                    {isPicked ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                  </button>
                  <button onClick={() => setSel(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${!c.active ? "from-slate-400 to-slate-500" : AVA[i % AVA.length]} text-base font-extrabold text-white`}>{c.name.slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-extrabold text-slate-800">{c.name}</span>
                        <Badge tone={(TYPES[c.type] || TYPES.remote)[0]}>{(TYPES[c.type] || TYPES.remote)[1]}</Badge>
                        {!c.active && <Badge tone="rose">OFF</Badge>}
                      </div>
                      <div className="text-xs text-slate-400">{c.phone || "Chưa có SĐT"} · {c.projectCount} dự án</div>
                    </div>
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-semibold uppercase text-slate-400">{c.type === "fulltime" ? "Lương đã nhận" : "Doanh thu"}</div><div className="text-sm font-extrabold text-slate-800">{formatShort(c.revenue)}</div>{c.type === "fulltime" && c.monthlySalary > 0 && <div className="text-[10px] text-slate-400">CB {formatShort(c.monthlySalary)}/th</div>}</div>
                  <div className={`rounded-xl p-3 ${c.debt > 0 ? "bg-rose-50" : "bg-emerald-50"}`}><div className={`text-[11px] font-semibold uppercase ${c.debt > 0 ? "text-rose-500" : "text-emerald-500"}`}>Đang nợ</div><div className={`text-sm font-extrabold ${c.debt > 0 ? "text-rose-700" : "text-emerald-700"}`}>{c.debt > 0 ? formatShort(c.debt) : "0"}</div></div>
                </div>
                <div className="mt-2 text-[11px]">
                  {!c.active ? (
                    <span className="flex items-center gap-1 font-bold text-rose-600"><Power size={11} /> OFF{c.offDays != null ? ` · ${c.offDays} ngày kể từ lần thu cuối` : ""}</span>
                  ) : c.offDays != null ? (
                    <span className={`flex items-center gap-1 ${c.offDays > 45 ? "font-bold text-amber-600" : "text-slate-400"}`}><Clock size={11} /> {c.offDays === 0 ? "Thu hôm nay" : `${c.offDays} ngày từ lần thu cuối`}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-300"><Clock size={11} /> Chưa thu lần nào</span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  {zl ? (
                    <a href={zl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0068FF]/10 py-2 text-xs font-bold text-[#0068FF] hover:bg-[#0068FF]/20"><MessageCircle size={14} /> Nhắn Zalo</a>
                  ) : (
                    <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-400"><MessageCircle size={14} /> Chưa có SĐT</span>
                  )}
                  <button onClick={() => setModal(c)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-500 hover:text-indigo-600"><Pencil size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer chi tiết */}
      {selCust && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSel(null)} />
          <div className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">{selCust.name}</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setModal(selCust)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={16} /></button>
                <button onClick={() => { if (confirm("Xoá khách hàng này?")) { deleteCustomer(selCust.id); setSel(null); } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
                <button onClick={() => setSel(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Phone size={15} /> {selCust.phone || "Chưa có SĐT"}</div>
            {selCust.note && <div className="mt-1 text-sm text-slate-400">{selCust.note}</div>}
            {zaloLink(selCust.phone, selCust.zalo) && (
              <a href={zaloLink(selCust.phone, selCust.zalo)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#0068FF] py-2.5 text-sm font-bold text-white"><MessageCircle size={16} /> Nhắn tin Zalo</a>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-indigo-50 p-3"><div className="text-[11px] font-bold uppercase text-indigo-400">Doanh thu</div><div className="text-lg font-extrabold text-indigo-700">{formatVND(selCust.revenue)}</div></div>
              <div className={`rounded-xl p-3 ${selCust.debt > 0 ? "bg-rose-50" : "bg-emerald-50"}`}><div className={`text-[11px] font-bold uppercase ${selCust.debt > 0 ? "text-rose-400" : "text-emerald-400"}`}>Đang nợ</div><div className={`text-lg font-extrabold ${selCust.debt > 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatVND(selCust.debt)}</div></div>
            </div>
            <div className="mt-5 text-sm font-bold text-slate-500">Dự án ({selProjects.length})</div>
            {selProjects.length === 0 && <div className="mt-1 text-xs text-slate-400">Chưa có dự án. Thêm ở mục "Dự án / Đơn hàng".</div>}
            <div className="mt-2 space-y-2">
              {selProjects.map((p) => {
                const m = projectMetrics(p);
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><Badge tone={CAT_TONE[p.category] || "slate"}>{p.category}</Badge><span className="truncate text-sm font-semibold text-slate-700">{p.name}</span></div>
                      <div className="mt-1 text-[11px] text-slate-400">DT {formatShort(m.revenue)} · LN {formatShort(m.grossProfit)} · {(p.installments || []).length} đợt</div>
                    </div>
                    <div className="text-right"><div className={`text-sm font-extrabold ${m.debt > 0 ? "text-rose-600" : "text-emerald-600"}`}>{m.debt > 0 ? formatVND(m.debt) : "Đủ"}</div><div className="text-[10px] text-slate-400">{m.debt > 0 ? "còn nợ" : "đã thu"}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {modal && <CustomerModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateCustomer(modal.id, data) : addCustomer(data))} />}
      {bulk && <BulkAddModal onClose={() => setBulk(false)} onSave={addCustomers} />}
    </div>
  );
}
