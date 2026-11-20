// SỨC KHOẺ (20/11/2026) — tính toán thuần (không gọi mạng) cho trang /suc-khoe. Phần dùng chung với máy chủ nhắc nằm ở
// supabase/functions/qws-health-remind/logic.js (một nguồn duy nhất — sửa công thức thì sửa ở đó).
export * from "../../supabase/functions/qws-health-remind/logic.js";
import { dayKeyOf } from "../../supabase/functions/qws-health-remind/logic.js";

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
    if (e) return { key: k, sets: e.sets };
  }
  return null;
}
// Tăng tải từ từ: buổi trước làm ĐỦ số hiệp và mọi hiệp đủ số lần ở cùng mức tạ → +step kg; không thì giữ mức, cố thêm lần.
// Bài không tạ (step 0 hoặc kg = 0) → thêm 1–2 lần mỗi hiệp.
export function suggest(last, ex) {
  const sets = last?.sets || [];
  if (!sets.length) return { kg: null, reps: n(ex.reps), up: false, text: "Buổi đầu: chọn mức làm đủ số lần mà vẫn còn sức 1–2 lần nữa" };
  const top = Math.max(...sets.map((s) => n(s.kg)));
  const atTop = sets.filter((s) => n(s.kg) === top);
  const full = sets.length >= n(ex.sets) && atTop.length >= n(ex.sets) && atTop.every((s) => n(s.reps) >= n(ex.reps));
  const step = n(ex.step);
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
