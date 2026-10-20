// Edge Function: qws-binance — ví Binance cho tab "Đầu tư". Read-only, ký HMAC.
// Chỉ CHỦ (email == OWNER_EMAIL). Secrets: BINANCE_KEY, BINANCE_SECRET, OWNER_EMAIL.
// v2 (version: 2) — VỐN GỘP để báo cáo (Spot + Earn + Futures), GIAO DỊCH TÁCH (bot chỉ dùng ví Futures):
//  • balances[]: qty (Spot, như cũ) + earnQty (Simple Earn linh hoạt/cố định) + totalQty; coin chỉ có ở Earn cũng có dòng
//  • giá vốn TB gia quyền theo DÒNG THỜI GIAN: myTrades (USDT/FDUSD/USDC/BUSD, phân trang fromId) + Convert 12 tháng;
//    mua cộng vốn (+phí nếu trả bằng đồng quote), bán chốt lãi = (giá − TB) × SL − phí → realizedPnl, fees, recent
//  • futures: ví USDⓈ-M (wallet/unrealized/available) + lệnh đang mở; lỗi quyền → futures:null + futuresError
// Trường cũ (balances[].qty/avgCost/invested, deposited, updatedAt) GIỮ NGUYÊN để app bản cũ vẫn chạy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const SPOT = "https://api.binance.com";
const FAPI = "https://fapi.binance.com";
// Stablecoin coi như 1 USD (giá vốn = 1, không tính lãi/lỗ)
const STABLE = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI"]);
// Cặp giao dịch tính giá vốn: coin/USDT + các cặp quote tương đương USD
const QUOTES = ["USDT", "FDUSD", "USDC", "BUSD"];

async function signedGet(path, params, KEY, SECRET, base = SPOT) {
  const q = (params ? params + "&" : "") + "recvWindow=10000&timestamp=" + Date.now();
  const sig = createHmac("sha256", SECRET).update(q).digest("hex");
  const r = await fetch(base + path + "?" + q + "&signature=" + sig, { headers: { "X-MBX-APIKEY": KEY } });
  let data = {};
  try { data = await r.json(); } catch (_) { data = {}; }
  return { ok: r.ok, status: r.status, data };
}
const bErr = (r) => (r && r.data && (r.data.msg || r.data.message)) || ("HTTP " + (r ? r.status : "?"));
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// Chạy song song có giới hạn (tránh vượt thời gian edge + rate limit Binance); 1 việc lỗi không làm hỏng cả lô
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (_) { out[k] = undefined; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

// ===== Futures USDⓈ-M (ví bot giao dịch) =====
async function futuresInfo(KEY, SECRET) {
  let bal = await signedGet("/fapi/v3/balance", "", KEY, SECRET, FAPI);
  if (!bal.ok && (bal.status === 404 || bal.status === 400)) bal = await signedGet("/fapi/v2/balance", "", KEY, SECRET, FAPI);
  if (!bal.ok || !Array.isArray(bal.data)) {
    const code = bal.data && bal.data.code;
    const perm = code === -2015 || code === -2014 || code === -2008 || bal.status === 401;
    return {
      error: perm
        ? "API key không đọc được ví Futures (" + bErr(bal) + "). Key chỉ đọc tạo TRƯỚC khi mở ví Futures sẽ không thấy Futures → tạo key chỉ đọc mới (chỉ tick Enable Reading) rồi cập nhật BINANCE_KEY/BINANCE_SECRET."
        : "Futures: " + bErr(bal),
    };
  }
  let wallet = 0, crossUp = 0, available = 0;
  const assets = [];
  for (const a of bal.data) {
    const wb = num(a.balance ?? a.crossWalletBalance), up = num(a.crossUnPnl), av = num(a.availableBalance);
    if (!wb && !up) continue;
    assets.push({ asset: a.asset, wallet: wb, unrealized: up, available: av });
    if (STABLE.has(a.asset)) { wallet += wb; crossUp += up; available += av; }
  }

  let pr = await signedGet("/fapi/v3/positionRisk", "", KEY, SECRET, FAPI);
  if (!pr.ok && (pr.status === 404 || pr.status === 400)) pr = await signedGet("/fapi/v2/positionRisk", "", KEY, SECRET, FAPI);
  const positions = [];
  let posUp = 0, posOk = false;
  if (pr.ok && Array.isArray(pr.data)) {
    posOk = true;
    for (const p of pr.data) {
      const amt = num(p.positionAmt);
      if (!amt) continue;
      const notional = Math.abs(num(p.notional));
      const im = num(p.positionInitialMargin || p.initialMargin);
      // v2 có sẵn leverage; v3 không có → suy ra = giá trị vị thế / ký quỹ ban đầu
      const leverage = p.leverage != null ? num(p.leverage) : (im > 0 ? Math.round(notional / im) : null);
      const upnl = num(p.unRealizedProfit);
      posUp += upnl;
      positions.push({
        symbol: p.symbol,
        side: p.positionSide && p.positionSide !== "BOTH" ? p.positionSide : (amt > 0 ? "LONG" : "SHORT"),
        amt, entry: num(p.entryPrice), mark: num(p.markPrice), upnl, leverage,
        liq: num(p.liquidationPrice) || null, notional, marginType: p.marginType || null,
      });
    }
  }
  positions.sort((a, b) => Math.abs(b.upnl) - Math.abs(a.upnl));
  // Lãi/lỗ chưa chốt: ưu tiên tổng theo vị thế (gồm cả isolated); không đọc được vị thế thì dùng crossUnPnl
  const unrealized = posOk ? posUp : crossUp;
  return {
    data: {
      wallet, unrealized, available, marginBalance: wallet + unrealized, positions,
      assets: assets.filter((a) => !STABLE.has(a.asset)), // tài sản ký quỹ khác (BNB/BTC…) — chưa quy USD
      positionsError: posOk ? null : bErr(pr),
    },
  };
}

// ===== Simple Earn (linh hoạt + cố định) → số lượng theo coin =====
async function earnPositions(KEY, SECRET) {
  const qty = {}, detail = {};
  let ok = false, err = null;
  for (const kind of ["flexible", "locked"]) {
    for (let page = 1; page <= 5; page++) {
      const r = await signedGet("/sapi/v1/simple-earn/" + kind + "/position", "current=" + page + "&size=100", KEY, SECRET);
      if (!r.ok) { err = kind + ": " + bErr(r); break; }
      ok = true;
      const rows = r.data && Array.isArray(r.data.rows) ? r.data.rows : [];
      for (const p of rows) {
        const a = p.asset;
        const amt = num(kind === "flexible" ? p.totalAmount : p.amount);
        if (!a || !(amt > 0)) continue;
        qty[a] = (qty[a] || 0) + amt;
        const d = detail[a] || (detail[a] = { flexible: 0, locked: 0 });
        d[kind] += amt;
      }
      const total = num(r.data && r.data.total);
      if (rows.length < 100 || page * 100 >= total) break;
    }
  }
  return ok ? { qty, detail, error: err } : { qty: null, detail: null, error: err || "Không đọc được Earn" };
}

// ===== Convert (Chuyển đổi) 12 tháng — cửa sổ 30 ngày (giới hạn của Binance) =====
async function convertFlow(KEY, SECRET) {
  const DAY = 86400000, now = Date.now();
  const wins = [];
  for (let i = 0; i < 13; i++) { const end = now - i * 30 * DAY; wins.push([end - 30 * DAY + 1, end]); }
  let err = null, okCount = 0;
  const lists = await pool(wins, 3, async ([s, e]) => {
    const r = await signedGet("/sapi/v1/convert/tradeFlow", "startTime=" + s + "&endTime=" + e + "&limit=1000", KEY, SECRET);
    if (!r.ok) { err = bErr(r); return []; }
    okCount++;
    return r.data && Array.isArray(r.data.list) ? r.data.list : [];
  });
  const byAsset = {}, seen = new Set();
  let count = 0;
  const push = (a, ev) => { (byAsset[a] || (byAsset[a] = [])).push(ev); count++; };
  for (const o of lists.flat()) {
    if (!o || (o.orderStatus && o.orderStatus !== "SUCCESS")) continue;
    const id = String(o.orderId || o.quoteId || "");
    if (id) { if (seen.has(id)) continue; seen.add(id); }
    const fa = o.fromAsset, ta = o.toAsset, fx = num(o.fromAmount), tx = num(o.toAmount), t = num(o.createTime);
    if (!(fx > 0) || !(tx > 0)) continue;
    // Phí Convert nằm sẵn trong tỉ giá → fee = 0
    if (QUOTES.includes(fa) && !STABLE.has(ta)) push(ta, { time: t, side: "BUY", qty: tx, price: fx / tx, quote: fx, fee: 0, feeAsset: null, quoteAsset: fa, src: "convert" });
    else if (QUOTES.includes(ta) && !STABLE.has(fa)) push(fa, { time: t, side: "SELL", qty: fx, price: tx / fx, quote: tx, fee: 0, feeAsset: null, quoteAsset: ta, src: "convert" });
  }
  return { byAsset, count, ok: okCount > 0, error: okCount > 0 ? null : err };
}

// Lệnh khớp Spot của 1 cặp — từ lệnh ĐẦU TIÊN (fromId=0), tối đa 5 trang × 1000
async function pairTrades(asset, quote, KEY, SECRET) {
  const sym = asset + quote;
  const all = [];
  let fromId = 0, truncated = false, err = null;
  for (let page = 0; page < 5; page++) {
    const r = await signedGet("/api/v3/myTrades", "symbol=" + sym + "&fromId=" + fromId + "&limit=1000", KEY, SECRET);
    if (!r.ok || !Array.isArray(r.data)) {
      // -1121 = cặp không tồn tại → bỏ qua lặng lẽ
      if (!(r.data && r.data.code === -1121)) err = sym + ": " + bErr(r);
      break;
    }
    for (const tr of r.data) {
      all.push({
        time: num(tr.time), side: tr.isBuyer ? "BUY" : "SELL", qty: num(tr.qty), price: num(tr.price),
        quote: num(tr.quoteQty), fee: num(tr.commission), feeAsset: tr.commissionAsset || null, quoteAsset: quote, src: "spot", id: num(tr.id),
      });
    }
    if (r.data.length < 1000) break;
    fromId = num(r.data[r.data.length - 1].id) + 1;
    if (page === 4) truncated = true;
  }
  return { list: all, truncated, err };
}

// Giá vốn TB gia quyền theo thời gian: mua → cộng SL & vốn; bán → chốt lãi tại giá TB, giảm SL & vốn theo TB
function costBasis(asset, events, bnbPx) {
  events.sort((a, b) => a.time - b.time || (a.id || 0) - (b.id || 0));
  let q = 0, cost = 0, realized = 0, fees = 0, unmatched = 0;
  for (const e of events) {
    const feeQuote = e.fee && e.feeAsset === e.quoteAsset ? e.fee : 0;
    const feeBase = e.fee && e.feeAsset === asset ? e.fee : 0;
    const feeBnb = e.fee && !feeQuote && !feeBase && e.feeAsset === "BNB" ? e.fee : 0;
    // Phí quy USD để báo cáo (phí BNB quy theo giá BNB hiện tại — gần đúng; không cộng vào vốn)
    fees += feeQuote + feeBase * e.price + (bnbPx ? feeBnb * bnbPx : 0);
    if (e.side === "BUY") {
      q += Math.max(0, e.qty - feeBase); // phí trừ bằng chính coin → nhận ít coin hơn
      cost += e.quote + feeQuote;        // phí trả bằng USDT… → cộng vào vốn
    } else {
      const avg = q > 0 ? cost / q : 0;
      const m = Math.min(e.qty, q);
      realized += (e.price - avg) * m - feeQuote;
      cost -= avg * m; q -= m;
      if (e.qty > m) unmatched += e.qty - m; // bán coin không rõ giá vốn (nạp từ ví ngoài…) → không tính lãi phần này
      if (feeBase > 0 && q > 0) { const f = Math.min(feeBase, q); realized -= avg * f; cost -= avg * f; q -= f; }
    }
    if (q < 1e-12) { q = 0; cost = 0; }
  }
  const recent = events.slice(-15).reverse().map((e) => ({
    time: e.time, side: e.side, qty: e.qty, price: e.price, quote: e.quote, fee: e.fee, feeAsset: e.feeAsset, quoteAsset: e.quoteAsset, src: e.src,
  }));
  return { avgCost: q > 0 ? cost / q : null, trackedQty: q, realizedPnl: realized, fees, tradeCount: events.length, unmatchedSellQty: unmatched, recent };
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

// Lịch sử P2P (mua/bán USDT bằng VND) — nguồn "nạp tiền" chính ở VN.
// ⚠ API này KHÔNG truyền thời gian thì chỉ trả ~30 ngày gần nhất → khoản nạp cũ "rơi" khỏi tổng (đã nạp giảm dần).
// → Quét lùi từng cửa sổ 30 ngày (tối đa 24 tháng), trả cả danh sách có mã lệnh để app lưu sổ cộng dồn.
async function p2pHistory(KEY, SECRET) {
  const DAY = 86400000, now = Date.now(), seen = new Map();
  for (const tradeType of ["BUY", "SELL"]) {
    for (let w = 0; w < 24; w++) {
      const end = now - w * 30 * DAY, start = end - 30 * DAY + 1;
      for (let page = 1; page <= 10; page++) {
        let list = [];
        try {
          const r = await signedGet("/sapi/v1/c2c/orderMatch/listUserOrderHistory", "tradeType=" + tradeType + "&startTimestamp=" + start + "&endTimestamp=" + end + "&page=" + page + "&rows=100", KEY, SECRET);
          list = r.ok && r.data && Array.isArray(r.data.data) ? r.data.data : [];
        } catch (_) { break; }
        for (const o of list) {
          if ((o.orderStatus || "") !== "COMPLETED" || o.fiat !== "VND") continue;
          const id = String(o.orderNumber || `${tradeType}|${o.createTime}|${o.totalPrice}`);
          seen.set(id, { id, t: tradeType, vnd: Number(o.totalPrice || 0), amount: Number(o.amount || 0), asset: o.asset, date: o.createTime });
        }
        if (list.length < 100) break;
      }
    }
  }
  const items = [...seen.values()].sort((a, b) => b.date - a.date);
  const buyVND = items.filter((x) => x.t === "BUY").reduce((s, x) => s + x.vnd, 0), sellVND = items.filter((x) => x.t === "SELL").reduce((s, x) => s + x.vnd, 0);
  return { buyVND, sellVND, netVND: buyVND - sellVND, count: items.length, items: items.slice(0, 500) };
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
    // Mọi nguồn độc lập chạy SONG SONG (mỗi nguồn tự bắt lỗi) → nhanh hơn, 1 nguồn lỗi không làm hỏng cả phản hồi
    const safe = (p, fb) => p.catch((e) => fb(String(e)));
    const [acc, fut, earn, conv, dep, p2p, bnbPx] = await Promise.all([
      signedGet("/api/v3/account", "", KEY, SECRET),
      safe(futuresInfo(KEY, SECRET), (e) => ({ error: "Futures: " + e })),
      safe(earnPositions(KEY, SECRET), (e) => ({ qty: null, detail: null, error: e })),
      safe(convertFlow(KEY, SECRET), (e) => ({ byAsset: {}, count: 0, ok: false, error: e })),
      fiatDeposits(KEY, SECRET),
      p2pHistory(KEY, SECRET),
      fetch(SPOT + "/api/v3/ticker/price?symbol=BNBUSDT").then((r) => r.json()).then((d) => num(d && d.price) || null).catch(() => null),
    ]);
    if (!acc.ok) return json({ error: "Binance: " + (acc.data.msg || acc.status) }, 502);
    const balances = (acc.data.balances || [])
      .map((b) => ({ asset: b.asset, qty: Number(b.free) + Number(b.locked) }))
      .filter((b) => b.qty > 0);

    // Gộp Earn: earnQty riêng, totalQty = Spot + Earn; coin chỉ nằm ở Earn cũng có dòng (qty = 0)
    if (earn.qty) {
      // Spot có thể hiện token "LD<coin>" đại diện Earn linh hoạt → bỏ để không đếm 2 lần
      for (let i = balances.length - 1; i >= 0; i--) {
        const a = balances[i].asset;
        if (a.startsWith("LD") && earn.qty[a.slice(2)] != null) balances.splice(i, 1);
      }
      for (const [a, q] of Object.entries(earn.qty)) {
        let b = balances.find((x) => x.asset === a);
        if (!b) { b = { asset: a, qty: 0 }; balances.push(b); }
        b.earnQty = q;
      }
    }
    for (const b of balances) { b.earnQty = b.earnQty || 0; b.totalQty = b.qty + b.earnQty; }
    balances.sort((a, b) => b.totalQty - a.totalQty);

    // Giá vốn TB + lãi đã chốt — mỗi coin 1 việc, tối đa 3 coin song song; coin lỗi giữ avgCost = null
    const truncated = [], costErrors = [];
    await pool(balances, 3, async (b) => {
      if (STABLE.has(b.asset)) { b.avgCost = 1; b.invested = b.totalQty; return; }
      b.avgCost = null; b.invested = null;
      try {
        const events = [];
        let trunc = false;
        for (const qa of QUOTES) {
          const t = await pairTrades(b.asset, qa, KEY, SECRET);
          events.push(...t.list);
          if (t.truncated) { trunc = true; truncated.push(b.asset + qa); }
          if (t.err) costErrors.push(t.err);
        }
        events.push(...((conv.byAsset && conv.byAsset[b.asset]) || []));
        if (!events.length) { b.realizedPnl = null; b.fees = 0; b.tradeCount = 0; b.recent = []; return; }
        const cb = costBasis(b.asset, events, bnbPx);
        b.avgCost = cb.avgCost;
        b.invested = cb.avgCost != null ? b.totalQty * cb.avgCost : null;
        b.realizedPnl = cb.realizedPnl;
        b.fees = cb.fees;
        b.tradeCount = cb.tradeCount;
        b.trackedQty = cb.trackedQty;
        b.unmatchedSellQty = cb.unmatchedSellQty;
        b.recent = cb.recent;
        if (trunc) b.truncated = true; // > 5000 lệnh/cặp: thiếu lệnh mới nhất → giá vốn có thể lệch
      } catch (e) { costErrors.push(b.asset + ": " + String(e)); }
    });

    // "Đã nạp" = fiat VND + P2P mua VND − P2P bán VND (net tiền VN đã bỏ vào)
    const depositedVND = (dep.totalVND || 0) + (p2p.netVND || 0);
    const out = {
      version: 2,
      balances,
      deposited: { vnd: depositedVND, fiatVND: dep.totalVND, p2pBuyVND: p2p.buyVND, p2pSellVND: p2p.sellVND, count: dep.count + p2p.count, p2pItems: p2p.items, fiatItems: dep.items },
      earn: earn.qty ? { detail: earn.detail } : null,
      earnError: earn.error || null,
      futures: fut.data || null,
      futuresError: fut.error || null,
      cost: {
        method: "weighted-average",
        quotes: QUOTES,
        convertOk: !!conv.ok, convertCount: conv.count || 0, convertError: conv.error || null,
        truncated, errors: costErrors.slice(0, 10), bnbPx,
      },
      updatedAt: Date.now(),
    };
    if (debug) out.depositItems = { fiat: dep.items, p2p: p2p.items };
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
