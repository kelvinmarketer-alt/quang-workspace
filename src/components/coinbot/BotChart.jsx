// Tách từ pages/CoinBot.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { SW3_TP, sw3Targets } from "../../lib/sw3Targets.js";
import { TFS, loadKlines, symOf } from "../../lib/paperBot.js";
import { fmtNum } from "../../lib/format.js";
import { toT, tpLbl } from "./botShared.jsx";
import { useEffect, useRef, useState } from "react";

export function BotChart({ coin, tf, startAt, rawAt, trades, pending, live, ver, focus, trail }) {
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
