import { useEffect, useMemo, useRef, useState } from "react";
import { sw3Targets, SW3_TP } from "../lib/sw3Targets.js";
import { Term, GlossaryButton } from "../components/Term.jsx";
import { viReason } from "../lib/glossary.js";
import { Bot, Play, Square, RefreshCw, Loader2, Settings2, Info, ShieldAlert, ChevronDown, Radio, Brain, Bell, Activity, AlertTriangle, History, Trash2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, BarChart, Bar, Cell, Legend } from "recharts";
import { Card, Badge } from "../components/ui.jsx";
import BotSignalBoard from "../components/BotSignalBoard.jsx";
import PairReview from "../components/PairReview.jsx";
import { useData } from "../lib/store.jsx";
import { ask } from "../components/ConfirmDialog.jsx";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { runSessionAsync } from "../lib/botRunner.js";
import { fmtUsd, fmtPx, fmtNum } from "../lib/format.js";
import { finalize, statsOf, cfgOf, loadKlines, MIN_RR, SETUPS, TFS, LEVELS, symOf, MAX_COINS, SW3_DEFAULT, SW3_RULES, SW3_MANAGE, SW3D_DEFAULT, SW3D_MANAGE } from "../lib/paperBot.js";
import { monthOf, monthLabel, MONTH_TARGET, weakStreams, demoCacheGet, demoCacheSet } from "../lib/coinShared.js";
import { supabase } from "../lib/supabase.js";

// Bot thật có đang theo phiên Demo không (dòng command, chỉ chủ đọc được) → null = không biết / không theo
function useLiveFollow() {
  const [v, setV] = useState(null);
  useEffect(() => {
    let off = false;
    // Bot mặc định "theo Demo" khi chưa lưu cấu hình riêng → chỉ coi là không theo khi followDemo === false. Chế độ lấy từ trạng thái bot báo về.
    Promise.all([
      supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle(),
      supabase.from("qws_live_bot").select("data").eq("id", "status").maybeSingle(),
    ]).then(([cmd, st]) => {
      if (off || cmd.error || !st.data?.data) return;
      const c = cmd.data?.data?.config || {}, mode = c.mode || st.data.data.mode;
      setV(c.followDemo === false ? null : mode === "live" ? "live" : "testnet");
    });
    return () => { off = true; };
  }, []);
  return v;
}
// 01/11: nhãn rõ ràng — sửa Demo khi bot thật đang theo = sửa luôn bot thật
function FollowNote({ mode, compact }) {
  if (!mode) return null;
  const money = mode === "live";
  return compact
    ? <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${money ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><Radio size={11} /> Dùng chung với bot {money ? "TIỀN THẬT" : "thật (testnet)"}</span>
    : <div className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold ${money ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>Bot {money ? "TIỀN THẬT" : "thật (testnet)"} đang theo phiên Demo: cặp, khung, rủi ro, số lệnh mở, dừng ngày, đòn bẩy đặt ở đây sẽ áp dụng cho bot sau khoảng 5 phút. Muốn bot giữ cấu hình riêng: tab Bot thật → bỏ chọn "theo phiên Demo".</div>;
}

// Bot thật đang "theo Demo" → đổi cấu hình phiên Demo là đổi luôn bot (sau ~5 phút). 01/11: liệt kê thay đổi + hỏi trước.
async function confirmLiveFollow(oldRaw = {}, newRaw = {}) {
  const oldCfg = oldRaw ? cfgOf({ cfg: oldRaw }) : {}, newCfg = cfgOf({ cfg: newRaw || {} }); // so cấu hình THỰC (đã điền mặc định) — tránh hiện "undefined%"
  const r = await supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle();
  if (r.error) return true;
  const c = r.data?.data?.config || {}; // chưa lưu cấu hình riêng = bot đang theo Demo (mặc định)
  if (c.followDemo === false) return true;
  const L = [];
  const num = (k, lb, u) => { if (oldCfg[k] != null && Number(oldCfg[k]) !== Number(newCfg[k])) L.push(`${lb}: ${oldCfg[k]}${u} → ${newCfg[k]}${u}`); };
  num("riskPct", "Rủi ro / lệnh", "%"); num("maxOpen", "Tối đa lệnh mở", ""); num("dailyStopPct", "Dừng ngày khi lỗ", "%"); num("maxLev", "Đòn bẩy tối đa", "x");
  const set = (k, lb) => { const a = (oldCfg[k] || []).join("/"), b = (newCfg[k] || []).join("/"); if (a && a !== b) L.push(`${lb}: ${a} → ${b}`); };
  set("coins", "Cặp"); set("tfs", "Khung");
  if ((oldCfg.sw?.entry || "") !== (newCfg.sw?.entry || "")) L.push(`Cách vào lệnh: ${oldCfg.sw?.entry === "lim" ? "lệnh chờ M15" : "thị trường"} → ${newCfg.sw?.entry === "lim" ? "lệnh chờ M15 (phương án D)" : "thị trường"}`);
  if (!L.length) return true;
  const st = c.mode ? null : await supabase.from("qws_live_bot").select("data").eq("id", "status").maybeSingle();
  const live = (c.mode || st?.data?.data?.mode) === "live";
  return ask(`Áp dụng cho cả bot ${live ? "TIỀN THẬT" : "thật (testnet)"}?\nBot đang bật "Rủi ro & giới hạn theo phiên Demo" nên khoảng 5 phút sau sẽ chạy theo:\n${L.map((x) => "• " + x).join("\n")}\nMuốn bot giữ cấu hình riêng: tab Bot thật → bỏ chọn "theo phiên Demo".`, { danger: live, ok: live ? "Áp dụng cho tiền thật" : "Áp dụng" });
}
import InfoTip from "../components/InfoTip.jsx";

// Tab "Demo tự động": bot giao dịch GIẢ LẬP Futures theo bộ kiến thức — chạy từ ngày bắt đầu tới nay và tiếp tục theo
// từng nến mới cho tới khi chủ bấm Dừng. Phiên lưu ở settings.paperBot; kết quả tính lại từ nến Binance (luật cố định
// nên mở app lúc nào cũng ra đúng kết quả như bot chạy liên tục 24/7).
// Realtime: WebSocket Binance Futures (nến đang chạy) → lệnh mở nhảy lãi/lỗ từng giây, chạm SL/TP đóng ngay; nến đóng → bot xét tín hiệu mới.
// Tự tối ưu: walk-forward (paperBot.js) — chạy song song "Luật gốc" để so sánh.
const usd = (v, d = 2) => fmtUsd(v, d); // một kiểu tiền chung cho module Coin ("$1.234,56")
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 1, 1)}%`);
const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 2)}R`);
const f2 = (v) => (v == null || !isFinite(v) ? "—" : fmtNum(v, 2, 2));
const px = (v) => fmtPx(v);
const dt = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };
const ago = (t) => { const d = (Date.now() - t) / 86400000; return d >= 1 ? `${Math.floor(d)} ngày ${Math.floor((d % 1) * 24)} giờ` : `${Math.floor(d * 24)} giờ`; };
const tone = (v) => (v == null ? "text-slate-900" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const setupName = (k) => SETUPS[k]?.label.split(" (")[0] || k;
const tpLbl = (t) => (t?.setup === "SW3" ? "Chốt 1/3" : "Chốt lời"); // SW3 không có TP cố định — mức này chỉ chốt 1/3 vị thế
const side = (s) => <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "MUA" : "BÁN"}</span>;

// Biểu đồ nến của 1 luồng (cặp × khung) + điểm vào/ra của mọi lệnh bot + đường Entry/SL/TP lệnh đang mở / lệnh đang chọn + lệnh chờ.
// Giờ hiển thị theo giờ VN (UTC+7). Nến đang chạy cập nhật realtime từ WebSocket.
const VN = 7 * 3600, toT = (ms) => Math.floor(ms / 1000) + VN;
// Chi tiết lệnh SW3/D bằng lời thường (sếp 08/11): vì sao vào, vì sao không đặt chốt lời cố định, vì sao đóng / đang chờ gì
const EXIT_WHY = {
  "Cắt lỗ": "Giá đi ngược hướng lệnh và chạm mức cắt lỗ ban đầu (cách giá vào 2 lần biên độ nến H4) → mất đúng 1R như đã tính trước.",
  "Dời SL theo đáy/đỉnh 20 nến (giảm lỗ)": "Chưa tới mức chốt 1/3, nhưng cắt lỗ đã được dời theo đỉnh/đáy 20 nến H4. Giá quay đầu chạm mức đã dời nên lỗ ít hơn 1R (hoặc hoà).",
  "Chốt 1/3 + hoà vốn": "Đã chốt 1/3 ở +0,75R và dời cắt lỗ về giá vào. Sau đó giá quay về giá vào nên phần còn lại đóng hoà vốn — lệnh vẫn lãi nhờ phần đã chốt.",
  "Chốt 1/3 + dời SL khoá lời": "Đã chốt 1/3, cắt lỗ dời dần theo xu hướng. Giá quay đầu chạm mức cắt lỗ đã khoá lời → đóng phần còn lại có lãi.",
};
function TradeWhy({ t, lv, wide = false }) {
  if (t.setup !== "SW3" || !t.why3) return t.why3 ? <div className="text-[11.5px] text-slate-500">Tiêu chí lúc vào: {t.why3}</div> : null;
  const m = (re) => (t.why3.match(re) || [])[1];
  const brk = m(/phá vượt ([\d.,-]+) ATR/), vol = m(/volume ([\d.,]+)×/), h4 = m(/(trên|dưới) EMA200 H4/), btc = m(/BTC (trên|dưới|chưa rõ) EMA50 D1/);
  const L = t.side === 1, dir = L ? "MUA" : "BÁN", g = sw3Targets(t.entry, t.side, Math.abs(t.entry - t.sl)), lvl = lv ? (L ? lv.lo : lv.hi) : null;
  const sec = "rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-slate-100";
  return (
    <div className={`grid gap-2 text-[11.5px] leading-snug text-slate-600 ${wide ? "md:grid-cols-3" : ""}`}>
      <div className={sec}><b className="text-slate-800">1. Vì sao vào lệnh {dir}</b><ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Nến H4 đóng {L ? "phá lên trên đỉnh" : "phá xuống dưới đáy"} 30 nến gần nhất{brk ? <>, vượt <b>{brk.replace(".", ",")}</b> lần biên độ nến (cần ≥ 0,3)</> : ""}.</li>
        {vol && <li>Khối lượng nến đó gấp <b>{vol.replace(".", ",")}</b> lần trung bình 20 nến (cần ≥ 1,3) → có tiền thật đẩy giá.</li>}
        {h4 && <li>Giá {h4} đường TB 200 nến H4 → thuận xu hướng lớn của mã.</li>}
        {btc && <li>BTC {btc} đường TB 50 nến ngày → thị trường chung cùng hướng.</li>}
        <li>Là cú phá vỡ đầu tiên của nhịp (không đuổi theo cú thứ 2, 3).</li>
        <li>{t.fill === "lim" ? "Vào bằng lệnh chờ trên M15: giá hồi lại 0,25 biên độ trong 4 giờ nên khớp giá đẹp hơn." : t.fill === "mkt" ? "Giá không hồi trong 4 giờ → vào giá thị trường để không lỡ cú chạy." : "Vào ở giá mở nến kế tiếp."}</li>
      </ul></div>
      <div className={sec}><b className="text-slate-800">2. Vì sao không đặt chốt lời cố định</b><ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Chốt 1/3 ở +0,75R ({px(t.tp)}) để có lãi sớm, rồi dời cắt lỗ về hoà vốn → lệnh không còn lỗ.</li>
        <li>2/3 còn lại thả chạy, cắt lỗ dời theo {L ? "đáy" : "đỉnh"} 20 nến H4{lvl != null && isFinite(lvl) ? <> (đang ở <b>{px(lvl)}</b>)</> : ""}. Lợi nhuận của D đến từ số ít lệnh chạy rất xa — đặt chốt lời cố định sẽ cắt mất những lệnh đó.</li>
        {g && <li>Chốt lời kỳ vọng <b>{px(g.avg)}</b> (+1,5R) = mức trung bình phần còn lại đóng ở trong 2.100 lệnh quá khứ; 1/10 lệnh chạy tới <b>{px(g.far)}</b> (+3,8R). Chỉ để tham khảo, không phải lệnh trên sàn.</li>}
      </ul></div>
      <div className={sec}><b className="text-slate-800">3. {t.exitAt ? "Vì sao đóng lệnh" : "Lệnh sẽ đóng khi nào"}</b>
        {t.exitAt ? <p className="mt-1"><b>{viReason(t.reason)}</b> @ {px(t.exit)} · {dt(t.exitAt)}<br />{EXIT_WHY[t.reason] || ""}</p>
          : <ul className="mt-1 list-disc space-y-0.5 pl-4"><li>Giá chạm cắt lỗ <b>{px(t.curSl)}</b>{t.be ? " (đã hoà vốn — không lỗ)" : " → lỗ tối đa 1R"}.</li>{!t.part && <li>Hoặc chạm <b>{px(t.tp)}</b> thì chốt 1/3 trước, phần còn lại chạy tiếp.</li>}<li>Không có giới hạn thời gian — giữ tới khi xu hướng gãy.</li></ul>}
      </div>
    </div>
  );
}
// Thẻ lệnh Demo đang mở. SW3/D: không có TP cố định — chốt 1/3 ở +0,75R, phần còn lại chạy tới khi chạm SL dời theo đỉnh/đáy 20 nến H4
function OpenCard({ t, lv }) {
  const [why, setWhy] = useState(false);
  const pos = Math.min(1, Math.max(0, (t.last - t.curSl) / (t.tp - t.curSl))), toTp = ((t.tp - t.last) / t.last) * 100 * t.side, toSl = ((t.last - t.curSl) / t.last) * 100 * t.side;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">{side(t.side)}<b className="shrink-0 whitespace-nowrap">{t.coin} {TFS[t.tf].label}</b><span className="min-w-0 truncate text-slate-400">{setupName(t.setup)}</span><span className={`ml-auto shrink-0 whitespace-nowrap text-[14px] font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span></div>
      <div className="mt-1 flex items-center gap-2 whitespace-nowrap tabular-nums text-slate-500"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-extrabold text-slate-800">Giá {px(t.last)}</span><span className={`font-bold ${tone(t.uR)}`}>{rr(t.uR)}</span><span className="ml-auto">Vào {px(t.entry)}</span></div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-rose-300 via-slate-200 to-emerald-300"><span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded bg-slate-800 transition-all duration-700" style={{ left: `${pos * 100}%` }} /></div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] tabular-nums"><span className="text-rose-500">Cắt lỗ {px(t.curSl)}{t.be ? " (hoà vốn)" : ""} · còn {fmtNum(toSl, 2, 2)}%</span><span className="text-emerald-600">{tpLbl(t)} {px(t.tp)}{t.setup === "SW3" && t.part ? " ✓ đã chốt" : ` · còn ${fmtNum(toTp, 2, 2)}%`}</span></div>
      {t.setup === "SW3" && (() => { const g = sw3Targets(t.entry, t.side, Math.abs(t.entry - t.sl)); if (!g) return null; const d = (x) => fmtNum(((x - t.last) / t.last) * 100 * t.side, 2, 2); return (
        <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] tabular-nums"><span className="text-emerald-600"><Term k="tpExp">Chốt lời kỳ vọng</Term> <b>{px(g.avg)}</b> (+{fmtNum(SW3_TP.avgR, 1, 1)}R){(g.avg - t.last) * t.side > 0 ? ` · còn ${d(g.avg)}%` : " ✓ đã vượt"}</span><span className="text-teal-600"><Term k="tpFar" align="right" /> {px(g.far)} (+{fmtNum(SW3_TP.farR, 1, 1)}R){(g.far - t.last) * t.side > 0 ? ` · còn ${d(g.far)}%` : " ✓"}</span></div>
      ); })()}
      {t.setup === "SW3" && (() => { const lvl = lv ? (t.side === 1 ? lv.lo : lv.hi) : null, nb = t.side === 1 ? "đáy" : "đỉnh"; return (
        <div className="mt-1 rounded-lg bg-indigo-50/70 px-2 py-1 text-[11px] leading-snug text-slate-600"><b>{t.part ? "2/3 còn lại" : "Sau khi chốt 1/3"}:</b> không đặt mức chốt lời cố định — giữ tới khi chạm cắt lỗ. Cắt lỗ tự dời theo {nb} 20 nến H4{lvl != null && isFinite(lvl) ? <> (hiện <b className="tabular-nums">{px(lvl)}</b>{(lvl - t.curSl) * t.side > 0 ? "" : ` — chỉ dời khi mốc này ${t.side === 1 ? "lên trên" : "xuống dưới"} ${px(t.curSl)}`})</> : ""}, chỉ dời theo hướng có lợi.</div>
      ); })()}
      <div className="mt-1 flex items-start gap-2 text-[11px] text-slate-400"><span className="min-w-0">Mở {dt(t.entryAt)} · vị thế {usd(t.notional, 0)} ({fmtNum(t.lev, 1, 1)}x vốn) · rủi ro {usd(t.riskUsd)}{t.score ? ` · ${t.score.variant}` : ""}</span>
        <button onClick={() => setWhy((v) => !v)} aria-expanded={why} className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-bold text-indigo-500 hover:bg-indigo-50">Vì sao? <ChevronDown size={12} className={why ? "rotate-180" : ""} /></button></div>
      {why && <div className="mt-1.5"><TradeWhy t={t} lv={lv} /></div>}
    </div>
  );
}
function BotChart({ coin, tf, startAt, rawAt, trades, pending, live, ver, focus, trail }) {
  const box = useRef(null), api = useRef(null), [K, setK] = useState([]), fitted = useRef(""), step = TFS[tf].ms;
  const [kState, setKState] = useState("loading"), [retry, setRetry] = useState(0);
  // Chữ ký dữ liệu: chỉ vẽ lại mốc/đường giá khi lệnh thật sự đổi (giá realtime nhảy mỗi giây không làm vẽ lại)
  const markSig = trades.map((t) => `${t.id}:${t.exitAt || ""}:${t.r ?? ""}`).join("|") + `#${focus?.id || ""}`;
  const lineSig = (focus ? [focus] : trades.filter((t) => !t.exitAt)).map((t) => `${t.id}:${t.entry}:${t.curSl ?? t.sl}:${t.tp}:${t.part || 0}:${trail?.[t.coin]?.barAt || ""}`).join("|") + "#" + pending.map((p) => `${p.id}:${p.lim}`).join("|");
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: "solid", color: "transparent" }, textColor: "#64748b", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.12)" }, horzLines: { color: "rgba(148,163,184,0.12)" } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, rightOffset: 6 }, crosshair: { mode: 0 },
      handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: "#10b981", downColor: "#f43f5e", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#f43f5e" });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const e50 = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    api.current = { chart, candle, vol, e50, markers: createSeriesMarkers(candle, []), lines: [] };
    return () => { chart.remove(); api.current = null; };
  }, []);
  // nến đã đóng (lấy từ bộ nhớ đệm của bot) — tải lại khi đổi luồng hoặc bot vừa xét nến mới
  useEffect(() => { // đổi luồng → xoá nến cũ ngay, hiện "đang tải"
    let off = false; setKState((s) => (K.length && fitted.current === `${coin}|${tf}` ? s : "loading"));
    loadKlines(symOf(coin), tf, startAt - 120 * step).then((k) => { if (!off) { setK(k); setKState("ok"); } }).catch(() => { if (!off) setKState("error"); });
    return () => { off = true; };
  }, [coin, tf, startAt, rawAt, step, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const a = api.current; if (!a || !K.length) return;
    const p0 = K[K.length - 1][4], prec = p0 >= 1000 ? 1 : p0 >= 10 ? 2 : 4;
    a.candle.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });
    a.candle.setData(K.map((k) => ({ time: toT(k[0]), open: k[1], high: k[2], low: k[3], close: k[4] })));
    a.vol.setData(K.map((k) => ({ time: toT(k[0]), value: k[5], color: k[4] >= k[1] ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)" })));
    const kk = 2 / 51; let e = K[0][4]; a.e50.setData(K.map((k, i) => { e = i ? k[4] * kk + e * (1 - kk) : k[4]; return { time: toT(k[0]), value: e }; }));
    const key = `${coin}|${tf}`;
    if (fitted.current !== key) { fitted.current = key; a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, K.length - 150), to: K.length + 6 }); }
  }, [K, coin, tf]);
  // điểm vào / ra lệnh
  useEffect(() => {
    const a = api.current; if (!a) return;
    const m = [];
    for (const t of trades) {
      m.push({ time: toT(t.entryAt), position: t.side === 1 ? "belowBar" : "aboveBar", color: t.side === 1 ? "#10b981" : "#f43f5e", shape: t.side === 1 ? "arrowUp" : "arrowDown", text: t.side === 1 ? "L" : "S", size: focus?.id === t.id ? 2 : 1 });
      if (t.exitAt) m.push({ time: toT(Math.floor((t.exitAt - 1) / step) * step), position: t.side === 1 ? "aboveBar" : "belowBar", color: t.r >= 0 ? "#059669" : "#e11d48", shape: "circle", text: `${t.r >= 0 ? "+" : ""}${fmtNum(t.r, 1, 1)}R`, size: focus?.id === t.id ? 2 : 1 });
    }
    a.markers.setMarkers(m.sort((x, y) => x.time - y.time));
  }, [markSig, step]); // eslint-disable-line react-hooks/exhaustive-deps
  // đường giá: lệnh đang chọn (hoặc mọi lệnh đang mở) + lệnh chờ
  useEffect(() => {
    const a = api.current; if (!a) return;
    a.lines.forEach((pl) => a.candle.removePriceLine(pl));
    const show = focus ? [focus] : trades.filter((t) => !t.exitAt), L = [];
    for (const t of show) {
      const tag = `${t.side === 1 ? "MUA" : "BÁN"}`;
      L.push({ price: t.entry, color: "#6366f1", title: `Vào ${tag}`, style: 0 }, { price: t.curSl ?? t.sl, color: "#e11d48", title: t.be ? "Cắt lỗ (hoà vốn)" : "Cắt lỗ" }, { price: t.tp, color: "#059669", title: t.setup === "SW3" && t.part ? "Đã chốt 1/3" : tpLbl(t) });
      const lv = !t.exitAt && t.setup === "SW3" ? trail?.[t.coin] : null, lvl = lv ? (t.side === 1 ? lv.lo : lv.hi) : null;
      const g = t.setup === "SW3" && !t.exitAt ? sw3Targets(t.entry, t.side, Math.abs(t.entry - t.sl)) : null;
      if (g) L.push({ price: g.avg, color: "#10b981", title: `Chốt lời kỳ vọng +${fmtNum(SW3_TP.avgR, 1, 1)}R`, style: 2 }, { price: g.far, color: "#14b8a6", title: `Mục tiêu xa +${fmtNum(SW3_TP.farR, 1, 1)}R`, style: 3 });
      if (lvl != null && isFinite(lvl) && Math.abs(lvl - (t.curSl ?? t.sl)) > 1e-9) L.push({ price: lvl, color: "#a855f7", title: `Mốc dời cắt lỗ (${t.side === 1 ? "đáy" : "đỉnh"} 20 nến H4)`, style: 1 });
    }
    for (const p of pending) L.push({ price: p.lim, color: "#f59e0b", title: `Chờ ${p.side === 1 ? "MUA" : "BÁN"}` });
    a.lines = L.map((ln) => a.candle.createPriceLine({ price: ln.price, color: ln.color, lineWidth: 1, lineStyle: ln.style ?? 2, axisLabelVisible: true, title: ln.title }));
  }, [lineSig]); // eslint-disable-line react-hooks/exhaustive-deps
  // nhảy tới lệnh đang chọn
  useEffect(() => {
    const a = api.current; if (!a || !focus || !K.length) return;
    a.chart.timeScale().setVisibleRange({ from: toT(focus.entryAt - 40 * step), to: toT((focus.exitAt || Date.now()) + 25 * step) });
  }, [focus, K, step]);
  // nến đang chạy (realtime)
  useEffect(() => {
    const a = api.current, b = live?.current?.[`${coin}|${tf}`]; if (!a || !b || !K.length || b.t < K[K.length - 1][0]) return;
    try { a.candle.update({ time: toT(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); a.vol.update({ time: toT(b.t), value: b.v || 0, color: b.c >= b.o ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)" }); } catch { /* nến cũ hơn dữ liệu → bỏ qua */ }
  }, [ver, coin, tf, K, live]);
  return (
    <div className="relative">
      <div ref={box} className={`h-[340px] w-full sm:h-[460px] ${kState === "loading" ? "opacity-30" : ""}`} />
      {kState === "loading" && <div className="absolute inset-0 grid place-items-center text-[12.5px] font-bold text-slate-500"><span className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 shadow-sm"><Loader2 size={14} className="animate-spin" /> Đang tải nến {coin} {TFS[tf].label}…</span></div>}
      {kState === "error" && <div className="absolute inset-0 grid place-items-center"><div className="rounded-xl bg-white px-4 py-3 text-center text-[12.5px] shadow"><div className="font-bold text-rose-600">Không tải được nến từ Binance</div><button onClick={() => setRetry((x) => x + 1)} className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white">Thử lại</button></div></div>}
    </div>
  );
}

function Num({ label, v, sub, tone: t = "text-slate-900", className = "" }) {
  return <div className={`bg-white px-3 py-2.5 ${className}`}><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`text-lg font-extrabold tabular-nums ${t}`}>{v}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>;
}
const Title = ({ icon: I, children, right }) => <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{I && <I size={13} className="text-indigo-500" />}{children}{right && <span className="ml-auto normal-case tracking-normal">{right}</span>}</div>;

function StatTable({ title, rows }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right">Lệnh</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right"><Term k="avgR" align="right">R TB</Term></th><th className="py-1.5 pr-2 text-right"><Term k="pf" align="right">Hệ số lãi</Term></th><th className="py-1.5 text-right">Tổng R</th></tr></thead>
        <tbody>{rows.filter(([, s]) => s.n).map(([name, s]) => (
          <tr key={name} className="border-b border-slate-50">
            <td className="py-1.5 pr-2 font-bold text-slate-700">{name}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(s.winRate, 0, 0)}%</td>
            <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(s.avgR)}`}>{rr(s.avgR)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{s.pf === Infinity ? "∞" : f2(s.pf)}</td>
            <td className={`py-1.5 text-right tabular-nums ${tone(s.totalR)}`}>{fmtNum(s.totalR, 1, 1)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// Thêm / sửa / xoá cặp cho bot (Demo + bot thật dùng chung danh sách). Cặp mới phải có trên Binance USDⓈ-M Futures.
const SUGGEST = ["BTC", "ETH", "XAU", "SOL", "BNB", "XRP", "DOGE", "LINK"];
const normCoin = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
async function futuresHas(c) {
  try { const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symOf(c)}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return false; const j = await r.json(); return Number(j.markPrice) > 0; } catch { return null; }
}
function CoinsEditor({ coins, onChange }) {
  const [add, setAdd] = useState(""), [edit, setEdit] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const submit = async (raw, idx = null) => {
    setMsg(null);
    const c = normCoin(raw); if (!c) return;
    if (idx != null && coins[idx] === c) { setEdit(null); return; }
    if (coins.includes(c)) return setMsg(`${c}USDT đã có trong danh sách`);
    if (idx == null && coins.length >= MAX_COINS) return setMsg(`Tối đa ${MAX_COINS} cặp (nhiều cặp chạy chậm và dễ bị Binance giới hạn tần suất)`);
    setBusy(true); const ok = await futuresHas(c); setBusy(false);
    if (ok === null) return setMsg("Không kiểm tra được với Binance (mạng) — thử lại");
    if (!ok) return setMsg(`Binance Futures không có cặp ${c}USDT (gõ mã coin, vd SOL, 1000PEPE)`);
    onChange(idx == null ? [...coins, c] : coins.map((x, i) => (i === idx ? c : x)));
    setAdd(""); setEdit(null);
  };
  const remove = (c) => { if (coins.length <= 1) return setMsg("Cần ít nhất 1 cặp"); setMsg(null); onChange(coins.filter((x) => x !== c)); };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {coins.map((c, i) => edit?.i === i ? (
          <span key={c} className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-1.5 py-1">
            <input autoFocus value={edit.v} onChange={(e) => setEdit({ i, v: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(edit.v, i); if (e.key === "Escape") setEdit(null); }} className="w-20 text-[12px] font-bold uppercase outline-none" />
            <button disabled={busy} onClick={() => submit(edit.v, i)} className="text-[11px] font-bold text-indigo-600">Lưu</button>
            <button onClick={() => setEdit(null)} className="text-[11px] text-slate-400">Huỷ</button>
          </span>
        ) : (
          <span key={c} className="flex items-center overflow-hidden rounded-lg bg-slate-900 text-[12px] font-bold text-white">
            <button onClick={() => setEdit({ i, v: c })} title="Sửa" className="px-2.5 py-1.5">{c}USDT</button>
            <button onClick={() => remove(c)} aria-label={`Xoá ${c}`} className="border-l border-white/20 px-2 py-1.5 text-white/70 hover:text-white">✕</button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(add); }} placeholder="Thêm cặp: gõ mã coin (vd SOL)" className="w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] uppercase placeholder:normal-case" />
        <button disabled={busy || !add.trim()} onClick={() => submit(add)} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : "Thêm"}</button>
      </div>
      {SUGGEST.some((x) => !coins.includes(x)) && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">Gợi ý: {SUGGEST.filter((x) => !coins.includes(x)).map((x) => <button key={x} disabled={busy} onClick={() => submit(x)} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">+{x}</button>)}</div>}
      {msg && <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-700">{msg}</div>}
      <div className="mt-1 text-[11px] leading-snug text-slate-400">Bấm tên cặp để sửa, ✕ để xoá. Bot thật dùng chung danh sách này. Cặp mới chưa được kiểm chứng — theo dõi Thống kê → Theo cặp. (Thử 270 ngày: thêm SOL + BNB nhiều lệnh hơn nhưng R giảm, sụt vốn sâu hơn.)</div>
    </div>
  );
}

// Khung giờ bot được chọn (27/10: thêm H1, H4 — bot thật quét mỗi nến M5 đóng nên khung lớn cũng bắt kịp)
const EDIT_TFS = ["5m", "15m", "1h", "4h"];
// Luật SW3 (sếp duyệt 06/11): 5 tiêu chí vào lệnh + quản lý lệnh — hiện ở form phiên mới và nút "Xem luật"
export function Sw3Rules({ cfg }) {
  const c = cfg || SW3D_DEFAULT, d = c.sw?.entry === "lim";
  const rb = Object.entries(c.riskByCoin || {}).filter(([k]) => (c.coins || []).includes(k));
  return (
    <div className="space-y-2 text-[12px] leading-snug text-slate-600">
      <div className="font-extrabold text-slate-800">Vào lệnh khi nến H4 vừa đóng đạt ĐỦ 5 tiêu chí</div>
      <ol className="space-y-1.5">{SW3_RULES.map((r, i) => (
        <li key={r.k} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-extrabold text-white">{i + 1}</span><span><b className="text-slate-800">{r.t}.</b> {r.d}</span></li>
      ))}</ol>
      <div className="pt-1 font-extrabold text-slate-800">{d ? "Điểm vào M15 + quản lý lệnh (phương án D)" : "Quản lý lệnh"}</div>
      <ul className="list-disc space-y-1 pl-5">{d ? <>
        {SW3D_MANAGE.slice(0, -1).map((m) => <li key={m}>{m}</li>)}
        <li>Rủi ro {fmtNum(c.riskPct, 2, 0)}% vốn/lệnh{rb.length ? `, riêng ${rb.map(([k]) => k).join(", ")} ${fmtNum(Math.min(c.riskPct, rb[0][1]), 2, 0)}%` : ""}; tối đa {c.maxOpen} lệnh mở, mỗi mã 1 lệnh.</li>
      </> : SW3_MANAGE.map((m) => <li key={m}>{m.replace("Rủi ro 1% vốn/lệnh, tối đa 4 lệnh mở", `Rủi ro ${fmtNum(c.riskPct, 2, 0)}% vốn/lệnh, tối đa ${c.maxOpen} lệnh mở`)}</li>)}</ul>
      <div className="rounded-lg bg-slate-50 p-2 text-[11.5px] text-slate-500">{d
        ? "Kiểm thử 2018–11/2026 trên 18 mã (đã trừ phí, funding thật): khoảng 18–19 lệnh/tháng, thắng khoảng 62%, lãi 48%/năm (2018–23) và 69%/năm (2024–26), sụt vốn lớn nhất khoảng 24%. 10 mã mới kém đều hơn 8 mã cũ nên chỉ ½ rủi ro. Kết quả quá khứ, không phải tư vấn đầu tư."
        : "Kiểm thử 2018–11/2026 trên 8 mã (đã trừ phí, funding thật): thắng khoảng 62%, khoảng 8–9 lệnh/tháng. Kiểm walk-forward 2020–2026: 7/7 năm lãi. Ở rủi ro 1%/lệnh, sụt vốn lớn nhất khi kiểm thử khoảng 21%, chạy thật có thể tới khoảng 30%. Kết quả quá khứ, không phải tư vấn đầu tư."}</div>
    </div>
  );
}
function Sw3SetupForm({ initial, onStart, onCancel, onLegacy, follow }) {
  const [days, setDays] = useState(90); // 06/11 sếp: phiên mới phải có sẵn lệnh lịch sử các tháng gần nhất để đo
  const [v, setV] = useState(initial?.strategy === "sw3" && initial?.sw?.entry !== "lim" ? "sw3" : "D");
  const base = (x) => (x === "D" ? SW3D_DEFAULT : SW3_DEFAULT);
  const [c, setC] = useState(() => cfgOf({ cfg: { ...base(v), strategy: "sw3" } }));
  const pick = (x) => { setV(x); setC(cfgOf({ cfg: { ...base(x), strategy: "sw3" } })); };
  const field = (k, label, step = 1, suffix = "") => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const ok = c.coins.length && c.capital > 0 && c.riskPct > 0 && c.maxOpen > 0;
  return (
    <Card className="!p-4">
      <div className="mb-1 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Phiên demo · {v === "D" ? "phương án D (SW3 + lệnh chờ M15, 18 mã)" : "phương pháp SW3 (swing H4, 8 mã)"}</div>
      <div className="mb-3 text-[11.5px] text-slate-500">Bot thật (Testnet) chạy đúng luật này theo phiên Demo. <button onClick={onLegacy} className="font-bold text-indigo-600">Dùng bộ luật cũ v12</button></div>
      <FollowNote mode={follow} />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">{[["D", "Phương án D · ~19 lệnh/tháng"], ["sw3", "SW3 · 8 mã, vào ngay"]].map(([x, l]) => <button key={x} onClick={() => pick(x)} className={chip(v === x)}>{l}</button>)}</div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"><Sw3Rules cfg={c} /></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Bắt đầu</div><div className="flex flex-wrap gap-1.5">{[[0, "Từ bây giờ"], [30, "Chạy lại 30 ngày"], [90, "Chạy lại 90 ngày"], [180, "Chạy lại 180 ngày"]].map(([d, l]) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{l}</button>)}</div>
          <div className="mt-1 text-[11px] text-slate-400">Chạy lại quá khứ để có sẵn lịch sử lệnh các tháng gần nhất mà đo lường; lệnh mới từ lúc bắt đầu vẫn ghi tiếp vào cùng phiên.</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures, khung H4)</div><CoinsEditor coins={c.coins} onChange={(coins) => setC((o) => ({ ...o, coins }))} /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}</div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: { strategy: "sw3", coins: c.coins, capital: c.capital, riskPct: c.riskPct, maxOpen: c.maxOpen, maxLev: c.maxLev, ...(v === "D" ? { sw: { entry: "lim" }, riskByCoin: c.riskByCoin } : {}) }, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo {v === "D" ? "phương án D" : "SW3"}</button>
        </div>
      </div>
    </Card>
  );
}
function SetupForm(props) {
  const [legacy, setLegacy] = useState(false); // mặc định SW3 (phương pháp đang dùng từ 06/11)
  return legacy ? <LegacySetupForm {...props} onSw3={() => setLegacy(false)} /> : <Sw3SetupForm {...props} onLegacy={() => setLegacy(true)} />;
}
function LegacySetupForm({ initial, onStart, onCancel, follow, onSw3 }) {
  const [days, setDays] = useState(90);
  const [c, setC] = useState(() => cfgOf({ cfg: initial }));
  const tog = (k, v) => setC((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v] }));
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const field = (k, label, step = 1, suffix = "", min) => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} min={min} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} onBlur={() => { if (min != null && c[k] > 0 && c[k] < min) setC((o) => ({ ...o, [k]: min })); }} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const ok = c.coins.length && c.tfs.length && c.setups.length && c.capital > 0 && c.riskPct > 0;
  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Cấu hình phiên demo · bộ luật cũ v12 <button onClick={onSw3} className="ml-auto text-[12px] font-bold text-indigo-600">← Về SW3</button></div>
      <FollowNote mode={follow} />
      <div className="space-y-3">
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Chạy lại từ quá khứ</div><div className="flex flex-wrap gap-1.5">{[30, 60, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{d} ngày trước</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures)</div><CoinsEditor coins={c.coins} onChange={(coins) => setC((o) => ({ ...o, coins }))} /></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Khung giờ</div><div className="flex flex-wrap gap-1.5">{EDIT_TFS.map((k) => <button key={k} onClick={() => tog("tfs", k)} className={chip(c.tfs.includes(k))}>{TFS[k].label}</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Setup theo bộ kiến thức</div>
          <div className="space-y-1">{Object.entries(SETUPS).filter(([k]) => k !== "SW3").map(([k, s]) => (
            <button key={k} onClick={() => tog("setups", k)} className={`block w-full rounded-lg border px-3 py-2 text-left ${c.setups.includes(k) ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 opacity-60"}`}>
              <div className="text-[12.5px] font-bold text-slate-800">{c.setups.includes(k) ? "☑" : "☐"} {s.label}</div><div className="text-[11px] leading-snug text-slate-500">{s.desc}</div>
            </button>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}
          {field("dailyStopPct", "Dừng ngày khi lỗ", 0.5, "%")}{field("rr", `Chốt lời gốc (R:R ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}{field("beAtR", "Dời hoà vốn ở (0=tắt)", 0.5, "R")}{field("feePct", "Phí mỗi chiều", 0.01, "%")}
          {field("maxFeeR", "Bỏ lệnh khi phí > (0=tắt)", 0.05, "R")}{field("streakN", "Thua liền N lệnh → giảm rủi ro (0=tắt)", 1, "lệnh")}{field("streakRiskPct", "Rủi ro khi đang chuỗi thua", 0.25, "%")}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[13px] font-extrabold text-emerald-800">Chỉ vào LỆNH CHỜ (limit) — đúng điểm đẹp mới vào, không thì bỏ</div>
          <div className="mt-1 text-[11.5px] leading-snug text-emerald-900/70">Đặt lệnh chờ ở giá đóng nến tín hiệu (phí maker 0,02%, không trượt). Chỉ khớp khi giá <b>xuyên qua</b> mức đặt trong số nến chờ; hết hạn không khớp → huỷ. Trước khi đặt còn kiểm tra: <b>không đuổi giá</b> (giá vào không xa EMA50 quá N ATR) và <b>SL ngoài vùng nhiễu</b> (≥ N ATR). Lúc thiết lập (chạy lại quá khứ) hai luật này nâng rõ tỉ lệ thắng — xem hiệu quả thật ở Thống kê → “Luật vào đẹp có hiệu quả không?”.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Vùng Key Volume (bộ kiến thức: chỉ vào TẠI vùng có lý do)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{[[1, "Nến volume lớn nhất 100 nến (khuyên dùng)"], [3, "Top 3 nến volume"], [0, "Tắt"]].map(([k, l]) => <button key={k} onClick={() => setC({ ...c, keyVolume: k })} className={chip(c.keyVolume === k)}>{l}</button>)}</div>
          <div className="mt-1 text-[11px] text-emerald-900/60">Giá vào phải nằm trong vùng nến Key Volume (nến volume ≥ 2,5× TB20 lớn nhất 100 nến). Đây là luật lọc mạnh nhất lúc thiết lập; hiệu quả thật xem ở Thống kê.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Xác nhận theo bộ kiến thức (VSA · Price Action · đa khung)</div>
          {[["sigVol", "Nến tín hiệu phải có volume > TB20 (VSA: có lực xác nhận)"], ["noEngulf", "Không vào ngay sau nến engulfing lớn (tránh đuổi giá sau nến mạnh)"], ["d1Bias", "Chỉ vào thuận xu hướng D1 (ít lệnh hơn, thắng cao hơn)"]].map(([k, l]) => <label key={k} className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-emerald-900"><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> {l}</label>)}
          <div className="mt-1 text-[11px] text-emerald-900/60">Càng nhiều bộ lọc → ít lệnh hơn nhưng chọn lọc hơn (bật D1 thường chỉ vài lệnh mỗi tuần).</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("maxExtAtr", "Không đuổi: xa EMA50 ≤ (0=tắt)", 0.5, "ATR")}{field("minSlAtr", "SL tối thiểu (0=tắt)", 0.5, "ATR")}{field("fillBars", "Chờ khớp tối đa", 1, "nến")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{field("partialAtR", `Chốt 50% ở (0=tắt, ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}</div>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700"><input type="checkbox" checked={c.htfFilter} onChange={(e) => setC({ ...c, htfFilter: e.target.checked })} /> Chỉ đánh thuận xu hướng khung lớn — khung lớn CHỈ dùng xác định bias: M5 theo H1, M15 theo H4 (EMA200)</label>
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <label className="flex items-center gap-2 text-[13px] font-extrabold text-violet-800"><input type="checkbox" checked={c.adaptive} onChange={(e) => setC({ ...c, adaptive: e.target.checked })} /><Brain size={15} /> Tự tối ưu dần (walk-forward)</label>
          <div className="mt-1 text-[11.5px] leading-snug text-violet-900/70">Mỗi tín hiệu được thử song song 6 cấu hình (R:R 1.5/2/3 × có/không dời hoà vốn). Khi có tín hiệu mới, bot chỉ nhìn các lệnh <b>đã đóng trước đó</b> (không nhìn trước tương lai) → chọn cấu hình kỳ vọng cao nhất, kỳ vọng thấp hơn ngưỡng thì <b>bỏ tín hiệu</b>. Thiếu mẫu ở cặp+khung+setup thì học từ nhóm rộng hơn. Luôn chạy kèm “Luật gốc” để so sánh.</div>
          {c.adaptive && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("warmupDays", "Học trước ngày bắt đầu", 5, "ngày")}{field("lookback", "Xét N lệnh gần nhất", 5)}{field("minSample", "Cần tối thiểu", 1, "mẫu")}{field("minExp", "Vào khi điểm ≥", 0.05, "R")}{field("confK", "Độ thận trọng (0=tắt)", 0.25, "× sai số")}</div>}
          {c.adaptive && <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.tfGate} onChange={(e) => setC({ ...c, tfGate: e.target.checked })} /> Nghỉ cả khung giờ khi khung đó đang lỗ (kỳ vọng gần đây âm)</label>}
          {c.adaptive && <label className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.learnLoss} onChange={(e) => setC({ ...c, learnLoss: e.target.checked })} /> Rút kinh nghiệm sau mỗi lệnh thua (tự kiểm chứng: bài học chỉ áp dụng khi chứng minh được là giúp)</label>}
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 text-[11.5px] leading-snug text-slate-500">
          <b className="text-slate-700">Đề xuất cho vốn 1.000$:</b> rủi ro <b>2%/lệnh</b> (≈20$, theo bạn chốt), tối đa <b>3 lệnh</b> cùng lúc, đòn bẩy ≤ <b>20x</b>, dừng ngày khi lỗ <b>6%</b> (= 3 lệnh thua), bỏ lệnh khi phí &gt; <b>0,35R</b> (SL quá sát), vào bằng <b>lệnh chờ</b>, không dời hoà vốn (dữ liệu cho thấy dời hoà vốn làm giảm lợi nhuận). Chạy lại 3 tháng gần nhất; bộ tối ưu + bài học từ lệnh thua TỰ KIỂM CHỨNG — chỉ được chặn lệnh khi chứng minh được là giúp. <b>R:R tối thiểu 1:{String(MIN_RR).replace(".", ",")}</b> — bộ tối ưu chỉ chọn trong R:R 1,5 / 2 / 3. Khối lượng tự tính = tiền rủi ro ÷ khoảng cách SL.
        </div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: c, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo</button>
        </div>
      </div>
    </Card>
  );
}

// WebSocket Binance Futures: nến đang chạy của mọi cặp × khung. Gom cập nhật 1 lần/giây; nến đóng → onClose().
function useLive(active, coins, tfs, onClose) {
  const live = useRef({}), shown = useRef({}), dirty = useRef(false), cb = useRef(onClose);
  const [ver, setVer] = useState(0), [status, setStatus] = useState("off");
  cb.current = onClose;
  const ck = coins.join(), tk = tfs.join();
  useEffect(() => {
    if (!active) { setStatus("off"); return undefined; }
    let ws = null, stop = false, retry = 0, timer = null;
    const sym2coin = Object.fromEntries(coins.map((c) => [symOf(c), c]));
    const streams = coins.flatMap((c) => tfs.map((tf) => `${symOf(c).toLowerCase()}@kline_${tf}`)).join("/");
    const connect = () => {
      setStatus(retry ? "reconnect" : "connecting");
      ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`);
      ws.onopen = () => { retry = 0; setStatus("live"); };
      ws.onmessage = (m) => {
        try {
          const k = JSON.parse(m.data)?.data?.k; if (!k) return;
          const coin = sym2coin[k.s]; if (!coin) return;
          live.current[`${coin}|${k.i}`] = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
          live.current[`px|${coin}`] = +k.c;
          dirty.current = true;
          if (k.x) cb.current?.();
        } catch { /* bỏ qua gói lỗi */ }
      };
      ws.onclose = () => { if (stop) return; setStatus("reconnect"); timer = setTimeout(connect, Math.min(30000, 2000 * 2 ** retry++)); };
      ws.onerror = () => { try { ws.close(); } catch { /* bỏ qua */ } };
    };
    connect();
    const tick = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      for (const c of coins) { const p = live.current[`px|${c}`]; if (p == null) continue; const o = shown.current[c]; shown.current[c] = { c: p, dir: o && p !== o.c ? (p > o.c ? 1 : -1) : o?.dir || 0, at: o && p !== o.c ? Date.now() : o?.at || 0 }; }
      setVer((v) => v + 1);
    }, 1000);
    const vis = () => { if (!document.hidden && ws && ws.readyState > 1) { clearTimeout(timer); retry = 0; connect(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer); clearInterval(tick); document.removeEventListener("visibilitychange", vis); try { ws?.close(); } catch { /* bỏ qua */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ck, tk]);
  return { live, shown, ver, status };
}

// Nhật ký thay đổi luật: lúc đổi (số liệu khi đó) → sau khi đổi (lệnh vào từ lúc đổi, theo luật hiện tại)
// Phễu tín hiệu (24/10): sếp thấy "rất nhiều tín hiệu mà ít vào lệnh" → hiện rõ từ tín hiệu thô tới lệnh, mỗi bộ lọc bỏ bao nhiêu.
// Số liệu = cả phiên Demo (res.skipped đếm chính xác từ ngày bắt đầu, cùng luật bot thật).
function SignalFunnel({ res, P }) {
  const [open, setOpen] = useState(false);
  const total = (res.streams || []).reduce((a, s) => a + (s.signals || 0), 0);
  const taken = P.trades.filter((t) => t.status !== "skip").length;
  if (!total) return null;
  const days = Math.max(1, (res.until - res.startAt) / 86400000);
  const port = {}; for (const t of P.trades) if (t.status === "skip") port[t.why || "giới hạn vốn"] = (port[t.why || "giới hạn vốn"] || 0) + 1;
  const rows = [...Object.entries(res.skipped || {}), ...Object.entries(port).map(([k, v]) => [`${k} (quản lý vốn)`, v]), ...(res.rejected?.length ? [["bộ tối ưu / bài học loại", res.rejected.length]] : [])].sort((a, b) => b[1] - a[1]);
  const pct = (v) => `${fmtNum((v / total) * 100, 1, 1)}%`;
  return (
    <Card className="!p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
        <Activity size={15} className="shrink-0 text-cyan-500" />
        <span className="text-[13px] font-extrabold text-slate-800">Phễu tín hiệu</span>
        <span className="text-[12px] text-slate-500"><b className="text-slate-700">{total.toLocaleString("vi-VN")}</b> tín hiệu thô → <b className="text-emerald-600">{taken}</b> lệnh ({pct(taken)}) · TB {fmtNum(total / days, 0, 0)} tín hiệu → {fmtNum(taken / days, 1, 1)} lệnh / ngày</span>
        <ChevronDown size={15} className={`ml-auto shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px] sm:grid-cols-[minmax(0,260px)_1fr_auto]">
            <span className="min-w-0 truncate text-slate-600" title={k}>Bỏ: {k}</span>
            <div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto"><div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max(1, (v / total) * 100)}%` }} /></div>
            <span className="tabular-nums text-slate-500 sm:order-last">{v.toLocaleString("vi-VN")} · {pct(v)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px] font-bold sm:grid-cols-[minmax(0,260px)_1fr_auto]"><span className="text-emerald-700">Vào lệnh</span><div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(1, (taken / total) * 100)}%` }} /></div><span className="tabular-nums text-emerald-700 sm:order-last">{taken} · {pct(taken)}</span></div>
        <div className="pt-1 text-[11.5px] leading-snug text-slate-500">"Tín hiệu thô" = mẫu nến khớp 1 trong 4 setup trên mọi cặp × khung (rất nhiều, phần lớn là nhiễu). Bot chỉ vào khi qua <b>đủ mọi bộ lọc</b>. Kiểm thử 3 kỳ × 90 ngày (24/10): bỏ lọc D1 / Key Volume / engulfing / hạ SL tối thiểu đều <b>thêm lệnh nhưng giảm lãi</b>; thêm lọc cấu trúc sóng (BOS/CHoCH, HH-HL) hay setup FTR tại Key Volume cũng không cải thiện. Riêng nới "đuổi giá" 1,5 → 2,5 ATR giảm sụt vốn cả 3 kỳ → đã áp dụng (luật v11). Thử thêm 28/10: bias cấu trúc khung lớn H4/D1/W1, SMC thuần, Elliott sóng 3, Wyckoff (SFP trong vùng tích luỹ), xác nhận Price Action — không phương án nào lãi hơn; bias cấu trúc H4+D1+W1 giảm sụt vốn ~một nửa nhưng lãi và số lệnh cũng giảm ~một nửa. Thử 30/10: nới bài học / thêm coin đều lỗ hơn; giảm rủi ro BREAKOUT + SFP còn 1% lãi hơn 5/6 kỳ, sụt vốn thấp hơn 6/6 → đã áp dụng (luật v12). Quá khứ không bảo đảm tương lai; không phải tư vấn đầu tư.</div>
      </div>}
    </Card>
  );
}

function RulesLog({ log, list }) {
  const rows0 = Array.isArray(log) ? log : [];
  const [all, setAll] = useState(false);
  // Lọc (22/10): theo nguồn (Demo / Bot thật) + người đổi
  const [src, setSrc] = useState("all"), [who, setWho] = useState("all");
  const people = [...new Set(rows0.map((r) => r.by).filter(Boolean))];
  const rows = rows0.filter((r) => (src === "all" || (src === "bot") === (r.src === "bot")) && (who === "all" || r.by === who));
  const chip = (on) => `rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`;
  return (
    <Card className="!p-3">
      <Title icon={History}>Nhật ký thay đổi luật ({rows.length}{rows.length !== rows0.length ? `/${rows0.length}` : ""})</Title>
      {rows0.length > 3 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {[["all", "Tất cả"], ["demo", "Demo"], ["bot", "Bot thật"]].map(([k, l]) => <button key={k} onClick={() => setSrc(k)} className={chip(src === k)}>{l}</button>)}
          {people.length > 1 && <><span className="mx-1 h-3 w-px bg-slate-200" />{[["all", "Mọi người"], ...people.map((p) => [p, p.split("@")[0]])].map(([k, l]) => <button key={k} onClick={() => setWho(k)} className={chip(who === k)}>{l}</button>)}</>}
        </div>
      )}
      {!rows0.length ? <div className="text-[12px] text-slate-400">Chưa có thay đổi nào được ghi. Từ nay mỗi lần tắt/bật cặp, khung, sửa cặp, tạo phiên mới hay dừng phiên đều được ghi lại ở đây.</div> : (
        <div className="divide-y divide-slate-100">
          {(all ? rows : rows.slice(0, 8)).map((r, i) => {
            const after = statsOf(list.filter((t) => t.entryAt >= r.at));
            return (
              <div key={r.at + "-" + i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[12px]">
                <span className="tabular-nums text-slate-400">{dt(r.at)}</span>
                <span className={`rounded px-1.5 text-[10px] font-bold ${r.src === "bot" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{r.src === "bot" ? "Bot thật" : "Demo"}</span>
                <b className="text-slate-800">{String(r.what || "").replace(/^Bot thật: /, "")}</b>
                {r.by && <span className="text-[11px] text-slate-400">{r.by.split("@")[0]}</span>}
                {r.reason && <span className="text-[11.5px] italic text-slate-500">“{r.reason}”</span>}
                <span className="ml-auto flex flex-wrap gap-x-3 text-[11.5px] tabular-nums">
                  {r.snap && <span className="text-slate-500">lúc đổi: {r.snap.n} lệnh · {rr(r.snap.avgR)}{r.snap.eq != null ? ` · ${usd(r.snap.eq, 0)}` : ""}</span>}
                  <span className={after.n ? tone(after.avgR) : "text-slate-400"}>sau đó: {after.n ? `${after.n} lệnh · thắng ${fmtNum(after.winRate, 0, 0)}% · ${rr(after.avgR)}` : "chưa có lệnh đóng"}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!!rows0.length && !rows.length && <div className="py-1 text-[12px] text-slate-400">Không có dòng nào khớp bộ lọc.</div>}
      {rows.length > 8 && <button onClick={() => setAll((v) => !v)} className="mt-1 text-[12px] font-bold text-indigo-600">{all ? "Thu gọn" : `Xem cả ${rows.length} dòng`}</button>}
      <div className="mt-1 text-[11px] text-slate-400">"Sau đó" = lệnh vào từ lúc đổi theo luật đang chạy — cần vài tuần mới đủ để đánh giá một thay đổi.</div>
    </Card>
  );
}

export default function CoinBot({ active: visible = true }) {
  const { settings = {}, setSettings, isOwner, perms = [], myEmail } = useData();
  const follow = useLiveFollow();
  // Nhật ký thay đổi luật (21/10): mỗi lần tắt/bật cặp, khung, sửa cặp, phiên mới, dừng → ghi ai đổi, lúc nào, kèm số liệu LÚC ĐỔI
  // để sau đối chiếu "sau khi đổi" tốt lên hay xấu đi. Giữ 100 dòng gần nhất (settings.paperBotLog).
  const saveWithLog = (paperBot, what, reason = "") => {
    let snap = null;
    try { snap = { n: all.n, winRate: all.winRate, avgR: all.avgR, eq: eqNow }; } catch { /* chưa có kết quả */ }
    const row = { at: Date.now(), by: myEmail || "", what, snap, ...(reason ? { reason: String(reason).slice(0, 200) } : {}) };
    setSettings({ paperBot, paperBotLog: [row, ...(Array.isArray(settings.paperBotLog) ? settings.paperBotLog : [])].slice(0, 100) });
  };
  const canView = isOwner || perms.includes("coinDemo"); // thành viên được cấp quyền: CHỈ XEM (không dừng / phiên mới / sửa cặp)
  const session = settings.paperBot || null;
  const [raw, setRaw] = useState(null);
  const [rawOld, setRawOld] = useState(null); // bản cũ: cùng phiên nhưng chưa có luật vào đẹp — để so sánh
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [config, setConfig] = useState(false);
  const [filter, setFilter] = useState("all");
  const [hStream, setHStream] = useState("all"); // lọc lịch sử theo cặp|khung
  const [hMonth, setHMonth] = useState("all"); // lọc lịch sử theo tháng (giờ VN)
  const histScroll = useRef(0);
  const [showN, setShowN] = useState(40);
  const [view, setView] = useState("auto");
  const [optAll, setOptAll] = useState(false);
  const [tab, setTab] = useState("chart");
  const [showRules, setShowRules] = useState(false), [editCoins, setEditCoins] = useState(null), [editTfs, setEditTfs] = useState([]);
  const tfName = (l) => l.map((x) => TFS[x]?.label || x).join(", ");
  const saveCoins = async () => {
    if (!editCoins?.length || !editTfs.length) return;
    const added = editCoins.filter((x) => !cfg.coins.includes(x)), removed = cfg.coins.filter((x) => !editCoins.includes(x));
    const tfAdd = editTfs.filter((x) => !cfg.tfs.includes(x)), tfDel = cfg.tfs.filter((x) => !editTfs.includes(x));
    const tfs = EDIT_TFS.filter((x) => editTfs.includes(x));
    const ans = await ask(`Lưu: cặp ${editCoins.join(", ")} · khung ${tfName(tfs)}?${added.length ? `\nThêm cặp: ${added.join(", ")}` : ""}${removed.length ? `\nXoá cặp: ${removed.join(", ")}` : ""}${tfAdd.length ? `\nThêm khung: ${tfName(tfAdd)}` : ""}${tfDel.length ? `\nBỏ khung: ${tfName(tfDel)}` : ""}\nDemo chạy lại từ đầu phiên với cấu hình mới; bot thật áp dụng trong ~5 phút.`, { ok: "Lưu & chạy lại", input: "Lý do đổi (không bắt buộc)…" }); if (!ans) return;
    const what = [added.length || removed.length ? `Sửa cặp: ${editCoins.join(", ")}${added.length ? ` (thêm ${added.join(", ")})` : ""}${removed.length ? ` (bỏ ${removed.join(", ")})` : ""}` : "", tfAdd.length || tfDel.length ? `Khung: ${tfName(tfs)}${tfAdd.length ? ` (thêm ${tfName(tfAdd)})` : ""}${tfDel.length ? ` (bỏ ${tfName(tfDel)})` : ""}` : ""].filter(Boolean).join(" · ");
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), coins: editCoins, tfs, offStreams: (session.cfg?.offStreams || []).filter((k) => tfs.includes(k.split("|")[1])) }, createdAt: Date.now() }, what, ans.text);
    setEditCoins(null);
  };
  // Tắt 1 cặp từ bảng "nên giữ hay tắt" (cùng cơ chế Thêm/sửa cặp: Demo chạy lại, bot thật áp dụng ~5 phút)
  const removeCoin = async (c) => {
    const next = cfg.coins.filter((x) => x !== c), offNext = (cfg.offStreams || []).filter((k) => !k.startsWith(c + "|"));
    if (!next.length) return;
    const ans = await ask(`Tắt cặp ${c} khỏi bot?\nCòn lại: ${next.join(", ")}.\nDemo chạy lại từ đầu phiên với danh sách mới; bot thật áp dụng trong ~5 phút (lệnh ${c} đang mở trên sàn — nếu có — vẫn giữ SL/TP tới khi đóng). Bật lại được ở "Thêm/sửa cặp".`, { ok: `Tắt ${c}`, danger: true, input: "Lý do (không bắt buộc)…" }); if (!ans) return;
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), coins: next, offStreams: offNext }, createdAt: Date.now() }, `Tắt cặp ${c}`, ans.text);
  };
  // Tắt / bật RIÊNG 1 khung của 1 cặp (cfg.offStreams) — Demo chạy lại, bot thật áp dụng ~5 phút
  const toggleStream = async (c, tf) => {
    const key = `${c}|${tf}`, cur = cfg.offStreams || [], on = cur.includes(key);
    const next = on ? cur.filter((x) => x !== key) : [...cur, key];
    if (!on && cfg.coins.every((x) => cfg.tfs.every((t) => next.includes(`${x}|${t}`)))) return;
    const lbl = `${c} ${TFS[tf].label}`;
    const ans = await ask(on ? `Bật lại ${lbl}?\nDemo chạy lại từ đầu phiên; bot thật áp dụng trong ~5 phút.` : `Tắt riêng ${lbl}?\nBot không quét / không vào lệnh ở khung này nữa (các khung khác của ${c} vẫn chạy). Demo chạy lại từ đầu phiên; bot thật áp dụng trong ~5 phút. Bật lại được ngay tại bảng này.`, { ok: on ? `Bật ${lbl}` : `Tắt ${lbl}`, danger: !on, input: "Lý do (không bắt buộc)…" }); if (!ans) return;
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), offStreams: next }, createdAt: Date.now() }, `${on ? "Bật lại" : "Tắt khung"} ${lbl}`, ans.text);
  };
  const [focus, setFocus] = useState(null);
  const [sel, setSel] = useState({ coin: "BTC", tf: "15m" });
  const [toast, setToast] = useState(null);
  const running = useRef(false), lastRun = useRef(0), hits = useRef(new Map()), prevSt = useRef(null), debounce = useRef(null);
  const cfg = cfgOf(session);
  const active = !!session && !session.stoppedAt && canView && visible; // tab ẩn → tắt giá realtime + tính lại (đỡ tốn pin)

  const sessRef = useRef(session); sessRef.current = session;
  const again = useRef(false);
  const run = async () => {
    if (!sessRef.current) return;
    if (running.current) { again.current = true; return; } // phiên đổi giữa chừng → chạy lại sau khi xong
    running.current = true; setErr("");
    const ss = sessRef.current, same = () => sessRef.current?.createdAt === ss.createdAt && sessRef.current?.stoppedAt === ss.stoppedAt;
    try {
      const r = await runSessionAsync(ss, (m) => setBusy(m));
      if (same()) { setRaw(r); lastRun.current = Date.now(); setRawOld(null); demoCacheSet(ss, r); }
    }
    catch (e) { setErr(e.message || String(e)); }
    running.current = false; setBusy("");
    if (again.current || !same()) { again.current = false; run(); }
  };
  const { live, shown, ver, status } = useLive(active, cfg.coins, cfg.tfs, () => { clearTimeout(debounce.current); debounce.current = setTimeout(run, 2500); });

  // Nâng phiên đang chạy lên v4 theo yêu cầu (20/10): chạy lại 3 tháng gần nhất, bỏ H4 (kiểm tra: bỏ H4 tốt hơn nhẹ)
  useEffect(() => {
    if (!isOwner || !session || session.stoppedAt || (session.cfg?.cfgVer || 1) >= 4) return;
    const c = cfgOf(session), tfs = c.tfs.filter((x) => x !== "4h");
    setSettings({ paperBot: { ...session, startAt: Date.now() - 90 * 86400000, createdAt: Date.now(), cfg: { ...c, tfs: tfs.length ? tfs : c.tfs } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.createdAt]);
  useEffect(() => {
    setRaw(null); setRawOld(null); hits.current = new Map(); prevSt.current = null;
    if (!session) return;
    // Hiện NGAY kết quả lần trước (đúng phiên) trong lúc tính lại ngầm — không phải chờ tải 25 luồng nến
    const ss = session;
    demoCacheGet(ss).then((c) => { if (c && sessRef.current?.createdAt === ss.createdAt && sessRef.current?.stoppedAt === ss.stoppedAt) setRaw((cur) => cur || c); });
    run(); /* eslint-disable-next-line */
  }, [session?.createdAt, session?.stoppedAt]);
  // Bản cũ (chưa lọc vào đẹp) chỉ để so sánh → CHỈ tính khi mở tab Thống kê (đỡ tốn máy)
  const oldBusy = useRef(false);
  useEffect(() => {
    if (tab !== "stats" || !raw || rawOld || oldBusy.current || !session) return;
    const c0 = cfgOf(session); if (!(c0.maxExtAtr > 0 || c0.minSlAtr > 0 || c0.keyVolume > 0)) return;
    oldBusy.current = true;
    runSessionAsync({ ...session, cfg: { ...c0, maxExtAtr: 0, minSlAtr: 0, keyVolume: 0, sigVol: false, noEngulf: false, d1Bias: false } }).then(setRawOld).catch(() => {}).finally(() => { oldBusy.current = false; });
  }, [tab, raw, rawOld]); // eslint-disable-line react-hooks/exhaustive-deps
  const oldFin = useMemo(() => (rawOld ? finalize(rawOld, null) : null), [rawOld]);
  // Dự phòng khi mất WebSocket: mỗi phút xét nến mới (đang có realtime thì 5 phút/lần)
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (!document.hidden && Date.now() - lastRun.current > (status === "live" ? 300000 : 55000)) run(); }, 60000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [active, status, session?.createdAt]);
  useEffect(() => () => clearTimeout(debounce.current), []);
  useEffect(() => { if (visible && session && Date.now() - lastRun.current > 60000) run(); /* eslint-disable-next-line */ }, [visible]); // mở lại tab → cập nhật ngay

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => finalize(raw, active ? live.current : null, hits.current), [raw, ver, active]);
  const isBase = view === "base" || !cfg.adaptive;
  const P = res ? (isBase ? res.basePortfolio : res.portfolio) : null;
  const list = useMemo(() => (res ? (isBase ? res.baseTrades : res.trades) : []), [res, isBase]);

  // Phát hiện mở/đóng lệnh mới (danh mục chính) → thông báo nổi
  useEffect(() => {
    if (!res) return;
    const rows = res.portfolio.trades.filter((t) => t.status !== "skip"), cur = new Map(rows.map((t) => [t.id, t.status]));
    if (prevSt.current) {
      const evs = [];
      for (const t of rows) {
        const was = prevSt.current.get(t.id);
        if (!was && t.status === "open") evs.push({ text: `Mở ${t.side === 1 ? "MUA" : "BÁN"} ${t.coin} ${TFS[t.tf].label} @ ${px(t.entry)} · cắt lỗ ${px(t.curSl)} · ${tpLbl(t)} ${px(t.tp)}`, ok: true });
        if (was === "open" && t.status === "done") evs.push({ text: `Đóng ${t.coin} ${TFS[t.tf].label} · ${viReason(t.reason)} ${rr(t.r)} (${usd(t.pnl)})`, ok: t.r >= 0 });
      }
      if (evs.length) { setToast({ ...evs[evs.length - 1], more: evs.length - 1, at: Date.now() }); try { navigator.vibrate?.(60); } catch { /* bỏ qua */ } }
    }
    prevSt.current = cur;
  }, [res]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  const all = useMemo(() => statsOf(list), [list]);
  const sAuto = useMemo(() => (res ? statsOf(res.trades) : null), [res]), sBase = useMemo(() => (res ? statsOf(res.baseTrades) : null), [res]), sRej = useMemo(() => (res ? statsOf(res.rejected) : null), [res]);
  const by = (key, vals, label = (x) => x) => vals.map((v) => [label(v), statsOf(list.filter((t) => t[key] === v))]);
  const curveA = useMemo(() => (res ? res.portfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  const curveB = useMemo(() => (res ? res.basePortfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  // mở biểu đồ đúng luồng của lệnh được chọn
  const showOnChart = (t) => { if (tab === "history") histScroll.current = window.scrollY; setSel({ coin: t.coin, tf: t.tf }); setFocus(t); setTab("chart"); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* bỏ qua */ } };
  const backToHistory = () => { setTab("history"); setTimeout(() => { try { window.scrollTo({ top: histScroll.current }); } catch { /* bỏ qua */ } }, 60); };
  const selInit = useRef(false);
  useEffect(() => { // mặc định: luồng có lệnh gần nhất
    if (!res || selInit.current) return; selInit.current = true;
    const last = [...res.portfolio.trades].filter((t) => t.status !== "skip").sort((a, b) => b.entryAt - a.entryAt)[0], c0 = cfgOf(session);
    setSel(last ? { coin: last.coin, tf: last.tf } : { coin: c0.coins[0], tf: c0.tfs[c0.tfs.length - 1] });
  }, [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartTrades = useMemo(() => (P ? P.trades.filter((x) => x.coin === sel.coin && x.tf === sel.tf && x.status !== "skip") : []), [P, sel]);
  const chartPending = useMemo(() => (res && active ? res.pending || [] : []).filter((x) => x.coin === sel.coin && x.tf === sel.tf), [res?.pending, active, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => {
    if (!P) return [];
    const src = filter === "reject" ? res.rejected.map((t) => ({ ...t, status: "reject" })) : P.trades;
    return src.filter((t) => hStream === "all" || `${t.coin}|${t.tf}` === hStream || t.coin === hStream).filter((t) => hMonth === "all" || monthOf(t.entryAt) === hMonth).filter((t) => (filter === "all" ? t.status !== "skip" : filter === "open" ? t.status === "open" : filter === "skip" ? t.status === "skip" : filter === "reject" ? true : t.status === "done" && (filter === "win" ? t.r > 0.05 : t.r < -0.05))).sort((a, b) => b.entryAt - a.entryAt);
  }, [P, res, filter, hStream, hMonth]);
  // Tổng theo tháng (lệnh đã vào, theo cặp đang lọc): số lệnh · thắng · lãi/lỗ $
  const months = useMemo(() => {
    if (!P) return [];
    const m = new Map();
    for (const t of P.trades) {
      if (t.status === "skip" || !(hStream === "all" || `${t.coin}|${t.tf}` === hStream || t.coin === hStream)) continue;
      const k = monthOf(t.entryAt), x = m.get(k) || { k, n: 0, win: 0, done: 0, pnl: 0 };
      x.n++; if (t.status === "done") { x.done++; if (t.r > 0.05) x.win++; x.pnl += t.pnl || 0; }
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => (a.k < b.k ? 1 : -1));
  }, [P, hStream]);
  // Xuất lịch sử đang lọc ra CSV (mở được bằng Excel, giữ tiếng Việt)
  const exportCsv = () => {
    const head = ["Vào lúc", "Cặp", "Khung", "Hướng", "Setup", "Giá vào", "SL", "TP", "Kết thúc", "Giá thoát", "Lúc thoát", "R", "Lãi/lỗ $", "Trạng thái"];
    const iso = (t) => (t ? new Date(t + 7 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "");
    const rows = taken.map((t) => [iso(t.entryAt), t.coin, TFS[t.tf].label, t.side === 1 ? "LONG" : "SHORT", setupName(t.setup), t.entry, t.sl, t.tp, t.reason || "", t.exit ?? "", iso(t.exitAt), (t.r ?? t.uR)?.toFixed(2) ?? "", t.pnl != null ? t.pnl.toFixed(2) : "", t.status]);
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `lich-su-lenh-demo-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const feed = useMemo(() => {
    if (!P) return [];
    const ev = [];
    for (const t of P.trades) { if (t.status === "skip") continue; ev.push({ t: t.entryAt, kind: "open", tr: t }); if (t.exitAt) ev.push({ t: t.exitAt, kind: "close", tr: t }); }
    return ev.sort((a, b) => b.t - a.t).slice(0, 12);
  }, [P]);

  if (!canView) return <Card><div className="text-sm text-slate-500">Bạn chưa được cấp quyền xem Demo tự động.</div></Card>;
  if (!isOwner && !session) return <Card><div className="py-8 text-center text-sm text-slate-500">Chủ workspace chưa tạo phiên Demo.</div></Card>;
  // 06/11: xoá lịch sử Demo (sếp yêu cầu, làm lại phương pháp mới) — giữ 1 bản dự phòng ẩn settings.paperBotArchive để khôi phục nếu bấm nhầm
  const archive = isOwner && !session ? settings.paperBotArchive : null;
  const restore = async () => { if (await ask(`Khôi phục phiên Demo đã xoá lúc ${dt(archive.removedAt)}?`, { ok: "Khôi phục" })) { saveWithLog(archive.session, "Khôi phục lịch sử Demo"); setSettings({ paperBotArchive: null }); } };
  if (!session || (config && isOwner)) return <>{archive?.session && <Card className="!p-3 mb-3"><div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500"><History size={14} className="text-slate-400" /> Đã xoá lịch sử Demo lúc <b className="text-slate-700">{dt(archive.removedAt)}</b> — app còn giữ 1 bản dự phòng. <button onClick={restore} className="font-bold text-indigo-600">Khôi phục</button></div></Card>}<SetupForm initial={session?.cfg} follow={follow} onStart={async (s) => { if (!(await confirmLiveFollow(session?.cfg, s.cfg))) return; if (session && isOwner) setSettings({ paperBotArchive: { session, removedAt: Date.now() } }); /* 06/11: phiên mới không xoá mất phiên cũ — giữ bản dự phòng */ saveWithLog(s, `Phiên mới: ${(s.cfg?.coins || []).join("/")} · ${(s.cfg?.tfs || []).map((x) => TFS[x]?.label || x).join(" ")} · rủi ro ${s.cfg?.riskPct ?? "?"}%`); setConfig(false); }} onCancel={session ? () => setConfig(false) : null} /></>;

  const wipe = async () => {
    const n = P ? P.trades.filter((t) => t.status !== "skip").length : null;
    if (!(await ask(`Xoá lịch sử giao dịch Demo?\n${n != null ? `${n} lệnh` : "Toàn bộ lệnh"} từ ${dt(session.startAt)} sẽ không hiện nữa (Demo, Tổng quan Coin, biểu đồ). Bot thật không bị ảnh hưởng.\nApp giữ 1 bản dự phòng ẩn — bấm "Khôi phục" nếu cần lấy lại.`, { ok: "Xoá lịch sử", danger: true }))) return;
    setSettings({ paperBotArchive: { session, removedAt: Date.now() } });
    saveWithLog(null, "Xoá lịch sử Demo");
  };
  const stop = async () => { const ans = await ask("Dừng phiên demo?\nBot ngừng mở lệnh mới; lệnh đang mở được tính lãi/lỗ theo giá lúc dừng. Kết quả giữ lại để xem, bấm “Phiên mới” để chạy lại.\nBot thật KHÔNG dừng theo — muốn dừng bot thật vào tab Bot thật.", { ok: "Dừng phiên", danger: true, input: "Lý do (không bắt buộc)…" }); if (ans) saveWithLog({ ...session, stoppedAt: Date.now() }, "Dừng phiên Demo", ans.text); };
  const eqNow = P ? P.equity + P.unrealized : null, pnl = eqNow != null ? eqNow - cfg.capital : null;
  const open = P ? P.trades.filter((t) => t.status === "open") : [];
  const done = P ? P.trades.filter((t) => t.status === "done") : [];
  const expUsd = done.length ? done.reduce((s, t) => s + t.pnl, 0) / done.length : null;
  const longS = statsOf(list.filter((t) => t.side === 1)), shortS = statsOf(list.filter((t) => t.side === -1));
  const net = P ? P.equity - cfg.capital : 0, recovery = P && P.maxDDUsd > 0 ? net / P.maxDDUsd : null;
  const st = { live: ["bg-emerald-500 animate-pulse", "Realtime"], connecting: ["bg-amber-400", "Đang nối giá…"], reconnect: ["bg-amber-500 animate-pulse", "Mất kết nối, đang nối lại…"], off: ["bg-slate-300", "Không realtime"] }[status];
  const optOn = res?.optState.filter((o) => o.take && o.level >= 0).length || 0, optOff = res?.optState.filter((o) => !o.take).length || 0;

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bot size={18} className="text-emerald-500" />
          <span className="text-[14px] font-extrabold text-slate-800">Bot demo · Futures</span>
          {isOwner && <FollowNote mode={follow} compact />}
          {session.stoppedAt ? <Badge tone="slate">Đã dừng</Badge> : <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" /> Đang chạy</span>}
          {cfg.adaptive && <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700"><Brain size={11} /> Tự tối ưu</span>}
          <div className="ml-auto flex gap-1.5">
            <button onClick={run} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Cập nhật</button>
            {!isOwner ? <span className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[12px] font-bold text-sky-700">Chỉ xem</span> : session.stoppedAt ? <><button onClick={wipe} className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[12px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Xoá lịch sử</button><button onClick={() => setConfig(true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Play size={13} /> Phiên mới</button></>
              : <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Square size={12} /> Dừng</button>}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500">
          Từ <b>{dt(session.startAt)}</b>{session.stoppedAt ? <> đến <b>{dt(session.stoppedAt)}</b></> : <> · đã chạy {ago(session.startAt)}</>} · {cfg.coins.join("/")} · {cfg.tfs.map((x) => TFS[x].label).join(" ")}{cfg.offStreams?.length ? <span className="text-amber-600"> (tắt {cfg.offStreams.map((k) => { const [c, t] = k.split("|"); return `${c} ${TFS[t]?.label || t}`; }).join(", ")})</span> : null} · rủi ro {cfg.riskPct}%/lệnh{Object.keys(cfg.riskBySetup || {}).length ? ` (${Object.entries(cfg.riskBySetup).map(([k, x]) => `${k} ${fmtNum(Math.min(x, cfg.riskPct), 2, 0)}%`).join(", ")})` : ""} · tối đa {cfg.maxOpen} lệnh <button onClick={() => setShowRules((v) => !v)} className="font-bold text-indigo-600">{showRules ? "Ẩn luật ▴" : "Xem luật ▾"}</button>{isOwner && !session.stoppedAt && <> · <button onClick={() => { setEditTfs([...cfg.tfs]); setEditCoins((v) => (v ? null : [...cfg.coins])); }} className="font-bold text-indigo-600">{editCoins ? "Đóng sửa ▴" : "Thêm/sửa cặp & khung ▾"}</button></>}
          {editCoins && (
            <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
              <div className="mb-1.5 text-[12.5px] font-extrabold text-slate-800">Cặp bot giao dịch (Demo + bot thật)</div>
              <CoinsEditor coins={editCoins} onChange={setEditCoins} />
              <div className="mb-1.5 mt-3 text-[12.5px] font-extrabold text-slate-800">Khung giờ vào lệnh</div>
              <div className="flex flex-wrap gap-1.5">{EDIT_TFS.map((k) => { const on = editTfs.includes(k); return <button key={k} onClick={() => setEditTfs((l) => (on ? l.filter((x) => x !== k) : [...l, k]))} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{TFS[k].label}</button>; })}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">Khung lớn (H1, H4) ít tín hiệu hơn nhiều; bài kiểm thử gần nhất xem ở thẻ Phễu tín hiệu. Tắt riêng 1 khung của 1 cặp: Thống kê → "Tắt khung".</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditCoins(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[12px] font-bold text-slate-600">Huỷ</button>
                <button disabled={!editTfs.length || (editCoins.join() === cfg.coins.join() && [...editTfs].sort().join() === [...cfg.tfs].sort().join())} onClick={saveCoins} className="flex-1 rounded-lg bg-indigo-600 py-2 text-[12px] font-bold text-white disabled:opacity-40">Lưu & chạy lại</button>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">Lưu xong Demo chạy lại từ {dt(session.startAt)} với danh sách cặp mới (cặp xoá → lệnh demo của cặp đó biến mất). Bot thật nhận trong ~5 phút; lệnh/vị thế đang mở của cặp vừa xoá vẫn được bot quản lý (SL/TP) tới khi đóng.</div>
            </div>
          )}
          {showRules && cfg.strategy === "sw3" && <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3"><Sw3Rules cfg={cfg} /></div>}
          {showRules && cfg.strategy !== "sw3" && <div className="mt-1 rounded-lg bg-slate-50 p-2 leading-relaxed">Luật đang áp dụng (v{cfg.cfgVer}){cfg.maxFeeR > 0 ? ` · bỏ lệnh phí > ${cfg.maxFeeR}R` : ""} · vào lệnh chờ{cfg.maxExtAtr > 0 ? ` · không đuổi >${cfg.maxExtAtr} ATR` : ""}{cfg.minSlAtr > 0 ? ` · SL ≥${cfg.minSlAtr} ATR` : ""}{cfg.streakN > 0 ? ` · thua ${cfg.streakN} lệnh liền → rủi ro ${fmtNum(cfg.streakRiskPct, 2, 0)}% tới khi thắng lại` : ""}{cfg.keyVolume > 0 ? ` · tại Key Volume${cfg.keyVolume > 1 ? ` top ${cfg.keyVolume}` : ""}` : ""}{cfg.sigVol ? " · nến tín hiệu vol > TB20" : ""}{cfg.noEngulf ? " · không đuổi sau engulfing" : ""}{cfg.htfFilter ? ` · thuận khung lớn ${cfg.tfs.map((x) => `${TFS[x].label}→${TFS[TFS[x].htf].label}`).join(", ")}` : ""}{cfg.d1Bias ? " · bias D1 (chỉ thuận xu hướng D1)" : ""}{cfg.sigVol ? " · vol nến tín hiệu > TB20" : ""} · rủi ro {cfg.streakN > 0 ? "" : "cố định "}{fmtNum(cfg.riskPct, 2, 0)}%/lệnh{Object.keys(cfg.riskBySetup || {}).length ? ` (${Object.entries(cfg.riskBySetup).map(([k, v]) => `${k} ${fmtNum(Math.min(v, cfg.riskPct), 2, 0)}%`).join(", ")})` : ""} · R:R ≥ 1:{String(MIN_RR).replace(".", ",")}{cfg.adaptive ? ` · tối ưu ${cfg.lookback} lệnh/thận trọng ${cfg.confK}${cfg.tfGate ? "/nghỉ khung lỗ" : ""}` : ""}</div>}
          {busy && <span className="ml-1 inline-flex items-center gap-1 text-indigo-600"><Loader2 size={11} className="animate-spin" />{busy}</span>}
          {res && !busy && <span className="text-slate-400"> · bot xét nến lúc {dt(res.at)}</span>}
          {res && busy && <span className="text-slate-400"> · đang hiện kết quả lúc {dt(res.at)}</span>}
        </div>
        {active && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={`h-2 w-2 rounded-full ${st[0]}`} /><Radio size={12} /> {st[1]}</span>
            {cfg.coins.map((c) => { const s = shown.current[c], fresh = s && Date.now() - s.at < 1500; return (
              <span key={c} className={`rounded-md px-1.5 py-0.5 text-[12.5px] font-extrabold tabular-nums transition-colors duration-500 ${fresh ? (s.dir > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700") : "text-slate-800"}`}>
                <span className="mr-1 text-[10.5px] font-bold text-slate-400">{c}</span>{s ? px(s.c) : "…"}{s?.dir ? <span className={s.dir > 0 ? "text-emerald-500" : "text-rose-500"}>{s.dir > 0 ? " ▲" : " ▼"}</span> : null}
              </span>
            ); })}
          </div>
        )}
        {toast && <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-bold ${toast.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><Bell size={14} className="shrink-0" /> {toast.text}{toast.more ? <span className="font-normal opacity-70"> (+{toast.more} sự kiện)</span> : null}<span className="ml-auto text-[11px] font-normal opacity-60">{hm(toast.at)}</span></div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      {!res ? (err && !busy
        ? <Card><div className="py-10 text-center"><div className="text-[14px] font-extrabold text-rose-600">Chưa tải được dữ liệu Binance</div><div className="mt-1 text-[12px] text-slate-500">{err}</div><button onClick={run} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw size={14} /> Thử lại</button></div></Card>
        : <Card><div className="py-12 text-center text-sm text-slate-400"><div className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> {busy || "Đang chạy lại dữ liệu…"}</div><div className="mt-1 text-[11.5px]">Lần đầu cần tải ~3 tháng nến (vài chục nghìn nến) — các lần sau chỉ tải phần mới, mở rất nhanh.</div></div></Card>) : (<>
        {(() => { // Tóm tắt 1 dòng: đang làm gì · lệnh gần nhất · nhịp lệnh · tiến độ tháng này so với mục tiêu
          const tr = P.trades.filter((t) => t.status !== "skip"), last = tr.slice().sort((a, b) => b.entryAt - a.entryAt)[0];
          const weeks = Math.max(1, (Date.now() - session.startAt) / (7 * 86400000)), mNow = tr.filter((t) => monthOf(t.entryAt) === monthOf(Date.now())).length;
          return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-white px-3 py-2 text-[12.5px] text-slate-600 shadow-sm">
              <b className={open.length ? "text-emerald-700" : "text-slate-700"}>{session.stoppedAt ? "Phiên đã dừng" : open.length ? `Đang mở ${open.length} lệnh` : "Đang chờ tín hiệu"}</b>
              {last && <span>Lệnh gần nhất <b className="text-slate-800">{last.coin} {TFS[last.tf].label}</b> · {dt(last.entryAt)}</span>}
              <span>TB <b className="text-slate-800">{fmtNum(tr.length / weeks, 1, 0)}</b> lệnh/tuần</span>
              <span className={mNow >= MONTH_TARGET ? "font-bold text-emerald-700" : ""}>{monthLabel(monthOf(Date.now()))}: <b>{mNow}/{MONTH_TARGET}</b> lệnh</span>
            </div>
          );
        })()}
        {(() => { // Cảnh báo sớm: khung / cặp × khung đang âm 30 ngày gần nhất → mở bảng "nên giữ hay tắt"
          const w = weakStreams(P.trades, cfg); if (!w.tfs.length && !w.pairs.length) return null;
          return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <AlertTriangle size={14} className="shrink-0 text-amber-600" />
              <b>30 ngày qua đang âm:</b>
              {w.tfs.map((x) => <span key={x.tf}>khung <b>{TFS[x.tf].label}</b> ({x.n} lệnh, {rr(x.avgR)})</span>)}
              {w.pairs.slice(0, 4).map((x) => <span key={x.coin + x.tf} className="rounded bg-white/60 px-1.5">{x.coin} {TFS[x.tf].label} · {x.n} lệnh · {rr(x.avgR)}</span>)}
              <button onClick={() => setTab("stats")} className="ml-auto rounded-lg bg-amber-600 px-2.5 py-1 text-[11.5px] font-bold text-white">Xem nên giữ hay tắt</button>
            </div>
          );
        })()}
        {cfg.adaptive && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[["auto", "Bot tự tối ưu", Brain], ["base", "So sánh: không tự tối ưu", Bot]].map(([k, l, I]) => <button key={k} onClick={() => { setView(k); setShowN(40); if (k === "base" && filter === "reject") setFilter("all"); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-bold ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><I size={14} /> {l}</button>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Vốn hiện tại" v={usd(eqNow)} sub={`vốn đầu ${usd(cfg.capital, 0)}${open.length ? ` · ${open.length} lệnh mở` : ""}`} />
          <Num label="Lãi / lỗ" v={usd(pnl)} sub={`${pct((pnl / cfg.capital) * 100)}${P.unrealized ? ` · tạm tính ${usd(P.unrealized)}` : ""}`} tone={tone(pnl)} />
          <Num label="Tỉ lệ thắng" v={all.winRate != null ? `${fmtNum(all.winRate, 1, 1)}%` : "—"} sub={`${all.wins} thắng · ${all.losses} thua · ${all.bes} hoà`} />
          <Num label="Lệnh đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status === "skip").length} bị danh mục bỏ`} className="hidden sm:block" />
          <Num label={<Term k="avgR" />} v={rr(all.avgR)} sub="kỳ vọng, đã trừ phí" tone={tone(all.avgR)} className="hidden sm:block" />
          <Num label={<Term k="pf" />} v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : fmtNum(all.pf, 2, 2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} className="hidden sm:block" />
          <Num label={<Term k="dd" />} v={`${fmtNum(P.maxDD, 1, 1)}%`} sub={usd(-P.maxDDUsd)} tone={P.maxDD > 20 ? "text-rose-600" : "text-slate-900"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub={`thắng liền nhiều nhất ${all.bestStreak}`} className="hidden sm:block" />
        </div>
        {(() => { // Chuỗi thua đang diễn ra + luật v9 (giảm rủi ro) đã đỡ được bao nhiêu
          const done = P.trades.filter((t) => t.status === "done").sort((a, b) => a.exitAt - b.exitAt);
          let run = 0; for (let i = done.length - 1; i >= 0 && done[i].pnl < 0; i--) run++;
          const red = done.filter((t) => t.reducedRisk && t.pnl < 0), lost = red.reduce((x, t) => x - t.pnl, 0), full = cfg.streakRiskPct > 0 ? (lost * cfg.riskPct) / cfg.streakRiskPct : lost;
          if (!(cfg.streakN > 0) || (run < cfg.streakN && !red.length)) return null;
          return (
            <div className={`border-t px-3 py-2 text-[12px] leading-snug ${run >= cfg.streakN ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-100 bg-white text-slate-600"}`}>
              {run >= cfg.streakN ? <><b>Đang thua {run} lệnh liền</b> (từ {dt(done[done.length - run].exitAt)}) → lệnh tiếp theo rủi ro <b>{fmtNum(cfg.streakRiskPct, 2, 0)}%</b> thay vì {fmtNum(cfg.riskPct, 2, 0)}%, thắng 1 lệnh thì trở lại {fmtNum(cfg.riskPct, 2, 0)}%. </> : null}
              Luật giảm rủi ro sau {cfg.streakN} lệnh thua đã áp cho <b>{red.length}</b> lệnh thua: mất {usd(lost)} thay vì khoảng {usd(full)} (đỡ {usd(full - lost)}).
            </div>
          );
        })()}

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {[["chart", "Biểu đồ & lệnh", "Biểu đồ"], ["history", `Lịch sử lệnh (${P.trades.filter((t) => t.status !== "skip").length})`, `Lịch sử (${P.trades.filter((t) => t.status !== "skip").length})`], ["stats", "Thống kê", "Thống kê"], ["opt", "Tối ưu & bài học", "Tối ưu"]].map(([k, l, m]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-[12.5px] font-bold sm:px-3 ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><span className="sm:hidden">{m}</span><span className="hidden sm:inline">{l}</span></button>)}
        </div>

        {tab === "chart" && (<>
        <BotSignalBoard cfg={cfg} trades={P.trades} pending={res.pending || []} live={live} ver={ver} active={active} stopped={!!session.stoppedAt} sel={sel}
          onPick={(c, t) => { setSel({ coin: c, tf: t }); setFocus(null); setTimeout(() => document.getElementById("bot-chart")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
        <SignalFunnel res={res} P={P} />
        {(() => { // Vì sao chưa có lệnh: 48 giờ không có lệnh mới → tổng hợp tín hiệu bị bỏ 7 ngày qua theo lý do
          const lastEntry = Math.max(0, ...P.trades.filter((t) => t.status !== "skip").map((t) => t.entryAt));
          if (Date.now() - lastEntry < 48 * 3600000 || !res.skipLog?.length) return null;
          const wk = res.skipLog.filter((x) => Date.now() - x.t < 7 * 86400000), by = {};
          const LES = "bị bài học từ lệnh thua chặn (tự bảo vệ sau chuỗi thua)";
          for (const x of wk) { const k = /^bài học/.test(x.why) ? LES : x.why; by[k] = (by[k] || 0) + 1; }
          // 27/10: tín hiệu bị bài học chặn vẫn được theo dõi "bóng" → cho sếp thấy nếu vào thì ra sao (chặn đúng hay chặn oan)
          const blk = (res.rejected || []).filter((t) => Date.now() - t.signalAt < 7 * 86400000 && /^bài học/.test(t.why || "") && t.r != null);
          const blkR = blk.reduce((a, t) => a + t.r, 0), blkLoss = blk.filter((t) => t.r < 0).length;
          const near = wk.filter((x) => x.why !== "ngược xu hướng khung lớn").slice(0, 5);
          return (
            <Card className="!p-3">
              <Title icon={Info}>Vì sao chưa có lệnh?</Title>
              <div className="text-[12.5px] text-slate-600">Lệnh gần nhất: <b>{lastEntry ? dt(lastEntry) : "chưa có"}</b>. 7 ngày qua có <b>{res.skipLog.length >= 400 && wk.length === res.skipLog.length ? `hơn ${wk.length}` : wk.length}</b> tín hiệu thô nhưng đều bị luật lọc bỏ — bình thường khi thị trường không có điểm vào đẹp (bot chỉ vào khi đủ mọi điều kiện).</div>
              {blk.length > 0 && <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${blkR < 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><b>{blk.length}</b> tín hiệu đạt đủ luật nhưng bị <b>bài học từ lệnh thua</b> chặn. Nếu đã vào: {blkLoss} lệnh thua, {blk.length - blkLoss} lệnh thắng, tổng <b>{rr(blkR)}</b> → {blkR < 0 ? "chặn ĐÚNG, đã tránh được lỗ." : "chặn hơi oan — bài học sẽ tự gỡ khi các tín hiệu bị chặn thắng trở lại."} Không phải bot hỏng: kiểm thử 3 kỳ, tắt bài học thì lãi giảm (TB 279$ → 177$/kỳ) và sụt vốn tăng (24% → 31%).</div>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] text-slate-600">{k}: <b>{v}</b></span>)}</div>
              {near.length > 0 && <div className="mt-2 space-y-0.5">{near.map((x, i) => <div key={i} className="text-[11.5px] text-slate-500"><span className="tabular-nums text-slate-400">{dt(x.t)}</span> {side(x.side)} <b>{x.coin} {TFS[x.tf].label}</b> {setupName(x.setup)} — bỏ vì {x.why}</div>)}</div>}
            </Card>
          );
        })()}
        <div id="bot-chart" className="scroll-mt-20" />
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
            {cfg.coins.flatMap((c) => cfg.tfs.map((t) => [c, t])).map(([c, t]) => { const on = sel.coin === c && sel.tf === t, n = P.trades.filter((x) => x.coin === c && x.tf === t && x.status !== "skip").length, op = P.trades.some((x) => x.coin === c && x.tf === t && x.status === "open"); return (
              <button key={c + t} onClick={() => { setSel({ coin: c, tf: t }); setFocus(null); }} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{c} {TFS[t].label} <span className={on ? "text-white/60" : "text-slate-400"}>{n}</span>{op && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />}</button>
            ); })}
            <span className="ml-auto text-[11px] text-slate-400">▲▼ vào lệnh · ● thoát (xanh lãi, đỏ lỗ)</span>
          </div>
          <BotChart coin={sel.coin} tf={sel.tf} startAt={session.startAt} rawAt={res.at} trades={chartTrades} pending={chartPending} live={live} ver={ver} focus={focus && focus.coin === sel.coin && focus.tf === sel.tf ? focus : null} trail={raw?.sw3Levels} />
          {focus && <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 bg-indigo-50/50 px-3 py-2 text-[12px]">{side(focus.side)}<b>{focus.coin} {TFS[focus.tf].label}</b><span className="text-slate-500">{setupName(focus.setup)}</span><span className="tabular-nums">vào {px(focus.entry)} · cắt lỗ {px(focus.sl)} · {tpLbl(focus)} {px(focus.tp)}</span><span className={`font-extrabold ${tone(focus.r ?? focus.uR)}`}>{focus.exitAt ? `${viReason(focus.reason)} ${rr(focus.r)}` : `đang mở ${rr(focus.uR)}`}</span><button onClick={() => setFocus(null)} className="ml-auto text-[11px] font-bold text-indigo-600">Bỏ chọn</button>{histScroll.current > 0 && <button onClick={backToHistory} className="rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-600 ring-1 ring-indigo-100">← Về lịch sử</button>}</div>}
          {focus && focus.setup === "SW3" && <div className="border-t border-slate-100 bg-indigo-50/30 px-3 py-2"><TradeWhy t={focus} lv={focus.exitAt ? null : raw?.sw3Levels?.[focus.coin]} wide /></div>}
        </Card>

        {open.length > 0 && (
          <Card className="!p-3">
            <Title right={active && status === "live" ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />giá realtime</span> : null}>Lệnh đang mở ({open.length})</Title>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{open.map((t) => <OpenCard key={t.id} t={t} lv={raw?.sw3Levels?.[t.coin]} />)}</div>
          </Card>
        )}

        {res.pending?.length > 0 && active && (
          <Card className="!p-3">
            <Title>Lệnh chờ đang đặt ({res.pending.length}) · khớp khi giá xuyên qua, hết hạn thì huỷ</Title>
            <div className="space-y-1">{res.pending.map((p) => { const cur = live.current[`px|${p.coin}`], d = cur ? ((cur - p.lim) / p.lim) * 100 * p.side : null; return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[12px]">
                {side(p.side)}<b>{p.coin} {TFS[p.tf].label}</b><span className="text-slate-500">{setupName(p.setup)}</span>
                <span className="tabular-nums">Chờ ở <b>{px(p.lim)}</b> · cắt lỗ {px(p.sl)}</span>
                {d != null && <span className="tabular-nums text-slate-500">giá {px(cur)} · còn cách {fmtNum(Math.max(0, d), 2, 2)}%</span>}
                <span className="ml-auto text-[11px] text-slate-400">huỷ lúc {dt(p.until)}</span>
              </div>
            ); })}</div>
          </Card>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="!p-3 xl:col-span-2">
            <Title right={<span className="text-[11px] text-slate-400">vốn đầu {usd(cfg.capital, 0)}</span>}>Đường vốn{active ? " · nhảy theo giá realtime" : ""}</Title>
            <div className="h-60">
              <ResponsiveContainer>
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => dt(t).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={30} allowDuplicatedCategory={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={50} />
                  <Tooltip formatter={(v) => usd(v)} labelFormatter={(t) => dt(t)} />
                  <ReferenceLine y={cfg.capital} stroke="#94a3b8" strokeDasharray="4 4" />
                  {cfg.adaptive && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {cfg.adaptive && <Line data={curveB} dataKey="eq" name="Luật gốc" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                  <Line data={cfg.adaptive ? curveA : curveB} dataKey="eq" name={cfg.adaptive ? "Tự tối ưu" : "Vốn"} stroke={cfg.adaptive ? "#8b5cf6" : pnl >= 0 ? "#10b981" : "#f43f5e"} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {P.days.length > 1 && (<>
              <div className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Lãi/lỗ theo ngày · {P.days.filter((d) => d.v > 0).length}/{P.days.length} ngày lãi</div>
              <div className="h-24">
                <ResponsiveContainer>
                  <BarChart data={P.days}>
                    <XAxis dataKey="d" tickFormatter={(d) => d.slice(8, 10) + "/" + d.slice(5, 7)} tick={{ fontSize: 9 }} minTickGap={20} />
                    <Tooltip formatter={(v) => usd(v)} />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Bar dataKey="v" name="Lãi/lỗ" isAnimationActive={false}>{P.days.map((d) => <Cell key={d.d} fill={d.v >= 0 ? "#10b981" : "#f43f5e"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>)}
          </Card>
          <Card className="!p-3">
            <Title icon={Activity}>Hoạt động gần đây</Title>
            <div className="space-y-1">{feed.length ? feed.map((e, i) => { const t = e.tr, fresh = Date.now() - e.t < 15 * 60000; return (
              <div key={i} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${fresh ? "bg-amber-50" : ""}`}>
                <span className="w-[74px] shrink-0 tabular-nums text-[11px] text-slate-400">{dt(e.t)}</span>
                {e.kind === "open" ? <span className="min-w-0 truncate">{side(t.side)} <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">@ {px(t.entry)}</span>{t.reducedRisk && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}</span>
                  : <span className="min-w-0 truncate"><span className="font-bold text-slate-600">Đóng</span> <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">{viReason(t.reason)}</span>{t.reducedRisk && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}</span>}
                {e.kind === "close" && <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span>}
              </div>
            ); }) : <div className="text-[12px] text-slate-400">Chưa có lệnh.</div>}</div>
          </Card>
        </div>
        </>)}

        {tab === "history" && (<>
        {open.length > 0 && (
          <Card className="!p-3">
            <Title right={active && status === "live" ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />giá realtime</span> : null}>Lệnh đang mở ({open.length})</Title>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{open.map((t) => <OpenCard key={t.id} t={t} lv={raw?.sw3Levels?.[t.coin]} />)}</div>
          </Card>
        )}

        <Card className="!p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Lịch sử lệnh</span>
            {[["all", "Tất cả"], ["win", "Thắng"], ["loss", "Thua"], ["open", "Đang mở"], ["skip", "Bị bỏ (danh mục)"], ...(cfg.adaptive && !isBase ? [["reject", "Bị loại"]] : [])].map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setShowN(40); }} className={`rounded-md px-2.5 py-1.5 text-[11.5px] font-bold ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
            <span className="ml-auto text-[11px] text-slate-400">{taken.length} lệnh · bấm 1 lệnh để xem trên biểu đồ</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <select value={hStream} onChange={(e) => { setHStream(e.target.value); setShowN(40); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-bold text-slate-600">
              <option value="all">Mọi cặp · mọi khung</option>
              {cfg.coins.map((c) => <option key={c} value={c}>{c} · mọi khung</option>)}
              {cfg.coins.flatMap((c) => cfg.tfs.map((t) => <option key={c + t} value={`${c}|${t}`}>{c} {TFS[t].label}</option>))}
            </select>
            <select value={hMonth} onChange={(e) => { setHMonth(e.target.value); setShowN(40); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-bold text-slate-600">
              <option value="all">Mọi tháng</option>
              {months.map((m) => <option key={m.k} value={m.k}>{monthLabel(m.k)}</option>)}
            </select>
            <button onClick={exportCsv} disabled={!taken.length} className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Xuất CSV</button>
          </div>
          {months.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">{months.map((m) => (
              <button key={m.k} onClick={() => { setHMonth(hMonth === m.k ? "all" : m.k); setShowN(40); }} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-left ${hMonth === m.k ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                <div className="text-[10.5px] font-bold text-slate-500">{monthLabel(m.k)}</div>
                <div className="text-[12px] tabular-nums"><b className={m.n >= MONTH_TARGET ? "text-emerald-700" : "text-slate-700"}>{m.n} lệnh</b>{m.done ? <span className="text-slate-400"> · thắng {fmtNum((m.win / m.done) * 100, 0, 0)}%</span> : null}</div>
                <div className={`text-[12px] font-extrabold tabular-nums ${tone(m.pnl)}`}>{m.done ? usd(m.pnl) : "—"}</div>
              </button>
            ))}</div>
          )}
          <div className="divide-y divide-slate-100">{taken.slice(0, showN).map((t) => { const R = t.r ?? t.uR, dim = t.status === "skip" || t.status === "reject"; return (
            <button key={t.id} onClick={() => showOnChart(t)} className={`block w-full px-1 py-2 text-left hover:bg-slate-50 ${t.liveExit ? "bg-amber-50/60" : ""} ${focus?.id === t.id ? "bg-indigo-50/70" : ""}`}>
              <div className="flex items-center gap-2 text-[12.5px]">
                {side(t.side)}<b>{t.coin}</b><span className="text-slate-400">{TFS[t.tf].label}</span><span className="truncate text-slate-500">{setupName(t.setup)}</span>
                {t.status === "open" && <span className="rounded bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-700">ĐANG MỞ</span>}
                {t.reducedRisk && t.status !== "skip" && t.status !== "reject" && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}
                <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${dim ? "text-slate-400" : tone(R)}`}>{rr(R)}</span>
                <span className={`w-[72px] shrink-0 text-right font-extrabold tabular-nums ${dim ? "text-slate-300" : tone(t.pnl)}`}>{dim ? "—" : usd(t.pnl)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] tabular-nums text-slate-500">
                <span>{dt(t.entryAt)} · vào {px(t.entry)}</span><span className="text-rose-500">Cắt lỗ {px(t.sl)}</span><span className="text-emerald-600">{tpLbl(t)} {px(t.tp)}</span>
                <span>{t.status === "skip" ? `bỏ: ${t.why}` : t.status === "reject" ? `loại: ${t.why} · nếu vào: ${viReason(t.reason)}` : t.exitAt ? `${viReason(t.reason)} @ ${px(t.exit)} · ${dt(t.exitAt)}${t.liveExit ? " (realtime)" : ""}` : `giá ${px(t.last)}`}</span>
              </div>
              {t.why3 && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">Tiêu chí lúc vào: {t.why3} · <span className="font-semibold text-indigo-500">bấm để xem vì sao vào / vì sao đóng</span></div>}
              {t.lesson && <div className="mt-0.5 text-[11px] leading-snug text-rose-700/80">Rút kinh nghiệm: {t.lesson}</div>}
            </button>
          ); })}</div>
          {!taken.length && <div className="py-6 text-center text-[12px] text-slate-400">Chưa có lệnh nào.</div>}
          {taken.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({taken.length - showN})</button>}
        </Card>
        </>)}

        {tab === "stats" && (<>
        <PairReview cfg={cfg} list={list} ptrades={P.trades} canEdit={isOwner && !session.stoppedAt} onRemoveCoin={removeCoin} onToggleStream={toggleStream} />
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:hidden">
          <Num label="Lệnh đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status === "skip").length} bị danh mục bỏ`} />
          <Num label={<Term k="avgR" />} v={rr(all.avgR)} sub="kỳ vọng, đã trừ phí" tone={tone(all.avgR)} />
          <Num label={<Term k="pf" />} v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : fmtNum(all.pf, 2, 2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub={`thắng liền nhiều nhất ${all.bestStreak}`} />
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Kỳ vọng / lệnh ($)" v={usd(expUsd)} sub="lãi/lỗ TB mỗi lệnh" tone={tone(expUsd)} />
          <Num label="Thắng TB / Thua TB" v={<>{rr(all.avgWin)} <span className="text-slate-300">/</span> <span className="text-rose-600">{rr(all.avgLoss)}</span></>} sub={`payoff ${f2(all.payoff)} · lớn nhất ${rr(all.maxWin)}`} />
          <Num label="SQN (chất lượng hệ)" v={f2(all.sqn)} sub="<1.6 kém · 2–3 tốt" tone={all.sqn >= 1.6 ? "text-emerald-600" : all.sqn != null ? "text-rose-600" : undefined} />
          <Num label="Phí đã trả" v={usd(P.fees)} sub={`TB ${f2(all.feeR)}R/lệnh · trong đó funding ${all.fundR == null ? "—" : `${all.fundR >= 0 ? "" : "nhận "}${fmtNum(Math.abs(all.fundR), 3, 3)}R`}`} />
          <Num label="Recovery factor" v={f2(recovery)} sub="lãi ròng ÷ sụt vốn, >2 tốt" tone={tone(recovery)} />
          <Num label="Giữ lệnh TB" v={all.holdH == null ? "—" : all.holdH >= 24 ? `${fmtNum(all.holdH / 24, 1, 1)} ngày` : `${fmtNum(all.holdH, 1, 1)} giờ`} sub={Object.entries(all.reasons).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} />
          <Num label="Long / Short" v={<><span className={tone(longS.avgR)}>{fmtNum(longS.winRate, 0, 0) ?? "—"}%</span> <span className="text-slate-300">/</span> <span className={tone(shortS.avgR)}>{fmtNum(shortS.winRate, 0, 0) ?? "—"}%</span></>} sub={`${longS.n} long ${rr(longS.avgR)} · ${shortS.n} short ${rr(shortS.avgR)}`} />
          <Num label="Lệnh thua từng lời" v={rr(all.mfeLoss)} sub={`TB trước khi quay đầu · lệnh thắng từng âm ${rr(all.maeWin == null ? null : -all.maeWin)}`} />
        </div>

        <Card className="!p-3">
          <Title icon={Info}>Nhận xét tự động · {isBase ? "luật gốc" : "bot tự tối ưu"}</Title>
          <div className="grid gap-x-6 gap-y-1.5 text-[12px] leading-snug text-slate-600 md:grid-cols-2">
            {all.n < 100 && <div>• Mới {all.n} lệnh đã đóng — cần ≥ 100 lệnh để tỉ lệ thắng đáng tin.</div>}
            <div>• Hoà vốn ở R:R 2 cần thắng ≥ <b>33%</b>, R:R 3 cần ≥ <b>25%</b>; hiện {fmtNum(all.winRate, 0, 0) ?? "—"}% với payoff {f2(all.payoff)}.</div>
            <div>• Phí + trượt giá ăn TB <b>{f2(all.feeR)}R</b>/lệnh{all.feeR > 0.2 ? " — lớn (SL sát), nên tăng SL tối thiểu theo ATR hoặc ưu tiên khung M15." : "."}</div>
            {all.mfeLoss != null && <div>• Lệnh thua từng lời TB <b>{rr(all.mfeLoss)}</b> trước khi quay đầu{all.mfeLoss >= 0.8 ? " — nhiều lệnh đã gần đúng hướng, chốt sớm/dời hoà vốn sớm có thể cứu." : " — phần lớn sai hướng ngay từ đầu, cần lọc điểm vào chặt hơn."}</div>}
            {(() => { const segs = [...by("tf", cfg.tfs, (x) => TFS[x].label), ...by("setup", cfg.setups, setupName), ...by("coin", cfg.coins)].filter(([, s]) => s.n >= 10).sort((a, b) => b[1].avgR - a[1].avgR); return segs.length ? <><div>• Tốt nhất: <b className="text-emerald-700">{segs[0][0]}</b> ({rr(segs[0][1].avgR)}/lệnh, {segs[0][1].n} lệnh)</div><div>• Kém nhất: <b className="text-rose-700">{segs[segs.length - 1][0]}</b> ({rr(segs[segs.length - 1][1].avgR)}/lệnh)</div></> : null; })()}
            {Object.keys(res.skipped).length > 0 && <div className="text-slate-400">• Luật bỏ qua: {Object.entries(res.skipped).map(([k, v]) => `${v} tín hiệu ${k.toLowerCase()}`).join(", ")}.</div>}
          </div>
        </Card>

        <Card className="!p-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTable title="Theo setup" rows={by("setup", cfg.setups, setupName)} />
            <StatTable title="Theo cặp" rows={by("coin", cfg.coins)} />
            <StatTable title="Theo khung giờ" rows={by("tf", cfg.tfs, (x) => TFS[x].label)} />
            <StatTable title="Theo hướng" rows={[["Long", longS], ["Short", shortS]]} />
          </div>
        </Card>

        <Card className="!p-3">
          <Title icon={Activity}>So sánh khung giờ — khung nào hiệu quả nhất</Title>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400">
                <th className="py-1.5 pr-2">Khung</th><th className="py-1.5 pr-2 text-right">Lệnh (gốc)</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right"><Term k="avgR" align="right">R TB</Term></th><th className="py-1.5 pr-2 text-right"><Term k="pf" align="right">Hệ số lãi</Term></th><th className="py-1.5 pr-2 text-right">Phí TB</th><th className="py-1.5 pr-2 text-right">Lãi/lỗ gốc</th>{cfg.adaptive && <><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5">Bot hiện tại</th></>}
              </tr></thead>
              <tbody>{(() => {
                const rows = cfg.tfs.map((tf) => ({ tf, b: statsOf(res.baseTrades.filter((t) => t.tf === tf)), a: statsOf(res.trades.filter((t) => t.tf === tf)), usdB: res.basePortfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), usdA: res.portfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), st: res.tfState?.find((x) => x.tf === tf) }));
                const best = rows.filter((r) => r.b.n >= 10).sort((x, y) => y.b.avgR - x.b.avgR)[0]?.tf;
                return rows.map(({ tf, b, a, usdB, usdA, st }) => (
                  <tr key={tf} className={`border-b border-slate-50 ${tf === best ? "bg-emerald-50/60" : ""}`}>
                    <td className="py-1.5 pr-2 font-extrabold text-slate-800">{TFS[tf].label}{tf === best ? " 🏆" : ""}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.n}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.winRate == null ? "—" : `${fmtNum(b.winRate, 0, 0)}%`}</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(b.avgR)}`}>{rr(b.avgR)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.pf === Infinity ? "∞" : f2(b.pf)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{f2(b.feeR)}R</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(usdB)}`}>{usd(usdB, 0)}</td>
                    {cfg.adaptive && <><td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${a.n ? tone(usdA) : "text-slate-400"}`}>{a.n ? <>{usd(usdA, 0)} <span className="font-normal text-slate-400">· {a.n} lệnh</span></> : "không vào"}</td>
                      <td className="py-1.5 text-[11px]">{st?.pause ? <span className="font-bold text-rose-600">Tạm nghỉ (khung đang {rr(st.exp)})</span> : st?.exp != null ? <span className="font-bold text-emerald-700">Đang đánh ({rr(st.exp)})</span> : <span className="text-slate-400">đang học</span>}</td></>}
                  </tr>
                ));
              })()}</tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-slate-400">Lãi/lỗ gốc = mọi tín hiệu của khung theo luật gốc trong danh mục. "Bot hiện tại" = kỳ vọng {cfg.lookback * 3} lệnh gần nhất của cả khung; âm thì bot tự nghỉ khung đó tới khi hồi lại.</div>
        </Card>

        {rawOld && (() => {
          const o = oldFin, so = statsOf(o.baseTrades), sb = statsOf(res.baseTrades), sa = statsOf(res.trades);
          const cols = [["Bot (luật mới + tối ưu)", sa, res.portfolio, "text-violet-700"], ["Luật mới (cố định)", sb, res.basePortfolio, "text-emerald-700"], ["Bản cũ (chưa lọc vào đẹp)", so, o.basePortfolio, "text-slate-500"]].filter((c, i) => i || cfg.adaptive);
          return (
            <Card className="!p-3">
              <Title icon={Activity}>Luật vào đẹp có hiệu quả không? (cùng phiên, cùng dữ liệu)</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" />{cols.map(([l, , , c]) => <th key={l} className={`py-1.5 pr-2 text-right ${c}`}>{l}</th>)}</tr></thead>
                  <tbody>{[
                    ["Lệnh đã đóng", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${fmtNum(s.winRate, 1, 1)}%`)], ["Lời/lỗ TB mỗi lệnh (R)", (s) => rr(s.avgR)], ["Hệ số lãi (lãi ÷ lỗ)", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))],
                    ["Vốn", (s, P) => usd(P.equity + P.unrealized, 0)], ["Sụt vốn lớn nhất", (s, P) => `${fmtNum(P.maxDD, 1, 1)}%`],
                  ].map(([l, f]) => <tr key={l} className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>{cols.map(([k, s, P, c]) => <td key={k} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${c}`}>{f(s, P)}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-400">Bản cũ = cùng tín hiệu, cùng lệnh chờ nhưng không kiểm tra đuổi giá / SL sát / Key Volume / volume nến tín hiệu / engulfing. {Object.entries(res.skipped).filter(([k]) => /đuổi|sát|không về|volume|engulf|D1/i.test(k)).map(([k, v]) => `${v} tín hiệu bị bỏ vì ${k}`).join(" · ")}</div>
            </Card>
          );
        })()}
        </>)}

        {tab === "opt" && (<>
        <RulesLog log={settings.paperBotLog} list={list} />
        {cfg.adaptive && cfg.learnLoss && (
          <Card className="!p-3">
            <Title icon={Brain}>Rút kinh nghiệm từ lệnh thua</Title>
            {(() => {
              const m = res.metaNow || {}, line = (x, name) => !x ? null : x.mb == null
                ? <div className="text-[12px] text-slate-500">• {name}: <b>đang thu thập</b> ({x.b || 0} tín hiệu bị chặn, cần ≥ {cfg.lessonMin} để kiểm chứng)</div>
                : <div className={`text-[12px] ${x.ok ? "text-emerald-700" : "text-amber-700"}`}>• {name}: <b>{x.ok ? "ĐANG ÁP DỤNG" : "CHỈ QUAN SÁT"}</b> — tín hiệu bị chặn TB <b>{rr(x.mb)}</b> so với tín hiệu được vào <b>{rr(x.mk)}</b> ({x.b} lệnh gần nhất){x.ok ? " → chặn đúng, giúp giảm lỗ." : " → chặn chưa đúng (lệnh bị chặn lại tốt hơn), nên chưa dùng để chặn."}</div>;
              return <div className="space-y-1 rounded-lg bg-slate-50 p-2.5">{line(m.lesson, "Bài học từ lệnh thua")}{line(m.opt, "Bộ tối ưu (tắt ô / nghỉ khung)")}
                <div className="text-[11px] text-slate-400">Mỗi lệnh thua, hệ thống xem đặc điểm của lệnh (ADX, biến động, khoảng cách EMA50, độ rộng SL, phiên, hướng, độ dốc EMA50, thân nến…). Đặc điểm nào {cfg.lessonN} lệnh gần nhất thua rõ (≤ −0,2R) thành bài học. Bài học chỉ được dùng để chặn khi chính nó chứng minh được là đúng.</div></div>;
            })()}
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Bài học hiện có ({res.lessonsActive.length})</div>
                {res.lessonsActive.length ? <div className="space-y-0.5">{res.lessonsActive.map((l) => <div key={l.k} className="flex items-center gap-2 text-[12px]"><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{l.label}</span><span className="shrink-0 tabular-nums text-slate-400">{l.n} lệnh · thắng {fmtNum(l.win, 0, 0)}%</span><span className={`shrink-0 font-bold tabular-nums ${tone(l.exp)}`}>{rr(l.exp)}</span></div>)}</div> : <div className="text-[12px] text-slate-400">Chưa có đặc điểm nào thua rõ rệt.</div>}
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký học ({res.lessons.length})</div>
                <div className="max-h-44 space-y-0.5 overflow-y-auto">{[...res.lessons].reverse().slice(0, 40).map((l, i) => (
                  <div key={i} className="text-[11.5px] leading-snug"><span className="tabular-nums text-slate-400">{dt(l.t)}</span> <b className={l.on ? "text-rose-700" : "text-emerald-700"}>{l.on ? "Học" : "Gỡ"}</b> {l.label} <span className="text-slate-400">({l.n} lệnh, {rr(l.exp)}){l.from ? ` · từ lệnh thua ${l.from}` : ""}</span></div>
                ))}</div>
              </div>
            </div>
          </Card>
        )}

        {cfg.adaptive && (
          <div className="grid gap-3 xl:grid-cols-3">
            <Card className="!p-3">
              <Title icon={Brain}>Tự tối ưu so với Luật gốc</Title>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5 pr-2 text-right">Luật gốc</th><th className="py-1.5 text-right">Bị loại*</th></tr></thead>
                <tbody>{[
                  ["Lệnh", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${fmtNum(s.winRate, 0, 0)}%`)], ["R TB", (s) => rr(s.avgR), true], ["Hệ số lãi", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))], ["Tổng R", (s) => fmtNum(s.totalR, 1, 1), true],
                ].map(([l, f, col]) => (
                  <tr key={l} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>
                    {[sAuto, sBase, sRej].map((s, i) => <td key={i} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${col ? tone(s.avgR) : i === 0 ? "text-violet-700" : "text-slate-700"}`}>{f(s)}</td>)}
                  </tr>
                ))}
                  <tr className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">Vốn / sụt vốn</td><td className="py-1.5 pr-2 text-right tabular-nums text-violet-700">{usd(res.portfolio.equity + res.portfolio.unrealized, 0)} / {fmtNum(res.portfolio.maxDD, 0, 0)}%</td><td className="py-1.5 pr-2 text-right tabular-nums">{usd(res.basePortfolio.equity + res.basePortfolio.unrealized, 0)} / {fmtNum(res.basePortfolio.maxDD, 0, 0)}%</td><td /></tr>
                </tbody>
              </table>
              <div className="mt-2 space-y-1 text-[11.5px] leading-snug text-slate-500">
                <div>* Bị loại = tín hiệu bộ tối ưu bỏ qua, tính <b>nếu vẫn vào</b> theo luật gốc.</div>
                {sRej.n >= 10 && sAuto.n >= 10 && <div className={`font-bold ${sRej.avgR < sAuto.avgR ? "text-emerald-700" : "text-rose-700"}`}>{sRej.avgR < sAuto.avgR ? `✓ Bộ tối ưu loại đúng: tín hiệu bị bỏ TB ${rr(sRej.avgR)} < lệnh được vào ${rr(sAuto.avgR)}.` : `✗ Bộ tối ưu đang loại nhầm: tín hiệu bị bỏ TB ${rr(sRej.avgR)} ≥ lệnh được vào ${rr(sAuto.avgR)} — đang bám nhiễu, cần thêm dữ liệu.`}</div>}
                <div>Học thêm {res.learned} tín hiệu trong {cfg.warmupDays} ngày trước ngày bắt đầu · hiện bật {optOn} ô, tắt {optOff} ô.</div>
              </div>
            </Card>
            <Card className="!p-3 xl:col-span-2">
              <Title icon={Brain} right={<button onClick={() => setOptAll((v) => !v)} className="text-[11px] font-bold text-indigo-600">{optAll ? "Thu gọn" : `Xem tất cả (${res.optState.length})`}</button>}>Bộ tối ưu đang quyết định</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2">Cặp · khung · setup</th><th className="py-1.5 pr-2">Trạng thái</th><th className="py-1.5 pr-2">Cấu hình chọn</th><th className="py-1.5 pr-2 text-right">Kỳ vọng</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">Mẫu</th><th className="py-1.5">Học từ</th></tr></thead>
                  <tbody>{(optAll ? res.optState : res.optState.slice(0, 10)).map((o) => (
                    <tr key={o.cell} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2"><b>{o.coin}</b> {TFS[o.tf].label} <span className="text-slate-500">{setupName(o.setup)}</span></td>
                      <td className="py-1.5 pr-2">{o.level < 0 ? <Badge tone="slate">Đang học</Badge> : o.take ? <Badge tone="emerald">Bật</Badge> : <Badge tone="rose">Tắt</Badge>}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{o.level < 0 ? "gốc" : o.variant}</td>
                      <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(o.exp)}`}>{o.exp == null ? "—" : rr(o.exp)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.win == null ? "—" : `${fmtNum(o.win, 0, 0)}%`}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.n}</td>
                      <td className="py-1.5 text-[11px] text-slate-400">{o.level < 0 ? `cần ≥ ${cfg.minSample} lệnh` : LEVELS[o.level]}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {res.optLog.length > 0 && (<>
                <div className="mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký tối ưu ({res.optLog.length} lần điều chỉnh)</div>
                <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{[...res.optLog].reverse().slice(0, 40).map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 text-[11.5px]">
                    <span className="tabular-nums text-slate-400">{dt(e.t)}</span>
                    <b>{e.coin} {TFS[e.tf].label} {setupName(e.setup)}</b>
                    {e.take ? <span className="font-bold text-emerald-700">{e.prevOn === false ? "Bật lại" : e.first ? "Bật" : "Đổi"} → {e.level < 0 ? "luật gốc (chưa đủ mẫu)" : e.variant}</span> : <span className="font-bold text-rose-700">Tắt</span>}
                    {e.exp != null && <span className="text-slate-400">kỳ vọng {rr(e.exp)} / {e.n} lệnh · {LEVELS[e.level]}</span>}
                  </div>
                ))}</div>
              </>)}
            </Card>
          </div>
        )}
        {!cfg.adaptive && <Card><div className="text-[12px] text-slate-500">Phiên này tắt tự tối ưu.</div></Card>}
        </>)}

        <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          <span>Lệnh ẢO trên dữ liệu thật Binance Futures — không phải tư vấn đầu tư. <InfoTip label="Cách bot demo tính">Không đặt lệnh thật, khoá Binance vẫn chỉ đọc. Luật: chỉ nến đã đóng mới ra tín hiệu, chỉ vào lệnh chờ ở giá đóng nến tín hiệu (khớp khi giá xuyên qua, hết hạn thì huỷ), không đuổi giá, SL ngoài vùng nhiễu, SL &amp; TP cùng chạm 1 nến tính THUA, bỏ lệnh SL &gt; 4 ATR hoặc SL quá sát. Phí: vào lệnh chờ 0,02%, chốt lời 0,02%, cắt lỗ 0,05% + trượt giá, và phí FUNDING thật của Binance (BTC/ETH mỗi 8h, XAU mỗi 4h) khi giữ lệnh qua mốc funding. Lệnh mở theo giá realtime: chạm SL/TP là đóng ngay. Bộ tự tối ưu chỉ học từ lệnh đã đóng trước thời điểm quyết định. Kết quả quá khứ không đảm bảo tương lai — chỉ để kiểm tra phương pháp, không phải tư vấn đầu tư.</InfoTip></span>
        </div>
      </>)}
    </div>
  );
}
