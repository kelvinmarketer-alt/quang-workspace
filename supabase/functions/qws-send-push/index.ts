// Edge Function: qws-send-push — gửi Web Push tới các thiết bị đã đăng ký.
// Body: { title, body, url, tag, user_id? }  (bỏ user_id = gửi tất cả).
// Secrets cần set: VAPID_PUBLIC, VAPID_PRIVATE. (SUPABASE_URL & SERVICE_ROLE_KEY tự có sẵn.)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

webpush.setVapidDetails(
  "mailto:maiconglong1020@gmail.com",
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// 01/11: kiểm người gọi. Khoá máy chủ (bot, hàm khác) hoặc CHỦ (OWNER_EMAIL) → gửi cho ai cũng được;
// người đăng nhập khác → chỉ gửi cho CHÍNH MÌNH (nút "Gửi thử"). Link chỉ trong app (/…) hoặc Văn phòng AI.
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
const OK_HOSTS = ["boss.2bkin.io.vn", "office.2bkin.io.vn"];
const safeUrl = (u: unknown) => {
  const s = String(u || "/");
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try { const x = new URL(s); return x.protocol === "https:" && OK_HOSTS.includes(x.host) ? x.href : "/"; } catch { return "/"; }
};
async function callerOf(req: Request): Promise<{ all: boolean; uid?: string } | null> {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  if (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { all: true };
  const { data: u } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + bearer } } }).auth.getUser();
  if (u?.user) {
    const owner = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
    return owner && (u.user.email || "").toLowerCase() === owner ? { all: true } : { all: false, uid: u.user.id };
  }
  // Khoá bí mật dạng mới (sb_secret_…) của bot: thử 1 lệnh chỉ khoá máy chủ làm được
  try { const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, bearer).auth.admin.listUsers({ page: 1, perPage: 1 }); if (!error) return { all: true }; } catch { /* không phải khoá máy chủ */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await callerOf(req);
  if (!who) return json({ error: "Không có quyền gửi thông báo" }, 401);
  const { title, body, url: rawUrl, tag, user_id: want } = await req.json().catch(() => ({}));
  const url = safeUrl(rawUrl);
  const user_id = who.all ? want : who.uid;

  let q = supa.from("qws_push_subs").select("endpoint, sub");
  if (user_id) q = q.eq("user_id", user_id);
  const { data: subs, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "content-type": "application/json" } });

  const payload = JSON.stringify({ title: title || "Quang Workspace", body: body || "", url: url || "/", tag });
  let sent = 0, removed = 0;
  // 23/10: báo kết quả TỪNG thiết bị (Apple / Google) để biết vì sao điện thoại không nhận; urgency high = điện thoại tiết kiệm pin vẫn nhận ngay
  const results: { host: string; ok: boolean; code?: number; msg?: string }[] = [];
  await Promise.all((subs || []).map(async (r) => {
    const host = String(r.endpoint || "").split("/")[2] || "?";
    try { const res = await webpush.sendNotification(r.sub, payload, { TTL: 86400, urgency: "high" }); sent++; results.push({ host, ok: true, code: res?.statusCode }); }
    catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      const msg = String((e as { body?: string })?.body || (e as Error)?.message || e).slice(0, 200);
      results.push({ host, ok: false, code, msg });
      console.log(`push lỗi ${host} ${code}: ${msg}`);
      if (code === 404 || code === 410) { await supa.from("qws_push_subs").delete().eq("endpoint", r.endpoint); removed++; }
    }
  }));
  return new Response(JSON.stringify({ sent, removed, total: (subs || []).length, results }), { headers: { ...cors, "content-type": "application/json" } });
});
