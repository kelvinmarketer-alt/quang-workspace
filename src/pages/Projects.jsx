import { useState, useEffect } from "react";
import { Plus, X, Trash2, Pencil, Wallet, Check, CalendarClock, ArrowRight, Sparkles, Copy } from "lucide-react";
import { Badge, formatVND, formatShort, MoneyInput, DateField } from "../components/ui.jsx";
import Combobox from "../components/Combobox.jsx";
import { AiImportModal } from "../components/AiImport.jsx";
import { ProjectResources } from "./Resources.jsx";
import { JobMeasure } from "../components/BrandConnections.jsx";
import { useData } from "../lib/store.jsx";
import { PROJECT_CATEGORIES } from "../data/seed.js";
const SERVICES = PROJECT_CATEGORIES.filter((c) => c !== "Lương");
import { projectMetrics, installmentMetrics, jobKind } from "../lib/selectors.js";
import { todayISO, fmtDateVI } from "../lib/format.js";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";

const CAT_TONE = { Web: "indigo", App: "sky", ADS: "rose", Coaching: "amber", Seo: "emerald", Landing: "sky", "Lương": "violet", Khác: "slate" };
const STATUS = { doing: ["amber", "Đang làm"], done: ["emerald", "Hoàn thành"], paused: ["sky", "Tạm dừng"], cancel: ["rose", "Đã huỷ"] };
const STATUS_ORDER = { doing: 0, paused: 1, done: 2, cancel: 3 }; // Đang làm lên đầu, Đã huỷ xuống cuối
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
// % phí: cho số thập phân (12,5) và 0% — trống mới dùng mặc định (01/11: trước "12,5" thành 125%, không đặt được 0%)
const pct = (v) => { const s = String(v ?? "").trim().replace(",", "."); if (!s) return null; const n = parseFloat(s); return Number.isFinite(n) && n >= 0 ? n : null; };
const rateOf = (v, d = 20) => pct(v) ?? d;
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

function Field({ label, children, hint }) {
  return (
    <label className="block min-w-0 text-sm">
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
const addMonthISO = (iso) => { const [y, m, dd] = (iso || todayISO()).split("-").map(Number); const d = new Date(y, m, Math.min(dd, new Date(y, m + 1, 0).getDate())); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }; // 31/1 → 28/2 (không trôi sang 3/3)
// đợt (số) -> form (chuỗi) để nạp vào InstallmentFields
const instToForm = (x) => ({ ...x, amount: String(x.amount || ""), feeRate: String(x.feeRate ?? 20), serviceFee: String(x.serviceFee || ""), spend: String(x.spend || ""), refund: String(x.refund || ""), carry: String(x.carry || ""), ctv: String(x.ctv || ""), otherCost: String(x.otherCost || ""), collected: String(x.collected || ""),
  // đợt cũ ghi chi phí ở otherCost (chưa có costs[]) → đưa vào danh sách chi phí để sửa đợt không làm mất chi phí (01/11)
  costs: Array.isArray(x.costs) ? x.costs : num(x.otherCost) ? [{ label: "Chi phí khác", amount: String(x.otherCost) }] : [] });
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
    amount: num(f.amount), feeRate: rateOf(f.feeRate), serviceFee: isAds ? num(f.serviceFee) : 0, spend: isAds ? num(f.spend) : 0,
    refund: isAds ? num(f.refund) : 0, carry: isAds ? num(f.carry) : 0, ctv: num(f.ctv), costs, collected: num(f.collected),
    ...(f.carried ? { carried: true } : {}),
  };
}

/** Các ô nhập của 1 đợt + preview */
function InstallmentFields({ f, setF, isAds, isSalary, salaryBase = 0 }) {
  const rate = () => rateOf(f.feeRate);
  // phí chạy đã bị sửa tay chưa (để ngừng tự tính theo %). Hook phải đứng TRƯỚC nhánh Lương (01/11: đổi danh mục Lương ↔ khác làm sập form)
  const [feeTouched, setFeeTouched] = useState(() => num(f.serviceFee) > 0 && num(f.serviceFee) !== Math.round(num(f.amount) * rate() / 100));
  if (isSalary) {
    const amt = num(f.amount);
    // nhập lương → đang nhận đủ thì giữ nhận đủ; đợt còn nợ (13/11: đợt đổi từ dự án cũ) thì giữ số đã nhận
    const setAmt = (v) => setF((p) => ({ ...p, amount: v, collected: p.collected === "" || p.collected == null || num(p.collected) >= num(p.amount) ? v : p.collected }));
    const owe = Math.max(0, amt - num(f.collected));
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-violet-50/70 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tháng (ngày nhận)"><DateField value={f.date} onChange={(v) => setF({ ...f, date: v })} className={inputCls} /></Field>
            <Field label="Lương thực nhận" hint={salaryBase > 0 ? `Mặc định ${formatVND(salaryBase)}` : "Sửa nếu tháng này khác"}><MoneyInput value={f.amount} onChange={setAmt} className={inputCls} placeholder="15.000.000" /></Field>
          </div>
          {salaryBase > 0 && amt > 0 && amt !== salaryBase && (
            <div className={`mt-1.5 text-[11px] font-bold ${amt > salaryBase ? "text-emerald-600" : "text-rose-600"}`}>{amt > salaryBase ? `Cao hơn mặc định ${formatVND(amt - salaryBase)}` : `Thấp hơn mặc định ${formatVND(salaryBase - amt)}`}</div>
          )}
        </div>
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600">Đã nhận</span>
            <div className="flex gap-1">
              {[["Nhận đủ", () => f.amount], ["Chưa nhận", () => "0"]].map(([l, v]) => (
                <button key={l} type="button" onClick={() => setF((p) => ({ ...p, collected: String(v()) }))} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-indigo-100 hover:text-indigo-600">{l}</button>
              ))}
            </div>
          </div>
          <MoneyInput value={f.collected} onChange={(v) => setF((p) => ({ ...p, collected: v }))} className={inputCls} placeholder="0" />
          <div className={`mt-0.5 text-[11px] ${owe > 0 ? "font-bold text-rose-600" : "text-slate-400"}`}>{owe > 0 ? `Còn nợ ${formatVND(owe)}` : "Đã nhận đủ"}</div>
        </div>
        <Field label="Ghi chú (lý do tăng/giảm)"><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} placeholder="VD: trừ 2 ngày nghỉ, thưởng quý…" /></Field>
      </div>
    );
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setV = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const onAmount = (v) => {
    setF((p) => ({ ...p, amount: v, serviceFee: isAds && !feeTouched ? String(Math.round(num(v) * rateOf(p.feeRate) / 100)) : p.serviceFee }));
  };
  const onRate = (e) => {
    const r = rateOf(e.target.value, 0);
    setFeeTouched(false);
    setF((p) => ({ ...p, feeRate: e.target.value, serviceFee: String(Math.round(num(p.amount) * r / 100)) }));
  };
  const onServiceFee = (v) => {
    setFeeTouched(true);
    setF((p) => ({ ...p, serviceFee: v, feeRate: num(p.amount) ? String(Math.round((num(v) / num(p.amount)) * 1000) / 10) : p.feeRate }));
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
        <Field label="Ngày thu"><DateField value={f.date} onChange={setV("date")} className={inputCls} /></Field>
      </div>
      {isAds ? (
        <div className="rounded-xl bg-rose-50/60 p-3">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <Field label="Số tiền nhận"><MoneyInput value={f.amount} onChange={onAmount} className={inputCls} placeholder="10.000.000" /></Field>
            <Field label="% phí"><input value={f.feeRate} onChange={onRate} inputMode="decimal" className={inputCls} placeholder="20" /></Field>
            <Field label="Phí chạy"><MoneyInput value={f.serviceFee} onChange={onServiceFee} className={inputCls} placeholder="2.000.000" /></Field>
            <Field label="Tiền chạy"><MoneyInput value={f.spend} onChange={setV("spend")} className={inputCls} placeholder="4.000.000" /></Field>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">Chiết khấu nền tảng = Số tiền nhận − Phí chạy − Tiền chạy thực tế = <b className="text-sky-600">{formatVND(installmentMetrics(instFromForm(f, true), true).platformDiscount)}</b></div>
        </div>
      ) : (
        <Field label="Số tiền (phí đợt)"><MoneyInput value={f.amount} onChange={onAmount} className={inputCls} placeholder="10.000.000" /></Field>
      )}

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
              <input value={c.label} onChange={(e) => setCost(i, "label", e.target.value)} placeholder="Tên khoản (hosting…)" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <MoneyInput value={c.amount} onChange={(v) => setCost(i, "amount", v)} placeholder="0" className="w-28 shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-32" />
              <button aria-label="Xoá" title="Xoá" type="button" onClick={() => delCost(i)} className="shrink-0 rounded-lg p-2 sm:p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
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
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 01/11 sếp duyệt: bỏ "loại khách" → lương tháng nằm ở dự án Lương, % phí nằm ở dự án ADS (nhớ % lần trước của khách)
const autoName = (cat, cust) => (cust ? `${cat} ${cust.name}` : "");
export function ProjectModal({ initial, customers, onClose, onSave }) {
  const { projects = [] } = useData();
  // 13/11: mọi dự án là loại Lương (1 số tiền/đợt = LN gộp). Loại việc gốc chỉ để gắn báo cáo/đo lường → trường service.
  const [f, setF] = useState(() => ({ ...initial, service: initial.service || (initial.category && initial.category !== "Lương" ? initial.category : "") || "Khác", category: "Lương", monthlySalary: initial.monthlySalary ?? "", feeRate: initial.feeRate ?? "" }));
  const [inst, setInst] = useState(blankInst());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cust = customers.find((c) => c.id === f.customerId);
  const isAds = f.category === "ADS";
  const isSalary = f.category === "Lương";
  const editing = !!initial.id;
  // Mặc định theo khách: lương = dự án Lương gần nhất (hoặc số cũ ghi ở khách), % phí = dự án ADS gần nhất (hoặc khách, hoặc 20)
  const custDefaults = (cid) => {
    const c = customers.find((x) => x.id === cid);
    const mine = projects.filter((p) => p.customerId === cid && p.id !== initial.id);
    const lastInst = (p) => [...(p.installments || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    const sal = mine.filter((p) => p.category === "Lương").map((p) => num(p.monthlySalary) || num(lastInst(p)?.amount)).find(Boolean) || num(c?.monthlySalary);
    const fee = mine.filter((p) => p.category === "ADS").map((p) => pct(p.feeRate) ?? pct(lastInst(p)?.feeRate)).find((v) => v != null) ?? pct(c?.feeRate) ?? 20;
    return { sal, fee };
  };
  const salaryBase = num(f.monthlySalary);

  // Tạo mới: chọn khách / đổi danh mục → điền sẵn lương hoặc % phí (vẫn sửa được)
  const applyDefaults = (cid, cat) => {
    if (editing || !cid) return;
    const d = custDefaults(cid);
    if (cat === "Lương") {
      setF((p) => ({ ...p, monthlySalary: d.sal ? String(d.sal) : "" }));
      setInst({ ...blankInst(), amount: d.sal ? String(d.sal) : "", collected: d.sal ? String(d.sal) : "" });
    } else {
      setF((p) => ({ ...p, feeRate: String(d.fee) }));
      setInst(blankInst(d.fee));
    }
  };
  useEffect(() => { applyDefaults(f.customerId, f.category); }, [f.customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSalary = (v) => { setF((p) => ({ ...p, monthlySalary: v })); if (!editing) setInst((p) => ({ ...p, amount: v, collected: v })); };

  return (
    <Modal wide title={editing ? "Sửa dự án" : "Thêm dự án"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Khách hàng *">
          <Combobox
            options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
            value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })}
            placeholder="Tìm & chọn khách…" emptyText="Chưa có khách — thêm ở mục Khách hàng"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mảng việc" hint="Chỉ để gắn báo cáo / đo lường">
            <select value={f.service} onChange={set("service")} className={inputCls}>
              {SERVICES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select value={f.status} onChange={set("status")} className={inputCls}>
              <option value="doing">Đang làm</option><option value="done">Hoàn thành</option>
              <option value="paused">Tạm dừng</option><option value="cancel">Đã huỷ</option>
            </select>
          </Field>
        </div>
        {isSalary && <Field label="Lương tháng" hint="Tự điền mỗi lần ghi lương (= lợi nhuận anh nhận)"><MoneyInput value={f.monthlySalary} onChange={onSalary} className={inputCls} placeholder="15.000.000" /></Field>}
        <Field label="Tên dự án" hint="Bỏ trống = tự đặt theo mảng việc + khách"><input value={f.name} onChange={set("name")} className={inputCls} placeholder={autoName(f.service, cust) || "VD: ADS Vua Đóng Gói"} /></Field>
        <Field label="Ghi chú"><input value={f.note} onChange={set("note")} className={inputCls} /></Field>

        {!editing && (
          <div className="rounded-xl border border-slate-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarClock size={14} /> {isSalary ? "Lương tháng đầu (tuỳ chọn)" : "Đợt đầu tiên (tuỳ chọn)"}</div>
            <InstallmentFields f={inst} setF={setInst} isAds={isAds} isSalary={isSalary} salaryBase={salaryBase} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 border-t border-slate-100 bg-white px-4 pb-4 pt-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0">
      <button
        onClick={() => {
          if (!f.customerId) return;
          const base = { name: (f.name || "").trim() || autoName(f.service, cust), customerId: f.customerId, customerName: cust?.name || "", category: "Lương", service: f.service || "Khác", status: f.status, note: f.note,
            monthlySalary: num(f.monthlySalary) };
          if (editing) onSave(base);
          else {
            const firstAmt = num(inst.amount);
            onSave({ ...base, installments: firstAmt ? [{ id: "i" + Math.random().toString(36).slice(2, 7), ...instFromForm(inst, isAds, isSalary) }] : [] });
          }
          onClose();
        }}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
        {editing ? "Lưu" : "Tạo dự án"}
      </button>
      </div>
    </Modal>
  );
}

function InstModal({ isAds, isSalary, salaryBase = 0, initial, dup = false, defaultFeeRate = 20, onClose, onSave }) {
  const [f, setF] = useState(initial || (isSalary ? { ...blankInst(), amount: salaryBase ? String(salaryBase) : "", collected: salaryBase ? String(salaryBase) : "" } : blankInst(defaultFeeRate)));
  const [added, setAdded] = useState(0); // đã lưu bao nhiêu đợt trong phiên này
  const editing = !!(initial && initial.id);
  const title = dup ? (isSalary ? "Nhân bản lương tháng" : "Nhân bản đợt") : isSalary ? (editing ? "Sửa lương tháng" : "Ghi lương tháng") : (editing ? "Sửa đợt" : "Thêm đợt");
  const saveClose = () => { if (num(f.amount)) { onSave(instFromForm(f, isAds, isSalary)); onClose(); } };
  // Lưu rồi ở lại thêm đợt mới: giữ số tiền/% để nhập nhanh chuỗi định kỳ, ngày +1 tháng, xoá tên đợt
  const saveMore = () => {
    if (!num(f.amount)) return;
    onSave(instFromForm(f, isAds, isSalary));
    setAdded((n) => n + 1);
    setF((p) => ({ ...p, label: "", date: addMonthISO(p.date) }));
  };
  return (
    <Modal title={title} onClose={onClose} wide>
      {dup && <div className="mb-3 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-600"><Copy size={14} /> Đã sao chép thông số đợt cũ — chỉ cần đổi <b>ngày thu</b> rồi lưu.</div>}
      {added > 0 && <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600"><Check size={14} /> Đã thêm <b>{added}</b> {isSalary ? "tháng" : "đợt"} — nhập tiếp hoặc bấm "Xong".</div>}
      <InstallmentFields f={f} setF={setF} isAds={isAds} isSalary={isSalary} salaryBase={salaryBase} />
      {editing ? (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 border-t border-slate-100 bg-white px-4 pb-4 pt-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0"><button onClick={saveClose} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu</button></div>
      ) : (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 border-t border-slate-100 bg-white px-4 pb-4 pt-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0 flex gap-2">
          <button onClick={saveMore} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-100"><Plus size={15} className="shrink-0" /> <span className="truncate">Lưu & thêm tiếp</span></button>
          <button onClick={() => { if (num(f.amount)) saveClose(); else onClose(); }} className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">{added > 0 ? "Xong" : dup ? "Tạo đợt mới" : isSalary ? "Ghi lương" : "Lưu đợt"}</button>
        </div>
      )}
    </Modal>
  );
}

export function ProjectDrawer({ project, custFeeRate = 20, custSalary = 0, onClose, onEdit, onDelete, addInstallment, updateInstallment, deleteInstallment }) {
  const { canEdit } = useData();
  const canW = canEdit ? canEdit("customers") : true; // chỉ có quyền Xem → ẩn nút sửa/xoá/thu tiền
  const m = projectMetrics(project);
  const isAds = project.category === "ADS";
  const isSalary = project.category === "Lương";
  const [instModal, setInstModal] = useState(null); // {edit?:inst}
  const [aiInst, setAiInst] = useState(false);
  const [stone, slabel] = STATUS[project.status] || STATUS.doing;
  // Sắp xếp đợt MỚI NHẤT → CŨ NHẤT (theo ngày giảm dần)
  const insts = [...(project.installments || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const salDef = num(project.monthlySalary) || custSalary;
  const feeDef = pct(project.feeRate) ?? pct(insts[0]?.feeRate) ?? custFeeRate;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone={CAT_TONE[jobKind(project)] || "slate"}>{jobKind(project)}</Badge>
              <Badge tone={stone}>{slabel}</Badge>
              {!canW && <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-600">Chỉ xem</span>}
            </div>
            <h3 className="mt-2 break-words text-lg font-extrabold text-slate-900">{project.name}</h3>
            <div className="text-sm text-slate-400">{project.customerName}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canW && <button aria-label="Sửa dự án" title="Sửa dự án" onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={14} /> Sửa</button>}
            {canW && <button aria-label="Xoá dự án" title="Xoá dự án" onClick={async () => { if (await ask("Xoá dự án này?")) { onDelete(); onClose(); } }} className="ml-2 rounded-lg p-2 sm:p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>}
            <button aria-label="Đóng" title="Đóng" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 sm:p-1.5"><X size={18} /></button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          {!isSalary && <div className="min-w-0 rounded-xl bg-indigo-50 p-3"><div className="truncate text-[11px] font-bold uppercase text-indigo-400">Doanh thu</div><div className="break-words text-base font-extrabold text-indigo-700 sm:text-lg">{formatVND(m.revenue)}</div></div>}
          <div className="min-w-0 rounded-xl bg-emerald-50 p-3"><div className="truncate text-[11px] font-bold uppercase text-emerald-400">{isSalary ? "Tổng lương" : "Lợi nhuận gộp"}</div><div className="break-words text-base font-extrabold text-emerald-700 sm:text-lg">{formatVND(m.grossProfit)}</div></div>
          {isAds && <div className="min-w-0 rounded-xl bg-sky-50 p-3"><div className="truncate text-[11px] font-bold uppercase text-sky-400">Chiết khấu nền tảng</div><div className="break-words text-base font-extrabold text-sky-700 sm:text-lg">{formatVND(m.platformDiscount)}</div></div>}
          <div className={`min-w-0 rounded-xl p-3 ${m.debt > 0 ? "bg-rose-50" : "bg-slate-50"}`}><div className={`truncate text-[11px] font-bold uppercase ${m.debt > 0 ? "text-rose-400" : "text-slate-400"}`}>Công nợ</div><div className={`break-words text-base font-extrabold sm:text-lg ${m.debt > 0 ? "text-rose-700" : "text-slate-500"}`}>{formatVND(m.debt)}</div></div>
        </div>
        <div className="mt-2 text-center text-[11px] text-slate-400">Đã thu {formatVND(m.collected)} / {formatVND(m.contractValue)}</div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-600">{isSalary ? `Các tháng lương (${insts.length})` : `Các đợt (${insts.length})`}</div>
          {canW && <div className="flex items-center gap-2">
            {!isSalary && <button onClick={() => setAiInst(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-1.5 text-xs font-bold text-white"><Sparkles size={13} /> AI</button>}
            <button onClick={() => setInstModal({})} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${isSalary ? "bg-violet-100 text-violet-600 hover:bg-violet-200" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>{isSalary ? <><Wallet size={14} /> Ghi lương tháng</> : <><Plus size={14} /> Thêm đợt</>}</button>
          </div>}
        </div>
        {insts.length === 0 && <div className="mt-1 text-xs text-slate-400">{isSalary ? "Chưa ghi tháng nào. Bấm \"Ghi lương tháng\" để ghi lương thực nhận." : "Chưa có đợt nào. Thêm đợt để ghi nhận thu tiền."}</div>}
        <div className="mt-2 space-y-2">
          {insts.map((x) => {
            const im = installmentMetrics(x, isAds);
            const full = im.debt <= 0;
            return (
              <div key={x.id} className="group rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-800"><span className="truncate">{x.label}</span>{x.carried && <Badge tone="sky">nối</Badge>}</div>
                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    <span className="text-[11px] text-slate-400">{x.date ? fmtDateVI(x.date) : ""}</span>
                    {canW && <>
                    <button title="Nhân bản (đổi ngày)" onClick={() => setInstModal({ dup: { ...instToForm(x), id: undefined, carried: false, date: addMonthISO(x.date) } })} className="-my-1 rounded p-2 text-slate-300 hover:text-violet-600 sm:my-0 sm:p-1"><Copy size={13} /></button>
                    <button title="Sửa" onClick={() => setInstModal({ edit: instToForm(x) })} className="-my-1 rounded p-2 text-slate-300 hover:text-indigo-600 sm:my-0 sm:p-1"><Pencil size={13} /></button>
                    <button title="Xoá" onClick={async () => { if (await ask("Xoá đợt thu này?")) deleteInstallment(project.id, x.id); }} className="-my-1 rounded p-2 text-slate-300 hover:text-rose-600 sm:my-0 sm:p-1"><Trash2 size={13} /></button>
                    </>}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {isAds && <span>Nhận {formatShort(x.amount)}</span>}
                  {isAds && <span>Phí {formatShort(x.serviceFee)}</span>}
                  {isAds && <span>Chạy {formatShort(x.spend)}</span>}
                  {isAds && <span>CK <b className="text-sky-600">{formatShort(im.platformDiscount)}</b></span>}
                  {im.refund > 0 && <span className="text-rose-500">Hoàn {formatShort(im.refund)}</span>}
                  {im.carry > 0 && <span className="text-amber-600">Chuyển {formatShort(im.carry)}</span>}
                  {isSalary ? <span>Lương <b className="text-emerald-600">{formatShort(im.grossProfit)}</b></span> : <>
                  <span>DT <b className="text-indigo-600">{formatShort(im.revenue)}</b></span>
                  <span>LN <b className="text-emerald-600">{formatShort(im.grossProfit)}</b></span></>}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[11px] font-bold ${full ? "text-emerald-600" : "text-rose-600"}`}>
                    {full ? "Đã thu đủ" : `Còn nợ ${formatVND(im.debt)}`} · thu {formatShort(im.collected)}/{formatShort(im.contractValue)}
                  </span>
                  {canW && <div className="ml-auto flex items-center gap-1.5">
                    {im.carry > 0 && (
                      <button onClick={() => addInstallment(project.id, { label: "Tiếp nối " + x.label, date: todayISO(), amount: im.carry, serviceFee: 0, spend: 0, refund: 0, carry: 0, ctv: 0, otherCost: 0, collected: im.carry, carried: true })} className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-100"><ArrowRight size={12} /> Tạo đợt nối</button>
                    )}
                    {!full && (
                      <button onClick={() => { const amt = im.contractValue - num(x.collected); updateInstallment(project.id, x.id, { collected: im.contractValue, payments: [...(Array.isArray(x.payments) ? x.payments : []), { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: todayISO(), amount: amt, note: "Thu đủ" }] }); }} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-100"><Check size={12} /> Thu đủ</button>
                    )}
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
        {project.note && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{project.note}</div>}

        <div className="mt-4"><JobMeasure project={project} /></div>
        <ProjectResources projectId={project.id} customerId={project.customerId} customerName={project.customerName} />
      </div>

      {instModal && (
        <InstModal
          isAds={isAds} isSalary={isSalary} salaryBase={salDef} initial={instModal.edit || instModal.dup} dup={!!instModal.dup} defaultFeeRate={feeDef}
          onClose={() => setInstModal(null)}
          onSave={(data) => instModal.edit ? updateInstallment(project.id, instModal.edit.id, data) : addInstallment(project.id, data)}
        />
      )}
      {aiInst && <AiImportModal mode="installment" projectId={project.id} onClose={() => setAiInst(false)} />}
    </div>
  );
}
