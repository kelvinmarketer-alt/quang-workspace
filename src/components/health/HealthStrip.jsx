import { Link } from "react-router-dom";
import { Droplets, Flame, Dumbbell, Plus } from "lucide-react";
import { useHealth, addWater } from "../../lib/healthStore.js";
import { waterTotal, waterGoal, mealTotals, dayTargets, dayKeyOf, dowOf, vnNum } from "../../lib/health.js";

// Dải Sức khoẻ ở Tổng quan (chỉ chủ, chỉ hiện khi đã nhập chỉ số): nước + nút uống 1 ly, calo, buổi tập hôm nay
export default function HealthStrip() {
  const { ready, rawCfg, cfg, days } = useHealth();
  if (!ready || !rawCfg?.profile) return null;
  const key = dayKeyOf(Date.now()), day = days[key] || {};
  const drunk = waterTotal(day), goal = waterGoal(cfg, day), glass = cfg.water.glassMl || 250;
  const tot = mealTotals(day), tg = dayTargets(cfg);
  const planned = cfg.plan.routines.find((r) => r.id === cfg.plan.week[String(dowOf(Date.now()))]);
  const gym = day.gym;
  const gymText = gym?.end ? "Đã tập xong" : gym ? "Đang tập" : planned ? planned.name.split("(")[0].trim() : "Ngày nghỉ";
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3" aria-label="Sức khoẻ hôm nay">
      <Link to="/suc-khoe" className="text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-indigo-600">Sức khoẻ</Link>
      <div className="flex min-w-[170px] flex-1 items-center gap-2">
        <Droplets size={16} className="shrink-0 text-sky-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold tabular-nums text-slate-800">{vnNum(drunk / 1000, 2)} / {vnNum(goal / 1000, 2)} lít</div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (drunk / goal) * 100)}%`, transition: "width .4s" }} /></div>
        </div>
        <button onClick={() => addWater(glass)} aria-label={`Uống 1 ly ${glass} ml`} title={`Uống 1 ly ${glass} ml`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-sky-600"><Plus size={14} /> 1 ly</button>
      </div>
      <Link to="/suc-khoe?tab=an" className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-slate-800 hover:text-indigo-600"><Flame size={16} className="text-amber-500" />{tot.kcal}{tg ? ` / ${tg.kcal}` : ""} kcal</Link>
      <Link to="/suc-khoe?tab=gym" className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800 hover:text-indigo-600"><Dumbbell size={16} className={gym?.end ? "text-emerald-500" : "text-slate-400"} />{gymText}</Link>
    </div>
  );
}
