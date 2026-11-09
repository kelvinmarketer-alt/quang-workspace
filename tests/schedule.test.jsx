// Kiểm thử BÁO TRÙNG LỊCH + GỢI Ý GIỜ TRỐNG (09/11) và THANH TIẾN ĐỘ NĂM (09/11).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import { makeData } from "./fixture.js";
import { findConflicts, suggestSlots, rangeLabel, durOf } from "../src/lib/schedule.js";
import { yearProgress, yearRevenueToDate } from "../src/lib/yearProgress.js";
import { todayISO } from "../src/lib/format.js";
import { buildIcs } from "../src/lib/ical.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" } }), AuthProvider: ({ children }) => children }));

const D = "2026-11-12";
const T = (id, time, extra = {}) => ({ id, title: `Việc ${id}`, date: D, time, status: "todo", ...extra });

describe("trùng lịch", () => {
  it("trùng khi khoảng giờ chồng nhau; chạm đầu thì KHÔNG trùng; mặc định 60 phút", () => {
    const tasks = [T("a", "15:00")];
    expect(findConflicts(tasks, { date: D, time: "15:30" }).map((x) => x.id)).toEqual(["a"]);
    expect(findConflicts(tasks, { date: D, time: "14:30" }).map((x) => x.id)).toEqual(["a"]); // 14:30–15:30 chồng 15:00–16:00
    expect(findConflicts(tasks, { date: D, time: "16:00" })).toEqual([]); // chạm đầu
    expect(findConflicts(tasks, { date: D, time: "14:00" })).toEqual([]);
    expect(findConflicts(tasks, { date: D, time: "14:00", dur: 90 }).map((x) => x.id)).toEqual(["a"]); // việc dài 90 phút lấn sang
  });
  it("tôn trọng thời lượng riêng của việc cũ; bỏ qua việc đã xong, khác ngày, không giờ, chính nó", () => {
    const tasks = [T("a", "15:00", { dur: 30 }), T("b", "17:00", { status: "done" }), T("c", "17:00", { date: "2026-11-13" }), { id: "d", title: "Không giờ", date: D, status: "todo" }, T("e", "17:30")];
    expect(findConflicts(tasks, { date: D, time: "15:30" })).toEqual([]); // việc a chỉ kéo dài tới 15:30
    expect(findConflicts(tasks, { date: D, time: "17:00" }).map((x) => x.id)).toEqual(["e"]);
    expect(findConflicts(tasks, { date: D, time: "17:30", excludeId: "e" })).toEqual([]);
    expect(findConflicts(tasks, { date: D, time: "" })).toEqual([]);
    expect(findConflicts(tasks, { date: D, time: "giờ sai" })).toEqual([]);
    expect(durOf({ dur: 0 })).toBe(60);
    expect(durOf({ dur: "45" })).toBe(45);
    expect(rangeLabel("15:00", 90)).toBe("15:00–16:30");
  });
  it("gợi ý: giờ trống gần nhất, có cả giờ sớm hơn; không rơi vào việc khác; trong 08:00–21:00", () => {
    const tasks = [T("a", "15:00"), T("b", "16:00")];
    const s = suggestSlots(tasks, { date: D, time: "15:00" });
    expect(s).toContain("17:00");
    expect(s).toContain("14:00");
    for (const x of s) expect(findConflicts(tasks, { date: D, time: x })).toEqual([]);
    expect(s.length).toBeLessThanOrEqual(3);
    // gần cuối ngày: không gợi ý giờ vượt 21:00
    const late = suggestSlots([T("z", "20:00")], { date: D, time: "20:30" });
    for (const x of late) { const [h, m] = x.split(":").map(Number); expect(h * 60 + m + 60).toBeLessThanOrEqual(21 * 60); }
    expect(late.length).toBeGreaterThan(0);
  });
  it("kín cả ngày → không còn gợi ý", () => {
    const tasks = Array.from({ length: 13 }, (_, i) => T("k" + i, `${String(8 + i).padStart(2, "0")}:00`));
    expect(suggestSlots(tasks, { date: D, time: "10:00" })).toEqual([]);
  });
  it("lịch đăng ký dùng đúng thời lượng của việc", () => {
    const { ics } = buildIcs({ today: new Date("2026-11-09T10:00:00"), opts: { family: false, holidays: false, receivables: false }, tasks: [T("a", "15:00", { dur: 90 })] });
    expect(ics).toContain("DTSTART:20261112T080000Z");
    expect(ics).toContain("DTEND:20261112T093000Z");
  });
});

let errors = [], spy;
beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils|width\(0\)|height\(0\)/.test(m)) errors.push(m.slice(0, 300)); });
});
afterEach(() => { spy.mockRestore(); cleanup(); vi.useRealTimers(); });
const sleep = (ms) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });

describe("báo trùng lịch trên trang Công việc", () => {
  const mountTasks = async () => {
    const Tasks = (await import("../src/pages/Tasks.jsx")).default;
    await act(async () => { render(<MemoryRouter><Suspense fallback={null}><Tasks /></Suspense></MemoryRouter>); });
    await sleep(30);
  };
  beforeEach(() => { DATA = makeData({ tasks: [{ id: "x", title: "Họp khách A", date: todayISO(), time: "15:00", status: "todo" }], addTask: vi.fn(), updateTask: vi.fn() }); });

  it("form chi tiết: đặt giờ trùng → cảnh báo + bấm giờ trống thì đổi giờ", async () => {
    await mountTasks();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Form chi tiết/ })); });
    const time = document.querySelector('input[type="time"]');
    await act(async () => { fireEvent.change(time, { target: { value: "15:30" } }); });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Họp khách A");
    expect(alert.textContent).toContain("15:00–16:00");
    expect(screen.getByLabelText("Thời lượng").value).toBe("60");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dời sang 16:00/ })); });
    expect(document.querySelector('input[type="time"]').value).toBe("16:00");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errors).toEqual([]);
  });

  it("lưu việc có giờ thì kèm thời lượng; không giờ thì không có thời lượng", async () => {
    await mountTasks();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Form chi tiết/ })); });
    await act(async () => { fireEvent.change(screen.getByPlaceholderText(/Gửi báo cáo ads/), { target: { value: "Gọi khách B" } }); });
    await act(async () => { fireEvent.change(document.querySelector('input[type="time"]'), { target: { value: "09:00" } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText("Thời lượng"), { target: { value: "90" } }); });
    const dlg = document.querySelector(".fixed.inset-0.z-50");
    await act(async () => { fireEvent.click(within(dlg).getAllByRole("button").at(-1)); }); // nút lưu nằm cuối hộp
    expect(DATA.addTask).toHaveBeenCalledTimes(1);
    expect(DATA.addTask.mock.calls[0][0]).toMatchObject({ title: "Gọi khách B", time: "09:00", dur: 90 });
  });

  it("thêm nhanh: gõ giờ trùng → cảnh báo; bấm 'Thêm lúc' thêm việc ở giờ trống", async () => {
    await mountTasks();
    const box = screen.getByLabelText("Thêm việc nhanh");
    await act(async () => { fireEvent.change(box, { target: { value: "Gọi chị Hoa hôm nay 15h30" } }); });
    expect(screen.getByRole("alert").textContent).toContain("Họp khách A");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Thêm lúc 16:00/ })); });
    expect(DATA.addTask).toHaveBeenCalledTimes(1);
    expect(DATA.addTask.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining("Gọi chị Hoa"), time: "16:00" });
    await act(async () => { fireEvent.change(box, { target: { value: "Gọi chị Hoa hôm nay 10h" } }); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ───────────── Tiến độ năm ─────────────
describe("tiến độ năm (phần tính)", () => {
  const day = (iso, extra) => yearProgress({ revenue: 0, target: 1000, today: new Date(`${iso}T10:00:00`), ...extra });
  it("đếm ngày đúng (năm thường và năm nhuận)", () => {
    const a = day("2026-11-09"); expect(a.dayOfYear).toBe(313); expect(a.daysInYear).toBe(365); expect(a.daysLeft).toBe(52);
    expect(a.timePct).toBeCloseTo(85.753, 2);
    const b = day("2028-12-31"); expect(b.daysInYear).toBe(366); expect(b.dayOfYear).toBe(366); expect(b.daysLeft).toBe(0);
    expect(day("2026-01-01").dayOfYear).toBe(1);
  });
  it("trạng thái: nhanh / đúng nhịp / chậm / đạt; ngưỡng 3 điểm phần trăm", () => {
    const at = (rev) => yearProgress({ revenue: rev, target: 1000, today: new Date("2026-07-02T10:00:00") }); // ~ 50% thời gian
    const tp = at(0).timePct; // 50,0%
    expect(at(Math.round(tp * 10) + 100).state).toBe("ahead");
    expect(at(Math.round(tp * 10)).state).toBe("on");
    expect(at(Math.round(tp * 10) - 20).state).toBe("on"); // chậm 2 điểm vẫn đúng nhịp
    expect(at(Math.round(tp * 10) - 60).state).toBe("behind");
    expect(at(1000).state).toBe("done");
    expect(at(1500).state).toBe("done");
  });
  it("cần mỗi tháng còn lại + dự báo cả năm; hết năm thì không có 'cần mỗi tháng'", () => {
    const p = yearProgress({ revenue: 710e6, target: 1e9, today: new Date("2026-11-09T10:00:00") });
    expect(p.state).toBe("behind");
    expect(Math.round(p.gap)).toBe(-15);
    expect(p.remaining).toBe(290e6);
    expect(p.needPerMonth).toBeGreaterThan(160e6); expect(p.needPerMonth).toBeLessThan(180e6);
    expect(p.forecast).toBeCloseTo(710e6 / 0.85753, -6);
    expect(yearProgress({ revenue: 5, target: 10, today: new Date("2026-12-31T10:00:00") }).needPerMonth).toBe(null);
  });
  it("chưa đặt mục tiêu → không có phần so sánh", () => {
    const p = yearProgress({ revenue: 5, target: 0, today: new Date("2026-06-01T10:00:00") });
    expect(p.hasTarget).toBe(false);
    expect(p.state).toBeUndefined();
  });
  it("doanh thu từ đầu năm khớp ô 'Doanh thu T1–Tn': chỉ năm nay, chỉ tới tháng hiện tại", () => {
    const projects = [{ id: "p", category: "Web", status: "doing", installments: [
      { id: "1", date: "2026-03-10", amount: 600e6, collected: 600e6, costs: [] }, { id: "2", date: "2026-11-20", amount: 110e6, collected: 0, costs: [] },
      { id: "3", date: "2026-12-05", amount: 999e6, collected: 0, costs: [] }, { id: "4", date: "2025-12-31", amount: 777e6, collected: 777e6, costs: [] },
    ] }];
    expect(yearRevenueToDate(projects, new Date("2026-11-09T10:00:00"))).toBe(710e6); // gồm đợt ghi ngày 20/11 (cùng tháng), không gồm tháng 12 và năm 2025
  });
});

describe("thẻ Tiến độ năm trên Tổng quan", () => {
  const PROJECTS = [{ id: "p", category: "Web", status: "doing", installments: [{ id: "1", date: "2026-03-10", amount: 710e6, collected: 710e6, costs: [] }] }];
  const mountCard = async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-09T10:00:00"));
    const C = (await import("../src/components/YearProgress.jsx")).default;
    await act(async () => { render(<C />); });
  };
  it("đã có mục tiêu: hai thanh tiến độ, nhãn trạng thái, số cần mỗi tháng; chủ có nút sửa", async () => {
    DATA = makeData({ projects: PROJECTS, settings: { yearGoal: { 2026: 1e9 } }, setSettings: vi.fn() });
    await mountCard();
    expect(screen.getByRole("progressbar", { name: "Thời gian đã qua" }).getAttribute("aria-valuenow")).toBe("86");
    expect(screen.getByRole("progressbar", { name: /Doanh thu so với mục tiêu/ }).getAttribute("aria-valuenow")).toBe("71");
    expect(screen.getByText(/Đang chậm hơn kế hoạch 15 điểm phần trăm/)).toBeTruthy();
    expect(screen.getByText(/Cần khoảng/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sửa mục tiêu năm/ })).toBeTruthy();
  });
  it("chủ chưa đặt mục tiêu: thấy lời mời, nhập số và lưu đúng khoá năm", async () => {
    DATA = makeData({ projects: PROJECTS, settings: { yearGoal: { 2025: 5e8 } }, setSettings: vi.fn() });
    await mountCard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Đặt mục tiêu/ })); });
    await act(async () => { fireEvent.change(screen.getByPlaceholderText(/1\.000\.000\.000/), { target: { value: "1200000000" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Lưu/ })); });
    expect(DATA.setSettings).toHaveBeenCalledWith({ yearGoal: { 2025: 5e8, 2026: 1200000000 } }); // giữ mục tiêu năm cũ
  });
  it("thành viên: không có mục tiêu thì không hiện gì; có mục tiêu thì xem được nhưng không có nút sửa", async () => {
    DATA = makeData({ isOwner: false, projects: PROJECTS, settings: {} });
    await mountCard();
    expect(document.body.textContent).not.toMatch(/Tiến độ năm/);
    cleanup();
    DATA = makeData({ isOwner: false, projects: PROJECTS, settings: { yearGoal: { 2026: 1e9 } } });
    await mountCard();
    expect(screen.getByText(/Tiến độ năm 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sửa mục tiêu năm/ })).toBeNull();
  });
  it("xoá mục tiêu bằng cách lưu số 0", async () => {
    DATA = makeData({ projects: PROJECTS, settings: { yearGoal: { 2026: 1e9 } }, setSettings: vi.fn() });
    await mountCard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sửa mục tiêu năm/ })); });
    await act(async () => { fireEvent.change(screen.getByPlaceholderText(/1\.000\.000\.000/), { target: { value: "0" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Lưu/ })); });
    expect(DATA.setSettings).toHaveBeenCalledWith({ yearGoal: {} });
  });
});
