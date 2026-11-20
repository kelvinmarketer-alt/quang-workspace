import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, ChevronLeft, ChevronRight, Flag, TrendingUp, Trophy, Timer } from "lucide-react";
import { lastSession, suggest, isRecord, exInfo, exImgs, dm, vnNum } from "../../lib/health.js";
import { setGym } from "../../lib/healthStore.js";
import { num, btnPrimary, btnGhost, ExPhoto, Stepper, beep } from "./bits.jsx";

// CHẾ ĐỘ ĐANG TẬP (20/11): toàn màn hình, mỗi lần một bài — ảnh mẫu to, số gợi ý điền sẵn (chỉ cần bấm "Xong hiệp"),
// đồng hồ nghỉ to, giữ màn hình luôn sáng.
export default function Focus({ gym, days, todayKey, restSec, onClose, onFinish }) {
  const firstOpen = Math.max(0, gym.ex.findIndex((e) => (e.sets || []).length < (e.n || 1)));
  const [idx, setIdx] = useState(firstOpen);
  const [kg, setKg] = useState(""), [reps, setReps] = useState("");
  const [rest, setRest] = useState(null), [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  const i = Math.min(idx, gym.ex.length - 1), ex = gym.ex[i];

  // Giữ màn hình sáng trong lúc tập (máy không hỗ trợ thì bỏ qua)
  useEffect(() => {
    let lock = null, alive = true;
    const get = async () => { try { lock = await navigator.wakeLock?.request("screen"); if (!alive) lock?.release(); } catch { /* không hỗ trợ */ } };
    get();
    const vis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; document.removeEventListener("visibilitychange", vis); try { lock?.release(); } catch { /* bỏ qua */ } };
  }, []);
  useEffect(() => { if (!rest) return undefined; rang.current = false; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.end - now) / 1000)) : 0;
  useEffect(() => { if (rest && left === 0 && !rang.current) { rang.current = true; beep(); } }, [rest, left]);
  useEffect(() => { setKg(""); setReps(""); }, [i]);

  const last = useMemo(() => (ex ? lastSession(days, ex.name, todayKey) : null), [days, ex?.name, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ex) return null;
  const sg = suggest(last, { sets: ex.n, reps: ex.reps, step: ex.step });
  const sets = ex.sets || [], prev = sets[sets.length - 1];
  const kgV = kg !== "" ? kg : prev ? String(prev.kg).replace(".", ",") : sg.kg != null ? String(sg.kg).replace(".", ",") : "";
  const repsV = reps !== "" ? reps : String(sg.reps || ex.reps || "");
  const unit = /\(giây\)/.test(ex.name) ? "Số giây" : /\(phút\)/.test(ex.name) ? "Số phút" : "Số lần";
  const noKg = !Number(ex.step) && !sets.some((x) => x.kg) && !last?.sets.some((x) => x.kg);
  const exDone = sets.length >= (ex.n || 1);
  const setsAll = gym.ex.reduce((s, e) => s + (e.sets || []).length, 0);
  const allDone = gym.ex.every((e) => (e.sets || []).length >= (e.n || 1));
  const info = exInfo(ex.name), imgs = exImgs(ex.name);
  const record = isRecord(days, ex.name, todayKey, sets);
  const add = () => {
    if (!num(repsV)) return;
    const willFinishEx = sets.length + 1 >= (ex.n || 1);
    setGym(todayKey, (g) => ({ ...g, ex: g.ex.map((e, j) => (j === i ? { ...e, sets: [...(e.sets || []), { kg: noKg ? 0 : num(kgV), reps: Math.round(num(repsV)) }] } : e)) }));
    setKg(""); setReps("");
    const lastEx = i >= gym.ex.length - 1;
    if (!(willFinishEx && lastEx)) { setRest({ end: Date.now() + restSec * 1000, total: restSec, next: willFinishEx }); setNow(Date.now()); }
  };
  const endRest = () => { if (rest?.next && i < gym.ex.length - 1) setIdx(i + 1); setRest(null); };
  const delSet = (k) => setGym(todayKey, (g) => ({ ...g, ex: g.ex.map((e, j) => (j === i ? { ...e, sets: e.sets.filter((_, x) => x !== k) } : e)) }));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white" role="dialog" aria-label="Chế độ đang tập">
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Thoát chế độ đang tập" className="rounded-xl p-2 text-slate-500 ring-1 ring-slate-200"><X size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Bài {i + 1}/{gym.ex.length} · {gym.name}</div>
          <div className="mt-1 flex gap-1">{gym.ex.map((e, j) => <span key={j} className="h-1.5 flex-1 rounded-full" style={{ background: (e.sets || []).length >= (e.n || 1) ? "#10b981" : j === i ? "#6366f1" : "rgba(148,163,184,.3)" }} />)}</div>
        </div>
        <button onClick={onFinish} disabled={!setsAll} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-bold text-emerald-700 ring-1 ring-emerald-300 disabled:opacity-40"><Flag size={15} /> Kết thúc buổi tập</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <div className="mx-auto max-w-xl">
          {imgs.length > 0 && <ExPhoto imgs={imgs} alt={ex.name} className="aspect-[3/2] max-h-[34vh] w-full" />}
          <h2 className="mt-3 flex flex-wrap items-center gap-2 text-xl font-extrabold leading-tight text-slate-900">{ex.name}{record && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"><Trophy size={11} /> Kỷ lục mới</span>}</h2>
          <div className="text-[13px] text-slate-500">Mục tiêu {ex.n} hiệp × {ex.reps}{last ? ` · lần trước (${dm(last.key)}): ${last.sets.map((s) => `${s.kg ? vnNum(s.kg) + "×" : ""}${s.reps}`).join(", ")}` : ""}</div>
          <div className={`mt-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${sg.up ? "bg-indigo-50 text-indigo-700" : "bg-slate-50 text-slate-600"}`}>{sg.up && <TrendingUp size={13} className="mr-1 inline" />}{sg.text}</div>
          {info && <ol className="mt-2 space-y-1 text-[13px] text-slate-600">{info.cues.map((c, k) => <li key={k} className="flex gap-2"><span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-slate-200 text-[10.5px] font-bold text-slate-700">{k + 1}</span><span>{c}</span></li>)}</ol>}
          {sets.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{sets.map((s, k) => <button key={k} onClick={() => delSet(k)} title="Bấm để xoá hiệp này" className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[13px] font-bold tabular-nums text-white"><span className="text-white/60">H{k + 1}</span> {s.kg ? `${vnNum(s.kg)} kg × ` : ""}{s.reps}<X size={12} className="text-white/50" /></button>)}</div>}
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-xl">
          {rest ? (
            <div role="timer" aria-live="off" className="text-center">
              <div className="flex items-center justify-center gap-2 text-[13px] font-bold text-slate-500"><Timer size={15} /> {left ? "Nghỉ giữa hiệp" : "Hết giờ nghỉ"}{rest.next && i < gym.ex.length - 1 ? ` · bài sau: ${gym.ex[i + 1].name}` : ""}</div>
              <div className={`text-6xl font-extrabold tabular-nums ${left ? "text-slate-900" : "text-emerald-600"}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
              <div className="mx-auto mt-1 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${rest.total ? (left / rest.total) * 100 : 0}%`, transition: "width .25s linear" }} /></div>
              <div className="mt-3 flex gap-2">
                {left > 0 && <button onClick={() => setRest((r) => ({ ...r, end: r.end + 30000, total: r.total + 30 }))} className={btnGhost + " flex-1"}>+30 giây</button>}
                <button onClick={endRest} className={btnPrimary + " flex-[2] py-3.5 text-base"}>{left ? "Bỏ qua nghỉ" : rest.next ? "Sang bài tiếp" : "Vào hiệp tiếp"}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                {!noKg && <Stepper label="Mức tạ (kg)" value={kgV} onChange={setKg} step={Number(ex.step) || 2.5} ariaLabel={`Mức tạ ${ex.name}`} />}
                <Stepper label={unit} value={repsV} onChange={setReps} step={/\(giây\)/.test(ex.name) ? 5 : 1} ariaLabel={`Số lần ${ex.name}`} mode="numeric" />
              </div>
              <button onClick={add} disabled={!num(repsV)} className={`${btnPrimary} mt-3 w-full py-4 text-lg`}><Check size={20} /> {exDone ? `Thêm hiệp ${sets.length + 1}` : `Xong hiệp ${sets.length + 1}`}{!exDone && ` / ${ex.n}`}</button>
              {allDone && <button onClick={onFinish} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white"><Flag size={18} /> Đủ bài rồi — kết thúc buổi tập</button>}
            </>
          )}
          <div className="mt-2 flex justify-between">
            <button onClick={() => { setRest(null); setIdx(Math.max(0, i - 1)); }} disabled={i === 0} className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] font-bold text-slate-500 disabled:opacity-30"><ChevronLeft size={16} /> Bài trước</button>
            <button onClick={() => { setRest(null); setIdx(Math.min(gym.ex.length - 1, i + 1)); }} disabled={i >= gym.ex.length - 1} className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] font-bold text-slate-500 disabled:opacity-30">Bài sau <ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
