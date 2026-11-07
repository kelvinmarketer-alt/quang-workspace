// Biểu đồ nến Coin (TradingView lightweight-charts) dùng chung cho tab Thị trường: 1 ô hoặc lưới 2 / 4 / 6 ô (05/11).
// - Nhãn bên phải bật/tắt TỪNG cái, mỗi cái 3 mức: có nhãn trục giá → chỉ đường → ẩn (nhớ trên máy này).
// - Lưới: mỗi ô coin + khung riêng, tự tải nến mỗi phút; ô đang chọn điều khiển AI / chỉ báo bên dưới.
// - Rê chuột ở 1 ô → các ô CÙNG COIN hiện vạch giá đó (đồng bộ qua bus trong module, không vẽ lại React).
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { Loader2, AlertTriangle, Maximize2, Minimize2, Tag, Link2, ChevronLeft, ChevronRight, MousePointer2, Minus, Slash, Square, Type, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { DrawLayer, makeDrawing, moveDrawing, TOOLS, COLORS, MAX_PER_COIN } from "../lib/chartDraw.js";
import { ask } from "./ConfirmDialog.jsx";
import { TF, fetchKlines, analyze } from "../lib/ta.js";
import { fmtPx, fmtNum } from "../lib/format.js";
import { useWhale, cvdOf, flowMarks, bigMin, usdK } from "../lib/whale.js";
import { termVi } from "../lib/glossary.js";
import { GlossaryButton } from "./Term.jsx";

export const precisionOf = (p) => (!p ? 2 : p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : Math.min(8, Math.ceil(-Math.log10(p)) + 3)); // chỉ cho thang giá biểu đồ
// Giá: kiểu chung fmtPx; coin giá rất nhỏ (< 0,01 — PEPE, SHIB…) cần thêm số lẻ để không thành "0,000005"
export const px = (v) => (v != null && isFinite(v) && v !== 0 && Math.abs(v) < 0.01 ? fmtNum(v, precisionOf(Math.abs(v)), 0) : fmtPx(v));
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ---- Nhãn trên biểu đồ ----
// [khoá, tên trên nút, màu mẫu]
export const TAGS = [ // nhãn tiếng Việt lấy từ lib/glossary.js (08/11)
  ["ema20", termVi("ema20"), "#f59e0b"], ["ema50", termVi("ema50"), "#6366f1"], ["smc", termVi("smc"), "#10b981"],
  ["protH", termVi("protH"), "#fb7185"], ["protL", termVi("protL"), "#34d399"],
  ["kvUp", termVi("kvUp"), "#eab308"], ["kvDn", termVi("kvDn"), "#eab308"], ["poc", termVi("poc"), "#94a3b8"],
  ["ai", termVi("ai"), "#6366f1"],
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
    if (m !== "off") out.push({ price: l.price, color: l.color, title: LEVEL_TAG[l.title] ? termVi(LEVEL_TAG[l.title]) : l.title, style: 1, width: 1, axis: m === "full" });
  }
  const am = modeOf(tags, "ai", compact);
  if (am !== "off") (ai?.setups || []).filter((x) => x.valid).forEach((x, i) => {
    const L = x.direction === "long" ? "MUA" : "BÁN", style = i === 0 ? 0 : 2, axis = am === "full";
    out.push({ price: x.entry, color: "#6366f1", title: `AI vào ${L}`, style, width: 2, axis });
    out.push({ price: x.stop_loss, color: "#f43f5e", title: `AI cắt lỗ ${L}`, style, axis });
    x.take_profit.forEach((tp, j) => out.push({ price: tp, color: "#10b981", title: `AI chốt lời ${j + 1}`, style, axis }));
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
      <GlossaryButton keys={["ema20", "ema50", "smc", "protH", "protL", "kvUp", "kvDn", "poc", "ai", "tf"]} label="Giải thích" />
      {extra}
      <span className="ml-auto hidden sm:inline">bấm nút: <Tag size={9} className="inline" /> có nhãn → chỉ đường → ẩn · giờ VN</span>
    </div>
  );
}

// ---- Dòng tiền lớn / "dấu chân cá mập" (07/11) — bật/tắt từng lớp, nhớ trên máy ----
export const FLOWS = [
  ["delta", termVi("delta"), "#10b981", "Cột khối lượng tô theo phe thắng trong nến: xanh = mua chủ động nhiều hơn, đỏ = bán chủ động nhiều hơn"],
  ["cvd", termVi("cvd"), "#0ea5e9", "Tầng phụ: cộng dồn (mua chủ động − bán chủ động). Giá lên mà CVD đi ngang/giảm = lực mua yếu, có người xả"],
  ["oi", termVi("oi"), "#a855f7", "Tầng phụ: tổng giá trị hợp đồng đang mở (Futures, sàn giữ ~30 ngày). Giá lên + OI tăng = tiền mới vào"],
  ["big", termVi("big"), "#f59e0b", "Chấm tròn: lệnh khớp lớn (≥ ngưỡng theo mã) gộp theo nến — xanh dưới nến = MUA chủ động, đỏ trên nến = BÁN chủ động. Chỉ có từ lúc mở biểu đồ"],
  ["liq", termVi("liq"), "#f97316", "Ô vuông: lệnh bị thanh lý gộp theo nến — cam dưới nến = LONG bị thanh lý, xanh trên nến = SHORT bị thanh lý. Chỉ có từ lúc mở biểu đồ"],
  ["badge", "Phí giữ lệnh · TK lớn", "#64748b", "Nhãn góc trái: funding hiện tại, OI 24h, tỉ lệ Long/Short của tài khoản lớn (top trader)"],
];
export const loadFlows = () => ({ delta: false, cvd: true, oi: false, big: true, liq: true, badge: true, ...(ls.get("qws_mkt_flow", {}) || {}) });
export function FlowBar({ on, setOn, fut, w, grid }) {
  const flip = (k) => setOn((o) => { const n = { ...o, [k]: !o[k] }; ls.set("qws_mkt_flow", n); return n; });
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] font-semibold text-slate-400">
      <span className="mr-0.5 font-bold text-slate-500">Dòng tiền lớn:</span>
      {FLOWS.map(([k, label, color, tip]) => { const need = (k === "oi" || k === "liq" || k === "badge") && !fut; return (
        <button key={k} onClick={() => flip(k)} disabled={need} title={need ? `${label}: chỉ có ở Futures` : `${tip}. Bấm để ${on[k] ? "tắt" : "bật"}.`} aria-pressed={!!on[k]}
          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition disabled:opacity-40 ${on[k] && !need ? "border-slate-300 bg-white text-slate-700" : "border-dashed border-slate-200 text-slate-300 line-through"}`}>
          <span style={{ color: on[k] && !need ? color : undefined }}>{k === "big" ? "●" : k === "liq" ? "■" : "━"}</span>{label}
        </button>
      ); })}
      <GlossaryButton keys={["delta", "cvd", "oi", "big", "liq", "funding", "topLS"]} label="Giải thích" />
      <span className="ml-auto hidden sm:inline">{on.big || on.liq ? `lệnh lớn ≥ ${usdK(w.min)}$ · đã ghi ${w.big.length} lệnh lớn${fut ? `, ${w.liq.length} lần cháy TK` : ""} từ lúc mở · ` : ""}{grid ? "CVD/OI hiện khi phóng to ô · " : ""}chỉ để tham khảo</span>
    </div>
  );
}
// Gom dữ liệu cho CandleChart prop flow
export function useFlow(sym, tf, market, candles, on) {
  const fut = market === "futures";
  const w = useWhale(sym, tf, market, { oi: on.oi && fut, big: on.big, liq: on.liq && fut, badge: on.badge && fut });
  const min = bigMin(String(sym).toUpperCase().replace(/USDT$/, ""));
  const cvd = useMemo(() => (on.cvd && candles.length ? cvdOf(candles) : null), [on.cvd, candles]);
  const first = candles[0]?.time ?? 0;
  const marks = useMemo(() => flowMarks({ big: w.big, liq: w.liq, tf, on, min, first }), [w.tick, w.big, w.liq, tf, on.big, on.liq, min, first]); // eslint-disable-line react-hooks/exhaustive-deps
  const badge = on.badge && fut && (w.funding != null || w.topLS || w.oiChg != null) ? (<>
    {w.funding != null && <span className={`rounded bg-white/85 px-1.5 py-0.5 shadow-sm ${w.funding > 0.03 ? "text-rose-600" : w.funding < -0.01 ? "text-emerald-600" : "text-slate-600"}`} title="Funding: dương = long trả phí cho short (đám đông nghiêng long). Quá cao (> 0,03%/8h) thường là long quá đà">Phí giữ lệnh {fmtNum(w.funding, 4, 4)}%</span>}
    {w.oiChg != null && <span className={`rounded bg-white/85 px-1.5 py-0.5 shadow-sm ${w.oiChg >= 0 ? "text-violet-600" : "text-slate-500"}`} title="Giá trị hợp đồng mở hiện tại và thay đổi 24 giờ">Tiền lệnh mở {usdK(w.oiNow)}$ {w.oiChg >= 0 ? "+" : ""}{fmtNum(w.oiChg, 1, 1)}%/24h</span>}
    {w.topLS && <span className={`rounded bg-white/85 px-1.5 py-0.5 shadow-sm ${w.topLS.long >= 50 ? "text-emerald-600" : "text-rose-600"}`} title="Tỉ lệ vị thế Long/Short của nhóm tài khoản lớn nhất trên Binance (top trader)">TK lớn: {fmtNum(w.topLS.long, 0, 0)}% MUA</span>}
  </>) : null;
  const flow = useMemo(() => ({ delta: !!on.delta, cvd, oi: on.oi && fut && w.oi.length ? w.oi : null, marks, badge }), [on.delta, cvd, on.oi, fut, w.oi, marks, badge]);
  return { flow, w: { ...w, min }, fut };
}

// ---- Đồng bộ vạch giá giữa các ô (cùng coin) ----
const HOVER = new Set();
const emitHover = (msg) => HOVER.forEach((f) => f(msg));

// Biểu đồ nến: nến + EMA20/50 + khối lượng + mốc BOS/CHoCH + mốc thêm (lệnh bot) + đường giá ngang
// Trục thời gian theo giờ VN (UTC+7, giống tab Demo). marks: mốc thêm theo giây UTC như nến.
const VN = 7 * 3600;
// draw (chỉ chủ): { items, tool, setTool, sel, setSel, onChange(items), tf, hidden } — hình vẽ của coin này
const SCROLL = { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true };
export function CandleChart({ candles, e20, e50, events, marks, lines, precision, fitKey, tags, compact, syncKey, draw, flow, className = "h-[300px] w-full sm:h-[420px]" }) {
  const box = useRef(null), api = useRef(null), fitted = useRef("");
  const drawRef = useRef(draw); drawRef.current = draw;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const [edit, setEdit] = useState(null); // ô gõ chữ ghi chú: { id, x, y, value }
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
      handleScroll: SCROLL,
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

    // ---- Vẽ (chỉ chủ) ----
    const layer = new DrawLayer(); candle.attachPrimitive(layer); a.layer = layer;
    const el = box.current;
    let pend = null, drag = null;
    const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const lock = (on) => chart.applyOptions({ handleScroll: on ? false : SCROLL, handleScale: !on });
    a.lock = lock;
    const commit = (list) => drawRef.current?.onChange(list.slice(-MAX_PER_COIN));
    const onAxis = (x) => x > el.clientWidth - (chart.priceScale("right").width() || 0);
    const down = (e) => {
      const D = drawRef.current;
      if (!D || D.hidden || e.button > 0) return;
      const [x, y] = local(e), C = candlesRef.current;
      if (onAxis(x) || !C.length) return;
      if (D.tool !== "cursor") {
        const p = layer.pointAt(x, y, C); if (!p) return;
        e.preventDefault(); e.stopPropagation();
        if (D.tool === "hline" || D.tool === "text") {
          const d = makeDrawing(D.tool, p, null, D.tf);
          commit([...D.items, d]); D.setSel(d.id); D.setTool("cursor");
          if (D.tool === "text") setEdit({ id: d.id, x, y, value: "" });
          return;
        }
        if (!pend) { pend = makeDrawing(D.tool, p, p, D.tf); layer.preview = pend; layer.sel = pend.id; layer.update(); return; }
        const d = { ...pend, p2: p }; pend = null; layer.preview = null;
        commit([...D.items, d]); D.setSel(d.id); D.setTool("cursor");
        return;
      }
      const h = layer.hit(x, y);
      if (!h) { if (D.sel && D.items.some((d) => d.id === D.sel)) D.setSel(null); return; }
      e.preventDefault(); e.stopPropagation(); // không để biểu đồ kéo nến theo
      D.setSel(h.id); layer.sel = h.id; layer.update();
      const d0 = D.items.find((d) => d.id === h.id); if (!d0) return;
      drag = { h, d0, l0: chart.timeScale().coordinateToLogical(x), p0: candle.coordinateToPrice(y), moved: false };
      lock(true);
    };
    const move = (e) => {
      const D = drawRef.current; if (!D) return;
      const [x, y] = local(e), C = candlesRef.current;
      if (pend) { const p = layer.pointAt(x, y, C); if (p) { layer.preview = { ...pend, p2: p }; layer.update(); } return; }
      if (!drag) { if (e.target && el.contains(e.target)) el.style.cursor = D.hidden ? "" : D.tool !== "cursor" ? "crosshair" : layer.hit(x, y) ? "move" : ""; return; }
      let d;
      if (drag.h.part === "body") {
        const l = chart.timeScale().coordinateToLogical(x), p = candle.coordinateToPrice(y);
        if (l == null || p == null || drag.l0 == null || drag.p0 == null) return;
        d = moveDrawing(drag.d0, l - drag.l0, p - drag.p0, layer.scale);
      } else { const p = layer.pointAt(x, y, C); if (!p) return; d = { ...drag.d0, [drag.h.part]: p }; }
      drag.moved = true; layer.preview = d; layer.update();
    };
    const up = () => {
      if (!drag) return;
      const D = drawRef.current, d = layer.preview;
      lock(D && D.tool !== "cursor");
      if (drag.moved && d && D) commit(D.items.map((x) => (x.id === d.id ? d : x)));
      layer.preview = null; drag = null; layer.update();
    };
    const dbl = (e) => { // bấm đúp vào hình → sửa chữ ghi chú
      const D = drawRef.current; if (!D || D.hidden) return;
      const [x, y] = local(e), h = layer.hit(x, y); if (!h) return;
      const d = D.items.find((v) => v.id === h.id); if (!d || d.type === "trend" || d.type === "fib") return;
      e.stopPropagation(); D.setSel(d.id); setEdit({ id: d.id, x, y, value: d.text || "" });
    };
    const key = (e) => {
      const D = drawRef.current; if (!D) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable) return;
      if (e.key === "Escape" && (pend || D.tool !== "cursor")) { pend = null; layer.preview = null; layer.update(); D.setTool("cursor"); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && D.sel && D.items.some((d) => d.id === D.sel)) { e.preventDefault(); commit(D.items.filter((d) => d.id !== D.sel)); D.setSel(null); }
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("dblclick", dbl, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    a.cancel = () => { pend = null; layer.preview = null; layer.update(); };
    return () => {
      el.removeEventListener("pointerdown", down, true); el.removeEventListener("dblclick", dbl, true);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", key);
      HOVER.delete(onHover); chart.unsubscribeCrosshairMove(onMove); chart.remove(); api.current = null;
    };
  }, []);

  // Hình vẽ của coin này → lớp vẽ; đang chọn công cụ → khoá kéo nến cho khỏi lệch khi bấm
  const dItems = draw?.items, dSel = draw?.sel, dHidden = !!draw?.hidden, dTool = draw?.tool || "cursor";
  useEffect(() => {
    const a = api.current; if (!a?.layer) return;
    a.layer.sel = dSel; a.layer.set(dHidden ? [] : dItems || [], candles);
  }, [dItems, dSel, dHidden, candles]);
  useEffect(() => {
    const a = api.current; if (!a?.lock) return;
    a.lock(dTool !== "cursor" && !dHidden);
    if (dTool === "cursor") a.cancel?.();
  }, [dTool, dHidden]);
  const saveText = (v) => {
    const D = drawRef.current; if (!edit || !D) { setEdit(null); return; }
    const d = D.items.find((x) => x.id === edit.id);
    if (d) {
      const text = String(v ?? "").trim().slice(0, 80);
      if (d.type === "text" && !text) D.onChange(D.items.filter((x) => x.id !== d.id)); // ghi chú trống → bỏ
      else if (text !== (d.text || "")) D.onChange(D.items.map((x) => (x.id === d.id ? { ...x, text } : x)));
    }
    setEdit(null);
  };

  const m20 = tags ? modeOf(tags, "ema20", compact) : "line", m50 = tags ? modeOf(tags, "ema50", compact) : "line", mSmc = tags ? modeOf(tags, "smc", compact) : "full";
  useEffect(() => {
    const a = api.current; if (!a || !candles.length) return;
    const T = (t) => t + VN, first = candles[0].time, last = candles[candles.length - 1].time;
    a.candle.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    a.chart.applyOptions({ localization: { locale: "vi-VN", priceFormatter: (p) => Number(p).toLocaleString("vi-VN", { minimumFractionDigits: precision, maximumFractionDigits: precision }) } }); // số kiểu Việt (83.003,06) như phần còn lại của app
    a.candle.setData(candles.map(({ time, open, high, low, close }) => ({ time: T(time), open, high, low, close })));
    a.vol.setData(candles.map((c) => ({ time: T(c.time), value: c.volume, color: (flow?.delta ? (c.buy || 0) >= (c.sell || 0) : c.close >= c.open) ? `rgba(16,185,129,${flow?.delta ? 0.6 : 0.35})` : `rgba(244,63,94,${flow?.delta ? 0.6 : 0.35})` })));
    a.l20.setData(e20.map((p) => ({ time: T(p.time), value: p.value }))); a.l50.setData(e50.map((p) => ({ time: T(p.time), value: p.value })));
    a.l20.applyOptions({ visible: m20 !== "off", lastValueVisible: m20 === "full" });
    a.l50.applyOptions({ visible: m50 !== "off", lastValueVisible: m50 === "full" });
    const m = [
      ...(mSmc === "off" ? [] : events.map((ev) => ({ time: ev.time, position: ev.dir === "up" ? "belowBar" : "aboveBar", color: ev.dir === "up" ? "#10b981" : "#f43f5e", shape: ev.dir === "up" ? "arrowUp" : "arrowDown", text: mSmc === "full" ? (ev.kind === "BOS" ? "Tiếp diễn" : ev.kind === "CHoCH" ? "Đảo chiều" : ev.kind) : "" }))),
      ...(marks || []), ...(flow?.marks || []),
    ].filter((x) => x.time >= first && x.time <= last).map((x) => ({ ...x, time: T(x.time) })).sort((x, y) => x.time - y.time);
    a.markers.setMarkers(m);
    if (fitted.current !== fitKey) { // đổi coin/khung → zoom ~120 nến gần nhất
      fitted.current = fitKey;
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - (compact ? 90 : 120)), to: candles.length + 6 });
    }
  }, [candles, e20, e50, events, marks, precision, fitKey, m20, m50, mSmc, compact, flow?.marks, flow?.delta]);

  // Tầng phụ dòng tiền: CVD (tầng 2) + OI (tầng 3) — dựng lại khi bật/tắt, cập nhật dữ liệu khi có nến mới
  const hasCvd = !!flow?.cvd, hasOi = !!flow?.oi;
  useEffect(() => {
    const a = api.current; if (!a) return;
    for (const k of ["cvdS", "oiS"]) if (a[k]) { a.chart.removeSeries(a[k]); a[k] = null; }
    for (let i = a.chart.panes().length - 1; i >= 1; i--) a.chart.removePane(i);
    let pane = 1;
    const sub = (color, title) => a.chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title, priceFormat: { type: "volume" } }, pane++);
    if (hasCvd) a.cvdS = sub("#0ea5e9", "Mua−bán cộng dồn");
    if (hasOi) a.oiS = sub("#a855f7", "Tiền lệnh mở $");
    const P = a.chart.panes(); P[0]?.setStretchFactor(P.length > 1 ? 3.2 : 1); for (let i = 1; i < P.length; i++) P[i].setStretchFactor(1);
  }, [hasCvd, hasOi]);
  useEffect(() => {
    const a = api.current; if (!a) return;
    const T = (t) => t + VN, first = candles[0]?.time ?? 0;
    if (a.cvdS && flow?.cvd) a.cvdS.setData(flow.cvd.map((p) => ({ time: T(p.time), value: p.value })));
    if (a.oiS && flow?.oi) { const sec = candles.length > 1 ? candles[1].time - candles[0].time : 0; const m = new Map(); for (const p of flow.oi) if (p.time >= first - sec) m.set(sec ? Math.floor(p.time / sec) * sec : p.time, p.value); a.oiS.setData([...m].sort((x, y) => x[0] - y[0]).map(([t, v]) => ({ time: T(t), value: v }))); }
  }, [flow?.cvd, flow?.oi, hasCvd, hasOi, candles]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    a.lines.forEach((pl) => a.candle.removePriceLine(pl));
    a.lines = lines.map((ln) => a.candle.createPriceLine({ price: ln.price, color: ln.color, lineWidth: ln.width || 1, lineStyle: ln.style ?? 2, axisLabelVisible: ln.axis !== false, title: ln.axis === false ? "" : ln.title }));
  }, [lines]);

  return (
    <div className="relative w-full">
      <div ref={box} className={className} />
      {flow?.badge && <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex flex-wrap gap-1 text-[10.5px] font-bold tabular-nums">{flow.badge}</div>}
      {edit && (
        <input autoFocus defaultValue={edit.value} maxLength={80} placeholder="Gõ ghi chú rồi Enter"
          onKeyDown={(e) => { if (e.key === "Enter") saveText(e.currentTarget.value); else if (e.key === "Escape") { e.stopPropagation(); saveText(edit.value); } }}
          onBlur={(e) => saveText(e.currentTarget.value)}
          style={{ left: Math.max(4, Math.min(edit.x, (box.current?.clientWidth || 300) - 190)), top: Math.max(4, edit.y - 30) }}
          className="absolute z-20 w-44 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[12px] text-slate-800 shadow outline-none" />
      )}
    </div>
  );
}

// Thanh công cụ vẽ (chỉ chủ): chọn công cụ, màu / sửa chữ / xoá hình đang chọn, ẩn tất cả, xoá hết của coin
const TOOL_ICON = { cursor: MousePointer2, hline: Minus, trend: Slash, rect: Square, fib: null, text: Type };
export function DrawBar({ tool, setTool, sel, setSel, hidden, setHidden, items, onChange, sym }) {
  const d = items.find((x) => x.id === sel);
  const recolor = (c) => onChange(items.map((x) => (x.id === sel ? { ...x, color: c } : x)));
  const clearAll = async () => {
    if (items.length && await ask(`Xoá hết ${items.length} hình vẽ của ${sym}?`, { ok: "Xoá hết", danger: true })) { onChange([]); setSel(null); }
  };
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] font-bold">
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {TOOLS.map(([k, label]) => {
          const I = TOOL_ICON[k];
          return (
            <button key={k} onClick={() => { setTool(k); if (hidden && k !== "cursor") setHidden(false); }} title={label} aria-label={label} aria-pressed={tool === k}
              className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${tool === k ? "bg-white text-indigo-600 shadow" : "text-slate-500 hover:text-slate-700"}`}>
              {I ? <I size={13} /> : <span className="text-[10.5px] font-extrabold">Fib</span>}
              {k !== "cursor" && k !== "fib" && <span className="hidden lg:inline">{label}</span>}
            </button>
          );
        })}
      </div>
      {d && (
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-0.5">
          {COLORS.map((c) => <button key={c} onClick={() => recolor(c)} aria-label={`Màu ${c}`} className={`h-3.5 w-3.5 rounded-full ring-offset-1 ${d.color === c ? "ring-2 ring-indigo-400" : ""}`} style={{ background: c }} />)}
          <button onClick={() => { onChange(items.filter((x) => x.id !== sel)); setSel(null); }} title="Xoá hình đang chọn (phím Delete)" aria-label="Xoá hình đang chọn" className="ml-0.5 rounded p-0.5 text-slate-500 hover:text-rose-600"><Trash2 size={13} /></button>
        </div>
      )}
      <button onClick={() => setHidden(!hidden)} aria-pressed={hidden} title={hidden ? "Hiện hình vẽ" : "Ẩn hình vẽ"} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-slate-500 hover:text-slate-700">{hidden ? <EyeOff size={13} /> : <Eye size={13} />}<span className="hidden sm:inline">{items.length} hình</span></button>
      {items.length > 0 && <button onClick={clearAll} className="rounded-md px-1.5 py-1 text-slate-400 hover:text-rose-600">Xoá hết {sym}</button>}
      <span className="ml-auto hidden text-[10.5px] font-semibold text-slate-400 md:inline">
        {tool === "cursor" ? <><Pencil size={10} className="inline" /> bấm hình để chọn, kéo để dời · bấm đúp sửa chữ · Delete xoá</> : tool === "hline" || tool === "text" ? "bấm 1 lần vào biểu đồ · Esc huỷ" : "bấm điểm đầu rồi điểm cuối · Esc huỷ"}
      </span>
    </div>
  );
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

const EMPTY = [], NOFLOW = {};
function GridCell({ i, cell, mkt, watch, tags, compact, focused, selected, active, ai, draw, onPick, onChange, onFocus, height, flowOn }) {
  const { sym, tf } = cell;
  const st = useCells(sym, tf, mkt, active);
  const ta = useMemo(() => (st.candles.length > 30 ? analyze(st.candles) : null), [st.candles]);
  const last = st.candles[st.candles.length - 1], prev = st.candles[st.candles.length - 2];
  const price = last?.close;
  const chg = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
  const lines = useMemo(() => buildLines({ levels: ta?.series.levels || [], ai, tags, compact }), [ta, ai, tags, compact]);
  const coins = watch.includes(sym) ? watch : [sym, ...watch];
  const { flow } = useFlow(sym, tf, st.market, st.candles, flowOn || NOFLOW);
  return (
    <div onPointerDownCapture={() => !selected && onPick(i)} className={`w-full min-w-0 shrink-0 snap-center rounded-xl border bg-white p-2 sm:w-auto ${selected ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
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
          <CandleChart candles={st.candles} e20={ta?.series.e20 || EMPTY} e50={ta?.series.e50 || EMPTY} events={ta?.series.events || EMPTY} marks={EMPTY} lines={lines} precision={precisionOf(price)} fitKey={st.key} tags={tags} compact={compact} syncKey={sym} draw={draw} flow={flow} className={`w-full ${height}`} />
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

export function ChartGrid({ grid, setGrid, mkt, watch, tags, active, aiFor, drawFor, onActive, flowOn }) {
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
            ai={aiFor(cells[i])} draw={drawFor?.(cells[i])} onPick={pick} onChange={change} onFocus={toggleFocus} height={height}
            flowOn={flowOn && (focus === i || n <= 2 ? flowOn : { ...flowOn, cvd: false, oi: false })} />
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
