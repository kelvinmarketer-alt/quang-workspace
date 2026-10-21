// Thẻ "Điểm kỹ thuật" tab Thị trường (21/10, tham khảo bố cục viaitrading): đồng hồ MUA/BÁN + 4 điểm thành phần
// + vùng tham khảo R:R 1:2 + đồng thuận đa khung + lực mua/bán (taker). Chỉ đọc chỉ báo — KHÔNG phải tín hiệu bot.
import { useEffect, useRef, useState } from "react";
import { Gauge, ChevronDown, Layers, Info } from "lucide-react";
import { Card } from "./ui.jsx";
import { analyze, fetchKlines } from "../lib/ta.js";
import { fmtPx, fmtNum } from "../lib/format.js";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sgn = (x, eps = 0) => (x > eps ? 1 : x < -eps ? -1 : 0);
const posOf = (s) => { const m = /^(\d+)%/.exec(s?.range100?.position || ""); return m ? Number(m[1]) / 100 : 0.5; };

// Phiếu bầu hướng (trọng số) → % MUA
function votes(s) {
  const t = s.trendFilter || {}, mo = s.momentum || {}, v = s.volume || {};
  const ev = s.structure?.lastEvent;
  return [
    [2, s.structure?.trend === "tăng" ? 1 : s.structure?.trend === "giảm" ? -1 : 0],
    [1.5, /^tăng/.test(s.ema?.stack || "") ? 1 : /^giảm/.test(s.ema?.stack || "") ? -1 : 0],
    [1.5, /^trên/.test(t.priceVsEma200 || "") ? 1 : /^dưới/.test(t.priceVsEma200 || "") ? -1 : 0],
    [1, sgn(mo.macdHist ?? 0)],
    [1, mo.rsi == null ? 0 : mo.rsi > 55 ? 1 : mo.rsi < 45 ? -1 : 0],
    [1, t.diPlus == null || t.diMinus == null ? 0 : sgn(t.diPlus - t.diMinus, 2)],
    [1, v.buyRatio20 == null ? 0 : v.buyRatio20 > 0.52 ? 1 : v.buyRatio20 < 0.48 ? -1 : 0],
    [1, ev && ev.barsAgo <= 30 ? (ev.dir === "phá lên" ? 1 : -1) : 0],
  ];
}
export function biasOf(s) {
  const vs = votes(s), tot = vs.reduce((a, [w]) => a + w, 0);
  const buy = vs.reduce((a, [w, x]) => a + (x > 0 ? w : x === 0 ? w / 2 : 0), 0);
  const buyPct = Math.round((buy / tot) * 100);
  return { buyPct, dir: buyPct >= 60 ? 1 : buyPct <= 40 ? -1 : 0 };
}

// Điểm thành phần theo hướng d (cùng thước bot: không đuổi giá ≤1,5 ATR từ EMA50, vùng Key Volume, SL ≥ 2 ATR, R:R 1:2)
function partsOf(s, d) {
  const t = s.trendFilter || {}, mo = s.momentum || {}, v = s.volume || {}, ev = s.structure?.lastEvent;
  const al = (x) => (x === d ? 1 : 0);
  const structure = 10 * al(s.structure?.trend === "tăng" ? 1 : s.structure?.trend === "giảm" ? -1 : 0)
    + 6 * al(/^tăng/.test(s.ema?.stack || "") ? 1 : /^giảm/.test(s.ema?.stack || "") ? -1 : 0)
    + 5 * al(/^trên/.test(t.priceVsEma200 || "") ? 1 : /^dưới/.test(t.priceVsEma200 || "") ? -1 : 0)
    + 4 * al(ev && ev.barsAgo <= 30 ? (ev.dir === "phá lên" ? 1 : -1) : 0);
  const rsi = mo.rsi ?? 50, rsiOk = d === 1 ? (rsi >= 50 && rsi <= 70 ? 5 : rsi > 70 ? 2 : 0) : (rsi <= 50 && rsi >= 30 ? 5 : rsi < 30 ? 2 : 0);
  const momentum = Math.round(8 * clamp((t.adx ?? 0) / 40)) + 4 * al(sgn(mo.macdHist ?? 0)) + 3 * al(sgn((mo.macdHist ?? 0) - (mo.macdHistPrev ?? 0))) + rsiOk;
  const atr = s.volatility?.atr || 0, price = s.price, e50 = s.ema?.e50;
  const ext = atr && e50 ? Math.abs(price - e50) / atr : 9;
  const kv = s.keyVolume?.maxVolume100, pos = posOf(s);
  const inKv = kv && price <= kv.top && price >= kv.bottom ? 5 : kv && atr && Math.min(Math.abs(price - kv.top), Math.abs(price - kv.bottom)) <= atr ? 2 : 0;
  const entry = Math.round(6 * clamp((3 - ext) / 1.5)) + inKv + ((d === 1 ? pos < 0.5 : pos > 0.5) ? 4 : 0);
  const br = v.buyRatio20 ?? 0.5, up = v.upCandleVolShare20 ?? 0.5;
  const align = (x) => clamp(d === 1 ? (x - 0.45) / 0.15 : (0.55 - x) / 0.15);
  const volume = Math.round(8 * align(br) + 4 * align(up)) + ((v.relVolLastClosed ?? 0) >= 1 ? 3 : 0);
  return [
    { k: "Cấu trúc", v: structure, max: 25, color: "#22d3ee", hint: "Xu hướng swing · EMA20/50/200 · giá so EMA200 · BOS/CHoCH gần nhất" },
    { k: "Động lượng", v: momentum, max: 20, color: "#a78bfa", hint: "ADX · MACD cùng hướng & đang mở rộng · RSI chưa quá mua/bán" },
    { k: "Điểm vào", v: entry, max: 15, color: "#fbbf24", hint: "Không đuổi giá (≤1,5 ATR từ EMA50 như bot) · gần vùng Key Volume · vùng rẻ/đắt 100 nến" },
    { k: "Khối lượng", v: volume, max: 15, color: "#34d399", hint: "Tỉ lệ mua chủ động 20 nến · volume nến tăng/giảm · volume nến vừa đóng ≥ TB20" },
  ];
}

// Vùng tham khảo: vào ở giá hiện tại, SL sau đáy/đỉnh swing gần nhất nhưng ≥ 2 ATR (như bot), TP = 2R
function planOf(s, d) {
  const atr = s.volatility?.atr, price = s.price;
  if (!d || !atr || !price) return null;
  const swing = d === 1 ? s.liquidity?.nearestLowsBelow?.[0] : s.liquidity?.nearestHighsAbove?.[0];
  const slSwing = swing != null ? swing - d * 0.2 * atr : null;
  const slMin = price - d * 2 * atr;
  const sl = slSwing != null && (price - slSwing) * d > (price - slMin) * d ? slSwing : slMin;
  const risk = Math.abs(price - sl);
  return { entry: price, sl, tp: price + d * 2 * risk, riskPct: (risk / price) * 100 };
}

function Arc({ pct, color, size = 220, stroke = 16, children }) {
  const r = (size - stroke) / 2, c = Math.PI * r, h = size / 2 + stroke / 2;
  return (
    <div className="relative mx-auto" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} className="overflow-visible">
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-slate-100" />
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * clamp(pct / 100)} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  );
}

const TFS_MTF = [["1d", "D1"], ["4h", "H4"], ["1h", "H1"], ["15m", "M15"], ["5m", "M5"]];
const BOT_TF = new Set(["15m", "5m"]);
const MTF = new Map(); // nhớ 5 phút theo coin|sàn

export default function CoinSignal({ sym, tf, market, summary: s, stale, active }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("qws_mkt_sig") !== "0"; } catch { return true; } });
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem("qws_mkt_sig", v ? "1" : "0"); } catch {} };
  const mkey = `${sym}|${market}`;
  const [mtf, setMtf] = useState(() => MTF.get(mkey)?.rows || null);
  const keyRef = useRef(mkey); keyRef.current = mkey;
  useEffect(() => {
    if (!active || !open || !market) return undefined;
    let off = false;
    const go = async () => {
      const c = MTF.get(mkey);
      if (c && Date.now() - c.at < 300000) { setMtf(c.rows); return; }
      setMtf(c?.rows || null);
      const rows = await Promise.all(TFS_MTF.map(async ([k, label]) => {
        try { const K = await fetchKlines(sym, k, 300, { market }); if (K.length < 60) return { k, label, na: true }; return { k, label, ...biasOf(analyze(K).summary) }; }
        catch { return { k, label, na: true }; }
      }));
      MTF.set(mkey, { at: Date.now(), rows });
      if (!off && keyRef.current === mkey) setMtf(rows);
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 300000);
    return () => { off = true; clearInterval(t); };
  }, [mkey, active, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;
  const b = biasOf(s), d = b.dir || (b.buyPct >= 50 ? 1 : -1);
  const parts = partsOf(s, d), plan = planOf(s, b.dir);
  const color = b.dir === 1 ? "#10b981" : b.dir === -1 ? "#f43f5e" : "#f59e0b";
  const strength = b.dir === -1 ? 100 - b.buyPct : b.dir === 1 ? b.buyPct : Math.max(b.buyPct, 100 - b.buyPct);
  const word = b.dir === 1 ? "NGHIÊNG MUA" : b.dir === -1 ? "NGHIÊNG BÁN" : "TRUNG TÍNH";
  const br = s.volume?.buyRatio20 != null ? Math.round(s.volume.buyRatio20 * 100) : null;
  const tfLabel = (TFS_MTF.find(([k]) => k === tf) || [, tf.toUpperCase()])[1];
  const agree = mtf ? mtf.filter((r) => !r.na && r.dir === b.dir && b.dir !== 0).length : 0, known = mtf ? mtf.filter((r) => !r.na).length : 0;

  return (
    <Card className={`!p-3 sm:!p-4 transition-opacity ${stale ? "opacity-40" : ""}`}>
      <button onClick={toggle} className="flex w-full items-center gap-2 text-left">
        <Gauge size={16} className="shrink-0 text-cyan-500" />
        <span className="text-[13px] font-extrabold uppercase tracking-wide text-slate-800">Điểm kỹ thuật</span>
        <span className="rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[10.5px] font-bold text-cyan-700">{sym}/USDT · {tfLabel}</span>
        {!open && <span className="text-[12px] font-extrabold" style={{ color }}>{word} {strength}%</span>}
        <span className="ml-auto hidden text-[11px] font-semibold text-slate-400 sm:inline">chỉ đọc chỉ báo — không phải tín hiệu bot</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-[1.25fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 pb-3 pt-4">
              <Arc pct={strength} color={color}>
                <div className="text-4xl font-black tabular-nums" style={{ color }}>{strength}%</div>
                <div className="mt-1 rounded-lg border px-3 py-0.5 text-[13px] font-black tracking-wide" style={{ color, borderColor: color + "66", background: color + "14" }}>{word}</div>
              </Arc>
              <div className="mt-2 text-center text-[11px] text-slate-400">{b.buyPct}% phiếu MUA · {100 - b.buyPct}% BÁN (cấu trúc, EMA, EMA200, MACD, RSI, DMI, lực mua, BOS)</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-extrabold uppercase tracking-wide text-amber-600">Vùng tham khảo</span>
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-1.5 text-[10.5px] font-bold text-cyan-700">R:R 1:2</span>
              </div>
              {plan ? (
                <>
                  <div className="text-2xl font-black tabular-nums text-amber-500">{fmtPx(plan.entry)}</div>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px]"><span className="font-bold text-rose-600">Cắt lỗ (SL)</span><span className="font-extrabold tabular-nums text-rose-600">{fmtPx(plan.sl)}</span></div>
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px]"><span className="font-bold text-emerald-600">Chốt lời (2R)</span><span className="font-extrabold tabular-nums text-emerald-600">{fmtPx(plan.tp)}</span></div>
                  </div>
                  <div className="mt-1.5 text-[10.5px] leading-snug text-slate-400">SL sau swing gần nhất, tối thiểu 2 ATR (như bot) · cách giá {fmtNum(plan.riskPct, 2)}%</div>
                </>
              ) : <div className="py-4 text-center text-[12px] text-slate-500">Chưa nghiêng rõ phía nào → đứng ngoài, chờ thêm xác nhận.</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {parts.map((p) => (
              <div key={p.k} title={p.hint} className="rounded-xl border border-slate-200 bg-slate-50/60 px-2 pb-2 pt-2.5">
                <div className="mb-1 text-center text-[11px] font-extrabold uppercase tracking-wide" style={{ color: p.color }}>{p.k}</div>
                <Arc pct={(p.v / p.max) * 100} color={p.color} size={112} stroke={9}>
                  <div className="text-lg font-black tabular-nums" style={{ color: p.color }}>{Math.round((p.v / p.max) * 100)}%</div>
                </Arc>
                <div className="mt-0.5 text-center text-[10.5px] tabular-nums text-slate-400">{p.v}/{p.max}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              <Layers size={13} /> Đồng thuận đa khung {mtf && b.dir !== 0 && <span className="normal-case tracking-normal text-slate-400">· {agree}/{known} khung cùng hướng</span>}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TFS_MTF.map(([k, label]) => {
                const r = mtf?.find((x) => x.k === k), on = k === tf;
                const tone = !r || r.na ? "text-slate-400" : r.dir === 1 ? "text-emerald-600" : r.dir === -1 ? "text-rose-600" : "text-amber-600";
                const bd = !r || r.na ? "border-slate-200" : r.dir === 1 ? "border-emerald-200 bg-emerald-50" : r.dir === -1 ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
                return (
                  <div key={k} className={`rounded-lg border px-1 py-1.5 text-center ${bd} ${on ? "ring-2 ring-cyan-400/60" : ""}`}>
                    <div className="text-[10.5px] font-bold text-slate-500">{label}{k === "1d" ? " · bias bot" : BOT_TF.has(k) ? " · bot" : ""}</div>
                    <div className={`text-[12px] font-extrabold ${tone}`}>{!r ? "…" : r.na ? "—" : r.dir === 1 ? `MUA ${r.buyPct}%` : r.dir === -1 ? `BÁN ${100 - r.buyPct}%` : "Trung tính"}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {br != null && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide">
                <span className="text-emerald-600">Phe mua {br}%</span>
                <span className="flex items-center gap-1 normal-case tracking-normal text-slate-400" title="Khối lượng khớp chủ động (taker) 20 nến gần nhất trên Binance"><Info size={11} /> lực mua/bán chủ động 20 nến</span>
                <span className="text-rose-600">{100 - br}% Phe bán</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${br}%` }} />
                <div className="bg-gradient-to-r from-rose-400 to-rose-600" style={{ width: `${100 - br}%` }} />
              </div>
            </div>
          )}
          <div className="text-[10.5px] text-slate-400">Chấm điểm tự động từ chỉ báo trên nến Binance, để đọc nhanh bối cảnh. Bot chỉ vào khi có setup (Thuận xu hướng / SFP / Breakout / SMC) + thuận D1 + vùng Key Volume. Không phải tư vấn đầu tư.</div>
        </div>
      )}
    </Card>
  );
}
