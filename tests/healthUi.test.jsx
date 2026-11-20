import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";
import { __resetHealth } from "../src/lib/healthStore.js";
import { dayKeyOf, waterTotal, planFromTemplate, PLAN_TEMPLATES } from "../src/lib/health.js";

let OVER = {};
vi.mock("../src/lib/store.jsx", () => ({ useData: () => makeData(OVER), DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" } }), AuthProvider: ({ children }) => children }));

const profile = { sex: "m", birthYear: 1990, heightCm: 170, weightKg: 75, activity: 1.375, goal: "recomp" };
const today = () => dayKeyOf(Date.now());
const cached = () => JSON.parse(localStorage.getItem("qws-cache:health:u1"));
beforeEach(() => { localStorage.clear(); __resetHealth(); });
afterEach(() => { cleanup(); OVER = {}; });

async function mount(path, seed) {
  if (seed) localStorage.setItem("qws-cache:health:u1", JSON.stringify({ cfg: null, days: {}, sync: "", dirty: [], ...seed }));
  const Health = (await import("../src/pages/Health.jsx")).default;
  let r;
  await act(async () => { r = render(<MemoryRouter initialEntries={[path]}><Suspense fallback={null}><Health /></Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 60)); });
  return r;
}

describe("Sức khoẻ — trang", () => {
  it("lần đầu: hiện form chỉ số; nhập xong thấy mục tiêu nước và calo", async () => {
    await mount("/suc-khoe");
    expect(screen.getByText(/Bắt đầu: nhập chỉ số cơ thể/)).toBeTruthy();
    for (const [id, v] of [["sk-year", "1990"], ["sk-height", "170"], ["sk-weight", "75"]]) fireEvent.change(document.getElementById(id), { target: { value: v } });
    expect(screen.getByText("1910")).toBeTruthy(); // nên ăn 1910 kcal
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Lưu và bắt đầu/ })); });
    expect(screen.queryByText(/Bắt đầu: nhập chỉ số cơ thể/)).toBeNull();
    expect(screen.getByText(/2,65 lít/)).toBeTruthy();
    expect(cached().cfg.profile.weightKg).toBe(75);
  });

  it("bấm 'Uống 1 ly' cộng 250 ml; 'Bỏ ly vừa ghi' trừ lại", async () => {
    await mount("/suc-khoe", { cfg: { profile } });
    const btn = screen.getByRole("button", { name: /Uống 1 ly \(250 ml\)/ });
    await act(async () => { fireEvent.click(btn); fireEvent.click(btn); });
    expect(waterTotal(cached().days[today()])).toBe(500);
    expect(screen.getByText(/Còn/).textContent).toContain("2150 ml");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bỏ ly vừa ghi/ })); });
    expect(waterTotal(cached().days[today()])).toBe(250);
  });

  it("mở từ thông báo ?uong=250 → tự ghi đúng 1 ly", async () => {
    await mount("/suc-khoe?uong=250", { cfg: { profile } });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
    expect(waterTotal(cached().days[today()])).toBe(250);
  });

  it("tab Tập gym: chọn mẫu → bắt đầu buổi → ghi hiệp → kết thúc", async () => {
    const plan = planFromTemplate(PLAN_TEMPLATES[0]);
    const dow = new Date(Date.now() + 7 * 3600000).getUTCDay();
    plan.week = { [dow]: plan.routines[0].id }; // hôm nay có buổi Đẩy
    await mount("/suc-khoe?tab=gym", { cfg: { profile, plan } });
    expect(screen.getByText(/Hôm nay: Đẩy/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bắt đầu buổi tập/ })); });
    fireEvent.change(screen.getByLabelText("Mức tạ Đẩy ngực tạ đòn"), { target: { value: "50" } });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Xong hiệp 1/ })[0]); });
    expect(cached().days[today()].gym.ex[0].sets).toEqual([{ kg: 50, reps: 8 }]);
    expect(screen.getByRole("timer")).toBeTruthy(); // đồng hồ nghỉ giữa hiệp
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Kết thúc buổi tập/ })); });
    expect(cached().days[today()].gym.end).toBeGreaterThan(0);
    expect(screen.getByText(/Hoàn thành/)).toBeTruthy();
  });

  it("tab Tập gym: buổi trước đủ 4×8 ở 50 kg → gợi ý 52,5 kg", async () => {
    const plan = planFromTemplate(PLAN_TEMPLATES[0]);
    const dow = new Date(Date.now() + 7 * 3600000).getUTCDay();
    plan.week = { [dow]: plan.routines[0].id };
    const prev = dayKeyOf(Date.now() - 7 * 86400000);
    await mount("/suc-khoe?tab=gym", { cfg: { profile, plan }, days: { [prev]: { gym: { ex: [{ name: "Đẩy ngực tạ đòn", sets: [8, 8, 8, 8].map((reps) => ({ kg: 50, reps })) }] } } } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bắt đầu buổi tập/ })); });
    expect(screen.getByText(/tăng lên 52,5 kg/)).toBeTruthy();
    expect(screen.getByLabelText("Mức tạ Đẩy ngực tạ đòn").value).toBe("52,5");
  });

  it("tab Ăn uống: tìm 'pho' → thêm Phở bò → còn 1460 kcal", async () => {
    await mount("/suc-khoe?tab=an", { cfg: { profile } });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Thêm món/ })[0]); });
    const dlg = screen.getByRole("dialog");
    fireEvent.change(within(dlg).getByLabelText("Tìm món ăn"), { target: { value: "pho bo" } });
    await act(async () => { fireEvent.click(within(dlg).getByText("Phở bò")); });
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: /Thêm vào bữa/ })); });
    expect(cached().days[today()].meals[0]).toMatchObject({ name: "Phở bò", kcal: 450, slot: "sang", q: 1 });
    expect(screen.getByText("1460")).toBeTruthy();
  });

  it("tab Cài đặt: tắt nhắc nước → lưu vào cấu hình", async () => {
    await mount("/suc-khoe?tab=caidat", { cfg: { profile } });
    const sw = screen.getByRole("switch", { name: /Nhắc uống nước/ });
    expect(sw.checked).toBe(true);
    await act(async () => { fireEvent.click(sw); });
    expect(cached().cfg.water.remind.on).toBe(false);
  });
});

describe("Sức khoẻ — menu và quyền", () => {
  async function mountLayout(path) {
    const Layout = (await import("../src/components/Layout.jsx")).default;
    await act(async () => { render(<MemoryRouter initialEntries={[path]}><Suspense fallback={null}><Layout><div>nội dung</div></Layout></Suspense></MemoryRouter>); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
  }
  it("chủ thấy mục Sức khoẻ; tài khoản phụ không thấy", async () => {
    await mountLayout("/");
    expect([...document.querySelectorAll('a[href="/suc-khoe"]')].length).toBeGreaterThan(0);
    cleanup();
    OVER = { isOwner: false, ownerId: "o1", perms: ["dashboard", "tasks"] };
    await mountLayout("/");
    expect(document.querySelector('a[href="/suc-khoe"]')).toBeNull();
  });
});
