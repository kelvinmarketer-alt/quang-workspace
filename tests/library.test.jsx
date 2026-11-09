// Kiểm thử KHO TÀI LIỆU (09/11): hàm thuần (tên, chữ thuần, cây thư mục, lọc không dấu, Markdown an toàn)
// + thao tác thật trên trang (mở thư mục, tìm, đọc trong khung cách ly, tải lên, xoá, tạo thư mục, chưa cài bảng).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import fs from "node:fs";
import { makeData } from "./fixture.js";
import { todayISO } from "../src/lib/format.js";

vi.mock("../src/lib/store.jsx", () => ({ useData: () => makeData(globalThis.__libOver || {}), DataProvider: ({ children }) => children }));
vi.mock("../src/lib/library.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    libLoad: vi.fn(), libGet: vi.fn(), libSearch: vi.fn(), libAddDoc: vi.fn(), libUpdateDoc: vi.fn(),
    libDeleteDoc: vi.fn(), libAddFolder: vi.fn(), libUpdateFolder: vi.fn(), libDeleteFolder: vi.fn(), libIndex: vi.fn(), libAsk: vi.fn(), libByCustomer: vi.fn(), libIdea: vi.fn(),
    libShares: vi.fn(), libShareCreate: vi.fn(), libShareSetExpiry: vi.fn(), libShareRevoke: vi.fn(), libSharedGet: vi.fn(),
  };
});
import * as L from "../src/lib/library.js";

// jsdom cũ chưa có Blob.text() → bù bằng FileReader
if (!File.prototype.text) File.prototype.text = function () { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsText(this); }); };

// ───────────── Hàm thuần ─────────────
describe("hàm thuần của kho tài liệu", () => {
  it("nhận loại file theo đuôi", () => {
    expect(L.detectKind("bao-cao.HTML")).toBe("html");
    expect(L.detectKind("ghi-chu.md")).toBe("md");
    expect(L.detectKind("a.txt")).toBe("txt");
    expect(L.detectKind("a.pdf")).toBe(null);
    expect(L.detectKind("a.exe")).toBe(null);
  });

  it("lấy tên từ <title>, <h1>, dòng # và tên file", () => {
    expect(L.extractTitle("html", "<html><head><title> Báo cáo &amp; Ads </title></head></html>", "x.html")).toBe("Báo cáo & Ads");
    expect(L.extractTitle("html", "<body><h1>Tên <b>đậm</b></h1></body>", "x.html")).toBe("Tên đậm");
    expect(L.extractTitle("html", "<p>không có</p>", "bao_cao-thang-10.html")).toBe("bao cao thang 10");
    expect(L.extractTitle("md", "mở đầu\n\n## Quản lý kho **tốt**\nnội dung", "n.md")).toBe("Quản lý kho tốt");
    expect(L.extractTitle("txt", "abc", "ghi-chu.txt")).toBe("ghi chu");
  });

  it("chữ thuần bỏ script, style, thẻ", () => {
    const p = L.toPlain("html", "<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><h1>Doanh thu</h1><p>tăng <b>20%</b></p></body></html>");
    expect(p).toContain("Doanh thu");
    expect(p).toContain("20%");
    expect(p).not.toMatch(/alert|color:red|</);
  });

  it("chữ thuần của Markdown bỏ ký hiệu nhưng giữ nội dung", () => {
    const p = L.toPlain("md", "# Kho\n\n> trích **đậm** và *nghiêng*\n\n- ý [link](https://x.com) một\n1. `mã` hai\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\ncode\n```");
    expect(p).toContain("Kho");
    expect(p).toContain("trích đậm và nghiêng");
    expect(p).toContain("ý link một");
    expect(p).toContain("mã hai");
    expect(p).toContain("code");
    expect(p).not.toMatch(/[*`#|>\]]|---|https:/);
  });

  it("cây thư mục: lồng nhau, đường đi, con cháu, đếm tài liệu", () => {
    const folders = [{ id: "a", name: "Gốc", parent_id: null }, { id: "b", name: "Con", parent_id: "a" }, { id: "c", name: "Cháu", parent_id: "b" }, { id: "z", name: "Khác", parent_id: null }];
    expect(L.buildTree(folders).map((n) => n.name)).toEqual(["Gốc", "Khác"]);
    expect(L.folderPath(folders, "c").map((f) => f.name)).toEqual(["Gốc", "Con", "Cháu"]);
    expect([...L.descendantIds(folders, "a")].sort()).toEqual(["a", "b", "c"]);
    expect(L.flattenTree(folders).map((f) => `${f.depth}:${f.name}`)).toEqual(["0:Gốc", "1:Con", "2:Cháu", "0:Khác"]);
    const docs = [{ folder_id: "c" }, { folder_id: "b" }, { folder_id: null }, { folder_id: "z" }];
    const c = L.countDocs(folders, docs);
    expect(c.total.get("a")).toBe(2);
    expect(c.total.get("b")).toBe(2);
    expect(c.total.get("c")).toBe(1);
    expect(c.none).toBe(1);
  });

  it("vòng lặp thư mục cha-con hỏng không làm treo", () => {
    const loop = [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }];
    expect(L.folderPath(loop, "a").length).toBe(2);
    expect(L.descendantIds(loop, "a").size).toBe(2);
  });

  it("lọc không phân biệt dấu + tìm toàn kho khi đang gõ", () => {
    const folders = [{ id: "f1", name: "A", parent_id: null }];
    const docs = [
      { id: "1", title: "Quản lý nhà hàng", tags: ["kế toán"], note: "", source: "a.html", folder_id: "f1" },
      { id: "2", title: "SEO cơ bản", tags: [], note: "học Đặc biệt", source: "b.md", folder_id: null },
    ];
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "quan ly" }).map((d) => d.id)).toEqual(["1"]);
    expect(L.filterDocs(docs, { folderId: "f1", folders, query: "dac biet" }).map((d) => d.id)).toEqual(["2"]); // tìm vượt ra ngoài thư mục đang mở
    expect(L.filterDocs(docs, { folderId: "f1", folders, query: "" }).map((d) => d.id)).toEqual(["1"]);
    expect(L.filterDocs(docs, { folderId: "none", folders, query: "" }).map((d) => d.id)).toEqual(["2"]);
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "zz", hits: new Map([["2", "x"]]) }).map((d) => d.id)).toEqual(["2"]); // kết quả tìm nội dung từ máy chủ
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "q" }).length).toBe(2); // 1 ký tự: chưa tìm
  });

  it("Markdown: tiêu đề, danh sách, bảng, in đậm, link — và KHÔNG chèn được thẻ lạ", () => {
    const html = L.renderMarkdown("# Tiêu đề\n\n- ý **một**\n- ý hai\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[web](https://x.com) và [xấu](javascript:alert(1))\n\n<script>alert(1)</script>\n\n![h](https://x.com/a.png)");
    expect(html).toContain("<h1>Tiêu đề</h1>");
    expect(html).toContain("<strong>một</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain('href="https://x.com"');
    expect(html).not.toMatch(/href="javascript/i); // link độc không thành link (chỉ còn là chữ vô hại)
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<img alt="h" src="https://x.com/a.png">');
  });

  it("khung đọc: HTML giữ nguyên, văn bản được escape", () => {
    expect(L.frameDoc("html", "<h1>Hi</h1>")).toContain("<h1>Hi</h1>");
    expect(L.frameDoc("txt", "<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(L.frameDoc("md", "# A")).toContain("<h1>A</h1>");
  });

  it("nhãn, dung lượng, sắp xếp", () => {
    expect(L.parseTags("kế toán, báo cáo ; kế toán\nexcel")).toEqual(["kế toán", "báo cáo", "excel"]);
    expect(L.fmtSize(500)).toBe("500 B");
    expect(L.fmtSize(2048)).toBe("2.0 KB");
    expect(L.fmtSize(5 * 1024 * 1024)).toBe("5.0 MB");
    const d = [{ title: "b", size_bytes: 1, updated_at: "2026-01-02" }, { title: "a", size_bytes: 9, updated_at: "2026-01-01" }];
    expect(L.sortDocs(d, "name")[0].title).toBe("a");
    expect(L.sortDocs(d, "size")[0].title).toBe("a");
    expect(L.sortDocs(d, "new")[0].title).toBe("b");
  });

  it("nhận biết bảng chưa cài", () => {
    expect(L.isMissingTable({ code: "PGRST205", message: "x" })).toBe(true);
    expect(L.isMissingTable({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(L.isMissingTable({ code: "500", message: "boom" })).toBe(false);
    expect(L.isMissingTable(null)).toBe(false);
  });
});

// ───────────── Trang ─────────────
let errors = [], spy;
const FOLDERS = [
  { id: "f1", parent_id: null, name: "Quản lý nhà hàng", color: "indigo" },
  { id: "f2", parent_id: "f1", name: "Nhân sự", color: "emerald" },
  { id: "f3", parent_id: null, name: "SEO", color: "amber" },
];
const DOCS = [
  { id: "d1", folder_id: "f1", customer_id: "c1", project_id: "p1", title: "Báo cáo tháng 10", kind: "html", size_bytes: 2048, tags: ["báo cáo"], note: "", source: "bc10.html", excerpt: "Doanh thu tăng", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-05T00:00:00Z" },
  { id: "d2", folder_id: "f2", title: "Ghi chú quản lý kho", kind: "md", size_bytes: 500, tags: [], note: "", source: "kho.md", excerpt: "", created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-04T00:00:00Z" },
  { id: "d3", folder_id: "f3", customer_id: "c2", project_id: null, title: "Hướng dẫn SEO", kind: "txt", size_bytes: 900, tags: [], note: "", source: "seo.txt", excerpt: "", created_at: "2026-11-03T00:00:00Z", updated_at: "2026-11-03T00:00:00Z" },
  { id: "d4", folder_id: null, title: "Ý tưởng rời rạc", kind: "md", size_bytes: 300, tags: [], note: "", source: null, excerpt: "", created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" },
];
beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...a) => { const m = String(a[0]?.message || a[0]); if (!/act\(|not wrapped|ReactDOMTestUtils/.test(m)) errors.push(m.slice(0, 300)); });
  L.libLoad.mockResolvedValue({ folders: FOLDERS, docs: DOCS, error: null });
  localStorage.clear();
  L.libIdea.mockResolvedValue({ data: { idea: null }, error: undefined });
  L.libSearch.mockResolvedValue({ data: [], error: null });
  L.libShares.mockResolvedValue({ data: [], error: null });
  L.libIndex.mockImplementation(async (ids) => ({ data: { results: ids.map((id) => ({ doc_id: id, ok: true, chunks: 3 })) } }));
  L.libAsk.mockResolvedValue({ data: { answer: "Kiểm kê mỗi tuần [1]. Hao hụt quá 3% phải giải trình [2].", sources: [{ n: 1, doc_id: "d2", title: "Ghi chú quản lý kho", excerpt: "kiểm kê", similarity: 0.8 }, { n: 2, doc_id: "d1", title: "Báo cáo tháng 10", excerpt: "hao hụt", similarity: 0.7 }], usage: { cost_usd: 0.0012 } } });
  L.libGet.mockImplementation(async (id) => ({ data: { ...DOCS.find((d) => d.id === id), content: "<h1>Xin chào</h1><script>window.parent.document.cookie</script>", plain: "Xin chào" }, error: null }));
});
afterEach(() => { spy.mockRestore(); cleanup(); vi.clearAllMocks(); });

async function mount(path = "/kho-tai-lieu") {
  const Page = (await import("../src/pages/Library.jsx")).default;
  let r;
  await act(async () => { r = render(<MemoryRouter initialEntries={[path]}><Suspense fallback={<div>đang tải</div>}><Page /></Suspense></MemoryRouter>); });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 30)); });
  return r;
}
const sleep = (ms) => act(async () => { await new Promise((ok) => setTimeout(ok, ms)); });
const cardTitles = () => [...document.querySelectorAll(".card .line-clamp-2.font-extrabold")].map((n) => n.textContent);

describe("trang Kho tài liệu", () => {
  it("thành viên được cấp quyền: chỉ XEM — không có nút tải lên / sửa / xoá / Hỏi AI, thẻ không kéo được", async () => {
    globalThis.__libOver = { isOwner: false, ownerId: "u1" };
    try {
      await mount();
      expect(screen.getByText(/Chỉ xem · 4 tài liệu/)).toBeTruthy();
      expect(cardTitles().length).toBe(4);
      expect(screen.queryByText("Tải file lên")).toBeNull();
      expect(screen.queryByText("Dán nội dung")).toBeNull();
      expect(screen.queryByText("Thư mục mới")).toBeNull();
      expect(screen.queryByText("Hỏi đáp AI")).toBeNull();
      expect(screen.queryByLabelText(/^Sửa /)).toBeNull();
      expect(screen.queryByLabelText(/^Xoá /)).toBeNull();
      expect(document.querySelector('[draggable="true"]')).toBeNull();
      expect(errors).toEqual([]);
    } finally { delete globalThis.__libOver; }
  });

  it("hiện tổng số, thư mục và đủ thẻ tài liệu", async () => {
    await mount();
    expect(screen.getByText(/4 tài liệu · 3 thư mục/)).toBeTruthy();
    expect(cardTitles().sort()).toEqual(["Báo cáo tháng 10", "Ghi chú quản lý kho", "Hướng dẫn SEO", "Ý tưởng rời rạc"].sort());
    expect(errors).toEqual([]);
  });

  it("bấm thư mục cha → thấy cả tài liệu của thư mục con; Chưa phân loại → chỉ tài liệu rời", async () => {
    const { container } = await mount();
    const aside = within(container.querySelector("aside"));
    await act(async () => { fireEvent.click(aside.getByText("Quản lý nhà hàng")); });
    expect(cardTitles().sort()).toEqual(["Báo cáo tháng 10", "Ghi chú quản lý kho"]);
    await act(async () => { fireEvent.click(aside.getByText("Chưa phân loại")); });
    expect(cardTitles()).toEqual(["Ý tưởng rời rạc"]);
    expect(errors).toEqual([]);
  });

  it("tìm không dấu theo tên; tìm trong nội dung hiện đoạn trích", async () => {
    await mount();
    const box = screen.getByLabelText("Tìm tài liệu");
    await act(async () => { fireEvent.change(box, { target: { value: "quan ly" } }); });
    expect(cardTitles()).toEqual(["Ghi chú quản lý kho"]);
    L.libSearch.mockResolvedValue({ data: [{ id: "d3", snippet: "…đoạn nội dung khớp từ khoá…" }], error: null });
    await act(async () => { fireEvent.change(box, { target: { value: "tu khoa hiem" } }); });
    await sleep(450);
    expect(cardTitles()).toEqual(["Hướng dẫn SEO"]);
    expect(screen.getByText(/đoạn nội dung khớp/)).toBeTruthy();
    expect(L.libSearch).toHaveBeenCalledWith("tu khoa hiem");
    expect(errors).toEqual([]);
  });

  it("mở đọc → khung CÁCH LY: có chạy mã nhưng KHÔNG cùng nguồn với app", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Báo cáo tháng 10")); });
    await sleep(30);
    const frame = document.querySelector("iframe");
    expect(frame).toBeTruthy();
    const sb = frame.getAttribute("sandbox");
    expect(sb).toContain("allow-scripts");
    expect(sb).not.toContain("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("Xin chào");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Đóng/ })); });
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("tải file HTML lên → tên lấy từ <title>, có chữ thuần, vào đúng thư mục đang mở", async () => {
    const { container } = await mount();
    L.libAddDoc.mockImplementation(async (row) => ({ data: { id: "n1", ...row, tags: [], note: "", excerpt: "", created_at: "2026-11-09T00:00:00Z", updated_at: "2026-11-09T00:00:00Z" }, error: null }));
    await act(async () => { fireEvent.click(within(container.querySelector("aside")).getByText("SEO")); });
    const input = screen.getByLabelText("Chọn file tải lên");
    const file = new File(["<html><head><title>Báo cáo ads tuần 1</title></head><body><p>Chi phí giảm</p><script>x()</script></body></html>"], "ads-t1.html", { type: "text/html" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await sleep(60);
    const row = L.libAddDoc.mock.calls[0][0];
    expect(row).toMatchObject({ title: "Báo cáo ads tuần 1", kind: "html", source: "ads-t1.html", folder_id: "f3" });
    expect(row.plain).toContain("Chi phí giảm");
    expect(row.plain).not.toContain("x()");
    expect(cardTitles()).toContain("Báo cáo ads tuần 1");
    expect(errors).toEqual([]);
  });

  it("file PDF / quá lớn bị từ chối bằng thông báo rõ ràng, không ghi gì", async () => {
    await mount();
    const input = screen.getByLabelText("Chọn file tải lên");
    const pdf = new File(["%PDF"], "tai-lieu.pdf", { type: "application/pdf" });
    await act(async () => { fireEvent.change(input, { target: { files: [pdf] } }); });
    await sleep(40);
    expect(screen.getByText(/PDF chưa hỗ trợ/)).toBeTruthy();
    expect(L.libAddDoc).not.toHaveBeenCalled();
  });

  it("file trùng (cùng tên + dung lượng, cùng thư mục) bị bỏ qua; khác thư mục thì vẫn thêm", async () => {
    const { container } = await mount();
    const input = screen.getByLabelText("Chọn file tải lên");
    const dup = () => new File(["x".repeat(2048)], "bc10.html", { type: "text/html" }); // giống d1 (nằm trong thư mục f1)
    L.libAddDoc.mockResolvedValue({ data: { id: "n2", title: "bc10", kind: "html", size_bytes: 2048, tags: [], created_at: "x", updated_at: "x" }, error: null });
    // đang xem "Tất cả" → tải vào thư mục rời → KHÔNG trùng d1 → được thêm
    await act(async () => { fireEvent.change(input, { target: { files: [dup()] } }); });
    await sleep(40);
    expect(L.libAddDoc).toHaveBeenCalledTimes(1);
    // mở đúng thư mục f1 rồi tải lại → trùng d1 → bỏ qua
    await act(async () => { fireEvent.click(within(container.querySelector("aside")).getByText("Quản lý nhà hàng")); });
    await act(async () => { fireEvent.change(input, { target: { files: [dup()] } }); });
    await sleep(40);
    expect(L.libAddDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Bỏ qua 1 file đã có/)).toBeTruthy();
  });

  it("xoá tài liệu: hỏi xác nhận rồi gỡ khỏi danh sách", async () => {
    await mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    L.libDeleteDoc.mockResolvedValue({ error: null });
    await act(async () => { fireEvent.click(screen.getByLabelText("Xoá Hướng dẫn SEO")); });
    await sleep(30);
    expect(L.libDeleteDoc).toHaveBeenCalledWith("d3");
    expect(cardTitles()).not.toContain("Hướng dẫn SEO");
  });

  it("tạo thư mục mới → được chọn ngay", async () => {
    await mount();
    L.libAddFolder.mockImplementation(async (row) => ({ data: { id: "f9", created_at: "x", ...row }, error: null }));
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Thư mục mới/ })[0]); });
    const name = screen.getByPlaceholderText(/Quản lý nhà hàng, SEO/);
    await act(async () => { fireEvent.change(name, { target: { value: "Marketing" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục" })); });
    await sleep(30);
    expect(L.libAddFolder).toHaveBeenCalledWith({ name: "Marketing", color: "indigo", parent_id: null });
    expect(screen.getAllByText("Marketing").length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it("không cho tạo thư mục trùng tên cùng cấp", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Thư mục mới/ })[0]); });
    await act(async () => { fireEvent.change(screen.getByPlaceholderText(/Quản lý nhà hàng, SEO/), { target: { value: "seo" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục" })); });
    expect(screen.getByText(/Đã có thư mục cùng tên/)).toBeTruthy();
    expect(L.libAddFolder).not.toHaveBeenCalled();
  });

  it("chưa chạy SQL → hướng dẫn cài, không sập", async () => {
    L.libLoad.mockResolvedValue({ folders: [], docs: [], error: { code: "PGRST205", message: "Could not find the table 'public.qws_lib_docs'" } });
    await mount();
    expect(screen.getByText(/chưa được cài đặt/)).toBeTruthy();
    expect(screen.getByText(/SETUP-LIBRARY\.sql/)).toBeTruthy();
    expect(errors).toEqual([]);
  });

  it("kho trống → có hướng dẫn bắt đầu", async () => {
    L.libLoad.mockResolvedValue({ folders: [], docs: [], error: null });
    await mount();
    expect(screen.getByText("Kho đang trống")).toBeTruthy();
  });
});

// ───────────── Hàm máy chủ qws-lib (phần thuần) ─────────────
const fnSrc = fs.readFileSync(`${process.cwd()}/supabase/functions/qws-lib/index.ts`, "utf8");
const pure = new Function(`${/\/\/ <pure>([\s\S]*?)\/\/ <\/pure>/.exec(fnSrc)[1]}\nreturn { chunkText, buildContext, isUuid, pickDocIds, cleanIdea, IDEA_PROMPT, SYSTEM_PROMPT };`)();

describe("hàm máy chủ qws-lib: cắt đoạn, nguồn, câu lệnh cho AI", () => {
  it("văn ngắn → 1 đoạn; rỗng → không có đoạn", () => {
    expect(pure.chunkText("Một câu ngắn.")).toEqual(["Một câu ngắn."]);
    expect(pure.chunkText("   \n\n ")).toEqual([]);
    expect(pure.chunkText(null)).toEqual([]);
  });

  it("văn dài: đoạn vừa cỡ, không mất nội dung, đoạn kế tiếp chồng lấn", () => {
    const paras = Array.from({ length: 40 }, (_, i) => `Mục ${i + 1}. ` + Array.from({ length: 12 }, (__, k) => `ý${i}_${k} nội dung thứ ${k}.`).join(" "));
    const chunks = pure.chunkText(paras.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) { expect(c.length).toBeLessThanOrEqual(1300); expect(c.trim().length).toBeGreaterThan(0); }
    const all = chunks.join("\n");
    for (let i = 1; i <= 40; i++) expect(all).toContain(`Mục ${i}.`); // không rơi mục nào
    for (let k = 1; k < chunks.length; k++) expect(chunks[k]).toContain(chunks[k - 1].slice(-40)); // chồng lấn: đuôi đoạn trước có mặt ở đầu đoạn sau
  });

  it("một câu cực dài không dấu chấm vẫn bị cắt nhỏ, giữ nguyên chữ có dấu", () => {
    const long = "đặc biệt ".repeat(900); // ~8100 ký tự
    const chunks = pure.chunkText(long);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1300);
    expect(chunks[0].startsWith("đặc biệt")).toBe(true);
  });

  it("giới hạn số đoạn tối đa", () => {
    const text = Array.from({ length: 3000 }, (_, i) => `Đoạn số ${i} ` + "x".repeat(900)).join("\n\n");
    expect(pure.chunkText(text, 1100, 150, 50).length).toBe(50);
  });

  it("bảng nguồn đánh số theo tài liệu xuất hiện đầu tiên, gộp đoạn cùng tài liệu", () => {
    const rows = [
      { doc_id: "B", doc_title: "Tài liệu B", folder_id: null, idx: 4, content: "b4", similarity: 0.9 },
      { doc_id: "A", doc_title: "Tài liệu A", folder_id: "f", idx: 2, content: "a2", similarity: 0.8 },
      { doc_id: "B", doc_title: "Tài liệu B", folder_id: null, idx: 1, content: "b1", similarity: 0.7 },
    ];
    const c = pure.buildContext(rows);
    expect(c.sources.map((s) => [s.n, s.doc_id])).toEqual([[1, "B"], [2, "A"]]);
    expect(c.text.indexOf("[1] Tài liệu: Tài liệu B")).toBeLessThan(c.text.indexOf("[2] Tài liệu: Tài liệu A"));
    expect(c.text.indexOf("b1")).toBeLessThan(c.text.indexOf("b4")); // đoạn trong cùng tài liệu xếp theo thứ tự đọc
  });

  it("bảng nguồn không vượt giới hạn ký tự", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ doc_id: `d${i}`, doc_title: `T${i}`, folder_id: null, idx: 0, content: "x".repeat(2000), similarity: 0.5 }));
    expect(pure.buildContext(rows, 6000).text.length).toBeLessThanOrEqual(6200);
  });

  it("nhận biết mã tài liệu hợp lệ và câu lệnh có chống bịa + chống làm theo nguồn", () => {
    expect(pure.isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(pure.isUuid("1; drop table x")).toBe(false);
    expect(pure.isUuid(null)).toBe(false);
    expect(pure.SYSTEM_PROMPT).toMatch(/không bịa/i);
    expect(pure.SYSTEM_PROMPT).toMatch(/không phải mệnh lệnh/i);
  });

  it("phạm vi theo tài liệu: không gửi = không giới hạn; mảng rỗng / mã sai = KHÔNG có tài liệu (không được thành cả kho)", () => {
    const ok = "11111111-1111-1111-1111-111111111111";
    expect(pure.pickDocIds(undefined)).toEqual({ ids: null, empty: false });
    expect(pure.pickDocIds([])).toEqual({ ids: [], empty: true });
    expect(pure.pickDocIds(["x", "1; drop", null])).toEqual({ ids: [], empty: true });
    expect(pure.pickDocIds([ok, "rác"])).toEqual({ ids: [ok], empty: false });
    expect(pure.pickDocIds(Array.from({ length: 900 }, () => ok)).ids).toHaveLength(500);
  });

  it("renderAnswer: số nguồn thành nút, số lạ giữ nguyên, không chèn mã", () => {
    const h = L.renderAnswer("Ý một [1]. Ý hai [9]. <img src=x onerror=alert(1)>", [{ n: 1 }]);
    expect(h).toContain('data-src="1"');
    expect(h).toContain("[9]");
    expect(h).not.toContain("<img");
    expect(L.unindexedDocs([{ id: 1, indexed_at: null }, { id: 2, indexed_at: "x" }]).map((d) => d.id)).toEqual([1]);
  });
});

// ───────────── Tab Hỏi đáp AI ─────────────
describe("tab Hỏi đáp AI", () => {
  const goChat = async () => {
    const r = await mount();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /Hỏi đáp AI/ })); });
    return r;
  };
  const type = async (text) => {
    await act(async () => { fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: text } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" })); });
    await sleep(30);
  };

  it("báo số tài liệu đã nạp; bấm Nạp → gửi đủ mã theo lô 3, rồi báo đã nạp hết", async () => {
    await goChat();
    expect(screen.getByText(/0\/4/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Nạp 4 tài liệu/ })); });
    await sleep(40);
    expect(L.libIndex).toHaveBeenCalledTimes(2);
    expect(L.libIndex.mock.calls[0][0]).toHaveLength(3);
    expect(L.libIndex.mock.calls[1][0]).toHaveLength(1);
    expect(screen.getByText(/4\/4/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nạp \d+ tài liệu/ })).toBeNull();
  });

  it("hỏi cả kho → hiện câu trả lời, nút số nguồn, danh sách nguồn; bấm nguồn mở đúng tài liệu", async () => {
    await goChat();
    await type("Quy trình kiểm kê thế nào?");
    expect(L.libAsk).toHaveBeenCalledTimes(1);
    const arg = L.libAsk.mock.calls[0][0];
    expect(arg.question).toBe("Quy trình kiểm kê thế nào?");
    expect(arg.folderIds).toBeUndefined();
    expect(arg.docId).toBeUndefined();
    expect(screen.getByText(/Kiểm kê mỗi tuần/)).toBeTruthy();
    expect(document.querySelectorAll("button[data-src]").length).toBe(2);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Ghi chú quản lý kho/ })[0]); });
    await sleep(30);
    expect(document.querySelector("iframe")).toBeTruthy();
    expect(L.libGet).toHaveBeenCalledWith("d2");
  });

  it("AI nói 'kho chưa có' (không trích nguồn) → không bày tài liệu gần nghĩa ra như thể đã dùng", async () => {
    L.libAsk.mockResolvedValue({ data: { answer: "Kho chưa có thông tin về điều này.", sources: [{ n: 1, doc_id: "d2", title: "Ghi chú quản lý kho", excerpt: "x", similarity: 0.2 }], usage: { cost_usd: 0.0001 } } });
    await goChat();
    await type("Hỏi điều không có");
    expect(screen.getByText(/Kho chưa có thông tin/)).toBeTruthy();
    expect(screen.getByText(/Không có tài liệu nào trong kho khớp/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ghi chú quản lý kho/ })).toBeNull();
  });

  it("chọn phạm vi một thư mục → chỉ gửi thư mục đó và thư mục con", async () => {
    await goChat();
    await act(async () => { fireEvent.change(screen.getByLabelText("Hỏi trong phạm vi"), { target: { value: "f:f1" } }); });
    await type("Nhân sự cần gì?");
    const ids = L.libAsk.mock.calls[0][0].folderIds.sort();
    expect(ids).toEqual(["f1", "f2"]);
  });

  it("câu hỏi nối tiếp gửi kèm lịch sử", async () => {
    await goChat();
    await type("Câu một");
    await type("Còn gì nữa?");
    const h = L.libAsk.mock.calls[1][0].history;
    expect(h.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h[0].content).toBe("Câu một");
  });

  it("lỗi từ máy chủ hiện rõ ràng, không sập", async () => {
    L.libAsk.mockResolvedValue({ error: "Chưa nhập API key OpenAI (Cài đặt → AI)." });
    await goChat();
    await type("Hỏi thử");
    expect(screen.getByText(/Chưa nhập API key OpenAI/)).toBeTruthy();
    expect(errors).toEqual([]);
  });

  it("từ thư mục bấm 'Hỏi AI trong thư mục' → sang tab hỏi đáp đúng phạm vi", async () => {
    const { container } = await mount();
    await act(async () => { fireEvent.click(within(container.querySelector("aside")).getByText("SEO")); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Hỏi AI trong thư mục/ })); });
    expect(screen.getByLabelText("Hỏi trong phạm vi").value).toBe("f:f3");
    await type("SEO là gì?");
    expect(L.libAsk.mock.calls[0][0].folderIds).toEqual(["f3"]);
  });

  it("từ trang đọc bấm 'Hỏi AI về tài liệu này' → hỏi riêng tài liệu đó", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Hướng dẫn SEO")); });
    await sleep(30);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Hỏi AI/ })); });
    await type("Tóm tắt giúp");
    expect(L.libAsk.mock.calls[0][0].docId).toBe("d3");
    expect(document.querySelector("iframe")).toBeNull(); // trang đọc đã đóng
  });

  it("lịch sử chat được nhớ trên máy và xoá được", async () => {
    await goChat();
    await type("Câu hỏi nhớ lại");
    cleanup();
    await goChat();
    expect(screen.getByText("Câu hỏi nhớ lại")).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Xoá chat/ })); });
    await sleep(20);
    expect(screen.queryByText("Câu hỏi nhớ lại")).toBeNull();
  });

  it("tải file lên xong tự nạp vào hỏi đáp; nạp lỗi thì báo, không mất tài liệu", async () => {
    await mount();
    L.libAddDoc.mockImplementation(async (row) => ({ data: { id: "n1", ...row, tags: [], note: "", excerpt: "", indexed_at: null, created_at: "x", updated_at: "x" }, error: null }));
    L.libIndex.mockResolvedValue({ error: "Hàm hỏi đáp (qws-lib) chưa được cài trên máy chủ." });
    const file = new File(["# Ghi chú mới\n\nnội dung"], "moi.md", { type: "text/markdown" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Chọn file tải lên"), { target: { files: [file] } }); });
    await sleep(60);
    expect(L.libIndex).toHaveBeenCalledWith(["n1"]);
    expect(screen.getByText(/qws-lib\) chưa được cài/)).toBeTruthy();
    expect(cardTitles()).toContain("Ghi chú mới");
  });
});

// ───────────── Gắn tài liệu với khách / dự án ─────────────
describe("gắn tài liệu với khách / dự án", () => {
  it("lọc theo khách: chỉ khách đó / chưa gắn khách / mọi khách; thẻ hiện tên khách", async () => {
    await mount();
    const sel = screen.getByLabelText("Lọc theo khách");
    expect(screen.getAllByText("Thương hiệu A").length).toBeGreaterThan(0); // chip trên thẻ
    await act(async () => { fireEvent.change(sel, { target: { value: "c1" } }); });
    expect(cardTitles()).toEqual(["Báo cáo tháng 10"]);
    await act(async () => { fireEvent.change(sel, { target: { value: "none" } }); });
    expect(cardTitles().sort()).toEqual(["Ghi chú quản lý kho", "Ý tưởng rời rạc"].sort());
    await act(async () => { fireEvent.change(sel, { target: { value: "all" } }); });
    expect(cardTitles()).toHaveLength(4);
  });

  it("hàm lọc: kết hợp với tìm kiếm và thư mục", () => {
    const folders = [{ id: "f1", parent_id: null }];
    const docs = [{ id: "1", title: "Báo cáo", folder_id: "f1", customer_id: "c1" }, { id: "2", title: "Báo cáo", folder_id: "f1", customer_id: "c2" }, { id: "3", title: "Báo cáo", folder_id: null, customer_id: null }];
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "bao cao", customerId: "c2" }).map((d) => d.id)).toEqual(["2"]);
    expect(L.filterDocs(docs, { folderId: "f1", folders, query: "", customerId: "c1" }).map((d) => d.id)).toEqual(["1"]);
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "", customerId: "none" }).map((d) => d.id)).toEqual(["3"]);
    expect(L.filterDocs(docs, { folderId: "all", folders, query: "" }).length).toBe(3);
  });

  it("sửa tài liệu: chọn khách → danh sách dự án của khách đó → lưu đúng; bỏ khách thì bỏ luôn dự án", async () => {
    await mount();
    L.libUpdateDoc.mockImplementation(async (id, patch) => ({ data: { ...DOCS.find((d) => d.id === id), ...patch }, error: null }));
    await act(async () => { fireEvent.click(screen.getByLabelText("Sửa Ghi chú quản lý kho")); });
    await sleep(30);
    const cust = screen.getByLabelText(/Thuộc khách/), proj = screen.getByLabelText("Dự án");
    expect(proj.disabled).toBe(true);
    await act(async () => { fireEvent.change(cust, { target: { value: "c2" } }); });
    const names = [...proj.options].map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(["ADS B", "Lương B"]));
    expect(names).not.toContain("Web A"); // dự án của khách khác không lẫn vào
    await act(async () => { fireEvent.change(proj, { target: { value: "p2" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Lưu" })); });
    await sleep(30);
    expect(L.libUpdateDoc.mock.calls[0][1]).toMatchObject({ customer_id: "c2", project_id: "p2" });
    // mở lại, bỏ khách → dự án cũng bị bỏ
    cleanup();
    await mount();
    await act(async () => { fireEvent.click(screen.getByLabelText("Sửa Báo cáo tháng 10")); });
    await sleep(30);
    await act(async () => { fireEvent.change(screen.getByLabelText(/Thuộc khách/), { target: { value: "" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Lưu" })); });
    await sleep(30);
    expect(L.libUpdateDoc.mock.calls.at(-1)[1]).toMatchObject({ customer_id: null, project_id: null });
  });

  it("đang lọc 1 khách mà tải file lên → tài liệu mới gắn luôn khách đó", async () => {
    await mount();
    L.libAddDoc.mockImplementation(async (row) => ({ data: { id: "n9", ...row, tags: [], note: "", excerpt: "", indexed_at: null, created_at: "x", updated_at: "x" }, error: null }));
    await act(async () => { fireEvent.change(screen.getByLabelText("Lọc theo khách"), { target: { value: "c2" } }); });
    const file = new File(["# Biên bản họp\n\nnội dung"], "hop.md", { type: "text/markdown" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Chọn file tải lên"), { target: { files: [file] } }); });
    await sleep(60);
    expect(L.libAddDoc.mock.calls.at(-1)[0]).toMatchObject({ title: "Biên bản họp", customer_id: "c2" });
  });

  it("mở từ thẻ khách: ?khach=<mã> lọc sẵn; ?doc=<mã> mở thẳng tài liệu", async () => {
    await mount("/kho-tai-lieu?khach=c2");
    expect(screen.getByLabelText("Lọc theo khách").value).toBe("c2");
    expect(cardTitles()).toEqual(["Hướng dẫn SEO"]);
    cleanup();
    await mount("/kho-tai-lieu?doc=d1");
    await sleep(40);
    expect(document.querySelector("iframe")).toBeTruthy();
    expect(L.libGet).toHaveBeenCalledWith("d1");
  });

  it("hỏi AI theo khách: phạm vi 'Theo khách' chỉ gửi mã các tài liệu của khách đó", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /Hỏi đáp AI/ })); });
    const scope = screen.getByLabelText("Hỏi trong phạm vi");
    expect([...scope.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(["Khách: Thương hiệu A (1)", "Khách: Thương hiệu B (1)"]));
    await act(async () => { fireEvent.change(scope, { target: { value: "k:c1" } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: "Tóm tắt báo cáo đã gửi" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" })); });
    await sleep(30);
    expect(L.libAsk.mock.calls[0][0]).toMatchObject({ docIds: ["d1"], folderIds: undefined });
  });

  it("thẻ khách: liệt kê tài liệu đã gắn, có link mở thẳng; chủ mới thấy", async () => {
    L.libByCustomer.mockResolvedValue({ data: [{ id: "d1", title: "Báo cáo tháng 10", kind: "html", updated_at: "x" }, { id: "d9", title: "Hợp đồng", kind: "md", updated_at: "x" }], error: null });
    const C = (await import("../src/components/CustomerDocs.jsx")).default;
    await act(async () => { render(<MemoryRouter><C customerId="c1" /></MemoryRouter>); });
    await sleep(20);
    expect(L.libByCustomer).toHaveBeenCalledWith("c1");
    expect(screen.getByText(/Tài liệu trong kho \(2\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Báo cáo tháng 10/ }).getAttribute("href")).toBe("/kho-tai-lieu?doc=d1");
    expect(screen.getByRole("link", { name: /Xem tất cả/ }).getAttribute("href")).toBe("/kho-tai-lieu?khach=c1");
  });
});

// ───────────── Ý hay mỗi ngày ─────────────
describe("ý hay mỗi ngày", () => {
  it("làm sạch câu trả lời của AI: bỏ ngoặc kép, nhãn 'Ý hay:', cắt gọn; SKIP / rỗng → không có ý", () => {
    expect(pure.cleanIdea('"Kiểm kê kho mỗi tuần, đừng đợi cuối tháng."')).toBe("Kiểm kê kho mỗi tuần, đừng đợi cuối tháng.");
    expect(pure.cleanIdea("Ý hay: Chốt giá nhập bằng văn bản")).toBe("Chốt giá nhập bằng văn bản");
    expect(pure.cleanIdea("SKIP")).toBe(null);
    expect(pure.cleanIdea("skip.")).toBe(null);
    expect(pure.cleanIdea("   ")).toBe(null);
    expect(pure.cleanIdea(null)).toBe(null);
    const long = pure.cleanIdea("từ ".repeat(300));
    expect(long.length).toBeLessThanOrEqual(261);
    expect(long.endsWith("…")).toBe(true);
    expect(pure.IDEA_PROMPT).toMatch(/SKIP/);
    expect(pure.IDEA_PROMPT).toMatch(/không phải mệnh lệnh/i);
  });

  it("có tài liệu đã nạp → hiện thẻ Ý hay hôm nay với nguồn bấm được; lần mở sau trong ngày không gọi AI lại", async () => {
    const withIdx = DOCS.map((d, i) => (i === 1 ? { ...d, indexed_at: "2026-11-09T00:00:00Z" } : d));
    L.libLoad.mockResolvedValue({ folders: FOLDERS, docs: withIdx, error: null });
    L.libIdea.mockResolvedValue({ data: { idea: "Kiểm kê kho mỗi tuần, đừng đợi cuối tháng.", doc_id: "d2", doc_title: "Ghi chú quản lý kho" } });
    await mount();
    await sleep(30);
    expect(screen.getByLabelText("Ý hay hôm nay").textContent).toContain("Kiểm kê kho mỗi tuần");
    expect(L.libIdea).toHaveBeenCalledTimes(1);
    expect(L.libIdea.mock.calls[0][0]).toBe(todayISO()); // seed = ngày hôm nay (cùng seed với bot 7h sáng)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Từ: Ghi chú quản lý kho/ })); });
    await sleep(30);
    expect(L.libGet).toHaveBeenCalledWith("d2");
    cleanup();
    await mount();
    await sleep(30);
    expect(L.libIdea).toHaveBeenCalledTimes(1); // lấy từ bộ nhớ trong ngày
    expect(screen.getByLabelText("Ý hay hôm nay")).toBeTruthy();
  });

  it("xoá tài liệu nguồn của ý đang hiện → bỏ ý đó và bản nhớ trong ngày, lấy ý khác (lỗi thấy trên app thật)", async () => {
    const withIdx = DOCS.map((d) => ({ ...d, indexed_at: "2026-11-09T00:00:00Z" }));
    L.libLoad.mockResolvedValue({ folders: FOLDERS, docs: withIdx, error: null });
    L.libIdea.mockResolvedValueOnce({ data: { idea: "Ý từ tài liệu sắp xoá.", doc_id: "d3", doc_title: "Hướng dẫn SEO" } }).mockResolvedValueOnce({ data: { idea: "Ý từ tài liệu còn lại.", doc_id: "d2", doc_title: "Ghi chú quản lý kho" } });
    await mount();
    await sleep(30);
    expect(screen.getByLabelText("Ý hay hôm nay").textContent).toContain("Ý từ tài liệu sắp xoá.");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    L.libDeleteDoc.mockResolvedValue({ error: null });
    await act(async () => { fireEvent.click(screen.getByLabelText("Xoá Hướng dẫn SEO")); });
    await sleep(60);
    const card = screen.getByLabelText("Ý hay hôm nay");
    expect(card.textContent).not.toContain("sắp xoá");
    expect(card.textContent).toContain("Ý từ tài liệu còn lại.");
    expect(localStorage.getItem(`qws_lib_idea:${todayISO()}`)).toContain("còn lại"); // bản nhớ là ý mới, không phải ý của tài liệu đã xoá
  });

  it("'Đổi ý khác' gọi với seed khác; chưa có tài liệu nào được nạp → không gọi AI, không hiện thẻ", async () => {
    L.libLoad.mockResolvedValue({ folders: FOLDERS, docs: DOCS.map((d) => ({ ...d, indexed_at: "2026-11-09T00:00:00Z" })), error: null });
    L.libIdea.mockResolvedValueOnce({ data: { idea: "Ý thứ nhất.", doc_id: "d2", doc_title: "Ghi chú" } }).mockResolvedValueOnce({ data: { idea: "Ý thứ hai.", doc_id: "d1", doc_title: "Báo cáo" } });
    await mount();
    await sleep(30);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Đổi ý khác/ })); });
    await sleep(30);
    expect(L.libIdea.mock.calls[1][0]).toBe(`${todayISO()}#1`);
    expect(screen.getByLabelText("Ý hay hôm nay").textContent).toContain("Ý thứ hai.");
    cleanup(); localStorage.clear(); L.libIdea.mockClear();
    L.libLoad.mockResolvedValue({ folders: FOLDERS, docs: DOCS, error: null }); // không tài liệu nào có indexed_at
    await mount();
    await sleep(30);
    expect(L.libIdea).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Ý hay hôm nay")).toBeNull();
  });
});


// ───────────── Chia sẻ bằng link online (09/11) ─────────────
describe("chia sẻ tài liệu bằng link", () => {
  it("hàm thuần: mã 43 ký tự an toàn cho URL, không trùng; hạn dùng; link /xem/<mã>", () => {
    const a = L.newShareToken(), b = L.newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    const now = Date.UTC(2026, 10, 9);
    expect(L.shareExpiresAt(null, now)).toBe(null);
    expect(L.shareExpiresAt(7, now)).toBe(new Date(now + 7 * 86400000).toISOString());
    expect(L.shareExpired({ expires_at: new Date(now - 1000).toISOString() }, now)).toBe(true);
    expect(L.shareExpired({ expires_at: new Date(now + 1000).toISOString() }, now)).toBe(false);
    expect(L.shareExpired({ expires_at: null }, now)).toBe(false);
    expect(L.shareUrl("abc", "https://boss.2bkin.io.vn")).toBe("https://boss.2bkin.io.vn/xem/abc");
  });

  it("chủ: bấm Chia sẻ → chọn hạn → tạo link, hiện link /xem/… + nút sao chép; tắt chia sẻ gọi xoá", async () => {
    const TOK = "T".repeat(43);
    L.libShares.mockResolvedValue({ data: [], error: null });
    L.libShareCreate.mockResolvedValue({ data: { id: "s1", doc_id: "d1", token: TOK, expires_at: null, views: 0, last_view_at: null }, error: null });
    L.libShareRevoke.mockResolvedValue({ error: null });
    await mount();
    await act(async () => { fireEvent.click(screen.getAllByLabelText(/^Chia sẻ /)[0]); });
    expect(screen.getByText("Tạo link chia sẻ")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("Tạo link chia sẻ")); });
    expect(L.libShareCreate).toHaveBeenCalledTimes(1);
    const input = document.getElementById("lib-share-url");
    expect(input.value).toBe(`${window.location.origin}/xem/${TOK}`);
    expect(screen.getByText("Sao chép")).toBeTruthy();
    expect(screen.getByText(/0 lượt mở/)).toBeTruthy();
    expect(errors).toEqual([]);
  });

  it("chưa chạy SQL chia sẻ → báo cách cài, không sập", async () => {
    L.libShares.mockResolvedValue({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    L.libShareCreate.mockResolvedValue({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    await mount();
    await act(async () => { fireEvent.click(screen.getAllByLabelText(/^Chia sẻ /)[0]); });
    await act(async () => { fireEvent.click(screen.getByText("Tạo link chia sẻ")); });
    expect(screen.getByText(/SETUP-LIBRARY-SHARE\.sql/)).toBeTruthy();
    expect(errors).toEqual([]);
  });

  it("trang công khai /xem/<mã>: có tài liệu → khung cách ly (không allow-same-origin); mã sai/hết hạn → báo không dùng được", async () => {
    const { default: Shared, sharedToken } = await import("../src/pages/SharedDoc.jsx");
    const TOK = "A".repeat(40);
    expect(sharedToken(`/xem/${TOK}`)).toBe(TOK);
    expect(sharedToken("/xem/ngan")).toBe(null);
    expect(sharedToken("/kho-tai-lieu")).toBe(null);
    L.libSharedGet.mockResolvedValue({ data: [{ title: "Báo cáo chia sẻ", kind: "md", content: "# Xin chào", updated_at: "2026-11-09T01:00:00Z" }], error: null });
    let r; await act(async () => { r = render(<Shared token={TOK} />); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    expect(screen.getByText("Báo cáo chia sẻ")).toBeTruthy();
    const f = document.querySelector("iframe");
    expect(f.getAttribute("sandbox")).toContain("allow-scripts");
    expect(f.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(f.getAttribute("srcdoc")).toContain("Xin chào");
    r.unmount(); cleanup();
    L.libSharedGet.mockResolvedValue({ data: [], error: null });
    await act(async () => { render(<Shared token={TOK} />); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    expect(screen.getByText(/Link này không còn dùng được/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("thành viên chỉ xem: không có nút Chia sẻ", async () => {
    globalThis.__libOver = { isOwner: false, ownerId: "u1" };
    try { await mount(); expect(screen.queryByLabelText(/^Chia sẻ /)).toBeNull(); } finally { delete globalThis.__libOver; }
  });
});
