import { useEffect, useState } from "react";
import { Radio, Square, Play, Loader2, RefreshCw, ShieldAlert, Server, Settings2, KeyRound, ChevronDown } from "lucide-react";
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
    const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { ...(cmd || {}), stop, at: Date.now() }, updated_at: new Date().toISOString() });
    setBusy(false); if (error) setErr(error.message); else load();
  };

  if (missing) return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Server size={17} className="text-indigo-500" /> Bot thật chưa được kết nối</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
        <li>Chạy file <b>supabase.sql</b> (trong thư mục bot <code>qws-live-bot</code>) ở Supabase → SQL Editor để tạo bảng báo cáo.</li>
        <li>Trên máy bàn bật 24/7: tải bot (repo <code>qws-live-bot</code> → Download ZIP), bấm <b>cai-dat-windows.bat</b>, dán <b>SUPABASE_SERVICE_KEY</b> khi Notepad mở.</li>
        <li>Quay lại đây → <b>Cài đặt bot</b>: chọn Testnet, dán khoá API Binance (mã hoá ngay trên máy này, chỉ máy bot giải được).</li>
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
        <div className="mt-1 text-[11.5px] text-slate-500">Luật: {st.rules || "mặc định"} · rủi ro {st.risk}%/lệnh · tối đa {st.maxOpen} lệnh · dừng ngày -{st.dailyStop ?? 6}%{st.lastScan ? ` · quét tín hiệu ${ago(st.lastScan.at)}` : ""}{st.lastScan?.halted ? <b className="text-rose-600"> · {st.lastScan.halted}</b> : ""}</div>
        {st.waiting && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12.5px] font-bold text-amber-800">⏸ {st.waiting}</div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      <BotSettings st={st} cmd={cmd} onSaved={load} defaultOpen={!!st.waiting} />

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

// ---------- Cài đặt bot ngay trong app: chế độ, rủi ro, vốn + khoá API (mã hoá bằng khoá CÔNG KHAI của máy bot) ----------
const b64ToBytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u) => { let s = ""; new Uint8Array(u).forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
async function encryptFor(pubB64, text) {
  const pk = await crypto.subtle.importKey("spki", b64ToBytes(pubB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return bytesToB64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pk, new TextEncoder().encode(text)));
}
function BotSettings({ st, cmd, onSaved, defaultOpen }) {
  const c0 = { mode: st.mode || "testnet", riskPct: 2, capitalCap: 0, maxOpen: 3, dailyStopPct: 6, maxLev: 20, ...(st.settings || {}), ...(cmd?.config || {}) };
  const [open, setOpen] = useState(defaultOpen);
  const [f, setF] = useState(c0), [k, setK] = useState({ key: "", secret: "" }), [confirm, setConfirm] = useState(""), [msg, setMsg] = useState(null), [saving, setSaving] = useState(false);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);
  const live = f.mode === "live", saved = cmd?.keys?.[f.mode], stale = saved && saved.pubFp && st.pubFp && saved.pubFp !== st.pubFp;
  const inp = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
  const num = (key, label, step, suffix, hint) => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" inputMode="decimal" step={step} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={inp} />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
      {hint && <span className="mt-0.5 block text-[10.5px] text-slate-400">{hint}</span>}
    </label>
  );
  const save = async () => {
    setMsg(null);
    const v = { mode: f.mode, riskPct: Number(f.riskPct), capitalCap: Number(f.capitalCap) || 0, maxOpen: Math.round(Number(f.maxOpen)), dailyStopPct: Number(f.dailyStopPct), maxLev: Math.round(Number(f.maxLev)) };
    if (!(v.riskPct > 0 && v.riskPct <= 5)) return setMsg({ bad: true, t: "Rủi ro mỗi lệnh phải trong khoảng 0,1–5%" });
    if (!(v.maxOpen >= 1 && v.maxOpen <= 5)) return setMsg({ bad: true, t: "Tối đa lệnh mở: 1–5" });
    if (!(v.dailyStopPct >= 1 && v.dailyStopPct <= 20)) return setMsg({ bad: true, t: "Dừng ngày: 1–20%" });
    if (!(v.maxLev >= 1 && v.maxLev <= 20)) return setMsg({ bad: true, t: "Đòn bẩy tối đa: 1–20x" });
    const hasNewKey = k.key.trim() && k.secret.trim();
    if ((k.key.trim() || k.secret.trim()) && !hasNewKey) return setMsg({ bad: true, t: "Cần điền đủ cả API Key và Secret Key" });
    if (!hasNewKey && (!saved || stale)) return setMsg({ bad: true, t: `Chưa có khoá API ${live ? "THẬT" : "Testnet"} — dán API Key + Secret Key rồi lưu` });
    if (!st.pubKey) return setMsg({ bad: true, t: "Bot trên máy bàn là bản cũ — tải bản mới (Download ZIP, chép đè) rồi thử lại" });
    if (live && cmd?.config?.mode !== "live") {
      if (confirm.trim().toUpperCase() !== "TIỀN THẬT" && confirm.trim().toUpperCase() !== "TIEN THAT") return setMsg({ bad: true, t: 'Gõ đúng chữ "TIỀN THẬT" vào ô xác nhận để bật chế độ tiền thật' });
      if (!(await ask(`Bật chạy TIỀN THẬT?\nBot sẽ đặt lệnh THẬT trên Binance: rủi ro ${v.riskPct}%/lệnh, vốn tính lệnh tối đa ${v.capitalCap ? v.capitalCap + "$" : "toàn bộ ví Futures"}, tối đa ${v.maxOpen} lệnh, dừng ngày -${v.dailyStopPct}%.\nKết quả quá khứ/testnet không đảm bảo lợi nhuận.`, { ok: "Bật tiền thật", danger: true }))) return;
    }
    setSaving(true);
    try {
      const keys = { ...(cmd?.keys || {}) };
      if (hasNewKey) keys[f.mode] = { key: await encryptFor(st.pubKey, k.key.trim()), secret: await encryptFor(st.pubKey, k.secret.trim()), last4: k.key.trim().slice(-4), pubFp: st.pubFp, savedAt: Date.now() };
      const config = { ...(cmd?.config || {}), ...v, liveConfirmedAt: live ? cmd?.config?.liveConfirmedAt || Date.now() : null };
      const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { ...(cmd || {}), config, keys, at: Date.now() }, updated_at: new Date().toISOString() });
      if (error) throw error;
      setK({ key: "", secret: "" }); setConfirm("");
      setMsg({ t: `Đã lưu. Bot áp dụng trong ~15 giây${cmd?.config?.mode && cmd.config.mode !== f.mode ? " (đổi chế độ → bot tự khởi động lại)" : ""}.` });
      onSaved?.();
    } catch (e) { setMsg({ bad: true, t: e.message || String(e) }); }
    setSaving(false);
  };
  const removeKey = async () => {
    if (!(await ask(`Xoá khoá API ${live ? "THẬT" : "Testnet"} đã lưu?\nBot sẽ ngừng giao dịch ở chế độ này cho tới khi nhập khoá mới. Lệnh đang mở trên sàn vẫn giữ SL/TP.`, { ok: "Xoá khoá", danger: true }))) return;
    const keys = { ...(cmd?.keys || {}) }; delete keys[f.mode];
    const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { ...(cmd || {}), keys, at: Date.now() }, updated_at: new Date().toISOString() });
    setMsg(error ? { bad: true, t: error.message } : { t: "Đã xoá khoá." }); onSaved?.();
  };
  return (
    <Card className="!p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[13.5px] font-extrabold text-slate-800"><Settings2 size={16} className="text-indigo-500" /> Cài đặt bot<span className="ml-1 text-[11.5px] font-semibold text-slate-400">{(cmd?.config?.mode || st.mode) === "live" ? "Tiền thật" : "Testnet"} · rủi ro {c0.riskPct}% · {cmd?.keys?.[c0.mode] ? `khoá …${cmd.keys[c0.mode].last4}` : "chưa có khoá"}</span><ChevronDown size={16} className={`ml-auto text-slate-400 transition ${open ? "rotate-180" : ""}`} /></button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {[["testnet", "Testnet (tiền ảo)"], ["live", "Tiền thật"]].map(([m, l]) => <button key={m} onClick={() => { setF({ ...f, mode: m }); setMsg(null); }} className={`rounded-lg py-2 text-[13px] font-bold ${f.mode === m ? (m === "live" ? "bg-rose-600 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}>{l}</button>)}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-700"><KeyRound size={14} /> Khoá API {live ? "Binance THẬT" : "Binance Testnet"}</div>
            <div className="mt-0.5 text-[11.5px] text-slate-500">{live ? "Tạo ở Binance → API Management: CHỈ bật Futures, TẮT rút tiền, khoá theo IP máy bàn." : "Tạo ở testnet.binancefuture.com → API Key."} Khoá được <b>mã hoá ngay trên máy này</b> bằng khoá công khai của máy bot — app và Supabase không đọc lại được. Chế độ vị thế trên sàn: <b>Một chiều</b>.</div>
            {saved && !stale && <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-800">Đã lưu khoá …{saved.last4} · {new Date(saved.savedAt).toLocaleDateString("vi-VN")}<button onClick={removeKey} className="ml-auto font-bold text-rose-600">Xoá khoá</button></div>}
            {stale && <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-bold text-amber-800">Khoá đã lưu được mã hoá cho máy bot cũ (máy đã cài lại) — dán lại khoá bên dưới.</div>}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="password" autoComplete="off" placeholder={saved && !stale ? "API Key mới (để trống = giữ khoá cũ)" : "API Key"} value={k.key} onChange={(e) => setK({ ...k, key: e.target.value })} className={inp} />
              <input type="password" autoComplete="off" placeholder={saved && !stale ? "Secret Key mới" : "Secret Key"} value={k.secret} onChange={(e) => setK({ ...k, secret: e.target.value })} className={inp} />
            </div>
          </div>
          <UpdateBox st={st} cmd={cmd} onSaved={onSaved} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {num("riskPct", "Rủi ro / lệnh", 0.25, "%", live ? "tháng đầu nên 1%" : null)}
            {num("capitalCap", "Vốn tính lệnh tối đa", 50, "$", "0 = cả ví Futures")}
            {num("maxOpen", "Tối đa lệnh mở", 1)}
            {num("dailyStopPct", "Dừng ngày khi lỗ", 0.5, "%")}
            {num("maxLev", "Đòn bẩy tối đa", 1, "x")}
          </div>
          {live && cmd?.config?.mode !== "live" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800">
              <b>Bật TIỀN THẬT:</b> bot sẽ đặt lệnh thật bằng tiền trong ví Futures. Khuyên: đã chạy Testnet ổn 2–4 tuần, tháng đầu vốn 100–200$ và rủi ro 1%.
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Gõ "TIỀN THẬT" để xác nhận' className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-sm" />
            </div>
          )}
          {msg && <div className={`rounded-lg p-2 text-[12.5px] font-bold ${msg.bad ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.t}</div>}
          <button disabled={saving} onClick={save} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${live ? "bg-rose-600" : "bg-indigo-600"}`}>{saving ? "Đang lưu…" : live ? "Lưu & chạy TIỀN THẬT" : "Lưu & chạy Testnet"}</button>
        </div>
      )}
    </Card>
  );
}

// Tự cập nhật bot từ GitHub: token CHỈ ĐỌC (mã hoá như khoá API) + phiên bản đang chạy + nút "Cập nhật ngay"
function UpdateBox({ st, cmd, onSaved }) {
  const [tok, setTok] = useState(""), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const v = st.version || {}, g = cmd?.keys?.github, stale = g && g.pubFp && st.pubFp && g.pubFp !== st.pubFp;
  const write = async (data, ok) => {
    setBusy(true);
    const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { ...(cmd || {}), ...data, at: Date.now() }, updated_at: new Date().toISOString() });
    setBusy(false); setMsg(error ? { bad: true, t: error.message } : { t: ok }); if (!error) onSaved?.();
  };
  const saveTok = async () => {
    const t = tok.trim();
    if (!/^(github_pat_|ghp_)/.test(t)) return setMsg({ bad: true, t: "Token GitHub thường bắt đầu bằng github_pat_ — kiểm tra lại" });
    if (!st.pubKey) return setMsg({ bad: true, t: "Bot trên máy bàn là bản cũ — tải bản mới 1 lần (Download ZIP, chép đè)" });
    await write({ keys: { ...(cmd?.keys || {}), github: { token: await encryptFor(st.pubKey, t), last4: t.slice(-4), pubFp: st.pubFp, savedAt: Date.now() } } }, "Đã lưu token — bot kiểm tra bản mới trong ~1 phút.");
    setTok("");
  };
  const ago2 = (t) => (t ? new Date(t).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
  const behind = v.latest?.sha && v.sha && v.latest.sha !== v.sha;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-700"><RefreshCw size={14} /> Tự cập nhật bot</div>
      <div className="mt-1 text-[11.5px] text-slate-500">Mỗi khi luật/bot được cải tiến, máy bàn tự tải bản mới (30 phút/lần), kiểm tra rồi tự chạy lại; bản mới lỗi → tự quay về bản cũ.</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span>Đang chạy: <b className="tabular-nums">{v.sha ? v.sha.slice(0, 7) : "bản tải tay"}</b>{v.date ? ` (${ago2(v.date)})` : ""}</span>
        {behind && <span className="font-bold text-amber-700">Có bản mới {v.latest.sha.slice(0, 7)}</span>}
        {v.lastCheck ? <span className="text-slate-400">kiểm tra lúc {ago2(v.lastCheck)}</span> : null}
        {v.error && <span className="text-rose-600">{v.error}</span>}
        <button disabled={busy || !g} onClick={() => write({ updateNow: Date.now() }, "Đã gửi lệnh — bot kiểm tra ngay (~15 giây).")} className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Cập nhật ngay</button>
      </div>
      {g && !stale ? <div className="mt-2 text-[12px] text-emerald-700">Đã lưu token GitHub …{g.last4}</div>
        : <div className="mt-2 space-y-1.5">
          <div className="text-[11.5px] text-slate-500">{stale ? <b className="text-amber-700">Token được mã hoá cho máy bot cũ — dán lại. </b> : null}Tạo token: GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate: Repository access = <b>Only qws-live-bot</b>, Permissions → <b>Contents: Read-only</b>.</div>
          <div className="flex gap-2"><input type="password" autoComplete="off" placeholder="github_pat_…" value={tok} onChange={(e) => setTok(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /><button disabled={busy || !tok.trim()} onClick={saveTok} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">Lưu</button></div>
        </div>}
      {msg && <div className={`mt-2 rounded-lg p-2 text-[12px] font-bold ${msg.bad ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.t}</div>}
    </div>
  );
}

