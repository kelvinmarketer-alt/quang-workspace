// Edge Function: qws-binance — số dư ví + GIÁ VỐN TRUNG BÌNH (từ lịch sử mua/myTrades), read-only, ký HMAC.
// Chỉ CHỦ (email == OWNER_EMAIL). Secrets: BINANCE_KEY, BINANCE_SECRET, OWNER_EMAIL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

async function signedGet(path, params, KEY, SECRET) {
  const q = (params ? params + "&" : "") + "recvWindow=10000&timestamp=" + Date.now();
  const sig = createHmac("sha256", SECRET).update(q).digest("hex");
  const r = await fetch("https://api.binance.com" + path + "?" + q + "&signature=" + sig, { headers: { "X-MBX-APIKEY": KEY } });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const KEY = Deno.env.get("BINANCE_KEY");
  const SECRET = Deno.env.get("BINANCE_SECRET");
  const OWNER = (Deno.env.get("OWNER_EMAIL") || "").toLowerCase();
  if (!KEY || !SECRET) return json({ error: "Chua cau hinh BINANCE_KEY/SECRET" }, 500);

  const auth = req.headers.get("Authorization") || "";
  const supa = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data: u } = await supa.auth.getUser();
  const email = (u && u.user && u.user.email || "").toLowerCase();
  if (!email) return json({ error: "Chua dang nhap" }, 401);
  if (OWNER && email !== OWNER) return json({ error: "Chi chu workspace duoc dong bo vi" }, 403);

  try {
    const acc = await signedGet("/api/v3/account", "", KEY, SECRET);
    if (!acc.ok) return json({ error: "Binance: " + (acc.data.msg || acc.status) }, 502);
    let balances = (acc.data.balances || [])
      .map((b) => ({ asset: b.asset, qty: Number(b.free) + Number(b.locked) }))
      .filter((b) => b.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    // Giá vốn TB (DCA) từ lịch sử mua {asset}USDT
    for (const b of balances) {
      if (b.asset === "USDT") { b.avgCost = 1; b.invested = b.qty; continue; }
      b.avgCost = null; b.invested = null;
      try {
        const t = await signedGet("/api/v3/myTrades", "symbol=" + b.asset + "USDT&limit=1000", KEY, SECRET);
        if (t.ok && Array.isArray(t.data) && t.data.length) {
          let bq = 0, bquote = 0;
          for (const tr of t.data) { if (tr.isBuyer) { bq += Number(tr.qty); bquote += Number(tr.quoteQty); } }
          if (bq > 0) { b.avgCost = bquote / bq; b.invested = b.qty * b.avgCost; }
        }
      } catch { /* symbol khong co pair USDT -> bo qua gia von */ }
    }
    return json({ balances, updatedAt: Date.now() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
