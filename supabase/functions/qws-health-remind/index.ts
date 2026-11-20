// Edge Function: qws-health-remind — nhắc Sức khoẻ (uống nước, giờ tập, nhịn ăn theo giờ, cân sáng, tổng kết tuần).
// Lịch pg_cron gọi 15 phút một lần (supabase/SETUP-HEALTH.sql). Hàm tự đọc bảng qws_health, quyết định ai tới giờ nhắc
// rồi gửi Web Push thẳng tới máy của CHÍNH người đó. Gọi lặp lại KHÔNG gửi trùng (ghi dấu đã nhắc vào dòng k = 'rs'),
// nên không cần khoá bí mật cho người gọi — tắt "Verify JWT" khi tạo hàm.
// Secrets dùng lại của qws-send-push: VAPID_PUBLIC, VAPID_PRIVATE.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { dueReminders, needsWeek, anyRemind, dayKeyOf } from "./logic.js";

webpush.setVapidDetails("mailto:maiconglong1020@gmail.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const DAY = 86400000;

Deno.serve(async () => {
  const nowMs = Date.now(), today = dayKeyOf(nowMs);
  const { data: rows, error } = await supa.from("qws_health").select("user_id, k, data").in("k", ["cfg", "rs", "d:" + today]);
  if (error) return json({ error: error.message }, 500);
  const users = new Map<string, { cfg?: unknown; rs?: unknown; day?: unknown }>();
  for (const r of rows || []) {
    const u = users.get(r.user_id) || {};
    if (r.k === "cfg") u.cfg = r.data; else if (r.k === "rs") u.rs = r.data; else u.day = r.data;
    users.set(r.user_id, u);
  }
  let sent = 0, removed = 0;
  const out: { user: string; tags: string[] }[] = [];
  for (const [uid, u] of users) {
    if (!u.cfg || !anyRemind(u.cfg)) continue;
    let week;
    if (needsWeek(u.cfg, u.rs, nowMs)) {
      const keys = [...Array(7)].map((_, i) => dayKeyOf(nowMs - i * DAY)), prevKeys = [...Array(7)].map((_, i) => dayKeyOf(nowMs - (i + 7) * DAY));
      const { data: wk } = await supa.from("qws_health").select("k, data").eq("user_id", uid).in("k", [...keys, ...prevKeys].map((k) => "d:" + k));
      week = { days: Object.fromEntries((wk || []).map((r) => [r.k.slice(2), r.data])), keys, prevKeys };
    }
    const { sends, rs } = dueReminders({ cfg: u.cfg, rs: u.rs, day: u.day, nowMs, week });
    if (!sends.length) continue;
    // Ghi dấu TRƯỚC khi gửi: lỡ hàm bị gọi 2 lần sát nhau cũng không nhắc trùng
    await supa.from("qws_health").upsert({ user_id: uid, k: "rs", data: rs, updated_at: new Date(nowMs).toISOString() });
    const { data: subs } = await supa.from("qws_push_subs").select("endpoint, sub").eq("user_id", uid);
    const mine = (subs || []).filter((r) => r.sub?.app !== "office"); // máy của Văn phòng AI có nhãn riêng → không gửi sang đó
    for (const s of sends) {
      const payload = JSON.stringify(s);
      await Promise.all(mine.map(async (r) => {
        try { await webpush.sendNotification(r.sub, payload, { TTL: 3600, urgency: "high" }); sent++; }
        catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) { await supa.from("qws_push_subs").delete().eq("endpoint", r.endpoint); removed++; }
        }
      }));
    }
    out.push({ user: uid.slice(0, 8), tags: sends.map((s) => s.tag) });
  }
  return json({ at: today, users: users.size, sent, removed, out });
});
