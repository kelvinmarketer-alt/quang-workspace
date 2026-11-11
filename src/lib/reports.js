// Trung tâm báo cáo (31/10): gom số mọi kênh về TỪNG thương hiệu (khách) — dùng chung cho Tổng quan (lưới sức khoẻ),
// /bao-cao (bảng tổng) và /bao-cao/:id (Thương hiệu 360). Chỉ chủ tải (tài khoản phụ không có quyền đọc hết các kênh).
// Kỳ: 30 ngày kết thúc HÔM QUA (số Google / Facebook ngày hôm nay chưa chốt) so với 30 ngày trước đó.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { listGoogleProps } from "./google.js";
import { buildSites, loadSiteSummary, rangesOf, pctChange, lagDays, daysBetween } from "./webData.js";
import { listPages, loadPageSummary, fbRanges } from "./fbPages.js";
import { diagnose } from "./adsDiagnose.js";
import { installmentsInRange, sumInstallments, projectMetrics } from "./selectors.js";
import { formatShort } from "./format.js";
import { useData } from "./store.jsx";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function reportPeriod(days = 30) {
  const u = new Date(); u.setDate(u.getDate() - 1);
  const s = new Date(u); s.setDate(s.getDate() - (days - 1));
  return { since: iso(s), until: iso(u), days };
}

// Bỏ dấu + ký tự lạ → so tên (vuadonggoi.vn ↔ "Vua Đóng Gói")
export const squash = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
export function guessCustomer(name, customers) {
  const a = squash(name); if (a.length < 3) return null;
  const hit = customers.find((c) => { const b = squash(c.name); return b.length >= 3 && (a.includes(b) || b.includes(a)); });
  return hit?.id || null;
}
export const siteKey = (domain) => String(domain || "").replace(/^www\./, "").split(".")[0];

// ---------- tải số liệu (nhớ 20 phút trong tab) ----------
const TTL = 20 * 60000, CK = "qws-report-v2"; // v2 (11/11): thêm ngày có số đầu/cuối của từng web/page để kiểm đủ số
let MEM = null;
const readCache = (key) => {
  if (MEM && MEM.key === key && Date.now() - MEM.at < TTL) return MEM;
  try { const c = JSON.parse(sessionStorage.getItem(CK) || "null"); if (c && c.key === key && Date.now() - c.at < TTL) return (MEM = c); } catch { /* bỏ qua */ }
  return null;
};
const writeCache = (v) => { MEM = v; try { sessionStorage.setItem(CK, JSON.stringify(v)); } catch { /* đầy bộ nhớ → chỉ giữ trong RAM */ } };

async function pool(list, n, fn) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]).catch((e) => ({ error: e.message || String(e) })); } }));
  return out;
}

async function loadAll(P, settings, adsResults) {
  const errors = [];
  const ads = (async () => {
    const { data, error } = await supabase.functions.invoke("qws-meta-ads", { body: { since: P.since, until: P.until, compare: true } });
    if (error || data?.error) throw new Error(error?.message || data.error);
    const accounts = (data.accounts || []).filter((a) => !a.error);
    const diag = diagnose(accounts, { targets: settings.adsTargets || {}, adsResults: adsResults || [], since: P.since, until: P.until });
    const v = new Map(diag.accounts.map((d) => [d.id, d]));
    return accounts.map((a) => ({ id: a.id, name: a.name, platform: a.platform || (String(a.id).startsWith("g") ? "google" : "meta"), group: a.group, cust: a.cust || null,
      spend: a.totals?.spend || 0, results: a.totals?.results || 0, prevSpend: a.prev?.spend ?? null, prevResults: a.prev?.results ?? null,
      verdict: v.get(a.id)?.verdict || null }));
  })().catch((e) => { errors.push("Quảng cáo: " + e.message); return []; });
  const web = (async () => {
    const { props, conn } = await listGoogleProps();
    const { sites } = buildSites(props, conn, { hidden: settings.webHidden || [], gaOverride: settings.webGa || {} });
    const R = rangesOf({ since: P.since, until: P.until });
    const sums = await pool(sites, 20, (s) => loadSiteSummary(s, R)); // lệnh Google được gom 1 lần gọi máy chủ → chạy song song nhiều web
    return sites.map((s, i) => { const x = sums[i] || {}; return { domain: s.domain,
      clicks: x.gsc?.cur.clicks ?? null, prevClicks: x.gsc?.prev.clicks ?? null, impressions: x.gsc?.cur.impressions ?? null, prevImpressions: x.gsc?.prev.impressions ?? null,
      position: x.gsc?.cur.position ?? null, users: x.ga?.cur.activeUsers ?? null, prevUsers: x.ga?.prev.activeUsers ?? null, conv: x.ga?.cur.keyEvents ?? null,
      daily: (x.gsc?.daily || []).map((d) => [d.date, d.clicks]), verdict: x.verdict?.key || "na",
      hasGsc: !!s.gsc, hasGa: !!s.ga, gscFirst: x.fresh?.gsc?.first ?? null, gscLast: x.fresh?.gsc?.last ?? null, gaFirst: x.fresh?.ga?.first ?? null, gaLast: x.fresh?.ga?.last ?? null }; });
  })().catch((e) => { errors.push("Website: " + e.message); return []; });
  const pages = (async () => {
    const { pages: list } = await listPages();
    const shown = list.filter((p) => p.enabled !== false && !(settings.fbHidden || []).includes(p.page_id));
    const R = fbRanges({ since: P.since, until: P.until });
    const sums = await pool(shown, 5, (p) => loadPageSummary(p, R));
    return shown.map((p, i) => { const x = sums[i] || {}; return { id: p.page_id, name: p.name,
      reach: x.cur?.reach ?? null, prevReach: x.prev?.reach ?? null, messages: x.cur?.messages ?? null, prevMessages: x.prev?.messages ?? null,
      engagement: x.cur?.engagement ?? null, verdict: x.verdict?.key || "na", first: x.first ?? null, last: x.last ?? null }; });
  })().catch((e) => { errors.push("Fanpage: " + e.message); return []; });
  const [a, w, p] = await Promise.all([ads, web, pages]);
  return { ads: a, web: w, pages: p, errors };
}

export function dropReportCache() { MEM = null; try { sessionStorage.removeItem(CK); } catch { /* bỏ qua */ } }


// Bản số liệu đang nhớ (không tải mới) — cho chuông thông báo
export function peekReportData() {
  if (MEM) return MEM;
  try { return JSON.parse(sessionStorage.getItem(CK) || "null"); } catch { return null; }
}

// Hook: số liệu thô các kênh (chỉ chủ). reload(true) = bỏ bộ nhớ, tải lại.
export function useReportData(days = 30) {
  const { isOwner, settings = {}, adsResults } = useData();
  const P = useMemo(() => reportPeriod(days), [days]);
  const key = `${P.since}_${P.until}`;
  const [st, setSt] = useState(() => ({ data: readCache(key), loading: false }));
  const load = useCallback((force) => {
    if (!isOwner) return;
    if (!force) { const c = readCache(key); if (c) { setSt({ data: c, loading: false }); return; } }
    setSt((s) => ({ ...s, loading: true }));
    // 01/11: kênh nào lỗi (mất mạng, đứt giữa chừng) thì KHÔNG nhớ 20 phút — lần mở sau lấy lại, không giữ kết quả rỗng
    loadAll(P, settings, adsResults).then((d) => { const v = { key, at: Date.now(), ...d }; if (!d.errors?.length) writeCache(v); else MEM = v; setSt({ data: v, loading: false }); })
      .catch((e) => setSt((s) => ({ ...s, loading: false, data: s.data || { errors: [e.message] } })));
  }, [isOwner, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [load]);
  return { ...st, period: P, reload: () => load(true) };
}

// ---------- ghép theo thương hiệu ----------
// Màu ô: g = đạt · w = cần theo dõi · b = dưới chỉ tiêu · n = không chạy / chưa có số
const ADS_TONE = { great: "g", good: "g", ok: "g", warn: "w", fatigue: "w", thin: "w", bad: "b", burn: "b", off: "n" };
const WEB_TONE = { up: "g", flat: "g", warn: "w", down: "b", na: "n", live: "n", off: "n" };
const worst = (tones) => (tones.includes("b") ? "b" : tones.includes("w") ? "w" : tones.includes("g") ? "g" : "n");
const sum = (list, k) => list.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const sumOrNull = (list, k) => (list.some((x) => x[k] != null) ? sum(list, k) : null);
export const monthRange = (d = new Date(), back = 0) => { const s = new Date(d.getFullYear(), d.getMonth() - back, 1), e = new Date(d.getFullYear(), d.getMonth() - back + 1, 0); return [iso(s), iso(e)]; };
export const monthKey = (d = new Date()) => iso(d).slice(0, 7);

// Tự gắn kênh ↔ khách: TK quảng cáo theo "Dự án" đã gắn ở Cài đặt; web/fanpage theo bảng gắn tay (settings.reportLinks), chưa có thì đoán theo tên
export function linkChannels(data, customers, links = {}) {
  const web = {}, page = {};
  for (const s of data?.web || []) { const v = links.web?.[s.domain]; web[s.domain] = v === "none" ? null : v || guessCustomer(siteKey(s.domain), customers); }
  for (const p of data?.pages || []) { const v = links.page?.[p.id]; page[p.id] = v === "none" ? null : v || guessCustomer(p.name, customers); }
  const ads = {};
  for (const a of data?.ads || []) ads[a.id] = a.cust || guessCustomer(a.name, customers);
  return { web, page, ads };
}

export function buildBrandRows({ customers = [], projects = [], tasks = [], data, links, reportLog = {}, today = iso(new Date()) }) {
  const L = linkChannels(data, customers, links);
  const [m0, m1] = monthRange(), [p0, p1] = monthRange(new Date(), 1), mk = monthKey();
  return customers.filter((c) => c.active !== false).map((c) => {
    const cps = projects.filter((p) => p.customerId === c.id);
    const jobs = cps.filter((p) => !p.status || p.status === "doing" || p.status === "paused");
    const cur = sumInstallments(installmentsInRange(cps, m0, m1)), prev = sumInstallments(installmentsInRange(cps, p0, p1));
    const debt = cps.reduce((a, p) => a + projectMetrics(p).debt, 0);
    const ads = (data?.ads || []).filter((a) => L.ads[a.id] === c.id);
    const webs = (data?.web || []).filter((s) => L.web[s.domain] === c.id);
    const pages = (data?.pages || []).filter((p) => L.page[p.id] === c.id);
    const nm = squash(c.name);
    const late = tasks.filter((t) => t.status !== "done" && t.date && t.date < today && (t.customerId === c.id || (nm.length >= 4 && squash(t.title).includes(nm)))).length;

    const spend = sum(ads, "spend"), results = sum(ads, "results"), conv = ads.filter((a) => a.group !== "brand" && a.spend > 0);
    const adsCell = !ads.length || !spend ? { v: ads.length ? "Không chạy" : null, t: "n" }
      : { v: results ? `${formatShort(spend / results)}/KQ` : `${formatShort(spend)} · 0 KQ`, t: worst((conv.length ? conv : ads).map((a) => ADS_TONE[a.verdict?.key] || "w")), sub: `chi ${formatShort(spend)}` };
    const clicks = sumOrNull(webs, "clicks"), prevClicks = sumOrNull(webs, "prevClicks"), users = sumOrNull(webs, "users");
    const webCell = !webs.length ? { v: null, t: "n" } : { v: clicks != null ? `${clicks.toLocaleString("vi-VN")} click` : users != null ? `${users.toLocaleString("vi-VN")} người` : "—", t: worst(webs.map((s) => WEB_TONE[s.verdict] || "n")), d: pctChange(clicks, prevClicks) };
    const impr = sumOrNull(webs, "impressions"), prevImpr = sumOrNull(webs, "prevImpressions"), dImpr = pctChange(impr, prevImpr);
    const posW = webs.filter((s) => s.position != null && s.impressions), pos = posW.length ? posW.reduce((a, s) => a + s.position * s.impressions, 0) / sum(posW, "impressions") : null;
    const seoCell = impr == null ? { v: null, t: "n" } : { v: pos != null ? `VT ${pos.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}` : "—", t: dImpr == null ? "w" : dImpr >= -10 ? "g" : dImpr >= -30 ? "w" : "b", d: dImpr, sub: `${formatShort(impr)} hiển thị` };
    const msgs = sumOrNull(pages, "messages"), prevMsgs = sumOrNull(pages, "prevMessages");
    const fpCell = !pages.length ? { v: null, t: "n" } : { v: msgs != null ? `${msgs.toLocaleString("vi-VN")} tin` : "—", t: worst(pages.map((p) => WEB_TONE[p.verdict] || "n")), d: pctChange(msgs, prevMsgs), sub: `${formatShort(sum(pages, "reach"))} tiếp cận` };
    const sent = reportLog[c.id]?.[mk];
    const repCell = { v: sent ? `Đã gửi ${sent.slice(8, 10)}/${sent.slice(5, 7)}` : "Chưa gửi", t: sent ? "g" : "w" };
    const cells = { ads: adsCell, web: webCell, fp: fpCell, seo: seoCell };
    const score = Object.values(cells).reduce((a, x) => a + (x.t === "b" ? 3 : x.t === "w" ? 1 : 0), 0) + late;
    const state = Object.values(cells).some((x) => x.t === "b") || late >= 3 ? "b" : score >= 2 ? "w" : "g";
    return { c, id: c.id, name: c.name, type: c.type || "remote", logo: c.logo, jobs, cps, revenue: cur.revenue, prevRevenue: prev.revenue, profit: cur.grossProfit, debt, late,
      ads, webs, pages, cells, rep: repCell, score, state, spend, results };
  });
}

// ---------- Kiểm đủ số trước khi gửi báo cáo khách (11/11) ----------
// Mỗi nguồn: ok (đủ) · partial (có số nhưng không phủ hết kỳ) · missing (không có số / lỗi / chưa gắn).
// Cho phép trễ bình thường: Search Console 3 ngày, GA4 & Facebook 1 ngày (số chốt sau nửa đêm).
const TOL = { gsc: 3, ga: 1, fb: 1 };
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// Phủ kỳ: [first,last] so với [since,until] — trả ghi chú khi thiếu đầu / cuối kỳ quá mức cho phép
function coverNote(spans, P, tol) {
  const L = spans.filter((x) => x && x.last);
  if (!L.length || !P?.until) return null;
  const last = L.map((x) => x.last).sort()[0]; // web/page cập nhật CHẬM nhất quyết định
  if (lagDays(last, P.until) > tol) return `số tới ${dmy(last)}`;
  const firsts = L.map((x) => x.first).filter(Boolean).sort();
  const first = firsts[firsts.length - 1]; // web/page có số MUỘN nhất
  if (first && P.since && first > P.since && daysBetween(P.since, first) - 1 > tol) return `số từ ${dmy(first)}`;
  return null;
}
const JOB_NEED = { ADS: "ads", Seo: "seo", Web: "web", Landing: "web" };
export function reportCompleteness(row, data, P = {}) {
  const items = [];
  const add = (key, label, status, note = null) => items.push({ key, label, status, note });
  if (!row) return { items, ok: 0, total: 0, bad: [], loaded: false };
  const loaded = !!data?.at, err = (data?.errors || []).join(" ");
  const need = new Set(row.jobs.filter((p) => !p.status || p.status === "doing").map((p) => JOB_NEED[p.category]).filter(Boolean));
  const chan = (key, label, list, failRe, hasNum, spans, tol, unlinked) => {
    if (!list.length && !need.has(key)) return; // kênh không dùng → không tính
    if (!loaded) return add(key, label, "missing", "đang lấy số");
    if (failRe.test(err)) return add(key, label, "missing", "lỗi lấy số");
    if (!list.length) return add(key, label, "missing", unlinked);
    if (!list.some(hasNum)) return add(key, label, "missing", "chưa có số trong kỳ");
    const n = spans && coverNote(spans, P, tol);
    add(key, label, n ? "partial" : "ok", n);
  };
  // Doanh thu: kỳ chưa hết mà chưa có đợt thu là bình thường (đầu tháng) → chỉ nhắc nhẹ, không tính thiếu
  if (row.jobs.length) {
    const ended = P.until && P.until < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    if (row.revenue > 0) add("rev", "Doanh thu", "ok");
    else if (ended) add("rev", "Doanh thu", "missing", "chưa ghi đợt thu trong kỳ");
  }
  chan("ads", "Quảng cáo", row.ads, /Quảng cáo/, () => true, null, 0, "chưa gắn tài khoản QC");
  chan("web", "Website", row.webs, /Website/, (s) => s.clicks != null || s.users != null,
    row.webs.map((s) => (s.hasGsc === false ? { first: s.gaFirst, last: s.gaLast } : { first: s.gscFirst, last: s.gscLast })), TOL.gsc, "chưa gắn website");
  const gscWebs = row.webs.filter((s) => s.hasGsc !== false);
  if (gscWebs.length || need.has("seo")) chan("seo", "SEO", gscWebs, /Website/, (s) => s.impressions != null, gscWebs.map((s) => ({ first: s.gscFirst, last: s.gscLast })), TOL.gsc, "chưa có Search Console");
  chan("fp", "Fanpage", row.pages, /Fanpage/, (p) => p.reach != null, row.pages.map((p) => ({ first: p.first, last: p.last })), TOL.fb, "chưa gắn fanpage");
  const bad = items.filter((x) => x.status !== "ok");
  return { items, ok: items.length - bad.length, total: items.length, bad, loaded };
}
// "Thiếu số: Fanpage, SEO" — câu ngắn cho popup / chip
export const completenessText = (c) => (c?.bad?.length ? `Thiếu số: ${c.bad.map((x) => x.label).join(", ")}` : "Đủ số các kênh");

// Job đang chạy chưa gắn kênh đo lường (01/11 sếp yêu cầu): ADS cần TK quảng cáo, Seo/Web/Landing cần website,
// Lương cần ít nhất 1 kênh. App/Coaching/Khác không bắt buộc. Sếp bấm "Không cần đo" → settings.measureSkip[projectId] → không báo nữa.
const NEED = { ADS: ["ads", "tài khoản quảng cáo"], Seo: ["web", "website (Search Console)"], Web: ["web", "website (Google)"], Landing: ["web", "website (Google)"], "Lương": ["any", "kênh đo nào (quảng cáo / website / fanpage)"] };
export function missingMeasure(rows, data, skip = {}) {
  if (!data?.at) return [];
  const err = (data.errors || []).join(" ");
  const ok = { ads: !/Quảng cáo/.test(err), web: !/Website/.test(err), any: !err };
  const out = [];
  for (const r of rows) for (const p of r.jobs) {
    if ((p.status && p.status !== "doing") || skip[p.id]) continue;
    const n = NEED[p.category];
    if (!n || !ok[n[0]]) continue;
    const has = n[0] === "ads" ? r.ads.length : n[0] === "web" ? r.webs.length : r.ads.length + r.webs.length + r.pages.length;
    if (!has) out.push({ id: p.id, custId: r.id, brand: r.name, job: p.name, cat: p.category, need: n[1] });
  }
  return out;
}
