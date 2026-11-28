// Biểu đồ nến Coin (TradingView lightweight-charts) dùng chung cho tab Thị trường: 1 ô hoặc lưới 2 / 4 / 6 ô (05/11).
// - Nhãn bên phải bật/tắt TỪNG cái, mỗi cái 3 mức: có nhãn trục giá → chỉ đường → ẩn (nhớ trên máy này).
// - Lưới: mỗi ô coin + khung riêng, tự tải nến mỗi phút; ô đang chọn điều khiển AI / chỉ báo bên dưới.
// - Rê chuột ở 1 ô → các ô CÙNG COIN hiện vạch giá đó (đồng bộ qua bus trong module, không vẽ lại React).
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { Loader2, AlertTriangle, Maximize2, Minimize2, Tag, Link2, ChevronLeft, ChevronRight, Trash2, Eye, EyeOff, Pencil, Focus, Spline, Lock, Unlock, Copy, Undo2, Hand, GripHorizontal } from "lucide-react";
import { DrawLayer, makeDrawing, moveDrawing, stagePoint, setPoint, cloneDrawing, clicksOf, TOOLS, HINT, COLORS, MAX_PER_COIN } from "../lib/chartDraw.js";
import { DrawIcon } from "./DrawIcons.jsx";
import { ask } from "./ConfirmDialog.jsx";
import { TF, fetchKlines, analyze } from "../lib/ta.js";
import { fmtPx, fmtNum } from "../lib/format.js";
import { useWhale, cvdOf, flowMarks, bigMin, usdK } from "../lib/whale.js";
import { useLiveKline, mergeBar } from "../lib/liveKline.js";
import { fxDigits } from "../lib/mt5Source.js";
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
// Nút ẩn/hiện CẢ HAI đường EMA 20 + 50 (không phải xoay 3 mức)
export const emaOff = (tags) => (tags?.ema20 === "off" && tags?.ema50 === "off");
export const toggleEma = (setTags) => setTags((t) => { const off = !emaOff(t); const n = { ...t, ema20: off ? "off" : "line", ema50: off ? "off" : "line" }; saveTags(n); return n; });
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
// 28/11 (sếp: "trên điện thoại chưa tối ưu, không co kích thước chart như TradingView"):
// - Kéo tự do (nút bàn tay): 1 ngón kéo cả ngang lẫn dọc như TradingView (không cuộn trang khi chạm chart). Nhớ trên máy; toàn màn hình mặc định bật.
// - Thanh kéo dưới chart (resizeKey): kéo đổi chiều cao, bấm đúp về mặc định; nhớ riêng điện thoại / máy tính.
// - Điện thoại: nhãn mức giá chỉ hiện số trên trục (bỏ chữ dài như "Vùng KL lớn ↑" đè lên nến).
const PAN = { ...SCROLL, vertTouchDrag: true };
const lsNum = (k) => { try { const v = Number(localStorage.getItem(k)); return v > 0 ? v : null; } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch { /* bỏ qua */ } };
function usePhone() {
  const q = "(max-width: 639px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => { const m = window.matchMedia?.(q); if (!m) return undefined; const f = () => setOn(m.matches); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return on;
}
export function CandleChart({ onEma, candles, e20, e50, events, marks, lines, precision, fitKey, tags, compact, syncKey, draw, flow, className = "h-[300px] w-full sm:h-[420px]", wrapClass = "relative w-full", follow = false, resizeKey, panDefault = false }) {
  const box = useRef(null), api = useRef(null), fitted = useRef("");
  const phone = usePhone();
  const hKey = resizeKey ? `qws_chart_h_${resizeKey}_${phone ? "m" : "d"}` : null;
  const [hUser, setHUser] = useState(() => (hKey ? lsNum(hKey) : null));
  useEffect(() => { setHUser(hKey ? lsNum(hKey) : null); }, [hKey]);
  const [panSaved, setPanSaved] = useState(() => { try { return localStorage.getItem("qws_chart_pan") === "1"; } catch { return false; } });
  const pan = panDefault || panSaved;
  const panRef = useRef(pan); panRef.current = pan;
  const togglePan = () => { const v = !panSaved; setPanSaved(v); try { localStorage.setItem("qws_chart_pan", v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const startResize = (e) => {
    if (!box.current) return;
    e.preventDefault();
    const y0 = e.clientY, h0 = box.current.getBoundingClientRect().height, max = Math.round(window.innerHeight * 0.92);
    let last = h0;
    const mv = (ev) => { last = Math.round(Math.min(max, Math.max(200, h0 + ev.clientY - y0))); if (box.current) box.current.style.height = `${last}px`; };
    const upR = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upR); window.removeEventListener("pointercancel", upR); setHUser(last); lsSet(hKey, last); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", upR); window.addEventListener("pointercancel", upR);
  };
  const resetH = () => { setHUser(null); lsSet(hKey, null); if (box.current) box.current.style.height = ""; };
  const drawRef = useRef(draw); drawRef.current = draw;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const [edit, setEdit] = useState(null); // ô gõ chữ ghi chú: { id, x, y, value }
  const [note, setNote] = useState(null); // dòng báo ngắn trên biểu đồ (đặt cảnh báo giá xong / lỗi)
  useEffect(() => { if (note?.ok == null) return undefined; const t = setTimeout(() => setNote(null), 3500); return () => clearTimeout(t); }, [note]);
  const me = useRef(Math.random().toString(36).slice(2));
  const syncRef = useRef(syncKey); syncRef.current = syncKey;
  const compactRef = useRef(compact); compactRef.current = compact;
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
    const lock = (on) => { chart.applyOptions({ handleScroll: on ? false : panRef.current ? PAN : SCROLL, handleScale: !on }); el.style.touchAction = on || panRef.current ? "none" : ""; }; // đang vẽ trên điện thoại: chạm không cuộn trang
    a.lock = lock;
    const commit = (list) => drawRef.current?.onChange(list.slice(-MAX_PER_COIN));
    const onAxis = (x) => x > el.clientWidth - (chart.priceScale("right").width() || 0);
    // Căn lại: giá tự co giãn vừa nến đang hiện + về ~120 nến gần nhất (nút "Căn chart" và bấm đúp vào trục giá)
    a.refit = () => {
      const n = candlesRef.current.length; if (!n) return;
      chart.priceScale("right").applyOptions({ autoScale: true });
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - (compactRef.current ? 90 : 120)), to: n + 6 });
    };
    const axisDbl = (e) => { const r = el.getBoundingClientRect(); if (onAxis(e.clientX - r.left)) a.refit(); };
    el.addEventListener("dblclick", axisDbl);
    // pend = hình đang vẽ dở { d, stage (số điểm đã chốt), brush }
    const finish = (d) => {
      const D = drawRef.current; pend = null; layer.preview = null; layer.update();
      if (!D || !d) return;
      commit([...D.items, d]); D.setSel(d.id); D.setTool("cursor");
      if (d.type === "text" || d.type === "callout") { const p = d.type === "callout" ? d.p2 : d.p1; const x = layer.x(p.t), y = layer.y(p.price); setEdit({ id: d.id, x: x ?? 20, y: y ?? 40, value: "" }); }
    };
    const down = (e) => {
      const D = drawRef.current;
      if (!D || D.hidden || e.button > 0) return;
      const [x, y] = local(e), C = candlesRef.current;
      if (onAxis(x) || !C.length) return;
      if (D.tool === "alert") { // công cụ chuông: tạo cảnh báo giá tại mức bấm, không phải hình vẽ
        const p = layer.pointAt(x, y, C, false); if (!p) return;
        e.preventDefault(); e.stopPropagation(); D.setTool("cursor");
        const now = C[C.length - 1]?.close, fmtP = layer.fmt(p.price), op = now && p.price < now ? "≤" : "≥";
        setNote({ text: `Đang đặt cảnh báo ${op} ${fmtP}…`, ok: null });
        Promise.resolve(D.onAlert?.(p.price, now)).then((ok) => setNote({ text: ok ? `Đã đặt cảnh báo ${op} ${fmtP} — máy chủ báo về điện thoại khi chạm` : `Chưa đặt được cảnh báo ${op} ${fmtP} — xem thẻ Cảnh báo giá`, ok: !!ok }));
        return;
      }
      if (D.tool !== "cursor") {
        const n = clicksOf(D.tool);
        const p = layer.pointAt(x, y, C, n !== "drag"); if (!p) return;
        e.preventDefault(); e.stopPropagation();
        if (!pend) {
          const d = makeDrawing(D.tool, p, null, D.tf);
          if (n === 1) { finish(d); return; }
          pend = { d, stage: 1, brush: n === "drag" };
          layer.preview = d; layer.sel = d.id; layer.update(); return;
        }
        if (n === "multi") { // gấp khúc: bấm lại gần điểm cuối = xong
          const last = pend.d.pts[pend.stage - 1], lx = layer.x(last.t), ly = layer.y(last.price);
          if (pend.stage >= 2 && lx != null && Math.hypot(x - lx, y - ly) < 9) { finish({ ...pend.d, pts: pend.d.pts.slice(0, pend.stage) }); return; }
          pend.d = stagePoint(pend.d, pend.stage, p, layer.scale); pend.stage++;
          layer.preview = pend.d; layer.update(); return;
        }
        pend.d = stagePoint(pend.d, pend.stage, p, layer.scale); pend.stage++;
        if (pend.stage >= n) finish(pend.d); else { layer.preview = pend.d; layer.update(); }
        return;
      }
      const h = layer.hit(x, y);
      if (!h) { if (D.sel && D.items.some((d) => d.id === D.sel)) D.setSel(null); return; }
      e.preventDefault(); e.stopPropagation(); // không để biểu đồ kéo nến theo
      D.setSel(h.id); layer.sel = h.id; layer.update();
      const d0 = D.items.find((d) => d.id === h.id); if (!d0 || d0.lock) return; // hình đã khoá: chỉ chọn, không dời
      drag = { h, d0, l0: chart.timeScale().coordinateToLogical(x), p0: candle.coordinateToPrice(y), moved: false };
      lock(true);
    };
    const move = (e) => {
      const D = drawRef.current; if (!D) return;
      const [x, y] = local(e), C = candlesRef.current;
      if (pend) {
        const p = layer.pointAt(x, y, C, !pend.brush); if (!p) return;
        if (pend.brush) { // bút vẽ: thêm điểm khi đã đi ≥ 3px
          const last = pend.d.pts[pend.d.pts.length - 1], lx = layer.x(last.t), ly = layer.y(last.price);
          if (lx == null || Math.hypot(x - lx, y - ly) >= 3) { pend.d = stagePoint(pend.d, 0, p); layer.preview = pend.d; layer.update(); }
          return;
        }
        layer.preview = stagePoint(pend.d, pend.stage, p, layer.scale); layer.update(); return;
      }
      if (!drag) { if (e.target && el.contains(e.target)) el.style.cursor = D.hidden ? "" : D.tool !== "cursor" ? "crosshair" : layer.hit(x, y) ? "move" : ""; return; }
      let d;
      if (drag.h.part === "body") {
        const l = chart.timeScale().coordinateToLogical(x), p = candle.coordinateToPrice(y);
        if (l == null || p == null || drag.l0 == null || drag.p0 == null) return;
        d = moveDrawing(drag.d0, l - drag.l0, p - drag.p0, layer.scale);
      } else { const p = layer.pointAt(x, y, C); if (!p) return; d = setPoint(drag.d0, drag.h.part, p); }
      drag.moved = true; layer.preview = d; layer.update();
    };
    const up = () => {
      if (pend?.brush) { if (pend.d.pts.length >= 2) finish(pend.d); else { pend = null; layer.preview = null; layer.update(); } return; }
      if (!drag) return;
      const D = drawRef.current, d = layer.preview;
      lock(D && D.tool !== "cursor");
      if (drag.moved && d && D) commit(D.items.map((x) => (x.id === d.id ? d : x)));
      layer.preview = null; drag = null; layer.update();
    };
    const dbl = (e) => { // bấm đúp vào hình → sửa chữ (ghi chú, chú thích, đường ngang, tia ngang, hộp)
      const D = drawRef.current; if (!D || D.hidden || D.tool !== "cursor") return;
      const [x, y] = local(e), h = layer.hit(x, y); if (!h) return;
      const d = D.items.find((v) => v.id === h.id); if (!d || !["text", "callout", "hline", "hray", "rect"].includes(d.type)) return;
      e.stopPropagation(); D.setSel(d.id); setEdit({ id: d.id, x, y, value: d.text || "" });
    };
    const key = (e) => {
      const D = drawRef.current; if (!D) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable) return;
      if (pend && pend.d.type === "path" && (e.key === "Enter" || e.key === "Escape")) { if (pend.stage >= 2) finish({ ...pend.d, pts: pend.d.pts.slice(0, pend.stage) }); else { pend = null; layer.preview = null; layer.update(); D.setTool("cursor"); } return; }
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
      el.removeEventListener("pointerdown", down, true); el.removeEventListener("dblclick", dbl, true); el.removeEventListener("dblclick", axisDbl);
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
  }, [dTool, dHidden, pan]);
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
    } else if (follow) { // tua lại nến: đang xem sát mép phải → cuộn theo nến mới (đang kéo xem nến cũ thì để yên)
      const ts = a.chart.timeScale(), r = ts.getVisibleLogicalRange();
      if (r && r.to < candles.length + 2 && r.to > candles.length - 12) ts.setVisibleLogicalRange({ from: r.from + (candles.length + 6 - r.to), to: candles.length + 6 });
    }
  }, [candles, e20, e50, events, marks, precision, fitKey, m20, m50, mSmc, compact, flow?.marks, flow?.delta, follow]);

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

  // Chỉ vẽ lại khi NỘI DUNG đường đổi (08/11: nến chạy realtime làm mảng `lines` đổi tham chiếu mỗi giây → đường Vào/SL/TP nhấp nháy)
  const linesSig = JSON.stringify(lines);
  useEffect(() => {
    const a = api.current; if (!a) return;
    a.lines.forEach((pl) => a.candle.removePriceLine(pl));
    a.lines = lines.map((ln) => a.candle.createPriceLine({ price: ln.price, color: ln.color, lineWidth: ln.width || 1, lineStyle: ln.style ?? 2, axisLabelVisible: ln.axis !== false, title: ln.axis === false || phone ? "" : ln.title }));
  }, [linesSig, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={wrapClass}>
      <div ref={box} className={className} style={hUser ? { height: hUser, minHeight: 0 } : undefined} />
      <div className={`absolute ${resizeKey ? "bottom-9" : "bottom-7"} right-16 z-10 flex items-center gap-1`}>
        <button type="button" onClick={togglePan} disabled={panDefault} aria-pressed={pan} title={pan ? "Đang kéo tự do: 1 ngón kéo chart cả ngang lẫn dọc (không cuộn trang). Bấm để tắt" : "Bật kéo tự do: 1 ngón kéo chart cả ngang lẫn dọc như TradingView (đang tắt: vuốt dọc = cuộn trang)"} aria-label="Kéo tự do trên biểu đồ"
          className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] font-bold shadow-sm sm:hidden ${pan ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white/90 text-slate-500"}`}>
          <Hand size={12} />{pan ? "Kéo" : "Cuộn"}
        </button>
        {onEma && (
          <button type="button" onClick={onEma} aria-pressed={!emaOff(tags)} title={emaOff(tags) ? "Đang ẩn 2 đường trung bình (EMA 20/50). Bấm để hiện" : "Bấm để ẩn 2 đường trung bình (EMA 20/50)"} aria-label="Ẩn hiện đường EMA"
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] font-bold shadow-sm ${emaOff(tags) ? "border-dashed border-slate-300 bg-white/90 text-slate-400 line-through" : "border-slate-200 bg-white/90 text-slate-600 hover:text-indigo-600"}`}>
            <Spline size={12} />EMA
          </button>
        )}
        <button type="button" onClick={() => api.current?.refit?.()} title="Căn lại biểu đồ: giá tự co giãn vừa nến, về các nến gần nhất (hoặc bấm đúp vào trục giá)" aria-label="Căn lại biểu đồ"
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/90 px-1.5 py-1 text-[10.5px] font-bold text-slate-500 shadow-sm hover:text-indigo-600">
          <Focus size={12} /><span className="hidden sm:inline">Căn chart</span>
        </button>
      </div>
      {resizeKey && (
        <div role="separator" aria-orientation="horizontal" aria-label="Kéo để đổi chiều cao biểu đồ" title="Kéo lên / xuống để đổi chiều cao biểu đồ · bấm đúp về mặc định"
          onPointerDown={startResize} onDoubleClick={resetH}
          className="group flex h-5 cursor-ns-resize touch-none select-none items-center justify-center gap-1.5 text-slate-300 hover:text-indigo-500">
          <GripHorizontal size={16} /><span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 max-sm:opacity-100">{hUser ? `${hUser}px · bấm đúp về mặc định` : "kéo để đổi chiều cao"}</span>
        </div>
      )}
      {note && <div role="status" className={`pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-lg px-2.5 py-1 text-[11.5px] font-bold shadow ${note.ok === false ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}`}>{note.text}</div>}
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

// Thanh công cụ vẽ (chỉ chủ): chọn công cụ (18 loại, kiểu TradingView), chỉnh hình đang chọn (màu, độ dày, nét, khoá, nhân bản, xoá),
// hoàn tác, ẩn tất cả, xoá hết của mã. 27/11: thêm 13 công cụ + chỉnh kiểu nét.
const WIDTHS = [1, 2, 3], DASHES = [["solid", "Nét liền"], ["dash", "Nét đứt"], ["dot", "Nét chấm"]];
const NO_LINE = new Set(["text", "callout", "long", "short", "measure", "vrp"]);
export function DrawBar({ tool, setTool, sel, setSel, hidden, setHidden, items, onChange, sym, onUndo, canUndo, scale }) {
  const d = items.find((x) => x.id === sel);
  const patch = (o) => onChange(items.map((x) => (x.id === sel ? { ...x, ...o } : x)));
  const clearAll = async () => {
    if (items.length && await ask(`Xoá hết ${items.length} hình vẽ của ${sym}?`, { ok: "Xoá hết", danger: true })) { onChange([]); setSel(null); }
  };
  const btn = "flex shrink-0 items-center justify-center rounded-md p-1";
  const hint = tool === "cursor" ? null : HINT[tool] || HINT[clicksOf(tool)];
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] font-bold">
      <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-0.5 max-sm:w-[calc(100%-4.5rem)]" role="toolbar" aria-label="Công cụ vẽ">
        {TOOLS.map(([k, label, keys]) => (
          <button key={k} onClick={() => { setTool(tool === k && k !== "cursor" ? "cursor" : k); if (hidden && k !== "cursor") setHidden(false); }} title={`${label}${keys ? ` (${keys})` : ""}`} aria-label={label} aria-pressed={tool === k}
            className={`${btn} h-7 w-7 ${tool === k ? "bg-white text-indigo-600 shadow" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`}>
            <DrawIcon k={k} />
          </button>
        ))}
      </div>
      <button onClick={onUndo} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác" className={`${btn} h-7 w-7 text-slate-500 hover:text-slate-800 disabled:opacity-30`}><Undo2 size={14} /></button>
      {d && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-0.5">
          {COLORS.map((c) => <button key={c} onClick={() => patch({ color: c })} aria-label={`Màu ${c}`} className={`h-3.5 w-3.5 rounded-full ring-offset-1 ${d.color === c ? "ring-2 ring-indigo-400" : ""}`} style={{ background: c }} />)}
          {!NO_LINE.has(d.type) && (<>
            <span className="mx-0.5 h-4 w-px bg-slate-300" />
            {WIDTHS.map((w) => <button key={w} onClick={() => patch({ w })} title={`Độ dày ${w}`} aria-label={`Độ dày ${w}`} aria-pressed={(d.w || 1) === w} className={`${btn} h-6 w-6 ${(d.w || 1) === w ? "bg-white shadow" : ""}`}><span className="block w-3.5 rounded-full bg-slate-600" style={{ height: w + 0.5 }} /></button>)}
            {DASHES.map(([k, label]) => <button key={k} onClick={() => patch({ dash: k })} title={label} aria-label={label} aria-pressed={(d.dash || "solid") === k} className={`${btn} h-6 w-6 ${(d.dash || "solid") === k ? "bg-white shadow" : ""}`}><svg width="16" height="4" aria-hidden="true"><line x1="1" y1="2" x2="15" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray={k === "dash" ? "4 3" : k === "dot" ? "1.5 2.5" : undefined} strokeLinecap="round" className="text-slate-600" /></svg></button>)}
          </>)}
          <span className="mx-0.5 h-4 w-px bg-slate-300" />
          <button onClick={() => patch({ lock: !d.lock })} title={d.lock ? "Đang khoá (không kéo lệch được). Bấm để mở khoá" : "Khoá hình (tránh kéo lệch)"} aria-label={d.lock ? "Mở khoá" : "Khoá"} aria-pressed={!!d.lock} className={`${btn} h-6 w-6 ${d.lock ? "text-amber-600" : "text-slate-500"} hover:text-slate-800`}>{d.lock ? <Lock size={13} /> : <Unlock size={13} />}</button>
          <button onClick={() => { const c = cloneDrawing(d, scale); onChange([...items, c]); setSel(c.id); }} title="Nhân bản" aria-label="Nhân bản" className={`${btn} h-6 w-6 text-slate-500 hover:text-slate-800`}><Copy size={13} /></button>
          <button onClick={() => { onChange(items.filter((x) => x.id !== sel)); setSel(null); }} title="Xoá hình đang chọn (phím Delete)" aria-label="Xoá hình đang chọn" className={`${btn} h-6 w-6 text-slate-500 hover:text-rose-600`}><Trash2 size={13} /></button>
        </div>
      )}
      <button onClick={() => setHidden(!hidden)} aria-pressed={hidden} title={hidden ? "Hiện hình vẽ" : "Ẩn hình vẽ"} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-slate-500 hover:text-slate-700">{hidden ? <EyeOff size={13} /> : <Eye size={13} />}<span className="hidden sm:inline">{items.length} hình</span></button>
      {items.length > 0 && <button onClick={clearAll} className="rounded-md px-1.5 py-1 text-slate-400 hover:text-rose-600">Xoá hết {sym}</button>}
      <span className="ml-auto hidden text-[10.5px] font-semibold text-slate-400 md:inline">
        {hint ? `${TOOLS.find((t) => t[0] === tool)?.[1]}: ${hint} · Esc huỷ` : <><Pencil size={10} className="inline" /> bấm hình để chọn, kéo để dời · bấm đúp sửa chữ · Delete xoá · Ctrl+Z hoàn tác</>}
      </span>
    </div>
  );
}

// ---- Lưới nhiều biểu đồ ----
export const LAYOUTS = [1, 2, 4, 6];
const COIN_CELLS = [["BTC", "1w"], ["BTC", "1d"], ["BTC", "4h"], ["BTC", "1h"], ["ETH", "4h"], ["SOL", "4h"]].map(([sym, tf]) => ({ sym, tf }));
const FX_CELLS = [["XAUUSD", "1w"], ["XAUUSD", "1d"], ["XAUUSD", "4h"], ["XAUUSD", "1h"], ["EURUSD", "4h"], ["BTCUSD", "4h"]].map(([sym, tf]) => ({ sym, tf }));
export const FX_PRESET = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "US500"]; // "4 mã" của thị trường Forex
export function loadGrid(forex = false) {
  const g = ls.get(forex ? "qws_fx_grid" : "qws_mkt_grid", null) || {};
  const DEFAULT_CELLS = forex ? FX_CELLS : COIN_CELLS;
  const cells = Array.isArray(g.cells) ? g.cells.filter((c) => c && c.sym && TF[c.tf]) : [];
  return {
    n: LAYOUTS.includes(g.n) ? g.n : 1,
    cells: [...cells, ...DEFAULT_CELLS].slice(0, 6),
    active: Number.isInteger(g.active) && g.active >= 0 && g.active < 6 ? g.active : 0,
    link: !!g.link, labels: !!g.labels,
  };
}
export const saveGrid = (g, forex = false) => ls.set(forex ? "qws_fx_grid" : "qws_mkt_grid", g);

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
        for (const m of mkt === "mt5" ? ["mt5"] : [mkt, mkt === "futures" ? "spot" : "futures"]) {
          try {
            const c = await fetchKlines(sym, TF[tf].api, 300, { market: m });
            if (!off) setSt({ key: k, candles: c, market: m, err: "", loading: false });
            return;
          } catch (e) { if (!e.badSymbol) throw e; }
        }
        throw new Error(mkt === "mt5" ? `Không có ${sym} trên MT5` : `Không có ${sym}/USDT trên Binance`);
      } catch (e) { if (!off && !silent) setSt({ key: k, candles: [], market: "", err: e.message || String(e), loading: false }); }
    };
    go(false);
    const t = setInterval(() => { if (!document.hidden && activeRef.current) go(true); }, 60000);
    return () => { off = true; clearInterval(t); };
  }, [sym, tf, mkt]);
  // Nến đang chạy realtime (WebSocket chung theo mã+khung), lưới nhiều ô → 2 giây/lần cho nhẹ máy
  useLiveKline(sym, TF[tf].api, st.market, active && st.key === `${sym}-${tf}-${mkt}` && !!st.market, (bar) => setSt((s) => ({ ...s, candles: mergeBar(s.candles, bar) })), 2000);
  return st;
}

const EMPTY = [], NOFLOW = {};
function GridCell({ onEma, i, cell, mkt, watch, tags, compact, focused, selected, active, ai, draw, onPick, onChange, onFocus, height, flowOn, extra }) {
  const { sym, tf } = cell;
  const st = useCells(sym, tf, mkt, active);
  const ta = useMemo(() => (st.candles.length > 30 ? analyze(st.candles) : null), [st.candles]);
  const last = st.candles[st.candles.length - 1], prev = st.candles[st.candles.length - 2];
  const price = last?.close;
  const chg = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
  const lines = useMemo(() => [...buildLines({ levels: ta?.series.levels || [], ai, tags, compact }), ...(extra?.lines || EMPTY)], [ta, ai, tags, compact, extra]);
  const coins = watch.includes(sym) ? watch : [sym, ...watch];
  const { flow } = useFlow(sym, tf, st.market, st.candles, flowOn || NOFLOW);
  return (
    <div onPointerDownCapture={() => !selected && onPick(i)} className={`w-full min-w-0 shrink-0 snap-center rounded-xl border bg-white p-2 sm:w-auto ${selected ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-1.5" onDoubleClick={() => onFocus(i)}>
        <select value={sym} onChange={(e) => onChange(i, { sym: e.target.value })} aria-label={`Coin ô ${i + 1}`} className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[12px] font-extrabold text-slate-700">
          {coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className={`font-mono text-[12.5px] font-extrabold tabular-nums ${chg == null ? "text-slate-700" : chg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{px(price)}</span>
        {st.market && st.market !== mkt && st.market !== "mt5" && <span className="text-[10px] font-semibold text-amber-600">{st.market === "spot" ? "Spot" : "Futures"}</span>}
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
          <CandleChart onEma={onEma} candles={st.candles} e20={ta?.series.e20 || EMPTY} e50={ta?.series.e50 || EMPTY} events={ta?.series.events || EMPTY} marks={extra?.marks || EMPTY} lines={lines} precision={st.market === "mt5" ? fxDigits(sym) ?? precisionOf(price) : precisionOf(price)} fitKey={st.key} tags={tags} compact={compact} syncKey={sym} draw={draw} flow={flow} className={`w-full ${height}`} />
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

export function ChartGrid({ onEma, grid, setGrid, mkt, watch, tags, active, aiFor, drawFor, onActive, flowOn, extraFor, full = false }) {
  const { n, cells, link, labels } = grid;
  const [focus, setFocus] = useState(null);
  const scroller = useRef(null);
  const compact = n >= 4 && !labels && focus == null;
  const list = cells.slice(0, n);
  // full = chế độ toàn màn hình (27/11): ô cao theo màn hình thay vì số px cố định
  const height = full
    ? (focus != null || n === 2 ? "h-[calc(100dvh-215px)]" : "h-[calc(100dvh-215px)] sm:h-[calc(50dvh-118px)]")
    : focus != null ? "h-[340px] sm:h-[calc(100vh-280px)] sm:min-h-[460px]" : n === 2 ? "h-[300px] sm:h-[420px]" : n === 4 ? "h-[300px] sm:h-[310px]" : "h-[300px] sm:h-[260px]";
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
          <GridCell key={i} onEma={onEma} i={i} cell={cells[i]} mkt={mkt} watch={watch} tags={tags} compact={compact} focused={focus === i} selected={grid.active === i} active={active}
            ai={aiFor(cells[i])} draw={drawFor?.(cells[i])} onPick={pick} onChange={change} onFocus={toggleFocus} height={height}
            flowOn={flowOn && (focus === i || n <= 2 ? flowOn : { ...flowOn, cvd: false, oi: false })} extra={extraFor?.(cells[i].sym, cells[i].tf)} />
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
export function GridOptions({ grid, setGrid, sym, tf, forex = false }) {
  const preset = (kind) => {
    if (kind === "tf") {
      const tfs = ["1w", "1d", "4h", "1h"];
      setGrid({ ...grid, n: 4, link: true, active: Math.max(0, tfs.indexOf(tf)), cells: [...tfs.map((t) => ({ sym, tf: t })), ...grid.cells.slice(4)] });
    } else {
      const syms = [sym, ...(forex ? FX_PRESET : ["BTC", "ETH", "XAU", "SOL", "BNB"]).filter((s) => s !== sym)].slice(0, 4);
      setGrid({ ...grid, n: 4, link: false, active: 0, cells: [...syms.map((s) => ({ sym: s, tf })), ...grid.cells.slice(4)] });
    }
  };
  const btn = "flex items-center gap-1 rounded-md border px-1.5 py-0.5";
  return (<>
    <span className="mx-1 h-3 w-px bg-slate-200" />
    <button onClick={() => preset("tf")} className={`${btn} border-slate-200 bg-white text-slate-600 hover:border-indigo-300`}>{sym} · 4 khung</button>
    <button onClick={() => preset("coin")} className={`${btn} border-slate-200 bg-white text-slate-600 hover:border-indigo-300`}>{forex ? "4 mã" : "4 coin"} · {TF[tf]?.label}</button>
    <button onClick={() => setGrid({ ...grid, link: !grid.link })} aria-pressed={grid.link} title="Đổi mã ở 1 ô thì mọi ô đổi theo" className={`${btn} ${grid.link ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500"}`}><Link2 size={10} /> Cùng coin</button>
    {grid.n >= 4 && <button onClick={() => setGrid({ ...grid, labels: !grid.labels })} aria-pressed={grid.labels} title="Ô nhỏ mặc định chỉ vẽ đường, không vẽ nhãn ở trục giá" className={`${btn} ${grid.labels ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500"}`}><Tag size={10} /> Nhãn trục</button>}
  </>);
}
