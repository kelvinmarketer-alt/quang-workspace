import { describe, it, expect } from "vitest";
import { DEFAULT_ORDER, normalizeLayout, moveBlock, toggleBlock, visibleBlocks, isDefaultLayout, isDefaultOrder, layoutFor, layoutPatch } from "../src/lib/dashLayout.js";

describe("Tuỳ chỉnh Tổng quan", () => {
  it("mặc định = bố cục cũ, không ẩn ô nào", () => {
    const l = normalizeLayout(null);
    expect(l.order).toEqual(DEFAULT_ORDER);
    expect(l.hidden).toEqual([]);
    expect(isDefaultLayout(null)).toBe(true);
  });
  it("bỏ id lạ / trùng, ô mới chèn đúng chỗ mặc định", () => {
    const l = normalizeLayout({ order: ["chart", "chart", "xyz", "today"], hidden: ["xyz", "year"] });
    expect(l.order[0]).toBe("chart");
    expect(l.order.indexOf("chart")).toBeLessThan(l.order.indexOf("today"));
    expect([...l.order].sort()).toEqual([...DEFAULT_ORDER].sort());
    expect(l.order.indexOf("week")).toBe(l.order.indexOf("today") + 1);
    expect(l.hidden).toEqual(["year"]);
  });
  it("lên / xuống, không vượt đầu-cuối, bỏ qua ô không dùng được", () => {
    let l = moveBlock(null, "kpi", -1);
    expect(l.order.slice(0, 3)).toEqual(["today", "kpi", "week"]);
    expect(isDefaultOrder(l)).toBe(false);
    expect(moveBlock(null, "today", -1).order).toEqual(DEFAULT_ORDER);
    expect(moveBlock(null, "receipts", 1).order).toEqual(DEFAULT_ORDER);
    // không có Coin → Phiếu thu nhảy qua Coin lên trên Biểu đồ
    const avail = DEFAULT_ORDER.filter((x) => x !== "coin");
    l = moveBlock(null, "receipts", -1, avail);
    expect(visibleBlocks(l, avail).slice(-2)).toEqual(["receipts", "chart"]);
  });
  it("bật / tắt và lọc ô hiện", () => {
    const l = toggleBlock(toggleBlock(null, "chart"), "year");
    expect(visibleBlocks(l)).not.toContain("chart");
    expect(visibleBlocks(toggleBlock(l, "chart"))).toContain("chart");
    expect(isDefaultLayout(l)).toBe(false);
  });
  it("lưu theo từng email, không đè người khác", () => {
    const s = { dashLayout: { "b@x.vn": { order: ["chart"], hidden: [] } } };
    const p = layoutPatch(s, "A@X.vn", toggleBlock(null, "coin"));
    expect(Object.keys(p.dashLayout).sort()).toEqual(["a@x.vn", "b@x.vn"]);
    expect(layoutFor({ ...s, ...p }, "a@x.vn").hidden).toEqual(["coin"]);
    expect(layoutFor({ ...s, ...p }, "b@x.vn")).toEqual(normalizeLayout(s.dashLayout["b@x.vn"]));
    expect(layoutFor({}, "").order).toEqual(DEFAULT_ORDER);
  });
});
