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
    await safely(() => fireEvent.click(screen.getByRole("button", { name: /^POC:/ })));
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
