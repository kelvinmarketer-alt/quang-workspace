// Kiểm thử LINK LỊCH ĐĂNG KÝ (09/11): nội dung lịch (giờ Việt Nam, cả ngày, âm lịch, thoát ký tự, ngắt dòng 75 byte, nhóm bật / tắt)
// + thẻ Cài đặt (bật, tắt nhóm, đổi link, xoá) + bộ đồng bộ nền.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeData } from "./fixture.js";

let DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));
vi.mock("../src/lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u1", email: "chu@example.com" } }), AuthProvider: ({ children }) => children }));
vi.mock("../src/lib/ical.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, icalGet: vi.fn(), icalCreate: vi.fn(), icalSave: vi.fn(), icalDelete: vi.fn() };
});
import * as I from "../src/lib/ical.js";
import { lunarToSolar } from "../src/lib/lunar.js";

const TODAY = new Date("2026-11-09T10:00:00");
const unfold = (ics) => ics.replace(/\r\n /g, "");
const events = (ics) => unfold(ics).split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
const line = (ev, key) => (ev.match(new RegExp(`^${key}[^\\r\\n]*`, "m")) || [""])[0];
const only = { family: false, holidays: false, tasks: false, receivables: false, amounts: false };

describe("nội dung lịch (ICS)", () => {
  it("khung chuẩn: kết thúc bằng xuống dòng kiểu CRLF, mọi dòng ≤ 75 byte, UID không trùng", () => {
    const { ics } = I.buildIcs({ today: TODAY, tasks: [{ id: "t1", title: "Việc " + "rất dài ".repeat(30), date: "2026-11-20", status: "todo" }], family: [{ title: "Giỗ ông", calendar: "am", day: 12, month: 3, repeat: "year", category: "giỗ" }] });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const enc = new TextEncoder();
    for (const l of ics.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    const uids = unfold(ics).match(/^UID:.*$/gm);
    expect(new Set(uids).size).toBe(uids.length);
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Ho_Chi_Minh");
  });

  it("việc CÓ GIỜ: đổi đúng giờ Việt Nam sang UTC (15:00 → 08:00Z), dài 1 giờ, chuông nhắc trước 15 phút", () => {
    const { ics } = I.buildIcs({ today: TODAY, opts: { ...only, tasks: true }, tasks: [{ id: "t1", title: "Họp duyệt giao diện", date: "2026-11-13", time: "15:00", status: "todo", customerId: "c1", note: "Mang laptop" }], customers: [{ id: "c1", name: "Khách A" }] });
    const [ev] = events(ics);
    expect(line(ev, "DTSTART")).toBe("DTSTART:20261113T080000Z");
    expect(line(ev, "DTEND")).toBe("DTEND:20261113T090000Z");
    expect(ev).toContain("TRIGGER:-PT15M");
    expect(ev).toContain("DESCRIPTION:Khách: Khách A\\nMang laptop");
  });

  it("giờ lúc 0 giờ sáng Việt Nam rơi về ngày hôm trước theo UTC", () => {
    const { ics } = I.buildIcs({ today: TODAY, opts: { ...only, tasks: true }, tasks: [{ id: "t1", title: "Sớm", date: "2026-11-13", time: "03:30", status: "todo" }] });
    expect(line(events(ics)[0], "DTSTART")).toBe("DTSTART:20261112T203000Z");
  });

  it("việc KHÔNG giờ: cả ngày (DTEND = ngày hôm sau), nhắc 9 giờ sáng; việc gấp có nhãn [Gấp]", () => {
    const { ics } = I.buildIcs({ today: TODAY, opts: { ...only, tasks: true }, tasks: [{ id: "t1", title: "Gửi báo cáo", date: "2026-11-30", priority: "high", status: "todo" }] });
    const [ev] = events(ics);
    expect(line(ev, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261130");
    expect(line(ev, "DTEND")).toBe("DTEND;VALUE=DATE:20261201"); // qua tháng
    expect(ev).toContain("SUMMARY:[Gấp] Gửi báo cáo");
    expect(ev).toContain("TRIGGER:PT9H");
  });

  it("bỏ việc đã xong, việc không ngày, ngày sai, việc quá cũ (> 30 ngày)", () => {
    const tasks = [
      { id: "a", title: "Xong rồi", date: "2026-11-20", status: "done" }, { id: "b", title: "Không ngày", status: "todo" },
      { id: "c", title: "Ngày sai", date: "2026-13-45", status: "todo" }, { id: "d", title: "Quá cũ", date: "2026-08-01", status: "todo" },
      { id: "e", title: "Còn hạn", date: "2026-11-20", status: "todo" },
    ];
    const r = I.buildIcs({ today: TODAY, opts: { ...only, tasks: true }, tasks });
    expect(r.counts.tasks).toBe(1);
    expect(r.ics).toContain("SUMMARY:Còn hạn");
    expect(r.ics).not.toMatch(/Xong rồi|Không ngày|Ngày sai|Quá cũ/);
  });

  it("thoát ký tự đặc biệt và nối dòng dài lại thì ra đúng nguyên văn", () => {
    expect(I.escText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const title = "Họp với khách về hợp đồng quảng cáo năm 2027, gồm cả phần thiết kế; ghi chú rất dài để buộc phải ngắt dòng nhiều lần";
    const { ics } = I.buildIcs({ today: TODAY, opts: { ...only, tasks: true }, tasks: [{ id: "t", title, date: "2026-11-20", status: "todo" }] });
    expect(ics).toContain("\r\n "); // có ngắt dòng
    expect(line(events(ics)[0], "SUMMARY")).toBe(`SUMMARY:${I.escText(title)}`);
  });

  it("giỗ theo ÂM lịch được tính sẵn ra ngày dương cho 2 năm tới, kèm ngày âm trong mô tả, nhắc 9 giờ sáng hôm đó và hôm trước", () => {
    const family = [{ title: "Giỗ ông", calendar: "am", day: 12, month: 3, repeat: "year", category: "giỗ" }];
    const r = I.buildIcs({ today: TODAY, opts: { ...only, family: true }, family });
    const evs = events(r.ics);
    expect(r.counts.family).toBe(2); // 2027 và 2028
    const d27 = lunarToSolar(12, 3, 2027), want = `${d27.getFullYear()}${String(d27.getMonth() + 1).padStart(2, "0")}${String(d27.getDate()).padStart(2, "0")}`;
    expect(evs.map((e) => line(e, "DTSTART"))).toContain(`DTSTART;VALUE=DATE:${want}`);
    expect(evs[0]).toContain("DESCRIPTION:Âm lịch: 12/3");
    expect(evs[0]).toContain("TRIGGER:PT9H");
    expect(evs[0]).toContain("TRIGGER:-PT15H");
  });

  it("nhóm Lễ / Mùng 1 / Rằm bật tắt riêng và không gây chuông", () => {
    const on = I.buildIcs({ today: TODAY, opts: { ...only, holidays: true } });
    expect(on.counts.holidays).toBeGreaterThan(40); // 24 tháng × 2 + lễ
    expect(on.ics).toContain("SUMMARY:Rằm");
    expect(on.ics).toContain("SUMMARY:Mùng 1");
    expect(on.ics).not.toContain("VALARM");
    const off = I.buildIcs({ today: TODAY, opts: { ...only } });
    expect(off.counts).toEqual({ family: 0, holidays: 0, tasks: 0, receivables: 0 });
    expect(off.ics).not.toContain("BEGIN:VEVENT");
  });

  it("hạn thu tiền: chỉ đợt còn nợ; số tiền chỉ hiện khi bật", () => {
    const projects = [{ id: "p1", name: "Web A", customerId: "c1", customerName: "Khách A", category: "Web", status: "doing", installments: [
      { id: "i1", label: "Đợt 1", date: "2026-10-20", amount: 10000000, collected: 10000000, costs: [] },
      { id: "i2", label: "Đợt 2", date: "2026-11-11", amount: 8000000, collected: 3000000, costs: [] },
    ] }];
    const a = I.buildIcs({ today: TODAY, opts: { ...only, receivables: true }, projects });
    expect(a.counts.receivables).toBe(1);
    expect(a.ics).toContain("SUMMARY:Thu tiền: Khách A — Đợt 2");
    expect(a.ics).not.toMatch(/5\.000\.000|Đợt 1/);
    const b = I.buildIcs({ today: TODAY, opts: { ...only, receivables: true, amounts: true }, projects });
    expect(unfold(b.ics)).toContain("(5.000.000 đ)"); // còn nợ = 8tr − 3tr
  });

  it("cùng dữ liệu, cùng ngày → cùng nội dung (để app biết khi nào không cần gửi lại)", () => {
    const args = { today: TODAY, tasks: [{ id: "t", title: "A", date: "2026-11-20", status: "todo" }] };
    expect(I.buildIcs(args).ics).toBe(I.buildIcs({ ...args, today: new Date("2026-11-09T21:45:00") }).ics);
  });

  it("mã bí mật đủ dài, không đoán được; link có dạng https và webcal", () => {
    const a = I.newToken(), b = I.newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(I.icalUrl(a)).toBe(`https://dbfffwtnxhytcoczhxhf.supabase.co/functions/v1/qws-ical?t=${a}`);
    expect(I.icalWebcalUrl(a).startsWith("webcal://dbfffwtnxhytcoczhxhf.supabase.co/")).toBe(true);
  });
});

// ───────────── Thẻ Cài đặt ─────────────
let errors = [], spy;
beforeEach(() => {
  DATA = makeData();
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils/.test(m)) errors.push(m.slice(0, 300)); });
  I.icalGet.mockResolvedValue({ data: null, error: null });
  I.icalCreate.mockImplementation(async (uid, token, options) => ({ data: { token, options, updated_at: new Date().toISOString() }, error: null }));
  I.icalSave.mockImplementation(async (uid, patch) => ({ data: { token: patch.token || "T".repeat(32), options: patch.options || {}, updated_at: new Date().toISOString() }, error: null }));
  I.icalDelete.mockResolvedValue({ error: null });
});
afterEach(() => { spy.mockRestore(); cleanup(); vi.clearAllMocks(); });
const sleep = (ms) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });
async function mountSettings() {
  const C = (await import("../src/components/IcalSettings.jsx")).default;
  await act(async () => { render(<MemoryRouter><C /></MemoryRouter>); });
  await sleep(30);
}

describe("thẻ Lịch trên điện thoại (Cài đặt)", () => {
  it("chưa bật → giải thích + nút bật; bấm bật tạo link với mã dài, nội dung lịch và nhóm mặc định", async () => {
    await mountSettings();
    expect(screen.getByText(/Chỉ một chiều/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bật link lịch/ })); });
    await sleep(30);
    const [uid, token, opts, ics] = I.icalCreate.mock.calls[0];
    expect(uid).toBe("u1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(opts).toEqual({ family: true, holidays: true, tasks: true, receivables: true, amounts: false });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(screen.getByLabelText("Link lịch").value).toContain(`qws-ical?t=${token}`);
    expect(errors).toEqual([]);
  });

  it("đã bật → hiện link, đủ nhóm; bỏ tick 1 nhóm lưu ngay tuỳ chọn mới + lịch mới", async () => {
    I.icalGet.mockResolvedValue({ data: { token: "A".repeat(32), options: { family: true, holidays: true, tasks: true, receivables: true, amounts: false }, updated_at: new Date().toISOString() }, error: null });
    await mountSettings();
    expect(screen.getByLabelText("Link lịch").value).toContain("A".repeat(32));
    await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: /Lễ và Mùng 1/ })); });
    await sleep(20);
    const [, patch] = I.icalSave.mock.calls[0];
    expect(patch.options.holidays).toBe(false);
    expect(patch.ics).not.toContain("SUMMARY:Rằm");
  });

  it("đổi link: hỏi xác nhận rồi đổi mã; tắt: hỏi xác nhận rồi xoá", async () => {
    I.icalGet.mockResolvedValue({ data: { token: "A".repeat(32), options: {}, updated_at: new Date().toISOString() }, error: null });
    await mountSettings();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Đổi link/ })); });
    await sleep(30);
    expect(I.icalSave.mock.calls.at(-1)[1].token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(I.icalSave.mock.calls.at(-1)[1].token).not.toBe("A".repeat(32));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tắt và xoá link/ })); });
    await sleep(30);
    expect(I.icalDelete).toHaveBeenCalledWith("u1");
    expect(screen.getByRole("button", { name: /Bật link lịch/ })).toBeTruthy();
  });

  it("chưa chạy SQL → hướng dẫn cài, không sập", async () => {
    I.icalGet.mockResolvedValue({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.qws_ical_feeds'" } });
    await mountSettings();
    expect(screen.getByText(/SETUP-ICAL\.sql/)).toBeTruthy();
    expect(errors).toEqual([]);
  });
});

// ───────────── Bộ đồng bộ nền ─────────────
describe("đồng bộ nền", () => {
  const mountSync = async () => { const C = (await import("../src/components/IcalSync.jsx")).default; let r; await act(async () => { r = render(<C />); }); await sleep(30); return r; };
  it("đã bật link → gửi lịch lên máy chủ; dữ liệu không đổi thì không gửi lại", async () => {
    I.icalGet.mockResolvedValue({ data: { token: "A".repeat(32), options: {}, updated_at: "x" }, error: null });
    const r = await mountSync();
    expect(I.icalSave).toHaveBeenCalledTimes(1);
    expect(I.icalSave.mock.calls[0][0]).toBe("u1");
    expect(I.icalSave.mock.calls[0][1].ics).toContain("SUMMARY:Gửi báo cáo");
    window.dispatchEvent(new Event("qws-ical-refresh"));
    await sleep(40);
    expect(I.icalSave).toHaveBeenCalledTimes(2); // bắt buộc gửi lại sau khi đổi tuỳ chọn
    r.rerender(<></>);
  });
  it("chưa bật link → không gửi gì; không phải chủ → không đụng máy chủ", async () => {
    await mountSync();
    expect(I.icalSave).not.toHaveBeenCalled();
    cleanup();
    DATA = makeData({ isOwner: false });
    await mountSync();
    expect(I.icalGet).toHaveBeenCalledTimes(1); // chỉ lần của chủ ở trên
  });
});
