import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Plus, X, Trash2, Pencil, TrendingUp, TrendingDown, RefreshCw, Coins, AlertTriangle, Wallet, CandlestickChart, Loader2, Bot, Radio, ChevronDown, History, Info, ChartPie, LayoutDashboard, MonitorDot, Sun, ShieldCheck } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";
import { formatVND, fmtUsd, fmtUsdSigned, fmtPx, fmtQty, fmtNum, fmtPct } from "../lib/format.js";
import { useBinance, useUsdVnd, depositInfo } from "../lib/coinShared.js";
import InfoTip from "../components/InfoTip.jsx";
import { cfgOf } from "../lib/paperBot.js";
import { useTheme } from "../lib/theme.js";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
// Đọc số kiểu VN: phẩy = thập phân ("0,5"); chấm + đúng 3 số = phân cách nghìn ("60.000", "1.234.567");
// 1 dấu chấm còn lại = thập phân ("0.5", "81234.5"); có cả 2 loại → dấu xuất hiện sau cùng là thập phân
const n = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/\s/g, "").replace(/[^\d.,\-]/g, "");
  const neg = s.startsWith("-"); s = s.replace(/-/g, "");
  if (!s) return 0;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc >= 0) s = (s.match(/,/g).length > 1 ? s.replace(/,/g, "") : s.replace(",", "."));
  else if (ld >= 0) {
    const parts = s.split(".");
    const thousands = parts.slice(1).every((p) => p.length === 3) && !/^0*$/.test(parts[0]);
    s = thousands ? parts.join("") : parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  }
  const x = Number(s);
  return Number.isFinite(x) ? (neg ? -x : x) : 0;
};
const viNum = (x) => Number(x || 0).toLocaleString("vi-VN", { maximumFractionDigits: 10 });
// Số đã lưu → chuỗi để sửa (phẩy thập phân, không nhóm nghìn) — tránh "1234.567" bị đọc thành 1.234.567
const toInput = (x) => (x === "" || x == null ? "" : typeof x === "number" ? x.toLocaleString("vi-VN", { useGrouping: false, maximumFractionDigits: 12 }) : x);
const pair = (s) => (s || "").toUpperCase().replace(/USDT$/, "") + "USDT";
// Tiền: MỘT kiểu chung module Coin (fmtUsd "$1.234,56" · fmtUsdSigned "+$12,30" · giá "$" + fmtPx · VND phụ bằng formatVND)
const STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI"]); // coi như 1 $, không tính lãi/lỗ
const usdPx = (v) => (v == null || !isFinite(Number(v)) ? "—" : "$" + fmtPx(v));
const sPct = (v) => (v == null || !isFinite(v) ? "" : (v >= 0 ? "+" : "") + fmtPct(v, 1));
const sVnd = (v) => (v >= 0 ? "+" : "-") + formatVND(Math.abs(v));
const toneOf = (v) => (v == null ? "text-slate-500" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const fmtWhen = (t) => {
  const d = new Date(Number(t));
  if (!isFinite(d.getTime())) return "—";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const TICKER = "https://api.binance.com/api/v3/ticker/24hr";
// Bảng màu phân loại (thứ tự cố định, đã kiểm tra mù màu) — màu GẮN THEO COIN (xếp A→Z), không theo thứ hạng giá trị
const SLICE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const FUT_COLOR = "#334155", OTHER_COLOR = "#cbd5e1";

function CoinModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => ({ ...initial, qty: toInput(initial.qty), buyPrice: toInput(initial.buyPrice ?? initial.avgCost) })); // dòng danh mục chỉ có avgCost
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Hiện số sẽ lưu ngay dưới ô để user thấy app hiểu đúng
  const hint = (raw) => (String(raw ?? "").trim() ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">= {viNum(n(raw))}</span> : null);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial.id ? "Sửa coin" : "Thêm coin thủ công"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Mã coin *</span><input value={f.symbol} onChange={set("symbol")} autoFocus className={`${inputCls} uppercase`} placeholder="BTC, ETH, SOL…" /></label>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Số lượng</span><input value={f.qty} onChange={set("qty")} inputMode="decimal" className={inputCls} placeholder="0,5" />{hint(f.qty)}</label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Giá vốn ($/coin)</span><input value={f.buyPrice} onChange={set("buyPrice")} inputMode="decimal" className={inputCls} placeholder="60.000" />{hint(f.buyPrice)}</label>
        </div>
        <button onClick={() => { if ((f.symbol || "").trim()) { onSave({ symbol: f.symbol.trim().toUpperCase(), qty: n(f.qty), buyPrice: n(f.buyPrice) }); onClose(); } }} className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/30">Lưu</button>
      </div>
    </div>
  );
}

// Tab "Thị trường" (biểu đồ + AI) tải lười — không làm nặng tab Đầu tư
const CoinMarket = lazy(() => import("./CoinMarket.jsx"));
// Tab "Demo tự động" (bot giao dịch giả lập theo phương pháp) — tải lười
const CoinBot = lazy(() => import("./CoinBot.jsx"));
// Tab "Bot thật": theo dõi bot giao dịch chạy trên VPS (chỉ chủ)
const CoinLive = lazy(() => import("./CoinLive.jsx"));

const COIN_TABS = ["overview", "invest", "market", "bot", "live"];
// Tab "Tổng quan" (chỉ chủ): tài sản + bot thật + demo + cảnh báo giá trong 1 màn hình
const CoinOverview = lazy(() => import("./CoinOverview.jsx"));

// Quy tắc quản trị rủi ro bot đang áp dụng (đọc từ cấu hình phiên Demo = luật bot thật) — luôn hiện cuối module (21/10, tham khảo viaitrading)
function RiskRules() {
  const { settings = {} } = useData();
  const c = cfgOf(settings.paperBot || null);
  const rules = [
    ["Rủi ro", `${fmtNum(c.riskPct, 1, 0)}% vốn / lệnh`], ["Cùng lúc", `tối đa ${c.maxOpen} lệnh`], ["Dừng ngày", `khi lỗ ${fmtNum(c.dailyStopPct, 1, 0)}%`],
    ["Chốt lời", `R:R 1:${fmtNum(c.rr, 1, 0)}`], ["Cắt lỗ", `SL ≥ ${fmtNum(c.minSlAtr, 1, 0)} ATR, luôn đặt`], ["Không đuổi giá", `≤ ${fmtNum(c.maxExtAtr, 1, 0)} ATR từ EMA50`],
    ...(c.d1Bias ? [["Xu hướng", "chỉ thuận D1"]] : []), ["Ví", "chỉ Futures, không đụng Spot"],
  ];
  return (
    <div className="rounded-none border border-amber-300/60 bg-amber-50/60 p-3 sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-amber-700"><ShieldCheck size={15} /> Quy tắc quản trị rủi ro & bảo vệ vốn (bot v{c.cfgVer})</div>
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
  const allowTab = { overview: isOwner, invest: isOwner || perms.includes("coinInvest"), market: isOwner || perms.includes("coinMarket"), bot: isOwner || perms.includes("coinDemo"), live: isOwner || perms.includes("coinLive") };
  // ?tab=live|bot|market|invest (vd link từ thông báo đẩy) → mở đúng tab; không có thì nhớ tab lần trước
  const [sp, setSp] = useSearchParams();
  const qTab = sp.get("tab");
  const [tab, setTab] = useState(() => { if (COIN_TABS.includes(qTab)) return qTab; try { return localStorage.getItem("qws_coin_tab") || "overview"; } catch { return "overview"; } });
  // Tab đã mở thì GIỮ mounted (ẩn bằng class hidden) → Demo tự động/Thị trường không phải tính lại khi quay lại
  const [seen, setSeen] = useState(() => ({ [tab]: true }));
  const pick = (t) => { setTab(t); setSeen((s) => (s[t] ? s : { ...s, [t]: true })); try { localStorage.setItem("qws_coin_tab", t); } catch {} };
  // Đang ở trang Coin mà bấm link ?tab=… → chuyển tab, rồi xoá tham số để lần bấm sau (cùng link) vẫn ăn
  useEffect(() => {
    if (!qTab) return;
    if (COIN_TABS.includes(qTab)) pick(qTab);
    const nx = new URLSearchParams(sp); nx.delete("tab"); setSp(nx, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTab]);
  // Giao diện Pro = giao diện tối TOÀN APP (21/10, lib/theme.js) — nút ở đây và ở thanh trên cùng là một
  const [theme, setTheme] = useTheme(), pro = theme === "dark";
  const setPro = (v) => setTheme(v ? "dark" : "light");
  // "Bot thật" + "Tổng quan" chỉ chủ xem → người khác (hoặc lúc chưa xác định chủ) rơi về Đầu tư
  const cur = allowTab[tab] ? tab : COIN_TABS.find((k) => allowTab[k]) || "market";
  const fb = <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải…</div>;
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-stretch gap-1 sm:gap-2">
      <div className={`flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-none bg-white/70 p-1 shadow-sm [scrollbar-width:none] sm:grid sm:overflow-visible sm:rounded-2xl ${["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5"][COIN_TABS.filter((k) => allowTab[k]).length] || "sm:grid-cols-5"}`}>
        {[["overview", "Tổng quan", LayoutDashboard, "Tổng quan"], ["invest", "Đầu tư", Wallet, "Đầu tư"], ["market", "Thị trường", CandlestickChart, "Thị trường"], ["bot", "Demo tự động", Bot, "Demo"], ["live", "Bot thật", Radio, "Bot thật"]].filter(([k]) => allowTab[k]).map(([k, label, Icon, short]) => (
          <button key={k} onClick={() => pick(k)} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-extrabold transition sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm ${cur === k ? "tab-active bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon size={16} className="shrink-0" /> <span className="whitespace-nowrap sm:hidden">{short}</span><span className="hidden whitespace-nowrap sm:inline">{label}</span>
          </button>
        ))}
      </div>
        <button onClick={() => setPro(!pro)} title={pro ? "Về giao diện thường" : "Giao diện Pro (nền tối kiểu sàn giao dịch)"} className={`hidden shrink-0 items-center gap-1.5 rounded-none px-3 text-[12px] font-extrabold shadow-sm transition sm:flex sm:rounded-2xl ${pro ? "pro-toggle-on" : "bg-white/70 text-slate-600 hover:text-slate-900"}`}>
          {pro ? <Sun size={15} /> : <MonitorDot size={15} />}<span className="hidden sm:inline">{pro ? "Thường" : "Pro"}</span>
        </button>
      </div>
      {isOwner && (seen.overview || cur === "overview") && <div className={cur === "overview" ? "" : "hidden"}><Suspense fallback={fb}><CoinOverview active={cur === "overview"} go={pick} /></Suspense></div>}
      {allowTab.invest && (seen.invest || cur === "invest") && <div className={cur === "invest" ? "" : "hidden"}><CoinInvest active={cur === "invest"} /></div>}
      {allowTab.market && (seen.market || cur === "market") && <div className={cur === "market" ? "" : "hidden"}><Suspense fallback={fb}><CoinMarket active={cur === "market"} /></Suspense></div>}
      {allowTab.bot && (seen.bot || cur === "bot") && <div className={cur === "bot" ? "" : "hidden"}><Suspense fallback={fb}><CoinBot active={cur === "bot"} /></Suspense></div>}
      {allowTab.live && (seen.live || cur === "live") && <div className={cur === "live" ? "" : "hidden"}><Suspense fallback={fb}><CoinLive active={cur === "live"} /></Suspense></div>}
      {cur !== "invest" && <RiskRules />}
    </div>
  );
}

// Ô số trên khung tổng (nền tối)
function HeadChip({ label, hint, value, sub, subTone }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-2 py-1.5 sm:px-3 sm:py-2">
      <div className="truncate text-[10px] font-bold uppercase tracking-wide text-amber-200">{label}{hint && <span className="hidden font-semibold normal-case tracking-normal text-amber-100/60 sm:inline"> · {hint}</span>}</div>
      {hint && <div className="truncate text-[10px] leading-tight text-amber-100/60 sm:hidden">{hint}</div>}
      <div className="truncate text-[13px] font-extrabold tabular-nums sm:text-base">{value}</div>
      {sub && <div className={`truncate text-[10px] font-semibold ${subTone || "text-amber-100/60"}`}>{sub}</div>}
    </div>
  );
}

// Ô lãi/lỗ (nền sáng)
function PnlTile({ label, value, tone = "text-slate-800", sub }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2">
      <div className="text-[10.5px] font-semibold leading-tight text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-[15px] font-extrabold tabular-nums sm:text-base ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{sub}</div>}
    </div>
  );
}

// Biểu đồ phân bổ (donut) + chú thích có %
function Allocation({ slices, total }) {
  if (!(total > 0) || !slices.length) return null;
  return (
    <Card className="!p-3 sm:!p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-slate-800"><ChartPie size={15} className="text-amber-500" /> Phân bổ tài sản Binance</div>
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="relative h-[124px] w-[124px] shrink-0 sm:h-[150px] sm:w-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip formatter={(v, name) => [`${fmtUsd(v)} · ${fmtPct((v / total) * 100, 1)}`, name]} contentStyle={{ borderRadius: 12, fontSize: 12, padding: "6px 10px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><div className="text-[10px] font-semibold text-slate-400">Tổng</div><div className="text-[12px] font-extrabold tabular-nums text-slate-800">{fmtUsd(total, 0)}</div></div>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{s.name}</span>
              <span className="shrink-0 tabular-nums text-slate-400">{fmtUsd(s.value, 0)}</span>
              <span className="w-12 shrink-0 text-right font-bold tabular-nums text-slate-800">{fmtPct((s.value / total) * 100, 1)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// Lịch sử khớp lệnh gần nhất của 1 coin (Spot + Convert)
function Fills({ list, sym }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-100">
      <div className="bg-slate-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{list.length} giao dịch gần nhất</div>
      <ul className="divide-y divide-slate-100">
        {list.map((f, i) => {
          const buy = f.side === "BUY";
          return (
            <li key={i} className="px-2.5 py-1.5 text-[11.5px]">
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${buy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{buy ? "Mua" : "Bán"}</span>
                {f.src === "convert" && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">Convert</span>}
                <span className="truncate tabular-nums text-slate-400">{fmtWhen(f.time)}</span>
                <span className="ml-auto shrink-0 font-bold tabular-nums text-slate-800">{fmtUsd(f.quote)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums text-slate-500">
                <span>{fmtQty(f.qty)} {sym} @ {usdPx(f.price)}{f.quoteAsset && f.quoteAsset !== "USDT" ? ` (${f.quoteAsset})` : ""}</span>
                {f.fee > 0 && <span className="text-slate-400">phí {fmtQty(f.fee)} {f.feeAsset || ""}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 1 dòng coin — dùng chung điện thoại & máy tính (Tailwind sm: đổi bố cục)
function CoinRow({ r, vnd, canW, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const hasHist = r.recent?.length > 0;
  const pnlPct = r.pnl != null && r.invested > 0 ? (r.pnl / r.invested) * 100 : null;
  const priceTone = r.price == null ? "bg-slate-100 text-slate-500" : r.avgCost != null && r.price < r.avgCost ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";
  const btns = r.manual && canW && (
    <>
      <button onClick={onEdit} className="-my-2 shrink-0 rounded-lg p-2.5 text-slate-300 hover:bg-indigo-50 hover:text-indigo-600" title="Sửa"><Pencil size={14} /></button>
      <button onClick={onDelete} className="-my-2 shrink-0 rounded-lg p-2.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Xoá"><Trash2 size={14} /></button>
    </>
  );
  const showExtra = r.realized != null || r.fees > 0 || hasHist;
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-[12px] font-extrabold text-white sm:h-10 sm:w-10 sm:text-[13px]">{(r.symbol || "?").slice(0, 4)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-extrabold text-slate-800">{r.symbol}</span>
            {r.manual && <Badge tone="slate">tay</Badge>}
            {r.chg != null && <Badge tone={r.chg >= 0 ? "emerald" : "rose"}><span title="Biến động giá 24 giờ">{sPct(r.chg)} <span className="font-semibold opacity-70">24h</span></span></Badge>}
            {btns && <span className="ml-auto hidden gap-0.5 sm:flex">{btns}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            <span className="whitespace-nowrap">Số lượng {fmtQty(r.qty)}</span>
            {r.earnQty > 0 && <span className="whitespace-nowrap rounded bg-violet-50 px-1 font-semibold text-violet-600">Earn {fmtQty(r.earnQty)}</span>}
            {btns && <span className="flex sm:hidden">{btns}</span>}
          </div>
          {!r.stable && (
            <div className="mt-1 hidden flex-wrap items-center gap-1.5 text-[11px] sm:flex">
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">Vốn đang giữ {r.invested != null ? <>{fmtUsd(r.invested)} <span className="font-semibold text-indigo-500">≈ {formatVND(r.invested * vnd)}</span></> : "—"}</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">Giá vốn TB {usdPx(r.avgCost)}</span>
              <span className={`rounded-md px-1.5 py-0.5 font-bold ${priceTone}`}>Giá {r.price != null ? usdPx(r.price) : "…"}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Hiện có</div>
          <div className="text-sm font-extrabold tabular-nums text-slate-800">{r.value != null ? fmtUsd(r.value) : "…"}</div>
          {r.pnl != null && !r.stable && <div className={`text-[11px] font-bold tabular-nums ${toneOf(r.pnl)}`}>{fmtUsdSigned(r.pnl)}{pnlPct != null ? ` (${sPct(pnlPct)})` : ""}</div>}
        </div>
      </div>
      {!r.stable && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:hidden">
          <div className="min-w-0 rounded-lg bg-indigo-50 px-2 py-1.5">
            <div className="truncate text-[10px] font-semibold text-indigo-500">Vốn đang giữ</div>
            <div className="truncate text-[12px] font-bold tabular-nums text-indigo-700">{r.invested != null ? fmtUsd(r.invested) : "—"}</div>
            {r.invested != null && <div className="truncate text-[10px] font-semibold text-indigo-500">≈ {formatVND(r.invested * vnd)}</div>}
          </div>
          <div className="min-w-0 rounded-lg bg-slate-100 px-2 py-1.5">
            <div className="truncate text-[10px] font-semibold text-slate-400">Giá vốn TB</div>
            <div className="truncate text-[12px] font-bold tabular-nums text-slate-600">{usdPx(r.avgCost)}</div>
          </div>
          <div className={`min-w-0 rounded-lg px-2 py-1.5 ${priceTone}`}>
            <div className="truncate text-[10px] font-semibold opacity-70">Giá hiện tại</div>
            <div className="truncate text-[12px] font-bold tabular-nums">{r.price != null ? usdPx(r.price) : "…"}</div>
          </div>
        </div>
      )}
      {showExtra && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">
          {r.realized != null && <span className="text-slate-500">Lãi đã chốt <b className={`tabular-nums ${toneOf(r.realized)}`}>{fmtUsdSigned(r.realized)}</b></span>}
          {r.fees > 0 && <span className="text-slate-500">Phí <b className="tabular-nums text-slate-700">{fmtUsd(r.fees)}</b></span>}
          {r.tradeCount > 0 && <span className="hidden text-slate-400 sm:inline">{fmtNum(r.tradeCount)} lệnh</span>}
          {hasHist && (
            <button onClick={() => setOpen((o) => !o)} className="-my-1 ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 font-bold text-indigo-600 hover:bg-indigo-50" title="Lịch sử giao dịch">
              <History size={13} className="shrink-0" /> <span className="sm:hidden">Lịch sử{r.tradeCount > 0 ? ` (${fmtNum(r.tradeCount)})` : ""}</span><span className="hidden sm:inline">Lịch sử giao dịch</span> <ChevronDown size={13} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
      {r.unmatched > 0 && <div className="mt-1 text-[10.5px] leading-snug text-amber-600">Đã bán {fmtQty(r.unmatched)} {r.symbol} không rõ giá vốn (vd nạp từ ví ngoài) — phần này không tính vào lãi đã chốt.</div>}
      {r.truncated && <div className="mt-1 text-[10.5px] leading-snug text-amber-600">Quá 5.000 lệnh/cặp — chỉ đọc 5.000 lệnh đầu, giá vốn có thể lệch.</div>}
      {open && hasHist && <Fills list={r.recent} sym={r.symbol} />}
    </Card>
  );
}

function CoinInvest({ active = true }) {
  const { coins = [], addCoin, updateCoin, deleteCoin, canEdit, isOwner: isChu, perms = [], settings = {}, setSettings } = useData();
  // isOwner ở tab này = "được xem ví Binance & vốn": chủ, hoặc thành viên có quyền Đầu tư (danh mục & vốn). Sửa sổ nạp vẫn chỉ chủ (isChu).
  const isOwner = isChu || perms.includes("coinInvest");
  const canW = canEdit ? canEdit("coin") : true;
  const [prices, setPrices] = useState({});
  // Phản hồi qws-binance: bản cũ = { balances, deposited }; bản mới (version 2) thêm futures/earn/lãi đã chốt
  const { bn, err: wErr, syncing, sync } = useBinance(isOwner, active); // ví dùng chung với tab Tổng quan
  const [modal, setModal] = useState(null);
  const vnd = useUsdVnd(); // tỉ giá dùng chung với tab Tổng quan
  const badSyms = useRef(new Set()); // mã không có cặp USDT trên Binance → bỏ qua khi lấy giá

  const wallet = bn?.balances || null;
  const isV2 = !!bn && (Number(bn.version) >= 2 || "futures" in bn);
  const fut = isV2 ? bn.futures || null : null;
  const px = (asset) => { const a = (asset || "").toUpperCase(); return STABLES.has(a) ? 1 : prices[a]?.price; };


  // Giá coin realtime (poll 15s) cho mọi symbol của ví + thủ công
  const walletAssets = (wallet || []).map((b) => b.asset);
  const symKey = [...coins.map((c) => c.symbol), ...walletAssets].join(",");
  const loadPrices = async () => {
    const syms = [...new Set([...coins.map((c) => (c.symbol || "").toUpperCase()), ...walletAssets.map((a) => (a || "").toUpperCase())])]
      .filter((s) => s && !STABLES.has(s) && !badSyms.current.has(s));
    if (!syms.length) return;
    const map = {};
    const put = (d) => { if (d?.symbol) map[d.symbol.replace(/USDT$/, "")] = { price: Number(d.lastPrice), chg: Number(d.priceChangePercent) }; };
    try {
      const r = await fetch(TICKER + "?symbols=" + encodeURIComponent(JSON.stringify(syms.map(pair))));
      if (r.ok) {
        const data = await r.json();
        for (const d of Array.isArray(data) ? data : [data]) put(d);
      } else {
        // 1 mã không có cặp USDT (coin delist, mã gõ sai…) làm hỏng cả lô → lấy lẻ từng mã, mã lỗi nhớ lại để lần sau bỏ qua
        const each = await Promise.all(syms.map((s) => fetch(TICKER + "?symbol=" + pair(s)).then((x) => {
          if (x.ok) return x.json();
          if (x.status === 400) badSyms.current.add(s);
          return null;
        }).catch(() => null)));
        each.forEach(put);
      }
      if (Object.keys(map).length) setPrices((p) => ({ ...p, ...map }));
    } catch { /* giữ giá cũ */ }
  };
  useEffect(() => { if (!active) return; loadPrices(); const t = setInterval(() => { if (!document.hidden) loadPrices(); }, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [symKey, active]);

  // SỔ NẠP TIỀN CỘNG DỒN: Binance chỉ trả lịch sử P2P ~30 ngày gần nhất → khoản nạp cũ "rơi" khỏi tổng (đã nạp giảm dần).
  // Mỗi lần đồng bộ: lệnh nạp/rút nào đã thấy thì LƯU MÃI vào settings.coinDeposits (khoá = loại|thời điểm|số tiền), không bao giờ xoá.
  const { ledger, allList, ledgerList, ledgerVnd, allVnd, fromTs, depVnd } = depositInfo(settings, bn);
  const mergeDeposits = (data) => {
    const d = data?.deposited || {}, add = {};
    const p2p = d.p2pItems || data?.depositItems?.p2p || [], fiat = d.fiatItems || data?.depositItems?.fiat || [];
    for (const x of p2p) { const vndAmt = Number(x.vnd ?? x.totalPrice) || 0; if (!vndAmt || (x.fiat && x.fiat !== "VND")) continue; const k = `${x.t}|${x.date}|${vndAmt}`; if (!ledger.items?.[k]) add[k] = { t: x.t, vnd: vndAmt, date: x.date }; }
    for (const x of fiat) { if (x.fiat !== "VND" || !x.amount) continue; const k = `FIAT|${x.date}|${x.amount}`; if (!ledger.items?.[k]) add[k] = { t: "FIAT", vnd: Number(x.amount), date: x.date }; }
    if (Object.keys(add).length) setSettings({ coinDeposits: { ...ledger, items: { ...(ledger.items || {}), ...add } } });
  };
  // "đã nạp" TỪ NGÀY (mặc định = toàn bộ sổ) — tính trong depositInfo (dùng chung với tab Tổng quan)
  useEffect(() => { if (bn) mergeDeposits(bn); /* eslint-disable-next-line */ }, [bn]);
  const ledgerFrom = ledgerList.length ? Math.min(...ledgerList.map((x) => x.date)) : null;
  const iso = (t) => new Date(t + 7 * 3600000).toISOString().slice(0, 10);
  const [depEdit, setDepEdit] = useState(null);

  // Đồng bộ ví Binance (useBinance): 5 phút/lần khi tab đang xem; giá thị trường vẫn realtime 15s ở trên.
  const syncBinance = () => sync();

  // Dòng Binance (Spot + Earn) và dòng nhập tay (ngoài Binance) — TÁCH RIÊNG
  const { binRows, manRows } = useMemo(() => {
    const bin = [], man = [];
    for (const b of wallet || []) {
      const a = (b.asset || "").toUpperCase();
      const stable = STABLES.has(a);
      const price = px(a);
      const spotQty = Number(b.qty) || 0, earnQty = Number(b.earnQty) || 0;
      const qty = b.totalQty != null ? Number(b.totalQty) || 0 : spotQty + earnQty;
      const value = price != null ? qty * price : null;
      const avgCost = b.avgCost != null ? Number(b.avgCost) : null;
      const invested = avgCost != null ? qty * avgCost : b.invested != null ? Number(b.invested) : null;
      const pnl = stable ? 0 : value != null && invested != null ? value - invested : null;
      bin.push({
        key: "w" + a, symbol: a, stable, qty, spotQty, earnQty, avgCost, invested, price, value, pnl, chg: prices[a]?.chg,
        realized: b.realizedPnl != null ? Number(b.realizedPnl) : null, fees: Number(b.fees) || 0, tradeCount: Number(b.tradeCount) || 0,
        recent: Array.isArray(b.recent) ? b.recent : [], unmatched: Number(b.unmatchedSellQty) || 0, truncated: !!b.truncated,
      });
    }
    for (const c of coins) {
      const price = px(c.symbol);
      const qty = Number(c.qty) || 0;
      const value = price != null ? qty * price : null;
      const invested = qty * (Number(c.buyPrice) || 0);
      man.push({ key: c.id, id: c.id, symbol: c.symbol, qty, avgCost: c.buyPrice, invested, price, value, pnl: value != null ? value - invested : null, chg: prices[(c.symbol || "").toUpperCase()]?.chg, manual: true });
    }
    const byVal = (x, y) => (y.value || 0) - (x.value || 0);
    return { binRows: bin.sort(byVal), manRows: man.sort(byVal) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, coins, prices]);

  const tot = useMemo(() => {
    let spot = 0, earn = 0, upnl = 0, upnlCost = 0, realized = 0, fees = 0, missing = 0, d24 = 0;
    for (const r of binRows) {
      if (r.realized != null) realized += r.realized;
      fees += r.fees || 0;
      if (r.price == null) { missing++; continue; }
      if (!r.stable && r.chg != null && r.value) d24 += r.value - r.value / (1 + r.chg / 100); // lãi/lỗ 24h của lượng coin đang giữ
      spot += r.spotQty * r.price; earn += r.earnQty * r.price;
      if (!r.stable && r.pnl != null) { upnl += r.pnl; upnlCost += r.invested || 0; }
    }
    const futV = fut ? (Number(fut.wallet) || 0) + (Number(fut.unrealized) || 0) : 0;
    let manVal = 0, manPnl = 0, manInv = 0;
    for (const r of manRows) { manVal += r.value || 0; if (r.pnl != null) { manPnl += r.pnl; manInv += r.invested || 0; } }
    return { spot, earn, d24, fut: futV, binance: spot + earn + futV, upnl, upnlPct: upnlCost > 0 ? (upnl / upnlCost) * 100 : null, realized, fees, missing, manVal, manPnl, manPct: manInv > 0 ? (manPnl / manInv) * 100 : null };
  }, [binRows, manRows, fut]);

  // So với tiền VND đã nạp (P2P + fiat) — CHỈ tài sản Binance, không gồm coin nhập tay
  const hasDep = depVnd > 0 && tot.missing === 0;
  const vsDepVnd = hasDep ? tot.binance * vnd - depVnd : null;
  const vsDep = hasDep ? vsDepVnd / vnd : null;
  const vsDepPct = hasDep ? (vsDepVnd / depVnd) * 100 : null;

  // Phân bổ: mỗi coin (Spot + Earn, gồm USDT) + lát "Futures"; coin < 1,5% gộp "Khác"
  const alloc = useMemo(() => {
    const items = binRows.filter((r) => r.value > 0).map((r) => ({ name: r.symbol, value: r.value }));
    if (tot.fut > 0) items.push({ name: "Futures", value: tot.fut, fut: true });
    const total = items.reduce((s, x) => s + x.value, 0);
    if (!(total > 0)) return { slices: [], total: 0 };
    items.sort((a, b) => b.value - a.value);
    const named = [], rest = [];
    for (const x of items) {
      if (x.fut || (named.filter((n) => !n.fut).length < 7 && x.value / total >= 0.015)) named.push(x); else rest.push(x);
    }
    const az = named.filter((x) => !x.fut).map((x) => x.name).sort();
    const slices = named.map((x) => ({ ...x, color: x.fut ? FUT_COLOR : SLICE[az.indexOf(x.name) % SLICE.length] }));
    if (rest.length) slices.push({ name: "Khác", value: rest.reduce((s, x) => s + x.value, 0), color: OTHER_COLOR });
    return { slices, total };
  }, [binRows, tot.fut]);

  const rowsCount = binRows.length + manRows.length;
  const positions = Array.isArray(fut?.positions) ? fut.positions : [];
  const headPnl = isOwner ? vsDep : manRows.length ? tot.manPnl : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Tổng quan: tài sản Binance (Spot + Earn + Futures) — coin nhập tay tách riêng */}
      <div className="overflow-hidden rounded-none bg-gradient-to-br from-slate-900 to-amber-900/80 p-4 text-white shadow-xl sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-200"><Coins size={14} /> {isOwner ? "Tổng tài sản Binance" : "Danh mục coin (nhập tay)"}</div>
            {isOwner && (!bn || (binRows.length > 0 && tot.missing > 0)) ? (
              <div className="mt-2 space-y-2" aria-label="Đang tải ví Binance"><div className="h-8 w-44 animate-pulse rounded-lg bg-white/15" /><div className="h-3 w-56 animate-pulse rounded bg-white/10" /><div className="text-[11px] text-amber-100/60">{wErr && !bn ? wErr : "Đang tải ví Binance…"}</div></div>
            ) : <>
            <div className="mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">{fmtUsd(isOwner ? tot.binance : tot.manVal)}</div>
            <div className="mt-0.5 text-xs text-amber-100/80">≈ {formatVND((isOwner ? tot.binance : tot.manVal) * vnd)}{isOwner && bn && !isV2 ? " · chưa gồm Earn/Futures" : ""}</div>
            {headPnl != null && (
              <div className="mt-2">
                <div className={`flex items-center gap-1.5 text-sm font-bold tabular-nums ${headPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {headPnl >= 0 ? <TrendingUp size={16} className="shrink-0" /> : <TrendingDown size={16} className="shrink-0" />}
                  {isOwner ? `${fmtUsdSigned(vsDep)} (${sPct(vsDepPct)})` : `${fmtUsdSigned(tot.manPnl)}${tot.manPct != null ? ` (${sPct(tot.manPct)})` : ""}`}
                </div>
                {isOwner && <div className="mt-0.5 text-[12px] text-amber-100/70"><span className={`font-bold tabular-nums ${headPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{sVnd(vsDepVnd)}</span> so với đã nạp {formatVND(depVnd)}{fromTs ? ` (từ ${new Date(fromTs).toLocaleDateString("vi-VN")})` : ""} {isChu && <button onClick={() => setDepEdit(depEdit == null ? { extra: String(ledger.extraVnd || ""), from: ledger.fromDate || "" } : null)} className="ml-1 font-bold text-amber-200 underline">{depEdit == null ? "Sửa" : "Đóng"}</button>}</div>}
                {isChu && depEdit != null && (
                  <div className="mt-2 rounded-xl bg-white/10 p-3 text-[12px] text-amber-50">
                    <div><b>Đã nạp</b> = lệnh nạp/mua P2P trừ bán P2P {fromTs ? <>từ <b>{new Date(fromTs).toLocaleDateString("vi-VN")}</b></> : "toàn thời gian"}: <b>{formatVND(ledgerVnd)}</b> ({ledgerList.length} lệnh){Number(ledger.extraVnd) ? <> + tự thêm <b>{formatVND(ledger.extraVnd)}</b></> : null}. Toàn bộ lịch sử: {allList.length} lệnh, nạp ròng {formatVND(allVnd)}{allList.length ? ` (từ ${new Date(Math.min(...allList.map((x) => x.date))).toLocaleDateString("vi-VN")})` : ""}.</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><span className="shrink-0">Tính từ ngày:</span><input type="date" value={depEdit.from} onChange={(e) => setDepEdit({ ...depEdit, from: e.target.value })} className="rounded-lg bg-white px-2 py-1.5 text-sm text-slate-900" /><button onClick={() => setDepEdit({ ...depEdit, from: "" })} className="text-amber-200 underline">toàn thời gian</button></div>
                    {allList.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{[...new Set(allList.filter((x) => x.t !== "SELL").map((x) => iso(x.date).slice(0, 7)))].sort().reverse().slice(0, 6).map((m) => { const first = allList.filter((x) => iso(x.date).startsWith(m)).sort((p, q) => p.date - q.date)[0]; return <button key={m} onClick={() => setDepEdit({ ...depEdit, from: iso(first.date) })} className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px]">từ {new Date(first.date).toLocaleDateString("vi-VN")}</button>; })}</div>}
                    <div className="mt-2 flex items-center gap-2"><span className="shrink-0">Nạp thêm ngoài sổ:</span><input inputMode="numeric" value={depEdit.extra} onChange={(e) => setDepEdit({ ...depEdit, extra: e.target.value.replace(/[^\d]/g, "") })} placeholder="thường để trống" className="w-full rounded-lg bg-white px-2.5 py-1.5 text-sm text-slate-900" /><span>đ</span></div>
                    <div className="mt-1 text-[11px] text-amber-100/70">Sổ tự ghi mọi lệnh nạp/mua/bán P2P Binance trả về (đến 24 tháng) và giữ mãi. "Nạp thêm ngoài sổ" chỉ dùng cho tiền nạp bằng cách khác (chuyển từ ví ngoài…).</div>
                    <button onClick={() => { setSettings({ coinDeposits: { ...ledger, extraVnd: Number(depEdit.extra) || 0, fromDate: depEdit.from || null } }); setDepEdit(null); }} className="mt-2 rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-extrabold text-slate-900">Lưu</button>
                  </div>
                )}
              </div>
            )}
            </>}
          </div>
          {isOwner && <button onClick={() => { syncBinance(); loadPrices(); }} disabled={syncing} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/30 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "…" : "Làm mới"}</button>}
        </div>
        {isOwner && (
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            <HeadChip label="Spot" hint="bạn tự quản lý" value={fmtUsd(tot.spot)} />
            <HeadChip label="Earn" hint="gửi sinh lời" value={isV2 ? fmtUsd(tot.earn) : "—"} sub={!isV2 && bn ? "cần cập nhật hàm" : bn?.earnError && !bn?.earn ? "không đọc được" : null} />
            <HeadChip label="Futures" hint="ví bot giao dịch" value={fut ? fmtUsd(tot.fut) : "—"}
              sub={fut ? `chưa chốt ${fmtUsdSigned(fut.unrealized)}` : bn?.futuresError ? "không đọc được" : !isV2 && bn ? "cần cập nhật hàm" : null}
              subTone={fut ? (Number(fut.unrealized) >= 0 ? "text-emerald-300" : "text-rose-300") : undefined} />
          </div>
        )}
        {isOwner && manRows.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 rounded-xl bg-white/5 px-2.5 py-1.5 text-[11.5px] text-amber-100/70">
            <span className="font-bold text-white">Ngoài Binance (nhập tay) <span className="tabular-nums">{fmtUsd(tot.manVal)}</span></span>
            <span className={`font-bold tabular-nums ${tot.manPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtUsdSigned(tot.manPnl)}</span>
            <span>· tách riêng, không tính vào tổng Binance & so với đã nạp</span>
          </div>
        )}
        <div className="mt-3 text-[11px] text-amber-100/70">Giá cập nhật mỗi 15s{isOwner ? " · ví mỗi 5 phút" : ""} · tỉ giá {fmtNum(vnd, 0)} đ/$ (tự động)</div>
      </div>

      {/* Hàm qws-binance bản cũ → nhắc cập nhật (app vẫn chạy với dữ liệu cũ) */}
      {isOwner && bn && !isV2 && (
        <div className="mx-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[12px] text-sky-800 sm:mx-0">
          <div className="flex items-start gap-2">
            <Info size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold">Cập nhật hàm qws-binance để thấy Futures/Earn & lãi đã chốt</div>
              <details className="mt-0.5">
              <summary className="cursor-pointer text-[11.5px] font-semibold text-sky-700 underline-offset-2 hover:underline">Cách cập nhật (2 phút)</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-snug">
                <li>Supabase Dashboard → Edge Functions → <b>qws-binance</b> → Code.</li>
                <li>Dán toàn bộ file <code className="rounded bg-white/70 px-1">supabase/functions/qws-binance/index.ts</code> (bản mới) → Deploy.</li>
                <li>Quay lại đây bấm <b>Làm mới</b>. Futures báo lỗi quyền → tạo API key chỉ đọc mới (chỉ tick Enable Reading) và cập nhật BINANCE_KEY/BINANCE_SECRET.</li>
              </ol>
              </details>
            </div>
          </div>
        </div>
      )}

      {wErr && rowsCount > 0 && <div className="mx-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700 sm:mx-0"><AlertTriangle size={15} className="shrink-0" /> {wErr}</div>}

      {/* Lãi/lỗ tách bạch + phân bổ */}
      {isOwner && bn && (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
          <Card className="!p-3 sm:!p-4 lg:col-span-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex items-center gap-1 text-[13px] font-extrabold text-slate-800">Lãi/lỗ tách bạch <InfoTip>“So với đã nạp” (khung trên) = toàn bộ tài sản Binance (USDT, Earn, Futures, lãi đã chốt; quy VND theo tỉ giá hôm nay) trừ tiền VND đã nạp. Lãi/lỗ từng coin chỉ so giá hiện tại với giá vốn TB của chính coin đó. Biến động 24h = lãi/lỗ của lượng coin đang giữ trong 24 giờ qua.</InfoTip></div>
              <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-bold text-indigo-600"><Bot size={12} className="shrink-0" /> Bot chỉ giao dịch bằng ví Futures · Spot bạn tự quản lý</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PnlTile label="Biến động 24h" value={tot.missing ? "…" : fmtUsdSigned(tot.d24)} tone={toneOf(tot.d24)}
                sub={tot.spot + tot.earn > 0 && !tot.missing ? `${sPct((tot.d24 / Math.max(1e-9, tot.spot + tot.earn - tot.d24)) * 100)} · coin đang giữ` : "theo giá 24h"} />
              <PnlTile label="Lãi đã chốt" value={isV2 ? fmtUsdSigned(tot.realized) : "—"} tone={isV2 ? toneOf(tot.realized) : "text-slate-400"}
                sub={isV2 ? `bán Spot/Convert${tot.fees > 0 ? ` · phí ${fmtUsd(tot.fees)}` : ""}` : "cần cập nhật hàm"} />
              <PnlTile label="Lãi/lỗ đang giữ (Spot)" value={fmtUsdSigned(tot.upnl)} tone={toneOf(tot.upnl)}
                sub={`${tot.upnlPct != null ? sPct(tot.upnlPct) + " · " : ""}giá nay vs giá vốn TB${tot.earn > 0 ? " (gồm Earn)" : ""}`} />
              <PnlTile label="Futures (bot)" value={fut ? fmtUsd(fut.wallet) : "—"} tone={fut ? "text-slate-800" : "text-slate-400"}
                sub={fut ? <>số dư ví · chưa chốt <b className={toneOf(fut.unrealized)}>{fmtUsdSigned(fut.unrealized)}</b>{positions.length ? ` · ${positions.length} lệnh mở` : ""}</> : bn.futuresError ? "không đọc được ví Futures" : "cần cập nhật hàm"} />
            </div>
            {positions.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-100">
                <div className="bg-slate-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Lệnh Futures đang mở (bot)</div>
                {positions.map((p) => (
                  <div key={p.symbol + p.side} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-100 px-2.5 py-1.5 text-[11.5px]">
                    <b className="shrink-0 text-slate-800">{p.symbol}</b>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${p.side === "SHORT" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{p.side}{p.leverage ? ` x${p.leverage}` : ""}</span>
                    <span className="order-last w-full truncate tabular-nums text-slate-500 sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">KL {fmtQty(Math.abs(p.amt))} · vào {fmtPx(p.entry)} → giá {fmtPx(p.mark)}</span>
                    <b className={`ml-auto shrink-0 tabular-nums ${toneOf(p.upnl)}`}>{fmtUsdSigned(p.upnl)}</b>
                  </div>
                ))}
              </div>
            )}

            {(bn.futuresError || bn.cost?.convertError || (bn.earnError && !bn.earn)) && (
              <div className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-amber-700">
                {bn.futuresError && <div className="break-words">⚠ Futures: {bn.futuresError}</div>}
                {bn.cost?.convertError && <div className="break-words">⚠ Lịch sử Convert: {bn.cost.convertError} — giá vốn chỉ tính lệnh Spot.</div>}
                {bn.earnError && !bn.earn && <div className="break-words">⚠ Earn: {bn.earnError}</div>}
              </div>
            )}
          </Card>
          <div className="lg:col-span-2"><Allocation slices={alloc.slices} total={alloc.total} /></div>
        </div>
      )}

      {/* Danh sách coin */}
      {rowsCount === 0 ? (
        isOwner && wErr && !syncing ? (
          // Đồng bộ lỗi → báo lỗi + nút thử lại thay vì kẹt "Đang tải…"
          <Card><div className="py-10 text-center"><AlertTriangle size={28} className="mx-auto text-amber-400" /><div className="mt-2 text-sm font-bold text-slate-600">Không tải được ví Binance</div><div className="mx-auto mt-1 max-w-sm break-words text-xs text-slate-400">{wErr}</div><button onClick={() => { syncBinance(); loadPrices(); }} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow"><RefreshCw size={14} /> Thử lại</button></div></Card>
        ) : (
          <Card><div className="py-12 text-center"><Coins size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">{isOwner && (syncing || wallet == null) ? "Đang tải ví Binance…" : "Chưa có coin"}</div><div className="mt-1 text-xs text-slate-400">{isOwner ? "Số dư & giá vốn tự đồng bộ từ Binance." : "Bạn chỉ có quyền xem."}</div></div></Card>
        )
      ) : (
        <>
          {binRows.length > 0 && (
            <div className="space-y-2">
              <div className="px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:px-0">Coin trên Binance · Spot + Earn</div>
              {binRows.map((r) => <CoinRow key={r.key} r={r} vnd={vnd} canW={canW} />)}
            </div>
          )}
          {manRows.length > 0 && (
            <div className="space-y-2">
              <div className="px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:px-0">Ngoài Binance · nhập tay</div>
              {manRows.map((r) => <CoinRow key={r.key} r={r} vnd={vnd} canW={canW} onEdit={() => setModal(r)} onDelete={async () => { if (await ask(`Xoá ${r.symbol}?`)) deleteCoin(r.id); }} />)}
            </div>
          )}
        </>
      )}

      {canW && (
        <div className="px-3 sm:px-0"><button onClick={() => setModal({ symbol: "", qty: "", buyPrice: "" })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:border-amber-300 hover:text-amber-600"><Plus size={15} /> Thêm coin thủ công (ngoài Binance)</button></div>
      )}
      <div className="flex items-center justify-center gap-1 px-3 text-center text-[11px] text-slate-400 sm:px-0">Nguồn dữ liệu & cách tính <InfoTip align="center">Giá & tỉ giá realtime từ Binance/thị trường. Ví thật đồng bộ qua API key chỉ đọc (bảo mật phía máy chủ, chỉ chủ xem). Giá vốn TB tính theo thời gian: mua cộng vốn, bán chốt lãi tại giá TB.</InfoTip></div>

      {modal && <CoinModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateCoin(modal.id, data) : addCoin(data))} />}
    </div>
  );
}
