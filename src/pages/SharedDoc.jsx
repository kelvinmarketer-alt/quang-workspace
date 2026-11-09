// TRANG XEM TÀI LIỆU ĐƯỢC CHIA SẺ (09/11/2026) — mở bằng link /xem/<mã>, KHÔNG cần đăng nhập, chỉ đọc.
// Nội dung chạy trong khung cách ly (iframe sandbox, không có allow-same-origin) → tài liệu HTML không đụng được dữ liệu / đăng nhập của app.
import { useEffect, useMemo, useState } from "react";
import { Loader2, FileText, Link2, AlertTriangle } from "lucide-react";
import { libSharedGet, frameDoc, KINDS, fmtDate } from "../lib/library.js";

export const sharedToken = (pathname = window.location.pathname) => { const m = /^\/xem\/([A-Za-z0-9_-]{32,128})\/?$/.exec(pathname); return m ? m[1] : null; };

export default function SharedDoc({ token }) {
  const [state, setState] = useState("loading"), [doc, setDoc] = useState(null);
  useEffect(() => {
    // Link riêng tư: không cho công cụ tìm kiếm lập chỉ mục, không gửi địa chỉ trang đi khi bấm link bên trong
    const m1 = document.createElement("meta"); m1.name = "robots"; m1.content = "noindex,nofollow";
    const m2 = document.createElement("meta"); m2.name = "referrer"; m2.content = "no-referrer";
    document.head.append(m1, m2);
    return () => { m1.remove(); m2.remove(); };
  }, []);
  useEffect(() => {
    let alive = true;
    libSharedGet(token).then((r) => {
      if (!alive) return;
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (r.error || !row) { setState("gone"); return; }
      setDoc(row); setState("ok"); document.title = `${row.title} — Tài liệu chia sẻ`;
    });
    return () => { alive = false; };
  }, [token]);
  const html = useMemo(() => (doc ? frameDoc(doc.kind, doc.content || "") : ""), [doc]);
  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-2.5 sm:px-6">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white"><FileText size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-slate-800">{state === "ok" ? doc.title : state === "loading" ? "Đang mở…" : "Tài liệu chia sẻ"}</div>
          {state === "ok" && <div className="truncate text-[11px] text-slate-400">{(KINDS[doc.kind] || KINDS.txt).label} · cập nhật {fmtDate(doc.updated_at)} · chỉ đọc</div>}
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-400 sm:flex"><Link2 size={12} /> Link chia sẻ riêng tư</span>
      </div>
      {state === "loading" && <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-indigo-500" /></div>}
      {state === "gone" && (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500"><AlertTriangle size={26} /></div>
            <div className="mt-3 text-[16px] font-extrabold text-slate-800">Link này không còn dùng được</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Link đã hết hạn, đã bị tắt chia sẻ hoặc bị sai. Hãy xin người gửi một link mới.</p>
          </div>
        </div>
      )}
      {state === "ok" && <iframe title={doc.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={html} className="min-h-0 w-full flex-1 border-0 bg-white" />}
    </div>
  );
}
