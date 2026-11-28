// Kịch bản ĐIỆN THOẠI tự động (28/11, sếp: "làm tất cả" — mục 4): giả lập màn hình hẹp (≤ 639px) rồi thao tác như trên
// điện thoại: biểu đồ (kéo tự do, thanh đổi chiều cao, hộp Chỉ báo RSI/MACD/Heikin Ashi/log, công cụ vẽ, chuông cảnh báo),
// lưới 4 ô có thanh kéo, mở Backtest (tải dần), Cài đặt với email dài. Lỗi = chặn bản cập nhật (chạy trong npm test).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "ten.email.rat.dai.cua.chu.workspace@example.com" }, signOut: async () => {}, changePassword: async () => ({}) }), AuthProvider: ({ children }) => children }));

const PHONE = (q) => ({ matches: /max-width:\s*639px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
const fakeKlines = () => Array.from({ length: 160 }, (_, i) => { const t = 1_700_000_000_000 + i * 3_600_000, o = 100 + Math.sin(i / 5) * 5; return [t, o, o + 2, o - 2, o + Math.cos(i / 3), 1000 + i, t + 1, 0, 0, 500]; });
const net = () => vi.stubGlobal("fetch", vi.fn(async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes("/klines") ? fakeKlines() : { lastPrice: "101", priceChangePercent: "1.2", quoteVolume: "1" }) })));

let errors = [], spy, mm;
const onWinErr = (e) => { errors.push(String(e.error?.message || e.message).slice(0, 300)); e.preventDefault(); };
window.addEventListener("error", onWinErr);
beforeEach(() => {
  errors = []; localStorage.clear(); mm = window.matchMedia; window.matchMedia = PHONE; net();
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils|width\(0\)|height\(0\)/.test(m)) errors.push(m.slice(0, 300)); });
});
afterEach(() => { spy.mockRestore(); cleanup(); window.matchMedia = mm; vi.unstubAllGlobals(); DATA = makeData(); });
const tick = (ms = 60) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });
async function mount(el, path = "/coin") {
  await act(async () => { render(<MemoryRouter initialEntries={[path]}><Suspense fallback={<div>đang tải</div>}>{el}</Suspense></MemoryRouter>); });
  await tick(80);
}
async function safely(fn) { try { await act(async () => { fn(); await new Promise((ok) => setTimeout(ok, 30)); }); } catch (e) { errors.push(String(e?.message || e).slice(0, 300)); } }
// jsdom không có canvas thật → thư viện biểu đồ báo "Value is null" khi đo trục (máy thật không có); lỗi khác vẫn chặn
const real = () => errors.filter((m) => m !== "Value is null");

describe("điện thoại · biểu đồ Thị trường", () => {
  it("kéo tự do, thanh đổi chiều cao, hộp Chỉ báo, công cụ vẽ + chuông", async () => {
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    await mount(<M />);
    // Nút Kéo/Cuộn (chỉ điện thoại) → nhớ lựa chọn
    const pan = screen.getByRole("button", { name: "Kéo tự do trên biểu đồ" });
    await safely(() => fireEvent.click(pan));
    expect(localStorage.getItem("qws_chart_pan")).toBe("1");
    // Thanh đổi chiều cao có mặt; bấm đúp = về mặc định (không lỗi)
    const grip = screen.getByRole("separator", { name: "Kéo để đổi chiều cao biểu đồ" });
    await safely(() => fireEvent.doubleClick(grip));
    // Hộp Chỉ báo: RSI, MACD, Heikin Ashi, Đường, log
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "Chỉ báo và kiểu biểu đồ" })));
    const dlg = screen.getByRole("dialog", { name: "Chỉ báo và kiểu biểu đồ" });
    const boxes = dlg.querySelectorAll('input[type="checkbox"]');
    await safely(() => fireEvent.click(boxes[0])); // RSI
    await safely(() => fireEvent.click(boxes[1])); // MACD
    await safely(() => fireEvent.click(screen.getByRole("radio", { name: "Heikin Ashi" })));
    await safely(() => fireEvent.click(boxes[2])); // log
    await safely(() => fireEvent.click(screen.getByRole("radio", { name: "Đường" })));
    const p = JSON.parse(localStorage.getItem("qws_chart_prefs"));
    expect(p).toMatchObject({ rsi: true, macd: true, log: true, style: "line" });
    // Công cụ vẽ: chọn đường xu hướng → đang chọn; Esc → về con trỏ
    const trend = screen.getByRole("button", { name: "Đường xu hướng" });
    await safely(() => fireEvent.click(trend));
    expect(trend.getAttribute("aria-pressed")).toBe("true");
    await safely(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(trend.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Đặt cảnh báo giá/ })).toBeTruthy();
    expect(real()).toEqual([]);
  });

  it("lưới 4 ô: mỗi ô có thanh kéo đổi chiều cao; về 1 ô không sập", async () => {
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    await mount(<M />);
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "4" })));
    await tick(100);
    expect(screen.getAllByRole("separator", { name: "Kéo để đổi chiều cao biểu đồ" }).length).toBe(4);
    await safely(() => fireEvent.click(screen.getByRole("button", { name: "1 ô" })));
    expect(real()).toEqual([]);
  });

  it("bấm Backtest → công cụ tải dần hiện ra (cả 2 thẻ), thoát về biểu đồ thường", async () => {
    const M = (await import("../src/pages/CoinMarket.jsx")).default;
    await mount(<M />);
    await safely(() => fireEvent.click(screen.getByRole("button", { name: /Backtest/ })));
    await tick(300);
    await safely(() => fireEvent.click(screen.getByRole("tab", { name: /Theo luật/ })));
    await tick(300);
    await safely(() => fireEvent.click(screen.getByRole("tab", { name: /Tua lại nến/ })));
    await tick(300);
    await safely(() => fireEvent.click(screen.getByRole("button", { name: /Về biểu đồ thường/ })));
    expect(screen.queryByRole("tab", { name: /Theo luật/ })).toBeNull();
    expect(real()).toEqual([]);
  });
});

describe("điện thoại · Cài đặt", () => {
  it("email dài: tên rút gọn (không đẩy nút Đăng xuất ra ngoài màn hình)", async () => {
    const S = (await import("../src/pages/Settings.jsx")).default;
    await mount(<S />, "/cai-dat");
    const em = screen.getByText("ten.email.rat.dai.cua.chu.workspace@example.com");
    expect(em.className).toMatch(/truncate/);
    expect(screen.getByRole("button", { name: /Đăng xuất/ }).className).toMatch(/whitespace-nowrap/);
    expect(real()).toEqual([]);
  });
});
