import { describe, it, expect } from "vitest";
import { nextDate, rollNext, newlyDone, dueReminders, repeatLabel, normRepeat, firstOnOrAfter, projectedOccurrences, remindKey } from "../src/lib/taskRepeat.js";
import { parseQuickTask } from "../src/lib/quickTask.js";

describe("việc lặp lại — ngày kế tiếp", () => {
  it("hằng ngày: đúng hạn → mai; quá hạn mới xong → vẫn là mai (không đẻ việc quá hạn)", () => {
    expect(nextDate({ date: "2026-11-11", repeat: { type: "daily" } }, "2026-11-11")).toBe("2026-11-12");
    expect(nextDate({ date: "2026-11-08", repeat: { type: "daily" } }, "2026-11-11")).toBe("2026-11-12");
  });
  it("hằng tuần T2 + T5 (11/11/2026 là thứ 4)", () => {
    const t = { date: "2026-11-11", repeat: { type: "weekly", days: [1, 4] } };
    expect(nextDate(t, "2026-11-11")).toBe("2026-11-12");
    expect(nextDate({ ...t, date: "2026-11-12" }, "2026-11-12")).toBe("2026-11-16");
  });
  it("hằng tháng ngày 31 → tháng thiếu ngày lấy ngày cuối tháng", () => {
    expect(nextDate({ date: "2026-01-31", repeat: { type: "monthly", dom: 31 } }, "2026-01-31")).toBe("2026-02-28");
    expect(nextDate({ date: "2026-11-15", repeat: { type: "monthly", dom: 15 } }, "2026-11-15")).toBe("2026-12-15");
  });
  it("không lặp / dữ liệu lạ → null", () => {
    expect(nextDate({ date: "2026-11-11" }, "2026-11-11")).toBeNull();
    expect(normRepeat({ type: "abc" })).toBeNull();
  });
  it("nhãn dễ hiểu", () => {
    expect(repeatLabel({ type: "daily" })).toBe("Hằng ngày");
    expect(repeatLabel({ type: "weekly", days: [0, 1] })).toBe("Hằng tuần T2, CN");
    expect(repeatLabel({ type: "monthly", dom: 5 })).toBe("Ngày 5 hằng tháng");
  });
  it("lần đầu khớp luật tính cả hôm nay", () => {
    expect(firstOnOrAfter({ type: "weekly", days: [3] }, "2026-11-11")).toBe("2026-11-11");
    expect(firstOnOrAfter({ type: "weekly", days: [1] }, "2026-11-11")).toBe("2026-11-16");
  });
});

describe("việc lặp lại — tạo lần tới", () => {
  const t = { id: "a", title: "Báo cáo", date: "2026-11-11", time: "09:00", status: "done", priority: "high", remind: 10, pomos: 3, repeat: { type: "daily" } };
  it("giữ tên/giờ/nhắc, chuỗi cùng seriesId, bỏ số phiên đã làm", () => {
    const n = rollNext(t, [t], "2026-11-11");
    expect(n).toMatchObject({ title: "Báo cáo", date: "2026-11-12", time: "09:00", status: "todo", priority: "high", remind: 10, seriesId: "a" });
    expect(n.pomos).toBeUndefined();
  });
  it("đã có lần tới (máy khác tạo rồi) → không tạo trùng", () => {
    expect(rollNext(t, [t, { id: "b", seriesId: "a", date: "2026-11-12", status: "todo" }], "2026-11-11")).toBeNull();
  });
  it("chỉ việc vừa chuyển sang xong mới tính; việc mới tải về đã xong thì không", () => {
    const prev = new Map([["a", "todo"], ["b", "done"]]);
    const now = [{ id: "a", status: "done" }, { id: "b", status: "done" }, { id: "c", status: "done" }];
    expect(newlyDone(prev, now).map((x) => x.id)).toEqual(["a"]);
    expect(newlyDone(null, now)).toEqual([]);
  });
  it("Lịch hiện trước các lần sắp tới, bỏ ngày đã có việc thật và chuỗi đã xong", () => {
    const tasks = [
      { id: "a", title: "Tập", date: "2026-11-28", status: "todo", repeat: { type: "daily" } },
      { id: "x", title: "Cũ", date: "2026-11-01", status: "done", repeat: { type: "daily" } },
    ];
    expect(projectedOccurrences(tasks, "2026-11-01", "2026-11-30").map((o) => o.date)).toEqual(["2026-11-29", "2026-11-30"]);
  });
});

describe("nhắc trước giờ", () => {
  const t = { id: "a", title: "Họp", date: "2026-11-11", time: "10:00", remind: 30, status: "todo" };
  const at = (h, m) => new Date(2026, 10, 11, h, m).getTime();
  it("trong khoảng 30 phút trước giờ → nhắc; trước đó / sau giờ / đã xong → không", () => {
    expect(dueReminders([t], at(9, 40)).map((d) => d.left)).toEqual([20]);
    expect(dueReminders([t], at(9, 20))).toEqual([]);
    expect(dueReminders([t], at(10, 1))).toEqual([]);
    expect(dueReminders([{ ...t, status: "done" }], at(9, 40))).toEqual([]);
    expect(dueReminders([{ ...t, remind: 0 }], at(9, 40))).toEqual([]);
  });
  it("đã nhắc thì không nhắc lại; đổi giờ thì nhắc lại", () => {
    const fired = new Set([remindKey(t)]);
    expect(dueReminders([t], at(9, 40), fired)).toEqual([]);
    expect(dueReminders([{ ...t, time: "10:05" }], at(9, 40), fired)).toHaveLength(1);
  });
});

describe("thêm việc nhanh — lặp lại", () => {
  const now = new Date(2026, 10, 11); // thứ 4
  it("'mỗi ngày' → hằng ngày, ngày đầu = hôm nay", () => {
    const r = parseQuickTask("Đọc sách mỗi ngày 21h", [], now);
    expect(r).toMatchObject({ title: "Đọc sách", date: "2026-11-11", time: "21:00", repeat: { type: "daily" } });
  });
  it("'mỗi thứ 2' → hằng tuần T2, lần đầu thứ 2 tới (không hiểu thành 'thứ 2 tới' 1 lần)", () => {
    const r = parseQuickTask("Họp giao ban mỗi thứ 2 8h", [], now);
    expect(r).toMatchObject({ title: "Họp giao ban", date: "2026-11-16", repeat: { type: "weekly", days: [1] } });
  });
  it("'hằng tháng' lấy ngày ghi kèm", () => {
    expect(parseQuickTask("Đóng tiền nhà hằng tháng 5/12", [], now).repeat).toEqual({ type: "monthly", dom: 5 });
  });
  it("'giao hàng ngày mai' KHÔNG phải lặp lại", () => {
    const r = parseQuickTask("Giao hàng ngày mai", [], now);
    expect(r.repeat).toBeNull();
    expect(r.date).toBe("2026-11-12");
  });
});
