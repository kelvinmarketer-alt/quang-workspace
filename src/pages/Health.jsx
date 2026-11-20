import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Droplets, Flame, Dumbbell, Undo2, Plus, Sun, Utensils, Settings2, CloudOff, Check, Scale, Hourglass } from "lucide-react";
import { Card, SectionTitle } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { useHealth, addWater, undoWater, flush } from "../lib/healthStore.js";
import { waterTotal, waterGoal, mealTotals, targets, fastState, dayKeyOf, dowOf, lastKeys, DOW, vnNum } from "../lib/health.js";
import { Ring, Bar, btnGhost } from "../components/health/bits.jsx";
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
  if (cloud === "error") return <button onClick={() => flush()} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[12px] font-bold text-rose-700"><CloudOff size={13} /> Chưa lưu được — bấm thử lại</button>;
  if (pending || cloud === "saving") return <span className="text-[12px] font-semibold text-slate-400">Đang lưu…</span>;
  return cloud === "ok" ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400"><Check size={13} /> Đã lưu</span> : null;
}

function Today({ cfg, days, todayKey, go }) {
  const day = days[todayKey] || {};
  const drunk = waterTotal(day), goal = waterGoal(cfg, day), glass = cfg.water.glassMl || 250;
  const tot = mealTotals(day);
  const latestW = useMemo(() => { const k = Object.keys(days).filter((x) => days[x]?.weight).sort().pop(); return k ? days[k].weight : cfg.profile?.weightKg; }, [days, cfg.profile]);
  const tg = useMemo(() => targets(cfg.profile ? { ...cfg.profile, weightKg: latestW || cfg.profile.weightKg } : null), [cfg.profile, latestW]);
  const dow = dowOf(Date.now());
  const planned = cfg.plan.routines.find((r) => r.id === cfg.plan.week[String(dow)]);
  const gym = day.gym, setsDone = (gym?.ex || []).reduce((s, e) => s + (e.sets || []).length, 0), setsAll = (gym?.ex || []).reduce((s, e) => s + (e.n || 0), 0) || (planned?.ex || []).reduce((s, e) => s + e.sets, 0);
  const week = lastKeys(7).reverse();
  const lastDrink = (day.water || []).slice(-1)[0];
  const ago = lastDrink ? Math.max(0, Math.round((Date.now() - lastDrink.t) / 60000)) : null;
  const fs = cfg.fast.on ? fastState(cfg.fast, Date.now()) : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-3 justify-items-center gap-2">
          <button onClick={() => addWater(glass)} className="grid justify-items-center gap-1.5" aria-label={`Nước: đã uống ${drunk} trên ${goal} ml. Bấm để thêm 1 ly`}>
            <Ring size={104} value={drunk} max={goal} color={WATER} label="Nước"><div><Droplets size={16} className="mx-auto" style={{ color: WATER }} /><div className="text-[17px] font-extrabold tabular-nums text-slate-900">{vnNum(drunk / 1000, 2)}</div><div className="text-[10.5px] text-slate-500">/ {vnNum(goal / 1000, 2)} lít</div></div></Ring>
            <span className="text-[12.5px] font-bold text-slate-700">Nước</span>
          </button>
          <button onClick={() => go("an")} className="grid justify-items-center gap-1.5" aria-label="Mở tab Ăn uống">
            <Ring size={104} value={tot.kcal} max={tg?.kcal || 0} color={tg && tot.kcal > tg.kcal * 1.05 ? "#f43f5e" : KCAL} label="Calo"><div><Flame size={16} className="mx-auto" style={{ color: KCAL }} /><div className="text-[17px] font-extrabold tabular-nums text-slate-900">{tot.kcal}</div><div className="text-[10.5px] text-slate-500">{tg ? `/ ${tg.kcal} kcal` : "kcal"}</div></div></Ring>
            <span className="text-[12.5px] font-bold text-slate-700">Ăn uống</span>
          </button>
          <button onClick={() => go("gym")} className="grid justify-items-center gap-1.5" aria-label="Mở tab Tập gym">
            <Ring size={104} value={gym?.end ? 1 : setsDone} max={gym?.end ? 1 : setsAll || 1} color={GYM} label="Tập"><div><Dumbbell size={16} className="mx-auto" style={{ color: GYM }} /><div className="text-[13px] font-extrabold leading-tight text-slate-900">{gym?.end ? "Đã tập" : gym ? `${setsDone}/${setsAll} hiệp` : planned ? "Chưa tập" : "Nghỉ"}</div><div className="line-clamp-1 text-[10.5px] text-slate-500">{(gym?.name || planned?.name || "ngày nghỉ").split("(")[0].trim()}</div></div></Ring>
            <span className="text-[12.5px] font-bold text-slate-700">Tập gym</span>
          </button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle action={(day.water || []).length > 0 && <button onClick={() => undoWater()} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-slate-400 hover:text-slate-700"><Undo2 size={13} /> Bỏ ly vừa ghi</button>}>Uống nước</SectionTitle>
          <div className="-mt-1 text-[13px] text-slate-600">{drunk >= goal ? <b className="text-emerald-600">Đã uống đủ {vnNum(goal / 1000, 2)} lít hôm nay.</b> : <>Còn <b className="text-slate-900">{goal - drunk} ml</b> nữa (khoảng {Math.ceil((goal - drunk) / glass)} ly).</>}{ago != null && <span className="text-slate-400"> · lần cuối {ago < 60 ? `${ago} phút` : `${Math.floor(ago / 60)} giờ ${ago % 60} phút`} trước</span>}</div>
          <button onClick={() => addWater(glass)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold text-white transition active:scale-[.98]" style={{ background: WATER }}><Plus size={20} /> Uống 1 ly ({glass} ml)</button>
          <div className="mt-2 grid grid-cols-3 gap-2">{[100, 350, 500, 250].filter((m) => m !== glass).slice(0, 3).map((m) => <button key={m} onClick={() => addWater(m)} className={btnGhost}>+{m} ml</button>)}</div>
          {(day.water || []).length > 0 && <div className="mt-3 flex flex-wrap gap-1">{day.water.map((w, i) => <span key={i} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700">{new Date(w.t + 7 * 3600000).toISOString().slice(11, 16)} · {w.ml}</span>)}</div>}
        </Card>

        <Card>
          <SectionTitle action={<button onClick={() => go("an")} className="text-[12.5px] font-bold text-indigo-600">Ghi bữa ăn →</button>}>Ăn hôm nay</SectionTitle>
          {tg ? (
            <div className="-mt-1 space-y-3">
              <Bar label="Calo" value={tot.kcal} max={tg.kcal} unit="kcal" color={KCAL} />
              <Bar label="Đạm" value={tot.p} max={tg.protein} unit="g" color={GYM} />
              {fs && <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[12.5px] font-semibold text-violet-800"><Hourglass size={14} /> {fs.eating ? `Đang trong giờ ăn, hết lúc ${fs.until}` : `Đang nhịn, ăn lại lúc ${fs.until}`}</div>}
            </div>
          ) : <p className="-mt-1 text-[13px] text-slate-500">Đã ăn {tot.kcal} kcal, {tot.p} g đạm. Nhập chỉ số cơ thể để có mục tiêu.</p>}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600"><Scale size={14} /> Cân nặng</span>
            <button onClick={() => go("an", "can")} className="font-bold text-indigo-600">{day.weight ? `${vnNum(day.weight)} kg (hôm nay)` : latestW ? `${vnNum(latestW)} kg · nhập hôm nay` : "Nhập số cân"}</button>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>7 ngày qua</SectionTitle>
        <div className="-mt-1 grid grid-cols-7 gap-1.5 text-center">
          {week.map((k) => {
            const d = days[k] || {}, w = waterTotal(d), g = waterGoal(cfg, d), t = mealTotals(d);
            const trained = d.gym?.ex?.some((e) => (e.sets || []).length);
            const ms = new Date(k + "T05:00:00Z").getTime();
            return (
              <div key={k} className={`rounded-xl px-1 py-2 ring-1 ${k === todayKey ? "bg-indigo-50 ring-indigo-200" : "ring-slate-100"}`}>
                <div className="text-[11px] font-bold text-slate-400">{DOW[dowOf(ms)]}</div>
                <div className="mx-auto mt-1.5 flex h-10 w-2.5 items-end overflow-hidden rounded-full bg-slate-100" title={`Nước ${w}/${g} ml`}><div className="w-full rounded-full" style={{ height: `${Math.min(100, (w / g) * 100)}%`, background: WATER }} /></div>
                <div className="mt-1.5 grid h-5 place-items-center">{trained ? <Dumbbell size={14} style={{ color: GYM }} /> : <span className="text-slate-300">·</span>}</div>
                <div className="text-[10.5px] tabular-nums text-slate-500">{t.kcal ? t.kcal : "–"}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500"><span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: WATER }} />Cột xanh: nước so với mục tiêu</span><span><Dumbbell size={12} className="mr-1 inline" style={{ color: GYM }} />Có tập</span><span>Số dưới cùng: kcal đã ăn</span></div>
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
