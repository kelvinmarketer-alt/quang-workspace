import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, FileCode2, Library, ChevronRight } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { libByCustomer, KINDS } from "../lib/library.js";

// Thẻ khách (Khách & Dự án): các tài liệu trong Kho tài liệu đã gắn với khách này (09/11/2026). Chỉ chủ thấy (kho là của chủ).
export default function CustomerDocs({ customerId }) {
  const { isOwner, perms = [] } = useData();
  const canSee = isOwner || perms.includes("library"); // chủ hoặc thành viên được cấp Kho tài liệu
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!canSee) return undefined;
    let alive = true;
    libByCustomer(customerId).then((r) => { if (alive) setRows(r.error ? [] : r.data || []); });
    return () => { alive = false; };
  }, [customerId, canSee]);
  if (!canSee || !rows) return null;
  return (
    <div className="mt-2 rounded-xl border border-slate-100 bg-white p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Library size={14} className="text-indigo-500" />
        <span className="text-[12px] font-extrabold text-slate-700">Tài liệu trong kho{rows.length ? ` (${rows.length})` : ""}</span>
        <Link to={`/kho-tai-lieu?khach=${customerId}`} className="ml-auto flex items-center gap-0.5 text-[11.5px] font-bold text-indigo-600 hover:underline">{rows.length ? "Xem tất cả" : isOwner ? "Thêm tài liệu" : "Mở kho"} <ChevronRight size={12} /></Link>
      </div>
      {rows.length === 0 ? <div className="text-[12px] text-slate-400">Chưa có tài liệu nào gắn với khách này (báo cáo đã gửi, hợp đồng, ghi chú họp…).</div> : (
        <div className="flex flex-wrap gap-1.5">
          {rows.slice(0, 6).map((d) => {
            const Icon = d.kind === "html" ? FileCode2 : FileText;
            return <Link key={d.id} to={`/kho-tai-lieu?doc=${d.id}`} title={(KINDS[d.kind] || KINDS.txt).label} className="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"><Icon size={13} className="shrink-0" /><span className="truncate">{d.title}</span></Link>;
          })}
          {rows.length > 6 && <span className="self-center text-[11.5px] text-slate-400">+{rows.length - 6} tài liệu nữa</span>}
        </div>
      )}
    </div>
  );
}
