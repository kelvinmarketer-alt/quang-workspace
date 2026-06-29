import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Plus, X, Trash2, Pencil, PiggyBank, Wallet, ArrowDownToLine, ArrowUpFromLine, Sparkles, TrendingUp, ArrowLeftRight, Repeat, BellRing, CalendarClock, Power, SkipForward } from "lucide-react";
import { Card, StatCard, SectionTitle, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { FUND_COLORS } from "../data/seed.js";
import { fundBalance, monthlyCashIn, monthlyFundInflow, fundInflowInRange, projectYears } from "../lib/selectors.js";
import { todayISO, fmtDateVI } from "../lib/format.js";

const TONE_BG = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500", violet: "bg-violet-500", teal: "bg-teal-500", pink: "bg-pink-500" };
const TONE_GRAD = { indigo: "from-indigo-500 to-violet-500", emerald: "from-emerald-500 to-teal-500", rose: "from-rose-500 to-pink-500", sky: "from-sky-500 to-cyan-500", amber: "from-amber-500 to-orange-500", violet: "from-violet-500 to-purple-500", teal: "from-teal-500 to-emerald-500", pink: "from-pink-500 to-rose-500" };
const TONE_HEX = { indigo: "#6366f1", emerald: "#10b981", rose: "#f43f5e", sky: "#0ea5e9", amber: "#f59e0b", violet: "#8b5cf6", teal: "#14b8a6", pink: "#ec4899" };
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
const monthLabel = (iso) => { const [y, m] = (iso || "").split("-"); return m ? `T${Number(m)}/${y}` : ""; };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const EVERY = [["week", "1 tuần"], ["2week", "2 tuần"], ["month", "1 tháng"]];
const everyLabel = (v) => (EVERY.find(([k]) => k === v) || EVERY[1])[1];
function addEvery(d, every) {
  const x = new Date(d);
  if (every === "week") x.setDate(x.getDate() + 7);
  else if (every === "month") x.setMonth(x.getMonth() + 1);
  else x.setDate(x.getDate() + 14); // 2week (mặc định)
  return x;
}
// Các kỳ ĐÃ ĐẾN HẠN (≤ hôm nay) mà chưa xử lý (sau lastDone). Trả mảng ISO tăng dần.
function pendingOccs(sc, today) {
  if (sc.active === false || !sc.startDate) return [];
  const last = sc.lastDone || "";
  const out = []; let d = new Date(sc.startDate + "T00:00:00"); let g = 0;
  while (g++ < 400) {
    const iso = isoOf(d);
    if (iso > today) break;
    if (iso > last) out.push(iso);
    d = addEvery(d, sc.every);
  }
  return out;
}
// Kỳ KẾ TIẾP (> hôm nay) để hiển thị "lần tới"
function nextOcc(sc, today) {
  if (sc.active === false || !sc.startDate) return null;
  let d = new Date(sc.startDate + "T00:00:00"); let g = 0;
  while (g++ < 400) { const iso = isoOf(d); if (iso > today && iso > (sc.lastDone || "")) return iso; d = addEvery(d, sc.every); }
  return null;
}

/* ---- Modal thêm/sửa quỹ ---- */
function FundModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || { name: "", color: "indigo", percent: "", note: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa quỹ" : "Thêm quỹ"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên quỹ *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus className={inputCls} placeholder="VD: Đầu tư, Du lịch, Dự phòng…" /></label>
        <div className="mb-3"><span className="mb-1 block text-sm font-semibold text-slate-600">Màu</span>
          <div className="flex flex-wrap gap-2">
            {FUND_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set("color", c)} className={`h-8 w-8 rounded-full ${TONE_BG[c]} ${f.color === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`} />
            ))}
          </div>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">% phân bổ mặc định</span>
          <input type="number" min="0" max="100" value={f.percent} onChange={(e) => set("percent", e.target.value)} className={inputCls} placeholder="VD: 30" /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="Mục đích của quỹ" /></label>
        <button onClick={() => { if (f.name.trim()) { onSave({ ...f, name: f.name.trim(), percent: Number(f.percent) || 0 }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Lưu quỹ</button>
      </div>
    </div>
  );
}

/* ---- Modal nạp / rút 1 quỹ ---- */
function TxModal({ fund, type, onClose, onSave }) {
  const [f, setF] = useState({ amount: "", date: todayISO(), note: "" });
  const isIn = type === "in";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{isIn ? "Nạp vào" : "Rút từ"} quỹ {fund.name}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền *</span>
          <MoneyInput value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} autoFocus className={inputCls} placeholder="2.000.000" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
          <input type="date" value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} className={inputCls} /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} className={inputCls} placeholder={isIn ? "Nguồn tiền" : "Lý do rút / chi gì"} /></label>
        <button onClick={() => { if (num(f.amount) > 0) { onSave({ fundId: fund.id, amount: num(f.amount), date: f.date, type, note: f.note.trim() }); onClose(); } }} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg ${isIn ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" : "bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30"}`}>{isIn ? "Nạp tiền" : "Rút tiền"}</button>
      </div>
    </div>
  );
}

/* ---- Modal chuyển tiền giữa 2 quỹ ---- */
function TransferModal({ funds, onClose, onSave }) {
  const [from, setFrom] = useState(funds[0]?.id || "");
  const [to, setTo] = useState(funds[1]?.id || funds[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const fromFund = funds.find((f) => f.id === from);
  const bad = !from || !to || from === to || num(amount) <= 0;
  const swap = () => { setFrom(to); setTo(from); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Chuyển tiền giữa quỹ</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-2 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Từ quỹ</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          {fromFund && <span className="mt-1 block text-[11px] text-slate-400">Số dư hiện tại: {formatVND(fromFund.balance || 0)}</span>}
        </label>
        <div className="my-1 flex justify-center"><button type="button" onClick={swap} className="rounded-full border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-indigo-600"><ArrowLeftRight size={15} /></button></div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Sang quỹ</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền *</span>
            <MoneyInput value={amount} onChange={setAmount} autoFocus className={inputCls} placeholder="2.000.000" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
        </div>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Lý do chuyển (tuỳ chọn)" /></label>
        {from === to && <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Chọn 2 quỹ khác nhau.</div>}
        <button disabled={bad} onClick={() => { if (!bad) { onSave(from, to, num(amount), date, note.trim()); onClose(); } }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">
          <ArrowLeftRight size={16} /> Chuyển tiền
        </button>
      </div>
    </div>
  );
}

/* ---- Modal lịch chuyển quỹ định kỳ ---- */
function ScheduleModal({ initial, funds, onClose, onSave }) {
  const [f, setF] = useState(initial || { fromId: funds[0]?.id || "", toId: funds[1]?.id || funds[0]?.id || "", amount: "", every: "2week", startDate: todayISO(), note: "", active: true });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const bad = !f.fromId || !f.toId || f.fromId === f.toId || num(f.amount) <= 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa lịch chuyển" : "Lịch chuyển định kỳ"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Từ quỹ</span>
            <select value={f.fromId} onChange={(e) => set("fromId", e.target.value)} className={inputCls}>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Sang quỹ</span>
            <select value={f.toId} onChange={(e) => set("toId", e.target.value)} className={inputCls}>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền mỗi kỳ *</span>
          <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} className={inputCls} placeholder="2.000.000" /></label>
        <div className="mb-3"><span className="mb-1 block text-sm font-semibold text-slate-600">Tần suất</span>
          <div className="flex gap-1.5">
            {EVERY.map(([v, l]) => (
              <button key={v} type="button" onClick={() => set("every", v)} className={`flex-1 rounded-xl border py-2 text-sm font-bold ${f.every === v ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Bắt đầu từ</span>
          <input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} placeholder="VD: trích đầu tư định kỳ" /></label>
        {f.fromId === f.toId && <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Chọn 2 quỹ khác nhau.</div>}
        <button disabled={bad} onClick={() => { if (!bad) { onSave({ ...f, amount: num(f.amount), note: f.note.trim() }); onClose(); } }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">
          <Repeat size={16} /> Lưu lịch
        </button>
      </div>
    </div>
  );
}

/* ---- Modal phân bổ thu nhập theo % vào tất cả quỹ ---- */
function AllocateModal({ funds, defaultAmount, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(String(defaultAmount || ""));
  const splitByPct = (total) => Object.fromEntries(funds.map((f) => [f.id, Math.round((total * (f.percent || 0)) / 100)]));
  const [rows, setRows] = useState(() => splitByPct(defaultAmount || 0));
  const setTotal = (v) => { const t = num(v); setAmount(v); setRows(splitByPct(t)); };
  const allocated = Object.values(rows).reduce((a, b) => a + (Number(b) || 0), 0);
  const total = num(amount);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Phân bổ thu nhập vào quỹ</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tổng tiền chia</span>
            <MoneyInput value={amount} onChange={setTotal} className={inputCls} placeholder="10.000.000" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
        </div>
        <div className="mb-3 space-y-2">
          {funds.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
              <span className={`h-3 w-3 shrink-0 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-700">{f.name}</div><div className="text-[11px] text-slate-400">{f.percent || 0}%</div></div>
              <MoneyInput value={String(rows[f.id] ?? "")} onChange={(v) => setRows((p) => ({ ...p, [f.id]: num(v) }))} className="w-32 rounded-xl border border-slate-200 px-3 py-1.5 text-right text-sm" />
            </div>
          ))}
        </div>
        <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold ${allocated === total ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <span>Đã chia {formatShort(allocated)} / {formatShort(total)}</span>
          <span>{allocated === total ? "Khớp ✓" : `Lệch ${formatShort(Math.abs(total - allocated))}`}</span>
        </div>
        <button onClick={() => { const entries = funds.map((f) => ({ fundId: f.id, amount: Number(rows[f.id]) || 0 })); if (entries.some((e) => e.amount > 0)) { onSave(entries, date, `Phân bổ ${monthLabel(date)}`); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Phân bổ vào quỹ</button>
      </div>
    </div>
  );
}

export default function Funds() {
  const { funds, fundTx, fundSchedules, projects, addFund, updateFund, deleteFund, addFundTx, deleteFundTx, allocateFunds, transferFund, addFundSchedule, updateFundSchedule, deleteFundSchedule, runFundSchedule, skipFundSchedule } = useData();
  const now = new Date();
  const curY = now.getFullYear();
  const today = todayISO();
  const [year, setYear] = useState(curY);
  const [fundModal, setFundModal] = useState(null); // null | {} | fund
  const [txModal, setTxModal] = useState(null);      // { fund, type }
  const [allocOpen, setAllocOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [schedModal, setSchedModal] = useState(null); // null | {} | schedule

  const years = useMemo(() => {
    const ys = new Set(projectYears(projects)); ys.add(curY);
    for (const t of fundTx || []) if (t.date) ys.add(new Date(t.date).getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [projects, fundTx, curY]);

  const fundsWithBal = useMemo(() => (funds || []).map((f) => ({ ...f, balance: fundBalance(fundTx, f.id) })), [funds, fundTx]);
  const totalBalance = fundsWithBal.reduce((a, f) => a + f.balance, 0);
  const pctTotal = (funds || []).reduce((a, f) => a + (Number(f.percent) || 0), 0);

  const cashInMonths = useMemo(() => monthlyCashIn(projects, year), [projects, year]);
  const inflow = useMemo(() => monthlyFundInflow(fundTx, year), [fundTx, year]);
  const incomeYear = cashInMonths.reduce((a, b) => a + b, 0);

  // Tháng hiện tại (chỉ khi đang xem năm nay)
  const m = now.getMonth();
  const mFrom = `${curY}-${String(m + 1).padStart(2, "0")}-01`;
  const mTo = `${curY}-${String(m + 1).padStart(2, "0")}-${String(new Date(curY, m + 1, 0).getDate()).padStart(2, "0")}`;
  const incomeThisMonth = monthlyCashIn(projects, curY)[m];
  const allocatedThisMonth = fundInflowInRange(fundTx, mFrom, mTo);
  const unallocated = Math.max(0, incomeThisMonth - allocatedThisMonth);

  // Bảng dòng tiền theo tháng (các tháng có phát sinh)
  const monthRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const fundVals = (funds || []).map((f) => (inflow.byFund[f.id] || [])[i] || 0);
      const alloc = inflow.total[i] || 0;
      if (cashInMonths[i] || alloc) rows.push({ i, income: cashInMonths[i], alloc, fundVals });
    }
    return rows;
  }, [funds, inflow, cashInMonths]);

  // Biểu đồ: thu nhập vs đã phân bổ theo tháng
  const chart = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ name: "T" + (i + 1), thu: cashInMonths[i], pb: inflow.total[i] || 0 })).filter((x) => x.thu || x.pb), [cashInMonths, inflow]);

  const recentTx = useMemo(() => (fundTx || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 40), [fundTx]);
  const fundName = (id) => (funds || []).find((f) => f.id === id)?.name || "—";
  const fundColor = (id) => (funds || []).find((f) => f.id === id)?.color || "slate";

  // Lịch chuyển định kỳ: kỳ đã đến hạn (chờ xác nhận) + danh sách lịch
  const schedules = fundSchedules || [];
  const due = useMemo(() => schedules.map((sc) => ({ sc, occs: pendingOccs(sc, today) })).filter((d) => d.occs.length > 0), [schedules, today]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Banner: lịch chuyển đã đến hạn (chờ xác nhận) */}
      {due.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-sm font-extrabold text-amber-700"><BellRing size={16} /> Lịch chuyển đến hạn ({due.reduce((a, d) => a + d.occs.length, 0)})</div>
          <div className="space-y-2">
            {due.map(({ sc, occs }) => {
              const occ = occs[0]; // xử lý kỳ sớm nhất trước
              return (
                <div key={sc.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[fundColor(sc.fromId)] || "bg-slate-400"}`} />{fundName(sc.fromId)}
                      <ArrowLeftRight size={13} className="text-slate-400" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[fundColor(sc.toId)] || "bg-slate-400"}`} />{fundName(sc.toId)}
                      <span className="ml-1 text-indigo-600">{formatShort(sc.amount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">Đến hạn {fmtDateVI(occ)}{occs.length > 1 ? ` · còn ${occs.length - 1} kỳ quá hạn` : ""}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => runFundSchedule(sc.id, occ)} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow"><ArrowLeftRight size={13} /> Chuyển ngay</button>
                    <button onClick={() => skipFundSchedule(sc.id, occ)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"><SkipForward size={13} /> Bỏ qua</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thanh năm + nút phân bổ */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            {years.map((y) => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          <div className="text-sm font-semibold text-slate-400">Thu nhập {year}: <span className="text-slate-700">{formatVND(incomeYear)}</span></div>
          <button onClick={() => setAllocOpen(true)} className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            <Sparkles size={16} /> Phân bổ thu nhập
          </button>
        </div>
      </Card>

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={PiggyBank} label="Tổng số dư quỹ" value={totalBalance} tone="indigo" />
        <StatCard icon={Wallet} label="Thu nhập tháng này" value={incomeThisMonth} tone="emerald" />
        <StatCard icon={ArrowDownToLine} label="Đã phân bổ tháng này" value={allocatedThisMonth} tone="sky" />
        <StatCard icon={TrendingUp} label="Chưa phân bổ" value={unallocated} sub={unallocated > 0 ? "nên chia vào quỹ" : "đã chia hết"} tone={unallocated > 0 ? "amber" : "emerald"} />
      </div>

      {/* Lưới quỹ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">Các quỹ <span className="text-slate-400">({fundsWithBal.length})</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            {pctTotal !== 100 && fundsWithBal.length > 0 && <Badge tone={pctTotal > 100 ? "rose" : "amber"}>Tổng % = {pctTotal}</Badge>}
            {fundsWithBal.length >= 2 && <button onClick={() => setTransferOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ArrowLeftRight size={15} /> Chuyển quỹ</button>}
            <button onClick={() => setFundModal({})} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Plus size={15} /> Thêm quỹ</button>
          </div>
        </div>

        {fundsWithBal.length === 0 ? (
          <Card><div className="py-10 text-center"><PiggyBank size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có quỹ nào</div><div className="mt-1 text-xs text-slate-400">Tạo các quỹ: Đầu tư, Cá nhân, Gia đình, Du lịch…</div></div></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fundsWithBal.map((f) => (
              <div key={f.id} className="card group flex flex-col p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg ${TONE_GRAD[f.color] || TONE_GRAD.indigo}`}><PiggyBank size={18} /></span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-800">{f.name}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{f.percent || 0}% · phân bổ</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <button onClick={() => setFundModal(f)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm(`Xoá quỹ "${f.name}" và toàn bộ giao dịch của quỹ?`)) deleteFund(f.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                  </span>
                </div>
                <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{formatVND(f.balance)}</div>
                {f.note && <div className="mt-0.5 truncate text-[11px] text-slate-400">{f.note}</div>}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setTxModal({ fund: f, type: "in" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100"><ArrowDownToLine size={14} /> Nạp</button>
                  <button onClick={() => setTxModal({ fund: f, type: "out" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"><ArrowUpFromLine size={14} /> Rút</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lịch chuyển định kỳ */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><Repeat size={17} className="text-indigo-500" /> Lịch chuyển định kỳ <span className="text-slate-400">({schedules.length})</span></h2>
          {fundsWithBal.length >= 2 && <button onClick={() => setSchedModal({})} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Plus size={15} /> Thêm lịch</button>}
        </div>
        {schedules.length === 0 ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-slate-400" />
            <span>Đặt lịch tự chuyển tiền giữa quỹ theo chu kỳ (1 tuần / 2 tuần / 1 tháng). Đến hạn app sẽ <b>nhắc</b> ở đầu trang, bạn bấm <b>“Chuyển ngay”</b> để duyệt.</span>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {schedules.map((sc) => {
              const off = sc.active === false;
              const nx = nextOcc(sc, today);
              const pend = pendingOccs(sc, today).length;
              return (
                <div key={sc.id} className={`group flex items-center gap-3 rounded-xl border p-3 ${off ? "border-slate-100 opacity-60" : pend > 0 ? "border-amber-200 bg-amber-50/40" : "border-slate-100"}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-500"><Repeat size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-800">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[fundColor(sc.fromId)] || "bg-slate-400"}`} />{fundName(sc.fromId)}
                      <ArrowLeftRight size={12} className="text-slate-400" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[fundColor(sc.toId)] || "bg-slate-400"}`} />{fundName(sc.toId)}
                      <span className="text-indigo-600">{formatShort(sc.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                      <Badge tone="indigo">Mỗi {everyLabel(sc.every)}</Badge>
                      {off ? <span className="font-bold text-slate-400">đã tắt</span> : pend > 0 ? <span className="font-bold text-amber-600">đến hạn — chờ xác nhận ở trên</span> : nx ? <span>lần tới {fmtDateVI(nx)}</span> : null}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <button onClick={() => updateFundSchedule(sc.id, { active: off })} title={off ? "Bật lại" : "Tạm tắt"} className={`rounded-lg p-1.5 ${off ? "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" : "text-emerald-500 hover:bg-emerald-50"}`}><Power size={15} /></button>
                    <button onClick={() => setSchedModal(sc)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm("Xoá lịch chuyển này?")) deleteFundSchedule(sc.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Biểu đồ thu nhập vs phân bổ */}
      {chart.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">Thu nhập vs Phân bổ vào quỹ</span>}>Dòng tiền {year}</SectionTitle>
          <div className="overflow-x-auto">
            <div className="h-56 min-w-[560px] sm:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v, k) => [formatVND(v), k === "thu" ? "Thu nhập" : "Đã phân bổ"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="thu" name="Thu nhập" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="pb" name="Đã phân bổ" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      {/* Bảng dòng tiền theo tháng */}
      {monthRows.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-3 sm:p-5">
            <h2 className="text-base font-extrabold text-slate-900">Phân bổ theo tháng · {year}</h2>
            <Badge tone="slate">{monthRows.length} tháng</Badge>
          </div>
          {/* MOBILE: thẻ từng tháng (gọn, không kéo ngang) */}
          <div className="space-y-2 px-4 pb-4 sm:hidden">
            {monthRows.map((r) => {
              const rem = r.income - r.alloc;
              return (
                <div key={r.i} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-800">Tháng {r.i + 1}</span>
                    <span className="text-sm font-bold text-indigo-600">Thu {formatShort(r.income)}</span>
                  </div>
                  {r.alloc > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(funds || []).map((f, j) => (r.fundVals[j] > 0 ? (
                        <span key={f.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          <span className={`h-2 w-2 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} /> {f.name} {formatShort(r.fundVals[j])}
                        </span>
                      ) : null))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] font-bold">{rem > 0 ? <span className="text-amber-600">Chưa chia {formatShort(rem)}</span> : <span className="text-emerald-600">✓ Đã chia hết</span>}</div>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-extrabold text-slate-700">
              <span>Cả năm {year}</span>
              <span>Thu {formatShort(incomeYear)} · tồn {formatShort(Math.max(0, incomeYear - inflow.total.reduce((a, b) => a + b, 0)))}</span>
            </div>
          </div>

          {/* DESKTOP: bảng */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 text-left text-[11px] font-bold uppercase text-slate-400">
                  <th className="px-4 py-2.5 sm:px-5">Tháng</th>
                  <th className="px-3 py-2.5 text-right">Thu nhập</th>
                  {(funds || []).map((f) => <th key={f.id} className="px-3 py-2.5 text-right"><span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} />{f.name}</span></th>)}
                  <th className="px-3 py-2.5 text-right">Tồn (chưa chia)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthRows.map((r) => (
                  <tr key={r.i} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700 sm:px-5">Tháng {r.i + 1}</td>
                    <td className="px-3 py-3 text-right font-bold text-indigo-600">{formatShort(r.income)}</td>
                    {r.fundVals.map((v, j) => <td key={j} className="px-3 py-3 text-right text-slate-600">{v ? formatShort(v) : "—"}</td>)}
                    <td className={`px-3 py-3 text-right font-bold ${r.income - r.alloc > 0 ? "text-amber-600" : "text-slate-300"}`}>{r.income - r.alloc > 0 ? formatShort(r.income - r.alloc) : "0"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-extrabold">
                  <td className="px-4 py-3 sm:px-5">Cả năm</td>
                  <td className="px-3 py-3 text-right text-indigo-600">{formatShort(incomeYear)}</td>
                  {(funds || []).map((f) => <td key={f.id} className="px-3 py-3 text-right text-slate-700">{formatShort((inflow.byFund[f.id] || []).reduce((a, b) => a + b, 0))}</td>)}
                  <td className="px-3 py-3 text-right text-amber-600">{formatShort(Math.max(0, incomeYear - inflow.total.reduce((a, b) => a + b, 0)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Lịch sử giao dịch quỹ */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3 sm:p-5">
          <h2 className="text-base font-extrabold text-slate-900">Giao dịch quỹ gần đây</h2>
          <Badge tone="slate">{(fundTx || []).length}</Badge>
        </div>
        {recentTx.length === 0 ? (
          <div className="px-4 pb-8 pt-2 text-center text-sm text-slate-400">Chưa có giao dịch. Bấm "Phân bổ thu nhập" hoặc "Nạp" trên từng quỹ.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentTx.map((t) => {
              const isIn = t.type !== "out";
              return (
                <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 sm:px-5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{isIn ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[fundColor(t.fundId)] || "bg-slate-400"}`} /><span className="truncate text-sm font-bold text-slate-700">{fundName(t.fundId)}</span></div>
                    <div className="truncate text-[11px] text-slate-400">{fmtDateVI(t.date)}{t.note ? " · " + t.note : ""}</div>
                  </div>
                  <div className={`shrink-0 text-sm font-extrabold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>{isIn ? "+" : "−"}{formatShort(t.amount)}</div>
                  <button onClick={() => { if (confirm("Xoá giao dịch này? (phiếu chuyển quỹ sẽ xoá cả 2 chiều)")) deleteFundTx(t.id); }} className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {fundModal && <FundModal initial={fundModal.id ? fundModal : null} onClose={() => setFundModal(null)} onSave={(data) => (fundModal.id ? updateFund(fundModal.id, data) : addFund(data))} />}
      {txModal && <TxModal fund={txModal.fund} type={txModal.type} onClose={() => setTxModal(null)} onSave={addFundTx} />}
      {allocOpen && <AllocateModal funds={funds || []} defaultAmount={unallocated} onClose={() => setAllocOpen(false)} onSave={allocateFunds} />}
      {transferOpen && <TransferModal funds={fundsWithBal} onClose={() => setTransferOpen(false)} onSave={transferFund} />}
      {schedModal && <ScheduleModal initial={schedModal.id ? schedModal : null} funds={funds || []} onClose={() => setSchedModal(null)} onSave={(data) => (schedModal.id ? updateFundSchedule(schedModal.id, data) : addFundSchedule(data))} />}
    </div>
  );
}
