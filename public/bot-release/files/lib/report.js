// Báo trạng thái + lịch sử lệnh về app qua Supabase (bảng qws_live_bot), đọc lệnh từ app, gửi thông báo đẩy.
// Không cấu hình SUPABASE_SERVICE_KEY → bỏ qua (bot vẫn chạy, chỉ ghi log trong máy).
const URL_ = (process.env.SUPABASE_URL || "").trim(), KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
let lastPush = 0, missing = false;
export async function pushStatus(status, force = false) {
  if (!URL_ || !KEY || missing || (!force && Date.now() - lastPush < 30000) || (force && Date.now() - lastPush < 10000)) return;
  lastPush = Date.now();
  const r = await fetch(`${URL_}/rest/v1/qws_live_bot`, { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: "status", data: status, updated_at: new Date().toISOString() }) });
  if (r.status === 404) { missing = true; console.log("(Chưa có bảng qws_live_bot trên Supabase — chạy file supabase.sql để bot báo về app)"); }
}
// Trạng thái lần trước (đọc lúc khởi động → biết bot đã im lặng bao lâu)
export async function readStatus() {
  if (!URL_ || !KEY) return null;
  try { const r = await fetch(`${URL_}/rest/v1/qws_live_bot?id=eq.status&select=data`, { headers: H(), signal: AbortSignal.timeout(15000) }); if (!r.ok) return null; return (await r.json())[0]?.data || null; } catch { return null; }
}
// Lịch sử lệnh ĐÃ ĐÓNG → dòng 'history' (app hiện bảng lịch sử). Trả true nếu đã ghi được.
export async function pushHistory(trades) {
  if (!URL_ || !KEY || missing) return false;
  try {
    const r = await fetch(`${URL_}/rest/v1/qws_live_bot`, { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: "history", data: { trades, updatedAt: Date.now() }, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(20000) });
    return r.ok;
  } catch { return false; }
}
// Thông báo đẩy về điện thoại qua Edge Function qws-send-push (không bao giờ ném lỗi)
let pushWarned = false;
export async function notify(title, body, tag) {
  if (!URL_ || !KEY) return false;
  try {
    const r = await fetch(`${URL_}/functions/v1/qws-send-push`, { method: "POST", headers: H(), body: JSON.stringify({ title, body, url: "/coin?tab=live", tag }), signal: AbortSignal.timeout(15000) });
    if ((r.status === 401 || r.status === 403) && !pushWarned) { pushWarned = true; console.log(`(Không gửi được thông báo: qws-send-push trả ${r.status} — kiểm tra SUPABASE_SERVICE_KEY / cài đặt xác thực của hàm)`); }
    return r.ok;
  } catch { return false; }
}
export async function readCommand() {
  if (!URL_ || !KEY || missing) return null;
  const r = await fetch(`${URL_}/rest/v1/qws_live_bot?id=eq.command&select=data`, { headers: H() });
  if (!r.ok) return null;
  const j = await r.json(); return j[0]?.data || null;
}

// Cấu hình phiên DEMO trong app (settings.paperBot) → bot thật dùng CÙNG luật (cặp, khung, setup, bộ lọc, tối ưu, bài học)
export async function readDemoSession() {
  if (!URL_ || !KEY) return null;
  const r = await fetch(`${URL_}/rest/v1/qws_workspaces?select=pb:data->settings->paperBot`, { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.map((x) => x.pb).filter((x) => x && x.cfg).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}
