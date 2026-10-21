// Thống kê & so sánh cho tab "Bot thật" (hàm thuần, không phụ thuộc React).
// Lịch sử lệnh thật: dòng 'history' của bảng qws_live_bot = { trades: [{ id, coin, tf, setup, side, lim, exit, sl, tp, qty,
// riskUsd, openedAt, exitAt, pnl, R, reason, mode }], updatedAt } — id cùng dạng với lệnh Demo: `${coin}-${tf}-${signalAt}-${setup}`.
import { statsOf, TFS, SETUPS } from "./paperBot.js";
import { fmtNum } from "./format.js";

const fin = (v) => v != null && v !== "" && isFinite(Number(v));
export const setupName = (k) => SETUPS[k]?.label.split(" (")[0] || k || "";
// lúc đóng nến tín hiệu lấy từ id (phần thứ 3)
export const sigAtOf = (id) => { const n = Number(String(id || "").split("-")[2]); return n > 1e12 ? n : null; };

// Chuẩn hoá 1 lệnh thật về dạng statsOf() hiểu (r theo R, entryAt/exitAt theo ms)
export function normLive(t, fallbackMode) {
  const side = t.side === -1 || t.side === "-1" || /^(SHORT|SELL)$/i.test(String(t.side)) ? -1 : 1;
  const entry = fin(t.entry) ? +t.entry : fin(t.lim) ? +t.lim : null;
  const pnl = fin(t.pnl) ? +t.pnl : null, riskUsd = fin(t.riskUsd) ? +t.riskUsd : null;
  const exitAt = fin(t.exitAt) ? +t.exitAt : null;
  let r = fin(t.R) ? +t.R : fin(t.r) ? +t.r : pnl != null && riskUsd > 0 ? pnl / riskUsd : null;
  if (exitAt == null) r = null; // còn mở → chưa tính vào thống kê
  const signalAt = fin(t.signalAt) ? +t.signalAt : sigAtOf(t.id);
  const entryAt = fin(t.openedAt) ? +t.openedAt : signalAt ?? exitAt;
  return { ...t, side, entry, exit: fin(t.exit) ? +t.exit : null, pnl, riskUsd, r, exitAt, signalAt, entryAt, mode: t.mode || fallbackMode || "testnet" };
}

// Thống kê theo R (statsOf) + theo $: tổng lãi/lỗ, sụt vốn lớn nhất ($ và %), đường vốn.
// eqNow (vốn hiện tại bot báo) → vốn trước lệnh đầu ≈ eqNow − tổng lãi/lỗ (ước tính, để tính sụt vốn %).
export function liveSummary(list, eqNow) {
  const s = statsOf(list);
  const done = list.filter((t) => t.exitAt != null && t.pnl != null).sort((a, b) => a.exitAt - b.exitAt);
  const total = done.reduce((x, t) => x + t.pnl, 0);
  const base = fin(eqNow) && eqNow - total > 0 ? eqNow - total : null;
  let cum = 0, peak = 0, dd = 0, ddPct = 0;
  const curve = done.length ? [{ t: Math.min(done[0].entryAt ?? done[0].exitAt, done[0].exitAt), v: base ?? 0 }] : [];
  for (const t of done) {
    cum += t.pnl; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum);
    if (base) ddPct = Math.max(ddPct, (peak - cum) / (base + peak));
    curve.push({ t: t.exitAt, v: Math.round(((base ?? 0) + cum) * 100) / 100 });
  }
  return { ...s, total, base, maxDDUsd: dd, maxDDPct: base ? ddPct * 100 : null, curve, expUsd: done.length ? total / done.length : null, first: done.length ? done[0].entryAt : null, closed: done.length };
}

const EV_WHY = { expired: "lệnh chờ hết hạn (giá không về)", error: "lỗi đặt lệnh", skip: "bot bỏ tín hiệu" };
// So sánh Demo (chạy lại theo phiên Demo) với lệnh thật, trong khoảng từ tín hiệu của lệnh thật đầu tiên.
// raw = runSession(), fin = finalize(raw, null), live = lệnh thật đã chuẩn hoá, events = status.events (có id lệnh)
// others = lệnh thật ở chế độ khác (Testnet ↔ Tiền thật) — để giải thích "bot không vào" khi bot vào ở chế độ kia
export function compareDemoLive(raw, fin, live, events = [], others = []) {
  const L = live.filter((t) => t.id);
  if (!L.length) return null;
  const from = Math.min(...L.map((t) => t.signalAt ?? t.entryAt).filter(Number.isFinite));
  const D = fin.portfolio.trades.filter((t) => t.signalAt >= from);
  const dById = new Map(D.map((t) => [t.id, t])), lById = new Map(L.map((t) => [t.id, t]));
  const rej = new Map((raw.rejected || []).map((t) => [t.id, t])), pend = new Map((raw.pending || []).map((p) => [p.id, p]));
  const oById = new Map((others || []).filter((t) => t.id).map((t) => [t.id, t]));
  const evById = new Map();
  for (const e of events || []) if (e?.id && /^(skip|expired|error)$/.test(e.ev) && !evById.has(e.id)) evById.set(e.id, e);
  const rows = [];
  const base = (t) => ({ id: t.id, coin: t.coin, tf: t.tf, setup: t.setup, side: t.side, signalAt: t.signalAt ?? sigAtOf(t.id) });
  for (const d of D) {
    const l = lById.get(d.id), dR = d.r ?? d.uR ?? null;
    if (d.status === "skip") { if (l) rows.push({ ...base(d), kind: "live", liveR: l.r, liveOpen: l.exitAt == null, why: `Demo bỏ: ${d.why}` }); continue; }
    if (l) {
      const slip = d.entry > 0 && l.entry > 0 ? ((l.entry - d.entry) / d.entry) * 100 * d.side : null;
      rows.push({ ...base(d), kind: "both", demoR: dR, demoOpen: d.status === "open", liveR: l.r, liveOpen: l.exitAt == null, demoEntry: d.entry, liveEntry: l.entry, slip });
    } else {
      const e = evById.get(d.id), o = oById.get(d.id);
      rows.push({ ...base(d), kind: "demo", demoR: dR, demoOpen: d.status === "open", why: e ? e.why || e.msg || EV_WHY[e.ev] : o ? `bot vào lệnh này ở chế độ ${o.mode === "live" ? "Tiền thật" : "Testnet"}` : null });
    }
  }
  for (const l of L) {
    if (dById.has(l.id)) continue;
    const rj = rej.get(l.id), p = pend.get(l.id);
    rows.push({ ...base(l), kind: "live", liveR: l.r, liveOpen: l.exitAt == null, why: rj ? `Demo loại: ${rj.why}` : p ? (p.blocked ? `Demo chặn: ${p.blocked}` : "Demo: lệnh chờ chưa khớp") : null });
  }
  rows.sort((a, b) => (b.signalAt || 0) - (a.signalAt || 0));
  const both = rows.filter((r) => r.kind === "both");
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const pairs = both.filter((r) => r.liveR != null && r.demoR != null && !r.demoOpen);
  return {
    from, rows,
    nBoth: both.length, nDemo: rows.filter((r) => r.kind === "demo").length, nLive: rows.filter((r) => r.kind === "live").length,
    diffR: mean(pairs.map((r) => r.liveR - r.demoR)), demoR: mean(pairs.map((r) => r.demoR)), liveR: mean(pairs.map((r) => r.liveR)), nPairs: pairs.length,
    slip: mean(both.map((r) => r.slip).filter(Number.isFinite)),
  };
}

// ---------- Bộ luật bot đang chạy (status.cfgSummary) so với phiên Demo (cfgOf(settings.paperBot)) ----------
const onoff = (v) => (v ? "bật" : "tắt");
const RULES = [
  ["coins", "Cặp", (v) => (v || []).join("/") || "—", "arr"],
  ["tfs", "Khung vào lệnh", (v) => (v || []).map((x) => TFS[x]?.label || x).join(" ") || "—", "arr"],
  ["setups", "Setup", (v) => (v || []).map(setupName).join(", ") || "—", "arr"],
  ["keyVolume", "Key Volume", (v) => (!Number(v) ? "tắt" : Number(v) > 1 ? `top ${v}` : "bật")],
  ["d1Bias", "Thuận D1", onoff, "bool"],
  ["sigVol", "Vol nến tín hiệu > TB20", onoff, "bool"],
  ["noEngulf", "Không vào sau engulfing", onoff, "bool"],
  ["maxExtAtr", "Không đuổi giá", (v) => (Number(v) > 0 ? `≤ ${fmtNum(v, 2, 0)} ATR` : "tắt")],
  ["minSlAtr", "SL tối thiểu", (v) => (Number(v) > 0 ? `≥ ${fmtNum(v, 2, 0)} ATR` : "tắt")],
  ["adaptive", "Tự tối ưu", onoff, "bool"],
  ["learnLoss", "Rút kinh nghiệm lệnh thua", onoff, "bool"],
  ["rr", "R:R", (v) => (fin(v) ? `1:${fmtNum(v, 2, 0)}` : "—")],
  ["streakN", "Giảm rủi ro sau chuỗi thua", (v) => (Number(v) > 0 ? `thua ${v} lệnh liền` : "tắt")],
  ["streakRiskPct", "Rủi ro khi đang chuỗi thua", (v) => (fin(v) ? `${fmtNum(v, 2, 0)}%` : "—")],
  ["cfgVer", "Phiên bản luật", (v) => (v ? `v${v}` : "—")],
];
const same = (a, b, kind) => (kind === "arr" ? [...(a || [])].sort().join() === [...(b || [])].sort().join() : kind === "bool" ? !!a === !!b : Number(a) === Number(b));
export function cfgDiff(sum, demo) {
  if (!sum || !demo) return [];
  return RULES.filter(([k, , , kind]) => sum[k] !== undefined && !same(sum[k], demo[k], kind)).map(([k, label, f]) => ({ key: k, label, demo: f(demo[k]), bot: f(sum[k]) }));
}
export function rulesText(c) {
  if (!c) return "";
  const p = [(c.coins || []).join("/"), (c.tfs || []).map((x) => TFS[x]?.label || x).join(" ")];
  if (c.setups) p.push(`${c.setups.length} setup`);
  if (Number(c.keyVolume) > 0) p.push(Number(c.keyVolume) > 1 ? `Key Volume top ${c.keyVolume}` : "Key Volume");
  if (c.d1Bias) p.push("thuận D1");
  if (c.sigVol) p.push("vol nến > TB20");
  if (c.noEngulf) p.push("không vào sau engulfing");
  if (Number(c.maxExtAtr) > 0) p.push(`không đuổi giá (≤ ${fmtNum(c.maxExtAtr, 2, 0)} ATR)`);
  if (Number(c.minSlAtr) > 0) p.push(`SL ≥ ${fmtNum(c.minSlAtr, 2, 0)} ATR`);
  if (c.adaptive !== undefined) p.push(c.adaptive ? `tối ưu${c.learnLoss ? " + rút kinh nghiệm" : ""}` : "luật cố định (không tối ưu)");
  if (fin(c.rr)) p.push(`R:R 1:${fmtNum(c.rr, 2, 0)}`);
  if (Number(c.streakN) > 0) p.push(`thua ${c.streakN} liền → rủi ro ${fmtNum(c.streakRiskPct, 2, 0)}%`);
  if (c.cfgVer) p.push(`v${c.cfgVer}`);
  return p.filter(Boolean).join(" · ");
}
