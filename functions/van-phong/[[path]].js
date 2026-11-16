// 16/11/2026 gộp Văn phòng AI vào Quang Workspace: boss.2bkin.io.vn/van-phong/* lấy từ bản Văn phòng AI (Pages project "ai-office",
// build với base /van-phong/). Cùng tên miền → chung đăng nhập, chung app trên màn hình chính, chung thông báo.
// Code Văn phòng AI vẫn ở repo riêng (ai-office) để sau đóng gói bán cho khách.
const PROD = "https://ai-office-78c.pages.dev";
// Bản thử: <nhánh>.quang-workspace.pages.dev → <nhánh>.ai-office-78c.pages.dev (cùng tên nhánh 2 repo)
const originFor = (host) => {
  const m = host.match(/^([a-z0-9-]+)\.quang-workspace\.pages\.dev$/);
  return m && !/^[0-9a-f]{8}$/.test(m[1]) ? `https://${m[1]}.ai-office-78c.pages.dev` : PROD;
};

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (url.pathname === "/van-phong") return Response.redirect(`${url.origin}/van-phong/${url.search}`, 301);
  const target = originFor(url.hostname) + url.pathname + url.search;
  const res = await fetch(new Request(target, request), { redirect: "manual" });
  const out = new Response(res.body, res);
  // Văn phòng trả chuyển hướng tuyệt đối về tên miền của nó → đổi lại về tên miền đang mở
  const loc = res.headers.get("location");
  if (loc) { try { const l = new URL(loc, target); if (l.hostname.endsWith(".pages.dev")) out.headers.set("location", url.origin + l.pathname + l.search + l.hash); } catch { /* giữ nguyên */ } }
  return out;
}
