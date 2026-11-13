// 13/11: trang Tài sản — tổng ròng = nhập tay (trừ nợ) + tiền đầu tư Coin; thêm khoản qua popup
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeData } from "./fixture.js";
import { assetSummary } from "../src/pages/Assets.jsx";
import { investTotals } from "../src/lib/coinShared.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
afterEach(() => { cleanup(); DATA = makeData(); });

describe("tính tổng tài sản", () => {
  it("nhập tay trừ nợ + đầu tư", () => {
    const S = assetSummary([{ type: "bank", amount: 100e6 }, { type: "gold", amount: 50e6 }, { type: "debt", amount: 30e6 }, { type: "lạ", amount: 5e6 }], 20e6);
    expect(S.gross).toBe(175e6); expect(S.debt).toBe(30e6); expect(S.net).toBe(145e6); expect(S.by.vehicle).toBe(5e6);
  });
  it("ví Binance + futures + coin nhập tay theo giá; mã không giá → missing", () => {
    const bn = { balances: [{ asset: "USDT", qty: 100 }, { asset: "BTC", qty: 0.01, earnQty: 0.01 }, { asset: "XYZ", qty: 5 }], futures: { wallet: 50, unrealized: -10 } };
    const t = investTotals(bn, [{ symbol: "eth", qty: 1 }], { BTC: { price: 100000 }, ETH: { price: 3000 } });
    expect(t.binance).toBe(100 + 2000 + 40); expect(t.manual).toBe(3000); expect(t.usd).toBe(5140); expect(t.missing).toBe(1);
  });
});

describe("trang Tài sản", () => {
  it("thêm khoản qua popup → gọi addAsset đúng số", async () => {
    const addAsset = vi.fn();
    DATA = makeData({ isOwner: true, assets: [{ id: "a1", name: "Tiết kiệm", type: "bank", amount: 200e6 }], addAsset, snapAssets: vi.fn() });
    const A = (await import("../src/pages/Assets.jsx")).default;
    await act(async () => { render(<MemoryRouter><A /></MemoryRouter>); });
    expect(screen.getAllByText(/Tiết kiệm/).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Thêm khoản/ })[0]); });
    fireEvent.change(document.getElementById("asset-type"), { target: { value: "gold" } });
    fireEvent.change(document.getElementById("asset-name"), { target: { value: "2 cây SJC" } });
    const money = document.querySelector('input[placeholder="100.000.000"]');
    await act(async () => { fireEvent.change(money, { target: { value: "300000000" } }); });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Thêm" }).pop()); });
    expect(addAsset).toHaveBeenCalledWith(expect.objectContaining({ name: "2 cây SJC", type: "gold", amount: 300000000 }));
  });
  it("tài khoản phụ không xem được", async () => {
    DATA = makeData({ isOwner: false });
    const A = (await import("../src/pages/Assets.jsx")).default;
    await act(async () => { render(<MemoryRouter><A /></MemoryRouter>); });
    expect(screen.getByText(/chỉ chủ workspace/)).toBeTruthy();
  });
});
