// Edge Function: qws-ai — gọi OpenAI THAY trình duyệt. Key nằm trong kho riêng của chủ (qws_private.data.openaiKey),
// trình duyệt (kể cả tài khoản phụ) không bao giờ thấy key. Mỗi lần gọi ghi chi phí vào qws_ai_usage.
// Không cần secret thêm: dùng SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY có sẵn.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// Giá USD / 1 triệu token (input, output)
const PRICE: Record<string, [number, number]> = {
  "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6], "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4.1-nano": [0.1, 0.4],
};
const ALLOWED = Object.keys(PRICE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Chưa đăng nhập" }, 401);
    const email = (user.email || "").toLowerCase();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Chủ workspace: chính mình (có dòng workspace) hoặc chủ đã thêm email này vào members
    let ownerId: string | null = null;
    const own = await admin.from("qws_workspaces").select("user_id").eq("user_id", user.id).maybeSingle();
    if (own.data) ownerId = user.id;
    else {
      const { data: rows } = await admin.from("qws_workspaces").select("user_id, members:data->members");
      for (const r of rows || []) {
        const ms = Array.isArray(r.members) ? r.members : [];
        if (ms.some((m: { email?: string }) => (m.email || "").toLowerCase() === email)) { ownerId = r.user_id; break; }
      }
    }
    if (!ownerId) return json({ error: "Không thuộc workspace nào" }, 403);

    const priv = await admin.from("qws_private").select("data").eq("user_id", ownerId).maybeSingle();
    const key = (priv.data?.data?.openaiKey || "").trim();
    if (!key) return json({ error: "Chủ workspace chưa nhập API key OpenAI (Cài đặt → AI)." }, 400);

    const { feature = "khac", body } = await req.json();
    if (!body || !Array.isArray(body.messages)) return json({ error: "Thiếu nội dung gửi AI" }, 400);
    const model = ALLOWED.includes(body.model) ? body.model : "gpt-4o-mini";
    const payload = { ...body, model, max_tokens: Math.min(Number(body.max_tokens) || 4000, 8000) };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: "OpenAI lỗi: " + (data?.error?.message || r.status) }, 502);

    const pt = data.usage?.prompt_tokens || 0, ct = data.usage?.completion_tokens || 0;
    const [pi, po] = PRICE[model];
    const cost = (pt * pi + ct * po) / 1e6;
    await admin.from("qws_ai_usage").insert({ owner_id: ownerId, actor_email: email, feature: String(feature).slice(0, 40), model, prompt_tokens: pt, completion_tokens: ct, cost_usd: cost });
    return json(data);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
