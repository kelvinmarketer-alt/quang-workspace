// Tách từ pages/Funds.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Camera, ChevronDown, Pencil, PiggyBank, Trash2, X } from "lucide-react";
import { Badge, Card, formatShort, formatVND } from "../ui.jsx";
import { TONE_GRAD, catTone, num } from "./fundUtil.js";
import { fmtDateVI } from "../../lib/format.js";
import { guardClose, markDirty } from "../ConfirmDialog.jsx";
import { useState } from "react";

export function FundDetail({ fund, fundTx, cats, autoCredit = 0, autoDebit = 0, autoDebt = 0, onClose, onAdd, onImage, onTransfer, onDelTx, onEditTx }) {
  const isCompany = fund.role === "company";
  const txs = (fundTx || []).filter((t) => t.fundId === fund.id);
  const totalIn = txs.filter((t) => t.type !== "out").reduce((a, t) => a + num(t.amount), 0) + autoCredit;
  const totalOut = txs.filter((t) => t.type === "out").reduce((a, t) => a + num(t.amount), 0) + autoDebit + autoDebt;
  const bal = totalIn - totalOut;
  const asc = [...txs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let run = autoCredit - autoDebit - autoDebt; // khởi điểm = LN gộp − chi phí vận hành − công nợ (tiền thực có)
  const txRows = asc.map((t) => { run += t.type === "out" ? -num(t.amount) : num(t.amount); return { ...t, run }; }).reverse();
  // 3 dòng tự động (dưới cùng = cũ nhất): +LN gộp lũy kế, −Chi phí vận hành, −Công nợ chưa thu
  const autoRows = [];
  if (autoDebt > 0) autoRows.push({ id: "_debt", note: "Công nợ chưa thu (chưa vào tiền mặt)", amount: autoDebt, type: "out", run: autoCredit - autoDebit - autoDebt, synthetic: true });
  if (autoDebit > 0) autoRows.push({ id: "_opex", note: "Chi phí vận hành lũy kế (tự động từ Kế toán)", amount: autoDebit, type: "out", run: autoCredit - autoDebit, synthetic: true });
  if (autoCredit > 0) autoRows.push({ id: "_auto", note: "Lợi nhuận gộp lũy kế (tự động từ Kế toán)", amount: autoCredit, type: "in", run: autoCredit, synthetic: true });
  // Gom giao dịch thật theo NGÀY (mới → cũ) để hiển thị dạng xổ
  const byDate = [];
  { const map = new Map();
    for (const t of txRows) { const d = (t.date || "").slice(0, 10) || "—"; if (!map.has(d)) map.set(d, []); map.get(d).push(t); }
    for (const [date, items] of map) byDate.push({ date, items, inSum: items.filter((x) => x.type !== "out").reduce((a, x) => a + num(x.amount), 0), outSum: items.filter((x) => x.type === "out").reduce((a, x) => a + num(x.amount), 0) }); }
  const [openDays, setOpenDays] = useState(() => new Set(byDate.length ? [byDate[0].date] : []));
  const toggleDay = (d) => setOpenDays((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const renderRow = (t, indent) => {
    const isIn = t.type !== "out";
    return (
      <div key={t.id} className={`group flex items-center gap-3 py-2.5 pr-4 ${indent ? "pl-10" : "pl-4"}`}>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{isIn ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-700">{t.note || (isIn ? "Nạp tiền" : "Khoản chi")}</div>
          {t.cat && <div className="mt-0.5"><Badge tone={catTone(cats, t.cat)}>{t.cat}</Badge></div>}
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-extrabold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>{isIn ? "+" : "−"}{formatShort(t.amount)}</div>
          <div className="text-[10px] text-slate-400">dư {formatShort(t.run)}</div>
        </div>
        {t.synthetic ? <span className="w-[66px] shrink-0" /> : (
          <span className="-mr-2 flex shrink-0 items-center">{/* luôn hiện (iPad không có hover) */}
            <button onClick={() => onEditTx(t)} className="rounded-lg p-2.5 text-slate-300 transition hover:bg-indigo-50 hover:text-indigo-600" title="Sửa"><Pencil size={14} /></button>
            <button onClick={() => onDelTx(t.id)} className="rounded-lg p-2.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600" title="Xoá"><Trash2 size={14} /></button>
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className={`relative bg-gradient-to-br p-5 text-white ${TONE_GRAD[fund.color] || TONE_GRAD.indigo}`}>
          <button aria-label="Đóng" title="Đóng" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/20"><X size={18} /></button>
          <div className="flex items-center gap-2 text-sm font-semibold text-white/90"><PiggyBank size={16} /> {fund.name} · {fund.percent || 0}%</div>
          <div className="mt-1 text-3xl font-extrabold">{formatVND(bal)}</div>
          {fund.note && <div className="mt-0.5 text-xs text-white/80">{fund.note}</div>}
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100">
          <div className="bg-white p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">{isCompany ? "Tổng vào (LN gộp)" : "Tổng nạp"}</div><div className="text-base font-extrabold text-emerald-600">+{formatShort(totalIn)}</div></div>
          <div className="bg-white p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">{isCompany ? "Chi phí + phân bổ" : "Tổng chi"}</div><div className="text-base font-extrabold text-rose-600">−{formatShort(totalOut)}</div></div>
        </div>
        <div className="flex gap-2 border-b border-slate-100 p-3">
          {!isCompany && <button onClick={() => onAdd(fund, "in")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100"><ArrowDownToLine size={14} /> Nạp</button>}
          <button onClick={() => onAdd(fund, "out")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"><ArrowUpFromLine size={14} /> Chi</button>
          <button onClick={() => onImage(fund)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-fuchsia-50 py-2 text-xs font-bold text-fuchsia-600 hover:bg-fuchsia-100"><Camera size={14} /> Ảnh</button>
          <button onClick={() => onTransfer(fund)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100"><ArrowLeftRight size={14} /> {isCompany ? "Phân bổ" : "Chuyển"}</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 pt-3 text-[11px] font-bold uppercase text-slate-400">Lịch sử giao dịch ({txs.length}) · bấm ngày để xem</div>
          {byDate.length === 0 && autoRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Quỹ chưa có giao dịch nào.</div>
          ) : (
            <div className="mt-1 divide-y divide-slate-100">
              {byDate.map((g) => {
                const open = openDays.has(g.date);
                return (
                  <div key={g.date}>
                    <button onClick={() => toggleDay(g.date)} className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-slate-50 ${open ? "bg-slate-50/60" : ""}`}>
                      <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                      <span className="text-sm font-extrabold text-slate-700">{fmtDateVI(g.date)}</span>
                      <Badge tone="slate">{g.items.length}</Badge>
                      <span className="ml-auto flex items-center gap-2 text-xs font-bold">
                        {g.inSum > 0 && <span className="text-emerald-600">+{formatShort(g.inSum)}</span>}
                        {g.outSum > 0 && <span className="text-rose-600">−{formatShort(g.outSum)}</span>}
                      </span>
                    </button>
                    {open && <div className="divide-y divide-slate-50 bg-slate-50/40">{g.items.map((t) => renderRow(t, true))}</div>}
                  </div>
                );
              })}
              {autoRows.length > 0 && <div className="divide-y divide-slate-50 border-t-2 border-slate-100 bg-slate-50/30">{autoRows.map((t) => renderRow(t, false))}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Mục xổ gọn cho công cụ phụ ---- */
export function Fold({ id, open, onToggle, icon: Icon, title, badge, hint, flush, children }) {
  const isOpen = open.has(id);
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={() => onToggle(id)} aria-expanded={isOpen} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-slate-50 sm:px-5">
        <Icon size={17} className="shrink-0 text-indigo-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold text-slate-900">{title}</span>
          {hint && <span className="block truncate text-[11px] font-semibold text-slate-400">{hint}</span>}
        </span>
        {badge && <Badge tone="slate">{badge}</Badge>}
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className={flush ? "" : "px-4 pb-4 sm:px-5 sm:pb-5"}>{children}</div>}
    </Card>
  );
}
