import { useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Card, SectionTitle } from "./ui.jsx";
import { supabase } from "../lib/supabase.js";

// Chi phí AI (OpenAI) theo tháng — ghi bởi edge function qws-ai mỗi lần gọi. Chỉ chủ xem.
const FEAT = { import: "Nhập khách/dự án", resources: "Đọc tài nguyên", vault: "Đọc tài khoản/thẻ", expense: "Đọc hoá đơn chi", ads: "Phân tích quảng cáo", market: "Phân tích coin", web: "Phân tích website" };

export default function AiUsage({ vnd = 26000 }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    supabase.from("qws_ai_usage").select("feature,model,actor_email,cost_usd,created_at").gte("created_at", from).order("created_at", { ascending: false }).limit(2000)
      .then(({ data, error }) => { if (error) { setErr(/qws_ai_usage/.test(error.message) ? "Chưa bật (cần chạy SQL + deploy hàm qws-ai)." : error.message); setRows([]); } else setRows(data || []); });
  }, []);

  const sum = useMemo(() => {
    const by = {}, who = {}; let total = 0;
    for (const r of rows || []) {
      const c = Number(r.cost_usd) || 0; total += c;
      by[r.feature] = (by[r.feature] || 0) + c;
      who[r.actor_email || "?"] = (who[r.actor_email || "?"] || 0) + c;
    }
    return { total, by: Object.entries(by).sort((a, b) => b[1] - a[1]), who: Object.entries(who).sort((a, b) => b[1] - a[1]), n: (rows || []).length };
  }, [rows]);
  const usd = (v) => "$" + v.toFixed(v < 1 ? 3 : 2);
  const vn = (v) => Math.round(v * vnd).toLocaleString("vi-VN") + "đ";

  return (
    <Card>
      <SectionTitle action={<Sparkles size={18} className="text-indigo-500" />}>Chi phí AI tháng này</SectionTitle>
      {err ? (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700"><AlertTriangle size={15} className="shrink-0" /> {err}</div>
      ) : rows === null ? <div className="text-sm text-slate-400">Đang tải…</div> : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <div className="text-2xl font-extrabold text-slate-800">{usd(sum.total)}</div>
            <div className="text-sm font-semibold text-slate-500">≈ {vn(sum.total)} · {sum.n} lần gọi</div>
          </div>
          {sum.by.length > 0 && (
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {sum.by.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"><span className="font-semibold text-slate-600">{FEAT[k] || k}</span><span className="font-bold text-slate-800">{usd(v)}</span></div>
              ))}
            </div>
          )}
          {sum.who.length > 1 && <div className="mt-2 text-[11px] text-slate-400">Theo người dùng: {sum.who.map(([e, v]) => `${e} ${usd(v)}`).join(" · ")}</div>}
          <div className="mt-2 text-[11px] text-slate-400">AI gọi qua máy chủ: key OpenAI không lộ ra trình duyệt, tài khoản phụ vẫn dùng AI được.</div>
        </>
      )}
    </Card>
  );
}
