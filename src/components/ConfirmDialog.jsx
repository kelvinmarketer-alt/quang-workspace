import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

// Popup xác nhận theo giao diện app (thay cho confirm() của trình duyệt — user không muốn hộp thoại mặc định).
// Dùng: if (await ask("Xoá khách này?")) … · tuỳ chọn: ask(msg, { ok: "Xoá", danger: true, title })
let push = null;
export function ask(message, opts = {}) {
  if (!push) return Promise.resolve(window.confirm(message)); // dự phòng khi chưa gắn ConfirmHost
  return new Promise((resolve) => push({ message, ...opts, resolve }));
}

const DANGER = /^(xoá|xóa|gỡ|đặt lại|khôi phục|bỏ khoá|bỏ khóa|tạo khoá mới)/i;

export function ConfirmHost() {
  const [q, setQ] = useState(null);
  const okRef = useRef(null);
  useEffect(() => { push = (x) => setQ(x); return () => { push = null; }; }, []);
  useEffect(() => {
    if (!q) return;
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  if (!q) return null;
  const done = (v) => { q.resolve(v); setQ(null); };
  const lines = String(q.message || "").split("\n");
  const danger = q.danger ?? DANGER.test(lines[0].trim());
  const title = q.title || lines[0];
  const body = q.title ? lines : lines.slice(1);
  const okText = q.ok || (danger ? (/^gỡ/i.test(lines[0]) ? "Gỡ" : /^đặt lại/i.test(lines[0]) ? "Đặt lại" : /^khôi phục/i.test(lines[0]) ? "Khôi phục" : /^tạo khoá/i.test(lines[0]) ? "Tạo khoá mới" : "Xoá") : "Đồng ý");
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => done(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>
            {danger ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}
          </div>
          <div className="min-w-0 pt-1">
            <div className="text-[15px] font-extrabold leading-snug text-slate-800">{title}</div>
            {body.filter((l) => l.trim()).map((l, i) => <div key={i} className="mt-1 text-[13px] leading-snug text-slate-500">{l}</div>)}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => done(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button ref={okRef} onClick={() => done(true)} className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-gradient-to-r from-indigo-500 to-sky-500"}`}>{okText}</button>
        </div>
      </div>
    </div>
  );
}
