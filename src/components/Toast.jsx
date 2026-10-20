import { useEffect } from "react";
import { Undo2, X } from "lucide-react";
import { useData } from "../lib/store.jsx";

// Thông báo nổi dùng chung: "Đã xoá … · Hoàn tác" (10 giây), "Bạn chỉ có quyền xem", khôi phục bản sửa chưa lưu…
export function ToastHost() {
  const { toast, setToast, undoLast } = useData();
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.undo ? 10000 : 6000);
    return () => clearTimeout(t);
  }, [toast, setToast]);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex justify-center px-4 lg:bottom-6">
      <div role="status" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[13px] text-white shadow-xl">
        <span className="min-w-0 flex-1 leading-snug">{toast.text}</span>
        {toast.undo && <button onClick={undoLast} className="flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 font-bold text-amber-300"><Undo2 size={14} /> Hoàn tác</button>}
        <button onClick={() => setToast(null)} aria-label="Đóng thông báo" className="shrink-0 rounded-lg p-1.5 text-white/60"><X size={15} /></button>
      </div>
    </div>
  );
}
