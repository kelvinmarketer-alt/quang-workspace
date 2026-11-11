// 11/11: việc lặp lại + nhắc trước (Công việc), tự khoá kho Tài khoản & Thẻ, cảnh báo token TKQC (Quảng cáo)
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";
import { supabase } from "../src/lib/supabase.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" } }), AuthProvider: ({ children }) => children }));

let errors = [], spy;
beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|width\(0\)|height\(0\)/.test(m)) errors.push(m.slice(0, 300)); });
});
afterEach(() => { spy.mockRestore(); cleanup(); DATA = makeData(); vi.restoreAllMocks(); });

async function mount(el, path = "/") {
  await act(async () => { render(<MemoryRouter initialEntries={[path]}><Suspense fallback={<div>đang tải</div>}>{el}</Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });
}
const click = async (el) => { await act(async () => { fireEvent.click(el); await new Promise((ok) => setTimeout(ok, 10)); }); };

describe("Công việc — form có Lặp lại + Nhắc trước", () => {
  it("chọn Hằng tuần T2 + T6, giờ 09:00, nhắc trước 30 phút → lưu đúng", async () => {
    const addTask = vi.fn();
    DATA = makeData({ addTask, settings: { showTasks: true } });
    const T = (await import("../src/pages/Tasks.jsx")).default;
    await mount(<T />, "/cong-viec");
    await click(screen.getByRole("button", { name: /Form chi tiết/ }));
    fireEvent.change(screen.getByPlaceholderText("VD: Gửi báo cáo ads"), { target: { value: "Họp giao ban" } });
    await click(screen.getByRole("button", { name: "Hằng tuần" }));
    const t2 = screen.getByRole("button", { name: "T2" }), t6 = screen.getByRole("button", { name: "T6" });
    if (t2.getAttribute("aria-pressed") !== "true") await click(t2);
    await click(t6);
    fireEvent.change(document.querySelector('input[type="time"]'), { target: { value: "09:00" } });
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Nhắc trước"), { target: { value: "30" } });
    await click(screen.getByRole("button", { name: "Lưu việc" }));
    expect(addTask).toHaveBeenCalledTimes(1);
    const saved = addTask.mock.calls[0][0];
    expect(saved.title).toBe("Họp giao ban");
    expect(saved.repeat.type).toBe("weekly");
    expect(saved.repeat.days).toEqual(expect.arrayContaining([1, 5]));
    expect(saved.remind).toBe(30);
    expect(errors).toEqual([]);
  });
});

describe("Tài khoản & Thẻ — tự khoá khi không dùng", () => {
  const vault = [{ id: "v1", type: "app", title: "Gmail", username: "a@b.com", password: "matkhau123" }];
  it("chưa có PIN (chế độ máy): không dùng quá N phút → ẩn + làm mờ, bấm Mở khoá thì hiện lại", async () => {
    try { localStorage.setItem("qws_vault_idle_min", "1"); } catch { /* bỏ qua */ }
    DATA = makeData({ vault, vaultPrivate: false });
    const V = (await import("../src/pages/Vault.jsx")).default;
    await mount(<V />, "/tai-khoan");
    expect(screen.getByLabelText("Tự khoá sau").value).toBe("1");
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 2 * 60000);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByText("Đã tự khoá do không dùng")).toBeTruthy();
    await click(screen.getByRole("button", { name: /Mở khoá/ }));
    expect(screen.queryByText("Đã tự khoá do không dùng")).toBeNull();
    expect(errors).toEqual([]);
  });
  it("có PIN: không dùng quá N phút → gọi khoá PIN thật", async () => {
    try { localStorage.setItem("qws_vault_idle_min", "5"); } catch { /* bỏ qua */ }
    const lockVault = vi.fn();
    DATA = makeData({ vault, vaultPrivate: true, vaultHasPin: true, lockVault });
    const V = (await import("../src/pages/Vault.jsx")).default;
    await mount(<V />, "/tai-khoan");
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 3 * 60000);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(lockVault).not.toHaveBeenCalled(); // mới 3 phút
    Date.now.mockReturnValue(real + 6 * 60000);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(lockVault).toHaveBeenCalledTimes(1);
  });
});

describe("Quảng cáo — cảnh báo token TKQC", () => {
  it("Facebook báo token hết hạn → banner + nút Dán token mới mở đúng mục Cài đặt", async () => {
    localStorage.removeItem("qws_ads_last");
    localStorage.removeItem("qws_ads_token_health");
    vi.spyOn(supabase.functions, "invoke").mockImplementation(async (_fn, { body } = {}) => (body && !body.mode
      ? { data: { updatedAt: new Date().toISOString(), accounts: [
        { id: "111", name: "NSTT · Sản phẩm", group: "conv", error: "Error validating access token: Session has expired on Tuesday, 05-Nov-26 01:00:00 PST." },
        { id: "222", name: "Phi Trường", group: "conv", totals: { spend: 0 }, campaigns: [], ads: [] },
      ] }, error: null }
      : { data: {}, error: null }));
    const A = (await import("../src/pages/Ads.jsx")).default;
    await mount(<A />, "/quang-cao");
    await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });
    expect(screen.getByText(/Token TKQC NSTT · Sản phẩm đã hết hạn/)).toBeTruthy();
    expect(screen.getByText(/Hết hạn ngày 05\/11\/2026/)).toBeTruthy();
    expect(screen.queryByText(/Token TKQC Phi Trường/)).toBeNull();
    await click(screen.getByRole("button", { name: "Dán token mới" }));
    expect(localStorage.getItem("qws_settings_sec")).toBe("connect");
    const h = JSON.parse(localStorage.getItem("qws_ads_token_health"));
    expect(h["111"].kind).toBe("token");
    expect(h["222"].lastOk).toBeGreaterThan(0);
  });
});
