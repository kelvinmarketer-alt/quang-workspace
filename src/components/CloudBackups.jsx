import { useEffect, useState } from "react";
import { History, Download, RotateCcw, Plus, AlertTriangle } from "lucide-react";
import { Card, SectionTitle } from "./ui.jsx";
import { supabase, WORKSPACE_TABLE } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/store.jsx";
import { ask } from "./ConfirmDialog.jsx";

// Sao lưu TỰ ĐỘNG trên cloud (bảng qws_backups, cron 3h sáng mỗi ngày, giữ 30 ngày) — chỉ chủ.
const fmtTime = (iso) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export default function CloudBackups() {
  const { user } = useAuth();
  const { importData } = useData();
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("qws_backups").select("id,created_at,kind").order("created_at", { ascending: false }).limit(40);
    if (error) { setErr(/qws_backups/.test(error.message) ? "Chưa bật sao lưu tự động (cần chạy SQL supabase/SETUP-SECURITY.sql)." : error.message); setList([]); return; }
    setErr(""); setList(data || []);
  };
  useEffect(() => { load(); }, []);

  const fetchOne = async (id) => {
    const { data, error } = await supabase.from("qws_backups").select("created_at,data,private").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  const backupNow = async () => {
    setBusy("now"); setMsg("");
    try {
      const w = await supabase.from(WORKSPACE_TABLE).select("data").eq("user_id", user.id).single();
      if (w.error) throw w.error;
      const p = await supabase.from("qws_private").select("data").eq("user_id", user.id).maybeSingle();
      const { error } = await supabase.from("qws_backups").insert({ user_id: user.id, kind: "manual", data: w.data.data, private: p.data?.data || null });
      if (error) throw error;
      setMsg("✓ Đã tạo bản sao lưu.");
      load();
    } catch (e) { setMsg("✗ " + (e.message || e)); }
    setBusy("");
  };

  const download = async (b) => {
    setBusy("dl" + b.id);
    try {
      const d = await fetchOne(b.id);
      // Tài khoản & Thẻ nếu đã khoá PIN thì vẫn ở dạng mã hoá trong file (an toàn khi lưu file)
      const blob = new Blob([JSON.stringify({ backupAt: d.created_at, data: d.data, private: d.private }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `qws-saoluu-${d.created_at.slice(0, 10)}-${b.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setMsg("✗ " + (e.message || e)); }
    setBusy("");
  };

  const restore = async (b) => {
    if (!await ask(`Khôi phục dữ liệu về bản ${fmtTime(b.created_at)}?\nToàn bộ dữ liệu hiện tại (khách, dự án, kế toán, công việc…) sẽ bị thay bằng bản này. Tài khoản & Thẻ không bị đổi.\nNên tạo "Sao lưu ngay" trước khi khôi phục.`)) return;
    setBusy("rs" + b.id);
    try {
      const d = await fetchOne(b.id);
      const ok = importData(d.data);
      setMsg(ok ? `✓ Đã khôi phục bản ${fmtTime(b.created_at)}.` : "✗ Bản sao lưu không hợp lệ.");
    } catch (e) { setMsg("✗ " + (e.message || e)); }
    setBusy("");
  };

  return (
    <Card>
      <SectionTitle action={<History size={18} className="text-indigo-500" />}>Sao lưu tự động (đám mây)</SectionTitle>
      <p className="text-xs text-slate-500">Mỗi ngày 3h sáng tự lưu 1 bản, giữ 30 ngày. Lỡ xoá nhầm thì khôi phục lại bản trước đó.</p>
      {err ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700"><AlertTriangle size={15} className="shrink-0" /> {err}</div>
      ) : (
        <>
          <button onClick={backupNow} disabled={!!busy} className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Plus size={15} /> {busy === "now" ? "Đang lưu…" : "Sao lưu ngay"}</button>
          <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
            {list === null && <div className="p-3 text-sm text-slate-400">Đang tải…</div>}
            {list?.length === 0 && <div className="p-3 text-sm text-slate-400">Chưa có bản sao lưu nào.</div>}
            {list?.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-700">{fmtTime(b.created_at)}</div>
                  <div className="text-[11px] text-slate-400">{b.kind === "manual" ? "Tự tạo" : "Tự động"}</div>
                </div>
                <button onClick={() => download(b)} disabled={!!busy} title="Tải file" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"><Download size={15} /></button>
                <button onClick={() => restore(b)} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-rose-200 hover:text-rose-600 disabled:opacity-40"><RotateCcw size={13} /> {busy === "rs" + b.id ? "…" : "Khôi phục"}</button>
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{msg}</div>}
    </Card>
  );
}
