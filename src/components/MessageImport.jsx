import { useMemo, useState } from "react";
import { X, Sparkles, ClipboardPaste, Loader2, ArrowLeft, CalendarClock, Wallet, Check } from "lucide-react";
import { DateField, MoneyInput } from "./ui.jsx";
import { guardClose, markDirty } from "./ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import { aiReadMessage } from "../lib/ai.js";
import { normalizeItems, buildActions, eligibleProjects } from "../lib/msgImport.js";

// DÁN TIN NHẮN KHÁCH → việc / lịch hẹn / khoản thu (09/11/2026). AI chỉ đề xuất; chủ xem, sửa, bấm "Thêm" mới ghi vào app.
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300";
const labelCls = "mb-1 block text-[11px] font-bold text-slate-400";
const EXAMPLE = "Anh ơi tuần sau thứ 4 em chuyển đợt 2 là 8 triệu nhé. Thứ 6 mình họp duyệt giao diện lúc 3 giờ chiều, anh nhớ gửi em bản demo trước nha.";

export default function MessageImportModal({ onClose }) {
  const { customerList = [], projects = [], addTask, addInstallment, settings, canEdit, setToast } = useData();
  const customers = useMemo(() => customerList.filter((c) => c.active !== false), [customerList]);
  const canPay = typeof canEdit === "function" ? !!canEdit("customers") : true;
  const [text, setText] = useState(""), [phase, setPhase] = useState("input"), [items, setItems] = useState([]), [err, setErr] = useState("");

  const analyze = async () => {
    if (!text.trim() || phase === "loading") return;
    setErr(""); setPhase("loading");
    try {
      const raw = await aiReadMessage({ text, customers: customerList, projects, apiKey: settings?.openaiKey });
      const list = normalizeItems(raw, { customers: customerList, projects });
      if (!list.length) { setErr("AI không thấy việc, lịch hẹn hay khoản thu nào trong tin nhắn này. Thử dán đủ đoạn hơn, hoặc dùng ô thêm việc nhanh."); setPhase("input"); return; }
      setItems(list); setPhase("review");
    } catch (e) { setErr(String(e?.message || e)); setPhase("input"); }
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); else setErr("Bộ nhớ tạm đang trống."); } catch { setErr("Trình duyệt không cho đọc bộ nhớ tạm — hãy dán thủ công vào ô bên dưới (Cmd/Ctrl + V)."); }
  };
  const update = (id, patch) => setItems((prev) => prev.map((x) => {
    if (x.id !== id) return x;
    const next = { ...x, ...patch };
    if ("customerId" in patch && x.type === "payment") { // đổi khách → chọn lại dự án (chỉ tự chọn khi chỉ có 1 dự án phù hợp)
      const el = patch.customerId ? eligibleProjects(projects, patch.customerId) : [];
      next.projectId = el.length === 1 ? el[0].id : "";
      next.customerName = customers.find((c) => c.id === patch.customerId)?.name || x.customerName;
    }
    return next;
  }));

  const plan = useMemo(() => buildActions(items, { projects, customers: customerList, canPay }), [items, projects, customerList, canPay]);
  const total = plan.tasks.length + plan.installments.length;
  const add = () => {
    if (!total) return;
    for (const { asPayment, ...t } of plan.tasks) addTask(t); // eslint-disable-line no-unused-vars
    for (const x of plan.installments) addInstallment(x.projectId, x.inst);
    const parts = [];
    const nTask = plan.tasks.length;
    if (nTask) parts.push(`${nTask} việc`);
    if (plan.installments.length) parts.push(`${plan.installments.length} đợt thu`);
    setToast && setToast({ text: `Đã thêm ${parts.join(" và ")} từ tin nhắn` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={phase === "review" ? onClose : guardClose(onClose)} />
      <div role="dialog" aria-modal="true" aria-label="Dán tin nhắn khách" className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><Sparkles size={18} className="text-indigo-500" /> Dán tin nhắn khách → việc, hẹn, khoản thu</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {phase !== "review" ? (
          <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="msg-text" className="text-[13px] font-bold text-slate-600">Dán đoạn tin nhắn của khách (Zalo, Messenger, email…)</label>
              <button type="button" onClick={paste} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50"><ClipboardPaste size={13} /> Dán từ bộ nhớ tạm</button>
            </div>
            <textarea id="msg-text" autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={phase === "loading"} maxLength={6000}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze(); }}
              placeholder={`Ví dụ: ${EXAMPLE}`} className={`${inputCls} resize-y text-[14px] leading-relaxed`} />
            <button type="button" onClick={() => setText(EXAMPLE)} className="text-[12px] font-semibold text-slate-400 underline-offset-2 hover:text-indigo-600 hover:underline">Điền thử tin nhắn mẫu</button>
            {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-500">AI đọc tin nhắn rồi <b>đề xuất</b>; bạn xem lại và sửa trước khi thêm. Nội dung tin nhắn được gửi cho OpenAI để phân tích (qua máy chủ riêng của bạn), tốn khoảng vài đồng mỗi lần. Đừng dán mật khẩu hoặc số thẻ.</div>
            <button type="button" onClick={analyze} disabled={!text.trim() || phase === "loading"} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {phase === "loading" ? <><Loader2 size={16} className="animate-spin" /> Đang đọc tin nhắn…</> : <><Sparkles size={16} /> Phân tích tin nhắn</>}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
              <div className="text-[13px] text-slate-500">AI tìm thấy <b>{items.length}</b> mục. Bỏ tick mục không cần, sửa chỗ chưa đúng.</div>
              {items.map((x) => {
                const el = x.type === "payment" && x.customerId ? eligibleProjects(projects, x.customerId) : [];
                const asTask = x.include && x.type === "payment" && !plan.installments.some((i) => i.projectId === x.projectId && x.projectId);
                return (
                  <div key={x.id} className={`rounded-2xl border p-3 ${x.include ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                    <label className="mb-2 flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={x.include} onChange={(e) => update(x.id, { include: e.target.checked })} className="h-4 w-4 accent-indigo-600" aria-label="Thêm mục này" />
                      {x.type === "payment"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700"><Wallet size={12} /> Khoản thu</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-700"><CalendarClock size={12} /> {x.time ? "Hẹn / việc có giờ" : "Việc"}</span>}
                    </label>
                    {x.type === "task" ? (
                      <div className="grid gap-2 sm:grid-cols-6">
                        <div className="sm:col-span-6"><label className={labelCls}>Việc</label><input aria-label="Tên việc" className={inputCls} value={x.title} onChange={(e) => update(x.id, { title: e.target.value })} /></div>
                        <div className="sm:col-span-2"><label className={labelCls}>Ngày</label><DateField value={x.date} onChange={(v) => update(x.id, { date: v })} className={inputCls} /></div>
                        <div className="sm:col-span-1"><label className={labelCls}>Giờ</label><input type="time" aria-label="Giờ" className={inputCls} value={x.time} onChange={(e) => update(x.id, { time: e.target.value })} /></div>
                        <div className="sm:col-span-1"><label className={labelCls}>Ưu tiên</label><select aria-label="Ưu tiên" className={inputCls} value={x.priority} onChange={(e) => update(x.id, { priority: e.target.value })}><option value="high">Gấp</option><option value="med">Thường</option><option value="low">Không vội</option></select></div>
                        <div className="sm:col-span-2"><label className={labelCls}>Khách</label>
                          <select aria-label="Khách" className={inputCls} value={x.customerId} onChange={(e) => update(x.id, { customerId: e.target.value })}><option value="">(không gắn khách)</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-6">
                        <div className="sm:col-span-3"><label className={labelCls}>Khách</label>
                          <select aria-label="Khách" className={inputCls} value={x.customerId} onChange={(e) => update(x.id, { customerId: e.target.value })}><option value="">{x.customerName ? `(chưa khớp: ${x.customerName})` : "(chưa chọn khách)"}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        <div className="sm:col-span-3"><label className={labelCls}>Dự án</label>
                          <select aria-label="Dự án" className={inputCls} value={x.projectId} onChange={(e) => update(x.id, { projectId: e.target.value })}><option value="">(chưa chọn → thêm thành việc nhắc thu)</option>{el.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div className="sm:col-span-2"><label className={labelCls}>Số tiền</label><MoneyInput value={String(x.amount)} onChange={(v) => update(x.id, { amount: Number(v) || 0 })} className={inputCls} /></div>
                        <div className="sm:col-span-2"><label className={labelCls}>Đợt</label><input aria-label="Tên đợt" className={inputCls} value={x.label} onChange={(e) => update(x.id, { label: e.target.value })} /></div>
                        <div className="sm:col-span-2"><label className={labelCls}>Ngày thu dự kiến</label><DateField value={x.date} onChange={(v) => update(x.id, { date: v })} className={inputCls} /></div>
                        {x.include && <div className="text-[11.5px] sm:col-span-6 text-slate-400">{asTask ? "Sẽ thêm thành VIỆC nhắc thu (chưa chọn dự án phù hợp, hoặc dự án ADS / Lương)." : "Sẽ thêm thành ĐỢT THU chưa thu của dự án đã chọn — hiện trong công nợ và khoản cần thu."}</div>}
                      </div>
                    )}
                    {x.note && <div className="mt-2 text-[11.5px] text-slate-400">Ghi chú: {x.note}</div>}
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
              <button type="button" onClick={() => setPhase("input")} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50"><ArrowLeft size={14} /> Sửa tin nhắn</button>
              <div className="ml-auto text-[12px] text-slate-500">{plan.tasks.length} việc · {plan.installments.length} đợt thu</div>
              <button type="button" onClick={add} disabled={!total} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Check size={16} /> Thêm {total || ""} mục</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
