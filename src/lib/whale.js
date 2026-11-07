// Dấu chân dòng tiền lớn trên biểu đồ (sếp duyệt 07/11) — chỉ HIỂN THỊ, không đổi luật bot.
// - CVD: cộng dồn (mua chủ động − bán chủ động) từ chính nến Binance (k[9] = khối lượng mua chủ động) → có lịch sử 300 nến.
// - OI (hợp đồng mở) theo khung, funding, tỉ lệ Long/Short tài khoản lớn: REST Binance Futures (sàn chỉ giữ ~30 ngày OI).
// - Lệnh lớn + thanh lý: WebSocket realtime (aggTrade / forceOrder) — sàn KHÔNG cho lịch sử, chỉ có từ lúc mở biểu đồ.
import { useEffect, useRef, useState } from "react";
import { pairOf } from "./ta.js";

const FAPI = "https://fapi.binance.com";
const OI_PERIOD = { "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1d" };
const TF_SEC = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };
// Ngưỡng "lệnh lớn" theo giá trị USD 1 lần khớp (gộp aggTrade): BTC/ETH thanh khoản rất dày nên ngưỡng cao hơn
export const bigMin = (sym) => ({ BTC: 500000, ETH: 250000, SOL: 150000, XAU: 150000, BNB: 100000, XRP: 100000, DOGE: 100000 })[sym] ?? 50000;

// CVD từ nến: [{ time, value }] — cộng dồn trong 300 nến đang hiện
export function cvdOf(candles) {
  let s = 0;
  return candles.map((c) => { s += (c.buy || 0) - (c.sell || 0); return { time: c.time, value: s }; });
}

const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`Binance ${r.status}`); return r.json(); };

// Lệnh lớn / thanh lý giữ theo mã trong bộ nhớ (đổi khung / phóng to ô vẫn còn), tối đa 400 mục mỗi loại
const STORE = new Map(); // pair → { big: [], liq: [] }
const storeOf = (pair) => { let s = STORE.get(pair); if (!s) STORE.set(pair, (s = { big: [], liq: [] })); return s; };

// Kết nối WebSocket chung: key = sàn|mã → { ws, subs, dead }; ô cuối cùng rời đi thì đóng
const WS = new Map();
function wsJoin(pair, fut, min, cb) {
  const key = `${fut ? "f" : "s"}|${pair}`;
  let c = WS.get(key);
  if (!c) {
    const s = storeOf(pair), lo = pair.toLowerCase();
    const url = fut ? `wss://fstream.binance.com/market/stream?streams=${lo}@aggTrade/${lo}@forceOrder` : `wss://stream.binance.com:9443/stream?streams=${lo}@aggTrade`; // Binance Futures chuyển luồng thị trường sang /market (đường /stream cũ không còn gửi — thử 07/11)
    c = { subs: new Set(), dead: false, retry: null, ws: null };
    const ping = () => c.subs.forEach((f) => f());
    const open = () => {
      c.ws = new WebSocket(url);
      c.ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        const d = m.data || m;
        if (d.e === "aggTrade") {
          const usd = +d.p * +d.q; if (usd < min) return;
          s.big.push({ t: Math.floor(d.T / 1000), price: +d.p, usd, buy: !d.m }); // m = bên mua là maker → lệnh BÁN chủ động
          if (s.big.length > 400) s.big.splice(0, s.big.length - 400);
          ping();
        } else if (d.e === "forceOrder") {
          const o = d.o, usd = +o.ap * +o.z || +o.p * +o.q;
          s.liq.push({ t: Math.floor(o.T / 1000), price: +o.ap || +o.p, usd, longLiq: o.S === "SELL" }); // lệnh SELL bắt buộc = long bị thanh lý
          if (s.liq.length > 400) s.liq.splice(0, s.liq.length - 400);
          ping();
        }
      };
      c.ws.onclose = () => { if (!c.dead) c.retry = setTimeout(open, 5000); };
    };
    open();
    WS.set(key, c);
  }
  c.subs.add(cb);
  return () => {
    c.subs.delete(cb);
    if (!c.subs.size) { c.dead = true; clearTimeout(c.retry); try { c.ws?.close(); } catch { /* đã đóng */ } WS.delete(key); }
  };
}

// on: { oi, big, liq } — chỉ mở kết nối cho lớp đang bật
export function useWhale(sym, tf, market, on) {
  const pair = pairOf(sym), fut = market === "futures";
  const [info, setInfo] = useState({ key: "", oi: [], funding: null, nextFunding: null, topLS: null, oiChg: null, err: "" });
  const [tick, setTick] = useState(0);
  const pend = useRef(false);
  // REST: OI theo khung + funding + L/S tài khoản lớn, làm mới 1 phút/lần
  useEffect(() => {
    if (!fut || !(on.oi || on.badge)) { setInfo((s) => ({ ...s, key: "", oi: [] })); return; }
    let off = false;
    const go = async () => {
      try {
        const p = OI_PERIOD[tf] || "1h";
        const [oi, prem, ls] = await Promise.all([
          getJson(`${FAPI}/futures/data/openInterestHist?symbol=${pair}&period=${p}&limit=500`).catch(() => []),
          getJson(`${FAPI}/fapi/v1/premiumIndex?symbol=${pair}`).catch(() => null),
          getJson(`${FAPI}/futures/data/topLongShortPositionRatio?symbol=${pair}&period=${p}&limit=1`).catch(() => []),
        ]);
        if (off) return;
        const pts = (oi || []).map((x) => ({ time: Math.floor(x.timestamp / 1000), value: +x.sumOpenInterestValue })).filter((x) => x.value > 0);
        const d1 = pts.length ? pts.findLast((x) => x.time <= pts[pts.length - 1].time - 86400) : null;
        setInfo({
          key: `${pair}-${tf}`, oi: pts,
          oiChg: d1 && pts.length ? (pts[pts.length - 1].value / d1.value - 1) * 100 : null,
          oiNow: pts.length ? pts[pts.length - 1].value : null,
          funding: prem ? +prem.lastFundingRate * 100 : null, nextFunding: prem ? +prem.nextFundingTime : null,
          topLS: ls?.[0] ? { ratio: +ls[0].longShortRatio, long: +ls[0].longAccount * 100 } : null, err: "",
        });
      } catch (e) { if (!off) setInfo((s) => ({ ...s, err: e.message })); }
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 60000);
    return () => { off = true; clearInterval(t); };
  }, [pair, tf, fut, on.oi, on.badge]);

  // WebSocket dùng chung theo mã (nhiều ô cùng coin chỉ 1 kết nối): lệnh lớn (aggTrade) + thanh lý (forceOrder, chỉ Futures)
  useEffect(() => {
    if (!on.big && !on.liq) return;
    const bump = () => { if (!pend.current) { pend.current = true; setTimeout(() => { pend.current = false; setTick((x) => x + 1); }, 1500); } };
    return wsJoin(pair, fut, bigMin(sym.toUpperCase().replace(/USDT$/, "")), bump);
  }, [pair, fut, on.big, on.liq, sym]);

  const s = storeOf(pair);
  return { ...info, big: s.big, liq: s.liq, tick, fut };
}

// Mốc lệnh lớn / thanh lý gộp theo nến → markers (thời gian UTC giây như nến; CandleChart tự cộng giờ VN)
export function flowMarks({ big, liq, tf, on, min, first }) {
  const sec = TF_SEC[tf] || 3600, out = [];
  if (on.big) {
    const g = new Map();
    for (const x of big) { const t = Math.floor(x.t / sec) * sec; if (t < first) continue; const k = `${t}|${x.buy ? 1 : 0}`; const v = g.get(k) || { t, buy: x.buy, usd: 0, n: 0 }; v.usd += x.usd; v.n++; g.set(k, v); }
    for (const v of g.values()) out.push({ time: v.t, position: v.buy ? "belowBar" : "aboveBar", color: v.buy ? "rgba(16,185,129,0.85)" : "rgba(244,63,94,0.85)", shape: "circle", size: Math.min(3, 0.6 + Math.log2(1 + v.usd / min) * 0.6), text: usdK(v.usd), id: `big${v.t}${v.buy}` });
  }
  if (on.liq) {
    const g = new Map();
    for (const x of liq) { const t = Math.floor(x.t / sec) * sec; if (t < first) continue; const k = `${t}|${x.longLiq ? 1 : 0}`; const v = g.get(k) || { t, longLiq: x.longLiq, usd: 0 }; v.usd += x.usd; g.set(k, v); }
    for (const v of g.values()) if (v.usd >= 10000) out.push({ time: v.t, position: v.longLiq ? "belowBar" : "aboveBar", color: v.longLiq ? "#f97316" : "#0ea5e9", shape: "square", size: Math.min(2.5, 0.6 + Math.log2(1 + v.usd / 50000) * 0.5), text: `${v.longLiq ? "TL long" : "TL short"} ${usdK(v.usd)}`, id: `liq${v.t}${v.longLiq}` });
  }
  return out;
}
export const usdK = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}K`).replace(".", ",");
