import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  Plus, X, Trash2, Pencil, Search, TrendingUp, Wallet, Gift, Receipt, Check, Repeat, CalendarClock, ArrowRight, Sparkles, Copy,
} from "lucide-react";
import { Card, StatCard, SectionTitle, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import Combobox from "../components/Combobox.jsx";
import { AiImportModal } from "../components/AiImport.jsx";
import { useData } from "../lib/store.jsx";
import { PROJECT_CATEGORIES } from "../data/seed.js";
import { projectMetrics, installmentMetrics, projectsMonthly, projectYears } from "../lib/selectors.js";
import { todayISO, fmtDateVI, MONTHS_VI } from "../lib/format.js";

const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const STATUS = { doing: ["amber", "Đang làm"], done: ["emerald", "Hoàn thành"], paused: ["sky", "Tạm dừng"], cancel: ["rose", "Đã huỷ"] };
const STATUS_ORDER = { doing: 0, paused: 1, done: 2, cancel: 3 }; // Đang làm lên đầu, Đã huỷ xuống cuối
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function blankInst(feeRate = 20) {
  return { label: "", date: todayISO(), amount: "", feeRate: String(feeRate), serviceFee: "", spend: "", refund: "", carry: "", ctv: "", costs: [], collected: "", note: "" };
}
const monthLabel = (iso) => { const [y, m] = (iso || "").split("-"); return m ? `Th${Number(m)}/${y}` : "Lương"; };
// + 1 tháng (cùng ngày) cho nhân bản đợt định kỳ
const addMonthISO = (iso) => { const d = iso ? new Date(iso) : new Date(); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// đợt (số) -> form (chuỗi) để nạp vào InstallmentFields
const instToForm = (x) => ({ ...x, amount: String(x.amount || ""), feeRate: String(x.feeRate || 20), serviceFee: String(x.serviceFee || ""), spend: String(x.spend || ""), refund: String(x.refund || ""), carry: String(x.carry || ""), ctv: String(x.ctv || ""), otherCost: String(x.otherCost || ""), collected: String(x.collected || "") });
function instFromForm(f, isAds, isSalary) {
  if (isSalary) {
    // Lương: 1 đợt = lương thực nhận tháng đó, mặc định đã nhận đủ.
    const amount = num(f.amount);
    const collected = f.collected === "" || f.collected == null ? amount : num(f.collected);
    return {
      // Lương: tên luôn theo tháng của ngày thu (không giữ label cũ khi nhân bản/đổi ngày)
      label: monthLabel(f.date), date: f.date || todayISO(),
      amount, feeRate: 0, serviceFee: 0, spend: 0, refund: 0, carry: 0, ctv: 0, costs: [], collected, note: (f.note || "").trim(),
    };
  }
  const costs = (f.costs || [])
    .filter((c) => num(c.amount) > 0 || (c.label || "").trim())
    .map((c) => ({ label: (c.label || "").trim() || "Chi phí", amount: num(c.amount) }));
  return {
    label: (f.label || "").trim() || "Đợt", date: f.date || todayISO(),
    amount: num(f.amount), feeRate: num(f.feeRate) || 20, serviceFee: isAds ? num(f.serviceFee) : 0, spend: isAds ? num(f.spend) : 0,
    refund: isAds ? num(f.refund) : 0, carry: isAds ? num(f.carry) : 0, ctv: num(f.ctv), costs, collected: num(f.collected),
    ...(f.carried ? { carried: true } : {}),
  };
}

/** Các ô nhập của 1 đợt + preview */
function InstallmentFields({ f, setF, isAds, isSalary, salaryBase = 0 }) {
  if (isSalary) {
    const amt = num(f.amount);
    // nhập lương → coi như đã nhận đủ (collected = amount)
    const setAmt = (v) => setF((p) => ({ ...p, amount: v, collected: v }));
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-violet-50/70 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tháng (ngày nhận)"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} /></Field>
            <Field label="Lương thực nhận" hint={salaryBase > 0 ? `Mặc định ${formatVND(salaryBase)}` : "Sửa nếu tháng này khác"}><MoneyInput value={f.amount} onChange={setAmt} className={inputCls} placeholder="15.000.000" /></Field>
          </div>
          {salaryBase > 0 && amt > 0 && amt !== salaryBase && (
            <div className={`mt-1.5 text-[11px] font-bold ${amt > salaryBase ? "text-emerald-600" : "text-rose-600"}`}>{amt > salaryBase ? `Cao hơn mặc định ${formatVND(amt - salaryBase)}` : `Thấp hơn mặc định ${formatVND(salaryBase - amt)}`}</div>
          )}
        </div>
        <Field label="Ghi chú (lý do tăng/giảm)"><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} placeholder="VD: trừ 2 ngày nghỉ, thưởng quý…" /></Field>
      </div>
    );
  }
  const rate = () => num(f.feeRate) || 20;
  // phí chạy đã bị sửa tay chưa (để ngừng tự tính theo %)
  const [feeTouched, setFeeTouched] = useState(() => num(f.serviceFee) > 0 && num(f.serviceFee) !== Math.round(num(f.amount) * rate() / 100));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setV = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const onAmount = (v) => {
    setF((p) => ({ ...p, amount: v, serviceFee: isAds && !feeTouched ? String(Math.round(num(v) * (num(p.feeRate) || 20) / 100)) : p.serviceFee }));
  };
  const onRate = (e) => {
    const r = num(e.target.value);
    setFeeTouched(false);
    setF((p) => ({ ...p, feeRate: e.target.value, serviceFee: String(Math.round(num(p.amount) * r / 100)) }));
  };
  const onServiceFee = (v) => {
    setFeeTouched(true);
    setF((p) => ({ ...p, serviceFee: v, feeRate: num(p.amount) ? String(Math.round((num(v) / num(p.amount)) * 100)) : p.feeRate }));
  };
  // chi phí phát sinh (danh sách)
  const costs = f.costs || [];
  const addCost = () => setF((p) => ({ ...p, costs: [...(p.costs || []), { label: "", amount: "" }] }));
  const setCost = (i, k, val) => setF((p) => ({ ...p, costs: (p.costs || []).map((c, j) => (j === i ? { ...c, [k]: val } : c)) }));
  const delCost = (i) => setF((p) => ({ ...p, costs: (p.costs || []).filter((_, j) => j !== i) }));
  // nút cọc nhanh
  const setDeposit = (pct) => setV("collected")(pct === null ? String(num(f.amount)) : String(Math.round(num(f.amount) * pct / 100)));
  const m = installmentMetrics(instFromForm(f, isAds), isAds);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên đợt"><input value={f.label} onChange={set("label")} className={inputCls} placeholder={isAds ? "VD: Tháng 6 / Tuần 1" : "VD: Cọc 50%"} /></Field>
        <Field label="Ngày thu"><input type="date" value={f.date} onChange={set("date")} className={inputCls} /></Field>
      </div>
      {isAds ? (
        <div className="rounded-xl bg-rose-50/60 p-3">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <Field label="Số tiền nhận"><MoneyInput value={f.amount} onChange={onAmount} className={inputCls} placeholder="10.000.000" /></Field>
            <Field label="% phí"><input value={f.feeRate} onChange={onRate} inputMode="numeric" className={inputCls} placeholder="20" /></Field>
            <Field label="Phí chạy"><MoneyInput value={f.serviceFee} onChange={onServiceFee} className={inputCls} placeholder="2.000.000" /></Field>
            <Field label="Tiền chạy"><MoneyInput value={f.spend} onChange={setV("spend")} className={inputCls} placeholder="4.000.000" /></Field>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">Chiết khấu nền tảng = Số tiền nhận − Phí chạy − Tiền chạy thực tế = <b className="text-sky-600">{formatVND(installmentMetrics(instFromForm(f, true), true).platformDiscount)}</b></div>
        </div>
      ) : (
        <Field label="Số tiền (phí đợt)"><MoneyInput value={f.amount} onChange={onAmount} className={inputCls} placeholder="10.000.000" /></Field>
      )}

      <Field label="Hoa hồng CTV"><MoneyInput value={f.ctv} onChange={setV("ctv")} className={inputCls} placeholder="0" /></Field>

      {/* Chi phí phát sinh dạng danh sách */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">Chi phí phát sinh</span>
          <button type="button" onClick={addCost} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"><Plus size={13} /> Thêm khoản</button>
        </div>
        {costs.length === 0 && <div className="text-[11px] text-slate-400">VD: mua hộ hosting, tên miền, ảnh stock… (trừ vào lợi nhuận).</div>}
        <div className="space-y-2">
          {costs.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={c.label} onChange={(e) => setCost(i, "label", e.target.value)} placeholder="Tên khoản (hosting…)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <MoneyInput value={c.amount} onChange={(v) => setCost(i, "amount", v)} placeholder="0" className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button type="button" onClick={() => delCost(i)} className="rounded-lg p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      {isAds && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hoàn khách (khi dừng)" hint="Trả lại tiền cho khách"><MoneyInput value={f.refund} onChange={setV("refund")} className={inputCls} placeholder="0" /></Field>
          <Field label="Chuyển đợt sau" hint="Giữ tiền khách, chạy tiếp kỳ sau"><MoneyInput value={f.carry} onChange={setV("carry")} className={inputCls} placeholder="0" /></Field>
        </div>
      )}

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-600">Đã thu đợt này</span>
          <div className="flex flex-wrap gap-1">
            {isAds && (
              <button type="button" onClick={() => setV("collected")(String(Math.max(0, num(f.amount) - num(f.serviceFee))))} className="rounded-lg bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-200">Thu tiền chạy (nợ phí)</button>
            )}
            {[["Cọc 30%", 30], ["Cọc 50%", 50], ["Thu đủ", null], ["Chưa thu", 0]].map(([l, p]) => (
              <button key={l} type="button" onClick={() => setDeposit(p)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-indigo-100 hover:text-indigo-600">{l}</button>
            ))}
          </div>
        </div>
        <MoneyInput value={f.collected} onChange={setV("collected")} className={inputCls} placeholder="0" />
        <div className="mt-0.5 text-[11px] text-slate-400">0 = chưa thu → tính công nợ</div>
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-center">
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Doanh thu</div><div className="text-sm font-extrabold text-indigo-600">{formatShort(m.revenue)}</div></div>
        {isAds && <div><div className="text-[10px] font-bold uppercase text-slate-400">Chiết khấu</div><div className="text-sm font-extrabold text-sky-600">{formatShort(m.platformDiscount)}</div></div>}
        <div><div className="text-[10px] font-bold uppercase text-slate-400">LN gộp</div><div className="text-sm font-extrabold text-emerald-600">{formatShort(m.grossProfit)}</div></div>
        <div><div className="text-[10px] font-bold uppercase text-slate-400">Còn nợ</div><div className="text-sm font-extrabold text-rose-600">{formatShort(m.debt)}</div></div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProjectModal({ initial, customers, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const [inst, setInst] = useState(blankInst());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cust = customers.find((c) => c.id === f.customerId);
  const isAds = f.category === "ADS";
  const isSalary = f.category === "Lương";
  const salaryBase = num(cust?.monthlySalary);
  const editing = !!initial.id;

  // Chọn khách (khi TẠO MỚI) → nếu full-time: gợi ý sang "Lương" + điền sẵn lương.
  // Nhưng vẫn ĐỔI ĐƯỢC danh mục nếu đây là job ngoài của chính khách đó.
  useEffect(() => {
    if (editing) return;
    const c = customers.find((x) => x.id === f.customerId);
    if (!c) return;
    if (c.type === "fulltime") {
      setF((p) => ({ ...p, category: "Lương", name: p.name.trim() ? p.name : `Lương ${c.name}` }));
      const sal = num(c.monthlySalary);
      if (sal) setInst((p) => ({ ...p, amount: String(sal), collected: String(sal) }));
    } else {
      const r = num(c.feeRate) || 20;
      setInst((p) => ({ ...p, feeRate: String(r), serviceFee: num(p.amount) ? String(Math.round(num(p.amount) * r / 100)) : p.serviceFee }));
    }
  }, [f.customerId]);

  // Đổi Danh mục: chuyển mượt giữa "Lương" (full-time) và job thường — reset đợt cho đúng bộ field.
  const onCategory = (e) => {
    const cat = e.target.value;
    const wasSalary = f.category === "Lương";
    const nowSalary = cat === "Lương";
    const autoName = cust ? `Lương ${cust.name}` : "";
    setF((p) => {
      let name = p.name;
      if (nowSalary && !name.trim()) name = autoName;
      else if (!nowSalary && name.trim() === autoName) name = ""; // rời lương → bỏ tên "Lương X" auto
      return { ...p, category: cat, name };
    });
    if (wasSalary !== nowSalary) {
      if (nowSalary) {
        const sal = num(cust?.monthlySalary);
        setInst({ ...blankInst(), amount: sal ? String(sal) : "", collected: sal ? String(sal) : "" });
      } else {
        setInst(blankInst(num(cust?.feeRate) || 20));
      }
    }
  };

  return (
    <Modal wide title={editing ? "Sửa dự án" : "Thêm dự án"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tên dự án *"><input value={f.name} onChange={set("name")} autoFocus className={inputCls} placeholder="VD: Chạy ADS shop thời trang" /></Field>
        <Field label="Khách hàng *">
          <Combobox
            options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
            value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })}
            placeholder="Tìm & chọn khách…" emptyText="Chưa có khách — thêm ở mục Khách hàng"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Danh mục" hint={cust?.type === "fulltime" ? '"Lương" = lương tháng · đổi danh mục nếu là job ngoài' : undefined}>
            <select value={f.category} onChange={onCategory} className={inputCls}>
              {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select value={f.status} onChange={set("status")} className={inputCls}>
              <option value="doing">Đang làm</option><option value="done">Hoàn thành</option>
              <option value="paused">Tạm dừng</option><option value="cancel">Đã huỷ</option>
            </select>
          </Field>
        </div>
        <Field label="Ghi chú"><input value={f.note} onChange={set("note")} className={inputCls} /></Field>

        {!editing && (
          <div className="rounded-xl border border-slate-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarClock size={14} /> {isSalary ? "Lương tháng đầu (tuỳ chọn)" : "Đợt đầu tiên (tuỳ chọn)"}</div>
            <InstallmentFields f={inst} setF={setInst} isAds={isAds} isSalary={isSalary} salaryBase={salaryBase} />
          </div>
        )}
      </div>

      <button
        onClick={() => {
          if (!f.name.trim() || !f.customerId) return;
          const base = { name: f.name.trim(), customerId: f.customerId, customerName: cust?.name || "", category: f.category, status: f.status, note: f.note };
          if (editing) onSave(base);
          else {
            const firstAmt = num(inst.amount);
            onSave({ ...base, installments: firstAmt ? [{ id: "i" + Math.random().toString(36).slice(2, 7), ...instFromForm(inst, isAds, isSalary) }] : [] });
          }
          onClose();
        }}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
        {editing ? "Lưu" : "Tạo dự án"}
      </button>
    </Modal>
  );
}

function InstModal({ isAds, isSalary, salaryBase = 0, initial, dup = false, defaultFeeRate = 20, onClose, onSave }) {
  const [f, setF] = useState(initial || (isSalary ? { ...blankInst(), amount: salaryBase ? String(salaryBase) : "", collected: salaryBase ? String(salaryBase) : "" } : blankInst(defaultFeeRate)));
  const title = dup ? (isSalary ? "Nhân bản lương tháng" : "Nhân bản đợt") : isSalary ? (initial?.id ? "Sửa lương tháng" : "Ghi lương tháng") : (initial?.id ? "Sửa đợt" : "Thêm đợt");
  return (
    <Modal title={title} onClose={onClose} wide>
      {dup && <div className="mb-3 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-600"><Copy size={14} /> Đã sao chép thông số đợt cũ — chỉ cần đổi <b>ngày thu</b> rồi lưu.</div>}
      <InstallmentFields f={f} setF={setF} isAds={isAds} isSalary={isSalary} salaryBase={salaryBase} />
      <button onClick={() => { if (num(f.amount)) { onSave(instFromForm(f, isAds, isSalary)); onClose(); } }} className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">{dup ? "Tạo đợt mới" : isSalary ? "Ghi lương" : "Lưu đợt"}</button>
    </Modal>
  );
}

function ProjectDrawer({ project, custFeeRate = 20, custSalary = 0, onClose, onEdit, onDelete, addInstallment, updateInstallment, deleteInstallment }) {
  const m = projectMetrics(project);
  const isAds = project.category === "ADS";
  const isSalary = project.category === "Lương";
  const [instModal, setInstModal] = useState(null); // {edit?:inst}
  const [aiInst, setAiInst] = useState(false);
  const [stone, slabel] = STATUS[project.status] || STATUS.doing;
  const insts = [...(project.installments || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={CAT_TONE[project.category] || "slate"}>{project.category}</Badge>
              <Badge tone={stone}>{slabel}</Badge>
            </div>
            <h3 className="mt-2 text-lg font-extrabold text-slate-900">{project.name}</h3>
            <div className="text-sm text-slate-400">{project.customerName}</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={16} /></button>
            <button onClick={() => { if (confirm("Xoá dự án này?")) { onDelete(); onClose(); } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-indigo-50 p-3"><div className="text-[11px] font-bold uppercase text-indigo-400">Doanh thu</div><div className="text-lg font-extrabold text-indigo-700">{formatVND(m.revenue)}</div></div>
          <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[11px] font-bold uppercase text-emerald-400">Lợi nhuận gộp</div><div className="text-lg font-extrabold text-emerald-700">{formatVND(m.grossProfit)}</div></div>
          {isAds && <div className="rounded-xl bg-sky-50 p-3"><div className="text-[11px] font-bold uppercase text-sky-400">Chiết khấu nền tảng</div><div className="text-lg font-extrabold text-sky-700">{formatVND(m.platformDiscount)}</div></div>}
          <div className={`rounded-xl p-3 ${m.debt > 0 ? "bg-rose-50" : "bg-slate-50"}`}><div className={`text-[11px] font-bold uppercase ${m.debt > 0 ? "text-rose-400" : "text-slate-400"}`}>Công nợ</div><div className={`text-lg font-extrabold ${m.debt > 0 ? "text-rose-700" : "text-slate-500"}`}>{formatVND(m.debt)}</div></div>
        </div>
        <div className="mt-2 text-center text-[11px] text-slate-400">Đã thu {formatVND(m.collected)} / {formatVND(m.contractValue)}</div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-600">{isSalary ? `Các tháng lương (${insts.length})` : `Các đợt (${insts.length})`}</div>
          <div className="flex items-center gap-2">
            {!isSalary && <button onClick={() => setAiInst(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-1.5 text-xs font-bold text-white"><Sparkles size={13} /> AI</button>}
            <button onClick={() => setInstModal({})} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${isSalary ? "bg-violet-100 text-violet-600 hover:bg-violet-200" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>{isSalary ? <><Wallet size={14} /> Ghi lương tháng</> : <><Plus size={14} /> Thêm đợt</>}</button>
          </div>
        </div>
        {insts.length === 0 && <div className="mt-1 text-xs text-slate-400">{isSalary ? "Chưa ghi tháng nào. Bấm \"Ghi lương tháng\" để ghi lương thực nhận." : "Chưa có đợt nào. Thêm đợt để ghi nhận thu tiền."}</div>}
        <div className="mt-2 space-y-2">
          {insts.map((x) => {
            const im = installmentMetrics(x, isAds);
            const full = im.debt <= 0;
            return (
              <div key={x.id} className="group rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">{x.label}{x.carried && <Badge tone="sky">nối</Badge>}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">{x.date ? fmtDateVI(x.date) : ""}</span>
                    <button title="Nhân bản (đổi ngày)" onClick={() => setInstModal({ dup: { ...instToForm(x), id: undefined, carried: false, date: addMonthISO(x.date) } })} className="rounded p-1 text-slate-300 hover:text-violet-600"><Copy size={13} /></button>
                    <button title="Sửa" onClick={() => setInstModal({ edit: instToForm(x) })} className="rounded p-1 text-slate-300 hover:text-indigo-600"><Pencil size={13} /></button>
                    <button title="Xoá" onClick={() => deleteInstallment(project.id, x.id)} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {isAds && <span>Nhận {formatShort(x.amount)}</span>}
                  {isAds && <span>Phí {formatShort(x.serviceFee)}</span>}
                  {isAds && <span>Chạy {formatShort(x.spend)}</span>}
                  {isAds && <span>CK <b className="text-sky-600">{formatShort(im.platformDiscount)}</b></span>}
                  {im.refund > 0 && <span className="text-rose-500">Hoàn {formatShort(im.refund)}</span>}
                  {im.carry > 0 && <span className="text-amber-600">Chuyển {formatShort(im.carry)}</span>}
                  <span>DT <b className="text-indigo-600">{formatShort(im.revenue)}</b></span>
                  <span>LN <b className="text-emerald-600">{formatShort(im.grossProfit)}</b></span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${full ? "text-emerald-600" : "text-rose-600"}`}>
                    {full ? "Đã thu đủ" : `Còn nợ ${formatVND(im.debt)}`} · thu {formatShort(im.collected)}/{formatShort(im.contractValue)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {im.carry > 0 && (
                      <button onClick={() => addInstallment(project.id, { label: "Tiếp nối " + x.label, date: todayISO(), amount: im.carry, serviceFee: 0, spend: 0, refund: 0, carry: 0, ctv: 0, otherCost: 0, collected: im.carry, carried: true })} className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-100"><ArrowRight size={12} /> Tạo đợt nối</button>
                    )}
                    {!full && (
                      <button onClick={() => updateInstallment(project.id, x.id, { collected: im.contractValue })} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-100"><Check size={12} /> Thu đủ</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {project.note && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{project.note}</div>}
      </div>

      {instModal && (
        <InstModal
          isAds={isAds} isSalary={isSalary} salaryBase={custSalary} initial={instModal.edit || instModal.dup} dup={!!instModal.dup} defaultFeeRate={custFeeRate}
          onClose={() => setInstModal(null)}
          onSave={(data) => instModal.edit ? updateInstallment(project.id, instModal.edit.id, data) : addInstallment(project.id, data)}
        />
      )}
      {aiInst && <AiImportModal mode="installment" projectId={project.id} onClose={() => setAiInst(false)} />}
    </div>
  );
}

export default function Projects() {
  const { projects, customerList, addProject, updateProject, deleteProject, addInstallment, updateInstallment, deleteInstallment } = useData();
  const [modal, setModal] = useState(null);
  const [aiModal, setAiModal] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const years = useMemo(() => { const ys = projectYears(projects); return ys.length ? ys : [new Date().getFullYear()]; }, [projects]);
  const [year, setYear] = useState(years[0]);

  // tổng hợp năm (theo đợt trong năm)
  const sum = useMemo(() => {
    const acc = { revenue: 0, discount: 0, grossProfit: 0, debt: 0 };
    for (const p of projects) {
      const isAds = p.category === "ADS";
      for (const inst of p.installments || []) {
        if (!inst.date || new Date(inst.date).getFullYear() !== year) continue;
        const im = installmentMetrics(inst, isAds);
        acc.revenue += im.revenue; acc.discount += im.platformDiscount; acc.grossProfit += im.grossProfit; acc.debt += im.debt;
      }
    }
    return acc;
  }, [projects, year]);

  const monthly = projectsMonthly(projects, year).map((m) => ({ name: MONTHS_VI[m.month - 1], dt: m.revenue, ln: m.grossProfit }));
  const statusCounts = useMemo(() => {
    const r = { doing: 0, done: 0, paused: 0, cancel: 0 };
    for (const p of projects) r[p.status] = (r[p.status] || 0) + 1;
    return r;
  }, [projects]);
  const list = useMemo(() => {
    const lastDate = (p) => (p.installments || []).reduce((mx, i) => (i.date && i.date > mx ? i.date : mx), "");
    return projects
      .filter((p) => (catF === "all" || p.category === catF)
        && (statusF === "all" || p.status === statusF)
        && (q === "" || (p.name + (p.customerName || "")).toLowerCase().includes(q.toLowerCase())))
      // Đang làm lên đầu → Tạm dừng → Hoàn thành → Đã huỷ; cùng trạng thái thì hoạt động gần nhất lên trên
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || lastDate(b).localeCompare(lastDate(a)));
  }, [projects, catF, statusF, q]);
  const drawerProject = drawer ? projects.find((p) => p.id === drawer) : null;

  const emptyProject = { name: "", customerId: "", category: "Web", status: "doing", note: "" };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Doanh thu" value={sum.revenue} sub={`Năm ${year}`} tone="indigo" />
        <StatCard icon={Gift} label="Chiết khấu nền tảng" value={sum.discount} sub="Từ ADS" tone="sky" />
        <StatCard icon={TrendingUp} label="Lợi nhuận gộp" value={sum.grossProfit} tone="emerald" />
        <StatCard icon={Receipt} label="Công nợ" value={sum.debt} sub="Chưa thu" tone="rose" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${y === year ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{y}</button>
            ))}
          </div>
          <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">
            <option value="all">Tất cả danh mục</option>
            {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="flex min-w-[150px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm dự án / khách…" className="w-full text-sm outline-none" />
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <button onClick={() => setAiModal(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 sm:flex-none"><Sparkles size={16} /> AI</button>
            <button onClick={() => setModal(emptyProject)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 sm:flex-none"><Plus size={16} /> Thêm dự án</button>
          </div>
        </div>
        {/* MOBILE: dropdown trạng thái */}
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:hidden">
          {[["all", "Tất cả", projects.length], ["doing", "Đang làm", statusCounts.doing], ["done", "Hoàn thành", statusCounts.done], ["paused", "Tạm dừng", statusCounts.paused], ["cancel", "Đã huỷ", statusCounts.cancel]].map(([v, l, n]) => (
            <option key={v} value={v}>{l}{n > 0 ? ` (${n})` : ""}</option>
          ))}
        </select>
        {/* DESKTOP: chips trạng thái */}
        <div className="mt-3 hidden flex-wrap gap-1 sm:flex">
          {[["all", "Tất cả", projects.length], ["doing", "Đang làm", statusCounts.doing], ["done", "Hoàn thành", statusCounts.done], ["paused", "Tạm dừng", statusCounts.paused], ["cancel", "Đã huỷ", statusCounts.cancel]].map(([v, l, n]) => (
            <button key={v} onClick={() => setStatusF(v)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${statusF === v ? (v === "cancel" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white") : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}{n > 0 && <span className="opacity-70"> {n}</span>}</button>
          ))}
        </div>
      </Card>

      {projects.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">Doanh thu / LN gộp theo tháng</span>}>Báo cáo {year}</SectionTitle>
          <div className="overflow-x-auto">
           <div className="h-56 min-w-[620px] sm:min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, k) => [formatVND(v), k === "dt" ? "Doanh thu" : "LN gộp"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="dt" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="ln" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
           </div>
          </div>
        </Card>
      )}

      {list.length === 0 ? (
        <Card><div className="py-12 text-center"><div className="text-sm font-bold text-slate-600">Chưa có dự án</div><div className="mt-1 text-xs text-slate-400">Bấm "Thêm dự án" để bắt đầu. Mỗi dự án có thể thu nhiều đợt (tháng/tuần/cọc…).</div></div></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const m = projectMetrics(p);
            const [stone, slabel] = STATUS[p.status] || STATUS.doing;
            const cnt = (p.installments || []).length;
            return (
              <button key={p.id} onClick={() => setDrawer(p.id)} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.customerName}</div>
                  </div>
                  <Badge tone={CAT_TONE[p.category] || "slate"}>{p.category}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div><div className="text-[10px] font-bold uppercase text-slate-400">Doanh thu</div><div className="text-sm font-extrabold text-slate-800">{formatShort(m.revenue)}</div></div>
                  <div><div className="text-[10px] font-bold uppercase text-slate-400">LN gộp</div><div className="text-sm font-extrabold text-emerald-600">{formatShort(m.grossProfit)}</div></div>
                  <div><div className="text-[10px] font-bold uppercase text-slate-400">Còn nợ</div><div className={`text-sm font-extrabold ${m.debt > 0 ? "text-rose-600" : "text-slate-400"}`}>{m.debt > 0 ? formatShort(m.debt) : "0"}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-3">
                  <Badge tone={stone}>{slabel}</Badge>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Repeat size={11} /> {cnt} đợt</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {aiModal && <AiImportModal mode="project" onClose={() => setAiModal(false)} />}
      {modal && (
        <ProjectModal
          initial={modal} customers={customerList}
          onClose={() => setModal(null)}
          onSave={(data) => (modal.id ? updateProject(modal.id, data) : addProject(data))}
        />
      )}
      {drawerProject && (
        <ProjectDrawer
          project={drawerProject}
          custFeeRate={num(customerList.find((c) => c.id === drawerProject.customerId)?.feeRate) || 20}
          custSalary={num(customerList.find((c) => c.id === drawerProject.customerId)?.monthlySalary)}
          onClose={() => setDrawer(null)}
          onEdit={() => { setModal(drawerProject); setDrawer(null); }}
          onDelete={() => deleteProject(drawerProject.id)}
          addInstallment={addInstallment} updateInstallment={updateInstallment} deleteInstallment={deleteInstallment}
        />
      )}
    </div>
  );
}
