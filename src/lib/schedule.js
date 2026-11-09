// BÁO TRÙNG LỊCH + GỢI Ý GIỜ TRỐNG (09/11/2026) cho việc có giờ. Việc không ghi thời lượng mặc định 60 phút.
// Hai việc chỉ "chạm đầu" nhau (việc này kết thúc đúng lúc việc kia bắt đầu) thì KHÔNG tính là trùng.
export const DEFAULT_DUR = 60;
export const DUR_OPTIONS = [[15, "15 phút"], [30, "30 phút"], [45, "45 phút"], [60, "1 giờ"], [90, "1 giờ 30"], [120, "2 giờ"], [180, "3 giờ"]];

const pad = (n) => String(n).padStart(2, "0");
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
export const fromMin = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
export const durOf = (t) => { const d = Number(t?.dur); return d > 0 && d <= 24 * 60 ? d : DEFAULT_DUR; };
export const rangeLabel = (time, dur = DEFAULT_DUR) => { const s = toMin(time); return s == null ? "" : `${time}–${fromMin(Math.min(s + dur, 24 * 60 - 1))}`; };

// Các việc CHƯA XONG, cùng ngày, có giờ, trùng khoảng [time, time + dur)
export function findConflicts(tasks, { date, time, dur = DEFAULT_DUR, excludeId } = {}) {
  const s = toMin(time);
  if (!date || s == null) return [];
  const e = s + dur;
  return (tasks || [])
    .filter((t) => t && t.id !== excludeId && t.status !== "done" && t.date === date && toMin(t.time) != null)
    .filter((t) => { const a = toMin(t.time), b = a + durOf(t); return s < b && a < e; })
    .map((t) => ({ id: t.id, title: t.title, time: t.time, dur: durOf(t), label: rangeLabel(t.time, durOf(t)) }))
    .sort((x, y) => toMin(x.time) - toMin(y.time));
}

/**
 * Giờ bắt đầu còn trống gần giờ muốn nhất (bước 15 phút trong 08:00–21:00): ưu tiên sau giờ muốn, kèm 1 gợi ý sớm hơn nếu có.
 * @returns {string[]} tối đa `max` giờ dạng "HH:MM", sắp theo độ gần
 */
export function suggestSlots(tasks, { date, time, dur = DEFAULT_DUR, excludeId, dayStart = "08:00", dayEnd = "21:00", step = 15, max = 3 } = {}) {
  const want = toMin(time), lo = toMin(dayStart), hi = toMin(dayEnd);
  if (want == null || !date) return [];
  const busy = (tasks || []).filter((t) => t && t.id !== excludeId && t.status !== "done" && t.date === date && toMin(t.time) != null)
    .map((t) => [toMin(t.time), toMin(t.time) + durOf(t)]);
  const free = (s) => s >= lo && s + dur <= hi && !busy.some(([a, b]) => s < b && a < s + dur);
  const after = [], before = [];
  const first = Math.ceil(want / step) * step;
  for (let s = first === want ? want + step : first; s <= hi && after.length < max; s += step) if (free(s)) after.push(s);
  for (let s = Math.floor(want / step) * step - (Math.floor(want / step) * step === want ? step : 0); s >= lo && before.length < 1; s -= step) if (free(s)) before.push(s);
  const picked = [...after.slice(0, before.length ? max - 1 : max), ...before];
  return picked.sort((a, b) => Math.abs(a - want) - Math.abs(b - want)).map(fromMin);
}
