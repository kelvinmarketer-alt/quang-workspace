// SỨC KHOẺ (20/11/2026) — tính toán thuần (không gọi mạng) cho trang /suc-khoe. Phần dùng chung với máy chủ nhắc nằm ở
// supabase/functions/qws-health-remind/logic.js (một nguồn duy nhất — sửa công thức thì sửa ở đó).
export * from "../../supabase/functions/qws-health-remind/logic.js";
import { dayKeyOf, targets, waterTotal, waterGoal } from "../../supabase/functions/qws-health-remind/logic.js";

const n = (v) => Number(v) || 0;
export const uid = () => Math.random().toString(36).slice(2, 9);
const DAY = 86400000;
export const lastKeys = (count, nowMs = Date.now()) => [...Array(count)].map((_, i) => dayKeyOf(nowMs - i * DAY)); // hôm nay trước
export const dm = (key) => { const [, m, d] = String(key || "").split("-"); return d ? `${Number(d)}/${Number(m)}` : ""; };
export const vnNum = (v, digits = 1) => (v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: digits }));

// ===== MÓN ĂN VIỆT — số ƯỚC LƯỢNG cho 1 phần thường gặp (kcal, đạm p, tinh bột c, béo f tính bằng gam) =====
// Nguồn: bảng thành phần thực phẩm phổ biến + khẩu phần quán thông thường; chênh ±15% là bình thường.
const F = (name, unit, kcal, p, c, f, g = "") => ({ name, unit, kcal, p, c, f, g });
export const FOODS = [
  F("Cơm trắng", "1 bát (150 g)", 195, 4, 43, 0.5, "Cơm & tinh bột"),
  F("Cơm tấm sườn bì chả", "1 đĩa", 700, 32, 85, 25, "Cơm & tinh bột"),
  F("Cơm gà xối mỡ", "1 đĩa", 700, 30, 80, 28, "Cơm & tinh bột"),
  F("Cơm rang dưa bò", "1 đĩa", 650, 25, 85, 22, "Cơm & tinh bột"),
  F("Cơm chiên dương châu", "1 đĩa", 600, 18, 80, 22, "Cơm & tinh bột"),
  F("Cơm bình dân (thịt + rau + canh)", "1 suất", 650, 28, 85, 20, "Cơm & tinh bột"),
  F("Khoai lang luộc", "100 g", 86, 1.6, 20, 0.1, "Cơm & tinh bột"),
  F("Yến mạch", "40 g khô", 150, 5, 27, 3, "Cơm & tinh bột"),
  F("Bánh mì không", "1 ổ", 240, 8, 48, 2, "Cơm & tinh bột"),
  F("Phở bò", "1 tô", 450, 25, 55, 13, "Bún phở mì"),
  F("Phở gà", "1 tô", 400, 24, 55, 9, "Bún phở mì"),
  F("Bún chả", "1 suất", 550, 28, 65, 20, "Bún phở mì"),
  F("Bún bò Huế", "1 tô", 520, 27, 60, 18, "Bún phở mì"),
  F("Bún riêu", "1 tô", 430, 20, 55, 14, "Bún phở mì"),
  F("Bún đậu mắm tôm", "1 mẹt", 650, 30, 70, 28, "Bún phở mì"),
  F("Miến gà", "1 tô", 380, 20, 55, 8, "Bún phở mì"),
  F("Hủ tiếu", "1 tô", 400, 20, 55, 10, "Bún phở mì"),
  F("Mì tôm", "1 gói", 350, 7, 50, 14, "Bún phở mì"),
  F("Mì xào bò", "1 đĩa", 600, 25, 70, 24, "Bún phở mì"),
  F("Cháo lòng", "1 bát", 400, 20, 45, 14, "Bún phở mì"),
  F("Bánh mì thịt", "1 ổ", 430, 17, 50, 18, "Ăn sáng & ăn vặt"),
  F("Bánh mì trứng ốp la", "1 ổ", 380, 14, 45, 15, "Ăn sáng & ăn vặt"),
  F("Xôi xéo", "1 gói", 500, 12, 80, 14, "Ăn sáng & ăn vặt"),
  F("Xôi gà", "1 gói", 600, 25, 80, 18, "Ăn sáng & ăn vặt"),
  F("Bánh cuốn", "1 đĩa", 400, 14, 60, 11, "Ăn sáng & ăn vặt"),
  F("Bánh bao nhân thịt", "1 cái", 330, 12, 45, 11, "Ăn sáng & ăn vặt"),
  F("Bánh xèo", "1 cái", 350, 12, 30, 20, "Ăn sáng & ăn vặt"),
  F("Bánh chưng", "1/8 cái", 270, 9, 40, 8, "Ăn sáng & ăn vặt"),
  F("Gỏi cuốn", "1 cái", 70, 4, 10, 1.5, "Ăn sáng & ăn vặt"),
  F("Nem rán", "1 cái", 90, 3, 7, 6, "Ăn sáng & ăn vặt"),
  F("Chè", "1 cốc", 300, 4, 60, 5, "Ăn sáng & ăn vặt"),
  F("Ức gà luộc / áp chảo", "100 g", 165, 31, 0, 3.6, "Thịt cá trứng"),
  F("Đùi gà bỏ da", "100 g", 180, 25, 0, 8, "Thịt cá trứng"),
  F("Gà rán", "1 miếng", 250, 16, 9, 16, "Thịt cá trứng"),
  F("Thịt bò nạc", "100 g", 200, 26, 0, 10, "Thịt cá trứng"),
  F("Bò lúc lắc", "1 đĩa", 400, 30, 10, 26, "Thịt cá trứng"),
  F("Thịt lợn nạc", "100 g", 145, 21, 0, 6, "Thịt cá trứng"),
  F("Thịt ba chỉ luộc", "100 g", 500, 10, 0, 50, "Thịt cá trứng"),
  F("Thịt kho trứng", "1 phần", 400, 22, 8, 30, "Thịt cá trứng"),
  F("Sườn nướng", "1 miếng (100 g)", 290, 20, 5, 21, "Thịt cá trứng"),
  F("Thịt nướng", "100 g", 250, 22, 3, 17, "Thịt cá trứng"),
  F("Xúc xích", "1 cây", 150, 6, 2, 13, "Thịt cá trứng"),
  F("Cá hồi", "100 g", 208, 20, 0, 13, "Thịt cá trứng"),
  F("Cá trắng (basa, rô phi)", "100 g", 110, 18, 0, 4, "Thịt cá trứng"),
  F("Cá kho", "100 g", 180, 20, 5, 9, "Thịt cá trứng"),
  F("Tôm luộc", "100 g", 99, 24, 0, 0.3, "Thịt cá trứng"),
  F("Trứng gà luộc", "1 quả", 72, 6.3, 0.4, 5, "Thịt cá trứng"),
  F("Trứng ốp la", "1 quả", 95, 6.3, 0.4, 7.5, "Thịt cá trứng"),
  F("Đậu phụ luộc", "100 g", 76, 8, 2, 4.5, "Thịt cá trứng"),
  F("Đậu phụ rán", "1 bìa", 150, 10, 4, 11, "Thịt cá trứng"),
  F("Lẩu", "1 người", 700, 40, 50, 35, "Thịt cá trứng"),
  F("Rau luộc", "1 đĩa (200 g)", 50, 4, 8, 0.5, "Rau & canh"),
  F("Rau xào", "1 đĩa", 120, 4, 10, 8, "Rau & canh"),
  F("Canh rau", "1 bát", 40, 2, 5, 1, "Rau & canh"),
  F("Canh chua cá", "1 bát", 120, 12, 8, 4, "Rau & canh"),
  F("Salad ức gà", "1 đĩa", 300, 30, 12, 14, "Rau & canh"),
  F("Chuối", "1 quả", 105, 1.3, 27, 0.4, "Trái cây & hạt"),
  F("Táo", "1 quả", 95, 0.5, 25, 0.3, "Trái cây & hạt"),
  F("Bơ", "nửa quả", 160, 2, 9, 15, "Trái cây & hạt"),
  F("Hạt điều", "30 g", 170, 5, 9, 13, "Trái cây & hạt"),
  F("Lạc rang", "30 g", 170, 7, 5, 14, "Trái cây & hạt"),
  F("Sữa tươi không đường", "1 hộp 180 ml", 110, 6, 8.5, 6, "Đồ uống"),
  F("Sữa chua không đường", "1 hộp 100 g", 60, 3.5, 5, 3, "Đồ uống"),
  F("Sữa đậu nành không đường", "200 ml", 80, 7, 4, 4, "Đồ uống"),
  F("Whey protein", "1 muỗng (30 g)", 120, 24, 3, 1.5, "Đồ uống"),
  F("Cà phê đen", "1 ly", 5, 0, 1, 0, "Đồ uống"),
  F("Cà phê sữa đá", "1 ly", 120, 2, 20, 3.5, "Đồ uống"),
  F("Trà sữa trân châu", "1 ly 500 ml", 400, 4, 70, 12, "Đồ uống"),
  F("Nước ngọt", "1 lon", 140, 0, 35, 0, "Đồ uống"),
  F("Bia", "1 lon 330 ml", 140, 1, 11, 0, "Đồ uống"),
  F("Pizza", "1 miếng", 285, 12, 36, 10, "Đồ ăn nhanh"),
  F("Hamburger", "1 cái", 350, 17, 35, 15, "Đồ ăn nhanh"),
  F("Khoai tây chiên", "1 phần vừa", 340, 4, 44, 16, "Đồ ăn nhanh"),
];
// Tìm không phân biệt dấu / hoa thường
export const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
export function searchFoods(q, custom = []) {
  const all = [...(custom || []).map((x) => ({ ...x, g: "Món của tôi" })), ...FOODS];
  const k = fold(q).trim();
  return k ? all.filter((x) => fold(x.name).includes(k)) : all;
}
export const MEAL_SLOTS = [["sang", "Sáng"], ["trua", "Trưa"], ["toi", "Tối"], ["phu", "Bữa phụ"]];
export const slotByHour = (h) => (h < 10 ? "sang" : h < 15 ? "trua" : h < 21 ? "toi" : "phu");

// ===== LỊCH TẬP MẪU =====
// step = mức tăng tạ mỗi lần (kg). Bài không tạ (hít xà, plank…) để step 0 → gợi ý tăng số lần.
const E = (name, sets, reps, step = 2.5) => ({ name, sets, reps, step });
export const PLAN_TEMPLATES = [
  {
    id: "ppl", label: "3 buổi: Đẩy · Kéo · Chân", hint: "Phổ biến nhất cho người tập 3 buổi/tuần (thứ 2, 4, 6)", days: [1, 3, 5],
    routines: [
      { name: "Đẩy (ngực, vai, tay sau)", ex: [E("Đẩy ngực tạ đòn", 4, 8), E("Đẩy ngực dốc lên tạ đơn", 3, 10, 2), E("Đẩy vai tạ đơn", 3, 10, 2), E("Dang tạ vai ngang", 3, 12, 1), E("Kéo cáp tay sau", 3, 12)] },
      { name: "Kéo (lưng, tay trước)", ex: [E("Kéo xô máy", 4, 10), E("Kéo tạ đòn gập người", 4, 8), E("Kéo cáp ngồi", 3, 10), E("Kéo dây mặt (face pull)", 3, 12), E("Cuốn tạ tay trước", 3, 12, 1)] },
      { name: "Chân & bụng", ex: [E("Gánh tạ (squat)", 4, 8, 5), E("Đạp đùi máy", 3, 10, 5), E("Gập người tạ đòn (Romanian deadlift)", 3, 10, 5), E("Móc đùi sau máy", 3, 12), E("Nhón bắp chuối", 3, 15, 5), E("Plank (giây)", 3, 45, 0)] },
    ],
  },
  {
    id: "ul", label: "4 buổi: Thân trên · Thân dưới", hint: "Mỗi nhóm cơ tập 2 lần/tuần (thứ 2, 3, 5, 6)", days: [1, 2, 4, 5],
    routines: [
      { name: "Thân trên A (nặng)", ex: [E("Đẩy ngực tạ đòn", 4, 6), E("Kéo tạ đòn gập người", 4, 6), E("Đẩy vai tạ đòn", 3, 8), E("Kéo xô máy", 3, 10), E("Cuốn tạ tay trước", 3, 12, 1)] },
      { name: "Thân dưới A (nặng)", ex: [E("Gánh tạ (squat)", 4, 6, 5), E("Gập người tạ đòn (Romanian deadlift)", 3, 8, 5), E("Đạp đùi máy", 3, 10, 5), E("Nhón bắp chuối", 3, 15, 5), E("Plank (giây)", 3, 45, 0)] },
      { name: "Thân trên B (nhiều lần)", ex: [E("Đẩy ngực dốc lên tạ đơn", 3, 10, 2), E("Kéo cáp ngồi", 3, 10), E("Dang tạ vai ngang", 3, 15, 1), E("Kéo dây mặt (face pull)", 3, 15), E("Kéo cáp tay sau", 3, 12)] },
      { name: "Thân dưới B (nhiều lần)", ex: [E("Kéo tạ đất (deadlift)", 3, 5, 5), E("Chùng chân tạ đơn (lunge)", 3, 10, 2), E("Đá đùi trước máy", 3, 12), E("Móc đùi sau máy", 3, 12), E("Gập bụng", 3, 15, 0)] },
    ],
  },
  {
    id: "home", label: "3 buổi toàn thân tại nhà", hint: "Không cần máy: chỉ cần tạ đơn hoặc dây kháng lực", days: [1, 3, 5],
    routines: [
      { name: "Toàn thân A", ex: [E("Chống đẩy", 4, 12, 0), E("Gánh tạ đơn ôm ngực (goblet squat)", 4, 12, 2), E("Kéo tạ đơn một tay", 3, 12, 2), E("Đẩy vai tạ đơn", 3, 12, 2), E("Plank (giây)", 3, 45, 0)] },
      { name: "Toàn thân B", ex: [E("Chùng chân tạ đơn (lunge)", 3, 12, 2), E("Chống đẩy tay hẹp", 3, 10, 0), E("Gập người tạ đơn (Romanian deadlift)", 3, 12, 2), E("Cuốn tạ tay trước", 3, 12, 1), E("Gập bụng", 3, 15, 0)] },
      { name: "Toàn thân C", ex: [E("Hít xà (hoặc kéo dây)", 4, 8, 0), E("Gánh tạ đơn ôm ngực (goblet squat)", 4, 15, 2), E("Chống đẩy dốc chân cao", 3, 10, 0), E("Dang tạ vai ngang", 3, 15, 1), E("Leo núi tại chỗ (giây)", 3, 30, 0)] },
    ],
  },
];
// Dựng plan từ mẫu: gán id + xếp các buổi lần lượt vào các thứ trong tuần
export function planFromTemplate(tpl) {
  const routines = tpl.routines.map((r) => ({ id: "r" + uid(), name: r.name, ex: r.ex.map((e) => ({ ...e })) }));
  const week = {};
  tpl.days.forEach((d, i) => { week[String(d)] = routines[i % routines.length].id; });
  return { routines, week };
}
export const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// ===== TẬP: LẦN TRƯỚC + GỢI Ý TĂNG TẠ =====
// days: { key: day }. Trả buổi gần nhất (trước `beforeKey`) có bài này: { key, sets: [{kg, reps}] }
export function lastSession(days, exName, beforeKey) {
  const keys = Object.keys(days || {}).filter((k) => !beforeKey || k < beforeKey).sort().reverse();
  for (const k of keys) {
    const e = (days[k]?.gym?.ex || []).find((x) => x.name === exName && (x.sets || []).length);
    if (e) return { key: k, sets: e.sets, feel: days[k].gym.feel || null, pain: !!days[k].gym.pain };
  }
  return null;
}
// Tăng tải từ từ: buổi trước làm ĐỦ số hiệp và mọi hiệp đủ số lần ở cùng mức tạ → +step kg; không thì giữ mức, cố thêm lần.
// Bài không tạ (step 0 hoặc kg = 0) → thêm 1–2 lần mỗi hiệp.
export function suggest(last, ex) {
  const sets = last?.sets || [];
  if (!sets.length) return { kg: null, reps: n(ex.reps), up: false, text: n(ex.step) ? "Buổi đầu: chọn mức tạ làm đủ số lần mà vẫn còn sức 2–3 lần nữa" : "Buổi đầu: làm theo mục tiêu, chậm và đúng động tác" };
  const top = Math.max(...sets.map((s) => n(s.kg)));
  const atTop = sets.filter((s) => n(s.kg) === top);
  const full = sets.length >= n(ex.sets) && atTop.length >= n(ex.sets) && atTop.every((s) => n(s.reps) >= n(ex.reps));
  const step = n(ex.step);
  // Buổi trước báo đau khớp → lùi một bậc; báo "nặng" → chưa tăng dù đã đủ hiệp (người mới: an toàn trước)
  if (last.pain && top && step) { const kg = Math.max(0, top - step); return { kg, reps: n(ex.reps), up: false, text: `Buổi trước có đau khớp → giảm xuống ${vnNum(kg)} kg, tập chậm và đúng động tác` }; }
  if (last.feel === "nang" && full && top && step) return { kg: top, reps: n(ex.reps), up: false, text: `Buổi trước đủ hiệp nhưng thấy nặng → giữ ${vnNum(top)} kg thêm một buổi` };
  if (!top || !step) {
    const best = Math.max(...sets.map((s) => n(s.reps)));
    return full ? { kg: top || 0, reps: best + 1, up: true, text: `Lần trước đủ ${n(ex.sets)}×${n(ex.reps)} → thử ${best + 1} mỗi hiệp` } : { kg: top || 0, reps: n(ex.reps), up: false, text: `Giữ mục tiêu ${n(ex.reps)} mỗi hiệp` };
  }
  return full
    ? { kg: top + step, reps: n(ex.reps), up: true, text: `Lần trước đủ ${n(ex.sets)}×${n(ex.reps)} ở ${vnNum(top)} kg → tăng lên ${vnNum(top + step)} kg` }
    : { kg: top, reps: n(ex.reps), up: false, text: `Giữ ${vnNum(top)} kg, cố đủ ${n(ex.reps)} lần mỗi hiệp rồi mới tăng` };
}
// Sức mạnh ước tính 1 lần tối đa (Epley) — để so tiến bộ giữa các buổi khác mức tạ / số lần
export const est1RM = (kg, reps) => (n(kg) > 0 && n(reps) > 0 ? n(kg) * (1 + Math.min(n(reps), 15) / 30) : 0);
export const sessionBest = (sets) => Math.max(0, ...(sets || []).map((s) => est1RM(s.kg, s.reps)));
export const sessionVolume = (gym) => (gym?.ex || []).reduce((s, e) => s + (e.sets || []).reduce((a, x) => a + n(x.kg) * n(x.reps), 0), 0);
// Lịch sử 1 bài: [{ key, best, top }] theo ngày tăng dần
export function exHistory(days, exName) {
  return Object.keys(days || {}).sort().flatMap((k) => {
    const e = (days[k]?.gym?.ex || []).find((x) => x.name === exName && (x.sets || []).length);
    return e ? [{ key: k, best: sessionBest(e.sets), top: Math.max(...e.sets.map((s) => n(s.kg))), reps: Math.max(...e.sets.map((s) => n(s.reps))) }] : [];
  });
}
export const exNames = (days) => [...new Set(Object.values(days || {}).flatMap((d) => (d?.gym?.ex || []).filter((e) => (e.sets || []).length).map((e) => e.name)))];
// Có phải kỷ lục mới không (so với mọi buổi TRƯỚC ngày đó)
export function isRecord(days, exName, key, sets) {
  const before = exHistory(days, exName).filter((h) => h.key < key);
  const cur = sessionBest(sets);
  return cur > 0 && before.length > 0 && cur > Math.max(...before.map((h) => h.best)) + 0.01;
}

// ===== CÂN NẶNG: đường trung bình 7 ngày =====
// Trả [{ key, kg (số cân ngày đó hoặc null), avg (trung bình các lần cân trong 7 ngày tính tới ngày đó) }] cho `count` ngày gần nhất, cũ → mới
export function weightSeries(days, count = 60, nowMs = Date.now()) {
  const keys = lastKeys(count + 6, nowMs).reverse();
  const out = [];
  for (let i = 6; i < keys.length; i++) {
    const win = keys.slice(i - 6, i + 1).map((k) => n(days?.[k]?.weight)).filter((x) => x > 0);
    out.push({ key: keys[i], kg: n(days?.[keys[i]]?.weight) || null, avg: win.length ? win.reduce((a, b) => a + b, 0) / win.length : null });
  }
  return out;
}
// Xu hướng mỗi tuần (kg/tuần) từ đường trung bình: điểm mới nhất so với điểm cách đó ≥7 ngày
export function weightTrend(series) {
  const pts = series.filter((x) => x.avg != null);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1], li = series.indexOf(last);
  const prev = [...pts].reverse().find((x) => li - series.indexOf(x) >= 7) || pts[0];
  const gap = li - series.indexOf(prev);
  return gap >= 3 ? ((last.avg - prev.avg) / gap) * 7 : null;
}
// Nhận xét tốc độ đổi cân theo mục tiêu (lời thường)
export function trendNote(perWeek, weightKg, goal) {
  if (perWeek == null) return "Cân thêm vài ngày nữa để thấy xu hướng.";
  const pct = weightKg ? (perWeek / weightKg) * 100 : 0;
  if (goal === "bulk") return perWeek < 0.05 ? "Cân chưa tăng: thêm khoảng 150–200 kcal mỗi ngày." : pct > 0.5 ? "Tăng hơi nhanh, dễ lên mỡ: bớt khoảng 150 kcal mỗi ngày." : "Tốc độ tăng vừa đẹp.";
  if (goal === "keep") return Math.abs(perWeek) <= 0.25 ? "Cân đang giữ ổn định." : perWeek > 0 ? "Cân đang nhích lên: bớt ăn vặt, nước ngọt." : "Cân đang giảm: ăn thêm một bữa phụ.";
  if (perWeek > -0.1) return "Cân chưa giảm: bớt khoảng 150–200 kcal mỗi ngày (ít cơm, bỏ nước ngọt) hoặc thêm 20 phút đi bộ.";
  if (pct < -1) return "Giảm hơi nhanh, dễ mất cơ: ăn thêm khoảng 150–200 kcal và giữ đủ đạm.";
  return "Tốc độ giảm vừa đẹp (0,3–1% cân nặng mỗi tuần), giữ như vậy.";
}

// ===== HÌNH MẪU + CÁCH TẬP TỪNG ĐỘNG TÁC (20/11, sếp: người mới cần hình để học theo) =====
// Ảnh: bộ Free Exercise DB (phạm vi công cộng — Unlicense, bản f00c92c), 2 ảnh mỗi bài: tư thế bắt đầu và kết thúc.
const IMG_BASE = "/health/ex/"; // 20/11: ảnh đã tải vào app (public/health/ex, thu nhỏ 640px) → xem được cả khi mất mạng
const G = (img, muscle, cues) => ({ img, muscle, cues });
export const EX_INFO = {
  "Đi bộ nhanh (phút)": G("Walking_Treadmill", "Tim mạch, khởi động", ["Đi nhanh tới mức hơi thở gấp nhưng vẫn nói chuyện được", "Vung tay tự nhiên, lưng thẳng, mắt nhìn trước", "Trên máy chạy: tốc độ 5–6, có thể thêm dốc 2–3"]),
  "Đứng lên ngồi xuống (squat không tạ)": G("Bodyweight_Squat", "Đùi, mông", ["Chân rộng bằng vai, mũi chân hơi mở", "Đẩy mông ra sau như ngồi xuống ghế, gối không chụm vào trong", "Xuống tới khi đùi gần ngang sàn rồi đứng thẳng lên. Mới tập có thể đặt ghế phía sau, chạm ghế rồi đứng lên"]),
  "Chống đẩy tay cao (tay đặt lên ghế)": G("Incline_Push-Up", "Ngực, vai, tay sau", ["Hai tay đặt lên mép ghế / bàn chắc chắn, rộng hơn vai một chút", "Người thẳng một đường từ đầu tới gót, siết bụng", "Hạ ngực gần chạm mép ghế rồi đẩy lên. Chỗ tựa càng cao càng nhẹ"]),
  "Chống đẩy": G("Pushups", "Ngực, vai, tay sau", ["Tay rộng hơn vai, người thẳng một đường, siết bụng và mông", "Hạ ngực gần chạm sàn, khuỷu tay chếch 45 độ so với thân", "Chưa đủ sức thì quỳ gối xuống sàn, vẫn giữ lưng thẳng"]),
  "Chống đẩy tay hẹp": G("Push-Ups_-_Close_Triceps_Position", "Tay sau, ngực", ["Hai tay đặt hẹp ngay dưới vai", "Khuỷu tay ép sát thân khi hạ xuống", "Người thẳng, không võng lưng"]),
  "Chống đẩy dốc chân cao": G("Push-Ups_With_Feet_Elevated", "Ngực trên, vai", ["Hai chân đặt lên ghế, tay chống sàn", "Siết bụng để lưng không võng", "Hạ chậm, đẩy lên dứt khoát"]),
  "Kéo xô máy": G("Wide-Grip_Lat_Pulldown", "Lưng xô", ["Ngồi chắc, đùi cài dưới đệm, nắm thanh rộng hơn vai", "Ưỡn ngực nhẹ, kéo thanh xuống ngực trên bằng cách kéo khuỷu tay xuống", "Thả lên chậm tới khi tay gần thẳng. Không ngả người giật"]),
  "Kéo cáp ngồi": G("Seated_Cable_Rows", "Lưng giữa", ["Ngồi lưng thẳng, gối hơi chùng", "Kéo tay cầm về bụng, ép hai bả vai vào nhau", "Thả ra chậm, không đổ người theo"]),
  "Cầu mông": G("Butt_Lift_Bridge", "Mông, đùi sau", ["Nằm ngửa, gối gập, bàn chân sát mông", "Đạp gót, nâng hông tới khi gối – hông – vai thẳng hàng", "Siết mông 1 giây ở trên rồi hạ chậm"]),
  "Plank (giây)": G("Plank", "Bụng, lưng dưới", ["Chống khuỷu tay ngay dưới vai, người thẳng một đường", "Siết bụng và mông, không để hông võng hay chổng lên", "Thở đều. Mỏi quá thì hạ gối xuống sàn"]),
  "Gập bụng": G("Crunches", "Bụng", ["Nằm ngửa, gối gập, tay đặt nhẹ sau tai", "Cuộn vai rời sàn bằng cơ bụng, không kéo cổ", "Hạ chậm, lưng dưới luôn chạm sàn"]),
  "Leo núi tại chỗ (giây)": G("Mountain_Climbers", "Bụng, tim mạch", ["Tư thế chống đẩy tay thẳng", "Kéo lần lượt từng gối về ngực", "Giữ hông thấp, nhịp đều"]),
  "Đạp đùi máy": G("Leg_Press", "Đùi, mông", ["Lưng và mông ép sát đệm, chân rộng bằng vai trên bàn đạp", "Hạ tới khi gối gập khoảng 90 độ, gối không chụm vào trong", "Đạp lên nhưng không khoá thẳng gối"]),
  "Đẩy ngực máy": G("Machine_Bench_Press", "Ngực, vai, tay sau", ["Chỉnh ghế để tay cầm ngang ngực", "Lưng tựa sát, đẩy ra tới khi tay gần thẳng", "Thu về chậm trong 2 giây"]),
  "Đẩy vai tạ đơn": G("Seated_Dumbbell_Press", "Vai", ["Ngồi tựa lưng, tạ ngang tai, lòng bàn tay hướng trước", "Đẩy thẳng lên đầu, không ưỡn lưng", "Hạ chậm về ngang tai"]),
  "Gánh tạ đơn ôm ngực (goblet squat)": G("Goblet_Squat", "Đùi, mông, bụng", ["Ôm một quả tạ sát ngực, khuỷu tay hướng xuống", "Ngồi xuống giữa hai chân, lưng thẳng, gót không nhấc", "Đứng lên bằng cách đạp gót"]),
  "Đẩy ngực tạ đơn": G("Dumbbell_Bench_Press", "Ngực, vai, tay sau", ["Nằm ghế phẳng, chân đạp sàn, tạ ngang ngực", "Đẩy lên tới khi tay gần thẳng, hai tạ gần nhau", "Hạ chậm tới khi khuỷu tay ngang thân"]),
  "Đẩy ngực dốc lên tạ đơn": G("Incline_Dumbbell_Press", "Ngực trên, vai", ["Ghế dốc 30–45 độ", "Đẩy tạ thẳng lên trên ngực trên", "Hạ chậm, khuỷu tay chếch 45 độ"]),
  "Kéo tạ đơn một tay": G("One-Arm_Dumbbell_Row", "Lưng", ["Một tay và một gối chống lên ghế, lưng phẳng", "Kéo tạ về hông, khuỷu tay sát thân", "Hạ chậm tới khi tay thẳng"]),
  "Cuốn tạ tay trước": G("Dumbbell_Bicep_Curl", "Tay trước", ["Đứng thẳng, khuỷu tay ép sát sườn", "Cuốn tạ lên vai, không đánh lưng lấy đà", "Hạ chậm"]),
  "Kéo cáp tay sau": G("Triceps_Pushdown", "Tay sau", ["Khuỷu tay ép sát sườn và giữ yên", "Ấn thanh xuống tới khi tay thẳng", "Thả lên chậm tới ngang ngực"]),
  "Gập người tạ đơn (Romanian deadlift)": G("Stiff-Legged_Dumbbell_Deadlift", "Đùi sau, mông, lưng dưới", ["Gối hơi chùng, lưng thẳng suốt động tác", "Đẩy mông ra sau, tạ trượt sát chân tới giữa ống chân", "Đứng lên bằng cách siết mông, không cong lưng"]),
  "Gập người tạ đòn (Romanian deadlift)": G("Romanian_Deadlift", "Đùi sau, mông, lưng dưới", ["Gối hơi chùng, lưng thẳng suốt động tác", "Đẩy mông ra sau, thanh đòn trượt sát chân tới giữa ống chân", "Đứng lên bằng cách siết mông, không cong lưng"]),
  "Móc đùi sau máy": G("Lying_Leg_Curls", "Đùi sau", ["Đệm đặt trên gót chân, hông ép sát ghế", "Cuốn gót về mông", "Hạ chậm, không để rơi tạ"]),
  "Đá đùi trước máy": G("Leg_Extensions", "Đùi trước", ["Lưng tựa sát, đệm đặt trên cổ chân", "Duỗi thẳng chân, siết đùi 1 giây", "Hạ chậm"]),
  "Nhón bắp chuối": G("Standing_Calf_Raises", "Bắp chân", ["Đứng mũi chân trên bậc, gót thả xuống", "Nhón lên cao hết mức, giữ 1 giây", "Hạ chậm xuống dưới mặt bậc"]),
  "Chùng chân tạ đơn (lunge)": G("Dumbbell_Lunges", "Đùi, mông", ["Bước một chân dài ra trước, thân thẳng", "Hạ tới khi cả hai gối gập 90 độ, gối sau gần chạm sàn", "Đạp chân trước để về vị trí cũ, đổi bên"]),
  "Dang tạ vai ngang": G("Side_Lateral_Raise", "Vai giữa", ["Tạ nhẹ, khuỷu tay hơi chùng", "Dang tay sang ngang tới ngang vai", "Hạ chậm, không nhún người lấy đà"]),
  "Kéo dây mặt (face pull)": G("Face_Pull", "Vai sau, lưng trên", ["Cáp ngang mặt, nắm hai đầu dây", "Kéo về phía mặt, khuỷu tay cao ngang vai", "Ép bả vai, thả ra chậm"]),
  "Đẩy ngực tạ đòn": G("Barbell_Bench_Press_-_Medium_Grip", "Ngực, vai, tay sau", ["Nằm mắt ngay dưới thanh đòn, chân đạp chắc xuống sàn, ép bả vai", "Hạ thanh đòn chạm nhẹ giữa ngực, khuỷu tay chếch 45 độ", "Đẩy lên thẳng. Tạ nặng phải có người đỡ hoặc tập trong khung an toàn"]),
  "Đẩy vai tạ đòn": G("Standing_Military_Press", "Vai", ["Đứng chân rộng bằng vai, thanh đòn ngang xương đòn", "Siết bụng và mông, đẩy thẳng lên đầu", "Hạ chậm, không ưỡn lưng"]),
  "Kéo tạ đòn gập người": G("Bent_Over_Barbell_Row", "Lưng", ["Gập người khoảng 45 độ, lưng phẳng, gối chùng", "Kéo thanh đòn về bụng dưới", "Hạ chậm, không giật người"]),
  "Gánh tạ (squat)": G("Barbell_Squat", "Đùi, mông", ["Thanh đòn đặt trên cơ vai (không phải cổ), chân rộng bằng vai", "Hít sâu, siết bụng, ngồi xuống tới khi đùi ngang sàn, gối theo hướng mũi chân", "Đạp gót đứng lên. Luôn tập trong khung có thanh an toàn"]),
  "Kéo tạ đất (deadlift)": G("Barbell_Deadlift", "Lưng, mông, đùi sau", ["Thanh đòn sát ống chân, tay nắm ngoài hai gối", "Lưng phẳng, ngực ưỡn, đạp sàn để nâng tạ lên", "Đứng thẳng rồi hạ tạ theo đường cũ. Bài khó: học với tạ nhẹ trước"]),
  "Hít xà (hoặc kéo dây)": G("Pullups", "Lưng xô, tay trước", ["Nắm xà rộng hơn vai", "Kéo người lên tới khi cằm qua xà", "Hạ chậm. Chưa kéo được thì dùng dây trợ lực hoặc kéo xô máy"]),
};
export const exInfo = (name) => EX_INFO[name] || null;
export const exImgs = (name) => { const i = EX_INFO[name]; return i ? [0, 1].map((k) => `${IMG_BASE}${i.img}/${k}.jpg`) : []; };
export const exVideoUrl = (name) => `https://www.youtube.com/results?search_query=${encodeURIComponent(name.replace(/\s*\(giây\)|\s*\(phút\)/g, "") + " hướng dẫn đúng kỹ thuật")}`;

// ===== LỘ TRÌNH THEO CẤP: dễ → khó (20/11, sếp là người mới: không ép bài khó ngay) =====
// need = số buổi cần hoàn thành ở cấp này trước khi app gợi ý lên cấp. Lên / xuống cấp luôn do người dùng bấm.
export const LEVELS = [
  {
    lv: 1, name: "Làm quen", weeks: "Tuần 1–4", time: "20–25 phút", need: 9, days: [1, 3, 5],
    goal: "Tạo thói quen đi tập 3 buổi mỗi tuần. Bài rất nhẹ, không cần tạ nặng.",
    tips: ["Chỉ cần ĐẾN ĐỦ BUỔI, chưa cần tập nặng", "Mỗi bài 2 hiệp, nghỉ 60–90 giây giữa hiệp", "Tập xong vẫn thấy còn sức là đúng"],
    routines: [{ name: "Toàn thân nhẹ", ex: [E("Đi bộ nhanh (phút)", 1, 8, 0), E("Đứng lên ngồi xuống (squat không tạ)", 2, 10, 0), E("Chống đẩy tay cao (tay đặt lên ghế)", 2, 8, 0), E("Kéo xô máy", 2, 10, 2.5), E("Cầu mông", 2, 12, 0), E("Plank (giây)", 2, 20, 0)] }],
  },
  {
    lv: 2, name: "Nền tảng", weeks: "Tuần 5–8", time: "30–35 phút", need: 10, days: [1, 3, 5],
    goal: "Học động tác chuẩn với máy và tạ đơn nhẹ. Hai buổi A, B xen kẽ.",
    tips: ["Mỗi bài 3 hiệp", "Chọn mức tạ làm đủ số lần mà còn sức 2–3 lần nữa", "Động tác đúng quan trọng hơn tạ nặng"],
    routines: [
      { name: "Toàn thân A (máy)", ex: [E("Đạp đùi máy", 3, 12, 5), E("Đẩy ngực máy", 3, 10, 2.5), E("Kéo xô máy", 3, 10, 2.5), E("Đẩy vai tạ đơn", 3, 10, 2), E("Plank (giây)", 3, 30, 0)] },
      { name: "Toàn thân B (tạ đơn)", ex: [E("Gánh tạ đơn ôm ngực (goblet squat)", 3, 10, 2), E("Chống đẩy", 3, 8, 0), E("Kéo cáp ngồi", 3, 10, 2.5), E("Cầu mông", 3, 15, 0), E("Gập bụng", 3, 12, 0)] },
    ],
  },
  {
    lv: 3, name: "Tăng sức", weeks: "Tuần 9–14", time: "40–45 phút", need: 14, days: [1, 3, 5],
    goal: "Tách thân trên, thân dưới để mỗi nhóm cơ được tập kỹ hơn. Bắt đầu tăng tạ đều.",
    tips: ["App gợi ý tăng tạ khi buổi trước làm đủ mọi hiệp", "Ngủ đủ và ăn đủ đạm thì cơ mới lên", "Đau khớp (không phải mỏi cơ) thì giảm tạ"],
    routines: [
      { name: "Thân trên", ex: [E("Đẩy ngực tạ đơn", 3, 10, 2), E("Kéo tạ đơn một tay", 3, 10, 2), E("Đẩy vai tạ đơn", 3, 10, 2), E("Kéo xô máy", 3, 10, 2.5), E("Cuốn tạ tay trước", 2, 12, 1), E("Kéo cáp tay sau", 2, 12, 2.5)] },
      { name: "Thân dưới", ex: [E("Gánh tạ đơn ôm ngực (goblet squat)", 3, 12, 2), E("Gập người tạ đơn (Romanian deadlift)", 3, 10, 2), E("Đạp đùi máy", 3, 12, 5), E("Móc đùi sau máy", 3, 12, 2.5), E("Nhón bắp chuối", 3, 15, 5), E("Plank (giây)", 3, 40, 0)] },
      { name: "Toàn thân", ex: [E("Chùng chân tạ đơn (lunge)", 3, 10, 2), E("Chống đẩy", 3, 10, 0), E("Kéo cáp ngồi", 3, 10, 2.5), E("Dang tạ vai ngang", 3, 12, 1), E("Gập bụng", 3, 15, 0)] },
    ],
  },
  {
    lv: 4, name: "Tạ đòn", weeks: "Từ tuần 15", time: "50–60 phút", need: 0, days: [1, 3, 5],
    goal: "Chuyển sang các bài tạ đòn lớn (đẩy ngực, gánh tạ) theo lịch Đẩy · Kéo · Chân.",
    tips: ["Bài tạ đòn nên nhờ huấn luyện viên xem động tác vài buổi đầu", "Gánh tạ và đẩy ngực luôn tập trong khung an toàn", "Tăng tạ chậm: 2,5 kg mỗi lần là đủ"],
    routines: PLAN_TEMPLATES[0].routines,
  },
];
export const levelOf = (lv) => LEVELS.find((l) => l.lv === Number(lv)) || null;
export function planFromLevel(lv, nowMs = Date.now()) {
  const L = levelOf(lv) || LEVELS[0];
  return { ...planFromTemplate({ routines: L.routines, days: L.days }), level: L.lv, levelAt: dayKeyOf(nowMs) };
}
// Tiến độ ở cấp hiện tại: số buổi đã tập (có ghi ít nhất 1 hiệp) kể từ ngày vào cấp
export function levelProgress(plan, days) {
  const L = levelOf(plan?.level);
  if (!L) return null;
  const from = plan.levelAt || "";
  const done = Object.keys(days || {}).filter((k) => k >= from && days[k]?.gym?.ex?.some((e) => (e.sets || []).length)).length;
  return { level: L, done, need: L.need, ready: L.need > 0 && done >= L.need, next: levelOf(L.lv + 1) };
}

// ===== KHỞI ĐỘNG + GIÃN CƠ (có hình) =====
const W = (name, img, how) => ({ name, img, how });
export const WARMUP = [
  W("Xoay vai, xoay tay", "Arm_Circles", "Dang tay ngang, xoay vòng nhỏ rồi to dần, 15 vòng mỗi chiều"),
  W("Xoay hông", "Standing_Hip_Circles", "Tay chống hông, xoay hông vòng rộng 10 vòng mỗi chiều"),
  W("Xoay gối", "Knee_Circles", "Chụm chân, tay đặt lên gối, xoay nhẹ 10 vòng mỗi chiều"),
  W("Mèo – bò (làm mềm lưng)", "Cat_Stretch", "Chống tay và gối, cong lưng lên rồi võng xuống chậm, 10 lần"),
];
export const STRETCH = [
  W("Giãn ngực và vai trước", "Chest_And_Front_Of_Shoulder_Stretch", "Giữ 20–30 giây mỗi bên, thở đều"),
  W("Giãn vai", "Shoulder_Stretch", "Kéo tay ngang ngực, giữ 20–30 giây mỗi bên"),
  W("Giãn đùi sau và bắp chân", "Standing_Hamstring_and_Calf_Stretch", "Giữ 20–30 giây mỗi chân, không nhún"),
  W("Giãn đùi trước", "Standing_Elevated_Quad_Stretch", "Giữ 20–30 giây mỗi chân"),
  W("Tư thế em bé (thả lỏng lưng)", "Childs_Pose", "Quỳ, ngồi lên gót, vươn tay ra trước, giữ 30–40 giây"),
];
export const extraImgs = (img) => [0, 1].map((k) => `${IMG_BASE}${img}/${k}.jpg`);
// Mọi ảnh của một lịch tập (để tải sẵn vào máy khi còn mạng)
export const planImgs = (plan) => [...new Set([...(plan?.routines || []).flatMap((r) => r.ex.flatMap((e) => exImgs(e.name))), ...[...WARMUP, ...STRETCH].flatMap((w) => extraImgs(w.img))])];

// ===== MỤC TIÊU TRONG NGÀY (có phần tự chỉnh calo do người dùng đồng ý) =====
export function dayTargets(cfg, weightKg) {
  if (!cfg?.profile) return null;
  const t = targets({ ...cfg.profile, weightKg: weightKg || cfg.profile.weightKg });
  if (!t) return null;
  const adj = n(cfg.kcalAdj);
  if (!adj) return { ...t, adj: 0 };
  const floor = cfg.profile.sex === "f" ? 1200 : 1500;
  const kcal = Math.max(floor, t.kcal + adj);
  return { ...t, kcal, carb: Math.max(0, Math.round((kcal - t.protein * 4 - t.fat * 9) / 4)), adj: kcal - t.kcal };
}
// Đề xuất chỉnh calo theo xu hướng cân: cần ≥10 lần cân trong 21 ngày, và cách lần chỉnh trước ≥14 ngày. Trả null nếu chưa nên đổi.
export function kcalProposal(cfg, days, nowMs = Date.now()) {
  if (!cfg?.profile) return null;
  const keys = lastKeys(21, nowMs);
  if (keys.filter((k) => n(days?.[k]?.weight) > 0).length < 10) return null;
  if (cfg.kcalAdjAt && cfg.kcalAdjAt > dayKeyOf(nowMs - 14 * DAY)) return null;
  const series = weightSeries(days, 21, nowMs), tr = weightTrend(series);
  if (tr == null) return null;
  const w = series.filter((x) => x.avg != null).pop().avg, pct = (tr / w) * 100, goal = cfg.profile.goal || "recomp";
  const cur = dayTargets(cfg, w), floor = cfg.profile.sex === "f" ? 1200 : 1500;
  const mk = (delta, why) => (delta < 0 && cur.kcal + delta < floor ? null : { delta, trend: tr, text: why });
  if (goal === "bulk") return tr < 0.05 ? mk(150, "3 tuần qua cân gần như không tăng") : pct > 0.5 ? mk(-150, "Cân tăng nhanh hơn mức cần, dễ lên mỡ") : null;
  if (goal === "keep") return tr > 0.25 ? mk(-150, "3 tuần qua cân đang nhích lên") : tr < -0.25 ? mk(150, "3 tuần qua cân đang giảm") : null;
  return tr > -0.1 ? mk(-150, "3 tuần qua cân gần như không giảm") : pct < -1 ? mk(150, "Cân giảm nhanh hơn 1% mỗi tuần, dễ mất cơ") : null;
}

// ===== GỢI Ý THỰC ĐƠN 1 NGÀY (món Việt, sát calo + đủ đạm) =====
const M = (name, q = 1) => ({ name, q });
const MENU = {
  sang: [[M("Phở gà")], [M("Bánh mì trứng ốp la"), M("Sữa tươi không đường")], [M("Yến mạch"), M("Trứng gà luộc", 2), M("Chuối")], [M("Phở bò")], [M("Bánh cuốn"), M("Trứng gà luộc", 2)]],
  trua: [[M("Cơm trắng"), M("Ức gà luộc / áp chảo", 1.5), M("Rau luộc"), M("Canh rau")], [M("Cơm trắng"), M("Cá kho", 1.5), M("Rau luộc"), M("Canh rau")], [M("Bún chả")], [M("Cơm trắng", 1.5), M("Thịt lợn nạc", 1.5), M("Rau xào"), M("Canh rau")], [M("Cơm trắng"), M("Thịt bò nạc", 1.5), M("Rau luộc")]],
  toi: [[M("Cơm trắng"), M("Tôm luộc", 1.5), M("Canh chua cá"), M("Rau luộc")], [M("Salad ức gà"), M("Khoai lang luộc", 2)], [M("Cơm trắng"), M("Đậu phụ luộc", 2), M("Trứng ốp la", 2), M("Rau luộc")], [M("Cơm trắng"), M("Cá hồi", 1.5), M("Rau luộc")], [M("Cơm trắng", 0.5), M("Ức gà luộc / áp chảo", 1.5), M("Rau xào")]],
  phu: [[M("Sữa chua không đường"), M("Chuối")], [M("Whey protein"), M("Táo")], [M("Trứng gà luộc", 2)], [M("Sữa đậu nành không đường"), M("Hạt điều")], [M("Whey protein"), M("Sữa tươi không đường")], []],
};
const foodOf = (name) => FOODS.find((f) => f.name === name);
const sumItems = (items) => items.reduce((t, it) => { const f = foodOf(it.name); return { kcal: t.kcal + f.kcal * it.q, p: t.p + f.p * it.q }; }, { kcal: 0, p: 0 });
// rank: 0 = sát nhất, 1, 2… = phương án kế tiếp (nút "Gợi ý khác"). Mỗi phương án khác bữa trưa hoặc bữa tối so với phương án trước.
export function mealPlan(tg, rank = 0) {
  if (!tg) return null;
  const all = [];
  MENU.sang.forEach((a, i) => MENU.trua.forEach((b, j) => MENU.toi.forEach((c, k) => MENU.phu.forEach((d, l) => {
    const t = sumItems([...a, ...b, ...c, ...d]);
    const score = Math.abs(t.kcal - tg.kcal) / tg.kcal + 1.5 * Math.max(0, tg.protein - t.p) / tg.protein;
    all.push({ ids: [i, j, k, l], score, kcal: Math.round(t.kcal), p: Math.round(t.p) });
  }))));
  all.sort((x, y) => x.score - y.score);
  const picked = [];
  for (const c of all) { if (!picked.some((x) => x.ids[1] === c.ids[1] && x.ids[2] === c.ids[2])) picked.push(c); if (picked.length > rank) break; }
  const best = picked[Math.min(rank, picked.length - 1)];
  const slots = ["sang", "trua", "toi", "phu"].map((slot, x) => ({ slot, items: MENU[slot][best.ids[x]].map((it) => { const f = foodOf(it.name); return { name: f.name, unit: f.unit, kcal: f.kcal, p: f.p, c: f.c, f: f.f, q: it.q }; }) })).filter((x) => x.items.length);
  return { slots, kcal: best.kcal, p: best.p };
}

// ===== CHUỖI NGÀY + HUY HIỆU =====
const dayHasAny = (d) => !!d && (waterTotal(d) > 0 || (d.meals || []).length > 0 || n(d.weight) > 0 || d.gym?.ex?.some((e) => (e.sets || []).length));
const trained = (d) => !!d?.gym?.ex?.some((e) => (e.sets || []).length);
export function streaks(cfg, days, nowMs = Date.now()) {
  // chuỗi tính tới hôm nay; hôm nay chưa đạt thì tính tới hôm qua (không mất chuỗi giữa ngày)
  const run = (ok) => { let c = 0; for (let i = 0; i < 400; i++) { const k = dayKeyOf(nowMs - i * DAY); if (ok(days?.[k])) c++; else if (i > 0) break; } return c; };
  const water = run((d) => !!d && waterTotal(d) >= waterGoal(cfg, d));
  const log = run(dayHasAny);
  const sessions = Object.values(days || {}).filter(trained).length;
  // số tuần liên tiếp (7 ngày một, tính lùi từ hôm nay) có ít nhất 2 buổi tập
  let weeks = 0;
  for (let w = 0; w < 52; w++) { let c = 0; for (let i = 0; i < 7; i++) if (trained(days?.[dayKeyOf(nowMs - (w * 7 + i) * DAY)])) c++; if (c >= 2) weeks++; else if (w > 0) break; }
  const weighs = Object.values(days || {}).filter((d) => n(d?.weight) > 0).length;
  const badges = [
    { id: "w3", icon: "💧", label: "3 ngày đủ nước", got: water >= 3 }, { id: "w7", icon: "🌊", label: "7 ngày đủ nước liên tiếp", got: water >= 7 },
    { id: "g1", icon: "👟", label: "Buổi tập đầu tiên", got: sessions >= 1 }, { id: "g9", icon: "🥉", label: "9 buổi — xong Cấp 1", got: sessions >= 9 },
    { id: "g25", icon: "🥈", label: "25 buổi tập", got: sessions >= 25 }, { id: "gw4", icon: "🔥", label: "4 tuần liền đủ buổi", got: weeks >= 4 },
    { id: "c14", icon: "⚖️", label: "Cân đủ 14 ngày", got: weighs >= 14 }, { id: "l30", icon: "📅", label: "Ghi chép 30 ngày liên tiếp", got: log >= 30 },
  ];
  return { water, log, weeks, sessions, badges };
}
