import { useEffect, useState } from "react";
import { Radio, Square, Play, Loader2, RefreshCw, ShieldAlert, Server } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { supabase } from "../lib/supabase.js";
import { ask } from "../components/ConfirmDialog.jsx";

// Tab "Bot thật": theo dõi bot giao dịch chạy nền trên VPS (repo qws-live-bot) qua bảng Supabase qws_live_bot
// — bot ghi dòng 'status' mỗi ~30 giây; app ghi dòng 'command' {stop} để Dừng / cho chạy lại. App KHÔNG cầm khoá Binance.
const TF = { "5m": "M5", "15m": "M15", "1h": "H1", "4h": "H4" };
const px = (v) => (v == null ? "—" : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: v >= 1000 ? 1 : v >= 10 ? 2 : 4 }));
const usd = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`; };
const side = (s) => <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "LONG" : "SHORT"}</span>;
const EV = { placed: "Đặt lệnh chờ", open: "Khớp lệnh", close: "Đóng lệnh", expired: "Huỷ (giá không về)", skip: "Bỏ tín hiệu", error: "Lỗi" };

export default function CoinLive({ active }) {
  const [st, setSt] = useState(null), [cmd, setCmd] = useState(null), [err, setErr] = useState(""), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.from("qws_live_bot").select("id,data,updated_at");
    if (error) { if (/qws_live_bot|relation|does not exist|schema cache/i.test(error.message)) setMissing(true); else setErr(error.message); return; }
    setMissing(false); setErr("");
    setSt(data.find((r) => r.id === "status")?.data || null); setCmd(data.find((r) => r.id === "command")?.data || null);
  };
  useEffect(() => { if (!active) return undefined; load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const setStop = async (stop) => {
    if (!(await ask(stop ? "Dừng bot?\nBot huỷ các lệnh CHỜ và không mở lệnh mới. Vị thế đang mở vẫn giữ nguyên SL/TP." : "Cho bot chạy lại?\nBot sẽ tiếp tục đặt lệnh theo tín hiệu mới.", { ok: stop ? "Dừng bot" : "Chạy lại", danger: stop }))) return;
    setBusy(true);
    const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { stop, at: Date.now() }, updated_at: new Date().toISOString() });
    setBusy(false); if (error) setErr(error.message); else load();
  };

  if (missing) return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Server size={17} className="text-indigo-500" /> Bot thật chưa được kết nối</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
        <li>Chạy file <b>supabase.sql</b> (trong thư mục bot <code>qws-live-bot</code>) ở Supabase → SQL Editor để tạo bảng báo cáo.</li>
        <li>Cài bot trên VPS theo <b>README</b> (Testnet trước): điền khoá Testnet + SUPABASE_SERVICE_KEY vào <code>.env</code>, chạy <code>npm run check</code> rồi <code>npm start</code>.</li>
        <li>Quay lại đây: trạng thái, lệnh chờ, vị thế và lịch sử lệnh thật sẽ hiện tự động.</li>
      </ol>
    </Card>
  );
  if (!st) return <Card><div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">{err ? <span className="text-rose-600">{err}</span> : <><Loader2 size={16} className="animate-spin" /> Đang chờ bot báo trạng thái…</>}</div></Card>;

  const online = Date.now() - st.at < 120000, stopped = !!(cmd?.stop || st.stopped);
  const act = Object.entries(st.active || {}).map(([sym, a]) => ({ sym, ...a }));
  const closes = (st.events || []).filter((e) => e.ev === "close"), wins = closes.filter((e) => e.pnl > 0).length;
  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Radio size={18} className={online ? "text-emerald-500" : "text-slate-400"} />
          <span className="text-[14px] font-extrabold text-slate-800">Bot thật</span>
          <Badge tone={st.mode === "live" ? "rose" : "sky"}>{st.dry ? "CHẠY THỬ" : st.mode === "live" ? "TIỀN THẬT" : "TESTNET · tiền ảo"}</Badge>
          {online ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Đang chạy</span>
            : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Mất liên lạc · báo lần cuối {ago(st.at)}</span>}
          {stopped && <Badge tone="rose">ĐANG DỪNG</Badge>}
          <div className="ml-auto flex gap-1.5">
            <button onClick={load} aria-label="Làm mới" className="rounded-lg border border-slate-200 p-2 text-slate-500"><RefreshCw size={14} /></button>
            {stopped ? <button disabled={busy} onClick={() => setStop(false)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white"><Play size={13} /> Chạy lại</button>
              : <button disabled={busy} onClick={() => setStop(true)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-[12px] font-bold text-white"><Square size={12} /> Dừng bot</button>}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500">Rủi ro {st.risk}%/lệnh · tối đa {st.maxOpen} lệnh · dừng ngày -{st.dailyStop ?? 6}%{st.lastScan ? ` · quét tín hiệu ${ago(st.lastScan.at)}` : ""}{st.lastScan?.halted ? <b className="text-rose-600"> · {st.lastScan.halted}</b> : ""}</div>
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {[["Vốn tính lệnh", usd(st.lastScan?.eq)], ["Lãi/lỗ hôm nay", usd(st.lastScan?.pnl), st.lastScan?.pnl >= 0 ? "text-emerald-600" : "text-rose-600"], ["Lệnh chờ / đang mở", `${act.filter((a) => a.stage === "entry").length} / ${act.filter((a) => a.stage === "open").length}`], ["Lệnh đã đóng (gần đây)", closes.length ? `${closes.length} · thắng ${Math.round((wins / closes.length) * 100)}%` : "—"]].map(([l, v, t]) => (
          <div key={l} className="bg-white px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</div><div className={`text-lg font-extrabold tabular-nums ${t || "text-slate-900"}`}>{v}</div></div>
        ))}
      </div>

      <Card className="!p-3">
        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Lệnh chờ & vị thế ({act.length})</div>
        {act.length ? <div className="space-y-1.5">{act.map((a) => (
          <div key={a.sym} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
            <div className="flex items-center gap-2">{side(a.side)}<b>{a.coin} {TF[a.tf] || a.tf}</b><Badge tone={a.stage === "open" ? "emerald" : "amber"}>{a.stage === "open" ? "Đang mở" : "Lệnh chờ"}</Badge><span className="ml-auto tabular-nums text-slate-500">rủi ro {usd(a.riskUsd)}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-3 tabular-nums text-slate-600"><span>Vào {px(a.lim)}</span><span className="text-rose-500">SL {px(a.sl)}</span><span className="text-emerald-600">TP {px(a.tp)}</span><span>KL {a.filledQty ?? a.qty}</span>{a.stage === "entry" && <span className="text-slate-400">huỷ nếu chưa khớp lúc {new Date(a.until).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          </div>
        ))}</div> : <div className="py-4 text-center text-[12px] text-slate-400">Chưa có lệnh — bot đang chờ tín hiệu đạt đủ luật (trung bình vài lệnh mỗi tuần).</div>}
      </Card>

      <Card className="!p-3">
        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Nhật ký bot</div>
        {(st.events || []).length ? <div className="divide-y divide-slate-100">{st.events.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-[12px]">
            <span className="w-[118px] shrink-0 tabular-nums text-[11px] text-slate-400">{e.at}</span>
            <b className={e.ev === "close" ? (e.pnl >= 0 ? "text-emerald-700" : "text-rose-700") : e.ev === "error" ? "text-rose-700" : "text-slate-700"}>{EV[e.ev] || e.ev}</b>
            {e.coin && <span>{e.side ? side(e.side) : null} {e.coin} {TF[e.tf] || ""}</span>}
            {e.ev === "close" && <span className={`ml-auto font-extrabold tabular-nums ${e.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{usd(e.pnl)}{e.R != null ? ` · ${e.R >= 0 ? "+" : ""}${e.R.toFixed(2)}R` : ""}</span>}
            {(e.why || e.msg) && <span className="text-slate-400">{e.why || e.msg}</span>}
          </div>
        ))}</div> : <div className="py-4 text-center text-[12px] text-slate-400">Chưa có hoạt động.</div>}
      </Card>

      <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
        <ShieldAlert size={13} className="mt-0.5 shrink-0" />
        <span>Bot chạy trên VPS bằng khoá API riêng (chỉ Futures, tắt rút tiền) — app chỉ đọc trạng thái và gửi lệnh Dừng. Dừng bot không đóng vị thế đang mở (vẫn có SL/TP). Không phải tư vấn đầu tư.</span>
      </div>
    </div>
  );
}
