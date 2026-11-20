// SỨC KHOẺ — phần tính toán dùng CHUNG cho app (src/lib/health.js) và hàm nhắc trên máy chủ (index.ts).
// File thuần JS, KHÔNG import gì → chạy được cả trong trình duyệt, Deno và bộ kiểm thử.
// Giờ: mọi thứ theo giờ Việt Nam (UTC+7, không đổi giờ mùa).

const VN = 7 * 3600000;
export const dayKeyOf = (ms) => new Date(ms + VN).toISOString().slice(0, 10); // "2026-11-20" theo giờ VN
export const minOfDay = (ms) => { const d = new Date(ms + VN); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const dowOf = (ms) => new Date(ms + VN).getUTCDay(); // 0 = Chủ nhật
export const hmToMin = (s, dflt = 0) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : dflt; };
export const minToHm = (m) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
const n = (v) => Number(v) || 0;

// Cấu hình mặc định (người dùng chưa đặt gì)
export const DEFAULT_CFG = {
  profile: null, // { sex: "m"|"f", birthYear, heightCm, weightKg, activity, goal }
  water: { goalMl: 0, glassMl: 250, remind: { on: true, from: "08:00", to: "21:00", every: 90 } }, // goalMl 0 = tự tính theo cân nặng
  gym: { remind: { on: true, time: "18:00" } },
  fast: { on: false, start: "12:00", hours: 8, remind: true },
  weigh: { remind: false, time: "07:00" },
  weekly: { on: true },
  plan: { routines: [], week: {} }, // week: { "1": routineId, … } theo thứ (0 = CN)
  foods: [], // món tự thêm
  favs: [], // bữa quen
};
export function withDefaults(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const d = DEFAULT_CFG;
  return {
    ...d, ...c,
    water: { ...d.water, ...(c.water || {}), remind: { ...d.water.remind, ...(c.water?.remind || {}) } },
    gym: { ...d.gym, ...(c.gym || {}), remind: { ...d.gym.remind, ...(c.gym?.remind || {}) } },
    fast: { ...d.fast, ...(c.fast || {}) },
    weigh: { ...d.weigh, ...(c.weigh || {}) },
    weekly: { ...d.weekly, ...(c.weekly || {}) },
    plan: { ...(c.plan || {}), routines: Array.isArray(c.plan?.routines) ? c.plan.routines : [], week: c.plan?.week && typeof c.plan.week === "object" ? c.plan.week : {} }, // giữ thêm level / levelAt của lộ trình (máy chủ không dùng)
    foods: Array.isArray(c.foods) ? c.foods : [],
    favs: Array.isArray(c.favs) ? c.favs : [],
  };
}

// ===== NƯỚC =====
export const waterTotal = (day) => (day?.water || []).reduce((s, w) => s + n(w.ml), 0);
export const lastDrinkAt = (day) => (day?.water || []).reduce((m, w) => Math.max(m, n(w.t)), 0);
// Mục tiêu: đặt tay thì theo số đặt; không thì 35 ml × kg (làm tròn 50 ml), ngày có tập +500 ml. Chưa có cân nặng → 2000 ml.
export function waterGoal(cfg, day) {
  const c = withDefaults(cfg);
  const base = n(c.water.goalMl) > 0 ? n(c.water.goalMl) : c.profile?.weightKg ? Math.round((n(c.profile.weightKg) * 35) / 50) * 50 : 2000;
  return base + (day?.gym?.ex?.length ? 500 : 0);
}

// ===== ĂN =====
export function mealTotals(day) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const m of day?.meals || []) { const q = m.q == null ? 1 : n(m.q); t.kcal += n(m.kcal) * q; t.p += n(m.p) * q; t.c += n(m.c) * q; t.f += n(m.f) * q; }
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
}

// Mục tiêu theo mục đích: lệch calo so với mức tiêu hao + đạm theo kg cân nặng
export const GOALS = {
  recomp: { label: "Giảm mỡ + tăng cơ", kcal: -0.15, protein: 2.0, hint: "Ăn ít hơn mức tiêu hao khoảng 15%, đạm cao để giữ và tăng cơ" },
  cut: { label: "Giảm mỡ", kcal: -0.2, protein: 1.8, hint: "Ăn ít hơn mức tiêu hao khoảng 20%" },
  bulk: { label: "Tăng cơ", kcal: 0.1, protein: 1.8, hint: "Ăn nhiều hơn mức tiêu hao khoảng 10%" },
  keep: { label: "Giữ dáng", kcal: 0, protein: 1.6, hint: "Ăn bằng mức tiêu hao" },
};
export const ACTIVITY = [
  { k: 1.2, label: "Ít vận động (ngồi văn phòng, không tập)" },
  { k: 1.375, label: "Tập nhẹ 1–3 buổi một tuần" },
  { k: 1.55, label: "Tập 3–5 buổi một tuần" },
  { k: 1.725, label: "Tập nặng 6–7 buổi một tuần" },
];
// Công thức Mifflin-St Jeor. Trả null khi thiếu chỉ số.
export function targets(profile, nowYear = new Date().getFullYear()) {
  const p = profile || {};
  const w = n(p.weightKg), h = n(p.heightCm), age = p.birthYear ? nowYear - n(p.birthYear) : 0;
  if (w < 30 || h < 100 || age < 10 || age > 100) return null;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (p.sex === "f" ? -161 : 5));
  const tdee = Math.round(bmr * (n(p.activity) || 1.375));
  const g = GOALS[p.goal] || GOALS.recomp;
  const floor = p.sex === "f" ? 1200 : 1500; // không đặt mục tiêu thấp hơn mức an toàn tối thiểu
  const kcal = Math.max(floor, Math.round((tdee * (1 + g.kcal)) / 10) * 10);
  const protein = Math.round(w * g.protein);
  const fat = Math.round(w * 0.8);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr, tdee, kcal, protein, fat, carb, goal: g };
}

// ===== NHỊN ĂN THEO GIỜ =====
// Giờ ăn: từ `start` kéo dài `hours` tiếng. Trả { eating, left (phút tới lần đổi), until "HH:MM" }.
export function fastState(fast, nowMs) {
  const start = hmToMin(fast?.start, 720), len = Math.min(23, Math.max(1, n(fast?.hours) || 8)) * 60;
  const now = minOfDay(nowMs), since = (now - start + 1440) % 1440;
  const eating = since < len;
  const left = eating ? len - since : 1440 - since;
  return { eating, left, until: minToHm(now + left), start: minToHm(start), end: minToHm(start + len) };
}

// ===== TỔNG KẾT TUẦN =====
// days: { "YYYY-MM-DD": day } của 7 ngày gần nhất (tính cả hôm nay). prev: cân trung bình 7 ngày trước đó (nếu có).
export function weekStats(cfg, days, keys, prevKeys = []) {
  const avg = (ks) => { const v = ks.map((k) => n(days[k]?.weight)).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  let waterDays = 0, workouts = 0, kcalSum = 0, kcalDays = 0, pSum = 0;
  for (const k of keys) {
    const d = days[k]; if (!d) continue;
    if (waterTotal(d) >= waterGoal(cfg, d)) waterDays++;
    if (d.gym?.ex?.some((e) => (e.sets || []).length)) workouts++;
    const t = mealTotals(d); if (t.kcal > 0) { kcalSum += t.kcal; pSum += t.p; kcalDays++; }
  }
  const wNow = avg(keys), wPrev = avg(prevKeys);
  return { waterDays, workouts, kcalDays, avgKcal: kcalDays ? Math.round(kcalSum / kcalDays) : null, avgP: kcalDays ? Math.round(pSum / kcalDays) : null, weight: wNow, weightDelta: wNow != null && wPrev != null ? wNow - wPrev : null };
}
const vn1 = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");
export function weekText(st, plannedPerWeek = 0) {
  const parts = [`Nước: ${st.waterDays}/7 ngày đủ`, `Tập: ${st.workouts}${plannedPerWeek ? "/" + plannedPerWeek : ""} buổi`];
  if (st.avgKcal != null) parts.push(`Ăn TB ${st.avgKcal} kcal, ${st.avgP} g đạm`);
  if (st.weightDelta != null) parts.push(`Cân TB ${st.weightDelta > 0 ? "+" : ""}${vn1(st.weightDelta)} kg`);
  else if (st.weight != null) parts.push(`Cân TB ${vn1(st.weight)} kg`);
  return parts.join(" · ");
}

// ===== QUYẾT ĐỊNH NHẮC (máy chủ gọi 15 phút một lần) =====
// rs = trạng thái đã nhắc: { waterAt (ms), gym, fastOpen, fastClose, weigh, weekly (đều là "YYYY-MM-DD") }
// Trả { sends: [{ title, body, url, tag }], rs } — gọi lặp lại không gửi trùng.
const WINDOW = 60; // phút: qua giờ hẹn quá 60 phút thì thôi không nhắc bù
export function dueReminders({ cfg: raw, rs: rs0, day, nowMs, week }) {
  const cfg = withDefaults(raw), rs = { ...(rs0 || {}) }, sends = [];
  const today = dayKeyOf(nowMs), now = minOfDay(nowMs), dow = dowOf(nowMs);
  const inWin = (t) => now >= t && now < t + WINDOW;

  // Nước: trong khung giờ, chưa đủ, và đã quá `every` phút kể từ lần uống / lần nhắc gần nhất
  const wr = cfg.water.remind;
  if (wr.on) {
    const from = hmToMin(wr.from, 480), to = hmToMin(wr.to, 1260), every = Math.max(30, n(wr.every) || 90);
    const total = waterTotal(day), goal = waterGoal(cfg, day);
    if (now >= from && now <= to && total < goal) {
      const dayStart = nowMs - now * 60000; // 0h hôm nay (giờ VN)
      const lastNudge = n(rs.waterAt) >= dayStart ? n(rs.waterAt) : 0;
      const anchor = Math.max(lastDrinkAt(day), lastNudge) || dayStart + (from - every) * 60000; // chưa có gì → nhắc ngay đầu khung giờ
      if (nowMs - anchor >= every * 60000 - 60000) {
        const glass = n(cfg.water.glassMl) || 250;
        sends.push({ title: "💧 Uống nước nào", body: `Đã uống ${total}/${goal} ml. Uống xong bấm vào đây để ghi 1 ly ${glass} ml.`, url: `/suc-khoe?uong=${glass}`, tag: "sk-nuoc" });
        rs.waterAt = nowMs;
      }
    }
  }

  // Giờ tập: hôm nay có buổi trong lịch, tới giờ, chưa bắt đầu tập
  const rid = cfg.plan.week[String(dow)];
  const routine = rid && cfg.plan.routines.find((r) => r.id === rid);
  if (cfg.gym.remind.on && routine && rs.gym !== today && !day?.gym?.ex?.length && inWin(hmToMin(cfg.gym.remind.time, 1080))) {
    sends.push({ title: "🏋️ Tới giờ tập", body: `Hôm nay: ${routine.name} (${(routine.ex || []).length} bài). Bấm để mở buổi tập.`, url: "/suc-khoe?tab=gym", tag: "sk-tap" });
    rs.gym = today;
  }

  // Nhịn ăn theo giờ: báo lúc mở và lúc đóng giờ ăn
  if (cfg.fast.on && cfg.fast.remind) {
    const start = hmToMin(cfg.fast.start, 720), hours = Math.min(23, Math.max(1, n(cfg.fast.hours) || 8)), end = (start + hours * 60) % 1440;
    if (rs.fastOpen !== today && inWin(start)) { sends.push({ title: "🍽️ Bắt đầu giờ ăn", body: `Giờ ăn kéo dài ${hours} tiếng, tới ${minToHm(end)}.`, url: "/suc-khoe?tab=an", tag: "sk-nhin" }); rs.fastOpen = today; }
    if (rs.fastClose !== today && inWin(end)) { sends.push({ title: "⏳ Hết giờ ăn", body: `Bắt đầu nhịn ${24 - hours} tiếng, tới ${minToHm(start)}. Nước lọc, trà, cà phê đen vẫn uống được.`, url: "/suc-khoe?tab=an", tag: "sk-nhin" }); rs.fastClose = today; }
  }

  // Nhắc cân buổi sáng
  if (cfg.weigh.remind && rs.weigh !== today && !n(day?.weight) && inWin(hmToMin(cfg.weigh.time, 420))) {
    sends.push({ title: "⚖️ Cân buổi sáng", body: "Cân lúc mới ngủ dậy, sau khi đi vệ sinh, rồi nhập số vào app.", url: "/suc-khoe?can=1", tag: "sk-can" });
    rs.weigh = today;
  }

  // Tổng kết tuần: tối Chủ nhật 20h (cần `week` = { days, keys, prevKeys })
  if (cfg.weekly.on && dow === 0 && rs.weekly !== today && inWin(1200) && week) {
    const st = weekStats(cfg, week.days, week.keys, week.prevKeys);
    sends.push({ title: "📊 Tổng kết tuần sức khoẻ", body: weekText(st, Object.keys(cfg.plan.week).length), url: "/suc-khoe", tag: "sk-tuan" });
    rs.weekly = today;
  }
  return { sends, rs };
}
// Có cần lấy dữ liệu cả tuần không (chỉ tối Chủ nhật, chưa gửi) — để máy chủ khỏi đọc thừa
export function needsWeek(cfg, rs, nowMs) {
  const c = withDefaults(cfg), now = minOfDay(nowMs);
  return c.weekly.on && dowOf(nowMs) === 0 && (rs || {}).weekly !== dayKeyOf(nowMs) && now >= 1200 && now < 1200 + WINDOW;
}
// Có mục nhắc nào đang bật không (không bật gì → máy chủ bỏ qua người này)
export function anyRemind(cfg) {
  const c = withDefaults(cfg);
  return !!(c.water.remind.on || c.gym.remind.on || (c.fast.on && c.fast.remind) || c.weigh.remind || c.weekly.on);
}
