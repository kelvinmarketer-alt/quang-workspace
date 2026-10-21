import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, Square, Play, Loader2, RefreshCw, ShieldAlert, Server, Settings2, KeyRound, ChevronDown, XOctagon, ListChecks, BarChart3, GitCompare, BellRing } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Badge } from "../components/ui.jsx";
import { supabase } from "../lib/supabase.js";
import { ask } from "../components/ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import { fmtUsd, fmtUsdSigned, fmtPx, fmtQty, fmtNum, fmtPct, downloadCSV } from "../lib/format.js";
import { pushSupported, permission, isSubscribed, enablePush } from "../lib/push.js";
import { runSessionAsync } from "../lib/botRunner.js";
import { finalize, cfgOf } from "../lib/paperBot.js";
import { normLive, liveSummary, compareDemoLive, cfgDiff, rulesText, setupName } from "../lib/liveStats.js";

// Tab "Bot thật": theo dõi bot giao dịch chạy nền trên máy bàn ở nhà (repo qws-live-bot) qua bảng Supabase qws_live_bot
// — bot ghi dòng 'status' mỗi ~30 giây + dòng 'history' (lịch sử lệnh thật); app ghi dòng 'command' (LUÔN gộp với dữ liệu cũ)
// để Dừng / chạy lại / đóng hết / đổi cài đặt. App KHÔNG cầm khoá Binance.
const TF = { "5m": "M5", "15m": "M15", "1h": "H1", "4h": "H4" };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`; };
const dt = (t) => { if (t == null) return "—"; const d = new Date(t); return isNaN(d) ? "—" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtR = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2)}R`);
const tone = (v) => (v == null || !isFinite(v) ? "text-slate-900" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const side = (s) => <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "LONG" : "SHORT"}</span>;
const EV = { placed: "Đặt lệnh chờ", open: "Khớp lệnh", close: "Đóng lệnh", expired: "Huỷ (giá không về)", skip: "Bỏ tín hiệu", error: "Lỗi", closeAll: "Đóng hết vị thế" };
const MODE_L = { testnet: "Testnet", live: "Tiền thật" };
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/\s+/g, " ").trim();
const Title = ({ icon: I, children, right }) => <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{I && <I size={13} className="text-indigo-500" />}{children}{right && <span className="ml-auto normal-case tracking-normal">{right}</span>}</div>;
const Num = ({ label, v, sub, t = "text-slate-900" }) => <div className="min-w-0 bg-white px-3 py-2.5"><div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`break-words text-lg font-extrabold leading-snug tabular-nums ${t}`}>{v}</div>{sub && <div className="break-words text-[11px] leading-snug text-slate-400">{sub}</div>}</div>;

// Ghi dòng 'command': đọc bản MỚI NHẤT trên server rồi gộp (không đè config/keys do máy khác vừa lưu).
// patch = object hoặc hàm (dữ liệu hiện tại) → object
async function mergeCmd(patch, fallback) {
  const cur = await supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle();
  const base = (!cur.error && cur.data?.data) || fallback || {};
  const p = typeof patch === "function" ? patch(base) : patch;
  return supabase.from("qws_live_bot").upsert({ id: "command", data: { ...base, ...p, at: Date.now() }, updated_at: new Date().toISOString() });
}

export default function CoinLive({ active }) {
  const { settings = {} } = useData();
  const session = settings.paperBot || null;
  const [st, setSt] = useState(null), [cmd, setCmd] = useState(null), [hist, setHist] = useState(null), [err, setErr] = useState(""), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false), [note, setNote] = useState(null), [closing, setClosing] = useState(false), [closeTxt, setCloseTxt] = useState("");
  const load = async () => {
    try {
      const { data, error } = await supabase.from("qws_live_bot").select("id,data,updated_at");
      if (error) { if (/qws_live_bot|relation|does not exist|schema cache/i.test(error.message)) setMissing(true); else setErr(error.message); return; }
      setMissing(false); setErr("");
      const row = (id) => data.find((r) => r.id === id)?.data || null;
      setSt(row("status")); setCmd(row("command")); setHist(row("history"));
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { if (!active) return undefined; load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bảng có rồi mà ~20 giây chưa thấy bot báo trạng thái → hiện hướng dẫn kiểm tra (không quay vòng mãi)
  const hasSt = !!st;
  useEffect(() => { if (!active || hasSt) return undefined; const t = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(t); }, [active, hasSt]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 12000); return () => clearTimeout(t); }, [note]);
  const setStop = async (stop) => {
    if (!(await ask(stop ? "Dừng bot?\nBot huỷ các lệnh CHỜ và không mở lệnh mới. Vị thế đang mở vẫn giữ nguyên SL/TP." : "Cho bot chạy lại?\nBot sẽ tiếp tục đặt lệnh theo tín hiệu mới.", { ok: stop ? "Dừng bot" : "Chạy lại", danger: stop }))) return;
    setBusy(true);
    const { error } = await mergeCmd({ stop }, cmd);
    setBusy(false); if (error) setErr(error.message); else { setNote({ t: stop ? "Đã gửi lệnh Dừng — bot áp dụng trong ~15–30 giây." : "Đã cho bot chạy lại." }); load(); }
  };
  // Đóng hết: bước 1 = popup giải thích, bước 2 = gõ "ĐÓNG HẾT" ngay trong thẻ rồi mới gửi lệnh
  const startCloseAll = async () => {
    const ok = await ask(`Đóng hết vị thế của bot?\nBot sẽ HUỶ mọi lệnh chờ và ĐÓNG TẤT CẢ vị thế do bot mở (chỉ BTC/ETH/XAU trên ví Futures) bằng giá THỊ TRƯỜNG ngay — lãi/lỗ chốt theo giá lúc đóng, có thể trượt giá.\nSau đó bot ở trạng thái DỪNG, không mở lệnh mới cho tới khi bạn bấm "Chạy lại".${st?.mode === "live" ? "\n⚠ Đang chạy TIỀN THẬT." : ""}`, { ok: "Tiếp tục", danger: true });
    if (ok) { setClosing(true); setCloseTxt(""); }
  };
  const closeOk = plain(closeTxt) === "DONG HET";
  const doCloseAll = async () => {
    if (!closeOk) return;
    setBusy(true);
    const { error } = await mergeCmd({ closeAllAt: Date.now(), stop: true }, cmd);
    setBusy(false);
    if (error) setNote({ bad: true, t: error.message });
    else { setClosing(false); setCloseTxt(""); load(); }
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
  if (!st) {
    if (!slow) return <Card><div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">{err ? <span className="text-rose-600">{err}</span> : <><Loader2 size={16} className="animate-spin" /> Đang chờ bot báo trạng thái…</>}</div></Card>;
    return (
      <div className="space-y-3">
        <Card className="!p-4">
          <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Server size={17} className="shrink-0 text-indigo-500" /> Chưa nhận được trạng thái từ máy chạy bot</div>
          <div className="mt-1 text-[12.5px] text-slate-600">Bảng báo cáo đã có nhưng bot chưa gửi trạng thái lần nào. Kiểm tra lần lượt:</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
            <li>Máy bàn chạy bot đang bật, có mạng và không ở chế độ ngủ.</li>
            <li>Đã cài bot: repo <code>qws-live-bot</code> → Download ZIP → bấm <b>cai-dat-windows.bat</b>, dán <b>SUPABASE_SERVICE_KEY</b> khi Notepad mở.</li>
            <li>Cửa sổ bot không báo lỗi — bấm <b>xem-log.bat</b> trong thư mục bot để xem nhật ký.</li>
            <li>Bot chạy ~1 phút sẽ tự gửi trạng thái; trang này tự làm mới mỗi 20 giây.</li>
          </ol>
          {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
          <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-bold text-white"><RefreshCw size={14} /> Kiểm tra lại</button>
        </Card>
        <BotSettings st={{}} cmd={cmd} onSaved={load} defaultOpen={false} />
      </div>
    );
  }

  const online = Date.now() - st.at < 120000, stopped = !!(cmd?.stop || st.stopped);
  const act = Object.entries(st.active || {}).map(([sym, a]) => ({ sym, ...a }));
  const nPos = Object.keys(st.positions || {}).length, nLeft = Math.max(act.length, nPos);
  const closes = (st.events || []).filter((e) => e.ev === "close"), wins = closes.filter((e) => e.pnl > 0).length;
  const closeSent = cmd?.closeAllAt && Date.now() - cmd.closeAllAt < 15 * 60000 ? cmd.closeAllAt : null;
  const todayPnl = st.lastScan?.pnl;
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
          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
            <button onClick={load} aria-label="Làm mới" className="rounded-lg border border-slate-200 p-2 text-slate-500"><RefreshCw size={14} /></button>
            {stopped ? <button disabled={busy} onClick={() => setStop(false)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"><Play size={13} /> Chạy lại</button>
              : <button disabled={busy} onClick={() => setStop(true)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"><Square size={12} /> Dừng bot</button>}
            <button disabled={busy} onClick={startCloseAll} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-300 bg-white px-2.5 py-2 text-[12px] font-bold text-rose-700 disabled:opacity-50"><XOctagon size={13} /> Đóng hết vị thế</button>
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500">Rủi ro {fmtNum(st.risk, 2, 0)}%/lệnh · tối đa {st.maxOpen} lệnh · dừng ngày -{fmtNum(st.dailyStop ?? 6, 2, 0)}%{st.lastScan ? ` · quét tín hiệu ${ago(st.lastScan.at)}` : ""}{st.lastScan?.halted ? <b className="text-rose-600"> · {st.lastScan.halted}</b> : ""}</div>
        {closing && (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800">
            <b>Bước 2/2 — xác nhận đóng hết:</b> huỷ mọi lệnh chờ + đóng {nLeft ? `${nLeft} lệnh/vị thế` : "mọi vị thế"} của bot bằng giá thị trường, rồi bot DỪNG. Gõ <b>ĐÓNG HẾT</b> vào ô dưới.
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input autoFocus value={closeTxt} onChange={(e) => setCloseTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doCloseAll(); }} placeholder='Gõ "ĐÓNG HẾT"' className="w-full rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-sm text-slate-800" />
              <div className="flex shrink-0 gap-2">
                <button onClick={() => { setClosing(false); setCloseTxt(""); }} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold text-slate-600">Huỷ</button>
                <button disabled={!closeOk || busy} onClick={doCloseAll} className="flex-1 whitespace-nowrap rounded-lg bg-rose-600 px-3 py-2 font-bold text-white disabled:opacity-40">{busy ? "Đang gửi…" : "Đóng hết ngay"}</button>
              </div>
            </div>
          </div>
        )}
        {closeSent && !closing && (
          <div className={`mt-2 rounded-lg p-2 text-[12px] font-bold ${st.closeAllDoneAt >= closeSent || !nLeft ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            Lệnh ĐÓNG HẾT gửi lúc {dt(closeSent)} — {st.closeAllDoneAt >= closeSent ? "bot đã xử lý xong." : nLeft ? `đang chờ máy chạy bot xử lý (~15–30 giây, còn ${nLeft} lệnh/vị thế)…` : "✓ bot không còn lệnh chờ / vị thế nào."} Bot giữ trạng thái DỪNG cho tới khi bấm “Chạy lại”.
          </div>
        )}
        {note && <div className={`mt-2 rounded-lg p-2 text-[12px] font-bold ${note.bad ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{note.t}</div>}
        {st.waiting && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12.5px] font-bold text-amber-800">⏸ {st.waiting}</div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      <RulesCard st={st} session={session} />

      {st.mode === "testnet" && !st.dry && <TestTradeCard st={st} cmd={cmd} online={online} stopped={stopped} onSent={load} />}

      <BotSettings st={st} cmd={cmd} onSaved={load} defaultOpen={!!st.waiting} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 sm:grid-cols-4">
        <Num label="Vốn tính lệnh" v={fmtUsd(st.lastScan?.eq)} />
        <Num label="Lãi/lỗ hôm nay" v={todayPnl == null ? "—" : fmtUsdSigned(todayPnl)} t={tone(todayPnl)} />
        <Num label="Lệnh chờ / đang mở" v={`${act.filter((a) => a.stage === "entry").length} / ${act.filter((a) => a.stage === "open").length}`} />
        <Num label="Lệnh đã đóng (gần đây)" v={closes.length || "—"} sub={closes.length ? `thắng ${fmtPct((wins / closes.length) * 100, 0)}` : null} />
      </div>

      <Card className="!p-3">
        <Title>Lệnh chờ & vị thế ({act.length})</Title>
        {act.length ? <div className="space-y-1.5">{act.map((a) => (
          <div key={a.sym} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
            <div className="flex items-center gap-2">{side(a.side)}<b>{a.coin} {TF[a.tf] || a.tf}</b><Badge tone={a.stage === "open" ? "emerald" : "amber"}>{a.stage === "open" ? "Đang mở" : "Lệnh chờ"}</Badge><span className="ml-auto tabular-nums text-slate-500">rủi ro {fmtUsd(a.riskUsd)}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-3 tabular-nums text-slate-600"><span>Vào {fmtPx(a.lim)}</span><span className="text-rose-500">SL {fmtPx(a.sl)}</span><span className="text-emerald-600">TP {fmtPx(a.tp)}</span><span>KL {fmtQty(a.filledQty ?? a.qty)}</span>{a.stage === "entry" && a.until && <span className="text-slate-400">huỷ nếu chưa khớp lúc {new Date(a.until).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          </div>
        ))}</div> : <div className="py-4 text-center text-[12px] text-slate-400">Chưa có lệnh — bot đang chờ tín hiệu đạt đủ luật (trung bình vài lệnh mỗi tuần).</div>}
      </Card>

      <LiveResults hist={hist} st={st} session={session} />

      <Card className="!p-3">
        <Title>Nhật ký bot</Title>
        {(st.events || []).length ? <div className="divide-y divide-slate-100">{st.events.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-[12px]">
            <span className="w-[118px] shrink-0 tabular-nums text-[11px] text-slate-400">{typeof e.at === "number" ? dt(e.at) : e.at}</span>
            <b className={e.ev === "close" ? (e.pnl >= 0 ? "text-emerald-700" : "text-rose-700") : e.ev === "error" ? "text-rose-700" : "text-slate-700"}>{EV[e.ev] || e.ev}</b>
            {e.coin && <span className="flex items-center gap-1">{e.side ? side(e.side) : null} {e.coin} {TF[e.tf] || ""}</span>}
            {e.ev === "close" && <span className={`ml-auto font-extrabold tabular-nums ${tone(e.pnl)}`}>{fmtUsdSigned(e.pnl)}{e.R != null ? ` · ${fmtR(e.R)}` : ""}</span>}
            {(e.why || e.msg) && <span className="text-slate-400">{e.why || e.msg}</span>}
          </div>
        ))}</div> : <div className="py-4 text-center text-[12px] text-slate-400">Chưa có hoạt động.</div>}
      </Card>

      <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
        <ShieldAlert size={13} className="mt-0.5 shrink-0" />
        <span>Bot chạy trên máy bàn ở nhà bằng khoá API riêng (chỉ Futures, tắt rút tiền) — app chỉ đọc trạng thái và gửi lệnh Dừng / Đóng hết. Dừng bot không đóng vị thế đang mở (vẫn có SL/TP); “Đóng hết vị thế” mới đóng bằng giá thị trường. Không phải tư vấn đầu tư.</span>
      </div>
    </div>
  );
}

// ---------- Luật bot đang chạy + phiên bản, so với phiên Demo ----------
function RulesCard({ st, session }) {
  const sum = st.cfgSummary, v = st.version || {};
  const demo = useMemo(() => (session ? cfgOf(session) : null), [session]);
  const diffs = useMemo(() => (sum && demo ? cfgDiff(sum, demo) : []), [sum, demo]);
  const when = (t) => { if (!t) return null; const d = new Date(t); return isNaN(d) ? null : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
  return (
    <Card className="!p-3">
      <Title icon={ListChecks}>Luật & phiên bản bot</Title>
      {sum ? <div className="text-[12.5px] leading-snug text-slate-700"><b>Bot đang chạy luật:</b> {rulesText(sum)}</div>
        : <div className="rounded-lg bg-amber-50 p-2 text-[12px] font-bold text-amber-800">Bot trên máy bàn là bản cũ, chưa báo bộ luật đang chạy. {st.version?.source === "site" ? "Bấm Cài đặt bot → Tự cập nhật → “Cập nhật ngay”." : "Bản này chưa biết tự cập nhật từ web: tải ZIP mới MỘT LẦN (repo qws-live-bot → Code → Download ZIP), bấm go-cai-dat.bat, giải nén chép đè (giữ .env và thư mục data), bấm cai-dat-windows.bat — từ đó bot tự cập nhật, không cần token."}</div>}
      {sum && (!demo ? <div className="mt-1 text-[12px] text-slate-500">Chưa có phiên Demo (tab Demo tự động) để so sánh luật.</div>
        : diffs.length ? (
          <div className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-900">
            <b>Khác phiên Demo ({diffs.length}):</b>
            <ul className="mt-0.5 space-y-0.5">{diffs.map((d) => <li key={d.key}>• {d.label}: Demo <b>{d.demo}</b> · Bot <b>{d.bot}</b></li>)}</ul>
            <div className="mt-1 text-[11px] text-amber-800/80">Bot đọc lại cấu hình phiên Demo mỗi ~5 phút — vừa sửa phiên Demo thì chờ vài phút; vẫn khác thì cập nhật bot.</div>
          </div>
        ) : <div className="mt-1 text-[12px] font-bold text-emerald-700">✓ Giống phiên Demo</div>)}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
        <span>Phiên bản: <b className="tabular-nums text-slate-700">{v.sha ? v.sha.slice(0, 7) : "bản tải tay"}</b>{when(v.date) ? ` · ${when(v.date)}` : ""}</span>
        <span>Nguồn: {v.source || (v.sha ? "GitHub (tự cập nhật)" : "tải tay (ZIP)")}</span>
        <span>Luật lấy từ: {st.rules || "mặc định"}</span>
        {st.rulesHash && <span>Mã luật: <span className="tabular-nums">{String(st.rulesHash).slice(0, 8)}</span></span>}
      </div>
    </Card>
  );
}

// ---------- Kết quả lệnh thật: KPI, đường vốn, lịch sử lệnh (lọc + CSV), so sánh với Demo ----------
const isoVN = (t) => (t ? new Date(t + 7 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "");
// Lệnh thử (chỉ Testnet): bot đặt 1 lệnh nhỏ sát giá → khớp → SL/TP → đóng sau 1 phút → lịch sử → thông báo; hiện từng bước từ status.test
function TestTradeCard({ st, cmd, online, stopped, onSent }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const sentAt = Number(cmd?.testTradeAt) || 0, t = st.test && st.test.at === sentAt ? st.test : null;
  const running = !!sentAt && (!t || !t.doneAt) && Date.now() - sentAt < 20 * 60000;
  const noReply = running && !t && Date.now() - sentAt > 3 * 60000;
  const run = async () => {
    if (!(await ask("Chạy lệnh thử trên Testnet?\nBot đặt 1 lệnh LONG BTC (hoặc ETH) sát giá bằng tiền ảo, rủi ro 0,1% vốn → khớp → đặt SL/TP → giữ 1 phút → đóng → ghi lịch sử → gửi thông báo về điện thoại. Mất ~2–3 phút.", { ok: "Chạy lệnh thử" }))) return;
    setBusy(true); setErr("");
    const { error } = await mergeCmd({ testTradeAt: Date.now() }, cmd);
    setBusy(false); if (error) setErr(error.message); else onSent();
  };
  return (
    <Card className="!p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-extrabold text-slate-800">🧪 Lệnh thử (Testnet)</span>
        {t?.doneAt ? <Badge tone={t.ok ? "emerald" : "rose"}>{t.ok ? "Đạt — mọi bước OK" : "Có bước lỗi"}</Badge> : running ? <Badge tone="amber">Đang chạy…</Badge> : null}
        <button disabled={busy || running || !online || stopped} onClick={run} className="ml-auto flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40">{busy || running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Chạy lệnh thử</button>
      </div>
      <div className="mt-1 text-[11.5px] text-slate-500">Kiểm tra trọn quy trình khi không ngồi ở máy: đặt lệnh → khớp → SL/TP → đóng → lịch sử → thông báo điện thoại. Tiền ảo, rủi ro 0,1% vốn, không tính vào thống kê.{!online ? " · Bot đang mất liên lạc." : stopped ? " · Bot đang DỪNG — bấm Chạy lại trước." : ""}</div>
      {noReply && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] font-bold text-amber-800">Bot chưa nhận lệnh thử sau 3 phút — có thể máy bot chưa cập nhật bản mới (tự cập nhật trong ~5 phút) hoặc đang chờ khoá API.</div>}
      {t?.steps?.length > 0 && <ol className="mt-2 space-y-1">{t.steps.map((x, i) => (
        <li key={i} className={`flex gap-2 text-[12px] leading-snug ${x.ok ? "text-slate-700" : "font-bold text-rose-700"}`}><span className="w-[42px] shrink-0 tabular-nums text-[11px] text-slate-400">{new Date(x.t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span><span>{x.ok ? "✓" : "✖"} {x.msg}</span></li>
      ))}</ol>}
      {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
    </Card>
  );
}

function LiveResults({ hist, st, session }) {
  const all = useMemo(() => (Array.isArray(hist?.trades) ? hist.trades : []).filter((t) => t && t.coin && t.setup !== "TEST").map((t) => normLive(t, st.mode)), [hist, st.mode]); // bỏ lệnh thử khỏi thống kê
  const modes = useMemo(() => [...new Set(all.map((t) => t.mode))], [all]);
  const [mode, setMode] = useState(null), [filter, setFilter] = useState("all"), [pair, setPair] = useState("all"), [showN, setShowN] = useState(30);
  const m = mode && modes.includes(mode) ? mode : modes.includes(st.mode) ? st.mode : modes[0];
  const list = useMemo(() => all.filter((t) => t.mode === m), [all, m]);
  const S = useMemo(() => liveSummary(list, m === st.mode ? st.lastScan?.eq : null), [list, m, st.mode, st.lastScan?.eq]);
  const coins = useMemo(() => [...new Set(list.map((t) => t.coin))].sort(), [list]);
  const streams = useMemo(() => [...new Set(list.map((t) => `${t.coin}|${t.tf}`))].sort(), [list]);
  const shown = useMemo(() => list
    .filter((t) => pair === "all" || t.coin === pair || `${t.coin}|${t.tf}` === pair)
    .filter((t) => filter === "all" || (t.r != null && (filter === "win" ? t.r > 0.05 : t.r < -0.05)))
    .sort((a, b) => (b.exitAt ?? b.entryAt ?? 0) - (a.exitAt ?? a.entryAt ?? 0)), [list, pair, filter]);
  const exportCsv = () => downloadCSV(`lich-su-lenh-that-${m}-${new Date().toISOString().slice(0, 10)}`, [
    ["Mở lúc", "Đóng lúc", "Cặp", "Khung", "Hướng", "Setup", "Giá vào", "Giá ra", "SL", "TP", "Khối lượng", "Rủi ro $", "R", "Lãi/lỗ $", "Kết thúc", "Chế độ", "Mã lệnh"],
    ...shown.map((t) => [isoVN(t.entryAt), isoVN(t.exitAt), t.coin, TF[t.tf] || t.tf, t.side === 1 ? "LONG" : "SHORT", setupName(t.setup), t.entry != null ? String(t.entry) : "", t.exit != null ? String(t.exit) : "", t.sl != null ? String(t.sl) : "", t.tp != null ? String(t.tp) : "", t.qty != null ? String(t.qty) : "", t.riskUsd, t.r, t.pnl, t.reason || "", MODE_L[t.mode] || t.mode, t.id]),
  ]);
  const chip = (on) => `rounded-md px-2.5 py-1.5 text-[11.5px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;

  if (!all.length) return (
    <Card className="!p-3">
      <Title icon={BarChart3}>Kết quả lệnh thật</Title>
      <div className="py-5 text-center text-[12.5px] text-slate-400">
        {hist ? "Chưa có lệnh thật nào đóng — thống kê, đường vốn và lịch sử lệnh sẽ hiện khi bot đóng lệnh đầu tiên." : "Bot chưa gửi lịch sử lệnh thật. Nếu bot đã có lệnh đóng mà vẫn trống → bot là bản cũ, cần cập nhật (Cài đặt bot → Tự cập nhật)."}
      </div>
    </Card>
  );
  const pf = S.pf == null ? "—" : S.pf === Infinity ? "∞" : fmtNum(S.pf, 2);
  return (<>
    <Card className="!p-3">
      <Title icon={BarChart3} right={modes.length > 1 ? (
        <span className="flex gap-1 rounded-lg bg-slate-100 p-0.5">{modes.map((x) => <button key={x} onClick={() => { setMode(x); setShowN(30); }} className={`rounded-md px-2 py-1 text-[11px] font-bold ${x === m ? (x === "live" ? "bg-rose-600 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}>{MODE_L[x] || x}</button>)}</span>
      ) : <Badge tone={m === "live" ? "rose" : "sky"}>{MODE_L[m] || m}</Badge>}>Kết quả lệnh thật</Title>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 sm:grid-cols-4">
        <Num label="Lãi / lỗ tổng" v={fmtUsdSigned(S.total)} sub={`TB ${fmtUsdSigned(S.expUsd)}/lệnh`} t={tone(S.total)} />
        <Num label="Tỉ lệ thắng" v={fmtPct(S.winRate)} sub={`${S.wins} thắng · ${S.losses} thua · ${S.bes} hoà`} />
        <Num label="R TB / lệnh" v={fmtR(S.avgR)} sub="đã trừ phí" t={tone(S.avgR)} />
        <Num label="Profit factor" v={pf} sub=">1 là có lãi" t={S.pf == null ? undefined : S.pf >= 1 ? "text-emerald-600" : "text-rose-600"} />
        <Num label="Sụt vốn lớn nhất" v={S.maxDDUsd ? fmtUsd(-S.maxDDUsd) : fmtUsd(0)} sub={S.maxDDPct != null ? `${fmtPct(S.maxDDPct)} vốn (ước tính)` : "chưa rõ vốn"} t={S.maxDDPct > 20 ? "text-rose-600" : undefined} />
        <Num label="Chuỗi thua dài nhất" v={S.worstStreak} sub={`thắng liền nhiều nhất ${S.bestStreak}`} />
        <Num label="Số lệnh" v={S.n} sub={S.first ? `từ ${dt(S.first)}${S.open ? ` · ${S.open} đang mở` : ""}` : null} />
        <Num label="Thắng TB / Thua TB" v={<>{fmtR(S.avgWin)} <span className="text-slate-300">/</span> <span className="text-rose-600">{fmtR(S.avgLoss)}</span></>} sub={`lớn nhất ${fmtR(S.maxWin)}`} />
      </div>
      <div className="mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{S.base != null ? "Đường vốn (ước tính từ vốn hiện tại)" : "Lãi/lỗ cộng dồn"}</div>
      {S.curve.length >= 2 ? (
        <div className="mt-1 h-52 sm:h-60">
          <ResponsiveContainer>
            <LineChart data={S.curve} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => dt(t).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={62} tickFormatter={(v) => fmtUsd(v, 0)} />
              <Tooltip formatter={(v) => [fmtUsd(v), S.base != null ? "Vốn" : "Lãi/lỗ cộng dồn"]} labelFormatter={(t) => dt(t)} />
              <ReferenceLine y={S.base ?? 0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Line dataKey="v" stroke={S.total >= 0 ? "#10b981" : "#f43f5e"} strokeWidth={2} dot={S.curve.length <= 40} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="py-4 text-center text-[12px] text-slate-400">Cần ít nhất 1 lệnh đã đóng để vẽ đường vốn.</div>}
    </Card>

    <Card className="!p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Lịch sử lệnh thật</span>
        {[["all", "Tất cả"], ["win", "Thắng"], ["loss", "Thua"]].map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setShowN(30); }} className={chip(filter === k)}>{l}</button>)}
        <span className="ml-auto text-[11px] text-slate-400">{shown.length} lệnh</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <select value={pair} onChange={(e) => { setPair(e.target.value); setShowN(30); }} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-bold text-slate-600">
          <option value="all">Mọi cặp · mọi khung</option>
          {coins.map((c) => <option key={c} value={c}>{c} · mọi khung</option>)}
          {streams.map((s) => { const [c, tf] = s.split("|"); return <option key={s} value={s}>{c} {TF[tf] || tf}</option>; })}
        </select>
        <button onClick={exportCsv} disabled={!shown.length} className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Xuất CSV</button>
      </div>
      <div className="divide-y divide-slate-100">{shown.slice(0, showN).map((t, i) => (
        <div key={`${t.id || i}-${t.exitAt || ""}`} className="px-1 py-2">
          <div className="flex items-center gap-2 text-[12.5px]">
            {side(t.side)}<b>{t.coin}</b><span className="text-slate-400">{TF[t.tf] || t.tf}</span><span className="min-w-0 truncate text-slate-500">{setupName(t.setup)}</span>
            {t.exitAt == null && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-700">ĐANG MỞ</span>}
            <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${tone(t.r)}`}>{fmtR(t.r)}</span>
            <span className={`w-[84px] shrink-0 text-right font-extrabold tabular-nums ${tone(t.pnl)}`}>{t.pnl == null ? "—" : fmtUsdSigned(t.pnl)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] tabular-nums text-slate-500">
            <span>{dt(t.entryAt)} · {fmtPx(t.entry)} → {t.exit != null ? fmtPx(t.exit) : "…"}</span>
            <span className="text-rose-500">SL {fmtPx(t.sl)}</span><span className="text-emerald-600">TP {fmtPx(t.tp)}</span>
            {(t.reason || t.exitAt) && <span>{t.reason || "Đóng"}{t.exitAt ? ` · ${dt(t.exitAt)}` : ""}</span>}
            {t.riskUsd != null && <span className="text-slate-400">rủi ro {fmtUsd(t.riskUsd)}</span>}
          </div>
        </div>
      ))}</div>
      {!shown.length && <div className="py-6 text-center text-[12px] text-slate-400">Không có lệnh nào khớp bộ lọc.</div>}
      {shown.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({shown.length - showN})</button>}
    </Card>

    <DemoVsLive session={session} list={list} others={all.filter((t) => t.mode !== m)} events={st.events} />
  </>);
}

// ---------- Demo và Thật: chạy lại phiên Demo (Web Worker) rồi khớp từng tín hiệu theo id — CHỈ tính khi mở ra ----------
const KIND = { both: ["Khớp cả hai", "emerald"], demo: ["Demo có – bot không vào", "amber"], live: ["Bot có – demo không", "violet"] };
function DemoVsLive({ session, list, others, events }) {
  const [open, setOpen] = useState(false), [res, setRes] = useState(null), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [kind, setKind] = useState("all"), [showN, setShowN] = useState(40);
  const runId = useRef(0);
  const sig = list.map((t) => `${t.id}:${t.exitAt || ""}`).join("|");
  const run = async () => {
    if (!session || !list.length) return;
    const id = ++runId.current;
    setBusy("Đang chạy lại phiên Demo…"); setErr("");
    try {
      const from = Math.min(...list.map((t) => t.signalAt ?? t.entryAt).filter(Number.isFinite));
      // chạy tới hiện tại (kể cả phiên Demo đã dừng) và phủ được tín hiệu của lệnh thật đầu tiên
      const s = { ...session, stoppedAt: null };
      if (Number.isFinite(from) && !(s.startAt <= from - 3600000)) s.startAt = from - 86400000;
      const raw = await runSessionAsync(s, (msg) => { if (runId.current === id) setBusy(msg); });
      if (runId.current !== id) return;
      const c = compareDemoLive(raw, finalize(raw, null), list, events, others);
      if (!c) throw new Error("Lệnh thật thiếu mã lệnh (id) — chưa khớp được với Demo. Cập nhật bot lên bản mới.");
      setRes({ ...c, at: Date.now(), sig });
    } catch (e) { if (runId.current === id) setErr(e.message || String(e)); }
    if (runId.current === id) setBusy("");
  };
  useEffect(() => { if (open && !busy && (!res || res.sig !== sig) && !err) run(); }, [open, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { runId.current++; }, []);
  const rows = res?.rows || [];
  const view = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
  const slipTxt = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 3)}%`);
  return (
    <Card className="!p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[13.5px] font-extrabold text-slate-800">
        <GitCompare size={16} className="shrink-0 text-indigo-500" /> Demo và Thật
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-slate-400">{res ? `${res.nBoth} tín hiệu trùng · chênh ${fmtR(res.diffR)}` : "so từng tín hiệu: R, trượt giá, lệnh bỏ lỡ"}</span>
        <ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {!session ? <div className="rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-500">Chưa có phiên Demo — tạo phiên ở tab <b>Demo tự động</b> (cùng cặp/khung/luật với bot) rồi quay lại để so sánh.</div>
            : !list.length ? <div className="rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-500">Chưa có lệnh thật để so sánh.</div>
            : busy ? <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-slate-500"><Loader2 size={15} className="animate-spin" /> {busy}</div>
            : err ? <div className="rounded-lg bg-rose-50 p-3 text-center text-[12.5px] text-rose-700"><div className="font-bold">Không chạy được Demo để so sánh</div><div className="mt-0.5">{err}</div><button onClick={() => { setErr(""); run(); }} className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white">Thử lại</button></div>
            : res ? (<>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 sm:grid-cols-5">
                <Num label="Tín hiệu trùng" v={res.nBoth} sub="khớp cả hai" t="text-emerald-700" />
                <Num label="Chỉ Demo vào" v={res.nDemo} sub="bot không vào" t={res.nDemo ? "text-amber-700" : undefined} />
                <Num label="Chỉ bot vào" v={res.nLive} sub="demo không vào" t={res.nLive ? "text-violet-700" : undefined} />
                <Num label="Chênh R TB" v={fmtR(res.diffR)} sub={res.nPairs ? `thật ${fmtR(res.liveR)} − demo ${fmtR(res.demoR)}` : "chưa có cặp lệnh đã đóng"} t={tone(res.diffR)} />
                <Num label="Trượt giá TB" v={slipTxt(res.slip)} sub="dương = vào giá xấu hơn" t={res.slip > 0.02 ? "text-rose-600" : undefined} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[["all", `Tất cả (${rows.length})`], ...Object.entries(KIND).map(([k, [l]]) => [k, `${l} (${rows.filter((r) => r.kind === k).length})`])].map(([k, l]) => <button key={k} onClick={() => { setKind(k); setShowN(40); }} className={`rounded-md px-2.5 py-1.5 text-[11.5px] font-bold ${kind === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
                <button onClick={run} className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600"><RefreshCw size={12} /> Tính lại</button>
              </div>
              <div className="divide-y divide-slate-100">{view.slice(0, showN).map((r) => (
                <div key={r.id} className="py-2 text-[12px]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={KIND[r.kind][1]}>{KIND[r.kind][0]}</Badge>{side(r.side)}<b>{r.coin} {TF[r.tf] || r.tf}</b><span className="min-w-0 truncate text-slate-500">{setupName(r.setup)}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-slate-400">{dt(r.signalAt)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 tabular-nums text-slate-600">
                    {r.kind !== "live" && <span>Demo <b className={tone(r.demoR)}>{fmtR(r.demoR)}</b>{r.demoOpen ? " (đang mở)" : ""}</span>}
                    {r.kind !== "demo" && <span>Thật <b className={tone(r.liveR)}>{r.liveOpen ? "đang mở" : fmtR(r.liveR)}</b></span>}
                    {r.kind === "both" && r.liveR != null && r.demoR != null && !r.demoOpen && <span>chênh <b className={tone(r.liveR - r.demoR)}>{fmtR(r.liveR - r.demoR)}</b></span>}
                    {r.slip != null && <span>vào {fmtPx(r.demoEntry)} → {fmtPx(r.liveEntry)} · trượt <b className={r.slip > 0.02 ? "text-rose-600" : "text-slate-700"}>{slipTxt(r.slip)}</b></span>}
                    {r.kind !== "both" && <span className="text-slate-400">{r.why || (r.kind === "demo" ? "không thấy trong nhật ký bot (bot đang dừng / mất kết nối / nhật ký đã trôi)" : "")}</span>}
                  </div>
                </div>
              ))}</div>
              {!view.length && <div className="py-4 text-center text-[12px] text-slate-400">Không có tín hiệu nào trong nhóm này.</div>}
              {view.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({view.length - showN})</button>}
              <div className="text-[11px] leading-snug text-slate-400">So từ tín hiệu của lệnh thật đầu tiên ({dt(res.from)}) tới nay, Demo chạy lại theo cấu hình phiên Demo hiện tại (lệnh danh mục bỏ vì đủ lệnh mở / dừng ngày tính là demo không vào). Trượt giá = (giá vào thật − giá vào demo) ÷ giá demo × hướng lệnh; Testnet giá lệch nhẹ với sàn thật nên chỉ mang tính tham khảo.</div>
            </>) : null}
        </div>
      )}
    </Card>
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
  const c0 = { mode: st.mode || "testnet", riskPct: 2, capitalCap: 0, maxOpen: 3, dailyStopPct: 6, maxLev: 20, notify: true, ...(st.settings || {}), ...(cmd?.config || {}) };
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
    const v = { mode: f.mode, riskPct: Number(f.riskPct), capitalCap: Number(f.capitalCap) || 0, maxOpen: Math.round(Number(f.maxOpen)), dailyStopPct: Number(f.dailyStopPct), maxLev: Math.round(Number(f.maxLev)), notify: f.notify !== false };
    if (!(v.riskPct > 0 && v.riskPct <= 5)) return setMsg({ bad: true, t: "Rủi ro mỗi lệnh phải trong khoảng 0,1–5%" });
    if (!(v.maxOpen >= 1 && v.maxOpen <= 5)) return setMsg({ bad: true, t: "Tối đa lệnh mở: 1–5" });
    if (!(v.dailyStopPct >= 1 && v.dailyStopPct <= 20)) return setMsg({ bad: true, t: "Dừng ngày: 1–20%" });
    if (!(v.maxLev >= 1 && v.maxLev <= 20)) return setMsg({ bad: true, t: "Đòn bẩy tối đa: 1–20x" });
    const hasNewKey = k.key.trim() && k.secret.trim();
    if ((k.key.trim() || k.secret.trim()) && !hasNewKey) return setMsg({ bad: true, t: "Cần điền đủ cả API Key và Secret Key" });
    const envKey = st.keySrc === ".env" && st.mode === f.mode; // bot đang chạy bằng khoá trong .env của máy bot
    if (!hasNewKey && (!saved || stale) && !envKey) return setMsg({ bad: true, t: `Chưa có khoá API ${live ? "THẬT" : "Testnet"} — dán API Key + Secret Key rồi lưu` });
    if (!st.pubKey) return setMsg({ bad: true, t: st.at ? "Bot trên máy bàn là bản cũ — tải bản mới (Download ZIP, chép đè) rồi thử lại" : "Chưa nhận được tín hiệu từ máy chạy bot — bật bot trên máy bàn trước (khoá được mã hoá bằng khoá công khai của máy bot)" });
    if (live && cmd?.config?.mode !== "live") {
      if (confirm.trim().toUpperCase() !== "TIỀN THẬT" && confirm.trim().toUpperCase() !== "TIEN THAT") return setMsg({ bad: true, t: 'Gõ đúng chữ "TIỀN THẬT" vào ô xác nhận để bật chế độ tiền thật' });
      if (!(await ask(`Bật chạy TIỀN THẬT?\nBot sẽ đặt lệnh THẬT trên Binance: rủi ro ${v.riskPct}%/lệnh, vốn tính lệnh tối đa ${v.capitalCap ? v.capitalCap + "$" : "toàn bộ ví Futures"}, tối đa ${v.maxOpen} lệnh, dừng ngày -${v.dailyStopPct}%.\nKết quả quá khứ/testnet không đảm bảo lợi nhuận.`, { ok: "Bật tiền thật", danger: true }))) return;
    }
    setSaving(true);
    try {
      const newKey = hasNewKey ? { key: await encryptFor(st.pubKey, k.key.trim()), secret: await encryptFor(st.pubKey, k.secret.trim()), last4: k.key.trim().slice(-4), pubFp: st.pubFp, savedAt: Date.now() } : null;
      const { error } = await mergeCmd((cur) => ({
        config: { ...(cur.config || {}), ...v, liveConfirmedAt: live ? cur.config?.liveConfirmedAt || Date.now() : null },
        keys: newKey ? { ...(cur.keys || {}), [f.mode]: newKey } : { ...(cur.keys || {}) },
      }), cmd);
      if (error) throw error;
      setK({ key: "", secret: "" }); setConfirm("");
      setMsg({ t: `Đã lưu. Bot áp dụng trong ~15 giây${cmd?.config?.mode && cmd.config.mode !== f.mode ? " (đổi chế độ → bot tự khởi động lại)" : ""}.` });
      onSaved?.();
    } catch (e) { setMsg({ bad: true, t: e.message || String(e) }); }
    setSaving(false);
  };
  const removeKey = async () => {
    if (!(await ask(`Xoá khoá API ${live ? "THẬT" : "Testnet"} đã lưu?\nBot sẽ ngừng giao dịch ở chế độ này cho tới khi nhập khoá mới. Lệnh đang mở trên sàn vẫn giữ SL/TP.`, { ok: "Xoá khoá", danger: true }))) return;
    const { error } = await mergeCmd((cur) => { const keys = { ...(cur.keys || {}) }; delete keys[f.mode]; return { keys }; }, cmd);
    setMsg(error ? { bad: true, t: error.message } : { t: "Đã xoá khoá." }); onSaved?.();
  };
  return (
    <Card className="!p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[13.5px] font-extrabold text-slate-800"><Settings2 size={16} className="shrink-0 text-indigo-500" /> Cài đặt bot<span className="ml-1 min-w-0 truncate text-[11.5px] font-semibold text-slate-400">{(cmd?.config?.mode || st.mode) === "live" ? "Tiền thật" : "Testnet"} · rủi ro {fmtNum(c0.riskPct, 2, 0)}% · {cmd?.keys?.[c0.mode] ? `khoá …${cmd.keys[c0.mode].last4}` : st.keySrc === ".env" && st.mode === c0.mode ? "đang dùng khoá trong máy bot (.env)" : "chưa có khoá"}{c0.notify === false ? " · tắt thông báo" : ""}</span><ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} /></button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {[["testnet", "Testnet (tiền ảo)"], ["live", "Tiền thật"]].map(([m, l]) => <button key={m} onClick={() => { setF({ ...f, mode: m }); setMsg(null); }} className={`rounded-lg py-2 text-[13px] font-bold ${f.mode === m ? (m === "live" ? "bg-rose-600 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}>{l}</button>)}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-700"><KeyRound size={14} /> Khoá API {live ? "Binance THẬT" : "Binance Testnet"}</div>
            <div className="mt-0.5 text-[11.5px] text-slate-500">{live ? "Tạo ở Binance → API Management: CHỈ bật Futures, TẮT rút tiền, khoá theo IP máy bàn." : "Tạo ở testnet.binancefuture.com → API Key."} Khoá được <b>mã hoá ngay trên máy này</b> bằng khoá công khai của máy bot — app và Supabase không đọc lại được. Chế độ vị thế trên sàn: <b>Một chiều</b>.</div>
            {saved && !stale && <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-800">Đã lưu khoá …{saved.last4} · {new Date(saved.savedAt).toLocaleDateString("vi-VN")}<button onClick={removeKey} className="ml-auto font-bold text-rose-600">Xoá khoá</button></div>}
            {!saved && st.keySrc === ".env" && st.mode === f.mode && <div className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[12px] text-sky-800">Bot đang chạy bằng khoá {live ? "THẬT" : "Testnet"} trong file <b>.env</b> trên máy bot — không cần nhập ở đây. Dán khoá mới bên dưới nếu muốn đổi (khoá trong app được ưu tiên).</div>}
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
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-[12.5px] font-extrabold text-slate-700"><input type="checkbox" checked={f.notify !== false} onChange={(e) => setF({ ...f, notify: e.target.checked })} /><BellRing size={14} className="text-indigo-500" /> Gửi thông báo về điện thoại</label>
            <div className="mt-0.5 text-[11.5px] text-slate-500">Bot báo khi đặt / khớp / đóng lệnh, chạm dừng ngày hoặc gặp lỗi — gửi tới mọi máy đã bật thông báo đẩy của app. Lưu cùng cài đặt bên dưới.</div>
            {f.notify !== false && <PushHint />}
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
    const { error } = await mergeCmd(data, cmd);
    setBusy(false); setMsg(error ? { bad: true, t: error.message } : { t: ok }); if (!error) onSaved?.();
  };
  const saveTok = async () => {
    const t = tok.trim();
    if (!/^(github_pat_|ghp_)/.test(t)) return setMsg({ bad: true, t: "Token GitHub thường bắt đầu bằng github_pat_ — kiểm tra lại" });
    if (!st.pubKey) return setMsg({ bad: true, t: st.at ? "Bot trên máy bàn là bản cũ — tải bản mới 1 lần (Download ZIP, chép đè)" : "Chưa nhận được tín hiệu từ máy chạy bot — bật bot trên máy bàn trước" });
    const github = { token: await encryptFor(st.pubKey, t), last4: t.slice(-4), pubFp: st.pubFp, savedAt: Date.now() };
    await write((cur) => ({ keys: { ...(cur.keys || {}), github } }), "Đã lưu token — bot kiểm tra bản mới trong ~1 phút.");
    setTok("");
  };
  const ago2 = (t) => (t ? new Date(t).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
  const behind = v.latest?.sha && v.sha && v.latest.sha !== v.sha;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-700"><RefreshCw size={14} /> Tự cập nhật bot</div>
      <div className="mt-1 text-[11.5px] text-slate-500">Mỗi khi luật/bot được cải tiến, máy bàn tự tải bản mới (5 phút/lần), kiểm tra rồi tự chạy lại; bản mới lỗi → tự quay về bản cũ.</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span>Đang chạy: <b className="tabular-nums">{v.sha ? v.sha.slice(0, 7) : "bản tải tay"}</b>{v.date ? ` (${ago2(v.date)})` : ""}</span>
        {behind && <span className="font-bold text-amber-700">Có bản mới {v.latest.sha.slice(0, 7)}</span>}
        {v.lastCheck ? <span className="text-slate-400">kiểm tra lúc {ago2(v.lastCheck)}</span> : null}
        {v.error && <span className="text-rose-600">{v.error}</span>}
        <button disabled={busy || !g} onClick={() => write({ updateNow: Date.now() }, "Đã gửi lệnh — bot kiểm tra ngay (~15 giây).")} className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Cập nhật ngay</button>
      </div>
      {g && !stale ? <div className="mt-2 text-[12px] text-emerald-700">Đã lưu token GitHub …{g.last4}</div>
        : <details className="mt-2 space-y-1.5">
          <summary className="cursor-pointer text-[12px] font-semibold text-emerald-700">✓ Tự cập nhật từ trang app — KHÔNG cần token · (tuỳ chọn) thêm token GitHub làm nguồn dự phòng</summary>
          <div className="mt-1.5 text-[11.5px] text-slate-500">{stale ? <b className="text-amber-700">Token được mã hoá cho máy bot cũ — dán lại. </b> : null}Tạo token: GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate: Repository access = <b>Only qws-live-bot</b>, Permissions → <b>Contents: Read-only</b>.</div>
          <div className="flex gap-2"><input type="password" autoComplete="off" placeholder="github_pat_…" value={tok} onChange={(e) => setTok(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /><button disabled={busy || !tok.trim()} onClick={saveTok} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">Lưu</button></div>
        </details>}
      {msg && <div className={`mt-2 rounded-lg p-2 text-[12px] font-bold ${msg.bad ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.t}</div>}
    </div>
  );
}


// Máy đang xem chưa bật thông báo đẩy → gợi ý + nút bật ngay (dùng chung đăng ký Web Push của app)
function PushHint() {
  const { user } = useAuth();
  const [s, setS] = useState("checking"), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported()) { if (alive) setS("unsupported"); return; }
      if (permission() === "denied") { if (alive) setS("denied"); return; }
      // serviceWorker.ready có thể treo nếu chưa đăng ký SW → giới hạn 4 giây
      const sub = await Promise.race([isSubscribed().catch(() => false), new Promise((r) => setTimeout(() => r(false), 4000))]);
      if (alive) setS(sub ? "on" : "off");
    })();
    return () => { alive = false; };
  }, []);
  const enable = async () => {
    if (!user) return;
    setBusy(true); setMsg("");
    try { await enablePush(user.id); setS("on"); } catch (e) { setMsg(e.message || String(e)); if (permission() === "denied") setS("denied"); }
    setBusy(false);
  };
  if (s === "checking") return null;
  if (s === "on") return <div className="mt-2 text-[11.5px] font-bold text-emerald-700">✓ Máy này đã bật thông báo đẩy.</div>;
  return (
    <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-900">
      {s === "unsupported" ? <>Trình duyệt này không nhận được thông báo đẩy. Trên iPhone: mở app bằng Safari → Chia sẻ → <b>Thêm vào MH chính</b>, mở app từ biểu tượng đó rồi bật lại ở đây.</>
        : s === "denied" ? <>Máy này đã <b>chặn thông báo</b> của app — mở cài đặt trình duyệt / cài đặt thông báo của điện thoại, cho phép lại rồi tải lại trang.</>
        : <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1">Máy này <b>chưa bật thông báo đẩy</b> — sẽ không nhận tin từ bot trên máy này.</span><button disabled={busy || !user} onClick={enable} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">{busy ? "Đang bật…" : "Bật thông báo trên máy này"}</button></div>}
      {msg && <div className="mt-1 font-bold text-rose-700">{msg}</div>}
    </div>
  );
}
