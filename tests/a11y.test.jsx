// 28/11 (sếp: "mọi thứ phải hoàn hảo 10/10"): kiểm TRỢ NĂNG tự động bằng axe-core (chuẩn WCAG) cho từng trang —
// nút chỉ có biểu tượng phải có tên, ô nhập/ô chọn phải có nhãn, ảnh có alt, vai trò ARIA đúng… Lỗi = chặn bản cập nhật.
// (Độ tương phản màu không đo được trong jsdom — đã đo riêng bằng Lighthouse trên trình duyệt thật.)
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import axe from "axe-core";
import { makeData } from "./fixture.js";

let DATA = { ...makeData(), isOwner: true };
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" }, signOut: async () => {}, changePassword: async () => ({}) }), AuthProvider: ({ children }) => children }));
const fakeKlines = () => Array.from({ length: 120 }, (_, i) => { const t = 1_700_000_000_000 + i * 3_600_000, o = 100 + Math.sin(i / 5) * 5; return [t, o, o + 2, o - 2, o + 1, 1000, t + 1, 0, 0, 500]; });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes("/klines") ? fakeKlines() : []) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); DATA = { ...makeData(), isOwner: true }; });
vi.spyOn(console, "error").mockImplementation(() => {});
window.addEventListener("error", (e) => e.preventDefault());

const PAGES = [
  ["Tổng quan", () => import("../src/pages/Dashboard.jsx"), "/"],
  ["Báo cáo", () => import("../src/pages/Reports.jsx"), "/bao-cao"],
  ["Khách hàng", () => import("../src/pages/Customers.jsx"), "/khach-hang"],
  ["Dự án (trang Khách & Dự án)", () => import("../src/pages/Customers.jsx"), "/du-an"],
  ["Lịch (tab của Công việc)", () => import("../src/pages/Tasks.jsx"), "/lich"],
  ["Bot thật", () => import("../src/pages/CoinLive.jsx"), "/coin"],
  ["Kế toán", () => import("../src/pages/Ketoan.jsx"), "/ke-toan"],
  ["Chi phí", () => import("../src/pages/Expenses.jsx"), "/chi-phi"],
  ["Quỹ", () => import("../src/pages/Funds.jsx"), "/quy"],
  ["Quỹ thống kê", () => import("../src/pages/FundStats.jsx"), "/quy-thong-ke"],
  ["Công việc", () => import("../src/pages/Tasks.jsx"), "/cong-viec"],
  ["Lịch", () => import("../src/pages/Calendar.jsx"), "/lich"],
  ["Tài nguyên", () => import("../src/pages/Resources.jsx"), "/tai-nguyen"],
  ["Tài sản", () => import("../src/pages/Assets.jsx"), "/tai-san"],
  ["Tài khoản & Thẻ", () => import("../src/pages/Vault.jsx"), "/tai-khoan"],
  ["Quảng cáo", () => import("../src/pages/Ads.jsx"), "/quang-cao"],
  ["Website", () => import("../src/pages/Web.jsx"), "/website"],
  ["Fanpage", () => import("../src/pages/Fanpage.jsx"), "/fanpage"],
  ["Cài đặt", () => import("../src/pages/Settings.jsx"), "/cai-dat"],
  ["Kho tài liệu", () => import("../src/pages/Library.jsx"), "/kho-tai-lieu"],
  ["Sức khoẻ", () => import("../src/pages/Health.jsx"), "/suc-khoe"],
  ["Coin tổng quan", () => import("../src/pages/CoinOverview.jsx"), "/coin"],
  ["Coin thị trường", () => import("../src/pages/CoinMarket.jsx"), "/coin"],
  ["Coin Demo", () => import("../src/pages/CoinBot.jsx"), "/coin"],
  ["Coin đầu tư", () => import("../src/pages/CoinInvest.jsx"), "/coin"],
  ["Coin MT5", () => import("../src/pages/CoinMT5.jsx"), "/coin"],
  ["Đăng nhập", () => import("../src/pages/Login.jsx"), "/"],
];

// Quy tắc chạy được trong jsdom; tắt: tương phản (không có màu thật), vùng trang (trang con không có <main> riêng — Layout có)
const OPTS = { rules: { "color-contrast": { enabled: false }, region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false }, "html-has-lang": { enabled: false }, "document-title": { enabled: false }, "heading-order": { enabled: false } } };
const fmt = (v) => v.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)).join(" ‖ ")}`);

describe("trợ năng (axe) từng trang", () => {
  for (const [name, load, path] of PAGES) {
    it(name, async () => {
      const C = (await load()).default;
      let r;
      await act(async () => { r = render(<MemoryRouter initialEntries={[path]}><Suspense fallback={<div>đang tải</div>}><C active /></Suspense></MemoryRouter>); });
      await act(async () => { await new Promise((ok) => setTimeout(ok, 120)); });
      const res = await axe.run(r.container, OPTS);
      expect(fmt(res.violations)).toEqual([]);
    }, 20000);
  }
});
