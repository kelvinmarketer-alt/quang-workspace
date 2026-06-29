import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Plus, X, Trash2, Pencil, PiggyBank, Wallet, ArrowDownToLine, ArrowUpFromLine, Sparkles, TrendingUp } from "lucide-react";
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
  const { funds, fundTx, projects, addFund, updateFund, deleteFund, addFundTx, deleteFundTx, allocateFunds } = useData();
  const now = new Date();
  const curY = now.getFullYear();
  const [year, setYear] = useState(curY);
  const [fundModal, setFundModal] = useState(null); // null | {} | fund
  const [txModal, setTxModal] = useState(null);      // { fund, type }
  const [allocOpen, setAllocOpen] = useState(false);

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

  return (
    <div className="space-y-4 sm:space-y-5">
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
          <div className="flex items-center gap-2">
            {pctTotal !== 100 && fundsWithBal.length > 0 && <Badge tone={pctTotal > 100 ? "rose" : "amber"}>Tổng % = {pctTotal}</Badge>}
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
                  <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => setFundModal(f)} className="rounded p-1 text-slate-300 hover:text-indigo-600"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm(`Xoá quỹ "${f.name}" và toàn bộ giao dịch của quỹ?`)) deleteFund(f.id); }} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
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
          <div className="overflow-x-auto">
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
                  <button onClick={() => { if (confirm("Xoá giao dịch này?")) deleteFundTx(t.id); }} className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {fundModal && <FundModal initial={fundModal.id ? fundModal : null} onClose={() => setFundModal(null)} onSave={(data) => (fundModal.id ? updateFund(fundModal.id, data) : addFund(data))} />}
      {txModal && <TxModal fund={txModal.fund} type={txModal.type} onClose={() => setTxModal(null)} onSave={addFundTx} />}
      {allocOpen && <AllocateModal funds={funds || []} defaultAmount={unallocated} onClose={() => setAllocOpen(false)} onSave={allocateFunds} />}
    </div>
  );
}
