import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { mergeDay } from "../src/lib/healthStore.js";
import { parseFoodJson } from "../src/lib/healthAi.js";
import { targets, waterGoal, waterTotal, mealTotals, fastState, dueReminders, needsWeek, anyRemind, weekStats, weekText, withDefaults, dayKeyOf, suggest, lastSession, isRecord, weightSeries, weightTrend, trendNote, searchFoods, planFromTemplate, PLAN_TEMPLATES, FOODS, LEVELS, planFromLevel, levelProgress, exInfo, exImgs, EX_INFO, dayTargets, kcalProposal, mealPlan, streaks, planImgs, WARMUP, STRETCH } from "../src/lib/health.js";

// Mốc giờ VN: 20/11/2026 là thứ Sáu. at("10:00") = 10h sáng giờ VN hôm đó.
const at = (hm, day = "2026-11-20") => new Date(`${day}T${hm}:00+07:00`).getTime();
const profile = { sex: "m", birthYear: 1990, heightCm: 170, weightKg: 75, activity: 1.375, goal: "recomp" };

describe("mục tiêu calo / đạm / nước", () => {
  it("nam 75 kg, 170 cm, 36 tuổi, tập nhẹ, giảm mỡ + tăng cơ", () => {
    const t = targets(profile, 2026);
    expect(t.bmr).toBe(1638); // 750 + 1062,5 − 180 + 5
    expect(t.tdee).toBe(2252);
    expect(t.kcal).toBe(1910); // −15%, làm tròn 10
    expect(t.protein).toBe(150); // 2 g mỗi kg
    expect(t.fat).toBe(60);
    expect(t.carb).toBe(Math.round((1910 - 600 - 540) / 4));
  });
  it("thiếu chỉ số → null; không đặt dưới mức an toàn", () => {
    expect(targets({ sex: "m" })).toBeNull();
    expect(targets({ sex: "f", birthYear: 1990, heightCm: 150, weightKg: 40, activity: 1.2, goal: "cut" }, 2026).kcal).toBe(1200);
  });
  it("nước: 35 ml mỗi kg, ngày tập +500, đặt tay thì theo số đặt", () => {
    expect(waterGoal({ profile }, null)).toBe(2650);
    expect(waterGoal({ profile }, { gym: { ex: [{ name: "x", sets: [] }] } })).toBe(3150);
    expect(waterGoal({ profile, water: { goalMl: 2000 } }, null)).toBe(2000);
    expect(waterGoal({}, null)).toBe(2000);
    expect(waterTotal({ water: [{ t: 1, ml: 250 }, { t: 2, ml: 500 }] })).toBe(750);
  });
  it("cộng bữa ăn theo số phần", () => {
    expect(mealTotals({ meals: [{ kcal: 450, p: 25, c: 55, f: 13 }, { kcal: 165, p: 31, c: 0, f: 3.6, q: 1.5 }] })).toEqual({ kcal: 698, p: 72, c: 55, f: 18 });
  });
});

describe("nhịn ăn theo giờ", () => {
  const fast = { on: true, start: "12:00", hours: 8 };
  it("trong giờ ăn / đang nhịn", () => {
    expect(fastState(fast, at("13:30"))).toMatchObject({ eating: true, left: 390, until: "20:00" });
    expect(fastState(fast, at("22:00"))).toMatchObject({ eating: false, left: 840, until: "12:00" });
    expect(fastState(fast, at("07:00"))).toMatchObject({ eating: false, left: 300 });
  });
});

describe("máy chủ quyết định nhắc", () => {
  const cfg = { profile, water: { remind: { on: true, from: "08:00", to: "21:00", every: 90 } }, gym: { remind: { on: false } }, weekly: { on: false } };
  it("đầu khung giờ chưa uống gì → nhắc ngay, kèm link ghi 1 ly", () => {
    const r = dueReminders({ cfg, rs: {}, day: null, nowMs: at("08:00") });
    expect(r.sends.map((s) => s.tag)).toEqual(["sk-nuoc"]);
    expect(r.sends[0].url).toBe("/suc-khoe?uong=250");
    expect(r.rs.waterAt).toBe(at("08:00"));
  });
  it("vừa nhắc / vừa uống → chưa nhắc lại; quá 90 phút mới nhắc", () => {
    const rs = { waterAt: at("08:00") };
    expect(dueReminders({ cfg, rs, day: null, nowMs: at("09:15") }).sends).toEqual([]);
    expect(dueReminders({ cfg, rs, day: null, nowMs: at("09:30") }).sends.length).toBe(1);
    const day = { water: [{ t: at("09:20"), ml: 250 }] };
    expect(dueReminders({ cfg, rs, day, nowMs: at("09:30") }).sends).toEqual([]); // vừa uống → lùi lượt nhắc
    expect(dueReminders({ cfg, rs, day, nowMs: at("10:50") }).sends.length).toBe(1);
  });
  it("ngoài khung giờ / đã đủ / tắt → không nhắc", () => {
    expect(dueReminders({ cfg, rs: {}, day: null, nowMs: at("07:30") }).sends).toEqual([]);
    expect(dueReminders({ cfg, rs: {}, day: null, nowMs: at("21:30") }).sends).toEqual([]);
    expect(dueReminders({ cfg, rs: {}, day: { water: [{ t: at("09:00"), ml: 2650 }] }, nowMs: at("15:00") }).sends).toEqual([]);
    expect(dueReminders({ cfg: { ...cfg, water: { remind: { on: false } } }, rs: {}, day: null, nowMs: at("15:00") }).sends).toEqual([]);
  });
  it("dấu nhắc của hôm qua không chặn hôm nay", () => {
    expect(dueReminders({ cfg, rs: { waterAt: at("20:30", "2026-11-19") }, day: null, nowMs: at("08:00") }).sends.length).toBe(1);
  });
  it("giờ tập: đúng ngày có buổi, 1 lần mỗi ngày, đã tập thì thôi", () => {
    const c = { ...cfg, water: { remind: { on: false } }, gym: { remind: { on: true, time: "18:00" } }, plan: { routines: [{ id: "r1", name: "Đẩy", ex: [{ name: "a" }, { name: "b" }] }], week: { 5: "r1" } } };
    const r = dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("18:05") });
    expect(r.sends.map((s) => s.tag)).toEqual(["sk-tap"]);
    expect(r.sends[0].body).toContain("Đẩy (2 bài)");
    expect(dueReminders({ cfg: c, rs: r.rs, day: null, nowMs: at("18:20") }).sends).toEqual([]);
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("17:50") }).sends).toEqual([]);
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("19:30") }).sends).toEqual([]); // quá 60 phút → không nhắc bù
    expect(dueReminders({ cfg: c, rs: {}, day: { gym: { ex: [{ name: "a", sets: [] }] } }, nowMs: at("18:05") }).sends).toEqual([]);
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("18:05", "2026-11-21") }).sends).toEqual([]); // thứ 7 nghỉ
  });
  it("nhịn ăn: báo mở và đóng giờ ăn; cân sáng bỏ qua khi đã cân", () => {
    const c = { ...cfg, water: { remind: { on: false } }, fast: { on: true, start: "12:00", hours: 8, remind: true }, weigh: { remind: true, time: "07:00" } };
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("12:10") }).sends[0].title).toContain("Bắt đầu giờ ăn");
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("20:00") }).sends[0].title).toContain("Hết giờ ăn");
    expect(dueReminders({ cfg: c, rs: {}, day: null, nowMs: at("07:10") }).sends.map((s) => s.tag)).toEqual(["sk-can"]);
    expect(dueReminders({ cfg: c, rs: {}, day: { weight: 74.6 }, nowMs: at("07:10") }).sends).toEqual([]);
  });
  it("tổng kết tuần: tối Chủ nhật, 1 lần", () => {
    const c = { profile, water: { remind: { on: false } }, gym: { remind: { on: false } }, weekly: { on: true } };
    const sun = at("20:05", "2026-11-22");
    expect(needsWeek(c, {}, sun)).toBe(true);
    expect(needsWeek(c, {}, at("20:05"))).toBe(false);
    const keys = [...Array(7)].map((_, i) => dayKeyOf(sun - i * 86400000));
    const days = { [keys[0]]: { water: [{ t: 1, ml: 2700 }], weight: 74 }, [keys[1]]: { gym: { ex: [{ name: "a", sets: [{ kg: 50, reps: 8 }] }] }, meals: [{ kcal: 1800, p: 140 }] } };
    const r = dueReminders({ cfg: c, rs: {}, day: days[keys[0]], nowMs: sun, week: { days, keys, prevKeys: [] } });
    expect(r.sends[0].body).toBe("Nước: 1/7 ngày đủ · Tập: 1 buổi · Ăn TB 1800 kcal, 140 g đạm · Cân TB 74 kg");
    expect(needsWeek(c, r.rs, sun)).toBe(false);
  });
  it("không bật gì → bỏ qua người này", () => {
    expect(anyRemind({ water: { remind: { on: false } }, gym: { remind: { on: false } }, weekly: { on: false } })).toBe(false);
    expect(anyRemind({})).toBe(true); // mặc định: nước + giờ tập + tổng kết tuần
    expect(withDefaults(null).water.remind.every).toBe(90);
  });
  it("tổng kết: cân trung bình tuần này so với tuần trước", () => {
    const st = weekStats({ profile }, { a: { weight: 74 }, b: { weight: 75 }, c: { weight: 76 } }, ["a", "b"], ["c"]);
    expect(st.weightDelta).toBeCloseTo(-1.5);
    expect(weekText(st)).toContain("Cân TB -1,5 kg");
  });
});

describe("tập: gợi ý tăng tạ", () => {
  const ex = { name: "Đẩy ngực tạ đòn", sets: 3, reps: 10, step: 2.5 };
  it("đủ 3×10 → +2,5 kg; thiếu lần → giữ mức; buổi đầu → chưa có số", () => {
    expect(suggest({ sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 10 }, { kg: 50, reps: 11 }] }, ex)).toMatchObject({ kg: 52.5, up: true });
    expect(suggest({ sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 9 }, { kg: 50, reps: 8 }] }, ex)).toMatchObject({ kg: 50, up: false });
    expect(suggest({ sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 10 }] }, ex)).toMatchObject({ kg: 50, up: false }); // thiếu hiệp
    expect(suggest(null, ex)).toMatchObject({ kg: null, reps: 10, up: false });
  });
  it("bài không tạ → tăng số lần", () => {
    expect(suggest({ sets: [{ kg: 0, reps: 12 }, { kg: 0, reps: 12 }, { kg: 0, reps: 12 }] }, { sets: 3, reps: 12, step: 0 })).toMatchObject({ reps: 13, up: true });
  });
  it("lần trước + kỷ lục", () => {
    const days = { "2026-11-10": { gym: { ex: [{ name: "Squat", sets: [{ kg: 60, reps: 8 }] }] } }, "2026-11-17": { gym: { ex: [{ name: "Squat", sets: [{ kg: 65, reps: 8 }] }] } } };
    expect(lastSession(days, "Squat", "2026-11-20").key).toBe("2026-11-17");
    expect(lastSession(days, "Squat", "2026-11-17").key).toBe("2026-11-10");
    expect(isRecord(days, "Squat", "2026-11-20", [{ kg: 70, reps: 8 }])).toBe(true);
    expect(isRecord(days, "Squat", "2026-11-20", [{ kg: 65, reps: 8 }])).toBe(false);
    expect(isRecord({}, "Squat", "2026-11-20", [{ kg: 65, reps: 8 }])).toBe(false); // buổi đầu không gọi là kỷ lục
  });
  it("mẫu lịch tập: gán buổi vào thứ", () => {
    const p = planFromTemplate(PLAN_TEMPLATES[0]);
    expect(p.routines.length).toBe(3);
    expect(Object.keys(p.week)).toEqual(["1", "3", "5"]);
    expect(p.week["1"]).toBe(p.routines[0].id);
  });
});

describe("cân nặng + món ăn", () => {
  it("trung bình 7 ngày + xu hướng mỗi tuần", () => {
    const now = at("09:00"), days = {};
    for (let i = 0; i < 21; i++) days[dayKeyOf(now - i * 86400000)] = { weight: 75 - (20 - i) * 0.1 }; // mỗi ngày giảm 0,1 kg
    const s = weightSeries(days, 14, now);
    expect(s.length).toBe(14);
    expect(s[s.length - 1].kg).toBeCloseTo(73);
    expect(s[s.length - 1].avg).toBeCloseTo(73.3);
    expect(weightTrend(s)).toBeCloseTo(-0.7);
    expect(trendNote(-0.7, 73, "recomp")).toContain("vừa đẹp");
    expect(trendNote(0, 73, "cut")).toContain("chưa giảm");
    expect(weightTrend(weightSeries({}, 14, now))).toBeNull();
  });
  it("tìm món không cần dấu, món tự thêm lên đầu; số liệu món hợp lý", () => {
    expect(searchFoods("pho").map((x) => x.name)).toEqual(["Phở bò", "Phở gà"]);
    expect(searchFoods("com nha", [{ name: "Cơm nhà", kcal: 600, p: 30, c: 70, f: 20 }])[0].g).toBe("Món của tôi");
    for (const f of FOODS) expect(Math.abs(f.p * 4 + f.c * 4 + f.f * 9 - f.kcal) / Math.max(f.kcal, 60), f.name).toBeLessThan(f.name === "Bia" ? 1 : 0.2); // bia: calo từ cồn
  });
});

describe("lộ trình theo cấp (dễ → khó) + hình mẫu", () => {
  it("4 cấp tăng dần: cấp 1 không có bài tạ đòn, ít hiệp, buổi ngắn", () => {
    expect(LEVELS.map((l) => l.lv)).toEqual([1, 2, 3, 4]);
    const l1 = LEVELS[0].routines.flatMap((r) => r.ex);
    expect(l1.every((e) => e.sets <= 2)).toBe(true);
    for (const L of LEVELS.slice(0, 3)) expect(L.routines.flatMap((r) => r.ex).some((e) => /tạ đòn|deadlift\)$|Gánh tạ \(squat\)/.test(e.name) && !/tạ đơn/.test(e.name)), "cấp " + L.lv).toBe(false);
    const total = (L) => L.routines.reduce((s, r) => s + r.ex.reduce((a, e) => a + e.sets, 0), 0) / L.routines.length;
    expect(total(LEVELS[0])).toBeLessThan(total(LEVELS[1]));
    expect(total(LEVELS[1])).toBeLessThan(total(LEVELS[2]));
  });
  it("mọi bài trong lộ trình và lịch mẫu đều có hình + 3 ý cách tập", () => {
    const names = new Set([...LEVELS, ...PLAN_TEMPLATES].flatMap((t) => t.routines.flatMap((r) => r.ex.map((e) => e.name))));
    for (const n of names) { expect(exInfo(n), n).toBeTruthy(); expect(exInfo(n).cues.length, n).toBe(3); expect(exImgs(n).length).toBe(2); }
    expect(exImgs("Bài tự thêm")).toEqual([]);
    expect(Object.keys(EX_INFO).length).toBeGreaterThanOrEqual(names.size);
  });
  it("vào cấp 1 → 3 buổi T2/T4/T6; đủ 9 buổi mới gợi ý lên cấp, buổi trước ngày vào cấp không tính", () => {
    const now = at("09:00");
    const plan = planFromLevel(1, now);
    expect(plan.level).toBe(1); expect(plan.levelAt).toBe("2026-11-20");
    expect(Object.keys(plan.week)).toEqual(["1", "3", "5"]);
    const sess = { gym: { ex: [{ name: "x", sets: [{ kg: 0, reps: 10 }] }] } };
    const days = { "2026-11-01": sess, "2026-11-19": sess };
    for (let i = 0; i < 8; i++) days[dayKeyOf(now + i * 2 * 86400000)] = sess;
    days["2026-12-30"] = { gym: { ex: [{ name: "x", sets: [] }] } }; // mở buổi nhưng chưa ghi hiệp → không tính
    let p = levelProgress(plan, days);
    expect(p).toMatchObject({ done: 8, need: 9, ready: false });
    days["2026-12-31"] = sess;
    p = levelProgress(plan, days);
    expect(p.ready).toBe(true); expect(p.next.lv).toBe(2);
    expect(levelProgress(planFromLevel(4, now), days).ready).toBe(false); // cấp cao nhất
    expect(levelProgress({ routines: [], week: {} }, days)).toBeNull(); // lịch tự chọn
    expect(withDefaults({ plan }).plan.level).toBe(1); // không làm rơi cấp khi đọc cấu hình
  });
});

describe("gói nâng cấp 20/11", () => {
  it("ảnh mẫu nằm sẵn trong app: mọi bài của mọi cấp + khởi động + giãn cơ đều có file", () => {
    const urls = new Set(LEVELS.flatMap((L) => planImgs(planFromLevel(L.lv))));
    for (const n of Object.keys(EX_INFO)) exImgs(n).forEach((u) => urls.add(u));
    expect(urls.size).toBe((new Set(Object.values(EX_INFO).map((i) => i.img)).size + WARMUP.length + STRETCH.length) * 2);
    for (const u of urls) { expect(u.startsWith("/health/ex/")).toBe(true); expect(fs.existsSync("public" + u), u).toBe(true); }
  });
  it("buổi trước báo nặng → giữ mức; báo đau khớp → lùi một bậc", () => {
    const ex = { sets: 3, reps: 10, step: 2.5 }, full = [1, 2, 3].map(() => ({ kg: 50, reps: 10 }));
    expect(suggest({ sets: full }, ex)).toMatchObject({ kg: 52.5, up: true });
    expect(suggest({ sets: full, feel: "nang" }, ex)).toMatchObject({ kg: 50, up: false });
    expect(suggest({ sets: full, pain: true }, ex)).toMatchObject({ kg: 47.5, up: false });
    const days = { "2026-11-18": { gym: { feel: "nang", ex: [{ name: "A", sets: full }] } } };
    expect(lastSession(days, "A", "2026-11-20")).toMatchObject({ feel: "nang", pain: false });
  });
  it("thực đơn gợi ý: sát calo (±8%), đủ đạm, 3 phương án khác nhau", () => {
    const tg = targets(profile, 2026);
    const plans = [0, 1, 2].map((r) => mealPlan(tg, r));
    for (const p of plans) { expect(Math.abs(p.kcal - tg.kcal) / tg.kcal).toBeLessThan(0.08); expect(p.p).toBeGreaterThanOrEqual(tg.protein * 0.93); expect(p.slots.length).toBeGreaterThanOrEqual(3); }
    expect(new Set(plans.map((p) => JSON.stringify(p.slots))).size).toBe(3);
    const small = mealPlan(targets({ ...profile, sex: "f", weightKg: 50, heightCm: 155 }, 2026), 0);
    expect(small.kcal).toBeLessThan(1500);
  });
  it("tự chỉnh calo: cần đủ số lần cân; cân đứng yên → đề xuất −150; đồng ý rồi thì 14 ngày sau mới đề xuất tiếp", () => {
    const now = at("09:00"), cfg = { profile }, days = {};
    expect(kcalProposal(cfg, days, now)).toBeNull();
    for (let i = 0; i < 21; i++) days[dayKeyOf(now - i * 86400000)] = { weight: 75 };
    expect(kcalProposal(cfg, days, now)).toMatchObject({ delta: -150 });
    expect(dayTargets({ ...cfg, kcalAdj: -150 }).kcal).toBe(1760);
    expect(dayTargets({ ...cfg, kcalAdj: -150 }).protein).toBe(150); // đạm giữ nguyên, chỉ bớt tinh bột
    expect(dayTargets({ ...cfg, kcalAdj: -900 }).kcal).toBe(1500); // không xuống dưới mức an toàn
    expect(kcalProposal({ ...cfg, kcalAdj: -150, kcalAdjAt: dayKeyOf(now - 3 * 86400000) }, days, now)).toBeNull();
    const down = {}; for (let i = 0; i < 21; i++) down[dayKeyOf(now - i * 86400000)] = { weight: 75 + i * 0.07 }; // giảm ~0,5 kg/tuần
    expect(kcalProposal(cfg, down, now)).toBeNull(); // đang giảm đẹp → không đổi
  });
  it("chuỗi ngày + huy hiệu", () => {
    const now = at("21:00"), days = {};
    for (let i = 1; i <= 7; i++) days[dayKeyOf(now - i * 86400000)] = { water: [{ t: 1, ml: 3200 }] }; // 7 ngày tới hôm qua, hôm nay chưa đủ
    days[dayKeyOf(now - 86400000)].gym = { ex: [{ name: "a", sets: [{ kg: 0, reps: 8 }] }] };
    const s = streaks({ profile }, days, now);
    expect(s.water).toBe(7); expect(s.sessions).toBe(1);
    expect(s.badges.find((b) => b.id === "w7").got).toBe(true);
    expect(s.badges.find((b) => b.id === "g9").got).toBe(false);
    delete days[dayKeyOf(now - 3 * 86400000)];
    expect(streaks({ profile }, days, now).water).toBe(2); // đứt chuỗi
  });
  it("hai máy cùng sửa một ngày → gộp, không mất ly nước hay món ăn của máy nào", () => {
    const a = { water: [{ t: 1, ml: 250 }, { t: 5, ml: 250 }], meals: [{ id: "m1", kcal: 400 }], weight: 74.5 };
    const b = { water: [{ t: 1, ml: 250 }, { t: 3, ml: 500 }], meals: [{ id: "m2", kcal: 300 }], gym: { name: "x", ex: [] }, steps: 6000 };
    const m = mergeDay(a, b);
    expect(m.water.map((w) => w.t)).toEqual([1, 3, 5]);
    expect(m.meals.map((x) => x.id).sort()).toEqual(["m1", "m2"]);
    expect(m.weight).toBe(74.5); expect(m.steps).toBe(6000); expect(m.gym.name).toBe("x");
    expect(mergeDay(null, b)).toBe(b); expect(mergeDay(a, null)).toBe(a);
  });
  it("AI ảnh món ăn: đọc JSON an toàn (bỏ món rỗng, chặn số vô lý)", () => {
    const r = parseFoodJson('{"items":[{"name":"Cơm trắng","unit":"1 bát","kcal":195.4,"p":4,"c":43,"f":0},{"name":"","kcal":100},{"name":"Lạ","kcal":99999}],"note":""}');
    expect(r.items).toEqual([{ name: "Cơm trắng", unit: "1 bát", kcal: 195, p: 4, c: 43, f: 0 }, { name: "Lạ", unit: "1 phần", kcal: 3000, p: 0, c: 0, f: 0 }]);
    expect(parseFoodJson("xin lỗi").items).toEqual([]);
  });
});
