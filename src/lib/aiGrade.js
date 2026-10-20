// Tự chấm các lần AI phân tích (settings.coinAnalyses — đồng bộ mọi máy): tải nến SAU thời điểm phân tích (tối đa 100 nến
// cùng khung) rồi xem giá chạm TP1 hay SL trước. Cùng 1 nến chạm cả hai → tính SL (thận trọng, như bot demo).
// Phần còn lại của nến đang chạy lúc phân tích được bù bằng nến khung nhỏ hơn (để khung 1D/1W không bỏ sót cả ngày/tuần).
// Kết quả giữ trong bộ nhớ: đã chạm / hết 100 nến = cố định; chưa chạm = 5 phút rồi chấm lại.
import { fetchKlines, TF } from "./ta.js";

const FINE = { "5m": "1m", "15m": "5m", "1h": "5m", "4h": "15m", "1d": "1h", "1w": "4h" };
const MAX_BARS = 100, TTL = 5 * 60000;
const CACHE = new Map(), INFLIGHT = new Map();

// rec: { side: "LONG"|"SHORT"|null, entry, sl, tp } · bars: [{time(giây), high, low, close}] theo thứ tự thời gian
export function gradeBars(rec, bars) {
  const s = rec.side === "LONG" ? 1 : rec.side === "SHORT" ? -1 : 0;
  const entry = Number(rec.entry), sl = Number(rec.sl), tp = Number(rec.tp), risk = Math.abs(entry - sl);
  if (!s || !(entry > 0) || !(sl > 0) || !(tp > 0) || !risk || (tp - entry) * s <= 0 || (entry - sl) * s <= 0) return { outcome: "none", r: null, bars: 0 };
  let filled = false; // giá đã đi qua điểm vào chưa (AI hay đặt entry ở mép vùng chờ)
  for (let i = 0; i < bars.length; i++) {
    const k = bars[i];
    if (!filled && k.low <= entry && k.high >= entry) filled = true;
    const hitSl = s === 1 ? k.low <= sl : k.high >= sl, hitTp = s === 1 ? k.high >= tp : k.low <= tp;
    if (hitSl || hitTp) return { outcome: hitSl ? "sl" : "tp", r: hitSl ? -1 : Math.abs(tp - entry) / risk, hitAt: k.time * 1000, bars: i + 1, filled };
  }
  const last = bars[bars.length - 1];
  return { outcome: "open", r: last ? ((last.close - entry) * s) / risk : null, bars: bars.length, filled, last: last?.close ?? null };
}

export const cachedGrade = (rec) => CACHE.get(rec.id)?.res || null;

export function gradeRecord(rec) {
  const c = CACHE.get(rec.id);
  if (c && (c.final || Date.now() - c.at < TTL)) return Promise.resolve(c.res);
  if (INFLIGHT.has(rec.id)) return INFLIGHT.get(rec.id);
  const p = (async () => {
    let res = gradeBars(rec, []);
    if (res.outcome !== "none") {
      const tf = TF[rec.tf], opts = { market: rec.market === "futures" ? "futures" : "spot" };
      const main = await fetchKlines(rec.symbol, tf?.api || rec.tf, MAX_BARS, { ...opts, startTime: rec.at }); // nến mở SAU lúc phân tích
      const nextOpen = main.length ? main[0].time * 1000 : Date.now();
      const fine = FINE[rec.tf] && nextOpen > rec.at + 1000 ? await fetchKlines(rec.symbol, FINE[rec.tf], 100, { ...opts, startTime: rec.at, endTime: nextOpen - 1 }).catch(() => []) : [];
      res = gradeBars(rec, [...fine, ...main]);
      const closedAll = main.length >= MAX_BARS && tf && main[MAX_BARS - 1].time * 1000 + tf.ms <= Date.now();
      if (res.outcome === "open" && closedAll) res.expired = true; // hết 100 nến vẫn chưa chạm → chốt "Chưa chạm"
    }
    CACHE.set(rec.id, { at: Date.now(), res, final: res.outcome !== "open" || !!res.expired });
    return res;
  })().finally(() => INFLIGHT.delete(rec.id));
  INFLIGHT.set(rec.id, p);
  return p;
}

// Tổng hợp độ chính xác: đúng = chạm TP, sai = chạm SL, chưa rõ = chưa chạm / chưa chấm (bỏ qua bản không có kèo)
export function gradeSummary(recs, grades) {
  let ok = 0, bad = 0, unk = 0, none = 0, sumR = 0;
  for (const r of recs) {
    const g = grades[r.id];
    if (g?.outcome === "none" || (!g && !r.side)) { none++; continue; }
    if (g?.outcome === "tp") { ok++; sumR += g.r; } else if (g?.outcome === "sl") { bad++; sumR += g.r; } else unk++;
  }
  const n = ok + bad;
  return { ok, bad, unk, none, winRate: n ? (ok / n) * 100 : null, avgR: n ? sumR / n : null };
}
