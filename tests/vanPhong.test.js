// 16/11/2026 gộp Văn phòng AI: kiểm cầu nối /van-phong/* (Pages Function) + chuyển tài khoản chỉ thuộc văn phòng.
import { describe, it, expect, vi, afterEach } from "vitest";
import { onRequest, originFor } from "../functions/van-phong/[[path]].js";

const PROD = "https://ai-office-78c.pages.dev";
afterEach(() => vi.unstubAllGlobals());

describe("cầu nối /van-phong", () => {
  it("chọn đúng nguồn: bản thật / bản thử theo tên nhánh / link mã băm về bản thật", () => {
    expect(originFor("boss.2bkin.io.vn")).toBe(PROD);
    expect(originFor("quang-workspace.pages.dev")).toBe(PROD);
    expect(originFor("gop-dot-2.quang-workspace.pages.dev")).toBe("https://gop-dot-2.ai-office-78c.pages.dev");
    expect(originFor("1c83ebe3.quang-workspace.pages.dev")).toBe(PROD);
    expect(originFor("evil.example.com")).toBe(PROD);
  });
  it("/van-phong (thiếu /) → chuyển sang /van-phong/ giữ ?query", async () => {
    const r = await onRequest({ request: new Request("https://boss.2bkin.io.vn/van-phong?x=1") });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://boss.2bkin.io.vn/van-phong/?x=1");
  });
  it("lấy đúng đường dẫn từ bản Văn phòng AI, giữ nguyên nội dung + mã trạng thái", async () => {
    const f = vi.fn(async (req) => new Response(`ok ${new URL(req.url).pathname}`, { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", f);
    const r = await onRequest({ request: new Request("https://boss.2bkin.io.vn/van-phong/viec/abc?q=2") });
    expect(f.mock.calls[0][0].url).toBe(`${PROD}/van-phong/viec/abc?q=2`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok /van-phong/viec/abc");
  });
  it("chuyển hướng trả về tên miền pages.dev → đổi lại về tên miền đang mở", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { location: `${PROD}/van-phong/dang-nhap` } }));
    const r = await onRequest({ request: new Request("https://boss.2bkin.io.vn/van-phong/x") });
    expect(r.headers.get("location")).toBe("https://boss.2bkin.io.vn/van-phong/dang-nhap");
  });
});

describe("tài khoản chỉ thuộc Văn phòng AI", () => {
  const mk = (answers) => ({
    from: (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => answers[t] }), limit: async () => answers[t] }) }),
    rpc: async (n) => answers[n],
  });
  const load = async (answers) => {
    vi.resetModules();
    vi.doMock("../src/lib/supabase.js", () => ({ WORKSPACE_TABLE: "qws_workspaces", supabase: mk(answers) }));
    return (await import("../src/lib/officeOnly.js")).officeOnlyAccount;
  };
  const none = { data: null, error: null }, empty = { data: [], error: null };
  it("chủ Workspace → không chuyển", async () => {
    const f = await load({ qws_workspaces: { data: { user_id: "u" }, error: null } });
    expect(await f("u")).toBe(false);
  });
  it("thành viên Workspace → không chuyển", async () => {
    const f = await load({ qws_workspaces: none, qws_member_load: { data: [{ user_id: "o" }], error: null } });
    expect(await f("u")).toBe(false);
  });
  it("tài khoản phụ / nhân viên / khách của văn phòng → chuyển vào /van-phong", async () => {
    for (const k of ["office_my_membership", "office_staff_me", "office_clients"]) {
      const a = { qws_workspaces: none, qws_member_load: empty, office_my_membership: empty, office_staff_me: none, office_clients: empty };
      a[k] = k === "office_staff_me" ? { data: { name: "NV" }, error: null } : { data: [{ id: 1 }], error: null };
      const f = await load(a);
      expect(await f("u"), k).toBe(true);
    }
  });
  it("lỗi mạng ở bước nào cũng KHÔNG chuyển (không chặn nhầm chủ)", async () => {
    const err = { data: null, error: { message: "mất mạng" } };
    expect(await (await load({ qws_workspaces: err }))("u")).toBe(false);
    expect(await (await load({ qws_workspaces: none, qws_member_load: err }))("u")).toBe(false);
    expect(await (await load({ qws_workspaces: none, qws_member_load: empty, office_my_membership: err }))("u")).toBe(false);
  });
  it("tài khoản mới chưa thuộc đâu → giữ cách cũ (Workspace của mình)", async () => {
    const f = await load({ qws_workspaces: none, qws_member_load: empty, office_my_membership: empty, office_staff_me: none, office_clients: empty });
    expect(await f("u")).toBe(false);
  });
});
