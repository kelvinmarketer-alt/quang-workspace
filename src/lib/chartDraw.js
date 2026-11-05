// Công cụ vẽ trên biểu đồ nến (06/11, đợt 2): đường ngang, đường xu hướng, hộp vùng giá, Fibonacci, ghi chú chữ.
// Vẽ bằng "primitive" của lightweight-charts (1 lớp canvas trên nến). Điểm lưu theo THỜI GIAN (giây UTC như nến) + GIÁ
// → hình vẽ ở 1D vẫn hiện đúng chỗ khi xem 4H / 1H (đổi thời gian ↔ vị trí qua chỉ số nến, ngoài vùng nến thì ngoại suy).
// Lưu ở settings.coinDrawings[coin] (chỉ chủ — thành viên không nhận khoá này, xem qws_member_view).

export const TOOLS = [
  ["cursor", "Chọn / kéo"], ["hline", "Đường ngang"], ["trend", "Xu hướng"], ["rect", "Vùng giá"], ["fib", "Fibonacci"], ["text", "Ghi chú"],
];
export const COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#e2e8f0"];
const DEF_COLOR = { hline: "#f59e0b", trend: "#38bdf8", rect: "#a78bfa", fib: "#94a3b8", text: "#e2e8f0" };
export const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const MAX_PER_COIN = 150;
const HIT = 7; // px
const uid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- thời gian ↔ chỉ số nến (logical) ----
export function makeScale(candles) {
  const T = candles.map((c) => c.time), n = T.length;
  const step = n > 1 ? T[n - 1] - T[n - 2] : 60;
  const toL = (t) => {
    if (!n) return null;
    if (t <= T[0]) return (t - T[0]) / step;
    if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / step;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return lo + (t - T[lo]) / (T[hi] - T[lo]);
  };
  const toT = (l) => {
    if (!n) return null;
    if (l <= 0) return Math.round(T[0] + l * step);
    if (l >= n - 1) return Math.round(T[n - 1] + (l - (n - 1)) * step);
    const i = Math.floor(l);
    return Math.round(T[i] + (l - i) * (T[i + 1] - T[i]));
  };
  return { toL, toT, n };
}

// Khoảng cách điểm → đoạn thẳng
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const k = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}

// ---- lớp vẽ ----
export class DrawLayer {
  constructor() {
    this.items = []; this.sel = null; this.preview = null; this.scale = makeScale([]);
    this.chart = null; this.series = null; this.req = null; this.textW = {};
    const self = this;
    this._pane = { zOrder: () => "top", renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => self.paint(context, mediaSize)) }) };
  }
  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.req = requestUpdate; }
  detached() { this.chart = null; this.series = null; this.req = null; }
  paneViews() { return [this._pane]; }
  updateAllViews() {}
  priceAxisViews() { // nhãn trục giá cho đường ngang + điểm của hình đang chọn
    if (!this.series) return [];
    const out = [], fmt = (p) => this.series.priceFormatter().format(p);
    const add = (price, color) => { const y = this.series.priceToCoordinate(price); if (y != null) out.push({ coordinate: () => y, text: () => fmt(price), textColor: () => "#0b0c0f", backColor: () => color }); };
    for (const d of this.all()) if (d.type === "hline") add(d.price, d.color);
    const s = this.all().find((d) => d.id === this.sel);
    if (s && s.type !== "hline") [s.p1, s.p2].filter(Boolean).forEach((p) => add(p.price, s.color));
    return out;
  }
  all() { return this.preview ? [...this.items.filter((d) => d.id !== this.preview.id), this.preview] : this.items; }
  set(items, candles) { this.items = items || []; if (candles) this.scale = makeScale(candles); this.update(); }
  update() { this.req?.(); }
  x(t) { const l = this.scale.toL(t); return l == null ? null : this.chart?.timeScale().logicalToCoordinate(l) ?? null; }
  y(p) { return this.series?.priceToCoordinate(p) ?? null; }
  // điểm (giây UTC + giá) từ toạ độ chuột; snap = hút vào giá mở/đóng/cao/thấp của nến gần nhất nếu cách < 8px
  pointAt(x, y, candles, snap = true) {
    const l = this.chart?.timeScale().coordinateToLogical(x);
    if (l == null) return null;
    let price = this.series.coordinateToPrice(y);
    if (price == null) return null;
    const i = Math.round(l), c = candles[i];
    if (snap && c) {
      let best = null;
      for (const v of [c.high, c.low, c.open, c.close]) { const yy = this.y(v); if (yy != null && Math.abs(yy - y) < 8 && (!best || Math.abs(yy - y) < best.d)) best = { v, d: Math.abs(yy - y) }; }
      if (best) price = best.v;
    }
    return { t: this.scale.toT(c ? i : l), price };
  }
  // tìm hình dưới chuột: { id, part: "p1" | "p2" | "body" }
  hit(x, y) {
    const list = [...this.all()].reverse();
    for (const d of list) {
      const P = (p) => (p ? [this.x(p.t), this.y(p.price)] : [null, null]);
      const [x1, y1] = P(d.p1), [x2, y2] = P(d.p2);
      if (d.id === this.sel) for (const [k, X, Y] of [["p1", x1, y1], ["p2", x2, y2]]) if (X != null && Y != null && Math.hypot(x - X, y - Y) < HIT + 2) return { id: d.id, part: k };
      if (d.type === "hline") { const yy = this.y(d.price); if (yy != null && Math.abs(y - yy) < HIT) return { id: d.id, part: "body" }; continue; }
      if (x1 == null || y1 == null) continue;
      if (d.type === "text") { const w = this.textW[d.id] || 60; if (x >= x1 - 4 && x <= x1 + w + 4 && y >= y1 - 16 && y <= y1 + 4) return { id: d.id, part: "body" }; continue; }
      if (x2 == null || y2 == null) continue;
      if (d.type === "trend" && distSeg(x, y, x1, y1, x2, y2) < HIT) return { id: d.id, part: "body" };
      if (d.type === "rect" && x >= Math.min(x1, x2) - HIT && x <= Math.max(x1, x2) + HIT && y >= Math.min(y1, y2) - HIT && y <= Math.max(y1, y2) + HIT) return { id: d.id, part: "body" };
      if (d.type === "fib" && x >= Math.min(x1, x2) - HIT) for (const f of FIB) { const yy = this.y(d.p2.price + (d.p1.price - d.p2.price) * f); if (yy != null && Math.abs(y - yy) < HIT) return { id: d.id, part: "body" }; }
    }
    return null;
  }
  paint(ctx, size) {
    if (!this.chart || !this.series) return;
    const fmt = (p) => this.series.priceFormatter().format(p);
    ctx.save();
    ctx.font = "11px 'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif";
    for (const d of this.all()) {
      const sel = d.id === this.sel, col = d.color || DEF_COLOR[d.type];
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = sel ? 2 : 1.25; ctx.setLineDash([]);
      const P = (p) => (p ? [this.x(p.t), this.y(p.price)] : [null, null]);
      const [x1, y1] = P(d.p1), [x2, y2] = P(d.p2);
      if (d.type === "hline") {
        const y = this.y(d.price); if (y == null) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.width, y); ctx.stroke();
        if (d.text) { ctx.fillText(d.text, 6, y - 4); }
      } else if (d.type === "text") {
        if (x1 == null || y1 == null) continue;
        ctx.font = `${sel ? "bold " : ""}12px 'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif`;
        const t = d.text || "Ghi chú"; this.textW[d.id] = ctx.measureText(t).width;
        ctx.fillText(t, x1, y1);
        ctx.font = "11px 'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif";
      } else if (x1 != null && y1 != null && x2 != null && y2 != null) {
        if (d.type === "trend") { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
        else if (d.type === "rect") {
          ctx.globalAlpha = 0.14; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          ctx.globalAlpha = 1; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          if (d.text) ctx.fillText(d.text, Math.min(x1, x2) + 4, Math.min(y1, y2) + 13);
        } else if (d.type === "fib") {
          const left = Math.min(x1, x2), hi = d.p1.price, lo = d.p2.price;
          ctx.beginPath(); ctx.setLineDash([4, 4]); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          for (const f of FIB) {
            const p = lo + (hi - lo) * f, y = this.y(p); if (y == null) continue;
            ctx.globalAlpha = f === 0.5 || f === 0.618 ? 1 : 0.7;
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(size.width, y); ctx.stroke();
            ctx.fillText(`${f} (${fmt(p)})`, left + 4, y - 3);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (sel) for (const [X, Y] of [[x1, y1], [x2, y2]]) if (X != null && Y != null) { ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#0b0c0f"; ctx.fill(); ctx.stroke(); ctx.fillStyle = col; }
    }
    ctx.restore();
  }
}

// Tạo hình mới từ 1 hoặc 2 điểm
export function makeDrawing(type, p1, p2, tf) {
  const base = { id: uid(), type, color: DEF_COLOR[type], tf, at: Date.now() };
  if (type === "hline") return { ...base, price: p1.price };
  if (type === "text") return { ...base, p1, text: "" };
  return { ...base, p1, p2: p2 || p1 };
}

// Dời cả hình: dl = lệch số nến, dp = lệch giá
export function moveDrawing(d, dl, dp, scale) {
  const mv = (p) => (p ? { t: scale.toT(scale.toL(p.t) + dl), price: p.price + dp } : p);
  return d.type === "hline" ? { ...d, price: d.price + dp } : { ...d, p1: mv(d.p1), p2: mv(d.p2) };
}
