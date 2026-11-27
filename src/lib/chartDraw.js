// Công cụ vẽ trên biểu đồ nến. 06/11 (đợt 2): đường ngang, xu hướng, vùng giá, Fibonacci, ghi chú.
// 27/11 (sếp: "đủ công cụ vẽ như TradingView, cả coin lẫn forex"): thêm tia, đường kéo dài 2 đầu, tia ngang, đường dọc,
// kênh song song, đường gấp khúc, bút vẽ tự do, vị thế Mua/Bán (vùng chốt lời/cắt lỗ + R:R), đo khoảng giá/thời gian,
// hồ sơ khối lượng vùng chọn, chú thích có mũi chỉ; mỗi hình chỉnh màu, độ dày, kiểu nét, khoá, nhân bản.
// Vẽ bằng "primitive" của lightweight-charts (1 lớp canvas trên nến). Điểm lưu theo THỜI GIAN (giây UTC như nến) + GIÁ
// → hình vẽ ở 1D vẫn hiện đúng chỗ khi xem 4H / 1H (đổi thời gian ↔ vị trí qua chỉ số nến, ngoài vùng nến thì ngoại suy).
// Lưu ở settings.coinDrawings[mã] (chỉ chủ — thành viên không nhận khoá này, xem qws_member_view). Forex dùng chung khoá (mã XAUUSD…).

// [khoá, tên, phím tắt (Alt + chữ, đọc theo e.code)]
export const TOOLS = [
  ["cursor", "Chọn / kéo", "Esc"],
  ["trend", "Đường xu hướng", "Alt+T"], ["ray", "Tia (kéo dài 1 đầu)", ""], ["xline", "Đường kéo dài 2 đầu", ""],
  ["hline", "Đường ngang", "Alt+H"], ["hray", "Tia ngang", "Alt+J"], ["vline", "Đường dọc", "Alt+V"],
  ["channel", "Kênh song song", "Alt+C"], ["path", "Đường gấp khúc", ""], ["brush", "Bút vẽ tự do", "Alt+B"],
  ["rect", "Vùng giá (hộp)", "Alt+R"], ["fib", "Fibonacci thoái lui", "Alt+F"],
  ["long", "Vị thế Mua (Long)", "Alt+L"], ["short", "Vị thế Bán (Short)", "Alt+S"],
  ["measure", "Đo khoảng giá / thời gian", "Alt+M"], ["vrp", "Hồ sơ khối lượng vùng chọn", ""],
  ["text", "Ghi chú chữ", "Alt+N"], ["callout", "Chú thích có mũi chỉ", ""],
];
export const TOOL_KEYS = Object.fromEntries(TOOLS.filter((t) => t[2].startsWith("Alt+")).map(([k, , s]) => [`Key${s.slice(4)}`, k]));
// Số lần bấm để vẽ xong: 1 điểm, 2 điểm, 3 điểm (kênh), nhiều điểm (gấp khúc: bấm lại điểm cuối / Enter để xong), kéo (bút vẽ)
export const CLICKS = { hline: 1, hray: 1, vline: 1, text: 1, channel: 3, path: "multi", brush: "drag" };
export const clicksOf = (t) => CLICKS[t] ?? 2;
export const HINT = {
  1: "bấm 1 lần vào biểu đồ", 2: "bấm điểm đầu rồi điểm cuối", 3: "bấm 2 điểm của đường, điểm thứ 3 để chọn độ rộng kênh",
  multi: "bấm từng điểm · bấm lại điểm cuối hoặc Enter để xong", drag: "giữ chuột / ngón tay và kéo để vẽ",
  long: "bấm điểm vào lệnh rồi bấm mức cắt lỗ (chốt lời tự đặt 2R, kéo để chỉnh)", short: "bấm điểm vào lệnh rồi bấm mức cắt lỗ (chốt lời tự đặt 2R, kéo để chỉnh)",
};
export const COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15", "#e2e8f0", "#64748b"];
const DEF_COLOR = {
  hline: "#f59e0b", hray: "#f59e0b", vline: "#94a3b8", trend: "#38bdf8", ray: "#38bdf8", xline: "#38bdf8", channel: "#38bdf8",
  path: "#a78bfa", brush: "#fb7185", rect: "#a78bfa", fib: "#94a3b8", text: "#e2e8f0", callout: "#38bdf8", measure: "#3b82f6",
  long: "#10b981", short: "#f43f5e", vrp: "#64748b",
};
export const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const MAX_PER_COIN = 150;
const MAX_PTS = 400; // bút vẽ: tối đa số điểm / nét (đủ mượt, không phình dữ liệu lưu cloud)
const HIT = 7; // px
const LONGPOS = { long: 1, short: 1 };
const uid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const FONT = "'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif";
const vn = (v, d = 2) => Number(v).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: d });
const DASH = { solid: [], dash: [6, 4], dot: [2, 3] };

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
  return { toL, toT, n, step };
}

// Khoảng cách điểm → đoạn thẳng
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const k = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
// Kéo dài đoạn (x1,y1)→(x2,y2) ra xa (canvas tự cắt ở mép)
const far = (x1, y1, x2, y2, k = 6000) => { const L = Math.hypot(x2 - x1, y2 - y1) || 1; return [x2 + ((x2 - x1) / L) * k, y2 + ((y2 - y1) / L) * k]; };
// Khoảng thời gian dạng chữ: "2 ngày 4 giờ", "45 phút"
export function durText(sec) {
  const m = Math.round(Math.abs(sec) / 60), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d} ngày${h ? ` ${h} giờ` : ""}`;
  if (h) return `${h} giờ${mm ? ` ${mm} phút` : ""}`;
  return `${mm} phút`;
}
const vnTime = (t) => { const d = new Date((t + 7 * 3600) * 1000), p = (x) => String(x).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };

// Hồ sơ khối lượng của các nến trong [ta, tb]: 24 tầng giá, POC (tầng nhiều nhất), vùng giá trị 70%
export function volProfile(candles, ta, tb, rows = 24) {
  const cs = candles.filter((c) => c.time >= ta && c.time <= tb);
  if (cs.length < 2) return null;
  let lo = Infinity, hi = -Infinity;
  for (const c of cs) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
  const step = (hi - lo) / rows || 1, bins = new Array(rows).fill(0);
  for (const c of cs) {
    const a = Math.max(0, Math.min(rows - 1, Math.floor((c.low - lo) / step))), b = Math.max(a, Math.min(rows - 1, Math.floor((c.high - lo) / step)));
    const share = (c.volume || 0) / (b - a + 1);
    for (let i = a; i <= b; i++) bins[i] += share;
  }
  const total = bins.reduce((s, v) => s + v, 0), max = Math.max(...bins), poc = bins.indexOf(max);
  const va = new Set([poc]); let acc = bins[poc], lo2 = poc, hi2 = poc;
  while (total && acc < total * 0.7 && (lo2 > 0 || hi2 < rows - 1)) {
    const dn = lo2 > 0 ? bins[lo2 - 1] : -1, up = hi2 < rows - 1 ? bins[hi2 + 1] : -1;
    if (up >= dn) { hi2++; va.add(hi2); acc += bins[hi2]; } else { lo2--; va.add(lo2); acc += bins[lo2]; }
  }
  return { lo, step, bins, max, poc, va, n: cs.length };
}

// ---- lớp vẽ ----
export class DrawLayer {
  constructor() {
    this.items = []; this.sel = null; this.preview = null; this.scale = makeScale([]); this.candles = [];
    this.chart = null; this.series = null; this.req = null; this.box = {};
    const self = this;
    this._pane = { zOrder: () => "top", renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => self.paint(context, mediaSize)) }) };
  }
  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.req = requestUpdate; }
  detached() { this.chart = null; this.series = null; this.req = null; }
  paneViews() { return [this._pane]; }
  updateAllViews() {}
  fmt(p) { // số kiểu Việt (61.751,10) theo số lẻ của mã — giống trục giá
    const prec = this.series?.options().priceFormat?.precision ?? 2;
    return Number(p).toLocaleString("vi-VN", { minimumFractionDigits: prec, maximumFractionDigits: prec });
  }
  priceAxisViews() { // nhãn trục giá: đường ngang / tia ngang luôn có; hình đang chọn → nhãn giá từng điểm
    if (!this.series) return [];
    const out = [], fmt = (p) => this.fmt(p);
    const add = (price, color) => { const y = this.series.priceToCoordinate(price); if (y != null) out.push({ coordinate: () => y, text: () => fmt(price), textColor: () => "#0b0c0f", backColor: () => color }); };
    for (const d of this.all()) if (d.type === "hline") add(d.price, d.color); else if (d.type === "hray" && d.p1) add(d.p1.price, d.color);
    const s = this.all().find((d) => d.id === this.sel);
    if (s && s.type !== "hline" && s.type !== "hray" && s.type !== "brush" && s.type !== "vline") (s.pts || [s.p1, s.p2, s.p3]).filter(Boolean).forEach((p) => add(p.price, s.color));
    return out;
  }
  all() { return this.preview ? [...this.items.filter((d) => d.id !== this.preview.id), this.preview] : this.items; }
  set(items, candles) { this.items = items || []; if (candles) { this.candles = candles; this.scale = makeScale(candles); } this.update(); }
  update() { this.req?.(); }
  x(t) { const l = this.scale.toL(t); return l == null ? null : this.chart?.timeScale().logicalToCoordinate(l) ?? null; }
  y(p) { return this.series?.priceToCoordinate(p) ?? null; }
  xy(p) { return p ? [this.x(p.t), this.y(p.price)] : [null, null]; }
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
    return { t: this.scale.toT(snap && c ? i : l), price };
  }
  // Tay nắm (chấm tròn) của hình đang chọn: [[phần, x, y]]
  handles(d) {
    if (d.type === "hline" || d.type === "brush") return [];
    if (d.pts) return d.pts.map((p, i) => [`k${i}`, ...this.xy(p)]);
    return ["p1", "p2", "p3"].filter((k) => d[k]).map((k) => [k, ...this.xy(d[k])]);
  }
  // Toạ độ 2 cạnh của kênh song song: cạnh gốc (p1-p2) và cạnh lệch theo p3
  chan(d) {
    const [x1, y1] = this.xy(d.p1), [x2, y2] = this.xy(d.p2), [x3, y3] = this.xy(d.p3);
    if ([x1, y1, x2, y2, x3, y3].some((v) => v == null)) return null;
    const dy = y3 - (x2 === x1 ? y1 : y1 + ((y2 - y1) * (x3 - x1)) / (x2 - x1));
    return { x1, y1, x2, y2, dy };
  }
  // tìm hình dưới chuột: { id, part: "p1" | "p2" | "p3" | "k<i>" | "body" }
  hit(x, y) {
    const list = [...this.all()].reverse();
    const W = this.chart?.timeScale().width() || 4000;
    for (const d of list) {
      if (d.id === this.sel) for (const [k, X, Y] of this.handles(d)) if (X != null && Y != null && Math.hypot(x - X, y - Y) < HIT + 2) return { id: d.id, part: k };
      const body = { id: d.id, part: "body" };
      if (d.type === "hline") { const yy = this.y(d.price); if (yy != null && Math.abs(y - yy) < HIT) return body; continue; }
      if (d.pts) {
        const P = d.pts.map((p) => this.xy(p));
        for (let i = 1; i < P.length; i++) if (P[i - 1][0] != null && P[i][0] != null && distSeg(x, y, ...P[i - 1], ...P[i]) < HIT) return body;
        continue;
      }
      const [x1, y1] = this.xy(d.p1), [x2, y2] = this.xy(d.p2);
      if (x1 == null || y1 == null) continue;
      if (d.type === "vline") { if (Math.abs(x - x1) < HIT) return body; continue; }
      if (d.type === "hray") { if (x >= x1 - HIT && Math.abs(y - y1) < HIT) return body; continue; }
      if (d.type === "text") { const b = this.box[d.id]; if (b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return body; continue; }
      if (x2 == null || y2 == null) continue;
      if (d.type === "callout") { const b = this.box[d.id]; if ((b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || distSeg(x, y, x1, y1, x2, y2) < HIT) return body; continue; }
      if (d.type === "trend" && distSeg(x, y, x1, y1, x2, y2) < HIT) return body;
      if (d.type === "ray" && distSeg(x, y, x1, y1, ...far(x1, y1, x2, y2)) < HIT) return body;
      if (d.type === "xline" && distSeg(x, y, ...far(x2, y2, x1, y1), ...far(x1, y1, x2, y2)) < HIT) return body;
      if (d.type === "channel") {
        const c = this.chan(d); if (!c) continue;
        if (distSeg(x, y, c.x1, c.y1, c.x2, c.y2) < HIT || distSeg(x, y, c.x1, c.y1 + c.dy, c.x2, c.y2 + c.dy) < HIT) return body;
        if (x >= Math.min(c.x1, c.x2) && x <= Math.max(c.x1, c.x2)) { const yl = c.y1 + ((c.y2 - c.y1) * (x - c.x1)) / ((c.x2 - c.x1) || 1); if (y >= Math.min(yl, yl + c.dy) && y <= Math.max(yl, yl + c.dy)) return body; }
        continue;
      }
      if ((d.type === "rect" || d.type === "measure" || d.type === "vrp") && x >= Math.min(x1, x2) - HIT && x <= Math.max(x1, x2) + HIT && (d.type === "vrp" || (y >= Math.min(y1, y2) - HIT && y <= Math.max(y1, y2) + HIT))) {
        if (d.type !== "vrp") return body;
        const b = this.box[d.id]; if (b && y >= b.top - HIT && y <= b.bot + HIT) return body;
      }
      if (d.type === "fib" && x >= Math.min(x1, x2) - HIT) for (const f of FIB) { const yy = this.y(d.p2.price + (d.p1.price - d.p2.price) * f); if (yy != null && Math.abs(y - yy) < HIT) return body; }
      if (LONGPOS[d.type] && d.p3) {
        const yt = this.y(d.p3.price);
        if (yt != null && x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y2, yt) - 2 && y <= Math.max(y2, yt) + 2) return body;
      }
    }
    return null;
  }
  label(ctx, text, x, y, bg, fg = "#fff", align = "center") { // nhãn chữ có nền bo góc, (x,y) = giữa cạnh dưới nếu center
    ctx.font = `bold 11px ${FONT}`;
    const w = ctx.measureText(text).width + 10, h = 17, left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.globalAlpha = 0.92; ctx.fillStyle = bg;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(left, y - h, w, h, 4); else ctx.rect(left, y - h, w, h); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.fillText(text, left + 5, y - 5);
  }
  paint(ctx, size) {
    if (!this.chart || !this.series) return;
    const fmt = (p) => this.fmt(p);
    ctx.save();
    for (const d of this.all()) {
      const sel = d.id === this.sel, col = d.color || DEF_COLOR[d.type];
      ctx.font = `11px ${FONT}`;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = (d.w || 1.25) + (sel ? 0.75 : 0); ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.setLineDash(DASH[d.dash] || []);
      const [x1, y1] = this.xy(d.p1), [x2, y2] = this.xy(d.p2);
      const seg = (a, b, c, e) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, e); ctx.stroke(); };
      const ok2 = x1 != null && y1 != null && x2 != null && y2 != null;
      if (d.type === "hline") {
        const y = this.y(d.price); if (y == null) continue;
        seg(0, y, size.width, y); ctx.setLineDash([]);
        if (d.text) ctx.fillText(d.text, 6, y - 4);
      } else if (d.type === "hray") {
        if (x1 == null || y1 == null) continue;
        seg(x1, y1, size.width, y1); ctx.setLineDash([]);
        ctx.fillText(d.text || fmt(d.p1.price), x1 + 4, y1 - 4);
      } else if (d.type === "vline") {
        if (x1 == null) continue;
        seg(x1, 0, x1, size.height); ctx.setLineDash([]);
        this.label(ctx, vnTime(d.p1.t), x1, size.height - 2, col, "#0b0c0f");
      } else if (d.pts) {
        const P = d.pts.map((p) => this.xy(p)).filter(([a, b]) => a != null && b != null);
        if (P.length < 1) continue;
        ctx.beginPath(); ctx.moveTo(...P[0]); for (const p of P.slice(1)) ctx.lineTo(...p); ctx.stroke();
      } else if (d.type === "text") {
        if (x1 == null || y1 == null) continue;
        ctx.font = `${sel ? "bold " : ""}12px ${FONT}`;
        const t = d.text || "Ghi chú", w = ctx.measureText(t).width;
        this.box[d.id] = { x: x1, y: y1 - 13, w, h: 16 };
        ctx.fillText(t, x1, y1);
      } else if (ok2) {
        if (d.type === "trend") seg(x1, y1, x2, y2);
        else if (d.type === "ray") seg(x1, y1, ...far(x1, y1, x2, y2));
        else if (d.type === "xline") seg(...far(x2, y2, x1, y1), ...far(x1, y1, x2, y2));
        else if (d.type === "channel") {
          const c = this.chan(d); if (!c) continue;
          ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.lineTo(c.x2, c.y2 + c.dy); ctx.lineTo(c.x1, c.y1 + c.dy); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1; seg(c.x1, c.y1, c.x2, c.y2); seg(c.x1, c.y1 + c.dy, c.x2, c.y2 + c.dy);
          ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.6; seg(c.x1, c.y1 + c.dy / 2, c.x2, c.y2 + c.dy / 2); ctx.globalAlpha = 1;
        } else if (d.type === "rect") {
          const L = Math.min(x1, x2), T = Math.min(y1, y2), W = Math.abs(x2 - x1), H = Math.abs(y2 - y1);
          ctx.globalAlpha = 0.14; ctx.fillRect(L, T, W, H); ctx.globalAlpha = 1; ctx.strokeRect(L, T, W, H);
          ctx.setLineDash([]); if (d.text) ctx.fillText(d.text, L + 4, T + 13);
        } else if (d.type === "fib") {
          const left = Math.min(x1, x2), hi = d.p1.price, lo = d.p2.price;
          ctx.setLineDash([4, 4]); seg(x1, y1, x2, y2); ctx.setLineDash(DASH[d.dash] || []);
          for (const f of FIB) {
            const p = lo + (hi - lo) * f, y = this.y(p); if (y == null) continue;
            ctx.globalAlpha = f === 0.5 || f === 0.618 ? 1 : 0.7;
            seg(left, y, size.width, y);
            ctx.fillText(`${f} (${fmt(p)})`, left + 4, y - 3);
          }
          ctx.globalAlpha = 1;
        } else if (d.type === "measure") {
          const up = d.p2.price >= d.p1.price, c2 = up ? "#3b82f6" : "#f43f5e";
          const L = Math.min(x1, x2), T = Math.min(y1, y2), W = Math.abs(x2 - x1), H = Math.abs(y2 - y1);
          ctx.fillStyle = c2; ctx.strokeStyle = c2; ctx.setLineDash([]);
          ctx.globalAlpha = 0.16; ctx.fillRect(L, T, W, H); ctx.globalAlpha = 1;
          ctx.lineWidth = 1; seg((x1 + x2) / 2, y1, (x1 + x2) / 2, y2); seg(x1, (y1 + y2) / 2, x2, (y1 + y2) / 2);
          const ah = y2 < y1 ? 1 : -1; ctx.beginPath(); ctx.moveTo((x1 + x2) / 2 - 4, y2 + 6 * ah); ctx.lineTo((x1 + x2) / 2, y2); ctx.lineTo((x1 + x2) / 2 + 4, y2 + 6 * ah); ctx.stroke();
          const dp = d.p2.price - d.p1.price, pct = d.p1.price ? (dp / d.p1.price) * 100 : 0, s = dp >= 0 ? "+" : "−";
          const bars = Math.round(this.scale.toL(d.p2.t) - this.scale.toL(d.p1.t));
          const txt = `${s}${fmt(Math.abs(dp))} (${s}${vn(Math.abs(pct))}%) · ${Math.abs(bars)} nến · ${durText(d.p2.t - d.p1.t)}`;
          this.label(ctx, txt, (x1 + x2) / 2, up ? T - 4 : T + H + 21, c2);
        } else if (d.type === "vrp") {
          const ta = Math.min(d.p1.t, d.p2.t), tb = Math.max(d.p1.t, d.p2.t), L = Math.min(x1, x2), R = Math.max(x1, x2);
          const vp = volProfile(this.candles, ta, tb);
          ctx.setLineDash([3, 3]); ctx.globalAlpha = 0.5; seg(L, 0, L, size.height); seg(R, 0, R, size.height); ctx.globalAlpha = 1; ctx.setLineDash([]);
          if (!vp) { this.box[d.id] = { top: 0, bot: size.height }; continue; }
          const bw = Math.max(30, (R - L) * 0.7);
          let top = Infinity, bot = -Infinity;
          for (let i = 0; i < vp.bins.length; i++) {
            const yt = this.y(vp.lo + (i + 1) * vp.step), yb = this.y(vp.lo + i * vp.step); if (yt == null || yb == null) continue;
            top = Math.min(top, yt); bot = Math.max(bot, yb);
            ctx.globalAlpha = vp.va.has(i) ? 0.55 : 0.25; ctx.fillStyle = vp.va.has(i) ? "#38bdf8" : col;
            ctx.fillRect(L, yt + 0.5, (vp.bins[i] / (vp.max || 1)) * bw, Math.max(1, yb - yt - 1));
          }
          ctx.globalAlpha = 1; this.box[d.id] = { top, bot };
          const pp = vp.lo + (vp.poc + 0.5) * vp.step, yp = this.y(pp);
          if (yp != null) { ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1.5; seg(L, yp, R, yp); this.label(ctx, `POC ${fmt(pp)}`, R, yp - 3, "#f43f5e", "#fff", "right"); }
        } else if (LONGPOS[d.type] && d.p3) {
          const yt = this.y(d.p3.price); if (yt == null) continue;
          const e = d.p1.price, sl = d.p2.price, tp = d.p3.price, L = Math.min(x1, x2), W = Math.max(8, Math.abs(x2 - x1));
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.2; ctx.fillStyle = "#10b981"; ctx.fillRect(L, Math.min(y1, yt), W, Math.abs(yt - y1));
          ctx.fillStyle = "#f43f5e"; ctx.fillRect(L, Math.min(y1, y2), W, Math.abs(y2 - y1)); ctx.globalAlpha = 1;
          ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1; seg(L, y1, L + W, y1);
          const pc = (p) => `${p >= e ? "+" : "−"}${vn(Math.abs(((p - e) / e) * 100))}%`;
          const rr = Math.abs(e - sl) ? Math.abs(tp - e) / Math.abs(e - sl) : 0, cx = L + W / 2;
          const tpUp = yt < y1;
          this.label(ctx, `Chốt lời ${fmt(tp)} (${pc(tp)})`, cx, tpUp ? yt - 3 : yt + 20, "#059669");
          this.label(ctx, `Cắt lỗ ${fmt(sl)} (${pc(sl)})`, cx, tpUp ? y2 + 20 : y2 - 3, "#e11d48");
          this.label(ctx, `${d.type === "long" ? "MUA" : "BÁN"} ${fmt(e)} · R:R ${vn(rr)}`, cx, y1 + (tpUp ? 20 : -3), "#334155");
        } else if (d.type === "callout") {
          ctx.setLineDash([]); seg(x1, y1, x2, y2);
          ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.font = `bold 12px ${FONT}`;
          const t = d.text || "Chú thích", w = ctx.measureText(t).width + 14, h = 22, bx = x2 - w / 2, by = y2 - h / 2;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 5); else ctx.rect(bx, by, w, h); ctx.fill();
          ctx.fillStyle = "#0b0c0f"; ctx.fillText(t, bx + 7, by + 15);
          this.box[d.id] = { x: bx, y: by, w, h };
        }
      }
      ctx.setLineDash([]);
      if (sel) { ctx.lineWidth = 1.5; ctx.strokeStyle = col; for (const [, X, Y] of this.handles(d)) if (X != null && Y != null) { ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, Math.PI * 2); ctx.fillStyle = d.lock ? col : "#0b0c0f"; ctx.fill(); ctx.stroke(); } }
    }
    ctx.restore();
  }
}

// Tạo hình mới từ điểm đầu tiên (các điểm sau đặt bằng stagePoint)
export function makeDrawing(type, p1, tf) {
  const base = { id: uid(), type, color: DEF_COLOR[type], tf, at: Date.now(), ...(type === "brush" ? { w: 2 } : {}) };
  if (type === "hline") return { ...base, price: p1.price };
  if (type === "text") return { ...base, p1, text: "" };
  if (type === "hray" || type === "vline") return { ...base, p1 };
  if (type === "path" || type === "brush") return { ...base, pts: [p1] };
  if (type === "channel" || LONGPOS[type]) return { ...base, p1, p2: p1, p3: p1 };
  if (type === "callout") return { ...base, p1, p2: p1, text: "" };
  return { ...base, p1, p2: p1 };
}
// Đặt điểm tiếp theo khi đang vẽ: stage = số điểm đã chốt
export function stagePoint(d, stage, p, scale) {
  if (d.type === "brush") return d.pts.length >= MAX_PTS ? d : { ...d, pts: [...d.pts, p] };
  if (d.pts) return { ...d, pts: [...d.pts.slice(0, stage), p] };
  if (LONGPOS[d.type]) { // điểm 2 = mức cắt lỗ; chốt lời tự đặt 2R; bề ngang ít nhất 12 nến
    const e = d.p1.price, minT = scale ? scale.toT(scale.toL(d.p1.t) + 12) : p.t, t = Math.max(p.t, minT);
    return { ...d, p2: { t, price: p.price }, p3: { t, price: e + 2 * (e - p.price) } };
  }
  if (stage === 1) return d.type === "channel" ? { ...d, p2: p, p3: p } : { ...d, p2: p };
  if (stage === 2) return { ...d, p3: p };
  return d;
}
// Kéo 1 tay nắm
export function setPoint(d, part, p) {
  if (part[0] === "k") { const i = Number(part.slice(1)); return { ...d, pts: d.pts.map((q, j) => (j === i ? p : q)) }; }
  if (LONGPOS[d.type] && part !== "p1") return { ...d, p2: { t: p.t, price: part === "p2" ? p.price : d.p2.price }, p3: { t: p.t, price: part === "p3" ? p.price : d.p3.price } };
  return { ...d, [part]: p };
}

// Dời cả hình: dl = lệch số nến, dp = lệch giá
export function moveDrawing(d, dl, dp, scale) {
  if (d.type === "hline") return { ...d, price: d.price + dp };
  const mv = (p) => (p ? { t: scale.toT(scale.toL(p.t) + dl), price: p.price + dp } : p);
  const o = { ...d };
  for (const k of ["p1", "p2", "p3"]) if (d[k]) o[k] = mv(d[k]);
  if (d.pts) o.pts = d.pts.map(mv);
  return o;
}
// Nhân bản: lệch 5 nến sang phải để thấy rõ bản mới
export const cloneDrawing = (d, scale) => ({ ...(scale?.n ? moveDrawing(d, 5, 0, scale) : d), id: uid(), at: Date.now(), lock: false });
