// Kiểm thử (11/11): độ mới số Website, so kỳ trước + bài top Fanpage, kiểm đủ số trước khi gửi báo cáo khách
import { describe, it, expect } from "vitest";
import { dataSpan, lastDataDate, latestOf, freshText, lagDays } from "../src/lib/webData.js";
import { comparePeriods, sumClicks, topEngaged, pageLastDate } from "../src/lib/fbPages.js";
import { reportCompleteness, completenessText } from "../src/lib/reports.js";

describe("độ mới số (Số tới ngày dd/mm)", () => {
  it("lấy ngày mới nhất THỰC có số, bỏ ngày bằng 0", () => {
    const rows = [{ date: "2026-11-01", clicks: 5 }, { date: "2026-11-08", clicks: 3 }, { date: "2026-11-09", clicks: 0 }];
    expect(lastDataDate(rows, ["clicks"])).toBe("2026-11-08");
    expect(lastDataDate(rows)).toBe("2026-11-09"); // không chỉ định cột → có dòng là tính
    expect(dataSpan(rows, ["clicks"])).toEqual({ first: "2026-11-01", last: "2026-11-08" });
    expect(lastDataDate([["2026-11-03", 2], ["2026-11-05", 0]], ["x"])).toBe("2026-11-03");
    expect(lastDataDate([])).toBe(null);
  });
  it("nhiều web → lấy ngày muộn nhất; chữ hiển thị + số ngày thiếu cuối kỳ", () => {
    expect(latestOf(["2026-11-07", null, "2026-11-09"])).toBe("2026-11-09");
    expect(freshText("2026-11-08")).toBe("Số tới ngày 08/11");
    expect(lagDays("2026-11-08", "2026-11-11")).toBe(3);
    expect(lagDays("2026-11-11", "2026-11-11")).toBe(0);
  });
});

describe("Fanpage: so kỳ trước + bài kéo tương tác", () => {
  it("so % cho số, so điểm % cho tỉ lệ tương tác; click cộng từ bài", () => {
    const rows = comparePeriods({ reach: 1200, engagement: 60, er: 5, messages: 10 }, { reach: 1000, engagement: 80, er: 8, messages: 0 }, { cur: 30, prev: 20 });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.reach.d).toBeCloseTo(20);
    expect(by.engagement.d).toBeCloseTo(-25);
    expect(by.er.d).toBeCloseTo(-3);
    expect(by.er.unit).toBe("pt");
    expect(by.clicks.d).toBeCloseTo(50);
    expect(by.messages.d).toBe(null); // kỳ trước 0 → không chia
    expect(comparePeriods({ reach: 1 }, {}, null).find((r) => r.key === "clicks").cur).toBe(null);
  });
  it("top bài theo tương tác, bỏ bài 0 tương tác, hoà thì nhiều click hơn lên trước", () => {
    const posts = [{ id: "a", eng: 5, clicks: 1 }, { id: "b", eng: 0, clicks: 9 }, { id: "c", eng: 12 }, { id: "d", eng: 5, clicks: 4 }];
    expect(topEngaged(posts, 3).map((x) => x.id)).toEqual(["c", "d", "a"]);
    expect(sumClicks(posts)).toBe(14);
    expect(sumClicks(null)).toBe(null);
  });
  it("ngày cuối page có số (hôm nay Facebook chưa chốt = 0)", () => {
    expect(pageLastDate([{ date: "2026-11-09", views: 10 }, { date: "2026-11-10", views: 0, reach: 0 }])).toBe("2026-11-09");
  });
});

describe("kiểm đủ số trước khi gửi báo cáo khách", () => {
  const P = { since: "2026-10-12", until: "2026-11-10" };
  const base = { jobs: [{ id: "j", category: "Seo", status: "doing" }], revenue: 5e6, ads: [], webs: [], pages: [] };
  const data = { at: 1, errors: [] };
  it("đủ số khi web + page phủ hết kỳ (Google trễ ≤3 ngày vẫn tính đủ)", () => {
    const r = { ...base, webs: [{ clicks: 10, impressions: 100, hasGsc: true, gscFirst: "2026-10-12", gscLast: "2026-11-08" }], pages: [{ reach: 50, first: "2026-10-12", last: "2026-11-10" }] };
    const c = reportCompleteness(r, data, P);
    expect(c.bad).toEqual([]);
    expect(c.total).toBe(4); // Doanh thu, Website, SEO, Fanpage
    expect(completenessText(c)).toBe("Đủ số các kênh");
  });
  it("liệt kê kênh thiếu: fanpage không có số, SEO chỉ tới giữa kỳ, chưa có đợt thu", () => {
    const r = { ...base, revenue: 0, webs: [{ clicks: 10, impressions: 100, hasGsc: true, gscFirst: "2026-10-12", gscLast: "2026-11-01" }], pages: [{ reach: null }] };
    const c = reportCompleteness(r, data, P);
    expect(completenessText(c)).toBe("Thiếu số: Doanh thu, Website, SEO, Fanpage");
    expect(c.bad.find((x) => x.key === "seo")).toMatchObject({ status: "partial", note: "số tới 01/11" });
    expect(c.bad.find((x) => x.key === "fp").status).toBe("missing");
  });
  it("job SEO mà chưa gắn web → báo thiếu; kênh lỗi → báo lỗi; web mới có số giữa kỳ → 'số từ'", () => {
    expect(reportCompleteness(base, data, P).bad.map((x) => x.key)).toEqual(["seo"]);
    const err = reportCompleteness({ ...base, webs: [{ clicks: 1, impressions: 1, hasGsc: true }] }, { at: 1, errors: ["Website: mất mạng"] }, P);
    expect(err.bad.find((x) => x.key === "web").note).toBe("lỗi lấy số");
    const late = reportCompleteness({ ...base, webs: [{ clicks: 1, impressions: 1, hasGsc: true, gscFirst: "2026-10-25", gscLast: "2026-11-09" }] }, data, P);
    expect(late.bad.find((x) => x.key === "seo").note).toBe("số từ 25/10");
  });
  it("chưa tải số → mọi kênh đang dùng là 'đang lấy số'", () => {
    const c = reportCompleteness({ ...base, pages: [{ reach: 1 }] }, null, P);
    expect(c.loaded).toBe(false);
    expect(c.bad.map((x) => x.note)).toEqual(["đang lấy số", "đang lấy số"]);
  });
});
