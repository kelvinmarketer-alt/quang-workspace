// KHO TÀI LIỆU (09/11/2026) — thư mục + tài liệu HTML / Markdown / văn bản của chủ.
// Dữ liệu nằm ở 2 bảng riêng (qws_lib_folders, qws_lib_docs) — KHÔNG nhét vào khối dữ liệu chung của app vì file có thể vài MB.
// Cài bảng 1 lần: supabase/SETUP-LIBRARY.sql. Mọi hàm DB trả { data, error } như supabase-js.
import { supabase } from "./supabase.js";

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB / file
export const MAX_PLAIN_CHARS = 1_500_000;

export const KINDS = {
  html: { label: "HTML", tone: "sky" },
  md: { label: "Markdown", tone: "violet" },
  txt: { label: "Văn bản", tone: "slate" },
};

// Màu thư mục (class viết đủ để Tailwind quét được)
export const FOLDER_COLORS = {
  indigo: { dot: "bg-indigo-500", text: "text-indigo-600", soft: "bg-indigo-50" },
  sky: { dot: "bg-sky-500", text: "text-sky-600", soft: "bg-sky-50" },
  emerald: { dot: "bg-emerald-500", text: "text-emerald-600", soft: "bg-emerald-50" },
  amber: { dot: "bg-amber-500", text: "text-amber-600", soft: "bg-amber-50" },
  rose: { dot: "bg-rose-500", text: "text-rose-600", soft: "bg-rose-50" },
  violet: { dot: "bg-violet-500", text: "text-violet-600", soft: "bg-violet-50" },
  teal: { dot: "bg-teal-500", text: "text-teal-600", soft: "bg-teal-50" },
  slate: { dot: "bg-slate-500", text: "text-slate-600", soft: "bg-slate-100" },
};
export const FOLDER_COLOR_KEYS = Object.keys(FOLDER_COLORS);

// ───────────────────────── Hàm thuần (không gọi mạng) ─────────────────────────

// Bỏ dấu + chữ thường: "Quản Lý" → "quan ly"
export const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function fmtSize(b) {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Loại tài liệu theo đuôi file (hoặc loại MIME). Trả null nếu chưa hỗ trợ.
export function detectKind(filename, mime = "") {
  const n = String(filename || "").toLowerCase();
  if (/\.(html?|xhtml)$/.test(n) || mime === "text/html") return "html";
  if (/\.(md|markdown|mdx)$/.test(n) || mime === "text/markdown") return "md";
  if (/\.(txt|text|log|csv|tsv|json)$/.test(n) || mime === "text/plain") return "txt";
  return null;
}

const stripExt = (name) => String(name || "").replace(/\.[^.]+$/, "");

// Lấy tên tài liệu: <title> / <h1> của HTML, dòng "# " đầu của Markdown, không có thì dùng tên file
export function extractTitle(kind, text, filename = "") {
  const fallback = stripExt(filename).replace(/[_-]+/g, " ").trim() || "Tài liệu không tên";
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (kind === "html") {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
    const raw = (t && t[1]) || (h && h[1]) || "";
    const plain = raw.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    return clean(plain) || fallback;
  }
  if (kind === "md") {
    const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(text);
    return clean(m && m[1].replace(/[*_`]/g, "")) || fallback;
  }
  return fallback;
}

// Chữ thuần để tìm kiếm / hỏi đáp: HTML bỏ thẻ, script, style
export function toPlain(kind, text) {
  let out = String(text || "");
  if (kind === "html") {
    try {
      const doc = new DOMParser().parseFromString(out, "text/html");
      doc.querySelectorAll("script,style,noscript,svg,template,head").forEach((n) => n.remove());
      out = doc.body ? doc.body.textContent || "" : "";
    } catch {
      out = out.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
    }
  }
  if (kind === "md") {
    // Bỏ ký hiệu Markdown để đoạn trích / tìm kiếm / hỏi đáp đọc như văn thường (giữ chữ trong link và ảnh)
    out = out.replace(/^\s*```.*$/gm, " ").replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, " ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>+\s?/gm, "").replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
      .replace(/(\*\*|__|~~)/g, "").replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2").replace(/`/g, "").replace(/\s*\|\s*/g, " ");
  }
  return out.normalize("NFC").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PLAIN_CHARS);
}

// ───────────────────────── Cây thư mục ─────────────────────────

const byName = (a, b) => String(a.name).localeCompare(String(b.name), "vi");

export function buildTree(folders) {
  const map = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const n of map.values()) {
    const p = n.parent_id && map.get(n.parent_id);
    (p ? p.children : roots).push(n);
  }
  const sort = (arr) => { arr.sort(byName); arr.forEach((n) => sort(n.children)); };
  sort(roots);
  return roots;
}

// Danh sách phẳng có độ sâu (để làm ô chọn thụt đầu dòng)
export function flattenTree(folders) {
  const out = [];
  const walk = (nodes, depth) => nodes.forEach((n) => { out.push({ ...n, depth }); walk(n.children, depth + 1); });
  walk(buildTree(folders), 0);
  return out;
}

// Đường đi từ gốc tới thư mục: [Cha, Con, Cháu]
export function folderPath(folders, id) {
  const map = new Map(folders.map((f) => [f.id, f]));
  const out = [];
  const seen = new Set();
  let cur = map.get(id);
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.parent_id ? map.get(cur.parent_id) : null; }
  return out;
}

// Thư mục + toàn bộ thư mục con (dùng để lọc tài liệu và chặn chuyển thư mục vào chính con của nó)
export function descendantIds(folders, id) {
  const kids = new Map();
  for (const f of folders) { if (f.parent_id) { if (!kids.has(f.parent_id)) kids.set(f.parent_id, []); kids.get(f.parent_id).push(f.id); } }
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) for (const c of kids.get(stack.pop()) || []) if (!out.has(c)) { out.add(c); stack.push(c); }
  return out;
}

// Đếm tài liệu: trực tiếp trong thư mục + tính cả thư mục con
export function countDocs(folders, docs) {
  const direct = new Map();
  for (const d of docs) direct.set(d.folder_id || null, (direct.get(d.folder_id || null) || 0) + 1);
  const total = new Map();
  for (const f of folders) {
    let n = 0;
    for (const id of descendantIds(folders, f.id)) n += direct.get(id) || 0;
    total.set(f.id, n);
  }
  return { direct, total, none: direct.get(null) || 0 };
}

// ───────────────────────── Hiển thị an toàn ─────────────────────────

export const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(src) {
  const codes = [];
  let t = escHtml(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

// Markdown → HTML. Mọi chữ được escape trước nên không chèn được thẻ/mã lạ; chỉ link http(s)/mailto.
export function renderMarkdown(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) { items.push({ indent: m[1].length, text: m[3] }); i++; }
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text += " " + lines[i].trim(); i++; }
        else break;
      }
      // Lồng 2 cấp theo thụt đầu dòng (đủ cho ghi chú học tập)
      let html = "", open = 0;
      const tag = ordered ? "ol" : "ul";
      const base = Math.min(...items.map((x) => x.indent));
      let lvl = 0;
      html += `<${tag}>`; open++;
      items.forEach((it, k) => {
        const deeper = it.indent > base;
        if (deeper && lvl === 0) { html += "<ul>"; lvl = 1; }
        if (!deeper && lvl === 1) { html += "</ul>"; lvl = 0; }
        html += `<li>${inline(it.text)}</li>`;
        if (k === items.length - 1 && lvl === 1) { html += "</ul>"; lvl = 0; }
      });
      html += `</${tag}>`;
      out.push(html);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

const READER_CSS = `*{box-sizing:border-box}body{margin:0;padding:28px 22px 64px;font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Be Vietnam Pro",sans-serif;color:#1e293b;background:#fff}
.doc{max-width:780px;margin:0 auto}h1,h2,h3,h4{line-height:1.3;color:#0f172a;margin:1.6em 0 .5em}h1{font-size:1.8em}h2{font-size:1.45em}h3{font-size:1.2em}
p{margin:.7em 0}a{color:#4f46e5}img{max-width:100%;height:auto;border-radius:8px}hr{border:0;border-top:1px solid #e2e8f0;margin:1.6em 0}
code{background:#f1f5f9;padding:1px 6px;border-radius:5px;font-size:.9em}pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto}pre code{background:none;color:inherit;padding:0}
blockquote{margin:1em 0;padding:2px 16px;border-left:4px solid #a5b4fc;background:#f8fafc;color:#475569;border-radius:0 8px 8px 0}
.tw{overflow-x:auto;margin:1em 0}table{border-collapse:collapse;min-width:60%}th,td{border:1px solid #e2e8f0;padding:7px 12px;text-align:left;vertical-align:top}th{background:#f1f5f9}
ul,ol{padding-left:1.4em}li{margin:.25em 0}pre.txt{white-space:pre-wrap;word-break:break-word;font:14px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;background:none;color:#1e293b;padding:0}`;

// Nội dung đưa vào khung đọc (iframe cách ly). HTML giữ nguyên; Markdown/văn bản bọc kiểu đọc sạch.
// Mục lục trong tài liệu (<a href="#muc">): trong iframe srcdoc, href="#x" bị hiểu theo địa chỉ của app → mở cả app (đòi đăng nhập).
// Chặn click và tự cuộn tới đúng mục ngay trong tài liệu.
const ANCHOR_JS = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)!=="#")return;e.preventDefault();var id=h.slice(1);try{id=decodeURIComponent(id)}catch(x){}var t=id?(document.getElementById(id)||document.getElementsByName(id)[0]):null;if(t)t.scrollIntoView({behavior:"smooth",block:"start"});else if(!id)window.scrollTo({top:0,behavior:"smooth"})},true);<\/script>`;
const withAnchors = (h) => (/<\/body>/i.test(h) ? h.replace(/<\/body>(?![\s\S]*<\/body>)/i, ANCHOR_JS + "</body>") : h + ANCHOR_JS);
export function frameDoc(kind, content) {
  const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  if (kind === "html") return withAnchors(/<meta[^>]+charset/i.test(content) ? content : head + content);
  if (kind === "md") return withAnchors(`<!doctype html><html lang="vi"><head>${head}<style>${READER_CSS}</style></head><body><div class="doc">${renderMarkdown(content)}</div></body></html>`);
  return withAnchors(`<!doctype html><html lang="vi"><head>${head}<style>${READER_CSS}</style></head><body><div class="doc"><pre class="txt">${escHtml(content)}</pre></div></body></html>`);
}

// Cắt đoạn trích cho gọn: bỏ chữ dở ở 2 đầu, thêm "…"
export function tidySnippet(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cutHead = /^[^\s]/.test(t) && t.length >= 190; // đoạn trích bắt đầu giữa chừng
  if (cutHead) t = t.replace(/^\S*\s/, "…");
  return t;
}

// Tag nhập tay "kế toán, báo cáo ; excel" → ["kế toán","báo cáo","excel"]
export function parseTags(s) {
  return [...new Set(String(s || "").split(/[,;\n]+/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean).map((x) => x.slice(0, 30)))].slice(0, 12);
}

// Lọc + sắp xếp danh sách tài liệu (thuần, dễ kiểm thử)
export function filterDocs(docs, { folderId, folders, query, hits, customerId }) {
  let list = docs;
  const q = fold(query).trim();
  if (q.length >= 2) {
    // Đang tìm → tìm TRONG TẤT CẢ thư mục (tên, nhãn, ghi chú, tên file gốc; cộng kết quả tìm trong nội dung do máy chủ trả về)
    list = docs.filter((d) => hits?.has(d.id) || fold([d.title, (d.tags || []).join(" "), d.note, d.source].join(" ")).includes(q));
  } else if (folderId === "none") list = docs.filter((d) => !d.folder_id);
  else if (folderId && folderId !== "all") { const ids = descendantIds(folders, folderId); list = docs.filter((d) => d.folder_id && ids.has(d.folder_id)); }
  // Bộ lọc theo khách áp dụng cả khi đang tìm: "all" / rỗng = mọi khách · "none" = chưa gắn khách · còn lại = mã khách
  if (customerId && customerId !== "all") list = customerId === "none" ? list.filter((d) => !d.customer_id) : list.filter((d) => d.customer_id === customerId);
  return list;
}

export function sortDocs(list, sort) {
  const a = [...list];
  if (sort === "old") a.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  else if (sort === "name") a.sort((x, y) => String(x.title).localeCompare(String(y.title), "vi"));
  else if (sort === "size") a.sort((x, y) => (y.size_bytes || 0) - (x.size_bytes || 0));
  else a.sort((x, y) => String(y.updated_at || y.created_at).localeCompare(String(x.updated_at || x.created_at)));
  return a;
}

// ───────────────────────── Gọi cơ sở dữ liệu ─────────────────────────

const LIST_COLS = "id,folder_id,title,kind,size_bytes,tags,note,source,excerpt,created_at,updated_at,indexed_at,customer_id,project_id";

// Bảng chưa tạo (chưa chạy SETUP-LIBRARY.sql)?
export const isMissingTable = (error) => !!error && (/PGRST20[0-9]|42P01/.test(String(error.code || "")) || /does not exist|schema cache|Could not find the (table|function)/i.test(String(error.message || "")));

export const libLoad = async () => {
  const [f, d] = await Promise.all([
    supabase.from("qws_lib_folders").select("id,parent_id,name,color,created_at").order("name"),
    supabase.from("qws_lib_docs").select(LIST_COLS).order("updated_at", { ascending: false }).limit(3000),
  ]);
  return { folders: f.data || [], docs: d.data || [], error: f.error || d.error || null };
};
// Tài liệu gắn với 1 khách (hiện ở thẻ khách trong Khách & Dự án)
export const libByCustomer = (customerId) => supabase.from("qws_lib_docs").select("id,title,kind,updated_at").eq("customer_id", customerId).order("updated_at", { ascending: false }).limit(50);
export const libGet = (id) => supabase.from("qws_lib_docs").select("*").eq("id", id).maybeSingle();
export const libSearch = (q) => supabase.rpc("qws_lib_search", { q });
export const libAddDoc = (row) => supabase.from("qws_lib_docs").insert(row).select(LIST_COLS).single();
export const libUpdateDoc = (id, patch) => supabase.from("qws_lib_docs").update(patch).eq("id", id).select(LIST_COLS).single();
export const libDeleteDoc = (id) => supabase.from("qws_lib_docs").delete().eq("id", id);
export const libAddFolder = (row) => supabase.from("qws_lib_folders").insert(row).select("id,parent_id,name,color,created_at").single();
export const libUpdateFolder = (id, patch) => supabase.from("qws_lib_folders").update(patch).eq("id", id).select("id,parent_id,name,color,created_at").single();
export const libDeleteFolder = (id) => supabase.from("qws_lib_folders").delete().eq("id", id);

// ───────────── Chia sẻ bằng link online (SETUP-LIBRARY-SHARE.sql) ─────────────
// Link /xem/<mã> mở KHÔNG cần đăng nhập, chỉ đọc đúng 1 tài liệu. Mã 43 ký tự ngẫu nhiên; tắt chia sẻ = xoá dòng = hết hiệu lực ngay.
const SHARE_COLS = "id,doc_id,token,expires_at,views,last_view_at,created_at";
export const SHARE_EXPIRY = [["never", "Không hết hạn", null], ["7", "7 ngày", 7], ["30", "30 ngày", 30]];
export function newShareToken() {
  const b = new Uint8Array(32);
  (globalThis.crypto || window.crypto).getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const shareExpiresAt = (days, now = Date.now()) => (days ? new Date(now + days * 86400000).toISOString() : null);
export const shareExpired = (sh, now = Date.now()) => !!sh?.expires_at && new Date(sh.expires_at).getTime() <= now;
export const shareUrl = (token, origin = typeof window !== "undefined" ? window.location.origin : "") => `${origin}/xem/${token}`;
export const libShares = () => supabase.from("qws_lib_shares").select(SHARE_COLS);
export const libShareCreate = (docId, days) => supabase.from("qws_lib_shares").insert({ doc_id: docId, token: newShareToken(), expires_at: shareExpiresAt(days) }).select(SHARE_COLS).single();
export const libShareSetExpiry = (id, days) => supabase.from("qws_lib_shares").update({ expires_at: shareExpiresAt(days) }).eq("id", id).select(SHARE_COLS).single();
export const libShareRevoke = (id) => supabase.from("qws_lib_shares").delete().eq("id", id);
export const libSharedGet = (token) => supabase.rpc("qws_lib_shared_get", { p_token: token });

// Chuẩn bị 1 file tải lên → hàng sẵn sàng ghi DB (hoặc báo lỗi bằng tiếng Việt)
export async function prepareFile(file, folderId) {
  const kind = detectKind(file.name, file.type);
  if (!kind) return { error: /\.pdf$/i.test(file.name) ? "PDF chưa hỗ trợ (sẽ làm ở bước sau)" : "Chưa hỗ trợ loại file này (dùng .html, .md, .txt)" };
  if (file.size > MAX_FILE_BYTES) return { error: `Quá lớn (${fmtSize(file.size)}, tối đa ${fmtSize(MAX_FILE_BYTES)})` };
  if (!file.size) return { error: "File rỗng" };
  const content = await file.text();
  return { row: { title: extractTitle(kind, content, file.name), kind, content, plain: toPlain(kind, content), size_bytes: file.size, source: file.name, folder_id: folderId || null } };
}

// Tải file về máy (file gốc nguyên vẹn)
export function downloadDoc(doc) {
  const ext = doc.kind === "html" ? "html" : doc.kind === "md" ? "md" : "txt";
  const mime = doc.kind === "html" ? "text/html" : "text/plain";
  const name = (doc.source && /\.[a-z0-9]+$/i.test(doc.source) ? doc.source : `${String(doc.title).replace(/[\\/:*?"<>|]+/g, " ").trim() || "tai-lieu"}.${ext}`);
  const url = URL.createObjectURL(new Blob([doc.content || ""], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ───────────────────────── Hỏi đáp bằng AI (hàm máy chủ qws-lib) ─────────────────────────
// Cần chạy SETUP-LIBRARY-AI.sql và cài hàm supabase/functions/qws-lib. Khoá OpenAI nằm ở máy chủ, trình duyệt không thấy.

async function callLib(body) {
  try {
    const { data, error } = await supabase.functions.invoke("qws-lib", { body });
    if (!error && data && !data.error) return { data };
    let msg = data?.error;
    if (error) { try { msg = (await error.context?.json?.())?.error || msg; } catch { /* bỏ qua */ } }
    const notDeployed = error && (error.context?.status === 404 || /Failed to send|FunctionsFetchError/i.test(`${error.name} ${error.message}`));
    return { error: notDeployed ? "Hàm hỏi đáp (qws-lib) chưa được cài trên máy chủ." : msg || error?.message || "Lỗi hỏi đáp" };
  } catch (e) { return { error: String(e?.message || e) }; }
}

// Nạp tài liệu vào hỏi đáp (tối đa 5 tài liệu mỗi lần gọi) → { data: { results: [{ doc_id, ok, chunks, error }] } }
export const libIndex = (docIds) => callLib({ mode: "index", doc_ids: docIds });
// Hỏi: folderIds = chỉ tìm trong các thư mục này; docId = chỉ 1 tài liệu → { data: { answer, sources, usage } }
export const libAsk = ({ question, history, folderIds, docId, docIds, model }) =>
  callLib({ mode: "ask", question, history, folder_ids: folderIds || undefined, doc_id: docId || undefined, doc_ids: docIds || undefined, model });

// Ý hay mỗi ngày: seed = ngày (hôm nay) để app và thông báo 7h sáng ra cùng 1 ý; thêm "#n" để đổi ý khác → { data: { idea, doc_id, doc_title } } (idea = null nếu chưa có gì để rút)
export const libIdea = (seed) => callLib({ mode: "idea", seed });

export const unindexedDocs = (docs) => docs.filter((d) => !d.indexed_at);

// Câu trả lời của AI → HTML an toàn (Markdown đã escape) + số nguồn [1] thành nút bấm mở tài liệu
export function renderAnswer(text, sources = []) {
  const known = new Set(sources.map((s) => s.n));
  return renderMarkdown(text).replace(/\[(\d{1,2})\]/g, (m, n) => (known.has(Number(n))
    ? `<button type="button" data-src="${n}" class="mx-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-md bg-indigo-100 px-1 align-text-top text-[11px] font-bold text-indigo-700 hover:bg-indigo-200">${n}</button>`
    : m));
}
