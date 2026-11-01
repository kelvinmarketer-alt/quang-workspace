// Thêm việc 1 dòng (01/11 sếp duyệt demo): "Gửi báo cáo #VĐG mai 9h !cao ~2" → tên · ngày · giờ · ưu tiên · khách · số phiên 25'.
// Hiểu: hôm nay · mai/ngày mai · ngày kia · thứ 2..7/t2..t7 · cn/chủ nhật · tuần sau · dd/mm — 9h, 9h30, 14:30, 3h chiều — !cao/!!/!gap, !thap — #tên khách (gõ tắt chữ đầu: #vdg, #nstt) — ~2
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export function dayLabel(isoDate) {
  if (!isoDate) return "";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + "T00:00:00"), n = Math.round((d - t) / 864e5);
  return n === 0 ? "Hôm nay" : n === 1 ? "Mai" : n === 2 ? "Ngày kia" : n === -1 ? "Hôm qua" : `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function matchCustomer(q, customers) {
  const words = q.split(/\s+/).filter(Boolean);
  let best = null;
  for (let k = Math.min(4, words.length); k >= 1; k--) {
    const part = fold(words.slice(0, k).join(" ")).replace(/[^a-z0-9]/g, "");
    if (part.length < 2) continue;
    for (const c of customers) {
      const name = fold(c.name).replace(/[^a-z0-9 ]/g, "");
      const flat = name.replace(/ /g, ""), initials = name.split(" ").filter(Boolean).map((w) => w[0]).join("");
      if (flat.startsWith(part) || initials === part || (part.length >= 3 && flat.includes(part))) {
        const score = part.length + (initials === part ? 5 : 0) + (flat.startsWith(part) ? 2 : 0);
        if (!best || score > best.score) best = { c, raw: words.slice(0, k).join(" "), score };
      }
    }
    if (best) break;
  }
  return best;
}

export function parseQuickTask(raw, customers = [], now = new Date()) {
  let s = " " + String(raw || "").normalize("NFC") + " ", f = fold(s);
  const out = { title: "", date: null, time: null, priority: null, customerId: null, customerName: null, est: null };
  // cắt cụm đã hiểu khỏi câu (giữ đúng chỉ số vì fold giữ nguyên độ dài chuỗi NFC)
  const cut = (re) => { const m = f.match(re); if (!m) return null; const i = m.index, j = i + m[0].length; s = s.slice(0, i) + " " + s.slice(j); f = f.slice(0, i) + " " + f.slice(j); return m; };
  const base = new Date(now); base.setHours(0, 0, 0, 0);
  const add = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  let m;
  // "mai" = ngày mai, TRỪ khi là tên người: viết hoa giữa câu ("Gọi chị Mai") hoặc đứng sau chị/anh/gặp… — lấy chữ "mai" hợp lệ đầu tiên
  const maiHit = () => {
    const re = /\s(ngay mai|mai)(?=\s)/g; let x;
    while ((x = re.exec(f))) {
      const name = x[1] === "mai" && x.index > 0 && (s[x.index + 1] === "M" || /\s(chi|anh|em|co|bac|chu|ban|ong|ba|cho|voi|gap|goi|nhan|hoi)$/.test(f.slice(0, x.index)));
      if (!name) return { i: x.index, j: x.index + x[0].length };
    }
    return null;
  };
  if (cut(/\s(hom nay)\s/)) out.date = iso(base);
  else if (cut(/\s(ngay kia)\s/)) out.date = iso(add(2));
  else if ((m = maiHit())) { s = s.slice(0, m.i) + " " + s.slice(m.j); f = f.slice(0, m.i) + " " + f.slice(m.j); out.date = iso(add(1)); }
  else if (cut(/\stuan sau\s/)) out.date = iso(add((8 - base.getDay()) % 7 || 7));
  else if ((m = cut(/\s(?:thu\s?|t)([2-7])\s/))) { const want = +m[1] - 1; out.date = iso(add(((want - base.getDay()) + 7) % 7 || 7)); }
  else if (cut(/\s(chu nhat|cn)\s/)) out.date = iso(add((7 - base.getDay()) % 7 || 7));
  else if ((m = f.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < base) d.setFullYear(d.getFullYear() + 1);
    // ngày không có thật (31/2, 0/5) → không hiểu là ngày, giữ nguyên trong tên việc
    if (!isNaN(d) && d.getDate() === +m[1] && d.getMonth() === +m[2] - 1) { cut(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/); out.date = iso(d); }
  }
  if ((m = cut(/\s(\d{1,2})(?:h|g|:)(\d{2})?\s?(sang|chieu|toi)?\s/))) {
    let h = +m[1]; if ((m[3] === "chieu" || m[3] === "toi") && h < 12) h += 12;
    if (h < 24) out.time = `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
  }
  if (cut(/\s(!cao|!!|!gap)\s/)) out.priority = "high"; else if (cut(/\s!thap\s/)) out.priority = "low";
  if ((m = cut(/\s~(\d{1,2})\s/))) out.est = Math.min(12, +m[1]);
  const hm = s.match(/#([^\s#!~]+(?:\s[^\s#!~]+){0,3})/);
  if (hm) { const b = matchCustomer(hm[1], customers); if (b) { out.customerId = b.c.id; out.customerName = b.c.name; s = s.replace("#" + b.raw, " "); } }
  out.title = s.replace(/\s+/g, " ").trim();
  return out;
}
