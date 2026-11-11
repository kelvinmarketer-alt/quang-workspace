// Mở các khối mới (11/11) với số giả: Thương hiệu 360 (đủ số), Fanpage chi tiết (so kỳ trước + bài top), Website chi tiết (Số tới ngày)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { makeData } from "./fixture.js";

const DATA = makeData();
vi.mock("../src/lib/store.jsx", () => ({ useData: () => DATA, DataProvider: ({ children }) => children }));

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
vi.mock("../src/lib/reports.js", async (orig) => {
  const m = await orig();
  const data = { at: 1, errors: [], ads: [], web: [{ domain: "thuonghieua.vn", clicks: 30, prevClicks: 40, impressions: 900, prevImpressions: 800, position: 8, users: 50, conv: 2, daily: [], verdict: "warn", hasGsc: true, hasGa: true, gscFirst: day(-30), gscLast: day(-12) }],
    pages: [{ id: "pg", name: "Thương hiệu A Page", reach: null, messages: null }] };
  return { ...m, useReportData: () => ({ data, loading: false, period: m.reportPeriod(30), reload() {} }) };
});
vi.mock("../src/lib/fbPages.js", async (orig) => {
  const m = await orig();
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return { ...m,
    listPages: async () => ({ pages: [{ page_id: "1", name: "Page A", category: "Shop" }], conns: 1 }),
    loadPageSummary: async () => ({ id: "1", errors: [], cur: { reach: 1200, engagement: 60, er: 5, messages: 9, views: 2000, follows: 3, unfollows: 1, netFollows: 2, followers: 500, pageViews: 10, videoViews: 4 },
      prev: { reach: 1000, engagement: 80, er: 8, messages: 4, views: 1500, pageViews: 8, videoViews: 3 }, daily: [{ date: d(-2), views: 5, reach: 4, engagement: 1, messages: 0 }], last: d(-2), verdict: { key: "flat", label: "Ổn định", tone: "sky" } }),
    loadPagePosts: async () => ({ posts: [{ id: "x", text: "Bài hay", url: "#", type: "Ảnh", at: new Date().toISOString(), reach: 300, views: 400, clicks: 7, reactions: 10, comments: 3, shares: 1, eng: 14, er: 7 }],
      perWeek: 1, avgReach: 300, avgEng: 14, byType: [], bySlot: [], byDow: [] }),
  };
});
vi.mock("../src/lib/google.js", async (orig) => ({ ...(await orig()),
  listGoogleProps: async () => ({ props: [{ kind: "gsc", prop_id: "sc-domain:a.vn" }], conn: null }),
  gscQuery: async () => [{ keys: [day(-5)], clicks: 3, impressions: 40, ctr: 7, position: 5 }],
  gaReport: async () => [],
}));

afterEach(cleanup);
async function mount(el, path) {
  let r;
  await act(async () => { r = render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 60)); });
  return r;
}

describe("khối mới hiển thị đúng", () => {
  it("Thương hiệu 360: chỉ báo thiếu số Fanpage + SEO chưa phủ hết kỳ", async () => {
    const C = (await import("../src/pages/Reports.jsx")).default;
    const { container } = await mount(<Routes><Route path="/bao-cao/:id" element={<C />} /></Routes>, "/bao-cao/c1");
    expect(container.textContent).toMatch(/Thiếu số: .*SEO.*Fanpage/);
    expect(container.textContent).toContain("chưa có số trong kỳ");
  });
  it("Fanpage chi tiết: so kỳ trước + bài kéo tương tác nhất", async () => {
    const C = (await import("../src/pages/Fanpage.jsx")).default;
    const { container } = await mount(<C />, "/fanpage?page=1");
    expect(container.ownerDocument.body.textContent).toContain("So với kỳ trước");
    expect(container.ownerDocument.body.textContent).toContain("Bài kéo tương tác nhất");
    expect(container.ownerDocument.body.textContent).toContain("Bài hay");
    expect(container.ownerDocument.body.textContent).toContain("−3,0 điểm");
  });
  it("Website chi tiết: hiện 'Số tới ngày' theo ngày có trong dữ liệu", async () => {
    const C = (await import("../src/pages/Web.jsx")).default;
    const { container } = await mount(<C />, "/website?site=a.vn");
    const dd = day(-5);
    expect(container.ownerDocument.body.textContent).toContain(`Số tới ngày Google ${dd.slice(8, 10)}/${dd.slice(5, 7)}`);
  });
});
