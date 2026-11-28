// Menu & thanh tab gộp (09/11): Kho = Tài liệu + Tài khoản & Thẻ; Công việc ở nhóm Kinh doanh; ghim cũ được chuyển.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";

let OVER = {};
vi.mock("../src/lib/store.jsx", () => ({ useData: () => makeData(OVER), DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" }, signOut: async () => {}, changePassword: async () => ({}) }), AuthProvider: ({ children }) => children }));
afterEach(() => { cleanup(); OVER = {}; localStorage.clear(); });

async function mountLayout(path) {
  const Layout = (await import("../src/components/Layout.jsx")).default;
  let r;
  await act(async () => { r = render(<MemoryRouter initialEntries={[path]}><Suspense fallback={null}><Layout><div>nội dung</div></Layout></Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
  return r;
}
const sideLinks = () => [...document.querySelectorAll("aside a, nav a")].map((a) => a.getAttribute("href"));

describe("menu gộp Kho", () => {
  it("chủ: ở /kho-tai-lieu thấy thanh tab Tài liệu | Tài khoản & Thẻ; menu chỉ có 1 mục Kho", async () => {
    await mountLayout("/kho-tai-lieu");
    const links = sideLinks();
    expect(links.filter((h) => h === "/kho-tai-lieu").length).toBeGreaterThan(0);
    expect(links).not.toContain("/tai-khoan"); // gộp: không còn mục riêng ở menu bên (chỉ còn trong thanh tab)
    expect(screen.getAllByRole("link", { name: /Tài khoản & Thẻ/ }).length).toBe(1); // nằm trong thanh tab
    expect(screen.getAllByRole("link", { name: /^Kho tài liệu$/ }).length).toBeGreaterThan(0);
  });

  it("thành viên chỉ có Kho tài liệu: không thấy tab Tài khoản & Thẻ (chỉ chủ)", async () => {
    OVER = { isOwner: false, ownerId: "u1", perms: ["library"] };
    await mountLayout("/kho-tai-lieu");
    expect(screen.queryByRole("link", { name: /Tài khoản & Thẻ/ })).toBeNull();
  });

  it("ghim cũ /tai-khoan được chuyển sang Kho (không mất ghim)", async () => {
    localStorage.setItem("qws_nav_pins", JSON.stringify(["/tai-khoan", "/"]));
    await mountLayout("/");
    expect(sideLinks()).toContain("/kho-tai-lieu");
  });
});

// 16/11/2026 gộp Văn phòng AI: menu có nhóm Văn phòng AI (mở ngay trong app) + chuông chung mở được từ văn phòng (?chuong=1)
describe("gộp Văn phòng AI", () => {
  it("chủ: menu có 4 mục văn phòng (gộp 17/11), không mở tab mới", async () => {
    await mountLayout("/");
    const office = [...document.querySelectorAll('a[href^="/van-phong/"]')];
    for (const h of ["/van-phong/", "/van-phong/du-an", "/van-phong/kien-thuc", "/van-phong/suc-khoe"])
      expect(office.map((a) => a.getAttribute("href")), h).toContain(h);
    expect(office.every((a) => !a.target)).toBe(true);
  });
  it("?chuong=1 → chuông chung tự mở, xoá tham số khỏi địa chỉ", async () => {
    window.history.replaceState(null, "", "/?chuong=1");
    await mountLayout("/");
    expect(screen.getByRole("button", { name: /^Của tôi/ })).toBeTruthy();
    expect(window.location.search).toBe("");
  });
  it("?chuong=vp → mở thẳng tab Văn phòng AI", async () => {
    window.history.replaceState(null, "", "/?chuong=vp");
    await mountLayout("/");
    expect(screen.getByText(/Mở văn phòng →/)).toBeTruthy();
  });
});
