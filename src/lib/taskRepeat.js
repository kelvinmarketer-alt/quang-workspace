// VIỆC LẶP LẠI + NHẮC TRƯỚC GIỜ (11/11/2026) — hàm thuần, không gọi mạng.
// Việc lặp: task.repeat = { type: "daily" } | { type: "weekly", days: [1, 3] } (0 = CN … 6 = T7) | { type: "monthly", dom: 15 }
// Đánh dấu xong 1 lần → app tạo lần kế tiếp (cùng seriesId). Lần kế tiếp luôn SAU max(ngày của việc, hôm nay):
// việc hằng ngày quá hạn 3 hôm, hôm nay mới xong → lần tới là ngày mai (không đẻ ra 3 việc quá hạn).
// Nhắc trước: task.remind = 10 | 30 | 60 (phút) — app mở: TaskWatch; app tắt: Worker qws-monitor gửi thông báo đẩy (13/11).

export const REPEAT_TYPES = [["", "Không lặp"], ["daily", "Hằng ngày"], ["weekly", "Hằng tuần"], ["monthly", "Hằng tháng"]];
export const WEEKDAYS = [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"], [0, "CN"]];
export const REMIND_OPTIONS = [[0, "Không nhắc"], [10, "Trước 10 phút"], [30, "Trước 30 phút"], [60, "Trước 1 giờ"]];

const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

// Chuẩn hoá: dữ liệu lạ / thiếu → null (không lặp)
export function normRepeat(r, fallbackDate) {
  if (!r || typeof r !== "object" || !r.type) return null;
  const base = parse(fallbackDate);
  if (r.type === "daily") return { type: "daily" };
  if (r.type === "weekly") {
    const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    return { type: "weekly", days: days.length ? days : [base ? base.getDay() : new Date().getDay()] };
  }
  if (r.type === "monthly") {
    const dom = Math.round(Number(r.dom));
    return { type: "monthly", dom: dom >= 1 && dom <= 31 ? dom : base ? base.getDate() : new Date().getDate() };
  }
  return null;
}

export function repeatLabel(r) {
  const x = normRepeat(r);
  if (!x) return "";
  if (x.type === "daily") return "Hằng ngày";
  if (x.type === "weekly") {
    if (x.days.length === 7) return "Hằng ngày";
    const order = [1, 2, 3, 4, 5, 6, 0];
    return "Hằng tuần " + order.filter((d) => x.days.includes(d)).map((d) => WEEKDAYS.find(([k]) => k === d)[1]).join(", ");
  }
  return `Ngày ${x.dom} hằng tháng`;
}

const matches = (x, d) => (x.type === "daily" ? true
  : x.type === "weekly" ? x.days.includes(d.getDay())
  : d.getDate() === Math.min(x.dom, lastDay(d.getFullYear(), d.getMonth())));

// Ngày đầu tiên KHỚP luật, tính từ `fromIso` (tính cả chính ngày đó) — dùng khi tạo việc lặp mới
export function firstOnOrAfter(repeat, fromIso) {
  const x = normRepeat(repeat, fromIso), d = parse(fromIso);
  if (!x || !d) return fromIso || null;
  for (let i = 0; i < 400; i++) { if (matches(x, d)) return isoOf(d); d.setDate(d.getDate() + 1); }
  return fromIso;
}

// Ngày lặp kế tiếp, SAU max(task.date, hôm nay)
export function nextDate(task, todayIso) {
  const x = normRepeat(task?.repeat, task?.date);
  if (!x) return null;
  const from = [task.date, todayIso].filter((v) => parse(v)).sort().pop();
  const d = parse(from);
  if (!d) return null;
  for (let i = 0; i < 400; i++) { d.setDate(d.getDate() + 1); if (matches(x, d)) return isoOf(d); }
  return null;
}

export const seriesOf = (t) => t?.seriesId || t?.id;

// Việc vừa xong → bản ghi lần kế tiếp (chưa có id) hoặc null nếu không lặp / đã có lần đó rồi (chống tạo trùng giữa nhiều máy)
export function rollNext(task, tasks, todayIso) {
  const date = nextDate(task, todayIso);
  if (!date) return null;
  const sid = seriesOf(task);
  if ((tasks || []).some((t) => t && t.id !== task.id && seriesOf(t) === sid && (t.date || "") >= date)) return null;
  const keep = ["title", "time", "dur", "priority", "note", "customerId", "est", "remind"];
  const out = { date, status: "todo", repeat: normRepeat(task.repeat, task.date), seriesId: sid };
  for (const k of keep) if (task[k] != null && task[k] !== "") out[k] = task[k];
  return out;
}

// So 2 bản danh sách: việc nào vừa chuyển sang "xong" (chỉ tính việc đã có ở bản trước và chưa xong)
export function newlyDone(prevStatus, tasks) {
  if (!prevStatus) return [];
  return (tasks || []).filter((t) => t && t.status === "done" && prevStatus.has(t.id) && prevStatus.get(t.id) !== "done");
}

// ───────── Nhắc trước giờ ─────────
export const startOf = (t) => { const d = parse(t?.date), m = /^(\d{1,2}):(\d{2})$/.exec(String(t?.time || "")); if (!d || !m) return null; d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); };
export const remindKey = (t) => `${t.id}|${t.date}|${t.time}|${t.remind}`;

// Việc CHƯA XONG có giờ + có hẹn nhắc, đang ở trong khoảng [giờ − nhắc, giờ) và chưa nhắc (theo khoá) → cần nhắc ngay
export function dueReminders(tasks, now, fired = new Set()) {
  const out = [];
  for (const t of tasks || []) {
    const mins = Number(t?.remind);
    if (!t || t.status === "done" || !(mins > 0)) continue;
    const start = startOf(t);
    if (start == null || now >= start || now < start - mins * 60000) continue;
    const key = remindKey(t);
    if (fired.has(key)) continue;
    out.push({ id: t.id, key, title: t.title, time: t.time, left: Math.max(1, Math.round((start - now) / 60000)) });
  }
  return out;
}

// Các lần lặp DỰ KIẾN (chưa tạo) của việc lặp đang mở, trong [fromIso, toIso] — để Lịch hiện trước các ngày sắp tới.
// Chỉ tính từ việc mới nhất còn mở của mỗi chuỗi; bỏ ngày đã có việc thật.
export function projectedOccurrences(tasks, fromIso, toIso, max = 62) {
  const latest = new Map();
  for (const t of tasks || []) {
    if (!t || !t.date || !normRepeat(t.repeat, t.date)) continue;
    const sid = seriesOf(t), cur = latest.get(sid);
    if (!cur || t.date > cur.date) latest.set(sid, t);
  }
  const have = new Set((tasks || []).filter((t) => t && t.date).map((t) => `${seriesOf(t)}|${t.date}`));
  const out = [];
  for (const [sid, t] of latest) {
    if (t.status === "done") continue;
    const x = normRepeat(t.repeat, t.date), d = parse(t.date), end = parse(toIso);
    if (!d || !end) continue;
    for (let i = 0, n = 0; i < 400 && n < max; i++) {
      d.setDate(d.getDate() + 1);
      if (d > end) break;
      const iso = isoOf(d);
      if (iso < fromIso || !matches(x, d) || have.has(`${sid}|${iso}`)) continue;
      out.push({ date: iso, title: t.title, seriesId: sid }); n++;
    }
  }
  return out;
}
