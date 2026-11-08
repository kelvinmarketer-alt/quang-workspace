// Nến đang chạy realtime qua WebSocket Binance (08/11: tab Thị trường trước chỉ tải lại REST 1 phút/lần → chart đứng giá).
// Futures dùng đường /market/stream (đường /stream cũ không còn gửi dữ liệu — thử 07–08/11). Nhiều ô cùng mã+khung dùng chung 1 kết nối.
import { useEffect, useRef } from "react";
import { pairOf } from "./ta.js";

const CONN = new Map(); // key → { ws, subs, dead, retry, last }

function join(pair, interval, fut, cb) {
  const key = `${fut ? "f" : "s"}|${pair}|${interval}`;
  let c = CONN.get(key);
  if (!c) {
    const st = `${pair.toLowerCase()}@kline_${interval}`;
    const url = fut ? `wss://fstream.binance.com/market/stream?streams=${st}` : `wss://stream.binance.com:9443/stream?streams=${st}`;
    c = { subs: new Set(), dead: false, retry: null, ws: null };
    const open = () => {
      c.ws = new WebSocket(url);
      c.ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        const k = (m.data || m).k; if (!k) return;
        const volume = +k.v, buy = +k.V;
        const bar = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume, buy, sell: Math.max(0, volume - buy) };
        c.subs.forEach((f) => f(bar, k.x));
      };
      c.ws.onclose = () => { if (!c.dead) c.retry = setTimeout(open, 3000); };
    };
    open();
    CONN.set(key, c);
  }
  c.subs.add(cb);
  return () => {
    c.subs.delete(cb);
    if (!c.subs.size) { c.dead = true; clearTimeout(c.retry); try { c.ws?.close(); } catch { /* đã đóng */ } CONN.delete(key); }
  };
}

// Ghép nến realtime vào mảng nến REST: cùng giờ mở → thay nến cuối; nến mới → thêm vào, giữ nguyên độ dài
export function mergeBar(candles, bar) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  if (bar.time === last.time) return [...candles.slice(0, -1), bar];
  if (bar.time > last.time) return [...candles.slice(1), bar];
  return candles;
}

// Gọi onBars(fn) tối đa 1 lần / every ms với nến mới nhất; nến vừa ĐÓNG thì đẩy ngay
export function useLiveKline(sym, interval, market, enabled, onBar, every = 1000) {
  const cb = useRef(onBar); cb.current = onBar;
  useEffect(() => {
    if (!enabled || !sym || !interval || !market) return;
    let pend = null, timer = null;
    const flush = () => { timer = null; if (pend) { const b = pend; pend = null; cb.current(b); } };
    const off = join(pairOf(sym), interval, market === "futures", (bar, closed) => {
      pend = bar;
      if (closed) { clearTimeout(timer); flush(); } else if (!timer) timer = setTimeout(flush, every);
    });
    return () => { off(); clearTimeout(timer); };
  }, [sym, interval, market, enabled, every]);
}
