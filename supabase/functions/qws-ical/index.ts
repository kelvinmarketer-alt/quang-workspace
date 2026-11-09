// @ts-nocheck — chạy trên Deno (Supabase Edge Functions).
// Edge Function: qws-ical — trả LỊCH ĐĂNG KÝ (ICS) cho Lịch iPhone / Google Calendar (09/11/2026).
// Link dạng: https://<dự án>.supabase.co/functions/v1/qws-ical?t=<mã bí mật>. Phải TẮT "Verify JWT" (điện thoại không gửi đăng nhập).
// Hàm chỉ đọc 1 dòng bảng qws_ical_feeds theo mã (đủ dài, khó đoán) và trả nguyên văn; nội dung do app của chủ tạo sẵn.
// Chạy SQL trước: supabase/SETUP-ICAL.sql. Không cần secret thêm.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!TOKEN_RE.test(t)) return new Response("Not found", { status: 404 });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data, error } = await admin.from("qws_ical_feeds").select("ics").eq("token", t).maybeSingle();
    if (error) return new Response("Lỗi máy chủ", { status: 500 });
    if (!data) return new Response("Not found", { status: 404 }); // sai mã / đã đổi link / đã tắt
    return new Response(req.method === "HEAD" ? null : data.ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, max-age=300",
        "content-disposition": 'inline; filename="quang-workspace.ics"',
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return new Response("Lỗi máy chủ", { status: 500 });
  }
});
