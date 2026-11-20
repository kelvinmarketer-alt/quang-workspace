// Mảnh giao diện nhỏ dùng chung cho trang Sức khoẻ
export const num = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : 0; };
export const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
export const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50";

// Vòng tiến độ: value / max, chữ ở giữa
export function Ring({ value, max, color, size = 116, label, children }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ? `${label}: ${Math.round(pct * 100)}%` : undefined}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="10" className="stroke-slate-100" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="10" stroke={color} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center px-2 text-center leading-tight">{children}</div>
    </div>
  );
}

// Thanh tiến độ ngang có nhãn: "Đạm 96 / 150 g"
export function Bar({ label, value, max, unit = "", color = "#6366f1" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0, over = max > 0 && value > max * 1.05;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className={`tabular-nums ${over ? "font-bold text-rose-600" : "text-slate-500"}`}><b className="text-slate-900">{Math.round(value)}</b> / {Math.round(max)} {unit}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: pct + "%", background: over ? "#f43f5e" : color, transition: "width .4s ease" }} /></div>
    </div>
  );
}

export function Toggle({ on, onChange, label, hint, id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{label}</span>{hint && <span className="block text-[12px] text-slate-500">{hint}</span>}</span>
      <input id={id} type="checkbox" role="switch" checked={!!on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 ${on ? "bg-indigo-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
    </label>
  );
}

export function Field({ label, children, hint }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">{label}</span>{children}{hint && <span className="mt-1 block text-[12px] text-slate-500">{hint}</span>}</label>;
}

// Biểu đồ đường nhỏ vẽ sẵn bằng SVG. series: [{ points: [{x (0..n-1), y}], color, dots?, dash? }], labels: nhãn trục ngang (đầu, giữa, cuối)
export function LineChart({ series, count, height = 150, unit = "", labels = [] }) {
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null && isFinite(v));
  if (!ys.length) return <div className="grid h-24 place-items-center text-[12.5px] text-slate-400">Chưa có số liệu</div>;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const W = 600, H = height, L = 38, R = 8, T = 8, B = 20;
  const X = (i) => L + (count > 1 ? (i / (count - 1)) * (W - L - R) : (W - L - R) / 2), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const fmt = (v) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Biểu đồ">
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="stroke-slate-100" strokeWidth="1" /><text x={L - 5} y={Y(t) + 3.5} textAnchor="end" className="fill-slate-400" fontSize="10.5">{fmt(t)}</text></g>)}
      {series.map((s, si) => {
        const pts = s.points.filter((p) => p.y != null);
        return (
          <g key={si}>
            {!s.dotsOnly && pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} />}
            {(s.dots || s.dotsOnly || pts.length === 1) && pts.map((p) => <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={s.dotsOnly ? 2.6 : 3.2} fill={s.color} opacity={s.dotsOnly ? 0.45 : 1} />)}
          </g>
        );
      })}
      {labels.map((l, i) => <text key={i} x={i === 0 ? L : i === labels.length - 1 ? W - R : (L + W - R) / 2} y={H - 4} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} className="fill-slate-400" fontSize="10.5">{l}</text>)}
      {unit && <text x={L} y={T + 4} className="fill-slate-400" fontSize="10">{unit}</text>}
    </svg>
  );
}

// Tiếng + rung báo hết giờ nghỉ
export function beep() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* máy không rung được */ }
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const ctx = new A(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5); setTimeout(() => ctx.close(), 800);
  } catch { /* không phát được tiếng */ }
}

// Ảnh động tác: 2 ảnh (bắt đầu / kết thúc) tự chuyển qua lại như hình động. Người tắt hiệu ứng chuyển động thì bấm để đổi ảnh.
import { useEffect as _useEffect, useState as _useState } from "react";
export function ExPhoto({ imgs, alt, className = "" }) {
  const [b, setB] = _useState(false);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  _useEffect(() => { if (still) return undefined; const t = setInterval(() => setB((v) => !v), 1300); return () => clearInterval(t); }, [still]);
  if (!imgs?.length) return null;
  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-100 ${className}`} onClick={() => setB((v) => !v)}>
      <img src={imgs[0]} alt={`${alt} — tư thế bắt đầu`} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <img src={imgs[1]} alt={`${alt} — tư thế kết thúc`} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: b ? 1 : 0, transition: "opacity .45s ease" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-900/75 px-2 py-0.5 text-[11px] font-bold text-white">{b ? "2. Kết thúc" : "1. Bắt đầu"}</span>
    </div>
  );
}

// Ô số có nút − / + to (bấm bằng ngón cái lúc đang tập)
export function Stepper({ label, value, onChange, step = 1, ariaLabel, mode = "decimal" }) {
  const cur = num(value);
  const fmt = (v) => String(Math.max(0, Math.round(v * 100) / 100)).replace(".", ",");
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-center text-[11.5px] font-semibold text-slate-500">{label}</div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(fmt(cur - step))} aria-label={`Giảm ${label}`} className="grid h-12 w-11 shrink-0 place-items-center rounded-xl text-xl font-bold text-slate-700 ring-1 ring-slate-300 active:bg-slate-100">−</button>
        <input inputMode={mode} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} aria-label={ariaLabel} className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white text-center text-xl font-extrabold tabular-nums text-slate-900" />
        <button type="button" onClick={() => onChange(fmt(cur + step))} aria-label={`Tăng ${label}`} className="grid h-12 w-11 shrink-0 place-items-center rounded-xl text-xl font-bold text-slate-700 ring-1 ring-slate-300 active:bg-slate-100">+</button>
      </div>
    </div>
  );
}
