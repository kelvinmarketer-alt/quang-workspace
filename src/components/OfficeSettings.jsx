import { useEffect, useState } from "react";
import { Building2, ExternalLink } from "lucide-react";
import { Card, SectionTitle } from "./ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { OFFICE_URL, OFFICE_AGENTS, OFFICE_KINDS, loadOfficePrefs, saveOfficePrefs, loadOfficeRunner, officeAgo } from "../lib/office.js";

export default function OfficeSettings() {
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [runner, setRunner] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { loadOfficePrefs().then(setP); loadOfficeRunner().then(setRunner); }, []);
  if (!p) return null;
  const set = (patch) => { setP((x) => ({ ...x, ...patch })); setMsg(null); };
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await saveOfficePrefs(user.id, p); setMsg({ t: "ok", m: "✓ Đã lưu cài đặt Văn phòng AI." }); }
    catch (e) { setMsg({ t: "err", m: e.message }); }
    setBusy(false);
  };
  const toggleMute = (id) => set({ mute_agents: p.mute_agents.includes(id) ? p.mute_agents.filter((x) => x !== id) : [...p.mute_agents, id] });

  return (
    <Card>
      <SectionTitle action={<Building2 size={18} className="text-indigo-500" />}>Văn phòng AI</SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${runner?.online ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          <span className={`h-2 w-2 rounded-full ${runner?.online ? "bg-emerald-500" : "bg-rose-500"}`} />
          {runner === undefined ? "Đang kiểm tra…" : runner?.online ? `Đội AI có mặt · ${runner.host}` : runner ? `Đội AI vắng · tín hiệu cuối ${officeAgo(runner.last_seen)}` : "Chưa có máy chạy kết nối"}
        </span>
        <a href={OFFICE_URL} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700">Mở văn phòng <ExternalLink size={14} /></a>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
        <div>
          <div className="text-sm font-bold text-slate-800">Đẩy thông báo về điện thoại / máy tính</div>
          <div className="text-[11px] text-slate-400">Gửi tới các thiết bị đã bật "Thông báo đẩy" ở trên. Tắt thì vẫn xem được ở chuông 🔔.</div>
        </div>
        <input type="checkbox" checked={p.push !== false} onChange={(e) => set({ push: e.target.checked })} className="h-5 w-5 accent-indigo-600" />
      </label>

      <div className={p.push === false ? "pointer-events-none opacity-40" : ""}>
        <div className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Loại thông báo được đẩy</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {OFFICE_KINDS.map((k) => (
            <label key={k.k} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={!!p.kinds[k.k]} onChange={(e) => set({ kinds: { ...p.kinds, [k.k]: e.target.checked } })} className="h-4 w-4 accent-indigo-600" />
              {k.emoji} {k.label}
            </label>
          ))}
        </div>

        <div className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Nhân viên được đẩy thông báo <span className="normal-case text-slate-300">(bấm để tắt/bật)</span></div>
        <div className="flex flex-wrap gap-1.5">
          {OFFICE_AGENTS.map((a) => {
            const muted = p.mute_agents.includes(a.id);
            return (
              <button key={a.id} onClick={() => toggleMute(a.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${muted ? "bg-slate-100 text-slate-400 line-through" : "bg-indigo-50 text-indigo-700"}`}>
                {a.emoji} {a.name}
              </button>
            );
          })}
        </div>

        <div className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Giờ không làm phiền</div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm">
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            <input type="checkbox" checked={!!p.quiet.on} onChange={(e) => set({ quiet: { ...p.quiet, on: e.target.checked } })} className="h-4 w-4 accent-indigo-600" /> Bật
          </label>
          <span className="text-slate-400">từ</span>
          <input type="time" value={p.quiet.from} onChange={(e) => set({ quiet: { ...p.quiet, from: e.target.value } })} className="rounded-lg border border-slate-200 px-2 py-1" />
          <span className="text-slate-400">đến</span>
          <input type="time" value={p.quiet.to} onChange={(e) => set({ quiet: { ...p.quiet, to: e.target.value } })} className="rounded-lg border border-slate-200 px-2 py-1" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-black disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu cài đặt"}</button>
        {msg && <span className={`text-xs font-semibold ${msg.t === "err" ? "text-rose-600" : "text-emerald-600"}`}>{msg.m}</span>}
      </div>
    </Card>
  );
}
