// 21/11/2026: tab "EA MT5" khi EA demo là Victor V5 (8 mã, 2,72% × hệ số, lệnh slot = -1). Dữ liệu giả, không gọi mạng.
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const now = Date.now();
const MA = ["XAUUSD", "XAGUSD", "XTIUSD", "USDJPY", "US500", "USTEC", "JP225", "US2000"];
const HS = [1, 0.5, 1, 0.5, 4, 4, 2, 1], TD = [4, 3, 2, 2, 1, 1, 1, 1];
const ROWS = [
  { id: "status", data: { ts: now, online: true, connected: true, algo: true, eaAgeS: 20,
    account: { login: 53134370, server: "ICMarketsSC-Demo", demo: true, currency: "USD", leverage: 100, balance: 1030, equity: 1035, marginLevel: 9000 },
    ea: { ts: Math.floor(now / 1000), ea: "Victor V5", stop: false, peak: 1040, brake: 1, todayPnl: 5, dailyStop: 0, openCap: 0, riskBase: 2.72, magic: 5700, orders: 1,
      slots: MA.map((sym, k) => ({ k, sym, name: sym, en: true, risk: 2.72 * HS[k], max: TD[k], open: k === 0 ? 1 : 0, offUntil: 0 })) },
    positions: [{ ticket: 11, slot: -1, name: "V5 phá đỉnh XAUUSD", sym: "XAUUSD", side: 1, vol: 0.01, open: 4100, cur: 4105, sl: 4080, tp: null, pnl: 5, risk: 20, t: now - 3600e3 }],
    orders: [], log: ["2026.11.21 10:00:00 BAT Victor V5"], bridge: { version: "2026-11-21.1", startedAt: now } } },
  { id: "history", data: { updatedAt: now, equity: [{ t: now - 9e5, bal: 1000, eq: 1000 }, { t: now, bal: 1030, eq: 1035 }],
    trades: [
      { id: 1, slot: 0, name: "D vàng", sym: "XAUUSD", side: 1, vol: 0.02, open: 4000, exit: 4010, t_in: now - 5 * 864e5, t_out: now - 4 * 864e5, pnl: 12.5, R: 0.6, closed: true },
      { id: 2, slot: -1, name: "V5 sốc ngày US500", sym: "US500", side: -1, vol: 0.1, open: 6000, exit: 5980, t_in: now - 2 * 864e5, t_out: now - 864e5, pnl: 20, R: 0.8, closed: true },
      { id: 3, slot: -1, name: "V5 phá đỉnh XAUUSD", sym: "XAUUSD", side: 1, vol: 0.01, open: 4090, exit: 4080, t_in: now - 864e5, t_out: now - 4e6, pnl: -2.5, R: -0.2, closed: true },
    ] } },
];
vi.mock("../src/lib/supabase.js", () => ({
  WORKSPACE_TABLE: "qws_workspaces",
  supabase: { from: () => ({ select: async () => ({ data: ROWS, error: null }) }) },
}));
vi.mock("../src/lib/store.jsx", () => ({ useData: () => ({ isOwner: true }), DataProvider: ({ children }) => children }));

afterEach(cleanup);
afterAll(async () => { cleanup(); await new Promise((ok) => setTimeout(ok, 500)); });

describe("EA MT5 — Victor V5", () => {
  it("thống kê theo mã, tách lịch sử QWS cũ", async () => {
    const { mt5Stats } = await import("../src/pages/CoinMT5.jsx");
    const s = mt5Stats(ROWS[1].data.trades, ROWS[0].data.ea.slots);
    expect(s.bySlot).toHaveLength(8);
    expect(s.n).toBe(2);
    expect(s.bySlot.find((x) => x.sym === "US500").pnl).toBe(20);
    expect(s.bySlot.find((x) => x.sym === "XAUUSD").n).toBe(1);
    expect(s.old.n).toBe(1);
  });
  it("hiển thị đúng EA Victor, 8 mã, không còn nhãn QWS", async () => {
    const M = (await import("../src/pages/CoinMT5.jsx")).default;
    await act(async () => { render(<M active />); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
    expect(screen.getByText(/EA Victor V5 · MT5/)).toBeTruthy();
    expect(screen.queryByText(/EA QWS_Gop · MT5/)).toBeNull();
    expect(screen.getByText(/8 mã · 2,72% × hệ số/)).toBeTruthy();
    expect(screen.getByText("Từng mã & so với kiểm thử")).toBeTruthy();
    for (const m of ["XAGUSD", "XTIUSD", "USDJPY", "USTEC", "US2000"]) expect(screen.getAllByText(m).length).toBeGreaterThan(0);
    expect(screen.getAllByText("V5 phá đỉnh XAUUSD").length).toBeGreaterThan(0);
    expect(screen.queryByText(/dừng ngày khi lỗ/)).toBeNull();
    expect(screen.queryByText(/Phanh sụt vốn/)).toBeNull();
    expect(screen.getByText(/Lịch sử QWS_Gop trước 21\/11: 1 lệnh/)).toBeTruthy();
  });
});
