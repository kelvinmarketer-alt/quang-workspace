// 07/11/2026: tab "EA MT5" — hiển thị trạng thái/lịch sử EA QWS_Gop từ bảng qws_mt5_bot (dữ liệu giả, không gọi mạng)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const now = Date.now();
const ROWS = [
  { id: "status", data: { ts: now, online: true, connected: true, algo: true, eaAgeS: 20,
    account: { login: 53134370, server: "ICMarketsSC-Demo", demo: true, currency: "USD", leverage: 100, balance: 1012.5, equity: 1020, margin: 5, freeMargin: 1015, marginLevel: 20400 },
    ea: { ts: Math.floor(now / 1000), stop: false, peak: 1012.5, brake: 1, todayPnl: 12.5, dailyStop: 2, slots: [0, 1, 2, 3, 4, 5].map((k) => ({ k, en: true, risk: 1.3, offUntil: 0 })) },
    positions: [{ ticket: 9, slot: 1, name: "D BTC", sym: "BTCUSD", side: 1, vol: 0.01, open: 100000, cur: 100750, sl: 98400, tp: null, pnl: 7.5, risk: 16, t: now - 3600e3 }],
    orders: [], log: ["2026.11.07 03:42:20 BẬT QWS_Gop"], bridge: { version: "t", startedAt: now } } },
  { id: "history", data: { updatedAt: now, equity: [{ t: now - 9e5, bal: 1000, eq: 1000 }, { t: now, bal: 1012.5, eq: 1020 }],
    trades: [{ id: 1, slot: 0, name: "D vàng", sym: "XAUUSD", side: 1, vol: 0.02, open: 4000, exit: 4010, t_in: now - 2 * 864e5, t_out: now - 864e5, pnl: 12.5, risk: 20, R: 0.625, closed: true, how: "sl", partial: true }] } },
];
vi.mock("../src/lib/supabase.js", () => ({
  WORKSPACE_TABLE: "qws_workspaces",
  supabase: { from: () => ({ select: async () => ({ data: ROWS, error: null }) }) },
}));
vi.mock("../src/lib/store.jsx", () => ({ useData: () => ({ isOwner: true }), DataProvider: ({ children }) => children }));

afterEach(cleanup);

describe("EA MT5", () => {
  it("tính thống kê theo ngăn", async () => {
    const { mt5Stats } = await import("../src/pages/CoinMT5.jsx");
    const s = mt5Stats(ROWS[1].data.trades);
    expect(s.n).toBe(1);
    expect(s.win).toBe(100);
    expect(s.bySlot[0].avgR).toBeCloseTo(0.625);
    expect(s.bySlot[1].n).toBe(0);
  });
  it("hiển thị trạng thái, vị thế, lịch sử", async () => {
    const M = (await import("../src/pages/CoinMT5.jsx")).default;
    await act(async () => { render(<M active />); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
    expect(screen.getByText(/EA QWS_Gop · MT5/)).toBeTruthy();
    expect(screen.getByText(/DEMO · 53134370/)).toBeTruthy();
    expect(screen.getAllByText("BTCUSD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("XAUUSD").length).toBeGreaterThan(0);
    expect(screen.getByText("Dừng EA")).toBeTruthy();
  });
});
