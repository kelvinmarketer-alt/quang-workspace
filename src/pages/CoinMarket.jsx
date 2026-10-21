import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { RefreshCw, Sparkles, Loader2, AlertTriangle, Search, Target, ShieldAlert, TrendingUp, TrendingDown, Minus, Settings as SettingsIcon, X, BookOpen, ChevronDown, Radar, Bot, Bell, History, Trash2, Plus } from "lucide-react";
import { Card } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { ask } from "../components/ConfirmDialog.jsx";
import { TF, MARKETS, fetchKlines, fetchTicker24, symbolExists, analyze, htfContext, compactCandles } from "../lib/ta.js";
import { aiMarketAnalysis } from "../lib/ai.js";
import { KNOWLEDGE, KNOWLEDGE_SOURCES } from "../lib/tradeKnowledge.js";
import { fmtPx, fmtNum, fmtPct } from "../lib/format.js";
import { runSessionAsync } from "../lib/botRunner.js";
import { finalize, cfgOf } from "../lib/paperBot.js";
import { gradeRecord, cachedGrade, gradeSummary } from "../lib/aiGrade.js";
import { isSubscribed } from "../lib/push.js";

const DEFAULT_WATCH = ["BTC", "ETH", "XAU", "BNB", "SOL", "XRP", "ADA", "LTC", "DOGE"];
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const precisionOf = (p) => (!p ? 2 : p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : Math.min(8, Math.ceil(-Math.log10(p)) + 3)); // chỉ cho thang giá biểu đồ
// Giá: kiểu chung fmtPx; coin giá rất nhỏ (< 0,01 — PEPE, SHIB…) cần thêm số lẻ để không thành "0,000005"
const px = (v) => (v != null && isFinite(v) && v !== 0 && Math.abs(v) < 0.01 ? fmtNum(v, precisionOf(Math.abs(v)), 0) : fmtPx(v));
const pct = (x, base) => (x && base ? ((x - base) / base) * 100 : null);
const sPct = (v) => (v == null || !isFinite(v) ? "" : `${v >= 0 ? "+" : ""}${fmtPct(v, 2)}`); // "+1,25%"
const sR = (v, d = 2) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, d, 1)}R`); // "+2,1R"
const pad = (n) => String(n).padStart(2, "0");
const dt = (t) => { const d = new Date(t); return isNaN(d) ? "—" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const otherMkt = (m) => (m === "futures" ? "spot" : "futures");
// Mã có trên Futures/Spot không — học dần khi tải nến / kiểm tra mã ("futures|XAU" → true/false)
const AVAIL = new Map();
// Giá gõ tay: "108123.4" · "108.123,4" · "0,25" → số
const parseNum = (s) => { let x = String(s ?? "").replace(/\s/g, ""); if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", "."); else x = x.replace(",", "."); const n = Number(x); return isFinite(n) ? n : NaN; };

// Lệnh bot demo (settings.paperBot) để vẽ lên biểu đồ: chạy lại phiên bằng worker (như tab Demo), giữ kết quả 5 phút ở bộ nhớ module
const BOT_TTL = 5 * 60000;
let BOT = { key: "", at: 0, trades: null, p: null };
const sessKeyOf = (s) => (s ? `${s.createdAt}|${s.stoppedAt || ""}` : "");
function demoTrades(session) {
  const key = sessKeyOf(session);
  if (BOT.key === key && BOT.trades && Date.now() - BOT.at < BOT_TTL) return Promise.resolve(BOT.trades);
  if (BOT.key === key && BOT.p) return BOT.p;
  const p = runSessionAsync(session).then((raw) => {
    const res = finalize(raw, null), P = cfgOf(session).adaptive ? res.portfolio : res.basePortfolio;
    const trades = P.trades.filter((t) => t.status !== "skip").map((t) => ({ id: t.id, coin: t.coin, tf: t.tf, side: t.side, entryAt: t.entryAt, exitAt: t.exitAt, entry: t.entry, sl: t.curSl ?? t.sl, tp: t.tp, r: t.r, uR: t.uR, open: t.status === "open" }));
    if (BOT.p === p) BOT = { key, at: Date.now(), trades, p: null };
    return trades;
  }, (e) => { if (BOT.p === p) BOT = { ...BOT, p: null }; throw e; });
  BOT = { key, at: BOT.key === key ? BOT.at : 0, trades: BOT.key === key ? BOT.trades : null, p };
  return p;
}

// Biểu đồ nến (TradingView lightweight-charts): nến + EMA20/50 + khối lượng + mốc BOS/CHoCH + lệnh bot demo + đường Entry/SL/TP
// Trục thời gian theo giờ VN (UTC+7, giống tab Demo). marks: mốc thêm (lệnh bot) theo giây UTC như nến.
const VN = 7 * 3600;
function CandleChart({ candles, e20, e50, events, marks, lines, precision, fitKey }) {
  const box = useRef(null), api = useRef(null), fitted = useRef("");
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: "solid", color: "transparent" }, textColor: "#64748b", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.12)" }, horzLines: { color: "rgba(148,163,184,0.12)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, rightOffset: 8 },
      crosshair: { mode: 0 },
      // Điện thoại: vuốt dọc = cuộn trang (không bị biểu đồ "nuốt"), vuốt ngang = kéo nến, 2 ngón = phóng to
      handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: "#10b981", downColor: "#f43f5e", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#f43f5e" });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = (color) => chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    api.current = { chart, candle, vol, l20: line("#f59e0b"), l50: line("#6366f1"), markers: createSeriesMarkers(candle, []), lines: [] };
    return () => { chart.remove(); api.current = null; };
  }, []);

  useEffect(() => {
    const a = api.current; if (!a || !candles.length) return;
    const T = (t) => t + VN, first = candles[0].time, last = candles[candles.length - 1].time;
    a.candle.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    a.candle.setData(candles.map(({ time, open, high, low, close }) => ({ time: T(time), open, high, low, close })));
    a.vol.setData(candles.map((c) => ({ time: T(c.time), value: c.volume, color: c.close >= c.open ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)" })));
    a.l20.setData(e20.map((p) => ({ time: T(p.time), value: p.value }))); a.l50.setData(e50.map((p) => ({ time: T(p.time), value: p.value })));
    const m = [
      ...events.map((ev) => ({ time: ev.time, position: ev.dir === "up" ? "belowBar" : "aboveBar", color: ev.dir === "up" ? "#10b981" : "#f43f5e", shape: ev.dir === "up" ? "arrowUp" : "arrowDown", text: ev.kind })),
      ...(marks || []),
    ].filter((x) => x.time >= first && x.time <= last).map((x) => ({ ...x, time: T(x.time) })).sort((x, y) => x.time - y.time);
    a.markers.setMarkers(m);
    if (fitted.current !== fitKey) { // đổi coin/khung → zoom ~120 nến gần nhất
      fitted.current = fitKey;
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 6 });
    }
  }, [candles, e20, e50, events, marks, precision, fitKey]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    a.lines.forEach((pl) => a.candle.removePriceLine(pl));
    a.lines = lines.map((ln) => a.candle.createPriceLine({ price: ln.price, color: ln.color, lineWidth: ln.width || 1, lineStyle: ln.style ?? 2, axisLabelVisible: true, title: ln.title }));
  }, [lines]);

  return <div ref={box} className="h-[300px] w-full sm:h-[420px]" />;
}

const TONE = { slate: "text-slate-700", emerald: "text-emerald-600", rose: "text-rose-600", amber: "text-amber-600", indigo: "text-indigo-600" };

// 1 dòng chỉ báo gọn: nhãn trái · giá trị phải (+ chú thích nhỏ)
function Row({ label, value, tone = "slate", sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 text-right">
        <span className={`text-[13px] font-extrabold ${TONE[tone]}`}>{value}</span>
        {sub && <span className="block truncate text-[10.5px] text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
function Group({ title, children }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

// Phiếu lệnh: 4 ô số chính + điều kiện kích hoạt + checklist rút gọn; chi tiết bấm mở
function TradeTicket({ s, compact }) {
  const [more, setMore] = useState(false);
  const long = s.direction === "long";
  const okN = (s.checklist || []).filter((c) => c.ok).length, allN = (s.checklist || []).length;
  const Cell = ({ label, v, sub, tone }) => (
    <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-[14px] font-extrabold ${tone}`}>{px(v)}</div>
      {sub && <div className="text-[10.5px] font-semibold text-slate-400">{sub}</div>}
    </div>
  );
  return (
    <div className={`rounded-xl p-2.5 ${long ? "bg-emerald-50/70" : "bg-rose-50/70"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white ${long ? "bg-emerald-500" : "bg-rose-500"}`}>{long ? "LONG" : "SHORT"}</span>
        {s.setup_type && <span className="text-[11px] font-extrabold text-slate-600">{s.setup_type}</span>}
        {s.label && !compact && <span className="text-[11px] text-slate-400">· kịch bản {s.label}</span>}
        {allN > 0 && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${okN === allN ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{okN}/{allN} điều kiện</span>}
      </div>
      {(!s.valid || s.tooFar) && (
        <div className="mb-2 flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800"><AlertTriangle size={12} className="shrink-0" />
          {!s.valid ? "SL/TP sai phía — đừng dùng kịch bản này." : `SL cách entry ${fmtNum(s.slAtr, 1)} ATR (> 4) — theo EA nên huỷ.`}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Cell label="Vào lệnh" v={s.entry} sub={s.entry_zone ? `vùng ${px(s.entry_zone[0])}–${px(s.entry_zone[1])}` : null} tone="text-indigo-600" />
        <Cell label="Cắt lỗ" v={s.stop_loss} sub={`${sPct(pct(s.stop_loss, s.entry))}${s.slAtr ? ` · ${fmtNum(s.slAtr, 1)} ATR` : ""}`} tone="text-rose-600" />
        {s.take_profit.slice(0, 2).map((t, i) => <Cell key={i} label={`Chốt lời ${i + 1}`} v={t} sub={`${sPct(pct(t, s.entry))}${s.rr[i] ? ` · R:R 1:${fmtNum(s.rr[i], 1)}` : ""}`} tone="text-emerald-600" />)}
      </div>
      {s.trigger && <div className="mt-2 text-[12px] leading-snug text-slate-700"><span className="font-extrabold text-indigo-600">Kích hoạt khi: </span>{s.trigger}</div>}
      <button onClick={() => setMore((v) => !v)} className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-indigo-600">
        <ChevronDown size={13} className={`transition ${more ? "rotate-180" : ""}`} /> {more ? "Ẩn chi tiết" : "Checklist · lý do · quản lý lệnh"}
      </button>
      {more && (
        <div className="mt-1.5 space-y-1.5 text-[12px] leading-snug">
          {allN > 0 && <div className="flex flex-wrap gap-1">{s.checklist.map((c, i) => <span key={i} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{c.ok ? "✓" : "✗"} {c.item}</span>)}</div>}
          {s.reason && <div className="text-slate-600"><b className="text-slate-700">Lý do:</b> {s.reason}</div>}
          {s.invalidation && <div className="text-slate-600"><b className="text-slate-700">Huỷ khi:</b> {s.invalidation}</div>}
          {s.management && <div className="text-slate-600"><b className="text-slate-700">Quản lý lệnh:</b> {s.management}</div>}
        </div>
      )}
    </div>
  );
}

// Bộ kiến thức AI đang dùng (tổng hợp từ tài liệu EA + 86 slide VSA trên Drive)
function KnowledgePanel() {
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState(null);
  return (
    <div className="mt-3 rounded-xl border border-slate-100">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <BookOpen size={15} className="text-indigo-500" />
        <span className="flex-1 text-[13px] font-extrabold text-slate-700">Bộ kiến thức AI đang dùng · {KNOWLEDGE.reduce((n, k) => n + k.rules.length, 0)} quy tắc</span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-slate-100 p-3">
          <div className="text-[11px] text-slate-400">Nguồn: {KNOWLEDGE_SOURCES.join(" · ")}</div>
          {KNOWLEDGE.map((k) => (
            <div key={k.key} className="rounded-lg bg-slate-50">
              <button onClick={() => setSec(sec === k.key ? null : k.key)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] font-bold text-slate-700">
                {k.title} <span className="text-slate-400">{k.rules.length} {sec === k.key ? "▲" : "▼"}</span>
              </button>
              {sec === k.key && <ul className="space-y-1 px-3 pb-2 text-[12px] text-slate-600">{k.rules.map((r, i) => <li key={i} className="list-disc ml-3">{r}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lịch sử phân tích AI (settings.coinAnalyses — lưu cloud, mọi máy thấy) + tự chấm đúng/sai theo nến sau lúc phân tích.
// Chỉ chấm khi khung này hiện trên màn hình (lười); kết quả giữ trong bộ nhớ (lib/aiGrade.js).
const OUTCOME = { tp: ["Chạm TP", "bg-emerald-50 text-emerald-700"], sl: ["Chạm SL", "bg-rose-50 text-rose-700"], open: ["Chưa chạm", "bg-slate-100 text-slate-600"], none: ["Không có kèo", "bg-slate-50 text-slate-400"], error: ["Lỗi tải nến", "bg-amber-50 text-amber-700"] };
function AiHistory({ recs, active, sym, onOpen, className = "" }) {
  const box = useRef(null);
  const [seen, setSeen] = useState(false);
  const [grades, setGrades] = useState(() => Object.fromEntries(recs.map((r) => [r.id, cachedGrade(r)]).filter(([, g]) => g)));
  const [only, setOnly] = useState(false);
  const [showN, setShowN] = useState(8);
  useEffect(() => {
    if (seen) return undefined;
    if (typeof IntersectionObserver === "undefined" || !box.current) { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [seen]);
  const sig = recs.map((r) => r.id).join("|");
  useEffect(() => {
    if (!seen || !active || !recs.length) return undefined;
    let off = false;
    const run = () => {
      const queue = [...recs];
      const worker = async () => {
        while (queue.length && !off) {
          const r = queue.shift();
          try { const g = await gradeRecord(r); if (!off) setGrades((o) => (o[r.id] === g ? o : { ...o, [r.id]: g })); }
          catch { if (!off) setGrades((o) => (o[r.id] ? o : { ...o, [r.id]: { outcome: "error" } })); }
        }
      };
      Promise.all([worker(), worker(), worker()]); // 3 yêu cầu song song — nhẹ cho giới hạn Binance
    };
    run();
    const t = setInterval(() => { if (!document.hidden) run(); }, 5 * 60000); // lệnh chưa chạm → chấm lại
    return () => { off = true; clearInterval(t); };
  }, [seen, active, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = only ? recs.filter((r) => r.symbol === `${sym}USDT`) : recs;
  const sum = gradeSummary(list, grades);
  return (
    <Card className={`!p-3 ${className}`}>
      <div ref={box} className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><History size={13} className="text-indigo-500" /> Lịch sử phân tích AI ({list.length})</div>
        <div className="ml-auto flex rounded-md bg-slate-100 p-0.5 text-[10.5px] font-bold">
          {[[false, "Tất cả"], [true, sym]].map(([k, l]) => <button key={String(k)} onClick={() => { setOnly(k); setShowN(8); }} className={`rounded px-1.5 py-0.5 ${only === k ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>)}
        </div>
      </div>
      {list.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Đúng {sum.ok}</span>
          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-700">Sai {sum.bad}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">Chưa rõ {sum.unk}</span>
          {sum.winRate != null && <span className="text-slate-600">Tỉ lệ đúng <b className={sum.winRate >= 50 ? "text-emerald-600" : "text-rose-600"}>{fmtPct(sum.winRate, 0)}</b></span>}
          {sum.avgR != null && <span className="text-slate-600">R TB <b className={sum.avgR >= 0 ? "text-emerald-600" : "text-rose-600"}>{sR(sum.avgR)}</b></span>}
          {sum.none > 0 && <span className="font-semibold text-slate-400">· {sum.none} lần không có kèo</span>}
        </div>
      )}
      {!list.length ? (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">Chưa có lần phân tích nào được lưu{only ? ` cho ${sym}` : ""}. Mỗi lần bấm <b>Phân tích</b>, kết quả gọn (hướng, vào/SL/TP) được lưu lên cloud để chấm đúng/sai.</div>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {list.slice(0, showN).map((r) => {
            const g = grades[r.id], base = (r.symbol || "").replace(/USDT$/, "");
            const [lab, cls] = !r.side ? OUTCOME.none : g ? OUTCOME[g.outcome] || OUTCOME.open : ["Đang chấm…", "bg-slate-50 text-slate-400"];
            const rTxt = g && (g.outcome === "tp" || g.outcome === "sl") ? ` ${sR(g.r, 1)}` : g?.outcome === "open" && g.filled && g.r != null ? ` · tạm ${sR(g.r, 1)}` : "";
            return (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-1.5">
                  {r.side && <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white ${r.side === "LONG" ? "bg-emerald-500" : "bg-rose-500"}`}>{r.side}</span>}
                  <button onClick={() => onOpen(r)} className="min-w-0 truncate text-[12.5px] font-extrabold text-slate-800 hover:text-indigo-600">{base} {TF[r.tf]?.label || r.tf}</button>
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${cls}`}>{lab}{rTxt}{g?.expired ? " (hết 100 nến)" : ""}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                  <span className="text-slate-400">{MARKETS[r.market]?.label || "Spot"} · {dt(r.at)}</span>
                  {r.side && <span className="font-mono">Vào {px(r.entry)} · SL {px(r.sl)} · TP {px(r.tp)}</span>}
                  {r.side && g && g.outcome !== "none" && g.outcome !== "error" && !g.filled && <span className="font-semibold text-amber-600">chưa khớp entry</span>}
                </div>
                {r.summary && <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500">{r.summary}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > showN && <button onClick={() => setShowN((n) => n + 12)} className="mt-1 w-full rounded-lg bg-slate-50 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-100">Xem thêm {Math.min(12, list.length - showN)} lần</button>}
      <div className="mt-2 text-[10.5px] leading-snug text-slate-400">Tự chấm theo nến sau lúc phân tích (tối đa 100 nến cùng khung): chạm TP1 trước = đúng, chạm SL trước = sai, cùng 1 nến chạm cả hai → tính SL. R = (TP1 − vào) ÷ (vào − SL). Lưu 60 lần gần nhất trên cloud, mọi máy đều thấy.</div>
    </Card>
  );
}

// Cảnh báo giá (chỉ chủ): lưu ở Supabase qws_live_bot, dòng 'command' → data.priceAlerts. Máy chủ kiểm tra ~10 phút/lần và gửi thông báo đẩy.
// Ghi: LUÔN đọc lại dòng command mới nhất rồi ghi gộp {...data, priceAlerts} → không mất khoá/cấu hình/stop của bot thật.
function PriceAlerts({ active, pair, market, price }) {
  const [alerts, setAlerts] = useState(null);
  const [err, setErr] = useState(""), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false);
  const [op, setOp] = useState(">="), [opTouched, setOpTouched] = useState(false), [val, setVal] = useState(""), [note, setNote] = useState("");
  const [push, setPush] = useState(null);
  const prefilled = useRef("");
  const readCmd = async () => {
    const { data, error } = await supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle();
    if (error) { if (/qws_live_bot|relation|does not exist|schema cache/i.test(error.message)) setMissing(true); throw error; }
    setMissing(false);
    return data?.data || {};
  };
  const load = async () => { try { const d = await readCmd(); setAlerts(Array.isArray(d.priceAlerts) ? d.priceAlerts : []); setErr(""); } catch (e) { setErr(e.message || String(e)); } };
  useEffect(() => {
    if (!active) return undefined;
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120000); // xem cảnh báo nào máy chủ vừa báo
    return () => clearInterval(t);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // máy này đã bật thông báo đẩy chưa (serviceWorker.ready có thể treo nếu chưa đăng ký → chờ tối đa 3 giây)
    let off = false;
    Promise.race([isSubscribed(), new Promise((ok) => setTimeout(() => ok(null), 3000))]).then((v) => { if (!off) setPush(v); }, () => { if (!off) setPush(false); });
    return () => { off = true; };
  }, []);
  useEffect(() => { // đổi coin → điền sẵn giá hiện tại
    if (price && prefilled.current !== pair) { prefilled.current = pair; setVal(String(price)); setOp(">="); setOpTouched(false); }
  }, [pair, price]);
  const num = parseNum(val);
  useEffect(() => { if (!opTouched && num > 0 && price) setOp(num >= price ? ">=" : "<="); }, [num, price, opTouched]);
  const write = async (fn) => {
    setBusy(true); setErr("");
    try {
      const cur = await readCmd();
      const priceAlerts = fn(Array.isArray(cur.priceAlerts) ? cur.priceAlerts : []);
      const { error } = await supabase.from("qws_live_bot").upsert({ id: "command", data: { ...cur, priceAlerts }, updated_at: new Date().toISOString() });
      if (error) throw error;
      setAlerts(priceAlerts);
      return true;
    } catch (e) { setErr(e.message || String(e)); return false; }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!(num > 0)) { setErr("Nhập giá hợp lệ"); return; }
    const rec = { id: `pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, symbol: pair, market, op, price: num, note: note.trim().slice(0, 120), createdAt: Date.now(), firedAt: null };
    if (await write((list) => [...list, rec])) setNote("");
  };
  const del = async (a) => {
    if (await ask(`Xoá cảnh báo ${a.symbol} ${a.op === ">=" ? "≥" : "≤"} ${px(a.price)}?`, { ok: "Xoá", danger: true })) write((list) => list.filter((x) => x.id !== a.id));
  };
  const same = num > 0 && price && Math.abs(num - price) < 1e-9;
  const already = num > 0 && price && !same && (op === ">=" ? price >= num : price <= num);
  const sorted = (alerts || []).slice().sort((a, b) => (!a.firedAt === !b.firedAt ? (b.createdAt || 0) - (a.createdAt || 0) : a.firedAt ? 1 : -1));
  const nActive = sorted.filter((a) => !a.firedAt).length;
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><Bell size={13} className="text-amber-500" /> Cảnh báo giá{alerts ? ` · ${nActive} đang chờ` : ""}</div>
      {missing ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">Chưa có bảng <b>qws_live_bot</b> trên Supabase — xem hướng dẫn ở tab <b>Bot thật</b>.</div>
      ) : (<>
        <div className="mt-2 text-[11.5px] text-slate-500"><b className="text-slate-700">{pair}</b> · {MARKETS[market]?.label} · giá hiện tại <b className="text-slate-700">{px(price)}</b></div>
        <div className="mt-1.5 flex gap-1.5">
          <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
            {[">=", "<="].map((o) => <button key={o} onClick={() => { setOp(o); setOpTouched(true); }} className={`rounded-md px-2.5 py-1 text-[13px] font-extrabold ${op === o ? "bg-white shadow " + (o === ">=" ? "text-emerald-600" : "text-rose-600") : "text-slate-500"}`}>{o === ">=" ? "≥" : "≤"}</button>)}
          </div>
          <input value={val} onChange={(e) => { setVal(e.target.value); setErr(""); }} inputMode="decimal" placeholder="Giá" className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[13px] outline-none focus:border-indigo-300" />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Ghi chú (tuỳ chọn)" className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-indigo-300" />
          <button onClick={add} disabled={busy || !(num > 0)} className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Thêm</button>
        </div>
        {num > 0 && price ? <div className={`mt-1 text-[11px] ${already ? "font-semibold text-amber-600" : "text-slate-400"}`}>{same ? "Đang điền giá hiện tại — sửa thành mức giá muốn được báo." : already ? "Giá hiện tại đã thoả điều kiện — sẽ báo ở lần kiểm tra tới." : `Báo khi ${pair.replace(/USDT$/, "")} ${op === ">=" ? "lên ≥" : "xuống ≤"} ${px(num)} (cách ${sPct(pct(num, price))}).`}</div> : null}
        {err && <div className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-600">{err}</div>}
        {alerts == null ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải…</div>
        ) : sorted.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            {sorted.map((a) => (
              <li key={a.id} className={`flex items-center gap-2 py-1.5 ${a.firedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-extrabold text-slate-800">{(a.symbol || "").replace(/USDT$/, "")} <span className={a.op === ">=" ? "text-emerald-600" : "text-rose-600"}>{a.op === ">=" ? "≥" : "≤"}</span> <span className="font-mono">{px(a.price)}</span> <span className="text-[10.5px] font-semibold text-slate-400">{MARKETS[a.market]?.label}</span></div>
                  {a.note && <div className="truncate text-[11px] text-slate-500">{a.note}</div>}
                </div>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${a.firedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{a.firedAt ? `Đã báo ${dt(a.firedAt)}` : "Đang chờ"}</span>
                <button onClick={() => del(a)} disabled={busy} title="Xoá" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-[10.5px] leading-snug text-slate-400">
          Máy chủ kiểm tra khoảng <b>10 phút/lần</b> (khi job chạy) rồi gửi <b>thông báo đẩy</b> — cần bật ở Cài đặt → Thông báo đẩy.{" "}
          {push === true ? <span className="font-semibold text-emerald-600">Máy này đã bật ✓</span> : push === false ? <span className="font-semibold text-amber-600">Máy này chưa bật.</span> : null}
        </div>
      </>)}
    </Card>
  );
}

export default function CoinMarket({ active = true }) {
  const { settings = {}, coins = [], setSettings, isOwner } = useData();
  const activeRef = useRef(active); activeRef.current = active; // tab Thị trường đang ẩn → không poll nến
  const hasKey = settings.aiReady ?? !!(settings.openaiKey || "").trim();
  const [sym, setSym] = useState(() => ls.get("qws_mkt_sym", "BTC"));
  const [tf, setTf] = useState(() => { const v = ls.get("qws_mkt_tf", "4h"); return TF[v] ? v : "4h"; });
  const [mkt, setMkt] = useState(() => (ls.get("qws_mkt_market", "futures") === "spot" ? "spot" : "futures")); // nguồn ưu tiên; mã không có → tự sang sàn kia
  const [extraWatch, setExtraWatch] = useState(() => ls.get("qws_mkt_watch", []));
  const [q, setQ] = useState("");
  const [data, setData] = useState({ key: "", ltf: [], htf: [], market: "" });
  const [tick, setTick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [cache, setCache] = useState(() => ls.get("qws_mkt_ai", {}));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState("");
  const [qNote, setQNote] = useState("");
  const key = `${sym}-${tf}-${mkt}`, aiKey = `${sym}-${tf}`; // AI cache theo coin+khung (giá Futures ≈ Spot)
  const keyRef = useRef(key); keyRef.current = key; // chống kết quả coin cũ về muộn đè coin mới
  const settingsRef = useRef(settings); settingsRef.current = settings;

  const watch = useMemo(() => [...new Set([...DEFAULT_WATCH, ...coins.map((c) => (c.symbol || "").toUpperCase()), ...extraWatch].filter((s) => s && s !== "USDT"))], [coins, extraWatch]);

  // Tải nến + giá 24h: ưu tiên sàn đang chọn; mã không có trên sàn đó (400) → tự dùng sàn còn lại
  const load = async (silent) => {
    const k = key, base = sym, want = mkt;
    if (!silent) { setLoading(true); setErr(""); }
    try {
      const order = AVAIL.get(`${want}|${base}`) === false ? [otherMkt(want)] : [want, otherMkt(want)];
      let got = null;
      for (const m of order) {
        try {
          const [ltf, htf, t] = await Promise.all([
            fetchKlines(base, TF[tf].api, 300, { market: m }),
            fetchKlines(base, TF[tf].htf, 200, { market: m }).catch(() => []),
            fetchTicker24(base, m).catch(() => null),
          ]);
          AVAIL.set(`${m}|${base}`, true); got = { ltf, htf, t, market: m }; break;
        } catch (e) { if (!e.badSymbol) throw e; AVAIL.set(`${m}|${base}`, false); }
      }
      if (!got) throw new Error(`Không có cặp ${base}/USDT trên Binance Futures lẫn Spot`);
      if (keyRef.current !== k) return; // đã đổi coin/khung → bỏ kết quả cũ
      setData({ key: k, ltf: got.ltf, htf: got.htf, market: got.market });
      if (got.t) setTick({ sym: base, market: got.market, ...got.t });
      setErr("");
    } catch (e) { if (keyRef.current === k && !silent) { setErr(e.message || String(e)); setData({ key: k, ltf: [], htf: [], market: "" }); } }
    if (!silent && keyRef.current === k) setLoading(false);
  };
  useEffect(() => {
    ls.set("qws_mkt_sym", sym); ls.set("qws_mkt_tf", tf); ls.set("qws_mkt_market", mkt);
    load(false);
    const t = setInterval(() => { if (!document.hidden && activeRef.current) load(true); }, 60000); // cập nhật nến mỗi phút
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [sym, tf, mkt]);

  const ta = useMemo(() => (data.ltf.length > 30 ? analyze(data.ltf) : null), [data.ltf]);
  const s = ta?.summary;
  const stale = data.key !== key; // đang hiện nến/giá của coin/khung cũ → làm mờ + hiện đang tải
  const usedMkt = data.key === key && data.market ? data.market : AVAIL.get(`${mkt}|${sym}`) === false ? otherMkt(mkt) : mkt;
  const price = (tick?.sym === sym ? tick.price : null) || (data.key.startsWith(sym + "-") ? s?.price : null);
  const prec = precisionOf(price);
  const ai = cache[aiKey];

  // Lệnh bot demo trên biểu đồ (chỉ chủ): các cặp của bot × M5/M15 — tính lười, dùng chung kết quả 5 phút
  const session = isOwner ? settings.paperBot || null : null;
  const sessKey = sessKeyOf(session);
  const botEligible = !!session && cfgOf(session).coins.includes(sym) && (tf === "5m" || tf === "15m"); // cặp bot đang chạy (user tự thêm/sửa/xoá)
  const [botOn, setBotOn] = useState(() => ls.get("qws_mkt_bot", true) !== false);
  const [bot, setBot] = useState(() => ({ key: BOT.key, trades: BOT.trades, busy: false, err: "" }));
  const botShow = botEligible && botOn && !!session;
  useEffect(() => {
    if (!active || !botShow) return undefined;
    let off = false;
    const go = () => {
      setBot((b) => ({ ...b, busy: true, err: "" }));
      demoTrades(session).then((trades) => { if (!off) setBot({ key: sessKey, trades, busy: false, err: "" }); }, (e) => { if (!off) setBot((b) => ({ ...b, busy: false, err: e.message || String(e) })); });
    };
    go();
    const t = setInterval(() => { if (!document.hidden && activeRef.current) go(); }, BOT_TTL);
    return () => { off = true; clearInterval(t); };
  }, [active, botShow, sessKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const botList = useMemo(() => (botShow && bot.key === sessKey && bot.trades ? bot.trades.filter((t) => t.coin === sym && t.tf === tf) : []), [botShow, bot, sessKey, sym, tf]);
  const botMarks = useMemo(() => {
    const step = TF[tf].ms / 1000, m = [];
    for (const t of botList) {
      m.push({ time: Math.floor(t.entryAt / 1000), position: t.side === 1 ? "belowBar" : "aboveBar", color: t.side === 1 ? "#10b981" : "#f43f5e", shape: t.side === 1 ? "arrowUp" : "arrowDown", text: t.side === 1 ? "L" : "S" });
      if (t.exitAt && t.r != null) m.push({ time: Math.floor((t.exitAt - 1) / 1000 / step) * step, position: t.side === 1 ? "aboveBar" : "belowBar", color: t.r >= 0 ? "#059669" : "#e11d48", shape: "circle", text: sR(t.r, 1) });
    }
    return m;
  }, [botList, tf]);
  const botStat = useMemo(() => {
    const done = botList.filter((t) => !t.open && t.r != null), from = (data.ltf[0]?.time || 0) * 1000;
    return { n: botList.length, win: done.filter((t) => t.r > 0.05).length, loss: done.filter((t) => t.r < -0.05).length, open: botList.filter((t) => t.open).length, sumR: done.reduce((a, t) => a + t.r, 0), inView: botList.filter((t) => t.entryAt >= from).length };
  }, [botList, data.ltf]);
  const sessCfg = session ? cfgOf(session) : null, inSess = !!sessCfg && sessCfg.coins.includes(sym) && sessCfg.tfs.includes(tf);

  // Đường Entry/SL/TP của AI + lệnh bot demo đang mở vẽ lên biểu đồ
  const lines = useMemo(() => {
    const out = (ta?.series.levels || []).map((l) => ({ price: l.price, color: l.color, title: l.title, style: 1, width: 1 }));
    (ai?.setups || []).filter((x) => x.valid).forEach((x, i) => {
      const L = x.direction === "long" ? "L" : "S", style = i === 0 ? 0 : 2;
      out.push({ price: x.entry, color: "#6366f1", title: `${L} Entry`, style, width: 2 });
      out.push({ price: x.stop_loss, color: "#f43f5e", title: `${L} SL`, style });
      x.take_profit.forEach((tp, j) => out.push({ price: tp, color: "#10b981", title: `${L} TP${j + 1}`, style }));
    });
    for (const t of botList) if (t.open) {
      out.push({ price: t.entry, color: "#8b5cf6", title: `Bot ${t.side === 1 ? "LONG" : "SHORT"}`, style: 0, width: 2 });
      out.push({ price: t.sl, color: "#e11d48", title: "Bot SL", style: 2 }, { price: t.tp, color: "#059669", title: "Bot TP", style: 2 });
    }
    return out;
  }, [ai, ta, botList]);

  // Gõ mã mới → kiểm tra có cặp X/USDT trên sàn đang chọn (không có → thử sàn kia) rồi mới chuyển + thêm vào danh sách theo dõi
  const pickSym = async (v) => {
    const x = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
    if (!x || qBusy) return;
    setQErr(""); setQNote("");
    if (!watch.includes(x)) {
      setQBusy(true);
      let found = null;
      try {
        for (const m of [mkt, otherMkt(mkt)]) { const ok = await symbolExists(x, m); AVAIL.set(`${m}|${x}`, ok); if (ok) { found = m; break; } }
      } catch { setQBusy(false); setQErr("Không kiểm tra được mã (lỗi mạng) — thử lại"); return; }
      setQBusy(false);
      if (!found) { setQErr(`Không có cặp ${x}/USDT trên Binance Futures lẫn Spot`); return; }
      if (found !== mkt) setQNote(`${x} không có trên ${MARKETS[mkt].label} — đang xem ${MARKETS[found].label}`);
      const nw = [...extraWatch, x].slice(-12); setExtraWatch(nw); ls.set("qws_mkt_watch", nw);
    }
    setSym(x); setQ("");
  };
  const removeWatch = (x) => { const nw = extraWatch.filter((w) => w !== x); setExtraWatch(nw); ls.set("qws_mkt_watch", nw); };

  // Lưu bản gọn lên cloud (settings.coinAnalyses, 60 bản mới nhất) để mọi máy xem + tự chấm đúng/sai
  const saveAnalysis = (r) => {
    const pick = (r.setups || []).find((x) => x.valid) || null, at = r.at || Date.now();
    const head = String(r.headline || "").trim(), wait = !pick && r.wait_for ? `Chờ: ${r.wait_for}` : "";
    const rec = {
      id: `${at}-${sym}-${tf}`, symbol: `${sym}USDT`, market: usedMkt, tf, at,
      side: pick ? (pick.direction === "short" ? "SHORT" : "LONG") : null,
      entry: pick?.entry ?? null, sl: pick?.stop_loss ?? null, tp: pick?.take_profit?.[0] ?? null,
      summary: [head, wait].filter(Boolean).join(" · ").slice(0, 200),
    };
    const prev = Array.isArray(settingsRef.current?.coinAnalyses) ? settingsRef.current.coinAnalyses : [];
    setSettings({ coinAnalyses: [rec, ...prev.filter((x) => x.id !== rec.id)].sort((a, b) => b.at - a.at).slice(0, 60) });
  };
  const runAI = async () => {
    if (!s || stale) return; // chưa tải xong coin mới → không gửi dữ liệu coin cũ cho AI
    setAiBusy(true); setAiErr("");
    try {
      const r = await aiMarketAnalysis({ symbol: sym, tf: TF[tf].label, htf: TF[tf].htf, summary: s, htfSummary: htfContext(data.htf), candles: compactCandles(data.ltf, 40), apiKey: settings.openaiKey, model: "gpt-4o" });
      const next = { ...cache, [aiKey]: { ...r, priceAt: price, market: usedMkt } };
      const keys = Object.keys(next).sort((a, b) => (next[b].at || 0) - (next[a].at || 0)).slice(0, 12); // giữ 12 bản gần nhất trên máy này
      const trimmed = Object.fromEntries(keys.map((k) => [k, next[k]]));
      setCache(trimmed); ls.set("qws_mkt_ai", trimmed);
      saveAnalysis(r);
    } catch (e) { setAiErr(e.message || String(e)); }
    setAiBusy(false);
  };
  const analyses = useMemo(() => (Array.isArray(settings.coinAnalyses) ? settings.coinAnalyses : []).slice().sort((a, b) => b.at - a.at), [settings.coinAnalyses]);
  const openAnalysis = (r) => {
    const base = (r.symbol || "").replace(/USDT$/, "");
    if (!base) return;
    if (!watch.includes(base)) { const nw = [...extraWatch, base].slice(-12); setExtraWatch(nw); ls.set("qws_mkt_watch", nw); }
    setSym(base); if (TF[r.tf]) setTf(r.tf); if (MARKETS[r.market]) setMkt(r.market);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* bỏ qua */ }
  };

  const trendTone = s?.structure.trend === "tăng" ? "emerald" : s?.structure.trend === "giảm" ? "rose" : "slate";
  const rsiV = s?.momentum.rsi;
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

  // Tín hiệu tự phát hiện theo bộ kiến thức (nến đã đóng)
  const sig = s ? [
    ...s.vsa.flatMap((b) => b.tags.map((t) => ({ t: `VSA ${b.barsAgo}n: ${t}`, tone: /CLIMAX|UPTHRUST|NO DEMAND|SOW|STOPPING VOLUME khi tăng|PHÂN KỲ/.test(t) ? "rose" : "emerald" }))),
    ...s.sfp.map((x) => ({ t: `SFP ${x.dir} ${px(x.level)} · vol ${fmtNum(x.volRel, 1)}x · ${x.valid}`, tone: x.dir.startsWith("tăng") ? "emerald" : "rose" })),
    ...(s.sideway.fakeout ? [{ t: `Fakeout sideway: ${s.sideway.fakeout}`, tone: "amber" }] : []),
    ...s.volumeDivergence.map((t) => ({ t, tone: t.includes("ÂM") ? "rose" : "emerald" })),
    ...s.momentum.divergence.map((t) => ({ t, tone: t.includes("âm") ? "rose" : "emerald" })),
    ...s.patterns.map((x) => ({ t: `${x.name} · ${x.ago}n trước`, tone: /TĂNG|Bullish|dưới|tăng/.test(x.name) ? "emerald" : /GIẢM|Bearish|trên|giảm/.test(x.name) ? "rose" : "slate" })),
  ] : [];
  const main = ai?.setups?.[0], others = ai?.setups?.slice(1) || [];
  const DETAIL = ai ? [["Khung lớn", ai.htf_context], ["Wyckoff", ai.wyckoff_phase], ["Bộ lọc xu hướng", ai.trend_filter], ["SMC", ai.smc], ["Thanh khoản", ai.liquidity], ["Price action", ai.price_action], ["Khối lượng", ai.volume], ["VSA", ai.vsa], ["Động lượng", ai.momentum]].filter(([, v]) => v) : [];

  return (
    <div className="space-y-3">
      {/* Thanh chọn coin: tìm + danh sách theo dõi (1 dòng, cuộn ngang) */}
      <Card className="!p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex w-36 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 sm:w-52">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setQErr(""); setQNote(""); }} onKeyDown={(e) => { if (e.key === "Enter") pickSym(q); }} placeholder="Mã coin + Enter" className="w-full bg-transparent text-[13px] uppercase outline-none placeholder:normal-case" />
            {qBusy && <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />}
          </div>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {watch.map((w) => (
              <span key={w} className={`flex shrink-0 items-center rounded-lg text-[12px] font-bold ${w === sym ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-amber-100"}`}>
                <button onClick={() => setSym(w)} className="px-2.5 py-1">{w}</button>
                {extraWatch.includes(w) && w !== sym && <button onClick={() => removeWatch(w)} className="-ml-1 pr-1.5 text-slate-400 hover:text-rose-600"><X size={11} /></button>}
              </span>
            ))}
          </div>
        </div>
        {qErr && <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-rose-600"><AlertTriangle size={13} className="shrink-0" /> {qErr}</div>}
        {qNote && <div className="mt-1.5 text-[12px] font-semibold text-amber-600">{qNote}</div>}
      </Card>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Biểu đồ */}
        <Card className="!p-3 xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-extrabold text-slate-400">{sym}/USDT</span>
                <div className="flex rounded-md bg-slate-100 p-0.5" title="Nguồn giá Binance (bot giao dịch trên Futures)">
                  {Object.keys(MARKETS).map((m) => <button key={m} onClick={() => setMkt(m)} className={`rounded px-1.5 py-px text-[10.5px] font-extrabold ${mkt === m ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{MARKETS[m].label}</button>)}
                </div>
                {usedMkt !== mkt && <span className="text-[10.5px] font-semibold text-amber-600">chỉ có trên {MARKETS[usedMkt].label}</span>}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-extrabold tabular-nums text-slate-900 transition-opacity ${stale ? "opacity-30" : ""}`}>{px(price)}</span>
                {tick?.sym === sym && <span className={`text-[13px] font-bold ${tick.chg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{sPct(tick.chg)} <span className="font-semibold text-slate-400">24h</span></span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {Object.keys(TF).map((k) => (
                  <button key={k} onClick={() => setTf(k)} className={`rounded-md px-2 py-1 text-[12px] font-extrabold sm:px-2.5 ${tf === k ? "bg-white text-amber-600 shadow" : "text-slate-500"}`}>{TF[k].label}</button>
                ))}
              </div>
              <button onClick={() => load(false)} disabled={loading} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
            </div>
          </div>
          {err ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-6 text-sm font-semibold text-rose-600"><AlertTriangle size={16} /> {err}</div>
          ) : (
            <div className="relative mt-2">
              {stale && loading && <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl bg-white/70 text-[13px] font-bold text-slate-500 backdrop-blur-[1px]"><Loader2 size={16} className="animate-spin" /> Đang tải {sym} {TF[tf].label}…</div>}
              <CandleChart candles={data.ltf} e20={ta?.series.e20 || []} e50={ta?.series.e50 || []} events={ta?.series.events || []} marks={botMarks} lines={lines} precision={prec} fitKey={data.key} />
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-semibold text-slate-400">
                <span><span className="text-amber-500">━</span> EMA20</span><span><span className="text-indigo-500">━</span> EMA50</span><span>▲▼ BOS/CHoCH</span><span><span className="text-yellow-500">┅</span> Key Volume</span><span><span className="text-rose-400">┅</span>/<span className="text-emerald-400">┅</span> Protected</span><span><span className="text-slate-400">┅</span> POC</span>
                {lines.length > 0 && <span><span className="text-indigo-500">━</span> Entry <span className="text-rose-500">━</span> SL <span className="text-emerald-500">━</span> TP</span>}
                {botList.length > 0 && <span><span className="text-emerald-500">▲</span><span className="text-rose-500">▼</span> lệnh bot L/S · ● thoát ±R{botStat.open > 0 && <> · <span className="text-violet-500">━</span> Bot vào</>}</span>}
                <span>giờ VN</span>
              </div>
            </div>
          )}
          {/* Lệnh bot demo trên biểu đồ (các cặp của bot × M5/M15) */}
          {botEligible && isOwner && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-slate-100 pt-1.5 text-[11px]">
              {session ? (<>
                <label className="flex cursor-pointer items-center gap-1.5 font-bold text-slate-600">
                  <input type="checkbox" checked={botOn} onChange={(e) => { setBotOn(e.target.checked); ls.set("qws_mkt_bot", e.target.checked); }} />
                  <Bot size={13} className="text-emerald-500" /> Hiện lệnh bot demo
                </label>
                {botOn && (!inSess ? <span className="text-slate-400">Phiên demo không chạy {sym} {TF[tf].label}.</span>
                  : bot.err && !botList.length ? <span className="font-semibold text-rose-600">Không tính được lệnh demo: {bot.err}</span>
                  : bot.busy && bot.key !== sessKey ? <span className="flex items-center gap-1 text-slate-400"><Loader2 size={11} className="animate-spin" /> Đang tính lệnh demo…</span>
                  : <span className="text-slate-500">
                      {botStat.n} lệnh {sym} {TF[tf].label}: <b className="text-emerald-600">{botStat.win} thắng</b> · <b className="text-rose-600">{botStat.loss} thua</b>{botStat.open ? <> · <b className="text-violet-600">{botStat.open} đang mở</b></> : null} · tổng <b className={botStat.sumR >= 0 ? "text-emerald-600" : "text-rose-600"}>{sR(botStat.sumR, 1)}</b>
                      {botStat.n > botStat.inView && <span className="text-slate-400"> · {botStat.inView} lệnh trong 300 nến đang hiện</span>}
                      {bot.busy && <Loader2 size={11} className="ml-1 inline animate-spin text-slate-400" />}
                    </span>)}
              </>) : (
                <span className="flex items-center gap-1 text-slate-400"><Bot size={13} className="shrink-0" /> Chưa có phiên bot demo — bật ở tab <b className="text-slate-500">Demo tự động</b> để thấy lệnh demo trên biểu đồ này.</span>
              )}
            </div>
          )}
        </Card>

        {/* Cột phải: AI kết luận + phiếu lệnh */}
        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[14px] font-extrabold text-slate-800"><Sparkles size={15} className="text-indigo-500" /> AI · {sym} {TF[tf].label}</div>
            <button onClick={runAI} disabled={aiBusy || !hasKey || !s || stale} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-1.5 text-[12px] font-bold text-white shadow disabled:opacity-40">
              {aiBusy ? <><Loader2 size={13} className="animate-spin" /> Đang phân tích…</> : <><Sparkles size={13} /> {ai ? "Phân tích lại" : "Phân tích"}</>}
            </button>
          </div>
          {!hasKey && <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] font-semibold text-amber-700"><SettingsIcon size={13} /> Chưa có API key OpenAI — vào Cài đặt.</div>}
          {aiErr && <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[12px] font-semibold text-rose-600">{aiErr}</div>}
          {!ai ? (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-6 text-center text-[12px] text-slate-500">Bấm <b>Phân tích</b> để AI đọc khối lượng, động lượng, SMC, price action theo bộ kiến thức của bạn và đưa ra điểm vào / cắt lỗ / chốt lời.</div>
          ) : (
            <div className="mt-2.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-extrabold text-white ${ai.bias === "tăng" ? "bg-emerald-500" : ai.bias === "giảm" ? "bg-rose-500" : "bg-slate-500"}`}>
                  {ai.bias === "tăng" ? <TrendingUp size={13} /> : ai.bias === "giảm" ? <TrendingDown size={13} /> : <Minus size={13} />} {ai.bias === "tăng" ? "Thiên tăng" : ai.bias === "giảm" ? "Thiên giảm" : "Đi ngang"}
                </span>
                <div className="flex flex-1 items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${ai.confidence >= 65 ? "bg-emerald-500" : ai.confidence >= 45 ? "bg-amber-500" : "bg-rose-400"}`} style={{ width: `${ai.confidence}%` }} /></div>
                  tin cậy {ai.confidence}%
                </div>
              </div>
              {ai.headline && <div className="text-[13px] font-bold leading-snug text-slate-800">{ai.headline}</div>}
              {main ? <TradeTicket s={main} /> : (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600"><Target size={14} className="mt-0.5 shrink-0 text-slate-400" /><span><b>Chưa có điểm vào đẹp.</b> {ai.wait_for}</span></div>
              )}
              {others.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-[11px] font-bold text-slate-500 hover:text-indigo-600">▸ {others.length} kịch bản phụ</summary>
                  <div className="mt-1.5 space-y-2">{others.map((x, i) => <TradeTicket key={i} s={x} compact />)}</div>
                </details>
              )}
              {main && ai.wait_for && <div className="text-[11.5px] leading-snug text-slate-500"><b className="text-slate-600">Chờ thêm:</b> {ai.wait_for}</div>}
              {(ai.key_levels.support.length > 0 || ai.key_levels.resistance.length > 0) && (
                <div className="space-y-1 text-[11.5px]">
                  {ai.key_levels.resistance.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 font-bold text-rose-600">Kháng cự</span>{ai.key_levels.resistance.map((v) => <span key={v} className="rounded bg-rose-50 px-1.5 py-0.5 font-mono font-bold text-rose-700">{px(v)}</span>)}</div>}
                  {ai.key_levels.support.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 font-bold text-emerald-600">Hỗ trợ</span>{ai.key_levels.support.map((v) => <span key={v} className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono font-bold text-emerald-700">{px(v)}</span>)}</div>}
                </div>
              )}
              {ai.risk_note && <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-800"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> {ai.risk_note}</div>}
              <div className="text-[10.5px] text-slate-400">Phân tích {ago(ai.at)} · giá lúc đó {px(ai.priceAt)}{ai.market ? ` · ${MARKETS[ai.market]?.label}` : ""}</div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Chỉ báo gọn theo nhóm */}
        {s && (
          <Card className={`!p-3 transition-opacity ${stale ? "opacity-40" : ""}`}>
            <div className="space-y-2.5">
              <Group title="Xu hướng">
                <Row label="Cấu trúc" value={s.structure.trend} tone={trendTone} sub={s.structure.lastEvent ? `${s.structure.lastEvent.kind} ${s.structure.lastEvent.dir} · ${s.structure.lastEvent.barsAgo} nến trước` : "chưa có BOS"} />
                <Row label="EMA 20/50" value={s.ema.stack.split(" ")[0]} tone={s.ema.stack.startsWith("tăng") ? "emerald" : s.ema.stack.startsWith("giảm") ? "rose" : "slate"} sub={`${px(s.ema.e20)} / ${px(s.ema.e50)}`} />
                <Row label="Bộ lọc EA" value={s.trendFilter.priceVsEma200.startsWith("trên") ? "ưu tiên BUY" : s.trendFilter.priceVsEma200.startsWith("dưới") ? "ưu tiên SELL" : "—"} tone={s.sideway.isSideway ? "amber" : s.trendFilter.priceVsEma200.startsWith("trên") ? "emerald" : "rose"} sub={`ADX ${fmtNum(s.trendFilter.adx, 0)}${s.trendFilter.adxOk ? " ✓" : " yếu"} · ${s.sideway.isSideway ? "sideway" : "có xu hướng"}`} />
                <Row label="Vùng giá 100 nến" value={s.range100.position.split(" (")[0]} tone={s.range100.position.includes("premium") ? "rose" : s.range100.position.includes("discount") ? "emerald" : "slate"} />
              </Group>
              <Group title="Động lượng & khối lượng">
                <Row label="RSI 14" value={fmtNum(rsiV, 1)} tone={rsiV > 70 ? "rose" : rsiV < 30 ? "emerald" : "slate"} sub={rsiV > 70 ? "quá mua" : rsiV < 30 ? "quá bán" : s.momentum.divergence[0] || "trung tính"} />
                <Row label="MACD" value={s.momentum.macdHist > 0 ? "dương" : "âm"} tone={s.momentum.macdHist > 0 ? "emerald" : "rose"} sub={s.momentum.macdCross ? `${s.momentum.macdCross.dir} ${s.momentum.macdCross.ago} nến trước` : (Math.abs(s.momentum.macdHist) > Math.abs(s.momentum.macdHistPrev || 0) ? "đang mạnh lên" : "đang yếu đi")} />
                <Row label="Khối lượng nến đóng" value={`${fmtNum(s.volume.relVolLastClosed, 2)}× TB`} tone={s.volume.relVolLastClosed > 1.5 ? "amber" : "slate"} sub={`mua chủ động 20 nến ${fmtPct((s.volume.buyRatio20 || 0) * 100, 0)}`} />
                <Row label="Biến động ATR" value={fmtPct(s.volatility.atrPct, 2)} sub={px(s.volatility.atr)} />
              </Group>
              <Group title="Vùng giá quan trọng">
                <Row label="Key Volume" value={s.keyVolume.maxVolume100 ? `${px(s.keyVolume.maxVolume100.bottom)}–${px(s.keyVolume.maxVolume100.top)}` : "—"} tone="amber" sub={s.keyVolume.maxVolume100 ? `${fmtNum(s.keyVolume.maxVolume100.volX, 1)}× TB${s.keyVolume.maxVolume100.defended ? " · đã được bảo vệ" : ""}` : ""} />
                <Row label="Protected H / L" value={`${px(s.protected.protectedHigh?.price)} / ${px(s.protected.protectedLow?.price)}`} tone="indigo" sub={s.protected.protectedLow?.broken ? "đã thủng đáy bảo vệ!" : s.protected.protectedHigh?.broken ? "đã vượt đỉnh bảo vệ!" : "chưa bị phá"} />
                <Row label="POC (Volume Profile)" value={px(s.volumeProfile?.poc)} sub={s.volumeProfile?.hvn?.[0] ? `HVN ${px(s.volumeProfile.hvn[0].bottom)}–${px(s.volumeProfile.hvn[0].top)}` : ""} />
                <Row label="OB / FVG gần" value={`${s.orderBlocks.length} / ${s.fvg.length}`} tone="indigo" />
              </Group>
            </div>
          </Card>
        )}

        {/* Tín hiệu tự phát hiện + phân tích chi tiết của AI */}
        <Card className="!p-3 xl:col-span-2">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><Radar size={13} /> Tín hiệu nến đã đóng ({sig.length})</div>
          {sig.length ? (
            <div className="flex flex-wrap gap-1">{sig.map((x, i) => <span key={i} className={`rounded-md px-2 py-1 text-[11.5px] font-semibold ${{ rose: "bg-rose-50 text-rose-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-50 text-slate-600" }[x.tone]}`}>{x.t}</span>)}</div>
          ) : <div className="text-[12px] text-slate-400">Chưa có tín hiệu VSA / SFP / mẫu nến đặc biệt ở các nến gần nhất.</div>}

          {DETAIL.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2.5">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">AI đọc chi tiết</div>
              <div className="grid gap-x-5 gap-y-2 md:grid-cols-2">
                {DETAIL.map(([t, v]) => (
                  <div key={t} className="text-[12px] leading-snug"><span className="font-extrabold text-slate-700">{t}: </span><span className="text-slate-600">{v}</span></div>
                ))}
              </div>
            </div>
          )}
          <KnowledgePanel />
          <div className="mt-2 text-[10.5px] text-slate-400">Kịch bản do AI tổng hợp từ chỉ báo kỹ thuật — chỉ để tham khảo, KHÔNG phải tư vấn đầu tư. Luôn tự kiểm tra & quản lý vốn.</div>
        </Card>
      </div>

      {/* Lịch sử phân tích AI (cloud, tự chấm) + cảnh báo giá (chủ) */}
      <div className="grid items-start gap-3 xl:grid-cols-3">
        <AiHistory recs={analyses} active={active} sym={sym} onOpen={openAnalysis} className={isOwner ? "xl:col-span-2" : "xl:col-span-3"} />
        {isOwner && <PriceAlerts active={active} pair={`${sym}USDT`} market={usedMkt} price={price} />}
      </div>
    </div>
  );
}
