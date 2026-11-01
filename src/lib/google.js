// Google Search Console + GA4 — dùng CHUNG kết nối của Văn phòng AI (bảng office_google: khoá service account,
// office_google_props: danh sách web GSC + property GA4 runner đồng bộ 6h/lần). CHỈ ĐỌC. Chỉ chủ (RLS owner).
// Muốn theo dõi web mới: thêm email robot vào GSC/GA4 của web đó → Văn phòng AI → Kết nối → Google → Làm mới.
import { supabase } from "./supabase.js";

// 01/11: MỌI tài khoản (kể cả chủ) gọi qua edge fn qws-proxy — khoá service account chỉ nằm ở máy chủ, không tải về trình duyệt.
async function proxy(body) {
  const { data, error } = await supabase.functions.invoke("qws-proxy", { body });
  if (error) { let m = error.message; try { m = (await error.context?.json?.())?.error || m; } catch { /* bỏ qua */ } throw new Error(/Failed to send|not found|404/i.test(m) ? "Máy chủ chưa bật hàm qws-proxy (chủ cần deploy)" : m); }
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Lỗi");
  return data;
}

const gapi = (url, body) => proxy({ action: "google", url, body });

// Danh sách web/property đang BẬT bên Văn phòng AI (tắt công tắc ở đó = app cũng không hiện). Nhớ 1 lần tải / 5 phút.
let PROPS = null;
export async function listGoogleProps(force = false) {
  if (!force && PROPS && PROPS.at > Date.now() - 300000) return PROPS.p;
  const p = proxy({ action: "google_props" }).then((d) => ({ props: d.props || [], conn: d.conn || null }));
  PROPS = { at: Date.now(), p };
  p.catch(() => { PROPS = null; });
  return p;
}

// ---- Search Console ----
export async function gscQuery(site, { start, end, dims = [], limit = 1000, filters } = {}) {
  const body = { startDate: start, endDate: end, dimensions: dims, rowLimit: limit, dataState: "all" };
  if (filters) body.dimensionFilterGroups = [{ filters }];
  const j = await gapi(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
  return (j.rows || []).map((r) => ({ keys: r.keys || [], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr * 100, position: r.position }));
}

// ---- GA4 Data API ----
export async function gaReport(prop, { ranges, metrics, dims = [], limit = 1000, orderBy } = {}) {
  const body = { dateRanges: ranges.map(([startDate, endDate]) => ({ startDate, endDate })), metrics: metrics.map((name) => ({ name })), dimensions: dims.map((name) => ({ name })), limit };
  if (orderBy) body.orderBys = [{ metric: { metricName: orderBy }, desc: true }];
  const j = await gapi(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, body);
  const dh = (j.dimensionHeaders || []).map((h) => h.name);
  const mh = (j.metricHeaders || []).map((h) => h.name);
  return (j.rows || []).map((r) => {
    const o = {};
    (r.dimensionValues || []).forEach((v, i) => { o[dh[i]] = v.value; });
    (r.metricValues || []).forEach((v, i) => { o[mh[i]] = Number(v.value); });
    return o;
  });
}

// Tên miền chuẩn để ghép web GSC ↔ property GA4
export function domainOf(s) {
  const t = String(s || "").toLowerCase().replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").trim();
  // Tên property kiểu "vuadonggoi.com - GA4" → lấy đúng phần tên miền
  const m = t.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/);
  return m ? m[0] : t.replace(/\/.*$/, "");
}
