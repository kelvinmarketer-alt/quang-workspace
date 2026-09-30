// Edge Function: qws-binance — đọc SỐ DƯ ví Binance (read-only) qua API key ký HMAC.
// Chỉ CHỦ (email == OWNER_EMAIL) được gọi. Secrets: BINANCE_KEY, BINANCE_SECRET, OWNER_EMAIL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const KEY = Deno.env.get("BINANCE_KEY");
  const SECRET = Deno.env.get("BINANCE_SECRET");
  const OWNER = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
  if (!KEY || !SECRET) return json({ error: "Chưa cấu hình BINANCE_KEY/SECRET" }, 500);

  // Xác thực người gọi = chủ workspace
  const auth = req.headers.get("Authorization") || "";
  const supa = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data: u } = await supa.auth.getUser();
  const email = (u?.user?.email || "").toLowerCase();
  if (!email) return json({ error: "Chưa đăng nhập" }, 401);
  if (OWNER && email !== OWNER) return json({ error: "Chỉ chủ workspace được đồng bộ ví" }, 403);

  // Ký HMAC gọi Binance /account (read-only)
  try {
    const query = `recvWindow=10000&timestamp=${Date.now()}`;
    const sig = createHmac("sha256", SECRET).update(query).digest("hex");
    const r = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${sig}`, { headers: { "X-MBX-APIKEY": KEY } });
    const data = await r.json();
    if (!r.ok) return json({ error: "Binance: " + (data.msg || r.status) }, 502);
    const balances = (data.balances || [])
      .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked), total: Number(b.free) + Number(b.locked) }))
      .filter((b) => b.total > 0)
      .sort((a, b) => b.total - a.total);
    return json({ balances, updatedAt: Date.now() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
