// SỨC KHOẺ TOKEN TKQC META (11/11/2026) — hàm thuần + nhớ trên máy (localStorage).
// App KHÔNG có ngày hết hạn của token: token nằm ở máy chủ (bảng qws_ads_accounts, chỉ service role đọc), app chỉ thấy 6 ký tự cuối.
// Muốn biết trước "sắp hết hạn" phải nhờ hàm máy chủ gọi Graph /debug_token (chưa có). Vì vậy ở đây đoán từ:
//  (1) lỗi Facebook trả về mỗi lần tải số liệu (lỗi 190 / "access token" / "session has expired" … = token hỏng/hết hạn),
//  (2) lần cuối tải được số của tài khoản đó (nhớ trên máy này).
const KEY = "qws_ads_token_health";

const TOKEN_RE = /access token|oauth|\(#?190\)|code"?\s*:?\s*190|session has expired|session is invalid|has not authorized|changed (the|their) password|token.*(expired|invalid|hết hạn|không hợp lệ)|error validating|chưa có token|invalid.*token/i;
const PERM_RE = /permission|\(#(10|200|294)\)|not authorized|không có quyền|ads_read|ads_management|requires? .*role/i;

// "token" = token hỏng / hết hạn / bị thu hồi · "perm" = token còn nhưng mất quyền TK · "other" = lỗi tạm (mạng, Facebook quá tải…)
export function classifyAdsError(msg) {
  const m = String(msg || "");
  if (!m) return null;
  if (TOKEN_RE.test(m)) return "token";
  if (PERM_RE.test(m)) return "perm";
  return "other";
}

// Meta đôi khi ghi ngày hết hạn trong lỗi: "Session has expired on Tuesday, 05-Nov-26 01:00:00 PST"
export function expiredOnFromMsg(msg) {
  const m = /expired on \w+,\s*(\d{1,2})-(\w{3})-(\d{2})/i.exec(String(msg || ""));
  if (!m) return null;
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : `${String(m[1]).padStart(2, "0")}/${String(mon + 1).padStart(2, "0")}/20${m[3]}`;
}

export const isMetaAcc = (a) => a && a.platform !== "google" && !String(a.id || "").startsWith("g-");

// Gộp kết quả 1 lần tải vào sổ theo dõi: { [id]: { name, lastOk, firstErr, lastErr, err, kind } }
export function updateHealth(prev, accounts, now = Date.now()) {
  const out = { ...(prev || {}) };
  for (const a of accounts || []) {
    if (!isMetaAcc(a)) continue;
    const p = out[a.id] || {};
    if (a.error) out[a.id] = { ...p, name: a.name || p.name, firstErr: p.err ? p.firstErr || now : now, lastErr: now, err: String(a.error).slice(0, 300), kind: classifyAdsError(a.error) };
    else out[a.id] = { name: a.name || p.name, lastOk: now };
  }
  return out;
}

// Danh sách cảnh báo cho tài khoản ĐANG lỗi trong lần tải mới nhất. Lỗi tạm ("other") chỉ báo khi kéo dài ≥ 1 giờ.
export function tokenWarnings(health, accounts, now = Date.now()) {
  const out = [];
  for (const a of accounts || []) {
    if (!isMetaAcc(a) || !a.error) continue;
    const h = (health || {})[a.id] || {};
    const kind = classifyAdsError(a.error);
    const since = h.firstErr || now;
    if (kind === "other" && now - since < 3600000) continue;
    out.push({ id: a.id, name: a.name || h.name || a.id, kind, err: String(a.error), lastOk: h.lastOk || null, since, expiredOn: expiredOnFromMsg(a.error) });
  }
  return out.sort((x, y) => (x.kind === "token" ? 0 : 1) - (y.kind === "token" ? 0 : 1));
}

export function agoVI(t, now = Date.now()) {
  if (!t) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

export function loadHealth() { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
export function saveHealth(h) { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* chế độ riêng tư */ } }

// Mở Cài đặt đúng mục (Settings nhớ mục đang mở ở localStorage "qws_settings_sec")
export function openSettingsSection(navigate, sec = "connect") {
  try { localStorage.setItem("qws_settings_sec", sec); } catch { /* bỏ qua */ }
  navigate("/cai-dat");
}
