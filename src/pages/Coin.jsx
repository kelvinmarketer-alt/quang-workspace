import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, X, Trash2, Pencil, TrendingUp, TrendingDown, RefreshCw, Coins, AlertTriangle, Wallet, CandlestickChart, Loader2, Bot, Radio, ChevronDown, History, Info, ChartPie, LayoutDashboard, MonitorDot, Sun, ShieldCheck, Cpu } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";
import { formatVND, fmtUsd, fmtUsdSigned, fmtPx, fmtQty, fmtNum, fmtPct } from "../lib/format.js";
import { useBinance, useUsdVnd, depositInfo } from "../lib/coinShared.js";
import InfoTip from "../components/InfoTip.jsx";
import { cfgOf } from "../lib/paperBot.js";
import { supabase } from "../lib/supabase.js";
import TradeCompare from "../components/TradeCompare.jsx";
const CoinInvest = lazy(() => import("./CoinInvest.jsx"));
// Tab "Thị trường" (biểu đồ + AI) tải lười — không làm nặng tab Đầu tư
const CoinMarket = lazy(() => import("./CoinMarket.jsx"));
// Tab "Demo tự động" (bot giao dịch giả lập theo phương pháp) — tải lười
const CoinBot = lazy(() => import("./CoinBot.jsx"));
// Tab "Bot thật": theo dõi bot giao dịch chạy trên VPS (chỉ chủ)
const CoinLive = lazy(() => import("./CoinLive.jsx"));
// Tab "EA MT5" (07/11, chỉ chủ): EA QWS_Gop chạy trong MT5 trên máy bàn — bảng Supabase qws_mt5_bot
const CoinMT5 = lazy(() => import("./CoinMT5.jsx"));
// Thanh công tắc nhỏ dùng chung (Demo | Bot thật, Coin | Forex)
function SubSwitch({ value, onChange, items }) {
  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-white/70 p-1 shadow-sm [scrollbar-width:none]">
      {items.map(([k, label, Icon]) => (
        <button key={k} onClick={() => onChange(k)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold transition ${value === k ? "bg-slate-800 text-white shadow" : "text-slate-500 hover:text-slate-800"}`}>
          {Icon && <Icon size={14} />}{label}
        </button>
      ))}
    </div>
  );
}

// 09/11: gộp "Demo tự động" + "Bot thật" → tab "Trade COIN" (công tắc Demo | Bot thật bên trong); "EA MT5" → "Trade Forex".
// Khoá cũ (bot / live / mt5) vẫn dùng được trong link thông báo + nhớ tab → tự đổi sang tab mới.
const COIN_TABS = ["overview", "invest", "market", "trade", "forex"];
const LEGACY = { bot: { tab: "trade", sub: "bot" }, live: { tab: "trade", sub: "live" }, mt5: { tab: "forex" }, fxmarket: { tab: "market", msub: "forex" } }; // fxmarket = link thông báo cảnh báo giá Forex
const route = (t) => (COIN_TABS.includes(t) ? { tab: t } : LEGACY[t] || null);
// Tab "Tổng quan" (chỉ chủ): tài sản + bot thật + demo + cảnh báo giá trong 1 màn hình
const CoinOverview = lazy(() => import("./CoinOverview.jsx"));

// Quy tắc quản trị rủi ro — luôn hiện cuối module (21/10, tham khảo viaitrading).
// 01/11: tab Bot thật đọc rủi ro / lệnh mở / dừng ngày / đòn bẩy BOT ĐANG DÙNG (dòng status) — bot đặt riêng thì khác Demo
function RiskRules({ live = false }) {
  const { settings = {} } = useData();
  const [bot, setBot] = useState(null);
  useEffect(() => {
    if (!live) return undefined;
    let off = false;
    supabase.from("qws_live_bot").select("data").eq("id", "status").maybeSingle().then(({ data }) => { if (!off) setBot(data?.data?.settings || null); });
    return () => { off = true; };
  }, [live]);
  const base = cfgOf(settings.paperBot || null);
  const own = live && bot ? Object.fromEntries(["riskPct", "maxOpen", "dailyStopPct", "maxLev"].filter((k) => bot[k] != null).map((k) => [k, Number(bot[k])])) : {};
  const c = { ...base, ...own, ...(live && bot && own.riskPct != null && own.riskPct !== base.riskPct ? { riskBySetup: {} } : {}) };
  const diff = live && bot && ["riskPct", "maxOpen", "dailyStopPct", "maxLev"].some((k) => own[k] != null && own[k] !== Number(base[k]));
  const rules = c.strategy === "sw3" ? [ // SW3 (06/11): không có TP cố định / không đuổi giá — quản lý bằng chốt 1/3 + dời SL
    ["Rủi ro", `${fmtNum(c.riskPct, 2, 0)}% vốn / lệnh${Object.keys(c.riskByCoin || {}).length ? ` (${Object.keys(c.riskByCoin).length} mã mới ${fmtNum(Math.min(c.riskPct, Object.values(c.riskByCoin)[0]), 2, 0)}%)` : ""}`], ["Cùng lúc", `tối đa ${c.maxOpen} lệnh, mỗi mã 1`],
    ...(c.sw?.entry === "lim" ? [["Điểm vào", "lệnh chờ M15 0,25 ATR · 4 giờ chưa khớp → thị trường"]] : []), ["Dừng ngày", Number(c.dailyStopPct) > 0 ? `khi lỗ ${fmtNum(c.dailyStopPct, 1, 0)}%` : "không dừng ngày"],
    ["Cắt lỗ", `${fmtNum(c.sw?.stopAtr, 1, 0)} ATR H4, luôn đặt trên sàn`], ["Chốt lời", `1/3 ở +${fmtNum(c.sw?.partR, 2, 0)}R rồi hoà vốn`], ["Phần còn lại", `dời SL theo đáy/đỉnh ${c.sw?.trailN} nến H4`],
    ["Xu hướng", "thuận EMA200 H4 + BTC EMA50 D1"], ["Ví", "chỉ Futures, không đụng Spot"],
  ] : [
    ["Rủi ro",`${fmtNum(c.riskPct, 1, 0)}% vốn / lệnh${Object.keys(c.riskBySetup || {}).length ? ` (${Object.entries(c.riskBySetup).map(([k, v]) => `${k} ${fmtNum(Math.min(v, c.riskPct), 1, 0)}%`).join(", ")})` : ""}`], ["Cùng lúc", `tối đa ${c.maxOpen} lệnh`], ["Dừng ngày", `khi lỗ ${fmtNum(c.dailyStopPct, 1, 0)}%`],
    ["Chốt lời", `R:R 1:${fmtNum(c.rr, 1, 0)}`], ["Cắt lỗ", `SL ≥ ${fmtNum(c.minSlAtr, 1, 0)} ATR, luôn đặt`], ["Không đuổi giá", `≤ ${fmtNum(c.maxExtAtr, 1, 0)} ATR từ EMA50`],
    ...(c.d1Bias ? [["Xu hướng", "chỉ thuận D1"]] : []), ["Ví", "chỉ Futures, không đụng Spot"],
  ];
  return (
    <div className="rounded-none border border-amber-300/60 bg-amber-50/60 p-3 sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-amber-700"><ShieldCheck size={15} /> Quy tắc quản trị rủi ro & bảo vệ vốn (bot v{c.cfgVer}){live && <span className="normal-case tracking-normal font-bold text-amber-600/80">· {bot ? (diff ? "bot thật đang đặt riêng, khác Demo" : "bot thật đang dùng") : "đang đọc bot…"}</span>}</div>
      <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-100/60 px-3 py-1.5 text-[12px] font-bold text-amber-800">“Phân tích do hệ thống/AI hỗ trợ · chỉ để tham khảo · không phải tư vấn đầu tư · giao dịch có rủi ro.”</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {rules.map(([k, v]) => <div key={k} className="rounded-lg bg-white/70 px-2.5 py-1.5"><div className="text-[10.5px] font-bold uppercase text-slate-400">{k}</div><div className="text-[12.5px] font-extrabold text-slate-800">{v}</div></div>)}
      </div>
    </div>
  );
}

export default function Coin() {
  const { isOwner, perms = [] } = useData();
  // Tab theo quyền (21/10): chủ thấy hết; thành viên thấy tab được cấp (Tổng quan Coin luôn chỉ chủ)
  const allowTab = { overview: isOwner, invest: isOwner || perms.includes("coinInvest"), market: isOwner || perms.includes("coinMarket"), trade: isOwner || perms.includes("coinDemo") || perms.includes("coinLive"), forex: isOwner };
  const allowSub = { bot: isOwner || perms.includes("coinDemo"), live: isOwner || perms.includes("coinLive") };
  // ?tab=live|bot|mt5|trade|forex|market|invest (vd link từ thông báo đẩy) → mở đúng tab; không có thì nhớ tab lần trước
  const [sp, setSp] = useSearchParams();
  const qTab = sp.get("tab");
  const first = useMemo(() => { // lúc mở trang: link ?tab → nhớ tab lần trước → Tổng quan
    let r = route(qTab);
    if (!r) { try { r = route(localStorage.getItem("qws_coin_tab")); } catch { /* bỏ qua */ } }
    return r || { tab: "overview" };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState(first.tab);
  const [sub, setSub] = useState(() => { if (first.sub) return first.sub; try { return localStorage.getItem("qws_trade_sub") === "live" ? "live" : "bot"; } catch { return "bot"; } });
  const [mSub, setMSub] = useState(() => { if (first.msub) return first.msub; try { return localStorage.getItem("qws_market_sub") === "forex" ? "forex" : "coin"; } catch { return "coin"; } });
  // Tab đã mở thì GIỮ mounted (ẩn bằng class hidden) → Demo tự động/Thị trường không phải tính lại khi quay lại
  const [seen, setSeen] = useState(() => ({ [first.tab]: true, ...(first.tab === "trade" ? { [first.sub || "bot"]: true } : {}), ...(first.msub ? { ["m_" + first.msub]: true } : {}) }));
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };
  const pickSub = (v) => { setSub(v); setSeen((x) => (x[v] ? x : { ...x, [v]: true })); lsSet("qws_trade_sub", v); };
  const pickMSub = (v) => { setMSub(v); setSeen((x) => (x["m_" + v] ? x : { ...x, ["m_" + v]: true })); lsSet("qws_market_sub", v); };
  const pick = (t) => {
    const r = route(t); if (!r) return;
    setTab(r.tab); setSeen((x) => (x[r.tab] ? x : { ...x, [r.tab]: true })); lsSet("qws_coin_tab", r.tab);
    if (r.sub) pickSub(r.sub);
    if (r.msub) pickMSub(r.msub);
  };
  // Đang ở trang Coin mà bấm link ?tab=… → chuyển tab, rồi xoá tham số để lần bấm sau (cùng link) vẫn ăn
  useEffect(() => {
    if (!qTab) return;
    pick(qTab);
    const nx = new URLSearchParams(sp); nx.delete("tab"); setSp(nx, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTab]);
  // Tab không được phép (người khác / lúc chưa xác định chủ) → rơi về tab đầu tiên được xem
  const cur = allowTab[tab] ? tab : COIN_TABS.find((k) => allowTab[k]) || "market";
  const subCur = allowSub[sub] ? sub : allowSub.bot ? "bot" : "live"; // công tắc Demo | Bot thật theo quyền
  // 10/11: cầu nối MT5 chưa chạy (không có dữ liệu trong 3 ngày) → ẩn tab Trade Forex + Thị trường Forex khỏi thanh tab.
  // Vẫn mở được bằng link ?tab=forex (vd để xem hướng dẫn cài); cầu nối chạy lại thì tab tự hiện.
  const [fxLive, setFxLive] = useState(null);
  useEffect(() => {
    if (!isOwner) return undefined;
    let dead = false;
    supabase.from("qws_mt5_bot").select("updated_at").in("id", ["status", "mkq"]).then(({ data }) => {
      if (dead) return;
      const last = Math.max(0, ...(data || []).map((r) => Date.parse(r.updated_at) || 0));
      setFxLive(Date.now() - last < 3 * 86400000);
    }, () => { if (!dead) setFxLive(false); });
    return () => { dead = true; };
  }, [isOwner]);
  const showTab = { ...allowTab, forex: allowTab.forex && (fxLive === true || cur === "forex") };
  const showFxMarket = isOwner && (fxLive === true || mSub === "forex");
  const fb = <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải…</div>;
  return (
    <div className="bento space-y-3 p-3 sm:space-y-4 sm:p-5">
      <div className="flex items-stretch gap-1 sm:gap-2">
      <div className={`flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-none bg-white/70 p-1 shadow-sm [scrollbar-width:none] sm:grid sm:overflow-visible sm:rounded-2xl ${["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5"][COIN_TABS.filter((k) => showTab[k]).length] || "sm:grid-cols-5"}`}>
        {[["overview", "Tổng quan", LayoutDashboard, "Tổng quan"], ["invest", "Đầu tư", Wallet, "Đầu tư"], ["market", "Thị trường", CandlestickChart, "Thị trường"], ["trade", "Trade COIN", Bot, "Coin"], ["forex", "Trade Forex", Cpu, "Forex"]].filter(([k]) => showTab[k]).map(([k, label, Icon, short]) => (
          <button key={k} onClick={() => pick(k)} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-extrabold transition sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm ${cur === k ? "tab-active bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon size={16} className="shrink-0" /> <span className="whitespace-nowrap sm:hidden">{short}</span><span className="hidden whitespace-nowrap sm:inline">{label}</span>
          </button>
        ))}
      </div>
      </div>
      {isOwner && (seen.overview || cur === "overview") && <div className={cur === "overview" ? "" : "hidden"}><Suspense fallback={fb}><CoinOverview active={cur === "overview"} go={pick} /></Suspense></div>}
      {allowTab.invest && (seen.invest || cur === "invest") && <div className={cur === "invest" ? "" : "hidden"}><Suspense fallback={fb}><CoinInvest active={cur === "invest"} /></Suspense></div>}
      {allowTab.market && (seen.market || cur === "market") && (
        <div className={cur === "market" ? "space-y-3" : "hidden"}>
          <SubSwitch value={mSub} onChange={pickMSub} items={[["coin", "Thị trường Coin · Binance", Coins], ...(showFxMarket ? [["forex", "Thị trường Forex · MT5", Cpu]] : [])]} />
          {(seen.m_coin || mSub === "coin") && <div className={mSub === "coin" ? "" : "hidden"}><Suspense fallback={fb}><CoinMarket active={cur === "market" && mSub === "coin"} /></Suspense></div>}
          {isOwner && (seen.m_forex || mSub === "forex") && <div className={mSub === "forex" ? "" : "hidden"}><Suspense fallback={fb}><CoinMarket venue="forex" active={cur === "market" && mSub === "forex"} /></Suspense></div>}
        </div>
      )}
      {allowTab.trade && (seen.trade || cur === "trade") && (
        <div className={cur === "trade" ? "space-y-3" : "hidden"}>
          <TradeCompare active={cur === "trade"} go={pick} canDemo={allowSub.bot} canLive={allowSub.live} />
          <SubSwitch value={subCur} onChange={pickSub} items={[...(allowSub.bot ? [["bot", "Demo tự động", Bot]] : []), ...(allowSub.live ? [["live", "Bot thật", Radio]] : [])]} />
          {allowSub.bot && (seen.bot || subCur === "bot") && <div className={subCur === "bot" ? "" : "hidden"}><Suspense fallback={fb}><CoinBot active={cur === "trade" && subCur === "bot"} /></Suspense></div>}
          {allowSub.live && (seen.live || subCur === "live") && <div className={subCur === "live" ? "" : "hidden"}><Suspense fallback={fb}><CoinLive active={cur === "trade" && subCur === "live"} /></Suspense></div>}
        </div>
      )}
      {isOwner && (seen.forex || cur === "forex") && <div className={cur === "forex" ? "" : "hidden"}><Suspense fallback={fb}><CoinMT5 active={cur === "forex"} /></Suspense></div>}
      {cur !== "invest" && cur !== "forex" && !(cur === "market" && mSub === "forex") && <RiskRules live={cur === "trade" && subCur === "live"} />}
    </div>
  );
}

// Ô số trên khung tổng (nền tối)
