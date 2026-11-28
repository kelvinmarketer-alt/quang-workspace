// 28/11 (sếp duyệt accordion): trang Bot thật — luôn mở số dư / lệnh đang chạy / nút Dừng; các mục phụ gập sẵn,
// bấm để mở, nhớ lựa chọn trên máy (qws_live_open); bot báo đang chờ (vd lỗi khoá API) → Cài đặt bot tự mở.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { makeData } from "./fixture.js";

const NOW = Date.now();
let STATUS;
const baseStatus = () => ({ at: NOW, mode: "testnet", risk: 1, maxOpen: 3, dailyStop: 6, active: {}, events: [{ at: NOW - 60000, ev: "close", coin: "BTC", side: 1, tf: "1h", pnl: 5, R: 1 }] });
const HIST = { trades: [{ id: "a", coin: "BTC", tf: "1h", side: 1, setup: "SW3", mode: "testnet", entryAt: NOW - 7200000, exitAt: NOW - 3600000, entry: 100, exit: 102, sl: 98, tp: 102, qty: 1, riskUsd: 2, r: 1, pnl: 2, reason: "tp" }] };
vi.mock("../src/lib/supabase.js", () => ({
  WORKSPACE_TABLE: "qws_workspaces",
  supabase: {
    from: () => ({ select: async () => ({ data: [{ id: "status", data: STATUS }, { id: "command", data: {} }, { id: "history", data: HIST }], error: null }) }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
  },
}));
let DATA = { ...makeData(), isOwner: true, setSettings: () => {} };
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1" } }), AuthProvider: ({ children }) => children }));

afterEach(() => { cleanup(); localStorage.clear(); });
async function mount() {
  const L = (await import("../src/pages/CoinLive.jsx")).default;
  await act(async () => { render(<L active />); await new Promise((ok) => setTimeout(ok, 50)); });
}
const head = (name) => screen.getByRole("button", { name: new RegExp(name) });

describe("Bot thật · mục gập/mở", () => {
  it("mặc định: số dư + lệnh đang chạy hiện; kết quả, lịch, lịch sử, nhật ký, Demo, cài đặt gập", async () => {
    STATUS = baseStatus();
    await mount();
    expect(screen.getByText("Lãi/lỗ hôm nay")).toBeTruthy();
    expect(screen.getByText(/Lệnh chờ & vị thế/)).toBeTruthy();
    for (const n of ["Kết quả lệnh thật", "Lịch lãi/lỗ", "Lịch sử lệnh", "Nhật ký bot", "Demo và Thật", "Cài đặt bot"]) expect(head(n).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Xuất CSV")).toBeNull();
    // tóm tắt trên dòng tiêu đề
    expect(head("Lịch sử lệnh").textContent).toMatch(/1 lệnh/);
    expect(head("Nhật ký bot").textContent).toMatch(/1 mục/);
    expect(head("Demo và Thật")).toBeTruthy();
  });

  it("bấm mở → hiện nội dung và nhớ cho lần sau; bấm lại → gập", async () => {
    STATUS = baseStatus();
    await mount();
    await act(async () => { fireEvent.click(head("Lịch sử lệnh")); });
    expect(screen.getByText("Xuất CSV")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("qws_live_open"))).toMatchObject({ history: true });
    cleanup();
    await mount();
    expect(head("Lịch sử lệnh").getAttribute("aria-expanded")).toBe("true");
    await act(async () => { fireEvent.click(head("Lịch sử lệnh")); });
    expect(screen.queryByText("Xuất CSV")).toBeNull();
    expect(JSON.parse(localStorage.getItem("qws_live_open")).history).toBe(false);
  });

  it("bot đang chờ (lỗi khoá API) → Cài đặt bot tự mở; bấm vẫn gập được", async () => {
    STATUS = { ...baseStatus(), waiting: "Khoá API không dùng được" };
    await mount();
    expect(head("Cài đặt bot").getAttribute("aria-expanded")).toBe("true");
    await act(async () => { fireEvent.click(head("Cài đặt bot")); });
    expect(head("Cài đặt bot").getAttribute("aria-expanded")).toBe("false");
  });
});
