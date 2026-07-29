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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { title, body, url, tag, user_id } = await req.json().catch(() => ({}));

  let q = supa.from("qws_push_subs").select("endpoint, sub");
  if (user_id) q = q.eq("user_id", user_id);
  const { data: subs, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "content-type": "application/json" } });

  const payload = JSON.stringify({ title: title || "Quang Workspace", body: body || "", url: url || "/", tag });
  let sent = 0, removed = 0;
  await Promise.all((subs || []).map(async (r) => {
    try { await webpush.sendNotification(r.sub, payload); sent++; }
    catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) { await supa.from("qws_push_subs").delete().eq("endpoint", r.endpoint); removed++; }
    }
  }));
  return new Response(JSON.stringify({ sent, removed }), { headers: { ...cors, "content-type": "application/json" } });
});
