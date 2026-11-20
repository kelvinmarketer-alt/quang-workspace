import { useMemo, useState } from "react";
import { Plus, X, Search, ChevronLeft, ChevronRight, Star, Utensils, Hourglass, Scale, Minus } from "lucide-react";
import { Card, SectionTitle } from "../ui.jsx";
import { targets, mealTotals, fastState, searchFoods, MEAL_SLOTS, slotByHour, weightSeries, weightTrend, trendNote, dm, vnNum, uid, GOALS } from "../../lib/health.js";
import { addMeal, removeMeal, setCfg, setWeight } from "../../lib/healthStore.js";
import { num, inputCls, btnPrimary, btnGhost, Bar, LineChart, Field } from "./bits.jsx";

const DAY = 86400000;
const hourVN = () => new Date(Date.now() + 7 * 3600000).getUTCHours();

// Hộp thêm món: tìm trong danh sách món Việt + món của tôi, hoặc nhập tay
function AddMeal({ slot, cfg, onAdd, onClose }) {
  const [q, setQ] = useState(""), [sel, setSel] = useState(null), [qty, setQty] = useState(1);
  const [manual, setManual] = useState(false), [m, setM] = useState({ name: "", kcal: "", p: "", c: "", f: "", keep: true });
  const list = useMemo(() => searchFoods(q, cfg.foods), [q, cfg.foods]);
  const groups = useMemo(() => { const g = new Map(); for (const x of list) { if (!g.has(x.g)) g.set(x.g, []); g.get(x.g).push(x); } return [...g]; }, [list]);
  const put = () => { onAdd({ slot, name: sel.name, unit: sel.unit, kcal: sel.kcal, p: sel.p, c: sel.c, f: sel.f, q: qty }); onClose(); };
  const putManual = () => {
    const food = { name: m.name.trim(), unit: "1 phần", kcal: Math.round(num(m.kcal)), p: num(m.p), c: num(m.c), f: num(m.f) };
    if (!food.name || !food.kcal) return;
    if (m.keep) setCfg((c) => ({ ...c, foods: [{ id: "f" + uid(), ...food }, ...c.foods.filter((x) => x.name !== food.name)].slice(0, 200) }));
    onAdd({ slot, ...food, q: 1 }); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5" role="dialog" aria-label="Thêm món ăn">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-extrabold text-slate-900">Thêm món — bữa {MEAL_SLOTS.find(([k]) => k === slot)?.[1].toLowerCase()}</h3><button aria-label="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        {sel ? (
          <div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="font-extrabold text-slate-900">{sel.name}</div>
              <div className="text-[12.5px] text-slate-500">{sel.unit}: {sel.kcal} kcal · đạm {vnNum(sel.p)} g · tinh bột {vnNum(sel.c)} g · béo {vnNum(sel.f)} g</div>
              <div className="mt-3 flex items-center justify-center gap-4">
                <button onClick={() => setQty((v) => Math.max(0.5, v - 0.5))} aria-label="Bớt nửa phần" className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-slate-300 hover:bg-white"><Minus size={18} /></button>
                <div className="w-24 text-center"><div className="text-3xl font-extrabold tabular-nums text-slate-900">{vnNum(qty)}</div><div className="text-[12px] text-slate-500">phần</div></div>
                <button onClick={() => setQty((v) => Math.min(10, v + 0.5))} aria-label="Thêm nửa phần" className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-slate-300 hover:bg-white"><Plus size={18} /></button>
              </div>
              <div className="mt-3 text-center text-sm font-bold text-slate-700">= {Math.round(sel.kcal * qty)} kcal · {vnNum(sel.p * qty)} g đạm</div>
            </div>
            <div className="mt-4 flex gap-2"><button onClick={() => setSel(null)} className={btnGhost}>Chọn món khác</button><button onClick={put} className={btnPrimary + " flex-1"}>Thêm vào bữa</button></div>
          </div>
        ) : manual ? (
          <div className="space-y-3">
            <Field label="Tên món"><input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} className={inputCls} placeholder="VD: Cơm nhà (1 bát cơm + thịt rang + rau)" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Calo (kcal)"><input inputMode="numeric" value={m.kcal} onChange={(e) => setM({ ...m, kcal: e.target.value })} className={inputCls} /></Field>
              <Field label="Đạm (g)"><input inputMode="decimal" value={m.p} onChange={(e) => setM({ ...m, p: e.target.value })} className={inputCls} /></Field>
              <Field label="Tinh bột (g)"><input inputMode="decimal" value={m.c} onChange={(e) => setM({ ...m, c: e.target.value })} className={inputCls} /></Field>
              <Field label="Béo (g)"><input inputMode="decimal" value={m.f} onChange={(e) => setM({ ...m, f: e.target.value })} className={inputCls} /></Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" checked={m.keep} onChange={(e) => setM({ ...m, keep: e.target.checked })} /> Lưu vào "Món của tôi" để lần sau chọn nhanh</label>
            <p className="text-[12px] text-slate-500">Không biết đạm, béo thì chỉ cần nhập calo. Calo thường in trên bao bì hoặc tra trên mạng.</p>
            <div className="flex gap-2"><button onClick={() => setManual(false)} className={btnGhost}>Quay lại danh sách</button><button onClick={putManual} disabled={!m.name.trim() || !num(m.kcal)} className={btnPrimary + " flex-1"}>Thêm vào bữa</button></div>
          </div>
        ) : (
          <>
            <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + " pl-9"} placeholder="Tìm món: phở, cơm tấm, ức gà…" aria-label="Tìm món ăn" autoFocus /></div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {groups.map(([g, items]) => (
                <div key={g} className="mb-2">
                  <div className="sticky top-0 bg-white py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g}</div>
                  {items.map((x) => (
                    <button key={g + x.name} onClick={() => { setSel(x); setQty(1); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{x.name}</span><span className="block text-[12px] text-slate-500">{x.unit} · đạm {vnNum(x.p)} g</span></span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700">{x.kcal} kcal</span>
                    </button>
                  ))}
                </div>
              ))}
              {!list.length && <p className="py-6 text-center text-[13px] text-slate-500">Không có "{q}" trong danh sách. Bấm "Nhập món khác" bên dưới.</p>}
            </div>
            <button onClick={() => { setManual(true); setM((v) => ({ ...v, name: q })); }} className={btnGhost + " mt-3"}><Plus size={15} /> Nhập món khác</button>
            <p className="mt-2 text-[11.5px] text-slate-400">Số calo là ước lượng cho một phần thường gặp, có thể lệch khoảng 15% tuỳ quán.</p>
          </>
        )}
      </div>
    </div>
  );
}

function FastCard({ fast }) {
  const st = fastState(fast, Date.now());
  const h = Math.floor(st.left / 60), mi = st.left % 60;
  return (
    <Card className={st.eating ? "" : "bg-violet-50"}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${st.eating ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{st.eating ? <Utensils size={20} /> : <Hourglass size={20} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Nhịn ăn theo giờ · ăn {st.start}–{st.end}</div>
          <div className="text-lg font-extrabold text-slate-900">{st.eating ? "Đang trong giờ ăn" : "Đang nhịn"} <span className="font-semibold text-slate-500">· còn {h ? `${h} giờ ` : ""}{mi} phút</span></div>
          <div className="text-[12.5px] text-slate-500">{st.eating ? `Hết giờ ăn lúc ${st.until}` : `Được ăn lại lúc ${st.until}. Nước lọc, trà, cà phê đen vẫn uống được.`}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Food({ cfg, days, todayKey }) {
  const [key, setKey] = useState(todayKey);
  const [adding, setAdding] = useState(null);
  const [wIn, setWIn] = useState("");
  const day = days[key] || {};
  const profile = cfg.profile;
  const latestW = useMemo(() => { const k = Object.keys(days).filter((x) => days[x]?.weight).sort().pop(); return k ? days[k].weight : profile?.weightKg; }, [days, profile]);
  const tg = useMemo(() => targets(profile ? { ...profile, weightKg: latestW || profile.weightKg } : null), [profile, latestW]);
  const tot = mealTotals(day);
  const isToday = key === todayKey;
  const shift = (d) => { const ms = new Date(key + "T00:00:00Z").getTime() + d * DAY; const k = new Date(ms).toISOString().slice(0, 10); if (k <= todayKey) setKey(k); };
  const series = useMemo(() => weightSeries(days, 60), [days]);
  const trend = useMemo(() => weightTrend(series), [series]);
  const hasW = series.some((x) => x.kg);
  const saveW = () => { const v = num(wIn); if (v < 25 || v > 300) return; setWeight(Math.round(v * 10) / 10, todayKey); if (profile && Math.abs((profile.weightKg || 0) - v) >= 0.5) setCfg((c) => ({ ...c, profile: { ...c.profile, weightKg: Math.round(v * 10) / 10 } })); setWIn(""); };
  const saveFav = (slot, items) => {
    const label = MEAL_SLOTS.find(([k]) => k === slot)[1];
    const name = items.length === 1 ? items[0].name : `${label}: ${items.map((x) => x.name).join(" + ")}`.slice(0, 60);
    setCfg((c) => ({ ...c, favs: [{ id: "v" + uid(), name, items: items.map(({ name: n2, unit, kcal, p, c: cb, f, q }) => ({ name: n2, unit, kcal, p, c: cb, f, q })) }, ...c.favs.filter((x) => x.name !== name)].slice(0, 30) }));
  };
  const left = tg ? tg.kcal - tot.kcal : null;

  return (
    <div className="space-y-4">
      {cfg.fast.on && <FastCard fast={cfg.fast} />}

      <Card>
        <SectionTitle action={
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} aria-label="Ngày trước" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button>
            <span className="min-w-[72px] text-center text-[13px] font-bold text-slate-700">{isToday ? "Hôm nay" : dm(key)}</span>
            <button onClick={() => shift(1)} disabled={isToday} aria-label="Ngày sau" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
          </div>}>Ăn uống</SectionTitle>
        {tg ? (
          <>
            <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3">
              <div className="text-[12px] font-bold uppercase tracking-wide text-amber-700">{left >= 0 ? "Còn được ăn" : "Đã vượt mức"}</div>
              <div className="text-3xl font-extrabold tabular-nums text-slate-900">{Math.abs(left)} <span className="text-base font-bold text-slate-500">kcal</span></div>
              <div className="text-[12.5px] text-slate-600">Mục tiêu {tg.kcal} kcal ({(GOALS[profile.goal] || GOALS.recomp).label.toLowerCase()}) · đã ăn {tot.kcal} kcal</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Bar label="Đạm" value={tot.p} max={tg.protein} unit="g" color="#10b981" />
              <Bar label="Tinh bột" value={tot.c} max={tg.carb} unit="g" color="#f59e0b" />
              <Bar label="Chất béo" value={tot.f} max={tg.fat} unit="g" color="#8b5cf6" />
            </div>
            {isToday && tot.kcal > 0 && tot.p < tg.protein * 0.6 && hourVN() >= 15 && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">Đạm hôm nay còn thiếu {tg.protein - tot.p} g. Gợi ý bữa tối: 150 g ức gà (46 g đạm) hoặc 2 quả trứng + 1 hộp sữa chua + 1 muỗng whey.</p>}
          </>
        ) : <p className="-mt-2 mb-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Nhập chỉ số cơ thể ở tab <b>Cài đặt</b> để app tính lượng calo và đạm cần ăn mỗi ngày. Chưa nhập vẫn ghi bữa được: hôm nay đã ăn <b>{tot.kcal} kcal</b>, {tot.p} g đạm.</p>}

        {cfg.favs.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Bữa quen — bấm để thêm ngay</div>
            <div className="flex flex-wrap gap-2">
              {cfg.favs.map((v) => (
                <span key={v.id} className="inline-flex items-center rounded-full bg-indigo-50 text-[12.5px] font-bold text-indigo-700">
                  <button onClick={() => { const slot = slotByHour(hourVN()); v.items.forEach((it) => addMeal({ slot: isToday ? slot : "phu", ...it }, key)); }} className="py-1.5 pl-3 pr-1.5">{v.name} · {Math.round(v.items.reduce((s, it) => s + it.kcal * (it.q ?? 1), 0))} kcal</button>
                  <button onClick={() => setCfg((c) => ({ ...c, favs: c.favs.filter((x) => x.id !== v.id) }))} aria-label={`Bỏ bữa quen ${v.name}`} className="rounded-full py-1.5 pl-1 pr-2.5 text-indigo-400 hover:text-rose-600"><X size={13} /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {MEAL_SLOTS.map(([slot, label]) => {
            const items = (day.meals || []).filter((x) => (x.slot || "phu") === slot);
            const kc = Math.round(items.reduce((s, x) => s + x.kcal * (x.q ?? 1), 0));
            return (
              <div key={slot} className="rounded-2xl p-3 ring-1 ring-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 whitespace-nowrap font-extrabold text-slate-900">{label}{kc > 0 && <span className="ml-2 text-[12.5px] font-semibold text-slate-500">{kc} kcal</span>}</div>
                  <div className="flex items-center gap-1">
                    {items.length > 0 && <button onClick={() => saveFav(slot, items)} title="Lưu thành bữa quen" aria-label={`Lưu bữa ${label} thành bữa quen`} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"><Star size={16} /></button>}
                    <button onClick={() => setAdding(slot)} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-slate-700"><Plus size={14} /> Thêm món</button>
                  </div>
                </div>
                {items.map((x) => (
                  <div key={x.id} className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-slate-700">{(x.q ?? 1) !== 1 && <b className="tabular-nums">{vnNum(x.q)} × </b>}{x.name}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums text-slate-500">{Math.round(x.kcal * (x.q ?? 1))} kcal · {vnNum(x.p * (x.q ?? 1), 0)} g đạm<button onClick={() => removeMeal(x.id, key)} aria-label={`Xoá ${x.name}`} className="rounded p-1 text-slate-300 hover:text-rose-600"><X size={14} /></button></span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Cân nặng</SectionTitle>
        <div className="-mt-1 flex flex-wrap items-end gap-2">
          <label className="w-40 text-[12px] font-semibold text-slate-500">Cân sáng nay (kg)
            <input id="sk-can" inputMode="decimal" value={wIn} onChange={(e) => setWIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveW()} className={inputCls + " mt-0.5 text-center text-lg font-bold tabular-nums"} placeholder={days[todayKey]?.weight ? vnNum(days[todayKey].weight) : latestW ? vnNum(latestW) : "70,5"} />
          </label>
          <button onClick={saveW} disabled={!(num(wIn) >= 25 && num(wIn) <= 300)} className={btnPrimary}><Scale size={16} /> Lưu số cân</button>
          {days[todayKey]?.weight && <span className="pb-2.5 text-[12.5px] text-slate-500">Hôm nay đã ghi: <b className="text-slate-900">{vnNum(days[todayKey].weight)} kg</b></span>}
        </div>
        {hasW ? (
          <>
            <div className="mt-3"><LineChart count={series.length} unit="kg" labels={[dm(series[0].key), dm(series[Math.floor(series.length / 2)].key), "hôm nay"]} series={[{ color: "#94a3b8", dotsOnly: true, points: series.map((s, i) => ({ x: i, y: s.kg })) }, { color: "#0ea5e9", points: series.map((s, i) => ({ x: i, y: s.avg })) }]} /></div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400 align-middle" />Số cân từng ngày</span><span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: "#0ea5e9" }} />Trung bình 7 ngày</span></div>
            <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[13px] text-slate-700">{trend != null && <b className="tabular-nums">{trend > 0 ? "+" : ""}{vnNum(trend, 2)} kg mỗi tuần. </b>}{trendNote(trend, latestW, profile?.goal || "recomp")}</p>
            <p className="mt-2 text-[12px] text-slate-500">Cân lên xuống 1–2 kg mỗi ngày do nước và muối là bình thường. Nhìn đường xanh (trung bình 7 ngày) mới biết đang giảm thật hay không.</p>
          </>
        ) : <p className="mt-3 text-[13px] text-slate-500">Mỗi sáng cân một lần lúc mới ngủ dậy. Sau vài ngày biểu đồ xu hướng sẽ hiện ở đây.</p>}
      </Card>
      {adding && <AddMeal slot={adding} cfg={cfg} onAdd={(m) => addMeal(m, key)} onClose={() => setAdding(null)} />}
    </div>
  );
}
