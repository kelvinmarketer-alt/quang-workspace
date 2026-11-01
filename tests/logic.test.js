// Kiểm thử phần TÍNH TOÁN (lỗi số liệu tìm thấy 01/11 — giữ để không tái phát)
import { describe, it, expect } from "vitest";
import { formatShort } from "../src/lib/format.js";
import { expensesInRange, debtToDate, totalDebt } from "../src/lib/selectors.js";
import { parseQuickTask } from "../src/lib/quickTask.js";
import { memberAccess } from "../src/lib/permissions.js";
import { projects } from "./fixture.js";

describe("định dạng số", () => {
  it("thập phân kiểu Việt (dấu phẩy)", () => {
    expect(formatShort(891_900_000)).toBe("891,9 tr");
    expect(formatShort(1_500_000_000)).toBe("1,5 tỷ");
    expect(formatShort(450_000)).toBe("450k");
  });
});

describe("chi phí định kỳ", () => {
  it("bắt đầu ngày 31 vẫn đủ mỗi tháng 1 kỳ (kẹp cuối tháng)", () => {
    const e = [{ id: "e", amount: 100, date: "2025-01-31", recurring: "monthly", active: true }];
    const r = expensesInRange(e, "2025-01-01", "2025-12-31");
    expect(r.items[0].count).toBe(12);
    expect(r.total).toBe(1200);
  });
  it("hằng năm ngày 29/2 → năm thường vẫn tính 1 lần", () => {
    const e = [{ id: "y", amount: 100, date: "2024-02-29", recurring: "yearly", active: true }];
    expect(expensesInRange(e, "2025-01-01", "2025-12-31").items[0].count).toBe(1);
  });
  it("khoản tạm dừng không tính", () => {
    const e = [{ id: "x", amount: 100, date: "2025-01-01", recurring: "monthly", active: false }];
    expect(expensesInRange(e, "2025-01-01", "2025-12-31").total).toBe(0);
  });
});

describe("công nợ", () => {
  it("nợ tới hạn không tính đợt có ngày tương lai", () => {
    const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    expect(totalDebt(projects)).toBeGreaterThan(debtToDate(projects, today));
  });
});

describe("thêm việc nhanh", () => {
  const now = new Date(2026, 10, 1);
  it("'mai' là ngày mai", () => expect(parseQuickTask("Gửi báo cáo mai", [], now).date).toBe("2026-11-02"));
  it("'chị Mai' là tên người", () => { const r = parseQuickTask("Gọi chị Mai", [], now); expect(r.date).toBeNull(); expect(r.title).toBe("Gọi chị Mai"); });
  it("ngày không có thật không được hiểu là ngày", () => expect(parseQuickTask("Nộp 31/2", [], now).date).toBeNull());
  it("giờ chiều", () => expect(parseQuickTask("Họp 3h chiều", [], now).time).toBe("15:00"));
});

describe("phân quyền", () => {
  it("thành viên KHÔNG xem tiền coin dù hồ sơ cũ lỡ cấp", () => {
    const a = memberAccess({ email: "nv@x.com", access: { coinInvest: "edit", coinLive: "view", coinMarket: "view" } });
    expect(a.coinInvest).toBe("none");
    expect(a.coinLive).toBe("none");
    expect(a.coinMarket).toBe("view");
  });
});
