import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase giả: mỗi lần select().eq(id).maybeSingle() trả theo bảng rows
const rows = {};
vi.mock("../src/lib/supabase.js", () => ({
  supabase: { from: () => ({ select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: rows[id] ? { data: rows[id], updated_at: "x" } : null, error: null }) }) }), upsert: async (r) => { rows[r.id] = r.data; return { error: null }; } }) },
}));

const T0 = 1_700_000_000;
const bar = (i, o = 100, c = 101) => [T0 + i * 3600, o, Math.max(o, c) + 1, Math.min(o, c) - 1, c, 50 + i];

describe("mt5Source", () => {
  beforeEach(() => { for (const k of Object.keys(rows)) delete rows[k]; vi.resetModules(); });

  it("đọc nến, ghép nến đang chạy từ mkq, giữ cờ nf", async () => {
    rows["mk|XAUUSD|1h"] = { bars: [bar(0), bar(1), bar(2)] };
    rows["mkq"] = { ts: Date.now(), ok: ["XAUUSD"], missing: [], q: { XAUUSD: { bid: 2650, ask: 2650.3, digits: 2, f: { "1h": [T0 + 2 * 3600, 100, 105, 99, 103, 77], "1d": [T0, 2600, 2660, 2590, 2650, 1] } } } };
    const { mt5Klines, mt5Ticker } = await import("../src/lib/mt5Source.js");
    const k = await mt5Klines("XAUUSD", "1h", 300);
    expect(k).toHaveLength(3);
    expect(k[2].close).toBe(103);                       // nến cuối thay bằng nến đang chạy
    expect(k[2].nf).toBe(true);
    expect(k[0].buy + k[0].sell).toBe(k[0].volume);
    const t = await mt5Ticker("XAUUSD");
    expect(t.price).toBe(2650);
    expect(t.chg).toBeCloseTo(((2650 - 2600) / 2600) * 100, 6);
  });

  it("mã sàn không có → badSymbol; chưa có cầu nối → lỗi hướng dẫn", async () => {
    rows["mkq"] = { ts: Date.now(), ok: [], missing: ["FOO"], q: {} };
    const { mt5Klines } = await import("../src/lib/mt5Source.js");
    await expect(mt5Klines("FOO", "1h")).rejects.toMatchObject({ badSymbol: true });
    delete rows["mkq"]; vi.resetModules();
    const m2 = await import("../src/lib/mt5Source.js");
    await expect(m2.mt5Klines("XAUUSD", "1h")).rejects.toThrow(/Cầu nối MT5 chưa chạy/);
  });

  it("startTime/endTime lọc đúng, analyze() chạy trên nến forex không NaN", async () => {
    const n = 320; rows["mk|EURUSD|1h"] = { bars: Array.from({ length: n }, (_, i) => bar(i, 1 + Math.sin(i / 9) * 0.02, 1 + Math.sin((i + 1) / 9) * 0.02)) };
    rows["mkq"] = { ts: Date.now(), ok: ["EURUSD"], missing: [], q: {} };
    const { mt5Klines } = await import("../src/lib/mt5Source.js");
    const part = await mt5Klines("EURUSD", "1h", 50, { startTime: (T0 + 100 * 3600) * 1000 });
    expect(part[0].time).toBe(T0 + 100 * 3600);
    expect(part).toHaveLength(50);
    const { analyze, compactCandles } = await import("../src/lib/ta.js");
    const k = await mt5Klines("EURUSD", "1h", 300);
    const s = analyze(k).summary;
    expect(s.volume.buyRatio20).toBeNull();
    expect(s.volume.deltaLastClosed).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/NaN/);
    expect(compactCandles(k, 5)[0][5]).toBeNull();
  });

  it("AI Forex: gửi mã không đuôi USDT + dặn tick volume / phiên giao dịch; AI Coin giữ nguyên", async () => {
    const sent = [];
    vi.stubGlobal("fetch", vi.fn(async (_u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ bias: "tăng", confidence: 60, setups: [] }) } }] }) }; }));
    const { aiMarketAnalysis } = await import("../src/lib/ai.js");
    const base = { tf: "H4", htf: "1d", summary: { volatility: { atr: 5 } }, htfSummary: {}, candles: [], apiKey: "k", model: "gpt-4o" };
    await aiMarketAnalysis({ ...base, symbol: "XAUUSD", venue: "forex" });
    await aiMarketAnalysis({ ...base, symbol: "BTC" });
    const [fx, coin] = sent.map((b) => ({ sys: b.messages[0].content, user: JSON.parse(b.messages[1].content) }));
    expect(fx.user.symbol).toBe("XAUUSD");
    expect(fx.sys).toMatch(/TICK VOLUME/);
    expect(fx.sys).toMatch(/Forex\/CFD/);
    expect(coin.user.symbol).toBe("BTCUSDT");
    expect(coin.sys).not.toMatch(/TICK VOLUME/);
    vi.unstubAllGlobals();
  });
});
