import { solarToLunar, lunarToSolar } from "./lunar.js";

// Lễ dương lịch VN cố định (solar)
export const SOLAR_HOLIDAYS = [
  { d: 1, m: 1, name: "Tết Dương lịch" },
  { d: 14, m: 2, name: "Valentine" },
  { d: 8, m: 3, name: "Quốc tế Phụ nữ" },
  { d: 30, m: 4, name: "Giải phóng miền Nam" },
  { d: 1, m: 5, name: "Quốc tế Lao động" },
  { d: 1, m: 6, name: "Quốc tế Thiếu nhi" },
  { d: 27, m: 7, name: "Thương binh Liệt sĩ" },
  { d: 2, m: 9, name: "Quốc khánh" },
  { d: 20, m: 10, name: "Phụ nữ Việt Nam" },
  { d: 20, m: 11, name: "Nhà giáo Việt Nam" },
  { d: 25, m: 12, name: "Giáng sinh" },
];

// Lễ âm lịch VN cố định (lunar day/month)
export const LUNAR_HOLIDAYS = [
  { ld: 1, lm: 1, name: "Tết Nguyên Đán" },
  { ld: 2, lm: 1, name: "Mùng 2 Tết" },
  { ld: 3, lm: 1, name: "Mùng 3 Tết" },
  { ld: 15, lm: 1, name: "Tết Nguyên Tiêu" },
  { ld: 3, lm: 3, name: "Tết Hàn thực" },
  { ld: 10, lm: 3, name: "Giỗ Tổ Hùng Vương" },
  { ld: 15, lm: 4, name: "Phật Đản" },
  { ld: 5, lm: 5, name: "Tết Đoan Ngọ" },
  { ld: 15, lm: 7, name: "Vu Lan" },
  { ld: 15, lm: 8, name: "Tết Trung Thu" },
  { ld: 23, lm: 12, name: "Ông Công Ông Táo" },
];

const DOW_VN = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

export function parseRemind(s) {
  if (Array.isArray(s)) return s;
  if (s == null || s === "") return [7, 3, 1, 0];
  return String(s).split(/[,;\s]+/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
}

// Chuẩn hoá 1 sự kiện (hỗ trợ cả schema cũ lunarDay/lunarMonth/type lẫn mới)
export function normEvent(f) {
  const n = (v) => Number(v) || 0;
  if (f.calendar) {
    return {
      ...f, day: n(f.day), month: n(f.month), repeat: f.repeat || "year",
      baseYear: f.baseYear ? n(f.baseYear) : null,
      remindBefore: parseRemind(f.remindBefore),
      category: f.category || "giỗ",
    };
  }
  if (f.lunarDay && f.lunarMonth)
    return { ...f, calendar: "am", day: n(f.lunarDay), month: n(f.lunarMonth), repeat: "year", category: f.type === "birthday" ? "sinh nhật" : "giỗ", remindBefore: [7, 3, 1, 0], baseYear: null };
  if (f.solarDay && f.solarMonth)
    return { ...f, calendar: "duong", day: n(f.solarDay), month: n(f.solarMonth), repeat: "year", category: f.type === "birthday" ? "sinh nhật" : "giỗ", remindBefore: [7, 3, 1, 0], baseYear: null };
  return { ...f, calendar: "am", day: n(f.day), month: n(f.month), repeat: "year", category: "giỗ", remindBefore: [7, 3, 1, 0], baseYear: null };
}

// Mọi lần xuất hiện (Date) của 1 sự kiện đã chuẩn hoá trong [from, to]
function occurrencesInRange(ev, from, to) {
  const out = [];
  const ok = (dt) => dt && dt >= from && dt <= to;
  if (ev.repeat === "month") {
    if (ev.calendar === "duong") {
      let cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        const dt = new Date(cur.getFullYear(), cur.getMonth(), ev.day);
        if (ok(dt)) out.push(dt);
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    } else {
      let cur = new Date(from);
      while (cur <= to) {
        const l = solarToLunar(cur.getDate(), cur.getMonth() + 1, cur.getFullYear());
        if (l.day === ev.day) out.push(new Date(cur));
        cur = new Date(cur.getTime() + 86400000);
      }
    }
  } else if (ev.repeat === "once") {
    // 1 lần = ĐÚNG 1 mốc (năm cố định), KHÔNG trôi sang năm sau
    const y = ev.baseYear || from.getFullYear();
    const dt = ev.calendar === "am" ? lunarToSolar(ev.day, ev.month, y) : new Date(y, ev.month - 1, ev.day);
    if (ok(dt)) out.push(dt);
  } else { // year
    for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
      const dt = ev.calendar === "am" ? lunarToSolar(ev.day, ev.month, y) : new Date(y, ev.month - 1, ev.day);
      if (ok(dt)) out.push(dt);
    }
  }
  return out;
}

// Sự kiện hệ thống (lễ VN + Mùng 1/Rằm) dạng chuẩn hoá
function builtinEvents() {
  const out = [];
  for (const h of SOLAR_HOLIDAYS) out.push({ title: h.name, category: "lễ", calendar: "duong", day: h.d, month: h.m, repeat: "year", remindBefore: [1, 0], builtin: true, kind: "holiday" });
  for (const h of LUNAR_HOLIDAYS) out.push({ title: h.name, category: "lễ", calendar: "am", day: h.ld, month: h.lm, repeat: "year", remindBefore: [3, 1, 0], builtin: true, kind: "lunar-holiday" });
  out.push({ title: "Mùng 1", category: "lễ", calendar: "am", day: 1, month: 0, repeat: "month", remindBefore: [1, 0], builtin: true, kind: "lunar-phase" });
  out.push({ title: "Rằm", category: "lễ", calendar: "am", day: 15, month: 0, repeat: "month", remindBefore: [1, 0], builtin: true, kind: "lunar-phase" });
  return out;
}

// Map loại -> kind (màu) cho sự kiện người dùng
function kindOf(ev) {
  if (ev.builtin) return ev.kind;
  if (ev.category === "sinh nhật") return "birthday";
  if (ev.category === "kỷ niệm") return "anniversary";
  if (ev.category === "khác") return "reminder";
  if (ev.category === "lễ") return ev.calendar === "am" ? "lunar-holiday" : "holiday";
  return "family"; // giỗ
}

/**
 * Sinh sự kiện cho lịch tháng (grid) trong [from, to].
 */
export function generateCalendarEvents(from, to, familyEvents = []) {
  const out = [];
  const all = [...builtinEvents(), ...familyEvents.map(normEvent)];
  for (const ev of all) {
    for (const dt of occurrencesInRange(ev, from, to)) {
      out.push({ date: iso(dt), title: ev.title, type: kindOf(ev) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Bảng "Sự kiện sắp tới" (báo cáo) — lần xuất hiện KẾ TIẾP của mỗi sự kiện
 * trong [hôm nay, hôm nay + days]. Kèm còn-mấy-ngày, số năm, cờ nhắc.
 */
export function upcomingEvents(familyEvents = [], fromDate = new Date(), days = 90) {
  const start = dayOnly(fromDate);
  const to = new Date(start.getTime() + days * 86400000);
  const lookback = new Date(start.getTime() - 370 * 86400000); // "1 lần đã xong" trong ~1 năm vẫn hiển thị
  const all = [...builtinEvents(), ...familyEvents.map(normEvent)];
  const rows = [];
  for (const ev of all) {
    let occ;
    if (ev.repeat === "once") {
      const y = ev.baseYear || start.getFullYear();
      occ = dayOnly(ev.calendar === "am" ? lunarToSolar(ev.day, ev.month, y) : new Date(y, ev.month - 1, ev.day));
      if (occ > to || occ < lookback) continue; // ngoài tầm thì bỏ
    } else {
      occ = occurrencesInRange(ev, start, to).map(dayOnly).sort((a, b) => a - b)[0];
      if (!occ) continue;
    }
    // "Hoàn thành": 1 lần đã qua ngày, HOẶC người dùng tự đánh dấu xong
    const done = ev.done === true || (ev.repeat === "once" && occ < start);
    const l = solarToLunar(occ.getDate(), occ.getMonth() + 1, occ.getFullYear());
    const daysUntil = Math.round((occ - start) / 86400000);
    const remind = ev.remindBefore || (ev.builtin ? [1, 0] : [7, 3, 1, 0]);
    rows.push({
      id: ev.id || `${ev.title}-${ev.day}-${ev.month}`,
      date: iso(occ),
      dow: DOW_VN[occ.getDay()],
      title: ev.title,
      category: ev.category || "giỗ",
      calendar: ev.calendar,
      repeat: ev.repeat || "year",
      solar: `${occ.getDate()}/${occ.getMonth() + 1}`,
      lunar: `${l.day}/${l.month}${l.leap ? " nhuận" : ""}`,
      daysUntil,
      done,
      manualDone: ev.done === true,
      years: ev.baseYear && ev.repeat !== "once" ? occ.getFullYear() - ev.baseYear : null,
      note: ev.note || "",
      remindBefore: remind,
      willRemind: !done && remind.includes(daysUntil),
      kind: kindOf(ev),
      builtin: !!ev.builtin,
    });
  }
  // Chưa xong lên đầu (gần nhất trước); đã xong xuống cuối (mới hoàn thành trước)
  return rows.sort((a, b) =>
    (a.done ? 1 : 0) - (b.done ? 1 : 0) ||
    (a.done ? b.daysUntil - a.daysUntil : a.daysUntil - b.daysUntil) ||
    a.date.localeCompare(b.date)
  );
}

// Parse 1 dòng CSV (hỗ trợ field có dấu phẩy trong ngoặc kép)
function csvSplit(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur); return out;
}

// Parse CSV dán từ Google Sheet (lịch âm bot) -> mảng sự kiện chuẩn của app.
// Cột: Bật,Tên,Phân loại,Lặp,Ngày,Tháng,Âm/Dương,Năm gốc,Nhắc trước,Ghi chú
export function parseEventsCSV(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const rows = lines.map(csvSplit);
  // bỏ dòng tiêu đề nếu có
  if (rows[0] && /tên/i.test(rows[0][1] || "") && /bật/i.test(rows[0][0] || "")) rows.shift();
  const catMap = { "lễ": "lễ", "le": "lễ", "giỗ": "giỗ", "gio": "giỗ", "sinh nhật": "sinh nhật", "sinh nhat": "sinh nhật", "kỷ niệm": "kỷ niệm", "ky niem": "kỷ niệm", "khác": "khác", "khac": "khác" };
  const repMap = { "hằng năm": "year", "hang nam": "year", "hằng tháng": "month", "hang thang": "month", "một lần": "once", "mot lan": "once" };
  const out = [];
  for (const r of rows) {
    const on = (r[0] || "").trim().toUpperCase();
    if (on === "FALSE" || on === "0") continue;
    const title = (r[1] || "").trim();
    if (!title) continue;
    const cat = catMap[(r[2] || "").trim().toLowerCase()] || "khác";
    const repeat = repMap[(r[3] || "").trim().toLowerCase()] || "year";
    const day = Number(r[4]) || 0;
    const month = Number(r[5]) || 0;
    const calendar = /âm|am/i.test((r[6] || "").trim()) && !/dương|duong/i.test(r[6] || "") ? "am" : "duong";
    const baseYear = Number(r[7]) || null;
    const remindBefore = parseRemind(r[8]);
    const note = (r[9] || "").trim();
    if (!day) continue;
    out.push({ title, category: cat, calendar, day, month, repeat, baseYear, remindBefore, note });
  }
  return out;
}
