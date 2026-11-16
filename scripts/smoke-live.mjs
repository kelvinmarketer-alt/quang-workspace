// 16/11/2026 gộp Văn phòng AI: kiểm BẢN THẬT ngay sau khi đưa lên (GitHub Actions chạy sau bước deploy; tay: node scripts/smoke-live.mjs).
// Trượt → báo đỏ ở GitHub Actions. Cloudflare cần vài giây lan bản mới → mỗi mục thử lại tối đa 6 lần, cách 10 giây.
// Bản sao y hệt ở repo ai-office: web/scripts/smoke-live.mjs (sửa thì sửa cả 2).
const BOSS = process.env.SMOKE_BOSS || "https://boss.2bkin.io.vn";
const OFFICE = process.env.SMOKE_OFFICE || "https://office.2bkin.io.vn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { const r = await fetch(u, { redirect: "manual", headers: { "cache-control": "no-cache" } }); return { status: r.status, type: r.headers.get("content-type") || "", body: r.status < 300 ? await r.text() : "", loc: r.headers.get("location") }; };
const html = (r) => r.status === 200 && r.type.includes("text/html");

const checks = [
  ["Workspace mở được", async () => { const r = await get(`${BOSS}/`); return html(r) && r.body.includes('id="root"'); }],
  ["Văn phòng AI mở được ở /van-phong/", async () => { const r = await get(`${BOSS}/van-phong/`); return html(r) && /\/van-phong\/assets\/index-[\w-]+\.js/.test(r.body); }],
  ["File JS của văn phòng tải được (không bị trả nhầm HTML)", async () => {
    const r = await get(`${BOSS}/van-phong/`); const js = r.body.match(/\/van-phong\/assets\/index-[\w-]+\.js/)?.[0];
    if (!js) return false; const a = await get(`${BOSS}${js}`); return a.status === 200 && a.type.includes("javascript");
  }],
  ["Trang trong văn phòng (/van-phong/viec/…) mở được", async () => html(await get(`${BOSS}/van-phong/viec/kiem-tra`))],
  ["/van-phong (thiếu /) chuyển sang /van-phong/", async () => { const r = await get(`${BOSS}/van-phong`); return r.status === 301 && /\/van-phong\/$/.test(r.loc || ""); }],
  ["Link khách /t/ ở office.2bkin.io.vn mở tại chỗ", async () => { const r = await get(`${OFFICE}/t/kiem-tra`); return html(r) && /\/van-phong\/assets\//.test(r.body); }],
  ["Tên miền cũ office.2bkin.io.vn có lệnh tự chuyển sang boss/van-phong", async () => { const r = await get(`${OFFICE}/viec`); return html(r) && r.body.includes("https://boss.2bkin.io.vn/van-phong"); }],
];

let bad = 0;
for (const [name, fn] of checks) {
  let ok = false, err = "";
  for (let i = 0; i < 6 && !ok; i++) { try { ok = await fn(); } catch (e) { err = e.message; } if (!ok) await sleep(10_000); }
  console.log(`${ok ? "✅" : "❌"} ${name}${ok || !err ? "" : ` (${err})`}`);
  if (!ok) bad++;
}
console.log(bad ? `\n${bad} mục KHÔNG ĐẠT` : "\nBản thật: đạt hết");
process.exit(bad ? 1 : 0);
