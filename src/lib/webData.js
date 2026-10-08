// Module "Hiệu quả Website": ghép web GSC ↔ property GA4 theo tên miền, lấy số kỳ này + kỳ trước, chấm điểm bằng CODE.
import { listGoogleProps, gscQuery, gaReport, domainOf } from "./google.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
export const todayIso = () => iso(new Date());

// GSC trễ ~2-3 ngày → kết thúc ở hôm-3; GA4 kết thúc hôm qua. Kỳ trước = cùng độ dài liền trước.
// period: số ngày (7/28/90) hoặc { since, until } tuỳ chọn. Kỳ trước = cùng độ dài liền trước.
export const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86400000) + 1;
const win = (start, end) => { const n = daysBetween(start, end); return { cur: [start, end], prev: [addDays(start, -n), addDays(start, -1)] }; };
export function rangesOf(period) {
  // period = { since, until } (từ bộ lọc chung). GA4 có số tới hôm nay; Search Console trễ ~2 ngày → phần GSC tự cắt,
  // kỳ nằm trọn trong 2 ngày gần nhất thì GSC = null (UI ghi "Google chưa có số"), không hiện 0 gây hiểu nhầm.
  const t = todayIso(), gMax = addDays(t, -2);
  const until = period.until > t ? t : period.until, since = period.since > until ? until : period.since;
  const gEnd = until > gMax ? gMax : until;
  return {
    days: daysBetween(since, until), key: `${since}_${until}`, since, until,
    partial: since === t && until === t, // "Hôm nay": ngày đang chạy dở → không so với cả ngày hôm qua
    ga: win(since, until),
    gsc: since > gMax ? null : win(since, gEnd), gscCut: until > gMax,
  };
}

export const pctChange = (cur, prev) => (cur == null || prev == null || !prev ? null : ((cur - prev) / Math.abs(prev)) * 100);

// ===== PHÂN LOẠI NGUỒN TRUY CẬP theo nền tảng (từ sessionSource / sessionMedium của GA4) =====
export const SOURCE_GROUPS = [
  { key: "google", label: "Google tìm kiếm", color: "#4285F4" },
  { key: "gads", label: "Google Ads", color: "#34A853" },
  { key: "ai", label: "AI (ChatGPT, Gemini…)", color: "#8b5cf6" },
  { key: "facebook", label: "Facebook", color: "#1877F2" },
  { key: "fbads", label: "Facebook/Insta QC", color: "#0ea5e9" },
  { key: "instagram", label: "Instagram", color: "#E1306C" },
  { key: "tiktok", label: "TikTok", color: "#111827" },
  { key: "zalo", label: "Zalo", color: "#0068FF" },
  { key: "youtube", label: "YouTube", color: "#FF0000" },
  { key: "social", label: "MXH khác", color: "#f97316" },
  { key: "search", label: "Tìm kiếm khác (Bing, Cốc Cốc…)", color: "#14b8a6" },
  { key: "direct", label: "Truy cập thẳng", color: "#94a3b8" },
  { key: "email", label: "Email", color: "#eab308" },
  { key: "referral", label: "Web khác giới thiệu", color: "#a3a3a3" },
  { key: "unknown", label: "Không rõ", color: "#e2e8f0" },
];
export const groupOf = (k) => SOURCE_GROUPS.find((g) => g.key === k) || SOURCE_GROUPS[SOURCE_GROUPS.length - 1];
const AI_RE = /chatgpt|openai|gemini\.google|bard\.google|perplexity|copilot|claude\.ai|anthropic|deepseek|you\.com|poe\.com|meta\.ai|grok|x\.ai|phind|mistral|felo|kimi|doubao|qwen|character\.ai|huggingface/;
export function classifySource(src = "", med = "") {
  const s = String(src).toLowerCase(), m = String(med).toLowerCase();
  const paid = /cpc|ppc|paid|ads?$|cpm|display/.test(m);
  if (m === "ai-assistant" || AI_RE.test(s)) return "ai";
  if (/^(google|adwords)$/.test(s) && paid) return "gads";
  if (/(^|\.)(facebook|fb|instagram|ig|messenger)(\.|$)/.test(s) && paid) return "fbads";
  if (/instagram|^ig$/.test(s)) return "instagram";
  if (/facebook|^fb$|messenger|fb\.me/.test(s)) return "facebook";
  if (/tiktok/.test(s)) return "tiktok";
  if (/zalo/.test(s)) return "zalo";
  if (/youtube|youtu\.be/.test(s)) return "youtube";
  if (/^google$|google\./.test(s) && (m === "organic" || m === "referral")) return "google";
  if (/^t\.co$|twitter|^x\.com|threads|linkedin|pinterest|reddit|telegram|t\.me|telegra\.ph|discord|lemon8/.test(s) || m === "social") return "social";
  if (m === "organic" || /bing|yahoo|coccoc|duckduckgo|ecosia|yandex|naver|baidu/.test(s)) return "search";
  if (s === "(direct)") return "direct";
  if (/e-?mail|newsletter/.test(m)) return "email";
  if (m === "referral") return "referral";
  return "unknown";
}
// Gom dòng GA (source/medium + cur/prev) theo nhóm nền tảng
export function groupSources(rows) {
  const g = new Map();
  for (const r of rows) {
    const key = classifySource(r.src, r.med);
    const o = g.get(key) || { key, ...groupOf(key), cur: { sessions: 0, activeUsers: 0, engaged: 0, keyEvents: 0 }, prev: { sessions: 0, activeUsers: 0, keyEvents: 0 }, items: [] };
    o.cur.sessions += r.cur.sessions || 0; o.cur.activeUsers += r.cur.activeUsers || 0; o.cur.keyEvents += r.cur.keyEvents || 0;
    o.cur.engaged += (r.cur.engagementRate || 0) * (r.cur.sessions || 0);
    o.prev.sessions += r.prev.sessions || 0; o.prev.activeUsers += r.prev.activeUsers || 0; o.prev.keyEvents += r.prev.keyEvents || 0;
    o.items.push(r); g.set(key, o);
  }
  const list = [...g.values()].map((o) => ({ ...o, cur: { ...o.cur, engagementRate: o.cur.sessions ? o.cur.engaged / o.cur.sessions : null }, items: o.items.sort((a, b) => (b.cur.sessions || 0) - (a.cur.sessions || 0)) }));
  const total = list.reduce((x, o) => x + o.cur.sessions, 0);
  return list.map((o) => ({ ...o, share: total ? (o.cur.sessions / total) * 100 : 0 })).sort((a, b) => b.cur.sessions - a.cur.sessions);
}

// ===== SỰ KIỆN: tên dễ hiểu + phân loại (tự động / hành động khách) =====
const EVENT_VI = {
  page_view: "Xem trang", session_start: "Bắt đầu phiên", first_visit: "Lần đầu vào web", user_engagement: "Có tương tác", scroll: "Cuộn 90% trang",
  click: "Bấm link ra ngoài", file_download: "Tải file", video_start: "Xem video", video_progress: "Xem video (tiếp)", video_complete: "Xem hết video",
  view_search_results: "Tìm kiếm trên web", form_start: "Bắt đầu điền form", form_submit: "Gửi form", generate_lead: "Gửi thông tin (lead)",
  add_to_cart: "Thêm giỏ hàng", view_cart: "Xem giỏ", begin_checkout: "Bắt đầu thanh toán", purchase: "Mua hàng", view_item: "Xem sản phẩm",
  phone_click: "Bấm gọi điện", zalo_click: "Bấm Zalo", contact_link_click: "Bấm liên hệ", outbound_link_click: "Bấm link ra ngoài",
};
const AUTO_EVENTS = new Set(["page_view", "session_start", "first_visit", "user_engagement", "scroll"]);
export function eventLabel(name) {
  if (EVENT_VI[name]) return EVENT_VI[name];
  const n = name.toLowerCase();
  if (/zalo/.test(n)) return "Bấm Zalo";
  if (/call|phone|tel|hotline/.test(n)) return "Bấm gọi điện";
  if (/booking|dat_ban|reserve/.test(n)) return /success|submit/.test(n) ? "Đặt bàn/đặt lịch thành công" : "Bấm đặt bàn/đặt lịch";
  if (/map|direction/.test(n)) return "Mở bản đồ";
  if (/messenger|facebook|fb_/.test(n)) return "Bấm Facebook/Messenger";
  if (/tiktok/.test(n)) return "Bấm TikTok";
  if (/form|lead|contact/.test(n)) return "Liên hệ / gửi form";
  return "";
}
export const isAutoEvent = (n) => AUTO_EVENTS.has(n) || /session_source/.test(n);

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
    const free = ga.filter((g) => !used.has(g.prop_id));
    const bare = (x) => x.replace(/\.[a-z.]+$/, "");
    // Ưu tiên trùng ĐÚNG tên miền; không có mới so phần tên (vd property "vtylogistics" ↔ vtylogistics.com) — chỉ khi property không có đuôi tên miền
    const hit = over ? ga.find((g) => g.prop_id === over)
      : free.find((g) => domainOf(g.name) === s.domain) || free.find((g) => !/\./.test(domainOf(g.name)) && domainOf(g.name) === bare(s.domain));
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
    site.gsc && R.gsc && gscQuery(site.gsc, { start: R.gsc.prev[0], end: R.gsc.cur[1], dims: ["date"] }).then((rows) => {
      const daily = rows.map((r) => ({ date: r.keys[0], ...r })).sort((a, b) => a.date.localeCompare(b.date));
      const cur = daily.filter((d) => d.date >= R.gsc.cur[0]), prev = daily.filter((d) => d.date < R.gsc.cur[0]);
      out.gsc = { cur: sumGsc(cur), prev: sumGsc(prev), daily: cur };
    }).catch((e) => out.errors.push("GSC: " + e.message)),
    site.ga && gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: GA_METRICS }).then((rows) => {
      // 2 dateRanges → mỗi dòng có dimension dateRange = date_range_0 / date_range_1
      const pick = (k) => rows.find((r) => r.dateRange === k) || {};
      out.ga = { cur: pick("date_range_0"), prev: pick("date_range_1") };
    }).catch((e) => out.errors.push("GA4: " + e.message)),
    site.ga && gaReport(site.ga, { ranges: [R.ga.cur], metrics: ["sessions"], dims: ["sessionSource", "sessionMedium"], limit: 300 }).then((rows) => {
      out.sources = groupSources(rows.map((r) => ({ src: r.sessionSource, med: r.sessionMedium, cur: { sessions: r.sessions }, prev: {} })));
    }).catch(() => {}),
  ]);
  // Hôm nay chưa hết ngày → bỏ so sánh (tránh "giảm 96%" ảo) và không chấm điểm
  if (R.partial) { if (out.gsc) out.gsc.prev = {}; if (out.ga) out.ga.prev = {}; out.verdict = { key: "live", label: "Trong ngày", tone: "slate" }; }
  else out.verdict = verdictOf(out);
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
  if (site.gsc && R.gsc) {
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
    jobs.push(safe(gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: ["sessions", "activeUsers", "engagementRate", "keyEvents"], dims: ["sessionSource", "sessionMedium"], limit: 1000 }).then((rows) => {
      const m = new Map();
      for (const r of rows) {
        const k = r.sessionSource + "|" + r.sessionMedium; const o = m.get(k) || { src: r.sessionSource, med: r.sessionMedium, cur: {}, prev: {} };
        o[r.dateRange === "date_range_1" ? "prev" : "cur"] = r; m.set(k, o);
      }
      return groupSources([...m.values()]);
    }), "sources"));
    jobs.push(safe(gaReport(site.ga, { ranges: [R.ga.cur, R.ga.prev], metrics: ["eventCount", "totalUsers", "keyEvents"], dims: ["eventName"], limit: 200 }).then(splitRanges("eventName")).then((l) => l
      .map((e) => ({ ...e, label: eventLabel(e.name), auto: isAutoEvent(e.name), key: (e.cur.keyEvents || 0) > 0 || (e.prev.keyEvents || 0) > 0 }))
      .sort((a, b) => (a.auto - b.auto) || (b.cur.eventCount || 0) - (a.cur.eventCount || 0))), "events"));
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
  return [...m.values()].sort((a, b) => (b.cur.sessions || b.cur.eventCount || b.cur.keyEvents || 0) - (a.cur.sessions || a.cur.eventCount || a.cur.keyEvents || 0));
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
