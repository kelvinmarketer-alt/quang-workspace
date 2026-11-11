// 11/11: mở Đối soát cuối tháng + Lãi theo tháng của khách không sập; tick checklist ghi vào settings.monthClose
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" } }), AuthProvider: ({ children }) => children }));
afterEach(() => { cleanup(); DATA = makeData(); });

async function mount(el) {
  await act(async () => { render(<MemoryRouter><Suspense fallback={<div>đang tải</div>}>{el}</Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
}

describe("Dòng tiền · Đối soát", () => {
  it("mở tab Đối soát, tick 1 việc → lưu settings.monthClose", async () => {
    const setSettings = vi.fn();
    DATA = makeData({ setSettings, settings: {} });
    const Funds = (await import("../src/pages/Funds.jsx")).default;
    await mount(<Funds />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Đối soát/ })); });
    expect(screen.getByText(/Việc chốt sổ/)).toBeTruthy();
    expect(screen.getByText("Số dư quỹ")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("Đã đối chiếu tiền về tài khoản ngân hàng")); });
    expect(setSettings).toHaveBeenCalledTimes(1);
    const arg = setSettings.mock.calls[0][0];
    const m = Object.keys(arg.monthClose)[0];
    expect(arg.monthClose[m].done.bank).toBe(true);
  });
  it("trang Quỹ: mục Theo năm / Lịch sử xổ ra được", async () => {
    const Funds = (await import("../src/pages/Funds.jsx")).default;
    await mount(<Funds initialTab="funds" />);
    await act(async () => { fireEvent.click(screen.getByText(/Theo năm ·/)); });
    expect(screen.getAllByText(/LN gộp \d{4}:/).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByText("Lịch sử giao dịch quỹ")); });
    expect(screen.getByText("Bấm vào ngày để xem chi tiết")).toBeTruthy();
  });
});

describe("Khách · Lãi theo tháng", () => {
  it("xổ khách → mở Lãi theo tháng → có bảng + tổng", async () => {
    const Customers = (await import("../src/pages/Customers.jsx")).default;
    await mount(<Customers />);
    await act(async () => { fireEvent.click(screen.getByText("Thương hiệu A")); });
    await act(async () => { fireEvent.click(screen.getByText("Lãi theo tháng")); });
    expect(screen.getByText(/Mọi lúc:/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("12 tháng")); });
    expect(screen.getByText("12 th")).toBeTruthy();
  });
});
