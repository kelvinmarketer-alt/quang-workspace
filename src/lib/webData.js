// Module "Hiệu quả Website": ghép web GSC ↔ property GA4 theo tên miền, lấy số kỳ này + kỳ trước, chấm điểm bằng CODE.
import { listGoogleProps, gscQuery, gaReport, domainOf } from "./google.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
export const todayIso = () => iso(new Date());

// GSC trễ ~2-3 ngày → kết thúc ở hôm-3; GA4 kết thúc hôm qua. Kỳ trước = cùng độ dài liền trước.
export function rangesOf(days) {
  const t = todayIso();
  const gEnd = addDays(t, -3), aEnd = addDays(t, -1);
  return {
    days,
    gsc: { cur: [addDays(gEnd, -(days - 1)), gEnd], prev: [addDays(gEnd, -(2 * days - 1)), addDays(gEnd, -days)] },
    ga: { cur: [addDays(aEnd, -(days - 1)), aEnd], prev: [addDays(aEnd, -(2 * days - 1)), addDays(aEnd, -days)] },
  };
}

export const pctChange = (cur, prev) => (cur == null || prev == null || !prev ? null : ((cur - prev) / Math.abs(prev)) * 100);

// Gộp web: 1 dòng / tên miền. GSC ưu tiên property sc-domain (đủ http/https/www). GA4 ghép theo tên property chứa tên miền.
export async function loadSites({ hidden = [], gaOverride = {} } = {}) {
  const { props, conn } = await listGoogleProps();
  const gsc = props.filter((p) => p.kind === "gsc");
  const ga = props.filter((p) => p.kind === "ga4");
  const map = new Map();
  for (const p of gsc) {
    const d = domainOf(p.prop_id);
    const cur = map.get(d);
    if (!cur || (p.prop_id.startsWith("sc-domain:") && !cur.gsc.startsWith("sc-domain:"))) map.set(d, { domain: d, gsc: p.prop_id, ga: null, gaName: null });
  }
  const used = new Set();
  for (const s of map.values()) {
    const over = gaOverride[s.domain];
    const hit = over ? ga.find((g) => g.prop_id === over) : ga.find((g) => domainOf(g.name) === s.domain || domainOf(g.name).replace(/\.[a-z.]+$/, "") === s.domain.replace(/\.[a-z.]+$/, ""));
    if (hit) { s.ga = hit.prop_id; s.gaName = hit.name; used.add(hit.prop_id); }
  }
  // Property GA4 không ghép được web GSC nào → dòng riêng (chỉ GA)
  for (const g of ga) if (!used.has(g.prop_id)) { const d = domainOf(g.name) || g.name; if (!map.has(d)) map.set(d, { domain: d, gsc: null, ga: g.prop_id, gaName: g.name }); }
  const all = [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  return { sites: all.filter((s) => !hidden.includes(s.domain)), hiddenSites: all.filter((s) => hidden.includes(s.domain)), gaProps: ga, conn };
}

const GA_METRICS = ["activeUsers", "newUsers", "sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "screenPageViews", "keyEvents"];

function sumGsc(rows) {
  let clicks = 0, impressions = 0, posW = 0;
  for (const r of rows) { clicks += r.clicks; impressions += r.impressions; posW += r.position * r.impressions; }
  return { clicks, impressions, ctr: impressions ? (clicks / impressions) * 100 : 0, position: impressions ? posW / impressions : null };
}

// Số tổng 1 web (cho trang tổng): GSC theo ngày (kỳ trước + kỳ này, 1 lệnh) + GA4 tổng 2 kỳ (1 lệnh)
export async function loadSiteSummary(site, R) {
  const out = { domain: site.domain, gsc: null, ga: null, errors: [] };
  await Promise.all([
    site.gsc && gscQuery(site.gsc, { start: R.gsc.prev[0], end: R.gsc.cur[1], dims: ["date"] }).then((rows) => {
      const daily = rows.map((r) => ({ date: r.keys[0], ...r })).sort((a, b) => a.date.localeCompare(b.date));
      const cur = daily.filter((d) => d.date >= R.gsc.cur[0]), prev = daily.filter((d) => d.date < R.gsc.cur[0]);
      out.gsc = { cur: sumGsc(cur), prev: sumGsc(prev), daily: cur };
    }).catch((e) => out.errors.push("GSC: " + e.message)),
    site.ga && gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: GA_METRICS }).then((rows) => {
      // 2 dateRanges → mỗi dòng có dimension dateRange = date_range_0 / date_range_1
      const pick = (k) => rows.find((r) => r.dateRange === k) || {};
      out.ga = { cur: pick("date_range_0"), prev: pick("date_range_1") };
    }).catch((e) => out.errors.push("GA4: " + e.message)),
  ]);
  out.verdict = verdictOf(out);
  return out;
}

export function verdictOf(s) {
  const dc = pctChange(s.gsc?.cur.clicks, s.gsc?.prev.clicks);
  const du = pctChange(s.ga?.cur.activeUsers, s.ga?.prev.activeUsers);
  const dk = pctChange(s.ga?.cur.keyEvents, s.ga?.prev.keyEvents);
  const main = dc ?? du;
  if (main == null) return { key: "na", label: "Chưa đủ số", tone: "slate" };
  const small = (s.gsc?.cur.clicks ?? s.ga?.cur.activeUsers ?? 0) < 30;
  if (main >= 15 && (dk == null || dk >= -10)) return { key: "up", label: "Tăng trưởng", tone: "emerald", small };
  if (main <= -20 || (dk != null && dk <= -30 && (s.ga?.prev.keyEvents || 0) >= 5)) return { key: "down", label: "Đi xuống", tone: "rose", small };
  if (main <= -8) return { key: "warn", label: "Cần chú ý", tone: "amber", small };
  return { key: "flat", label: "Ổn định", tone: "sky", small };
}

// Chi tiết 1 web (bấm vào): từ khoá, trang, cơ hội SEO, nguồn truy cập, trang đích, chuyển đổi, thiết bị, khu vực
export async function loadSiteDetail(site, R) {
  const d = { errors: [] };
  const safe = (p, k) => p.then((v) => { d[k] = v; }).catch((e) => d.errors.push(`${k}: ${e.message}`));
  const jobs = [];
  if (site.gsc) {
    const g = (dims, range, limit) => gscQuery(site.gsc, { start: range[0], end: range[1], dims, limit });
    jobs.push(safe(Promise.all([g(["query"], R.gsc.cur, 500), g(["query"], R.gsc.prev, 500)]).then(([c, p]) => joinPrev(c, p)), "queries"));
    jobs.push(safe(Promise.all([g(["page"], R.gsc.cur, 300), g(["page"], R.gsc.prev, 300)]).then(([c, p]) => joinPrev(c, p)), "pages"));
    jobs.push(safe(g(["device"], R.gsc.cur, 10), "gscDevices"));
    jobs.push(safe(g(["country"], R.gsc.cur, 10), "gscCountries"));
  }
  if (site.ga) {
    const a = (dims, metrics, opt = {}) => gaReport(site.ga, { ranges: [R.ga.cur], metrics, dims, ...opt });
    jobs.push(safe(gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: ["sessions", "activeUsers", "engagementRate", "keyEvents"], dims: ["sessionDefaultChannelGroup"], limit: 50 }).then(splitRanges("sessionDefaultChannelGroup")), "channels"));
    jobs.push(safe(a(["landingPagePlusQueryString"], ["sessions", "engagementRate", "averageSessionDuration", "keyEvents"], { limit: 30, orderBy: "sessions" }), "landing"));
    jobs.push(safe(gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: ["keyEvents"], dims: ["eventName"], limit: 50 }).then(splitRanges("eventName")).then((l) => l.filter((x) => x.cur.keyEvents > 0 || x.prev.keyEvents > 0)), "conversions"));
    jobs.push(safe(a(["deviceCategory"], ["sessions", "engagementRate", "keyEvents"]), "gaDevices"));
    jobs.push(safe(a(["city"], ["activeUsers", "sessions", "keyEvents"], { limit: 10, orderBy: "activeUsers" }), "cities"));
    jobs.push(safe(a(["date"], ["activeUsers", "sessions", "keyEvents"], { limit: 400 }).then((l) => l.map((x) => ({ ...x, date: `${x.date.slice(0, 4)}-${x.date.slice(4, 6)}-${x.date.slice(6)}` })).sort((x, y) => x.date.localeCompare(y.date))), "gaDaily"));
  }
  await Promise.all(jobs);
  if (d.queries) d.opportunities = opportunities(d.queries);
  if (d.pages) d.losingPages = d.pages.filter((p) => p.prev && p.prev.clicks >= 5 && p.clicks < p.prev.clicks * 0.7).sort((a, b) => (b.prev.clicks - b.clicks) - (a.prev.clicks - a.clicks)).slice(0, 15);
  return d;
}

function joinPrev(cur, prev) {
  const pm = new Map(prev.map((r) => [r.keys[0], r]));
  return cur.map((r) => ({ name: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, prev: pm.get(r.keys[0]) || null }));
}
const splitRanges = (dim) => (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = r[dim]; const o = m.get(k) || { name: k, cur: {}, prev: {} };
    o[r.dateRange === "date_range_1" ? "prev" : "cur"] = r; m.set(k, o);
  }
  return [...m.values()].sort((a, b) => (b.cur.sessions || b.cur.keyEvents || 0) - (a.cur.sessions || a.cur.keyEvents || 0));
};

// CTR kỳ vọng theo vị trí (đường cong trung bình ngành, %)
const EXP_CTR = [0, 28, 15, 10, 7, 5.5, 4.5, 3.5, 3, 2.5, 2.2];
export const expectedCtr = (pos) => (pos <= 1 ? EXP_CTR[1] : pos >= 10.5 ? 1.2 : EXP_CTR[Math.round(pos)] || 1.5);

// Cơ hội SEO: từ khoá có nhiều hiển thị nhưng (a) đứng vị trí 4-20 → đẩy lên top 3; (b) top 3 mà CTR thấp → sửa tiêu đề/mô tả
function opportunities(qs) {
  const near = qs.filter((q) => q.position > 3.5 && q.position <= 20 && q.impressions >= 20)
    .map((q) => ({ ...q, gain: Math.max(0, Math.round(q.impressions * (expectedCtr(3) / 100) - q.clicks)), type: "push" }))
    .sort((a, b) => b.gain - a.gain).slice(0, 15);
  const lowCtr = qs.filter((q) => q.position <= 3.5 && q.impressions >= 30 && q.ctr < expectedCtr(q.position) * 0.5)
    .map((q) => ({ ...q, gain: Math.max(0, Math.round(q.impressions * (expectedCtr(q.position) / 100) - q.clicks)), type: "ctr" }))
    .sort((a, b) => b.gain - a.gain).slice(0, 10);
  return { near, lowCtr };
}
