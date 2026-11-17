// 17/11/2026 sếp duyệt: 1 thương hiệu đang nằm ở 3 chỗ (Khách & Dự án · Báo cáo → Thương hiệu 360 · Văn phòng AI → Thương hiệu).
// Không gộp được hẳn (Văn phòng AI bị chặn xem tiền QWS, code văn phòng phải tách được để bán) → nút qua lại giữa 3 trang của CÙNG thương hiệu.
// Khớp khách ↔ thương hiệu văn phòng bằng office_brands.qws_customer_id (máy văn phòng tự gắn khi đồng bộ, xem runner/qwsync.mjs). Chỉ chủ.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, BarChart3, Building2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { OFFICE_URL } from "../lib/office.js";

let cache = null, pending = null;
function loadMap() {
  if (cache) return Promise.resolve(cache);
  return (pending ||= supabase.from("office_brands").select("id,qws_customer_id").not("qws_customer_id", "is", null)
    .then(({ data, error }) => { pending = null; if (error) return {}; cache = Object.fromEntries((data || []).map((b) => [b.qws_customer_id, b.id])); return cache; }));
}
export function useOfficeBrandId(custId) {
  const [id, setId] = useState(() => cache?.[custId] || null);
  useEffect(() => { let on = true; if (custId) loadMap().then((m) => on && setId(m[custId] || null)); return () => { on = false; }; }, [custId]);
  return id;
}

// from: trang đang đứng ("cust" | "r360") → không hiện nút về chính nó
export default function BrandJump({ custId, from, className = "" }) {
  const officeId = useOfficeBrandId(custId);
  const cls = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:text-indigo-600 sm:py-1.5";
  return (
    <span className={`no-print inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {from !== "cust" && <Link to={`/khach-hang?id=${encodeURIComponent(custId)}`} className={cls} title="Khách, dự án, đợt thu của thương hiệu này"><Users size={12} /> Khách & Dự án</Link>}
      {from !== "r360" && <Link to={`/bao-cao/${encodeURIComponent(custId)}`} className={cls} title="Số tháng này: thu nhập, quảng cáo, web, fanpage"><BarChart3 size={12} /> Thương hiệu 360</Link>}
      {officeId && <a href={`${OFFICE_URL}du-an/thuong-hieu/${officeId}`} className={cls} title="Kế hoạch, chỉ tiêu, tiến độ việc của đội AI cho thương hiệu này"><Building2 size={12} /> Văn phòng AI</a>}
    </span>
  );
}
