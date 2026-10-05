import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { RefreshCw, Sparkles, Loader2, AlertTriangle, Search, Target, ShieldAlert, TrendingUp, TrendingDown, Minus, Settings as SettingsIcon, X, BookOpen, ChevronDown, Radar } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { TF, fetchKlines, analyze, htfContext, compactCandles } from "../lib/ta.js";
import { aiMarketAnalysis } from "../lib/ai.js";
import { KNOWLEDGE, KNOWLEDGE_SOURCES } from "../lib/tradeKnowledge.js";

const DEFAULT_WATCH = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "LTC", "DOGE"];
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const precisionOf = (p) => (!p ? 2 : p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : Math.min(8, Math.ceil(-Math.log10(p)) + 3));
const fmtP = (v, prec) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: prec ?? precisionOf(v) }));
const pct = (x, base) => (x && base ? ((x - base) / base) * 100 : null);
const fmtPct = (v) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

// Biểu đồ nến (TradingView lightweight-charts): nến + EMA20/50 + khối lượng + mốc BOS/CHoCH + đường Entry/SL/TP
function CandleChart({ candles, e20, e50, events, lines, precision, fitKey }) {
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
    a.candle.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    a.candle.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    a.vol.setData(candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)" })));
    a.l20.setData(e20); a.l50.setData(e50);
    a.markers.setMarkers(events.map((ev) => ({ time: ev.time, position: ev.dir === "up" ? "belowBar" : "aboveBar", color: ev.dir === "up" ? "#10b981" : "#f43f5e", shape: ev.dir === "up" ? "arrowUp" : "arrowDown", text: ev.kind })));
    if (fitted.current !== fitKey) { // đổi coin/khung → zoom ~120 nến gần nhất
      fitted.current = fitKey;
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 6 });
    }
  }, [candles, e20, e50, events, precision, fitKey]);

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
function TradeTicket({ s, prec, compact }) {
  const [more, setMore] = useState(false);
  const long = s.direction === "long";
  const okN = (s.checklist || []).filter((c) => c.ok).length, allN = (s.checklist || []).length;
  const Cell = ({ label, v, sub, tone }) => (
    <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-[14px] font-extrabold ${tone}`}>{fmtP(v, prec)}</div>
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
          {!s.valid ? "SL/TP sai phía — đừng dùng kịch bản này." : `SL cách entry ${s.slAtr?.toFixed(1)} ATR (> 4) — theo EA nên huỷ.`}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Cell label="Vào lệnh" v={s.entry} sub={s.entry_zone ? `vùng ${fmtP(s.entry_zone[0], prec)}–${fmtP(s.entry_zone[1], prec)}` : null} tone="text-indigo-600" />
        <Cell label="Cắt lỗ" v={s.stop_loss} sub={`${fmtPct(pct(s.stop_loss, s.entry))}${s.slAtr ? ` · ${s.slAtr.toFixed(1)} ATR` : ""}`} tone="text-rose-600" />
        {s.take_profit.slice(0, 2).map((t, i) => <Cell key={i} label={`Chốt lời ${i + 1}`} v={t} sub={`${fmtPct(pct(t, s.entry))}${s.rr[i] ? ` · R:R 1:${s.rr[i].toFixed(1)}` : ""}`} tone="text-emerald-600" />)}
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

export default function CoinMarket() {
  const { settings = {}, coins = [] } = useData();
  const hasKey = settings.aiReady ?? !!(settings.openaiKey || "").trim();
  const [sym, setSym] = useState(() => ls.get("qws_mkt_sym", "BTC"));
  const [tf, setTf] = useState(() => ls.get("qws_mkt_tf", "4h"));
  const [extraWatch, setExtraWatch] = useState(() => ls.get("qws_mkt_watch", []));
  const [q, setQ] = useState("");
  const [data, setData] = useState({ key: "", ltf: [], htf: [] });
  const [tick, setTick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [cache, setCache] = useState(() => ls.get("qws_mkt_ai", {}));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const key = `${sym}-${tf}`;

  const watch = useMemo(() => [...new Set([...DEFAULT_WATCH, ...coins.map((c) => (c.symbol || "").toUpperCase()), ...extraWatch].filter((s) => s && s !== "USDT"))], [coins, extraWatch]);

  const load = async (silent) => {
    if (!silent) { setLoading(true); setErr(""); }
    try {
      const [ltf, htf, t] = await Promise.all([
        fetchKlines(sym, TF[tf].api, 300),
        fetchKlines(sym, TF[tf].htf, 200).catch(() => []),
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setData({ key, ltf, htf });
      if (t) setTick({ price: +t.lastPrice, chg: +t.priceChangePercent, vol: +t.quoteVolume });
      setErr("");
    } catch (e) { if (!silent) { setErr(e.message || String(e)); setData({ key, ltf: [], htf: [] }); } }
    if (!silent) setLoading(false);
  };
  useEffect(() => {
    ls.set("qws_mkt_sym", sym); ls.set("qws_mkt_tf", tf);
    load(false);
    const t = setInterval(() => { if (!document.hidden) load(true); }, 60000); // cập nhật nến mỗi phút
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [sym, tf]);

  const ta = useMemo(() => (data.ltf.length > 30 ? analyze(data.ltf) : null), [data.ltf]);
  const s = ta?.summary;
  const price = tick?.price || s?.price;
  const prec = precisionOf(price);
  const ai = cache[key];

  // Đường Entry/SL/TP của AI vẽ lên biểu đồ
  const lines = useMemo(() => {
    const out = (ta?.series.levels || []).map((l) => ({ price: l.price, color: l.color, title: l.title, style: 1, width: 1 }));
    (ai?.setups || []).filter((x) => x.valid).forEach((x, i) => {
      const L = x.direction === "long" ? "L" : "S", style = i === 0 ? 0 : 2;
      out.push({ price: x.entry, color: "#6366f1", title: `${L} Entry`, style, width: 2 });
      out.push({ price: x.stop_loss, color: "#f43f5e", title: `${L} SL`, style });
      x.take_profit.forEach((tp, j) => out.push({ price: tp, color: "#10b981", title: `${L} TP${j + 1}`, style }));
    });
    return out;
  }, [ai, ta]);

  const pickSym = (v) => {
    const x = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
    if (!x) return;
    setSym(x); setQ("");
    if (!watch.includes(x)) { const nw = [...extraWatch, x].slice(-12); setExtraWatch(nw); ls.set("qws_mkt_watch", nw); }
  };
  const removeWatch = (x) => { const nw = extraWatch.filter((w) => w !== x); setExtraWatch(nw); ls.set("qws_mkt_watch", nw); };

  const runAI = async () => {
    if (!s) return;
    setAiBusy(true); setAiErr("");
    try {
      const r = await aiMarketAnalysis({ symbol: sym, tf: TF[tf].label, htf: TF[tf].htf, summary: s, htfSummary: htfContext(data.htf), candles: compactCandles(data.ltf, 40), apiKey: settings.openaiKey, model: "gpt-4o" });
      const next = { ...cache, [key]: { ...r, priceAt: price } };
      const keys = Object.keys(next).sort((a, b) => (next[b].at || 0) - (next[a].at || 0)).slice(0, 12); // giữ 12 bản gần nhất
      const trimmed = Object.fromEntries(keys.map((k) => [k, next[k]]));
      setCache(trimmed); ls.set("qws_mkt_ai", trimmed);
    } catch (e) { setAiErr(e.message || String(e)); }
    setAiBusy(false);
  };

  const trendTone = s?.structure.trend === "tăng" ? "emerald" : s?.structure.trend === "giảm" ? "rose" : "slate";
  const rsiV = s?.momentum.rsi;
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

  // Tín hiệu tự phát hiện theo bộ kiến thức (nến đã đóng)
  const sig = s ? [
    ...s.vsa.flatMap((b) => b.tags.map((t) => ({ t: `VSA ${b.barsAgo}n: ${t}`, tone: /CLIMAX|UPTHRUST|NO DEMAND|SOW|STOPPING VOLUME khi tăng|PHÂN KỲ/.test(t) ? "rose" : "emerald" }))),
    ...s.sfp.map((x) => ({ t: `SFP ${x.dir} ${fmtP(x.level, prec)} · vol ${x.volRel}x · ${x.valid}`, tone: x.dir.startsWith("tăng") ? "emerald" : "rose" })),
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
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") pickSym(q); }} placeholder="Mã coin + Enter" className="w-full bg-transparent text-[13px] uppercase outline-none placeholder:normal-case" />
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
      </Card>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Biểu đồ */}
        <Card className="!p-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-extrabold text-slate-400">{sym}/USDT</span>
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">{fmtP(price, prec)}</span>
              {tick && <span className={`text-[13px] font-bold ${tick.chg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtPct(tick.chg)} <span className="font-semibold text-slate-400">24h</span></span>}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {Object.keys(TF).map((k) => (
                  <button key={k} onClick={() => setTf(k)} className={`rounded-md px-2.5 py-1 text-[12px] font-extrabold ${tf === k ? "bg-white text-amber-600 shadow" : "text-slate-500"}`}>{TF[k].label}</button>
                ))}
              </div>
              <button onClick={() => load(false)} disabled={loading} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
            </div>
          </div>
          {err ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-6 text-sm font-semibold text-rose-600"><AlertTriangle size={16} /> {err}</div>
          ) : (
            <div className="mt-2">
              <CandleChart candles={data.ltf} e20={ta?.series.e20 || []} e50={ta?.series.e50 || []} events={ta?.series.events || []} lines={lines} precision={prec} fitKey={data.key} />
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-semibold text-slate-400">
                <span><span className="text-amber-500">━</span> EMA20</span><span><span className="text-indigo-500">━</span> EMA50</span><span>▲▼ BOS/CHoCH</span><span><span className="text-yellow-500">┅</span> Key Volume</span><span><span className="text-rose-400">┅</span>/<span className="text-emerald-400">┅</span> Protected</span><span><span className="text-slate-400">┅</span> POC</span>
                {lines.length > 0 && <span><span className="text-indigo-500">━</span> Entry <span className="text-rose-500">━</span> SL <span className="text-emerald-500">━</span> TP</span>}
              </div>
            </div>
          )}
        </Card>

        {/* Cột phải: AI kết luận + phiếu lệnh */}
        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[14px] font-extrabold text-slate-800"><Sparkles size={15} className="text-indigo-500" /> AI · {sym} {TF[tf].label}</div>
            <button onClick={runAI} disabled={aiBusy || !hasKey || !s} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-1.5 text-[12px] font-bold text-white shadow disabled:opacity-40">
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
              {main ? <TradeTicket s={main} prec={prec} /> : (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600"><Target size={14} className="mt-0.5 shrink-0 text-slate-400" /><span><b>Chưa có điểm vào đẹp.</b> {ai.wait_for}</span></div>
              )}
              {others.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-[11px] font-bold text-slate-500 hover:text-indigo-600">▸ {others.length} kịch bản phụ</summary>
                  <div className="mt-1.5 space-y-2">{others.map((x, i) => <TradeTicket key={i} s={x} prec={prec} compact />)}</div>
                </details>
              )}
              {main && ai.wait_for && <div className="text-[11.5px] leading-snug text-slate-500"><b className="text-slate-600">Chờ thêm:</b> {ai.wait_for}</div>}
              {(ai.key_levels.support.length > 0 || ai.key_levels.resistance.length > 0) && (
                <div className="space-y-1 text-[11.5px]">
                  {ai.key_levels.resistance.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 font-bold text-rose-600">Kháng cự</span>{ai.key_levels.resistance.map((v) => <span key={v} className="rounded bg-rose-50 px-1.5 py-0.5 font-mono font-bold text-rose-700">{fmtP(v, prec)}</span>)}</div>}
                  {ai.key_levels.support.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 font-bold text-emerald-600">Hỗ trợ</span>{ai.key_levels.support.map((v) => <span key={v} className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono font-bold text-emerald-700">{fmtP(v, prec)}</span>)}</div>}
                </div>
              )}
              {ai.risk_note && <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-800"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> {ai.risk_note}</div>}
              <div className="text-[10.5px] text-slate-400">Phân tích {ago(ai.at)} · giá lúc đó {fmtP(ai.priceAt, prec)}</div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Chỉ báo gọn theo nhóm */}
        {s && (
          <Card className="!p-3">
            <div className="space-y-2.5">
              <Group title="Xu hướng">
                <Row label="Cấu trúc" value={s.structure.trend} tone={trendTone} sub={s.structure.lastEvent ? `${s.structure.lastEvent.kind} ${s.structure.lastEvent.dir} · ${s.structure.lastEvent.barsAgo} nến trước` : "chưa có BOS"} />
                <Row label="EMA 20/50" value={s.ema.stack.split(" ")[0]} tone={s.ema.stack.startsWith("tăng") ? "emerald" : s.ema.stack.startsWith("giảm") ? "rose" : "slate"} sub={`${fmtP(s.ema.e20, prec)} / ${fmtP(s.ema.e50, prec)}`} />
                <Row label="Bộ lọc EA" value={s.trendFilter.priceVsEma200.startsWith("trên") ? "ưu tiên BUY" : s.trendFilter.priceVsEma200.startsWith("dưới") ? "ưu tiên SELL" : "—"} tone={s.sideway.isSideway ? "amber" : s.trendFilter.priceVsEma200.startsWith("trên") ? "emerald" : "rose"} sub={`ADX ${s.trendFilter.adx?.toFixed(0) ?? "—"}${s.trendFilter.adxOk ? " ✓" : " yếu"} · ${s.sideway.isSideway ? "sideway" : "có xu hướng"}`} />
                <Row label="Vùng giá 100 nến" value={s.range100.position.split(" (")[0]} tone={s.range100.position.includes("premium") ? "rose" : s.range100.position.includes("discount") ? "emerald" : "slate"} />
              </Group>
              <Group title="Động lượng & khối lượng">
                <Row label="RSI 14" value={rsiV != null ? rsiV.toFixed(1) : "—"} tone={rsiV > 70 ? "rose" : rsiV < 30 ? "emerald" : "slate"} sub={rsiV > 70 ? "quá mua" : rsiV < 30 ? "quá bán" : s.momentum.divergence[0] || "trung tính"} />
                <Row label="MACD" value={s.momentum.macdHist > 0 ? "dương" : "âm"} tone={s.momentum.macdHist > 0 ? "emerald" : "rose"} sub={s.momentum.macdCross ? `${s.momentum.macdCross.dir} ${s.momentum.macdCross.ago} nến trước` : (Math.abs(s.momentum.macdHist) > Math.abs(s.momentum.macdHistPrev || 0) ? "đang mạnh lên" : "đang yếu đi")} />
                <Row label="Khối lượng nến đóng" value={`${s.volume.relVolLastClosed?.toFixed(2)}× TB`} tone={s.volume.relVolLastClosed > 1.5 ? "amber" : "slate"} sub={`mua chủ động 20 nến ${Math.round((s.volume.buyRatio20 || 0) * 100)}%`} />
                <Row label="Biến động ATR" value={`${s.volatility.atrPct?.toFixed(2)}%`} sub={fmtP(s.volatility.atr, prec)} />
              </Group>
              <Group title="Vùng giá quan trọng">
                <Row label="Key Volume" value={s.keyVolume.maxVolume100 ? `${fmtP(s.keyVolume.maxVolume100.bottom, prec)}–${fmtP(s.keyVolume.maxVolume100.top, prec)}` : "—"} tone="amber" sub={s.keyVolume.maxVolume100 ? `${s.keyVolume.maxVolume100.volX?.toFixed(1)}× TB${s.keyVolume.maxVolume100.defended ? " · đã được bảo vệ" : ""}` : ""} />
                <Row label="Protected H / L" value={`${fmtP(s.protected.protectedHigh?.price, prec)} / ${fmtP(s.protected.protectedLow?.price, prec)}`} tone="indigo" sub={s.protected.protectedLow?.broken ? "đã thủng đáy bảo vệ!" : s.protected.protectedHigh?.broken ? "đã vượt đỉnh bảo vệ!" : "chưa bị phá"} />
                <Row label="POC (Volume Profile)" value={fmtP(s.volumeProfile?.poc, prec)} sub={s.volumeProfile?.hvn?.[0] ? `HVN ${fmtP(s.volumeProfile.hvn[0].bottom, prec)}–${fmtP(s.volumeProfile.hvn[0].top, prec)}` : ""} />
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
    </div>
  );
}
