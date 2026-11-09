// LINK LỊCH ĐĂNG KÝ (09/11/2026): đưa việc, giỗ / Rằm / lễ, hạn thu tiền sang Lịch iPhone & Google Calendar.
// App tạo nội dung lịch (định dạng ICS) ngay trên trình duyệt của chủ (dùng sẵn thuật toán âm lịch của app) rồi lưu vào bảng qws_ical_feeds;
// hàm máy chủ qws-ical chỉ trả lại nguyên văn theo mã bí mật trong link. Cài: supabase/SETUP-ICAL.sql + hàm supabase/functions/qws-ical.
import { generateCalendarEvents } from "./events.js";
import { solarToLunar } from "./lunar.js";
import { allInstallments, fmtMoney } from "./selectors.js";
import { supabase } from "./supabase.js";
import { durOf } from "./schedule.js";

export const ICAL_DEFAULTS = { family: true, holidays: true, tasks: true, receivables: true, amounts: false };
export const ICAL_GROUPS = [
  ["family", "Giỗ, sinh nhật, kỷ niệm của tôi", "Sự kiện riêng bạn đã tạo (lặp theo âm lịch hoặc dương lịch)"],
  ["holidays", "Lễ và Mùng 1 / Rằm", "Tết, Giỗ Tổ, Trung Thu… và mỗi Mùng 1, ngày Rằm"],
  ["tasks", "Công việc chưa xong", "Việc có ngày (có giờ thì hiện đúng giờ, không giờ thì cả ngày)"],
  ["receivables", "Hạn thu tiền khách", "Các đợt thu còn nợ, hiện vào ngày hạn thu"],
  ["amounts", "Hiện cả số tiền trên lịch", "Tắt = chỉ hiện tên khách và tên đợt (an toàn hơn nếu lỡ lộ link)"],
];

const VN_OFFSET_H = 7; // giờ Việt Nam = UTC+7 (không có giờ mùa hè)
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const compactDate = (iso) => iso.replace(/-/g, "");
const addDaysCompact = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`; };
const utcStamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const vnToUtcMs = (iso, hhmm) => { const [y, m, d] = iso.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return Date.UTC(y, m - 1, d, h - VN_OFFSET_H, mi); };
const validDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const validTime = (s) => typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.codePointAt(0)) >>> 0; return h.toString(36); };

// Chữ trong ICS: thoát \ ; , và xuống dòng
export const escText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// ICS giới hạn 75 byte mỗi dòng (tính theo UTF-8): dòng dài phải ngắt, dòng nối tiếp bắt đầu bằng 1 khoảng trắng
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { parts.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

function vevent({ uid, stamp, summary, desc, date, time, durMin = 60, alarms = [] }) {
  const L = ["BEGIN:VEVENT", `UID:${uid}@quang-workspace`, `DTSTAMP:${stamp}`];
  if (time) {
    const s = vnToUtcMs(date, time);
    L.push(`DTSTART:${utcStamp(s)}`, `DTEND:${utcStamp(s + durMin * 60000)}`);
  } else {
    L.push(`DTSTART;VALUE=DATE:${compactDate(date)}`, `DTEND;VALUE=DATE:${addDaysCompact(date, 1)}`, "TRANSP:TRANSPARENT"); // cả ngày, không chặn giờ rảnh
  }
  L.push(`SUMMARY:${escText(summary)}`);
  if (desc) L.push(`DESCRIPTION:${escText(desc)}`);
  for (const trig of alarms) L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escText(summary)}`, `TRIGGER:${trig}`, "END:VALARM");
  L.push("END:VEVENT");
  return L;
}

/**
 * Tạo nội dung lịch. Kết quả ổn định (cùng dữ liệu → cùng chữ) để app biết khi nào không cần gửi lại.
 * @returns {{ ics: string, counts: { family:number, holidays:number, tasks:number, receivables:number } }}
 */
export function buildIcs({ tasks = [], family = [], projects = [], customers = [], opts = {}, today = new Date() } = {}) {
  const o = { ...ICAL_DEFAULTS, ...opts };
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const todayIso = isoOf(t0);
  const stamp = utcStamp(Date.UTC(t0.getFullYear(), t0.getMonth(), t0.getDate())); // cố định trong ngày
  const from = new Date(t0); from.setDate(from.getDate() - 30);
  const to = new Date(t0); to.setDate(to.getDate() + 730);
  const fromIso = isoOf(from);
  const counts = { family: 0, holidays: 0, tasks: 0, receivables: 0 };
  const body = [];

  // 1) Sự kiện (giỗ, sinh nhật, lễ, Mùng 1 / Rằm) — tính sẵn ngày dương cho 2 năm tới, kể cả sự kiện âm lịch
  if (o.family || o.holidays) {
    const personal = new Set(["family", "birthday", "anniversary", "reminder"]);
    for (const e of generateCalendarEvents(from, to, family)) {
      const isPersonal = personal.has(e.type);
      if (isPersonal ? !o.family : !o.holidays) continue;
      const [y, m, d] = e.date.split("-").map(Number);
      const l = solarToLunar(d, m, y);
      body.push(...vevent({
        uid: `ev-${e.date}-${hash(e.title + e.type)}`, stamp, summary: e.title, date: e.date,
        desc: `Âm lịch: ${l.day}/${l.month}${l.leap ? " (nhuận)" : ""}`,
        alarms: isPersonal ? ["PT9H", "-PT15H"] : [], // sự kiện riêng: nhắc 9 giờ sáng hôm đó và 9 giờ sáng hôm trước
      }));
      counts[isPersonal ? "family" : "holidays"]++;
    }
  }

  // 2) Công việc chưa xong có ngày
  if (o.tasks) {
    const custName = new Map(customers.map((c) => [c.id, c.name]));
    for (const t of tasks) {
      if (!t || t.status === "done" || !t.title || !validDate(t.date) || t.date < fromIso) continue;
      const timed = validTime(t.time);
      const time = timed ? `${pad(Number(t.time.split(":")[0]))}:${t.time.split(":")[1]}` : null;
      const cust = t.customerId && custName.get(t.customerId);
      const desc = [cust ? `Khách: ${cust}` : "", t.note || ""].filter(Boolean).join("\n");
      body.push(...vevent({
        uid: `task-${t.id || hash(t.title + t.date)}`, stamp, summary: (t.priority === "high" ? "[Gấp] " : "") + t.title, desc, date: t.date, time, durMin: durOf(t),
        alarms: timed ? ["-PT15M"] : ["PT9H"],
      }));
      counts.tasks++;
    }
  }

  // 3) Hạn thu tiền: các đợt còn nợ
  if (o.receivables) {
    for (const x of allInstallments(projects)) {
      if (!(x.debt > 0) || !validDate(x.date) || x.date < fromIso) continue;
      const money = o.amounts ? ` (${fmtMoney(x.debt)})` : "";
      body.push(...vevent({
        uid: `thu-${x.projectId}-${x.id || hash(x.date + x.label)}`, stamp, summary: `Thu tiền: ${x.customerName || "khách"} — ${x.label || "đợt thu"}${money}`,
        desc: `Dự án: ${x.projectName || ""}`, date: x.date, alarms: ["PT9H"],
      }));
      counts.receivables++;
    }
  }

  const head = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quang Workspace//VI//", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Quang Workspace", "X-WR-TIMEZONE:Asia/Ho_Chi_Minh", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  const ics = [...head, ...body, "END:VCALENDAR"].map(foldLine).join("\r\n") + "\r\n";
  return { ics, counts };
}

// ───────────────────────── Link + lưu trữ ─────────────────────────

// Mã bí mật 32 ký tự (24 byte ngẫu nhiên, base64 an toàn cho URL)
export function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const base = () => supabase.supabaseUrl || "https://dbfffwtnxhytcoczhxhf.supabase.co";
export const icalUrl = (token) => `${base()}/functions/v1/qws-ical?t=${token}`;
export const icalWebcalUrl = (token) => icalUrl(token).replace(/^https?:/, "webcal:");

const COLS = "token,options,updated_at";
export const icalGet = () => supabase.from("qws_ical_feeds").select(COLS).maybeSingle();
export const icalCreate = (uid, token, options, ics) => supabase.from("qws_ical_feeds").upsert({ user_id: uid, token, options, ics }, { onConflict: "user_id" }).select(COLS).single();
export const icalSave = (uid, patch) => supabase.from("qws_ical_feeds").update(patch).eq("user_id", uid).select(COLS).single();
export const icalDelete = (uid) => supabase.from("qws_ical_feeds").delete().eq("user_id", uid);
