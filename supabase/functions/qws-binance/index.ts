// Edge Function: qws-binance — số dư ví + giá vốn TB (myTrades) + TỔNG ĐÃ NẠP (fiat VND). Read-only, ký HMAC.
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

// Tổng nạp fiat (VND) — quét theo cửa sổ 90 ngày, ~2.5 năm
async function fiatDeposits(KEY, SECRET) {
  const DAY = 86400000, now = Date.now();
  let totalVND = 0; const items = []; const byCur = {};
  for (let i = 0; i < 10; i++) {
    const end = now - i * 90 * DAY, begin = end - 90 * DAY;
    try {
      const r = await signedGet("/sapi/v1/fiat/orders", "transactionType=0&beginTime=" + begin + "&endTime=" + end + "&rows=500", KEY, SECRET);
      const list = r.ok && r.data && Array.isArray(r.data.data) ? r.data.data : [];
      for (const o of list) {
        const st = (o.status || "").toLowerCase();
        if (!["successful", "completed", "finished", "success"].includes(st)) continue;
        const amt = Number(o.amount || o.indicatedAmount || 0);
        byCur[o.fiatCurrency] = (byCur[o.fiatCurrency] || 0) + amt;
        if (o.fiatCurrency === "VND") totalVND += amt;
        items.push({ amount: amt, fiat: o.fiatCurrency, date: o.createTime, method: o.method, status: o.status });
      }
    } catch (_) {}
  }
  return { totalVND, byCur, count: items.length, items: items.sort((a, b) => b.date - a.date).slice(0, 30) };
}

// Lịch sử P2P (mua/bán USDT bằng VND) — nguồn "nạp tiền" chính ở VN
async function p2pHistory(KEY, SECRET) {
  let buyVND = 0, sellVND = 0, count = 0; const items = [];
  for (const tradeType of ["BUY", "SELL"]) {
    for (let page = 1; page <= 15; page++) {
      let list = [];
      try {
        const r = await signedGet("/sapi/v1/c2c/orderMatch/listUserOrderHistory", "tradeType=" + tradeType + "&page=" + page + "&rows=100", KEY, SECRET);
        list = r.ok && r.data && Array.isArray(r.data.data) ? r.data.data : [];
      } catch (_) { break; }
      if (!list.length) break;
      for (const o of list) {
        if ((o.orderStatus || "") !== "COMPLETED") continue;
        const tp = Number(o.totalPrice || 0);
        if (o.fiat === "VND") { if (tradeType === "BUY") buyVND += tp; else sellVND += tp; }
        count++;
        if (items.length < 40) items.push({ t: tradeType, asset: o.asset, fiat: o.fiat, totalPrice: tp, amount: Number(o.amount), date: o.createTime });
      }
      if (list.length < 100) break;
    }
  }
  return { buyVND, sellVND, netVND: buyVND - sellVND, count, items };
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
  const email = ((u && u.user && u.user.email) || "").toLowerCase();
  if (!email) return json({ error: "Chua dang nhap" }, 401);
  if (OWNER && email !== OWNER) return json({ error: "Chi chu workspace duoc dong bo vi" }, 403);

  const debug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const acc = await signedGet("/api/v3/account", "", KEY, SECRET);
    if (!acc.ok) return json({ error: "Binance: " + (acc.data.msg || acc.status) }, 502);
    let balances = (acc.data.balances || [])
      .map((b) => ({ asset: b.asset, qty: Number(b.free) + Number(b.locked) }))
      .filter((b) => b.qty > 0)
      .sort((a, b) => b.qty - a.qty);

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
      } catch (_) {}
    }

    const dep = await fiatDeposits(KEY, SECRET);
    const p2p = await p2pHistory(KEY, SECRET);
    // "Đã nạp" = fiat VND + P2P mua VND − P2P bán VND (net tiền VN đã bỏ vào)
    const depositedVND = (dep.totalVND || 0) + (p2p.netVND || 0);
    const out = {
      balances,
      deposited: { vnd: depositedVND, fiatVND: dep.totalVND, p2pBuyVND: p2p.buyVND, p2pSellVND: p2p.sellVND, count: dep.count + p2p.count },
      updatedAt: Date.now(),
    };
    if (debug) out.depositItems = { fiat: dep.items, p2p: p2p.items };
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
