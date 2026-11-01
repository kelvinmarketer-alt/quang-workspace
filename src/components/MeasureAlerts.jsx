// Thông báo "job chưa gắn đo lường" (01/11) — dùng ở Tổng quan (tab Cảnh báo), Trung tâm báo cáo và chuông.
// "Gắn kênh" mở đúng khách + bật sẵn ô gắn kênh; "Không cần đo" → settings.measureSkip[projectId] (bật lại ở Trung tâm báo cáo).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, Link2, EyeOff, Undo2 } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { todayISO } from "../lib/format.js";

export function useMeasureSkip() {
  const { settings = {}, setSettings, setToast } = useData();
  const skip = settings.measureSkip || {};
  const hide = (x) => { setSettings({ measureSkip: { ...skip, [x.id]: todayISO() } }); setToast?.({ text: `Không báo nữa: ${x.job}` }); };
  const unhide = (id) => { const n = { ...skip }; delete n[id]; setSettings({ measureSkip: n }); };
  return { skip, hide, unhide };
}

export function MeasureList({ items, max = 99, onPick, compact = false }) {
  const { hide } = useMeasureSkip();
  return (
    <div className="space-y-1.5">
      {items.slice(0, max).map((x) => (
        <div key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-amber-50/70 px-2.5 py-2 text-[12.5px] text-slate-700">
          <Gauge size={14} className="shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1"><b>{x.brand}</b> · {x.job}: chưa gắn {x.need}</span>
          {/* compact (ô chuông hẹp): nút luôn xuống dòng riêng, chữ không bị bóp thành cột */}
          <span className={`flex w-full shrink-0 justify-end gap-1 ${compact ? "" : "sm:ml-auto sm:w-auto"}`}>
            <Link to={`/khach-hang?id=${encodeURIComponent(x.custId)}&kenh=1`} onClick={onPick} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-600 ring-1 ring-indigo-100 hover:bg-indigo-50"><Link2 size={12} /> Gắn kênh</Link>
            <button type="button" onClick={() => hide(x)} title="Job này không cần đo — không báo nữa" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold text-slate-500 hover:bg-white"><EyeOff size={12} /> Không cần đo</button>
          </span>
        </div>
      ))}
      {items.length > max && <Link to="/bao-cao" onClick={onPick} className="block px-1 text-[12px] font-bold text-indigo-600">+ {items.length - max} job nữa →</Link>}
    </div>
  );
}

// Trung tâm báo cáo: danh sách đầy đủ + các job đã bấm "Không cần đo" (bật lại được)
export function MeasurePanel({ items, projects = [] }) {
  const { skip, unhide } = useMeasureSkip();
  const [showSkip, setShowSkip] = useState(false);
  const [open, setOpen] = useState(false); // điện thoại: danh sách thu gọn, bấm mới mở
  const skipped = Object.keys(skip).map((id) => projects.find((p) => p.id === id)).filter(Boolean);
  if (!items.length && !skipped.length) return null;
  return (
    <div id="do-luong" className="card no-print p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Gauge size={16} className="text-amber-500" />
        <span className="text-sm font-extrabold text-slate-800">{items.length ? `${items.length} job chưa gắn đo lường` : "Mọi job đang chạy đã gắn đo lường"}</span>
        {skipped.length > 0 && <button type="button" onClick={() => setShowSkip((v) => !v)} className="ml-auto text-[12px] font-bold text-slate-400 hover:text-indigo-600">{showSkip ? "Ẩn" : `Đã bỏ qua ${skipped.length} job`}</button>}
      </div>
      {items.length > 0 && <button type="button" onClick={() => setOpen((v) => !v)} className="mb-1 w-full rounded-xl bg-amber-50/70 py-2 text-[12.5px] font-bold text-amber-700 sm:hidden">{open ? "Thu gọn" : `Xem ${items.length} job để gắn kênh hoặc bỏ qua`}</button>}
      {items.length > 0 && <div className={open ? "" : "hidden sm:block"}><MeasureList items={items} /></div>}
      {showSkip && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {skipped.map((p) => <button key={p.id} type="button" onClick={() => unhide(p.id)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-600"><Undo2 size={11} /> {p.customerName ? `${p.customerName} · ` : ""}{p.name} — báo lại</button>)}
        </div>
      )}
    </div>
  );
}
