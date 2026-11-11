// Tổng quan: nút Tuỳ chỉnh → ẩn ô → Lưu ghi settings.dashLayout theo email; ô đã ẩn không vẽ nữa
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
afterEach(() => { cleanup(); DATA = makeData(); });

async function mount() {
  const { default: Dashboard } = await import("../src/pages/Dashboard.jsx");
  await act(async () => { render(<MemoryRouter><Suspense fallback={null}><Dashboard /></Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
}

describe("Tuỳ chỉnh Tổng quan", () => {
  it("ẩn Phiếu thu rồi Lưu → ghi dashLayout của chủ", async () => {
    const setSettings = vi.fn();
    DATA = makeData({ setSettings });
    await mount();
    expect(screen.getByText("Phiếu thu gần đây")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tuỳ chỉnh/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Ẩn Phiếu thu gần đây" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0][0].dashLayout["chu@example.com"].hidden).toEqual(["receipts"]);
  });
  it("bố cục đã lưu: ô ẩn không hiện", async () => {
    DATA = makeData({ settings: { reportLinks: {}, measureSkip: {}, dashLayout: { "chu@example.com": { order: [], hidden: ["receipts", "health"] } } } });
    await mount();
    expect(screen.queryByText("Phiếu thu gần đây")).toBeNull();
    expect(screen.queryByText(/Sức khoẻ thương hiệu/)).toBeNull();
    expect(screen.getByText("Việc của hôm nay")).toBeTruthy();
  });
});
