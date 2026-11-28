// 28/11 (sếp: "làm tất cả bỏ số 3"): cài đặt hiển thị biểu đồ DÙNG CHUNG mọi chart (1 ô, lưới, tua lại, backtest),
// nhớ trên máy này — chỉ báo tầng riêng RSI / MACD, thang giá log, kiểu nến (nến thường / Heikin Ashi / đường).
import { useEffect, useState } from "react";

const KEY = "qws_chart_prefs", EV = "qws-chart-prefs";
export const PREF_DEF = { rsi: false, rsiN: 14, macd: false, log: false, style: "candle" };
export const STYLES = [["candle", "Nến"], ["ha", "Heikin Ashi"], ["line", "Đường"]];

export function loadPrefs() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return { ...PREF_DEF, ...(v && typeof v === "object" ? v : {}) }; } catch { return { ...PREF_DEF }; }
}
export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  next.rsiN = Math.min(50, Math.max(2, Math.round(Number(next.rsiN) || 14)));
  if (!STYLES.some(([k]) => k === next.style)) next.style = "candle";
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(EV, { detail: next }));
  return next;
}
export function useChartPrefs() {
  const [p, setP] = useState(loadPrefs);
  useEffect(() => { const f = (e) => setP(e.detail || loadPrefs()); window.addEventListener(EV, f); return () => window.removeEventListener(EV, f); }, []);
  return p;
}

// Nến Heikin Ashi (chỉ để XEM — lọc nhiễu, dễ thấy xu hướng; mọi tính toán, cảnh báo, hình vẽ vẫn theo giá thật)
export function heikinAshi(c) {
  const out = []; let po = null, pc = null;
  for (const x of c) {
    const close = (x.open + x.high + x.low + x.close) / 4;
    const open = po == null ? (x.open + x.close) / 2 : (po + pc) / 2;
    out.push({ time: x.time, open, high: Math.max(x.high, open, close), low: Math.min(x.low, open, close), close });
    po = open; pc = close;
  }
  return out;
}
