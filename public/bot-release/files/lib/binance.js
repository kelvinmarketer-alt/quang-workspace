// Gọi API Binance USDⓈ-M Futures (ký HMAC). MODE=testnet → testnet.binancefuture.com (tiền ảo), MODE=live → fapi.binance.com.
import crypto from "node:crypto";

const BASES = { testnet: "https://testnet.binancefuture.com", live: "https://fapi.binance.com" };
export const MAIN = BASES.live; // dữ liệu nến/giá thật luôn lấy từ sàn thật

export function makeClient({ mode = "testnet", key, secret }) {
  const base = BASES[mode];
  if (!base) throw new Error(`MODE không hợp lệ: ${mode} (chỉ testnet | live)`);
  let offset = 0; // lệch giờ máy ↔ sàn
  const sign = (qs) => crypto.createHmac("sha256", secret).update(qs).digest("hex");

  async function req(method, path, params = {}, signed = true, tries = 3) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) p.set(k, String(v));
    if (signed) { p.set("timestamp", String(Date.now() + offset)); p.set("recvWindow", "10000"); p.set("signature", sign(p.toString())); }
    const url = `${base}${path}${method === "GET" || method === "DELETE" ? `?${p}` : ""}`;
    let r;
    try {
      r = await fetch(url, { method, headers: { "X-MBX-APIKEY": key || "", ...(method === "POST" || method === "PUT" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: method === "POST" || method === "PUT" ? p.toString() : undefined, signal: AbortSignal.timeout(20000) }); // treo quá 20 giây → thử lại
    } catch (e) {
      if (tries > 1) { await sleep(1500); return req(method, path, params, signed, tries - 1); }
      throw new Error(`Mạng lỗi khi gọi ${path}: ${e.message}`);
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status === 418) { if (tries > 1) { await sleep(5000); return req(method, path, params, signed, tries - 1); } }
    if (j && j.code === -1021 && tries > 1) { await syncTime(); return req(method, path, params, signed, tries - 1); } // lệch giờ
    if (!r.ok || (j && j.code && j.code < 0)) { const err = new Error(`Binance ${path}: ${j.msg || r.status} (${j.code ?? r.status})`); err.code = j.code; throw err; }
    return j;
  }
  async function syncTime() { const t = await (await fetch(`${base}/fapi/v1/time`, { signal: AbortSignal.timeout(15000) })).json(); offset = t.serverTime - Date.now(); }

  // Bộ lọc giá/khối lượng của từng cặp (làm tròn đúng bước giá, bước khối lượng, giá trị tối thiểu)
  let filters = null;
  async function symbolInfo(symbol) {
    if (!filters) {
      const ex = await req("GET", "/fapi/v1/exchangeInfo", {}, false);
      filters = {};
      for (const s of ex.symbols) {
        const f = Object.fromEntries(s.filters.map((x) => [x.filterType, x]));
        filters[s.symbol] = { tick: Number(f.PRICE_FILTER.tickSize), step: Number(f.LOT_SIZE.stepSize), minQty: Number(f.LOT_SIZE.minQty), minNotional: Number(f.MIN_NOTIONAL?.notional || 0), status: s.status };
      }
    }
    const i = filters[symbol]; if (!i) throw new Error(`Sàn không có cặp ${symbol}`);
    return i;
  }
  const dec = (x) => { const s = String(x); return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] || "").replace(/0+$/, "").length; };
  const roundTo = (v, step, mode = "round") => { const n = Math[mode](v / step) * step; return Number(n.toFixed(dec(step))); };

  // Lệnh điều kiện (SL/TP): thử endpoint thường; sàn đã chuyển sang Algo Order thì dùng endpoint mới
  async function conditional({ symbol, side, type, stopPrice, closePosition = true, clientId }) {
    try {
      return { kind: "order", ...(await req("POST", "/fapi/v1/order", { symbol, side, type, stopPrice, closePosition, workingType: "MARK_PRICE", priceProtect: true, newClientOrderId: clientId })) };
    } catch (e) {
      if (!/algo/i.test(e.message) && e.code !== -4120) throw e;
      return { kind: "algo", ...(await req("POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol, side, type, triggerPrice: stopPrice, closePosition, workingType: "MARK_PRICE", priceProtect: true, clientAlgoId: clientId })) };
    }
  }
  async function openAlgo(symbol) { try { const r = await req("GET", "/fapi/v1/openAlgoOrders", { symbol }); return Array.isArray(r) ? r : r.orders || []; } catch { return []; } }

  return {
    mode, base, syncTime, symbolInfo, roundTo, conditional, openAlgo,
    ping: () => req("GET", "/fapi/v1/ping", {}, false),
    account: () => req("GET", "/fapi/v3/account"),
    balance: () => req("GET", "/fapi/v3/balance"),
    positions: () => req("GET", "/fapi/v3/positionRisk"),
    openOrders: (symbol) => req("GET", "/fapi/v1/openOrders", symbol ? { symbol } : {}),
    order: (symbol, origClientOrderId) => req("GET", "/fapi/v1/order", { symbol, origClientOrderId }),
    placeLimit: ({ symbol, side, quantity, price, clientId }) => req("POST", "/fapi/v1/order", { symbol, side, type: "LIMIT", timeInForce: "GTC", quantity, price, newClientOrderId: clientId }),
    marketClose: ({ symbol, side, quantity }) => req("POST", "/fapi/v1/order", { symbol, side, type: "MARKET", quantity, reduceOnly: true }),
    cancel: (symbol, origClientOrderId) => req("DELETE", "/fapi/v1/order", { symbol, origClientOrderId }),
    cancelAll: (symbol) => req("DELETE", "/fapi/v1/allOpenOrders", { symbol }),
    cancelAlgo: (algoId) => req("DELETE", "/fapi/v1/algoOrder", { algoId }),
    setLeverage: (symbol, leverage) => req("POST", "/fapi/v1/leverage", { symbol, leverage }),
    setMarginType: (symbol, marginType) => req("POST", "/fapi/v1/marginType", { symbol, marginType }).catch((e) => { if (e.code !== -4046) throw e; }), // -4046 = đã đúng loại
    positionMode: () => req("GET", "/fapi/v1/positionSide/dual"),
    income: (params) => req("GET", "/fapi/v1/income", params),
    userTrades: (symbol, params = {}) => req("GET", "/fapi/v1/userTrades", { symbol, ...params }),
    markPrice: (symbol) => req("GET", "/fapi/v1/premiumIndex", { symbol }, false),
  };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
