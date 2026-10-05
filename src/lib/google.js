// Google Search Console + GA4 — dùng CHUNG kết nối của Văn phòng AI (bảng office_google: khoá service account,
// office_google_props: danh sách web GSC + property GA4 runner đồng bộ 6h/lần). CHỈ ĐỌC. Chỉ chủ (RLS owner).
// Muốn theo dõi web mới: thêm email robot vào GSC/GA4 của web đó → Văn phòng AI → Kết nối → Google → Làm mới.
import { supabase } from "./supabase.js";

const SCOPES = "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly";
let cached = null; // { token, exp }
// Tài khoản phụ (được cấp quyền "Hiệu quả Website") không đọc được khoá → gọi qua edge fn qws-proxy (khoá ở máy chủ)
let viaProxy = false;
export const setGoogleProxy = (v) => { viaProxy = !!v; };
async function proxy(body) {
  const { data, error } = await supabase.functions.invoke("qws-proxy", { body });
  if (error) { let m = error.message; try { m = (await error.context?.json?.())?.error || m; } catch { /* bỏ qua */ } throw new Error(/Failed to send|not found|404/i.test(m) ? "Máy chủ chưa bật hàm qws-proxy (chủ cần deploy)" : m); }
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Lỗi");
  return data;
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function signJwt(key) {
  const pem = key.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({ iss: key.client_email, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pk, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

export async function googleToken() {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const { data, error } = await supabase.from("office_google").select("key_json").maybeSingle();
  if (error) throw new Error("Không đọc được kết nối Google: " + error.message);
  if (!data?.key_json) throw new Error("Chưa kết nối Google — vào Văn phòng AI → Kết nối → Google để dán khoá.");
  const key = JSON.parse(data.key_json);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signJwt(key) }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google từ chối khoá: " + (j.error_description || j.error || r.status));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

async function gapi(url, body) {
  if (viaProxy) return proxy({ action: "google", url, body });
  const tok = await googleToken();
  const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Google lỗi ${r.status}`);
  return j;
}

// Danh sách web/property đã đồng bộ bên Văn phòng AI
export async function listGoogleProps() {
  if (viaProxy) { const d = await proxy({ action: "google_props" }); return { props: d.props || [], conn: d.conn || null }; }
  const [{ data: props, error }, { data: conn }] = await Promise.all([
    supabase.from("office_google_props").select("kind,prop_id,name,extra,enabled,updated_at").order("name"),
    supabase.from("office_google").select("sa_email,last_sync_at,last_error").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  // Chỉ lấy web/property đang BẬT bên Văn phòng AI (tắt công tắc ở đó = app cũng không hiện)
  return { props: (props || []).filter((p) => p.enabled), conn: conn || null };
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
