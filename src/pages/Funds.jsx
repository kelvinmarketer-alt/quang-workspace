import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Plus, X, Trash2, Pencil, PiggyBank, ArrowDownToLine, ArrowUpFromLine, Sparkles, ArrowLeftRight, Repeat, BellRing, CalendarClock, Power, SkipForward, Camera, Loader2, Check, AlertCircle, Images } from "lucide-react";
import { Card, SectionTitle, Badge, formatVND, formatShort, MoneyInput } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { FUND_COLORS } from "../data/seed.js";
import { fundBalance, monthlyGrossProfit, monthlyFundInflow, grossProfitToDate, projectYears } from "../lib/selectors.js";
import { todayISO, fmtDateVI } from "../lib/format.js";
import { aiReadExpense, imageToDataUrl } from "../lib/ai.js";

const TONE_BG = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500", violet: "bg-violet-500", teal: "bg-teal-500", pink: "bg-pink-500" };
const TONE_GRAD = { indigo: "from-indigo-500 to-violet-500", emerald: "from-emerald-500 to-teal-500", rose: "from-rose-500 to-pink-500", sky: "from-sky-500 to-cyan-500", amber: "from-amber-500 to-orange-500", violet: "from-violet-500 to-purple-500", teal: "from-teal-500 to-emerald-500", pink: "from-pink-500 to-rose-500" };
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
const monthLabel = (iso) => { const [y, m] = (iso || "").split("-"); return m ? `T${Number(m)}/${y}` : ""; };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const EVERY = [["week", "1 tuần"], ["2week", "2 tuần"], ["month", "1 tháng"]];
const everyLabel = (v) => (EVERY.find(([k]) => k === v) || EVERY[1])[1];
// Kỳ thứ k của lịch (neo theo startDate, KHÔNG cộng dồn để tránh trôi ngày cuối tháng)
function occAt(sc, k) {
  const base = new Date(sc.startDate + "T00:00:00");
  if (sc.every === "week") return new Date(base.getTime() + k * 7 * 86400000);
  if (sc.every === "2week") return new Date(base.getTime() + k * 14 * 86400000);
  const m = base.getMonth() + k; // 1 tháng: neo theo ngày gốc, kẹp về cuối tháng nếu tràn (giống bot)
  const y = base.getFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const lastDay = new Date(y, mm + 1, 0).getDate();
  return new Date(y, mm, Math.min(base.getDate(), lastDay));
}
// Các kỳ ĐÃ ĐẾN HẠN (≤ hôm nay) mà chưa xử lý (sau lastDone). Trả mảng ISO tăng dần.
function pendingOccs(sc, today) {
  if (sc.active === false || !sc.startDate) return [];
  const last = sc.lastDone || "";
  const out = [];
  for (let k = 0; k < 400; k++) {
    const iso = isoOf(occAt(sc, k));
    if (iso > today) break;
    if (iso > last) out.push(iso);
  }
  return out;
}
// Kỳ KẾ TIẾP (> hôm nay) để hiển thị "lần tới"
function nextOcc(sc, today) {
  if (sc.active === false || !sc.startDate) return null;
  for (let k = 0; k < 400; k++) { const iso = isoOf(occAt(sc, k)); if (iso > today && iso > (sc.lastDone || "")) return iso; }
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
          <h3 className="text-lg font-extrabold">{isIn ? "Nạp vào" : "Chi tiêu từ"} quỹ {fund.name}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số tiền *</span>
          <MoneyInput value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} autoFocus className={inputCls} placeholder="2.000.000" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ngày</span>
          <input type="date" value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} className={inputCls} /></label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">{isIn ? "Ghi chú" : "Chi cho việc gì *"}</span>
          <input value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} className={inputCls} placeholder={isIn ? "Nguồn tiền" : "VD: mua đồ, biếu bố mẹ, rút ra mặt…"} /></label>
        <button onClick={() => { if (num(f.amount) > 0) { onSave({ fundId: fund.id, amount: num(f.amount), date: f.date, type, note: f.note.trim() }); onClose(); } }} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg ${isIn ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" : "bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30"}`}>{isIn ? "Nạp tiền" : "Ghi khoản chi"}</button>
      </div>
    </div>
  );
}

/* ---- Modal chuyển tiền giữa 2 quỹ ---- */
function TransferModal({ funds, initialFrom, onClose, onSave }) {
  const [from, setFrom] = useState(initialFrom || funds[0]?.id || "");
  const [to, setTo] = useState((funds.find((f) => f.id !== (initialFrom || funds[0]?.id)) || {}).id || "");
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

/* ---- Modal phân bổ từ Quỹ công ty vào các quỹ theo % ---- */
function AllocateModal({ funds, defaultAmount, onClose, onSave }) {
  const cap = Math.max(0, defaultAmount || 0); // số dư quỹ công ty — không được chia vượt
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(String(cap || ""));
  // Chia theo %: các quỹ đầu làm tròn, quỹ CUỐI nhận phần dư → tổng luôn KHỚP total (hết lệch làm tròn)
  const splitByPct = (total) => {
    const out = {}; let acc = 0;
    funds.forEach((f, i) => {
      if (i === funds.length - 1) out[f.id] = Math.max(0, total - acc);
      else { const v = Math.round((total * (f.percent || 0)) / 100); out[f.id] = v; acc += v; }
    });
    return out;
  };
  const [rows, setRows] = useState(() => splitByPct(cap));
  const setTotal = (v) => { const t = num(v); setAmount(v); setRows(splitByPct(t)); };
  const allocated = Object.values(rows).reduce((a, b) => a + (Number(b) || 0), 0);
  const total = num(amount);
  const over = allocated > cap; // chia nhiều hơn số dư quỹ công ty
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Phân bổ từ Quỹ công ty</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Chia lợi nhuận gộp trong <b>Quỹ công ty</b> ra các quỹ. Quỹ công ty còn lại: <b className="text-indigo-600">{formatShort(defaultAmount || 0)}</b></p>
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
        <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold ${over ? "bg-rose-50 text-rose-700" : allocated === total ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <span>Đã chia {formatShort(allocated)} / còn {formatShort(cap)}</span>
          <span>{over ? "Vượt quỹ công ty!" : allocated === total ? "Khớp ✓" : `Lệch ${formatShort(Math.abs(total - allocated))}`}</span>
        </div>
        <button disabled={over || allocated <= 0} onClick={() => { const entries = funds.map((f) => ({ fundId: f.id, amount: Number(rows[f.id]) || 0 })); if (!over && entries.some((e) => e.amount > 0)) { onSave(entries, date, `Phân bổ ${monthLabel(date)}`); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">Phân bổ ra các quỹ</button>
      </div>
    </div>
  );
}

/* ---- Modal CHI TỪ ẢNH (nhiều ảnh biên lai) — OpenAI Vision đọc số tiền ---- */
function ExpenseImageModal({ fund, apiKey, model, onClose, onSave }) {
  const [items, setItems] = useState([]); // {id, thumb, status:'reading'|'done'|'error', amount, note, date, error}
  const hasKey = !!(apiKey || "").trim();

  // Đọc 1 ảnh → có thể ra NHIỀU giao dịch → thay dòng placeholder bằng N dòng
  const readOne = async (id, dataUrl) => {
    try {
      const { transactions } = await aiReadExpense({ imageDataUrl: dataUrl, apiKey, model });
      setItems((p) => {
        const idx = p.findIndex((it) => it.id === id);
        if (idx < 0) return p;
        const src = transactions.length ? transactions : [{ amount: 0, date: todayISO(), note: "" }];
        const rows = src.map((t, i) => ({ id: id + "_" + i, thumb: dataUrl, status: t.amount > 0 ? "done" : "empty", amount: t.amount, date: t.date, note: t.note }));
        return [...p.slice(0, idx), ...rows, ...p.slice(idx + 1)];
      });
    } catch (e) {
      setItems((p) => p.map((it) => (it.id === id ? { ...it, status: "error", error: e.message } : it)));
    }
  };

  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type && f.type.startsWith("image/"));
    for (const f of files) {
      const id = "im" + Math.random().toString(36).slice(2, 8);
      let dataUrl;
      try { dataUrl = await imageToDataUrl(f); } catch { continue; }
      setItems((p) => [...p, { id, thumb: dataUrl, status: hasKey ? "reading" : "empty", amount: 0, date: todayISO(), note: "" }]);
      if (hasKey) readOne(id, dataUrl);
    }
  };

  const update = (id, patch) => setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id) => setItems((p) => p.filter((it) => it.id !== id));
  const reading = items.some((it) => it.status === "reading");
  const valid = items.filter((it) => num(it.amount) > 0 && it.status !== "reading");
  const total = valid.reduce((a, it) => a + num(it.amount), 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-extrabold"><Camera size={18} className="text-rose-500" /> Chi từ ảnh · {fund.name}</h3>
            <p className="mt-0.5 text-xs text-slate-400">Tải nhiều ảnh biên lai — AI tự đọc số tiền, bạn ghi chú rồi ghi 1 loạt.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {!hasKey && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> Chưa có OpenAI key (vào <b>Cài đặt</b> để bật tự đọc số tiền). Bạn vẫn thêm ảnh và <b>nhập tay</b> số tiền được.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-center hover:border-fuchsia-300 hover:bg-fuchsia-50/40">
              <Images size={22} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Bộ sưu tập</span>
              <span className="text-[11px] text-slate-400">chọn nhiều ảnh có sẵn</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-center hover:border-rose-300 hover:bg-rose-50/40">
              <Camera size={22} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Chụp ảnh</span>
              <span className="text-[11px] text-slate-400">mở camera điện thoại</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Ảnh chỉ dùng để đọc số tiền — KHÔNG lưu lên hệ thống</p>

          <div className="mt-3 space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2">
                <img src={it.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  {it.status === "reading" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-500"><Loader2 size={13} className="animate-spin" /> Đang đọc…</div>
                  ) : it.status === "error" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500" title={it.error}><AlertCircle size={13} /> Lỗi — nhập tay</div>
                  ) : it.status === "empty" ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600"><AlertCircle size={13} /> Chưa đọc được số — nhập tay</div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600"><Check size={12} /> Đã đọc</div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <MoneyInput value={String(it.amount ?? "")} onChange={(v) => update(it.id, { amount: num(v) })} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-bold" placeholder="0" />
                    <input value={it.date} onChange={(e) => update(it.id, { date: e.target.value })} type="date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                  </div>
                  <input value={it.note} onChange={(e) => update(it.id, { note: e.target.value })} placeholder="Chi cho việc gì…" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                </div>
                <button onClick={() => remove(it.id)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            disabled={!valid.length || reading}
            onClick={() => { onSave(valid.map((it) => ({ fundId: fund.id, amount: num(it.amount), date: it.date, note: (it.note || "").trim() || "Chi (từ ảnh)" }))); onClose(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 disabled:opacity-40"
          >
            {reading ? <><Loader2 size={16} className="animate-spin" /> Đang đọc ảnh…</> : <>Ghi {valid.length || ""} khoản chi · {formatShort(total)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Chi tiết 1 quỹ + lịch sử giao dịch riêng ---- */
function FundDetail({ fund, fundTx, autoCredit = 0, onClose, onAdd, onImage, onTransfer, onDelTx }) {
  const isCompany = fund.role === "company";
  const txs = (fundTx || []).filter((t) => t.fundId === fund.id);
  const totalIn = txs.filter((t) => t.type !== "out").reduce((a, t) => a + num(t.amount), 0) + autoCredit;
  const totalOut = txs.filter((t) => t.type === "out").reduce((a, t) => a + num(t.amount), 0);
  const bal = totalIn - totalOut;
  const asc = [...txs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let run = autoCredit; // khởi điểm = lợi nhuận gộp (với quỹ công ty)
  const txRows = asc.map((t) => { run += t.type === "out" ? -num(t.amount) : num(t.amount); return { ...t, run }; }).reverse();
  const rows = autoCredit > 0
    ? [...txRows, { id: "_auto", note: "Lợi nhuận gộp lũy kế (tự động từ Kế toán)", amount: autoCredit, type: "in", run: autoCredit, synthetic: true }]
    : txRows;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className={`relative bg-gradient-to-br p-5 text-white ${TONE_GRAD[fund.color] || TONE_GRAD.indigo}`}>
          <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/20"><X size={18} /></button>
          <div className="flex items-center gap-2 text-sm font-semibold text-white/90"><PiggyBank size={16} /> {fund.name} · {fund.percent || 0}%</div>
          <div className="mt-1 text-3xl font-extrabold">{formatVND(bal)}</div>
          {fund.note && <div className="mt-0.5 text-xs text-white/80">{fund.note}</div>}
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100">
          <div className="bg-white p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">{isCompany ? "Tổng vào (LN gộp)" : "Tổng nạp"}</div><div className="text-base font-extrabold text-emerald-600">+{formatShort(totalIn)}</div></div>
          <div className="bg-white p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">{isCompany ? "Đã phân bổ/chi" : "Tổng chi"}</div><div className="text-base font-extrabold text-rose-600">−{formatShort(totalOut)}</div></div>
        </div>
        <div className="flex gap-2 border-b border-slate-100 p-3">
          {!isCompany && <button onClick={() => onAdd(fund, "in")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100"><ArrowDownToLine size={14} /> Nạp</button>}
          <button onClick={() => onAdd(fund, "out")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"><ArrowUpFromLine size={14} /> Chi</button>
          <button onClick={() => onImage(fund)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-fuchsia-50 py-2 text-xs font-bold text-fuchsia-600 hover:bg-fuchsia-100"><Camera size={14} /> Ảnh</button>
          <button onClick={() => onTransfer(fund)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100"><ArrowLeftRight size={14} /> {isCompany ? "Phân bổ" : "Chuyển"}</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 pt-3 text-[11px] font-bold uppercase text-slate-400">Lịch sử giao dịch ({rows.length})</div>
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Quỹ chưa có giao dịch nào.</div>
          ) : (
            <div className="mt-1 divide-y divide-slate-50">
              {rows.map((t) => {
                const isIn = t.type !== "out";
                return (
                  <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{isIn ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-700">{t.note || (isIn ? "Nạp tiền" : "Khoản chi")}</div>
                      <div className="text-[11px] text-slate-400">{t.synthetic ? "tự động" : fmtDateVI(t.date)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-extrabold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>{isIn ? "+" : "−"}{formatShort(t.amount)}</div>
                      <div className="text-[10px] text-slate-400">dư {formatShort(t.run)}</div>
                    </div>
                    {t.synthetic ? <span className="w-7 shrink-0" /> : <button onClick={() => onDelTx(t.id)} className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={14} /></button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Funds() {
  const { funds, fundTx, fundSchedules, projects, settings, addFund, updateFund, deleteFund, addFundTx, addFundTxMany, deleteFundTx, allocateFromCompany, transferFund, addFundSchedule, updateFundSchedule, deleteFundSchedule, runFundSchedule, skipFundSchedule } = useData();
  const now = new Date();
  const curY = now.getFullYear();
  const today = todayISO();
  const [year, setYear] = useState(curY);
  const [fundModal, setFundModal] = useState(null); // null | {} | fund
  const [txModal, setTxModal] = useState(null);      // { fund, type }
  const [allocOpen, setAllocOpen] = useState(false);
  const [transferInit, setTransferInit] = useState(null); // null | {} | { from }
  const [schedModal, setSchedModal] = useState(null); // null | {} | schedule
  const [detailId, setDetailId] = useState(null); // quỹ đang xem chi tiết
  const [imgFund, setImgFund] = useState(null); // quỹ đang chi từ ảnh

  const years = useMemo(() => {
    const ys = new Set(projectYears(projects)); ys.add(curY);
    for (const t of fundTx || []) if (t.date) ys.add(new Date(t.date).getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [projects, fundTx, curY]);

  // Quỹ công ty (nguồn = LN gộp) vs các quỹ cá nhân
  const grossTotal = useMemo(() => grossProfitToDate(projects, today), [projects, today]);
  const companyFund = (funds || []).find((f) => f.role === "company");
  const companyBalance = companyFund ? grossTotal + fundBalance(fundTx, companyFund.id) : 0;
  const distributed = grossTotal - companyBalance; // đã phân bổ/chi ra khỏi quỹ công ty

  const personalFunds = useMemo(() => (funds || []).filter((f) => f.role !== "company"), [funds]);
  const personalWithBal = useMemo(() => personalFunds.map((f) => ({ ...f, balance: fundBalance(fundTx, f.id) })), [personalFunds, fundTx]);
  const totalPersonal = personalWithBal.reduce((a, f) => a + f.balance, 0);
  // Danh sách kèm số dư cho chuyển/lịch (gồm cả quỹ công ty với số dư đặc biệt)
  const allWithBal = useMemo(() => (funds || []).map((f) => ({ ...f, balance: f.role === "company" ? companyBalance : fundBalance(fundTx, f.id) })), [funds, fundTx, companyBalance]);
  const pctTotal = personalFunds.reduce((a, f) => a + (Number(f.percent) || 0), 0);

  const gpMonths = useMemo(() => monthlyGrossProfit(projects, year), [projects, year]);
  const inflow = useMemo(() => monthlyFundInflow(fundTx, year, companyFund?.id), [fundTx, year, companyFund?.id]);
  const gpYear = gpMonths.reduce((a, b) => a + b, 0);

  // Bảng theo tháng: LN gộp vs phân bổ ra từng quỹ cá nhân
  const monthRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const fundVals = personalFunds.map((f) => (inflow.byFund[f.id] || [])[i] || 0);
      const alloc = fundVals.reduce((a, b) => a + b, 0);
      if (gpMonths[i] || alloc) rows.push({ i, income: gpMonths[i], alloc, fundVals });
    }
    return rows;
  }, [personalFunds, inflow, gpMonths]);
  const allocYear = monthRows.reduce((a, r) => a + r.alloc, 0);

  // Biểu đồ: LN gộp vs đã phân bổ theo tháng
  const chart = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ name: "T" + (i + 1), thu: gpMonths[i], pb: personalFunds.reduce((a, f) => a + ((inflow.byFund[f.id] || [])[i] || 0), 0) })).filter((x) => x.thu || x.pb), [gpMonths, inflow, personalFunds]);

  const recentTx = useMemo(() => (fundTx || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 40), [fundTx]);
  const fundName = (id) => (funds || []).find((f) => f.id === id)?.name || "—";
  const fundColor = (id) => (funds || []).find((f) => f.id === id)?.color || "slate";

  // Lịch chuyển định kỳ: kỳ đã đến hạn (chờ xác nhận) + danh sách lịch
  const schedules = fundSchedules || [];
  const due = useMemo(() => schedules.map((sc) => ({ sc, occs: pendingOccs(sc, today) })).filter((d) => d.occs.length > 0), [schedules, today]);
  const detailFund = (funds || []).find((f) => f.id === detailId);

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

      {/* Thanh năm */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            {years.map((y) => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          <div className="text-sm font-semibold text-slate-400">LN gộp {year}: <span className="text-slate-700">{formatVND(gpYear)}</span> · Đã phân bổ <span className="text-slate-700">{formatShort(allocYear)}</span></div>
        </div>
      </Card>

      {/* QUỸ CÔNG TY — nguồn = Lợi nhuận gộp, người dùng điều phối ra các quỹ */}
      {companyFund && (
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 p-5 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-200"><PiggyBank size={14} /> Quỹ công ty · nguồn Lợi nhuận gộp</div>
              <div className="mt-1 text-3xl font-extrabold sm:text-4xl">{formatVND(companyBalance)}</div>
              <div className="mt-0.5 text-xs text-indigo-200">còn lại chưa phân bổ</div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span className="text-indigo-200">LN gộp lũy kế: <b className="text-white">{formatShort(grossTotal)}</b></span>
                <span className="text-indigo-200">Đã phân bổ/chi: <b className="text-white">{formatShort(distributed)}</b></span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setAllocOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow hover:bg-indigo-50"><Sparkles size={15} /> Phân bổ</button>
              <button onClick={() => setDetailId(companyFund.id)} className="rounded-xl border border-white/30 px-3 py-2 text-sm font-bold text-white hover:bg-white/10">Chi tiết</button>
            </div>
          </div>
        </div>
      )}

      {/* Lưới quỹ cá nhân */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">Các quỹ cá nhân <span className="text-slate-400">({personalWithBal.length})</span> · Tổng <span className="text-indigo-600">{formatShort(totalPersonal)}</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            {pctTotal !== 100 && personalWithBal.length > 0 && <Badge tone={pctTotal > 100 ? "rose" : "amber"}>Tổng % = {pctTotal}</Badge>}
            {allWithBal.length >= 2 && <button onClick={() => setTransferInit({})} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><ArrowLeftRight size={15} /> Chuyển quỹ</button>}
            <button onClick={() => setFundModal({})} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Plus size={15} /> Thêm quỹ</button>
          </div>
        </div>

        {personalWithBal.length === 0 ? (
          <Card><div className="py-10 text-center"><PiggyBank size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có quỹ cá nhân nào</div><div className="mt-1 text-xs text-slate-400">Tạo các quỹ: Đầu tư, Cá nhân, Gia đình, Du lịch…</div></div></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {personalWithBal.map((f) => (
              <div key={f.id} className="card group relative flex flex-col p-4">
                <span className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <button onClick={() => setFundModal(f)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={15} /></button>
                  <button onClick={() => { if (confirm(`Xoá quỹ "${f.name}" và toàn bộ giao dịch của quỹ?`)) deleteFund(f.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </span>
                <button onClick={() => setDetailId(f.id)} className="flex flex-col text-left">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg ${TONE_GRAD[f.color] || TONE_GRAD.indigo}`}><PiggyBank size={18} /></span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-800">{f.name}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{f.percent || 0}% · phân bổ</div>
                    </div>
                  </div>
                  <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{formatVND(f.balance)}</div>
                  {f.note && <div className="mt-0.5 truncate text-[11px] text-slate-400">{f.note}</div>}
                  <div className="mt-1 text-[11px] font-semibold text-indigo-500">{(fundTx || []).filter((t) => t.fundId === f.id).length} giao dịch · Xem lịch sử →</div>
                </button>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setTxModal({ fund: f, type: "in" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100"><ArrowDownToLine size={14} /> Nạp</button>
                  <button onClick={() => setTxModal({ fund: f, type: "out" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"><ArrowUpFromLine size={14} /> Chi</button>
                  <button onClick={() => setImgFund(f)} title="Chi từ ảnh biên lai" className="flex shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 px-2.5 text-fuchsia-600 hover:bg-fuchsia-100"><Camera size={15} /></button>
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
          {allWithBal.length >= 2 && <button onClick={() => setSchedModal({})} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Plus size={15} /> Thêm lịch</button>}
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
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">LN gộp vs Phân bổ vào quỹ</span>}>Dòng tiền {year}</SectionTitle>
          <div className="overflow-x-auto">
            <div className="h-56 min-w-[560px] sm:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v, k) => [formatVND(v), k === "thu" ? "LN gộp" : "Đã phân bổ"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="thu" name="LN gộp" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
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
                    <span className="text-sm font-bold text-indigo-600">LN gộp {formatShort(r.income)}</span>
                  </div>
                  {r.alloc > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {personalFunds.map((f, j) => (r.fundVals[j] > 0 ? (
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
              <span>LN gộp {formatShort(gpYear)} · tồn {formatShort(Math.max(0, gpYear - allocYear))}</span>
            </div>
          </div>

          {/* DESKTOP: bảng */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 text-left text-[11px] font-bold uppercase text-slate-400">
                  <th className="px-4 py-2.5 sm:px-5">Tháng</th>
                  <th className="px-3 py-2.5 text-right">LN gộp</th>
                  {personalFunds.map((f) => <th key={f.id} className="px-3 py-2.5 text-right"><span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} />{f.name}</span></th>)}
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
                  <td className="px-3 py-3 text-right text-indigo-600">{formatShort(gpYear)}</td>
                  {personalFunds.map((f) => <td key={f.id} className="px-3 py-3 text-right text-slate-700">{formatShort((inflow.byFund[f.id] || []).reduce((a, b) => a + b, 0))}</td>)}
                  <td className="px-3 py-3 text-right text-amber-600">{formatShort(Math.max(0, gpYear - allocYear))}</td>
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

      {/* FundDetail render TRƯỚC để các modal thao tác (Nạp/Chi/Chuyển) mở từ trong nó nằm ĐÈ LÊN trên */}
      {detailFund && <FundDetail fund={detailFund} fundTx={fundTx} autoCredit={detailFund.role === "company" ? grossTotal : 0} onClose={() => setDetailId(null)} onAdd={(fund, type) => setTxModal({ fund, type })} onImage={(fund) => setImgFund(fund)} onTransfer={(fund) => setTransferInit({ from: fund.id })} onDelTx={(id) => { if (confirm("Xoá giao dịch này? (phiếu chuyển quỹ sẽ xoá cả 2 chiều)")) deleteFundTx(id); }} />}
      {imgFund && <ExpenseImageModal fund={imgFund} apiKey={settings?.openaiKey} model={settings?.openaiModel} onClose={() => setImgFund(null)} onSave={(txs) => addFundTxMany(txs)} />}
      {fundModal && <FundModal initial={fundModal.id ? fundModal : null} onClose={() => setFundModal(null)} onSave={(data) => (fundModal.id ? updateFund(fundModal.id, data) : addFund(data))} />}
      {txModal && <TxModal fund={txModal.fund} type={txModal.type} onClose={() => setTxModal(null)} onSave={addFundTx} />}
      {allocOpen && companyFund && <AllocateModal funds={personalFunds} defaultAmount={Math.max(0, companyBalance)} onClose={() => setAllocOpen(false)} onSave={(entries, date, note) => allocateFromCompany(companyFund.id, entries, date, note)} />}
      {transferInit && <TransferModal funds={allWithBal} initialFrom={transferInit.from} onClose={() => setTransferInit(null)} onSave={transferFund} />}
      {schedModal && <ScheduleModal initial={schedModal.id ? schedModal : null} funds={funds || []} onClose={() => setSchedModal(null)} onSave={(data) => (schedModal.id ? updateFundSchedule(schedModal.id, data) : addFundSchedule(data))} />}
    </div>
  );
}
