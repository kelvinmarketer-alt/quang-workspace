import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Dumbbell, Undo2, Plus, Sun, Utensils, Settings2, CloudOff, Check, Scale, X } from "lucide-react";
import { Card, SectionTitle } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useHealth, addWater, undoWater, flush, setDayField, setCfg } from "../lib/healthStore.js";
import { waterTotal, waterGoal, mealTotals, dayTargets, streaks, fastState, dayKeyOf, dowOf, lastKeys, DOW, vnNum, minOfDay, hmToMin } from "../lib/health.js";
import { WaterTank, CupRow, Tube, FlameMeter, Capsule, Barbell, StepsTrail, Medal, FastDial, Burst, useCountUp } from "../components/health/fx.jsx";
import { btnGhost, btnPrimary, num } from "../components/health/bits.jsx";
import { ProfileForm } from "../components/health/HealthSettings.jsx";

// SỨC KHOẺ (20/11/2026, sếp duyệt): uống nước + nhắc, tập gym, ăn uống — 4 tab. Dữ liệu riêng từng tài khoản (bảng qws_health).
const Gym = lazy(() => import("../components/health/Gym.jsx"));
const Food = lazy(() => import("../components/health/Food.jsx"));
const HealthSettings = lazy(() => import("../components/health/HealthSettings.jsx"));

const TABS = [["today", "Hôm nay", Sun], ["gym", "Tập gym", Dumbbell], ["an", "Ăn uống", Utensils], ["caidat", "Cài đặt", Settings2]];
const WATER = "#0ea5e9", KCAL = "#f59e0b", GYM = "#10b981";
const Loading = () => <div className="flex justify-center py-16"><div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" /></div>;

function CloudChip({ cloud, pending }) {
  if (cloud === "off") return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-700"><CloudOff size={13} /> Đang lưu tạm trong máy này</span>;
  if (cloud === "error" && pending) return <button onClick={() => flush()} title="Dữ liệu vẫn nằm an toàn trong máy này. Có mạng lại app sẽ tự gửi; bấm để gửi ngay." className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-700"><CloudOff size={13} /> {pending} thay đổi chờ mạng — bấm gửi lại</button>;
  if (pending || cloud === "saving") return <span className="text-[12px] font-semibold text-slate-400">Đang lưu…</span>;
  return cloud === "ok" ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400"><Check size={13} /> Đã lưu</span> : null;
}

function Today({ cfg, days, todayKey, go }) {
  const day = days[todayKey] || {};
  const drunk = waterTotal(day), goal = waterGoal(cfg, day), glass = cfg.water.glassMl || 250;
  const tot = mealTotals(day);
  const latestW = useMemo(() => { const k = Object.keys(days).filter((x) => days[x]?.weight).sort().pop(); return k ? days[k].weight : cfg.profile?.weightKg; }, [days, cfg.profile]);
  const tg = useMemo(() => dayTargets(cfg, latestW), [cfg, latestW]);
  const st = useMemo(() => streaks(cfg, days), [cfg, days]);
  const stepsGoal = Number(cfg.stepsGoal) || 8000;
  const [stepIn, setStepIn] = useState("");
  const saveSteps = () => { const v = Math.round(num(stepIn)); if (v < 1 || v > 100000) return; setDayField("steps", v, todayKey); setStepIn(""); };
  const INTRO = [["Uống nước", "Mỗi lần uống xong bấm nút xanh “Uống 1 ly”. App nhắc khi anh quên."], ["Tập", "Tab Tập gym: bắt đầu từ Cấp 1, mỗi động tác có hình mẫu. Chỉ cần đến đủ 3 buổi mỗi tuần."], ["Ăn", "Tab Ăn uống: ghi bữa bằng tìm món hoặc chụp ảnh. Nhìn ô “Còn được ăn”."], ["Cân", "Mỗi sáng cân một lần, mỗi tuần đo vòng eo. App vẽ xu hướng và tự đề xuất chỉnh."]];
  const dow = dowOf(Date.now());
  const planned = cfg.plan.routines.find((r) => r.id === cfg.plan.week[String(dow)]);
  const gym = day.gym, setsDone = (gym?.ex || []).reduce((s, e) => s + (e.sets || []).length, 0), setsAll = (gym?.ex || []).reduce((s, e) => s + (e.n || 0), 0) || (planned?.ex || []).reduce((s, e) => s + e.sets, 0);
  const week = lastKeys(7).reverse();
  const lastDrink = (day.water || []).slice(-1)[0];
  const ago = lastDrink ? Math.max(0, Math.round((Date.now() - lastDrink.t) / 60000)) : null;
  const fs = cfg.fast.on ? fastState(cfg.fast, Date.now()) : null;
  const left = tg ? tg.kcal - tot.kcal : 0;
  const drunkAnim = useCountUp(drunk), leftAnim = useCountUp(left), stepsAnim = useCountUp(day.steps || 0);
  // Pháo giấy khi vừa uống đủ (chỉ lúc vượt mốc, không bắn lại khi mở trang)
  const [waterBurst, setWaterBurst] = useState(0);
  const prevDrunk = useRef(drunk);
  useEffect(() => { if (prevDrunk.current < goal && drunk >= goal) setWaterBurst(Date.now()); prevDrunk.current = drunk; }, [drunk, goal]);

  return (
    <div className="space-y-4">
      {cfg.profile && !cfg.introDone && (
        <Card>
          <SectionTitle action={<button onClick={() => setCfg((c) => ({ ...c, introDone: true }))} aria-label="Đóng hướng dẫn" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}>4 việc mỗi ngày, mỗi việc dưới 1 phút</SectionTitle>
          <ol className="-mt-1 grid gap-2 sm:grid-cols-2">{INTRO.map(([t, d], i) => <li key={t} className="flex gap-2.5 rounded-xl bg-slate-50 px-3 py-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-[12px] font-bold text-white">{i + 1}</span><span className="text-[13px] text-slate-600"><b className="text-slate-900">{t}.</b> {d}</span></li>)}</ol>
          <button onClick={() => setCfg((c) => ({ ...c, introDone: true }))} className={btnPrimary + " mt-3"}>Đã hiểu</button>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {/* NƯỚC — bể nước sóng sánh */}
        <Card className="relative overflow-visible">
          <Burst fire={waterBurst} />
          <SectionTitle action={(day.water || []).length > 0 && <button onClick={() => undoWater()} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-slate-400 hover:text-slate-700"><Undo2 size={13} /> Bỏ ly vừa ghi</button>}>Uống nước</SectionTitle>
          <div className="-mt-1 flex gap-4">
            <button onClick={() => addWater(glass)} aria-label={`Uống 1 ly ${glass} ml`} className="shrink-0 rounded-[30px] transition active:scale-[.97]"><WaterTank ml={drunk} goal={goal} /></button>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="text-[34px] font-extrabold leading-none tracking-tight text-slate-900 sk-num">{(drunkAnim / 1000).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="ml-1 text-base font-bold text-slate-400">/ {vnNum(goal / 1000, 2)} lít</span></div>
              <div className="mt-1.5 text-[13px] text-slate-600">{drunk >= goal ? <b className="text-emerald-600">Đầy bể rồi! Đủ nước hôm nay 🎉</b> : <>Còn <b className="text-slate-900">{goal - drunk} ml</b> · khoảng {Math.ceil((goal - drunk) / glass)} ly nữa</>}</div>
              {ago != null && <div className="text-[12px] text-slate-400">Lần cuối {ago < 60 ? `${ago} phút` : `${Math.floor(ago / 60)} giờ ${ago % 60} phút`} trước</div>}
              <div className="mt-2.5"><CupRow count={Math.floor(drunk / glass)} total={Math.ceil(goal / glass)} /></div>
              <button onClick={() => addWater(glass)} className="mt-auto flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-extrabold text-white shadow-lg shadow-sky-500/30 transition active:scale-[.97]" style={{ background: "linear-gradient(135deg,#38bdf8,#0284c7)" }}><Plus size={20} /> Uống 1 ly</button>
              <div className="mt-2 grid grid-cols-3 gap-1.5">{[100, 350, 500, 250].filter((m) => m !== glass).slice(0, 3).map((m) => <button key={m} onClick={() => addWater(m)} className={btnGhost + " px-1 text-[12.5px]"}>+{m}</button>)}</div>
            </div>
          </div>
        </Card>

        {/* ĂN — ngọn lửa calo + ống chất */}
        <Card>
          <SectionTitle action={<button onClick={() => go("an")} className="text-[12.5px] font-bold text-indigo-600">Ghi bữa ăn →</button>}>Ăn hôm nay</SectionTitle>
          <div className="-mt-1 flex items-center gap-3">
            <FlameMeter kcal={tot.kcal} target={tg?.kcal || 0} />
            <div className="min-w-0">
              {tg ? <>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{left >= 0 ? "Còn được ăn" : "Đã vượt mức"}</div>
                <div className={`text-[34px] font-extrabold leading-none tracking-tight sk-num ${left >= 0 ? "text-slate-900" : "text-rose-600"}`}>{Math.round(Math.abs(leftAnim))}<span className="ml-1 text-base font-bold text-slate-400">kcal</span></div>
                <div className="mt-1 text-[12.5px] text-slate-500">Đã ăn {tot.kcal} / {tg.kcal} kcal</div>
              </> : <div className="text-[13px] text-slate-500">Đã ăn <b className="text-slate-900">{tot.kcal} kcal</b>. Nhập chỉ số cơ thể để có mục tiêu.</div>}
            </div>
          </div>
          {tg && <div className="mt-3 space-y-2.5"><Capsule label="Đạm" value={tot.p} max={tg.protein} color="#10b981" /><Capsule label="Tinh bột" value={tot.c} max={tg.carb} color="#f59e0b" /><Capsule label="Chất béo" value={tot.f} max={tg.fat} color="#8b5cf6" /></div>}
          <div className="mt-3 flex items-center gap-3">
            {fs && <div className="flex shrink-0 items-center gap-2 rounded-xl bg-violet-50 py-1 pl-1 pr-3"><FastDial startMin={hmToMin(cfg.fast.start, 720)} hours={Number(cfg.fast.hours) || 8} nowMin={minOfDay(Date.now())} eating={fs.eating} size={52} /><span className="text-[12px] font-semibold leading-tight text-violet-800">{fs.eating ? "Đang giờ ăn" : "Đang nhịn"}<br /><span className="font-normal">tới {fs.until}</span></span></div>}
            <button onClick={() => go("an", "can")} className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-[13px]"><span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-slate-600"><Scale size={14} /> Cân</span><span className="min-w-0 text-right leading-tight"><b className="block text-indigo-600">{day.weight || latestW ? `${vnNum(day.weight || latestW)} kg` : "Nhập số cân"}</b>{!day.weight && latestW ? <span className="text-[11px] text-slate-400">bấm để cân hôm nay</span> : null}</span></button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* TẬP — thanh tạ thêm bánh theo từng hiệp */}
        <Card>
          <SectionTitle action={<button onClick={() => go("gym")} className="text-[12.5px] font-bold text-indigo-600">{gym && !gym.end ? "Tập tiếp →" : "Mở tab Tập →"}</button>}>Tập gym hôm nay</SectionTitle>
          <div className="-mt-1 py-3"><Barbell done={setsDone} total={setsAll || 6} finished={!!gym?.end} /></div>
          <div className="text-center">
            <div className="text-lg font-extrabold text-slate-900">{gym?.end ? "Đã tập xong 💪" : gym ? `${setsDone} / ${setsAll} hiệp` : planned ? "Chưa tập" : "Hôm nay nghỉ"}</div>
            <div className="text-[12.5px] text-slate-500">{gym?.end ? `${gym.name} · ${setsDone} hiệp` : gym ? "Mỗi hiệp xong thêm một bánh tạ" : planned ? `${planned.name} · ${planned.ex.length} bài` : "Nghỉ để cơ hồi phục cũng là một phần của tập"}</div>
          </div>
        </Card>

        {/* BƯỚC CHÂN — vệt dấu chân */}
        <Card>
          <SectionTitle>Bước chân</SectionTitle>
          <div className="-mt-2 flex items-baseline justify-between"><span className="text-[28px] font-extrabold tracking-tight text-slate-900 sk-num">{vnNum(stepsAnim)}</span><span className="text-[12.5px] text-slate-500">mục tiêu {vnNum(stepsGoal)}</span></div>
          <StepsTrail steps={day.steps || 0} goal={stepsGoal} />
          <div className="mt-1 flex items-end gap-2">
            <label className="min-w-0 flex-1 text-[12px] font-semibold text-slate-500">Số bước hôm nay<input id="sk-buoc" inputMode="numeric" value={stepIn} onChange={(e) => setStepIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveSteps()} className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" placeholder={day.steps ? String(day.steps) : "6500"} /></label>
            <button onClick={saveSteps} disabled={!(num(stepIn) >= 1)} className={btnGhost}>Lưu</button>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-400">Tự gửi từ iPhone: xem Phím tắt ở tab Cài đặt.</p>
        </Card>
      </div>

      {/* CHUỖI + HUY CHƯƠNG */}
      <Card>
        <SectionTitle>Chuỗi ngày & huy chương</SectionTitle>
        <div className="-mt-1 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl px-1 py-2.5" style={{ background: "linear-gradient(160deg,rgb(14 165 233 / .14),rgb(14 165 233 / .04))" }}><div className="text-2xl font-extrabold text-slate-900 sk-num">💧 {st.water}</div><div className="text-[11.5px] text-slate-600">ngày đủ nước liền</div></div>
          <div className="rounded-2xl px-1 py-2.5" style={{ background: "linear-gradient(160deg,rgb(249 115 22 / .16),rgb(249 115 22 / .04))" }}><div className="text-2xl font-extrabold text-slate-900 sk-num"><span className="sk-streak-fire">🔥</span> {st.weeks}</div><div className="text-[11.5px] text-slate-600">tuần liền có tập</div></div>
          <div className="rounded-2xl px-1 py-2.5" style={{ background: "linear-gradient(160deg,rgb(16 185 129 / .16),rgb(16 185 129 / .04))" }}><div className="text-2xl font-extrabold text-slate-900 sk-num">🏋️ {st.sessions}</div><div className="text-[11.5px] text-slate-600">buổi tập đã xong</div></div>
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-8" aria-label="Huy hiệu">{st.badges.map((b) => <Medal key={b.id} icon={b.icon} label={b.label} got={b.got} />)}</ul>
      </Card>

      {/* 7 NGÀY — mỗi ngày một ống nước */}
      <Card>
        <SectionTitle>7 ngày qua</SectionTitle>
        <div className="-mt-1 grid grid-cols-7 gap-1.5 text-center">
          {week.map((k) => {
            const d = days[k] || {}, w = waterTotal(d), g = waterGoal(cfg, d), t = mealTotals(d);
            const trained = d.gym?.ex?.some((e) => (e.sets || []).length);
            const ms = new Date(k + "T05:00:00Z").getTime();
            return (
              <div key={k} className={`rounded-xl px-1 py-2 ring-1 ${k === todayKey ? "bg-indigo-50 ring-indigo-200" : "ring-slate-100"}`} title={`Nước ${w}/${g} ml`}>
                <div className="text-[11px] font-bold text-slate-400">{DOW[dowOf(ms)]}</div>
                <div className="mt-1.5"><Tube pct={g ? w / g : 0} /></div>
                <div className="mt-1.5 grid h-5 place-items-center">{trained ? <Dumbbell size={14} style={{ color: GYM }} /> : <span className="text-slate-300">·</span>}</div>
                <div className="text-[10.5px] tabular-nums text-slate-500">{t.kcal ? t.kcal : "–"}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500"><span>Ống xanh: nước so với mục tiêu (đầy = xanh ngọc)</span><span><Dumbbell size={12} className="mr-1 inline" style={{ color: GYM }} />Có tập</span><span>Số dưới: kcal đã ăn</span></div>
      </Card>
    </div>
  );
}

export default function Health() {
  const { setToast } = useData();
  const { ready, cloud, pending, rawCfg, cfg, days } = useHealth();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "today";
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t); }, []); // đồng hồ nhịn ăn, "lần cuối … phút trước", qua ngày mới
  const todayKey = dayKeyOf(Date.now());
  const go = (t, focus) => { const n = new URLSearchParams(sp); if (t === "today") n.delete("tab"); else n.set("tab", t); if (focus) n.set("can", "1"); else n.delete("can"); setSp(n, { replace: true }); };

  // Bấm thông báo "Uống nước" → mở /suc-khoe?uong=250: ghi luôn 1 ly rồi xoá tham số (không ghi lặp khi tải lại)
  const drank = useRef(false);
  useEffect(() => {
    const ml = Number(sp.get("uong"));
    if (!ready || drank.current || !ml) return;
    drank.current = true;
    if (ml >= 50 && ml <= 1500) { addWater(Math.round(ml)); setToast?.({ text: `Đã ghi 1 ly ${Math.round(ml)} ml`, at: Date.now() }); }
    const n = new URLSearchParams(sp); n.delete("uong"); setSp(n, { replace: true });
  }, [ready, sp, setSp, setToast]);
  // ?buoc=8500 (Phím tắt iPhone gửi số bước trong ngày) → ghi rồi xoá tham số
  const stepped = useRef(false);
  useEffect(() => {
    const v = Math.round(Number(sp.get("buoc")));
    if (!ready || stepped.current || !sp.has("buoc")) return;
    stepped.current = true;
    if (v >= 1 && v <= 100000) { setDayField("steps", v); setToast?.({ text: `Đã ghi ${v.toLocaleString("vi-VN")} bước hôm nay`, at: Date.now() }); }
    const n = new URLSearchParams(sp); n.delete("buoc"); setSp(n, { replace: true });
  }, [ready, sp, setSp, setToast]);
  // ?can=1 (từ thông báo nhắc cân / nút ở Hôm nay) → mở tab Ăn uống, đặt con trỏ vào ô cân
  useEffect(() => {
    if (!ready || sp.get("can") !== "1") return;
    if (tab !== "an") { const n = new URLSearchParams(sp); n.set("tab", "an"); setSp(n, { replace: true }); return; }
    const t = setTimeout(() => { const el = document.getElementById("sk-can"); el?.scrollIntoView({ block: "center" }); el?.focus(); const n = new URLSearchParams(sp); n.delete("can"); setSp(n, { replace: true }); }, 350);
    return () => clearTimeout(t);
  }, [ready, sp, tab, setSp]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sức khoẻ</h1>
        <CloudChip cloud={cloud} pending={pending} />
      </div>
      <div role="tablist" aria-label="Sức khoẻ" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2 text-[13px] font-bold transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><I size={15} className="max-[480px]:hidden" />{l}</button>)}
      </div>
      {cloud === "off" && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">Máy chủ chưa có bảng lưu Sức khoẻ nên dữ liệu đang giữ tạm trong trình duyệt này và chưa có lời nhắc. Chạy file <b>supabase/SETUP-HEALTH.sql</b> là xong.</p>}
      {!ready ? <Loading /> : (
        <Suspense fallback={<Loading />}>
          {tab === "today" && !rawCfg?.profile && (
            <Card>
              <SectionTitle>Bắt đầu: nhập chỉ số cơ thể</SectionTitle>
              <p className="-mt-2 mb-3 text-[13px] text-slate-500">App dùng các số này để tính lượng nước, calo và đạm anh cần mỗi ngày. Sửa lại lúc nào cũng được ở tab Cài đặt.</p>
              <ProfileForm profile={null} compact />
            </Card>
          )}
          {tab === "today" && <Today cfg={cfg} days={days} todayKey={todayKey} go={go} />}
          {tab === "gym" && <Gym cfg={cfg} days={days} todayKey={todayKey} />}
          {tab === "an" && <Food key={todayKey} cfg={cfg} days={days} todayKey={todayKey} />}
          {tab === "caidat" && <HealthSettings cfg={cfg} />}
          {tab === "today" && cfg.plan.routines.length === 0 && <p className="text-center text-[13px] text-slate-500">Chưa có lịch tập. <Link to="/suc-khoe?tab=gym" className="font-bold text-indigo-600">Chọn lịch tập mẫu →</Link></p>}
        </Suspense>
      )}
    </div>
  );
}
