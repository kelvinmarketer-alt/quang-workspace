// Dải so sánh Demo ↔ Bot thật (09/11) — nằm đầu tab "Trade COIN" cho cả hai công tắc.
// Số liệu cùng nguồn với tab Tổng quan: bảng qws_live_bot (trạng thái bot) + phiên Demo chạy lại trong Web Worker (nhớ 5 phút).
import { useEffect, useState } from "react";
import { Bot, Radio, ArrowLeftRight } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { fmtUsd, fmtUsdSigned, fmtNum, fmtPct } from "../lib/format.js";
import { demoResult, demoCacheGet } from "../lib/coinShared.js";
import { cfgOf, statsOf } from "../lib/paperBot.js";
import { finalize } from "../lib/paperBot.js";

const tone = (v) => (v == null || !isFinite(v) ? "text-slate-800" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const Cell = ({ k, v, t = "text-slate-800" }) => <div className="min-w-0"><div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{k}</div><div className={`truncate text-[13.5px] font-extrabold tabular-nums ${t}`}>{v}</div></div>;

export default function TradeCompare({ active, go, canDemo, canLive }) {
  const { settings = {}, isOwner } = useData();
  const session = canDemo ? settings.paperBot || null : null;
  const [st, setSt] = useState(null), [demo, setDemo] = useState(null);
  useEffect(() => {
    if (!active || !isOwner || !canLive) return undefined;
    let off = false;
    const load = () => supabase.from("qws_live_bot").select("id,data").eq("id", "status").maybeSingle().then(({ data }) => { if (!off) setSt(data?.data || null); });
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { off = true; clearInterval(t); };
  }, [active, isOwner, canLive]);
  useEffect(() => {
    if (!active || !session) return undefined;
    let off = false;
    demoCacheGet(session).then((c) => { if (c && !off) setDemo((d) => d || finalize(c, null)); });
    const load = () => demoResult(session).then((f) => { if (!off) setDemo(f); }, () => {});
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 300000);
    return () => { off = true; clearInterval(t); };
  }, [active, session]);
  if (!isOwner || !(session || canLive)) return null;

  const cfg = session ? cfgOf(session) : null;
  const dT = demo ? demo.portfolio.trades.filter((t) => t.status === "done" || t.status === "open") : [];
  const dOpen = dT.filter((t) => t.status === "open").length, dS = demo ? statsOf(dT.filter((t) => t.status === "done")) : null;
  const dEq = demo && cfg ? demo.portfolio.equity + (demo.portfolio.unrealized || 0) : null;
  const online = st && Date.now() - st.at < 180000;
  const nPos = Object.keys(st?.positions || {}).length, nAct = Object.keys(st?.active || {}).length, nWait = Math.max(0, nAct - nPos);
  const bothOpen = demo && st;
  const gap = bothOpen ? dOpen - (nPos + nWait) : null;

  return (<>
    {/* 10/11: điện thoại — 1 dòng gọn (số đầy đủ đã có ở Tổng quan Coin); máy tính giữ dải 2 cột */}
    <div className="flex items-center gap-2 whitespace-nowrap rounded-none bg-white/70 px-3 py-2 text-[12px] shadow-sm md:hidden">
      <button onClick={() => go("bot")} disabled={!session} className="flex min-w-0 items-center gap-1 font-bold text-slate-600"><Bot size={13} className="shrink-0 text-emerald-500" /><span className="truncate">Demo <b className={`tabular-nums ${dEq != null ? tone(dEq - cfg.capital) : ""}`}>{dEq != null ? fmtUsd(dEq) : "…"}</b>{demo ? ` · ${dOpen} lệnh` : ""}</span></button>
      {gap != null && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${gap === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{gap === 0 ? "khớp" : `lệch ${gap > 0 ? "+" : ""}${gap}`}</span>}
      <button onClick={() => go("live")} disabled={!canLive} className="ml-auto flex min-w-0 items-center gap-1 font-bold text-slate-600"><Radio size={13} className="shrink-0 text-rose-500" /><span className="truncate">Thật {st ? <>{nPos}·{nWait} <b className={`tabular-nums ${tone(st.lastScan?.pnl)}`}>{st.lastScan?.pnl == null ? "" : fmtUsdSigned(st.lastScan.pnl)}</b></> : "…"}</span></button>
    </div>
    <div className="hidden gap-2 rounded-none bg-white/70 p-2.5 shadow-sm sm:rounded-2xl sm:p-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
      <button onClick={() => go("bot")} disabled={!session} className="rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 disabled:opacity-50">
        <div className="mb-1 flex items-center gap-1.5 text-[12px] font-extrabold text-slate-700"><Bot size={14} className="text-emerald-500" /> Demo tự động</div>
        {session ? (
          <div className="grid grid-cols-3 gap-2">
            <Cell k="Vốn" v={dEq != null ? fmtUsd(dEq) : "…"} t={dEq != null ? tone(dEq - cfg.capital) : undefined} />
            <Cell k="Đang mở" v={demo ? `${dOpen} lệnh` : "…"} />
            <Cell k="Thắng · R TB" v={dS?.n ? `${fmtNum(dS.winRate, 0, 0)}% · ${dS.avgR >= 0 ? "+" : ""}${fmtNum(dS.avgR, 2, 2)}R` : "—"} />
          </div>
        ) : <div className="text-[12px] text-slate-400">Chưa có phiên Demo.</div>}
      </button>
      <div className="hidden flex-col items-center gap-0.5 px-1 md:flex" title="Bot thật bám lệnh Demo đang mở; chênh số lệnh là bình thường khi Testnet khác giá, đòn bẩy hoặc giới hạn lệnh">
        <ArrowLeftRight size={16} className="text-slate-300" />
        {gap != null && <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${gap === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{gap === 0 ? "khớp" : `lệch ${gap > 0 ? "+" : ""}${gap}`}</span>}
      </div>
      <button onClick={() => go("live")} disabled={!canLive} className="rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 disabled:opacity-50">
        <div className="mb-1 flex items-center gap-1.5 text-[12px] font-extrabold text-slate-700"><Radio size={14} className="text-rose-500" /> Bot thật
          {st && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${st.mode === "live" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>{st.mode === "live" ? "TIỀN THẬT" : "TESTNET"}</span>}
          {st && <span className={`text-[10.5px] font-bold ${online ? "text-emerald-600" : "text-amber-600"}`}>{online ? "đang chạy" : `mất liên lạc · ${ago(st.at)}`}</span>}</div>
        {st ? (
          <div className="grid grid-cols-3 gap-2">
            <Cell k="Vị thế · chờ" v={`${nPos} · ${nWait}`} />
            <Cell k="Lãi/lỗ hôm nay" v={st.lastScan?.pnl == null ? "—" : fmtUsdSigned(st.lastScan.pnl)} t={tone(st.lastScan?.pnl)} />
            <Cell k="Rủi ro / lệnh" v={st.settings?.riskPct != null ? `${fmtPct(Number(st.settings.riskPct), 2)}` : "—"} />
          </div>
        ) : <div className="text-[12px] text-slate-400">{canLive ? "Đang tải trạng thái bot…" : "Không có quyền xem."}</div>}
      </button>
    </div>
  </>);
}
