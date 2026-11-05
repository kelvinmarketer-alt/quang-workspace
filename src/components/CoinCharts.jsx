// Biểu đồ nến Coin (TradingView lightweight-charts) dùng chung cho tab Thị trường: 1 ô hoặc lưới 2 / 4 / 6 ô (05/11).
// - Nhãn bên phải bật/tắt TỪNG cái, mỗi cái 3 mức: có nhãn trục giá → chỉ đường → ẩn (nhớ trên máy này).
// - Lưới: mỗi ô coin + khung riêng, tự tải nến mỗi phút; ô đang chọn điều khiển AI / chỉ báo bên dưới.
// - Rê chuột ở 1 ô → các ô CÙNG COIN hiện vạch giá đó (đồng bộ qua bus trong module, không vẽ lại React).
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { Loader2, AlertTriangle, Maximize2, Minimize2, Tag, Link2, ChevronLeft, ChevronRight } from "lucide-react";
import { TF, fetchKlines, analyze } from "../lib/ta.js";
import { fmtPx, fmtNum } from "../lib/format.js";

export const precisionOf = (p) => (!p ? 2 : p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : Math.min(8, Math.ceil(-Math.log10(p)) + 3)); // chỉ cho thang giá biểu đồ
// Giá: kiểu chung fmtPx; coin giá rất nhỏ (< 0,01 — PEPE, SHIB…) cần thêm số lẻ để không thành "0,000005"
export const px = (v) => (v != null && isFinite(v) && v !== 0 && Math.abs(v) < 0.01 ? fmtNum(v, precisionOf(Math.abs(v)), 0) : fmtPx(v));
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ---- Nhãn trên biểu đồ ----
// [khoá, tên trên nút, màu mẫu]
export const TAGS = [
  ["ema20", "EMA20", "#f59e0b"], ["ema50", "EMA50", "#6366f1"], ["smc", "BOS/CHoCH", "#10b981"],
  ["protH", "Protected H", "#fb7185"], ["protL", "Protected L", "#34d399"],
  ["kvUp", "KeyVol↑", "#eab308"], ["kvDn", "KeyVol↓", "#eab308"], ["poc", "POC", "#94a3b8"],
  ["ai", "Vào/SL/TP AI", "#6366f1"],
];
const LEVEL_TAG = { "KeyVol↑": "kvUp", "KeyVol↓": "kvDn", "Protected H": "protH", "Protected L": "protL", POC: "poc" };
const NEXT = { full: "line", line: "off", off: "full" };
export const MODE_TIP = { full: "đang hiện đường + nhãn trục giá", line: "đang hiện đường, ẩn nhãn", off: "đang ẩn" };

// Đọc lựa chọn nhãn; máy đã có lựa chọn cũ theo nhóm (qws_mkt_layers) → chuyển sang từng nhãn
export function loadTags() {
  const saved = ls.get("qws_mkt_tags", null);
  const def = { ...Object.fromEntries(TAGS.map(([k]) => [k, "full"])), ema20: "line", ema50: "line" }; // EMA mặc định không thêm nhãn trục (giống trước)
  if (saved && typeof saved === "object") return { ...def, ...saved };
  const old = ls.get("qws_mkt_layers", {}) || {};
  const m = (on) => (on === false ? "off" : "full");
  const e = old.ema === false ? "off" : "line";
  return { ...def, ema20: e, ema50: e, smc: m(old.smc), protH: m(old.levels), protL: m(old.levels), kvUp: m(old.levels), kvDn: m(old.levels), poc: m(old.levels), ai: m(old.ai) };
}
export const saveTags = (t) => ls.set("qws_mkt_tags", t);
// Ô nhỏ (lưới 4–6 ô) mặc định không vẽ nhãn trục cho đỡ rối: "full" → "line"
export const modeOf = (tags, k, compact) => { const m = tags[k] || "full"; return compact && m === "full" ? "line" : m; };

// Đường giá ngang: Key Volume / Protected / POC (từ analyze) + Entry/SL/TP của AI. axis=false → không vẽ nhãn ở trục giá
export function buildLines({ levels = [], ai, tags, compact }) {
  const out = [];
  for (const l of levels) {
    const m = modeOf(tags, LEVEL_TAG[l.title] || "poc", compact);
    if (m !== "off") out.push({ price: l.price, color: l.color, title: l.title, style: 1, width: 1, axis: m === "full" });
  }
  const am = modeOf(tags, "ai", compact);
  if (am !== "off") (ai?.setups || []).filter((x) => x.valid).forEach((x, i) => {
    const L = x.direction === "long" ? "L" : "S", style = i === 0 ? 0 : 2, axis = am === "full";
    out.push({ price: x.entry, color: "#6366f1", title: `${L} Entry`, style, width: 2, axis });
    out.push({ price: x.stop_loss, color: "#f43f5e", title: `${L} SL`, style, axis });
    x.take_profit.forEach((tp, j) => out.push({ price: tp, color: "#10b981", title: `${L} TP${j + 1}`, style, axis }));
  });
  return out;
}

// Hàng nút nhãn: bấm xoay vòng có nhãn → chỉ đường → ẩn
export function TagBar({ tags, setTags, compact, extra }) {
  const upd = (fn) => setTags((t) => { const n = fn(t); saveTags(n); return n; }); // bấm nhanh 2 lần vẫn đúng
  const all = (m) => upd(() => Object.fromEntries(TAGS.map(([k]) => [k, m])));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px] font-semibold text-slate-400">
      <span className="mr-0.5 font-bold text-slate-500">Hiện:</span>
      {TAGS.map(([k, label, color]) => {
        const m = modeOf(tags, k, compact);
        return (
          <button key={k} onClick={() => upd((t) => ({ ...t, [k]: NEXT[t[k] || "full"] }))} title={`${label}: ${MODE_TIP[m]}${compact && tags[k] === "full" ? " (ô nhỏ tự ẩn nhãn — bật “Nhãn trục” để hiện)" : ""}. Bấm để đổi.`} aria-label={`${label}: ${MODE_TIP[m]}`}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition ${m === "off" ? "border-dashed border-slate-200 text-slate-300 line-through" : m === "line" ? "border-slate-200 bg-white text-slate-500" : "border-slate-300 bg-white text-slate-700"}`}>
            <span style={{ color: m === "off" ? undefined : color }}>{k === "smc" ? "▲" : "━"}</span>{label}{m === "full" && <Tag size={9} className="text-slate-400" />}
          </button>
        );
      })}
      <button onClick={() => all("full")} className="rounded-md px-1.5 py-0.5 text-indigo-500 hover:bg-indigo-50">Hiện hết</button>
      <button onClick={() => all("line")} className="rounded-md px-1.5 py-0.5 text-indigo-500 hover:bg-indigo-50">Ẩn nhãn</button>
      {extra}
      <span className="ml-auto hidden sm:inline">bấm nút: <Tag size={9} className="inline" /> có nhãn → chỉ đường → ẩn · giờ VN</span>
    </div>
  );
}

// ---- Đồng bộ vạch giá giữa các ô (cùng coin) ----
const HOVER = new Set();
const emitHover = (msg) => HOVER.forEach((f) => f(msg));

// Biểu đồ nến: nến + EMA20/50 + khối lượng + mốc BOS/CHoCH + mốc thêm (lệnh bot) + đường giá ngang
// Trục thời gian theo giờ VN (UTC+7, giống tab Demo). marks: mốc thêm theo giây UTC như nến.
const VN = 7 * 3600;
export function CandleChart({ candles, e20, e50, events, marks, lines, precision, fitKey, tags, compact, syncKey, className = "h-[300px] w-full sm:h-[420px]" }) {
  const box = useRef(null), api = useRef(null), fitted = useRef("");
  const me = useRef(Math.random().toString(36).slice(2));
  const syncRef = useRef(syncKey); syncRef.current = syncKey;
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
    const a = { chart, candle, vol, l20: line("#f59e0b"), l50: line("#6366f1"), markers: createSeriesMarkers(candle, []), lines: [], sync: null };
    api.current = a;
    // Rê chuột → báo giá cho các ô khác cùng coin; nhận giá từ ô khác → vạch chấm ngang
    const onMove = (p) => {
      if (!syncRef.current) return;
      const price = p.point ? a.candle.coordinateToPrice(p.point.y) : null;
      emitHover({ from: me.current, key: syncRef.current, price: price != null && isFinite(price) ? price : null });
    };
    chart.subscribeCrosshairMove(onMove);
    const onHover = ({ from, key, price }) => {
      if (from === me.current) return;
      const show = price != null && key === syncRef.current;
      if (!show) { if (a.sync) { a.candle.removePriceLine(a.sync); a.sync = null; } return; }
      if (a.sync) a.sync.applyOptions({ price });
      else a.sync = a.candle.createPriceLine({ price, color: "#94a3b8", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "" });
    };
    HOVER.add(onHover);
    return () => { HOVER.delete(onHover); chart.unsubscribeCrosshairMove(onMove); chart.remove(); api.current = null; };
  }, []);

  const m20 = tags ? modeOf(tags, "ema20", compact) : "line", m50 = tags ? modeOf(tags, "ema50", compact) : "line", mSmc = tags ? modeOf(tags, "smc", compact) : "full";
  useEffect(() => {
    const a = api.current; if (!a || !candles.length) return;
    const T = (t) => t + VN, first = candles[0].time, last = candles[candles.length - 1].time;
    a.candle.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    a.chart.applyOptions({ localization: { locale: "vi-VN", priceFormatter: (p) => Number(p).toLocaleString("vi-VN", { minimumFractionDigits: precision, maximumFractionDigits: precision }) } }); // số kiểu Việt (83.003,06) như phần còn lại của app
    a.candle.setData(candles.map(({ time, open, high, low, close }) => ({ time: T(time), open, high, low, close })));
    a.vol.setData(candles.map((c) => ({ time: T(c.time), value: c.volume, color: c.close >= c.open ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)" })));
    a.l20.setData(e20.map((p) => ({ time: T(p.time), value: p.value }))); a.l50.setData(e50.map((p) => ({ time: T(p.time), value: p.value })));
    a.l20.applyOptions({ visible: m20 !== "off", lastValueVisible: m20 === "full" });
    a.l50.applyOptions({ visible: m50 !== "off", lastValueVisible: m50 === "full" });
    const m = [
      ...(mSmc === "off" ? [] : events.map((ev) => ({ time: ev.time, position: ev.dir === "up" ? "belowBar" : "aboveBar", color: ev.dir === "up" ? "#10b981" : "#f43f5e", shape: ev.dir === "up" ? "arrowUp" : "arrowDown", text: mSmc === "full" ? ev.kind : "" }))),
      ...(marks || []),
    ].filter((x) => x.time >= first && x.time <= last).map((x) => ({ ...x, time: T(x.time) })).sort((x, y) => x.time - y.time);
    a.markers.setMarkers(m);
    if (fitted.current !== fitKey) { // đổi coin/khung → zoom ~120 nến gần nhất
      fitted.current = fitKey;
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - (compact ? 90 : 120)), to: candles.length + 6 });
    }
  }, [candles, e20, e50, events, marks, precision, fitKey, m20, m50, mSmc, compact]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    a.lines.forEach((pl) => a.candle.removePriceLine(pl));
    a.lines = lines.map((ln) => a.candle.createPriceLine({ price: ln.price, color: ln.color, lineWidth: ln.width || 1, lineStyle: ln.style ?? 2, axisLabelVisible: ln.axis !== false, title: ln.axis === false ? "" : ln.title }));
  }, [lines]);

  return <div ref={box} className={className} />;
}

// ---- Lưới nhiều biểu đồ ----
export const LAYOUTS = [1, 2, 4, 6];
const DEFAULT_CELLS = [["BTC", "1w"], ["BTC", "1d"], ["BTC", "4h"], ["BTC", "1h"], ["ETH", "4h"], ["SOL", "4h"]].map(([sym, tf]) => ({ sym, tf }));
export function loadGrid() {
  const g = ls.get("qws_mkt_grid", null) || {};
  const cells = Array.isArray(g.cells) ? g.cells.filter((c) => c && c.sym && TF[c.tf]) : [];
  return {
    n: LAYOUTS.includes(g.n) ? g.n : 1,
    cells: [...cells, ...DEFAULT_CELLS].slice(0, 6),
    active: Number.isInteger(g.active) && g.active >= 0 && g.active < 6 ? g.active : 0,
    link: !!g.link, labels: !!g.labels,
  };
}
export const saveGrid = (g) => ls.set("qws_mkt_grid", g);

// Nến của 1 ô: sàn đang chọn trước, mã không có → sàn còn lại; cập nhật mỗi phút khi tab đang mở
function useCells(sym, tf, mkt, active) {
  const [st, setSt] = useState({ key: "", candles: [], market: "", err: "", loading: true });
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => {
    let off = false;
    const k = `${sym}-${tf}-${mkt}`;
    const go = async (silent) => {
      if (!silent) setSt((s) => ({ ...s, loading: true, err: "" }));
      try {
        for (const m of [mkt, mkt === "futures" ? "spot" : "futures"]) {
          try {
            const c = await fetchKlines(sym, TF[tf].api, 300, { market: m });
            if (!off) setSt({ key: k, candles: c, market: m, err: "", loading: false });
            return;
          } catch (e) { if (!e.badSymbol) throw e; }
        }
        throw new Error(`Không có ${sym}/USDT trên Binance`);
      } catch (e) { if (!off && !silent) setSt({ key: k, candles: [], market: "", err: e.message || String(e), loading: false }); }
    };
    go(false);
    const t = setInterval(() => { if (!document.hidden && activeRef.current) go(true); }, 60000);
    return () => { off = true; clearInterval(t); };
  }, [sym, tf, mkt]);
  return st;
}

const EMPTY = [];
function GridCell({ i, cell, mkt, watch, tags, compact, focused, selected, active, ai, onPick, onChange, onFocus, height }) {
  const { sym, tf } = cell;
  const st = useCells(sym, tf, mkt, active);
  const ta = useMemo(() => (st.candles.length > 30 ? analyze(st.candles) : null), [st.candles]);
  const last = st.candles[st.candles.length - 1], prev = st.candles[st.candles.length - 2];
  const price = last?.close;
  const chg = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
  const lines = useMemo(() => buildLines({ levels: ta?.series.levels || [], ai, tags, compact }), [ta, ai, tags, compact]);
  const coins = watch.includes(sym) ? watch : [sym, ...watch];
  return (
    <div onMouseDown={() => !selected && onPick(i)} className={`w-full min-w-0 shrink-0 snap-center rounded-xl border bg-white p-2 sm:w-auto ${selected ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-1.5" onDoubleClick={() => onFocus(i)}>
        <select value={sym} onChange={(e) => onChange(i, { sym: e.target.value })} aria-label={`Coin ô ${i + 1}`} className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[12px] font-extrabold text-slate-700">
          {coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className={`font-mono text-[12.5px] font-extrabold tabular-nums ${chg == null ? "text-slate-700" : chg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{px(price)}</span>
        {st.market && st.market !== mkt && <span className="text-[10px] font-semibold text-amber-600">{st.market === "spot" ? "Spot" : "Futures"}</span>}
        <div className="ml-auto flex items-center gap-1">
          <div className="flex rounded-md bg-slate-100 p-0.5">
            {Object.keys(TF).map((k) => <button key={k} onClick={() => onChange(i, { tf: k })} className={`rounded px-1.5 py-px text-[10.5px] font-extrabold ${tf === k ? "bg-white text-amber-600 shadow" : "text-slate-500"}`}>{TF[k].label}</button>)}
          </div>
          <button onClick={() => onFocus(i)} title={focused ? "Về lưới" : "Phóng to ô này"} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{focused ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        </div>
      </div>
      <div className="relative mt-1">
        {st.err ? (
          <div className={`flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 text-[12px] font-semibold text-rose-600 ${height}`}><AlertTriangle size={14} /> {st.err}</div>
        ) : (<>
          {st.loading && !st.candles.length && <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 text-[12px] font-bold text-slate-400"><Loader2 size={14} className="animate-spin" /> Đang tải {sym} {TF[tf].label}…</div>}
          <CandleChart candles={st.candles} e20={ta?.series.e20 || EMPTY} e50={ta?.series.e50 || EMPTY} events={ta?.series.events || EMPTY} marks={EMPTY} lines={lines} precision={precisionOf(price)} fitKey={st.key} tags={tags} compact={compact} syncKey={sym} className={`w-full ${height}`} />
        </>)}
      </div>
    </div>
  );
}

// Thanh điều khiển lưới: số ô + 2 mẫu + cùng coin + nhãn trục ô nhỏ
export function LayoutPicker({ n, setN }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5" title="Số biểu đồ trên màn hình">
      {LAYOUTS.map((k) => <button key={k} onClick={() => setN(k)} aria-pressed={n === k} className={`rounded-md px-2 py-1 text-[12px] font-extrabold ${n === k ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{k === 1 ? "1 ô" : k}</button>)}
    </div>
  );
}

export function ChartGrid({ grid, setGrid, mkt, watch, tags, active, aiFor, onActive }) {
  const { n, cells, link, labels } = grid;
  const [focus, setFocus] = useState(null);
  const scroller = useRef(null);
  const compact = n >= 4 && !labels && focus == null;
  const list = cells.slice(0, n);
  const height = focus != null ? "h-[340px] sm:h-[calc(100vh-280px)] sm:min-h-[460px]" : n === 2 ? "h-[300px] sm:h-[420px]" : n === 4 ? "h-[300px] sm:h-[310px]" : "h-[300px] sm:h-[260px]";
  const cols = focus != null ? "" : n === 2 ? "sm:grid-cols-2" : n === 4 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3";
  const change = (i, patch) => {
    const next = cells.map((c, j) => (j === i || (link && patch.sym) ? { ...c, ...(j === i ? patch : { sym: patch.sym }) } : c));
    setGrid({ ...grid, cells: next, active: i }); // sửa ô nào thì ô đó thành ô đang chọn
    onActive(next[i]);
  };
  const pick = (i) => { setGrid({ ...grid, active: i }); onActive(cells[i]); };
  const toggleFocus = (i) => { setFocus((f) => (f === i ? null : i)); pick(i); };
  const go = (d) => { const el = scroller.current; if (el) el.scrollBy({ left: d * el.clientWidth, behavior: "smooth" }); };
  const shown = focus != null ? [focus] : list.map((_, i) => i);
  return (
    <div className="min-w-0">
      <div ref={scroller} className={`flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto sm:grid sm:overflow-visible ${cols}`}>
        {shown.map((i) => (
          <GridCell key={i} i={i} cell={cells[i]} mkt={mkt} watch={watch} tags={tags} compact={compact} focused={focus === i} selected={grid.active === i} active={active}
            ai={aiFor(cells[i])} onPick={pick} onChange={change} onFocus={toggleFocus} height={height} />
        ))}
      </div>
      {focus == null && n > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-2 sm:hidden">
          <button onClick={() => go(-1)} aria-label="Ô trước" className="rounded-md p-1 text-slate-400"><ChevronLeft size={16} /></button>
          <span className="text-[11px] font-semibold text-slate-400">vuốt ở thanh tên ô để chuyển · {n} ô</span>
          <button onClick={() => go(1)} aria-label="Ô sau" className="rounded-md p-1 text-slate-400"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// Nút phụ của lưới, gắn vào cuối hàng nhãn
export function GridOptions({ grid, setGrid, sym, tf }) {
  const preset = (kind) => {
    if (kind === "tf") {
      const tfs = ["1w", "1d", "4h", "1h"];
      setGrid({ ...grid, n: 4, link: true, active: Math.max(0, tfs.indexOf(tf)), cells: [...tfs.map((t) => ({ sym, tf: t })), ...grid.cells.slice(4)] });
    } else {
      const syms = [sym, ...["BTC", "ETH", "XAU", "SOL", "BNB"].filter((s) => s !== sym)].slice(0, 4);
      setGrid({ ...grid, n: 4, link: false, active: 0, cells: [...syms.map((s) => ({ sym: s, tf })), ...grid.cells.slice(4)] });
    }
  };
  const btn = "flex items-center gap-1 rounded-md border px-1.5 py-0.5";
  return (<>
    <span className="mx-1 h-3 w-px bg-slate-200" />
    <button onClick={() => preset("tf")} className={`${btn} border-slate-200 bg-white text-slate-600 hover:border-indigo-300`}>{sym} · 4 khung</button>
    <button onClick={() => preset("coin")} className={`${btn} border-slate-200 bg-white text-slate-600 hover:border-indigo-300`}>4 coin · {TF[tf]?.label}</button>
    <button onClick={() => setGrid({ ...grid, link: !grid.link })} aria-pressed={grid.link} title="Đổi coin ở 1 ô thì mọi ô đổi theo" className={`${btn} ${grid.link ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500"}`}><Link2 size={10} /> Cùng coin</button>
    {grid.n >= 4 && <button onClick={() => setGrid({ ...grid, labels: !grid.labels })} aria-pressed={grid.labels} title="Ô nhỏ mặc định chỉ vẽ đường, không vẽ nhãn ở trục giá" className={`${btn} ${grid.labels ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500"}`}><Tag size={10} /> Nhãn trục</button>}
  </>);
}
