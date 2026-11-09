// Kiểm thử MỞ TỪNG TRANG + thao tác dễ sập (01/11): trang nào lỗi khi hiển thị là chặn bản cập nhật.
// Dữ liệu mẫu ở fixture.js; Supabase giả lập ở setup.js (không gọi mạng).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" }, signOut: async () => {}, changePassword: async () => ({}) }), AuthProvider: ({ children }) => children }));
// Bắt lỗi React (vd "Rendered fewer hooks") SUỐT cả bài — kể cả lỗi xảy ra sau khi bấm / đổi ô chọn.
// React có thể nuốt lỗi khi vẽ lại → bắt cả console.error lẫn lỗi ném ra ngoài.
let errors = [], spy;
beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils|width\(0\)|height\(0\)/.test(m)) errors.push(m.slice(0, 300)); });
});
afterEach(() => { spy.mockRestore(); cleanup(); DATA = makeData(); });
const onWinErr = (e) => { errors.push(String(e.error?.message || e.message).slice(0, 300)); e.preventDefault(); };
window.addEventListener("error", onWinErr);

async function mount(el, path = "/") {
  let r;
  await act(async () => { r = render(<MemoryRouter initialEntries={[path]}><Suspense fallback={<div>đang tải</div>}>{el}</Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });
  return { ...r, errors };
}
// Đổi giá trị / bấm có bắt lỗi ném ra (React 18 ném lỗi vẽ lại qua act)
async function safely(fn) { try { await act(async () => { fn(); await new Promise((ok) => setTimeout(ok, 20)); }); } catch (e) { errors.push(String(e?.message || e).slice(0, 300)); } }

const PAGES = [
  ["Tổng quan", () => import("../src/pages/Dashboard.jsx"), "/"],
  ["Trung tâm báo cáo", () => import("../src/pages/Reports.jsx"), "/bao-cao"],
  ["Khách & Dự án", () => import("../src/pages/Customers.jsx"), "/khach-hang"],
  ["Kế toán", () => import("../src/pages/Ketoan.jsx"), "/ke-toan"],
  ["Chi phí", () => import("../src/pages/Expenses.jsx"), "/chi-phi"],
  ["Quỹ / Dòng tiền", () => import("../src/pages/Funds.jsx"), "/quy"],
  ["Công việc", () => import("../src/pages/Tasks.jsx"), "/cong-viec"],
  ["Tài nguyên", () => import("../src/pages/Resources.jsx"), "/tai-nguyen"],
  ["Tài khoản & Thẻ", () => import("../src/pages/Vault.jsx"), "/tai-khoan"],
  ["Quảng cáo", () => import("../src/pages/Ads.jsx"), "/quang-cao"],
  ["Website", () => import("../src/pages/Web.jsx"), "/website"],
  ["Fanpage", () => import("../src/pages/Fanpage.jsx"), "/fanpage"],
  ["Cài đặt", () => import("../src/pages/Settings.jsx"), "/cai-dat"],
];

describe("mở từng trang không lỗi", () => {
  for (const [name, load, path] of PAGES) {
    it(name, async () => {
      const C = (await load()).default;
      const { errors, container } = await mount(<C />, path);
      expect(errors).toEqual([]);
      expect(container.textContent.length).toBeGreaterThan(20);
    });
  }
});

describe("Kế toán: bấm qua 4 tab", () => {
  it("Doanh thu → Công nợ → Chi phí → Dòng tiền", async () => {
    const K = (await import("../src/pages/Ketoan.jsx")).default;
    const { errors } = await mount(<K />, "/ke-toan");
    for (const t of ["Công nợ", "Chi phí", "Dòng tiền", "Doanh thu"]) {
      await safely(() => fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${t}$`) })[0]));
    }
    expect(errors).toEqual([]);
  });
});

describe("form Thêm dự án", () => {
  it("đổi danh mục qua lại Lương / Web / ADS không sập (lỗi 01/11)", async () => {
    const { ProjectModal } = await import("../src/pages/Projects.jsx");
    const { errors } = await mount(<ProjectModal initial={{ name: "", customerId: "c1", category: "Web", status: "doing", note: "" }} customers={DATA.customerList} onClose={() => {}} onSave={() => {}} />);
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "Lương"));
    expect(sel).toBeTruthy();
    for (const v of ["Lương", "Web", "ADS", "Lương", "Seo"]) await safely(() => fireEvent.change(sel, { target: { value: v } }));
    expect(errors).toEqual([]);
    expect(document.body.textContent).toMatch(/Danh mục/); // form vẫn còn trên màn hình
  });
});

describe("thành viên", () => {
  it("không thấy tab Đầu tư / Bot thật của Coin", async () => {
    DATA = makeData({ isOwner: false, ownerId: "chu", perms: ["coin", "coinMarket", "coinDemo"] });
    const C = (await import("../src/pages/Coin.jsx")).default;
    const { container } = await mount(<C />, "/coin");
    expect(container.textContent).not.toMatch(/Bot thật/);
    expect(container.textContent).not.toMatch(/Đầu tư/);
  });
});

// Nến giả cho Binance (không gọi mạng thật)
const fakeKlines = () => Array.from({ length: 120 }, (_, i) => { const t = 1_700_000_000_000 + i * 3_600_000, o = 100 + Math.sin(i / 5) * 5; return [t, o, o + 2, o - 2, o + Math.cos(i / 3), 1000 + i, t + 1, 0, 0, 500]; });

describe("Coin · nhiều biểu đồ (05/11)", () => {
  it("chọn 4 ô → 4 biểu đồ, đổi khung 1 ô + đổi nhãn không sập", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes("/klines") ? fakeKlines() : { lastPrice: "101", priceChangePercent: "1.2", quoteVolume: "1" }) })));
    localStorage.removeItem("qws_mkt_grid");
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    const { errors } = await mount(<M />, "/coin");
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "4" })));
    await act(async () => { await new Promise((ok) => setTimeout(ok, 80)); });
    const cellSelects = screen.getAllByRole("combobox", { name: /Coin ô/ });
    expect(cellSelects.length).toBe(4);
    expect(screen.getByRole("button", { name: "Đường ngang" })).toBeTruthy(); // chủ có thanh công cụ vẽ (06/11)
    await safely(() => fireEvent.click(screen.getAllByRole("button", { name: "M15" })[1]));
    await safely(() => fireEvent.change(cellSelects[2], { target: { value: "ETH" } }));
    await safely(() => fireEvent.click(screen.getByRole("button", { name: /^Giá GD nhiều nhất:/ })));
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "1 ô" })));
    expect(screen.queryAllByRole("combobox", { name: /Coin ô/ }).length).toBe(0);
    expect(JSON.parse(localStorage.getItem("qws_mkt_tags")).poc).toBe("line");
    // jsdom không có canvas thật → thư viện biểu đồ báo "Value is null" khi đo trục giá (máy thật không có); lỗi khác vẫn chặn
    expect(errors.filter((m) => m !== "Value is null")).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe("thành viên · Thị trường Coin", () => {
  it("không có công cụ vẽ (hình vẽ chỉ của chủ)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
    DATA = makeData({ isOwner: false, ownerId: "chu", perms: ["coin", "coinMarket", "coinDemo"], settings: { coinDrawings: { BTC: [{ id: "x", type: "hline", price: 1 }] } } });
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    await mount(<M />, "/coin");
    expect(screen.queryByRole("button", { name: "Đường ngang" })).toBeNull();
    vi.unstubAllGlobals();
  });
});

// ---- 09/11: Trade COIN (gộp Demo + Bot thật) · Trade Forex · Thị trường Forex ----
describe("Coin · Trade COIN / Trade Forex (09/11)", () => {
  const stubNet = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
  it("thanh tab: Trade COIN + Trade Forex, không còn Demo tự động / Bot thật / EA MT5 ở hàng trên", async () => {
    stubNet(); localStorage.removeItem("qws_coin_tab");
    const C = (await import("../src/pages/Coin.jsx")).default;
    const { container } = await mount(<C />, "/coin");
    const tabs = [...container.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(tabs.some((t) => /Trade COIN/.test(t))).toBe(true);
    expect(tabs.some((t) => /Trade Forex/.test(t))).toBe(true);
    expect(tabs.some((t) => /^EA MT5$/.test(t))).toBe(false);
    vi.unstubAllGlobals();
  });
  it("link cũ ?tab=live mở Trade COIN + công tắc Bot thật; ?tab=mt5 mở Trade Forex", async () => {
    stubNet(); localStorage.removeItem("qws_coin_tab"); localStorage.removeItem("qws_trade_sub");
    const C = (await import("../src/pages/Coin.jsx")).default;
    const { errors, unmount } = await mount(<C />, "/coin?tab=live");
    expect(localStorage.getItem("qws_coin_tab")).toBe("trade");
    expect(localStorage.getItem("qws_trade_sub")).toBe("live");
    expect(screen.getAllByRole("button", { name: /Demo tự động/ }).length).toBeGreaterThan(0); // công tắc Demo | Bot thật
    unmount();
    await mount(<C />, "/coin?tab=mt5");
    expect(localStorage.getItem("qws_coin_tab")).toBe("forex");
    expect(errors.filter((m) => m !== "Value is null")).toEqual([]);
    vi.unstubAllGlobals();
  });
  it("Thị trường: công tắc Coin | Forex — Forex không sập khi cầu nối MT5 chưa chạy", async () => {
    stubNet(); localStorage.setItem("qws_coin_tab", "market"); localStorage.setItem("qws_market_sub", "forex");
    const C = (await import("../src/pages/Coin.jsx")).default;
    const { errors, container } = await mount(<C />, "/coin");
    expect(container.textContent).toMatch(/Thị trường Forex · MT5/);
    expect(container.textContent).toMatch(/Cầu nối giá MT5 chưa chạy|Mã MT5/);
    expect(errors.filter((m) => m !== "Value is null")).toEqual([]);
    localStorage.removeItem("qws_market_sub"); localStorage.removeItem("qws_coin_tab");
    vi.unstubAllGlobals();
  });
});

describe("Thị trường Forex · có dữ liệu MT5 (09/11)", () => {
  it("hiện giá + nến + AI + cảnh báo giá; không có Futures/Spot, dòng tiền lớn; không sập", async () => {
    vi.resetModules();
    const T0 = 1_700_000_000;
    const bars = Array.from({ length: 320 }, (_, i) => { const o = 2600 + Math.sin(i / 7) * 30, c = 2600 + Math.sin((i + 1) / 7) * 30; return { time: T0 + i * 3600, open: o, high: Math.max(o, c) + 4, low: Math.min(o, c) - 4, close: c, volume: 200 + i, buy: 100 + i / 2, sell: 100 + i / 2, nf: true }; });
    const q = { ts: Date.now(), live: true, ok: ["XAUUSD"], missing: [], q: { XAUUSD: { bid: 2650.12, ask: 2650.4, digits: 2, f: { "4h": [bars[319].time, 1, 2, 0.5, 1.5, 9], "1d": [T0, 2600, 2660, 2590, 2650, 1] } } } };
    vi.doMock("../src/lib/mt5Source.js", async (orig) => ({
      ...(await orig()),
      mt5Klines: async () => bars, mt5Ticker: async () => ({ price: 2650.12, chg: 1.9, vol: 0 }), mt5Exists: async () => true,
      subscribeQuotes: (cb) => { cb(q); return () => {}; },
      useMt5Feed: () => ({ q, err: null, loaded: true, ts: q.ts, online: true, ok: q.ok, missing: [] }),
      useMt5Live: () => {},
    }));
    localStorage.removeItem("qws_fx_grid"); localStorage.removeItem("qws_fx_sym");
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    const { errors, container } = await mount(<M venue="forex" />, "/coin");
    const t = container.textContent;
    expect(t).toMatch(/MT5 đang gửi giá/);
    expect(t).toMatch(/XAUUSD/);
    expect(t).not.toMatch(/Dòng tiền lớn/);
    expect(t).toMatch(/Cảnh báo giá/); // 09/11: Forex có cảnh báo giá riêng (qua Worker + cầu nối MT5)
    expect(screen.queryByRole("button", { name: "Futures" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Spot" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Phân tích/ }).length).toBeGreaterThan(0);
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "4" })));
    await act(async () => { await new Promise((ok) => setTimeout(ok, 80)); });
    expect(screen.getAllByRole("combobox", { name: /Coin ô/ }).length).toBe(4);
    expect(JSON.parse(localStorage.getItem("qws_fx_grid")).cells[0].sym).toBe("XAUUSD"); // lưới Forex tách khỏi lưới Coin
    expect(errors.filter((m) => m !== "Value is null")).toEqual([]);
    vi.doUnmock("../src/lib/mt5Source.js");
  });
});

describe("Cảnh báo giá Forex (09/11)", () => {
  it("tab Forex chỉ hiện cảnh báo market=mt5, tab Coin chỉ hiện cảnh báo Binance; link ?tab=fxmarket mở Thị trường → Forex", async () => {
    vi.resetModules();
    const T0 = 1_700_000_000;
    const bars = Array.from({ length: 320 }, (_, i) => { const o = 2600 + Math.sin(i / 7) * 30, c = 2600 + Math.sin((i + 1) / 7) * 30; return { time: T0 + i * 3600, open: o, high: Math.max(o, c) + 4, low: Math.min(o, c) - 4, close: c, volume: 200 + i, buy: 100, sell: 100, nf: true }; });
    const q = { ts: Date.now(), live: true, ok: ["XAUUSD"], missing: [], q: { XAUUSD: { bid: 2650.12, ask: 2650.4, digits: 2, f: { "4h": [bars[319].time, 1, 2, 0.5, 1.5, 9], "1d": [T0, 2600, 2660, 2590, 2650, 1] } } } };
    vi.doMock("../src/lib/mt5Source.js", async (orig) => ({ ...(await orig()), mt5Klines: async () => bars, mt5Ticker: async () => ({ price: 2650.12, chg: 1.9, vol: 0 }), subscribeQuotes: (cb) => { cb(q); return () => {}; }, useMt5Feed: () => ({ q, err: null, loaded: true, ts: q.ts, online: true, ok: q.ok, missing: [] }), useMt5Live: () => {} }));
    vi.doMock("../src/lib/coinShared.js", async (orig) => ({ ...(await orig()), mergeCmd: async () => ({ error: null }) }));
    const rows = { command: { priceAlerts: [{ id: "a1", symbol: "XAUUSD", market: "mt5", op: ">=", price: 2700, createdAt: 1 }, { id: "a2", symbol: "BTCUSDT", market: "futures", op: ">=", price: 99999, createdAt: 2 }] } };
    vi.doMock("../src/lib/supabase.js", async () => {
      const mk = (id) => ({ data: rows[id] ? { data: rows[id] } : null, error: null });
      const chain = () => { const p = Promise.resolve({ data: null, error: null }); const c = new Proxy(() => {}, { get: (_, k) => (k === "then" ? p.then.bind(p) : k === "eq" ? (_c, id) => ({ maybeSingle: async () => mk(id), then: (f) => Promise.resolve(mk(id)).then(f) }) : () => c), apply: () => c }); return c; };
      return { WORKSPACE_TABLE: "qws_workspaces", supabase: { from: () => chain(), rpc: () => chain(), functions: { invoke: async () => ({ data: {}, error: null }) }, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} } };
    });
    localStorage.removeItem("qws_coin_tab"); localStorage.removeItem("qws_market_sub");
    const C = (await import("../src/pages/Coin.jsx")).default;
    const { errors } = await mount(<C />, "/coin?tab=fxmarket");
    await act(async () => { await new Promise((ok) => setTimeout(ok, 120)); });
    expect(localStorage.getItem("qws_coin_tab")).toBe("market");
    expect(localStorage.getItem("qws_market_sub")).toBe("forex");
    const txt = document.body.textContent;
    expect(txt).toMatch(/XAUUSD/);
    expect(txt).toMatch(/Cảnh báo giá · 1 đang chờ/); // 2 cảnh báo trên cloud, tab Forex chỉ đếm cảnh báo MT5
    expect(txt).toMatch(/XAUUSD ≥ 2\.700/);
    expect(txt).not.toMatch(/BTC ≥ 99\.999/);
    expect(errors.filter((m) => m !== "Value is null")).toEqual([]);
    vi.doUnmock("../src/lib/mt5Source.js"); vi.doUnmock("../src/lib/coinShared.js"); vi.doUnmock("../src/lib/supabase.js");
  });
});
