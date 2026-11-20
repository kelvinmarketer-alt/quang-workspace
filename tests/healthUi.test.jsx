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
  // chờ các tab tải riêng (lazy) hiện xong — máy chạy kiểm thử chậm có thể cần hơn 60 ms
  for (let i = 0; i < 40; i++) { await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); }); if (i > 0 && !document.querySelector(".animate-spin")) break; }
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
    expect(screen.getByText("2150 ml")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bỏ ly vừa ghi/ })); });
    expect(waterTotal(cached().days[today()])).toBe(250);
  });

  it("mở từ thông báo ?uong=250 → tự ghi đúng 1 ly", async () => {
    await mount("/suc-khoe?uong=250", { cfg: { profile } });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
    expect(waterTotal(cached().days[today()])).toBe(250);
  });

  it("Phím tắt iPhone mở ?buoc=8500 → ghi số bước; lần đầu có 4 bước hướng dẫn, bấm Đã hiểu thì ẩn", async () => {
    await mount("/suc-khoe?buoc=8500", { cfg: { profile } });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
    expect(cached().days[today()].steps).toBe(8500);
    expect(screen.getByText(/4 việc mỗi ngày/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Đã hiểu" })); });
    expect(screen.queryByText(/4 việc mỗi ngày/)).toBeNull();
    expect(cached().cfg.introDone).toBe(true);
    expect(screen.getByRole("list", { name: "Huy hiệu" }).children.length).toBe(8);
  });

  it("tab Tập gym: chọn mẫu → bắt đầu buổi → ghi hiệp → kết thúc", async () => {
    const plan = planFromTemplate(PLAN_TEMPLATES[0]);
    const dow = new Date(Date.now() + 7 * 3600000).getUTCDay();
    plan.week = { [dow]: plan.routines[0].id }; // hôm nay có buổi Đẩy
    await mount("/suc-khoe?tab=gym", { cfg: { profile, plan } });
    expect(screen.getByText(/Hôm nay: Đẩy/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bắt đầu buổi tập/ })); });
    for (let i = 0; i < 40 && !document.querySelector('[role="dialog"][aria-label="Chế độ đang tập"]'); i++) await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); }); // chế độ đang tập tải riêng
    fireEvent.change(screen.getByLabelText("Mức tạ Đẩy ngực tạ đòn"), { target: { value: "50" } });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Xong hiệp 1/ })[0]); });
    expect(cached().days[today()].gym.ex[0].sets).toEqual([{ kg: 50, reps: 8 }]);
    expect(screen.getByRole("timer")).toBeTruthy(); // đồng hồ nghỉ giữa hiệp
    expect(screen.getByRole("dialog", { name: "Chế độ đang tập" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Bỏ qua nghỉ" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tăng Mức tạ (kg)" })); }); // nút + cộng đúng một bậc 2,5 kg
    expect(screen.getByLabelText("Mức tạ Đẩy ngực tạ đòn").value).toBe("52,5");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Kết thúc buổi tập/ })); });
    expect(cached().days[today()].gym.end).toBeGreaterThan(0);
    expect(screen.getByText(/Hoàn thành/)).toBeTruthy();
    // sau buổi: hỏi cảm nhận + giãn cơ; báo "Nặng" → lưu để buổi sau không tăng tạ
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Nặng" })); });
    expect(cached().days[today()].gym.feel).toBe("nang");
    expect(screen.getByText(/Giãn cơ 5 phút/)).toBeTruthy();
  });

  it("tab Tập gym: buổi trước đủ 4×8 ở 50 kg → gợi ý 52,5 kg", async () => {
    const plan = planFromTemplate(PLAN_TEMPLATES[0]);
    const dow = new Date(Date.now() + 7 * 3600000).getUTCDay();
    plan.week = { [dow]: plan.routines[0].id };
    const prev = dayKeyOf(Date.now() - 7 * 86400000);
    await mount("/suc-khoe?tab=gym", { cfg: { profile, plan }, days: { [prev]: { gym: { ex: [{ name: "Đẩy ngực tạ đòn", sets: [8, 8, 8, 8].map((reps) => ({ kg: 50, reps })) }] } } } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bắt đầu buổi tập/ })); });
    for (let i = 0; i < 40 && !document.querySelector('[role="dialog"][aria-label="Chế độ đang tập"]'); i++) await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); }); // chế độ đang tập tải riêng
    expect(screen.getByText(/tăng lên 52,5 kg/)).toBeTruthy();
    expect(screen.getByLabelText("Mức tạ Đẩy ngực tạ đòn").value).toBe("52,5");
  });

  it("tab Tập gym lần đầu: thấy lộ trình 4 cấp → bắt đầu Cấp 1 → bài nhẹ, có hình mẫu", async () => {
    await mount("/suc-khoe?tab=gym", { cfg: { profile } });
    expect(screen.getByText(/Lộ trình cho người mới/)).toBeTruthy();
    expect(screen.getByText("Làm quen")).toBeTruthy(); expect(screen.getByText("Tạ đòn")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bắt đầu từ đây \(khuyên dùng\)/ })); });
    expect(cached().cfg.plan.level).toBe(1);
    expect(cached().cfg.plan.routines[0].ex.map((e) => e.name)).toContain("Chống đẩy tay cao (tay đặt lên ghế)");
    expect(screen.getByText(/đã tập 0\/9 buổi/)).toBeTruthy();
  });

  it("xem động tác: 2 ảnh bắt đầu / kết thúc + 3 ý + link video", async () => {
    const { planFromLevel } = await import("../src/lib/health.js");
    const plan = planFromLevel(1);
    const dow = new Date(Date.now() + 7 * 3600000).getUTCDay();
    plan.week = { [dow]: plan.routines[0].id };
    await mount("/suc-khoe?tab=gym", { cfg: { profile, plan } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Xem cách tập Cầu mông" })); });
    const dlg = screen.getByRole("dialog", { name: "Cách tập Cầu mông" });
    const imgs = within(dlg).getAllByRole("img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toContain("Butt_Lift_Bridge/0.jpg");
    expect(within(dlg).getAllByRole("listitem").length).toBe(3);
    expect(within(dlg).getByRole("link", { name: /video hướng dẫn/ }).getAttribute("href")).toContain("youtube.com/results");
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
