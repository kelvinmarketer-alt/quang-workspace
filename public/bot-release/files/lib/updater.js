// TỰ CẬP NHẬT. Nguồn chính "site": bản phát hành trên web của app (boss.2bkin.io.vn/bot-release, tạo bằng `npm run release`) — KHÔNG cần token.
// Web lỗi + có token GitHub CHỈ ĐỌC (nhập trong app hoặc GITHUB_TOKEN) → dự phòng tải từ GitHub (repo riêng tư).
// - Kiểm tra 5 phút/lần (hoặc khi bấm "Cập nhật ngay" trong app): bản mới → chỉ tải các file đã đổi, mỗi file phải khớp mã kiểm tra (git blob sha).
// - File .js phải qua `node --check` mới được thay. Thay xong → thoát, vòng chạy (run-bot.cmd) khởi động lại bản mới.
// - Bản mới khởi động lỗi 3 lần liên tiếp → TỰ QUAY VỀ bản cũ và bỏ qua bản lỗi đó.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = "kelvinmarketer-alt/qws-live-bot", BRANCH = "main";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VER_F = path.join(ROOT, "data/version.json"), PEND_F = path.join(ROOT, "data/update-pending.json"), BAD_F = path.join(ROOT, "data/update-bad.json");
const SITE = "https://boss.2bkin.io.vn/bot-release";
const SKIP = (p) => p.startsWith("data/") || p === ".env" || p.startsWith("node_modules/") || p === "windows/run-bot.cmd";
const SAFE = (p) => typeof p === "string" && p !== "" && !p.startsWith("/") && !p.includes("\\") && !p.includes(":") && !p.split("/").some((x) => x === "" || x === "." || x === ".."); // chặn ghi ra ngoài thư mục bot
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJ = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const blobSha = (buf) => crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");

export const version = () => readJ(VER_F, { sha: null });
export let rolledBack = null; // bản cập nhật vừa bị quay về (để main báo về điện thoại)
let lastCheck = 0, lastError = null, latest = null;
export const updateInfo = () => ({ ...version(), lastCheck, error: lastError, latest });

// Gọi SỚM khi khởi động: đang chờ xác nhận bản mới → đếm lần khởi động; quá 3 lần (bản mới lỗi) → quay về bản cũ
export function bootGuard(log = console.log) {
  const p = readJ(PEND_F, null); if (!p) return;
  p.attempts = (p.attempts || 0) + 1; writeJ(PEND_F, p);
  if (p.attempts <= 3) return;
  log(`⚠ Bản cập nhật ${p.sha.slice(0, 7)} khởi động lỗi ${p.attempts - 1} lần → quay về bản cũ`);
  for (const f of p.files || []) {
    const bak = path.join(p.backupDir, f), dst = path.join(ROOT, f);
    if (fs.existsSync(bak)) fs.copyFileSync(bak, dst); else if (fs.existsSync(dst)) fs.unlinkSync(dst); // file mới thêm → bỏ
  }
  writeJ(VER_F, p.prev || { sha: null });
  writeJ(BAD_F, { ...readJ(BAD_F, {}), [p.sha]: Date.now() });
  fs.unlinkSync(PEND_F);
  rolledBack = p;
}
// Gọi sau 1 vòng chạy thành công → bản mới chạy tốt (trả về thông tin bản vừa cài, không có → null)
export function markHealthy(log = console.log) {
  const p = readJ(PEND_F, null); if (!p) return null;
  fs.unlinkSync(PEND_F); log(`✅ Bản cập nhật ${p.sha.slice(0, 7)} chạy tốt`);
  return p;
}

async function gh(token, url, raw) {
  const r = await fetch(`https://api.github.com${url}`, { headers: { Authorization: `Bearer ${token}`, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qws-live-bot" }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401 || r.status === 404) throw new Error(r.status === 401 ? "Token GitHub sai hoặc hết hạn" : "Token không có quyền đọc repo qws-live-bot");
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}
// Mỗi nguồn trả { latest, list() → [{path, sha}], get(file) → Buffer }
async function fromSite() {
  const r = await fetch(`${SITE}/manifest.json?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`web ${r.status}`);
  const m = await r.json().catch(() => null); // trang chưa có bản phát hành → web trả HTML
  if (!m || !/^[0-9a-f]{40}$/.test(m.sha || "") || !Array.isArray(m.files)) throw new Error("chưa có bản phát hành hợp lệ trên web");
  return {
    latest: { sha: m.sha, date: m.date || null, msg: m.msg || "", source: "site" },
    list: async () => m.files.map((f) => ({ path: f?.path, sha: f?.sha })),
    get: async (f) => {
      const x = await fetch(`${SITE}/files/${f.path.split("/").map(encodeURIComponent).join("/")}?t=${Date.now()}`, { signal: AbortSignal.timeout(60000) });
      if (!x.ok) throw new Error(`tải ${f.path}: web ${x.status}`);
      return Buffer.from(await x.arrayBuffer());
    },
  };
}
async function fromGithub(token) {
  const c = await gh(token, `/repos/${REPO}/commits/${BRANCH}`);
  return {
    latest: { sha: c.sha, date: c.commit.committer.date, msg: c.commit.message.split("\n")[0], source: "github" },
    list: async () => ((await gh(token, `/repos/${REPO}/git/trees/${c.sha}?recursive=1`)).tree || []).filter((it) => it.type === "blob").map((it) => ({ path: it.path, sha: it.sha })),
    get: async (f) => Buffer.from((await gh(token, `/repos/${REPO}/git/blobs/${f.sha}`)).content, "base64"),
  };
}
const fail = (msg, log) => { if (msg !== lastError) log(`Cập nhật: ${msg}`); lastError = msg; return false; }; // log 1 lần mỗi lỗi mới

// Trả về true nếu đã cập nhật (bot nên thoát để chạy bản mới). Ưu tiên web; web lỗi + có token → GitHub.
export async function checkUpdate(token, { force = false, log = console.log, intervalMs = 1800000 } = {}) {
  if (!force && Date.now() - lastCheck < intervalMs) return false;
  if (fs.existsSync(PEND_F)) return false; // đang chờ xác nhận bản vừa cập nhật
  lastCheck = Date.now();
  let src;
  try { src = await fromSite(); } catch (e) {
    if (!token) return fail(`không đọc được bản phát hành trên web (${e.message})`, log);
    try { src = await fromGithub(token); } catch (e2) { return fail(`web lỗi (${e.message}) · GitHub lỗi (${e2.message})`, log); }
  }
  let stage = null;
  try {
    latest = src.latest;
    const cur = version();
    if (latest.sha === cur.sha || readJ(BAD_F, {})[latest.sha]) { lastError = null; return false; }
    if (cur.date && latest.date && Date.parse(latest.date) < Date.parse(cur.date)) return fail(`bản trên ${latest.source === "site" ? "web" : "GitHub"} (${latest.sha.slice(0, 7)}) cũ hơn bản đang chạy — giữ nguyên`, log);
    const changed = [];
    for (const it of await src.list()) {
      if (!SAFE(it.path) || !/^[0-9a-f]{40}$/.test(it.sha || "")) throw new Error(`bản ${latest.sha.slice(0, 7)} có đường dẫn/mã file không hợp lệ: ${it.path}`);
      if (SKIP(it.path)) continue;
      const dst = path.join(ROOT, it.path);
      if (fs.existsSync(dst) && blobSha(fs.readFileSync(dst)) === it.sha) continue;
      changed.push(it);
    }
    lastError = null;
    if (!changed.length) { writeJ(VER_F, latest); return false; } // đã trùng nội dung, chỉ ghi phiên bản
    // tải về thư mục tạm + kiểm tra mã file + kiểm tra cú pháp
    stage = path.join(ROOT, `data/update-${latest.sha.slice(0, 7)}`);
    const backupDir = path.join(ROOT, `data/backup-${(cur.sha || "goc").slice(0, 7)}-${Date.now()}`);
    fs.rmSync(stage, { recursive: true, force: true });
    for (const it of changed) {
      const buf = await src.get(it);
      if (blobSha(buf) !== it.sha) throw new Error(`file ${it.path} tải về không khớp mã kiểm tra — thử lại lần sau`);
      const f = path.join(stage, it.path); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
      if (it.path.endsWith(".js") || it.path.endsWith(".mjs")) {
        const chk = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
        if (chk.status !== 0) { writeJ(BAD_F, { ...readJ(BAD_F, {}), [latest.sha]: Date.now() }); throw new Error(`bản ${latest.sha.slice(0, 7)} lỗi cú pháp ở ${it.path} — bỏ qua bản này`); }
      }
    }
    // sao lưu bản đang chạy → thay file
    for (const it of changed) {
      const dst = path.join(ROOT, it.path);
      if (fs.existsSync(dst)) { const b = path.join(backupDir, it.path); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(dst, b); }
    }
    for (const it of changed) { const dst = path.join(ROOT, it.path); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(stage, it.path), dst); }
    fs.rmSync(stage, { recursive: true, force: true });
    writeJ(PEND_F, { sha: latest.sha, msg: latest.msg, source: latest.source, prev: cur, files: changed.map((x) => x.path), backupDir, attempts: 0, at: Date.now() });
    writeJ(VER_F, latest);
    log(`⬆ Đã tải bản mới ${latest.sha.slice(0, 7)} từ ${latest.source === "site" ? "web" : "GitHub"} (${changed.length} file): ${latest.msg} → khởi động lại`);
    return true;
  } catch (e) { if (stage) fs.rmSync(stage, { recursive: true, force: true }); return fail(e.message, log); }
}
