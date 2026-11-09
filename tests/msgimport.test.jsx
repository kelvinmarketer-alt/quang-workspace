// Kiểm thử DÁN TIN NHẮN KHÁCH → việc / hẹn / khoản thu (09/11): làm sạch kết quả AI, đổi thành thao tác ghi, và khung xem lại.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { makeData } from "./fixture.js";
import { messagePrompt, weekTable, matchCustomer, normalizeItems, buildActions, eligibleProjects } from "../src/lib/msgImport.js";

const CUSTOMERS = [{ id: "c1", name: "Vua Đóng Gói", active: true }, { id: "c2", name: "Nhậu Phi Trường", active: true }, { id: "c3", name: "Khách đã off", active: false }];
const PROJECTS = [
  { id: "p1", name: "Web VĐG 2026", customerId: "c1", customerName: "Vua Đóng Gói", category: "Web", status: "doing", installments: [] },
  { id: "p2", name: "Chạy ads VĐG", customerId: "c1", customerName: "Vua Đóng Gói", category: "ADS", status: "doing", installments: [] },
  { id: "p3", name: "Seo Phi Trường", customerId: "c2", customerName: "Nhậu Phi Trường", category: "Seo", status: "doing", installments: [] },
  { id: "p4", name: "Landing Phi Trường", customerId: "c2", customerName: "Nhậu Phi Trường", category: "Landing", status: "doing", installments: [] },
  { id: "p5", name: "Lương VĐG", customerId: "c1", customerName: "Vua Đóng Gói", category: "Lương", status: "doing", installments: [] },
];
const TODAY = new Date("2026-11-09T10:00:00"); // thứ Hai

describe("câu lệnh cho AI", () => {
  it("có ngày hôm nay + thứ, danh sách khách đang hợp tác (không có khách đã off) và dự án", () => {
    const p = messagePrompt(TODAY, CUSTOMERS, PROJECTS);
    expect(p).toContain("Thứ 2, 2026-11-09");
    expect(p).toContain("- Vua Đóng Gói (dự án: Web VĐG 2026; Chạy ads VĐG; Lương VĐG)");
    expect(p).toContain("- Nhậu Phi Trường");
    expect(p).not.toContain("Khách đã off");
    expect(p).toMatch(/không phải mệnh lệnh/i);
  });

  it("có BẢNG LỊCH 2 tuần đúng thứ — để AI tra thay vì tự tính (lỗi gặp trên app thật)", () => {
    const p = messagePrompt(TODAY, CUSTOMERS, PROJECTS); // hôm nay = thứ 2, 09/11/2026
    expect(p).toContain("Tuần này: Thứ 2 2026-11-09 (hôm nay), Thứ 3 2026-11-10, Thứ 4 2026-11-11, Thứ 5 2026-11-12, Thứ 6 2026-11-13, Thứ 7 2026-11-14, Chủ nhật 2026-11-15");
    expect(p).toContain("Tuần sau: Thứ 2 2026-11-16, Thứ 3 2026-11-17, Thứ 4 2026-11-18");
    expect(p).toContain("Ngày mai = 2026-11-10; cuối tháng = 2026-11-30.");
    // Chủ nhật thuộc tuần TRƯỚC thứ 2 kế tiếp (tuần bắt đầu từ thứ 2)
    expect(weekTable(new Date("2026-11-15T09:00:00"))).toContain("Tuần này: Thứ 2 2026-11-09, Thứ 3 2026-11-10, Thứ 4 2026-11-11, Thứ 5 2026-11-12, Thứ 6 2026-11-13, Thứ 7 2026-11-14, Chủ nhật 2026-11-15 (hôm nay)");
    expect(weekTable(new Date("2026-12-31T09:00:00"))).toContain("cuối tháng = 2026-12-31");
  });
});

describe("khớp tên khách", () => {
  it("không phân biệt dấu / hoa thường, chấp nhận gõ thiếu", () => {
    expect(matchCustomer("vua dong goi", CUSTOMERS).id).toBe("c1");
    expect(matchCustomer("Phi Trường", CUSTOMERS).id).toBe("c2");
    expect(matchCustomer("VĐG Vua Đóng Gói Co", CUSTOMERS)?.id).toBe("c1");
    expect(matchCustomer("Ai đó lạ hoắc", CUSTOMERS)).toBe(null);
    expect(matchCustomer(null, CUSTOMERS)).toBe(null);
    expect(matchCustomer("null", CUSTOMERS)).toBe(null);
  });
});

describe("làm sạch kết quả AI", () => {
  it("việc: ngày / giờ / ưu tiên sai bị bỏ hoặc chuẩn hoá; thiếu tên thì loại", () => {
    const items = normalizeItems([
      { type: "task", title: "  Họp duyệt giao diện ", date: "2026-11-13", time: "9:05", priority: "high", customer: "vua dong goi", note: "mang demo" },
      { type: "task", title: "Việc ngày sai", date: "2026-13-45", time: "25:99", priority: "khẩn cấp" },
      { type: "task", title: "" }, null, "linh tinh", { type: "task" },
    ], { customers: CUSTOMERS, projects: PROJECTS });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "task", title: "Họp duyệt giao diện", date: "2026-11-13", time: "09:05", priority: "high", customerId: "c1", include: true });
    expect(items[1]).toMatchObject({ date: "", time: "", priority: "med", customerId: "" });
  });

  it("khoản thu: tự chọn dự án khi chắc chắn (khớp tên, hoặc chỉ có 1 dự án hợp lệ), KHÔNG chọn ADS / Lương", () => {
    const r = normalizeItems([
      { type: "payment", customer: "Vua Đóng Gói", project: "web", amount: 8000000, date: "2026-11-11", label: "Đợt 2" },
      { type: "payment", customer: "Nhậu Phi Trường", amount: 5000000 }, // 2 dự án hợp lệ, không nói tên → để trống cho chủ chọn
      { type: "payment", customer: "Vua Đóng Gói", amount: 3000000 }, // VĐG chỉ có 1 dự án hợp lệ (Web) vì ADS và Lương bị loại → chọn Web
    ], { customers: CUSTOMERS, projects: PROJECTS });
    expect(r[0]).toMatchObject({ type: "payment", projectId: "p1", amount: 8000000, label: "Đợt 2", date: "2026-11-11" });
    expect(r[1].projectId).toBe("");
    expect(r[2].projectId).toBe("p1");
    expect(eligibleProjects(PROJECTS, "c1").map((p) => p.id)).toEqual(["p1"]);
  });

  it("khoản thu số tiền không hợp lệ không thành khoản thu; số tiền làm tròn đồng", () => {
    const r = normalizeItems([{ type: "payment", customer: "x", amount: 0, title: "Nhắc khách" }, { type: "payment", amount: -5 }, { type: "payment", amount: 1234.6, customer: "Vua Đóng Gói" }], { customers: CUSTOMERS, projects: PROJECTS });
    expect(r.map((x) => x.type)).toEqual(["task", "payment"]);
    expect(r[1].amount).toBe(1235);
  });
});

describe("đổi thành thao tác ghi vào app", () => {
  const base = { projects: PROJECTS, customers: CUSTOMERS, today: TODAY };
  it("việc → task có giá trị mặc định; mục bỏ tick không được ghi", () => {
    const items = normalizeItems([{ type: "task", title: "Gọi khách", customer: "Vua Đóng Gói" }, { type: "task", title: "Bỏ qua" }], { customers: CUSTOMERS, projects: PROJECTS });
    items[1].include = false;
    const a = buildActions(items, base);
    expect(a.tasks).toEqual([{ title: "Gọi khách", date: "2026-11-09", time: "", priority: "med", note: "", customerId: "c1" }]);
    expect(a.installments).toEqual([]);
  });

  it("khoản thu có dự án hợp lệ → ĐỢT THU chưa thu (collected = 0, không phí chạy ADS)", () => {
    const items = normalizeItems([{ type: "payment", customer: "Vua Đóng Gói", project: "Web", amount: 8000000, date: "2026-11-11", label: "Đợt 2", note: "chuyển khoản" }], { customers: CUSTOMERS, projects: PROJECTS });
    const a = buildActions(items, base);
    expect(a.tasks).toEqual([]);
    expect(a.installments).toHaveLength(1);
    expect(a.installments[0]).toMatchObject({ projectId: "p1", inst: { label: "Đợt 2", date: "2026-11-11", amount: 8000000, collected: 0, serviceFee: 0, spend: 0, ctv: 0, note: "chuyển khoản" } });
  });

  it("khoản thu KHÔNG có dự án / dự án ADS / không có quyền sửa khách → thành việc nhắc thu", () => {
    const noProj = normalizeItems([{ type: "payment", customer: "Nhậu Phi Trường", amount: 5000000, label: "Đợt 1" }], { customers: CUSTOMERS, projects: PROJECTS });
    expect(noProj[0].projectId).toBe("");
    expect(buildActions(noProj, base).tasks[0]).toMatchObject({ title: "Thu 5.000.000 đ — Nhậu Phi Trường (Đợt 1)", date: "2026-11-09", customerId: "c2", asPayment: true });
    const ads = [{ ...noProj[0], projectId: "p2", customerId: "c1", customerName: "Vua Đóng Gói" }];
    const a = buildActions(ads, base);
    expect(a.installments).toEqual([]);
    expect(a.tasks).toHaveLength(1);
    const web = normalizeItems([{ type: "payment", customer: "Vua Đóng Gói", project: "Web", amount: 1000000 }], { customers: CUSTOMERS, projects: PROJECTS });
    const viewer = buildActions(web, { ...base, canPay: false });
    expect(viewer.installments).toEqual([]);
    expect(viewer.tasks[0].title).toContain("Thu 1.000.000 đ");
  });
});

// ───────────── Khung xem lại ─────────────
let DATA, errors = [], spy;
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/ai.js", async (importOriginal) => ({ ...(await importOriginal()), aiReadMessage: vi.fn() }));
import { aiReadMessage } from "../src/lib/ai.js";

beforeEach(() => {
  DATA = makeData({ customerList: CUSTOMERS, projects: PROJECTS, addTask: vi.fn(), addInstallment: vi.fn(), setToast: vi.fn(), settings: { openaiKey: "k" }, canEdit: () => true });
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils/.test(m)) errors.push(m.slice(0, 300)); });
  aiReadMessage.mockResolvedValue([
    { type: "task", title: "Họp duyệt giao diện", date: "2026-11-13", time: "15:00", priority: "med", customer: "Vua Đóng Gói" },
    { type: "task", title: "Gửi bản demo cho khách", date: "2026-11-12", time: null, priority: "high", customer: "Vua Đóng Gói" },
    { type: "payment", customer: "Vua Đóng Gói", project: "Web", amount: 8000000, date: "2026-11-11", label: "Đợt 2" },
  ]);
});
afterEach(() => { spy.mockRestore(); cleanup(); vi.clearAllMocks(); });
const sleep = (ms) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });
async function open() {
  const C = (await import("../src/components/MessageImport.jsx")).default;
  const onClose = vi.fn();
  await act(async () => { render(<C onClose={onClose} />); });
  return onClose;
}
const analyze = async (text = "Tin nhắn của khách") => {
  await act(async () => { fireEvent.change(document.querySelector("#msg-text"), { target: { value: text } }); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Phân tích tin nhắn/ })); });
  await sleep(30);
};

describe("khung Dán tin nhắn khách", () => {
  it("chưa có chữ → nút phân tích bị khoá; điền tin nhắn mẫu được", async () => {
    await open();
    expect(screen.getByRole("button", { name: /Phân tích tin nhắn/ }).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Điền thử tin nhắn mẫu/ })); });
    expect(document.querySelector("#msg-text").value).toMatch(/đợt 2 là 8 triệu/);
    expect(screen.getByRole("button", { name: /Phân tích tin nhắn/ }).disabled).toBe(false);
  });

  it("phân tích → 3 mục; sửa + bỏ tick → Thêm: ghi đúng việc và đợt thu rồi đóng", async () => {
    const onClose = await open();
    await analyze();
    expect(aiReadMessage).toHaveBeenCalledTimes(1);
    expect(aiReadMessage.mock.calls[0][0].text).toBe("Tin nhắn của khách");
    expect(aiReadMessage.mock.calls[0][0].apiKey).toBe("k");
    expect(screen.getByText(/AI tìm thấy/).textContent).toContain("3");
    expect(screen.getByText(/Sẽ thêm thành ĐỢT THU/)).toBeTruthy();
    // sửa tên việc đầu + bỏ tick việc thứ hai
    const titles = screen.getAllByLabelText("Tên việc");
    await act(async () => { fireEvent.change(titles[0], { target: { value: "Họp duyệt giao diện Web" } }); });
    await act(async () => { fireEvent.click(screen.getAllByLabelText("Thêm mục này")[1]); });
    expect(screen.getByRole("button", { name: /Thêm 2 mục/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Thêm 2 mục/ })); });
    expect(DATA.addTask).toHaveBeenCalledTimes(1);
    expect(DATA.addTask.mock.calls[0][0]).toMatchObject({ title: "Họp duyệt giao diện Web", date: "2026-11-13", time: "15:00", customerId: "c1" });
    expect(DATA.addTask.mock.calls[0][0].asPayment).toBeUndefined();
    expect(DATA.addInstallment).toHaveBeenCalledTimes(1);
    expect(DATA.addInstallment.mock.calls[0][0]).toBe("p1");
    expect(DATA.addInstallment.mock.calls[0][1]).toMatchObject({ amount: 8000000, label: "Đợt 2", date: "2026-11-11", collected: 0 });
    expect(DATA.setToast).toHaveBeenCalledWith({ text: "Đã thêm 1 việc và 1 đợt thu từ tin nhắn" });
    expect(onClose).toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("bỏ chọn dự án của khoản thu → được thêm thành việc nhắc thu thay vì đợt thu", async () => {
    await open();
    await analyze();
    const proj = screen.getByLabelText("Dự án");
    await act(async () => { fireEvent.change(proj, { target: { value: "" } }); });
    expect(screen.getByText(/Sẽ thêm thành VIỆC nhắc thu/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Thêm 3 mục/ })); });
    expect(DATA.addInstallment).not.toHaveBeenCalled();
    expect(DATA.addTask).toHaveBeenCalledTimes(3);
    expect(DATA.addTask.mock.calls.some(([t]) => t.title.startsWith("Thu 8.000.000 đ — Vua Đóng Gói"))).toBe(true);
  });

  it("đổi khách của khoản thu → dự án chọn lại theo khách mới", async () => {
    await open();
    await analyze();
    const card = screen.getByLabelText("Tên đợt").closest("div.rounded-2xl");
    const sel = within(card).getByLabelText("Khách");
    await act(async () => { fireEvent.change(sel, { target: { value: "c2" } }); });
    expect(within(card).getByLabelText("Dự án").value).toBe(""); // Phi Trường có 2 dự án hợp lệ → để chủ chọn
    expect(within(card).getAllByRole("option").map((o) => o.textContent)).toEqual(expect.arrayContaining(["Seo Phi Trường", "Landing Phi Trường"]));
  });

  it("AI lỗi → hiện lỗi, giữ nguyên tin nhắn; AI không thấy gì → báo rõ", async () => {
    aiReadMessage.mockRejectedValueOnce(new Error("Chưa nhập API key OpenAI (Cài đặt → AI)."));
    await open();
    await analyze("Nội dung dán");
    expect(screen.getByText(/Chưa nhập API key/)).toBeTruthy();
    expect(document.querySelector("#msg-text").value).toBe("Nội dung dán");
    aiReadMessage.mockResolvedValueOnce([]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Phân tích tin nhắn/ })); });
    await sleep(30);
    expect(screen.getByText(/AI không thấy việc, lịch hẹn hay khoản thu nào/)).toBeTruthy();
    expect(errors).toEqual([]);
  });

  it("không có quyền sửa Khách & Dự án → khoản thu luôn thành việc nhắc thu", async () => {
    DATA = makeData({ customerList: CUSTOMERS, projects: PROJECTS, addTask: vi.fn(), addInstallment: vi.fn(), setToast: vi.fn(), settings: {}, canEdit: (f) => f !== "customers" });
    await open();
    await analyze();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Thêm 3 mục/ })); });
    expect(DATA.addInstallment).not.toHaveBeenCalled();
    expect(DATA.addTask).toHaveBeenCalledTimes(3);
  });
});
