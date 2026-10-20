// PHÁT HÀNH bản bot lên web của app (boss.2bkin.io.vn/bot-release) → máy chạy bot tự cập nhật KHÔNG cần token GitHub.
// Chạy: npm run release (sau khi đã commit + push). Ghi vào ../quang-workspace/public/bot-release, rồi build + deploy app như thường.
// - Bắt buộc cây git sạch; nội dung lấy từ đúng commit HEAD (git blob) → mã kiểm tra trùng với GitHub.
// - Bỏ data/, node_modules/, windows/run-bot.cmd và mọi file/thư mục bắt đầu bằng "." (.env, .gitignore…).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.resolve(ROOT, "../quang-workspace/public"), OUT = path.join(PUB, "bot-release");
const git = (args, enc = "utf8") => execFileSync("git", args, { cwd: ROOT, encoding: enc, maxBuffer: 256 * 1024 * 1024 });
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };
const blobSha = (buf) => crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");
const SKIP = (p) => p.startsWith("data/") || p.startsWith("node_modules/") || p === "windows/run-bot.cmd" || p.split("/").some((x) => x.startsWith("."));

if (!fs.existsSync(PUB)) die(`Không thấy thư mục app ${PUB}`);
const dirty = git(["status", "--porcelain"]).trim();
if (dirty) die(`Còn thay đổi chưa commit trong qws-live-bot — commit (và push) trước khi phát hành:\n${dirty}`);
const sha = git(["rev-parse", "HEAD"]).trim(), date = git(["log", "-1", "--format=%cI"]).trim(), msg = git(["log", "-1", "--format=%s"]).trim();
try { if (git(["rev-parse", "@{u}"]).trim() !== sha) console.log("⚠ HEAD khác nhánh trên GitHub (chưa push hoặc chưa pull) — nên push trước khi phát hành"); } catch { /* chưa có nhánh theo dõi */ }

// git ls-files -s -z: "<mode> <blob sha> <stage>\t<path>\0" — cây sạch nên index = HEAD
const files = [];
for (const rec of git(["ls-files", "-s", "-z"]).split("\0").filter(Boolean)) {
  const [meta, p] = [rec.slice(0, rec.indexOf("\t")), rec.slice(rec.indexOf("\t") + 1)];
  const [mode, blob] = meta.split(" ");
  if (SKIP(p) || mode === "160000") continue; // bỏ submodule
  const buf = git(["cat-file", "blob", blob], "buffer");
  if (blobSha(buf) !== blob) die(`Mã kiểm tra lệch ở ${p}`);
  files.push({ path: p, sha: blob, buf });
}
if (!files.some((f) => f.path === "bot.js") || !files.some((f) => f.path === "lib/main.js")) die("Thiếu bot.js / lib/main.js — sai thư mục?");

fs.rmSync(OUT, { recursive: true, force: true }); // xoá bản phát hành cũ
for (const f of files) { const dst = path.join(OUT, "files", f.path); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, f.buf); }
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ sha, date, msg, files: files.map(({ path: p, sha: s }) => ({ path: p, sha: s })) }, null, 2));
console.log(`✅ Đã phát hành bản ${sha.slice(0, 7)} (${files.length} file) → ${path.relative(process.cwd(), OUT) || OUT}\n   "${msg}"\n   Bước tiếp: build + deploy app Quang Workspace để máy chạy bot nhận bản mới (≤5 phút).`);
