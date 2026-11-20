import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Dumbbell, Plus, Trash2, Check, Timer, Trophy, Pencil, X, TrendingUp, Play, Flag, Image as ImageIcon, ExternalLink, ArrowUpCircle, Lock } from "lucide-react";
import { Card, SectionTitle } from "../ui.jsx";
import { ask } from "../ConfirmDialog.jsx";
import { PLAN_TEMPLATES, planFromTemplate, DOW, lastSession, suggest, exHistory, exNames, isRecord, sessionVolume, dowOf, dayKeyOf, dm, vnNum, uid, exInfo, exImgs, exVideoUrl, LEVELS, planFromLevel, levelProgress, WARMUP, STRETCH, extraImgs, planImgs } from "../../lib/health.js";
import { setCfg, setGym } from "../../lib/healthStore.js";
import { num, inputCls, btnPrimary, btnGhost, LineChart, Field, ExPhoto, beep } from "./bits.jsx";
import { Burst, Barbell } from "./fx.jsx";
const Focus = lazy(() => import("./Focus.jsx"));

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // hiển thị T2 → CN

// Đồng hồ nghỉ giữa hiệp (đếm ngược, hết giờ rung + kêu)
function RestTimer({ end, total, onStop, onAdd }) {
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  useEffect(() => { rang.current = false; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [end]);
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  useEffect(() => { if (left === 0 && !rang.current) { rang.current = true; beep(); } }, [left]);
  return (
    <div className="sticky bottom-20 z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl sm:bottom-4" role="timer" aria-live="off">
      <Timer size={20} className={left ? "text-sky-300" : "text-emerald-300"} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-white/70">{left ? "Nghỉ giữa hiệp" : "Hết giờ nghỉ — vào hiệp tiếp"}</div>
        <div className="text-2xl font-extrabold tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-sky-400" style={{ width: `${total ? (left / total) * 100 : 0}%`, transition: "width .25s linear" }} /></div>
      </div>
      {left > 0 && <button onClick={onAdd} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">+30 giây</button>}
      <button onClick={onStop} aria-label="Tắt đồng hồ nghỉ" className="rounded-xl bg-white/10 p-2 hover:bg-white/20"><X size={18} /></button>
    </div>
  );
}


// Hình mẫu + cách tập 1 động tác (ảnh tư thế bắt đầu / kết thúc, 3 ý chính, link video)
export function ExGuide({ name, onClose }) {
  const info = exInfo(name), imgs = exImgs(name);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5" role="dialog" aria-label={`Cách tập ${name}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-extrabold leading-tight text-slate-900">{name}</h3>{info && <div className="text-[12.5px] text-slate-500">Tập vào: {info.muscle}</div>}</div>
          <button aria-label="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {info ? (
          <>
            <ExPhoto imgs={imgs} alt={name} className="aspect-[3/2] w-full" />
            <p className="mt-1 text-center text-[11.5px] text-slate-400">Hình tự chuyển giữa tư thế bắt đầu và kết thúc</p>
            <ol className="mt-3 space-y-1.5 text-[13.5px] text-slate-700">{info.cues.map((c, i) => <li key={i} className="flex gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">{i + 1}</span><span>{c}</span></li>)}</ol>
          </>
        ) : <p className="text-[13px] text-slate-500">Bài này anh tự thêm nên chưa có hình mẫu. Bấm nút dưới để xem video hướng dẫn.</p>}
        <a href={exVideoUrl(name)} target="_blank" rel="noopener noreferrer" className={btnGhost + " mt-4 w-full"}><ExternalLink size={15} /> Xem video hướng dẫn trên YouTube</a>
      </div>
    </div>
  );
}
// Nút nhỏ "Xem động tác" có ảnh thu nhỏ
function GuideButton({ name, onOpen }) {
  const imgs = exImgs(name);
  return (
    <button onClick={() => onOpen(name)} aria-label={`Xem cách tập ${name}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-50 py-1 pl-1 pr-2.5 text-[12px] font-bold text-indigo-700 ring-1 ring-slate-200 hover:ring-indigo-300">
      {imgs[0] ? <img src={imgs[0]} alt="" loading="lazy" className="h-8 w-10 rounded-lg object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <ImageIcon size={15} className="ml-1.5" />}Xem động tác
    </button>
  );
}

// Danh sách động tác khởi động / giãn cơ (gập lại được), mỗi động tác có hình
function MoveList({ title, hint, items, open }) {
  return (
    <details open={open} className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <summary className="cursor-pointer text-[13.5px] font-bold text-slate-800">{title} <span className="font-medium text-slate-500">· {hint}</span></summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((w) => (
          <li key={w.name} className="flex items-center gap-2.5">
            <ExPhoto imgs={extraImgs(w.img)} alt={w.name} className="h-14 w-20 shrink-0" />
            <span className="min-w-0 text-[12.5px] leading-snug text-slate-600"><b className="block text-slate-900">{w.name}</b>{w.how}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
const FEEL = [["nhe", "Nhẹ", "Buổi sau app sẽ gợi ý tăng khi đủ hiệp"], ["vua", "Vừa sức", "Đúng mức, cứ giữ nhịp này"], ["nang", "Nặng", "Buổi sau giữ nguyên mức, chưa tăng"]];
function AfterSession({ gym, todayKey }) {
  const up = (patch) => setGym(todayKey, (g) => ({ ...g, ...patch }));
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl p-3 ring-1 ring-slate-200">
        <div className="text-[13.5px] font-bold text-slate-900">Buổi hôm nay thấy thế nào?</div>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Cảm nhận buổi tập">
          {FEEL.map(([k, l]) => <button key={k} onClick={() => up({ feel: k })} aria-pressed={gym.feel === k} className={`rounded-xl py-2.5 text-sm font-bold ring-1 ${gym.feel === k ? "bg-indigo-600 text-white ring-indigo-600" : "text-slate-700 ring-slate-200 hover:bg-slate-50"}`}>{l}</button>)}
        </div>
        {gym.feel && <p className="mt-1.5 text-[12.5px] text-slate-500">{FEEL.find(([k]) => k === gym.feel)[2]}.</p>}
        <label className="mt-2 flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={!!gym.pain} onChange={(e) => up({ pain: e.target.checked || undefined })} /> Có đau ở khớp (gối, vai, lưng dưới…), không phải mỏi cơ</label>
        {gym.pain && <p className="mt-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700">Buổi sau app sẽ giảm một bậc tạ cho các bài hôm nay. Đau kéo dài quá 3 ngày hoặc đau nhói thì nên nghỉ và đi khám.</p>}
      </div>
      <MoveList title="Giãn cơ 5 phút" hint="giảm đau mỏi ngày mai" items={STRETCH} open={!gym.feel} />
    </div>
  );
}

// Lộ trình theo cấp: 4 bậc dễ → khó, hiện đang ở đâu, còn mấy buổi nữa thì lên cấp
function Roadmap({ plan, days, onPick }) {
  const pr = levelProgress(plan, days), cur = pr?.level.lv || 0;
  const [all, setAll] = useState(false); // đang theo 1 cấp → chỉ hiện cấp đó cho gọn, bấm mới mở cả 4 cấp
  const list = cur && !all ? LEVELS.filter((L) => L.lv === cur) : LEVELS;
  return (
    <div>
      <ol className={`grid gap-2 ${list.length > 1 ? "sm:grid-cols-4" : ""}`}>
        {list.map((L) => {
          const state = !cur ? "open" : L.lv < cur ? "done" : L.lv === cur ? "cur" : "lock";
          return (
            <li key={L.lv} className={`rounded-2xl p-3 ring-1 ${state === "cur" ? "bg-indigo-50 ring-indigo-300" : state === "done" ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{state === "done" ? <Check size={13} className="text-emerald-600" /> : state === "lock" ? <Lock size={12} /> : null}Cấp {L.lv} · {L.weeks}</div>
              <div className="mt-0.5 font-extrabold text-slate-900">{L.name}</div>
              <div className="text-[12px] text-slate-500">3 buổi/tuần · {L.time}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-slate-600">{L.goal}</div>
              {state !== "cur" && <button onClick={() => onPick(L.lv)} className="mt-2 text-[12.5px] font-bold text-indigo-600">{!cur ? (L.lv === 1 ? "Bắt đầu từ đây (khuyên dùng) →" : "Bắt đầu từ cấp này →") : L.lv < cur ? "Quay lại cấp này" : "Nhảy lên cấp này"}</button>}
            </li>
          );
        })}
      </ol>
      {cur > 0 && <button onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 text-[12.5px] font-bold text-indigo-600">{all ? "Thu gọn" : "Xem cả 4 cấp của lộ trình"}</button>}
      {pr && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3">
          {pr.need > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]"><b className="text-slate-900">Cấp {pr.level.lv} — {pr.level.name}: đã tập {Math.min(pr.done, pr.need)}/{pr.need} buổi</b><span className="text-slate-500">{pr.ready ? "Đủ điều kiện lên cấp" : `còn ${pr.need - pr.done} buổi nữa`}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (pr.done / pr.need) * 100)}%`, transition: "width .4s" }} /></div>
            </>
          ) : <b className="text-[13px] text-slate-900">Cấp {pr.level.lv} — {pr.level.name}: đã tập {pr.done} buổi. Đây là cấp cao nhất, cứ tăng tạ đều theo gợi ý.</b>}
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-slate-600">{pr.level.tips.map((t) => <li key={t}>• {t}</li>)}</ul>
          {pr.ready && pr.next && <button onClick={() => onPick(pr.next.lv)} className={btnPrimary + " mt-3"}><ArrowUpCircle size={16} /> Lên Cấp {pr.next.lv} — {pr.next.name}</button>}
          {pr.ready && <p className="mt-2 text-[12px] text-slate-500">Chưa thấy sẵn sàng thì cứ ở lại cấp này thêm vài tuần, không sao cả.</p>}
        </div>
      )}
    </div>
  );
}

// 1 bài trong buổi đang tập
function ExerciseCard({ ex, idx, days, dayKey, onChange, onRemove, onRest, onGuide }) {
  const last = useMemo(() => lastSession(days, ex.name, dayKey), [days, ex.name, dayKey]);
  const sg = useMemo(() => suggest(last, { sets: ex.n, reps: ex.reps, step: ex.step }), [last, ex.n, ex.reps, ex.step]);
  const sets = ex.sets || [];
  const prev = sets[sets.length - 1];
  const [kg, setKg] = useState(""), [reps, setReps] = useState("");
  const kgV = kg !== "" ? kg : prev ? String(prev.kg).replace(".", ",") : sg.kg != null ? String(sg.kg).replace(".", ",") : "";
  const repsV = reps !== "" ? reps : String(sg.reps || ex.reps || "");
  const done = sets.length >= (ex.n || 1);
  const unit = /\(giây\)/.test(ex.name) ? "Số giây" : /\(phút\)/.test(ex.name) ? "Số phút" : "Số lần";
  const noKg = !Number(ex.step) && !sets.some((x) => x.kg) && !last?.sets.some((x) => x.kg); // bài không dùng tạ → ẩn ô mức tạ cho gọn
  const record = isRecord(days, ex.name, dayKey, sets);
  const add = () => {
    if (!num(repsV)) return;
    onChange({ ...ex, sets: [...sets, { kg: noKg ? 0 : num(kgV), reps: Math.round(num(repsV)) }] });
    setKg(""); setReps(""); onRest();
  };
  return (
    <div className={`rounded-2xl p-3.5 ring-1 ${done ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-extrabold text-slate-900">{idx + 1}. {ex.name}{record && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"><Trophy size={11} /> Kỷ lục mới</span>}</div>
          <div className="text-[12.5px] text-slate-500">Mục tiêu {ex.n} hiệp × {ex.reps}{last ? ` · lần trước (${dm(last.key)}): ${last.sets.map((s) => `${s.kg ? vnNum(s.kg) + "×" : ""}${s.reps}`).join(", ")}` : ""}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1"><GuideButton name={ex.name} onOpen={onGuide} /><button onClick={onRemove} aria-label={`Bỏ bài ${ex.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={15} /></button></div>
      </div>
      <div className={`mt-2 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold ${sg.up ? "bg-indigo-50 text-indigo-700" : "bg-slate-50 text-slate-600"}`}>{sg.up && <TrendingUp size={13} className="mr-1 inline" />}{sg.text}</div>
      {sets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sets.map((s, i) => (
            <button key={i} onClick={() => onChange({ ...ex, sets: sets.filter((_, j) => j !== i) })} title="Bấm để xoá hiệp này" className="group inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[12.5px] font-bold tabular-nums text-white">
              <span className="text-white/60">H{i + 1}</span> {s.kg ? `${vnNum(s.kg)} kg × ` : ""}{s.reps}<X size={12} className="text-white/50 group-hover:text-white" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-end gap-2">
        {!noKg && <label className="w-24 text-[11.5px] font-semibold text-slate-500">Mức tạ (kg)<input inputMode="decimal" value={kgV} onChange={(e) => setKg(e.target.value)} onFocus={(e) => e.target.select()} className={inputCls + " mt-0.5 text-center font-bold tabular-nums"} placeholder="0" aria-label={`Mức tạ ${ex.name}`} /></label>}
        <label className="w-20 text-[11.5px] font-semibold text-slate-500">{unit}<input inputMode="numeric" value={repsV} onChange={(e) => setReps(e.target.value)} onFocus={(e) => e.target.select()} className={inputCls + " mt-0.5 text-center font-bold tabular-nums"} aria-label={`Số lần ${ex.name}`} /></label>
        <button onClick={add} disabled={!num(repsV)} className={btnPrimary + " flex-1"}><Check size={16} /> Xong hiệp {sets.length + 1}</button>
      </div>
    </div>
  );
}

// Sửa lịch tập: các buổi + bài + xếp vào thứ trong tuần
function PlanEditor({ plan, onClose }) {
  const [p, setP] = useState(() => JSON.parse(JSON.stringify(plan)));
  const upR = (rid, patch) => setP((x) => ({ ...x, routines: x.routines.map((r) => (r.id === rid ? { ...r, ...patch } : r)) }));
  const upE = (rid, i, patch) => upR(rid, { ex: p.routines.find((r) => r.id === rid).ex.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const save = () => {
    const routines = p.routines.map((r) => ({ ...r, name: r.name.trim() || "Buổi tập", ex: r.ex.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), sets: Math.max(1, Math.round(num(e.sets)) || 3), reps: Math.max(1, Math.round(num(e.reps)) || 10), step: num(e.step) })) }));
    const ids = new Set(routines.map((r) => r.id));
    const week = Object.fromEntries(Object.entries(p.week).filter(([, v]) => ids.has(v)));
    setCfg((c) => ({ ...c, plan: { ...c.plan, routines, week } }));
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5" role="dialog" aria-label="Sửa lịch tập">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-extrabold text-slate-900">Sửa lịch tập</h3><button aria-label="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="mb-4">
          <div className="mb-1.5 text-sm font-semibold text-slate-600">Thứ nào tập buổi nào</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WEEK_ORDER.map((d) => (
              <label key={d} className="text-[12px] font-bold text-slate-500">{DOW[d]}
                <select value={p.week[String(d)] || ""} onChange={(e) => setP((x) => { const w = { ...x.week }; if (e.target.value) w[String(d)] = e.target.value; else delete w[String(d)]; return { ...x, week: w }; })} className={inputCls + " mt-0.5"}>
                  <option value="">Nghỉ</option>
                  {p.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {p.routines.map((r) => (
            <div key={r.id} className="rounded-2xl p-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <input value={r.name} onChange={(e) => upR(r.id, { name: e.target.value })} className={inputCls + " font-bold"} aria-label="Tên buổi tập" />
                <button onClick={() => setP((x) => ({ ...x, routines: x.routines.filter((y) => y.id !== r.id) }))} aria-label={`Xoá buổi ${r.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={16} /></button>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_52px_52px_60px_32px] items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><span>Bài</span><span className="text-center">Hiệp</span><span className="text-center">Lần</span><span className="text-center">Tăng kg</span><span /></div>
              {r.ex.map((e, i) => (
                <div key={i} className="mt-1 grid grid-cols-[1fr_52px_52px_60px_32px] items-center gap-1.5">
                  <input value={e.name} onChange={(ev) => upE(r.id, i, { name: ev.target.value })} className={inputCls} aria-label="Tên bài" />
                  <input inputMode="numeric" value={e.sets} onChange={(ev) => upE(r.id, i, { sets: ev.target.value })} className={inputCls + " px-1 text-center"} aria-label="Số hiệp" />
                  <input inputMode="numeric" value={e.reps} onChange={(ev) => upE(r.id, i, { reps: ev.target.value })} className={inputCls + " px-1 text-center"} aria-label="Số lần" />
                  <input inputMode="decimal" value={e.step} onChange={(ev) => upE(r.id, i, { step: ev.target.value })} className={inputCls + " px-1 text-center"} aria-label="Mức tăng tạ" />
                  <button onClick={() => upR(r.id, { ex: r.ex.filter((_, j) => j !== i) })} aria-label={`Xoá bài ${e.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={15} /></button>
                </div>
              ))}
              <button onClick={() => upR(r.id, { ex: [...r.ex, { name: "", sets: 3, reps: 10, step: 2.5 }] })} className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-indigo-600"><Plus size={14} /> Thêm bài</button>
            </div>
          ))}
        </div>
        <button onClick={() => setP((x) => ({ ...x, routines: [...x.routines, { id: "r" + uid(), name: "Buổi mới", ex: [] }] }))} className={btnGhost + " mt-3"}><Plus size={15} /> Thêm buổi</button>
        <p className="mt-3 text-[12px] text-slate-500">"Tăng kg" là mức cộng thêm khi buổi trước làm đủ mọi hiệp. Bài không dùng tạ (chống đẩy, plank…) để 0: app sẽ gợi ý tăng số lần.</p>
        <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Huỷ</button><button onClick={save} className={btnPrimary}>Lưu lịch tập</button></div>
      </div>
    </div>
  );
}

export default function Gym({ cfg, days, todayKey }) {
  const plan = cfg.plan, has = plan.routines.length > 0;
  const dow = dowOf(Date.now());
  const today = days[todayKey] || {};
  const gym = today.gym || null;
  const planned = plan.routines.find((r) => r.id === plan.week[String(dow)]);
  const [editing, setEditing] = useState(false);
  const [rest, setRest] = useState(null); // { end, total }
  const [addName, setAddName] = useState("");
  const [pick, setPick] = useState("");
  const [guide, setGuide] = useState(null); // tên bài đang xem hình mẫu
  const [focus, setFocus] = useState(false); // chế độ đang tập toàn màn hình
  // Còn mạng thì tải sẵn ảnh của lịch đang dùng vào máy (trình duyệt tự giữ lại) → vào phòng tập mất sóng vẫn xem được
  useEffect(() => {
    if (!plan.routines.length || typeof Image === "undefined" || navigator.onLine === false) return undefined;
    const t = setTimeout(() => { for (const u of planImgs(plan)) { const im = new Image(); im.src = u; } }, 2500);
    return () => clearTimeout(t);
  }, [plan]);
  const [more, setMore] = useState(false);
  const pickLevel = async (lv) => {
    if (has && !(await ask(`Đổi sang lịch tập Cấp ${lv}?\nLịch tuần hiện tại sẽ được thay bằng lịch của cấp này. Các buổi đã ghi vẫn giữ nguyên.`, { ok: "Đổi lịch" }))) return;
    setCfg((c) => ({ ...c, plan: planFromLevel(lv) }));
  };
  const restSec = Math.max(15, Number(cfg.gym.restSec) || 90);

  const begin = (r) => { setFocus(true); setGym(todayKey, () => ({ rid: r?.id || null, name: r?.name || "Buổi tự do", start: Date.now(), ex: (r?.ex || []).map((e) => ({ name: e.name, n: e.sets, reps: e.reps, step: e.step, sets: [] })) })); };
  const upEx = (i, next) => setGym(todayKey, (g) => ({ ...g, ex: g.ex.map((e, j) => (j === i ? next : e)) }));
  const [burst, setBurst] = useState(0);
  const finish = () => { setGym(todayKey, (g) => ({ ...g, end: Date.now() })); setRest(null); setFocus(false); setBurst(Date.now()); };
  const dropSession = async () => { if (await ask("Xoá buổi tập hôm nay?\nCác hiệp đã ghi của hôm nay sẽ mất.", { ok: "Xoá buổi", danger: true })) { setGym(todayKey, () => null); setRest(null); } };

  const names = useMemo(() => exNames(days), [days]);
  const chartEx = pick && names.includes(pick) ? pick : names[0] || "";
  const hist = useMemo(() => (chartEx ? exHistory(days, chartEx) : []), [days, chartEx]);
  const weekDone = useMemo(() => {
    const out = {}; // dow → đã tập trong 7 ngày gần nhất
    for (let i = 0; i < 7; i++) { const ms = Date.now() - i * 86400000, k = dayKeyOf(ms); if (days[k]?.gym?.ex?.some((e) => (e.sets || []).length)) out[dowOf(ms)] = true; }
    return out;
  }, [days]);

  if (!has) {
    return (
      <div className="space-y-4">
        <Card>
          <SectionTitle>Lộ trình cho người mới: 4 cấp, từ dễ đến khó</SectionTitle>
          <p className="-mt-2 mb-3 text-[13px] text-slate-500">Bắt đầu bằng các bài rất nhẹ để quen đi tập, đủ số buổi thì app mới gợi ý lên cấp. Mỗi động tác đều có hình mẫu và cách tập.</p>
          <Roadmap plan={plan} days={days} onPick={pickLevel} />
        </Card>
        <Card>
          <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="text-[13px] font-bold text-slate-600">{more ? "Ẩn" : "Đã tập lâu rồi? Chọn lịch có sẵn khác"}</button>
          {more && (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {PLAN_TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => setCfg((c) => ({ ...c, plan: planFromTemplate(t) }))} className="rounded-2xl p-4 text-left ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-indigo-300">
                    <Dumbbell size={20} className="text-indigo-600" />
                    <div className="mt-2 font-extrabold text-slate-900">{t.label}</div>
                    <div className="mt-0.5 text-[12.5px] text-slate-500">{t.hint}</div>
                    <ul className="mt-2 space-y-0.5 text-[12.5px] text-slate-600">{t.routines.map((r) => <li key={r.name}>• {r.name} ({r.ex.length} bài)</li>)}</ul>
                  </button>
                ))}
              </div>
              <button onClick={() => { setCfg((c) => ({ ...c, plan: { routines: [{ id: "r" + uid(), name: "Buổi 1", ex: [] }], week: {} } })); setEditing(true); }} className={btnGhost + " mt-3"}><Pencil size={14} /> Tự tạo lịch riêng</button>
            </>
          )}
        </Card>
      </div>
    );
  }

  const active = gym && !gym.end;
  const setsDone = (gym?.ex || []).reduce((s, e) => s + (e.sets || []).length, 0);
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>{plan.level ? "Lộ trình của anh" : "Lộ trình theo cấp (dễ → khó)"}</SectionTitle>
        {!plan.level && <p className="-mt-2 mb-3 text-[13px] text-slate-500">Anh đang dùng lịch tự chọn. Muốn đi theo lộ trình từng cấp thì chọn một cấp bên dưới.</p>}
        <Roadmap plan={plan} days={days} onPick={pickLevel} />
      </Card>
      <Card>
        <SectionTitle action={<button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[13px] font-bold text-indigo-600"><Pencil size={13} /> Sửa lịch</button>}>Lịch tuần này</SectionTitle>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEK_ORDER.map((d) => {
            const r = plan.routines.find((x) => x.id === plan.week[String(d)]);
            const isToday = d === dow;
            return (
              <div key={d} className={`rounded-xl px-1 py-2 text-center ring-1 ${isToday ? "bg-indigo-50 ring-indigo-300" : "bg-white ring-slate-100"}`}>
                <div className={`text-[11px] font-bold ${isToday ? "text-indigo-700" : "text-slate-400"}`}>{DOW[d]}</div>
                <div className="mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold" style={weekDone[d] ? { background: "#10b981", color: "#fff" } : undefined}>{weekDone[d] ? <Check size={15} /> : r ? <Dumbbell size={15} className="text-slate-500" /> : <span className="text-slate-300">–</span>}</div>
                <div className="mt-1 line-clamp-2 min-h-[26px] text-[10.5px] leading-tight text-slate-500">{r ? r.name.split("(")[0].trim() : "Nghỉ"}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {!gym && (
        <Card>
          <SectionTitle>{planned ? `Hôm nay: ${planned.name}` : "Hôm nay là ngày nghỉ"}</SectionTitle>
          {planned
            ? <><ul className="-mt-1 mb-3 space-y-1.5">{planned.ex.map((e) => <li key={e.name} className="flex items-center justify-between gap-2 text-[13px] text-slate-700"><span className="min-w-0"><b className="text-slate-900">{e.name}</b> — {e.sets} hiệp × {e.reps}</span><GuideButton name={e.name} onOpen={setGuide} /></li>)}</ul><div className="mb-3"><MoveList title="Khởi động 5 phút trước khi tập" hint="làm nóng khớp, tránh chấn thương" items={WARMUP} /></div><button onClick={() => begin(planned)} className={btnPrimary + " w-full py-3.5 text-base sm:w-auto"}><Play size={18} /> Bắt đầu buổi tập</button></>
            : <p className="-mt-2 mb-3 text-[13px] text-slate-500">Nghỉ để cơ hồi phục cũng là một phần của tập. Muốn tập thêm thì chọn buổi bên dưới.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.routines.filter((r) => r.id !== planned?.id).map((r) => <button key={r.id} onClick={() => begin(r)} className={btnGhost}>Tập: {r.name.split("(")[0].trim()}</button>)}
            <button onClick={() => begin(null)} className={btnGhost}>Buổi tự do</button>
          </div>
        </Card>
      )}

      {gym && active && focus && gym.ex.length > 0 && <Suspense fallback={null}><Focus gym={gym} days={days} todayKey={todayKey} restSec={restSec} onClose={() => setFocus(false)} onFinish={finish} /></Suspense>}
      {gym && !(active && focus && gym.ex.length > 0) && (
        <Card>
          <SectionTitle action={<button onClick={dropSession} className="text-[12.5px] font-bold text-slate-400 hover:text-rose-600">Xoá buổi</button>}>{gym.name}{gym.end ? " — đã xong" : ""}</SectionTitle>
          {gym.end && <div className="relative -mt-1 mb-3 py-2"><Burst fire={burst} /><Barbell done={setsDone} total={setsDone} finished /></div>}
          {gym.end && (
            <div className="-mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">
              <span className="inline-flex items-center gap-1.5"><Flag size={15} /> Hoàn thành</span>
              <span>{setsDone} hiệp</span><span>Tổng khối lượng {vnNum(sessionVolume(gym), 0)} kg</span>
              {gym.start && <span>{Math.max(1, Math.round((gym.end - gym.start) / 60000))} phút</span>}
              <button onClick={() => setGym(todayKey, (g) => ({ ...g, end: undefined }))} className="ml-auto font-bold text-emerald-700 underline">Ghi thêm</button>
            </div>
          )}
          {active && <div className="-mt-1 mb-3 py-1"><Barbell done={setsDone} total={gym.ex.reduce((t, e) => t + (e.n || 0), 0)} /></div>}
          {active && gym.ex.length > 0 && <button onClick={() => setFocus(true)} className={btnPrimary + " -mt-1 mb-3 w-full py-3"}><Play size={16} /> Tiếp tục ở chế độ đang tập (toàn màn hình)</button>}
          <div className="space-y-3">
            {gym.ex.map((e, i) => active
              ? <ExerciseCard key={e.name + i} ex={e} idx={i} days={days} dayKey={todayKey} onChange={(next) => upEx(i, next)} onRemove={() => setGym(todayKey, (g) => ({ ...g, ex: g.ex.filter((_, j) => j !== i) }))} onRest={() => setRest({ end: Date.now() + restSec * 1000, total: restSec })} onGuide={setGuide} />
              : <div key={e.name + i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px]"><span className="font-bold text-slate-800">{e.name}{isRecord(days, e.name, todayKey, e.sets) && <Trophy size={13} className="ml-1.5 inline text-amber-500" />}</span><span className="tabular-nums text-slate-600">{(e.sets || []).length ? e.sets.map((s) => `${s.kg ? vnNum(s.kg) + "×" : ""}${s.reps}`).join(", ") : "chưa tập"}</span></div>)}
          </div>
          {active && (
            <>
              <form onSubmit={(ev) => { ev.preventDefault(); const nm = addName.trim(); if (!nm) return; setGym(todayKey, (g) => ({ ...g, ex: [...g.ex, { name: nm, n: 3, reps: 10, step: 2.5, sets: [] }] })); setAddName(""); }} className="mt-3 flex gap-2">
                <input value={addName} onChange={(e) => setAddName(e.target.value)} list="sk-ex-names" className={inputCls} placeholder="Thêm bài khác vào buổi này" aria-label="Tên bài thêm" />
                <datalist id="sk-ex-names">{[...new Set([...plan.routines.flatMap((r) => r.ex.map((e) => e.name)), ...names])].map((x) => <option key={x} value={x} />)}</datalist>
                <button className={btnGhost}><Plus size={15} /> Thêm</button>
              </form>
              <button onClick={finish} disabled={!setsDone} className={btnPrimary + " mt-3 w-full"}><Flag size={16} /> Kết thúc buổi tập</button>
            </>
          )}
          {gym.end && <AfterSession gym={gym} todayKey={todayKey} />}
        </Card>
      )}

      {rest && active && !focus && <RestTimer end={rest.end} total={rest.total} onStop={() => setRest(null)} onAdd={() => setRest((r) => ({ end: r.end + 30000, total: r.total + 30 }))} />}

      <Card>
        <SectionTitle>Tiến bộ theo bài</SectionTitle>
        {names.length === 0
          ? <p className="-mt-2 text-[13px] text-slate-500">Sau buổi tập đầu tiên, biểu đồ sức mạnh từng bài sẽ hiện ở đây.</p>
          : <>
            <Field label="Bài tập"><select value={chartEx} onChange={(e) => setPick(e.target.value)} className={inputCls}>{names.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <div className="mt-3"><LineChart count={hist.length} unit="kg (mức tạ cao nhất mỗi buổi)" series={[{ color: "#6366f1", dots: true, points: hist.map((h, i) => ({ x: i, y: h.top || h.reps })) }]} labels={hist.length ? [dm(hist[0].key), dm(hist[hist.length - 1].key)] : []} /></div>
            {hist.length > 0 && <div className="mt-1 text-[12.5px] text-slate-500">Cao nhất: <b className="text-slate-900">{vnNum(Math.max(...hist.map((h) => h.top)))} kg</b> · {hist.length} buổi đã ghi{hist.length > 1 && hist[hist.length - 1].top > hist[0].top ? ` · tăng ${vnNum(hist[hist.length - 1].top - hist[0].top)} kg từ buổi đầu` : ""}</div>}
          </>}
      </Card>
      {editing && <PlanEditor plan={plan} onClose={() => setEditing(false)} />}
      {guide && <ExGuide name={guide} onClose={() => setGuide(null)} />}
    </div>
  );
}
